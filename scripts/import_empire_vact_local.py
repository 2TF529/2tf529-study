#!/usr/bin/env python3
"""Import complete V-ACT exams referenced by a local Empire download manifest.

The downloaded HTML files are only a generic shell.  The manifest retains the
public exam IDs, so this importer reads the structured question payload from the
same public API, validates completeness, converts formulas to the site's LaTeX
notation, and stores only figures that cannot be represented as text/LaTeX.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import shutil
import tempfile
import time
import unicodedata
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup, NavigableString
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
TARGET = DATA / "l12" / "tong-hop" / "vact"
API = "https://empire-catalog-sync.vercel.app/api/exam"
PAGE = "https://empire-catalog-sync.vercel.app/thi.html?id={}"
SKIP_JSON = {
    "taxonomy.json", "index.json", "explore-index.json", "topic-index.json",
    "id-map.json", "stats.json",
}
HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; exam-library-import/1.0)",
    "Accept": "application/json,text/plain,*/*",
}


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def fold_title(value: str) -> str:
    value = unicodedata.normalize("NFC", compact(value)).casefold()
    return value


def slugify(value: str, limit: int = 92) -> str:
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = value.replace("đ", "d")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return (value[:limit].rstrip("-") or "de-vact")


def existing_titles() -> set[str]:
    titles: set[str] = set()
    for path in DATA.rglob("*.json"):
        if path.name in SKIP_JSON or "_template" in path.parts:
            continue
        try:
            value = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(value, dict) and value.get("title"):
            titles.add(fold_title(str(value["title"])))
    return titles


def manifest_candidates(path: Path) -> list[dict]:
    rows = list(csv.DictReader(path.open(encoding="utf-8-sig", newline="")))
    unique_ids: set[str] = set()
    unique_titles: set[str] = set()
    result: list[dict] = []
    for row in rows:
        if compact(row.get("Loai", "")) != "Đề thi":
            continue
        match = re.search(r"[?&]id=([0-9a-fA-F]+)", row.get("URL", ""))
        title = compact(row.get("Ten_Tep_Goc", ""))
        if not match or not title:
            continue
        exam_id = match.group(1).lower()
        key = fold_title(title)
        if exam_id in unique_ids or key in unique_titles:
            continue
        unique_ids.add(exam_id)
        unique_titles.add(key)
        result.append({"id": exam_id, "manifest_title": title})
    return result


def request_json(exam_id: str, retries: int = 4) -> dict:
    error: Exception | None = None
    for attempt in range(retries):
        try:
            response = requests.get(
                API, params={"id": exam_id}, headers=HEADERS, timeout=35
            )
            response.raise_for_status()
            value = response.json()
            if not value.get("ok"):
                raise ValueError(value.get("error") or "API returned ok=false")
            return value
        except (requests.RequestException, ValueError) as exc:
            error = exc
            time.sleep(1.2 * (attempt + 1))
    raise RuntimeError(str(error) if error else "unknown API error")


def latex_delimiters(value: str) -> str:
    value = re.sub(r"\\\[\s*(.*?)\s*\\\]", r"$$\1$$", value, flags=re.DOTALL)
    value = re.sub(r"\\\(\s*(.*?)\s*\\\)", r"$\1$", value, flags=re.DOTALL)
    return value


def strip_option_label(value: str, label: str) -> str:
    # API already supplies the label separately; avoid rendering "A. A. ...".
    return re.sub(
        rf"^\s*{re.escape(label)}\s*[.):\-]\s*", "", value,
        count=1, flags=re.IGNORECASE,
    ).strip()


def prepare_fragment(fragment: str, image_urls: list[str]) -> str:
    soup = BeautifulSoup(fragment or "", "html.parser")
    for node in soup.select("script, style, iframe, video, audio"):
        node.decompose()
    for text in list(soup.find_all(string=re.compile(r"\[EMPIRE\s+TEAM\]", re.I))):
        replaced = re.sub(r"\s*\[EMPIRE\s+TEAM\]\s*", " ", str(text), flags=re.I)
        text.replace_with(NavigableString(replaced))
    for math in list(soup.select("span.math")):
        math.replace_with(NavigableString(latex_delimiters(math.get_text("", strip=True))))
    for image in list(soup.find_all("img")):
        src = compact(image.get("src", ""))
        if not src or urlparse(src).scheme not in {"http", "https"}:
            image.decompose()
            continue
        image_urls.append(src)
        marker = soup.new_tag("span")
        marker.string = f"@@EMPIRE_IMAGE_{len(image_urls) - 1}@@"
        image.replace_with(marker)
    for tag in list(soup.find_all(["strong", "em", "span"])):
        if not compact(tag.get_text(" ")) and not tag.find("img"):
            tag.decompose()
    # Inline presentation styles/classes from the source are not needed and can
    # interfere with the exam room. Keep only useful table span attributes.
    for tag in soup.find_all(True):
        allowed = {}
        if tag.name in {"td", "th"}:
            for key in ("rowspan", "colspan"):
                if tag.get(key):
                    allowed[key] = tag[key]
        tag.attrs = allowed
    container = soup.body if soup.body is not None else soup
    value = container.decode_contents(formatter="minimal")
    value = latex_delimiters(value)
    value = value.replace("\u00a0", " ")
    value = re.sub(r"(?:<p>\s*</p>\s*)+", "", value, flags=re.I)
    return value.strip()


def download_webp(url: str, target: Path) -> None:
    response = requests.get(url, headers=HEADERS, timeout=40)
    response.raise_for_status()
    if len(response.content) > 20 * 1024 * 1024:
        raise ValueError("image larger than 20 MiB")
    with Image.open(io.BytesIO(response.content)) as image:
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGBA" if "transparency" in image.info else "RGB")
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=86, method=6)


def materialize_images(
    value: str, image_urls: list[str], temp_dir: Path, public_dir: str
) -> str:
    local_by_url: dict[str, str] = {}
    for index, url in enumerate(image_urls):
        if url not in local_by_url:
            digest = hashlib.sha1(url.encode("utf-8")).hexdigest()[:12]
            filename = f"hinh-{digest}.webp"
            image_path = temp_dir / filename
            # A question may reference its image while each option is rendered;
            # convert a unique source URL only once.
            if not image_path.exists():
                download_webp(url, image_path)
            local_by_url[url] = (
                f'<figure class="question-figure"><img src="{public_dir}/{filename}" '
                f'alt="Hình minh họa của câu hỏi" loading="lazy"></figure>'
            )
        value = value.replace(f"<span>@@EMPIRE_IMAGE_{index}@@</span>", local_by_url[url])
        value = value.replace(f"@@EMPIRE_IMAGE_{index}@@", local_by_url[url])
    return value


def validate_payload(payload: dict) -> tuple[bool, str]:
    exam = payload.get("exam") or {}
    questions = payload.get("questions") or []
    expected = int(exam.get("totalQuestions") or payload.get("stemCount") or 0)
    if not exam.get("title") or not questions:
        return False, "missing title/questions"
    if expected and len(questions) != expected:
        return False, f"incomplete ({len(questions)}/{expected})"
    for q in questions:
        plain = compact(BeautifulSoup(q.get("html") or "", "html.parser").get_text(" "))
        options = q.get("options") or []
        if len(plain) < 3:
            return False, "empty question"
        if options and len(options) < 2:
            return False, "question with fewer than two options"
        normalized_options: list[str] = []
        for option in options:
            option_text = compact(
                BeautifulSoup(option.get("html") or "", "html.parser").get_text(" ")
            )
            if not option.get("label") or not option_text:
                return False, "incomplete option"
            normalized_options.append(
                re.sub(r"^\s*[A-Z]\s*[.):\-]\s*", "", option_text, flags=re.I).casefold()
            )
        if len(normalized_options) != len(set(normalized_options)):
            return False, "duplicate option content"
    return True, ""


def convert_one(candidate: dict, known_titles: set[str], output_root: Path) -> dict:
    exam_id = candidate["id"]
    payload = request_json(exam_id)
    valid, reason = validate_payload(payload)
    if not valid:
        return {"status": "rejected", "id": exam_id, "reason": reason}

    meta = payload["exam"]
    title = compact(str(meta["title"]))
    if fold_title(title) in known_titles:
        return {"status": "duplicate", "id": exam_id, "title": title}

    exam_type = (
        "hsa" if re.search(r"(?:^|[^A-Z])HSA(?:[^A-Z]|$)", title.upper())
        and "V-ACT" not in title.upper() else "vact"
    )
    output_root = DATA / "l12" / "tong-hop" / exam_type
    stem = f"2026-empire-{slugify(title)}-{exam_id[:8]}"
    exam_json_id = f"l12-tong-hop-{exam_type}-{stem}"
    output_path = output_root / f"{stem}.json"
    public_dir = f"data/l12/tong-hop/{exam_type}/assets/{stem}"

    with tempfile.TemporaryDirectory(prefix="empire-vact-") as temp_name:
        temp_assets = Path(temp_name) / "assets"
        questions = []
        try:
            for number, raw in enumerate(
                sorted(payload["questions"], key=lambda q: int(q.get("order") or 0)), 1
            ):
                images: list[str] = []
                content = prepare_fragment(raw.get("html") or "", images)
                options = []
                for option in raw.get("options") or []:
                    label = compact(str(option.get("label") or "")).upper()
                    option_html = prepare_fragment(option.get("html") or "", images)
                    option_html = strip_option_label(option_html, label)
                    options.append(f"{label}. {option_html}")
                content = materialize_images(content, images, temp_assets, public_dir)
                options = [
                    materialize_images(option, images, temp_assets, public_dir)
                    for option in options
                ]
                questions.append({
                    "id": number,
                    "type": "single" if options else "short_answer",
                    "content": content,
                    "options": options,
                    "answer": None,
                })
        except Exception as exc:
            return {"status": "rejected", "id": exam_id, "title": title,
                    "reason": f"asset/content error: {exc}"}

        duration_seconds = int(meta.get("duration") or 0)
        exam = {
            "id": exam_json_id,
            "grade": "l12",
            "subjectSlug": "tong-hop",
            "examType": exam_type,
            "year": 2026,
            "code": f"Empire {exam_id[:8].upper()}",
            "title": title,
            "duration": max(1, round(duration_seconds / 60)) if duration_seconds else 150,
            "answerSource": "missing",
            "notes": "Chưa có đáp án trong dữ liệu nguồn; hệ thống không chấm điểm đề này.",
            "sourceId": f"empire:{exam_id}",
            "sourceUrl": PAGE.format(exam_id),
            "passages": {},
            "questions": questions,
        }
        output_root.mkdir(parents=True, exist_ok=True)
        output_path.write_text(
            json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )
        if temp_assets.exists() and any(temp_assets.iterdir()):
            final_assets = output_root / "assets" / stem
            if final_assets.exists():
                shutil.rmtree(final_assets)
            final_assets.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(temp_assets, final_assets)
    return {
        "status": "created", "id": exam_id, "title": title,
        "path": str(output_path.relative_to(ROOT)), "questions": len(questions),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--source", type=Path,
        default=Path(r"D:\Files\Empire_VACT_TAI_VE\00_DANH_SACH_TAI.csv"),
    )
    parser.add_argument("--limit", type=int, default=0, help="0 means all candidates")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--force", action="store_true", help="overwrite matching Empire titles")
    args = parser.parse_args()
    if not args.source.is_file():
        raise SystemExit(f"Manifest not found: {args.source}")

    candidates = manifest_candidates(args.source)
    known = existing_titles()
    if not args.force:
        candidates = [c for c in candidates if fold_title(c["manifest_title"]) not in known]
    if args.limit > 0:
        candidates = candidates[: args.limit]
    print(f"Candidates after title dedupe: {len(candidates)}")

    results: list[dict] = []
    # Each worker receives a snapshot.  Newly created titles are reconciled
    # below; manifest-level title dedupe already removes the common duplicates.
    with ThreadPoolExecutor(max_workers=max(1, args.workers)) as executor:
        title_guard = set() if args.force else known
        futures = [executor.submit(convert_one, row, title_guard, TARGET) for row in candidates]
        for index, future in enumerate(as_completed(futures), 1):
            try:
                result = future.result()
            except Exception as exc:
                result = {"status": "rejected", "id": "unknown", "reason": str(exc)}
            results.append(result)
            detail = result.get("path") or result.get("reason") or result.get("title", "")
            print(f"[{index}/{len(futures)}] {result['status'].upper()}: {detail}")

    counts: dict[str, int] = {}
    for result in results:
        counts[result["status"]] = counts.get(result["status"], 0) + 1
    print("Summary:", json.dumps(counts, ensure_ascii=False, sort_keys=True))
    return 0 if not counts.get("rejected") else 2


if __name__ == "__main__":
    raise SystemExit(main())

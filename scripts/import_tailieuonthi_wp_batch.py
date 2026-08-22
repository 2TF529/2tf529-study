#!/usr/bin/env python3
"""Import complete 2025+ exam PDFs published by tailieuonthi.edu.vn.

The public WordPress API is used only for discovery. Public Google Drive PDF
links are downloaded, validated, rendered to local WebP pages, then discarded.
PDF pages are preserved as images because automatic PDF-to-LaTeX conversion
cannot reliably retain formulae, diagrams and answer choices.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import shutil
import subprocess
import tempfile
import unicodedata
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import fitz
import requests
from bs4 import BeautifulSoup
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
API = "https://tailieuonthi.edu.vn/wp-json/wp/v2/posts"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; 2TF529 exam importer)"}
DRIVE_ID_RE = re.compile(r"drive\.google\.com/(?:file/d/|open\?id=)([-\w]+)", re.I)
YEAR_RE = re.compile(r"\b(202[5-9]|20[3-9]\d)\b")


def fold(value: str) -> str:
    value = unicodedata.normalize("NFD", html.unescape(value).casefold())
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    return value.replace("đ", "d")


def title_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", fold(value)).strip()


def slugify(value: str, limit: int = 76) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")
    return value[:limit].rstrip("-") or "de-thi"


def existing_titles() -> set[str]:
    titles: set[str] = set()
    for path in DATA.glob("l*/*/*/*.json"):
        try:
            item = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if isinstance(item, dict) and item.get("title"):
            titles.add(title_key(str(item["title"])))
    return titles


def subject_from(text: str) -> str | None:
    checks = (
        ("gdktpl", ("gdktpl", "kinh te phap luat", "giao duc kinh te")),
        ("toan", ("mon toan", "toan 9", "toan 10", "toan 11", "toan 12")),
        ("li", ("vat li", "vat ly", "mon li", "mon ly")),
        ("hoa", ("hoa hoc", "mon hoa")),
        ("sinh", ("sinh hoc", "mon sinh")),
        ("van", ("ngu van", "mon van", "van 9", "van 10", "van 11", "van 12")),
        ("anh", ("tieng anh", "mon anh")),
        ("su", ("lich su", "mon su")),
        ("dia", ("dia li", "dia ly", "mon dia")),
        ("tin", ("tin hoc", "mon tin")),
        ("cn-cn", ("cong nghe",)),
    )
    for slug, needles in checks:
        if any(needle in text for needle in needles):
            return slug
    return None


def metadata(title: str, published: str) -> tuple[str, str, str, int] | None:
    text = fold(title)
    years = [int(x) for x in YEAR_RE.findall(title)]
    if not years:
        years = [int(published[:4])] if published[:4].isdigit() else []
    # Academic-year titles such as 2026-2027 are published in 2026. Keep the
    # catalog year at the current source year rather than a future year.
    year = min(max(years, default=0), 2026)
    if year < 2025:
        return None

    # Reject books, theory articles, partial banks, and multi-exam bundles.
    blocked = ("giao an", "ly thuyet", "bai giang", "sach ", "chuyen de", "kien thuc trong tam")
    if any(x in text for x in blocked):
        return None
    bundle = re.search(r"\b(\d{1,4})\s*(?:\+\s*)?de\b", text)
    if bundle and int(bundle.group(1)) > 1:
        return None
    wanted = ("de thi", "de kiem tra", "de khao sat", "de minh hoa", "de tham khao", "de cuong", "de on")
    if not any(x in text for x in wanted):
        return None

    subject = subject_from(text)
    if not subject:
        return None

    if any(x in text for x in ("tuyen sinh lop 10", "thi vao lop 10", "vao 10")):
        grade, exam_type = "l9", "tuyensinh10"
    else:
        grade_match = re.search(r"(?:lop|khoi|toan|van)\s*(9|10|11|12)\b", text)
        if grade_match:
            grade = "l" + grade_match.group(1)
        elif any(x in text for x in ("tot nghiep thpt", "tn thpt", "thi thpt")):
            grade = "l12"
        elif "thcs" in text:
            grade = "l9"
        else:
            return None

        if "giua" in text and ("ki 1" in text or "ky 1" in text):
            exam_type = "giuaki1"
        elif "giua" in text and ("ki 2" in text or "ky 2" in text):
            exam_type = "giuaki2"
        elif any(x in text for x in ("cuoi ki 1", "cuoi ky 1", "hoc ki 1", "hoc ky 1")):
            exam_type = "cuoiki1"
        elif any(x in text for x in ("cuoi ki 2", "cuoi ky 2", "hoc ki 2", "hoc ky 2")):
            exam_type = "cuoiki2"
        elif "hoc sinh gioi" in text or "hsg" in text:
            exam_type = "hsg"
        elif any(x in text for x in ("tot nghiep thpt", "tn thpt", "thi thpt")):
            exam_type = "totnghiep"
        else:
            exam_type = "khaosat"
    return grade, subject, exam_type, year


def discover(max_pages: int) -> list[dict]:
    session = requests.Session()
    session.headers.update(HEADERS)
    posts: list[dict] = []
    for page in range(1, max_pages + 1):
        response = session.get(API, params={"per_page": 100, "page": page, "orderby": "date", "order": "desc"}, timeout=40)
        if response.status_code == 400:
            break
        response.raise_for_status()
        rows = response.json()
        if not rows:
            break
        for row in rows:
            title = BeautifulSoup(row["title"]["rendered"], "html.parser").get_text(" ", strip=True)
            meta = metadata(title, row.get("date", ""))
            if not meta:
                continue
            body = row.get("content", {}).get("rendered", "")
            drive_ids = DRIVE_ID_RE.findall(body)
            if not drive_ids:
                continue
            posts.append({
                "id": row["id"], "title": html.unescape(title), "url": row["link"],
                "drive_id": drive_ids[-1], "meta": meta,
            })
    return posts


def download_pdf(session: requests.Session, url: str, target: Path) -> bool:
    try:
        probe = session.get(
            url, headers={"Range": "bytes=0-4"}, timeout=(10, 20), allow_redirects=True
        )
        if probe.status_code not in (200, 206) or not probe.content.startswith(b"%PDF-"):
            return False
        if probe.status_code == 200:
            if not (20_000 <= len(probe.content) <= 50 * 1024 * 1024):
                return False
            target.write_bytes(probe.content)
            return True
        content_range = probe.headers.get("Content-Range", "")
        total_match = re.search(r"/(\d+)$", content_range)
        # Large files are normally books or multi-test bundles and would make
        # the static site unnecessarily heavy.
        if not total_match:
            return False
        total = int(total_match.group(1))
        if total > 50 * 1024 * 1024:
            return False

        # curl handles Drive's long-lived HTTP/2 stream more reliably than
        # urllib/requests on Windows for the full transfer.
        result = subprocess.run(
            [
                "curl.exe", "-L", "--fail", "--silent", "--show-error",
                "--retry", "2", "--connect-timeout", "10", "--max-time", "75",
                "--output", str(target), url,
            ],
            check=False,
        )
        return result.returncode == 0 and target.stat().st_size == total
    except Exception:
        return False


def render_exam(post: dict, titles: set[str], temp_dir: Path) -> Path | None:
    title = post["title"]
    key = title_key(title)
    if key in titles:
        return None
    grade, subject, exam_type, year = post["meta"]
    exam_id = f"{grade}-{subject}-{exam_type}-{year}-{slugify(title)}-{post['id']}"
    out_dir = DATA / grade / subject / exam_type
    out_file = out_dir / f"{exam_id}.json"
    if out_file.exists():
        return None

    pdf_path = temp_dir / f"{post['id']}.pdf"
    session = requests.Session()
    session.headers.update(HEADERS)
    download_url = post.get("download_url") or (
        f"https://drive.usercontent.google.com/download?id={post['drive_id']}&export=download&confirm=t"
    )
    if not download_pdf(session, download_url, pdf_path):
        pdf_path.unlink(missing_ok=True)
        return None

    asset_dir = out_dir / "assets" / exam_id
    try:
        document = fitz.open(pdf_path)
        # Oversized files are usually books or multi-exam collections missed by title filtering.
        if document.needs_pass or not (1 <= len(document) <= 30):
            document.close()
            return None

        asset_dir.mkdir(parents=True, exist_ok=True)
        questions = []
        for index, page in enumerate(document, start=1):
            pix = page.get_pixmap(matrix=fitz.Matrix(1.55, 1.55), alpha=False)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            filename = f"trang-{index:02d}.webp"
            image.save(asset_dir / filename, "WEBP", quality=78, method=6)
            rel = f"data/{grade}/{subject}/{exam_type}/assets/{exam_id}/{filename}"
            questions.append({
                "id": index,
                "type": "short_answer",
                "content": (
                    f"Làm các câu/bài trong **trang {index}** của đề nguyên bản dưới đây:\n\n"
                    f'<figure class="question-figure"><img src="{rel}" alt="Trang {index} của đề" loading="lazy"></figure>'
                ),
                "answer": None,
            })
        document.close()
        if not questions:
            return None

        duration = 120 if exam_type == "tuyensinh10" else (90 if subject in {"toan", "van"} else 50)
        data = {
            "id": exam_id, "grade": grade, "subjectSlug": subject, "examType": exam_type,
            "year": year, "code": "Đề 01", "title": title, "duration": duration,
            "answerSource": "missing", "sourceUrl": post["url"], "passages": {},
            "questions": questions,
        }
        out_dir.mkdir(parents=True, exist_ok=True)
        out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        titles.add(key)
        return out_file
    except Exception as exc:
        print(f"SKIP {post['id']}: {type(exc).__name__}: {exc}", flush=True)
        if out_file.exists():
            out_file.unlink()
        if asset_dir.exists():
            shutil.rmtree(asset_dir)
        return None
    finally:
        pdf_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=20)
    parser.add_argument("--max-pages", type=int, default=8)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    titles = existing_titles()
    candidates = [p for p in discover(args.max_pages) if title_key(p["title"]) not in titles]
    buckets: dict[str, deque] = defaultdict(deque)
    for post in candidates:
        buckets[post["meta"][1]].append(post)
    ordered = []
    while any(buckets.values()):
        for subject in sorted(buckets):
            if buckets[subject]:
                ordered.append(buckets[subject].popleft())

    imported = 0
    with tempfile.TemporaryDirectory(prefix="tailieuonthi_", dir=ROOT) as temp:
        temp_dir = Path(temp)
        examined = 0
        cursor = 0
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            while cursor < len(ordered) and imported < args.target:
                room = args.target - imported
                batch = ordered[cursor:cursor + min(max(1, args.workers), room)]
                cursor += len(batch)
                results = list(pool.map(lambda post: render_exam(post, titles, temp_dir), batch))
                for path in results:
                    examined += 1
                    if path:
                        imported += 1
                        print(f"CREATED {imported}/{args.target}: {path.relative_to(ROOT)}", flush=True)
                if examined % 12 == 0:
                    print(f"PROGRESS examined={examined}, imported={imported}", flush=True)
    print(f"DONE imported={imported}/{args.target}; candidates={len(candidates)}")
    return 0 if imported else 2


if __name__ == "__main__":
    raise SystemExit(main())

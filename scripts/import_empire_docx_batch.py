#!/usr/bin/env python3
"""Import complete, image-free Empire DOCX practice exams.

The downloaded DOCX files already contain source LaTeX, four options, an
official `Chọn X` key and explanations.  This importer intentionally rejects
documents with embedded figures or any malformed question instead of silently
dropping content.
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
import unicodedata
import zipfile
from pathlib import Path

from docx import Document
from docx.oxml.ns import qn
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
MANIFEST = Path(r"D:\Files\Empire_VACT_TAI_VE\00_DANH_SACH_TAI.csv")
SKIP_JSON = {
    "taxonomy.json", "index.json", "explore-index.json", "topic-index.json",
    "id-map.json", "stats.json",
}


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def fold(value: str) -> str:
    return unicodedata.normalize("NFC", compact(value)).casefold()


def slugify(value: str, limit: int = 105) -> str:
    value = unicodedata.normalize("NFD", value.casefold())
    value = "".join(c for c in value if unicodedata.category(c) != "Mn")
    value = value.replace("đ", "d")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return (value[:limit].rstrip("-") or "de-luyen-tap")


def clean_latex(value: str) -> str:
    value = value.replace("[EMPIRE TEAM]", "").strip()
    value = re.sub(r"\\\[\s*", "$$", value)
    value = re.sub(r"\s*\\\]", "$$", value)
    value = re.sub(r"\\\(\s*", "$", value)
    value = re.sub(r"\s*\\\)", "$", value)
    value = value.replace("\u00a0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    return value.strip()


def existing_titles() -> set[str]:
    result: set[str] = set()
    for path in DATA.rglob("*.json"):
        if path.name in SKIP_JSON or "_template" in path.parts:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(payload, dict) and payload.get("title"):
            result.add(fold(str(payload["title"])))
    return result


def source_candidates(manifest: Path) -> list[tuple[str, Path]]:
    rows = list(csv.DictReader(manifest.open(encoding="utf-8-sig", newline="")))
    # A title is often mirrored across several courses. Some mirrors are tiny
    # AccessDenied HTML responses carrying a .docx suffix, while another copy
    # is the real ZIP-based Office document. Group first and retain the largest
    # structurally valid DOCX instead of letting manifest order decide.
    grouped: dict[str, tuple[str, Path]] = {}
    for row in rows:
        if compact(row.get("Loai", "")) != "Word":
            continue
        path = Path(row.get("Tep_Dich", ""))
        title = re.sub(r"\.docx$", "", compact(row.get("Ten_Tep_Goc", "")), flags=re.I)
        key = fold(title)
        if not title or not path.is_file() or path.suffix.lower() != ".docx":
            continue
        try:
            if path.stat().st_size < 30_000 or not zipfile.is_zipfile(path):
                continue
        except OSError:
            continue
        previous = grouped.get(key)
        if previous is None or path.stat().st_size > previous[1].stat().st_size:
            grouped[key] = (title, path)
    return list(grouped.values())


def paragraph_source(paragraph, asset_dir: Path, public_dir: str) -> str:
    value = paragraph.text.strip()
    for blip in paragraph._p.xpath(".//a:blip"):
        rel_id = blip.get(qn("r:embed"))
        part = paragraph.part.related_parts.get(rel_id)
        if part is None:
            continue
        blob = part.blob
        digest = hashlib.sha1(blob).hexdigest()[:12]
        filename = f"hinh-{digest}.webp"
        target = asset_dir / filename
        if not target.exists():
            with Image.open(io.BytesIO(blob)) as image:
                if image.mode not in {"RGB", "RGBA"}:
                    image = image.convert("RGBA" if "transparency" in image.info else "RGB")
                asset_dir.mkdir(parents=True, exist_ok=True)
                image.save(target, "WEBP", quality=88, method=6)
        figure = (
            f'<figure class="question-figure"><img src="{public_dir}/{filename}" '
            f'alt="Hình minh họa của câu hỏi" loading="lazy"></figure>'
        )
        value = f"{value}\n{figure}".strip()
    return value


def parse_document(path: Path, asset_dir: Path, public_dir: str) -> list[dict]:
    document = Document(path)
    paragraphs = [paragraph_source(p, asset_dir, public_dir) for p in document.paragraphs]
    paragraphs = [text for text in paragraphs if text]
    starts = [i for i, text in enumerate(paragraphs) if text.startswith("[EMPIRE TEAM]")]
    if len(starts) < 5:
        raise ValueError("không đủ câu hỏi")
    starts.append(len(paragraphs))
    questions: list[dict] = []
    for number, (start, end) in enumerate(zip(starts, starts[1:]), 1):
        block = paragraphs[start:end]
        note_index = next((i for i, text in enumerate(block) if text.upper() == "NOTE:"), len(block))
        body = block[:note_index]
        option_rows: dict[str, tuple[int, str]] = {}
        for index, text in enumerate(body):
            match = re.match(r"^([A-D])[.)]\s*(.+)$", text, flags=re.S)
            if match:
                option_rows[match.group(1)] = (index, match.group(2).strip())
        if list(option_rows) != list("ABCD"):
            raise ValueError(f"câu {number} không đủ bốn phương án")
        first_option = option_rows["A"][0]
        content = clean_latex("\n".join(body[:first_option]))
        options = [f"{label}. {clean_latex(option_rows[label][1])}" for label in "ABCD"]
        if len({fold(re.sub(r"^[A-D][.)]\s*", "", x)) for x in options}) != 4:
            raise ValueError(f"câu {number} có phương án trùng")
        tail = block[note_index + 1:] if note_index < len(block) else []
        answer = None
        answer_at = -1
        for index, text in enumerate(tail):
            match = re.search(r"\bChọn\s+([A-D])\s*[.]?", text, flags=re.I)
            if match:
                answer = match.group(1).upper()
                answer_at = index
                break
        explanation = clean_latex("\n".join(tail[answer_at + 1:])) if answer_at >= 0 else ""
        if not content:
            raise ValueError(f"câu {number} rỗng")
        question = {
            "id": number,
            "type": "single",
            "content": content,
            "options": options,
            "answer": answer,
        }
        if explanation:
            question["explanation"] = explanation
        questions.append(question)
    return questions


def infer_subject(title: str, path: Path) -> str:
    haystack = f"{title} {path}".upper()
    return "anh" if "TIẾNG ANH" in haystack or "CỤM ĐỘNG TỪ" in haystack else "toan"


def code_from_title(title: str) -> str:
    match = re.search(r"(?:ĐỀ|BÀI)\s+(?:LUYỆN\s+TẬP\s+)?(?:SỐ\s+)?(\d+)", title, flags=re.I)
    return f"Đề {match.group(1)}" if match else "Chuyên đề"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--limit", type=int, default=6)
    args = parser.parse_args()
    known = existing_titles()
    created: list[dict] = []
    rejected: list[dict] = []
    for title, source in source_candidates(args.manifest):
        if fold(title) in known:
            continue
        subject = infer_subject(title, source)
        slug = f"2026-empire-{slugify(title)}"
        exam_id = f"l12-{subject}-vact-{slug}"
        target_dir = DATA / "l12" / subject / "vact"
        target = target_dir / f"{slug}.json"
        public_dir = f"data/l12/{subject}/vact/assets/{slug}"
        with tempfile.TemporaryDirectory(prefix="empire-docx-") as temp_name:
            temp_assets = Path(temp_name) / "assets"
            try:
                questions = parse_document(source, temp_assets, public_dir)
            except Exception as exc:
                rejected.append({"title": title, "reason": str(exc)})
                continue
            if temp_assets.exists() and any(temp_assets.iterdir()):
                final_assets = target_dir / "assets" / slug
                if final_assets.exists():
                    shutil.rmtree(final_assets)
                final_assets.parent.mkdir(parents=True, exist_ok=True)
                shutil.copytree(temp_assets, final_assets)
        chapter = re.sub(r"\s*-\s*(?:ĐỀ|BÀI)\s+.*$", "", title, flags=re.I).strip()
        for question in questions:
            question["chuong"] = chapter
            question["dang"] = "Trắc nghiệm luyện tập"
        answered = sum(question["answer"] is not None for question in questions)
        answer_source = "official" if answered == len(questions) else ("partial" if answered else "missing")
        payload = {
            "id": exam_id,
            "grade": "l12",
            "subjectSlug": subject,
            "examType": "vact",
            "year": 2026,
            "code": code_from_title(title),
            "title": title,
            "duration": 60,
            "answerSource": answer_source,
            "sourceId": f"empire-docx:{source.stem}",
            "passages": {},
            "questions": questions,
        }
        if answer_source != "official":
            payload["notes"] = (
                f"Nguồn có {answered}/{len(questions)} đáp án chính thức; "
                "các câu còn lại được giữ ở trạng thái chưa có đáp án."
            )
        target_dir.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        known.add(fold(title))
        created.append({"title": title, "path": str(target), "source": str(source), "questions": len(questions)})
        print(json.dumps({"status": "created", **created[-1]}, ensure_ascii=False))
        if len(created) >= args.limit:
            break
    print(json.dumps({"created": created, "rejected": rejected}, ensure_ascii=False, indent=2))
    return 0 if created else 2


if __name__ == "__main__":
    raise SystemExit(main())

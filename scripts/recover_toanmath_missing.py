#!/usr/bin/env python3
"""Recover selected Toanmath PDFs as image-based exams with missing answers."""

import json
import re
import urllib.request
from pathlib import Path

import fitz
from PIL import Image
from io import BytesIO


ROOT = Path(__file__).resolve().parents[1]
PDF_DIR = ROOT / ".cache/toanmath-recovery/pdf"
PDF_MANIFEST = ROOT / "pdf-manifest.json"
CONVERSION_MANIFEST = ROOT / "conversion-manifest.json"

# These sources contain one clearly delimited 2025-format exam at the start.
SELECTED = {3, 4, 5, 6, 8, 16, 30, 53}


def download(url, target):
    if target.exists() and target.stat().st_size > 50_000:
        return
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        target.write_bytes(response.read())


def question_markers(doc):
    markers = {}
    for page_index, page in enumerate(doc):
        words = page.get_text("words")
        for pos, word in enumerate(words[:-1]):
            if word[4] != "Câu":
                continue
            match = re.fullmatch(r"(\d+)\.", words[pos + 1][4])
            if not match:
                continue
            number = int(match.group(1))
            if 1 <= number <= 12 and number not in markers:
                markers[number] = (page_index, word[1])
        if len(markers) == 12:
            break
    if set(markers) != set(range(1, 13)):
        raise RuntimeError(f"Cannot locate all 12 Part I questions; found {sorted(markers)}")
    return markers


def part_one_end(doc, q12_marker):
    page_index, y12 = q12_marker
    page = doc[page_index]
    words = page.get_text("words")
    for pos, word in enumerate(words[:-1]):
        if word[1] <= y12:
            continue
        if word[4] == "PHẦN" or (word[4] == "Câu" and re.fullmatch(r"1:", words[pos + 1][4])):
            return page_index, max(y12 + 20, word[1] - 5)
    return page_index, page.rect.height - 25


def render_clip(page, clip, target):
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), clip=clip, alpha=False)
    image = Image.open(BytesIO(pixmap.tobytes("png"))).convert("RGB")
    image.save(target, "WEBP", quality=86, method=6)


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    sources = json.loads(PDF_MANIFEST.read_text(encoding="utf-8-sig"))
    conversions = json.loads(CONVERSION_MANIFEST.read_text(encoding="utf-8-sig"))

    made = []
    for source, converted in zip(sources, conversions):
        index = converted["index"]
        if index not in SELECTED:
            continue
        grade = converted["grade"]
        year = converted["year"]
        slug = source["slug"]
        pdf = PDF_DIR / f"{index:03d}-{slug}.pdf"
        download(source["pdf_url"], pdf)
        doc = fitz.open(pdf)
        try:
            markers = question_markers(doc)
        except RuntimeError as exc:
            print(f"SKIPPED {index:03d} {slug}: {exc}")
            continue

        exam_type = "khaosat"
        directory = ROOT / "data" / grade / "toan" / exam_type
        asset_dir = directory / "assets" / f"{year}-{slug}"
        asset_dir.mkdir(parents=True, exist_ok=True)
        for old_image in list(asset_dir.glob("cau-*.webp")) + list(asset_dir.glob("trang-de-*.webp")):
            old_image.unlink()
        questions = []
        final_end = part_one_end(doc, markers[12])
        for number in range(1, 13):
            start_page, start_y = markers[number]
            end_page, end_y = markers.get(number + 1, final_end)
            images = []
            for page_index in range(start_page, end_page + 1):
                page = doc[page_index]
                top = max(25, start_y - 5) if page_index == start_page else 25
                bottom = end_y if page_index == end_page else page.rect.height - 25
                if bottom <= top + 8:
                    continue
                image_target = asset_dir / f"cau-{number:02d}-{len(images) + 1}.webp"
                render_clip(page, fitz.Rect(28, top, page.rect.width - 20, bottom), image_target)
                images.append(image_target.relative_to(ROOT).as_posix())
            if not images:
                raise RuntimeError(f"Empty crop for question {number} in {pdf}")
            content = "\n".join(
                f'<figure class="question-figure"><img src="{image}" alt="Câu {number} của đề Toán" loading="lazy"></figure>'
                for image in images
            )
            questions.append({
                "id": number,
                "type": "single",
                "content": content,
                "options": [f"{letter}. Chọn phương án {letter} trong hình" for letter in "ABCD"],
                "answer": None,
                "note": "Chưa cập nhật đáp án",
            })
        exam = {
            "id": f"{grade}-toan-{exam_type}-{year}-{slug}-de-01",
            "grade": grade,
            "subjectSlug": "toan",
            "examType": exam_type,
            "year": year,
            "code": "Đề 01",
            "title": f"{source['title']} – Đề 01",
            "duration": 90,
            "answerSource": "missing",
            "sourceUrl": source["page_url"],
            "sourceFileUrl": source["pdf_url"],
            "notes": "Chưa cập nhật đáp án. Nội dung giữ nguyên bằng ảnh cắt từ PDF để tránh sai công thức.",
            "passages": {},
            "questions": questions,
        }
        target = directory / f"{year}-{slug}-de-01.json"
        target.write_text(json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        made.append(target)
        print(f"RECOVERED {target.relative_to(ROOT)} (12 câu)")
    print(f"DONE {len(made)} exams")


if __name__ == "__main__":
    main()

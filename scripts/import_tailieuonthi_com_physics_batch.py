#!/usr/bin/env python3
"""Import complete 2026 Physics graduation exams from tailieuonthi.com.vn.

The source PDFs contain selectable text, but many formula glyphs and superscripts
do not survive extraction reliably.  This importer therefore crops each real
question to WebP while keeping the native question type and official answer key.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import re
import shutil
import tempfile
import time
import unicodedata
import urllib.request
from pathlib import Path

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "l12" / "li" / "totnghiep"
ASSET_ROOT = OUT_DIR / "assets"
API_ROOT = "https://tailieuonthi.com.vn/wp-json/wp/v2/posts"
ASSET_PUBLIC_ROOT = "https://cdn.jsdelivr.net/gh/2TF529/2tf529-assets@main"

# Ten complete, official-answer 2026 exams checked on 2026-08-28.
POST_IDS = [
    804, 807, 809, 811, 813, 815, 818, 820, 822, 824, 826, 828, 830,
    832, 834, 836, 838, 840, 842, 844, 846, 848, 850, 853, 802, 778,
    776, 774, 772, 770, 768, 766, 764, 762, 756, 760, 758, 754,
]
EXPECTED_MARKERS = list(range(1, 19)) + list(range(1, 5)) + list(range(1, 7))


def fetch(url: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; 2TF529 educational importer)",
            "Accept": "*/*",
        },
    )
    last_error: Exception | None = None
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=60) as response:
                return response.read()
        except Exception as exc:  # transient Drive/WordPress throttling
            last_error = exc
            if attempt < 3:
                time.sleep(1.5 * (attempt + 1))
    assert last_error is not None
    raise last_error


def fetch_json(url: str) -> dict:
    return json.loads(fetch(url).decode("utf-8"))


def fold(value: str) -> str:
    value = unicodedata.normalize("NFD", html.unescape(value)).casefold()
    return "".join(ch for ch in value if unicodedata.category(ch) != "Mn").replace("đ", "d")


def slugify(value: str) -> str:
    value = fold(value)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:150].rstrip("-")


def clean_title(raw: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", "", raw))
    return re.sub(r"\s+", " ", value).strip()


def normalized_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", fold(value)).strip()


def existing_titles() -> set[str]:
    found: set[str] = set()
    for path in (ROOT / "data").glob("l*/**/*.json"):
        if "assets" in path.parts:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        title = data.get("title")
        if title:
            found.add(normalized_title(str(title)))
    return found


def drive_id_from_page(url: str) -> str:
    page = fetch(url).decode("utf-8", errors="replace")
    match = re.search(r"drive\.google\.com/file/d/([A-Za-z0-9_-]+)/(?:preview|view)", page)
    if not match:
        raise ValueError("không tìm thấy Google Drive PDF công khai")
    return match.group(1)


def download_pdf(drive_id: str) -> bytes:
    url = (
        "https://drive.usercontent.google.com/download"
        f"?id={drive_id}&export=download&confirm=t"
    )
    payload = fetch(url)
    if not payload.startswith(b"%PDF"):
        raise ValueError("Google Drive không trả về PDF")
    return payload


def exam_page_count(doc: fitz.Document) -> int:
    first = fold(doc[0].get_text("text"))
    match = re.search(r"de thi co\s*0*(\d+)\s*trang", first)
    if not match:
        raise ValueError("không xác định được số trang đề gốc")
    count = int(match.group(1))
    if count < 3 or count >= len(doc):
        raise ValueError(f"số trang đề gốc bất thường: {count}")
    return count


def question_markers(doc: fitz.Document, page_count: int) -> list[tuple[int, float, int]]:
    markers: list[tuple[int, float, int]] = []
    for page_index in range(page_count):
        words = doc[page_index].get_text("words", sort=True)
        for index, word in enumerate(words[:-1]):
            # Actual headings use capitalised "Câu". Lower-case occurrences are
            # instructions such as "từ câu 1 đến câu 18" and must be ignored.
            if word[4] != "Câu":
                continue
            number = re.fullmatch(r"(\d+)[.:]?", words[index + 1][4])
            if number:
                markers.append((page_index, float(word[1]), int(number.group(1))))
    numbers = [item[2] for item in markers]
    best_start = 0
    prefix_length = 0
    for start in range(len(numbers)):
        length = 0
        for actual, expected in zip(numbers[start:], EXPECTED_MARKERS):
            if actual != expected:
                break
            length += 1
        if length > prefix_length:
            best_start, prefix_length = start, length
    # Some publishers flatten the final formula-heavy page to an image. In that
    # case its headings are not selectable either; retain the verified prefix
    # and show the original final page for the remaining keyed questions.
    if prefix_length < 21:
        raise ValueError(f"mốc câu quá thiếu/không đúng thứ tự: {numbers}")
    return markers[best_start : best_start + min(prefix_length, len(EXPECTED_MARKERS))]


def table_rows(page: fitz.Page) -> list[list[str]]:
    rows: list[dict] = []
    for word in page.get_text("words", sort=True):
        row = next((item for item in rows if abs(item["y"] - word[1]) <= 2.2), None)
        if row is None:
            row = {"y": float(word[1]), "words": []}
            rows.append(row)
        row["words"].append(word)
    rows.sort(key=lambda item: item["y"])
    return [
        [word[4].strip() for word in sorted(item["words"], key=lambda word: word[0]) if word[4].strip()]
        for item in rows
    ]


def find_row(rows: list[list[str]], expected: list[str]) -> int:
    for index, row in enumerate(rows):
        if row == expected:
            return index
    raise ValueError(f"không tìm thấy hàng đáp án: {expected[:3]}...")


def official_answers(doc: fitz.Document, answer_page: int | None = None) -> tuple[list[str], list[str], list[str]]:
    # Answer tables vary between one compact page and several labelled pages.
    # Scan all pages so split PDF pages do not move the key away from the
    # physical page number printed on the exam.
    page_rows = [table_rows(page) for page in doc]
    rows = [row for group in page_rows for row in group]

    single_head = [str(number) for number in range(1, 19)]
    single_map: dict[int, str] = {}
    single_index = 0
    for index, row in enumerate(rows[:-1]):
        header = row[1:] if row[:1] == ["Câu"] else row
        if not header or not all(token.isdigit() for token in header):
            continue
        numbers_in_row = [int(token) for token in header]
        if numbers_in_row != list(range(numbers_in_row[0], numbers_in_row[-1] + 1)):
            continue
        if numbers_in_row[0] < 1 or numbers_in_row[-1] > 18:
            continue
        answer_row = rows[index + 1]
        if answer_row[:2] in (["Đáp", "án"], ["Đáp", "số"]):
            answer_row = answer_row[2:]
        if len(answer_row) == len(numbers_in_row) and all(value in "ABCD" for value in answer_row):
            single_map.update(dict(zip(numbers_in_row, answer_row)))
            single_index = index
    if len(single_map) == 18:
        singles = [single_map[number] for number in range(1, 19)]
    else:
        try:
            single_index = find_row(rows, single_head)
            singles = rows[single_index + 1]
        except ValueError:
            single_index = next(index for index, row in enumerate(rows) if row[0:2] == ["Câu", "1"] and row[1:] == single_head)
            singles = rows[single_index + 1]
            if singles[:2] == ["Đáp", "án"]:
                singles = singles[2:]
    if len(singles) != 18 or any(answer not in "ABCD" for answer in singles):
        raise ValueError(f"đáp án Phần I không hợp lệ: {singles}")

    tf_head = [f"{number}{letter}" for number in range(1, 5) for letter in "abcd"]
    try:
        tf_index = find_row(rows, tf_head)
        truth_values = rows[tf_index + 1]
    except ValueError:
        tf_rows = [
            row
            for row in rows[single_index + 1 :]
            if (
                (len(row) == 6 and row[0] == "Câu" and row[1] in {"1", "2", "3", "4"})
                or (len(row) == 5 and row[0] in {"1", "2", "3", "4"})
            )
        ][:4]
        if len(tf_rows) != 4:
            raise ValueError("không tìm thấy đủ 4 hàng đáp án Phần II")
        tf_index = rows.index(tf_rows[-1])
        truth_values = [value for row in tf_rows for value in (row[2:] if row[0] == "Câu" else row[1:])]
    truth_values = [
        "D" if fold(value) in {"d", "dung"} else "S" if fold(value) in {"s", "sai"} else value
        for value in truth_values
    ]
    if len(truth_values) != 16 or any(answer not in ("D", "S") for answer in truth_values):
        raise ValueError(f"đáp án Phần II không hợp lệ: {truth_values}")

    short_head = [str(number) for number in range(1, 7)]
    short_index = next((index for index, row in enumerate(rows) if index > tf_index and row == short_head), None)
    if short_index is None:
        short_index = next(
            (index for index, row in enumerate(rows) if index > tf_index and row[:1] == ["Câu"] and row[1:] == short_head),
            None,
        )
    shorts: list[str]
    if short_index is not None:
        shorts = rows[short_index + 1]
        if shorts[:2] in (["Đáp", "án"], ["Đáp", "số"]):
            shorts = shorts[2:]
    else:
        # Vertical two-column tables: "1 | 800 mol", ..., "6 | 12,5".
        vertical = [
            row
            for row in rows[tf_index + 1 :]
            if len(row) >= 2 and row[0] in {"1", "2", "3", "4", "5", "6"}
        ]
        ordered: dict[int, str] = {}
        for row in vertical:
            number = int(row[0])
            if number not in ordered:
                ordered[number] = " ".join(row[1:])
            if len(ordered) == 6:
                break
        shorts = [ordered.get(number, "") for number in range(1, 7)]
    if len(shorts) != 6 or any(not answer.strip() for answer in shorts):
        raise ValueError(f"đáp án Phần III không hợp lệ: {shorts}")
    return singles, truth_values, shorts


def save_clip(page: fitz.Page, clip: fitz.Rect, destination: Path) -> None:
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), clip=clip, alpha=False)
    image = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGB")
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=84, method=6)


def render_questions(
    doc: fitz.Document,
    markers: list[tuple[int, float, int]],
    page_count: int,
    exam_id: str,
    asset_dir: Path,
) -> list[list[str]]:
    image_urls: list[list[str]] = []
    actual_count = len(markers)
    for question_index, (start_page, start_y, _) in enumerate(markers):
        if question_index + 1 < len(markers):
            end_page, end_y, _ = markers[question_index + 1]
        else:
            end_page, end_y = start_page, doc[start_page].rect.height - 38

        urls: list[str] = []
        part = 0
        for page_index in range(start_page, end_page + 1):
            page = doc[page_index]
            top = max(42.0, start_y - 2.0) if page_index == start_page else 42.0
            bottom = min(page.rect.height - 38.0, end_y + 6.0) if page_index == end_page else page.rect.height - 38.0
            if bottom - top < 18:
                continue
            part += 1
            suffix = f"-p{part}" if end_page > start_page else ""
            filename = f"cau-{question_index + 1:02d}{suffix}.webp"
            save_clip(page, fitz.Rect(24, top, page.rect.width - 24, bottom), asset_dir / filename)
            urls.append(
                f"{ASSET_PUBLIC_ROOT}/l12/li/totnghiep/assets/{exam_id}/{filename}"
            )
        if not urls:
            raise ValueError(f"không render được câu {question_index + 1}")
        image_urls.append(urls)

    if actual_count < len(EXPECTED_MARKERS):
        fallback_urls: list[str] = []
        fallback_start = markers[-1][0]
        for page_index in range(fallback_start, page_count):
            filename = f"phan-cuoi-trang-{page_index + 1:02d}.webp"
            page = doc[page_index]
            save_clip(page, fitz.Rect(24, 42, page.rect.width - 24, page.rect.height - 38), asset_dir / filename)
            fallback_urls.append(f"{ASSET_PUBLIC_ROOT}/l12/li/totnghiep/assets/{exam_id}/{filename}")
        while len(image_urls) < len(EXPECTED_MARKERS):
            image_urls.append(fallback_urls)
    return image_urls


def question_content(number: int, urls: list[str]) -> str:
    figures = "\n".join(
        f'<figure class="question-figure"><img src="{url}" alt="Nội dung câu {number} của đề Vật lí" loading="lazy"></figure>'
        for url in urls
    )
    return f"Quan sát nội dung nguyên bản của **câu {number}** dưới đây:\n{figures}"


def build_questions(
    images: list[list[str]], singles: list[str], truth_values: list[str], shorts: list[str]
) -> list[dict]:
    questions: list[dict] = []
    for index in range(18):
        number = index + 1
        questions.append(
            {
                "id": number,
                "type": "single",
                "content": question_content(number, images[index]),
                "options": [
                    "A. Chọn phương án A trong hình",
                    "B. Chọn phương án B trong hình",
                    "C. Chọn phương án C trong hình",
                    "D. Chọn phương án D trong hình",
                ],
                "answer": singles[index],
            }
        )
    for index in range(4):
        question_id = 19 + index
        offset = index * 4
        questions.append(
            {
                "id": question_id,
                "type": "true_false",
                "content": question_content(question_id, images[18 + index]),
                "statements": [
                    "a) Mệnh đề a trong hình",
                    "b) Mệnh đề b trong hình",
                    "c) Mệnh đề c trong hình",
                    "d) Mệnh đề d trong hình",
                ],
                "answer": truth_values[offset : offset + 4],
            }
        )
    for index in range(6):
        question_id = 23 + index
        questions.append(
            {
                "id": question_id,
                "type": "short_answer",
                "content": question_content(question_id, images[22 + index]),
                "answer": shorts[index],
            }
        )
    return questions


def import_post(
    post_id: int, seen_titles: set[str], dry_run: bool = False, replace: bool = False
) -> tuple[str, str]:
    post = fetch_json(f"{API_ROOT}/{post_id}")
    title = clean_title(post["title"]["rendered"])
    title_key = normalized_title(title)
    if title_key in seen_titles and not replace:
        return "SKIP", f"{title} (trùng title)"
    if not re.search(r"202[5-9]", title):
        return "SKIP", f"{title} (cũ hơn 2025/không rõ năm)"

    exam_id = f"l12-li-totnghiep-2026-{slugify(title)}"
    output_path = OUT_DIR / f"{slugify(title)}.json"
    asset_dir = ASSET_ROOT / exam_id
    if output_path.exists() and not replace:
        return "SKIP", f"{title} (file đã tồn tại)"

    drive_id = drive_id_from_page(post["link"])
    pdf_data = download_pdf(drive_id)
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as handle:
        handle.write(pdf_data)
        temp_path = Path(handle.name)

    try:
        with fitz.open(temp_path) as doc:
            declared_pages = exam_page_count(doc)
            markers = question_markers(doc, len(doc))
            pages = max(declared_pages, markers[-1][0] + 1)
            # At most two extra split pages belong to the original exam. This
            # matters only when the tail is image-only and has no text markers.
            pages = min(pages + (2 if len(markers) < 28 else 0), len(doc))
            singles, truth_values, shorts = official_answers(doc)
            if dry_run:
                return "CHECK", f"{title}: {pages} trang, 28 câu, đủ đáp án"
            if asset_dir.exists():
                shutil.rmtree(asset_dir)
            images = render_questions(doc, markers, pages, exam_id, asset_dir)
            questions = build_questions(images, singles, truth_values, shorts)

        payload = {
            "id": exam_id,
            "grade": "l12",
            "subjectSlug": "li",
            "examType": "totnghiep",
            "year": 2026,
            "code": f"TLÔT-{post_id}",
            "title": title,
            "duration": 50,
            "answerSource": "official",
            "sourceUrl": post["link"],
            "passages": {},
            "questions": questions,
        }
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        seen_titles.add(title_key)
        return "CREATED", f"{output_path.relative_to(ROOT)} (28 câu)"
    except Exception:
        if asset_dir.exists():
            shutil.rmtree(asset_dir)
        output_path.unlink(missing_ok=True)
        raise
    finally:
        temp_path.unlink(missing_ok=True)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=10)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--replace", action="store_true", help="render lại đúng các đề cùng nguồn/title")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    seen = existing_titles()
    created = 0
    failures = 0
    for post_id in POST_IDS:
        if created >= args.target:
            break
        try:
            status, message = import_post(post_id, seen, dry_run=args.dry_run, replace=args.replace)
            print(f"{status}: {message}")
            if status in ("CREATED", "CHECK"):
                created += 1
        except Exception as exc:
            failures += 1
            print(f"FAILED: post {post_id}: {exc}")

    print(f"Hoàn tất: {created}/{args.target}; lỗi: {failures}")
    return 0 if created == args.target and failures == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())

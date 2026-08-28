#!/usr/bin/env python3
"""Import complete 2026 English graduation exams from SieuGioi PDF attachments.

The importer is deliberately strict: an exam is written only when the test PDF
contains questions 1..40, every question has four distinct choices, and the
official solution PDF supplies all 40 answer letters.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin

import fitz
import requests
from bs4 import BeautifulSoup


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
OUT_DIR = DATA_DIR / "l12" / "anh" / "totnghiep"
CACHE_DIR = ROOT / ".cache" / "sieugioi_pdf_english"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36"
)

THREADS = [
    "https://sieugioi.com/docs/threads/de-thi-tot-nghiep-thpt-2026-mon-tieng-anh-kem-dap-an.1055/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-le-trong-tan-so-tp-hcm.976/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-kim-lien-so-ha-noi-lan-3.975/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-tuyen-quang-lan-2.974/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-son-la-lan-3.973/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-cum-truong-so-8-so-ha-noi.972/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-ninh-binh-lan-4.945/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-thieu-hoa-so-thanh-hoa-lan-1.942/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-dien-bien-lan-1.941/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-tay-ninh-so-gd-tay-ninh.882/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-phu-tho-lan-2.833/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-le-loi-so-thanh-hoa-lan-1.832/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-me-linh-so-hung-yen-lan-2.831/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-quang-tri-lan-2.830/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-lam-dong.816/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-dong-thuy-so-hung-yen-lan-3.829/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-thai-phien-so-hai-phong-lan-3.828/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-nguyen-viet-xuan-so-phu-tho-lan-3.826/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-vinh-long.844/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-gd-dt-da-nang-lan-1.827/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-truong-a-thanh-liem-so-ninh-binh-lan-2.835/",
    "https://sieugioi.com/docs/threads/de-thi-thu-tot-nghiep-thpt-2026-mon-tieng-anh-so-ha-tinh-lan-2.815/",
]


def fold(value: str) -> str:
    value = unicodedata.normalize("NFD", value.casefold())
    return "".join(c for c in value if unicodedata.category(c) != "Mn").replace("đ", "d")


def slugify(value: str, limit: int = 118) -> str:
    value = re.sub(r"[^a-z0-9]+", "-", fold(value)).strip("-")
    return value[:limit].rstrip("-") or "de-thi-tieng-anh-2026"


def normalize_title(value: str) -> str:
    return re.sub(r"\s+", " ", fold(value)).strip()


def clean_text(value: str) -> str:
    value = value.replace("\u00ad", "").replace("\xa0", " ")
    value = re.sub(r"(?<=\w)-\s*\n\s*(?=\w)", "-", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\s*\n\s*", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def pdf_text(blob: bytes) -> str:
    doc = fitz.open(stream=blob, filetype="pdf")
    pages = []
    for page in doc:
        lines = []
        for line in page.get_text().splitlines():
            compact = clean_text(line)
            folded = fold(compact)
            if not compact:
                lines.append("")
                continue
            if re.match(r"^cac mon:.*sieugioi\.com.*trang\s+\d+", folded):
                continue
            if re.match(r"^(?:ma de:\s*\d+|trang\s+\d+)$", folded):
                continue
            if folded == "de thi thu tot nghiep thpt 2026":
                continue
            lines.append(line)
        pages.append("\n".join(lines))
    return "\n".join(pages)


def existing_titles() -> set[str]:
    titles: set[str] = set()
    for path in DATA_DIR.rglob("*.json"):
        if "_template" in path.parts or path.name in {
            "index.json", "id-map.json", "stats.json", "taxonomy.json",
            "topic-index.json", "explore-index.json",
        }:
            continue
        try:
            obj = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if isinstance(obj, dict) and isinstance(obj.get("title"), str):
            titles.add(normalize_title(obj["title"]))
    return titles


def candidate_threads() -> list[str]:
    """Return curated URLs first, then rotate through the cached forum catalog."""
    urls = list(THREADS)
    seen = set(urls)
    catalog = ROOT / ".cache" / "sieugioi" / "threads_catalog.json"
    if not catalog.exists():
        return urls
    try:
        rows = json.loads(catalog.read_text(encoding="utf-8"))
    except Exception:
        return urls
    for row in rows:
        title = fold(str(row.get("title", "")))
        url = str(row.get("url", ""))
        if not url or url in seen:
            continue
        if "tieng anh" not in title or "2026" not in title:
            continue
        if not re.search(r"(?:tot nghiep|thi thu|kscl|khao sat)", title):
            continue
        if re.search(r"(?:vao lop 10|tuyen sinh|lop 9)", title):
            continue
        seen.add(url)
        urls.append(url)
    return urls


def thread_title(soup: BeautifulSoup) -> str:
    node = soup.select_one("h1.p-title-value") or soup.select_one("h1")
    title = node.get_text(" ", strip=True) if node else soup.title.get_text(" ", strip=True)
    title = re.sub(r"\s*\|\s*SieuGioi.*$", "", title, flags=re.I)
    title = re.sub(r"^(?:Thi\s+Thử|Đề\s+Thi)\s+(?=Đề\s+thi)", "", title, flags=re.I)
    return clean_text(title)


def download_attachment(session: requests.Session, attachment_url: str, cache_name: str) -> bytes:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cached = CACHE_DIR / f"{cache_name}.pdf"
    if cached.exists() and cached.read_bytes().startswith(b"%PDF"):
        return cached.read_bytes()

    page = session.get(attachment_url, timeout=45)
    page.raise_for_status()
    soup = BeautifulSoup(page.text, "html.parser")
    form = soup.select_one('form[action*="sess="]')
    if not form:
        raise RuntimeError("Không tìm thấy biểu mẫu tải PDF")
    payload = {
        field["name"]: field.get("value", "")
        for field in form.select("input[name]")
    }
    response = session.post(urljoin(attachment_url, form.get("action", "")), data=payload, timeout=90)
    response.raise_for_status()
    if not response.content.startswith(b"%PDF"):
        raise RuntimeError("File đính kèm tải về không phải PDF")
    cached.write_bytes(response.content)
    return response.content


def attachment_pairs(session: requests.Session, thread_url: str) -> tuple[str, bytes, bytes]:
    response = session.get(thread_url, timeout=45)
    response.raise_for_status()
    soup = BeautifulSoup(response.text, "html.parser")
    title = thread_title(soup)
    attachments = []
    seen = set()
    for anchor in soup.select('a[href*="/docs/attachments/"]'):
        url = urljoin(thread_url, anchor.get("href", ""))
        if url in seen:
            continue
        seen.add(url)
        name = clean_text(anchor.get_text(" ", strip=True))
        if ".pdf" in name.casefold() or "pdf" in fold(url):
            attachments.append((name, url))
    solutions = [(n, u) for n, u in attachments if re.search(r"\b(?:giai|dap an|loi giai|huong dan)\b", fold(n))]
    tests = [(n, u) for n, u in attachments if (n, u) not in solutions]
    if not tests or not solutions:
        raise RuntimeError(f"Thiếu PDF đề hoặc PDF lời giải ({len(tests)}/{len(solutions)})")
    key = re.search(r"\.(\d+)/?$", thread_url)
    cache_prefix = key.group(1) if key else slugify(title, 40)
    test_blob = download_attachment(session, tests[0][1], f"{cache_prefix}-de")
    solution_blob = download_attachment(session, solutions[0][1], f"{cache_prefix}-giai")
    return title, test_blob, solution_blob


def parse_answer_key(solution: str) -> dict[int, str]:
    answers: dict[int, str] = {}
    # Detailed solutions are the most stable representation across PDFs.
    for number, letter in re.findall(
        r"(?:Question|Câu)\s+(\d{1,2})[.:]\s*(?:(?:Đáp\s*án|Chọn)\s*)?([A-D])(?:\.|\b)",
        solution,
        flags=re.I,
    ):
        answers[int(number)] = letter.upper()
    # Long-form solutions often put the decision at the end of each question
    # block rather than directly beside the question heading.
    blocks = list(re.finditer(r"(?:Question|Câu)\s+(\d{1,2})[.:]", solution, flags=re.I))
    for index, block in enumerate(blocks):
        number = int(block.group(1))
        stop = blocks[index + 1].start() if index + 1 < len(blocks) else len(solution)
        body = solution[block.end():stop]
        decisions = re.findall(r"(?:Chọn|Đáp\s*án(?:\s+là)?)\s*[:：]?\s*([A-D])(?:\.|\b)", body, flags=re.I)
        if decisions:
            answers[number] = decisions[-1].upper()
            continue
        # Annotated answer sheets mark the correct option itself as "ĐÚNG".
        folded_body = fold(body)
        marked = re.findall(r"(?m)^\s*(?:[•◆]\s*)?([a-d])[.:]\s*[^\n]{0,700}?\bdung\b", folded_body)
        if not marked:
            # A few solution PDFs wrap the option text onto the next physical
            # line before appending the correctness marker. Keep the match
            # inside one option block so a later option cannot be selected.
            option_blocks = list(re.finditer(r"(?m)^\s*(?:[•◆]\s*)?([a-d])[.:]\s*", folded_body))
            for option_index, option in enumerate(option_blocks):
                option_stop = option_blocks[option_index + 1].start() if option_index + 1 < len(option_blocks) else len(folded_body)
                if re.search(r"\bdung\b", folded_body[option.end():option_stop]):
                    marked.append(option.group(1))
        if marked:
            answers[number] = marked[-1].upper()
            continue
        # Ordering questions: the explanation repeats the correct lowercase
        # sentence order. Match that order back to one of choices A-D.
        choice_orders = {}
        choice_matches = list(re.finditer(
            r"(?m)^\s*([A-D])\.\s*([a-e](?:\s*[-–—]\s*[a-e]){2,4})",
            body,
        ))
        for choice in choice_matches:
            order = re.sub(r"[^a-e]", "", choice.group(2).casefold())
            choice_orders[order] = choice.group(1).upper()
        if choice_matches:
            explanation = body[choice_matches[-1].end():]
            ordered_letters = re.findall(r"(?m)^\s*(?:[◆•]\s*)?([a-e])\.\s+", explanation)
            for length in (5, 4, 3):
                order = "".join(ordered_letters[:length])
                if order in choice_orders:
                    answers[number] = choice_orders[order]
                    break
    # Some files only contain a compact answer table. Read the table's text order.
    if len(answers) < 40:
        marker = re.search(r"ĐÁP\s*ÁN", solution, flags=re.I)
        if marker:
            table = solution[marker.end():]
            table = re.split(r"LỜI\s*GIẢI|HƯỚNG\s*DẪN", table, maxsplit=1, flags=re.I)[0]
            tokens = re.findall(r"(?<!\w)(\d{1,2}|[A-D])(?!\w)", table)
            # Common four-column table: 1 A 11 C 21 B 31 D ...
            for index in range(len(tokens) - 1):
                if tokens[index].isdigit() and tokens[index + 1] in "ABCD":
                    number = int(tokens[index])
                    if 1 <= number <= 40:
                        answers[number] = tokens[index + 1]
            # Alternate table: 1 2 ... 20, then twenty answer letters.
            index = 0
            while index < len(tokens):
                if not tokens[index].isdigit():
                    index += 1
                    continue
                number_end = index
                while number_end < len(tokens) and tokens[number_end].isdigit():
                    number_end += 1
                letter_end = number_end
                while letter_end < len(tokens) and tokens[letter_end] in "ABCD":
                    letter_end += 1
                numbers = [int(x) for x in tokens[index:number_end]]
                letters = tokens[number_end:letter_end]
                if len(numbers) >= 5 and len(numbers) == len(letters):
                    answers.update({n: a for n, a in zip(numbers, letters) if 1 <= n <= 40})
                index = max(letter_end, index + 1)
    return answers


QUESTION_RE = re.compile(r"Question\s+(\d{1,2})\.\s*", flags=re.I)
OPTION_RE = re.compile(r"(?<!\w)([A-D])\.\s+")
CONTEXT_RE = re.compile(
    r"\n\s*(?=(?:Read|Mark|Choose|Look at|The following)\b)",
    flags=re.I,
)


def strip_exam_front_matter(prefix: str) -> str:
    starts = [m.start() for m in re.finditer(r"(?:Read|Mark|Choose|Look at|The following)\b", prefix, flags=re.I)]
    return prefix[min(starts):] if starts else prefix


def passage_html(text: str) -> str:
    value = clean_text(text)
    value = html.escape(value, quote=False)
    return f"<p>{value}</p>"


def parse_questions(raw: str, answers: dict[int, str]) -> tuple[dict[str, str], list[dict]]:
    matches = list(QUESTION_RE.finditer(raw))
    if [int(m.group(1)) for m in matches] != list(range(1, 41)):
        raise ValueError("PDF không có đúng chuỗi câu 1..40")

    passages: dict[str, str] = {}
    passage_ranges: list[tuple[int, int, str]] = []
    pending = strip_exam_front_matter(raw[:matches[0].start()])
    questions = []

    for index, match in enumerate(matches):
        number = int(match.group(1))
        end = matches[index + 1].start() if index + 1 < len(matches) else len(raw)
        segment = raw[match.end():end]
        option_matches = list(OPTION_RE.finditer(segment))
        if [m.group(1).upper() for m in option_matches] != list("ABCD"):
            raise ValueError(f"Câu {number} không tách được đúng A/B/C/D")

        stem = segment[:option_matches[0].start()]
        choices = []
        next_pending = ""
        for option_index, option_match in enumerate(option_matches):
            option_end = option_matches[option_index + 1].start() if option_index < 3 else len(segment)
            value = segment[option_match.end():option_end]
            if option_index == 3:
                context = CONTEXT_RE.search(value)
                if context:
                    next_pending = value[context.end():]
                    value = value[:context.start()]
            option_value = clean_text(value)
            option_value = re.sub(
                r"\s*(?:-{3,}\s*)?(?:HẾT|THE\s+END)(?:\s*-{3,})?.*$",
                "",
                option_value,
                flags=re.I,
            ).strip()
            choices.append(f"{option_match.group(1).upper()}. {option_value}")

        if pending:
            range_match = re.search(r"(?:from\s+|questions?\s+|blanks?\s+)?(\d{1,2})\s+(?:to|through|-)\s+(\d{1,2})", pending, flags=re.I)
            if passage_ranges and passage_ranges[-1][1] == 40 and passage_ranges[-1][0] < number:
                previous_start, _, previous_id = passage_ranges[-1]
                passage_ranges[-1] = (previous_start, number - 1, previous_id)
            if range_match:
                start, stop = map(int, range_match.groups())
                # A few source PDFs contain a stale range copied from another
                # section. The block's physical position before this question
                # is authoritative; preserve only its stated question count.
                if not start <= number <= stop:
                    span = max(0, stop - start)
                    start, stop = number, min(40, number + span)
                passage_id = f"p{len(passages) + 1}"
                passages[passage_id] = passage_html(pending)
                passage_ranges.append((start, stop, passage_id))
            elif len(clean_text(pending)) >= 80:
                passage_id = f"p{len(passages) + 1}"
                passages[passage_id] = passage_html(pending)
                passage_ranges.append((number, 40, passage_id))
            pending = ""

        item = {
            "id": number,
            "type": "single",
            "content": clean_text(stem) or "Chọn phương án đúng để hoàn thành chỗ trống trong ngữ liệu.",
            "options": choices,
            "answer": answers.get(number),
            "chuong": "Ôn thi tốt nghiệp THPT — Tiếng Anh",
        }
        for start, stop, passage_id in reversed(passage_ranges):
            if start <= number <= stop:
                item["passageId"] = passage_id
                break
        questions.append(item)
        pending = next_pending

    return passages, questions


def validate_exam(exam: dict) -> None:
    questions = exam["questions"]
    if len(questions) != 40 or [q["id"] for q in questions] != list(range(1, 41)):
        raise ValueError("Không đủ 40 câu liên tục")
    for question in questions:
        options = question.get("options", [])
        normalized_options = {
            re.sub(r"^[A-D][.)]\s*", "", clean_text(x), flags=re.I).casefold()
            for x in options
        }
        if len(options) != 4 or len(normalized_options) != 4:
            raise ValueError(f"Câu {question['id']} có phương án thiếu/trùng")
        if question.get("answer") not in "ABCD":
            raise ValueError(f"Câu {question['id']} thiếu đáp án chính thức")
        if len(question.get("content", "")) < 2:
            raise ValueError(f"Câu {question['id']} thiếu nội dung")
        if question.get("content", "").startswith("Chọn phương án đúng để hoàn thành"):
            passage = exam.get("passages", {}).get(question.get("passageId", ""), "")
            if not re.search(rf"\({question['id']}\)\s*_+", passage):
                raise ValueError(f"Câu {question['id']} bị mất câu dẫn trong PDF")
    serialized = json.dumps(exam, ensure_ascii=False)
    if "\ufffd" in serialized or re.search(r"[\ue000-\uf8ff]", serialized):
        raise ValueError("Có ký tự OCR/Private Use lỗi")


def build_exam(title: str, test_blob: bytes, solution_blob: bytes) -> dict:
    solution_text = pdf_text(solution_blob)
    answers = parse_answer_key(solution_text)
    if set(answers) != set(range(1, 41)):
        missing = sorted(set(range(1, 41)) - set(answers))
        raise ValueError(f"Đáp án chính thức thiếu câu: {missing}")
    passages, questions = parse_questions(pdf_text(test_blob), answers)
    exam_slug = slugify(title)
    exam = {
        "id": f"l12-anh-totnghiep-2026-{exam_slug}",
        "grade": "l12",
        "subjectSlug": "anh",
        "examType": "totnghiep",
        "year": 2026,
        "code": "2026",
        "title": title,
        "duration": 50,
        "answerSource": "official",
        "passages": passages,
        "questions": questions,
    }
    validate_exam(exam)
    return exam


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=10)
    parser.add_argument("--delay", type=float, default=0.35)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refresh", action="store_true", help="Tạo lại các file có title đã tồn tại")
    args = parser.parse_args()

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    known_titles = existing_titles()
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    created = []

    for thread_url in candidate_threads():
        if len(created) >= args.target:
            break
        try:
            title, test_blob, solution_blob = attachment_pairs(session, thread_url)
            if normalize_title(title) in known_titles and not args.refresh:
                print(f"SKIP title trùng: {title}")
                continue
            exam = build_exam(title, test_blob, solution_blob)
            filename = f"2026-{slugify(title)}.json"
            output = OUT_DIR / filename
            if not args.dry_run:
                output.write_text(json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            created.append(output)
            known_titles.add(normalize_title(title))
            print(f"CREATED {output.relative_to(ROOT)} (40 câu, đáp án chính thức)")
        except Exception as exc:
            print(f"SKIP {thread_url}: {exc}")
        time.sleep(args.delay)

    print(f"Hoàn tất: {len(created)}/{args.target} đề đạt chuẩn")
    return 0 if len(created) == args.target else 1


if __name__ == "__main__":
    raise SystemExit(main())

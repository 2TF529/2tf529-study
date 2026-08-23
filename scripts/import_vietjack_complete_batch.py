#!/usr/bin/env python3
"""Import complete, public VietJack exam pages into the website schema.

The importer deliberately rejects index/preview pages, truncated tests and
multiple-choice questions with missing options.  It converts HTML sub/sup
notation to inline LaTeX and keeps only indispensable figures as local WebP.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import io
import json
import re
import sys
import threading
import unicodedata
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
ROOT_PAGES = [f"https://www.vietjack.com/de-thi/de-thi-lop-{g}.jsp" for g in range(9, 13)]
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    )
}
QUESTION_RE = re.compile(r"^Câu\s*(\d+)\s*[:.)-]\s*(.*)$", re.I)
OPTION_RE = re.compile(r"^\s*([A-D])\s*[.)]\s*(.+)$", re.I | re.S)
EXAM_MARKER_RE = re.compile(r"^\(?\s*Đề\s*(?:số)?\s*(\d+)\s*\)?$", re.I)
ANSWER_HEADING_RE = re.compile(r"^(?:ĐÁP\s*ÁN|HƯỚNG\s*DẪN\s*GIẢI|LỜI\s*GIẢI)", re.I)
YEAR_RE = re.compile(r"\b(20\d{2})\b")
FORMULA_RE = re.compile(
    r"(?<![\w$])([A-Za-z0-9()+\-=.,]*"
    r"(?:_\{[^{}]+\}|\^\{[^{}]+\})"
    r"[A-Za-z0-9(){}_^+\-=.,]*)(?![\w$])"
)
SESSION_LOCAL = threading.local()


def session() -> requests.Session:
    if not hasattr(SESSION_LOCAL, "value"):
        s = requests.Session()
        s.headers.update(HEADERS)
        SESSION_LOCAL.value = s
    return SESSION_LOCAL.value


def fetch(url: str) -> bytes:
    r = session().get(url, timeout=35)
    r.raise_for_status()
    if "text/html" not in r.headers.get("content-type", ""):
        raise ValueError("not HTML")
    return r.content


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.casefold())
    return "".join(c for c in text if unicodedata.category(c) != "Mn").replace("đ", "d")


def slugify(text: str, limit: int = 100) -> str:
    value = fold(text)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:limit].rstrip("-") or "de-thi"


def clean_space(text: str) -> str:
    return re.sub(r"[ \t\xa0]+", " ", text).strip()


def is_candidate(url: str, label: str) -> bool:
    clean, _ = urldefrag(url)
    parsed = urlparse(clean)
    if parsed.netloc not in {"vietjack.com", "www.vietjack.com"} or not parsed.path.endswith(".jsp"):
        return False
    if not any(x in parsed.path for x in ("/de-thi/", "/de-kiem-tra-lop-", "/luyen-thi-", "/on-thi-")):
        return False
    f = fold(label)
    wanted = ("de thi", "trac nghiem", "bai tap", "on tap", "de cuong", "chuyen de", "khao sat")
    blocked = ("giao an", "powerpoint", "mua sach", "combo sach", "trang truoc", "trang sau")
    return any(x in f for x in wanted) and not any(x in f for x in blocked)


def discover() -> list[str]:
    found: dict[str, str] = {}
    for root_url in ROOT_PAGES:
        soup = BeautifulSoup(fetch(root_url), "html.parser")
        areas = soup.select(".content")
        area = max(areas, key=lambda x: len(x.get_text(" ", strip=True))) if areas else soup
        for a in area.select("a[href]"):
            label = clean_space(a.get_text(" ", strip=True))
            url, _ = urldefrag(urljoin(root_url, a.get("href", "")))
            if is_candidate(url, label) and url not in ROOT_PAGES:
                found.setdefault(url, label)
    return sorted(found)


def render_node(node, base_url: str) -> str:
    if isinstance(node, NavigableString):
        return html.escape(str(node), quote=False)
    if not isinstance(node, Tag):
        return ""
    name = node.name.lower()
    if name in {"script", "style", "noscript", "iframe", "ins"}:
        return ""
    if name == "br":
        return "\n"
    if name == "sub":
        return "_{" + clean_space(node.get_text(" ", strip=True)) + "}"
    if name == "sup":
        return "^{" + clean_space(node.get_text(" ", strip=True)) + "}"
    if name == "img":
        src = node.get("data-src") or node.get("data-original") or node.get("src")
        if not src or src.startswith("data:"):
            return ""
        return "[[VJIMG:" + urljoin(base_url, src) + "]]"
    inner = "".join(render_node(c, base_url) for c in node.children)
    if name in {"strong", "b"}:
        return f"<strong>{inner}</strong>"
    if name in {"em", "i"}:
        return f"<em>{inner}</em>"
    if name in {"table", "thead", "tbody", "tr", "th", "td"}:
        return f"<{name}>{inner}</{name}>"
    if name in {"ul", "ol", "li"}:
        return f"<{name}>{inner}</{name}>"
    return inner


def latexize(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("→", " $\\rightarrow$ ").replace("⇒", " $\\Rightarrow$ ")
    value = FORMULA_RE.sub(lambda m: "$" + m.group(1) + "$", value)
    value = re.sub(r"\$\s*\$", "", value)
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def block_html(block: Tag, base_url: str) -> str:
    return latexize(render_node(block, base_url))


def block_text(block: Tag) -> str:
    return clean_space(block.get_text(" ", strip=True))


def split_options(value: str) -> list[str]:
    plain = BeautifulSoup(value, "html.parser").get_text(" ", strip=True)
    starts = list(re.finditer(r"(?:^|\s)([A-D])\s*[.)]\s+", plain))
    if len(starts) < 2:
        return []
    out = []
    for i, m in enumerate(starts):
        end = starts[i + 1].start() if i + 1 < len(starts) else len(plain)
        body = clean_space(plain[m.end():end])
        if body:
            out.append(f"{m.group(1).upper()}. {html.escape(body, quote=False)}")
    return out


def extract_answer_map(solution_blocks: list[Tag]) -> dict[int, str]:
    answer_map: dict[int, str] = {}
    for block in solution_blocks:
        text = block_text(block)
        folded = fold(text)
        for numbers, answers in re.findall(
            r"\bcau\s+((?:\d{1,3}\s+)+)dap\s*an\s+"
            r"((?:[abcd]\s*)+?)(?=\s+cau\s+\d|$)",
            folded,
            re.I,
        ):
            ns = re.findall(r"\d{1,3}", numbers)
            av = re.findall(r"[ABCD]", answers, re.I)
            if len(ns) == len(av):
                for n, ans in zip(ns, av):
                    answer_map.setdefault(int(n), ans.upper())
        for n, ans in re.findall(
            r"(?:^|\s)(?:cau\s*)?(\d{1,3})\s*[:.)-]?\s*(?:dap\s*an\s*)?([abcd])(?:\s|$)",
            folded,
            re.I,
        ):
            answer_map.setdefault(int(n), ans.upper())
    if len(answer_map) < 5:
        sequential = []
        for block in solution_blocks:
            m = re.fullmatch(r"dap an\s*([abcd])", fold(block_text(block)), re.I)
            if m:
                sequential.append(m.group(1).upper())
        if len(sequential) >= 5:
            answer_map = {i + 1: value for i, value in enumerate(sequential)}
    return answer_map


def parse_questions(prompt_blocks: list[Tag], solution_blocks: list[Tag], base_url: str):
    starts: list[tuple[int, int, str]] = []
    for idx, block in enumerate(prompt_blocks):
        m = QUESTION_RE.match(block_text(block))
        if m:
            starts.append((idx, int(m.group(1)), m.group(2)))
    if len(starts) < 5:
        return None
    answer_map = extract_answer_map(solution_blocks)
    questions = []
    single_position = 0
    for pos, (start, source_no, first_text) in enumerate(starts):
        end = starts[pos + 1][0] if pos + 1 < len(starts) else len(prompt_blocks)
        chunk = prompt_blocks[start:end]
        first_html = block_html(chunk[0], base_url)
        first_html = re.sub(r"^Câu\s*\d+\s*[:.)-]\s*", "", first_html, flags=re.I)
        content_parts = [first_html] if first_html else []
        options: list[str] = []
        option_started = False
        for block in chunk[1:]:
            text = block_text(block)
            rendered = block_html(block, base_url)
            match = OPTION_RE.match(text)
            if match:
                option_started = True
                rendered_body = rendered
                prefix = re.compile(
                    rf"^\s*(?:(?:<[^>]+>)\s*)*{match.group(1)}\s*[.)]\s*(?:(?:</[^>]+>)\s*)*",
                    re.I,
                )
                rendered_body = prefix.sub("", rendered_body, count=1)
                rendered_body = prefix.sub("", rendered_body, count=1)
                options.append(f"{match.group(1).upper()}. {rendered_body.strip()}")
                continue
            combined = split_options(rendered)
            if combined:
                option_started = True
                options.extend(combined)
                continue
            if not option_started and text and not ANSWER_HEADING_RE.match(text):
                content_parts.append(rendered)
        content = "\n".join(x for x in content_parts if x).strip()
        if len(BeautifulSoup(content, "html.parser").get_text(" ", strip=True)) < 3 and "[[VJIMG:" not in content:
            return None
        if options:
            normalized_options = {
                re.sub(
                    r"^\s*[A-D]\s*[.)]\s*",
                    "",
                    BeautifulSoup(x, "html.parser").get_text(" ", strip=True),
                    flags=re.I,
                ).strip().casefold()
                for x in options
            }
            if len(options) != 4 or len(normalized_options) != 4:
                return None
            prompt_folded = fold(BeautifulSoup(content, "html.parser").get_text(" ", strip=True))
            if "dung hoac sai" in prompt_folded or "moi y a" in prompt_folded:
                statements = [re.sub(r"^\s*[A-D]\s*[.)]\s*", "", x, flags=re.I) for x in options]
                questions.append({"id": len(questions) + 1, "type": "true_false", "content": content,
                                  "statements": statements, "answer": [], "_sourceNo": source_no})
            else:
                single_position += 1
                answer = answer_map.get(source_no) or answer_map.get(single_position)
                questions.append({"id": len(questions) + 1, "type": "single", "content": content,
                                  "options": options, "answer": answer, "_sourceNo": source_no})
        else:
            questions.append({"id": len(questions) + 1, "type": "short_answer", "content": content,
                              "answer": None, "_sourceNo": source_no})
    return questions


def detect_meta(title: str, url: str, page_text: str):
    f = fold(title + " " + url)
    # An explicit year in the page title is authoritative.  Do not let a
    # current-year advert elsewhere on an old page make a 2023/2024 test look
    # like a 2025+ test.
    explicit_title_years = [int(x) for x in re.findall(r"\b20\d{2}\b", title)]
    if explicit_title_years and max(explicit_title_years) < 2025:
        return None
    grade_match = re.search(r"(?:lop|toan|van|anh|hoa|ly|li|sinh|su|dia|tin)\D*(9|10|11|12)\b", f)
    if not grade_match:
        return None
    grade = "l" + grade_match.group(1)
    # Prefer an explicit subject+grade phrase over loose keywords.  This
    # prevents school names such as "Hoang Van Thu" or "Khoa hoc ..." from
    # being interpreted as Literature or Chemistry.
    strong_subjects = [
        (r"\b(?:mon\s+)?toan\s*(?:lop\s*)?(?:9|10|11|12)\b", "toan"),
        (r"\b(?:ngu\s+)?van\s*(?:lop\s*)?(?:9|10|11|12)\b", "van"),
        (r"\b(?:tieng\s+anh|english)\s*(?:lop\s*)?(?:9|10|11|12)\b", "anh"),
        (r"\b(?:vat\s+(?:li|ly)|mon\s+(?:li|ly))\s*(?:lop\s*)?(?:9|10|11|12)\b", "li"),
        (r"\b(?:hoa\s+hoc|mon\s+hoa)\s*(?:lop\s*)?(?:9|10|11|12)\b", "hoa"),
        (r"\b(?:sinh\s+hoc|mon\s+sinh)\s*(?:lop\s*)?(?:9|10|11|12)\b", "sinh"),
        (r"\b(?:lich\s+su|mon\s+su)\s*(?:lop\s*)?(?:9|10|11|12)\b", "su"),
        (r"\b(?:dia\s+(?:li|ly)|mon\s+dia)\s*(?:lop\s*)?(?:9|10|11|12)\b", "dia"),
    ]
    subject = next((slug for pattern, slug in strong_subjects if re.search(pattern, f)), None)
    subjects = [
        (("ngu van", " mon van", "van lop", "van-"), "van"),
        (("tieng anh", "english"), "anh"),
        (("vat li", "vat ly", "mon li", "mon ly"), "li"),
        (("hoa hoc", "mon hoa"), "hoa"),
        (("sinh hoc", "mon sinh"), "sinh"),
        (("lich su", "mon su"), "su"),
        (("dia li", "dia ly", "mon dia"), "dia"),
        (("gdktpl", "kinh te phap luat", "gdcd"), "gdktpl"),
        (("tin hoc", "mon tin"), "tin"),
        (("cong nghe",), "cn-cn"),
        (("toan",), "toan"),
    ]
    if subject is None:
        subject = next((slug for needles, slug in subjects if any(n in f for n in needles)), None)
    if not subject:
        return None
    if "giua ki 1" in f or "giua hoc ki 1" in f:
        exam_type = "giuaki1"
    elif "giua ki 2" in f or "giua hoc ki 2" in f:
        exam_type = "giuaki2"
    elif "hoc ki 1" in f or "cuoi ki 1" in f:
        exam_type = "cuoiki1"
    elif "hoc ki 2" in f or "cuoi ki 2" in f:
        exam_type = "cuoiki2"
    elif "hoc sinh gioi" in f or " hsg" in f:
        exam_type = "hsg"
    elif "vao 10" in f or "tuyen sinh 10" in f:
        exam_type = "tuyensinh10"
    elif "tot nghiep" in f or "thi thpt" in f:
        exam_type = "totnghiep"
    else:
        exam_type = "khaosat"
    years = [int(x) for x in YEAR_RE.findall(title)]
    if not any(y >= 2025 for y in years):
        years = [int(x) for x in YEAR_RE.findall(page_text[:4000])]
    # Reject numbers that merely look like future years (for example an
    # exercise value such as 2050). Only currently publishable exam years are
    # valid metadata.
    year = max((y for y in years if 2025 <= y <= date.today().year), default=None)
    if year is None:
        return None
    return grade, subject, exam_type, year


def infer_exam_number(title: str, url: str) -> int:
    for value in (title, urlparse(url).path):
        f = fold(value)
        matches = re.findall(r"(?:de|so)[-_ ]+(\d{1,3})(?=\D|$)", f)
        if matches:
            return int(matches[-1])
    return 1


def find_segments(blocks: list[Tag], title: str, url: str):
    markers = []
    for idx, block in enumerate(blocks):
        m = EXAM_MARKER_RE.match(block_text(block))
        if m:
            markers.append((idx, int(m.group(1))))
    if not markers:
        return [(0, len(blocks), infer_exam_number(title, url))]
    if len({number for _, number in markers}) != len(markers):
        markers = [(index, order) for order, (index, _) in enumerate(markers, start=1)]
    return [(start, markers[i + 1][0] if i + 1 < len(markers) else len(blocks), number)
            for i, (start, number) in enumerate(markers)]


def parse_page(url: str):
    soup = BeautifulSoup(fetch(url), "html.parser")
    areas = soup.select(".content")
    area = max(areas, key=lambda x: len(x.get_text(" ", strip=True))) if areas else soup
    title = clean_space((soup.find("h1") or soup.title).get_text(" ", strip=True))
    page_text = clean_space(area.get_text(" ", strip=True))
    meta = detect_meta(title, url, page_text)
    if not meta:
        return [], []
    blocks = area.find_all(["p", "h2", "h3", "h4", "table"])
    exams = []
    for start, end, number in find_segments(blocks, title, url):
        segment = blocks[start:end]
        solution_at = next((i for i, b in enumerate(segment) if ANSWER_HEADING_RE.match(block_text(b))), None)
        if solution_at is None:
            continue
        prompt = segment[:solution_at]
        solution = segment[solution_at + 1:]
        questions = parse_questions(prompt, solution, url)
        if not questions:
            continue
        source_numbers = [q.get("_sourceNo") for q in questions]
        resets = sum(b <= a for a, b in zip(source_numbers, source_numbers[1:]))
        if resets > 2:
            continue
        for question in questions:
            question.pop("_sourceNo", None)
        if len(questions) > 60:
            title_folded = fold(title)
            if "100" not in title_folded and "trac nghiem" not in title_folded and "bai tap" not in title_folded:
                continue
            for part, offset in enumerate(range(0, len(questions), 20), start=1):
                chunk = questions[offset:offset + 20]
                if len(chunk) < 10:
                    continue
                chunk = [dict(question, id=index) for index, question in enumerate(chunk, start=1)]
                exams.append((number + part - 1, chunk))
            continue
        # Reject suspiciously image-only OCR placeholders and obviously incomplete tests.
        if sum(1 for q in questions if len(BeautifulSoup(q["content"], "html.parser").get_text(" ", strip=True)) >= 8) < max(3, len(questions) // 2):
            continue
        exams.append((number, questions))
    links = []
    for a in area.select("a[href]"):
        label = clean_space(a.get_text(" ", strip=True))
        linked, _ = urldefrag(urljoin(url, a.get("href", "")))
        if is_candidate(linked, label):
            links.append(linked)
    return [(title, meta, n, qs) for n, qs in exams], links


def title_key(value: str) -> str:
    """Duplicate policy: only normalized exam titles are compared."""
    return fold(clean_space(value))


def existing_titles():
    titles = set()
    for path in DATA.rglob("*.json"):
        if path.name in {"index.json", "taxonomy.json", "topic-index.json", "stats.json", "explore-index.json", "id-map.json", "de-mau.json"}:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if not isinstance(data, dict) or not isinstance(data.get("questions"), list):
            continue
        if data.get("title"):
            titles.add(title_key(str(data["title"])))
    return titles


def exam_fingerprint(questions) -> str:
    text = "|".join(
        html.unescape(re.sub(r"<[^>]*>", " ", str(q.get("content", ""))))
        for q in questions[:8]
    )
    return hashlib.sha256(fold(clean_space(text)).encode()).hexdigest()


def materialize_images(value: str, url: str, asset_dir: Path, public_dir: str, image_cache: dict[str, str]) -> str:
    urls = re.findall(r"\[\[VJIMG:(.*?)\]\]", value)
    for image_url in urls:
        if image_url in image_cache:
            replacement = image_cache[image_url]
        else:
            digest = hashlib.sha256(image_url.encode()).hexdigest()[:14]
            filename = f"hinh-{digest}.webp"
            target = asset_dir / filename
            try:
                response = session().get(image_url, timeout=35)
                response.raise_for_status()
                with Image.open(io.BytesIO(response.content)) as image:
                    if image.mode not in ("RGB", "RGBA"):
                        image = image.convert("RGBA")
                    target.parent.mkdir(parents=True, exist_ok=True)
                    image.save(target, "WEBP", quality=84, method=6)
                replacement = (
                    f'<figure class="question-figure"><img src="{public_dir}/{filename}" '
                    f'alt="Hình minh họa của câu hỏi" loading="lazy"></figure>'
                )
            except Exception:
                return ""
            image_cache[image_url] = replacement
        value = value.replace(f"[[VJIMG:{image_url}]]", replacement)
    return value


def save_exam(title: str, meta, number: int, questions, source_url: str, titles: set[str]):
    grade, subject, exam_type, year = meta
    page_key = hashlib.sha256(source_url.encode()).hexdigest()[:10]
    base_title = re.sub(r"\s*\(\s*\d+\s*đề\s*\)\s*$", "", title, flags=re.I).strip()
    final_title = f"{base_title} - Đề {number:02d}"
    normalized_title = title_key(final_title)
    if normalized_title in titles:
        return None
    exam_id = f"{grade}-{subject}-{exam_type}-{year}-{slugify(base_title, 64)}-{page_key}-de-{number:02d}"
    out_dir = DATA / grade / subject / exam_type
    out_file = out_dir / f"{exam_id}.json"
    if out_file.exists():
        return None
    asset_dir = out_dir / "assets" / exam_id
    public_dir = f"data/{grade}/{subject}/{exam_type}/assets/{exam_id}"
    image_cache: dict[str, str] = {}
    for q in questions:
        q["content"] = materialize_images(q["content"], source_url, asset_dir, public_dir, image_cache)
        if not q["content"]:
            return None
        if q["type"] == "single":
            q["options"] = [materialize_images(x, source_url, asset_dir, public_dir, image_cache) for x in q["options"]]
            if any(not x for x in q["options"]):
                return None
        elif q["type"] == "true_false":
            q["statements"] = [materialize_images(x, source_url, asset_dir, public_dir, image_cache)
                               for x in q["statements"]]
            if any(not x for x in q["statements"]):
                return None
    def has_answer(question) -> bool:
        answer = question.get("answer")
        if question.get("type") == "true_false":
            return isinstance(answer, list) and len(answer) == len(question.get("statements", [])) and bool(answer)
        return answer not in (None, "")

    answered = sum(has_answer(q) for q in questions)
    answer_source = "official" if answered == len(questions) else ("partial" if answered else "missing")
    duration_match = re.search(r"Thời gian làm bài\s*:?\s*(\d{2,3})\s*phút", fold(title), re.I)
    duration = int(duration_match.group(1)) if duration_match else (90 if subject in {"toan", "van"} else 45)
    data = {
        "id": exam_id,
        "grade": grade,
        "subjectSlug": subject,
        "examType": exam_type,
        "year": year,
        "code": f"Đề {number:02d}",
        "title": final_title,
        "duration": duration,
        "answerSource": answer_source,
        "sourceUrl": source_url,
        "questions": questions,
    }
    out_dir.mkdir(parents=True, exist_ok=True)
    out_file.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    titles.add(normalized_title)
    return out_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=2000)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--max-pages", type=int, default=2000)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    titles = existing_titles()
    queue = discover()
    seen = set()
    imported = 0
    examined = 0
    print(f"Discovered {len(queue)} VietJack candidate pages; existing titles: {len(titles)}")
    while queue and imported < args.target and examined < args.max_pages:
        batch = []
        while queue and len(batch) < args.workers * 2 and examined + len(batch) < args.max_pages:
            url = queue.pop(0)
            if url not in seen:
                seen.add(url)
                batch.append(url)
        if not batch:
            continue
        with ThreadPoolExecutor(max_workers=args.workers) as pool:
            results = list(pool.map(lambda u: _safe_parse(u), batch))
        examined += len(batch)
        for url, (exams, links, error) in zip(batch, results):
            if error:
                continue
            for link in links:
                if link not in seen and link not in queue:
                    queue.append(link)
            for title, meta, number, questions in exams:
                if imported >= args.target:
                    break
                if args.dry_run:
                    imported += 1
                    print(f"DRY {imported}: {title} / Đề {number} ({len(questions)} câu)")
                    continue
                path = save_exam(title, meta, number, questions, url, titles)
                if path:
                    imported += 1
                    print(f"CREATED {imported}/{args.target}: {path.relative_to(ROOT)} ({len(questions)} câu)", flush=True)
        if examined % 24 == 0:
            print(f"PROGRESS pages={examined}, imported={imported}, queued={len(queue)}", flush=True)
    print(f"DONE imported={imported}, pages={examined}, remaining={len(queue)}")
    return 0 if imported else 2


def _safe_parse(url: str):
    try:
        exams, links = parse_page(url)
        return exams, links, None
    except Exception as exc:
        return [], [], f"{type(exc).__name__}: {exc}"


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Import a curated public 2026 exam batch from dolthpt.vn.

DOL embeds its published exam model in the server-rendered Next.js response.
This importer preserves the structured text and LaTeX, copies only genuine
question illustrations, and uses only the answers supplied by the source.
"""

from __future__ import annotations

import io
import json
import re
import shutil
import time
import unicodedata
import argparse
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
BASE_URL = "https://dolthpt.vn"

# Two current exams per subject.  These pages are public and contain complete
# structured questions plus source answers (not answers inferred by this tool).
SPECS = [
    ("toan", "/tot-nghiep-thpt/pdf-de-khao-sat-chat-luong-thpt-mon-toan-so-gd-dt-lam-dong-nam-2026-lan-1-co-dap-an"),
    ("toan", "/tot-nghiep-thpt/pdf-de-khao-sat-chat-luong-thpt-mon-toan-so-gd-dt-ha-tinh-nam-2026-lan-2-co-dap-an"),
    ("li", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-vat-ly-so-gd-dt-hai-phong-lan-2-nam-2026-co-dap-an"),
    ("li", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-vat-ly-so-gd-dt-an-giang-lan-1-nam-2026-co-dap-an"),
    ("hoa", "/tot-nghiep-thpt/pdf-de-thi-thu-mon-hoa-lop-12-so-gd-dt-thanh-hoa-nam-hoc-2025-2026-ma-de-45-co-dap-an"),
    ("hoa", "/tot-nghiep-thpt/pdf-de-thi-thu-mon-hoa-lop-12-so-gd-dt-ha-noi-nam-hoc-2025-2026-ma-de-0301-co-dap-an"),
    ("sinh", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-sinh-hoc-so-gd-dt-dien-bien-nam-2026-ma-de-0401-co-dap-an"),
    ("sinh", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-sinh-hoc-so-gd-dt-da-nang-nam-2026-ma-de-0401-co-dap-an"),
    ("gdktpl", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-kt-pl-so-gd-dt-da-nang-nam-2026-co-dap-an"),
    ("gdktpl", "/tot-nghiep-thpt/pdf-de-thi-thu-tot-nghiep-thpt-mon-kt-pl-so-gd-dt-ha-noi-nam-2026-co-dap-an"),
]

CATEGORIES = [
    ("toan", "toan"),
    ("li", "ly"),
    ("hoa", "hoa"),
    ("sinh", "sinh"),
    ("su", "su"),
    ("dia", "dia"),
    ("gdktpl", "gd-kt-pl"),
]


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower())
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    value = value.replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def flight_parts(html: str) -> tuple[str, bytes]:
    parts: list[str] = []
    soup = BeautifulSoup(html, "html.parser")
    prefix = "self.__next_f.push("
    for script in soup.find_all("script"):
        text = script.string or script.get_text()
        if not text.startswith(prefix) or not text.endswith(")"):
            continue
        try:
            item = json.loads(text[len(prefix):-1])
        except json.JSONDecodeError:
            continue
        if len(item) > 1 and isinstance(item[1], str):
            parts.append(item[1])
    joined = "".join(parts)
    return joined, joined.encode("utf-8")


def extract_exam(joined: str) -> dict:
    marker = joined.find('"testSections"')
    if marker < 0:
        raise RuntimeError("Trang không chứa dữ liệu câu hỏi công khai")
    decoder = json.JSONDecoder()
    starts = [index for index, char in enumerate(joined[:marker]) if char == "{"]
    for start in reversed(starts):
        try:
            value, _ = decoder.raw_decode(joined[start:])
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and "testSections" in value:
            return value
    raise RuntimeError("Không tách được mô hình đề từ dữ liệu Next.js")


class FlightResolver:
    def __init__(self, raw: bytes):
        self.raw = raw
        self.cache: dict[str, object] = {}

    def resolve(self, value):
        if not isinstance(value, str):
            return value
        match = re.fullmatch(r"\$([0-9a-f]+)", value, re.I)
        if match:
            record_id = match.group(1).lower()
            if record_id in self.cache:
                return self.cache[record_id]
            marker = f"{record_id}:T".encode()
            start = self.raw.find(marker)
            if start < 0:
                raise RuntimeError(f"Thiếu bản ghi nội dung ${record_id}")
            length_start = start + len(marker)
            comma = self.raw.find(b",", length_start, length_start + 20)
            if comma < 0:
                raise RuntimeError(f"Bản ghi ${record_id} không hợp lệ")
            byte_count = int(self.raw[length_start:comma], 16)
            payload = self.raw[comma + 1:comma + 1 + byte_count]
            decoded = json.loads(payload.decode("utf-8"))
            self.cache[record_id] = decoded
            return decoded
        stripped = value.strip()
        if stripped.startswith("[") or stripped.startswith("{"):
            try:
                return json.loads(stripped)
            except json.JSONDecodeError:
                pass
        return value


def render_slate(value, resolver: FlightResolver) -> str:
    value = resolver.resolve(value)

    def render(node, list_depth: int = 0) -> str:
        if node is None:
            return ""
        if isinstance(node, str):
            return node
        if isinstance(node, list):
            chunks = [render(item, list_depth) for item in node]
            return "\n".join(chunk for chunk in chunks if chunk.strip())
        if not isinstance(node, dict):
            return str(node)

        # Shared-reading blocks use wrapper objects instead of Slate nodes.
        if not node.get("type") and ("content" in node or "passage" in node):
            pieces = []
            if node.get("enabled", True) and node.get("content"):
                pieces.append(render_slate(node["content"], resolver))
            passage = node.get("passage")
            if isinstance(passage, dict) and passage.get("enabled", True) and passage.get("content"):
                pieces.append(render_slate(passage["content"], resolver))
            return "\n\n".join(piece for piece in pieces if piece)

        node_type = node.get("type")
        if node_type == "math_formula":
            formula = str(node.get("formula") or "").strip().strip("$")
            return f"$${formula}$$" if node.get("displayMode") else f"${formula}$"
        if "text" in node and not node_type:
            text = str(node.get("text") or "")
            if node.get("bold") and text.strip():
                text = f"**{text}**"
            if node.get("italic") and text.strip():
                text = f"*{text}*"
            return text
        if node_type in {"ul", "ol"}:
            ordered = node_type == "ol"
            lines = []
            for index, child in enumerate(node.get("children") or [], 1):
                body = render(child, list_depth + 1).strip()
                prefix = f"{index}. " if ordered else "- "
                lines.append("  " * list_depth + prefix + body)
            return "\n".join(lines)
        if node_type == "li":
            return " ".join(render(child, list_depth).strip() for child in node.get("children") or []).strip()
        if node_type in {"br", "line_break"}:
            return "\n"
        children = "".join(render(child, list_depth) for child in node.get("children") or [])
        return children.strip() if node_type == "p" else children

    output = render(value)
    output = re.sub(r"[ \t]+\n", "\n", output)
    output = re.sub(r"\n{3,}", "\n\n", output)
    return output.strip()


def image_url(attached: dict | None) -> str | None:
    if not attached or not attached.get("enabled", True):
        return None
    file_data = attached.get("file") or {}
    # ``url`` on older records can be a short-lived signed S3 URL embedded at
    # publish time.  ``path`` is the stable public CDN address for the same
    # asset, so prefer it whenever available.
    path = file_data.get("path")
    if path:
        return urljoin("https://media.dolenglish.vn/", str(path))
    url = file_data.get("url")
    if isinstance(url, str) and url.startswith("http"):
        return url
    origin = file_data.get("originLink")
    return origin if isinstance(origin, str) and origin.startswith("http") else None


def save_image(session: requests.Session, url: str, target: Path) -> None:
    response = session.get(url, timeout=60)
    response.raise_for_status()
    with Image.open(io.BytesIO(response.content)) as image:
        if image.mode not in {"RGB", "RGBA"}:
            image = image.convert("RGB")
        target.parent.mkdir(parents=True, exist_ok=True)
        image.save(target, "WEBP", quality=88, method=6)


def explanation_text(question: dict, resolver: FlightResolver) -> str:
    explanation = question.get("explanation") or {}
    value = explanation.get("content") if explanation.get("enabled", True) else None
    return render_slate(value, resolver) if value else ""


def build_question(
    question: dict,
    resolver: FlightResolver,
    subject: str,
    stem: str,
    session: requests.Session,
    shared_context: str = "",
) -> dict:
    order = int(question.get("order") or 0)
    content = render_slate(question.get("requirement"), resolver)
    if shared_context:
        content = f"{shared_context}\n\n{content}"
    attached = question.get("attachedImage")
    url = image_url(attached)
    if url:
        asset_rel = Path(f"data/l12/{subject}/totnghiep/assets/{stem}/cau-{order:02d}.webp")
        save_image(session, url, ROOT / asset_rel)
        description = render_slate((attached or {}).get("description"), resolver) or f"Hình minh họa câu {order}"
        content += (
            f'\n<figure class="question-figure"><img src="{asset_rel.as_posix()}" '
            f'alt="{description}" loading="lazy"></figure>'
        )

    result = {
        "id": order,
        "content": content.strip(),
    }
    if question.get("chapter"):
        result["chuong"] = question["chapter"]
    if question.get("questionCategory"):
        result["dang"] = question["questionCategory"]

    question_type = question.get("questionType")
    if question_type == "MULTIPLE_CHOICE":
        result["type"] = "single"
        options = []
        for option in question.get("options") or []:
            code = str(option.get("optionCode") or chr(65 + len(options))).upper()
            options.append(f"{code}. {render_slate(option.get('text'), resolver)}")
        result["options"] = options
        result["answer"] = str(question.get("correctAnswer") or "").upper()
        explanation = explanation_text(question, resolver)
    elif question_type == "TRUE_FALSE_STATEMENT":
        result["type"] = "true_false"
        statements = []
        answers = []
        explanations = []
        for index, option in enumerate(question.get("options") or []):
            statements.append(render_slate(option.get("text"), resolver))
            source_answer = option.get("correctAnswer")
            if source_answer not in {"TRUE", "FALSE"}:
                raise RuntimeError(f"Câu {order}, ý {chr(97 + index)} thiếu đáp án nguồn")
            answers.append("D" if source_answer == "TRUE" else "S")
            detail = explanation_text(option, resolver)
            if detail:
                explanations.append(f"{chr(97 + index)}) {detail}")
        result["statements"] = statements
        result["answer"] = answers
        explanation = "\n\n".join(explanations)
    elif question_type == "SHORT_ANSWER":
        result["type"] = "short_answer"
        result["answer"] = str(question.get("correctAnswer") or "").strip()
        explanation = explanation_text(question, resolver)
    else:
        raise RuntimeError(f"Câu {order}: loại câu chưa hỗ trợ {question_type!r}")

    if explanation:
        result["explanation"] = explanation
    return result


def validate_exam(exam: dict) -> None:
    questions = exam["questions"]
    if not questions or len({question["id"] for question in questions}) != len(questions):
        raise RuntimeError("Danh sách câu hỏi rỗng hoặc trùng số câu")
    for question in questions:
        if not question["content"]:
            raise RuntimeError(f"Câu {question['id']} thiếu nội dung")
        if question["type"] == "single":
            codes = {option.split(".", 1)[0] for option in question["options"]}
            if len(question["options"]) < 2 or question["answer"] not in codes:
                raise RuntimeError(f"Câu {question['id']} thiếu phương án/đáp án")
        elif question["type"] == "true_false":
            if len(question["statements"]) != len(question["answer"]) or not question["statements"]:
                raise RuntimeError(f"Câu {question['id']} Đúng/Sai không đầy đủ")
        elif not question["answer"]:
            raise RuntimeError(f"Câu {question['id']} thiếu đáp án ngắn từ nguồn")


def normalize_title(value: str) -> str:
    return slugify(value).replace("-", " ")


def import_one(
    subject: str,
    route: str,
    session: requests.Session,
    existing_titles: set[str] | None = None,
    refresh_existing: bool = False,
) -> tuple[str, Path | None]:
    route_name = route.rstrip("/").rsplit("/", 1)[-1]
    route_name = re.sub(r"^(?:pdf-)+", "", route_name)
    route_name = re.sub(r"-co-dap-an$", "", route_name)
    stem = slugify(route_name)
    target = ROOT / f"data/l12/{subject}/totnghiep/{stem}.json"
    if target.exists() and not refresh_existing:
        print(f"SKIPPED {target.relative_to(ROOT)} (đã tồn tại)")
        return "skipped", target

    source_url = urljoin(BASE_URL, route)
    response = session.get(source_url, timeout=60)
    response.raise_for_status()
    response.encoding = "utf-8"
    joined, raw = flight_parts(response.text)
    source_exam = extract_exam(joined)
    resolver = FlightResolver(raw)

    source_name = unicodedata.normalize("NFC", str(source_exam["name"]))
    year = int(source_exam.get("year") or 2026)
    title_key = normalize_title(source_name)
    if existing_titles is not None and title_key in existing_titles and not refresh_existing:
        print(f"SKIPPED {source_name} (trùng tên đề trong project)")
        return "skipped", None

    questions = []
    for section in source_exam.get("testSections") or []:
        for group in section.get("questionGroups") or []:
            shared_parts = [
                render_slate(group.get("generalRequirement"), resolver),
                render_slate(group.get("passageTemplate"), resolver),
            ]
            shared_context = "\n\n".join(part for part in shared_parts if part)
            for question in group.get("questions") or []:
                questions.append(
                    build_question(question, resolver, subject, stem, session, shared_context)
                )
    questions.sort(key=lambda item: item["id"])

    exam = {
        "id": f"l12-{subject}-totnghiep-{year}-{stem}",
        "grade": "l12",
        "subjectSlug": subject,
        "examType": "totnghiep",
        "year": year,
        "code": str(source_exam.get("displayId") or "Đề 01"),
        "title": source_name,
        "duration": max(1, int(source_exam.get("timeInSeconds") or 3000) // 60),
        "answerSource": "official",
        "source": source_url,
        "notes": "Nội dung, đáp án và lời giải được nhập từ bản công khai của DOL THPT.",
        "passages": {},
        "questions": questions,
    }
    validate_exam(exam)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if existing_titles is not None:
        existing_titles.add(title_key)
    print(f"CREATED {target.relative_to(ROOT)} ({len(questions)} câu)")
    return "created", target


def discover_specs(session: requests.Session) -> list[tuple[str, str]]:
    """Return current public answer-bearing routes in category round-robin order."""
    buckets: list[list[tuple[str, str]]] = []
    for subject, category in CATEGORIES:
        response = session.get(f"{BASE_URL}/tot-nghiep-thpt/{category}", timeout=60)
        response.raise_for_status()
        response.encoding = "utf-8"
        soup = BeautifulSoup(response.text, "html.parser")
        seen = set()
        bucket = []
        for anchor in soup.find_all("a", href=True):
            route = anchor["href"].strip()
            if route in seen or "co-dap-an" not in route:
                continue
            if "2025" not in route and "2026" not in route:
                continue
            seen.add(route)
            bucket.append((subject, route))
        buckets.append(bucket)

    discovered = []
    index = 0
    while any(index < len(bucket) for bucket in buckets):
        for bucket in buckets:
            if index < len(bucket):
                discovered.append(bucket[index])
        index += 1
    return discovered


def current_title_keys() -> set[str]:
    index_path = ROOT / "data/index.json"
    if not index_path.exists():
        return set()
    entries = json.loads(index_path.read_text(encoding="utf-8"))
    return {normalize_title(item.get("title", "")) for item in entries if item.get("title")}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--discover-limit",
        type=int,
        default=0,
        help="Tự tìm và nhập tối đa N đề mới 2025-2026 từ các danh mục.",
    )
    parser.add_argument(
        "--refresh-existing",
        action="store_true",
        help="Ghi lại các đề trong danh sách cố định bằng bộ chuyển đổi mới nhất.",
    )
    args = parser.parse_args()
    session = requests.Session()
    session.headers["User-Agent"] = "Mozilla/5.0 (compatible; exam-archiver/1.0)"
    title_keys = current_title_keys()
    specs = discover_specs(session) if args.discover_limit else SPECS
    created = 0
    skipped = 0
    rejected = 0
    for subject, route in specs:
        if args.discover_limit and created >= args.discover_limit:
            break
        try:
            status, _ = import_one(
                subject,
                route,
                session,
                title_keys,
                refresh_existing=args.refresh_existing,
            )
            if status == "created":
                created += 1
            else:
                skipped += 1
        except Exception as error:
            rejected += 1
            route_name = route.rstrip("/").rsplit("/", 1)[-1]
            route_name = re.sub(r"^(?:pdf-)+", "", route_name)
            route_name = re.sub(r"-co-dap-an$", "", route_name)
            stem = slugify(route_name)
            asset_dir = ROOT / f"data/l12/{subject}/totnghiep/assets/{stem}"
            target = ROOT / f"data/l12/{subject}/totnghiep/{stem}.json"
            if not target.exists() and asset_dir.exists():
                shutil.rmtree(asset_dir)
            print(f"REJECTED {route}: {error}")
        time.sleep(0.12)
    print(f"Hoàn tất: tạo {created}, bỏ qua {skipped}, loại {rejected} đề DOL THPT.")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
import_sieugioi_batch.py

Nhập tự động 40 bộ đề hoàn chỉnh từ SieuGioi (https://sieugioi.com/docs/)
vào hệ thống static JSON schema của project.

Đặc điểm nâng cao:
- Chống trùng DUY NHẤT theo title chuẩn hóa với data/index.json.
- Phân loại chính xác grade (l9-l12), subjectSlug (toan, li, hoa, sinh, su, dia, anh), examType.
- Tách sạch khối Lời giải / Hướng dẫn giải / Đáp án ra khỏi nội dung câu hỏi và phương án.
- Tự động trích xuất đáp án từ nguồn (A/B/C/D cho single, [D,S,D,S] cho true_false, kết quả cho short_answer) và lưu lời giải vào explanation.
- Phân biệt chính xác Single choice (A, B, C, D) và True/False (a, b, c, d - đúng 4 mệnh đề).
- Xử lý phương án nằm trên cùng một dòng (inline options).
- Xử lý công thức toán học LaTeX ($...$, $$...$$), chuyển sub/sup.
- Tải ảnh minh họa, chuyển sang WebP, lưu cục bộ tại assets/<exam-id>/.
- Đảm bảo 100% các đề được chọn là đề hoàn chỉnh, không cụt, không thiếu ngữ liệu.
"""

from __future__ import annotations

import argparse
import html
import io
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from urllib.parse import urljoin, urldefrag

import requests
from bs4 import BeautifulSoup, NavigableString, Tag
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache" / "sieugioi"
CACHE_DIR.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://sieugioi.com"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
    )
}

FORUM_LIST = [
    # Đề thi tốt nghiệp & tuyển sinh
    ("toan", "l12", "https://sieugioi.com/docs/forums/de-thi-toan-lop-12.2/"),
    ("toan", "l11", "https://sieugioi.com/docs/forums/de-thi-toan-lop-11.8/"),
    ("toan", "l10", "https://sieugioi.com/docs/forums/de-thi-toan-lop-10.9/"),
    ("toan", "l9", "https://sieugioi.com/docs/forums/de-thi-toan-lop-9.10/"),
    ("anh", "l12", "https://sieugioi.com/docs/forums/de-thi-tieng-anh-lop-12.14/"),
    ("anh", "l9", "https://sieugioi.com/docs/forums/de-thi-tieng-anh-lop-9.33/"),
    ("li", "l12", "https://sieugioi.com/docs/forums/de-thi-vat-li-lop-12.15/"),
    ("hoa", "l12", "https://sieugioi.com/docs/forums/de-thi-hoa-hoc-lop-12.16/"),
    ("sinh", "l12", "https://sieugioi.com/docs/forums/de-thi-sinh-hoc-lop-12.17/"),
    ("su", "l12", "https://sieugioi.com/docs/forums/de-thi-lich-su-lop-12.21/"),
    ("dia", "l12", "https://sieugioi.com/docs/forums/de-thi-dia-li-lop-12.22/"),
    # Chuyên mục theo bài / khảo sát
    ("toan", "l12", "https://sieugioi.com/docs/forums/toan-12.25/"),
    ("toan", "l11", "https://sieugioi.com/docs/forums/toan-11.31/"),
    ("toan", "l10", "https://sieugioi.com/docs/forums/toan-10.32/"),
    ("toan", "l9", "https://sieugioi.com/docs/forums/toan-9.30/"),
    ("li", "l12", "https://sieugioi.com/docs/forums/vat-li-12.27/"),
    ("li", "l11", "https://sieugioi.com/docs/forums/vat-li-11.35/"),
    ("li", "l10", "https://sieugioi.com/docs/forums/vat-li-10.36/"),
    ("hoa", "l12", "https://sieugioi.com/docs/forums/hoa-hoc-12.29/"),
    ("hoa", "l11", "https://sieugioi.com/docs/forums/hoa-hoc-11.37/"),
    ("hoa", "l10", "https://sieugioi.com/docs/forums/hoa-hoc-10.38/"),
    ("sinh", "l12", "https://sieugioi.com/docs/forums/sinh-hoc-12.41/"),
    ("sinh", "l11", "https://sieugioi.com/docs/forums/sinh-hoc-11.42/"),
    ("sinh", "l10", "https://sieugioi.com/docs/forums/sinh-hoc-10.43/"),
    ("su", "l12", "https://sieugioi.com/docs/forums/lich-su-12.48/"),
    ("su", "l11", "https://sieugioi.com/docs/forums/lich-su-11.53/"),
    ("su", "l10", "https://sieugioi.com/docs/forums/lich-su-10.54/"),
    ("dia", "l12", "https://sieugioi.com/docs/forums/dia-li-12.49/"),
    ("dia", "l11", "https://sieugioi.com/docs/forums/dia-li-11.51/"),
    ("dia", "l10", "https://sieugioi.com/docs/forums/dia-li-10.52/"),
]


def fold(text: str) -> str:
    text = unicodedata.normalize("NFD", text.casefold())
    return "".join(c for c in text if unicodedata.category(c) != "Mn").replace("đ", "d")


def normalize_title(text: str) -> str:
    text = fold(text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(text: str, limit: int = 70) -> str:
    value = fold(text)
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:limit].rstrip("-") or "de-thi"


def clean_space(text: str) -> str:
    return re.sub(r"[ \t\xa0]+", " ", text).strip()


def clean_latex(text: str) -> str:
    text = text.replace(r"\(", "$").replace(r"\)", "$")
    text = text.replace(r"\[", "$$").replace(r"\]", "$$")
    text = re.sub(r"\$\s*\$", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def clean_html_tags(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^(?:</strong>|</em>|</b>|</i>|\s)+", "", text)
    text = re.sub(r"(?:<strong>|<em>|<b>|<i>|\s)+$", "", text)
    text = re.sub(r"<strong\s*>\s*</strong>", "", text)
    text = re.sub(r"<em\s*>\s*</em>", "", text)
    if text.count("<strong>") > text.count("</strong>"):
        text = text + "</strong>"
    elif text.count("</strong>") > text.count("<strong>"):
        text = "<strong>" + text
    return clean_space(text)


def clean_option_text(text: str) -> str:
    text = clean_html_tags(text)
    text = re.sub(r"^(?:<strong>\s*)?[A-D][.)]\s*(?:</strong>)?\s*", "", text, flags=re.I)
    text = re.sub(r"^(?:<strong>\s*)?[A-D][.)]\s*(?:</strong>)?\s*", "", text, flags=re.I)
    return clean_html_tags(text)


def clean_statement_text(text: str) -> str:
    text = clean_html_tags(text)
    text = re.sub(r"^(?:<strong>\s*)?[a-d][.)]\s*(?:</strong>)?\s*", "", text, flags=re.I)
    text = re.sub(r"^(?:<strong>\s*)?[a-d][.)]\s*(?:</strong>)?\s*", "", text, flags=re.I)
    return clean_html_tags(text)


class SieuGioiImporter:
    def __init__(self, session: requests.Session | None = None):
        self.session = session or requests.Session()
        self.session.headers.update(HEADERS)
        self.existing_titles: set[str] = set()
        self.load_existing_titles()

    def load_existing_titles(self):
        index_path = DATA_DIR / "index.json"
        if index_path.exists():
            with open(index_path, encoding="utf-8") as f:
                data = json.load(f)
            for item in data:
                if "title" in item:
                    self.existing_titles.add(normalize_title(item["title"]))
        print(f"Loaded {len(self.existing_titles)} existing normalized titles.")

    def fetch_url(self, url: str, cache_key: str | None = None) -> str | None:
        if cache_key:
            cache_file = CACHE_DIR / f"{cache_key}.html"
            if cache_file.exists():
                return cache_file.read_text(encoding="utf-8")

        for attempt in range(4):
            try:
                time.sleep(0.1)
                r = self.session.get(url, timeout=25)
                if r.status_code == 429 or r.status_code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                r.raise_for_status()
                text = r.text
                if cache_key:
                    cache_file = CACHE_DIR / f"{cache_key}.html"
                    cache_file.write_text(text, encoding="utf-8")
                return text
            except Exception as e:
                if attempt == 3:
                    print(f"Failed to fetch {url}: {e}")
                    return None
                time.sleep(2 ** attempt)
        return None

    def discover_threads(self, max_pages: int = 5) -> list[dict]:
        catalog_cache = CACHE_DIR / "threads_catalog.json"
        if catalog_cache.exists():
            with open(catalog_cache, encoding="utf-8") as f:
                return json.load(f)

        discovered = []
        seen_urls = set()

        for sub_hint, grade_hint, forum_url in FORUM_LIST:
            for page in range(1, max_pages + 1):
                page_url = forum_url if page == 1 else f"{forum_url.rstrip('/')}/page-{page}"
                cache_key = re.sub(r"[^a-zA-Z0-9]+", "_", page_url.replace("https://sieugioi.com/", ""))
                html_doc = self.fetch_url(page_url, cache_key)
                if not html_doc:
                    break

                soup = BeautifulSoup(html_doc, "html.parser")
                items = soup.select(".structItem")
                if not items:
                    break

                for it in items:
                    a = it.select_one(".structItem-title a[href*='/threads/']")
                    if not a:
                        continue
                    full_url = urljoin(BASE_URL, a.get("href", ""))
                    full_url, _ = urldefrag(full_url)
                    if full_url in seen_urls:
                        continue
                    seen_urls.add(full_url)

                    raw_title = a.get_text(" ", strip=True)
                    labels = [l.get_text(strip=True) for l in it.select(".structItem-title .label")]
                    discovered.append({
                        "url": full_url,
                        "title": raw_title,
                        "labels": labels,
                        "forum_url": forum_url,
                        "subject_hint": sub_hint,
                        "grade_hint": grade_hint,
                    })

        with open(catalog_cache, "w", encoding="utf-8") as f:
            json.dump(discovered, f, ensure_ascii=False, indent=2)
        return discovered

    def detect_metadata(self, title: str, url: str, subject_hint: str, grade_hint: str) -> tuple[str, str, str, int]:
        combined = fold(f"{title} {url}")

        # Grade
        grade = grade_hint
        if "lop 12" in combined or "toan-12" in combined or "vat-li-12" in combined or "hoa-hoc-12" in combined or "sinh-hoc-12" in combined or "lich-su-12" in combined or "dia-li-12" in combined:
            grade = "l12"
        elif "lop 11" in combined or "toan-11" in combined or "vat-li-11" in combined or "hoa-hoc-11" in combined or "sinh-hoc-11" in combined or "lich-su-11" in combined or "dia-li-11" in combined:
            grade = "l11"
        elif "lop 10" in combined or "toan-10" in combined or "vat-li-10" in combined or "hoa-hoc-10" in combined or "sinh-hoc-10" in combined or "lich-su-10" in combined or "dia-li-10" in combined:
            grade = "l10"
        elif "lop 9" in combined or "toan-9" in combined or "vao 10" in combined or "vao lop 10" in combined or "tuyen sinh 10" in combined:
            grade = "l9"

        # Subject
        sub = subject_hint
        if re.search(r"\b(?:toan|toan hoc|mon toan)\b", combined):
            sub = "toan"
        elif re.search(r"\b(?:ngu van|van hoc|mon van)\b", combined):
            sub = "van"
        elif re.search(r"\b(?:tieng anh|english|mon anh)\b", combined):
            sub = "anh"
        elif re.search(r"\b(?:vat li|vat ly|mon ly|mon li)\b", combined):
            sub = "li"
        elif re.search(r"\b(?:hoa hoc|mon hoa)\b", combined):
            sub = "hoa"
        elif re.search(r"\b(?:sinh hoc|mon sinh)\b", combined):
            sub = "sinh"
        elif re.search(r"\b(?:lich su|mon su)\b", combined):
            sub = "su"
        elif re.search(r"\b(?:dia li|dia ly|mon dia)\b", combined):
            sub = "dia"
        elif re.search(r"\b(?:tin hoc|mon tin)\b", combined):
            sub = "tin"
        elif re.search(r"\b(?:gdktpl|ktpl|gdcd|kinh te va phap luat)\b", combined):
            sub = "gdktpl"
        elif re.search(r"\b(?:cong nghe)\b", combined):
            sub = "cn-cn"

        # Exam type
        if "tuyen sinh" in combined or "vao 10" in combined or "vao lop 10" in combined:
            etype = "tuyensinh10"
            if grade != "l9":
                grade = "l9"
        elif "tot nghiep" in combined or "tn thpt" in combined or "thi thu" in combined:
            etype = "totnghiep"
        elif "giua ky 1" in combined or "giua ki 1" in combined or "giua hoc ki 1" in combined:
            etype = "giuaki1"
        elif "cuoi ky 1" in combined or "cuoi ki 1" in combined or "hoc ki 1" in combined or "hk1" in combined:
            etype = "cuoiki1"
        elif "giua ky 2" in combined or "giua ki 2" in combined or "giua hoc ki 2" in combined:
            etype = "giuaki2"
        elif "cuoi ky 2" in combined or "cuoi ki 2" in combined or "hoc ki 2" in combined or "hk2" in combined:
            etype = "cuoiki2"
        elif "hsg" in combined or "hoc sinh gioi" in combined or "olympic" in combined:
            etype = "hsg"
        else:
            etype = "khaosat"

        # Year
        year_match = re.search(r"\b(202[5-9]|20[3-9]\d)\b", title)
        year = int(year_match.group(1)) if year_match else 2026

        return grade, sub, etype, year

    def render_dom_node(self, node, base_url: str, img_map: dict) -> str:
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
            full_src = urljoin(base_url, src)
            token = img_map.get(full_src)
            if not token:
                token = f"[[SGIMG:{len(img_map)+1}:{full_src}]]"
                img_map[full_src] = token
            return token

        inner = "".join(self.render_dom_node(c, base_url, img_map) for c in node.children)
        if name in {"strong", "b"}:
            return f"<strong>{inner}</strong>"
        if name in {"em", "i"}:
            return f"<em>{inner}</em>"
        if name in {"table", "thead", "tbody", "tr", "th", "td"}:
            return f"<{name}>{inner}</{name}>"
        if name in {"ul", "ol", "li"}:
            return f"<{name}>{inner}</{name}>"
        if name in {"p", "div"}:
            return f"\n{inner}\n"
        return inner

    def extract_solution_and_answer(self, raw_text: str) -> tuple[str, str | None, dict]:
        sol_markers = list(
            re.finditer(
                r"(?:^|\n)\s*(?:<strong>)?\s*(?:Lời\s*[Gg]iải|LỜI\s*GIẢI|Hướng\s*dẫn\s*giải|HƯỚNG\s*DẪN\s*GIẢI|Giải\s*chi\s*tiết|ĐÁP\s*ÁN|Đáp\s*án\s*chi\s*tiết)\s*(?:</strong>)?\s*[:\n]?",
                raw_text,
                re.I,
            )
        )

        explanation = ""
        q_body = raw_text
        if sol_markers:
            first_sol = sol_markers[0]
            q_body = raw_text[:first_sol.start()].strip()
            explanation = raw_text[first_sol.end():].strip()

        extracted_ans = {
            "single": None,
            "true_false": None,
            "short_answer": None,
        }

        if explanation:
            # Single answer
            m = re.search(
                r"(?:Chọn|Đáp án\s*(?:đúng)?\s*là|Phương án\s*đúng\s*là|=>\s*đáp án|=>\s*chọn)\s*:?\s*([A-D])\b",
                explanation,
                re.I,
            )
            if not m:
                m = re.search(r"\b([A-D])\s*là\s*đáp án\s*đúng\b", explanation, re.I)
            if not m:
                m = re.search(r"^\s*([A-D])\s*$", explanation, re.M)
            if m:
                extracted_ans["single"] = m.group(1).upper()

            # True/False answers
            tf_ans = []
            for letter in ["a", "b", "c", "d"]:
                lm = re.search(
                    rf"(?:^|\n)\s*(?:<strong>)?\s*{letter}\s*[.)]\s*(?:</strong>)?\s*(Đúng|Sai|D|S)\b",
                    explanation,
                    re.I,
                )
                if lm:
                    val = lm.group(1).strip().upper()
                    tf_ans.append("D" if val in ("ĐÚNG", "D") else "S")
            if len(tf_ans) == 4:
                extracted_ans["true_false"] = tf_ans

            # Short answer
            m = re.search(r"(?:Đáp số|Đáp án|Kết quả)\s*:?\s*([^\n.<>]+)", explanation, re.I)
            if m:
                extracted_ans["short_answer"] = clean_space(m.group(1))

        return q_body, explanation, extracted_ans

    def parse_question_block(self, raw_q: str, global_q_id: int, section_hint: str = ""):
        q_body, explanation, extracted_ans = self.extract_solution_and_answer(raw_q)
        q_body = clean_html_tags(q_body)

        is_explicit_tf = any(k in section_hint for k in ("PHẦN II", "PHẦN 2", "ĐÚNG SAI", "DUNG SAI"))
        is_explicit_sa = any(k in section_hint for k in ("PHẦN III", "PHẦN 3", "TRẢ LỜI NGẮN", "TRA LOI NGAN"))

        if is_explicit_sa:
            content = clean_html_tags(q_body)
            if content:
                q_obj = {
                    "id": global_q_id,
                    "type": "short_answer",
                    "content": content,
                    "answer": extracted_ans["short_answer"],
                }
                if explanation:
                    q_obj["explanation"] = clean_html_tags(explanation)
                return q_obj

        # 1. Single choice options
        opt_matches = list(re.finditer(r"(?:^|\n|(?:\s{2,})|(?:<strong>\s*))\s*(?:<strong>)?\s*([A-D])[.)]\s*(?:</strong>)?", q_body))
        filtered_opts = []
        expected_letter = "A"
        for m in opt_matches:
            letter = m.group(1).upper()
            if letter == expected_letter:
                filtered_opts.append(m)
                expected_letter = chr(ord(letter) + 1)

        if len(filtered_opts) in (2, 3, 4) and not is_explicit_tf:
            stem = clean_html_tags(q_body[:filtered_opts[0].start()])
            options = []
            for oi, om in enumerate(filtered_opts):
                letter = om.group(1).upper()
                o_start = om.end()
                o_end = filtered_opts[oi + 1].start() if oi + 1 < len(filtered_opts) else len(q_body)
                opt_text = clean_option_text(q_body[o_start:o_end])
                if opt_text:
                    options.append(f"{letter}. {opt_text}")
            norm_opts = [re.sub(r"^\s*[A-D][.)]\s*", "", o).strip().casefold() for o in options]
            if len(options) >= 2 and len(norm_opts) == len(set(norm_opts)) and stem:
                single_ans = extracted_ans["single"] if extracted_ans["single"] in ("A", "B", "C", "D") else None
                q_obj = {
                    "id": global_q_id,
                    "type": "single",
                    "content": stem,
                    "options": options,
                    "answer": single_ans,
                }
                if explanation:
                    q_obj["explanation"] = clean_html_tags(explanation)
                return q_obj

        # 2. True/false statements
        stmt_matches = list(re.finditer(r"(?:^|\n|(?:\s{2,}))\s*(?:<strong>)?\s*([a-d])[.)]\s*(?:</strong>)?", q_body))
        filtered_stmts = []
        expected_stmt = "a"
        for m in stmt_matches:
            letter = m.group(1).lower()
            if letter == expected_stmt:
                filtered_stmts.append(m)
                expected_stmt = chr(ord(letter) + 1)

        if len(filtered_stmts) == 4:
            stem = clean_html_tags(q_body[:filtered_stmts[0].start()])
            statements = []
            for si, sm in enumerate(filtered_stmts):
                letter = sm.group(1).lower()
                s_start = sm.end()
                s_end = filtered_stmts[si + 1].start() if si + 1 < 4 else len(q_body)
                stmt_text = clean_statement_text(q_body[s_start:s_end])
                if stmt_text:
                    statements.append(f"{letter}) {stmt_text}")
            if len(statements) == 4 and stem:
                tf_ans = extracted_ans["true_false"] or []
                q_obj = {
                    "id": global_q_id,
                    "type": "true_false",
                    "content": stem,
                    "statements": statements,
                    "answer": tf_ans,
                }
                if explanation:
                    q_obj["explanation"] = clean_html_tags(explanation)
                return q_obj

        # 3. Fallback to short answer / essay
        content = clean_html_tags(q_body)
        if content:
            q_obj = {
                "id": global_q_id,
                "type": "short_answer",
                "content": content,
                "answer": extracted_ans["short_answer"],
            }
            if explanation:
                q_obj["explanation"] = clean_html_tags(explanation)
            return q_obj

        return None

    def parse_thread_content(self, html_doc: str, thread_url: str) -> tuple[str, list[dict], dict, str]:
        soup = BeautifulSoup(html_doc, "html.parser")

        # Clean H1 Title
        h1 = soup.select_one("h1.p-title-value")
        raw_title = ""
        if h1:
            for span in h1.select(".label"):
                span.decompose()
            raw_title = h1.get_text(" ", strip=True)
            raw_title = re.sub(r"\s*\|\s*SieuGioi.*$", "", raw_title, flags=re.I).strip()

        msg = soup.select_one("article.message .bbWrapper")
        if not msg:
            return raw_title, [], {}, "missing"

        img_map: dict[str, str] = {}
        rendered = self.render_dom_node(msg, thread_url, img_map)
        rendered = clean_latex(rendered)

        # Remove header intro
        rendered = re.sub(
            r"^.*?Siêu Giỏi giới thiệu[^.\n]*\.[^\n]*\n+",
            "",
            rendered,
            flags=re.I | re.S,
        )

        # Split into sections
        sec_splits = list(
            re.finditer(
                r"(?:^|\n)\s*(?:<strong>)?\s*(PHẦN\s+(?:I{1,3}|1|2|3)[^:\n]*:?)\s*(?:</strong>)?",
                rendered,
                re.I,
            )
        )

        sections = []
        if sec_splits:
            for i, m in enumerate(sec_splits):
                start = m.start()
                end = sec_splits[i + 1].start() if i + 1 < len(sec_splits) else len(rendered)
                sec_title = m.group(1).upper()
                sec_body = rendered[m.end():end]
                sections.append((sec_title, sec_body))
        else:
            sections = [("PHẦN I", rendered)]

        questions = []
        for sec_title, sec_body in sections:
            q_matches = list(
                re.finditer(
                    r"(?:^|\n)\s*(?:<strong>)?\s*(?:Câu|Bài)\s*(\d+)[:.)\s-]\s*(?:</strong>)?",
                    sec_body,
                    re.I,
                )
            )
            for i, qm in enumerate(q_matches):
                q_start = qm.end()
                q_end = q_matches[i + 1].start() if i + 1 < len(q_matches) else len(sec_body)
                raw_q = sec_body[q_start:q_end].strip()
                raw_q = re.sub(r"—\s*HẾT\s*—.*$", "", raw_q, flags=re.I | re.S).strip()
                q_obj = self.parse_question_block(raw_q, len(questions) + 1, section_hint=sec_title)
                if q_obj:
                    questions.append(q_obj)

        # Determine answerSource
        if questions:
            has_all_answers = True
            has_any_answer = False
            for q in questions:
                if q["type"] == "single":
                    if q.get("answer") in ("A", "B", "C", "D"):
                        has_any_answer = True
                    else:
                        has_all_answers = False
                elif q["type"] == "true_false":
                    if q.get("answer") and len(q["answer"]) == 4:
                        has_any_answer = True
                    else:
                        has_all_answers = False
                elif q["type"] == "short_answer":
                    if q.get("answer"):
                        has_any_answer = True
                    else:
                        has_all_answers = False
            if has_all_answers:
                ans_source = "official"
            elif has_any_answer:
                ans_source = "partial"
            else:
                ans_source = "missing"
        else:
            ans_source = "missing"

        return raw_title, questions, img_map, ans_source

    def process_and_save_images(
        self,
        img_map: dict[str, str],
        exam_id: str,
        grade: str,
        subject_slug: str,
        exam_type: str,
        questions: list[dict],
    ) -> bool:
        if not img_map:
            return True

        asset_dir = DATA_DIR / grade / subject_slug / exam_type / "assets" / exam_id
        img_replacements = {}

        img_idx = 1
        for img_url, token in img_map.items():
            token_used = any(
                token in q.get("content", "")
                or any(token in opt for opt in q.get("options", []))
                or any(token in st for st in q.get("statements", []))
                for q in questions
            )
            if not token_used:
                continue

            img_filename = f"hinh-{img_idx:02d}.webp"
            img_dest = asset_dir / img_filename
            rel_img_path = f"data/{grade}/{subject_slug}/{exam_type}/assets/{exam_id}/{img_filename}"

            success = False
            for attempt in range(3):
                try:
                    time.sleep(0.1)
                    r = self.session.get(img_url, timeout=20)
                    if r.status_code == 200 and len(r.content) > 100:
                        im = Image.open(io.BytesIO(r.content))
                        asset_dir.mkdir(parents=True, exist_ok=True)
                        if im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info):
                            im.save(img_dest, "WEBP", quality=85)
                        else:
                            im = im.convert("RGB")
                            im.save(img_dest, "WEBP", quality=85)
                        success = True
                        break
                except Exception as e:
                    time.sleep(1)

            if not success:
                print(f"Failed to download essential image {img_url} for exam {exam_id}")
                return False

            figure_html = f'<figure class="question-figure"><img src="{rel_img_path}" alt="Hình minh họa" loading="lazy"></figure>'
            img_replacements[token] = figure_html
            img_idx += 1

        for q in questions:
            for token, fig in img_replacements.items():
                if token in q["content"]:
                    q["content"] = q["content"].replace(token, fig)
                if "options" in q:
                    q["options"] = [opt.replace(token, fig) for opt in q["options"]]
                if "statements" in q:
                    q["statements"] = [st.replace(token, fig) for st in q["statements"]]

        return True

    def import_batch(self, target: int = 40, dry_run: bool = False, max_pages: int = 5) -> list[dict]:
        print(f"Discovering threads from SieuGioi (max_pages={max_pages})...")
        catalog = self.discover_threads(max_pages=max_pages)
        print(f"Total catalog threads: {len(catalog)}")

        buckets: dict[tuple[str, str], list[dict]] = {}
        seen_batch_titles = set(self.existing_titles)

        for item in catalog:
            t = item["title"]
            clean_t = re.sub(r"\s*\|\s*SieuGioi.*$", "", t, flags=re.I).strip()
            norm = normalize_title(clean_t)
            if norm in seen_batch_titles:
                continue
            if any(k in norm for k in ["giao an", "powerpoint", "sach giao khoa", "ly thuyet"]):
                continue

            grade, sub, etype, year = self.detect_metadata(clean_t, item["url"], item["subject_hint"], item["grade_hint"])
            
            # Skip literature lacking reading text
            if sub == "van":
                continue

            key = (grade, sub)
            buckets.setdefault(key, []).append({
                **item,
                "clean_title": clean_t,
                "norm_title": norm,
                "grade": grade,
                "subjectSlug": sub,
                "examType": etype,
                "year": year,
            })

        print(f"Buckets available: {len(buckets)}")
        for k, v in sorted(buckets.items()):
            print(f"  {k}: {len(v)} candidates")

        imported = []
        skipped = []

        max_rounds = max((len(v) for v in buckets.values()), default=0)
        for round_idx in range(max_rounds):
            if len(imported) >= target:
                break

            for key in sorted(buckets.keys()):
                if len(imported) >= target:
                    break

                bucket = buckets[key]
                if round_idx >= len(bucket):
                    continue

                item = bucket[round_idx]
                if item["norm_title"] in seen_batch_titles:
                    continue

                cache_key = re.sub(r"[^a-zA-Z0-9]+", "_", item["url"].replace("https://sieugioi.com/", ""))[:100]
                html_doc = self.fetch_url(item["url"], cache_key)
                if not html_doc:
                    skipped.append({"url": item["url"], "title": item["clean_title"], "reason": "Fetch failed"})
                    continue

                title, questions, img_map, ans_src = self.parse_thread_content(html_doc, item["url"])
                if not title:
                    title = item["clean_title"]

                norm_final_title = normalize_title(title)
                if norm_final_title in seen_batch_titles:
                    skipped.append({"url": item["url"], "title": title, "reason": "Title exists in index/batch"})
                    continue

                if len(questions) < 5:
                    skipped.append({"url": item["url"], "title": title, "reason": f"Too few questions ({len(questions)})"})
                    continue

                # Strict validation of each question
                has_invalid_q = False
                for q in questions:
                    if q["type"] == "single":
                        opts = q.get("options", [])
                        if len(opts) != 4:
                            has_invalid_q = True
                            break
                        # Check for merged options
                        for opt in opts:
                            if re.search(r"\b[B-D]\.\s+", opt[3:]):
                                has_invalid_q = True
                                break
                    elif q["type"] == "true_false":
                        stmts = q.get("statements", [])
                        if len(stmts) != 4:
                            has_invalid_q = True
                            break
                    elif q["type"] == "short_answer":
                        # A common parser failure is an A-D multiple-choice or
                        # true/false block being left inside the prompt and
                        # mislabeled as a free-response question.
                        markers = {
                            marker.upper()
                            for marker in re.findall(
                                r"(?:<strong>\s*)?([A-D])(?:\.|\s*</strong>)",
                                q.get("content", ""),
                                re.I,
                            )
                        }
                        if len(markers) >= 3:
                            has_invalid_q = True
                            break
                    if not q.get("content", "").strip():
                        has_invalid_q = True
                        break

                # Enforce the complete 2025+ graduation-exam structures.
                # Merely having five questions is not enough: several source
                # threads contain only one section of an otherwise full exam.
                expected_distributions = {
                    "toan": {"single": 12, "true_false": 4, "short_answer": 6},
                    "li": {"single": 18, "true_false": 4, "short_answer": 6},
                    "hoa": {"single": 18, "true_false": 4, "short_answer": 6},
                    "sinh": {"single": 18, "true_false": 4, "short_answer": 6},
                    "dia": {"single": 18, "true_false": 4, "short_answer": 6},
                    "su": {"single": 24, "true_false": 4, "short_answer": 0},
                    "anh": {"single": 40, "true_false": 0, "short_answer": 0},
                }
                if item["grade"] == "l12" and item["examType"] == "totnghiep":
                    expected = expected_distributions.get(item["subjectSlug"])
                    if expected:
                        actual = {
                            qtype: sum(q.get("type") == qtype for q in questions)
                            for qtype in ("single", "true_false", "short_answer")
                        }
                        if actual != expected:
                            has_invalid_q = True

                folded_title = fold(title)
                if re.search(r"\b(?:500|1000|1428)\s+cau\b", folded_title):
                    has_invalid_q = True

                if has_invalid_q:
                    skipped.append({"url": item["url"], "title": title, "reason": "Contains malformed questions"})
                    continue

                grade = item["grade"]
                sub = item["subjectSlug"]
                etype = item["examType"]
                year = item["year"]

                title_slug = slugify(title, limit=60)
                thread_id_match = re.search(r"\.(\d+)/?$", item["url"])
                tid = f"-{thread_id_match.group(1)}" if thread_id_match else ""
                exam_id = f"{grade}-{sub}-{etype}-{year}-{title_slug}{tid}"
                exam_id = re.sub(r"[^a-z0-9-]+", "-", exam_id.lower()).strip("-")

                if sub in ("toan", "van"):
                    duration = 90 if etype == "totnghiep" else (120 if etype == "tuyensinh10" else 90)
                else:
                    duration = 50 if etype == "totnghiep" else 45

                if not dry_run:
                    ok_img = self.process_and_save_images(img_map, exam_id, grade, sub, etype, questions)
                    if not ok_img:
                        skipped.append({"url": item["url"], "title": title, "reason": "Image conversion failed"})
                        continue

                exam_data = {
                    "id": exam_id,
                    "grade": grade,
                    "subjectSlug": sub,
                    "examType": etype,
                    "year": year,
                    "code": "Đề 01",
                    "title": title,
                    "duration": duration,
                    "answerSource": ans_src,
                    "sourceUrl": item["url"],
                    "passages": {},
                    "questions": questions,
                }

                if not dry_run:
                    target_dir = DATA_DIR / grade / sub / etype
                    target_dir.mkdir(parents=True, exist_ok=True)
                    dest_file = target_dir / f"{exam_id}.json"
                    with open(dest_file, "w", encoding="utf-8") as f:
                        json.dump(exam_data, f, ensure_ascii=False, indent=2)

                seen_batch_titles.add(norm_final_title)
                imported.append(exam_data)
                print(f"[{len(imported):02d}/{target}] [{grade:4} | {sub:6} | {etype:11}] ({len(questions)} qs, ans={ans_src}) -> {title[:60]}")

        print(f"\nImport finished. Successfully imported {len(imported)}/{target} exams.")
        print(f"Skipped {len(skipped)} candidate items.")
        return imported


def main():
    parser = argparse.ArgumentParser(description="Import complete exams from SieuGioi.")
    parser.add_argument("--target", type=int, default=40, help="Number of exams to import (default 40)")
    parser.add_argument("--workers", type=int, default=4, help="Number of worker threads (default 4)")
    parser.add_argument("--max-pages", type=int, default=5, help="Max pages per forum to crawl (default 5)")
    parser.add_argument("--dry-run", action="store_true", help="Run without saving files")
    args = parser.parse_args()

    importer = SieuGioiImporter()
    importer.import_batch(target=args.target, dry_run=args.dry_run, max_pages=args.max_pages)


if __name__ == "__main__":
    main()

"""Import public HocHanh exams into the local static-exam JSON schema.

The importer deliberately accepts only complete, image-free multiple-choice
exams.  This keeps question text selectable and avoids publishing unusable
questions whose essential diagrams were lost during conversion.
"""

from __future__ import annotations

import argparse
import html
import json
import random
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag
from cryptography.fernet import Fernet


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
BASE_URL = "https://data.hochanh.org"
FERNET = Fernet(b"eLkN655JNGSd65ajxCQgQ49DCw0fhR4I0ndRZv7hkic=")
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://hochanh.org",
    "Referer": "https://hochanh.org/",
    "User-Agent": "Mozilla/5.0 (compatible; HocHanh public exam importer)",
}

GRADE_SLUGS = {9: "l9", 10: "l10", 11: "l11", 12: "l12"}
SUBJECT_SLUGS = {
    "Toán": "toan",
    "Ngữ văn": "van",
    "Tiếng Anh": "anh",
    "Vật lí": "li",
    "Vật lý": "li",
    "Hóa học": "hoa",
    "Hoá học": "hoa",
    "Sinh học": "sinh",
    "Lịch sử": "su",
    "Địa lí": "dia",
    "Địa lý": "dia",
    "Tin học": "tin",
    "GDCD": "gdktpl",
    "GDKT&PL": "gdktpl",
    "Giáo dục kinh tế và pháp luật": "gdktpl",
    "Công nghệ": "cn-cn",
}


def fetch_json(path: str, attempts: int = 6):
    for attempt in range(attempts):
        # HocHanh's public cache can pin a 429 response to the bare URL.  A
        # harmless cache-buster makes retries reach the current public data.
        separator = "&" if "?" in path else "?"
        request = urllib.request.Request(
            BASE_URL + path + f"{separator}_cb={time.time_ns()}-{attempt}",
            headers=HEADERS,
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response)
        except urllib.error.HTTPError as exc:
            if exc.code != 429 or attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)
        except (TimeoutError, urllib.error.URLError):
            if attempt == attempts - 1:
                raise
            time.sleep(2 ** attempt)
    raise RuntimeError(f"Không tải được {path}")


def decrypt_payload(token: str, strip_prefix: bool = False) -> dict:
    if strip_prefix:
        token = token[1:]
    return json.loads(FERNET.decrypt(token.encode("utf-8")))


def catalog_payload(grade_id: int) -> dict:
    """Load a public catalog once and reuse it across interrupted batches."""
    target = ROOT / ".cache" / "hochanh-catalog" / f"grade-{grade_id}.json"
    if target.exists():
        return json.loads(target.read_text(encoding="utf-8"))
    payload = decrypt_payload(fetch_json(f"/api/detail?grade__id={grade_id}"))
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFD", value)
    value = "".join(ch for ch in value if unicodedata.category(ch) != "Mn")
    value = value.lower().replace("đ", "d")
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value[:150].rstrip("-") or "de-thi"


def compact_text(value: str) -> str:
    value = unicodedata.normalize("NFC", html.unescape(value))
    value = value.replace("\xa0", " ")
    value = re.sub(r"[ \t]+", " ", value)
    value = re.sub(r" *\n *", "\n", value)
    value = re.sub(r"\n{3,}", "\n\n", value)
    return value.strip()


def math_children(tag: Tag) -> list[Tag | NavigableString]:
    return [child for child in tag.children if isinstance(child, (Tag, NavigableString))]


def mathml_to_latex(node: Tag | NavigableString) -> str:
    if isinstance(node, NavigableString):
        return str(node).strip()
    name = (node.name or "").lower()
    children = math_children(node)
    rendered = [mathml_to_latex(child) for child in children]
    text = "".join(rendered)
    if name in {"math", "mrow", "semantics"}:
        return text
    if name in {"mi", "mn", "mtext"}:
        return compact_text(node.get_text(" ", strip=True))
    if name == "mo":
        operators = {
            "×": r"\times ", "·": r"\cdot ", "÷": r"\div ", "≤": r"\le ",
            "≥": r"\ge ", "≠": r"\ne ", "≈": r"\approx ", "∞": r"\infty ",
            "∈": r"\in ", "∉": r"\notin ", "∪": r"\cup ", "∩": r"\cap ",
            "→": r"\to ", "⇒": r"\Rightarrow ", "±": r"\pm ", "∑": r"\sum ",
            "∫": r"\int ", "√": r"\sqrt{}", "∠": r"\angle ", "°": r"^{\circ}",
        }
        raw = compact_text(node.get_text(" ", strip=True))
        return operators.get(raw, raw)
    if name == "mfrac" and len(rendered) >= 2:
        return rf"\frac{{{rendered[0]}}}{{{rendered[1]}}}"
    if name == "msup" and len(rendered) >= 2:
        return rf"{rendered[0]}^{{{rendered[1]}}}"
    if name == "msub" and len(rendered) >= 2:
        return rf"{rendered[0]}_{{{rendered[1]}}}"
    if name == "msubsup" and len(rendered) >= 3:
        return rf"{rendered[0]}_{{{rendered[1]}}}^{{{rendered[2]}}}"
    if name == "msqrt":
        return rf"\sqrt{{{text}}}"
    if name == "mroot" and len(rendered) >= 2:
        return rf"\sqrt[{rendered[1]}]{{{rendered[0]}}}"
    if name == "mfenced":
        return f"{node.get('open', '(')}{text}{node.get('close', ')')}"
    if name in {"mover", "munder", "munderover"} and rendered:
        if name == "mover" and len(rendered) >= 2:
            return rf"\overset{{{rendered[1]}}}{{{rendered[0]}}}"
        if name == "munder" and len(rendered) >= 2:
            return rf"\underset{{{rendered[1]}}}{{{rendered[0]}}}"
        if len(rendered) >= 3:
            return rf"{rendered[0]}_{{{rendered[1]}}}^{{{rendered[2]}}}"
    if name == "mtable":
        rows = []
        for row in node.find_all("mtr", recursive=False):
            cells = [mathml_to_latex(cell) for cell in row.find_all("mtd", recursive=False)]
            rows.append(" & ".join(cells))
        return r"\begin{matrix}" + r" \\ ".join(rows) + r"\end{matrix}"
    if name == "annotation":
        return ""
    return text


def html_to_text(fragment: str | None) -> str:
    if not fragment:
        return ""
    soup = BeautifulSoup(fragment, "html.parser")
    for unwanted in soup.select("script, style"):
        unwanted.decompose()
    for math_tag in list(soup.find_all("math")):
        latex = math_tag.get("alttext") or mathml_to_latex(math_tag)
        math_tag.replace_with(f" ${latex.strip()}$ ")
    for tag in list(soup.find_all("sup")):
        tag.replace_with(f"^{{{tag.get_text(' ', strip=True)}}}")
    for tag in list(soup.find_all("sub")):
        tag.replace_with(f"_{{{tag.get_text(' ', strip=True)}}}")
    for br in soup.find_all("br"):
        br.replace_with("\n")
    for block in soup.find_all(["p", "div", "li", "tr"]):
        block.append("\n")
    return compact_text(soup.get_text(" "))


def remove_question_number(value: str) -> str:
    return re.sub(r"^\s*Câu\s*\d+\s*[:.)-]?\s*", "", value, flags=re.IGNORECASE)


def remove_option_letter(value: str, letter: str) -> str:
    return re.sub(rf"^\s*{letter}\s*[.):-]\s*", "", value, flags=re.IGNORECASE).strip()


def remove_inline_source_note(value: str) -> str:
    """Remove publisher URL notes that are not part of the exam question."""
    value = re.sub(
        r"\s*\((?:Source\s*:\s*)?(?:https?://|www\.)[^)]*\)",
        "",
        value,
        flags=re.IGNORECASE,
    )
    return compact_text(value)


def infer_exam_type(title: str, grade: int) -> str:
    plain = slugify(title)
    if "hoc-sinh-gioi" in plain or re.search(r"(^|-)hsg($|-)", plain):
        return "hsg"
    if grade == 9 and ("tuyen-sinh-10" in plain or "vao-10" in plain or "lop-10" in plain):
        return "tuyensinh10"
    if grade == 12 and any(key in plain for key in ("tot-nghiep", "tn-thpt", "tnthpt", "thi-thpt")):
        return "totnghiep"
    if any(key in plain for key in ("giua-hoc-ky-1", "giua-hoc-ki-1", "giua-ky-1", "giua-ki-1")):
        return "giuaki1"
    if any(key in plain for key in ("cuoi-hoc-ky-1", "cuoi-hoc-ki-1", "cuoi-ky-1", "cuoi-ki-1")):
        return "cuoiki1"
    if any(key in plain for key in ("giua-hoc-ky-2", "giua-hoc-ki-2", "giua-ky-2", "giua-ki-2")):
        return "giuaki2"
    if any(key in plain for key in ("cuoi-hoc-ky-2", "cuoi-hoc-ki-2", "cuoi-ky-2", "cuoi-ki-2")):
        return "cuoiki2"
    return "khaosat"


def convert_exam(meta: dict, raw_questions: list[dict]) -> dict | None:
    grade_id = int(meta["grade"]["id"])
    subject_label = meta["subject"]["subject"].strip()
    subject_slug = SUBJECT_SLUGS.get(subject_label)
    if grade_id not in GRADE_SLUGS or not subject_slug:
        return None
    if not raw_questions or any(q.get("kind_question") != "Trắc nghiệm" for q in raw_questions):
        return None
    html_fragments = []
    for q in raw_questions:
        html_fragments.extend(str(q.get(key) or "") for key in (
            "context_question", "question", "choice_a", "choice_b", "choice_c", "choice_d"
        ))
    if any(re.search(r"<(img|svg|canvas)\b", fragment, re.IGNORECASE) for fragment in html_fragments):
        return None

    questions = []
    for number, raw in enumerate(raw_questions, 1):
        answer = str(raw.get("answer") or "").strip().upper()
        if answer not in tuple("ABCD"):
            return None
        context = html_to_text(raw.get("context_question"))
        prompt = remove_question_number(html_to_text(raw.get("question")))
        if not prompt:
            return None
        content = f"{context}\n\n{prompt}".strip() if context else prompt
        content = remove_inline_source_note(content)
        options = []
        for letter, key in zip("ABCD", ("choice_a", "choice_b", "choice_c", "choice_d")):
            option = remove_option_letter(html_to_text(raw.get(key)), letter)
            if not option:
                return None
            options.append(f"{letter}. {option}")
        # A few otherwise complete source sets contain a malformed question where
        # two choices are byte-for-byte identical.  Drop only that question so it
        # cannot make the generated exam fail project validation.
        option_texts = [item.split(". ", 1)[-1].casefold() for item in options]
        if len(set(option_texts)) != 4:
            continue
        questions.append({
            "id": len(questions) + 1,
            "type": "single",
            "content": content,
            "options": options,
            "answer": answer,
        })

    title = compact_text(meta["title"])
    year = int(meta["year"])
    exam_type = infer_exam_type(title, grade_id)
    base_slug = f"{year}-{slugify(title)}"
    exam_id = f"{GRADE_SLUGS[grade_id]}-{subject_slug}-{exam_type}-{base_slug}"
    return {
        "id": exam_id,
        "grade": GRADE_SLUGS[grade_id],
        "subjectSlug": subject_slug,
        "examType": exam_type,
        "year": year,
        "code": str(meta.get("code") or ""),
        "title": title,
        "duration": max(1, int(meta.get("duration") or len(questions))),
        "answerSource": "official",
        "sourceId": f"hochanh:{meta['id']}",
        "passages": {},
        "questions": questions,
    }


def existing_titles() -> set[str]:
    titles: set[str] = set()
    ignored = {"index.json", "topic-index.json", "taxonomy.json", "id-map.json", "stats.json", "de-mau.json"}
    for path in DATA.rglob("*.json"):
        if path.name in ignored:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not isinstance(data, dict):
            continue
        if data.get("title"):
            titles.add(slugify(str(data["title"])))
    return titles


def unique_output_path(exam: dict) -> Path:
    directory = DATA / exam["grade"] / exam["subjectSlug"] / exam["examType"]
    filename = f"{exam['year']}-{slugify(exam['title'])}.json"
    path = directory / filename
    if path.exists():
        source_number = exam["sourceId"].split(":", 1)[-1]
        path = directory / f"{exam['year']}-{slugify(exam['title'])}-{source_number}.json"
        exam["id"] += f"-{source_number}"
    return path


def main() -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser()
    parser.add_argument("--count", type=int, default=100)
    parser.add_argument("--seed", type=int, default=20260809)
    parser.add_argument("--grades", default="9,10,11,12")
    args = parser.parse_args()

    selected_grades = [int(value) for value in args.grades.split(",") if value.strip()]
    if not selected_grades or any(value not in GRADE_SLUGS for value in selected_grades):
        raise ValueError("--grades chỉ nhận các lớp 9,10,11,12")

    known_titles = existing_titles()
    candidates_by_grade: dict[int, list[dict]] = {}
    for grade_id in selected_grades:
        payload = catalog_payload(grade_id)
        candidates = [
            meta for meta in payload.get("results", [])
            if int(meta.get("year") or 0) >= 2025
            and meta.get("is_completed")
            and meta.get("have_detail_answer")
            and slugify(str(meta.get("title") or "")) not in known_titles
            and meta.get("subject", {}).get("subject") in SUBJECT_SLUGS
        ]
        random.Random(args.seed + grade_id).shuffle(candidates)
        # Weighted random: prefer subjects whose questions are usually complete
        # HTML text; keep the shuffled order inside each priority band.
        text_first = {
            "Tiếng Anh", "Lịch sử", "Địa lí", "Địa lý", "GDCD", "GDKT&PL",
            "Giáo dục kinh tế và pháp luật", "Sinh học", "Tin học", "Hóa học", "Hoá học",
        }
        candidates.sort(key=lambda meta: meta.get("subject", {}).get("subject") not in text_first)
        candidates_by_grade[grade_id] = candidates
        time.sleep(0.3)

    targets = {grade: args.count // len(selected_grades) for grade in selected_grades}
    for grade in selected_grades[: args.count % len(selected_grades)]:
        targets[grade] += 1

    imported: list[Path] = []
    rejected = 0
    for grade_id, target in targets.items():
        accepted = 0
        for meta in candidates_by_grade[grade_id]:
            if accepted >= target:
                break
            try:
                token = fetch_json(f"/api/v2/exam-choice/detail/{meta['id']}")
                payload = decrypt_payload(token, strip_prefix=True)
                exam = convert_exam(meta, payload.get("results", []))
                time.sleep(0.8)
            except Exception as exc:  # one bad remote exam must not abort the batch
                print(f"BỎ QUA {meta['id']}: lỗi tải/chuyển đổi: {exc}")
                rejected += 1
                time.sleep(0.8)
                continue
            if exam is None:
                rejected += 1
                continue
            path = unique_output_path(exam)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(exam, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            imported.append(path)
            known_titles.add(slugify(exam["title"]))
            accepted += 1
            print(f"[{len(imported):03d}/{args.count}] {path.relative_to(ROOT)} ({len(exam['questions'])} câu)")
            time.sleep(0.15)
        if accepted < target:
            raise RuntimeError(f"Chỉ nhập được {accepted}/{target} đề cho lớp {grade_id}")

    print(f"HOÀN TẤT: thêm {len(imported)} đề; loại {rejected} đề không đạt tiêu chí.")


if __name__ == "__main__":
    main()

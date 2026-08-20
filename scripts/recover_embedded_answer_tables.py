"""Recover unambiguous one-version answer tables embedded in imported PDFs."""

from __future__ import annotations

import html
import json
import re
from difflib import SequenceMatcher
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "l12" / "toan"


def plain(value: object) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or "")))
    return re.sub(r"\s+", " ", text).strip()


def statements(content: str) -> list[str]:
    text = plain(content)
    # Stop before an answer table accidentally attached to the last question.
    text = re.split(r"(?i)(?:-+\s*)?(?:HẾT\s*-*)?\s*(?:BẢNG\s+)?ĐÁP\s*ÁN", text)[0]
    marks = list(re.finditer(r"(?<!\w)([a-d])\)\s*", text, re.I))
    result = []
    for index, mark in enumerate(marks):
        end = marks[index + 1].start() if index + 1 < len(marks) else len(text)
        value = text[mark.end():end].strip(" .;")
        if value:
            result.append(f"{mark.group(1).lower()}) {value}")
    return result[:4]


def clean_last_content(value: str) -> str:
    match = re.search(r"(?is)(?:<p>)?(?:-+\s*)?(?:HẾT\s*-*)?\s*(?:<br>)?\s*(?:BẢNG\s+)?ĐÁP\s*ÁN", value)
    return value[:match.start()].rstrip() if match else value


def normalized_prompt(value: str) -> str:
    return re.sub(r"\W+", "", plain(value).lower())[:1200]


def collapse_solution_duplicate(questions: list[dict]) -> list[dict]:
    if len(questions) != 44:
        return questions
    scores = [
        SequenceMatcher(None, normalized_prompt(questions[i].get("content", "")),
                        normalized_prompt(questions[i + 22].get("content", ""))).ratio()
        for i in range(22)
    ]
    if sum(score >= .82 for score in scores) < 20 or sum(scores) / len(scores) < .9:
        return questions
    for i in range(22):
        if questions[i + 22].get("explanation") and not questions[i].get("explanation"):
            questions[i]["explanation"] = questions[i + 22]["explanation"]
    return questions[:22]


def find_mcq_table(text: str) -> list[str]:
    patterns = [
        r"(?i)Câu\s+1\s+2\s+3\s+4\s+5\s+6\s+7\s+8\s+9\s+10\s+11\s+12\s+(?:Chọn|Đáp\s*án)\s+((?:[A-D]\s*){12})",
        r"(?i)(?:PHẦN\s*I[^A-D]{0,200})?(?:1\s*[.)]?\s*([A-D])\s+2\s*[.)]?\s*([A-D])\s+3\s*[.)]?\s*([A-D])\s+4\s*[.)]?\s*([A-D])\s+5\s*[.)]?\s*([A-D])\s+6\s*[.)]?\s*([A-D])\s+7\s*[.)]?\s*([A-D])\s+8\s*[.)]?\s*([A-D])\s+9\s*[.)]?\s*([A-D])\s+10\s*[.)]?\s*([A-D])\s+11\s*[.)]?\s*([A-D])\s+12\s*[.)]?\s*([A-D]))",
    ]
    match = re.search(patterns[0], text)
    if match:
        return re.findall(r"[A-D]", match.group(1).upper())
    match = re.search(patterns[1], text)
    return list(match.groups()) if match else []


def find_tf_table(text: str) -> list[list[str]]:
    sections = list(re.finditer(r"(?is)PH.N\s*II.*?(?=PH.N\s*III)", text))
    for section in reversed(sections):
        body = section.group(0)
        rows = []
        for letter in "abcd":
            matches = re.findall(rf"(?i){letter}\)\s*(Đúng|Sai|Đ|S)", body)
            if len(matches) >= 4:
                rows.append(["D" if value.lower() in {"đ", "đúng"} else "S" for value in matches[:4]])
        if len(rows) == 4:
            return [[rows[row][col] for row in range(4)] for col in range(4)]
    return []


def find_short_table(text: str) -> list[str]:
    match = re.search(
        r"(?i)C.u(?:\s+C.u)?\s*(?:1|17)(?:\s+C.u)?\s*(?:2|18)(?:\s+C.u)?\s*(?:3|19)"
        r"(?:\s+C.u)?\s*(?:4|20)(?:\s+C.u)?\s*(?:5|21)(?:\s+C.u)?\s*(?:6|22)"
        r"\s+(?:Ch.n|..p\s*.n)\s+([-−\d.,\s]+)", text,
    )
    if not match:
        return []
    values = re.findall(r"[-−]?\d+(?:[.,]\d+)?", match.group(1))
    return [value.replace("−", "-") for value in values[:6]] if len(values) >= 6 else []


def main() -> None:
    results = []
    for path in DATA.rglob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        original_questions = payload.get("questions", [])
        questions = collapse_solution_duplicate(original_questions)
        if len(questions) != 22 or payload.get("answerSource") == "official":
            continue
        blob = " ".join(plain(q.get("content")) + " " + plain(q.get("explanation")) for q in original_questions)
        mcq = find_mcq_table(blob)
        tf = find_tf_table(blob)
        short = find_short_table(blob)
        if not (len(mcq) == 12 and len(tf) == 4 and len(short) == 6):
            continue
        # The source must describe the same 12/4/6 structure and must not expose
        # several code columns; otherwise positional assignment would be unsafe.
        valid = True
        for index in range(12):
            if questions[index].get("type") != "single":
                valid = False
                break
            letters = {str(v).strip()[:1] for v in questions[index].get("options", [])}
            if mcq[index] not in letters:
                valid = False
                break
        parsed_statements = [statements(questions[index].get("content", "")) for index in range(12, 16)]
        if not valid or any(len(values) != 4 for values in parsed_statements):
            continue
        for index, answer in enumerate(mcq):
            questions[index]["answer"] = answer
        for offset, index in enumerate(range(12, 16)):
            questions[index] = {
                "id": questions[index].get("id", index + 1), "type": "true_false",
                "content": re.sub(r"(?is)(?:<br>)?\s*a\).*", "", questions[index]["content"]).rstrip(),
                "statements": parsed_statements[offset], "answer": tf[offset],
            }
        for offset, index in enumerate(range(16, 22)):
            questions[index]["answer"] = short[offset]
        questions[-1]["content"] = clean_last_content(questions[-1]["content"])
        payload["questions"] = questions
        payload["answerSource"] = "official"
        payload["answerRecoveryNote"] = "Đáp án chuẩn được phục hồi từ bảng đáp án in trong chính PDF nguồn (cấu trúc 12/4/6 đã đối chiếu)."
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        results.append(str(path.relative_to(ROOT)))
    report = ROOT / "reports" / "embedded-answer-table-recovery.json"
    report.write_text(json.dumps({"officialExams": len(results), "files": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"officialExams": len(results), "answersRecovered": len(results) * 22}, ensure_ascii=False))


if __name__ == "__main__":
    main()

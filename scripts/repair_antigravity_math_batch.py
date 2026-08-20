"""Repair the malformed PDF-text math batch created by the Antigravity importers.

The repair is intentionally conservative: it never invents an answer.  It recovers
printed choices/answers, removes leaked solutions, and converts only unambiguous
math fragments to LaTeX.  Questions whose choices cannot be recovered become
short-answer questions while retaining the complete original prompt.
"""

from __future__ import annotations

import html
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "l12" / "toan"

PLACEHOLDER = "Xem chi tiết trong đề bài"
PRE_RE = re.compile(r"^\s*<pre\b[^>]*>(.*)</pre>\s*$", re.I | re.S)
QUESTION_NO_RE = re.compile(r"^\s*Câu\s+\d+\s*[:.]\s*", re.I)
ANSWER_RE = re.compile(
    r"Đáp\s*án\s*đúng\s*là\s*[\"“”']?\s*([^\"“”'\n<]+?)\s*[\"“”']?(?=\s*(?:\n|Phương\s*pháp|Lời\s*giải|$))",
    re.I,
)
SOLUTION_RE = re.compile(r"\n\s*(?:Phương\s*pháp\s*giải|Lời\s*giải)\b", re.I)
SHORT_HINT_RE = re.compile(r"nhập\s+đáp\s+án|đáp\s*án\s*:\s*[_\.]{2,}|ô\s+trống", re.I)
OPTION_MARK_RE = re.compile(r"(?<![\wÀ-ỹ])([A-D])\s*[.)]\s+", re.M)


def unwrap(value: object) -> str:
    text = str(value or "")
    match = PRE_RE.match(text)
    if match:
        text = match.group(1)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.I)
    text = re.sub(r"</(?:p|div|li|tr)\s*>", "\n", text, flags=re.I)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).replace("\r\n", "\n").replace("\r", "\n").strip()


def clean_text(text: str) -> str:
    replacements = {
        "": "−", "−": "-", "": "∞", "¥": "∞", "£": "≤",
        "³": "≥", "¹": "≠", "": "∈", "": "∉", "": "∫",
        "": "π", "": "°", "": "(", "": ")", "": "+",
    }
    for old, new in replacements.items():
        text = text.replace(old, new)
    text = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def math_fragment(fragment: str) -> str:
    value = re.sub(r"\s+", "", fragment)
    value = value.replace("∞", r"\infty").replace("π", r"\pi")
    value = value.replace("≤", r"\le ").replace("≥", r"\ge ")
    value = value.replace("≠", r"\ne ").replace("∈", r"\in ")
    value = value.replace("−", "-")
    return f"${value}$"


def latexify(text: str) -> tuple[str, int]:
    """Wrap only high-confidence standalone mathematical fragments."""
    count = 0

    def repl(match: re.Match[str]) -> str:
        nonlocal count
        count += 1
        return math_fragment(match.group(0))

    # Intervals such as (-∞; -1), [0; 2), and basic function notation.
    number = r"(?:[-−]?\s*(?:\d+(?:[.,]\d+)?|∞))"
    text = re.sub(rf"[\[(]\s*{number}\s*;\s*{number}\s*[\])]", repl, text)
    text = re.sub(r"\b(?:f|g|h|F|G|H)\s*(?:['′])?\s*\(\s*[a-zA-Z]\s*\)", repl, text)
    # Simple, complete relations. Requiring whitespace or punctuation boundaries
    # avoids converting normal prose containing a lone variable.
    relation = re.compile(
        r"(?<![\w$])(?:[a-zA-Z]\s*)?(?:\d+(?:[.,]\d+)?\s*)?[a-zA-Z]"
        r"(?:\s*[+\-−*/]\s*(?:\d+(?:[.,]\d+)?|[a-zA-Z]))*"
        r"\s*(?:=|≤|≥|≠|<|>)\s*[-−]?(?:\d+(?:[.,]\d+)?|∞)(?![\w$])"
    )
    text = relation.sub(repl, text)
    return text, count


def to_html(text: str) -> tuple[str, int]:
    text = QUESTION_NO_RE.sub("", clean_text(text), count=1)
    escaped = html.escape(text, quote=False)
    escaped, count = latexify(escaped)
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", escaped) if part.strip()]
    rendered = "".join(f"<p>{part.replace(chr(10), '<br>')}</p>" for part in paragraphs)
    return rendered or "<p>(Nội dung không đọc được)</p>", count


def option_sequence(text: str) -> tuple[str, list[str]] | None:
    matches = list(OPTION_MARK_RE.finditer(text))
    # A prompt may mention a geometric point named "A.". Trying candidate starts
    # from the end selects the actual final A-B-C-D answer row in that case.
    for start in range(len(matches) - 1, -1, -1):
        marker = matches[start]
        if marker.group(1) != "A":
            continue
        chosen = [marker]
        expected = "B"
        for candidate in matches[start + 1:]:
            if candidate.group(1) == expected:
                chosen.append(candidate)
                if expected == "D":
                    break
                expected = chr(ord(expected) + 1)
        if len(chosen) < 2:
            continue
        if len(chosen) < 4:
            continue
        prompt = text[:chosen[0].start()].strip()
        options: list[str] = []
        for index, item in enumerate(chosen):
            end = chosen[index + 1].start() if index + 1 < len(chosen) else len(text)
            value = re.sub(r"\s+", " ", text[item.end():end]).strip()
            if value:
                options.append(f"{item.group(1)}. {value}")
        if len(options) >= 2:
            return prompt, options
    return None


def printed_answer(text: str) -> str:
    match = ANSWER_RE.search(text)
    if not match:
        return ""
    value = re.sub(r"\s+", " ", match.group(1)).strip().rstrip(".;")
    return value


def split_solution(text: str) -> tuple[str, str]:
    answer_match = ANSWER_RE.search(text)
    solution_match = SOLUTION_RE.search(text)
    cuts = [m.start() for m in (answer_match, solution_match) if m]
    if not cuts:
        return text.strip(), ""
    cut = min(cuts)
    prompt = text[:cut].strip()
    remainder = text[cut:].strip()
    remainder = ANSWER_RE.sub("", remainder, count=1).strip()
    return prompt, remainder


def clean_option(value: str) -> str:
    text = clean_text(unwrap(value))
    answer_match = ANSWER_RE.search(text)
    solution_match = SOLUTION_RE.search("\n" + text)
    cuts = [m.start() for m in (answer_match, solution_match) if m]
    if cuts:
        text = text[:min(cuts)].strip()
    return text


def repair_hsa_question(question: dict, qid: int) -> tuple[dict, int, bool]:
    content = clean_text(unwrap(question.get("content") or question.get("question")))
    option_blob = "\n".join(unwrap(v) for v in question.get("options", []))
    combined = content + "\n" + option_blob
    answer = printed_answer(combined) or str(question.get("answer") or "").strip()
    prompt, solution = split_solution(content)
    latex_count = 0

    existing = [clean_option(v) for v in question.get("options", [])]
    existing = [v for v in existing if v and "Chưa xác định" not in v]
    parsed = option_sequence(prompt)
    if parsed:
        prompt, parsed_options = parsed
        existing = parsed_options

    is_choice = answer.upper() in {"A", "B", "C", "D"} and len(existing) >= 2
    if is_choice:
        out_type = "single"
        options = []
        for value in existing:
            rendered, used = latexify(html.escape(value, quote=False))
            latex_count += used
            options.append(rendered)
        out_answer: object = answer.upper()
    else:
        out_type = "short_answer"
        options = None
        out_answer = answer

    rendered_prompt, used = to_html(prompt)
    latex_count += used
    result = {"id": qid, "type": out_type, "content": rendered_prompt, "answer": out_answer}
    if options is not None:
        result["options"] = options
        available = {re.match(r"\s*([A-D])", value).group(1) for value in options if re.match(r"\s*([A-D])", value)}
        if str(out_answer) and str(out_answer) not in available:
            result["type"] = "short_answer"
            result.pop("options", None)
    if solution:
        rendered_solution, used = to_html(solution)
        latex_count += used
        result["explanation"] = rendered_solution
    return result, latex_count, bool(str(out_answer).strip())


def repair_pdf_question(question: dict, qid: int) -> tuple[dict, int, bool, bool]:
    text = clean_text(unwrap(question.get("content") or question.get("question")))
    answer = printed_answer(text) or str(question.get("answer") or "").strip()
    prompt, solution = split_solution(text)
    parsed = option_sequence(prompt)
    latex_count = 0

    if parsed and not SHORT_HINT_RE.search(parsed[0]):
        prompt, raw_options = parsed
        options = []
        for value in raw_options:
            escaped = html.escape(value, quote=False)
            rendered, used = latexify(escaped)
            latex_count += used
            options.append(rendered)
        out_type = "single"
        out_answer: object = answer.upper() if answer.upper() in {"A", "B", "C", "D"} else ""
        parsed_options = True
    else:
        out_type = "short_answer"
        options = None
        out_answer = answer
        parsed_options = False

    rendered_prompt, used = to_html(prompt)
    latex_count += used
    result = {"id": qid, "type": out_type, "content": rendered_prompt, "answer": out_answer}
    if options is not None:
        result["options"] = options
    if solution:
        rendered_solution, used = to_html(solution)
        latex_count += used
        result["explanation"] = rendered_solution
    return result, latex_count, bool(str(out_answer).strip()), parsed_options


def is_target(payload: dict) -> bool:
    questions = payload.get("questions") or []
    if (payload.get("source") == "tailieuonthi.org" and
            payload.get("id", "").startswith("tlot-toan-hsa") and
            not payload.get("repairNote")):
        return True
    return any(
        PLACEHOLDER in " ".join(map(str, q.get("options", [])))
        for q in questions
    )


def main() -> None:
    files = sorted(DATA.rglob("*.json"))
    report = Counter()
    changed: list[str] = []

    for path in files:
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if not is_target(payload):
            continue

        is_hsa = payload.get("source") == "tailieuonthi.org"
        repaired = []
        latex_total = 0
        known_answers = 0
        parsed_options = 0
        seen = set()
        for question in payload.get("questions", []):
            raw_key = re.sub(r"\s+", " ", unwrap(question.get("content") or question.get("question"))).strip()
            if not raw_key or raw_key in seen:
                report["duplicate_questions_removed"] += 1
                continue
            seen.add(raw_key)
            qid = len(repaired) + 1
            if is_hsa:
                result, used, known = repair_hsa_question(question, qid)
                parsed = result["type"] == "single"
            else:
                result, used, known, parsed = repair_pdf_question(question, qid)
            repaired.append(result)
            latex_total += used
            known_answers += int(known)
            parsed_options += int(parsed)

        if not repaired:
            report["empty_files"] += 1
            continue

        payload["questions"] = repaired
        payload["subjectSlug"] = "toan"
        payload.pop("subject", None)
        if "duration" not in payload:
            payload["duration"] = payload.pop("timeLimitMinutes", 75 if is_hsa else 90)
        else:
            payload.pop("timeLimitMinutes", None)
        payload.setdefault("passages", {})
        payload["answerSource"] = "official" if known_answers == len(repaired) else "missing"
        payload["repairNote"] = (
            "Đã phục hồi tự động từ văn bản PDF; không tự suy đoán đáp án. "
            "Biểu thức chỉ được chuyển LaTeX khi nhận diện chắc chắn."
        )

        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        changed.append(str(path.relative_to(ROOT)))
        report["files"] += 1
        report["questions"] += len(repaired)
        report["known_answers"] += known_answers
        report["single_questions"] += parsed_options
        report["short_answer_questions"] += len(repaired) - parsed_options
        report["latex_fragments"] += latex_total

    report_path = ROOT / "reports" / "antigravity-math-repair.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(
        json.dumps({"summary": dict(report), "changedFiles": changed}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(dict(report), ensure_ascii=False, indent=2))
    print(f"Report: {report_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

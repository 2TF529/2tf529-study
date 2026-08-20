"""Recover explicit printed answers from question explanations.

This script never solves a question. It accepts only direct answer declarations
such as "Chọn B" or "Đáp án đúng là C", and enables scoring only when every
question in an exam has a printed answer.
"""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CHOICE_PATTERNS = [
    re.compile(r"(?i)(?:^|[>\s.;:])Chọn\s*(?:đáp\s*án\s*)?#?\s*([A-D])\b"),
    re.compile(r"(?i)Đáp\s*án\s*(?:đúng\s*)?(?:là|:)?\s*[\"“”']?\s*([A-D])\b"),
]


def explicit_choice(text: str) -> str:
    found = []
    for pattern in CHOICE_PATTERNS:
        found.extend(match.group(1).upper() for match in pattern.finditer(text or ""))
    return found[0] if found and len(set(found)) == 1 else ""


def main() -> None:
    summary = {"filesChanged": 0, "answersRecovered": 0, "newOfficialExams": 0,
               "conflictsSkipped": 0}
    details = []
    for path in DATA.rglob("*.json"):
        if path.name in {"taxonomy.json", "index.json", "explore-index.json", "topic-index.json", "stats.json", "id-map.json"}:
            continue
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        recovered = 0
        for question in payload.get("questions", []):
            if question.get("type") != "single" or str(question.get("answer", "")).strip():
                continue
            answer = explicit_choice(str(question.get("explanation", "")))
            letters = {str(option).strip()[:1] for option in question.get("options", [])}
            if answer and answer in letters:
                question["answer"] = answer
                recovered += 1
        questions = payload.get("questions", [])
        complete = all(str(question.get("answer", "")).strip() for question in questions)
        has_any = any(str(question.get("answer", "")).strip() for question in questions)
        should_mark_partial = has_any and not complete and payload.get("answerSource") == "missing"
        if not recovered and not should_mark_partial:
            continue
        if complete and payload.get("answerSource") != "official":
            payload["answerSource"] = "official"
            summary["newOfficialExams"] += 1
        elif not complete:
            payload["answerSource"] = "partial"
        note = "Đã bổ sung các đáp án được in trực tiếp trong lời giải; không suy đoán bằng AI."
        payload["answerRecoveryNote"] = note
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        summary["filesChanged"] += 1
        summary["answersRecovered"] += recovered
        details.append({"file": str(path.relative_to(ROOT)), "answers": recovered, "complete": complete})
    report = ROOT / "reports" / "printed-answer-recovery.json"
    report.write_text(json.dumps({"summary": summary, "details": details}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

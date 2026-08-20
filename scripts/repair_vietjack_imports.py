#!/usr/bin/env python3
"""Repair and strictly filter exams created by import_vietjack_complete_batch.py."""

from __future__ import annotations

import html
import json
import re
import shutil
import unicodedata
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SKIP_NAMES = {"index.json", "taxonomy.json", "topic-index.json", "stats.json", "explore-index.json", "id-map.json"}

STRONG_SUBJECT_PATTERNS = [
    (r"\b(?:mon\s+)?toan\s*(?:lop\s*)?(?:9|10|11|12)\b", "toan"),
    (r"\b(?:ngu\s+)?van\s*(?:lop\s*)?(?:9|10|11|12)\b", "van"),
    (r"\b(?:tieng\s+anh|english)\s*(?:lop\s*)?(?:9|10|11|12)\b", "anh"),
    (r"\b(?:vat\s+(?:li|ly)|mon\s+(?:li|ly))\s*(?:lop\s*)?(?:9|10|11|12)\b", "li"),
    (r"\b(?:hoa\s+hoc|mon\s+hoa)\s*(?:lop\s*)?(?:9|10|11|12)\b", "hoa"),
    (r"\b(?:sinh\s+hoc|mon\s+sinh)\s*(?:lop\s*)?(?:9|10|11|12)\b", "sinh"),
    (r"\b(?:lich\s+su|mon\s+su)\s*(?:lop\s*)?(?:9|10|11|12)\b", "su"),
    (r"\b(?:dia\s+(?:li|ly)|mon\s+dia)\s*(?:lop\s*)?(?:9|10|11|12)\b", "dia"),
]


def fold(value: str) -> str:
    value = unicodedata.normalize("NFD", value.casefold())
    return "".join(c for c in value if unicodedata.category(c) != "Mn").replace("đ", "d")


def visible(value: str) -> str:
    return html.unescape(re.sub(r"<[^>]*>", " ", value))


def source_numbers(questions: list[dict]) -> list[int]:
    numbers = []
    for question in questions:
        match = re.search(r"\bcau\s*(\d+)", fold(visible(str(question.get("content", "")))))
        if match:
            numbers.append(int(match.group(1)))
    return numbers


def is_incomplete(data: dict) -> bool:
    questions = data.get("questions", [])
    if len(questions) > 60:
        return True
    for question in questions:
        if question.get("type") != "single":
            continue
        normalized = [
            re.sub(r"^\s*[A-Z][.)]\s*", "", str(option)).strip().casefold()
            for option in question.get("options", [])
        ]
        if len(normalized) != len(set(normalized)):
            return True
    numbers = source_numbers(questions)
    resets = sum(b <= a for a, b in zip(numbers, numbers[1:]))
    return resets > 2


def convert_true_false(question: dict) -> bool:
    if question.get("type") != "single" or len(question.get("options", [])) != 4:
        return False
    prompt = fold(visible(str(question.get("content", ""))))
    if "dung hoac sai" not in prompt and "moi y a" not in prompt:
        return False
    statements = []
    for option in question.pop("options"):
        statement = re.sub(r"^\s*[A-D]\s*[.)]\s*", "", option, flags=re.I)
        statements.append(statement)
    question["type"] = "true_false"
    question["statements"] = statements
    question["answer"] = []
    return True


def title_year(title: str, fallback: int) -> int:
    years = [int(x) for x in re.findall(r"\b20\d{2}\b", title)]
    eligible = [year for year in years if year >= 2025]
    return max(eligible) if eligible else fallback


def should_delete_metadata(data: dict) -> bool:
    title = str(data.get("title", ""))
    years = [int(x) for x in re.findall(r"\b20\d{2}\b", title)]
    if years and max(years) < 2025:
        return True
    folded = fold(title)
    explicit_subject = next(
        (slug for pattern, slug in STRONG_SUBJECT_PATTERNS if re.search(pattern, folded)),
        None,
    )
    return explicit_subject is not None and explicit_subject != data.get("subjectSlug")


def answer_source(questions: list[dict]) -> str:
    answered = 0
    for question in questions:
        answer = question.get("answer")
        if isinstance(answer, list):
            answered += bool(answer) and len(answer) == len(question.get("statements", []))
        else:
            answered += answer not in (None, "")
    if answered == len(questions):
        return "official"
    return "partial" if answered else "missing"


def main() -> None:
    deleted = repaired = converted = 0
    for path in list(DATA.rglob("*.json")):
        if path.name in SKIP_NAMES or "_template" in path.parts:
            continue
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except Exception:
            continue
        if not isinstance(data, dict) or "vietjack.com" not in str(data.get("sourceUrl", "")):
            continue
        if should_delete_metadata(data) or is_incomplete(data):
            asset_dir = path.parent / "assets" / str(data.get("id", ""))
            path.unlink()
            if asset_dir.is_dir() and DATA.resolve() in asset_dir.resolve().parents:
                shutil.rmtree(asset_dir)
            deleted += 1
            continue
        changed = False
        for question in data.get("questions", []):
            if convert_true_false(question):
                converted += 1
                changed = True
        year = title_year(str(data.get("title", "")), int(data.get("year", 2025)))
        if data.get("year") != year:
            data["year"] = year
            changed = True
        new_source = answer_source(data.get("questions", []))
        if data.get("answerSource") != new_source:
            data["answerSource"] = new_source
            changed = True
        if changed:
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            repaired += 1
    print(f"Deleted incomplete: {deleted}")
    print(f"Repaired files: {repaired}")
    print(f"Converted true/false questions: {converted}")


if __name__ == "__main__":
    main()

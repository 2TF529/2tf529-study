#!/usr/bin/env python3
"""Repair the eight cached HocHanh social-subject exams imported on 2026-08-13."""

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]

VAN_FILES = [
    ROOT / "data/l11/van/cuoiki2" / f"2025-van11-ctst-de-kiem-tra-cuoi-hoc-ky-2-de-{n:02d}.json"
    for n in (3, 7, 8, 9, 10)
]
SU_FILES = [
    ROOT / "data/l12/su/totnghiep/2025-on-thi-thpt-chu-de-7-cong-cuoc-doi-moi-o-viet-nam-tu-nam-1986-den-nay.json",
    ROOT / "data/l12/su/totnghiep/2025-on-thi-thpt-chu-de-8-lich-su-doi-ngoai-cu-viet-nam-thoi-can-hien-dai.json",
    ROOT / "data/l12/su/totnghiep/2025-on-thi-thpt-chu-de-9-ho-chi-minh-trong-lich-su-viet-nam.json",
]

NOTICE_RE = re.compile(
    r"\s*App không chấm điểm câu hỏi này!\s*"
    r"Bạn lựa chọn đạt\s*/\s*không đạt để tự chấm\.\s*$",
    re.I,
)
STATEMENT_RE = re.compile(r"^\s*([a-d])\s*[).]\s*", re.I)


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def save(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def repair_van(path):
    data = load(path)
    data["duration"] = 90
    data["title"] = data["title"].replace("VAN11 - CTST", "Ngữ văn 11 – Chân trời sáng tạo")

    # p2 only repeats p1 and appends HocHanh's self-marking notice.
    if "p1" in data.get("passages", {}) and "p2" in data["passages"]:
        for question in data["questions"]:
            if question.get("passageId") == "p2":
                question["passageId"] = "p1"
        del data["passages"]["p2"]

    for question in data["questions"]:
        question["content"] = question["content"].replace("Ngôi thứ nhai", "Ngôi thứ hai")

    # The source duplicated B verbatim as D in question 3 of exam 10.
    if path.stem.endswith("de-10"):
        q3 = next(q for q in data["questions"] if q["id"] == 3)
        if len(q3.get("options", [])) == 4 and q3["options"][1][3:] == q3["options"][3][3:]:
            q3["options"].pop()

    save(path, data)


def passage_number(pid):
    match = re.search(r"\d+", pid)
    return int(match.group()) if match else 9999


def repair_su(path):
    data = load(path)
    slug = path.stem

    # Keep the repair idempotent when rerun after questions were already grouped.
    if any(q.get("type") == "true_false" for q in data["questions"]):
        for question in data["questions"]:
            if question.get("type") == "true_false":
                question["answer"] = ["D" if value == "Đ" else value for value in question["answer"]]
        save(path, data)
        return

    # Fix known split contexts produced by tiny HTML differences in the source.
    passage_aliases = {}
    if "chu-de-7-" in slug:
        passage_aliases = {"p3": "p2", "p9": "p8"}
    for question in data["questions"]:
        pid = question.get("passageId")
        if pid in passage_aliases:
            question["passageId"] = passage_aliases[pid]
    for old_pid in passage_aliases:
        data["passages"].pop(old_pid, None)

    # Source item 14 of topic 8 lost its context although it is statement c of p3.
    if "chu-de-8-" in slug:
        for question in data["questions"]:
            if question["id"] == 14 and question["type"] == "short_answer":
                question["passageId"] = "p3"
        data["title"] = data["title"].replace("đối ngoại củ Việt Nam", "đối ngoại của Việt Nam")

    # Source item 38 of topic 9 has no real options (only self-mark buttons) but says C.
    if "chu-de-9-" in slug:
        data["questions"] = [q for q in data["questions"] if q["id"] != 38]

    for pid, text in list(data.get("passages", {}).items()):
        text = NOTICE_RE.sub("", text).strip()
        text = text.replace(".png\"", ".webp\"")
        data["passages"][pid] = text

    singles = [q for q in data["questions"] if q["type"] == "single"]
    statements_by_passage = {}
    for question in data["questions"]:
        if question["type"] != "short_answer":
            continue
        pid = question.get("passageId")
        if not pid or question.get("answer") not in ("Đ", "S"):
            raise RuntimeError(f"Cannot safely group item {question['id']} in {path}")
        statements_by_passage.setdefault(pid, []).append(question)

    true_false = []
    for pid in sorted(statements_by_passage, key=passage_number):
        items = statements_by_passage[pid]
        items.sort(key=lambda q: (STATEMENT_RE.match(q["content"]).group(1).lower()
                                  if STATEMENT_RE.match(q["content"]) else "z"))
        if len(items) != 4:
            raise RuntimeError(f"Expected four statements for {pid} in {path}, got {len(items)}")
        true_false.append({
            "id": 0,
            "type": "true_false",
            "content": "Xác định tính đúng hoặc sai của từng nhận định dựa trên tư liệu.",
            "passageId": pid,
            "statements": [STATEMENT_RE.sub("", q["content"]).strip() for q in items],
            "answer": ["D" if q["answer"] == "Đ" else q["answer"] for q in items],
        })

    data["questions"] = singles + true_false
    for index, question in enumerate(data["questions"], 1):
        question["id"] = index

    used = {q.get("passageId") for q in data["questions"] if q.get("passageId")}
    data["passages"] = {pid: text for pid, text in data["passages"].items() if pid in used}
    save(path, data)


def main():
    for path in VAN_FILES:
        repair_van(path)
        print(f"REPAIRED {path.relative_to(ROOT)}")
    for path in SU_FILES:
        repair_su(path)
        print(f"REPAIRED {path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

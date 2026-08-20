#!/usr/bin/env python3
"""
build_index.py
Quét toàn bộ data/<grade>/<subjectSlug>/<examType>/*.json, kiểm tra hợp lệ,
rồi tự sinh:
- data/index.json       mục lục đề thi (dùng cho trang danh sách/bộ lọc explore.html)
- data/topic-index.json mục lục câu hỏi có gắn nhãn "chuong"/"dang" (dùng cho trang
                         Ôn theo dạng + chương on-tap.html) — chỉ những câu hỏi có
                         thêm trường tùy chọn "chuong" mới được đưa vào đây.

Admin KHÔNG cần tự sửa 2 file trên bằng tay — chỉ cần thêm/sửa file đề đúng
chuẩn trong data/ rồi chạy:

    python3 scripts/build_index.py

Chạy xong sẽ báo có bao nhiêu đề / bao nhiêu câu được gắn nhãn chương, và báo lỗi
(nếu có) kèm đường dẫn file sai để sửa trước khi deploy. Nên chạy script này trong
GitHub Actions (CI) để tự động chặn deploy khi có đề bị lỗi định dạng.
"""
import json
import os
import sys
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
TAXONOMY_PATH = os.path.join(DATA_DIR, "taxonomy.json")
INDEX_PATH = os.path.join(DATA_DIR, "index.json")
TOPIC_INDEX_PATH = os.path.join(DATA_DIR, "topic-index.json")
STATS_PATH = os.path.join(DATA_DIR, "stats.json")

REQUIRED_TOP_FIELDS = ["id", "grade", "subjectSlug", "examType", "year", "title", "duration", "questions"]
VALID_QUESTION_TYPES = {"single", "true_false", "short_answer"}
ID_RE = re.compile(r"^[a-z0-9\-]+$")
STRUCTURED_ID_RE = re.compile(
    r"^(l(?:9|10|11|12))-([a-z0-9-]+?)-"
    r"(totnghiep|tuyensinh10|giuaki1|cuoiki1|giuaki2|cuoiki2|khaosat|hsg|"
    r"qda|tsa|vact|vsat|hsa|bca|ielts|toeic|hsk|topik|jlpt)-"
)
PLACEHOLDER_TAIL = "Chọn phương án trả lời đúng nhất cho câu hỏi trong đề thi."
PLACEHOLDER_OPTIONS = [
    "A. Phương án A", "B. Phương án B", "C. Phương án C", "D. Phương án D"
]


def load_taxonomy():
    with open(TAXONOMY_PATH, encoding="utf-8") as f:
        return json.load(f)


def find_exam_files():
    files = []
    for dirpath, dirnames, filenames in os.walk(DATA_DIR):
        # Bỏ qua thư mục mẫu - không phải đề thật
        dirnames[:] = [d for d in dirnames if d != "_template"]
        for fn in filenames:
            if not fn.endswith(".json"):
                continue
            if fn in ("taxonomy.json", "index.json", "explore-index.json", "topic-index.json", "id-map.json", "stats.json"):
                continue
            files.append(os.path.join(dirpath, fn))
    return sorted(files)


def validate_question(q, errors, prefix, allow_missing_answer=False):
    if "id" not in q:
        errors.append(f"{prefix}: câu hỏi thiếu 'id'")
        return
    qp = f"{prefix} câu {q.get('id')}"
    if "content" not in q or not str(q["content"]).strip():
        errors.append(f"{qp}: thiếu 'content'")
    qtype = q.get("type")
    if qtype not in VALID_QUESTION_TYPES:
        errors.append(f"{qp}: 'type' không hợp lệ ({qtype}) - phải là single/true_false/short_answer")
        return
    if qtype == "single":
        if not q.get("options") or len(q["options"]) < 2:
            errors.append(f"{qp}: thiếu 'options' (ít nhất 2 lựa chọn)")
        normalized_options = [
            re.sub(r"^\s*[A-Z][.)]\s*", "", str(opt)).strip().casefold()
            for opt in q.get("options", [])
        ]
        if len(normalized_options) != len(set(normalized_options)):
            errors.append(f"{qp}: có phương án bị trùng nội dung")
        if not allow_missing_answer and q.get("answer") not in [opt.strip()[0] for opt in q.get("options", [])]:
            errors.append(f"{qp}: 'answer' không khớp với chữ cái đầu của options")
    elif qtype == "true_false":
        stmts = q.get("statements", [])
        ans = q.get("answer", [])
        if not stmts:
            errors.append(f"{qp}: thiếu 'statements'")
        if not allow_missing_answer and len(ans) != len(stmts):
            errors.append(f"{qp}: số lượng 'answer' ({len(ans)}) không khớp số 'statements' ({len(stmts)})")
        if not allow_missing_answer and any(a not in ("D", "S") for a in ans):
            errors.append(f"{qp}: 'answer' của true_false chỉ được là 'D' hoặc 'S'")
    elif qtype == "short_answer":
        if not allow_missing_answer and ("answer" not in q or str(q["answer"]).strip() == ""):
            errors.append(f"{qp}: thiếu 'answer'")


def main():
    taxonomy = load_taxonomy()
    files = find_exam_files()
    errors = []
    index_entries = []
    topic_entries = []   # cho tính năng "Ôn theo dạng + chương"
    seen_ids = {}

    for path in files:
        rel_path = os.path.relpath(path, ROOT).replace(os.sep, "/")
        try:
            with open(path, encoding="utf-8") as f:
                data = json.load(f)
        except json.JSONDecodeError as e:
            errors.append(f"{rel_path}: JSON không hợp lệ ({e})")
            continue

        missing = [k for k in REQUIRED_TOP_FIELDS if k not in data]
        if missing:
            errors.append(f"{rel_path}: thiếu trường {missing}")
            continue

        if not isinstance(data["questions"], list) or not data["questions"]:
            errors.append(f"{rel_path}: 'questions' phải là danh sách không rỗng")
            continue

        if not ID_RE.match(data["id"]):
            errors.append(f"{rel_path}: id '{data['id']}' chỉ được chứa a-z, 0-9, dấu gạch ngang")
        if data["id"] in seen_ids:
            errors.append(f"{rel_path}: id '{data['id']}' bị trùng với {seen_ids[data['id']]}")
        else:
            seen_ids[data["id"]] = rel_path

        structured_id = STRUCTURED_ID_RE.match(data["id"])
        if structured_id:
            id_classification = structured_id.groups()
            metadata_classification = (data["grade"], data["subjectSlug"], data["examType"])
            if id_classification != metadata_classification:
                errors.append(
                    f"{rel_path}: grade/subjectSlug/examType {metadata_classification} "
                    f"không khớp tiền tố id {id_classification}"
                )

        if data["grade"] not in taxonomy["grades"]:
            errors.append(f"{rel_path}: grade '{data['grade']}' chưa khai báo trong taxonomy.json")
        if data["subjectSlug"] not in taxonomy["subjects"]:
            errors.append(f"{rel_path}: subjectSlug '{data['subjectSlug']}' chưa khai báo trong taxonomy.json")
        if data["examType"] not in taxonomy["examTypes"]:
            errors.append(f"{rel_path}: examType '{data['examType']}' chưa khai báo trong taxonomy.json")

        answer_source = data.get("answerSource", "ai")
        if data.get("questions") and all(
            PLACEHOLDER_TAIL in str(q.get("content", ""))
            and q.get("options") == PLACEHOLDER_OPTIONS
            for q in data["questions"]
        ):
            errors.append(f"{rel_path}: đề chỉ chứa câu hỏi/phương án mẫu, không có nội dung thật")
        for q in data.get("questions", []):
            validate_question(q, errors, rel_path, allow_missing_answer=answer_source in ("missing", "partial"))
            chuong = q.get("chuong")
            if chuong:  # trường tùy chọn, chỉ index nếu admin có gắn nhãn chương
                topic_entries.append({
                    "grade": data["grade"],
                    "subjectSlug": data["subjectSlug"],
                    "chuong": chuong,
                    "dang": q.get("dang", ""),
                    "examId": data["id"],
                    "examFile": rel_path,
                    "questionId": q.get("id"),
                    "qtype": q.get("type")
                })

        # Thư mục phải khớp với metadata bên trong file (tránh copy nhầm thư mục)
        expected_prefix = f"data/{data['grade']}/{data['subjectSlug']}/{data['examType']}/"
        if not rel_path.startswith(expected_prefix):
            errors.append(
                f"{rel_path}: nằm sai thư mục — theo metadata phải nằm trong '{expected_prefix}'"
            )

        if answer_source not in ("official", "ai", "missing", "partial"):
            errors.append(f"{rel_path}: 'answerSource' phải là 'official', 'ai', 'partial' hoặc 'missing' (hoặc bỏ trống)")

        index_entries.append({
            "id": data["id"],
            "grade": data["grade"],
            "subjectSlug": data["subjectSlug"],
            "examType": data["examType"],
            "year": data["year"],
            "code": data.get("code", ""),
            "title": data["title"],
            "duration": data["duration"],
            "questionCount": len(data.get("questions", [])),
            "answerSource": answer_source,
            "file": rel_path
        })

    if errors:
        print(f"❌ Có {len(errors)} lỗi, CHƯA sinh index.json:\n")
        for e in errors:
            print(" -", e)
        sys.exit(1)

    ANSWER_PRIORITY = {"official": 0, "ai": 1, "partial": 2, "missing": 3}
    index_entries.sort(key=lambda e: (
        ANSWER_PRIORITY.get(e.get("answerSource", "missing"), 9),
        e["grade"],
        e["subjectSlug"],
        e["examType"],
        -e["year"],
        e["title"]
    ))
    with open(INDEX_PATH, "w", encoding="utf-8") as f:
        # Đây là dữ liệu tải trực tiếp ở trang tìm đề. Viết dạng compact giúp
        # giảm đáng kể thời gian đọc file trên Live Server khi kho đề lớn.
        json.dump(index_entries, f, ensure_ascii=False, separators=(",", ":"))

    # Bản nhẹ dành riêng cho trang tìm đề. Dùng mảng vị trí để không lặp lại
    # tên khóa gần 2.000 lần và bỏ trường đường dẫn mà trang này không dùng.
    explore_entries = [
        [e["id"], e["grade"], e["subjectSlug"], e["examType"], e["year"],
         e["code"], e["title"], e["duration"], e["questionCount"], e["answerSource"]]
        for e in index_entries
    ]
    with open(os.path.join(DATA_DIR, "explore-index.json"), "w", encoding="utf-8") as f:
        json.dump(explore_entries, f, ensure_ascii=False, separators=(",", ":"))

    id_map = {e["id"]: e["file"] for e in index_entries}
    with open(os.path.join(DATA_DIR, "id-map.json"), "w", encoding="utf-8") as f:
        json.dump(id_map, f, ensure_ascii=False, separators=(",", ":"))

    with open(TOPIC_INDEX_PATH, "w", encoding="utf-8") as f:
        json.dump(topic_entries, f, ensure_ascii=False, indent=2)

    stats = {
        "examCount": len(index_entries),
        "questionCount": sum(entry["questionCount"] for entry in index_entries),
        "subjectCount": len({entry["subjectSlug"] for entry in index_entries}),
    }
    with open(STATS_PATH, "w", encoding="utf-8") as f:
        json.dump(stats, f, ensure_ascii=False, separators=(",", ":"))

    print(f"✅ Đã sinh data/index.json với {len(index_entries)} đề thi, không có lỗi.")
    print(f"✅ Đã sinh data/topic-index.json với {len(topic_entries)} câu hỏi có gắn nhãn chương/dạng.")
    print(f"✅ Đã sinh data/stats.json: {stats['examCount']} đề, {stats['questionCount']} câu, {stats['subjectCount']} môn.")


if __name__ == "__main__":
    main()

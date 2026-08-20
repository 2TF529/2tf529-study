#!/usr/bin/env python3
"""Audit the exam repository and optionally repair deterministic data issues.

The fixer intentionally handles only cases that do not require guessing:
- remove exams made entirely from the known generic placeholder template;
- align grade/subject/examType and location with a structured exam ID;
- remove image files that are not referenced by any remaining exam JSON.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SKIP_JSON = {
    "taxonomy.json",
    "index.json",
    "explore-index.json",
    "topic-index.json",
    "id-map.json",
    "stats.json",
}
IMAGE_SUFFIXES = {".webp", ".png", ".jpg", ".jpeg", ".gif", ".svg"}
EXAM_TYPES = (
    "totnghiep|tuyensinh10|giuaki1|cuoiki1|giuaki2|cuoiki2|khaosat|hsg|"
    "qda|tsa|vact|vsat|hsa|bca|ielts|toeic|hsk|topik|jlpt"
)
STRUCTURED_ID = re.compile(
    rf"^(l(?:9|10|11|12))-([a-z0-9-]+?)-({EXAM_TYPES})-"
)
DATA_IMAGE = re.compile(
    r"(?:^|[\"'=(\s])(/?data[/\\][^\"'<>\s]+?\.(?:webp|png|jpe?g|gif|svg))",
    re.IGNORECASE,
)

PLACEHOLDER_TAIL = (
    "Chọn phương án trả lời đúng nhất cho câu hỏi trong đề thi."
)
PLACEHOLDER_OPTIONS = [
    "A. Phương án A",
    "B. Phương án B",
    "C. Phương án C",
    "D. Phương án D",
]

# These IDs contain a subject token copied from the end of a school/place name.
# Their titles and current subject make the intended classification unambiguous.
CLASSIFICATION_OVERRIDES = {
    "2026-de-kscl-lan-1-van-12-so-thanh-hoa.json": ("l12", "van", "khaosat"),
    "2026-de-kscl-lan-1-tin-12-so-thanh-hoa.json": ("l12", "tin", "khaosat"),
    "2026-de-kscl-lan-1-su-12-so-thanh-hoa.json": ("l12", "su", "khaosat"),
    "2026-de-kscl-lan-1-sinh-12-so-thanh-hoa.json": ("l12", "sinh", "khaosat"),
    "2026-de-on-ck2-toan-10-truong-thpt-huong-hoa.json": ("l10", "toan", "cuoiki2"),
}
SUBJECT_ALIASES = {"tonghop": "tong-hop"}
EXPLICIT_TITLE_SUBJECTS = (
    (re.compile(r"\bmon\s+toan(?:\s+hoc)?\b"), "toan"),
    (re.compile(r"\bmon\s+(?:ngu\s+)?van\b"), "van"),
    (re.compile(r"\bmon\s+(?:tieng\s+)?anh\b"), "anh"),
    (re.compile(r"\bmon\s+vat\s+(?:li|ly)\b"), "li"),
    (re.compile(r"\bmon\s+hoa(?:\s+hoc)?\b"), "hoa"),
    (re.compile(r"\bmon\s+sinh(?:\s+hoc)?\b"), "sinh"),
    (re.compile(r"\bmon\s+lich\s+su\b"), "su"),
    (re.compile(r"\bmon\s+dia\s+(?:li|ly)\b"), "dia"),
)
ASSET_PATH_ALIASES = {
    "data/l10/hoa/cuoiki2/assets/2026-de-on-ck2-toan-10-truong-thpt-huong-hoa/":
        "data/l10/toan/cuoiki2/assets/2026-de-on-ck2-toan-10-truong-thpt-huong-hoa/",
    "data/l11/hoa/cuoiki2/assets/2026-de-on-ck2-toan-11-truong-thpt-huong-hoa/":
        "data/l11/toan/cuoiki2/assets/2026-de-on-ck2-toan-11-truong-thpt-huong-hoa/",
}


def exam_files() -> list[Path]:
    return [
        path
        for path in DATA.rglob("*.json")
        if path.name not in SKIP_JSON and "_template" not in path.parts
    ]


def load_exam(path: Path) -> dict | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if not isinstance(value, dict) or not isinstance(value.get("questions"), list):
        return None
    return value


def is_placeholder_exam(exam: dict) -> bool:
    questions = exam.get("questions", [])
    return bool(questions) and all(
        PLACEHOLDER_TAIL in str(question.get("content", ""))
        and question.get("options") == PLACEHOLDER_OPTIONS
        for question in questions
    )


def desired_classification(path: Path, exam: dict) -> tuple[str, str, str] | None:
    override = CLASSIFICATION_OVERRIDES.get(path.name)
    if override:
        return override
    match = STRUCTURED_ID.match(str(exam.get("id", "")))
    if match:
        grade, subject, exam_type = match.groups()
    else:
        grade = str(exam.get("grade", ""))
        subject = str(exam.get("subjectSlug", ""))
        exam_type = str(exam.get("examType", ""))
        if not grade or not subject or not exam_type:
            return None
    title = fold_text(str(exam.get("title", "")))
    explicit_subject = next(
        (slug for pattern, slug in EXPLICIT_TITLE_SUBJECTS if pattern.search(title)),
        None,
    )
    if explicit_subject:
        subject = explicit_subject
    if "tot nghiep" in title and grade == "l12":
        exam_type = "totnghiep"
    return grade, SUBJECT_ALIASES.get(subject, subject), exam_type


def fold_text(value: str) -> str:
    import unicodedata

    value = unicodedata.normalize("NFD", value.casefold())
    return "".join(char for char in value if unicodedata.category(char) != "Mn").replace("đ", "d")


def replace_id_classification(exam_id: str, target: tuple[str, str, str]) -> str:
    prefix = f"{target[0]}-{target[1]}-{target[2]}-"
    return STRUCTURED_ID.sub(prefix, exam_id, count=1)


def replace_asset_paths(value):
    replacements = 0
    if isinstance(value, dict):
        for key, child in value.items():
            value[key], count = replace_asset_paths(child)
            replacements += count
    elif isinstance(value, list):
        for index, child in enumerate(value):
            value[index], count = replace_asset_paths(child)
            replacements += count
    elif isinstance(value, str):
        for old, new in ASSET_PATH_ALIASES.items():
            count = value.count(old)
            if count:
                value = value.replace(old, new)
                replacements += count
    return value, replacements


TAG_LIKE = re.compile(r"<[^>\n]+>")
QUESTION_FIGURE = re.compile(
    r'<figure\s+class=["\']question-figure["\'][^>]*>.*?</figure>',
    re.IGNORECASE | re.DOTALL,
)


def escape_literal_html(value):
    replacements = 0
    if isinstance(value, dict):
        for key, child in value.items():
            value[key], count = escape_literal_html(child)
            replacements += count
    elif isinstance(value, list):
        for index, child in enumerate(value):
            value[index], count = escape_literal_html(child)
            replacements += count
    elif isinstance(value, str) and "<" in value and ">" in value:
        figures: list[str] = []

        def protect_figure(match: re.Match) -> str:
            figures.append(match.group(0))
            return f"@@QUESTION_FIGURE_{len(figures) - 1}@@"

        protected = QUESTION_FIGURE.sub(protect_figure, value)

        def escape_tag(match: re.Match) -> str:
            nonlocal replacements
            replacements += 1
            return html.escape(match.group(0), quote=False)

        protected = TAG_LIKE.sub(escape_tag, protected)
        for index, figure in enumerate(figures):
            protected = protected.replace(f"@@QUESTION_FIGURE_{index}@@", figure)
        value = protected
    return value, replacements


def collect_referenced_images(paths: list[Path]) -> set[Path]:
    referenced: set[Path] = set()
    for path in paths:
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError:
            continue
        for match in DATA_IMAGE.findall(raw):
            relative = match.replace("\\", "/").lstrip("/")
            referenced.add((ROOT / relative).resolve())
    return referenced


def has_duplicate_options(question: dict) -> bool:
    options = question.get("options")
    if not isinstance(options, list):
        return False
    normalized = [
        re.sub(r"^\s*[A-Z][.)]\s*", "", str(option)).strip().casefold()
        for option in options
    ]
    return len(normalized) != len(set(normalized))


def question_fingerprint(exam: dict) -> str:
    canonical = [
        {key: value for key, value in question.items() if key not in {"id", "chuong", "dang"}}
        for question in exam.get("questions", [])
    ]
    payload = json.dumps(
        canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return hashlib.sha256(payload).hexdigest()


def preferred_duplicate(paths: list[Path]) -> Path:
    answer_priority = {"official": 0, "ai": 1, "partial": 2, "missing": 3}

    def rank(path: Path) -> tuple:
        exam = load_exam(path) or {}
        return (
            answer_priority.get(exam.get("answerSource", "missing"), 9),
            1 if path.name.startswith("2026-vj-") else 0,
            -int(exam.get("year", 0) or 0),
            path.as_posix(),
        )

    return min(paths, key=rank)


def ensure_inside_workspace(path: Path) -> None:
    path.resolve().relative_to(ROOT.resolve())


def audit(
    apply: bool,
    remove_orphan_images: bool,
    remove_invalid_questions: bool,
    deduplicate_exams: bool,
    escape_tin_html: bool,
) -> int:
    paths = exam_files()
    placeholders: list[Path] = []
    mismatches: list[tuple[Path, dict, tuple[str, str, str]]] = []
    duplicate_question_ids: list[Path] = []
    duplicate_options = 0
    parse_errors = 0

    for path in paths:
        exam = load_exam(path)
        if exam is None:
            parse_errors += 1
            continue
        if is_placeholder_exam(exam):
            placeholders.append(path)
            continue
        target = desired_classification(path, exam)
        current = (exam.get("grade"), exam.get("subjectSlug"), exam.get("examType"))
        id_match = STRUCTURED_ID.match(str(exam.get("id", "")))
        id_classification = id_match.groups() if id_match else None
        if target and (target != current or (id_match is not None and id_classification != target)):
            mismatches.append((path, exam, target))

        question_ids = [str(question.get("id")) for question in exam["questions"]]
        if any(count > 1 for count in Counter(question_ids).values()):
            duplicate_question_ids.append(path)
        for question in exam["questions"]:
            if has_duplicate_options(question):
                duplicate_options += 1

    print(f"Exam JSON: {len(paths)}")
    print(f"Parse errors/non-exam JSON: {parse_errors}")
    print(f"Generic placeholder exams: {len(placeholders)}")
    print(f"Metadata/path mismatches: {len(mismatches)}")
    print(f"Exams with duplicate question IDs: {len(duplicate_question_ids)}")
    print(f"Questions with duplicate options: {duplicate_options}")

    if not apply:
        return 0

    for path in placeholders:
        ensure_inside_workspace(path)
        path.unlink()

    moved = 0
    for old_path, exam, target in mismatches:
        if not old_path.exists():
            continue
        exam["grade"], exam["subjectSlug"], exam["examType"] = target
        id_match = STRUCTURED_ID.match(str(exam.get("id", "")))
        id_classification = id_match.groups() if id_match else None
        if id_classification != target:
            exam["id"] = replace_id_classification(str(exam.get("id", "")), target)
        new_path = DATA / target[0] / target[1] / target[2] / old_path.name
        ensure_inside_workspace(old_path)
        ensure_inside_workspace(new_path)
        if new_path.exists() and new_path.resolve() != old_path.resolve():
            raise FileExistsError(f"Refusing to overwrite {new_path}")
        new_path.parent.mkdir(parents=True, exist_ok=True)
        new_path.write_text(
            json.dumps(exam, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        if new_path.resolve() != old_path.resolve():
            old_path.unlink()
        moved += 1

    removed_questions = 0
    removed_empty_exams = 0
    if remove_invalid_questions:
        for path in exam_files():
            exam = load_exam(path)
            if exam is None:
                continue
            original_count = len(exam["questions"])
            exam["questions"] = [
                question
                for question in exam["questions"]
                if not has_duplicate_options(question)
            ]
            removed_questions += original_count - len(exam["questions"])
            if not exam["questions"]:
                ensure_inside_workspace(path)
                path.unlink()
                removed_empty_exams += 1
            elif len(exam["questions"]) != original_count:
                path.write_text(
                    json.dumps(exam, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )

    repaired_asset_paths = 0
    for path in exam_files():
        exam = load_exam(path)
        if exam is None:
            continue
        exam, replacements = replace_asset_paths(exam)
        if replacements:
            path.write_text(
                json.dumps(exam, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            repaired_asset_paths += replacements

    escaped_tin_tags = 0
    if escape_tin_html:
        for path in exam_files():
            exam = load_exam(path)
            if exam is None or exam.get("subjectSlug") != "tin":
                continue
            exam, replacements = escape_literal_html(exam)
            if replacements:
                path.write_text(
                    json.dumps(exam, ensure_ascii=False, indent=2) + "\n",
                    encoding="utf-8",
                )
                escaped_tin_tags += replacements

    removed_duplicate_exams = 0
    if deduplicate_exams:
        groups: dict[str, list[Path]] = {}
        for path in exam_files():
            exam = load_exam(path)
            if exam is None:
                continue
            groups.setdefault(question_fingerprint(exam), []).append(path)
        for duplicate_paths in groups.values():
            if len(duplicate_paths) < 2:
                continue
            keep = preferred_duplicate(duplicate_paths)
            for path in duplicate_paths:
                if path == keep:
                    continue
                ensure_inside_workspace(path)
                path.unlink()
                removed_duplicate_exams += 1

    orphan_images: list[Path] = []
    if remove_orphan_images:
        remaining_paths = exam_files()
        referenced = collect_referenced_images(remaining_paths)
        all_images = [
            path
            for path in DATA.rglob("*")
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ]
        orphan_images = [path for path in all_images if path.resolve() not in referenced]
        for path in orphan_images:
            ensure_inside_workspace(path)
            path.unlink()

    print(f"Removed placeholder exams: {len(placeholders)}")
    print(f"Reclassified/moved exams: {moved}")
    print(f"Removed questions with duplicate options: {removed_questions}")
    print(f"Removed exams left empty: {removed_empty_exams}")
    print(f"Removed exact duplicate exams: {removed_duplicate_exams}")
    print(f"Repaired asset path references: {repaired_asset_paths}")
    print(f"Escaped literal HTML tags in Tin questions: {escaped_tin_tags}")
    print(f"Removed orphan images: {len(orphan_images)}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="apply deterministic repairs")
    parser.add_argument(
        "--remove-orphan-images",
        action="store_true",
        help="with --apply, delete images not referenced by any exam JSON",
    )
    parser.add_argument(
        "--escape-tin-html",
        action="store_true",
        help="with --apply, escape code-like HTML tags in Tin exams but preserve figures",
    )
    parser.add_argument(
        "--remove-invalid-questions",
        action="store_true",
        help="with --apply, remove questions containing duplicate options",
    )
    parser.add_argument(
        "--deduplicate-exams",
        action="store_true",
        help="with --apply, keep one preferred exam for each exact question set",
    )
    args = parser.parse_args()
    return audit(
        args.apply,
        args.remove_orphan_images,
        args.remove_invalid_questions,
        args.deduplicate_exams,
        args.escape_tin_html,
    )


if __name__ == "__main__":
    raise SystemExit(main())

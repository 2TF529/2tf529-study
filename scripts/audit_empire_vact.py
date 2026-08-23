#!/usr/bin/env python3
"""Read-only integrity audit for exams produced by import_empire_vact_local.py."""

from __future__ import annotations

import argparse
import json
import re
import shutil
from collections import defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "data" / "l12" / "tong-hop" / "vact"
TARGETS = [TARGET, ROOT / "data" / "l12" / "tong-hop" / "hsa"]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="delete invalid Empire imports")
    args = parser.parse_args()
    paths = sorted(path for target in TARGETS for path in target.glob("2026-empire-*.json"))
    issues: list[str] = []
    invalid_paths: set[Path] = set()
    titles: dict[str, list[str]] = defaultdict(list)
    ids: dict[str, list[str]] = defaultdict(list)
    question_count = 0
    image_count = 0
    for path in paths:
        try:
            exam = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError) as exc:
            issues.append(f"{path.name}: invalid JSON: {exc}")
            continue
        titles[str(exam.get("title", "")).strip().casefold()].append(path.name)
        ids[str(exam.get("id", ""))].append(path.name)
        questions = exam.get("questions") or []
        question_count += len(questions)
        if not questions:
            issues.append(f"{path.name}: no questions")
        for question in questions:
            content = str(question.get("content") or "")
            plain = re.sub(r"<[^>]+>", "", content).strip()
            if len(plain) < 2:
                issues.append(f"{path.name} Q{question.get('id')}: empty content")
            options = question.get("options") or []
            if question.get("type") == "single" and len(options) < 2:
                issues.append(f"{path.name} Q{question.get('id')}: incomplete options")
                invalid_paths.add(path)
            normalized_options = [
                re.sub(r"^\s*[A-Z]\s*[.):\-]\s*", "", re.sub(r"<[^>]+>", "", str(option)))
                .strip().casefold()
                for option in options
            ]
            if normalized_options and len(normalized_options) != len(set(normalized_options)):
                issues.append(f"{path.name} Q{question.get('id')}: duplicate option content")
                invalid_paths.add(path)
            if "@@EMPIRE_IMAGE_" in json.dumps(question, ensure_ascii=False):
                issues.append(f"{path.name} Q{question.get('id')}: unresolved image marker")
            rendered = "\n".join([content, *(str(option) for option in options)])
            for ref in re.findall(r'src=["\']([^"\']+)["\']', rendered):
                image_count += 1
                if ref.startswith("data/") and not (ROOT / ref).is_file():
                    issues.append(f"{path.name}: missing image {ref}")
    for title, duplicates in titles.items():
        if title and len(duplicates) > 1:
            issues.append(f"duplicate title: {title}: {duplicates}")
    for exam_id, duplicates in ids.items():
        if exam_id and len(duplicates) > 1:
            issues.append(f"duplicate id: {exam_id}: {duplicates}")
    if args.apply and invalid_paths:
        target_resolved = TARGET.resolve()
        for path in sorted(invalid_paths):
            owning_target = next(target for target in TARGETS if target in path.parents)
            path.resolve().relative_to(owning_target.resolve())
            stem = path.stem
            path.unlink()
            asset_dir = owning_target / "assets" / stem
            if asset_dir.exists():
                asset_dir.resolve().relative_to((owning_target / "assets").resolve())
                shutil.rmtree(asset_dir)
        print(f"Removed invalid Empire exams: {len(invalid_paths)}")
    print(
        f"Empire exams={len(paths)}, questions={question_count}, "
        f"image references={image_count}, issues={len(issues)}"
    )
    for issue in issues:
        print("ISSUE:", issue)
    return 1 if issues and not args.apply else 0


if __name__ == "__main__":
    raise SystemExit(main())

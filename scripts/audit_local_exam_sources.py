#!/usr/bin/env python3
"""Audit local PDF/DOCX exam sources before importing them.

The script is intentionally read-only. It classifies PDFs as text, mixed, or
scanned and flags tiny/broken DOCX files so batch importers do not accidentally
publish image-only or AccessDenied placeholder documents.
"""

from __future__ import annotations

import argparse
import json
import sys
import zipfile
from pathlib import Path


def inspect_pdf(path: Path) -> dict[str, object]:
    try:
        import fitz

        document = fitz.open(path)
        page_chars = [len(page.get_text("text").strip()) for page in document]
        pages = len(document)
        text_chars = sum(page_chars)
        text_pages = sum(chars >= 80 for chars in page_chars)
        ratio = text_pages / pages if pages else 0.0
        if text_chars < 100 or ratio < 0.2:
            kind = "scan"
        elif ratio < 0.8:
            kind = "mixed"
        else:
            kind = "text"
        return {
            "path": str(path),
            "type": "pdf",
            "status": "ok",
            "kind": kind,
            "pages": pages,
            "text_chars": text_chars,
            "text_page_ratio": round(ratio, 3),
            "size": path.stat().st_size,
        }
    except Exception as exc:  # one bad source must not stop the audit
        return {
            "path": str(path),
            "type": "pdf",
            "status": "broken",
            "error": str(exc),
            "size": path.stat().st_size,
        }


def inspect_docx(path: Path) -> dict[str, object]:
    status = "ok"
    reason = ""
    try:
        if path.stat().st_size < 30_000:
            status, reason = "rejected", "too-small"
        elif not zipfile.is_zipfile(path):
            status, reason = "broken", "not-a-zip-based-docx"
        else:
            with zipfile.ZipFile(path) as archive:
                if "word/document.xml" not in archive.namelist():
                    status, reason = "broken", "missing-word/document.xml"
    except Exception as exc:
        status, reason = "broken", str(exc)
    result: dict[str, object] = {
        "path": str(path),
        "type": "docx",
        "status": status,
        "size": path.stat().st_size,
    }
    if reason:
        result["reason"] = reason
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--json", action="store_true", dest="as_json")
    parser.add_argument("--only", choices=("all", "text", "mixed", "scan", "broken"), default="all")
    args = parser.parse_args()

    root = args.root.resolve()
    if not root.is_dir():
        parser.error(f"not a directory: {root}")

    results: list[dict[str, object]] = []
    for path in sorted(root.rglob("*")):
        suffix = path.suffix.lower()
        if not path.is_file() or suffix not in {".pdf", ".docx"}:
            continue
        result = inspect_pdf(path) if suffix == ".pdf" else inspect_docx(path)
        if args.only != "all":
            marker = result.get("kind") if result.get("status") == "ok" else result.get("status")
            if marker != args.only:
                continue
        results.append(result)

    if args.as_json:
        json.dump(results, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        for result in results:
            print(
                f"{result.get('status')}\t{result.get('kind', '-')}\t"
                f"{result.get('pages', '-')}p\t{result.get('text_chars', '-')}c\t"
                f"{result['path']}"
            )
        counts: dict[str, int] = {}
        for result in results:
            key = str(result.get("kind") or result.get("status"))
            counts[key] = counts.get(key, 0) + 1
        print("SUMMARY", json.dumps(counts, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Convert referenced exam PNG/JPEG assets to WebP safely.

Only images that are referenced by an exam JSON are converted. JSON files are
updated before originals are removed, and every generated image is verified by
Pillow. Run ``scripts/build_index.py`` after this script.
"""

from __future__ import annotations

import os
import re
import tempfile
from collections import defaultdict
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
RASTER_EXTENSIONS = {".png", ".jpg", ".jpeg"}
IMAGE_REFERENCE = re.compile(
    r'data/[^\s"\'<>]+?\.(?:png|jpe?g)(?:[?#][^\s"\'<>]*)?', re.I
)
QUALITY = 82


def normalized_path(value: str) -> str:
    return value.split("?", 1)[0].split("#", 1)[0].replace("\\", "/")


def collect_references() -> tuple[dict[Path, set[Path]], list[str]]:
    references: dict[Path, set[Path]] = defaultdict(set)
    missing = []
    for json_path in DATA.rglob("*.json"):
        if json_path.name in {
            "index.json", "topic-index.json", "taxonomy.json", "stats.json", "id-map.json"
        } or "_template" in json_path.parts:
            continue
        text = json_path.read_text(encoding="utf-8")
        for match in IMAGE_REFERENCE.finditer(text):
            relative = normalized_path(match.group(0))
            if not relative.startswith("data/"):
                continue
            source = ROOT / Path(relative)
            if not source.exists():
                missing.append(f"{json_path.relative_to(ROOT)} -> {relative}")
            elif source.suffix.lower() in RASTER_EXTENSIONS:
                references[source].add(json_path)
    return references, missing


def encode_webp(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary_name = tempfile.mkstemp(suffix=".webp", dir=target.parent)
    os.close(fd)
    temporary = Path(temporary_name)
    try:
        with Image.open(source) as image:
            image.load()
            has_alpha = image.mode in {"RGBA", "LA"} or (
                image.mode == "P" and "transparency" in image.info
            )
            image = image.convert("RGBA" if has_alpha else "RGB")
            image.save(temporary, "WEBP", quality=QUALITY, method=6)
        with Image.open(temporary) as check:
            check.verify()
        temporary.replace(target)
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    references, missing = collect_references()
    if missing:
        print("❌ Có đường dẫn ảnh bị thiếu; không tối ưu để tránh làm dữ liệu hỏng:")
        for item in missing[:20]:
            print(" -", item)
        raise SystemExit(1)

    replacements: dict[Path, dict[str, str]] = defaultdict(dict)
    converted: list[tuple[Path, Path, int, int]] = []
    for source, json_files in sorted(references.items(), key=lambda item: str(item[0])):
        target = source.with_suffix(".webp")
        source_size = source.stat().st_size
        encode_webp(source, target)
        old_relative = source.relative_to(ROOT).as_posix()
        new_relative = target.relative_to(ROOT).as_posix()
        for json_path in json_files:
            replacements[json_path][old_relative] = new_relative
        converted.append((source, target, source_size, target.stat().st_size))

    # Prepare every changed JSON first. If any replacement cannot be found,
    # stop before deleting originals.
    pending_text: dict[Path, str] = {}
    for json_path, mapping in replacements.items():
        text = json_path.read_text(encoding="utf-8")
        for old, new in mapping.items():
            if old not in text:
                raise RuntimeError(f"Không tìm thấy tham chiếu {old} trong {json_path}")
            text = text.replace(old, new)
        pending_text[json_path] = text

    for json_path, text in pending_text.items():
        json_path.write_text(text, encoding="utf-8")
    for source, _, _, _ in converted:
        source.unlink()

    before = sum(item[2] for item in converted)
    after = sum(item[3] for item in converted)
    saving = (1 - after / before) * 100 if before else 0
    print(f"✅ Đã chuyển {len(converted)} ảnh được tham chiếu sang WebP.")
    print(f"✅ Đã cập nhật {len(pending_text)} file JSON; không đụng tới ảnh không được tham chiếu.")
    print(f"📦 Dung lượng: {before / 1e6:.1f} MB -> {after / 1e6:.1f} MB (giảm {saving:.1f}%).")


if __name__ == "__main__":
    main()

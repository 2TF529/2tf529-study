#!/usr/bin/env python3
"""Move clearly HSA-labelled Empire imports out of the V-ACT collection."""

from __future__ import annotations

import json
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VACT = ROOT / "data" / "l12" / "tong-hop" / "vact"
HSA = ROOT / "data" / "l12" / "tong-hop" / "hsa"


def is_hsa(title: str) -> bool:
    upper = title.upper()
    return bool(re.search(r"(?:^|[^A-Z])HSA(?:[^A-Z]|$)", upper)) and "V-ACT" not in upper


def main() -> int:
    moved = 0
    for source in sorted(VACT.glob("2026-empire-*.json")):
        exam = json.loads(source.read_text(encoding="utf-8"))
        if not is_hsa(str(exam.get("title", ""))):
            continue
        HSA.mkdir(parents=True, exist_ok=True)
        target = HSA / source.name
        if target.exists():
            raise RuntimeError(f"Refusing to overwrite {target}")
        exam["examType"] = "hsa"
        exam["id"] = re.sub(
            r"^l12-tong-hop-vact-", "l12-tong-hop-hsa-", str(exam.get("id", "")), count=1
        )
        old_asset_ref = f"data/l12/tong-hop/vact/assets/{source.stem}"
        new_asset_ref = f"data/l12/tong-hop/hsa/assets/{source.stem}"
        raw = json.dumps(exam, ensure_ascii=False, indent=2).replace(old_asset_ref, new_asset_ref)
        target.write_text(raw + "\n", encoding="utf-8")
        source.unlink()

        old_assets = VACT / "assets" / source.stem
        if old_assets.exists():
            old_assets.resolve().relative_to((VACT / "assets").resolve())
            new_assets = HSA / "assets" / source.stem
            new_assets.parent.mkdir(parents=True, exist_ok=True)
            if new_assets.exists():
                raise RuntimeError(f"Refusing to overwrite {new_assets}")
            shutil.move(str(old_assets), str(new_assets))
        moved += 1
    print(f"Reclassified Empire exams V-ACT -> HSA: {moved}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

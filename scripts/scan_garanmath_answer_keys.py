"""Scan GaranMath PDFs and classify printed answer-key layouts without editing exams."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from recover_garanmath_from_pdf import DATA, download


ROOT = Path(__file__).resolve().parents[1]
ANSWER_HEADING = re.compile(
    r"(?im)^\s*(?:BẢNG\s+)?ĐÁP\s*ÁN(?:\s*(?:VÀ|&)?\s*(?:HƯỚNG\s*DẪN\s*(?:GIẢI|CHẤM))?)?\s*$"
)


def scan(item: tuple[Path, dict], temp: Path) -> dict:
    path, payload = item
    slug = payload["sourceId"].split(":", 1)[1]
    token = str(abs(hash(slug)))
    pdf, txt = temp / f"{token}.pdf", temp / f"{token}.txt"
    try:
        download(payload["sourceUrl"], pdf)
        subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), str(txt)],
                       check=True, capture_output=True, timeout=90)
        text = txt.read_text(encoding="utf-8", errors="ignore")
        headings = [m for m in ANSWER_HEADING.finditer(text) if m.start() > len(text) * .2]
        if not headings:
            return {"path": str(path), "slug": slug, "hasKey": False}
        start = headings[0].start()
        tail = text[start:]
        lines = [re.sub(r"\s+", " ", line).strip() for line in tail.splitlines()]
        lines = [line for line in lines if line][:100]
        return {
            "path": str(path), "slug": slug, "hasKey": True,
            "questionCount": len(payload.get("questions", [])),
            "keyStartRatio": round(start / len(text), 3),
            "preview": lines,
        }
    except Exception as exc:  # noqa: BLE001
        return {"path": str(path), "slug": slug, "hasKey": False, "error": str(exc)}
    finally:
        pdf.unlink(missing_ok=True)
        txt.unlink(missing_ok=True)


def main() -> None:
    items = []
    for path in DATA.rglob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        if str(payload.get("sourceId", "")).startswith("garanmath:"):
            items.append((path, payload))
    results = []
    with tempfile.TemporaryDirectory(prefix="scan-keys-") as name:
        temp = Path(name)
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(scan, item, temp) for item in items]
            for index, future in enumerate(as_completed(futures), 1):
                results.append(future.result())
                if index % 50 == 0:
                    print(f"{index}/{len(items)}", flush=True)
    report = ROOT / "reports" / "garanmath-answer-key-scan.json"
    report.write_text(json.dumps(results, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"files": len(results), "withKey": sum(r["hasKey"] for r in results),
                      "errors": sum("error" in r for r in results)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

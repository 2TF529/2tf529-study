"""Re-download GaranMath source PDFs and rebuild the damaged Antigravity batch.

Safe to re-run: each file is rebuilt from its immutable source PDF, never from
the already transformed JSON. Answers are copied only when printed in the PDF.
"""

from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from repair_antigravity_math_batch import clean_text, repair_pdf_question


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "l12" / "toan"
HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36"}
QUESTION_RE = re.compile(r"(?im)^\s*Câu\s+(\d+)\s*[.:]\s*")


def split_questions(text: str) -> list[str]:
    text = clean_text(text.translate(str.maketrans({
        "\uf022": "∀", "\uf02d": "−", "\uf070": "π", "\uf0a1": "ℝ",
        "\uf0a2": "′", "\uf0a3": "≤", "\uf0b3": "≥", "\uf0ce": "∈",
        "\uf0f2": "∫", "\uf0c8": "∩", "\uf0b0": "°",
    })))
    matches = list(QUESTION_RE.finditer(text))
    blocks = []
    seen = set()
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        block = text[match.start():end].replace("\f", "").strip()
        block = re.sub(r"(?im)^.*(?:Mã đề.*Trang|Trang.*Mã đề).*$", "", block).strip()
        key = re.sub(r"\s+", " ", block)
        if block and key not in seen:
            seen.add(key)
            blocks.append(block)
    return blocks


def download(url: str, target: Path) -> None:
    last_error = None
    for attempt in range(3):
        try:
            request = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
            if len(data) < 1000 or not data.startswith(b"%PDF"):
                raise ValueError("response is not a PDF")
            target.write_bytes(data)
            return
        except Exception as exc:  # noqa: BLE001 - report exact source failures
            last_error = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(str(last_error))


def rebuild(item: tuple[Path, dict], temp_root: Path) -> dict:
    path, payload = item
    slug = payload["sourceId"].split(":", 1)[1]
    token = re.sub(r"[^a-zA-Z0-9_-]", "_", slug)[:140]
    pdf = temp_root / f"{token}.pdf"
    txt = temp_root / f"{token}.txt"
    url = f"https://toanmath.com/toanmath-pdf/{slug}.pdf"
    try:
        download(url, pdf)
        subprocess.run(
            ["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), str(txt)],
            check=True, capture_output=True, timeout=90,
        )
        blocks = split_questions(txt.read_text(encoding="utf-8", errors="ignore"))
        if not blocks:
            return {"ok": False, "path": str(path), "error": "no questions"}
        questions = []
        known = single = latex = 0
        for block in blocks:
            repaired, used, has_answer, has_options = repair_pdf_question(
                {"content": block, "answer": ""}, len(questions) + 1
            )
            questions.append(repaired)
            known += int(has_answer)
            single += int(has_options)
            latex += used
        payload["questions"] = questions
        payload["sourceUrl"] = url
        payload["answerSource"] = "official" if known == len(questions) else "missing"
        payload["repairNote"] = (
            "Đã dựng lại trực tiếp từ PDF nguồn ToanMath; không tự suy đoán đáp án. "
                "Biểu thức chỉ được chuyển LaTeX khi nhận diện chắc chắn; hình/bảng khó giữ theo nguồn khi có."
        )
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "path": str(path), "q": len(questions), "known": known,
                "single": single, "short": len(questions) - single, "latex": latex}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "path": str(path), "error": str(exc)}
    finally:
        pdf.unlink(missing_ok=True)
        txt.unlink(missing_ok=True)


def main() -> None:
    items = []
    for path in DATA.rglob("*.json"):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if str(payload.get("sourceId", "")).startswith("garanmath:") and payload.get("repairNote"):
            items.append((path, payload))

    results = []
    workers = min(8, max(1, (os.cpu_count() or 4)))
    with tempfile.TemporaryDirectory(prefix="recover-garanmath-") as temp_name:
        temp_root = Path(temp_name)
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(rebuild, item, temp_root): item[0] for item in items}
            for index, future in enumerate(as_completed(futures), 1):
                result = future.result()
                results.append(result)
                status = "OK" if result["ok"] else "FAIL"
                print(f"[{index}/{len(items)}] {status} {futures[future].name}", flush=True)

    summary = {
        "files": len(items), "success": sum(r["ok"] for r in results),
        "failed": sum(not r["ok"] for r in results),
        "questions": sum(r.get("q", 0) for r in results),
        "knownAnswers": sum(r.get("known", 0) for r in results),
        "single": sum(r.get("single", 0) for r in results),
        "shortAnswer": sum(r.get("short", 0) for r in results),
        "latexFragments": sum(r.get("latex", 0) for r in results),
    }
    report = ROOT / "reports" / "garanmath-source-recovery.json"
    report.parent.mkdir(parents=True, exist_ok=True)
    report.write_text(json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    print(f"Report: {report.relative_to(ROOT)}")


if __name__ == "__main__":
    main()

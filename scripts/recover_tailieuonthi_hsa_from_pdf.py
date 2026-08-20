"""Rebuild HSA 33-43 from their printed answer-key PDFs."""

from __future__ import annotations

import json
import re
import subprocess
import tempfile
from pathlib import Path

import gdown

from repair_antigravity_math_batch import clean_text, repair_hsa_question


ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "l12" / "toan" / "hsa"
META = Path(r"C:\Users\legion\.gemini\antigravity\brain\b4783435-7c24-49d4-afa7-d17cd971d89d\scratch\tailieuonthi_pdf_links.json")
QUESTION_RE = re.compile(r"(?im)^\s*Câu\s+(\d+)\s*[:.]\s*")


def blocks(text: str) -> list[str]:
    text = clean_text(text)
    matches = list(QUESTION_RE.finditer(text))
    found = []
    for index, match in enumerate(matches):
        end = matches[index + 1].start() if index + 1 < len(matches) else len(text)
        value = text[match.start():end].replace("\f", "").strip()
        if value:
            found.append(value)
    return found


def choose_key(pdfs: list[Path]) -> Path | None:
    if not pdfs:
        return None
    marked = [p for p in pdfs if re.search(r"key|đáp|dap|lời giải|loi giai", p.name, re.I)]
    return max(marked or pdfs, key=lambda p: p.stat().st_size)


def main() -> None:
    metadata = {item["slug"]: item for item in json.loads(META.read_text(encoding="utf-8"))}
    results = []
    with tempfile.TemporaryDirectory(prefix="recover-hsa-") as temp_name:
        temp = Path(temp_name)
        for number in range(33, 44):
            slug = f"de-danh-gia-nang-luc-hsa-toan-hoc-so-{number}"
            rec = metadata.get(slug)
            target = DATA / f"tlot-toan-hsa-{slug}.json"
            if not rec or not target.exists():
                results.append({"number": number, "ok": False, "error": "metadata/target missing"})
                continue
            folder = temp / str(number)
            folder.mkdir()
            try:
                gdown.download_folder(rec["links"][0], output=str(folder), quiet=True)
                key_pdf = choose_key(list(folder.rglob("*.pdf")))
                if not key_pdf:
                    raise RuntimeError("answer-key PDF not found")
                txt = folder / "key.txt"
                subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(key_pdf), str(txt)],
                               check=True, capture_output=True, timeout=90)
                raw_blocks = blocks(txt.read_text(encoding="utf-8", errors="ignore"))
                # An answer key must contain a printed answer for most questions.
                if len(raw_blocks) < 40:
                    raise RuntimeError(f"only {len(raw_blocks)} question blocks")
                repaired = []
                known = single = latex = 0
                seen_numbers = set()
                for block in raw_blocks:
                    match = QUESTION_RE.match(block)
                    source_number = int(match.group(1)) if match else len(repaired) + 1
                    if source_number in seen_numbers:
                        continue
                    seen_numbers.add(source_number)
                    question, used, has_answer = repair_hsa_question({"content": block}, len(repaired) + 1)
                    repaired.append(question)
                    known += int(has_answer)
                    single += int(question["type"] == "single")
                    latex += used
                    if len(repaired) == 50:
                        break
                payload = json.loads(target.read_text(encoding="utf-8"))
                payload["questions"] = repaired
                payload["sourceUrl"] = rec["url"]
                payload["answerSource"] = "official" if known == len(repaired) else "missing"
                payload["repairNote"] = (
                    "Đã dựng lại từ PDF đáp án in sẵn của Tailieuonthi; không tự suy đoán đáp án. "
                    "Lời giải đã tách khỏi đề và công thức rõ ràng được chuyển sang LaTeX."
                )
                target.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                results.append({"number": number, "ok": True, "questions": len(repaired),
                                "known": known, "single": single,
                                "shortAnswer": len(repaired) - single, "latex": latex,
                                "sourceFile": key_pdf.name})
                print(f"HSA {number}: OK ({len(repaired)} câu, {known} đáp án)", flush=True)
            except Exception as exc:  # noqa: BLE001
                results.append({"number": number, "ok": False, "error": str(exc)})
                print(f"HSA {number}: FAIL {exc}", flush=True)

    summary = {"success": sum(r["ok"] for r in results), "failed": sum(not r["ok"] for r in results),
               "questions": sum(r.get("questions", 0) for r in results),
               "knownAnswers": sum(r.get("known", 0) for r in results)}
    report = ROOT / "reports" / "tailieuonthi-hsa-source-recovery.json"
    report.write_text(json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

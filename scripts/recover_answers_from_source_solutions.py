"""Recover explicit answers from each question's printed PDF solution block."""

from __future__ import annotations

import html
import json
import re
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from recover_garanmath_from_pdf import DATA, download, split_questions
from recover_embedded_answer_tables import statements


ROOT = Path(__file__).resolve().parents[1]


def normalized(value: object) -> str:
    text = html.unescape(re.sub(r"<[^>]+>", " ", str(value or ""))).lower()
    text = re.sub(r"câu\s+\d+\s*[:.]?", "", text, count=1)
    return re.sub(r"\W+", "", text)[:700]


def choice_answer(block: str) -> str:
    patterns = [
        r"(?is)Lời\s*giải.{0,100}?Chọn\s*#?\s*([A-D])\b",
        r"(?i)Đáp\s*án\s*đúng\s*là\s*[\"“”']?\s*([A-D])\b",
        r"(?im)^\s*Chọn\s*#?\s*([A-D])\b",
    ]
    found = []
    for pattern in patterns:
        found.extend(re.findall(pattern, block))
    return found[0].upper() if found and len(set(v.upper() for v in found)) == 1 else ""


def short_answer(block: str) -> str:
    patterns = [
        r"(?i)Đáp\s*số\s*[:：]\s*[\"“”']?\s*([-−]?\d+(?:[.,]\d+)?)",
        r"(?i)Đáp\s*án\s*đúng\s*là\s*[\"“”']\s*([-−]?\d+(?:[.,]\d+)?)",
    ]
    found = []
    for pattern in patterns:
        found.extend(re.findall(pattern, block))
    cleaned = [v.replace("−", "-") for v in found]
    return cleaned[0] if cleaned and len(set(cleaned)) == 1 else ""


def true_false_answer(block: str) -> list[str]:
    solution = re.split(r"(?i)Lời\s*giải", block, maxsplit=1)
    if len(solution) < 2:
        return []
    tail = solution[1]
    result = []
    for letter in "abcd":
        match = re.search(rf"(?i)(?:^|\n)\s*{letter}\)\s*(Đúng|Sai)\b", tail)
        if not match:
            return []
        result.append("D" if match.group(1).lower() == "đúng" else "S")
    return result


def match_blocks(questions: list[dict], blocks: list[str]) -> list[str | None]:
    normalized_blocks = [normalized(block) for block in blocks]
    output = []
    start = 0
    for question in questions:
        needle = normalized(question.get("content"))
        best_index = -1
        best_score = 0.0
        # Preserve order but allow solution duplicates and nearby OCR splits.
        for index in range(max(0, start - 2), min(len(blocks), start + 80)):
            haystack = normalized_blocks[index]
            if not needle or not haystack:
                continue
            score = 0.0
            for size, confidence in ((180, .99), (120, .97), (80, .92), (55, .82)):
                key = needle[:size]
                if len(key) >= size and key in haystack:
                    score = confidence
                    break
            if score > best_score:
                best_score, best_index = score, index
        if best_index >= 0 and best_score >= .82:
            output.append(blocks[best_index])
            start = best_index + 1
        else:
            output.append(None)
    return output


def process(path: Path, payload: dict, temp: Path) -> dict:
    slug = payload["sourceId"].split(":", 1)[1]
    token = str(abs(hash(slug)))
    pdf, txt = temp / f"{token}.pdf", temp / f"{token}.txt"
    try:
        download(payload["sourceUrl"], pdf)
        subprocess.run(["pdftotext", "-layout", "-enc", "UTF-8", str(pdf), str(txt)],
                       check=True, capture_output=True, timeout=90)
        blocks = split_questions(txt.read_text(encoding="utf-8", errors="ignore"))
        questions = payload.get("questions", [])
        matches = match_blocks(questions, blocks)
        recovered = {"choice": 0, "short": 0, "trueFalse": 0}
        for question, block in zip(questions, matches):
            if not block or str(question.get("answer", "")).strip():
                continue
            if question.get("type") == "single":
                answer = choice_answer(block)
                letters = {str(v).strip()[:1] for v in question.get("options", [])}
                if answer in letters:
                    question["answer"] = answer
                    recovered["choice"] += 1
                    continue
            tf_answer = true_false_answer(block)
            tf_statements = statements(question.get("content", ""))
            if len(tf_answer) == 4 and len(tf_statements) == 4:
                question["type"] = "true_false"
                question.pop("options", None)
                question["statements"] = tf_statements
                question["answer"] = tf_answer
                recovered["trueFalse"] += 1
                continue
            answer = short_answer(block)
            if answer:
                question["answer"] = answer
                recovered["short"] += 1
        total = sum(recovered.values())
        if total:
            complete = all(str(q.get("answer", "")).strip() for q in questions)
            if complete:
                payload["answerSource"] = "official"
            else:
                payload["answerSource"] = "partial"
            payload["answerRecoveryNote"] = "Bổ sung đáp án được in trực tiếp trong lời giải/đáp số của PDF nguồn; không dùng AI suy đoán."
            path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        return {"ok": True, "file": str(path.relative_to(ROOT)), "complete": payload.get("answerSource") == "official", **recovered}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "file": str(path.relative_to(ROOT)), "error": str(exc)}
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
        if str(payload.get("sourceId", "")).startswith("garanmath:") and payload.get("answerSource") != "official":
            items.append((path, payload))
    results = []
    with tempfile.TemporaryDirectory(prefix="source-solutions-") as name:
        temp = Path(name)
        with ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(process, path, payload, temp) for path, payload in items]
            for index, future in enumerate(as_completed(futures), 1):
                results.append(future.result())
                if index % 50 == 0:
                    print(f"{index}/{len(items)}", flush=True)
    summary = {
        "filesScanned": len(results), "errors": sum(not r["ok"] for r in results),
        "choiceAnswers": sum(r.get("choice", 0) for r in results),
        "shortAnswers": sum(r.get("short", 0) for r in results),
        "trueFalseQuestions": sum(r.get("trueFalse", 0) for r in results),
        "newOfficialExams": sum(r.get("complete", False) for r in results),
    }
    report = ROOT / "reports" / "source-solution-answer-recovery.json"
    report.write_text(json.dumps({"summary": summary, "results": results}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

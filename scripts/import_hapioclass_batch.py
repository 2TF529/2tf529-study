#!/usr/bin/env python3
"""Import the logged-in HAPIOClass VSTEP and APTIS catalog into the local exam schema.

Authentication is supplied by the caller as an in-memory Cookie header.  This file never
writes cookies or tokens.  API responses are cached under scratch/ so interrupted runs can
resume; the cache can be removed after validation.
"""

from __future__ import annotations

import concurrent.futures
import html
import json
import re
import time
import unicodedata
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
CACHE = ROOT / "scratch" / "hapioclass"
BASE = "https://hapioclass.com"
LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return value or "de-thi"


def request_json(path: str, cookie: str = "", retries: int = 6):
    headers = {"Accept": "application/json", "User-Agent": "Mozilla/5.0"}
    if cookie:
        headers["Cookie"] = cookie
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(
                urllib.request.Request(BASE + path, headers=headers), timeout=75
            ) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            if exc.code not in (429, 500, 502, 503, 504) or attempt == retries - 1:
                raise
        except (TimeoutError, urllib.error.URLError):
            if attempt == retries - 1:
                raise
        time.sleep(min(20, 1.5 * (2**attempt)))


def cached_json(kind: str, slug: str, endpoint: str, cookie: str):
    path = CACHE / kind / f"{slugify(slug)}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    data = request_json(endpoint, cookie)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return data


def clean_text(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\ufeff", "").replace("\u00a0", " ")
    return re.sub(r"[ \t]+", " ", text).strip()


def text_html(value) -> str:
    text = clean_text(value)
    if not text:
        return ""
    return "".join(f"<p>{html.escape(p)}</p>" for p in re.split(r"\n\s*\n", text) if p.strip())


def media_html(audio: str = "", images=()) -> str:
    out = []
    if audio:
        out.append(
            f'<audio controls preload="none" src="{html.escape(audio, quote=True)}">'
            "Trình duyệt không hỗ trợ âm thanh.</audio>"
        )
    for image in images or ():
        if image:
            out.append(
                '<figure class="question-figure"><img loading="lazy" '
                f'src="{html.escape(str(image), quote=True)}" alt="Hình minh họa câu hỏi"></figure>'
            )
    return "".join(out)


def unique_options(values):
    result, seen = [], set()
    for value in values or []:
        if isinstance(value, dict):
            value = value.get("en") or value.get("text") or value.get("label") or value.get("value")
        value = clean_text(value)
        key = value.casefold()
        if value and key not in seen:
            result.append(value)
            seen.add(key)
    return result[:26]


def single_question(content: str, choices, correct=None, explanation="", passage_id=None, extra=None):
    choices = unique_options(choices)
    if correct is not None:
        correct = clean_text(correct)
        if correct and correct.casefold() not in {x.casefold() for x in choices} and len(choices) < 26:
            choices.append(correct)
    if len(choices) < 2:
        return None
    answer = None
    if correct is not None:
        correct_key = clean_text(correct).casefold()
        for i, value in enumerate(choices):
            if value.casefold() == correct_key:
                answer = LETTERS[i]
                break
    q = {
        "type": "single",
        "content": content or "Chọn phương án đúng.",
        "options": [f"{LETTERS[i]}. {value}" for i, value in enumerate(choices)],
        "answer": answer,
    }
    if passage_id:
        q["passageId"] = passage_id
    if explanation:
        q["explanation"] = clean_text(explanation)
    if extra:
        q.update(extra)
    return q


def open_question(content: str, sample="", passage_id=None, extra=None):
    q = {"type": "short_answer", "responseMode": "long", "content": content, "answer": None}
    if sample:
        q["sampleAnswer"] = clean_text(sample)
    if passage_id:
        q["passageId"] = passage_id
    if extra:
        q.update(extra)
    return q


def resolve_correct(options, correct):
    if correct is None:
        return None
    if isinstance(correct, int) or (isinstance(correct, str) and correct.isdigit()):
        index = int(correct)
        return options[index] if 0 <= index < len(options) else None
    correct = clean_text(correct)
    if len(correct) == 1 and correct.upper() in LETTERS:
        index = LETTERS.index(correct.upper())
        return options[index] if index < len(options) else None
    return correct


def finalise_exam(meta, questions, passages, exam_type, duration):
    for i, question in enumerate(questions, 1):
        question["id"] = i
    answered = sum(q.get("answer") not in (None, "", []) for q in questions)
    source = "official" if answered == len(questions) else ("partial" if answered else "missing")
    year = int(str(meta.get("createdAt") or "2026")[:4])
    source_slug = slugify(meta.get("slug") or meta.get("title"))
    exam_id = f"l12-anh-{exam_type}-{year}-{source_slug}"
    return {
        "id": exam_id,
        "grade": "l12",
        "subjectSlug": "anh",
        "examType": exam_type,
        "year": year,
        "code": meta.get("level") or meta.get("bundle") or "",
        "title": clean_text(meta.get("title")) or source_slug,
        "duration": max(1, int(round(duration))),
        "answerSource": source,
        "passages": passages,
        "questions": questions,
    }


def normalise_vstep(data):
    questions, passages = [], {}
    duration = 0
    for section in data.get("sections") or []:
        duration += int(section.get("durationMinutes") or 0)
        skill = clean_text(section.get("skill") or section.get("label") or "VSTEP")
        for slot_no, slot in enumerate(section.get("slots") or [], 1):
            raw = slot.get("question") or {}
            part = clean_text(slot.get("partLabel") or raw.get("title") or f"Phần {slot_no}")
            audio = raw.get("audioUrl") or ""
            images = [raw.get("imageUrl")]
            payload = raw.get("payload") if isinstance(raw.get("payload"), dict) else {}
            for key in ("imageUrl", "imageUrlLeft", "imageUrlRight"):
                if payload.get(key):
                    images.append(payload[key])
            passage = raw.get("passageEn") or payload.get("passage") or payload.get("context")
            passage_id = None
            if passage:
                passage_id = f"p{len(passages) + 1}"
                passages[passage_id] = text_html(passage)
            prefix = f"<strong>{html.escape(skill)} — {html.escape(part)}</strong>" + media_html(audio, images)
            items = raw.get("items") or payload.get("items") or []
            if not items and payload.get("groups"):
                items = [item for group in payload["groups"] for item in group.get("items", [])]
            if items:
                pool = payload.get("optionsPool") or payload.get("options") or []
                for item in items:
                    stem = item.get("stemEn") or item.get("prompt") or item.get("sentence") or item.get("speaker")
                    opts_raw = item.get("options") or pool
                    options = unique_options(opts_raw)
                    correct = item.get("correctOption")
                    if isinstance(opts_raw, list) and opts_raw and isinstance(opts_raw[0], dict):
                        marked = next((o.get("en") or o.get("text") for o in opts_raw if o.get("correct")), None)
                        correct = marked or resolve_correct(options, correct)
                    else:
                        correct = resolve_correct(options, correct)
                    q = single_question(
                        prefix + f"<p>{html.escape(clean_text(stem))}</p>", options, correct,
                        item.get("explanation") or "", passage_id,
                        {"chuong": f"VSTEP — {skill}"},
                    )
                    if q:
                        questions.append(q)
                    else:
                        questions.append(open_question(prefix + f"<p>{html.escape(clean_text(stem))}</p>", item.get("sampleAnswer") or "", passage_id, {"chuong": f"VSTEP — {skill}"}))
                continue
            prompts = payload.get("prompts") or raw.get("prompts") or []
            if not prompts:
                prompt = raw.get("promptEn") or payload.get("prompt") or payload.get("formalPrompt") or payload.get("informalPrompt") or raw.get("title")
                prompts = [{"prompt": prompt, "sampleAnswer": payload.get("sampleAnswer") or payload.get("formalSampleAnswer") or payload.get("informalSampleAnswer")}]
            for item in prompts:
                prompt = item if isinstance(item, str) else item.get("prompt") or item.get("promptEn") or item.get("text")
                sample = "" if isinstance(item, str) else item.get("sampleAnswer") or item.get("sampleEn") or ""
                questions.append(open_question(prefix + f"<p>{html.escape(clean_text(prompt))}</p>", sample, passage_id, {"chuong": f"VSTEP — {skill}"}))
    return finalise_exam(data, questions, passages, "vstep", duration or 60)


def aptis_items(payload):
    if payload.get("items"):
        return payload["items"]
    if payload.get("groups"):
        return [item for group in payload["groups"] for item in group.get("items", [])]
    return []


def normalise_aptis(data):
    questions, passages = [], {}
    duration = int(data.get("totalDurationSeconds") or 3600) / 60
    for section in data.get("sections") or []:
        section_name = clean_text(section.get("title") or section.get("sectionType") or "APTIS")
        for part in section.get("parts") or []:
            part_name = clean_text(part.get("title") or part.get("partType") or "")
            for raw in part.get("questions") or []:
                qtype = raw.get("questionType") or ""
                p = raw.get("payloadJson") or {}
                audio = p.get("audioUrl") or part.get("directionAudioUrl") or ""
                images = [p.get("imageUrl"), p.get("imageUrlLeft"), p.get("imageUrlRight")]
                prefix = f"<strong>{html.escape(section_name)} — {html.escape(part_name)}</strong>" + media_html(audio, images)
                passage = p.get("passage") or p.get("context")
                passage_id = None
                if passage and qtype.startswith("reading"):
                    passage_id = f"p{len(passages) + 1}"
                    passages[passage_id] = text_html(passage)
                extra = {"chuong": f"APTIS — {section_name}"}

                if qtype == "core_grammar":
                    options = unique_options(p.get("options"))
                    correct = resolve_correct(options, p.get("correctOption"))
                    q = single_question(prefix + f"<p>{html.escape(clean_text(p.get('sentence')))}</p>", options, correct, p.get("explanation"), passage_id, extra)
                    if q: questions.append(q)
                    continue

                if qtype.startswith("vocabulary") or qtype.startswith("listening"):
                    pool = unique_options(p.get("optionsPool") or p.get("options"))
                    for item in aptis_items(p):
                        options = unique_options(item.get("options") or pool)
                        correct = resolve_correct(options, item.get("correctOption"))
                        stem = item.get("prompt") or item.get("sentence") or item.get("speaker") or "Chọn phương án phù hợp."
                        q = single_question(prefix + f"<p>{html.escape(clean_text(stem))}</p>", options, correct, item.get("explanation"), passage_id, extra)
                        if q: questions.append(q)
                    continue

                if qtype == "reading_sentence":
                    for gap_no, gap in enumerate(p.get("gaps") or [], 1):
                        if gap.get("locked"): continue
                        options = unique_options(gap.get("options"))
                        correct = resolve_correct(options, gap.get("correctOption"))
                        q = single_question(prefix + f"<p>Chọn từ phù hợp cho chỗ trống số {gap_no}.</p>", options, correct, passage_id=passage_id, extra=extra)
                        if q: questions.append(q)
                    continue

                if qtype == "reading_cohesion":
                    sentences = p.get("sentences") or []
                    content = prefix + "<p>Sắp xếp các câu theo thứ tự đúng:</p><ol>" + "".join(f"<li>{html.escape(clean_text(x.get('text')))}</li>" for x in sentences) + "</ol>"
                    answer = ",".join(str(x.get("id")) for x in sorted(sentences, key=lambda x: x.get("correctPosition", 0)))
                    questions.append({"type":"short_answer","content":content,"answer":answer,"chuong":extra["chuong"]})
                    continue

                if qtype in ("reading_opinion", "reading_long"):
                    if qtype == "reading_opinion":
                        pool = [x.get("name") or x.get("title") or f"Person {LETTERS[i]}" for i, x in enumerate(p.get("paragraphs") or [])]
                    else:
                        pool = p.get("headings") or []
                    for item in p.get("items") or []:
                        options = unique_options(item.get("options") or pool)
                        correct = resolve_correct(options, item.get("correctOption"))
                        q = single_question(prefix + f"<p>{html.escape(clean_text(item.get('prompt')))}</p>", options, correct, item.get("explanation"), passage_id, extra)
                        if q: questions.append(q)
                    continue

                if qtype.startswith("writing"):
                    items = p.get("items") or []
                    if qtype == "writing_p4":
                        items = [
                            {"prompt": p.get("informalPrompt"), "sampleAnswer": p.get("informalSampleAnswer")},
                            {"prompt": p.get("formalPrompt"), "sampleAnswer": p.get("formalSampleAnswer")},
                        ]
                    elif not items:
                        items = [{"prompt": p.get("prompt") or p.get("context"), "sampleAnswer": p.get("sampleAnswer")}]
                    for item in items:
                        questions.append(open_question(prefix + f"<p>{html.escape(clean_text(item.get('prompt')))}</p>", item.get("sampleAnswer") or item.get("sampleEn") or "", passage_id, extra))
                    continue

                if qtype.startswith("speaking"):
                    prompts = p.get("prompts") or [{"prompt": p.get("prompt"), "sampleAnswer": p.get("sampleAnswer") or p.get("sampleEn")}]
                    for item in prompts:
                        item_audio = item.get("audioUrl") if isinstance(item, dict) else ""
                        prompt = item.get("prompt") if isinstance(item, dict) else item
                        sample = (item.get("sampleAnswer") or item.get("sampleEn") or "") if isinstance(item, dict) else ""
                        questions.append(open_question(prefix + media_html(item_audio) + f"<p>{html.escape(clean_text(prompt))}</p>", sample, passage_id, extra))
                    continue

                prompt = p.get("prompt") or p.get("sentence") or p.get("context") or qtype
                questions.append(open_question(prefix + f"<p>{html.escape(clean_text(prompt))}</p>", p.get("sampleAnswer") or "", passage_id, extra))
    return finalise_exam(data, questions, passages, "aptis", duration)


def existing_titles():
    path = DATA / "index.json"
    if not path.exists(): return set()
    return {clean_text(x.get("title")).casefold() for x in json.loads(path.read_text(encoding="utf-8"))}


def write_exam(exam):
    folder = DATA / exam["grade"] / exam["subjectSlug"] / exam["examType"]
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{exam['id'].removeprefix('l12-anh-' + exam['examType'] + '-')}.json"
    path.write_text(json.dumps(exam, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def run_with_cookie(cookie: str, workers: int = 4):
    CACHE.mkdir(parents=True, exist_ok=True)
    known = existing_titles()
    # Dashboard group "Đề thi thử" + "Theo kỹ năng".  One-slot records belong to
    # "Theo dạng câu" (thousands of atomic drills), so they are intentionally excluded.
    vstep_catalog = [
        item for item in request_json("/api/proxy/exams/vstep/runtime/exams", cookie)
        if int(item.get("slotCount") or 0) > 1
    ]
    aptis_catalog = request_json("/api/proxy/exams/aptis/catalog", cookie).get("items", [])

    jobs = []
    for item in vstep_catalog:
        if clean_text(item.get("title")).casefold() not in known:
            jobs.append(("vstep", item, f"/api/proxy/exams/vstep/runtime/exams/{item['slug']}/review"))
    for item in aptis_catalog:
        if clean_text(item.get("title")).casefold() not in known:
            jobs.append(("aptis", item, f"/api/proxy/exams/aptis/runtime/exams/by-slug/{item['slug']}"))

    def fetch(job):
        kind, item, endpoint = job
        return kind, item, cached_json(kind, item["slug"], endpoint, cookie)

    created, failed = [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(fetch, job): job for job in jobs}
        for number, future in enumerate(concurrent.futures.as_completed(futures), 1):
            kind, item, _ = futures[future]
            try:
                _, _, raw = future.result()
                exam = normalise_vstep(raw) if kind == "vstep" else normalise_aptis(raw)
                if not exam["questions"]:
                    raise ValueError("không trích được câu hỏi")
                created.append(str(write_exam(exam).relative_to(ROOT)))
            except Exception as exc:
                failed.append({"kind": kind, "slug": item.get("slug"), "error": str(exc)})
            if number % 50 == 0 or number == len(jobs):
                print(f"Đã xử lý {number}/{len(jobs)} — tạo {len(created)}, lỗi {len(failed)}", flush=True)
    report = {"catalogVstep": len(vstep_catalog), "catalogAptis": len(aptis_catalog), "created": len(created), "failed": failed}
    (CACHE / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return report


def run_with_browser_fetch(fetch_batch, batch_size: int = 4, include_vstep: bool = True, include_aptis: bool = True):
    """Import through the page's fetch API (cookie stays inside the browser process).

    ``fetch_batch`` receives ``[(kind, slug, endpoint), ...]`` and returns decoded JSON
    payloads in the same order.  Small batches avoid CDP message/time limits.
    """
    CACHE.mkdir(parents=True, exist_ok=True)
    known = existing_titles()
    vstep_catalog = [
        item for item in request_json("/api/proxy/exams/vstep/runtime/exams")
        if int(item.get("slotCount") or 0) > 1
    ]
    aptis_catalog = request_json("/api/proxy/exams/aptis/catalog").get("items", [])
    jobs = []
    for item in vstep_catalog:
        if include_vstep and clean_text(item.get("title")).casefold() not in known:
            jobs.append(("vstep", item, f"/api/proxy/exams/vstep/runtime/exams/{item['slug']}/review"))
    for item in aptis_catalog:
        if include_aptis and clean_text(item.get("title")).casefold() not in known:
            jobs.append(("aptis", item, f"/api/proxy/exams/aptis/runtime/exams/by-slug/{item['slug']}"))

    created, failed, pending = [], [], []
    rate_limited = False

    def consume(kind, item, raw):
        try:
            exam = normalise_vstep(raw) if kind == "vstep" else normalise_aptis(raw)
            if not exam["questions"]:
                raise ValueError("không trích được câu hỏi")
            created.append(str(write_exam(exam).relative_to(ROOT)))
        except Exception as exc:
            failed.append({"kind": kind, "slug": item.get("slug"), "error": str(exc)})

    for job in jobs:
        kind, item, endpoint = job
        path = CACHE / kind / f"{slugify(item['slug'])}.json"
        if path.exists():
            consume(kind, item, json.loads(path.read_text(encoding="utf-8")))
        else:
            pending.append(job)

    for start in range(0, len(pending), batch_size):
        batch = pending[start:start + batch_size]
        try:
            payloads = fetch_batch([(kind, item["slug"], endpoint) for kind, item, endpoint in batch])
            if len(payloads) != len(batch):
                raise ValueError("số phản hồi không khớp số request")
            for (kind, item, _), raw in zip(batch, payloads):
                if isinstance(raw, dict) and raw.get("__error"):
                    if "429" in str(raw["__error"]):
                        rate_limited = True
                        continue
                    failed.append({"kind": kind, "slug": item.get("slug"), "error": str(raw["__error"])})
                    continue
                path = CACHE / kind / f"{slugify(item['slug'])}.json"
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
                consume(kind, item, raw)
        except Exception as exc:
            # A failed batch is retried one-by-one so one bad record cannot hide the others.
            for kind, item, endpoint in batch:
                try:
                    raw = fetch_batch([(kind, item["slug"], endpoint)])[0]
                    if isinstance(raw, dict) and raw.get("__error"):
                        if "429" in str(raw["__error"]):
                            rate_limited = True
                            break
                        raise RuntimeError(raw["__error"])
                    path = CACHE / kind / f"{slugify(item['slug'])}.json"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_text(json.dumps(raw, ensure_ascii=False), encoding="utf-8")
                    consume(kind, item, raw)
                except Exception as inner:
                    failed.append({"kind": kind, "slug": item.get("slug"), "error": str(inner)})
        if rate_limited:
            print(
                "Nguồn đã đạt giới hạn xem bài chữa trong giờ; "
                "đã lưu checkpoint và dừng an toàn.",
                flush=True,
            )
            break
        done = min(start + batch_size, len(pending))
        if done % 40 == 0 or done == len(pending):
            print(f"Đã tải {done}/{len(pending)} mới — tổng tạo {len(created)}, lỗi {len(failed)}", flush=True)

    processed = len(created) + len(failed)
    report = {
        "catalogVstep": len(vstep_catalog),
        "catalogAptis": len(aptis_catalog),
        "created": len(created),
        "failed": failed,
        "rateLimited": rate_limited,
        "remaining": max(0, len(jobs) - processed),
    }
    (CACHE / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return report


if __name__ == "__main__":
    raise SystemExit("Chạy qua browser-use để cookie chỉ tồn tại trong bộ nhớ phiên trình duyệt.")

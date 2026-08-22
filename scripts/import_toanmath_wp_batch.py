#!/usr/bin/env python3
"""Import complete, current ToanMath PDFs not already present by title."""

from __future__ import annotations

import argparse
import html
import tempfile
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests
from bs4 import BeautifulSoup

import import_tailieuonthi_wp_batch as common


API = "https://toanmath.com/wp-json/wp/v2/posts"


def discover(max_pages: int, titles: set[str]) -> list[dict]:
    session = requests.Session()
    session.headers.update(common.HEADERS)
    found = []
    for page in range(1, max_pages + 1):
        response = session.get(
            API,
            params={"per_page": 100, "page": page, "orderby": "date", "order": "desc"},
            timeout=40,
        )
        if response.status_code == 400:
            break
        response.raise_for_status()
        rows = response.json()
        if not rows:
            break
        for row in rows:
            title = html.unescape(
                BeautifulSoup(row["title"]["rendered"], "html.parser").get_text(" ", strip=True)
            )
            key = common.title_key(title)
            if key in titles:
                continue
            folded = common.fold(title)
            blocked = (
                "bo de", "tong hop", "tuyen tap", "chuyen de", "bai tap",
                "kien thuc", "tai lieu", "giao trinh", "sach ",
            )
            if any(term in folded for term in blocked):
                continue
            meta = common.metadata(title, row.get("date", ""))
            if not meta or meta[1] != "toan":
                continue
            soup = BeautifulSoup(row.get("content", {}).get("rendered", ""), "html.parser")
            pdfs = [
                a.get("href", "").split("?", 1)[0]
                for a in soup.find_all("a", href=True)
                if "toanmath-pdf/" in a.get("href", "") and ".pdf" in a.get("href", "").lower()
            ]
            if not pdfs:
                continue
            found.append({
                "id": row["id"], "title": title, "url": row["link"],
                "download_url": pdfs[-1], "meta": meta,
            })
    return found


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", type=int, default=20)
    parser.add_argument("--max-pages", type=int, default=12)
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()

    titles = common.existing_titles()
    candidates = discover(args.max_pages, titles)
    queue = deque(candidates)
    imported = 0
    examined = 0
    with tempfile.TemporaryDirectory(prefix="toanmath_wp_", dir=common.ROOT) as temp:
        temp_dir = Path(temp)
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
            while queue and imported < args.target:
                room = args.target - imported
                batch = [queue.popleft() for _ in range(min(len(queue), args.workers, room))]
                results = list(pool.map(lambda post: common.render_exam(post, titles, temp_dir), batch))
                for path in results:
                    examined += 1
                    if path:
                        imported += 1
                        print(f"CREATED {imported}/{args.target}: {path.relative_to(common.ROOT)}", flush=True)
                if examined % 12 == 0:
                    print(f"PROGRESS examined={examined}, imported={imported}", flush=True)
    print(f"DONE imported={imported}/{args.target}; candidates={len(candidates)}")
    return 0 if imported else 2


if __name__ == "__main__":
    raise SystemExit(main())

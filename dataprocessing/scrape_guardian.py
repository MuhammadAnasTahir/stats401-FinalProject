"""Collect transfer-rumor articles from the Guardian Open Platform API.

The Guardian's developer tier returns full article body text inline (no separate
fetch, no dead links) and covers the whole 2016/17-2025/26 span. We query the
`football/transfer-window` tag, which the Guardian applies to transfer-rumor
coverage, so the corpus is on-topic without keyword guessing.

Key handling: read from data/rawdata/rumors/.guardian_key (git-ignored) or the
GUARDIAN_API_KEY environment variable. The key is never written into the repo.

Usage:
  python scrape_guardian.py --counts          # cheap: article total per season window
  python scrape_guardian.py --season 2024      # download one season (summer + winter)
  python scrape_guardian.py --all              # download every season in scope
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime

import requests

from rumor_config import (
    FIRST_SEASON_START_YEAR,
    GUARDIAN_CACHE,
    GUARDIAN_DELAY_SECONDS,
    GUARDIAN_KEY_FILE,
    GUARDIAN_PAGE_SIZE,
    GUARDIAN_SEARCH_API,
    GUARDIAN_SHOW_FIELDS,
    GUARDIAN_TAG,
    LAST_SEASON_START_YEAR,
    REQUEST_TIMEOUT_SECONDS,
    TRANSFER_WINDOWS,
    USER_AGENT,
)

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})
_LAST_CALL_AT = 0.0


def load_key() -> str:
    key = os.environ.get("GUARDIAN_API_KEY", "").strip()
    if not key and GUARDIAN_KEY_FILE.exists():
        key = GUARDIAN_KEY_FILE.read_text(encoding="utf-8").strip()
    if not key:
        sys.exit(
            "No Guardian API key found. Put it in data/rawdata/rumors/.guardian_key "
            "or set GUARDIAN_API_KEY."
        )
    return key


def _throttle():
    global _LAST_CALL_AT
    elapsed = time.monotonic() - _LAST_CALL_AT
    if elapsed < GUARDIAN_DELAY_SECONDS:
        time.sleep(GUARDIAN_DELAY_SECONDS - elapsed)
    _LAST_CALL_AT = time.monotonic()


def _call(params: dict) -> dict:
    """One Guardian API call, throttled. Returns the 'response' object."""
    _throttle()
    response = SESSION.get(GUARDIAN_SEARCH_API, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
    response.raise_for_status()
    return response.json().get("response", {})


def _window_dates(year: int, window: dict) -> tuple[date, date]:
    (sm, sd), (em, ed) = window["start"], window["end"]
    return date(year, sm, sd), date(year, em, ed)


def _season_windows(start_year: int) -> list[tuple[str, date, date]]:
    summer_start, summer_end = _window_dates(start_year, TRANSFER_WINDOWS["summer"])
    winter_start, winter_end = _window_dates(start_year + 1, TRANSFER_WINDOWS["winter"])
    return [
        (f"{start_year} summer", summer_start, summer_end),
        (f"{start_year}/{str(start_year + 1)[-2:]} winter", winter_start, winter_end),
    ]


def count_window(start: date, end: date, key: str) -> int:
    """Read the article total for a window with a single page-size=1 call."""
    params = {
        "tag": GUARDIAN_TAG,
        "from-date": start.isoformat(),
        "to-date": end.isoformat(),
        "page-size": 1,
        "api-key": key,
    }
    return int(_call(params).get("total", 0))


def _cache_path(article_id: str):
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", article_id)
    return GUARDIAN_CACHE / f"{safe}.json"


def collect_window(start: date, end: date, key: str) -> int:
    """Download and cache every article in a window. Returns count newly cached."""
    GUARDIAN_CACHE.mkdir(parents=True, exist_ok=True)
    page = 1
    total_pages = 1
    saved = 0
    while page <= total_pages:
        params = {
            "tag": GUARDIAN_TAG,
            "from-date": start.isoformat(),
            "to-date": end.isoformat(),
            "page": page,
            "page-size": GUARDIAN_PAGE_SIZE,
            "order-by": "oldest",
            "show-fields": GUARDIAN_SHOW_FIELDS,
            "api-key": key,
        }
        data = _call(params)
        total_pages = int(data.get("pages", 1))
        for result in data.get("results", []):
            fields = result.get("fields", {})
            body = fields.get("bodyText", "")
            if not body or len(body) < 200:
                continue  # too short to classify tone reliably
            article = {
                "id": result.get("id", ""),
                "source": "guardian",
                "url": result.get("webUrl", ""),
                "title": fields.get("headline") or result.get("webTitle", ""),
                "trail": fields.get("trailText", ""),
                "byline": fields.get("byline", ""),
                "published": result.get("webPublicationDate", ""),
                "wordcount": fields.get("wordcount", ""),
                "body": body,
                "fetched_at": datetime.now().isoformat(),
            }
            _cache_path(article["id"]).write_text(
                json.dumps(article, ensure_ascii=False), encoding="utf-8"
            )
            saved += 1
        page += 1
    return saved


def run_counts(key: str):
    """Cheap volume probe: article total per season window (~20 calls)."""
    print(f"Guardian tag: {GUARDIAN_TAG}\n")
    grand = 0
    for year in range(FIRST_SEASON_START_YEAR, LAST_SEASON_START_YEAR + 1):
        for label, start, end in _season_windows(year):
            total = count_window(start, end, key)
            grand += total
            print(f"  {label:18s} {start} .. {end}: {total:>5d} articles")
    print(f"\n  TOTAL across all windows: {grand} articles")


def run_season(year: int, key: str):
    for label, start, end in _season_windows(year):
        saved = collect_window(start, end, key)
        print(f"  {label}: cached {saved} articles")


def main():
    parser = argparse.ArgumentParser(description="Collect transfer-rumor articles from the Guardian API.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--counts", action="store_true", help="report article total per season window")
    group.add_argument("--season", type=int, help="download one season by start year, e.g. 2024")
    group.add_argument("--all", action="store_true", help="download every season in scope")
    args = parser.parse_args()

    key = load_key()
    if args.counts:
        run_counts(key)
    elif args.season is not None:
        run_season(args.season, key)
    elif args.all:
        for year in range(FIRST_SEASON_START_YEAR, LAST_SEASON_START_YEAR + 1):
            print(f"Season {year}/{str(year + 1)[-2:]}")
            run_season(year, key)


if __name__ == "__main__":
    sys.exit(main())

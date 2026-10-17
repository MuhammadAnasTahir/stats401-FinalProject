"""Collect pre-signing transfer-rumor articles for the 2016/17-2025/26 seasons.

Pipeline:
  1. Query the GDELT DOC 2.0 API (free, no key, historical) per transfer window
     for broad football-transfer news, tiling time so each call stays under the
     250-record cap.
  2. Keep only articles from trusted football domains (rumor_config.ALLOWED_DOMAINS).
  3. Fetch each article's full text (robots-aware, rate-limited) and cache it to
     data/rawdata/rumors/articles/<hash>.json so re-runs don't re-fetch.

Full-text extraction uses trafilatura when it is installed (far better at pulling
clean article body from news pages) and falls back to BeautifulSoup otherwise.

Entity extraction, tone/agent classification, and transfer linkage happen in a
later script; this one only gathers and caches the raw corpus.

Usage:
  python scrape_rumors.py --pilot            # two short probe windows, prints hit rates
  python scrape_rumors.py --season 2024      # one season (summer + winter)
  python scrape_rumors.py --all              # every season in scope
"""

import argparse
import hashlib
import json
import sys
import time
import urllib.robotparser
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

import requests

from rumor_config import (
    ALLOWED_DOMAINS,
    FIRST_SEASON_START_YEAR,
    GDELT_BACKOFF_SECONDS,
    GDELT_DELAY_SECONDS,
    GDELT_DOC_API,
    GDELT_INDEX_DIR,
    GDELT_LANGUAGE,
    GDELT_MAX_RECORDS,
    GDELT_MAX_RETRIES,
    GDELT_QUERY_TERMS,
    LAST_SEASON_START_YEAR,
    RAW_ARTICLE_CACHE,
    REQUEST_DELAY_SECONDS,
    REQUEST_TIMEOUT_SECONDS,
    TRANSFER_WINDOWS,
    USER_AGENT,
)

try:
    import trafilatura  # type: ignore

    HAVE_TRAFILATURA = True
except ImportError:
    trafilatura = None
    HAVE_TRAFILATURA = False

from bs4 import BeautifulSoup  # already an approved dependency


SESSION = requests.Session()
SESSION.headers.update({"User-Agent": USER_AGENT})

_ROBOTS_CACHE: dict[str, urllib.robotparser.RobotFileParser] = {}
_LAST_FETCH_AT = 0.0
_LAST_GDELT_AT = 0.0


def _throttle():
    """Space out per-article fetches to stay polite regardless of loop speed."""
    global _LAST_FETCH_AT
    elapsed = time.monotonic() - _LAST_FETCH_AT
    if elapsed < REQUEST_DELAY_SECONDS:
        time.sleep(REQUEST_DELAY_SECONDS - elapsed)
    _LAST_FETCH_AT = time.monotonic()


def _throttle_gdelt():
    """GDELT allows one request per 5 seconds; hold to that between calls."""
    global _LAST_GDELT_AT
    elapsed = time.monotonic() - _LAST_GDELT_AT
    if elapsed < GDELT_DELAY_SECONDS:
        time.sleep(GDELT_DELAY_SECONDS - elapsed)
    _LAST_GDELT_AT = time.monotonic()


def _domain_of(url: str) -> str:
    netloc = urlparse(url).netloc.lower()
    return netloc[4:] if netloc.startswith("www.") else netloc


def _is_allowed_domain(url: str) -> bool:
    domain = _domain_of(url)
    return any(domain == allowed or domain.endswith("." + allowed) for allowed in ALLOWED_DOMAINS)


def _robots_allows(url: str) -> bool:
    """Respect each site's robots.txt for our user agent. Fails closed on fetch error."""
    parsed = urlparse(url)
    root = f"{parsed.scheme}://{parsed.netloc}"
    parser = _ROBOTS_CACHE.get(root)
    if parser is None:
        parser = urllib.robotparser.RobotFileParser()
        parser.set_url(root + "/robots.txt")
        try:
            parser.read()
        except Exception:
            # If robots.txt cannot be read, be conservative and skip the site.
            parser = None
        _ROBOTS_CACHE[root] = parser
    if parser is None:
        return False
    return parser.can_fetch(USER_AGENT, url)


def _cache_path_for(url: str):
    digest = hashlib.sha1(url.encode("utf-8")).hexdigest()
    return RAW_ARTICLE_CACHE / f"{digest}.json"


def _gdelt_datetime(value: date, end_of_day: bool = False) -> str:
    stamp = "235959" if end_of_day else "000000"
    return value.strftime("%Y%m%d") + stamp


def query_gdelt(start: date, end: date) -> list[dict]:
    """Return GDELT article records for a date span. Caches the raw response."""
    GDELT_INDEX_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = GDELT_INDEX_DIR / f"{start.isoformat()}_{end.isoformat()}.json"
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8")).get("articles", [])

    params = {
        "query": f"{GDELT_QUERY_TERMS} sourcelang:{GDELT_LANGUAGE}",
        "mode": "artlist",
        "format": "json",
        "maxrecords": GDELT_MAX_RECORDS,
        "sort": "datedesc",
        "startdatetime": _gdelt_datetime(start),
        "enddatetime": _gdelt_datetime(end, end_of_day=True),
    }

    payload = None
    for attempt in range(1, GDELT_MAX_RETRIES + 1):
        _throttle_gdelt()
        try:
            response = SESSION.get(GDELT_DOC_API, params=params, timeout=REQUEST_TIMEOUT_SECONDS)
            if response.status_code == 429:
                wait = GDELT_BACKOFF_SECONDS * attempt
                print(f"  ~ GDELT rate-limited ({start}..{end}); backing off {wait}s (attempt {attempt})")
                time.sleep(wait)
                continue
            response.raise_for_status()
            payload = response.json()
            break
        except ValueError:
            # Body was not JSON (usually the plain-text rate-limit notice).
            wait = GDELT_BACKOFF_SECONDS * attempt
            print(f"  ~ GDELT non-JSON response ({start}..{end}); backing off {wait}s (attempt {attempt})")
            time.sleep(wait)
        except Exception as error:
            print(f"  ! GDELT query error for {start}..{end}: {error}")
            time.sleep(GDELT_BACKOFF_SECONDS)

    if payload is None:
        print(f"  ! GDELT gave up for {start}..{end} after {GDELT_MAX_RETRIES} attempts")
        return []

    articles = payload.get("articles", [])
    cache_file.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    if len(articles) >= GDELT_MAX_RECORDS:
        print(f"  ~ {start}..{end} hit the {GDELT_MAX_RECORDS}-record cap; tile finer for full coverage")
    return articles


def extract_fulltext(html: str, url: str) -> str:
    """Pull clean article body. Prefer trafilatura; fall back to BeautifulSoup."""
    if HAVE_TRAFILATURA:
        text = trafilatura.extract(html, url=url, include_comments=False, include_tables=False)
        if text:
            return text.strip()
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer", "aside", "figure"]):
        tag.decompose()
    article = soup.find("article") or soup.find("main") or soup.body
    if article is None:
        return ""
    paragraphs = [p.get_text(" ", strip=True) for p in article.find_all("p")]
    return "\n".join(p for p in paragraphs if len(p) > 40).strip()


def fetch_article(record: dict) -> dict | None:
    """Fetch and cache one article's full text. Returns the cached dict or None."""
    url = record.get("url", "")
    if not url or not _is_allowed_domain(url):
        return None

    cache_file = _cache_path_for(url)
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding="utf-8"))

    if not _robots_allows(url):
        return None

    _throttle()
    try:
        response = SESSION.get(url, timeout=REQUEST_TIMEOUT_SECONDS)
        response.raise_for_status()
    except Exception:
        return None

    body = extract_fulltext(response.text, url)
    if not body or len(body) < 200:
        return None  # too short to classify tone reliably

    article = {
        "url": url,
        "domain": _domain_of(url),
        "title": record.get("title", ""),
        "seendate": record.get("seendate", ""),
        "language": record.get("language", ""),
        "sourcecountry": record.get("sourcecountry", ""),
        "body": body,
        "fetched_at": datetime.utcnow().isoformat(),
    }
    RAW_ARTICLE_CACHE.mkdir(parents=True, exist_ok=True)
    cache_file.write_text(json.dumps(article, ensure_ascii=False), encoding="utf-8")
    return article


def collect_span(start: date, end: date) -> dict:
    """Query GDELT for a span and fetch every allowed article. Returns hit stats."""
    records = query_gdelt(start, end)
    allowed = [r for r in records if _is_allowed_domain(r.get("url", ""))]
    fetched = 0
    for record in allowed:
        if fetch_article(record) is not None:
            fetched += 1
    return {
        "span": f"{start.isoformat()}..{end.isoformat()}",
        "gdelt_records": len(records),
        "allowed_domain": len(allowed),
        "fetched_fulltext": fetched,
    }


def _window_spans(year: int, window: dict) -> tuple[date, date]:
    (sm, sd), (em, ed) = window["start"], window["end"]
    return date(year, sm, sd), date(year, em, ed)


def collect_season(start_year: int) -> list[dict]:
    """Summer window in start_year, winter window in the following January."""
    stats = []
    summer_start, summer_end = _window_spans(start_year, TRANSFER_WINDOWS["summer"])
    winter_start, winter_end = _window_spans(start_year + 1, TRANSFER_WINDOWS["winter"])
    print(f"Season {start_year}/{str(start_year + 1)[-2:]}")
    for start, end in [(summer_start, summer_end), (winter_start, winter_end)]:
        # Tile the span into 7-day slices so each GDELT call stays under the cap.
        cursor = start
        while cursor <= end:
            slice_end = min(cursor + timedelta(days=6), end)
            stat = collect_span(cursor, slice_end)
            stats.append(stat)
            print(f"  {stat['span']}: {stat['gdelt_records']} found, "
                  f"{stat['allowed_domain']} on trusted domains, "
                  f"{stat['fetched_fulltext']} full texts cached")
            cursor = slice_end + timedelta(days=1)
    return stats


def run_pilot():
    """Two short probe windows: one recent, one old, to measure full-text hit rate."""
    print(f"trafilatura available: {HAVE_TRAFILATURA}")
    print("Pilot probe: one week in summer 2024, one week in summer 2017\n")
    probes = [
        (date(2024, 8, 1), date(2024, 8, 7)),
        (date(2017, 8, 1), date(2017, 8, 7)),
    ]
    for start, end in probes:
        stat = collect_span(start, end)
        rate = (stat["fetched_fulltext"] / stat["allowed_domain"] * 100) if stat["allowed_domain"] else 0
        print(f"{stat['span']}: {stat['gdelt_records']} GDELT records, "
              f"{stat['allowed_domain']} on trusted domains, "
              f"{stat['fetched_fulltext']} full texts cached ({rate:.0f}% of trusted)")


def main():
    parser = argparse.ArgumentParser(description="Collect transfer-rumor articles via GDELT.")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--pilot", action="store_true", help="probe two short windows and report hit rates")
    group.add_argument("--season", type=int, help="collect one season by start year, e.g. 2024")
    group.add_argument("--all", action="store_true", help="collect every season in scope")
    args = parser.parse_args()

    RAW_ARTICLE_CACHE.mkdir(parents=True, exist_ok=True)

    if args.pilot:
        run_pilot()
    elif args.season is not None:
        collect_season(args.season)
    elif args.all:
        for year in range(FIRST_SEASON_START_YEAR, LAST_SEASON_START_YEAR + 1):
            collect_season(year)


if __name__ == "__main__":
    sys.exit(main())

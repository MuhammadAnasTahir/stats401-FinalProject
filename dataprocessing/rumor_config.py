"""Configuration for the rumor-scraping and rumor-linkage pipeline.

Kept separate from config.py (the structured Transfermarkt pipeline) so the
two halves of the project stay independent and reproducible on their own.
"""

from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RAW_RUMOR_DIR = DATA_DIR / "rawdata" / "rumors"
RAW_ARTICLE_CACHE = RAW_RUMOR_DIR / "articles"          # one JSON per fetched article (GDELT path)
GUARDIAN_CACHE = RAW_RUMOR_DIR / "guardian"             # one JSON per Guardian article
GDELT_INDEX_DIR = RAW_RUMOR_DIR / "gdelt_index"         # raw GDELT article-list responses
GUARDIAN_KEY_FILE = RAW_RUMOR_DIR / ".guardian_key"     # git-ignored; never commit
PROCESSED_DATA_DIR = DATA_DIR / "processed"

# --- Guardian Open Platform API --------------------------------------------
# Developer tier: 1 call/sec, 500 calls/day, article body included, full archive.
GUARDIAN_SEARCH_API = "https://content.guardianapis.com/search"
GUARDIAN_SECTION = "football"
# The Guardian tags transfer-rumor coverage explicitly; far cleaner than keyword search.
GUARDIAN_TAG = "football/transfer-window"
GUARDIAN_PAGE_SIZE = 50                                 # API maximum
GUARDIAN_DELAY_SECONDS = 1.2                            # stay under 1 call/sec
GUARDIAN_SHOW_FIELDS = "headline,trailText,byline,bodyText,wordcount,firstPublicationDate"

# Chart-ready outputs (built once articles are collected, classified, and linked).
RUMOR_OUTPUT_FILES = {
    "rumor_articles": PROCESSED_DATA_DIR / "rumor_articles.csv",      # one row per linked article
    "rumor_outcomes": PROCESSED_DATA_DIR / "rumor_outcomes.csv",      # one row per transfer -> box plot
    "rumor_timeline": PROCESSED_DATA_DIR / "rumor_timeline.csv",      # transfer x week x tone -> streamgraph
    "rumor_highlights": PROCESSED_DATA_DIR / "rumor_highlights.csv",  # top most-covered transfers -> tiles
}

# How many most-covered transfers to surface as highlight tiles.
HIGHLIGHT_COUNT = 6

# --- Season scope -----------------------------------------------------------
# Matches the structured pipeline: 2016/17 through 2025/26. A "season" here is
# keyed by its starting calendar year; each has a summer and a winter window.
FIRST_SEASON_START_YEAR = 2016
LAST_SEASON_START_YEAR = 2025

# Transfer windows we collect rumors for, expressed as (month, day) spans within
# the relevant calendar year. Summer dominates; winter is the January window.
TRANSFER_WINDOWS = {
    "summer": {"start": (6, 1), "end": (9, 7)},
    "winter": {"start": (1, 1), "end": (2, 3)},
}

# How far before a completed transfer an article may be published and still count
# as pre-signing coverage of that deal.
RUMOR_LOOKBACK_DAYS = 120

# --- Collection -------------------------------------------------------------
# GDELT DOC 2.0 API: free, no key, indexes worldwide news with dates + URLs.
GDELT_DOC_API = "https://api.gdeltproject.org/api/v2/doc/doc"
GDELT_MAX_RECORDS = 250          # hard cap per call; tile time finer if a window overflows
GDELT_LANGUAGE = "english"

# Broad transfer-news query. Entity extraction + linkage later filter this down
# to articles that actually match a completed top-five-league transfer.
GDELT_QUERY_TERMS = '(transfer OR signing OR "set to join" OR "medical") (football OR soccer)'

# Domains we trust for football transfer reporting. GDELT returns a domain per
# article; we keep only these to control quality and robots exposure.
ALLOWED_DOMAINS = {
    "theguardian.com",
    "bbc.co.uk",
    "bbc.com",
    "skysports.com",
    "espn.com",
    "espn.co.uk",
    "goal.com",
    "football.london",
    "independent.co.uk",
    "telegraph.co.uk",
    "mirror.co.uk",
    "manchestereveningnews.co.uk",
    "liverpoolecho.co.uk",
    "standard.co.uk",
    "football-italia.net",
    "marca.com",
    "90min.com",
}

# Politeness: delay between network calls, and a descriptive UA so sites can see us.
REQUEST_DELAY_SECONDS = 1.5          # between article fetches (varied domains)
REQUEST_TIMEOUT_SECONDS = 20

# GDELT enforces one request per 5 seconds and blocks bursts, so it gets its own
# slower pace plus exponential backoff when it still returns 429.
GDELT_DELAY_SECONDS = 5.5
GDELT_MAX_RETRIES = 4
GDELT_BACKOFF_SECONDS = 12
USER_AGENT = (
    "STATS401-FinalProject-Research/1.0 "
    "(academic data-visualization project; contact anastahir571@gmail.com)"
)

# --- Tone lexicon -----------------------------------------------------------
# Transfer journalism uses formulaic language. A transparent keyword lexicon is
# easier to defend in a presentation than a black-box sentiment model, and tone
# words here are reasonably unambiguous. Classification runs on the article body.
TONE_OPTIMISTIC = [
    # progress toward a deal
    "set to join", "set to sign", "set for a move", "agreed personal terms",
    "agree personal terms", "medical booked", "medical scheduled", "undergo a medical",
    "undergoing a medical", "passed a medical", "deal agreed", "deal done", "done deal",
    "here we go", "on the verge", "on the brink", "close to signing", "close to joining",
    "closing in on", "poised to", "verbal agreement", "fee agreed", "agreed a fee",
    "agreed a deal", "advanced talks", "expected to complete", "will sign",
    "bid accepted", "accepted a bid", "accepted an offer", "reached an agreement",
    "reach an agreement", "put pen to paper", "complete a move", "completed a move",
    "complete the signing", "completed the signing", "seal a move", "sealed a move",
    "confirm the signing", "confirmed the signing", "unveiled as", "all but confirmed",
    "wrap up a deal", "closing on a deal", "nearing a move", "nearing a deal",
]
TONE_DOUBTFUL = [
    # stalling, denial, or collapse
    "rules out", "ruled out", "cools interest", "cooling interest", "denies", "deny",
    "no agreement", "talks stall", "stalled", "stalling", "collapsed", "collapse",
    "unlikely", "cast doubt", "in doubt", "walk away", "pulled out", "pull the plug",
    "pulled the plug", "distance themselves", "not for sale", "refuse to sell",
    "refused to sell", "will not sell", "reluctant", "snag", "hits snag", "stumbling block",
    "sticking point", "turned down", "rejected", "reject a bid", "rejected a bid",
    "rejected an offer", "priced out", "too expensive", "cannot afford", "move collapses",
    "deal off", "off the table", "break down", "broke down", "fail to agree",
    "failed to agree", "no breakthrough", "cold feet", "far apart", "put on hold",
    "block the move", "blocked the move", "u turn",
]
# Anything matching neither bucket is classified "neutral".

# --- Agent attribution ------------------------------------------------------
# The proposal requires EXPLICIT attribution to an agent, not inference.
AGENT_ATTRIBUTION_PATTERNS = [
    r"\bhis agent\b",
    r"\bthe agent\b",
    r"\bplayer's agent\b",
    r"\baccording to .{0,40}? agent\b",
    r"\bagent (?:said|told|confirmed|revealed|insists|claims)\b",
    r"\brepresentative(?:s)? (?:said|told|confirmed|revealed)\b",
]

RANDOM_SEED = 401

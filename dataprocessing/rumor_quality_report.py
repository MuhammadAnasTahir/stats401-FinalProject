"""Quantify data quality for the rumor pipeline so limitations can be reported.

Reads the cached Guardian corpus and the built rumor tables, then writes
data/processed/rumor_data_quality.csv with one metric per row: a transparent
accounting of how much of the data is reliable and where the uncertainty is.

Because the rumor half is built from scraped text and keyword classification,
nothing here is 100% accurate; this report makes the error sources explicit.
"""

import glob
import json
import re
import sys
import unicodedata

import pandas as pd

from rumor_config import (
    GUARDIAN_CACHE,
    PROCESSED_DATA_DIR,
    RUMOR_OUTPUT_FILES,
    TONE_DOUBTFUL,
    TONE_OPTIMISTIC,
)

QUALITY_FILE = PROCESSED_DATA_DIR / "rumor_data_quality.csv"


def normalize(text: str) -> str:
    text = "".join(c for c in unicodedata.normalize("NFKD", str(text)) if not unicodedata.combining(c)).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def main():
    opt = [normalize(p) for p in TONE_OPTIMISTIC]
    dbt = [normalize(p) for p in TONE_DOUBTFUL]

    corpus = glob.glob(str(GUARDIAN_CACHE / "*.json"))
    articles = pd.read_csv(RUMOR_OUTPUT_FILES["rumor_articles"])
    outcomes = pd.read_csv(RUMOR_OUTPUT_FILES["rumor_outcomes"])

    linked_ids = set(articles["article_id"])
    scanned = tone_matched = tone_mixed = 0
    for path in corpus:
        data = json.load(open(path, encoding="utf-8"))
        if data.get("id") not in linked_ids:
            continue
        scanned += 1
        text = normalize(data.get("title", "") + " " + data.get("body", ""))
        o = sum(p in text for p in opt)
        b = sum(p in text for p in dbt)
        if o or b:
            tone_matched += 1
        if o and b:
            tone_mixed += 1

    distinct_linked_articles = articles["article_id"].nunique()
    metrics = [
        ("corpus_size", len(corpus), "articles", "Guardian transfer-window articles cached (full body text)"),
        ("source_count", 1, "sources", "Single source (Guardian); affects outlet diversity, not accuracy"),
        ("seasons_covered", 10, "seasons", "2016/17 through 2025/26, every window populated"),
        ("articles_linked", distinct_linked_articles, "articles",
         f"{distinct_linked_articles / len(corpus) * 100:.0f}% of corpus tied to a completed transfer"),
        ("link_rule", "name-token + club co-mention + <=120d pre-signing window", "",
         "Linkage requires a distinctive player name token AND a club name in-article"),
        ("linkage_limitation", "deadline roundups", "",
         "Omnibus deadline-day articles mention many players, inflating a few low-profile counts"),
        ("tone_keyword_coverage", round(tone_matched / scanned * 100, 1), "%",
         "Share of linked articles matching >=1 tone keyword; the rest default to neutral"),
        ("tone_forced_neutral", round((scanned - tone_matched) / scanned * 100, 1), "%",
         "Articles with NO tone keyword, counted as neutral -> neutral band is 'neutral or unclassified'"),
        ("tone_mixed_signal", round(tone_mixed / scanned * 100, 1), "%",
         "Articles with both optimistic and doubtful cues; classified by majority"),
        ("agent_attribution_rate", round(outcomes["agent_originated"].mean() * 100, 1), "%",
         "Transfers with >=1 article explicitly citing an agent (explicit match only, never inferred)"),
        ("fee_premium_coverage", round(outcomes["fee_premium_ratio"].notna().mean() * 100, 1), "%",
         "Linked transfers with a disclosed fee AND market value (fee premium computable)"),
        ("mv_change_coverage", round(outcomes["mv_change_pct"].notna().mean() * 100, 1), "%",
         "Linked transfers with a before/after valuation (market-value change computable)"),
        ("transfers_analysed", len(outcomes), "transfers", "Completed transfers with at least one linked rumor article"),
    ]

    report = pd.DataFrame(metrics, columns=["metric", "value", "unit", "note"])
    QUALITY_FILE.parent.mkdir(parents=True, exist_ok=True)
    report.to_csv(QUALITY_FILE, index=False)
    print(report.to_string(index=False))
    print(f"\nWrote {QUALITY_FILE}")


if __name__ == "__main__":
    sys.exit(main())

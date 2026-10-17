"""Link Guardian rumor articles to completed transfers and derive rumor variables.

Stages:
  1. Candidate transfers: incoming moves into a top-five league, 2016/17-2025/26.
  2. Linkage: an article is tied to a transfer when the player's distinctive name
     token AND a club name appear in the article, and the article was published
     within RUMOR_LOOKBACK_DAYS before the transfer date.
  3. Per-article classification: tone (optimistic/neutral/doubtful) from a keyword
     lexicon on the body, and an explicit agent-attribution flag.
  4. Per-transfer variables: rumor intensity (article count -> tertiles), tone mix,
     agent flag, days from first rumor to signing.
  5. Outcomes: fee premium (fee vs market value) and market-value change around the
     transfer date (from player_valuations).
  6. Outputs: rumor_articles.csv, rumor_outcomes.csv, rumor_timeline.csv.

Run `--probe` first to see linkage match rates without writing outputs.
"""

import argparse
import glob
import json
import re
import sys
import unicodedata
from collections import defaultdict
from datetime import datetime

import pandas as pd

from config import CLEANED_FILES, TOP_FIVE_LEAGUE_IDS
from rumor_config import (
    AGENT_ATTRIBUTION_PATTERNS,
    FIRST_SEASON_START_YEAR,
    GUARDIAN_CACHE,
    LAST_SEASON_START_YEAR,
    RUMOR_LOOKBACK_DAYS,
    TONE_DOUBTFUL,
    TONE_OPTIMISTIC,
)

AGENT_REGEX = re.compile("|".join(AGENT_ATTRIBUTION_PATTERNS), re.IGNORECASE)
# Name particles that are not distinctive enough to key a match on their own.
NAME_STOPWORDS = {
    "de", "da", "do", "di", "del", "della", "van", "von", "der", "den", "le",
    "la", "el", "al", "dos", "das", "santos", "silva", "junior", "jr", "the",
}


def strip_accents(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text)
    return "".join(c for c in decomposed if not unicodedata.combining(c))


def normalize(text: str) -> str:
    text = strip_accents(str(text)).lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def season_codes() -> set[str]:
    return {
        f"{y % 100:02d}/{(y + 1) % 100:02d}"
        for y in range(FIRST_SEASON_START_YEAR, LAST_SEASON_START_YEAR + 1)
    }


def load_candidate_transfers() -> pd.DataFrame:
    clubs = pd.read_csv(CLEANED_FILES["clubs"])
    top5_ids = set(clubs.loc[clubs["domestic_competition_id"].isin(TOP_FIVE_LEAGUE_IDS), "club_id"])

    transfers = pd.read_csv(CLEANED_FILES["transfers"])
    transfers["transfer_date"] = pd.to_datetime(transfers["transfer_date"], errors="coerce")
    scope = (
        transfers["to_club_id"].isin(top5_ids)
        & transfers["transfer_season"].isin(season_codes())
        & transfers["transfer_date"].notna()
        & transfers["player_name"].notna()
    )
    candidates = transfers[scope].copy().reset_index(drop=True)
    candidates["transfer_id"] = candidates.index
    candidates["norm_name"] = candidates["player_name"].map(normalize)
    candidates["norm_to_club"] = candidates["to_club_name"].map(normalize)
    candidates["norm_from_club"] = candidates["from_club_name"].map(normalize)
    return candidates


def distinctive_tokens(norm_name: str) -> list[str]:
    """Name tokens usable as match keys: length >= 4 and not a particle."""
    return [t for t in norm_name.split() if len(t) >= 4 and t not in NAME_STOPWORDS]


def club_tokens(norm_club: str) -> set[str]:
    """Distinctive club words, dropping generic football filler."""
    filler = {"fc", "cf", "club", "united", "city", "real", "ac", "sc", "ssc", "afc", "cd"}
    return {t for t in norm_club.split() if len(t) >= 4 and t not in filler}


def build_name_index(candidates: pd.DataFrame) -> dict[str, list[int]]:
    """Map each distinctive name token to the transfer rows that use it."""
    index: dict[str, list[int]] = defaultdict(list)
    for row in candidates.itertuples():
        for token in distinctive_tokens(row.norm_name):
            index[token].append(row.Index)
    return index


def load_articles() -> list[dict]:
    articles = []
    for path in glob.glob(str(GUARDIAN_CACHE / "*.json")):
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
        published = data.get("published", "")
        try:
            pub = datetime.fromisoformat(published.replace("Z", "+00:00")).date()
        except ValueError:
            continue
        data["pub_date"] = pub
        data["norm_text"] = normalize((data.get("title", "") + " " + data.get("body", "")))
        data["word_set"] = set(data["norm_text"].split())
        articles.append(data)
    return articles


# Pre-normalize the tone lexicon once, not per call.
_TONE_OPTIMISTIC = [normalize(p) for p in TONE_OPTIMISTIC]
_TONE_DOUBTFUL = [normalize(p) for p in TONE_DOUBTFUL]


def classify_tone(norm_text: str) -> str:
    optimistic = sum(phrase in norm_text for phrase in _TONE_OPTIMISTIC)
    doubtful = sum(phrase in norm_text for phrase in _TONE_DOUBTFUL)
    if optimistic > doubtful:
        return "optimistic"
    if doubtful > optimistic:
        return "doubtful"
    return "neutral"


def build_transfer_records(candidates: pd.DataFrame) -> dict[int, dict]:
    """Plain-dict view of each candidate transfer for O(1) lookup in the match loop."""
    records = {}
    for row in candidates.itertuples():
        records[row.transfer_id] = {
            "transfer_date": row.transfer_date.date(),
            "clubs": club_tokens(row.norm_to_club) | club_tokens(row.norm_from_club),
            "player_name": row.player_name,
            "to_club_name": row.to_club_name,
        }
    return records


def link_articles(records: dict[int, dict], name_index: dict, articles: list[dict]) -> list[dict]:
    """Return one record per (article, transfer) match."""
    index_keys = name_index.keys()
    links = []
    for article in articles:
        pub = article["pub_date"]
        word_set = article["word_set"]
        present_tokens = word_set & index_keys
        if not present_tokens:
            continue
        tone = None  # compute lazily; only needed once a match survives
        agent = None
        seen_transfers = set()
        for token in present_tokens:
            for tid in name_index[token]:
                if tid in seen_transfers:
                    continue
                rec = records[tid]
                delta = (rec["transfer_date"] - pub).days
                if delta < 0 or delta > RUMOR_LOOKBACK_DAYS:
                    continue
                if rec["clubs"] and not (rec["clubs"] & word_set):
                    continue
                seen_transfers.add(tid)
                if tone is None:
                    tone = classify_tone(article["norm_text"])
                    agent = bool(AGENT_REGEX.search(article.get("body", "")))
                links.append({
                    "transfer_id": tid,
                    "article_id": article.get("id", ""),
                    "pub_date": pub,
                    "transfer_date": rec["transfer_date"],
                    "days_before": delta,
                    "tone": tone,
                    "agent_originated": agent,
                    "player_name": rec["player_name"],
                    "to_club_name": rec["to_club_name"],
                })
    return links


def run_probe():
    candidates = load_candidate_transfers()
    name_index = build_name_index(candidates)
    records = build_transfer_records(candidates)
    articles = load_articles()
    print(f"Candidate transfers: {len(candidates)}")
    print(f"Articles loaded:     {len(articles)}")
    print(f"Name-token index:    {len(name_index)} distinct tokens\n", flush=True)

    links = link_articles(records, name_index, articles)
    linked_articles = {link["article_id"] for link in links}
    linked_transfers = {link["transfer_id"] for link in links}

    print(f"Total (article, transfer) links: {len(links)}")
    print(f"Distinct articles linked:        {len(linked_articles)} "
          f"({len(linked_articles) / len(articles) * 100:.0f}% of corpus)")
    print(f"Distinct transfers with >=1 article: {len(linked_transfers)}")

    per_transfer = defaultdict(int)
    for link in links:
        per_transfer[link["transfer_id"]] += 1
    counts = pd.Series(per_transfer.values())
    if len(counts):
        print(f"\nArticles per linked transfer: "
              f"min {counts.min()}, median {counts.median():.0f}, "
              f"mean {counts.mean():.1f}, max {counts.max()}")
        tones = pd.Series([link["tone"] for link in links]).value_counts()
        print("Tone mix across links:", dict(tones))
        agent = sum(link["agent_originated"] for link in links)
        print(f"Links with explicit agent attribution: {agent} ({agent / len(links) * 100:.0f}%)")
        top = pd.Series(
            [f"{link['player_name']} -> {link['to_club_name']}" for link in links]
        ).value_counts().head(8)
        print("\nMost-covered transfers (by article count):")
        for name, n in top.items():
            print(f"  {n:>3d}  {name}")


def market_value_change(candidates: pd.DataFrame, linked_ids: set[int]) -> pd.DataFrame:
    """Value shortly before vs shortly after each transfer date, from player_valuations.

    before = latest valuation in [date-180d, date]; after = earliest in [date+30d, date+365d].
    """
    linked = candidates[candidates["transfer_id"].isin(linked_ids)][
        ["transfer_id", "player_id", "transfer_date"]
    ].dropna(subset=["player_id"])

    valuations = pd.read_csv(CLEANED_FILES["player_valuations"], usecols=["player_id", "date", "market_value_in_eur"])
    valuations["date"] = pd.to_datetime(valuations["date"], errors="coerce")
    valuations = valuations.dropna(subset=["date", "market_value_in_eur"])
    by_player = {pid: group.sort_values("date") for pid, group in valuations.groupby("player_id")}

    rows = []
    for row in linked.itertuples():
        group = by_player.get(row.player_id)
        if group is None:
            continue
        tdate = row.transfer_date
        before = group[(group["date"] >= tdate - pd.Timedelta(days=180)) & (group["date"] <= tdate)]
        after = group[(group["date"] >= tdate + pd.Timedelta(days=30)) & (group["date"] <= tdate + pd.Timedelta(days=365))]
        if before.empty or after.empty:
            continue
        before_val = before.iloc[-1]["market_value_in_eur"]
        after_val = after.iloc[0]["market_value_in_eur"]
        if before_val <= 0:
            continue
        rows.append({
            "transfer_id": row.transfer_id,
            "mv_before_eur": before_val,
            "mv_after_eur": after_val,
            "mv_change_eur": after_val - before_val,
            "mv_change_pct": (after_val - before_val) / before_val * 100,
        })
    return pd.DataFrame(rows)


def intensity_bucket(counts: pd.Series) -> pd.Series:
    """Tertile the article counts into low/medium/high, robust to heavy ties at 1."""
    lo, hi = counts.quantile([1 / 3, 2 / 3])
    lo = max(lo, 1)

    def label(n):
        if n <= lo:
            return "low"
        if n <= hi:
            return "medium"
        return "high"

    return counts.map(label), (lo, hi)


def download_highlight_images(highlights: pd.DataFrame) -> list[str]:
    """Save each highlight's high-res Transfermarkt portrait under images/players/.

    Returns the repo-relative local path per row (empty string if a download fails,
    in which case the page falls back to hotlinking).
    """
    import urllib.request
    from rumor_config import PROJECT_ROOT

    out_dir = PROJECT_ROOT / "images" / "players"
    out_dir.mkdir(parents=True, exist_ok=True)
    headers = {"User-Agent": "STATS401-FinalProject-Research/1.0 (academic project)"}
    paths = []
    for row in highlights.itertuples():
        big = re.sub(r"/portrait/(header|medium|small)/", "/portrait/big/", str(row.image_url))
        rel = f"images/players/{row.transfer_id}.jpg"
        target = PROJECT_ROOT / rel
        if target.exists():
            paths.append(rel)
            continue
        try:
            request = urllib.request.Request(big, headers=headers)
            data = urllib.request.urlopen(request, timeout=20).read()
            target.write_bytes(data)
            paths.append(rel)
        except Exception as error:
            print(f"  ! image download failed for {row.player_name}: {error}")
            paths.append("")
    return paths


def build_outputs():
    from rumor_config import RUMOR_OUTPUT_FILES

    candidates = load_candidate_transfers()
    name_index = build_name_index(candidates)
    records = build_transfer_records(candidates)
    articles = load_articles()
    links = link_articles(records, name_index, articles)
    links_df = pd.DataFrame(links)
    print(f"Links: {len(links_df)} across {links_df['transfer_id'].nunique()} transfers", flush=True)

    # Season label per link, from the transfer.
    season_lookup = candidates.set_index("transfer_id")["transfer_season"]
    links_df["transfer_season"] = links_df["transfer_id"].map(season_lookup)
    links_df["weeks_before"] = (links_df["days_before"] // 7).clip(upper=17)

    # 1) rumor_articles.csv - one row per linked article.
    RUMOR_OUTPUT_FILES["rumor_articles"].parent.mkdir(parents=True, exist_ok=True)
    article_cols = [
        "transfer_id", "transfer_season", "player_name", "to_club_name",
        "article_id", "pub_date", "transfer_date", "days_before", "weeks_before",
        "tone", "agent_originated",
    ]
    links_df[article_cols].to_csv(RUMOR_OUTPUT_FILES["rumor_articles"], index=False)

    # 2) Per-transfer aggregation -> rumor_outcomes.csv.
    grouped = links_df.groupby("transfer_id")
    agg = pd.DataFrame({
        "article_count": grouped.size(),
        "first_rumor_days": grouped["days_before"].max(),
        "optimistic": grouped.apply(lambda g: (g["tone"] == "optimistic").sum(), include_groups=False),
        "neutral": grouped.apply(lambda g: (g["tone"] == "neutral").sum(), include_groups=False),
        "doubtful": grouped.apply(lambda g: (g["tone"] == "doubtful").sum(), include_groups=False),
        "agent_originated": grouped["agent_originated"].any(),
    }).reset_index()

    bucket, (lo, hi) = intensity_bucket(agg["article_count"])
    agg["rumor_intensity"] = bucket
    print(f"Intensity thresholds: low <= {lo:.0f} < medium <= {hi:.0f} < high", flush=True)

    # Dominant tone per transfer.
    agg["dominant_tone"] = agg[["optimistic", "neutral", "doubtful"]].idxmax(axis=1)

    # Attach fee/market-value and compute fee premium.
    meta = candidates.set_index("transfer_id")
    agg = agg.join(
        meta[["player_id", "player_name", "from_club_name", "to_club_name",
              "transfer_season", "transfer_date", "transfer_fee", "market_value_in_eur"]],
        on="transfer_id",
    )
    agg["fee_eur"] = pd.to_numeric(agg["transfer_fee"], errors="coerce")
    agg["market_value_eur"] = pd.to_numeric(agg["market_value_in_eur"], errors="coerce")
    has_fee = (agg["fee_eur"] > 0) & (agg["market_value_eur"] > 0)
    agg["fee_premium_eur"] = (agg["fee_eur"] - agg["market_value_eur"]).where(has_fee)
    agg["fee_premium_ratio"] = (agg["fee_eur"] / agg["market_value_eur"]).where(has_fee)

    # Attach market-value change.
    mv = market_value_change(candidates, set(agg["transfer_id"]))
    agg = agg.merge(mv, on="transfer_id", how="left")

    outcome_cols = [
        "transfer_id", "player_name", "to_club_name", "transfer_season",
        "article_count", "rumor_intensity", "first_rumor_days",
        "optimistic", "neutral", "doubtful", "dominant_tone", "agent_originated",
        "fee_eur", "market_value_eur", "fee_premium_eur", "fee_premium_ratio",
        "mv_before_eur", "mv_after_eur", "mv_change_eur", "mv_change_pct",
    ]
    agg[outcome_cols].to_csv(RUMOR_OUTPUT_FILES["rumor_outcomes"], index=False)

    # 3) rumor_timeline.csv - aggregate weeks-before x tone -> article count (streamgraph).
    timeline = (
        links_df.groupby(["weeks_before", "tone"]).size().reset_index(name="article_count")
    )
    timeline.to_csv(RUMOR_OUTPUT_FILES["rumor_timeline"], index=False)

    # 4) rumor_highlights.csv - the most-covered transfers with a complete data story.
    from rumor_config import HIGHLIGHT_COUNT

    images = pd.read_csv(CLEANED_FILES["players"], usecols=["player_id", "image_url"])
    complete = agg[
        agg["fee_premium_ratio"].notna()
        & agg["mv_change_pct"].notna()
    ].merge(images, on="player_id", how="left")
    complete = complete[complete["image_url"].notna()]
    highlights = complete.sort_values("article_count", ascending=False).head(HIGHLIGHT_COUNT).copy()
    # Download each highlight's high-res photo locally so the page never depends on
    # live hotlinking (more reliable on GitHub Pages, and avoids cache/referer issues).
    highlights["local_image"] = download_highlight_images(highlights)
    highlight_cols = [
        "transfer_id", "player_name", "image_url", "local_image", "from_club_name", "to_club_name",
        "transfer_season", "transfer_date", "article_count", "rumor_intensity",
        "dominant_tone", "agent_originated", "first_rumor_days",
        "market_value_eur", "fee_eur", "fee_premium_ratio",
        "mv_before_eur", "mv_after_eur", "mv_change_pct",
    ]
    highlights[highlight_cols].to_csv(RUMOR_OUTPUT_FILES["rumor_highlights"], index=False)

    print("\nWrote:")
    for key in ("rumor_articles", "rumor_outcomes", "rumor_timeline", "rumor_highlights"):
        print(f"  {RUMOR_OUTPUT_FILES[key]}")
    print(f"\nTransfers with fee premium: {has_fee.sum()}")
    print(f"Transfers with MV change:   {mv.shape[0]}")
    print("Intensity bucket counts:", dict(agg["rumor_intensity"].value_counts()))


def main():
    parser = argparse.ArgumentParser(description="Link rumor articles to transfers and derive variables.")
    parser.add_argument("--probe", action="store_true", help="report linkage match rates without writing outputs")
    args = parser.parse_args()
    if args.probe:
        run_probe()
    else:
        build_outputs()


if __name__ == "__main__":
    sys.exit(main())

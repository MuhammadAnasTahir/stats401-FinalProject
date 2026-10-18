"""Club-to-club transfer flows behind the league chord diagram.

Uses exactly the same transfer scope, league grouping, position, and fee-status
dimensions as league_transfer_flows.csv, but keeps the buying and selling club
names so the chord tooltips can name the biggest individual club pairs.

Output: data/processed/club_pair_flows.csv
"""

import pandas as pd

from build_finance_data import (
    add_transfer_dimensions,
    add_transfer_league_data,
    build_club_season_league,
    classify_league_group,
    parse_transfer_season,
    read_cleaned_file,
    select_recent_seasons,
)
from config import PROCESSED_DATA_DIR, TOP_FIVE_LEAGUE_IDS

OUTPUT_FILE = PROCESSED_DATA_DIR / "club_pair_flows.csv"


def build_club_pair_flows():
    transfers = read_cleaned_file("transfers")
    games = read_cleaned_file("games")
    competitions = read_cleaned_file("competitions")
    players = read_cleaned_file("players")

    transfers["season"] = parse_transfer_season(transfers["transfer_season"])
    for column in ["from_club_id", "to_club_id", "player_id"]:
        transfers[column] = pd.to_numeric(transfers[column], errors="coerce").astype("Int64")
    transfers["transfer_fee"] = pd.to_numeric(transfers["transfer_fee"], errors="coerce")
    games["season"] = pd.to_numeric(games["season"], errors="coerce").astype("Int64")

    league_map = build_club_season_league(games, competitions)
    recent_seasons = select_recent_seasons(league_map)
    transfers = transfers[transfers["season"].isin(recent_seasons)].copy()
    transfers = add_transfer_dimensions(transfers, players)
    league_map = league_map[league_map["season"].isin(recent_seasons)].copy()

    enriched = add_transfer_league_data(transfers, league_map)
    focal = enriched[
        enriched["from_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
        | enriched["to_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
    ].copy()
    focal["from_group"] = focal.apply(
        lambda row: classify_league_group(row["from_competition_id"], row["from_confederation"]),
        axis=1,
    )
    focal["to_group"] = focal.apply(
        lambda row: classify_league_group(row["to_competition_id"], row["to_confederation"]),
        axis=1,
    )
    focal["from_club_name"] = focal["from_club_name"].fillna("Unknown club")
    focal["to_club_name"] = focal["to_club_name"].fillna("Unknown club")

    grouped = focal.groupby(
        [
            "season",
            "from_group",
            "to_group",
            "from_club_name",
            "to_club_name",
            "position",
            "fee_status",
        ],
        as_index=False,
    ).agg(
        total_fee_eur=("transfer_fee", lambda values: values.sum(min_count=1)),
        transfer_count=("player_id", "size"),
    )
    grouped["total_fee_eur"] = grouped["total_fee_eur"].fillna(0)
    return grouped.sort_values(["season", "total_fee_eur"], ascending=[True, False]).reset_index(drop=True)


def run():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    pairs = build_club_pair_flows()
    pairs.to_csv(OUTPUT_FILE, index=False, encoding="utf-8")
    print(f"Club-pair rows: {len(pairs):,}")
    print(f"Saved: {OUTPUT_FILE}")


if __name__ == "__main__":
    run()

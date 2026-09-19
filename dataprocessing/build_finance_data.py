import pandas as pd

from config import (
    CLEANED_FILES,
    EUROPE_CONFEDERATION,
    OTHER_EUROPE_LABEL,
    OUTSIDE_EUROPE_LABEL,
    OUTPUT_FILES,
    PROCESSED_DATA_DIR,
    RECENT_COMPLETED_SEASONS,
    TOP_FIVE_LEAGUES,
    TOP_FIVE_LEAGUE_IDS,
)


def read_cleaned_file(name):
    path = CLEANED_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"Cleaned data file not found: {path}")
    return pd.read_csv(path, low_memory=False)


def parse_transfer_season(values):
    text = values.astype("string").str.strip()
    first_year = text.str.extract(r"^(\d{2}|\d{4})/")[0]
    numeric = pd.to_numeric(first_year, errors="coerce")
    is_two_digit = first_year.str.len().eq(2)
    converted = numeric.copy()
    converted.loc[is_two_digit & numeric.ge(50)] = numeric.loc[
        is_two_digit & numeric.ge(50)
    ] + 1900
    converted.loc[is_two_digit & numeric.lt(50)] = numeric.loc[
        is_two_digit & numeric.lt(50)
    ] + 2000
    return converted.astype("Int64")


def build_club_season_league(games, competitions):
    competition_columns = [
        "competition_id",
        "name",
        "country_name",
        "confederation",
        "type",
    ]
    competition_data = competitions[competition_columns].drop_duplicates(
        subset=["competition_id"]
    )
    domestic = competition_data[
        competition_data["type"].astype("string").str.lower().eq("domestic_league")
    ]
    domestic_games = games.merge(
        domestic[["competition_id"]],
        on="competition_id",
        how="inner",
    )

    home = domestic_games[["season", "competition_id", "home_club_id"]].rename(
        columns={"home_club_id": "club_id"}
    )
    away = domestic_games[["season", "competition_id", "away_club_id"]].rename(
        columns={"away_club_id": "club_id"}
    )
    club_games = pd.concat([home, away], ignore_index=True).dropna(
        subset=["club_id", "season", "competition_id"]
    )
    club_games["club_id"] = pd.to_numeric(
        club_games["club_id"], errors="coerce"
    ).astype("Int64")
    club_games["season"] = pd.to_numeric(
        club_games["season"], errors="coerce"
    ).astype("Int64")

    counts = (
        club_games.groupby(
            ["club_id", "season", "competition_id"],
            as_index=False,
        )
        .size()
        .rename(columns={"size": "league_game_count"})
    )
    counts = counts.sort_values(
        ["club_id", "season", "league_game_count", "competition_id"],
        ascending=[True, True, False, True],
    )
    league_map = counts.drop_duplicates(
        subset=["club_id", "season"],
        keep="first",
    )
    league_map = league_map.merge(
        competition_data,
        on="competition_id",
        how="left",
    )
    league_map = league_map.rename(columns={"name": "source_league_name"})
    league_map["league_name"] = league_map.apply(
        lambda row: TOP_FIVE_LEAGUES.get(
            row["competition_id"],
            {"name": row["source_league_name"]},
        )["name"],
        axis=1,
    )
    return league_map[
        [
            "club_id",
            "season",
            "competition_id",
            "league_name",
            "country_name",
            "confederation",
            "league_game_count",
        ]
    ].reset_index(drop=True)


def add_transfer_league_data(transfers, league_map):
    result = transfers.copy()
    fields = [
        "club_id",
        "season",
        "competition_id",
        "league_name",
        "country_name",
        "confederation",
    ]

    for side in ["from", "to"]:
        mapping = league_map[fields].rename(
            columns={
                "club_id": f"{side}_club_id",
                "competition_id": f"{side}_competition_id",
                "league_name": f"{side}_league_name",
                "country_name": f"{side}_country_name",
                "confederation": f"{side}_confederation",
            }
        )
        result = result.merge(
            mapping,
            on=[f"{side}_club_id", "season"],
            how="left",
        )

    return result


def aggregate_incoming(transfers):
    incoming = transfers[
        transfers["to_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
    ].copy()
    grouped = incoming.groupby(
        ["to_club_id", "season", "to_competition_id", "to_league_name"],
        as_index=False,
        dropna=False,
    )
    result = grouped.agg(
        spending_eur=("transfer_fee", lambda values: values.sum(min_count=1)),
        incoming_transfer_count=("player_id", "size"),
        incoming_known_fee_count=("transfer_fee", "count"),
        incoming_free_transfer_count=(
            "transfer_fee",
            lambda values: int(values.eq(0).sum()),
        ),
    )
    result["spending_eur"] = result["spending_eur"].fillna(0)
    result["incoming_unknown_fee_count"] = (
        result["incoming_transfer_count"] - result["incoming_known_fee_count"]
    )
    return result.rename(
        columns={
            "to_club_id": "club_id",
            "to_competition_id": "competition_id",
            "to_league_name": "league_name",
        }
    )


def aggregate_outgoing(transfers):
    outgoing = transfers[
        transfers["from_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
    ].copy()
    grouped = outgoing.groupby(
        ["from_club_id", "season", "from_competition_id", "from_league_name"],
        as_index=False,
        dropna=False,
    )
    result = grouped.agg(
        income_eur=("transfer_fee", lambda values: values.sum(min_count=1)),
        outgoing_transfer_count=("player_id", "size"),
        outgoing_known_fee_count=("transfer_fee", "count"),
        outgoing_free_transfer_count=(
            "transfer_fee",
            lambda values: int(values.eq(0).sum()),
        ),
    )
    result["income_eur"] = result["income_eur"].fillna(0)
    result["outgoing_unknown_fee_count"] = (
        result["outgoing_transfer_count"] - result["outgoing_known_fee_count"]
    )
    return result.rename(
        columns={
            "from_club_id": "club_id",
            "from_competition_id": "competition_id",
            "from_league_name": "league_name",
        }
    )


def build_club_finance(transfers, league_map, clubs):
    enriched = add_transfer_league_data(transfers, league_map)
    incoming = aggregate_incoming(enriched)
    outgoing = aggregate_outgoing(enriched)
    keys = ["club_id", "season", "competition_id", "league_name"]
    finance = incoming.merge(outgoing, on=keys, how="outer")

    count_columns = [
        "incoming_transfer_count",
        "incoming_known_fee_count",
        "incoming_free_transfer_count",
        "incoming_unknown_fee_count",
        "outgoing_transfer_count",
        "outgoing_known_fee_count",
        "outgoing_free_transfer_count",
        "outgoing_unknown_fee_count",
    ]
    for column in count_columns:
        finance[column] = finance[column].fillna(0).astype(int)

    finance["spending_eur"] = finance["spending_eur"].fillna(0)
    finance["income_eur"] = finance["income_eur"].fillna(0)
    finance["net_spending_eur"] = finance["spending_eur"] - finance["income_eur"]

    club_names = clubs[["club_id", "name"]].drop_duplicates(subset=["club_id"])
    club_names = club_names.rename(columns={"name": "club_name"})
    finance = finance.merge(club_names, on="club_id", how="left")
    finance["season_label"] = finance["season"].apply(
        lambda year: f"{int(year)}/{str(int(year) + 1)[-2:]}"
    )

    columns = [
        "season",
        "season_label",
        "competition_id",
        "league_name",
        "club_id",
        "club_name",
        "spending_eur",
        "income_eur",
        "net_spending_eur",
        "incoming_transfer_count",
        "incoming_known_fee_count",
        "incoming_unknown_fee_count",
        "incoming_free_transfer_count",
        "outgoing_transfer_count",
        "outgoing_known_fee_count",
        "outgoing_unknown_fee_count",
        "outgoing_free_transfer_count",
    ]
    return finance[columns].sort_values(
        ["season", "league_name", "spending_eur"],
        ascending=[True, True, False],
    ).reset_index(drop=True)


def classify_league_group(competition_id, confederation):
    if competition_id in TOP_FIVE_LEAGUES:
        return TOP_FIVE_LEAGUES[competition_id]["name"]
    if str(confederation).lower() == EUROPE_CONFEDERATION:
        return OTHER_EUROPE_LABEL
    return OUTSIDE_EUROPE_LABEL


def build_league_flows(transfers, league_map):
    enriched = add_transfer_league_data(transfers, league_map)
    focal = enriched[
        enriched["from_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
        | enriched["to_competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
    ].copy()
    focal["from_group"] = focal.apply(
        lambda row: classify_league_group(
            row["from_competition_id"],
            row["from_confederation"],
        ),
        axis=1,
    )
    focal["to_group"] = focal.apply(
        lambda row: classify_league_group(
            row["to_competition_id"],
            row["to_confederation"],
        ),
        axis=1,
    )
    grouped = focal.groupby(
        ["season", "from_group", "to_group"],
        as_index=False,
    )
    flows = grouped.agg(
        total_fee_eur=("transfer_fee", lambda values: values.sum(min_count=1)),
        transfer_count=("player_id", "size"),
        known_fee_count=("transfer_fee", "count"),
        free_transfer_count=("transfer_fee", lambda values: int(values.eq(0).sum())),
    )
    flows["total_fee_eur"] = flows["total_fee_eur"].fillna(0)
    flows["unknown_fee_count"] = flows["transfer_count"] - flows["known_fee_count"]
    flows["season_label"] = flows["season"].apply(
        lambda year: f"{int(year)}/{str(int(year) + 1)[-2:]}"
    )
    columns = [
        "season",
        "season_label",
        "from_group",
        "to_group",
        "total_fee_eur",
        "transfer_count",
        "known_fee_count",
        "unknown_fee_count",
        "free_transfer_count",
    ]
    return flows[columns].sort_values(
        ["season", "total_fee_eur"],
        ascending=[True, False],
    ).reset_index(drop=True)


def select_recent_seasons(league_map):
    seasons = sorted(
        league_map.loc[
            league_map["competition_id"].isin(TOP_FIVE_LEAGUE_IDS),
            "season",
        ]
        .dropna()
        .astype(int)
        .unique()
    )
    return seasons[-RECENT_COMPLETED_SEASONS:]


def run_finance_pipeline():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    transfers = read_cleaned_file("transfers")
    games = read_cleaned_file("games")
    competitions = read_cleaned_file("competitions")
    clubs = read_cleaned_file("clubs")

    transfers["season"] = parse_transfer_season(transfers["transfer_season"])
    transfers["from_club_id"] = pd.to_numeric(
        transfers["from_club_id"], errors="coerce"
    ).astype("Int64")
    transfers["to_club_id"] = pd.to_numeric(
        transfers["to_club_id"], errors="coerce"
    ).astype("Int64")
    transfers["transfer_fee"] = pd.to_numeric(
        transfers["transfer_fee"], errors="coerce"
    )
    games["season"] = pd.to_numeric(games["season"], errors="coerce").astype("Int64")
    clubs["club_id"] = pd.to_numeric(clubs["club_id"], errors="coerce").astype("Int64")

    league_map = build_club_season_league(games, competitions)
    recent_seasons = select_recent_seasons(league_map)
    transfers = transfers[transfers["season"].isin(recent_seasons)].copy()
    league_map = league_map[league_map["season"].isin(recent_seasons)].copy()

    finance = build_club_finance(transfers, league_map, clubs)
    flows = build_league_flows(transfers, league_map)

    finance.to_csv(
        OUTPUT_FILES["club_season_finance"],
        index=False,
        encoding="utf-8",
    )
    flows.to_csv(
        OUTPUT_FILES["league_transfer_flows"],
        index=False,
        encoding="utf-8",
    )

    print(f"Seasons: {recent_seasons[0]} to {recent_seasons[-1]}")
    print(f"Club-season finance rows: {len(finance):,}")
    print(f"League flow rows: {len(flows):,}")
    print(f"Saved: {OUTPUT_FILES['club_season_finance']}")
    print(f"Saved: {OUTPUT_FILES['league_transfer_flows']}")


if __name__ == "__main__":
    run_finance_pipeline()
import pandas as pd

from config import (
    CLEANED_FILES,
    MARKET_VALUE_MAX_DISTANCE_DAYS,
    MARKET_VALUE_SNAPSHOT_DAY,
    MARKET_VALUE_SNAPSHOT_MONTH,
    OUTPUT_FILES,
    PROCESSED_DATA_DIR,
)


def read_cleaned_file(name):
    path = CLEANED_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"Cleaned data file not found: {path}")
    return pd.read_csv(path, low_memory=False)


def read_processed_file(name):
    path = OUTPUT_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"Processed data file not found: {path}")
    return pd.read_csv(path, low_memory=False)


def prepare_valuations(valuations):
    result = valuations.copy()
    result["player_id"] = pd.to_numeric(
        result["player_id"], errors="coerce"
    ).astype("Int64")
    result["current_club_id"] = pd.to_numeric(
        result["current_club_id"], errors="coerce"
    ).astype("Int64")
    result["market_value_in_eur"] = pd.to_numeric(
        result["market_value_in_eur"], errors="coerce"
    )
    result["date"] = pd.to_datetime(result["date"], errors="coerce")
    result = result.dropna(
        subset=["player_id", "current_club_id", "market_value_in_eur", "date"]
    )
    result = result[result["market_value_in_eur"] >= 0]
    return result


def select_snapshot_valuations(valuations, seasons):
    prepared = prepare_valuations(valuations)
    selected = []

    for season in seasons:
        snapshot_date = pd.Timestamp(
            year=int(season),
            month=MARKET_VALUE_SNAPSHOT_MONTH,
            day=MARKET_VALUE_SNAPSHOT_DAY,
        )
        start_date = snapshot_date - pd.Timedelta(
            days=MARKET_VALUE_MAX_DISTANCE_DAYS
        )
        end_date = snapshot_date + pd.Timedelta(
            days=MARKET_VALUE_MAX_DISTANCE_DAYS
        )
        candidates = prepared[
            prepared["date"].between(start_date, end_date, inclusive="both")
        ].copy()
        if candidates.empty:
            continue
        candidates["season"] = int(season)
        candidates["snapshot_date"] = snapshot_date
        candidates["distance_from_snapshot_days"] = (
            candidates["date"] - snapshot_date
        ).abs().dt.days
        candidates = candidates.sort_values(
            ["player_id", "distance_from_snapshot_days", "date"],
            ascending=[True, True, False],
        )
        candidates = candidates.drop_duplicates(subset=["player_id"], keep="first")
        selected.append(candidates)

    if not selected:
        return pd.DataFrame(
            columns=[
                "player_id",
                "current_club_id",
                "market_value_in_eur",
                "date",
                "season",
                "snapshot_date",
                "distance_from_snapshot_days",
            ]
        )

    return pd.concat(selected, ignore_index=True)


def aggregate_club_market_values(snapshot_valuations):
    if snapshot_valuations.empty:
        return pd.DataFrame(
            columns=[
                "season",
                "club_id",
                "squad_market_value_eur",
                "valued_player_count",
                "average_player_value_eur",
                "median_player_value_eur",
                "average_snapshot_distance_days",
            ]
        )

    result = (
        snapshot_valuations.groupby(
            ["season", "current_club_id"],
            as_index=False,
        )
        .agg(
            squad_market_value_eur=("market_value_in_eur", "sum"),
            valued_player_count=("player_id", "nunique"),
            average_player_value_eur=("market_value_in_eur", "mean"),
            median_player_value_eur=("market_value_in_eur", "median"),
            average_snapshot_distance_days=("distance_from_snapshot_days", "mean"),
        )
        .rename(columns={"current_club_id": "club_id"})
    )
    result["average_snapshot_distance_days"] = result[
        "average_snapshot_distance_days"
    ].round(2)
    return result


def build_market_values(valuations, performance):
    base_columns = [
        "season",
        "season_label",
        "competition_id",
        "league_name",
        "club_id",
        "club_name",
    ]
    base = performance[base_columns].drop_duplicates(
        subset=["season", "competition_id", "club_id"]
    )
    base["season"] = pd.to_numeric(base["season"], errors="coerce").astype("Int64")
    base["club_id"] = pd.to_numeric(base["club_id"], errors="coerce").astype("Int64")
    seasons = sorted(base["season"].dropna().astype(int).unique())
    snapshot_valuations = select_snapshot_valuations(valuations, seasons)
    club_values = aggregate_club_market_values(snapshot_valuations)
    if not club_values.empty:
        club_values["season"] = pd.to_numeric(
            club_values["season"], errors="coerce"
        ).astype("Int64")
        club_values["club_id"] = pd.to_numeric(
            club_values["club_id"], errors="coerce"
        ).astype("Int64")

    result = base.merge(
        club_values,
        on=["season", "club_id"],
        how="left",
        validate="one_to_one",
    )
    result["valued_player_count"] = result["valued_player_count"].fillna(0).astype(int)
    result["snapshot_date"] = pd.to_datetime(
        result["season"].astype(str)
        + f"-{MARKET_VALUE_SNAPSHOT_MONTH:02d}-{MARKET_VALUE_SNAPSHOT_DAY:02d}"
    )
    columns = [
        "season",
        "season_label",
        "snapshot_date",
        "competition_id",
        "league_name",
        "club_id",
        "club_name",
        "squad_market_value_eur",
        "valued_player_count",
        "average_player_value_eur",
        "median_player_value_eur",
        "average_snapshot_distance_days",
    ]
    return result[columns].sort_values(
        ["season", "league_name", "squad_market_value_eur"],
        ascending=[True, True, False],
        na_position="last",
    ).reset_index(drop=True)


def run_market_value_pipeline():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    valuations = read_cleaned_file("player_valuations")
    performance = read_processed_file("club_season_performance")
    market_values = build_market_values(valuations, performance)
    market_values.to_csv(
        OUTPUT_FILES["club_season_market_value"],
        index=False,
        encoding="utf-8",
    )
    missing_count = int(market_values["squad_market_value_eur"].isna().sum())
    median_players = market_values.loc[
        market_values["valued_player_count"] > 0,
        "valued_player_count",
    ].median()
    print(
        f"Seasons: {int(market_values['season'].min())} "
        f"to {int(market_values['season'].max())}"
    )
    print(f"Club-season market value rows: {len(market_values):,}")
    print(f"Rows without a market value: {missing_count:,}")
    print(f"Median valued players per available club-season: {median_players:.1f}")
    print(f"Saved: {OUTPUT_FILES['club_season_market_value']}")


if __name__ == "__main__":
    run_market_value_pipeline()
import pandas as pd

from config import OUTPUT_FILES, PROCESSED_DATA_DIR


KEY_COLUMNS = ["season", "competition_id", "club_id"]


def read_processed_file(name):
    path = OUTPUT_FILES[name]
    if not path.exists():
        raise FileNotFoundError(f"Processed data file not found: {path}")
    return pd.read_csv(path, low_memory=False)


def validate_unique_keys(name, frame):
    duplicated = frame.duplicated(subset=KEY_COLUMNS, keep=False)
    if duplicated.any():
        count = int(duplicated.sum())
        raise ValueError(f"{name} contains {count} rows with duplicate keys")


def build_treemap_data(finance):
    validate_unique_keys("club_season_finance", finance)
    result = finance.copy()
    result["spending_eur"] = pd.to_numeric(result["spending_eur"], errors="coerce").fillna(0)
    result["income_eur"] = pd.to_numeric(result["income_eur"], errors="coerce").fillna(0)
    result["net_spending_eur"] = pd.to_numeric(
        result["net_spending_eur"], errors="coerce"
    ).fillna(0)
    result["league_spending_eur"] = result.groupby(
        ["season", "competition_id"]
    )["spending_eur"].transform("sum")
    result["top_five_spending_eur"] = result.groupby("season")[
        "spending_eur"
    ].transform("sum")
    result["league_spending_share"] = (
        result["spending_eur"] / result["league_spending_eur"].replace(0, pd.NA)
    ).fillna(0)
    result["top_five_spending_share"] = (
        result["spending_eur"] / result["top_five_spending_eur"].replace(0, pd.NA)
    ).fillna(0)
    result["treemap_value_eur"] = result["spending_eur"]
    result["spending_million_eur"] = result["spending_eur"] / 1_000_000
    result["income_million_eur"] = result["income_eur"] / 1_000_000
    result["net_spending_million_eur"] = result["net_spending_eur"] / 1_000_000
    result["node_id"] = (
        result["season"].astype(str)
        + "-"
        + result["competition_id"].astype(str)
        + "-"
        + result["club_id"].astype(str)
    )
    result["parent_id"] = (
        result["season"].astype(str)
        + "-"
        + result["competition_id"].astype(str)
    )
    columns = [
        "season",
        "season_label",
        "competition_id",
        "league_name",
        "club_id",
        "club_name",
        "node_id",
        "parent_id",
        "treemap_value_eur",
        "spending_eur",
        "income_eur",
        "net_spending_eur",
        "spending_million_eur",
        "income_million_eur",
        "net_spending_million_eur",
        "league_spending_eur",
        "top_five_spending_eur",
        "league_spending_share",
        "top_five_spending_share",
        "incoming_transfer_count",
        "incoming_known_fee_count",
        "incoming_unknown_fee_count",
        "outgoing_transfer_count",
    ]
    return result[columns].sort_values(
        ["season", "league_name", "spending_eur"],
        ascending=[True, True, False],
    ).reset_index(drop=True)


def merge_visualization_sources(finance, performance, market_values):
    validate_unique_keys("club_season_finance", finance)
    validate_unique_keys("club_season_performance", performance)
    validate_unique_keys("club_season_market_value", market_values)

    performance_columns = [
        column
        for column in performance.columns
        if column in KEY_COLUMNS
        or column
        not in {"season_label", "league_name", "club_name"}
    ]
    market_columns = [
        column
        for column in market_values.columns
        if column in KEY_COLUMNS
        or column
        not in {
            "season_label",
            "snapshot_date",
            "league_name",
            "club_name",
        }
    ]

    result = finance.merge(
        performance[performance_columns],
        on=KEY_COLUMNS,
        how="inner",
        validate="one_to_one",
    )
    result = result.merge(
        market_values[market_columns],
        on=KEY_COLUMNS,
        how="left",
        validate="one_to_one",
    )

    if len(result) != len(finance):
        raise ValueError(
            f"Visualization merge lost rows: {len(finance)} finance rows became {len(result)} rows"
        )

    return result


def add_performance_comparison_fields(frame):
    result = frame.copy()
    result["spending_rank"] = result.groupby("season")["spending_eur"].rank(
        method="min",
        ascending=False,
    )
    result["performance_rank"] = result.groupby("season")["points_per_game"].rank(
        method="min",
        ascending=False,
    )
    result["spending_percentile"] = result.groupby("season")["spending_eur"].rank(
        method="average",
        pct=True,
        ascending=True,
    )
    result["performance_percentile"] = result.groupby("season")[
        "points_per_game"
    ].rank(
        method="average",
        pct=True,
        ascending=True,
    )
    result["performance_residual"] = (
        result["performance_percentile"] - result["spending_percentile"]
    )
    result["rank_difference"] = result["spending_rank"] - result["performance_rank"]
    result["performance_category"] = "As expected"
    result.loc[
        result["performance_residual"] >= 0.15,
        "performance_category",
    ] = "Over-performing"
    result.loc[
        result["performance_residual"] <= -0.15,
        "performance_category",
    ] = "Under-performing"
    return result


def build_spending_performance_data(finance, performance, market_values):
    result = merge_visualization_sources(finance, performance, market_values)
    result["spending_million_eur"] = result["spending_eur"] / 1_000_000
    result["income_million_eur"] = result["income_eur"] / 1_000_000
    result["net_spending_million_eur"] = result["net_spending_eur"] / 1_000_000
    result["squad_market_value_million_eur"] = (
        result["squad_market_value_eur"] / 1_000_000
    )
    result = add_performance_comparison_fields(result)
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
        "spending_million_eur",
        "income_million_eur",
        "net_spending_million_eur",
        "incoming_transfer_count",
        "incoming_known_fee_count",
        "incoming_unknown_fee_count",
        "matches_played",
        "wins",
        "draws",
        "losses",
        "goals_for",
        "goals_against",
        "goal_difference",
        "points",
        "points_per_game",
        "win_rate",
        "final_position",
        "squad_market_value_eur",
        "squad_market_value_million_eur",
        "valued_player_count",
        "spending_rank",
        "performance_rank",
        "spending_percentile",
        "performance_percentile",
        "performance_residual",
        "rank_difference",
        "performance_category",
    ]
    return result[columns].sort_values(
        ["season", "performance_residual"],
        ascending=[True, False],
    ).reset_index(drop=True)


def run_visualization_pipeline():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    finance = read_processed_file("club_season_finance")
    performance = read_processed_file("club_season_performance")
    market_values = read_processed_file("club_season_market_value")
    treemap = build_treemap_data(finance)
    spending_performance = build_spending_performance_data(
        finance,
        performance,
        market_values,
    )
    treemap.to_csv(
        OUTPUT_FILES["treemap"],
        index=False,
        encoding="utf-8",
    )
    spending_performance.to_csv(
        OUTPUT_FILES["spending_performance"],
        index=False,
        encoding="utf-8",
    )
    print(f"Treemap rows: {len(treemap):,}")
    print(f"Spending-performance rows: {len(spending_performance):,}")
    print(f"Saved: {OUTPUT_FILES['treemap']}")
    print(f"Saved: {OUTPUT_FILES['spending_performance']}")


if __name__ == "__main__":
    run_visualization_pipeline()
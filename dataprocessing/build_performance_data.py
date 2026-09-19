import pandas as pd

from config import (
    CLEANED_FILES,
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


def select_recent_seasons(games):
    seasons = sorted(
        pd.to_numeric(
            games.loc[
                games["competition_id"].isin(TOP_FIVE_LEAGUE_IDS),
                "season",
            ],
            errors="coerce",
        )
        .dropna()
        .astype(int)
        .unique()
    )
    return seasons[-RECENT_COMPLETED_SEASONS:]


def prepare_match_data(games, club_games, seasons):
    game_columns = ["game_id", "competition_id", "season", "date"]
    selected_games = games[game_columns].copy()
    selected_games["game_id"] = pd.to_numeric(
        selected_games["game_id"], errors="coerce"
    ).astype("Int64")
    selected_games["season"] = pd.to_numeric(
        selected_games["season"], errors="coerce"
    ).astype("Int64")
    selected_games["date"] = pd.to_datetime(
        selected_games["date"], errors="coerce"
    )
    selected_games = selected_games[
        selected_games["competition_id"].isin(TOP_FIVE_LEAGUE_IDS)
        & selected_games["season"].isin(seasons)
    ]

    selected_club_games = club_games.copy()
    for column in ["game_id", "club_id"]:
        selected_club_games[column] = pd.to_numeric(
            selected_club_games[column], errors="coerce"
        ).astype("Int64")
    for column in ["own_goals", "opponent_goals", "own_position"]:
        selected_club_games[column] = pd.to_numeric(
            selected_club_games[column], errors="coerce"
        )

    matches = selected_club_games.merge(
        selected_games,
        on="game_id",
        how="inner",
        validate="many_to_one",
    )
    matches = matches.dropna(
        subset=[
            "club_id",
            "season",
            "competition_id",
            "own_goals",
            "opponent_goals",
        ]
    )
    matches["win"] = matches["own_goals"] > matches["opponent_goals"]
    matches["draw"] = matches["own_goals"] == matches["opponent_goals"]
    matches["loss"] = matches["own_goals"] < matches["opponent_goals"]
    matches["points"] = matches["win"].astype(int) * 3 + matches["draw"].astype(int)
    return matches


def calculate_final_positions(matches):
    position_rows = matches.dropna(subset=["own_position", "date"]).copy()
    position_rows = position_rows.sort_values(
        ["competition_id", "season", "club_id", "date", "game_id"]
    )
    position_rows = position_rows.drop_duplicates(
        subset=["competition_id", "season", "club_id"],
        keep="last",
    )
    return position_rows[
        ["competition_id", "season", "club_id", "own_position"]
    ].rename(columns={"own_position": "recorded_final_position"})


def add_position_fallback(performance):
    result = performance.copy()
    result = result.sort_values(
        [
            "competition_id",
            "season",
            "points",
            "goal_difference",
            "goals_for",
        ],
        ascending=[True, True, False, False, False],
    )
    result["calculated_position"] = (
        result.groupby(["competition_id", "season"]).cumcount() + 1
    )
    result["final_position"] = result["recorded_final_position"].fillna(
        result["calculated_position"]
    )
    result["final_position"] = result["final_position"].astype("Int64")
    return result.drop(columns=["recorded_final_position", "calculated_position"])


def build_performance(games, club_games, clubs, seasons):
    matches = prepare_match_data(games, club_games, seasons)
    keys = ["competition_id", "season", "club_id"]
    performance = (
        matches.groupby(keys, as_index=False)
        .agg(
            matches_played=("game_id", "nunique"),
            wins=("win", "sum"),
            draws=("draw", "sum"),
            losses=("loss", "sum"),
            goals_for=("own_goals", "sum"),
            goals_against=("opponent_goals", "sum"),
            points=("points", "sum"),
        )
    )
    performance["goal_difference"] = (
        performance["goals_for"] - performance["goals_against"]
    )
    performance["points_per_game"] = (
        performance["points"] / performance["matches_played"]
    )
    performance["win_rate"] = (
        performance["wins"] / performance["matches_played"]
    )

    final_positions = calculate_final_positions(matches)
    performance = performance.merge(final_positions, on=keys, how="left")
    performance = add_position_fallback(performance)

    club_names = clubs[["club_id", "name"]].copy()
    club_names["club_id"] = pd.to_numeric(
        club_names["club_id"], errors="coerce"
    ).astype("Int64")
    club_names = club_names.drop_duplicates(subset=["club_id"])
    club_names = club_names.rename(columns={"name": "club_name"})
    performance = performance.merge(club_names, on="club_id", how="left")
    performance["league_name"] = performance["competition_id"].map(
        {key: value["name"] for key, value in TOP_FIVE_LEAGUES.items()}
    )
    performance["season_label"] = performance["season"].apply(
        lambda year: f"{int(year)}/{str(int(year) + 1)[-2:]}"
    )
    performance["points_per_game"] = performance["points_per_game"].round(4)
    performance["win_rate"] = performance["win_rate"].round(4)

    integer_columns = [
        "matches_played",
        "wins",
        "draws",
        "losses",
        "goals_for",
        "goals_against",
        "goal_difference",
        "points",
    ]
    for column in integer_columns:
        performance[column] = performance[column].astype(int)

    columns = [
        "season",
        "season_label",
        "competition_id",
        "league_name",
        "club_id",
        "club_name",
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
    ]
    return performance[columns].sort_values(
        ["season", "league_name", "final_position"],
        ascending=[True, True, True],
    ).reset_index(drop=True)


def run_performance_pipeline():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    games = read_cleaned_file("games")
    club_games = read_cleaned_file("club_games")
    clubs = read_cleaned_file("clubs")
    seasons = select_recent_seasons(games)
    performance = build_performance(games, club_games, clubs, seasons)
    performance.to_csv(
        OUTPUT_FILES["club_season_performance"],
        index=False,
        encoding="utf-8",
    )
    print(f"Seasons: {seasons[0]} to {seasons[-1]}")
    print(f"Club-season performance rows: {len(performance):,}")
    print(f"Saved: {OUTPUT_FILES['club_season_performance']}")


if __name__ == "__main__":
    run_performance_pipeline()
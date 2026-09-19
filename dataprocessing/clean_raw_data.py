import pandas as pd

from config import (
    CLEANED_DATA_DIR,
    CLEANED_FILES,
    DATA_CUTOFF_DATE,
    PROCESSED_DATA_DIR,
    RAW_FILES,
    REQUIRED_COLUMNS,
)


ID_COLUMNS = {
    "club_games": ["game_id", "club_id", "opponent_id"],
    "clubs": ["club_id"],
    "competitions": ["country_id"],
    "games": ["game_id", "home_club_id", "away_club_id"],
    "player_valuations": ["player_id", "current_club_id"],
    "players": ["player_id", "current_club_id", "current_national_team_id"],
    "transfers": ["player_id", "from_club_id", "to_club_id"],
}

NUMERIC_COLUMNS = {
    "club_games": [
        "own_goals",
        "own_position",
        "opponent_goals",
        "opponent_position",
        "is_win",
    ],
    "clubs": [
        "total_market_value",
        "squad_size",
        "average_age",
        "foreigners_number",
        "foreigners_percentage",
        "national_team_players",
        "stadium_seats",
        "last_season",
    ],
    "competitions": ["total_clubs"],
    "games": [
        "season",
        "home_club_goals",
        "away_club_goals",
        "home_club_position",
        "away_club_position",
        "attendance",
    ],
    "player_valuations": ["market_value_in_eur"],
    "players": [
        "last_season",
        "height_in_cm",
        "international_caps",
        "international_goals",
        "market_value_in_eur",
        "highest_market_value_in_eur",
    ],
    "transfers": ["transfer_fee", "market_value_in_eur"],
}

DATE_COLUMNS = {
    "games": ["date"],
    "player_valuations": ["date"],
    "players": ["date_of_birth", "contract_expiration_date"],
    "transfers": ["transfer_date"],
}

PRIMARY_DATE_COLUMNS = {
    "games": "date",
    "player_valuations": "date",
    "transfers": "transfer_date",
}

UNIQUE_KEYS = {
    "club_games": ["game_id", "club_id"],
    "clubs": ["club_id"],
    "competitions": ["competition_id"],
    "games": ["game_id"],
    "player_valuations": ["player_id", "date"],
    "players": ["player_id"],
    "transfers": ["player_id", "transfer_date"],
}


def normalize_column_names(frame):
    result = frame.copy()
    result.columns = [str(column).replace("\ufeff", "").strip() for column in result.columns]
    return result


def validate_columns(name, frame):
    missing = REQUIRED_COLUMNS[name] - set(frame.columns)
    if missing:
        columns = ", ".join(sorted(missing))
        raise ValueError(f"Missing required columns in {name}.csv: {columns}")


def clean_text_columns(frame):
    result = frame.copy()
    text_columns = result.select_dtypes(include=["object", "string"]).columns
    for column in text_columns:
        result[column] = result[column].astype("string").str.strip()
        result[column] = result[column].replace("", pd.NA)
    return result


def convert_integer_columns(name, frame):
    result = frame.copy()
    for column in ID_COLUMNS.get(name, []):
        if column in result.columns:
            result[column] = pd.to_numeric(result[column], errors="coerce").astype("Int64")
    return result


def convert_numeric_columns(name, frame):
    result = frame.copy()
    for column in NUMERIC_COLUMNS.get(name, []):
        if column in result.columns:
            result[column] = pd.to_numeric(result[column], errors="coerce")
    return result


def convert_date_columns(name, frame):
    result = frame.copy()
    for column in DATE_COLUMNS.get(name, []):
        if column in result.columns:
            result[column] = pd.to_datetime(result[column], errors="coerce")
    return result


def remove_invalid_rows(name, frame):
    result = frame.copy()
    primary_date = PRIMARY_DATE_COLUMNS.get(name)
    if primary_date:
        cutoff = pd.Timestamp(DATA_CUTOFF_DATE)
        result = result[result[primary_date].notna()]
        result = result[result[primary_date] <= cutoff]

    if name == "club_games":
        result = result.dropna(subset=["game_id", "club_id"])
    elif name == "clubs":
        result = result.dropna(subset=["club_id", "name"])
    elif name == "competitions":
        result = result.dropna(subset=["competition_id", "name"])
    elif name == "games":
        result = result.dropna(
            subset=["game_id", "competition_id", "season", "home_club_id", "away_club_id"]
        )
    elif name == "player_valuations":
        result = result.dropna(subset=["player_id", "market_value_in_eur"])
        result = result[result["market_value_in_eur"] >= 0]
    elif name == "players":
        result = result.dropna(subset=["player_id", "name"])
    elif name == "transfers":
        result = result.dropna(
            subset=["player_id", "transfer_season", "from_club_id", "to_club_id"]
        )
        result.loc[result["transfer_fee"] < 0, "transfer_fee"] = pd.NA
        result.loc[result["market_value_in_eur"] < 0, "market_value_in_eur"] = pd.NA

    return result


def remove_duplicates(name, frame):
    result = frame.drop_duplicates().copy()
    keys = UNIQUE_KEYS.get(name)
    if keys:
        result = result.drop_duplicates(subset=keys, keep="last")
    return result


def standardize_categories(name, frame):
    result = frame.copy()
    if name == "competitions":
        result["confederation"] = result["confederation"].str.lower()
        result["type"] = result["type"].str.lower()
    if name == "club_games" and "hosting" in result.columns:
        result["hosting"] = result["hosting"].str.title()
    return result


def clean_dataframe(name, frame):
    result = normalize_column_names(frame)
    validate_columns(name, result)
    result = clean_text_columns(result)
    result = convert_integer_columns(name, result)
    result = convert_numeric_columns(name, result)
    result = convert_date_columns(name, result)
    result = remove_invalid_rows(name, result)
    result = remove_duplicates(name, result)
    result = standardize_categories(name, result)
    return result.reset_index(drop=True)


def read_raw_file(path):
    if not path.exists():
        raise FileNotFoundError(f"Raw data file not found: {path}")
    return pd.read_csv(path, encoding="utf-8", low_memory=False)


def run_cleaning():
    PROCESSED_DATA_DIR.mkdir(parents=True, exist_ok=True)
    CLEANED_DATA_DIR.mkdir(parents=True, exist_ok=True)

    for name, input_path in RAW_FILES.items():
        raw_frame = read_raw_file(input_path)
        cleaned_frame = clean_dataframe(name, raw_frame)
        output_path = CLEANED_FILES[name]
        cleaned_frame.to_csv(output_path, index=False, encoding="utf-8")
        print(f"{name}: {len(raw_frame):,} -> {len(cleaned_frame):,} rows")

    print(f"Cleaned files saved to: {CLEANED_DATA_DIR}")


if __name__ == "__main__":
    run_cleaning()
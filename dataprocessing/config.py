from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = PROJECT_ROOT / "data"
RAW_DATA_DIR = DATA_DIR / "rawdata"
PROCESSED_DATA_DIR = DATA_DIR / "processed"
CLEANED_DATA_DIR = PROCESSED_DATA_DIR / "cleaned"

RAW_FILES = {
    "club_games": RAW_DATA_DIR / "club_games.csv",
    "clubs": RAW_DATA_DIR / "clubs.csv",
    "competitions": RAW_DATA_DIR / "competitions.csv",
    "games": RAW_DATA_DIR / "games.csv",
    "player_valuations": RAW_DATA_DIR / "player_valuations.csv",
    "players": RAW_DATA_DIR / "players.csv",
    "transfers": RAW_DATA_DIR / "transfers.csv",
}

CLEANED_FILES = {
    name: CLEANED_DATA_DIR / f"{name}_clean.csv"
    for name in RAW_FILES
}

OUTPUT_FILES = {
    "club_season_finance": PROCESSED_DATA_DIR / "club_season_finance.csv",
    "club_season_performance": PROCESSED_DATA_DIR / "club_season_performance.csv",
    "club_season_market_value": PROCESSED_DATA_DIR / "club_season_market_value.csv",
    "treemap": PROCESSED_DATA_DIR / "treemap_data.csv",
    "league_transfer_flows": PROCESSED_DATA_DIR / "league_transfer_flows.csv",
    "spending_performance": PROCESSED_DATA_DIR / "spending_performance.csv",
    "data_quality_report": PROCESSED_DATA_DIR / "data_quality_report.csv",
}

TOP_FIVE_LEAGUES = {
    "GB1": {"name": "Premier League", "country": "England"},
    "ES1": {"name": "La Liga", "country": "Spain"},
    "L1": {"name": "Bundesliga", "country": "Germany"},
    "IT1": {"name": "Serie A", "country": "Italy"},
    "FR1": {"name": "Ligue 1", "country": "France"},
}

TOP_FIVE_LEAGUE_IDS = tuple(TOP_FIVE_LEAGUES)
EUROPE_CONFEDERATION = "europa"
OTHER_EUROPE_LABEL = "Other Europe"
OUTSIDE_EUROPE_LABEL = "Outside Europe / Unknown"
RECENT_COMPLETED_SEASONS = 10
DATA_CUTOFF_DATE = date(2026, 7, 6)
SEASON_START_MONTH = 7
MARKET_VALUE_SNAPSHOT_MONTH = 9
MARKET_VALUE_SNAPSHOT_DAY = 1
MARKET_VALUE_MAX_DISTANCE_DAYS = 120

REQUIRED_COLUMNS = {
    "club_games": {
        "game_id",
        "club_id",
        "own_goals",
        "own_position",
        "opponent_id",
        "opponent_goals",
        "hosting",
    },
    "clubs": {
        "club_id",
        "name",
        "domestic_competition_id",
    },
    "competitions": {
        "competition_id",
        "name",
        "country_name",
        "confederation",
        "type",
    },
    "games": {
        "game_id",
        "competition_id",
        "season",
        "date",
        "home_club_id",
        "away_club_id",
        "home_club_goals",
        "away_club_goals",
    },
    "player_valuations": {
        "player_id",
        "date",
        "current_club_id",
        "market_value_in_eur",
    },
    "players": {
        "player_id",
        "name",
        "position",
        "current_club_id",
    },
    "transfers": {
        "player_id",
        "transfer_date",
        "transfer_season",
        "from_club_id",
        "to_club_id",
        "from_club_name",
        "to_club_name",
        "transfer_fee",
        "market_value_in_eur",
    },
}
"""Regression tests for the spending-to-later-performance chart data."""

from pathlib import Path
import sys
import unittest

import pandas as pd


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_visualization_data import build_spending_performance_data


class SpendingPerformanceDataTests(unittest.TestCase):
    def test_spending_is_paired_with_the_following_seasons_performance(self):
        finance = pd.DataFrame([
            {"season": 2020, "season_label": "2020/21", "competition_id": "GB1", "league_name": "Premier League", "club_id": 1, "club_name": "Example FC", "spending_eur": 100_000_000, "income_eur": 10_000_000, "net_spending_eur": 90_000_000, "incoming_transfer_count": 4, "incoming_known_fee_count": 4, "incoming_unknown_fee_count": 0},
            {"season": 2021, "season_label": "2021/22", "competition_id": "GB1", "league_name": "Premier League", "club_id": 1, "club_name": "Example FC", "spending_eur": 50_000_000, "income_eur": 0, "net_spending_eur": 50_000_000, "incoming_transfer_count": 2, "incoming_known_fee_count": 2, "incoming_unknown_fee_count": 0},
        ])
        performance = pd.DataFrame([
            {"season": 2020, "season_label": "2020/21", "competition_id": "GB1", "league_name": "Premier League", "club_id": 1, "club_name": "Example FC", "matches_played": 38, "wins": 20, "draws": 8, "losses": 10, "goals_for": 70, "goals_against": 40, "goal_difference": 30, "points": 68, "points_per_game": 1.7895, "win_rate": 0.5263, "final_position": 4},
            {"season": 2021, "season_label": "2021/22", "competition_id": "GB1", "league_name": "Premier League", "club_id": 1, "club_name": "Example FC", "matches_played": 38, "wins": 25, "draws": 8, "losses": 5, "goals_for": 80, "goals_against": 30, "goal_difference": 50, "points": 83, "points_per_game": 2.1842, "win_rate": 0.6579, "final_position": 2},
        ])
        market_values = pd.DataFrame([
            {"season": 2020, "competition_id": "GB1", "club_id": 1, "squad_market_value_eur": 400_000_000, "valued_player_count": 22},
            {"season": 2021, "competition_id": "GB1", "club_id": 1, "squad_market_value_eur": 450_000_000, "valued_player_count": 22},
        ])

        result = build_spending_performance_data(finance, performance, market_values)

        self.assertEqual(result["season"].tolist(), [2020])
        self.assertEqual(result.loc[0, "performance_season"], 2021)
        self.assertEqual(result.loc[0, "performance_season_label"], "2021/22")
        self.assertEqual(result.loc[0, "points_per_game"], 2.1842)


if __name__ == "__main__":
    unittest.main()

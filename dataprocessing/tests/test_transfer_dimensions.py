"""Tests for position and fee-status dimensions used by transfer-flow filters."""

from pathlib import Path
import sys
import unittest

import pandas as pd


sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from build_finance_data import add_transfer_dimensions


class TransferDimensionTests(unittest.TestCase):
    def test_assigns_position_and_fee_status_without_treating_unknown_as_free(self):
        transfers = pd.DataFrame([
            {"player_id": 1, "transfer_fee": 12_000_000},
            {"player_id": 2, "transfer_fee": 0},
            {"player_id": 3, "transfer_fee": pd.NA},
        ])
        players = pd.DataFrame([
            {"player_id": 1, "position": "Attack"},
            {"player_id": 2, "position": "Midfield"},
        ])

        result = add_transfer_dimensions(transfers, players)

        self.assertEqual(result["position"].tolist(), ["Attack", "Midfield", "Unknown"])
        self.assertEqual(result["fee_status"].tolist(), ["Paid fee", "Free transfer", "Unknown fee"])


if __name__ == "__main__":
    unittest.main()

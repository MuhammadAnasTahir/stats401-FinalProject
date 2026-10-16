"""Regression checks for visual encodings implemented in the D3 source."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ChartEncodingTests(unittest.TestCase):
    def test_map_flows_have_an_arrowhead(self):
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("map-flow-arrow", source)
        self.assertIn('marker-end', source)

    def test_treemap_fill_uses_net_spending(self):
        source = (PROJECT_ROOT / "js" / "treemap.js").read_text()
        page = (PROJECT_ROOT / "index.html").read_text()

        self.assertIn("net_spending_eur", source)
        self.assertIn("interpolateRdYlGn", source)
        self.assertIn("treemap-net-legend", page)

    def test_flow_summary_discloses_recorded_fee_coverage(self):
        source = (PROJECT_ROOT / "js" / "transfer-flows.js").read_text()

        self.assertIn("known_fee_count", source)
        self.assertIn("recorded fees", source)

    def test_flow_views_offer_position_and_fee_status_filters(self):
        page = (PROJECT_ROOT / "index.html").read_text()

        for control_id in ["flow-position", "flow-fee-status", "map-position", "map-fee-status"]:
            self.assertIn(control_id, page)

    def test_flow_roles_compute_gross_buying_selling_and_net(self):
        source = (PROJECT_ROOT / "js" / "transfer-flows.js").read_text()

        self.assertIn("grossBought", source)
        self.assertIn("grossSold", source)
        self.assertIn("netSpend", source)
        self.assertIn("leagueRoles", source)

    def test_map_summary_identifies_the_largest_visible_corridor(self):
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("largestCorridor", source)
        self.assertIn("map-corridor", source)

    def test_map_limits_visible_flows_and_offsets_paths(self):
        page = (PROJECT_ROOT / "index.html").read_text()
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("map-flow-limit", page)
        self.assertIn("function flowPath", source)
        self.assertIn("flowLimit", source)

    def test_scatter_uses_a_spending_trendline_for_relative_performance(self):
        source = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

        self.assertIn("logSpendingRegression", source)
        self.assertIn("performance-trend", source)
        self.assertIn("Expected PPG", source)
        self.assertIn("Difference from trend", source)

    def test_interactive_marks_support_keyboard_selection(self):
        treemap = (PROJECT_ROOT / "js" / "treemap.js").read_text()
        flows = (PROJECT_ROOT / "js" / "transfer-flows.js").read_text()
        scatter = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

        for source in [treemap, flows, scatter]:
            self.assertIn("keydown", source)
            self.assertIn("event.key === 'Enter'", source)


if __name__ == "__main__":
    unittest.main()

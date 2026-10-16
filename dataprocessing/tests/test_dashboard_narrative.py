"""Regression checks for dashboard claims and cross-chart data coverage."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class DashboardNarrativeTests(unittest.TestCase):
    def setUp(self):
        self.page = (PROJECT_ROOT / "index.html").read_text()
        self.scatter = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

    def test_performance_view_labels_the_following_season(self):
        self.assertIn("following-season performance", self.page)
        self.assertNotIn("same-season performance", self.page)
        self.assertIn("performance_season_label", self.scatter)

    def test_scatter_avoids_blank_state_for_a_newer_shared_season(self):
        self.assertIn("seasons.includes(requestedSeason)", self.scatter)
        self.assertIn("latest available spending season", self.scatter)

    def test_market_section_includes_a_time_trend(self):
        self.assertIn('id="market-trend-chart"', self.page)
        self.assertIn("js/market-trend.js", self.page)

    def test_flow_copy_explains_direction_and_scope(self):
        self.assertRegex(self.page, r"Arrows run\s+from buying league to selling league")
        self.assertIn("involving at least one top-five-league club", self.page)

    def test_interaction_plan_has_an_active_selection_summary(self):
        self.assertIn('id="selection-summary"', self.page)
        self.assertIn('id="clear-selections"', self.page)
        self.assertIn("Active selection", self.page)

    def test_interaction_plan_describes_the_shared_filters_truthfully(self):
        self.assertIn("Position and fee-status filters are shared by the two flow views", self.page)
        self.assertIn("does not imply club-level flows", self.page)

    def test_non_rumor_views_explain_measurement_scope(self):
        self.assertIn("recorded transfer-fee spending", self.page)
        self.assertIn("not cup or European performance", self.page)
        self.assertIn("four implemented non-rumor views", self.page)

    def test_flow_view_has_a_league_roles_summary(self):
        self.assertIn('id="league-roles"', self.page)
        self.assertIn("Gross bought", self.page)

    def test_map_copy_promises_a_largest_corridor_takeaway(self):
        self.assertIn('id="map-corridor"', self.page)


if __name__ == "__main__":
    unittest.main()

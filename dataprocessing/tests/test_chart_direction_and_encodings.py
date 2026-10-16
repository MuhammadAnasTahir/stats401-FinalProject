"""Regression checks for visual encodings implemented in the D3 source."""

from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[2]


class ChartEncodingTests(unittest.TestCase):
    def test_map_flows_have_an_arrowhead(self):
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("map-flow-arrow", source)
        self.assertIn('marker-end', source)

    def test_treemap_fill_uses_league_identity(self):
        source = (PROJECT_ROOT / "js" / "treemap.js").read_text()

        self.assertIn("leagueColors", source)
        self.assertIn("'Premier League','#24513f'", source)
        self.assertIn("'La Liga','#b85c35'", source)
        self.assertIn("'Bundesliga','#315f73'", source)
        self.assertIn("'Serie A','#77733d'", source)
        self.assertIn("'Ligue 1','#7c4f68'", source)
        self.assertIn("row.league_name", source)
        self.assertNotIn("interpolateLab", source)

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

    def test_map_fee_filter_excludes_unknown_fees(self):
        """Catch a map that renders the omitted unknown-fee category."""
        page = (PROJECT_ROOT / "index.html").read_text()
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn('<option value="Paid fee" selected>Paid fee</option>', page)
        self.assertIn('<option value="Free transfer">Free transfer</option>', page)
        self.assertNotIn('<option value="unknown">Unknown</option>', page)
        self.assertIn("d.fee_status === selectedFeeStatus", source)

    def test_map_preserves_full_basemap_and_visible_arrowheads(self):
        """Catch a Europe-only base map or arrowheads that shrink with thin strokes."""
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("markerUnits','userSpaceOnUse'", source)
        self.assertIn("markerWidth',6", source)
        self.assertIn("svg.call(zoom).call(zoom.transform,europeView)", source)
        self.assertNotIn("features.filter(isEuropeanBasemap)", source)

    def test_map_aggregates_country_corridors_and_counts_free_transfers(self):
        """Catch position-level duplicates and meaningless €0 free-transfer ranking."""
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn("d3.rollup", source)
        self.assertIn("selectedFeeStatus === 'Free transfer'", source)
        self.assertIn("option[value=\"fee\"]", source)
        self.assertIn("metric.property('value','count')", source)

    def test_map_uses_uniform_thin_flow_lines(self):
        """Catch weighted strokes that make overlapping country flows unreadable."""
        source = (PROJECT_ROOT / "js" / "geographic-flows.js").read_text()

        self.assertIn(".attr('stroke-width',1.1)", source)
        self.assertNotIn("const scale=d3.scaleSqrt", source)

    def test_scatter_uses_a_spending_trendline_for_relative_performance(self):
        source = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

        self.assertIn("logSpendingRegression", source)
        self.assertIn("performance-trend", source)
        self.assertIn("Expected PPG", source)
        self.assertIn("Difference from trend", source)

    def test_scatter_expands_low_spending_with_a_symlog_x_scale(self):
        source = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

        self.assertIn("d3.scaleSymlog", source)
        self.assertIn(".constant(10)", source)
        self.assertIn("symlog scale", source)

    def test_interactive_marks_support_keyboard_selection(self):
        treemap = (PROJECT_ROOT / "js" / "treemap.js").read_text()
        flows = (PROJECT_ROOT / "js" / "transfer-flows.js").read_text()
        scatter = (PROJECT_ROOT / "js" / "spending-performance.js").read_text()

        for source in [treemap, flows, scatter]:
            self.assertIn("keydown", source)
            self.assertIn("event.key === 'Enter'", source)


if __name__ == "__main__":
    unittest.main()

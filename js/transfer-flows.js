(() => {
    const dataPath = "data/processed/league_transfer_flows.csv";
    const groups = ["Premier League", "La Liga", "Bundesliga", "Serie A", "Ligue 1", "Other Europe", "Outside Europe / Unknown"];
    const arcLabels = new Map([
        ["Outside Europe / Unknown", "Outside Europe"],
    ]);
    const colors = new Map([
        ["Premier League", "#24513f"],
        ["La Liga", "#b85c35"],
        ["Bundesliga", "#315f73"],
        ["Serie A", "#77733d"],
        ["Ligue 1", "#7c4f68"],
        ["Other Europe", "#6e716e"],
        ["Outside Europe / Unknown", "#9a7446"],
    ]);
    const width = 1100;
    const height = 780;
    const outerRadius = 245;
    const innerRadius = 220;
    const chart = d3.select("#transfer-flow-chart");
    const stage = chart.select(".flow-stage");
    const svg = d3.select("#flow-svg");
    const seasonSelect = d3.select("#flow-season");
    const totalLabel = d3.select("#flow-total");
    const tooltip = d3.select("#flow-tooltip");

    if (chart.empty() || stage.empty() || svg.empty()) return;

    const root = svg.append("g").attr("transform", `translate(${width / 2},${height / 2})`);
    const ribbonLayer = root.append("g");
    const groupLayer = root.append("g");
    const labelLayer = root.append("g");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let allData = [];

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(value) {
        return value >= 1_000_000_000
            ? `€${d3.format(".2~f")(value / 1_000_000_000)}B`
            : `€${d3.format(",.0f")(value / 1_000_000)}M`;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function moveTooltip(event) {
        const bounds = stage.node().getBoundingClientRect();
        const node = tooltip.node();
        const tooltipWidth = node.offsetWidth || 230;
        const tooltipHeight = node.offsetHeight || 120;
        const gap = 14;
        const edge = 12;
        const x = Math.max(edge, Math.min(event.clientX - bounds.left + gap, bounds.width - tooltipWidth - edge));
        let y = event.clientY - bounds.top + gap;
        if (y + tooltipHeight > bounds.height - edge) y = event.clientY - bounds.top - tooltipHeight - gap;
        tooltip.style("left", `${x}px`).style("top", `${Math.max(edge, y)}px`);
    }

    function hideTooltip() {
        tooltip.attr("aria-hidden", "true").classed("is-visible", false);
    }

    function showRibbonTooltip(event, ribbon) {
        const buyer = groups[ribbon.source.index];
        const seller = groups[ribbon.target.index];
        tooltip
            .html(`<strong>${escapeHtml(buyer)} → ${escapeHtml(seller)}</strong><span>${formatMoney(ribbon.source.value)} in recorded fees</span>`)
            .attr("aria-hidden", "false")
            .classed("is-visible", true);
        moveTooltip(event);
    }

    function showGroupTooltip(event, group) {
        tooltip
            .html(`<strong>${escapeHtml(groups[group.index])}</strong><span>${formatMoney(group.value)} in total recorded flows</span>`)
            .attr("aria-hidden", "false")
            .classed("is-visible", true);
        moveTooltip(event);
    }

    function labelTransform(group) {
        const angle = (group.startAngle + group.endAngle) / 2;
        const rotate = angle * 180 / Math.PI - 90;
        const flip = angle > Math.PI ? 180 : 0;
        return `rotate(${rotate}) translate(${outerRadius + 18}) rotate(${flip})`;
    }

    function renderSeason(season) {
        const rows = allData.filter(row => row.season === season);
        const matrix = groups.map(() => groups.map(() => 0));
        rows.forEach(row => {
            const buyer = groups.indexOf(row.to_group);
            const seller = groups.indexOf(row.from_group);
            if (buyer >= 0 && seller >= 0) matrix[buyer][seller] += row.total_fee_eur;
        });

        const layout = (d3.chordDirected ? d3.chordDirected() : d3.chord())
            .padAngle(0.045)
            .sortSubgroups(d3.descending)
            .sortChords(d3.descending)(matrix);
        const arc = d3.arc().innerRadius(innerRadius).outerRadius(outerRadius);
        const ribbon = (d3.ribbonArrow ? d3.ribbonArrow() : d3.ribbon()).radius(innerRadius);
        const duration = prefersReducedMotion ? 0 : 500;
        const transition = svg.transition().duration(duration).ease(d3.easeCubicInOut);

        const ribbons = ribbonLayer.selectAll("path.flow-ribbon").data(layout, item => `${item.source.index}-${item.target.index}`);
        ribbons.exit().transition(transition).style("opacity", 0).remove();
        ribbons.enter()
            .append("path")
            .attr("class", "flow-ribbon")
            .style("opacity", 0)
            .on("mouseenter", showRibbonTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave", hideTooltip)
            .merge(ribbons)
            .attr("fill", item => colors.get(groups[item.source.index]))
            .attr("d", ribbon)
            .transition(transition)
            .style("opacity", 0.68);

        const arcs = groupLayer.selectAll("path.flow-arc").data(layout.groups, item => item.index);
        arcs.exit().remove();
        arcs.enter()
            .append("path")
            .attr("class", "flow-arc")
            .on("mouseenter", showGroupTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave", hideTooltip)
            .merge(arcs)
            .attr("fill", item => colors.get(groups[item.index]))
            .attr("d", arc);

        const labels = labelLayer.selectAll("text.flow-label").data(layout.groups, item => item.index);
        labels.exit().remove();
        labels.enter()
            .append("text")
            .attr("class", "flow-label")
            .attr("dy", "0.35em")
            .merge(labels)
            .attr("transform", labelTransform)
            .attr("text-anchor", item => ((item.startAngle + item.endAngle) / 2) > Math.PI ? "end" : "start")
            .text(item => arcLabels.get(groups[item.index]) || groups[item.index]);

        const label = rows[0]?.season_label || String(season);
        totalLabel.text(`${label} · ${formatMoney(d3.sum(rows, row => row.total_fee_eur))}`);
        seasonSelect.property("value", String(season));
    }

    d3.csv(dataPath, row => ({
        season: number(row.season),
        season_label: row.season_label,
        from_group: row.from_group,
        to_group: row.to_group,
        total_fee_eur: number(row.total_fee_eur),
    }))
        .then(data => {
            allData = data.filter(row => row.season && row.total_fee_eur > 0);
            const seasons = Array.from(new Set(allData.map(row => row.season))).sort(d3.ascending);
            seasonSelect.selectAll("option")
                .data(seasons)
                .join("option")
                .attr("value", season => season)
                .text(season => allData.find(row => row.season === season).season_label);
            seasonSelect.on("change", event => renderSeason(number(event.target.value)));
            renderSeason(seasons[seasons.length - 1]);
        })
        .catch(() => {
            stage.html('<p class="chart-placeholder">Transfer-flow data could not be loaded.</p>');
            totalLabel.text("Unavailable");
        });
})();

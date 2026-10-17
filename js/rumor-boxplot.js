(() => {
    const dataPath = "data/processed/rumor_outcomes.csv";
    const width = 1100;
    const height = 560;
    const margin = { top: 56, right: 24, bottom: 64, left: 70 };
    const panelGap = 90;
    const groups = ["low", "medium", "high"];
    const groupLabel = { low: "Low", medium: "Medium", high: "High" };
    const groupColor = { low: "#8aa196", medium: "#4f7a64", high: "#24513f" };

    const panels = [
        {
            key: "fee_premium_ratio",
            title: "Fee premium (fee ÷ market value)",
            axis: "Fee ÷ market value",
            format: v => `${v.toFixed(2)}×`,
            baseline: 1,
            baselineLabel: "fee = value",
        },
        {
            key: "mv_change_pct",
            title: "Market-value change (%)",
            axis: "Market-value change (%)",
            format: v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`,
            baseline: 0,
            baselineLabel: "no change",
        },
    ];

    const svg = d3.select("#rumor-boxplot-svg");
    const stage = d3.select("#rumor-boxplot-chart .flow-stage");
    const tooltip = d3.select("#rumor-boxplot-tooltip");
    const summary = d3.select("#boxplot-summary");
    if (svg.empty()) return;

    const plotTop = margin.top;
    const plotHeight = height - margin.top - margin.bottom;
    const plotBottom = plotTop + plotHeight;
    const panelWidth = (width - margin.left - margin.right - panelGap) / 2;

    function quantiles(sorted) {
        const q1 = d3.quantileSorted(sorted, 0.25);
        const median = d3.quantileSorted(sorted, 0.5);
        const q3 = d3.quantileSorted(sorted, 0.75);
        const iqr = q3 - q1;
        const lo = d3.max([d3.min(sorted), q1 - 1.5 * iqr]);
        const hi = d3.min([d3.max(sorted), q3 + 1.5 * iqr]);
        return { q1, median, q3, iqr, lo, hi, n: sorted.length };
    }

    function moveTip(event) {
        const b = stage.node().getBoundingClientRect();
        const node = tooltip.node();
        const w = node.offsetWidth || 220;
        const x0 = Math.max(12, Math.min(event.clientX - b.left + 14, b.width - w - 12));
        let y0 = event.clientY - b.top + 14;
        if (y0 + (node.offsetHeight || 120) > b.height - 12) y0 = event.clientY - b.top - (node.offsetHeight || 120) - 14;
        tooltip.style("left", `${x0}px`).style("top", `${Math.max(12, y0)}px`);
    }
    function hideTip() {
        tooltip.attr("aria-hidden", "true").classed("is-visible", false);
    }

    function drawPanel(rootG, panel, data, xOrigin) {
        const g = rootG.append("g").attr("transform", `translate(${xOrigin},0)`);
        const x = d3.scaleBand().domain(groups).range([0, panelWidth]).padding(0.45);
        const y = d3.scaleLinear().range([plotBottom, plotTop]);

        const stats = groups.map(group => {
            const values = data
                .filter(r => r.rumor_intensity === group)
                .map(r => r[panel.key])
                .filter(v => Number.isFinite(v))
                .sort(d3.ascending);
            return { group, ...(values.length ? quantiles(values) : {}) };
        }).filter(s => s.n);

        const lo = d3.min(stats, s => s.lo);
        const hi = d3.max(stats, s => s.hi);
        const pad = (hi - lo) * 0.08 || 1;
        y.domain([Math.min(lo, panel.baseline) - pad, Math.max(hi, panel.baseline) + pad]).nice();

        // Panel title.
        g.append("text").attr("class", "box-panel-title")
            .attr("x", panelWidth / 2).attr("y", plotTop - 28).attr("text-anchor", "middle")
            .text(panel.title);

        // Grid + axes.
        g.append("g").selectAll("line").data(y.ticks(6)).join("line")
            .attr("class", "performance-grid-line")
            .attr("x1", 0).attr("x2", panelWidth).attr("y1", d => y(d)).attr("y2", d => y(d));
        g.append("g").attr("class", "performance-axes")
            .call(d3.axisLeft(y).ticks(6).tickFormat(panel.format));
        g.append("g").attr("class", "performance-axes")
            .attr("transform", `translate(0,${plotBottom})`)
            .call(d3.axisBottom(x).tickFormat(gr => groupLabel[gr]));
        g.append("text").attr("class", "performance-axis-title")
            .attr("transform", "rotate(-90)")
            .attr("x", -(plotTop + plotHeight / 2)).attr("y", -52).attr("text-anchor", "middle")
            .text(panel.axis);
        g.append("text").attr("class", "performance-axis-title")
            .attr("x", panelWidth / 2).attr("y", plotBottom + 46).attr("text-anchor", "middle")
            .text("Rumour intensity");

        // Baseline.
        g.append("line").attr("class", "performance-average")
            .attr("x1", 0).attr("x2", panelWidth).attr("y1", y(panel.baseline)).attr("y2", y(panel.baseline));
        g.append("text").attr("class", "performance-average-label")
            .attr("x", panelWidth).attr("y", y(panel.baseline) - 6).attr("text-anchor", "end")
            .text(panel.baselineLabel);

        // Boxes.
        const bw = x.bandwidth();
        const box = g.selectAll("g.box").data(stats).join("g")
            .attr("class", "box")
            .attr("transform", d => `translate(${x(d.group)},0)`)
            .on("mouseenter", (event, d) => {
                tooltip.html(`
                    <strong>${groupLabel[d.group]} intensity</strong>
                    <span>${d.n.toLocaleString()} transfers · ${panel.title}</span>
                    <dl>
                        <dt>Median</dt><dd>${panel.format(d.median)}</dd>
                        <dt>Upper quartile</dt><dd>${panel.format(d.q3)}</dd>
                        <dt>Lower quartile</dt><dd>${panel.format(d.q1)}</dd>
                    </dl>`)
                    .attr("aria-hidden", "false").classed("is-visible", true);
                moveTip(event);
            })
            .on("mousemove", moveTip).on("mouseleave", hideTip);

        box.append("line").attr("class", "box-whisker")
            .attr("x1", bw / 2).attr("x2", bw / 2).attr("y1", d => y(d.lo)).attr("y2", d => y(d.hi));
        box.append("line").attr("class", "box-whisker")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75).attr("y1", d => y(d.lo)).attr("y2", d => y(d.lo));
        box.append("line").attr("class", "box-whisker")
            .attr("x1", bw * 0.25).attr("x2", bw * 0.75).attr("y1", d => y(d.hi)).attr("y2", d => y(d.hi));
        box.append("rect").attr("class", "box-rect")
            .attr("x", 0).attr("width", bw)
            .attr("y", d => y(d.q3)).attr("height", d => Math.max(1, y(d.q1) - y(d.q3)))
            .attr("fill", d => groupColor[d.group]);
        box.append("line").attr("class", "box-median")
            .attr("x1", 0).attr("x2", bw).attr("y1", d => y(d.median)).attr("y2", d => y(d.median));

        return d3.sum(stats, s => s.n);
    }

    d3.csv(dataPath, d3.autoType)
        .then(rows => {
            const rootG = svg.append("g");
            const nFee = drawPanel(rootG, panels[0], rows, margin.left);
            const nMv = drawPanel(rootG, panels[1], rows, margin.left + panelWidth + panelGap);
            summary.text(`Fee premium: ${nFee.toLocaleString()} transfers · Market-value change: ${nMv.toLocaleString()} transfers`);
        })
        .catch(() => {
            stage.html('<p class="chart-placeholder">Rumour-outcome data could not be loaded.</p>');
            summary.text("Unavailable");
        });
})();

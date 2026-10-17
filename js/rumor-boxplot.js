(() => {
    const dataPath = "data/processed/rumor_outcomes.csv";
    const width = 1100;
    const height = 560;
    const margin = { top: 40, right: 40, bottom: 64, left: 84 };
    const groups = ["low", "medium", "high"];
    const groupLabel = { low: "Low intensity", medium: "Medium intensity", high: "High intensity" };
    const groupColor = { low: "#8aa196", medium: "#4f7a64", high: "#24513f" };

    const metrics = {
        fee_premium_ratio: {
            label: "Fee premium (fee ÷ market value)",
            axis: "Fee ÷ market value",
            format: v => `${v.toFixed(2)}×`,
            baseline: 1,
            baselineLabel: "fee = market value",
        },
        mv_change_pct: {
            label: "Market-value change (%)",
            axis: "Market-value change (%)",
            format: v => `${v >= 0 ? "+" : ""}${v.toFixed(0)}%`,
            baseline: 0,
            baselineLabel: "no change",
        },
    };

    const svg = d3.select("#rumor-boxplot-svg");
    const stage = d3.select("#rumor-boxplot-chart .flow-stage");
    const tooltip = d3.select("#rumor-boxplot-tooltip");
    const select = d3.select("#boxplot-metric");
    const summary = d3.select("#boxplot-summary");
    if (svg.empty()) return;

    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const gridLayer = root.append("g");
    const axisLayer = root.append("g");
    const boxLayer = root.append("g");
    const annotationLayer = root.append("g");

    const x = d3.scaleBand().domain(groups).range([0, plotWidth]).padding(0.5);
    const y = d3.scaleLinear().range([plotHeight, 0]);

    let allData = [];

    function quantiles(sorted) {
        const q1 = d3.quantileSorted(sorted, 0.25);
        const median = d3.quantileSorted(sorted, 0.5);
        const q3 = d3.quantileSorted(sorted, 0.75);
        const iqr = q3 - q1;
        const lo = d3.max([d3.min(sorted), q1 - 1.5 * iqr]);
        const hi = d3.min([d3.max(sorted), q3 + 1.5 * iqr]);
        return { q1, median, q3, iqr, lo, hi, n: sorted.length };
    }

    function render(metricKey) {
        const metric = metrics[metricKey];
        const stats = groups.map(group => {
            const values = allData
                .filter(row => row.rumor_intensity === group)
                .map(row => row[metricKey])
                .filter(v => Number.isFinite(v))
                .sort(d3.ascending);
            return { group, values, ...(values.length ? quantiles(values) : {}) };
        });

        const valid = stats.filter(s => s.values.length);
        const lo = d3.min(valid, s => s.lo);
        const hi = d3.max(valid, s => s.hi);
        const pad = (hi - lo) * 0.08 || 1;
        y.domain([Math.min(lo, metric.baseline) - pad, Math.max(hi, metric.baseline) + pad]).nice();

        gridLayer.selectAll("line.box-grid")
            .data(y.ticks(6))
            .join("line")
            .attr("class", "box-grid performance-grid-line")
            .attr("x1", 0).attr("x2", plotWidth)
            .attr("y1", d => y(d)).attr("y2", d => y(d));

        axisLayer.selectAll("g.box-y").data([null]).join("g").attr("class", "box-y performance-axes")
            .call(d3.axisLeft(y).ticks(6).tickFormat(metric.format));
        axisLayer.selectAll("g.box-x").data([null]).join("g").attr("class", "box-x performance-axes")
            .attr("transform", `translate(0,${plotHeight})`)
            .call(d3.axisBottom(x).tickFormat(g => groupLabel[g]));

        // Baseline reference line (fee = market value, or no change).
        annotationLayer.selectAll("line.box-baseline").data([metric.baseline]).join("line")
            .attr("class", "box-baseline performance-average")
            .attr("x1", 0).attr("x2", plotWidth)
            .attr("y1", d => y(d)).attr("y2", d => y(d));
        annotationLayer.selectAll("text.box-baseline-label").data([metric.baseline]).join("text")
            .attr("class", "box-baseline-label performance-average-label")
            .attr("x", plotWidth).attr("y", d => y(d) - 6).attr("text-anchor", "end")
            .text(metric.baselineLabel);

        annotationLayer.selectAll("text.box-axis-title").data([null]).join("text")
            .attr("class", "box-axis-title performance-axis-title")
            .attr("transform", "rotate(-90)")
            .attr("x", -plotHeight / 2).attr("y", -64).attr("text-anchor", "middle")
            .text(metric.axis);

        const bw = x.bandwidth();
        const box = boxLayer.selectAll("g.box").data(valid, d => d.group);
        box.exit().remove();
        const boxEnter = box.enter().append("g").attr("class", "box");
        boxEnter.append("line").attr("class", "box-whisker");
        boxEnter.append("rect").attr("class", "box-rect");
        boxEnter.append("line").attr("class", "box-median");
        const boxMerged = boxEnter.merge(box)
            .attr("transform", d => `translate(${x(d.group)},0)`)
            .on("mouseenter", showTip).on("mousemove", moveTip).on("mouseleave", hideTip);

        boxMerged.select(".box-whisker")
            .attr("x1", bw / 2).attr("x2", bw / 2)
            .attr("y1", d => y(d.lo)).attr("y2", d => y(d.hi));
        boxMerged.select(".box-rect")
            .attr("x", 0).attr("width", bw)
            .attr("y", d => y(d.q3)).attr("height", d => Math.max(1, y(d.q1) - y(d.q3)))
            .attr("fill", d => groupColor[d.group]);
        boxMerged.select(".box-median")
            .attr("x1", 0).attr("x2", bw)
            .attr("y1", d => y(d.median)).attr("y2", d => y(d.median));

        // Whisker caps.
        const caps = boxLayer.selectAll("g.box-caps").data(valid, d => d.group);
        caps.exit().remove();
        const capsEnter = caps.enter().append("g").attr("class", "box-caps");
        capsEnter.append("line").attr("class", "cap-lo box-whisker");
        capsEnter.append("line").attr("class", "cap-hi box-whisker");
        const capsMerged = capsEnter.merge(caps).attr("transform", d => `translate(${x(d.group)},0)`);
        capsMerged.select(".cap-lo").attr("x1", bw * 0.25).attr("x2", bw * 0.75).attr("y1", d => y(d.lo)).attr("y2", d => y(d.lo));
        capsMerged.select(".cap-hi").attr("x1", bw * 0.25).attr("x2", bw * 0.75).attr("y1", d => y(d.hi)).attr("y2", d => y(d.hi));

        const totalN = d3.sum(valid, s => s.n);
        summary.text(`${metric.label} · ${totalN.toLocaleString()} transfers with data`);
    }

    function showTip(event, d) {
        const metricKey = select.property("value");
        const metric = metrics[metricKey];
        tooltip.html(`
            <strong>${groupLabel[d.group]}</strong>
            <span>${d.n.toLocaleString()} transfers</span>
            <dl>
                <dt>Median</dt><dd>${metric.format(d.median)}</dd>
                <dt>Upper quartile</dt><dd>${metric.format(d.q3)}</dd>
                <dt>Lower quartile</dt><dd>${metric.format(d.q1)}</dd>
            </dl>`)
            .attr("aria-hidden", "false").classed("is-visible", true);
        moveTip(event);
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

    d3.csv(dataPath, d3.autoType)
        .then(rows => {
            allData = rows;
            select.on("change", () => render(select.property("value")));
            render(select.property("value") || "fee_premium_ratio");
        })
        .catch(() => {
            stage.html('<p class="chart-placeholder">Rumour-outcome data could not be loaded.</p>');
            summary.text("Unavailable");
        });
})();

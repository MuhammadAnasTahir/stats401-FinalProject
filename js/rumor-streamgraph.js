(() => {
    const dataPath = "data/processed/rumor_timeline.csv";
    const width = 1100;
    const height = 520;
    const margin = { top: 30, right: 32, bottom: 60, left: 32 };
    const tones = ["doubtful", "neutral", "optimistic"];
    const toneLabel = { optimistic: "Optimistic", neutral: "Neutral", doubtful: "Doubtful" };
    const toneColor = { optimistic: "#4f7a64", neutral: "#b9a07a", doubtful: "#b85c35" };

    const svg = d3.select("#rumor-stream-svg");
    const stage = d3.select("#rumor-stream-chart .performance-stage");
    const tooltip = d3.select("#rumor-stream-tooltip");
    if (svg.empty()) return;

    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const areaLayer = root.append("g");
    const axisLayer = root.append("g");
    const labelLayer = root.append("g");

    d3.csv(dataPath, d3.autoType)
        .then(rows => {
            // Pivot: one row per weeks_before, a column per tone.
            const byWeek = new Map();
            rows.forEach(r => {
                if (!byWeek.has(r.weeks_before)) {
                    byWeek.set(r.weeks_before, { weeks_before: r.weeks_before, optimistic: 0, neutral: 0, doubtful: 0 });
                }
                byWeek.get(r.weeks_before)[r.tone] = r.article_count;
            });
            const series = Array.from(byWeek.values()).sort((a, b) => a.weeks_before - b.weeks_before);

            // x: weeks before signing. 0 (signing) on the RIGHT, earliest on the LEFT.
            const maxWeek = d3.max(series, d => d.weeks_before);
            const x = d3.scaleLinear().domain([maxWeek, 0]).range([0, plotWidth]);

            const stack = d3.stack().keys(tones).offset(d3.stackOffsetWiggle).order(d3.stackOrderInsideOut);
            const stacked = stack(series);

            const y = d3.scaleLinear()
                .domain([d3.min(stacked, l => d3.min(l, d => d[0])), d3.max(stacked, l => d3.max(l, d => d[1]))])
                .range([plotHeight, 0]);

            const area = d3.area()
                .x(d => x(d.data.weeks_before))
                .y0(d => y(d[0]))
                .y1(d => y(d[1]))
                .curve(d3.curveBasis);

            areaLayer.selectAll("path.stream-band")
                .data(stacked, d => d.key)
                .join("path")
                .attr("class", "stream-band")
                .attr("fill", d => toneColor[d.key])
                .attr("d", area)
                .on("mouseenter", (event, d) => showTip(event, d.key))
                .on("mousemove", moveTip)
                .on("mouseleave", hideTip);

            // Annotate the final two weeks and the share of all mentions inside them (computed from the data).
            const allMentions = d3.sum(series, d => d.optimistic + d.neutral + d.doubtful);
            const lastTwo = d3.sum(series.filter(d => d.weeks_before <= 1), d => d.optimistic + d.neutral + d.doubtful);
            const noteX = x(1.5);
            const note = labelLayer.append('g').attr('class', 'stream-note');
            note.append('rect').attr('x', noteX).attr('y', 0).attr('width', plotWidth - noteX).attr('height', plotHeight);
            note.append('line').attr('x1', noteX).attr('x2', noteX).attr('y1', -14).attr('y2', plotHeight);
            note.append('text').attr('x', noteX - 8).attr('y', -6).attr('text-anchor', 'end').text(`Final two weeks: ${d3.format('.0%')(lastTwo / allMentions)} of all mentions`);

            // X axis: weeks before signing.
            const axis = d3.axisBottom(x)
                .tickValues(d3.range(0, maxWeek + 1, 2))
                .tickFormat(d => d === 0 ? "Signing" : `${d}w`);
            axisLayer.append("g")
                .attr("class", "performance-axes")
                .attr("transform", `translate(0,${plotHeight})`)
                .call(axis);
            labelLayer.append("text")
                .attr("class", "performance-axis-title")
                .attr("x", plotWidth / 2).attr("y", plotHeight + 48).attr("text-anchor", "middle")
                .text("Weeks before signing");

            function showTip(event, key) {
                areaLayer.selectAll("path.stream-band").style("opacity", d => d.key === key ? 1 : 0.35);
                const total = d3.sum(series, d => d[key]);
                const grand = d3.sum(series, d => d.optimistic + d.neutral + d.doubtful);
                tooltip.html(`
                    <strong>${toneLabel[key]} coverage</strong>
                    <span>Across all weeks before signing</span>
                    <dl>
                        <dt>Article mentions</dt><dd>${total.toLocaleString()}</dd>
                        <dt>Share of mentions</dt><dd>${(total / grand * 100).toFixed(0)}%</dd>
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
                if (y0 + (node.offsetHeight || 80) > b.height - 12) y0 = event.clientY - b.top - (node.offsetHeight || 80) - 14;
                tooltip.style("left", `${x0}px`).style("top", `${Math.max(12, y0)}px`);
            }
            function hideTip() {
                areaLayer.selectAll("path.stream-band").style("opacity", 1);
                tooltip.attr("aria-hidden", "true").classed("is-visible", false);
            }
        })
        .catch(() => {
            stage.html('<p class="chart-placeholder">Rumour-timeline data could not be loaded.</p>');
        });
})();

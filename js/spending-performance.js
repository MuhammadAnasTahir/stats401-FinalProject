(() => {
    const dataPath = "data/processed/spending_performance.csv";
    const width = 1100;
    const height = 650;
    const margin = { top: 44, right: 42, bottom: 66, left: 76 };
    const playbackDelay = 1500;
    const colors = new Map([
        ["Premier League", "#24513f"],
        ["La Liga", "#b85c35"],
        ["Bundesliga", "#315f73"],
        ["Serie A", "#77733d"],
        ["Ligue 1", "#7c4f68"],
    ]);
    const chart = d3.select("#spending-performance-chart");
    const stage = chart.select(".performance-stage");
    const svg = d3.select("#performance-svg");
    const seasonSelect = d3.select("#performance-season");
    const playButton = d3.select("#performance-play");
    const tooltip = d3.select("#performance-tooltip");

    if (chart.empty() || stage.empty() || svg.empty()) return;

    const plotWidth = width - margin.left - margin.right;
    const plotHeight = height - margin.top - margin.bottom;
    const root = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);
    const gridLayer = root.append("g").attr("class", "performance-grid");
    const axisLayer = root.append("g").attr("class", "performance-axes");
    const bubbleLayer = root.append("g").attr("class", "performance-bubbles");
    const annotationLayer = root.append("g").attr("class", "performance-annotations");
    const x = d3.scaleLinear().range([0, plotWidth]);
    const y = d3.scaleLinear().range([plotHeight, 0]);
    const radius = d3.scaleSqrt().range([4, 30]);
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let allData = [];
    let seasons = [];
    let timer = null;

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(value) {
        return value >= 1000 ? `€${d3.format(".1~f")(value / 1000)}B` : `€${d3.format(",.0f")(value)}M`;
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
        const tooltipHeight = node.offsetHeight || 150;
        const edge = 12;
        const gap = 14;
        const xPosition = Math.max(edge, Math.min(event.clientX - bounds.left + gap, bounds.width - tooltipWidth - edge));
        let yPosition = event.clientY - bounds.top + gap;
        if (yPosition + tooltipHeight > bounds.height - edge) yPosition = event.clientY - bounds.top - tooltipHeight - gap;
        tooltip.style("left", `${xPosition}px`).style("top", `${Math.max(edge, yPosition)}px`);
    }

    function hideTooltip() {
        tooltip.attr("aria-hidden", "true").classed("is-visible", false);
    }

    function showTooltip(event, row) {
        tooltip
            .html(`<strong>${escapeHtml(row.club_name)}</strong><span>${escapeHtml(row.league_name)} · ${escapeHtml(row.season_label)}</span><dl><dt>Spending</dt><dd>${formatMoney(row.spending_million_eur)}</dd><dt>Points per game</dt><dd>${d3.format(".2f")(row.points_per_game)}</dd><dt>Squad value</dt><dd>${formatMoney(row.squad_market_value_million_eur)}</dd><dt>Outcome</dt><dd>${escapeHtml(row.performance_category)}</dd></dl>`)
            .attr("aria-hidden", "false")
            .classed("is-visible", true);
        moveTooltip(event);
    }

    function stopPlayback() {
        if (timer !== null) window.clearInterval(timer);
        timer = null;
        playButton.text("Play").attr("aria-label", "Play season animation");
    }

    function startPlayback() {
        let index = seasons.indexOf(number(seasonSelect.property("value")));
        if (index === seasons.length - 1) {
            index = 0;
            renderSeason(seasons[index]);
        }
        playButton.text("Pause").attr("aria-label", "Pause season animation");
        timer = window.setInterval(() => {
            index += 1;
            if (index >= seasons.length) {
                stopPlayback();
                return;
            }
            renderSeason(seasons[index]);
            if (index === seasons.length - 1) stopPlayback();
        }, playbackDelay);
    }

    function renderSeason(season) {
        const rows = allData.filter(row => row.season === season);
        const duration = prefersReducedMotion ? 0 : 650;
        const transition = svg.transition().duration(duration).ease(d3.easeCubicInOut);
        const average = d3.mean(rows, row => row.points_per_game);

        gridLayer.selectAll("line.performance-grid-line")
            .data(y.ticks(5))
            .join("line")
            .attr("class", "performance-grid-line")
            .attr("x1", 0)
            .attr("x2", plotWidth)
            .attr("y1", tick => y(tick))
            .attr("y2", tick => y(tick));

        axisLayer.selectAll("g.performance-x-axis")
            .data([null])
            .join("g")
            .attr("class", "performance-x-axis")
            .attr("transform", `translate(0,${plotHeight})`)
            .call(d3.axisBottom(x).ticks(6).tickFormat(value => formatMoney(value)));

        axisLayer.selectAll("g.performance-y-axis")
            .data([null])
            .join("g")
            .attr("class", "performance-y-axis")
            .call(d3.axisLeft(y).ticks(5).tickFormat(d3.format(".1f")));

        annotationLayer.selectAll("line.performance-average")
            .data([average])
            .join("line")
            .attr("class", "performance-average")
            .attr("x1", 0)
            .attr("x2", plotWidth)
            .attr("y1", value => y(value))
            .attr("y2", value => y(value));

        annotationLayer.selectAll("text.performance-average-label")
            .data([average])
            .join("text")
            .attr("class", "performance-average-label")
            .attr("x", plotWidth)
            .attr("y", value => y(value) - 8)
            .attr("text-anchor", "end")
            .text(value => `Season average · ${d3.format(".2f")(value)} PPG`);

        annotationLayer.selectAll("text.performance-x-title")
            .data([null])
            .join("text")
            .attr("class", "performance-axis-title")
            .attr("x", plotWidth / 2)
            .attr("y", plotHeight + 48)
            .attr("text-anchor", "middle")
            .text("Transfer spending by club");

        annotationLayer.selectAll("text.performance-y-title")
            .data([null])
            .join("text")
            .attr("class", "performance-axis-title")
            .attr("transform", "rotate(-90)")
            .attr("x", -plotHeight / 2)
            .attr("y", -56)
            .attr("text-anchor", "middle")
            .text("Points per game");

        const bubbles = bubbleLayer.selectAll("circle.performance-bubble").data(rows, row => row.club_id);
        bubbles.exit().transition(transition).attr("r", 0).style("opacity", 0).remove();
        bubbles.enter()
            .append("circle")
            .attr("class", "performance-bubble")
            .attr("cx", row => x(row.spending_million_eur))
            .attr("cy", row => y(row.points_per_game))
            .attr("r", 0)
            .on("mouseenter", showTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave", hideTooltip)
            .merge(bubbles)
            .attr("fill", row => colors.get(row.league_name))
            .attr("aria-label", row => `${row.club_name}, ${formatMoney(row.spending_million_eur)} spent and ${d3.format(".2f")(row.points_per_game)} points per game`)
            .transition(transition)
            .attr("cx", row => x(row.spending_million_eur))
            .attr("cy", row => y(row.points_per_game))
            .attr("r", row => radius(row.squad_market_value_million_eur))
            .style("opacity", 0.82);

        seasonSelect.property("value", String(season));
    }

    d3.csv(dataPath, row => ({
        season: number(row.season),
        season_label: row.season_label,
        club_id: String(row.club_id),
        club_name: row.club_name,
        league_name: row.league_name,
        spending_million_eur: number(row.spending_million_eur),
        points_per_game: number(row.points_per_game),
        squad_market_value_million_eur: number(row.squad_market_value_million_eur),
        performance_category: row.performance_category,
    }))
        .then(data => {
            allData = data.filter(row => row.season && row.points_per_game > 0);
            seasons = Array.from(new Set(allData.map(row => row.season))).sort(d3.ascending);
            x.domain([0, d3.max(allData, row => row.spending_million_eur)]).nice();
            y.domain([0, d3.max(allData, row => row.points_per_game) + 0.1]).nice();
            radius.domain([0, d3.max(allData, row => row.squad_market_value_million_eur)]);
            seasonSelect.selectAll("option")
                .data(seasons)
                .join("option")
                .attr("value", season => season)
                .text(season => allData.find(row => row.season === season).season_label);
            seasonSelect.on("change", event => {
                stopPlayback();
                renderSeason(number(event.target.value));
            });
            playButton.on("click", () => timer === null ? startPlayback() : stopPlayback());
            renderSeason(seasons[seasons.length - 1]);
        })
        .catch(() => {
            stage.html('<p class="chart-placeholder">Spending-performance data could not be loaded.</p>');
        });
})();

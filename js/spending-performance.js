(() => {
    const colors = new Map([['Premier League', '#24513f'], ['La Liga', '#b85c35'], ['Bundesliga', '#315f73'], ['Serie A', '#77733d'], ['Ligue 1', '#7c4f68']]);
    const svg = d3.select('#performance-svg'), stage = d3.select('.performance-stage'), select = d3.select('#performance-season'), play = d3.select('#performance-play'), clear = d3.select('#performance-clear-club'), tip = d3.select('#performance-tooltip'), stats = d3.select('#performance-stats'), state = window.TransferMarketState;
    if (svg.empty()) return;
    let data = [], seasons = [];
    let animationTimer = null, localSeason = null;
    const width = 1100, height = 650, margin = { top: 42, right: 40, bottom: 65, left: 76 }, plotWidth = width - margin.left - margin.right, plotHeight = height - margin.top - margin.bottom;
    const plot = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`), x = d3.scaleSymlog().constant(10).range([0, plotWidth]), y = d3.scaleLinear().range([plotHeight, 0]), radius = d3.scaleSqrt().range([4, 30]);
    const formatMoney = value => value >= 1000 ? `€${d3.format('.1~f')(value / 1000)}B` : `€${d3.format(',.0f')(value)}M`;
    const number = value => +value || 0;

    function moveTooltip(event) {
        const bounds = stage.node().getBoundingClientRect();
        tip.style('left', `${Math.max(10, Math.min(bounds.width - 242, event.clientX - bounds.left + 12))}px`).style('top', `${Math.max(10, Math.min(bounds.height - 160, event.clientY - bounds.top + 12))}px`);
    }
    function correlation(rows) {
        const spendingMean = d3.mean(rows, row => row.spending_million_eur), performanceMean = d3.mean(rows, row => row.points_per_game);
        const numerator = d3.sum(rows, row => (row.spending_million_eur - spendingMean) * (row.points_per_game - performanceMean));
        const denominator = Math.sqrt(d3.sum(rows, row => (row.spending_million_eur - spendingMean) ** 2) * d3.sum(rows, row => (row.points_per_game - performanceMean) ** 2));
        return denominator ? numerator / denominator : NaN;
    }
    function logSpendingRegression(rows) {
        const xMean = d3.mean(rows, row => Math.log1p(row.spending_million_eur));
        const yMean = d3.mean(rows, row => row.points_per_game);
        const numerator = d3.sum(rows, row => (Math.log1p(row.spending_million_eur) - xMean) * (row.points_per_game - yMean));
        const denominator = d3.sum(rows, row => (Math.log1p(row.spending_million_eur) - xMean) ** 2);
        const slope = denominator ? numerator / denominator : 0;
        return { intercept: yMean - slope * xMean, slope, predict: spending => yMean - slope * xMean + slope * Math.log1p(spending) };
    }
    function render(requestedSeason) {
        const query = state.get();
        const season = seasons.includes(requestedSeason) ? requestedSeason : seasons.at(-1);
        const rows = data.filter(row => row.season === season && (!query.league || row.league_name === query.league));
        if (!rows.length) {
            stats.text('No clubs match this league selection.');
            return;
        }
        const sample = rows[0], rValue = correlation(rows), regression = logSpendingRegression(rows);
        rows.forEach(row => { row.expected_points_per_game = regression.predict(row.spending_million_eur); row.performance_gap = row.points_per_game - row.expected_points_per_game; });
        plot.selectAll('.grid').data(y.ticks(5)).join('line').attr('class', 'performance-grid-line grid').attr('x2', plotWidth).attr('y1', value => y(value)).attr('y2', value => y(value));
        plot.selectAll('.x-axis').data([0]).join('g').attr('class', 'performance-axes x-axis').attr('transform', `translate(0,${plotHeight})`).call(d3.axisBottom(x).ticks(6).tickFormat(formatMoney));
        plot.selectAll('.y-axis').data([0]).join('g').attr('class', 'performance-axes y-axis').call(d3.axisLeft(y).ticks(5));
        const trendPoints = [0, d3.max(rows, row => row.spending_million_eur)].map(spending => ({ spending, points: regression.predict(spending) }));
        plot.selectAll('path.performance-trend').data([trendPoints]).join('path').attr('class', 'performance-trend').attr('fill', 'none').attr('d', d3.line().x(point => x(point.spending)).y(point => y(point.points)));
        plot.selectAll('.x-label').data([0]).join('text').attr('class', 'performance-axis-title x-label').attr('x', plotWidth / 2).attr('y', plotHeight + 48).attr('text-anchor', 'middle').text(`Transfer spending — symlog scale (€M, ${sample.season_label})`);
        plot.selectAll('.y-label').data([0]).join('text').attr('class', 'performance-axis-title y-label').attr('transform', 'rotate(-90)').attr('x', -plotHeight / 2).attr('y', -56).attr('text-anchor', 'middle').text(`Points per game (${sample.performance_season_label})`);
        const bubbles = plot.selectAll('circle.performance-bubble').data(rows, row => row.club_id);
        bubbles.exit().remove();
        const showTooltip = (event, row) => {
            const gap = row.performance_gap >= 0 ? `+${d3.format('.2f')(row.performance_gap)}` : d3.format('.2f')(row.performance_gap);
            tip.html(`<strong>${row.club_name}</strong><span>${row.league_name} · ${row.season_label} spending → ${row.performance_season_label} performance</span><dl><dt>Spending</dt><dd>${formatMoney(row.spending_million_eur)}</dd><dt>Points per game</dt><dd>${d3.format('.2f')(row.points_per_game)}</dd><dt>Expected PPG</dt><dd>${d3.format('.2f')(row.expected_points_per_game)}</dd><dt>Difference from trend</dt><dd>${gap} PPG</dd><dt>Squad value</dt><dd>${formatMoney(row.squad_market_value_million_eur)}</dd></dl>`).classed('is-visible', true);
            moveTooltip(event);
        };
        const selectClub = (event, row) => state.set({ clubId: row.club_id, clubName: row.club_name });
        const activateClub = (event, row) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectClub(event, row); } };
        bubbles.enter().append('circle').attr('class', 'performance-bubble').attr('tabindex', 0).attr('role', 'button').on('mouseenter focus', showTooltip).on('mousemove', moveTooltip).on('mouseleave blur', () => tip.classed('is-visible', false)).on('click', selectClub).on('keydown', activateClub).merge(bubbles).attr('aria-label', row => `${row.club_name}: ${d3.format('.2f')(row.points_per_game)} points per game`).attr('cx', row => x(row.spending_million_eur)).attr('cy', row => y(row.points_per_game)).attr('r', row => radius(row.squad_market_value_million_eur)).attr('fill', row => colors.get(row.league_name)).attr('stroke', row => row.performance_gap >= 0 ? '#1a9850' : '#d73027').style('opacity', row => !query.clubId || row.club_id === query.clubId ? .86 : .16).attr('stroke-width', row => row.club_id === query.clubId ? 4 : 2);
        const selected = query.clubId ? data.filter(row => row.club_id === query.clubId).sort((a, b) => a.season - b.season) : [];
        plot.selectAll('path.club-trajectory').data(selected.length > 1 ? [selected] : []).join('path').attr('class', 'club-trajectory').attr('fill', 'none').attr('stroke', '#171b19').attr('stroke-width', 2).attr('stroke-dasharray', '4 3').attr('d', d3.line().defined(row => row.points_per_game > 0).x(row => x(row.spending_million_eur)).y(row => y(row.points_per_game)));
        const fallback = requestedSeason !== season ? ` Showing the latest available spending season (${sample.season_label} → ${sample.performance_season_label}).` : '';
        stats.text(`${sample.season_label} spending → ${sample.performance_season_label} performance. Pearson r = ${d3.format('.2f')(rValue)}; n = ${rows.length}. The symlog x-axis expands the lower-spending range while preserving zero; a green outline is above the line and red is below. Squad value sums one nearest valuation per player around 1 September.${fallback}`);
        select.property('value', season);
    }
    function updatePlayButton() { const playing = animationTimer !== null; play.text(playing ? 'Pause' : 'Play').attr('aria-label', playing ? 'Pause season animation' : 'Play season animation'); }
    function stopAnimation() { if (animationTimer !== null) window.clearTimeout(animationTimer); animationTimer = null; updatePlayButton(); }
    function advanceSeason() {
        const index = seasons.indexOf(localSeason), nextIndex = index < 0 || index >= seasons.length - 1 ? 0 : index + 1;
        localSeason = seasons[nextIndex]; render(localSeason);
        animationTimer = window.setTimeout(advanceSeason, 1500); updatePlayButton();
    }
    function toggleAnimation() {
        if (animationTimer !== null) { stopAnimation(); return; }
        localSeason = number(select.property('value')) || localSeason || seasons.at(-1);
        animationTimer = window.setTimeout(advanceSeason, 0); updatePlayButton();
    }
    d3.csv('data/processed/spending_performance.csv', row => ({ ...row, season: number(row.season), club_id: String(row.club_id), spending_million_eur: number(row.spending_million_eur), points_per_game: number(row.points_per_game), squad_market_value_million_eur: number(row.squad_market_value_million_eur) })).then(rows => {
        data = rows.filter(row => row.points_per_game > 0 && Number.isFinite(row.squad_market_value_million_eur));
        seasons = [...new Set(data.map(row => row.season))].sort(d3.ascending);
        x.domain([0, d3.max(data, row => row.spending_million_eur)]).nice();
        y.domain([0, d3.max(data, row => row.points_per_game) + .1]).nice();
        radius.domain([0, d3.max(data, row => row.squad_market_value_million_eur)]);
        select.selectAll('option').data(seasons).join('option').attr('value', season => season).text(season => data.find(row => row.season === season).season_label);
        select.on('change', event => { stopAnimation(); localSeason = number(event.target.value); state.set({ season: localSeason }); });
        play.on('click', toggleAnimation);
        clear.on('click', () => state.set({ clubId: null, clubName: null }));
        state.subscribe(query => { localSeason = animationTimer === null ? (query.season || seasons.at(-1)) : localSeason; render(localSeason); });
    }).catch(() => stage.html('<p class="chart-placeholder">Spending-performance data could not be loaded.</p>'));
})();

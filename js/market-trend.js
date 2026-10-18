(() => {
    const svg = d3.select('#market-trend-svg'), container = d3.select('#market-trend-chart'), tip = d3.select('#market-trend-tooltip');
    if (svg.empty()) return;

    const width = 1100, height = 230, margin = { top: 26, right: 38, bottom: 46, left: 78 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;
    const chart = svg.append('g').attr('transform', `translate(${margin.left},${margin.top})`);
    const x = d3.scalePoint().range([0, innerWidth]).padding(.35);
    const y = d3.scaleLinear().range([innerHeight, 0]);
    const formatBillions = value => `€${d3.format('.1f')(value / 1e9)}B`;
    const moveTip = event => {
        const bounds = container.node().getBoundingClientRect();
        tip.style('left', `${Math.max(8, Math.min(bounds.width - 154, event.clientX - bounds.left + 12))}px`)
            .style('top', `${Math.max(8, event.clientY - bounds.top - 42)}px`);
    };

    d3.csv('data/processed/treemap_data.csv', row => ({ season: +row.season, season_label: row.season_label, spending_eur: +row.spending_eur || 0 })).then(rows => {
        const seasons = d3.rollups(rows, values => d3.sum(values, row => row.spending_eur), row => row.season, row => row.season_label)
            .map(([season, labels]) => ({ season, season_label: labels[0][0], spending_eur: labels[0][1] }))
            .sort((a, b) => d3.ascending(a.season, b.season));
        x.domain(seasons.map(row => row.season_label));
        y.domain([0, d3.max(seasons, row => row.spending_eur)]).nice();
        chart.append('g').attr('class', 'market-trend-grid').call(d3.axisLeft(y).ticks(3).tickSize(-innerWidth).tickFormat(formatBillions)).call(group => group.select('.domain').remove());
        chart.append('g').attr('class', 'market-trend-axis').attr('transform', `translate(0,${innerHeight})`).call(d3.axisBottom(x));
        // Annotate the largest year-on-year drop, computed from the data.
        const drops = seasons.slice(1).map((row, index) => ({ row, change: row.spending_eur / seasons[index].spending_eur - 1 }));
        const worst = d3.least(drops, item => item.change);
        if (worst && worst.change < 0) {
            const note = chart.append('g').attr('class', 'market-trend-note');
            const px = x(worst.row.season_label), py = y(worst.row.spending_eur);
            note.append('line').attr('x1', px).attr('x2', px).attr('y1', py + 8).attr('y2', py + 26);
            note.append('text').attr('x', px).attr('y', py + 40).attr('text-anchor', 'middle').text(`Largest drop: ${d3.format('.0%')(worst.change)} in ${worst.row.season_label}`);
        }
        chart.append('path').datum(seasons).attr('class', 'market-trend-line').attr('d', d3.line().x(row => x(row.season_label)).y(row => y(row.spending_eur)));
        chart.selectAll('circle').data(seasons).join('circle').attr('class', 'market-trend-point').attr('cx', row => x(row.season_label)).attr('cy', row => y(row.spending_eur)).attr('r', 4).attr('tabindex', 0).attr('aria-label', row => `${row.season_label}: ${formatBillions(row.spending_eur)}`).on('mouseenter focus', (event, row) => {
            tip.text(`${row.season_label} | ${formatBillions(row.spending_eur)}`).attr('aria-hidden', 'false').classed('is-visible', true);
            moveTip(event);
        }).on('mousemove', moveTip).on('mouseleave blur', () => tip.attr('aria-hidden', 'true').classed('is-visible', false));
    }).catch(() => svg.node().insertAdjacentHTML('afterend', '<p class="chart-placeholder">Annual spending data could not be loaded.</p>'));
})();

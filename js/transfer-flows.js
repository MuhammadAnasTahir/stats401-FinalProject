(() => {
    const groups = ['Premier League', 'La Liga', 'Bundesliga', 'Serie A', 'Ligue 1', 'Other Europe', 'Outside Europe / Unknown'];
    const colors = new Map([['Premier League', '#24513f'], ['La Liga', '#b85c35'], ['Bundesliga', '#315f73'], ['Serie A', '#77733d'], ['Ligue 1', '#7c4f68'], ['Other Europe', '#6e716e'], ['Outside Europe / Unknown', '#9a7446']]);
    const chart = d3.select('#transfer-flow-chart'), svg = d3.select('#flow-svg'), stage = chart.select('.flow-stage'), select = d3.select('#flow-season'), metric = d3.select('#flow-metric'), position = d3.select('#flow-position'), feeStatus = d3.select('#flow-fee-status'), total = d3.select('#flow-total'), leagueRoles = d3.select('#league-roles'), tip = d3.select('#flow-tooltip'), state = window.TransferMarketState;
    if (chart.empty()) return;

    let data = [], seasons = [];
    const root = svg.append('g').attr('transform', 'translate(550,390)');
    const ribbons = root.append('g'), arcs = root.append('g'), labels = root.append('g');
    const number = value => +value || 0;
    const format = (value, selectedMetric) => selectedMetric === 'count' ? d3.format(',')(value) : (value >= 1e9 ? `€${d3.format('.2~f')(value / 1e9)}B` : `€${d3.format(',.0f')(value / 1e6)}M`);

    function moveTip(event) {
        const bounds = stage.node().getBoundingClientRect();
        tip.style('left', `${Math.max(10, Math.min(bounds.width - 242, event.clientX - bounds.left + 12))}px`).style('top', `${Math.max(10, Math.min(bounds.height - 100, event.clientY - bounds.top + 12))}px`);
    }

    function render(season) {
        const selectedMetric = metric.property('value'), query = state.get();
        const rows = data.filter(row => row.season === season && (query.position === 'all' || row.position === query.position) && (query.feeStatus === 'all' || row.fee_status === query.feeStatus));
        const matrix = groups.map(() => groups.map(() => 0));
        rows.forEach(row => {
            const buyer = groups.indexOf(row.to_group), seller = groups.indexOf(row.from_group);
            if (buyer >= 0 && seller >= 0) matrix[buyer][seller] += row[selectedMetric === 'fee' ? 'total_fee_eur' : 'transfer_count'];
        });
        if (!rows.length) { ribbons.selectAll('*').remove(); arcs.selectAll('*').remove(); labels.selectAll('*').remove(); total.text('No transfers match these filters.'); return; }
        const layout = (d3.chordDirected ? d3.chordDirected() : d3.chord()).padAngle(.045)(matrix);
        const arc = d3.arc().innerRadius(220).outerRadius(245);
        const ribbon = (d3.ribbonArrow ? d3.ribbonArrow() : d3.ribbon()).radius(220);
        const related = datum => !query.league || groups[datum.source.index] === query.league || groups[datum.target.index] === query.league;
        const transferCount = d3.sum(rows, row => row.transfer_count);
        const knownFeeCount = d3.sum(rows, row => row.known_fee_count);
        const coverage = transferCount ? knownFeeCount / transferCount : 0;
        const field = selectedMetric === 'fee' ? 'total_fee_eur' : 'transfer_count';
        const roles = groups.slice(0, 5).map(league => {
            const grossBought = d3.sum(rows, row => row.to_group === league ? row[field] : 0);
            const grossSold = d3.sum(rows, row => row.from_group === league ? row[field] : 0);
            const netSpend = grossBought - grossSold;
            return { league, grossBought, grossSold, netSpend };
        }).sort((a, b) => d3.descending(a.netSpend, b.netSpend));
        leagueRoles.selectAll('tr').data(roles, row => row.league).join(
            enter => {
                const row = enter.append('tr');
                row.append('th').attr('scope', 'row').attr('class', 'league-role-name');
                row.append('td').attr('class', 'league-role-label');
                row.append('td').attr('class', 'league-role-value league-role-bought');
                row.append('td').attr('class', 'league-role-value league-role-sold');
                row.append('td').attr('class', 'league-role-value league-role-net');
                return row;
            },
            update => update,
            exit => exit.remove()
        ).each(function(row) {
            const role = row.netSpend > 0 ? 'Net buyer' : row.netSpend < 0 ? 'Net seller' : 'Balanced';
            const tableRow = d3.select(this);
            tableRow.select('.league-role-name').text(row.league);
            tableRow.select('.league-role-label').text(role);
            tableRow.select('.league-role-bought').text(format(row.grossBought, selectedMetric));
            tableRow.select('.league-role-sold').text(format(row.grossSold, selectedMetric));
            tableRow.select('.league-role-net').text(`${row.netSpend >= 0 ? '+' : '−'}${format(Math.abs(row.netSpend), selectedMetric)}`);
        });

        const ribbonPaths = ribbons.selectAll('path').data(layout, datum => `${datum.source.index}-${datum.target.index}`);
        ribbonPaths.exit().remove();
        const selectLeague = (event, datum) => state.set({ league: groups[datum.index], clubId: null, clubName: null });
        const activateLeague = (event, datum) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLeague(event, datum); } };
        ribbonPaths.enter().append('path').attr('class', 'flow-ribbon').attr('tabindex', 0).attr('role', 'button').on('mouseenter focus', (event, datum) => {
            tip.html(`<strong>${groups[datum.source.index]} → ${groups[datum.target.index]}</strong><span>${format(datum.source.value, selectedMetric)} ${selectedMetric === 'fee' ? 'in recorded fees' : 'transfers'}</span>`).classed('is-visible', true);
            moveTip(event);
        }).on('mousemove', moveTip).on('mouseleave blur', () => tip.classed('is-visible', false)).on('click', (event, datum) => selectLeague(event, { index: datum.source.index })).on('keydown', (event, datum) => activateLeague(event, { index: datum.source.index })).merge(ribbonPaths).attr('fill', datum => colors.get(groups[datum.source.index])).attr('d', ribbon).style('opacity', datum => related(datum) ? .7 : .09);

        const arcPaths = arcs.selectAll('path').data(layout.groups, datum => datum.index);
        arcPaths.exit().remove();
        arcPaths.enter().append('path').attr('class', 'flow-arc').attr('tabindex', 0).attr('role', 'button').on('mouseenter focus', (event, datum) => {
            tip.html(`<strong>${groups[datum.index]}</strong><span>${format(datum.value, selectedMetric)} ${selectedMetric === 'fee' ? 'in total flows' : 'transfers'}</span>`).classed('is-visible', true);
            moveTip(event);
        }).on('mousemove', moveTip).on('mouseleave blur', () => tip.classed('is-visible', false)).on('click', selectLeague).on('keydown', activateLeague).merge(arcPaths).attr('fill', datum => colors.get(groups[datum.index])).attr('d', arc).style('opacity', datum => !query.league || groups[datum.index] === query.league ? 1 : .38);

        const text = labels.selectAll('text').data(layout.groups, datum => datum.index);
        text.exit().remove();
        text.enter().append('text').attr('class', 'flow-label').attr('dy', '.35em').merge(text).attr('transform', datum => {
            const angle = (datum.startAngle + datum.endAngle) / 2, rotation = angle * 180 / Math.PI - 90;
            return `rotate(${rotation}) translate(263) rotate(${angle > Math.PI ? 180 : 0})`;
        }).attr('text-anchor', datum => (datum.startAngle + datum.endAngle) / 2 > Math.PI ? 'end' : 'start').text(datum => groups[datum.index] === 'Outside Europe / Unknown' ? 'Outside Europe' : groups[datum.index]);

        total.text(`${rows[0]?.season_label || season} · ${format(d3.sum(rows, row => row[selectedMetric === 'fee' ? 'total_fee_eur' : 'transfer_count']), selectedMetric)} · ${selectedMetric === 'fee' ? `${d3.format('.0%')(coverage)} fee coverage` : 'transfers'}`);
        select.property('value', season);
        position.property('value', query.position);
        feeStatus.property('value', query.feeStatus);
    }

    d3.csv('data/processed/league_transfer_flows.csv', row => ({ ...row, season: number(row.season), total_fee_eur: number(row.total_fee_eur), transfer_count: number(row.transfer_count), known_fee_count: number(row.known_fee_count) })).then(rows => {
        data = rows;
        seasons = [...new Set(rows.map(row => row.season))].sort(d3.ascending);
        select.selectAll('option').data(seasons).join('option').attr('value', season => season).text(season => rows.find(row => row.season === season).season_label);
        position.selectAll('option.filter-option').data([...new Set(rows.map(row => row.position))].sort()).join('option').attr('class', 'filter-option').attr('value', value => value).text(value => value);
        feeStatus.selectAll('option.filter-option').data([...new Set(rows.map(row => row.fee_status))].sort()).join('option').attr('class', 'filter-option').attr('value', value => value).text(value => value);
        select.on('change', event => state.set({ season: number(event.target.value) }));
        metric.on('change', () => render(state.get().season));
        position.on('change', event => state.set({ position: event.target.value }));
        feeStatus.on('change', event => state.set({ feeStatus: event.target.value }));
        state.subscribe(query => render(query.season || seasons.at(-1)));
    }).catch(() => stage.html('<p class="chart-placeholder">Transfer-flow data could not be loaded.</p>'));
})();

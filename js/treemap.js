(() => {
    const chart=d3.select('#treemap-chart'), svg=d3.select('#treemap-svg'), stage=chart.select('.treemap-stage'), seasonSelect=d3.select('#treemap-season'), play=d3.select('#treemap-play'), clear=d3.select('#treemap-clear-league'), total=d3.select('#treemap-total'), tip=d3.select('#treemap-tooltip'), state=window.TransferMarketState;
    if(chart.empty()) return;
    const width=1100, height=640, layer=svg.append('g'), roots=new Map();
    let data=[], seasons=[];
    let animationTimer = null, localSeason = null;
    const number=v=>Number.isFinite(+v)?+v:0, money=v=>Math.abs(v)>=1e9?`€${d3.format('.2~f')(v/1e9)}B`:`€${d3.format(',.1f')(v/1e6)}M`, escape=v=>String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
    const leagueColors=new Map([['Premier League','#24513f'],['La Liga','#b85c35'],['Bundesliga','#315f73'],['Serie A','#77733d'],['Ligue 1','#7c4f68']]);
    function positionTip(event) { const b=stage.node().getBoundingClientRect(); tip.style('left',`${Math.min(b.width-242,Math.max(10,event.clientX-b.left+12))}px`).style('top',`${Math.min(b.height-150,Math.max(10,event.clientY-b.top+12))}px`); }
    function showTip(event, leaf) { const row=leaf.data.row; tip.html(`<strong>${escape(row.club_name)}</strong><span>${escape(row.league_name)} · ${row.season_label}</span><dl><dt>Spending</dt><dd>${money(row.spending_eur)}</dd><dt>Income</dt><dd>${money(row.income_eur)}</dd><dt>Net spending</dt><dd>${row.net_spending_eur>=0?'+':'−'}${money(Math.abs(row.net_spending_eur))}</dd><dt>Transfers</dt><dd>${row.incoming_transfer_count}</dd><dt>Share of league spending</dt><dd>${d3.format('.1%')(row.league_spending_share)}</dd></dl>`).classed('is-visible',true); positionTip(event); }
    function rootFor(league) {
        const key=league||'all';
        if(roots.has(key)) return roots.get(key);
        const scope=data.filter(row=>!league||row.league_name===league);
        const tree={children:d3.groups(scope,row=>row.competition_id).map(([id,rows])=>({id,name:rows[0].league_name,children:d3.groups(rows,row=>row.club_id).map(([clubId,clubRows])=>({club_id:clubId,row:clubRows[0]}))}))};
        const root=d3.hierarchy(tree); roots.set(key,root); return root;
    }
    function setRows(root, rows) {
        const byClub=new Map(rows.map(row=>[row.club_id,row]));
        root.leaves().forEach(leaf=>{ leaf.data.row=byClub.get(leaf.data.club_id)||null; });
        root.sum(node=>node.row?.spending_eur||0);
    }
    function render(season) {
        const q=state.get(), rows=data.filter(row=>row.season===season&&(!q.league||row.league_name===q.league)&&row.spending_eur>0);
        if(!rows.length) { layer.selectAll('*').remove(); total.text('No spending data for this selection.'); return; }
        const root=rootFor(q.league); setRows(root,rows);
        d3.treemap().tile(d3.treemapResquarify).size([width,height]).paddingOuter(4).paddingTop(28).paddingInner(3)(root);
        const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:550, transition=svg.transition().duration(duration).ease(d3.easeCubicInOut), leaves=root.leaves().filter(leaf=>leaf.value>0);
        const cells=layer.selectAll('g.treemap-cell').data(leaves,leaf=>leaf.data.club_id); cells.exit().transition(transition).style('opacity',0).remove();
        const selectClub=(event,leaf)=>state.set({clubId:leaf.data.club_id,clubName:leaf.data.row.club_name});
        const activateClub=(event,leaf)=>{ if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectClub(event,leaf); } };
        const enter=cells.enter().append('g').attr('class','treemap-cell').attr('tabindex',0).attr('role','button').on('mouseenter focus',showTip).on('mousemove',positionTip).on('mouseleave blur',()=>tip.classed('is-visible',false)).on('click',selectClub).on('keydown',activateClub);
        enter.append('rect'); enter.append('text').attr('class','treemap-club-name').attr('x',8).attr('y',20); enter.append('text').attr('class','treemap-club-value').attr('x',8).attr('y',38);
        const merged=enter.merge(cells).attr('aria-label',leaf=>`${leaf.data.row.club_name}: ${money(leaf.data.row.spending_eur)}`).classed('is-selected',leaf=>String(leaf.data.club_id)===String(q.clubId));
        merged.transition(transition).style('opacity',1).attr('transform',leaf=>`translate(${leaf.x0},${leaf.y0})`);
        merged.select('rect').transition(transition).attr('width',leaf=>leaf.x1-leaf.x0).attr('height',leaf=>leaf.y1-leaf.y0).attr('fill',leaf=>leagueColors.get(leaf.data.row.league_name)||'#58766c');
        merged.select('.treemap-club-name').text(leaf=>(leaf.x1-leaf.x0>56&&leaf.y1-leaf.y0>20)?leaf.data.row.club_name:'');
        merged.select('.treemap-club-value').text(leaf=>(leaf.x1-leaf.x0>62&&leaf.y1-leaf.y0>40)?money(leaf.data.row.spending_eur):'');
        const leagues=layer.selectAll('text.treemap-league-label').data(root.children||[],league=>league.data.id); leagues.exit().remove();
        const selectLeague=(event,league)=>state.set({league:league.data.name,clubId:null,clubName:null});
        leagues.enter().append('text').attr('class','treemap-league-label').attr('tabindex',0).attr('role','button').on('click',selectLeague).on('keydown',(event,league)=>{if(event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectLeague(event,league); }}).merge(leagues).attr('x',league=>league.x0+8).attr('y',league=>league.y0+19).text(league=>league.data.name);
        total.text(`${rows[0].season_label} · ${money(d3.sum(rows,row=>row.spending_eur))}${q.league?` · ${q.league}`:''}`); seasonSelect.property('value',season);
    }
    function updatePlayButton() { const playing=animationTimer!==null; play.text(playing?'Pause':'Play').attr('aria-label',playing?'Pause season animation':'Play season animation'); }
    function stopAnimation() { if(animationTimer!==null) window.clearTimeout(animationTimer); animationTimer=null; updatePlayButton(); }
    function advanceSeason() {
        const index=seasons.indexOf(localSeason), nextIndex=index<0||index>=seasons.length-1?0:index+1;
        localSeason=seasons[nextIndex]; render(localSeason);
        animationTimer=window.setTimeout(advanceSeason, 1500); updatePlayButton();
    }
    function toggleAnimation() {
        if(animationTimer!==null) { stopAnimation(); return; }
        localSeason=Number(seasonSelect.property('value'))||localSeason||seasons.at(-1);
        animationTimer=window.setTimeout(advanceSeason, 0); updatePlayButton();
    }
    d3.csv('data/processed/treemap_data.csv',row=>({...row,season:number(row.season),spending_eur:number(row.spending_eur),income_eur:number(row.income_eur),net_spending_eur:number(row.net_spending_eur),incoming_transfer_count:number(row.incoming_transfer_count),league_spending_share:number(row.league_spending_share)})).then(rows=>{
        data=rows; seasons=[...new Set(rows.map(row=>row.season))].sort(d3.ascending); seasonSelect.selectAll('option').data(seasons).join('option').attr('value',season=>season).text(season=>rows.find(row=>row.season===season).season_label);
        seasonSelect.on('change',event=>{stopAnimation(); localSeason=number(event.target.value); state.set({season:localSeason});}); play.on('click',toggleAnimation); clear.on('click',()=>state.set({league:null,clubId:null,clubName:null})); state.subscribe(q=>{localSeason=animationTimer===null?(q.season||seasons.at(-1)):localSeason; render(localSeason);}); state.set({season:seasons.at(-1)});
    }).catch(()=>stage.html('<p class="chart-placeholder">Market-composition data could not be loaded.</p>'));
})();

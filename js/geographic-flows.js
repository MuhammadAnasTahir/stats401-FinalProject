(() => {
    const coords = { Argentina:[-64,-34], Australia:[134,-25], Austria:[14,47.5], Belgium:[4.5,50.7], Brazil:[-52,-10], Croatia:[16,45.5], 'Czech Republic':[15.5,49.8], Denmark:[10,56], England:[-1.5,52], France:[2,46.5], Germany:[10.5,51], Greece:[22,39], Italy:[12.5,42.8], Japan:[138,37], 'Korea, South':[127.8,36], Mexico:[-102,23], Netherlands:[5.4,52.2], Norway:[9,62], Poland:[19,52], Portugal:[-8,39.5], Romania:[25,46], Russia:[100,61], 'Saudi Arabia':[45,24], Scotland:[-4,57], Serbia:[21,44], Spain:[-3.5,40], Sweden:[16,62], Switzerland:[8.2,46.8], 'Türkiye':[35,39], Ukraine:[31,49], 'United States':[-98,39] };
    const leagueCountry = { 'Premier League':'England', 'La Liga':'Spain', Bundesliga:'Germany', 'Serie A':'Italy', 'Ligue 1':'France' };
    const svg=d3.select('#map-svg'), stage=d3.select('#map-chart .flow-stage'), metric=d3.select('#map-metric'), position=d3.select('#map-position'), feeStatus=d3.select('#map-fee-status'), flowLimit=d3.select('#map-flow-limit'), total=d3.select('#map-total'), largestCorridor=d3.select('#map-corridor'), tip=d3.select('#map-tooltip'), S=window.TransferMarketState;
    if (svg.empty()) return;
    const seasonSelect=d3.select('#map-season'), zoomIn=d3.select('#map-zoom-in'), zoomOut=d3.select('#map-zoom-out'), zoomReset=d3.select('#map-zoom-reset');
    const projection=d3.geoNaturalEarth1().translate([550,310]).scale(180), path=d3.geoPath(projection), defs=svg.append('defs'), mapRoot=svg.append('g'), base=mapRoot.append('g'), flows=mapRoot.append('g');
    const flowLayer=flows.append('g'), hitLayer=flows.append('g'), dotLayer=flows.append('g');
    defs.append('marker').attr('id','map-flow-arrow').attr('viewBox','0 0 8 8').attr('refX',7).attr('refY',4).attr('markerWidth',6).attr('markerHeight',6).attr('markerUnits','userSpaceOnUse').attr('orient','auto').append('path').attr('d','M0,0L8,4L0,8Z').attr('fill','#24513f');
    const europeView=d3.zoomIdentity.translate(-470,-100).scale(1.7);
    const zoom=d3.zoom().scaleExtent([1,5]).translateExtent([[-900,-600],[2000,1300]]).on('zoom', event => mapRoot.attr('transform',event.transform));
    let data=[], world, selectedFeeStatus='Paid fee';
    const n=x=>+x||0, fmt=(v,m)=>m==='count'?d3.format(',')(v):(v>=1e9?`€${d3.format('.2~f')(v/1e9)}B`:`€${d3.format(',.0f')(v/1e6)}M`);
    function moveTip(event) { const b=stage.node().getBoundingClientRect(); tip.style('left',`${Math.max(10,Math.min(b.width-242,event.clientX-b.left+12))}px`).style('top',`${Math.max(10,Math.min(b.height-120,event.clientY-b.top+12))}px`); }
    function setView(view) { svg.transition().duration(350).call(zoom.transform,view); }
    function syncMetricForFeeStatus() {
        const isFreeTransfer = selectedFeeStatus === 'Free transfer';
        metric.select('option[value="fee"]').property('disabled',isFreeTransfer);
        if (isFreeTransfer) metric.property('value','count');
    }
    function flowDetail(d) {
        return selectedFeeStatus === 'Free transfer'
            ? `<dl><dt>Free transfers</dt><dd>${fmt(d.transfer_count,'count')}</dd></dl>`
            : `<dl><dt>Fees</dt><dd>${fmt(d.total_fee_eur,'fee')}</dd><dt>Transfers</dt><dd>${fmt(d.transfer_count,'count')}</dd></dl>`;
    }
    function countryDetail(d) {
        return selectedFeeStatus === 'Free transfer'
            ? `<span>Visible flows touching this country</span><dl><dt>Free transfers</dt><dd>${fmt(d.count,'count')}</dd></dl>`
            : `<span>Visible flows touching this country</span><dl><dt>Fees</dt><dd>${fmt(d.fee,'fee')}</dd><dt>Transfers</dt><dd>${fmt(d.count,'count')}</dd></dl>`;
    }
    function drawBase() { if (world&&window.topojson) base.selectAll('path').data(topojson.feature(world,world.objects.countries).features).join('path').attr('class','map-country').attr('d',path); }
    function flowPath(d) {
        const buyer=projection(coords[d.to_country_name]), seller=projection(coords[d.from_country_name]);
        const dx=seller[0]-buyer[0], dy=seller[1]-buyer[1], distance=Math.hypot(dx,dy)||1;
        const key=`${d.to_country_name}-${d.from_country_name}`;
        const hash=[...key].reduce((sum,char)=>sum+char.charCodeAt(0),0);
        const bend=(18+(hash%4)*9)*(hash%2===0?1:-1);
        const midpoint=[(buyer[0]+seller[0])/2-dy/distance*bend,(buyer[1]+seller[1])/2+dx/distance*bend];
        return d3.line().curve(d3.curveBasis)([buyer,midpoint,seller]);
    }
    function render(season) {
        const q=S.get(), focus=leagueCountry[q.league];
        syncMetricForFeeStatus();
        const m=metric.property('value');
        const all=Array.from(d3.rollup(
            data.filter(d=>d.season===season && (q.position==='all'||d.position===q.position) && d.fee_status === selectedFeeStatus),
            values=>({
                ...values[0],
                total_fee_eur:d3.sum(values,d=>d.total_fee_eur),
                transfer_count:d3.sum(values,d=>d.transfer_count),
                known_fee_count:d3.sum(values,d=>d.known_fee_count),
                unknown_fee_count:d3.sum(values,d=>d.unknown_fee_count),
                free_transfer_count:d3.sum(values,d=>d.free_transfer_count),
                fallback_endpoint_count:d3.sum(values,d=>d.fallback_endpoint_count),
            }),
            d=>`${d.from_country_name}\u0000${d.to_country_name}`
        ).values()), domestic=all.filter(d=>d.same_country);
        const rows=all.filter(d=>!d.same_country && coords[d.from_country_name] && coords[d.to_country_name] && (!focus || d.from_country_name===focus || d.to_country_name===focus)).sort((a,b)=>b[m==='fee'?'total_fee_eur':'transfer_count']-a[m==='fee'?'total_fee_eur':'transfer_count']).slice(0,+flowLimit.property('value'));
        // Line width encodes the selected metric, so money (or deal count) is visible at a glance.
        const metricVal=d=>m==='fee'?d.total_fee_eur:d.transfer_count;
        const widthScale=d3.scaleSqrt().domain([0,d3.max(rows,metricVal)||1]).range([1.2,7]);
        const key=d=>`${d.from_country_name}-${d.to_country_name}`;
        const focusFlow=d=>{ flowLayer.selectAll('path.map-flow').style('opacity',other=>other===d?1:.25); tip.html(`<strong>${d.to_country_name} → ${d.from_country_name}</strong>${flowDetail(d)}`).classed('is-visible',true); };
        const resetFlow=()=>{ flowLayer.selectAll('path.map-flow').style('opacity',1); tip.classed('is-visible',false); };
        // Visible flows: width = metric, no pointer events (hover handled by the wide hit layer).
        const paths=flowLayer.selectAll('path.map-flow').data(rows,key);
        paths.exit().remove();
        paths.enter().append('path').attr('class','map-flow').merge(paths).attr('d',flowPath).attr('marker-end','url(#map-flow-arrow)').style('opacity',1).attr('stroke-width',d=>widthScale(metricVal(d)));
        // Transparent wide hover targets so thin links are easy to reach with the cursor.
        const hits=hitLayer.selectAll('path.map-flow-hit').data(rows,key);
        hits.exit().remove();
        hits.enter().append('path').attr('class','map-flow-hit').on('mouseenter',(event,d)=>{ focusFlow(d); moveTip(event); }).on('mousemove',moveTip).on('mouseleave',resetFlow).merge(hits).attr('d',flowPath);
        const countries=[...new Set(rows.flatMap(d=>[d.from_country_name,d.to_country_name]))].map(country=>({
            country,
            fee:d3.sum(rows,d=>(d.from_country_name===country||d.to_country_name===country)?d.total_fee_eur:0),
            count:d3.sum(rows,d=>(d.from_country_name===country||d.to_country_name===country)?d.transfer_count:0),
        }));
        const dots=dotLayer.selectAll('circle.map-point').data(countries,d=>d.country);
        dots.exit().remove();
        dots.enter().append('circle').attr('class','map-point').on('mouseenter',(event,d)=>{ tip.html(`<strong>${d.country}</strong>${countryDetail(d)}`).classed('is-visible',true); moveTip(event); }).on('mousemove',moveTip).on('mouseleave',()=>tip.classed('is-visible',false)).merge(dots).attr('cx',d=>projection(coords[d.country])[0]).attr('cy',d=>projection(coords[d.country])[1]).attr('r',3).attr('aria-label',d=>d.country);
        const fallbackEndpoints=d3.sum(all,d=>d.fallback_endpoint_count||0);
        total.text(`${all[0]?.season_label||season} | top ${rows.length} flows between different countries | within a single country: ${fmt(d3.sum(domestic,d=>d[m==='fee'?'total_fee_eur':'transfer_count']),m)}${m==='fee'?' in fees':' transfers'} | ${fallbackEndpoints} transfer ends use the club reference table for country`);
        const largest = rows[0];
        largestCorridor.text(largest ? ` | Largest flow shown: ${largest.to_country_name} clubs buying from ${largest.from_country_name} clubs (${fmt(largest[m==='fee'?'total_fee_eur':'transfer_count'],m)}).` : 'No flow between different countries matches these filters.');
        position.property('value',q.position); feeStatus.property('value',selectedFeeStatus); seasonSelect.property('value',season);
    }
    // Enable drag-pan + programmatic zoom, but NOT scroll-wheel zoom (it hijacks page scroll).
    svg.call(zoom).call(zoom.transform,europeView).on('dblclick.zoom',null).on('wheel.zoom',null);
    zoomIn.on('click',()=>svg.transition().duration(250).call(zoom.scaleBy,1.45));
    zoomOut.on('click',()=>svg.transition().duration(250).call(zoom.scaleBy,1/1.45));
    zoomReset.on('click',()=>setView(europeView));
    Promise.all([d3.csv('data/processed/country_transfer_flows.csv',r=>({...r,season:n(r.season),total_fee_eur:n(r.total_fee_eur),transfer_count:n(r.transfer_count),fallback_endpoint_count:n(r.fallback_endpoint_count),same_country:r.same_country==='True'||r.same_country==='true'})),d3.json('data/static/countries-110m.json').catch(()=>null)]).then(([rows,topology])=>{ data=rows; world=topology; drawBase(); const mapSeasons=[...new Set(rows.map(row=>row.season))].sort(d3.ascending), latest=mapSeasons.at(-1); seasonSelect.selectAll('option').data(mapSeasons).join('option').attr('value',s=>s).text(s=>rows.find(row=>row.season===s).season_label); seasonSelect.on('change',event=>S.set({season:n(event.target.value)})); position.selectAll('option.filter-option').data([...new Set(rows.map(row=>row.position))].sort()).join('option').attr('class','filter-option').attr('value',value=>value).text(value=>value); metric.on('change',()=>render(S.get().season||latest)); position.on('change',event=>S.set({position:event.target.value})); feeStatus.on('change',event=>{ selectedFeeStatus=event.target.value; render(S.get().season||latest); }); flowLimit.on('change',()=>render(S.get().season||latest)); S.subscribe(q=>render(q.season||latest)); }).catch(()=>stage.html('<p class="chart-placeholder">Geographic-flow data could not be loaded.</p>'));
})();

(() => {
    const dataPath = "data/processed/treemap_data.csv";
    const width = 1100;
    const height = 640;
    const playbackDelay = 1500;

    const leagueColors = new Map([
        ["GB1", "#24513f"],
        ["ES1", "#b85c35"],
        ["L1", "#315f73"],
        ["IT1", "#77733d"],
        ["FR1", "#7c4f68"],
    ]);

    const chart = d3.select("#treemap-chart");
    const stage = chart.select(".treemap-stage");
    const svg = d3.select("#treemap-svg");
    const seasonSelect = d3.select("#treemap-season");
    const playButton = d3.select("#treemap-play");
    const totalLabel = d3.select("#treemap-total");
    const tooltip = d3.select("#treemap-tooltip");

    if (chart.empty() || stage.empty() || svg.empty()) {
        return;
    }

    const plot = svg.append("g");
    const leagueLayer = plot.append("g").attr("class", "treemap-leagues");
    const cellLayer = plot.append("g").attr("class", "treemap-cells");
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let allData = [];
    let seasons = [];
    let timer = null;

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function normalizeRow(row) {
        return {
            season: number(row.season),
            season_label: row.season_label,
            competition_id: row.competition_id,
            league_name: row.league_name,
            club_id: String(row.club_id),
            club_name: row.club_name,
            treemap_value_eur: number(row.treemap_value_eur),
            spending_eur: number(row.spending_eur),
            income_eur: number(row.income_eur),
            net_spending_eur: number(row.net_spending_eur),
            incoming_transfer_count: number(row.incoming_transfer_count),
        };
    }

    function formatMoney(value) {
        const absolute = Math.abs(value);
        if (absolute >= 1_000_000_000) {
            return `€${d3.format(".2~f")(value / 1_000_000_000)}B`;
        }
        return `€${d3.format(",.1f")(value / 1_000_000)}M`;
    }

    function formatSignedMoney(value) {
        if (value === 0) {
            return "€0.0M";
        }
        const sign = value > 0 ? "+" : "−";
        return `${sign}${formatMoney(Math.abs(value))}`;
    }

    function escapeHtml(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function hierarchyForSeason(rows) {
        const groups = d3.groups(rows, row => row.competition_id);
        return {
            name: "Top Five Leagues",
            children: groups.map(([competitionId, clubs]) => ({
                id: competitionId,
                name: clubs[0].league_name,
                children: clubs.map(club => ({
                    ...club,
                    value: club.treemap_value_eur,
                })),
            })),
        };
    }

    function colorForLeaf(leaf) {
        return leagueColors.get(leaf.parent.data.id) || "#58766c";
    }

    function showTooltip(event, leaf) {
        const row = leaf.data;
        tooltip
            .html(`
                <strong>${escapeHtml(row.club_name)}</strong>
                <span>${escapeHtml(row.league_name)} · ${escapeHtml(row.season_label)}</span>
                <dl>
                    <dt>Spending</dt><dd>${formatMoney(row.spending_eur)}</dd>
                    <dt>Income</dt><dd>${formatMoney(row.income_eur)}</dd>
                    <dt>Net spending</dt><dd>${formatSignedMoney(row.net_spending_eur)}</dd>
                    <dt>Incoming transfers</dt><dd>${d3.format(",d")(row.incoming_transfer_count)}</dd>
                </dl>
            `)
            .attr("aria-hidden", "false")
            .classed("is-visible", true);
        moveTooltip(event);
    }

    function moveTooltip(event) {
        const bounds = stage.node().getBoundingClientRect();
        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth || 230;
        const tooltipHeight = tooltipNode.offsetHeight || 150;
        const pointerX = Number.isFinite(event.clientX) ? event.clientX : bounds.left + bounds.width / 2;
        const pointerY = Number.isFinite(event.clientY) ? event.clientY : bounds.top + bounds.height / 2;
        const gap = 14;
        const edgePadding = 12;
        const x = Math.max(
            edgePadding,
            Math.min(pointerX - bounds.left + gap, bounds.width - tooltipWidth - edgePadding)
        );
        let y = pointerY - bounds.top + gap;

        if (y + tooltipHeight > bounds.height - edgePadding) {
            y = pointerY - bounds.top - tooltipHeight - gap;
        }

        y = Math.max(edgePadding, Math.min(y, bounds.height - tooltipHeight - edgePadding));
        tooltip.style("left", `${x}px`).style("top", `${y}px`);
    }

    function hideTooltip() {
        tooltip.attr("aria-hidden", "true").classed("is-visible", false);
    }

    function splitLabel(clubName, cellWidth, maxLines) {
        const maxCharacters = Math.max(5, Math.floor((cellWidth - 18) / 7.2));
        const words = clubName.trim().split(/\s+/);
        const lines = [];
        let line = "";

        words.forEach(word => {
            const candidate = line ? `${line} ${word}` : word;
            if (candidate.length <= maxCharacters) {
                line = candidate;
            } else if (line) {
                lines.push(line);
                if (word.length > maxCharacters) {
                    lines.push(`${word.slice(0, Math.max(1, maxCharacters - 1))}…`);
                    line = "";
                } else {
                    line = word;
                }
            } else {
                lines.push(`${word.slice(0, Math.max(1, maxCharacters - 1))}…`);
                line = "";
            }
        });

        if (line) {
            lines.push(line);
        }

        const visibleLines = lines.slice(0, maxLines);
        if (lines.length > maxLines && visibleLines.length) {
            const lastLine = visibleLines.length - 1;
            visibleLines[lastLine] = `${visibleLines[lastLine].slice(0, Math.max(1, maxCharacters - 1))}…`;
        }

        return visibleLines;
    }

    function updateCellLabel(selection) {
        selection.each(function (leaf) {
            const cellWidth = leaf.x1 - leaf.x0;
            const cellHeight = leaf.y1 - leaf.y0;
            const showName = cellWidth >= 34 && cellHeight >= 16;
            const canUseTwoLines = cellWidth >= 90 && cellHeight >= 58;
            const lines = showName ? splitLabel(leaf.data.club_name, cellWidth, canUseTwoLines ? 2 : 1) : [];
            const nameLabel = d3.select(this).select(".treemap-club-name");
            const valueLabel = d3.select(this).select(".treemap-club-value");
            const showValue = cellWidth >= 52 && cellHeight >= (lines.length > 1 ? 76 : 32);

            nameLabel
                .style("display", showName ? null : "none")
                .text(null)
                .selectAll("tspan")
                .data(lines)
                .join("tspan")
                .attr("x", 9)
                .attr("dy", (line, index) => index === 0 ? 0 : "1.15em")
                .text(line => line);

            valueLabel
                .attr("y", lines.length > 1 ? 55 : 38)
                .style("display", showValue ? null : "none");
        });
    }

    function renderSeason(season) {
        const rows = allData.filter(row => row.season === season && row.treemap_value_eur > 0);
        if (!rows.length) {
            showError(`No spending data is available for ${season}.`);
            return;
        }

        const root = d3.hierarchy(hierarchyForSeason(rows))
            .sum(node => node.value || 0)
            .sort((a, b) => b.value - a.value);

        d3.treemap()
            .tile(d3.treemapSquarify.ratio(1.2))
            .size([width, height])
            .paddingOuter(4)
            .paddingTop(28)
            .paddingInner(3)
            .round(true)(root);

        const duration = prefersReducedMotion ? 0 : 720;
        const transition = svg.transition().duration(duration).ease(d3.easeCubicInOut);
        const leaves = root.leaves();

        const cells = cellLayer
            .selectAll("g.treemap-cell")
            .data(leaves, leaf => leaf.data.club_id);

        cells.exit()
            .transition(transition)
            .style("opacity", 0)
            .remove();

        const cellsEnter = cells.enter()
            .append("g")
            .attr("class", "treemap-cell")
            .attr("tabindex", 0)
            .attr("role", "listitem")
            .style("opacity", 0)
            .on("mouseenter focus", showTooltip)
            .on("mousemove", moveTooltip)
            .on("mouseleave blur", hideTooltip);

        cellsEnter.append("rect").attr("rx", 2).attr("ry", 2);
        cellsEnter.append("clipPath")
            .attr("id", leaf => `treemap-clip-${leaf.data.club_id}`)
            .append("rect");
        cellsEnter.attr("clip-path", leaf => `url(#treemap-clip-${leaf.data.club_id})`);
        cellsEnter.append("text").attr("class", "treemap-club-name").attr("x", 9).attr("y", 20);
        cellsEnter.append("text").attr("class", "treemap-club-value").attr("x", 9).attr("y", 38);

        const cellsMerged = cellsEnter.merge(cells);

        cellsMerged
            .attr("aria-label", leaf => `${leaf.data.club_name}, ${formatMoney(leaf.data.spending_eur)} spent in ${leaf.data.season_label}`)
            .select(".treemap-club-name")
            .text(leaf => leaf.data.club_name);

        cellsMerged
            .select(".treemap-club-value")
            .text(leaf => formatMoney(leaf.data.spending_eur));

        cellsMerged.transition(transition)
            .style("opacity", 1)
            .attr("transform", leaf => `translate(${leaf.x0},${leaf.y0})`)
            .on("end", function () {
                updateCellLabel(d3.select(this));
            });

        cellsMerged.select("rect")
            .transition(transition)
            .attr("width", leaf => Math.max(0, leaf.x1 - leaf.x0))
            .attr("height", leaf => Math.max(0, leaf.y1 - leaf.y0))
            .attr("fill", colorForLeaf);

        cellsMerged.select("clipPath rect")
            .transition(transition)
            .attr("width", leaf => Math.max(0, leaf.x1 - leaf.x0))
            .attr("height", leaf => Math.max(0, leaf.y1 - leaf.y0));

        const leagues = leagueLayer
            .selectAll("text.treemap-league-label")
            .data(root.children || [], league => league.data.id);

        leagues.exit().remove();

        leagues.enter()
            .append("text")
            .attr("class", "treemap-league-label")
            .merge(leagues)
            .text(league => league.data.name)
            .transition(transition)
            .attr("x", league => league.x0 + 9)
            .attr("y", league => league.y0 + 19);

        const seasonLabel = rows[0].season_label || String(season);
        const total = d3.sum(rows, row => row.spending_eur);
        totalLabel.text(`${seasonLabel} · ${formatMoney(total)}`);
        svg.attr("aria-label", `Transfer spending composition for the ${seasonLabel} season`);
        seasonSelect.property("value", String(season));
    }

    function stopPlayback() {
        if (timer !== null) {
            window.clearInterval(timer);
            timer = null;
        }
        playButton.text("Play").attr("aria-label", "Play season animation");
    }

    function startPlayback() {
        let currentIndex = seasons.indexOf(number(seasonSelect.property("value")));
        if (currentIndex === seasons.length - 1) {
            currentIndex = 0;
            renderSeason(seasons[currentIndex]);
        }

        playButton.text("Pause").attr("aria-label", "Pause season animation");
        timer = window.setInterval(() => {
            currentIndex += 1;
            if (currentIndex >= seasons.length) {
                stopPlayback();
                return;
            }
            renderSeason(seasons[currentIndex]);
            if (currentIndex === seasons.length - 1) {
                stopPlayback();
            }
        }, playbackDelay);
    }

    function showError(message) {
        stopPlayback();
        chart.select(".treemap-stage").html(`<p class="treemap-error">${escapeHtml(message)}</p>`);
        totalLabel.text("Unavailable");
    }

    playButton.on("click", () => {
        if (timer === null) {
            startPlayback();
        } else {
            stopPlayback();
        }
    });

    seasonSelect.on("change", event => {
        stopPlayback();
        renderSeason(number(event.target.value));
    });

    d3.csv(dataPath, normalizeRow)
        .then(data => {
            allData = data.filter(row => Number.isFinite(row.season));
            seasons = Array.from(new Set(allData.map(row => row.season))).sort(d3.ascending);

            if (!seasons.length) {
                throw new Error("The treemap dataset contains no valid seasons.");
            }

            const labelsBySeason = new Map();
            allData.forEach(row => labelsBySeason.set(row.season, row.season_label || String(row.season)));

            seasonSelect.selectAll("option")
                .data(seasons)
                .join("option")
                .attr("value", season => season)
                .text(season => labelsBySeason.get(season));

            renderSeason(seasons[seasons.length - 1]);
        })
        .catch(error => {
            console.error(error);
            showError("Treemap data could not be loaded. Run the project from a local server and check data/processed/treemap_data.csv.");
        });
})();

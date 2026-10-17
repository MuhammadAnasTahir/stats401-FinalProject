(() => {
    const dataPath = "data/processed/rumor_highlights.csv";
    const container = document.getElementById("rumor-highlights");
    if (!container) return;

    const toneLabel = { optimistic: "Optimistic", neutral: "Neutral / unclear", doubtful: "Doubtful" };

    function number(value) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }

    function formatMoney(eur) {
        if (!Number.isFinite(eur) || eur <= 0) return "—";
        if (eur >= 1_000_000_000) return `€${(eur / 1_000_000_000).toFixed(2)}B`;
        return `€${Math.round(eur / 1_000_000)}M`;
    }

    function formatSignedPct(value) {
        if (!Number.isFinite(value)) return "—";
        const sign = value > 0 ? "+" : "";
        return `${sign}${value.toFixed(0)}%`;
    }

    function tile(row) {
        const card = document.createElement("article");
        card.className = "rumor-tile";

        const photo = document.createElement("div");
        photo.className = "rumor-tile-photo";
        const img = document.createElement("img");
        img.alt = row.player_name;
        img.referrerPolicy = "no-referrer";
        // Prefer the locally served high-res image; fall back to the Transfermarkt
        // CDN "/big/" crop, then the original, before giving up.
        const bigUrl = String(row.image_url).replace(/\/portrait\/(header|medium|small)\//, "/portrait/big/");
        const sources = [row.local_image, bigUrl, row.image_url].filter(Boolean);
        let srcIndex = 0;
        img.onerror = () => {
            srcIndex += 1;
            if (srcIndex < sources.length) {
                img.src = sources[srcIndex];
                return;
            }
            photo.classList.add("is-missing");
            img.remove();
        };
        img.src = sources[0];
        photo.appendChild(img);

        const body = document.createElement("div");
        body.className = "rumor-tile-body";
        body.innerHTML = `
            <p class="rumor-tile-name">${row.player_name}</p>
            <p class="rumor-tile-move">${row.from_club_name} <span aria-hidden="true">→</span> ${row.to_club_name}</p>
            <p class="rumor-tile-season">${row.transfer_season} · ${row.article_count} articles</p>
            <dl class="rumor-tile-stats">
                <div><dt>Market value</dt><dd>${formatMoney(number(row.market_value_eur))}</dd></div>
                <div><dt>Fee paid</dt><dd>${formatMoney(number(row.fee_eur))}</dd></div>
                <div><dt>Value after</dt><dd>${formatMoney(number(row.mv_after_eur))} <span class="rumor-tile-delta ${number(row.mv_change_pct) >= 0 ? "up" : "down"}">${formatSignedPct(number(row.mv_change_pct))}</span></dd></div>
            </dl>
            <p class="rumor-tile-badges">
                <span class="rumor-badge intensity-${row.rumor_intensity}">${row.rumor_intensity} intensity</span>
                <span class="rumor-badge tone-${row.dominant_tone}">${toneLabel[row.dominant_tone] || row.dominant_tone}</span>
                ${String(row.agent_originated).toLowerCase() === "true" ? '<span class="rumor-badge agent">agent-cited</span>' : ""}
            </p>`;

        card.appendChild(photo);
        card.appendChild(body);
        return card;
    }

    d3.csv(dataPath, d3.autoType)
        .then(rows => {
            container.innerHTML = "";
            rows.forEach(row => container.appendChild(tile(row)));
        })
        .catch(() => {
            container.innerHTML = '<p class="chart-placeholder">Highlight data could not be loaded.</p>';
        });
})();

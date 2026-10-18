# The Football Transfer Market

STATS 401 final project by Zihan (Martina) Ma and Muhammad Anas Tahir.

An interactive D3.js report on how money moves through the European football
transfer market, 2016/17 to 2025/26, across the Premier League, La Liga, the
Bundesliga, Serie A, and Ligue 1.

**Live page:** https://muhammadanastahir.github.io/stats401-FinalProject/

## Research questions

1. **Market structure.** How have transfer spending and cross-league flows changed over time, and which clubs and leagues act as buyers, sellers, hubs, or feeders?
2. **Spending and performance.** To what extent is club spending associated with later sporting performance?
3. **Rumours and outcomes.** Before a signing, how are rumour intensity, tone, and agent-attributed reports associated with the final fee and the change in a player's market value?

`proposal.md` holds the original project plan.

## What is on the page

| Figure | View | Idiom |
|---|---|---|
| 1 | Market Composition | Treemap |
| 2 | Annual spending | Line chart |
| 3 | Transfer Flows | Directed chord diagram |
| 4 | Geographic Transfer Flows | Flow map with zoom and pan |
| 5 | Most-Covered Transfers | Player cards |
| 6 | Rumour Intensity and Outcomes | Box plots |
| 7 | Rumour Volume and Tone | Streamgraph |
| 8 | Spending and Performance | Bubble scatterplot with trend line |

Interactions: season selectors and Play animation, position and fee-status
filters, league and club selection linked across views, a pinned club
trajectory, map zoom and pan, hover or tap details, and a sticky section
navigation bar. The page works on phones: charts swipe sideways and tooltips
appear as a card at the bottom of the screen.

## Data

| Source | What | Where |
|---|---|---|
| [Transfermarkt dataset](https://github.com/dcaribou/transfermarkt-datasets) (CC0) | About 1.1 million rows: transfers, player valuations, matches, players, clubs, competitions | `data/rawdata/` (raw), `data/processed/cleaned/` (cleaned) |
| [Guardian Open Platform API](https://open-platform.theguardian.com/) | 3,221 transfer-window articles with full text, 2016/17 to 2025/26 | `data/rawdata/rumors/guardian/` (raw, one JSON per article) |

Chart-ready tables are in `data/processed/`. Article text is courtesy of the
Guardian Open Platform and is used here for a student project.

## Reproducing the pipeline

Requirements: Python 3.12 or newer with `pandas`, `requests`, and
`beautifulsoup4`. Run every script from inside `dataprocessing/`.

```bash
pip install pandas requests beautifulsoup4
cd dataprocessing
```

**Spending, flows, and performance** (needs the raw CSVs in `data/rawdata/`):

```bash
python clean_raw_data.py            # raw -> data/processed/cleaned/
python build_finance_data.py        # club finance, league flows, country flows
python build_performance_data.py    # points per game and league position
python build_market_value_data.py   # squad market-value snapshots
python build_visualization_data.py  # treemap and scatterplot tables
python build_club_pair_flows.py     # club-to-club flows for chord tooltips
```

**Rumours** (the cached articles are already in the repo, so steps 1 can be skipped):

1. Optional re-download: get a free key at
   <https://open-platform.theguardian.com/access/>, save it as
   `data/rawdata/rumors/.guardian_key` (this file is git-ignored; never commit
   it), then run `python scrape_guardian.py --all`.
2. Link articles to transfers and build the rumour tables:

```bash
python build_rumor_data.py          # links, tone, agent flag, outcomes, highlights
python rumor_quality_report.py      # data-quality accounting
```

`scrape_rumors.py` is an abandoned GDELT experiment kept for reference; it was
rate-limited and returned too few football articles, so the Guardian API is the
only rumour source.

## Running the site locally

The charts load CSV files, so the page must be served over HTTP (opening
`index.html` directly will not work):

```bash
python -m http.server 8000
```

then open <http://localhost:8000/>.

## Repository layout

```
index.html, style.css, tokens.css   the page
js/                                 one D3 module per view, plus shared state and navigation
data/rawdata/                       source data (Transfermarkt CSVs, Guardian articles)
data/processed/                     cleaned and chart-ready tables
dataprocessing/                     pipeline scripts, config, and tests
images/players/                     player photos used by the rumour cards
```

## Known limitations

- Rumour data come from one outlet (the Guardian); tone keywords match 74% of article mentions and the rest default to neutral.
- Only 39% of linked transfers have a disclosed fee, so the fee-premium comparison covers fewer deals than the market-value one.
- Transfermarkt updates valuations a few times a year, so about one in four transfers show no value change and are left out of the market-value panel.
- Loans, returns, and permanent deals are not separated.
- Every result is an association, not a causal effect.

import re
from xml.sax.saxutils import escape
p = 'ux/word/document.xml'
x = open(p, encoding='utf-8').read()
pat = re.compile(r'<w:p[ >].*?</w:p>', re.S)
ps = list(pat.finditer(x))
new = {
19: "The transfer market is a large table of tens of thousands of dated, directed money movements, and no single statistic captures it. A treemap shows part-to-whole structure, a chord diagram or a map shows direction and magnitude, box plots show distributions, a streamgraph shows change, and a scatterplot shows a relationship between two quantities. Filters and selections let readers test the page against their own questions.",
23: "The second source is original data that we collected. We queried the Guardian Open Platform API for articles with its transfer-window tag, season by season from 2016/17 to 2025/26, and saved each article’s full text as one JSON file, 3,221 in all (data/rawdata/rumors/guardian). A first attempt with the GDELT news index was rate-limited and returned too few football articles. The script scrape_guardian.py reads the API key from a git-ignored file so that no credential is stored in the repository.",
25: "The script clean_raw_data.py standardises the raw tables: it converts season labels to one format and fees and valuations to euros, handles missing and malformed values, and keeps only matches and transfers involving clubs in the five leagues over the study period. The cleaned tables are stored in data/processed/cleaned beside the raw data. Only recorded transfer fees count as spending, so free transfers and undisclosed fees carry no money; the interface shows the share of transfers with a recorded fee (for example 89 percent in 2025/26). Where a transfer end cannot be matched to a country, the script falls back on a club reference table and the map reports how many ends it resolved this way.",
27: "Build scripts turn the cleaned tables into the files the charts read. build_finance_data.py aggregates spending, income, and net spending by club and season and produces the league and country flow tables. build_performance_data.py computes points per game and final position from match results, and build_market_value_data.py sums squad market value from the nearest valuation per player around 1 September. build_visualization_data.py joins these into the treemap and scatterplot tables, and build_club_pair_flows.py keeps club names on each flow so that chord tooltips can list the biggest deals; its totals reconcile exactly with the league-level flows.",
32: "The site is a static page with no build step: HTML, CSS, and vanilla JavaScript modules, with D3 version 7 for every chart and TopoJSON for the world map. Each view has its own module, and a small shared-state module keeps the selected season, league, club, position, and fee status in sync across the views that should move together. Python scripts run the pipeline, four test files check the data and chart encodings, and the page is published with GitHub Pages. The layout works on phones: wide charts scroll sideways at a readable size, the map fits the screen, and tooltips become cards at the bottom. A sticky navigation bar and a short signpost before every heading guide the reader through the story, and a README documents how to reproduce every step.",
47: "The page contains eight views, presented in the order a reader meets them: an overview of where the money goes, patterns in how it flows, a deeper look at the rumours that precede deals, and an insight on whether spending buys results. Each screenshot shows the full view with its controls and caption.",
146: "The views are chosen for their tasks rather than repeated: a treemap for part-to-whole, a chord diagram and a map for flows, box plots for distributions, a streamgraph for change, and a scatterplot for a relationship. Together they cover a hierarchy, a network, geography, text-derived data, and time. The story is explicit, with a signpost for every heading, direct annotations on two charts, and findings stated with their numbers, which are computed from the same files the charts read. We report data coverage openly, including the share of transfers with a recorded fee and the share of tone labels that are inferred, and the interface works on phones because most poster visitors will use one.",
155: "The interactions that help most are the ones that answer a question: changing the season to see change, selecting a league to carry a question from the treemap to the flows, and pinning a club to follow its path. Tooltips carry the exact figures that the encodings only approximate. Two interactions were added because the views could not otherwise answer a question: the club-pair detail in the chord tooltips, and the switch of free transfers to counts so that the chord is never empty. Because we did not run a user study, we cannot say how easy the controls are for a new reader; the Evaluation Plan on the page sets out how we will test this.",
163: "What the audience can learn goes beyond these figures. A reader can see how concentrated the market is, check a claim such as “English clubs are the biggest buyers” against the flows, and test whether a favourite club beat or missed what its spending predicted. They can also see why the answer to “do rumours matter” is more nuanced than the headlines imply, because the page shows both the pattern and the limits of the data. By putting exact figures, coverage rates, and limitations next to the charts, the project helps readers draw conclusions with the right level of confidence.",
}
rels_p = 'ux/word/_rels/document.xml.rels'
rels = open(rels_p, encoding='utf-8').read()
counter = [100]


def link(url, text=None):
    global rels
    counter[0] += 1
    i = f'rIdL{counter[0]}'
    rels = rels.replace('</Relationships>', f'<Relationship Id="{i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="{escape(url)}" TargetMode="External"/></Relationships>')
    return f'<w:hyperlink r:id="{i}"><w:r><w:rPr><w:color w:val="000000"/><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">{escape(text or url)}</w:t></w:r></w:hyperlink>'


def r(t):
    return f'<w:r><w:t xml:space="preserve">{escape(t)}</w:t></w:r>'


credit = {
179: [r('Transfermarkt dataset (dcaribou/transfermarkt-datasets), released under CC0: '), link('https://github.com/dcaribou/transfermarkt-datasets')],
180: [r('Guardian Open Platform API: '), link('https://open-platform.theguardian.com/'), r('. Article text is used for a student project, and the page shows only aggregated counts and linked headlines derived from it.')],
181: [r('World boundaries from Natural Earth ('), link('https://www.naturalearthdata.com/'), r(') through the world-atlas TopoJSON package ('), link('https://github.com/topojson/world-atlas'), r('). Player photographs are from Transfermarkt ('), link('https://www.transfermarkt.com/'), r(').')],
182: [r('Charts built with D3.js version 7: '), link('https://d3js.org/')],
}
extra = [
    [r('Project website: '), link('https://muhammadanastahir.github.io/stats401-FinalProject/')],
    [r('Project code and data: '), link('https://github.com/MuhammadAnasTahir/stats401-FinalProject')],
]
out = []
last = 0
for i, m in enumerate(ps):
    s = m.group(0)
    if i in (104, 105):
        out.append(x[last:m.start()])
        last = m.end()
        continue
    if i in new or i in credit:
        ppr = re.search(r'<w:pPr>.*?</w:pPr>', s, re.S).group(0)
        open_tag = re.match(r'<w:p[^>]*>', s).group(0)
        body = ''.join(credit[i]) if i in credit else r(new[i])
        s2 = open_tag + ppr + body + '</w:p>'
        if i == 182:
            for e in extra:
                s2 += '<w:p>' + ppr + ''.join(e) + '</w:p>'
        out.append(x[last:m.start()])
        out.append(s2)
        last = m.end()
out.append(x[last:])
x = ''.join(out)


open(p, 'w', encoding='utf-8').write(x)
open(rels_p, 'w', encoding='utf-8').write(rels)
print('r ns declared:', 'xmlns:r=' in x[:4000])

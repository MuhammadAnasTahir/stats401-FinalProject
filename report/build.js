const fs=require('fs');
const {Document,Packer,Paragraph,TextRun,ImageRun,AlignmentType,Table,TableRow,TableCell,WidthType,BorderStyle,LevelFormat,Footer,PageNumber}=require('docx');
const F='Times New Roman', SZ=24, BLACK='000000';
const run=(t,o={})=>new TextRun({text:t,font:F,size:o.size||SZ,bold:o.bold,italics:o.italics,color:BLACK});
function runs(t){return t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map(s=>s.startsWith('**')?run(s.slice(2,-2),{bold:true}):run(s));}
const P=t=>new Paragraph({children:runs(t),spacing:{after:140,line:300},alignment:AlignmentType.JUSTIFIED});
const H1=t=>new Paragraph({heading:'Heading1',children:[run(t,{bold:true,size:32})],spacing:{before:360,after:160},keepNext:true});
const H2=t=>new Paragraph({heading:'Heading2',children:[run(t,{bold:true,size:28})],spacing:{before:260,after:120},keepNext:true});
const H3=t=>new Paragraph({heading:'Heading3',children:[run(t,{bold:true,size:26})],spacing:{before:200,after:100},keepNext:true});
const B=t=>new Paragraph({numbering:{reference:'bul',level:0},children:runs(t),spacing:{after:80,line:300}});
const CAP=t=>new Paragraph({children:[run(t)],alignment:AlignmentType.CENTER,spacing:{before:60,after:240}});
function png(path){const b=fs.readFileSync(path);return [b.readUInt32BE(16),b.readUInt32BE(20)];}
function IMG(n,maxW,maxH){const f=`report/img/fig${n}.png`;const [w,h]=png(f);let W=maxW,H=W*h/w;if(H>maxH){H=maxH;W=H*w/h;}
 return new Paragraph({alignment:AlignmentType.CENTER,keepNext:true,spacing:{before:120,after:60},children:[new ImageRun({type:'png',data:fs.readFileSync(f),transformation:{width:Math.round(W*96),height:Math.round(H*96)},altText:{title:`Figure ${n}`,description:`Screenshot of Figure ${n}`,name:`fig${n}`}})]});}
const bd={style:BorderStyle.SINGLE,size:4,color:BLACK};const borders={top:bd,bottom:bd,left:bd,right:bd};
function table(widths,rows){const total=widths.reduce((a,b)=>a+b,0);
 return new Table({width:{size:total,type:WidthType.DXA},columnWidths:widths,rows:rows.map((r,ri)=>new TableRow({tableHeader:ri===0,cantSplit:true,children:r.map((c,ci)=>new TableCell({borders,width:{size:widths[ci],type:WidthType.DXA},margins:{top:60,bottom:60,left:100,right:100},children:[new Paragraph({children:[run(c,{bold:ri===0})],spacing:{after:0}})]}))}))});}
const C=[];
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:120},children:[run('The Football Transfer Market',{bold:true,size:40})]}));
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[run('Where the Money Goes, What Rumours Reveal, and Whether Spending Buys Results',{bold:true,size:28})]}));
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[run('STATS 401 Final Project Report')]}));
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[run('Zihan (Martina) Ma and Muhammad Anas Tahir')]}));
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:60},children:[run('Website: https://muhammadanastahir.github.io/stats401-FinalProject/')]}));
C.push(new Paragraph({alignment:AlignmentType.CENTER,spacing:{after:300},children:[run('Code: https://github.com/MuhammadAnasTahir/stats401-FinalProject')]}));

C.push(H1('1. Introduction'));
C.push(H2('1.1 Motivation and Context'));
C.push(P('Every summer and winter, European football clubs spend billions of euros on players. The headlines focus on record fees, but they say little about the structure underneath: which leagues buy and which sell, where the money travels, whether it improves results on the pitch, and whether the rumours that precede a signing tell us anything about the deal that follows. Transfer data are also unusually rich. They link money, geography, time, club performance, and a steady stream of public commentary, so they allow one topic to be examined from several angles.'));
C.push(P('Our project covers the five major European leagues (the Premier League, La Liga, the Bundesliga, Serie A, and Ligue 1) over ten seasons, 2016/17 to 2025/26. We chose the topic because the question behind the headlines, whether money buys success and who ends up paying whom, is something football fans, analysts, and journalists argue about constantly but rarely check against the full data.'));
C.push(H2('1.2 Research Questions and Visualization Goals'));
C.push(P('The project is organised around three research questions, each of which defines a visualization goal.'));
C.push(B('**Market structure.** How have transfer spending and cross-league flows changed over time, and which clubs and leagues act as buyers, sellers, hubs, or feeders?'));
C.push(B('**Spending and performance.** To what extent is a club’s transfer spending associated with its sporting performance in the following season?'));
C.push(B('**Rumours and outcomes.** Before a signing, how are rumour intensity, tone, and agent-attributed reports associated with the final fee and with the change in the player’s market value?'));
C.push(P('Following the What, Why, and How framing from class, the What is transfer records, club results, market valuations, and news coverage; the Why is to let readers see concentration, direction, trend, and relationship in the market; and the How is a sequence of linked, interactive views that moves from an overview to patterns, to a deeper look, and finally to an insight.'));
C.push(H2('1.3 Intended Audience'));
C.push(P('The page is written for football fans, analysts, journalists, and anyone interested in sports economics. It does not assume statistical training. Each view has a short plain-language explanation, labelled units, and a figure caption, and the page is built to work on a phone because visitors will reach it from a QR code on our poster.'));
C.push(H2('1.4 Why Visualization Is Appropriate'));
C.push(P('The transfer market is a large table of tens of thousands of dated, directed money movements between clubs, and no single summary statistic captures it. Part-to-whole structure is easiest to see in a treemap, direction and magnitude of flows in a chord diagram or a map, distributions in box plots, change in a streamgraph, and the relationship between two quantities in a scatterplot. Interaction matters as much as the encoding. Readers can change season, position, and fee filters, select a league or club, and ask for details, which turns the page from a fixed argument into something a reader can test against their own questions.'));

C.push(H1('2. Method'));
C.push(H2('2.1 Data Sources and Acquisition'));
C.push(P('We use two sources. The first is the open Transfermarkt dataset published by the dcaribou project on GitHub under a CC0 licence. We use its transfers, player valuations, games, club games, players, clubs, and competitions tables, which together hold about 1.15 million rows (175,165 transfer records, 656,301 player valuations, and 88,958 matches). These files are the existing downloadable dataset for the project and are stored unchanged in the repository under data/rawdata.'));
C.push(P('The second source is original data that we collected. For the rumour views we queried the Guardian Open Platform API for articles tagged with its transfer-window tag, season by season from 2016/17 to 2025/26, and saved the full text of each result as one JSON file. The collection holds 3,221 articles in data/rawdata/rumors/guardian. We first attempted to use the GDELT news index, but it rate-limited our requests and returned too few trustworthy football articles, so we switched to the Guardian API. The script that does this, scrape_guardian.py, reads an API key from a git-ignored file so that no credential is stored in the repository.'));
C.push(H2('2.2 Cleaning and Filtering'));
C.push(P('The script clean_raw_data.py standardises the raw tables. It converts season labels to a single format, converts fees and valuations to euros, handles missing and malformed values, and keeps only matches and transfers that involve clubs in the five leagues over the study period. The cleaned tables are written to data/processed/cleaned so that both the source and the cleaned versions are available for inspection. Several choices shape how the results should be read. Only recorded transfer fees count as spending, so free transfers and transfers with an undisclosed fee carry no money; this is shown in the interface as the share of transfers with a recorded fee (for example 89 percent in 2025/26). Where a transfer end cannot be matched to a country, the script falls back on a club reference table and the map reports how many ends it had to resolve this way.'));
C.push(H2('2.3 Transformation and Analysis'));
C.push(P('A set of build scripts turns the cleaned tables into the files the charts read. build_finance_data.py aggregates spending, income, and net spending by club and season and produces the league and country flow tables. build_performance_data.py computes points, points per game, and final position for each club and season from match results. build_market_value_data.py sums squad market value using the nearest valuation per player around 1 September. build_visualization_data.py joins these into the treemap and scatterplot tables, and build_club_pair_flows.py keeps club names on each flow so that the chord tooltips can list the biggest deals; its totals reconcile exactly with the league-level flows.'));
C.push(P('For the spending and performance question, each club’s spending in one season is paired with its points per game in the following season, so spending comes before the result it is supposed to explain. We fit a trend line of points per game on log spending and report the Pearson correlation of the same two quantities, so the line and the statistic agree. Each club’s distance from the line is shown in its tooltip as its difference from the trend.'));
C.push(H2('2.4 The Rumour Pipeline'));
C.push(P('build_rumor_data.py links articles to completed transfers. It looks for a player’s name in the article text, restricts candidate matches to the transfer window that follows the article, and accepts only matches that fit the player and the clubs involved. The result is 16,720 article-to-transfer links covering 4,403 transfers, and 86 percent of the articles are linked to at least one transfer. For every linked transfer the script builds three variables. Intensity is the number of linked articles, grouped into low (one article), medium (two or three), and high (more than three). Tone is a keyword score that classes each mention as optimistic, doubtful, or neutral; it matches 74 percent of mentions and the rest default to neutral. Agent attribution flags mentions that cite a player’s representative, about 20 percent of them. The outcomes are the fee premium (fee paid divided by the player’s market value before the move) and the change in market value afterwards. The script rumor_quality_report.py publishes these coverage figures, so readers can judge for themselves how much to trust each view. Fee premium is available for 39 percent of linked transfers and market value change for 91 percent.'));
C.push(H2('2.5 Visualization Technologies and Implementation'));
C.push(P('The site is a static page with no build step: HTML, CSS, and vanilla JavaScript modules, with D3 version 7 for every chart and TopoJSON for the world map. Each view has its own module, and a small shared-state module keeps the selected season, league, club, position, and fee status in sync across the views that should move together. Python scripts run the whole pipeline, and four test files check the data and the chart encodings. The page is published with GitHub Pages. We designed it to work on phones: wide charts scroll sideways at a readable size, the map fits the screen with large zoom buttons, and tooltips become cards at the bottom of the screen. A sticky navigation bar with a second row for sub-views lets a reader move through the story, and a short signpost in front of every heading names the step the reader is on. A README documents how to reproduce every step.'));

C.push(H1('3. Results'));
C.push(P('The page contains eight views. They are presented in the order in which a reader meets them: an overview of where the money goes, patterns in how it flows, a deeper look at the rumours that precede deals, and finally an insight on whether spending buys results. The screenshots below show each view in full, with its controls and caption.'));
function view(n,title,cap,paras,maxW,maxH){C.push(H2(title));C.push(IMG(n,maxW,maxH));C.push(CAP(cap));paras.forEach(p=>C.push(P(p)));}
view(1,'3.1 Market Composition (Treemap)','Figure 1: Club recorded transfer-fee spending across Europe’s five major leagues by season.',[
'**What it shows.** Each rectangle is a club and its area is that club’s recorded transfer spending in the selected season, grouped by league and coloured by league.',
'**Question it addresses.** Where does the money go, and how concentrated is it?',
'**What users can do.** Choose a season, press Play to animate through all ten seasons, select a league to isolate it, and hover for a tooltip with spending, income, net spending, transfer count, and the club’s share of league spending. The selected league is linked to the other views.',
'**Insight.** In 2025/26 recorded spending reached €7.72 billion, and the Premier League dominates the picture. Liverpool (€481 million) and Chelsea (€337 million) are the largest rectangles, and the Premier League occupies more than half of the area.'],6.5,6.2);
view(2,'3.2 Annual Spending (Line Chart)','Figure 2: Annual total recorded spending across the five displayed leagues.',[
'**What it shows.** Total recorded spending per season across the five leagues, with the largest year-on-year drop annotated directly on the chart.',
'**Question it addresses.** How has the market grown over time?',
'**What users can do.** Hover over a season for its total and its change from the previous season, and read the annotation without needing the tooltip.',
'**Insight.** Spending rose from €2.93 billion in 2016/17 to €7.72 billion in 2025/26, about 2.6 times as much. The only large fall came in 2020/21, a drop of 41 percent to €3.47 billion during the pandemic, after which spending recovered quickly.'],6.5,3);
view(3,'3.3 Transfer Flows (Chord Diagram)','Figure 3: Transfer fee flows between league groups by season.',[
'**What it shows.** Each arc is a league group and each ribbon is money moving from the selling group to the buying group. Seven groups are shown: the five leagues, other European leagues, and everywhere outside Europe. A League roles table above the chart reports each league’s gross bought, gross sold, and net spending for the current filters.',
'**Question it addresses.** Who pays whom between leagues?',
'**What users can do.** Change the season, the metric (fees or number of transfers), the position, and the fee status, and click an arc to select a league, which is linked to the treemap and the scatterplot. Ribbon tooltips list the three biggest club-to-club deals, and arc tooltips give what the league spent, received, and netted. Choosing free transfers switches the metric to counts, because free transfers have no fee.',
'**Insight.** Across the ten seasons the Premier League bought €22.1 billion of players and sold €10.4 billion, a net of +€11.6 billion. Serie A (+€1.4 billion), La Liga (+€0.5 billion), and the Bundesliga (+€0.3 billion) are close to balanced, and Ligue 1 (−€0.6 billion) is the only one of the five that sells more than it buys.'],6.3,8);
view(4,'3.4 Geographic Transfer Flows (Flow Map)','Figure 4: Country-to-country flows involving at least one top-five-league club.',[
'**What it shows.** Curved lines join the countries of the selling and buying clubs, and line width follows the chosen metric. A summary line states the season, how much money moves within a single country, and the largest corridor.',
'**Question it addresses.** How do the flows run across countries?',
'**What users can do.** Select the season, metric, position, fee status, and number of flows (top 15 or top 30), hover over a flow to fade the others and read its details, and zoom and pan the map with the buttons or by dragging.',
'**Insight.** England is the destination of the four largest corridors, buying from Germany (€2.70 billion over the ten seasons), France (€2.51 billion), Italy (€2.06 billion), and Spain (€1.98 billion). About a third of paid-fee money (33 percent) stays within a single country.'],6.5,5.6);
view(5,'3.5 Most-Covered Transfers (Player Cards)','Figure 5: The six most-covered transfers in the rumour corpus.',[
'**What it shows.** The six transfers with the most linked articles, each with the player, the clubs, the season, the article count, market value, fee paid, value after the move, and tags for intensity, tone, and agent citation.',
'**Question it addresses.** Which deals drew the most rumours?',
'**What users can do.** The first four cards are shown and a Show More button reveals the rest.',
'**Insight.** The most-covered deals involve big names and big fees. Alexander Isak’s move to Liverpool in 2025/26 drew 70 articles and Harry Kane’s move to Bayern Munich drew 65, and all six were classed as high intensity with agent-cited reporting.'],5.2,8.2);
view(6,'3.6 Rumour Intensity and Outcomes (Box Plots)','Figure 6: Transfer outcomes across rumour-intensity groups.',[
'**What it shows.** Two panels compare low, medium, and high intensity transfers. The first shows the fee premium (fee divided by market value, with a dashed line at 1) for 1,696 transfers, and the second shows the change in market value afterwards (with a dashed line at no change) for 3,056 transfers. Transfers with an exactly unchanged valuation, about a quarter, are left out of the second panel.',
'**Question it addresses.** Do rumours relate to what a deal costs and how the player’s value moves?',
'**What users can do.** Hover over a box for its median, quartiles, and sample size.',
'**Insight.** The median fee premium is 1.18 for low intensity, 1.17 for medium, and 1.23 for high intensity, so heavily rumoured deals cost somewhat more over market value, but the boxes overlap heavily. For value change the medians are +11.1 percent, +7.9 percent, and +11.1 percent, and the average change is smaller for high-intensity transfers (+35 percent) than for low-intensity ones (+54 percent).'],6.5,6);
view(7,'3.7 Rumour Volume and Tone (Streamgraph)','Figure 7: Weekly rumour volume before a signing, split by tone.',[
'**What it shows.** The number of article mentions in each week before a signing, stacked by tone as optimistic, neutral, or doubtful, with signing at the right edge. A shaded band marks the final two weeks. Because one article can mention several transfers, the bands count article-to-transfer mentions rather than unique articles.',
'**Question it addresses.** How does coverage build toward a signing?',
'**What users can do.** Hover over a stream to highlight it and read its total mentions and share.',
'**Insight.** Coverage is heavily back-loaded: half of all mentions (50 percent) fall in the last two weeks and 73 percent in the last four. Optimistic reporting grows as the deal nears, from 30 percent of mentions four to five weeks out to 42 percent in the signing week, while doubtful reporting persists throughout.'],6.5,5.5);
view(8,'3.8 Spending and Performance (Bubble Scatterplot)','Figure 8: Club transfer spending and following-season performance.',[
'**What it shows.** Each bubble is a club. Its horizontal position is its transfer spending in a season on a symlog scale, its vertical position is its points per game the next season, its size is squad market value, and its colour is the league. A dashed trend line gives the points per game that spending predicts.',
'**Question it addresses.** Does the money buy results?',
'**What users can do.** Choose a season or press Play, click a bubble to pin a club and trace its path across seasons, and hover for the club’s spending, points per game, expected points per game, difference from the trend, and squad value.',
'**Insight.** This is the headline finding. In every one of the nine spending seasons, the top quarter of spenders earned more points per game in the following season than the bottom quarter. On average the top spenders collected 1.78 points per game against 1.17 for the lowest spenders, a gap of about 0.6 points per game, or roughly 23 points over a 38-match season. The typical top-quarter spender finished 5th in its league and the typical bottom-quarter spender finished 13th. The correlation between log spending and next-season points per game is positive in all nine seasons, from 0.35 to 0.67 and about 0.51 on average. Bubbles far above the line show clubs that beat their budget, and bubbles far below it show clubs that did not convert spending into points.'],6.5,6.5);
C.push(H2('3.9 Major Interactions'));
C.push(P('Across the page the main interactions are season selection with an animated Play mode on the treemap and the scatterplot; position and fee-status filters that are shared by the two flow views; league selection from the treemap and the chord diagram that is linked to the other views; club selection in the scatterplot that pins a club’s trajectory; zooming and panning on the map; and a Show More toggle on the player cards. Tooltips are used throughout for detail on demand, but they supplement the filters and selections rather than replace them.'));

C.push(H1('4. Discussion'));
C.push(H2('4.1 Evaluating the Design with What, Why, and How'));
C.push(table([1500,2500,2500,2860],[
['View','What (data)','Why (task)','How (idiom and interaction)'],
['Market composition','Club spending by season and league','Compare club shares, find concentration','Treemap, area and colour, season, Play, league selection'],
['Annual spending','Total fees per season','Read the trend and spot the 2020/21 drop','Line chart with a direct annotation'],
['Transfer flows','League-to-league fees and counts','Find who pays whom, buyers and sellers','Directed chord diagram, filters, selection, tooltips'],
['Geographic flows','Country-to-country fees and counts','See geography and the largest corridors','Flow map, width by metric, zoom, pan, hover fade'],
['Most-covered transfers','Top linked transfers with attributes','Identify the deals that drew the most rumours','Cards, text and tags, Show More'],
['Intensity and outcomes','Fee premium and value change by intensity','Compare distributions across groups','Box plots, dashed reference lines, tooltips'],
['Volume and tone','Weekly mentions by tone','See how coverage builds toward a signing','Streamgraph, annotated band, hover highlight'],
['Spending and performance','Spending, points per game, squad value','Judge the relationship and find outliers','Bubble scatterplot, trend line, pinned trajectory, Play']]));
C.push(new Paragraph({spacing:{after:160},children:[]}));
C.push(H2('4.2 Strengths'));
C.push(P('The views are chosen for their tasks rather than repeated: a treemap for part-to-whole, a chord diagram and a map for flows, box plots for distributions, a streamgraph for change, and a scatterplot for a relationship. Together they cover a hierarchy, a network, geography, text-derived data, and time. The story is explicit, with a signpost for every heading, direct annotations on two charts, and a findings section that states each result with its numbers. The numbers in the text are computed from the same files the charts read. We report data coverage openly: the share of transfers with a recorded fee, the share of articles that could be linked, and the share of tone and agent labels that are inferred. The interface was designed for phones, because most poster visitors will use one.'));
C.push(H2('4.3 Weaknesses and Limitations'));
C.push(B('**Rumour data come from one outlet.** The Guardian is a reputable source but not the only voice, and tone keywords match only 74 percent of mentions; the rest default to neutral. A language model or a hand-labelled sample would classify tone better.'));
C.push(B('**Coverage of fees is incomplete.** Only 39 percent of linked transfers have a disclosed fee, so the fee-premium comparison covers fewer deals than the value-change comparison.'));
C.push(B('**Valuations are coarse.** Transfermarkt updates valuations only a few times a year, so about one in four transfers show no value change and are left out of that panel.'));
C.push(B('**Deals are not separated by type.** Loans, returns, and permanent moves are not distinguished, and valuable players attract more coverage whatever the rumours say, so none of the rumour results should be read as cause and effect.'));
C.push(B('**The performance result is an association.** Clubs with more money differ from other clubs in many ways, so the finding shows that spending and results move together, not that spending alone produces the results.'));
C.push(B('**Design trade-offs.** The chord diagram is dense with seven groups and ribbons that cross, and the map overlays many flows near Europe. The scatterplot’s symlog axis stretches low spending, which helps readability but can mislead if the reader does not notice the scale. The three rumour views are standalone and do not respond to the shared filters. On phones, the charts must be swiped sideways to be read at a legible size.'));
C.push(H2('4.4 Effectiveness of Interactions'));
C.push(P('The interactions that help most are the ones that answer a question: changing the season to see change, selecting a league to carry a question from the treemap to the flows, and pinning a club to follow its path. Tooltips carry the exact figures that the encodings only approximate. Two interactions were added because the views could not otherwise answer a question: the club-pair detail in the chord tooltips, and the switch of free transfers to counts so that the chord is never empty. Because we did not run a user study, we cannot say how easy the controls are for a new reader. The Evaluation Plan on the page sets out how we will test this with think-aloud sessions.'));
C.push(H2('4.5 Possible Improvements'));
C.push(B('Run the planned think-aloud sessions and revise the controls and labels that cause hesitation.'));
C.push(B('Add more news sources and a better tone classifier, and link the rumour views to the shared filters so a reader can ask about one league or one club.'));
C.push(B('Separate loans from permanent transfers, and add wages and contract length, which would strengthen the spending and performance analysis.'));
C.push(B('Model the spending and performance relationship with controls such as club size and past results, to move beyond a simple association.'));

C.push(H1('5. Conclusion'));
C.push(P('Returning to the three questions, the page shows the following. On market structure, spending grew about 2.6 times in ten seasons, from €2.93 billion to €7.72 billion, with a pandemic dip of 41 percent in 2020/21. The Premier League is the market’s net buyer (+€11.6 billion), the other big leagues are close to balanced, Ligue 1 is a small net seller, and the four largest cross-border corridors all run into England. On spending and performance, clubs that spend more finish higher the next season: the top quarter of spenders earned about 0.6 more points per game than the bottom quarter in every one of the nine seasons we measured. On rumours, coverage tracks how close a deal is, with half of all mentions in the final two weeks, but it does not clearly predict what a player costs or how the player’s value changes.'));
C.push(P('What the audience can learn goes beyond these figures. A reader can see for themselves how concentrated the market is, check a claim such as “English clubs are the biggest buyers” against the flows, and test whether a favourite club beat or missed what its spending predicted. They can also see why the answer to “do rumours matter” is more nuanced than the headlines imply, because the page shows both the pattern and the limits of the data. By putting exact figures, coverage rates, and limitations next to the charts, the project helps readers draw conclusions with the right amount of confidence, which is what we think a data story should do.'));

C.push(H1('6. Roles and Responsibilities'));
C.push(P('The division of work follows our project proposal. We both took part in design decisions, testing, writing, and review.'));
C.push(H3('Zihan (Martina) Ma'));
C.push(B('Built the structured Transfermarkt pipeline: cleaning, currency and season standardisation, table joins, and club and league aggregation.'));
C.push(B('Implemented the spending-trend line chart, the zoomable treemap, and the directed chord diagram.'));
C.push(B('Co-developed the spending and performance scatterplot and the box plots.'));
C.push(H3('Muhammad Anas Tahir (Team Leader)'));
C.push(B('Built the rumour pipeline: the Guardian collection scripts, article-to-transfer linking, and the intensity, tone, agent, and outcome variables, with the data-quality report.'));
C.push(B('Implemented the rumour streamgraph, the most-covered transfer cards, and the geographic flow map.'));
C.push(B('Built the page structure and storytelling layer, the findings, the phone layout, the tests, and the README, and published the site on GitHub Pages.'));
C.push(H3('Shared'));
C.push(B('Project proposal, research questions, view design, the interim check-in, this report, the poster, and the final presentation.'));

C.push(H1('7. Data and Credits'));
C.push(B('Transfermarkt dataset (dcaribou/transfermarkt-datasets), released under CC0.'));
C.push(B('Article text from the Guardian Open Platform, used for a student project. The page shows only aggregated counts and linked headlines derived from it.'));
C.push(B('World boundaries from Natural Earth through the world-atlas TopoJSON package. Player photographs are from Transfermarkt.'));
C.push(B('Charts built with D3.js version 7.'));

const doc=new Document({
 creator:'STATS 401 Group',title:'The Football Transfer Market - Final Report',
 styles:{default:{document:{run:{font:F,size:SZ,color:BLACK}}},
  paragraphStyles:[
   {id:'Heading1',name:'Heading 1',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:F,size:32,bold:true,color:BLACK},paragraph:{spacing:{before:360,after:160},outlineLevel:0}},
   {id:'Heading2',name:'Heading 2',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:F,size:28,bold:true,color:BLACK},paragraph:{spacing:{before:260,after:120},outlineLevel:1}},
   {id:'Heading3',name:'Heading 3',basedOn:'Normal',next:'Normal',quickFormat:true,run:{font:F,size:26,bold:true,color:BLACK},paragraph:{spacing:{before:200,after:100},outlineLevel:2}}]},
 numbering:{config:[{reference:'bul',levels:[{level:0,format:LevelFormat.BULLET,text:'•',alignment:AlignmentType.LEFT,style:{paragraph:{indent:{left:720,hanging:360}},run:{font:F,color:BLACK}}}]}]},
 sections:[{properties:{page:{size:{width:12240,height:15840},margin:{top:1440,right:1440,bottom:1440,left:1440}}},
  footers:{default:new Footer({children:[new Paragraph({alignment:AlignmentType.CENTER,children:[new TextRun({children:[PageNumber.CURRENT],font:F,size:SZ,color:BLACK})]})]})},
  children:C}]});
Packer.toBuffer(doc).then(b=>{fs.writeFileSync('report/Final_Report.docx',b);console.log('ok')});

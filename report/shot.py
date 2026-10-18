from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b=p.chromium.launch(channel="chrome")
    pg=b.new_page(viewport={'width':1400,'height':1000},device_scale_factor=2)
    pg.goto('http://localhost:8000/index.html?r=2',wait_until='networkidle')
    pg.wait_for_timeout(3000)
    pg.add_style_tag(content='.site-nav{display:none!important}')
    t=pg.query_selector('.rumor-tiles-toggle')
    if t: t.click(); pg.wait_for_timeout(1500)
    pg.mouse.move(0,0)
    figs=pg.query_selector_all('figure')
    for i,f in enumerate(figs,1):
        f.scroll_into_view_if_needed(); pg.mouse.move(0,0); pg.wait_for_timeout(1200)
        f.screenshot(path=f'report/img/fig{i}.png')
    pg.evaluate("window.scrollTo(0,0)")
    pg.wait_for_timeout(500)
    pg.screenshot(path='report/img/hero.png',clip={'x':0,'y':0,'width':1400,'height':420})
    b.close()

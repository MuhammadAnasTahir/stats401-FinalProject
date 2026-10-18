(() => {
    const nav = document.querySelector('.site-nav');
    const mainList = document.querySelector('.site-nav-main');
    const subList = document.getElementById('site-nav-sub');
    if (!nav || !mainList || !subList) return;

    // Views listed in the second row while the reader is inside the matching section.
    const subSections = {
        visualizations: [
            ['market-composition', 'Market Composition'],
            ['transfer-flows', 'Transfer Flows'],
            ['geographic-flows', 'Geographic Flows'],
        ],
        rumours: [
            ['rumour-highlights-heading', 'Most-Covered Transfers'],
            ['rumour-boxplot-heading', 'Intensity and Outcomes'],
            ['rumour-stream-heading', 'Volume and Tone'],
        ],
    };

    const mainLinks = [...mainList.querySelectorAll('a[href^="#"]')];
    const mainTargets = mainLinks
        .map(link => ({ link, id: link.getAttribute('href').slice(1), el: document.getElementById(link.getAttribute('href').slice(1)) }))
        .filter(item => item.el);

    let shownGroup = null;
    let subTargets = [];

    function renderSub(groupId) {
        if (groupId === shownGroup) return;
        shownGroup = groupId;
        subList.textContent = '';
        subTargets = [];
        const items = subSections[groupId];
        if (!items) { subList.hidden = true; return; }
        items.forEach(([id, label]) => {
            const el = document.getElementById(id);
            if (!el) return;
            const li = document.createElement('li');
            const link = document.createElement('a');
            link.href = `#${id}`;
            link.textContent = label;
            li.appendChild(link);
            subList.appendChild(li);
            subTargets.push({ link, el });
        });
        subList.hidden = subTargets.length === 0;
    }

    // Keep the highlighted item visible inside a horizontally scrolling row (phones),
    // without moving the page itself.
    function centerInRow(link, row) {
        if (row.scrollWidth <= row.clientWidth) return;
        const target = link.offsetLeft - (row.clientWidth - link.offsetWidth) / 2;
        row.scrollLeft = Math.max(0, target);
    }

    function mark(links, current) {
        links.forEach(link => { link.classList.remove('is-current'); link.removeAttribute('aria-current'); });
        if (current) { current.classList.add('is-current'); current.setAttribute('aria-current', 'location'); }
    }

    function update() {
        // A section counts as current once its top passes just below the sticky bar; this matches
        // the page's scroll-padding so a jumped-to section is always the highlighted one.
        const offset = (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 104) + 24;
        let current = null;
        mainTargets.forEach(item => { if (item.el.getBoundingClientRect().top <= offset) current = item; });
        mark(mainLinks, current && current.link);
        renderSub(current ? current.id : null);
        let currentSub = null;
        subTargets.forEach(item => { if (item.el.getBoundingClientRect().top <= offset) currentSub = item; });
        mark(subTargets.map(item => item.link), currentSub && currentSub.link);
        if (current) centerInRow(current.link, mainList);
        if (currentSub) centerInRow(currentSub.link, subList);
    }


    // Touch devices have no mouse-leave: tapping outside a chart mark closes any open tooltip.
    document.addEventListener('touchstart', event => {
        if (event.target.closest('svg, .rumor-tile')) return;
        document.querySelectorAll('.treemap-tooltip.is-visible, .flow-tooltip.is-visible, .performance-tooltip.is-visible, .market-trend-tooltip.is-visible')
            .forEach(tip => tip.classList.remove('is-visible'));
    }, { passive: true });


    // Wide screens: the signposts sit in the left margin, centred on the first line of their heading.
    const wide = window.matchMedia('(min-width: 92rem)');
    function alignSignposts() {
        document.querySelectorAll('.story-step').forEach(step => {
            const heading = step.nextElementSibling;
            if (!wide.matches || !heading) { step.style.top = ''; return; }
            const style = getComputedStyle(heading);
            const size = parseFloat(style.fontSize);
            const line = parseFloat(style.lineHeight) || size * 1.2;
            step.style.top = `${heading.offsetTop + (line - step.offsetHeight) / 2}px`;
        });
    }
    alignSignposts();
    window.addEventListener('resize', alignSignposts);
    window.addEventListener('load', alignSignposts);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(alignSignposts);

    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
})();

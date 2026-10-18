/* One deliberately small state store: every chart reads the same season and league. */
window.TransferMarketState = (() => {
    const state = { season: null, league: null, clubId: null, clubName: null, position: 'all', feeStatus: 'all', playing: false };
    const listeners = new Set();
    let timer = null;
    const emit = () => listeners.forEach(listener => listener({ ...state }));
    return {
        get: () => ({ ...state }),
        set(next) { Object.assign(state, next); emit(); },
        subscribe(listener) { listeners.add(listener); listener({ ...state }); return () => listeners.delete(listener); },
        play(seasons) {
            if (timer !== null) { this.stop(); return; }
            const ordered = [...seasons].sort((a, b) => a - b);
            const advance = () => {
                const index = ordered.indexOf(state.season);
                const nextIndex = index < 0 || index >= ordered.length - 1 ? 0 : index + 1;
                state.season = ordered[nextIndex];
                state.playing = true;
                emit();
                timer = window.setTimeout(advance, 1500);
            };
            state.playing = true;
            emit();
            timer = window.setTimeout(advance, 0);
        },
        stop() { if (timer !== null) window.clearTimeout(timer); timer = null; state.playing = false; emit(); }
    };
})();

(() => {
    const summary = document.querySelector('#selection-summary');
    const clear = document.querySelector('#clear-selections');
    if (!summary || !clear || !window.TransferMarketState) return;
    const formatSeason = season => season ? `${season}/${String(season + 1).slice(-2)}` : 'Latest season';
    window.TransferMarketState.subscribe(selection => {
        const parts = [
            `Season: ${formatSeason(selection.season)}`,
            selection.league || 'All leagues',
            selection.clubName || 'All clubs',
            selection.position === 'all' ? 'All positions' : selection.position,
            selection.feeStatus === 'all' ? 'All fee statuses' : selection.feeStatus,
        ];
        summary.textContent = parts.join(' | ');
    });
    clear.addEventListener('click', () => window.TransferMarketState.set({ league: null, clubId: null, clubName: null, position: 'all', feeStatus: 'all' }));
})();

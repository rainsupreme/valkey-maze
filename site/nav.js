// ── Site nav: floating hex strip ────────────────────────────
//
// Injects a compact puzzle-switcher strip at the top center of every
// page. Add new puzzles to PUZZLES; the entry matching the current
// path is highlighted.
//
// Hrefs are relative (every puzzle page lives one level below the
// site root) so the strip works both locally and on GitHub Pages
// project sites, where the site root is /<repo>/ not /.

export const PUZZLES = [
    { id: 'maze', name: 'Maze', dir: 'game' },
    { id: 'rikudo', name: 'Rikudo', dir: 'rikudo' },
];

/**
 * Build and attach the nav element (idempotent).
 * @param {string} [currentPath=location.pathname]
 * @returns {HTMLElement} the nav element
 */
export function initNav(currentPath = location.pathname) {
    const existing = document.getElementById('site-nav');
    if (existing) return existing;

    const nav = document.createElement('nav');
    nav.id = 'site-nav';
    nav.setAttribute('aria-label', 'Puzzles');

    for (const puzzle of PUZZLES) {
        const a = document.createElement('a');
        a.className = 'nav-hex';
        a.textContent = puzzle.name;
        a.href = `../${puzzle.dir}/`;
        if (currentPath.includes(`/${puzzle.dir}/`) || currentPath.endsWith(`/${puzzle.dir}`)) {
            a.classList.add('nav-current');
            a.setAttribute('aria-current', 'page');
        }
        nav.appendChild(a);
    }

    document.body.prepend(nav);
    return nav;
}

initNav();

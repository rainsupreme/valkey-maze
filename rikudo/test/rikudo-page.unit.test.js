// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Page-level tests for the Rikudo controller: board construction,
 * edge drawing/erasing, forced-number rendering, win banner, reset,
 * persistence, and the solution() cheat.
 */

let Rikudo;

beforeEach(async () => {
    document.body.innerHTML = `
        <div id="board-container"></div>
        <div id="win-banner" class="hidden"></div>
        <button id="reset-btn"></button>
    `;
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    const mod = await import('../rikudo.js');
    Rikudo = mod.Rikudo;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.solution;
});

function solutionKeys() {
    return Rikudo.puzzle.solutionPath.map(([q, r]) => `${q},${r}`);
}

async function logic() {
    return import('../rikudo.logic.js');
}

/** Draw solution edges [from, to) through the controller. */
async function drawRun(fromIdx, toIdx) {
    const { addEdge } = await logic();
    const keys = solutionKeys();
    for (let i = fromIdx; i < toIdx; i++) {
        Rikudo._apply(addEdge(Rikudo.board, Rikudo.edges, keys[i], keys[i + 1]));
    }
}

describe('Rikudo page', () => {
    it('builds one polygon per cell plus the hole', () => {
        const polys = document.querySelectorAll('#rikudo-board polygon');
        expect(polys.length).toBe(Rikudo.puzzle.cells.length + 1); // + hole
        expect(document.querySelectorAll('#rikudo-board .hole').length).toBe(1);
    });

    it('drawing an edge renders a line and its erase hit-target', async () => {
        await drawRun(0, 1);
        expect(document.querySelectorAll('#rikudo-board .edge-line').length).toBe(1);
        expect(document.querySelectorAll('#rikudo-board .edge-hit').length).toBe(1);
        expect(Rikudo.edges.size).toBe(1);
    });

    it('tapping an edge hit-target erases the edge', async () => {
        await drawRun(0, 2);
        const hit = document.querySelector('#rikudo-board .edge-hit');
        hit.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
        expect(Rikudo.edges.size).toBe(1);
        expect(document.querySelectorAll('#rikudo-board .edge-line').length).toBe(1);
    });

    it('forced numbers render; ambiguous fragments stay blank', async () => {
        const keys = solutionKeys();
        // Run from the 1-clue: forced (boundary pins the orientation)
        await drawRun(0, 2);
        const textOf = (key) => [...Rikudo.numberElements.entries()]
            .find(([k]) => k === key)[1].textContent;
        expect(textOf(keys[1])).toBe('2');
        expect(textOf(keys[2])).toBe('3');
    });

    it('determined fragments get an arrowhead at the ascending end; wins clear them', async () => {
        await drawRun(0, 2); // anchored at the 1-clue -> determined
        expect(document.querySelectorAll('#rikudo-board .frag-arrow').length).toBe(1);
        await drawRun(2, solutionKeys().length - 1); // complete -> win hides arrows
        expect(document.querySelectorAll('#rikudo-board .frag-arrow').length).toBe(0);
    });

    it('completing the board out of order shows the win banner and wave', async () => {
        vi.useFakeTimers();
        const keys = solutionKeys();
        const n = keys.length;
        const mid = Math.floor(n / 2);
        await drawRun(mid, n - 1);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        await drawRun(0, mid);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
        vi.advanceTimersByTime(n * 45 + 500);
        expect(document.querySelectorAll('#rikudo-board .cell.win-lit').length).toBe(n);
        vi.useRealTimers();
    });

    it('reset clears edges and the win state', async () => {
        await drawRun(0, solutionKeys().length - 1);
        document.getElementById('reset-btn').click();
        expect(Rikudo.edges.size).toBe(0);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('.win-lit').length).toBe(0);
        expect(document.querySelectorAll('#rikudo-board .edge-line').length).toBe(0);
    });

    it('progress persists across a reload (same day)', async () => {
        await drawRun(0, 4);
        expect(Rikudo.edges.size).toBe(4);
        vi.resetModules();
        const mod = await import('../rikudo.js');
        expect(mod.Rikudo.edges.size).toBe(4);
    });

    it('a corrupt save is discarded', async () => {
        localStorage.setItem('rikudo-state', JSON.stringify({
            dateKey: Rikudo.dateKey,
            edges: ['garbage|nonsense'],
        }));
        vi.resetModules();
        const mod = await import('../rikudo.js');
        expect(mod.Rikudo.edges.size).toBe(0);
    });

    it('window.solution() toggles the cheat overlay', () => {
        expect(window.solution()).toBe(true);
        const overlay = document.querySelector('#rikudo-board .solution-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.getAttribute('points').split(' ').length)
            .toBe(Rikudo.puzzle.cells.length);
        expect(window.solution()).toBe(false);
        expect(document.querySelector('.solution-overlay')).toBeNull();
    });
});

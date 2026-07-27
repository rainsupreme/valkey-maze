// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let Signposts;

beforeEach(async () => {
    document.body.innerHTML = `
        <div id="board-container"></div>
        <div id="win-banner" class="hidden"></div>
        <button id="reset-btn"></button>
    `;
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    const mod = await import('../signposts.js');
    Signposts = mod.Signposts;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.solution;
});

function solutionKeys() {
    return Signposts.puzzle.solutionPath.map(([q, r]) => `${q},${r}`);
}

function linkSolution(fromIdx, toIdx) {
    const keys = solutionKeys();
    for (let i = fromIdx; i < toIdx; i++) {
        Signposts._select(keys[i]);
        Signposts._tap(keys[i + 1]);
    }
}

describe('Signposts page', () => {
    it('builds cells, arrows for all but the goal, and one goal marker', () => {
        const cells = document.querySelectorAll('#signposts-board .cell');
        expect(cells.length).toBe(Signposts.puzzle.cells.length);
        expect(document.querySelectorAll('#signposts-board .arrow').length)
            .toBe(Signposts.puzzle.cells.length - 1);
        expect(document.querySelectorAll('#signposts-board .goal-marker').length).toBe(1);
        expect(document.querySelectorAll('#signposts-board .hole').length).toBe(1);
    });

    it('arrows are centered in their cells', () => {
        for (const arrow of document.querySelectorAll('#signposts-board .arrow')) {
            // transform is translate(x,y) rotate(deg) with y the cell
            // center -- no vertical offset term
            expect(arrow.getAttribute('transform')).toMatch(
                /^translate\(-?[\d.]+,-?[\d.]+\) rotate\(-?[\d.]+\)$/);
        }
    });

    it('selecting a cell highlights its legal targets', async () => {
        Signposts._select(solutionKeys()[0]);
        const lit = document.querySelectorAll('#signposts-board .cell.candidate');
        expect(lit.length).toBeGreaterThan(0);
        const { createBoard, canLink } = await import('../signposts.logic.js');
        const board = createBoard(Signposts.puzzle);
        for (const el of lit) {
            expect(canLink(board, Signposts.links, solutionKeys()[0], el.dataset.key)).toBe(true);
        }
        expect([...lit].map(el => el.dataset.key)).toContain(solutionKeys()[1]);
    });

    it('tapping a target links it and selection follows', () => {
        const keys = solutionKeys();
        Signposts._tap(keys[0]);
        Signposts._tap(keys[1]);
        expect(Signposts.links.get(keys[0])).toBe(keys[1]);
        expect(Signposts.selected).toBe(keys[1]);
        expect(document.querySelectorAll('#signposts-board .link-line').length).toBe(1);
    });

    it('tapping the current target again disconnects', () => {
        const keys = solutionKeys();
        Signposts._tap(keys[0]);
        Signposts._tap(keys[1]);   // link 0 -> 1
        Signposts._tap(keys[0]);   // select 0 again
        Signposts._tap(keys[1]);   // tap its target -> unlink
        expect(Signposts.links.size).toBe(0);
        expect(document.querySelectorAll('#signposts-board .link-line').length).toBe(0);
    });

    it('out-of-order fragments show relative labels, then real numbers on merge', () => {
        const keys = solutionKeys();
        // Build a mid-board fragment away from the 1-clue anchor
        const n = keys.length;
        const mid = Math.floor(n / 2);
        linkSolution(mid, mid + 2);
        const texts = [...document.querySelectorAll('#signposts-board .num.relative-label')]
            .map(t => t.textContent);
        // Labels appear unless the fragment happened to contain a clue
        if (texts.length > 0) {
            expect(texts.some(t => /^[a-z]$/.test(t))).toBe(true);
            expect(texts.some(t => /^[a-z]\+\d+$/.test(t))).toBe(true);
        }
        // Join everything: labels disappear, numbers cover the board
        linkSolution(0, mid);
        linkSolution(mid + 2, n - 1);
        expect(document.querySelectorAll('#signposts-board .num.relative-label').length).toBe(0);
    });

    it('completing all links (in any order) shows the win banner', () => {
        const keys = solutionKeys();
        const n = keys.length;
        const mid = Math.floor(n / 2);
        linkSolution(mid, n - 1);   // back half first
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        linkSolution(0, mid);       // then the front, joining at mid
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
    });

    it('reset clears links, selection, and the win state', () => {
        linkSolution(0, solutionKeys().length - 1);
        document.getElementById('reset-btn').click();
        expect(Signposts.links.size).toBe(0);
        expect(Signposts.selected).toBeNull();
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('.win-lit').length).toBe(0);
        expect(document.querySelectorAll('#signposts-board .link-line').length).toBe(0);
    });

    it('progress persists across a reload (same day)', async () => {
        linkSolution(0, 4);
        const saved = Signposts.links.size;
        expect(saved).toBe(4);
        vi.resetModules();
        const mod = await import('../signposts.js');
        expect(mod.Signposts.links.size).toBe(saved);
    });

    it('window.solution() toggles the cheat overlay', () => {
        expect(window.solution()).toBe(true);
        const overlay = document.querySelector('#signposts-board .solution-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.getAttribute('points').split(' ').length)
            .toBe(Signposts.puzzle.cells.length);
        expect(window.solution()).toBe(false);
        expect(document.querySelector('.solution-overlay')).toBeNull();
    });
});

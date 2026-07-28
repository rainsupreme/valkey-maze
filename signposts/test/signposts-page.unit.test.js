// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let Signposts;

beforeEach(async () => {
    document.body.innerHTML = `
        <div id="board-container"></div>
        <div id="win-banner" class="hidden"></div>
        <button id="reset-btn"></button>
        <div id="difficulty-row">
            <button data-difficulty="easy">Easy</button>
            <button data-difficulty="medium">Medium</button>
            <button data-difficulty="hard">Hard</button>
        </div>
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
        // No lines drawn -- the source arrow dims and the target's
        // incoming dot disappears instead
        expect(Signposts.arrowElements.get(keys[0]).classList.contains('used')).toBe(true);
        expect(Signposts.dotElements.get(keys[1]).classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('#signposts-board .link-line').length).toBe(0);
    });

    it('tapping the current target again disconnects', () => {
        const keys = solutionKeys();
        Signposts._tap(keys[0]);
        Signposts._tap(keys[1]);   // link 0 -> 1
        Signposts._tap(keys[0]);   // select 0 again
        Signposts._tap(keys[1]);   // tap its target -> unlink
        expect(Signposts.links.size).toBe(0);
        expect(Signposts.arrowElements.get(keys[0]).classList.contains('used')).toBe(false);
        expect(Signposts.dotElements.get(keys[1]).classList.contains('hidden')).toBe(false);
    });

    it('incoming dots exist for every cell except the 1-cell', () => {
        expect(Signposts.dotElements.size).toBe(Signposts.puzzle.cells.length - 1);
        expect(Signposts.dotElements.has(Signposts.board.startKey)).toBe(false);
        // Fresh board: all dots visible
        expect(document.querySelectorAll('#signposts-board .incoming-dot:not(.hidden)').length)
            .toBe(Signposts.puzzle.cells.length - 1);
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

    it('the win fires once all numbers are forced -- before the last link', () => {
        const keys = solutionKeys();
        const n = keys.length;
        const mid = Math.floor(n / 2);
        linkSolution(mid, n - 1);   // back half first
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        linkSolution(0, mid - 1);   // front half; joining link never drawn
        expect(Signposts.links.size).toBe(n - 2);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
    });

    it('win wave flips arrows white and hides the dots', () => {
        vi.useFakeTimers();
        const keys = solutionKeys();
        linkSolution(0, keys.length - 1);
        vi.advanceTimersByTime(keys.length * 90 + 1000);
        // Every arrow-bearing cell's arrow is win-lit (goal cell has none)
        for (const [, arrow] of Signposts.arrowElements) {
            expect(arrow.classList.contains('win-lit')).toBe(true);
        }
        expect(document.querySelectorAll('#signposts-board .incoming-dot:not(.hidden)').length)
            .toBe(0);
        vi.useRealTimers();
    });

    it('reset clears links, selection, and the win state', () => {
        linkSolution(0, solutionKeys().length - 1);
        document.getElementById('reset-btn').click();
        expect(Signposts.links.size).toBe(0);
        expect(Signposts.selected).toBeNull();
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('.win-lit').length).toBe(0);
        // All dots visible again, no arrows dimmed
        expect(document.querySelectorAll('#signposts-board .incoming-dot:not(.hidden)').length)
            .toBe(Signposts.puzzle.cells.length - 1);
        expect(document.querySelectorAll('#signposts-board .arrow.used').length).toBe(0);
    });

    it('unanchored fragments get a per-fragment label color class', () => {
        const keys = solutionKeys();
        const n = keys.length;
        const mid = Math.floor(n / 2);
        linkSolution(mid, mid + 2);
        const labeled = [...document.querySelectorAll('#signposts-board .num.relative-label')];
        if (labeled.length > 0) {
            for (const t of labeled) {
                expect([...t.classList].some(c => /^frag-c\d$/.test(c))).toBe(true);
            }
        }
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

    it('defaults to easy: radius-2 board with corner endpoints', () => {
        expect(Signposts.difficulty).toBe('easy');
        expect(Signposts.puzzle.radius).toBe(2);
        expect(Signposts.puzzle.cells.length).toBe(18);
        expect(document.querySelector('[data-difficulty="easy"]').classList.contains('active')).toBe(true);
    });

    it('switching difficulty rebuilds the board and persists the choice', async () => {
        Signposts.setDifficulty('hard');
        expect(Signposts.puzzle.radius).toBe(3);
        expect(document.querySelectorAll('#signposts-board .cell').length).toBe(36);
        expect(document.querySelector('[data-difficulty="hard"]').classList.contains('active')).toBe(true);
        // Only one board in the DOM after the rebuild
        expect(document.querySelectorAll('#signposts-board').length).toBe(1);
        // Choice survives a reload
        vi.resetModules();
        const mod = await import('../signposts.js');
        expect(mod.Signposts.difficulty).toBe('hard');
    });

    it('progress is saved per difficulty', () => {
        const keys = solutionKeys();
        Signposts._tap(keys[0]);
        Signposts._tap(keys[1]);           // one link on easy
        expect(Signposts.links.size).toBe(1);
        Signposts.setDifficulty('medium'); // fresh board, no links
        expect(Signposts.links.size).toBe(0);
        Signposts.setDifficulty('easy');   // easy progress restored
        expect(Signposts.links.size).toBe(1);
    });

    it('easy endpoints sit in opposite corners', () => {
        const first = Signposts.puzzle.solutionPath[0];
        const last = Signposts.puzzle.solutionPath[Signposts.puzzle.solutionPath.length - 1];
        expect(first[0] + last[0]).toBe(0);
        expect(first[1] + last[1]).toBe(0);
    });
});
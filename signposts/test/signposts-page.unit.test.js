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

describe('Signposts page', () => {
    it('builds cells, arrows for all but the goal, and one goal marker', () => {
        const cells = document.querySelectorAll('#signposts-board .cell');
        expect(cells.length).toBe(Signposts.puzzle.cells.length);
        expect(document.querySelectorAll('#signposts-board .arrow').length)
            .toBe(Signposts.puzzle.cells.length - 1);
        expect(document.querySelectorAll('#signposts-board .goal-marker').length).toBe(1);
        expect(document.querySelectorAll('#signposts-board .hole').length).toBe(1);
    });

    it('highlights candidate cells for the next number', async () => {
        const lit = document.querySelectorAll('#signposts-board .cell.candidate');
        expect(lit.length).toBeGreaterThan(0);
        // Every highlighted cell is a genuinely valid extension
        const { createBoard, canExtend } = await import('../signposts.logic.js');
        const board = createBoard(Signposts.puzzle);
        for (const el of lit) {
            expect(canExtend(board, Signposts.path, el.dataset.key)).toBe(true);
        }
        expect([...lit].map(el => el.dataset.key)).toContain(solutionKeys()[1]);
    });

    it('drawing the full solution shows the win banner', () => {
        for (const key of solutionKeys().slice(1)) {
            Signposts._apply({ path: [...Signposts.path, key], changed: true });
        }
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
    });

    it('reset returns to cell 1 and clears the win state', () => {
        for (const key of solutionKeys().slice(1)) {
            Signposts._apply({ path: [...Signposts.path, key], changed: true });
        }
        document.getElementById('reset-btn').click();
        expect(Signposts.path.length).toBe(1);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('.win-lit').length).toBe(0);
    });

    it('progress persists across a reload (same day)', async () => {
        for (const key of solutionKeys().slice(1, 5)) {
            Signposts._apply({ path: [...Signposts.path, key], changed: true });
        }
        const saved = Signposts.path.length;
        vi.resetModules();
        const mod = await import('../signposts.js');
        expect(mod.Signposts.path.length).toBe(saved);
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

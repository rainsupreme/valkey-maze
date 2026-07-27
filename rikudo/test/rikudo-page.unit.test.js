// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Page-level tests for the Rikudo controller: board construction,
 * number rendering, win banner, reset, and the solution() cheat.
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

describe('Rikudo page', () => {
    it('builds one polygon per cell plus the hole', () => {
        const polys = document.querySelectorAll('#rikudo-board polygon');
        expect(polys.length).toBe(Rikudo.puzzle.cells.length + 1); // + hole
        expect(document.querySelectorAll('#rikudo-board .hole').length).toBe(1);
    });

    it('shows clue numbers and starts the path at clue 1', () => {
        const clueTexts = [...document.querySelectorAll('#rikudo-board .clue-num')]
            .map(t => Number(t.textContent));
        expect(clueTexts).toContain(1);
        expect(clueTexts.length).toBe(Rikudo.puzzle.clues.length);
        expect(Rikudo.path.length).toBe(1);
        expect(Rikudo.board.clueByKey.get(Rikudo.path[0])).toBe(1);
    });

    it('drawing the full solution shows the win banner', () => {
        const keys = solutionKeys();
        for (const key of keys.slice(1)) {
            Rikudo._apply({ path: [...Rikudo.path, key], changed: true });
        }
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
    });

    it('reset returns the path to just cell 1 and hides the banner', () => {
        const keys = solutionKeys();
        for (const key of keys.slice(1)) {
            Rikudo._apply({ path: [...Rikudo.path, key], changed: true });
        }
        document.getElementById('reset-btn').click();
        expect(Rikudo.path.length).toBe(1);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
    });

    it('progress persists across a reload (same day)', async () => {
        const keys = solutionKeys();
        for (const key of keys.slice(1, 6)) {
            Rikudo._apply({ path: [...Rikudo.path, key], changed: true });
        }
        const saved = Rikudo.path.length;

        vi.resetModules();
        const mod = await import('../rikudo.js');
        expect(mod.Rikudo.path.length).toBe(saved);
    });

    it('window.solution() toggles the cheat overlay', () => {
        expect(typeof window.solution).toBe('function');
        expect(window.solution()).toBe(true);
        const overlay = document.querySelector('#rikudo-board .solution-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.getAttribute('points').split(' ').length)
            .toBe(Rikudo.puzzle.cells.length);
        expect(window.solution()).toBe(false);
        expect(document.querySelector('#rikudo-board .solution-overlay')).toBeNull();
    });
});

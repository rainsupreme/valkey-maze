// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MARK } from '../minesweeper.logic.js';

let Minesweeper;

beforeEach(async () => {
    document.body.innerHTML = `
        <div id="board-container"></div>
        <span id="mine-counter"></span>
        <div id="check-note" class="hidden"></div>
        <div id="win-banner" class="hidden"></div>
        <button id="reset-btn"></button>
    `;
    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
    const mod = await import('../minesweeper.js');
    Minesweeper = mod.Minesweeper;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.solution;
});

function mineKeys() {
    return Minesweeper.puzzle.solutionMines.map(([q, r]) => `${q},${r}`);
}

describe('Minesweeper page', () => {
    it('builds the board: clue numbers visible, unknowns blank, hole present', () => {
        expect(document.querySelectorAll('#minesweeper-board .cell').length)
            .toBe(Minesweeper.puzzle.cells.length);
        expect(document.querySelectorAll('#minesweeper-board .clue-num').length)
            .toBe(Minesweeper.puzzle.clues.length);
        expect(document.querySelectorAll('#minesweeper-board .mark.is-mine').length).toBe(0);
        expect(document.querySelectorAll('#minesweeper-board .hole').length).toBe(1);
    });

    it('tapping an unknown cell cycles its mark and updates the counter', () => {
        const key = mineKeys()[0];
        const cell = document.querySelector(`polygon[data-key="${key}"]`);

        cell.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(Minesweeper.marks.get(key)).toBe(MARK.MINE);
        expect(document.getElementById('mine-counter').textContent).toContain('1 / 10');

        cell.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(Minesweeper.marks.get(key)).toBe(MARK.SAFE);

        cell.dispatchEvent(new Event('pointerdown', { bubbles: true }));
        expect(Minesweeper.marks.has(key)).toBe(false);
    });

    it('flagging exactly the mines shows the win banner', () => {
        for (const key of mineKeys()) {
            Minesweeper._apply({ marks: new Map(Minesweeper.marks).set(key, MARK.MINE), changed: true });
        }
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('check-note').classList.contains('hidden')).toBe(true);
    });

    it('no completion feedback while the board is only partially marked', () => {
        // Wrong flag early on: silence until the board is full
        const wrong = Minesweeper.board.cellKeys.find(k =>
            !Minesweeper.board.clueByKey.has(k) && !Minesweeper.board.mineSet.has(k));
        Minesweeper._apply({ marks: new Map(Minesweeper.marks).set(wrong, MARK.MINE), changed: true });
        expect(document.getElementById('check-note').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('#minesweeper-board .cell.violated').length).toBe(0);
    });

    it('a complete-but-wrong board highlights the disagreeing clues', () => {
        // Fill the whole board with one mine/safe swap
        const mines = new Set(mineKeys());
        const wrongSafe = mineKeys()[0];                        // a real mine marked safe
        const wrongMine = Minesweeper.board.cellKeys.find(k => // a safe cell flagged
            !Minesweeper.board.clueByKey.has(k) && !mines.has(k));
        const marks = new Map();
        for (const k of Minesweeper.board.cellKeys) {
            if (Minesweeper.board.clueByKey.has(k)) continue;
            const shouldFlag = mines.has(k) ? k !== wrongSafe : k === wrongMine;
            marks.set(k, shouldFlag ? MARK.MINE : MARK.SAFE);
        }
        Minesweeper._apply({ marks, changed: true });

        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        const note = document.getElementById('check-note');
        expect(note.classList.contains('hidden')).toBe(false);
        expect(note.textContent).toMatch(/highlighted clue/);
        expect(document.querySelectorAll('#minesweeper-board .cell.violated').length)
            .toBeGreaterThan(0);

        // Fixing the swap wins and clears the feedback
        const fixed = new Map(marks);
        fixed.set(wrongSafe, MARK.MINE);
        fixed.set(wrongMine, MARK.SAFE);
        Minesweeper._apply({ marks: fixed, changed: true });
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(false);
        expect(note.classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('#minesweeper-board .cell.violated').length).toBe(0);
    });

    it('reset clears marks, banner, and win wave', () => {
        for (const key of mineKeys()) {
            Minesweeper._apply({ marks: new Map(Minesweeper.marks).set(key, MARK.MINE), changed: true });
        }
        document.getElementById('reset-btn').click();
        expect(Minesweeper.marks.size).toBe(0);
        expect(document.getElementById('win-banner').classList.contains('hidden')).toBe(true);
        expect(document.querySelectorAll('.win-lit').length).toBe(0);
    });

    it('marks persist across a reload (same day)', async () => {
        const key = mineKeys()[0];
        Minesweeper._apply({ marks: new Map().set(key, MARK.MINE), changed: true });

        vi.resetModules();
        const mod = await import('../minesweeper.js');
        expect(mod.Minesweeper.marks.get(key)).toBe(MARK.MINE);
    });

    it('window.solution() toggles mine outlines', () => {
        expect(window.solution()).toBe(true);
        const overlay = document.querySelector('#minesweeper-board .solution-overlay');
        expect(overlay).not.toBeNull();
        expect(overlay.querySelectorAll('polygon').length).toBe(Minesweeper.puzzle.mineCount);
        expect(window.solution()).toBe(false);
        expect(document.querySelector('.solution-overlay')).toBeNull();
    });
});

// ── Rikudo path-drawing logic (pure, no DOM) ────────────────
//
// The player draws a single path from clue 1 through every cell;
// path[i] holds number i+1. Clue cells constrain the path: number k
// must land on k's clue cell (if k has one), and clue cells accept
// only their own number.

import { HEX_DIRECTIONS } from '../core/hex-cell-grid.js';

/**
 * Build the immutable lookup state for a puzzle.
 * @param {object} puzzle - from generateRikudo()
 */
export function createBoard(puzzle) {
    const cellKeys = puzzle.cells.map(({ q, r }) => `${q},${r}`);
    const cellSet = new Set(cellKeys);

    const neighbors = new Map();
    for (const { q, r } of puzzle.cells) {
        const adj = [];
        for (const [dq, dr] of HEX_DIRECTIONS) {
            const nk = `${q + dq},${r + dr}`;
            if (cellSet.has(nk)) adj.push(nk);
        }
        neighbors.set(`${q},${r}`, adj);
    }

    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const clueByNumber = new Map(puzzle.clues.map(c => [c.value, `${c.q},${c.r}`]));

    return {
        total: puzzle.cells.length,
        neighbors,
        clueByKey,
        clueByNumber,
        startKey: clueByNumber.get(1),
    };
}

/** A fresh path: just the cell holding 1. */
export function initialPath(board) {
    return [board.startKey];
}

/**
 * Whether the path may extend into `cellKey` as the next number.
 */
export function canExtend(board, path, cellKey) {
    if (path.length >= board.total) return false;
    if (path.includes(cellKey)) return false;
    if (!(board.neighbors.get(path[path.length - 1]) || []).includes(cellKey)) return false;

    const nextNumber = path.length + 1;
    const clueCell = board.clueByNumber.get(nextNumber);
    if (clueCell !== undefined) {
        // The next number has a clue: only that cell is acceptable
        return cellKey === clueCell;
    }
    // Cells holding some other clue are reserved for their own number
    return !board.clueByKey.has(cellKey);
}

/**
 * Apply a pointer/tap on `cellKey` to the path.
 *
 * - Cell already on the path -> truncate back to it (position 1 is
 *   never removed)
 * - Valid next cell -> extend
 * - Anything else -> no change
 *
 * @returns {{ path: string[], changed: boolean }}
 */
export function applyCell(board, path, cellKey) {
    const idx = path.indexOf(cellKey);
    if (idx !== -1) {
        if (idx === path.length - 1 && path.length > 1) {
            // Tapping the current end backtracks one step
            return { path: path.slice(0, -1), changed: true };
        }
        if (idx < path.length - 1) {
            return { path: path.slice(0, idx + 1), changed: true };
        }
        return { path, changed: false };
    }
    if (canExtend(board, path, cellKey)) {
        return { path: [...path, cellKey], changed: true };
    }
    return { path, changed: false };
}

/**
 * Apply a drag movement onto `cellKey`: like applyCell, but dragging
 * onto the previous cell backtracks (drag-to-undo, matching the maze).
 */
export function applyDrag(board, path, cellKey) {
    if (path.length > 1 && cellKey === path[path.length - 2]) {
        return { path: path.slice(0, -1), changed: true };
    }
    if (path.includes(cellKey)) {
        return { path, changed: false }; // dragging across the path: ignore
    }
    if (canExtend(board, path, cellKey)) {
        return { path: [...path, cellKey], changed: true };
    }
    return { path, changed: false };
}

/** The puzzle is solved when the path covers every cell. */
export function isWin(board, path) {
    return path.length === board.total;
}

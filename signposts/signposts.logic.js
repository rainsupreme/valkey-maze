// ── Signposts interaction logic (pure, no DOM) ──────────────
//
// The player builds the number sequence 1..N by tapping cells: from
// the current end, any unvisited cell along the end's arrow ray is a
// valid next cell (subject to clue consistency). Tapping a cell
// already on the path truncates back to it.

import { buildHexCellGrid } from '../core/hex-cell-grid.js';
import { buildRays } from '../core/signposts.js';

/**
 * Build the immutable lookup state for a puzzle.
 * @param {object} puzzle - from generateSignposts()
 */
export function createBoard(puzzle) {
    const grid = buildHexCellGrid(puzzle.radius, { centerHole: true });
    const { rays } = buildRays(grid);

    const arrowByKey = new Map(puzzle.arrows.map(a => [`${a.q},${a.r}`, a.dir]));
    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const clueByNumber = new Map(puzzle.clues.map(c => [c.value, `${c.q},${c.r}`]));

    return {
        total: puzzle.cells.length,
        rays,
        arrowByKey,
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
 * Cells the path may extend into next: the unvisited cells along the
 * end's arrow ray, filtered by clue consistency.
 * @returns {string[]}
 */
export function candidates(board, path) {
    if (path.length >= board.total) return [];
    const end = path[path.length - 1];
    const dir = board.arrowByKey.get(end);
    if (dir === null || dir === undefined) return []; // goal cell has no arrow

    const nextNumber = path.length + 1;
    const clueCell = board.clueByNumber.get(nextNumber);

    return board.rays.get(end)[dir].filter(key => {
        if (path.includes(key)) return false;
        if (clueCell !== undefined) return key === clueCell;
        return !board.clueByKey.has(key);
    });
}

/** Whether `cellKey` is a valid next cell. */
export function canExtend(board, path, cellKey) {
    return candidates(board, path).includes(cellKey);
}

/**
 * Apply a tap on `cellKey` to the path.
 *
 * - Cell on the path -> truncate back to it (tapping the end
 *   backtracks one step; position 1 is never removed)
 * - Valid next cell -> extend
 * - Anything else -> no change
 *
 * @returns {{ path: string[], changed: boolean }}
 */
export function applyCell(board, path, cellKey) {
    const idx = path.indexOf(cellKey);
    if (idx !== -1) {
        if (idx === path.length - 1 && path.length > 1) {
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

/** The puzzle is solved when the sequence covers every cell. */
export function isWin(board, path) {
    return path.length === board.total;
}

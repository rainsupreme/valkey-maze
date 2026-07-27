// ── Minesweeper marking logic (pure, no DOM) ────────────────
//
// The player classifies unknown cells by tapping: each tap cycles
// unknown -> mine flag -> safe mark -> unknown. Clue cells are fixed.
// The puzzle is won when the flagged set exactly matches the mines
// (safe marks are an optional aid, not required for the win).

export const MARK = Object.freeze({ MINE: 'mine', SAFE: 'safe' });

/**
 * Build the immutable lookup state for a puzzle.
 * @param {object} puzzle - from generateMinesweeper()
 */
export function createBoard(puzzle) {
    return {
        mineCount: puzzle.mineCount,
        clueByKey: new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value])),
        mineSet: new Set(puzzle.solutionMines.map(([q, r]) => `${q},${r}`)),
        cellKeys: puzzle.cells.map(({ q, r }) => `${q},${r}`),
    };
}

/** A fresh marks state: nothing classified. */
export function initialMarks() {
    return new Map();
}

/**
 * Apply a tap on `cellKey`: cycle its mark. Clue cells never change.
 * @param {object} board
 * @param {Map<string, string>} marks - cellKey -> MARK.*
 * @returns {{ marks: Map<string, string>, changed: boolean }}
 */
export function cycleMark(board, marks, cellKey) {
    if (board.clueByKey.has(cellKey)) return { marks, changed: false };
    if (!board.cellKeys.includes(cellKey)) return { marks, changed: false };

    const next = new Map(marks);
    const current = marks.get(cellKey);
    if (current === undefined) next.set(cellKey, MARK.MINE);
    else if (current === MARK.MINE) next.set(cellKey, MARK.SAFE);
    else next.delete(cellKey);
    return { marks: next, changed: true };
}

/** Number of cells currently flagged as mines. */
export function flaggedCount(marks) {
    let n = 0;
    for (const v of marks.values()) {
        if (v === MARK.MINE) n += 1;
    }
    return n;
}

/**
 * Won when the flagged set exactly equals the mine set: every mine
 * flagged, nothing else flagged.
 */
export function isWin(board, marks) {
    let flagged = 0;
    for (const [key, v] of marks) {
        if (v !== MARK.MINE) continue;
        if (!board.mineSet.has(key)) return false;
        flagged += 1;
    }
    return flagged === board.mineSet.size;
}

/**
 * Validate a restored marks object (from persistence): entries must
 * be non-clue board cells with legal values.
 * @param {object} board
 * @param {any} raw - parsed JSON: { [key]: 'mine'|'safe' }
 * @returns {Map<string, string>|null}
 */
export function validateMarks(board, raw) {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const marks = new Map();
    for (const [key, value] of Object.entries(raw)) {
        if (!board.cellKeys.includes(key)) return null;
        if (board.clueByKey.has(key)) return null;
        if (value !== MARK.MINE && value !== MARK.SAFE) return null;
        marks.set(key, value);
    }
    return marks;
}

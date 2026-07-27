// ── Static hex Minesweeper generator ────────────────────────
//
// A logic-puzzle take on minesweeper: some safe cells are revealed
// up front as clues (count of mines among their 6 neighbors); the
// player must classify every remaining cell as mine or safe using
// deduction only. The total mine count is given.
//
// Generation guarantees no guessing: mines are placed randomly, all
// safe cells start revealed (trivially solvable), then clues are
// greedily hidden while a logic-only solver -- restricted to rules a
// human uses -- still solves the board.

import { buildHexCellGrid } from './hex-cell-grid.js';

const MAX_SOLVER_ITERATIONS = 200;

/**
 * Solve a static minesweeper board with human-style logic rules:
 *
 * 1. Saturation: a constraint needing 0 mines makes all its cells
 *    safe; one needing all its cells makes them all mines.
 * 2. Subset: if constraint A's cells are a subset of B's, B minus A
 *    is a derived constraint (the classic 1-2 pattern).
 * 3. The global mine count is a constraint over all unknown cells.
 *
 * @param {Map<string, string[]>} neighbors
 * @param {Map<string, number>} clueByKey - revealed cells (safe) -> value
 * @param {number} mineCount - total mines on the board
 * @param {string[]} allKeys - every cell key
 * @returns {{ solved: boolean, mines: Set<string>, safe: Set<string> }}
 *   mines/safe cover the cells the solver managed to classify
 *   (clue cells are classified safe from the start)
 */
export function solveLogically(neighbors, clueByKey, mineCount, allKeys) {
    const mines = new Set();
    const safe = new Set(clueByKey.keys());

    const undetermined = () => allKeys.filter(k => !mines.has(k) && !safe.has(k));

    for (let iter = 0; iter < MAX_SOLVER_ITERATIONS; iter++) {
        // Build active constraints: cells are undetermined, need = mines
        // still to find among them
        const constraints = [];
        for (const [key, value] of clueByKey) {
            const cells = [];
            let found = 0;
            for (const nk of neighbors.get(key) || []) {
                if (mines.has(nk)) found += 1;
                else if (!safe.has(nk)) cells.push(nk);
            }
            if (cells.length > 0) constraints.push({ cells, need: value - found });
        }
        const remaining = undetermined();
        if (remaining.length > 0) {
            constraints.push({ cells: remaining, need: mineCount - mines.size });
        }

        let progress = false;
        const markMine = (k) => { if (!mines.has(k)) { mines.add(k); progress = true; } };
        const markSafe = (k) => { if (!safe.has(k)) { safe.add(k); progress = true; } };

        // Rule 1: saturation
        for (const c of constraints) {
            if (c.need === 0) c.cells.forEach(markSafe);
            else if (c.need === c.cells.length) c.cells.forEach(markMine);
        }

        // Rule 2: subset (on the constraint list as built this round)
        if (!progress) {
            for (const a of constraints) {
                for (const b of constraints) {
                    if (a === b || a.cells.length >= b.cells.length) continue;
                    const bSet = new Set(b.cells);
                    if (!a.cells.every(k => bSet.has(k))) continue;
                    const diff = b.cells.filter(k => !a.cells.includes(k));
                    const diffNeed = b.need - a.need;
                    if (diffNeed === 0) diff.forEach(markSafe);
                    else if (diffNeed === diff.length) diff.forEach(markMine);
                }
            }
        }

        if (!progress) break;
    }

    return {
        solved: allKeys.every(k => mines.has(k) || safe.has(k)),
        mines,
        safe,
    };
}

/**
 * Generate a static hex minesweeper puzzle.
 *
 * @param {object} params
 * @param {number} [params.radius=3] - board radius (3 = 36 cells)
 * @param {number} [params.mineCount=10]
 * @param {{ next(): number, choice(arr: any[]): any }} params.prng
 * @returns {{ radius: number, holeCell: [number, number],
 *             cells: Array<{q: number, r: number}>,
 *             mineCount: number,
 *             clues: Array<{q: number, r: number, value: number}>,
 *             solutionMines: Array<[number, number]> }}
 *   clues are revealed safe cells (value = adjacent mines). The
 *   puzzle is guaranteed solvable by logic alone (rules above).
 */
export function generateMinesweeper({ radius = 3, mineCount = 10, prng }) {
    if (radius < 2) {
        throw new Error(`Invalid radius: ${radius}. Must be at least 2.`);
    }
    const grid = buildHexCellGrid(radius, { centerHole: true });
    const allKeys = [...grid.cells.keys()];
    if (mineCount < 1 || mineCount >= allKeys.length) {
        throw new Error(`Invalid mineCount: ${mineCount}. Must be in [1, ${allKeys.length - 1}].`);
    }

    const shuffled = (arr) => {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(prng.next() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };

    // ── Place mines ─────────────────────────────────────────
    const mineSet = new Set(shuffled(allKeys).slice(0, mineCount));

    const clueValue = (key) =>
        (grid.neighbors.get(key) || []).filter(nk => mineSet.has(nk)).length;

    // ── Start fully revealed, then greedily hide clues ──────
    const clueByKey = new Map(
        allKeys.filter(k => !mineSet.has(k)).map(k => [k, clueValue(k)])
    );

    for (const key of shuffled([...clueByKey.keys()])) {
        const value = clueByKey.get(key);
        clueByKey.delete(key);
        const { solved } = solveLogically(grid.neighbors, clueByKey, mineCount, allKeys);
        if (!solved) clueByKey.set(key, value);
    }

    const toCoord = (key) => {
        const c = grid.cells.get(key);
        return [c.q, c.r];
    };

    return {
        radius,
        holeCell: [0, 0],
        cells: allKeys.map(key => grid.cells.get(key)),
        mineCount,
        clues: [...clueByKey.entries()].map(([key, value]) => {
            const c = grid.cells.get(key);
            return { q: c.q, r: c.r, value };
        }),
        solutionMines: [...mineSet].map(toCoord),
    };
}

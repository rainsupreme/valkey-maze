// ── Rikudo generator ────────────────────────────────────────
//
// Rikudo: place numbers 1..N in a hex-cell board (with a logo hole in
// the center) so consecutive numbers occupy adjacent cells. A subset
// of numbers is pre-filled as clues; the solution is unique.
//
// Generation: carve a random Hamiltonian path over the cells, then
// greedily remove clues (keeping 1 and N) while a counting solver
// confirms the puzzle still has exactly one solution.

import { buildHexCellGrid } from './hex-cell-grid.js';

// Search budgets keep generation time bounded and deterministic.
const PATH_NODE_BUDGET = 500000;
const SOLVER_NODE_BUDGET = 200000;

/**
 * Find a random Hamiltonian path over the given cells.
 * Warnsdorff-style: prefer extending into cells with the fewest
 * remaining unvisited neighbors (ties broken randomly via prng),
 * with backtracking under a node budget.
 *
 * @returns {string[]|null} cell keys in path order, or null on budget
 */
function hamiltonianPath(cellKeys, neighbors, prng) {
    const total = cellKeys.length;
    let budget = PATH_NODE_BUDGET;

    function shuffled(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(prng.next() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    function extend(path, visited) {
        if (path.length === total) return true;
        if (--budget <= 0) return false;

        const current = path[path.length - 1];
        const candidates = shuffled((neighbors.get(current) || []).filter(k => !visited.has(k)));
        // Warnsdorff: fewest onward moves first (stable sort keeps random ties)
        candidates.sort((a, b) =>
            (neighbors.get(a) || []).filter(k => !visited.has(k)).length -
            (neighbors.get(b) || []).filter(k => !visited.has(k)).length
        );

        for (const next of candidates) {
            path.push(next);
            visited.add(next);
            if (extend(path, visited)) return true;
            path.pop();
            visited.delete(next);
        }
        return false;
    }

    for (const start of shuffled(cellKeys)) {
        if (budget <= 0) break;
        const path = [start];
        const visited = new Set([start]);
        if (extend(path, visited)) return path;
    }
    return null;
}

/**
 * Count solutions of a Rikudo puzzle, stopping at `cap`.
 *
 * @param {Map<string, string[]>} neighbors
 * @param {Map<string, number>} clues - cellKey -> number (must include 1)
 * @param {number} total - number of cells (highest number)
 * @param {number} [cap=2]
 * @returns {number} solution count (capped), or `cap` if the node
 *   budget is exhausted (treated as "not provably unique")
 */
export function countSolutions(neighbors, clues, total, cap = 2) {
    const clueByNumber = new Array(total + 1).fill(null);
    for (const [key, num] of clues) clueByNumber[num] = key;
    if (!clueByNumber[1]) {
        throw new Error('countSolutions requires 1 to be a clue');
    }

    let count = 0;
    let budget = SOLVER_NODE_BUDGET;

    function dfs(current, num, visited) {
        if (count >= cap || budget-- <= 0) return;
        if (num === total) {
            count += 1;
            return;
        }
        const next = num + 1;
        const target = clueByNumber[next];
        for (const nk of neighbors.get(current) || []) {
            if (visited.has(nk)) continue;
            if (target !== null) {
                if (nk !== target) continue;
            } else if (clues.has(nk)) {
                continue; // clue cells are reserved for their own number
            }
            visited.add(nk);
            dfs(nk, next, visited);
            visited.delete(nk);
            if (count >= cap) return;
        }
    }

    dfs(clueByNumber[1], 1, new Set([clueByNumber[1]]));
    return budget <= 0 && count < cap ? cap : count;
}

/**
 * Generate a Rikudo puzzle.
 *
 * @param {object} params
 * @param {number} [params.radius=3] - board radius (3 = classic 36 cells)
 * @param {{ next(): number, choice(arr: any[]): any }} params.prng
 * @returns {{ radius: number, holeCell: [number, number],
 *             cells: Array<{q: number, r: number}>,
 *             clues: Array<{q: number, r: number, value: number}>,
 *             solutionPath: Array<[number, number]> }}
 *   solutionPath[i] is the cell holding number i+1. clues always
 *   include 1 and the highest number; the solution is unique.
 */
export function generateRikudo({ radius = 3, prng }) {
    if (radius < 2) {
        throw new Error(`Invalid radius: ${radius}. Must be at least 2.`);
    }

    const grid = buildHexCellGrid(radius, { centerHole: true });
    const cellKeys = [...grid.cells.keys()];
    const total = cellKeys.length;

    const path = hamiltonianPath(cellKeys, grid.neighbors, prng);
    if (path === null) {
        throw new Error('Failed to find a Hamiltonian path within budget');
    }

    // Start with every cell as a clue, then greedily thin
    const clues = new Map(path.map((key, i) => [key, i + 1]));

    const removalOrder = [...path.slice(1, -1)]; // endpoints 1 and N stay
    for (let i = removalOrder.length - 1; i > 0; i--) {
        const j = Math.floor(prng.next() * (i + 1));
        [removalOrder[i], removalOrder[j]] = [removalOrder[j], removalOrder[i]];
    }

    for (const key of removalOrder) {
        const value = clues.get(key);
        clues.delete(key);
        if (countSolutions(grid.neighbors, clues, total) !== 1) {
            clues.set(key, value); // removal breaks uniqueness; keep it
        }
    }

    const toCoord = (key) => {
        const c = grid.cells.get(key);
        return [c.q, c.r];
    };

    return {
        radius,
        holeCell: [0, 0],
        cells: cellKeys.map(key => grid.cells.get(key)),
        clues: [...clues.entries()]
            .map(([key, value]) => {
                const c = grid.cells.get(key);
                return { q: c.q, r: c.r, value };
            })
            .sort((a, b) => a.value - b.value),
        solutionPath: path.map(toCoord),
    };
}

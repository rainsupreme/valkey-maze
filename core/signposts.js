// ── Signposts generator (hex) ───────────────────────────────
//
// Signposts on a hex board: every cell (except the last) carries an
// arrow pointing along one of the 6 hex directions. Number the cells
// 1..N so that each number's successor lies somewhere along its
// arrow's ray. The center hole (logo) blocks rays. A subset of
// numbers is pre-filled as clues; the solution is unique.
//
// Generation: find a random Hamiltonian path through the
// ray-visibility digraph (cell -> every cell visible along its 6
// rays), derive each cell's arrow from its successor's direction,
// then greedily remove clues while a counting solver confirms
// uniqueness.

import { buildHexCellGrid, HEX_DIRECTIONS } from './hex-cell-grid.js';

const PATH_NODE_BUDGET = 500000;
const SOLVER_NODE_BUDGET = 300000;

/**
 * All cells visible from `key` along direction `dir`, nearest first.
 * The center hole blocks the ray (it is not a cell and cannot be
 * seen past).
 */
function rayFrom(cells, radius, q, r, dir) {
    const [dq, dr] = HEX_DIRECTIONS[dir];
    const result = [];
    let cq = q + dq;
    let cr = r + dr;
    while (Math.max(Math.abs(cq), Math.abs(cr), Math.abs(cq + cr)) <= radius) {
        const key = `${cq},${cr}`;
        if (!cells.has(key)) break; // the hole blocks the ray
        result.push(key);
        cq += dq;
        cr += dr;
    }
    return result;
}

/**
 * Build the ray-visibility structure for a board.
 * @returns {{ rays: Map<string, string[][]>, successors: Map<string, string[]> }}
 *   rays: per cell, the 6 rays (arrays of cell keys, nearest first)
 *   successors: per cell, all visible cells (flattened)
 */
export function buildRays(grid) {
    const rays = new Map();
    const successors = new Map();
    for (const [key, { q, r }] of grid.cells) {
        const cellRays = [];
        const all = [];
        for (let dir = 0; dir < 6; dir++) {
            const ray = rayFrom(grid.cells, grid.radius, q, r, dir);
            cellRays.push(ray);
            all.push(...ray);
        }
        rays.set(key, cellRays);
        successors.set(key, all);
    }
    return { rays, successors };
}

/** Direction index (0-5) from cell a to cell b, or null if not ray-aligned. */
export function directionBetween(aKey, bKey) {
    const [aq, ar] = aKey.split(',').map(Number);
    const [bq, br] = bKey.split(',').map(Number);
    const dq = bq - aq;
    const dr = br - ar;
    for (let dir = 0; dir < 6; dir++) {
        const [uq, ur] = HEX_DIRECTIONS[dir];
        // (dq,dr) must be a positive integer multiple of (uq,ur)
        const steps = uq !== 0 ? dq / uq : dr / ur;
        if (Number.isInteger(steps) && steps > 0 && dq === uq * steps && dr === ur * steps) {
            return dir;
        }
    }
    return null;
}

/**
 * Random Hamiltonian path through the ray-visibility digraph.
 * @returns {string[]|null}
 */
function sequencePath(cellKeys, successors, prng) {
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
        const candidates = shuffled((successors.get(current) || []).filter(k => !visited.has(k)));
        // Prefer candidates with few onward moves (Warnsdorff)
        candidates.sort((a, b) =>
            (successors.get(a) || []).filter(k => !visited.has(k)).length -
            (successors.get(b) || []).filter(k => !visited.has(k)).length
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
 * Count solutions of a Signposts puzzle, stopping at `cap`.
 *
 * @param {Map<string, string[][]>} rays - from buildRays()
 * @param {Map<string, number>} arrowByKey - cell -> direction 0-5
 *   (the final cell is absent)
 * @param {Map<string, number>} clues - cellKey -> number (must include 1)
 * @param {number} total
 * @param {number} [cap=2]
 * @returns {number} count (capped); `cap` if the budget is exhausted
 */
export function countSolutions(rays, arrowByKey, clues, total, cap = 2) {
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
        const dir = arrowByKey.get(current);
        if (dir === undefined) return; // only the final number may land on the goal cell
        for (const nk of rays.get(current)[dir]) {
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
 * Generate a Signposts puzzle.
 *
 * @param {object} params
 * @param {number} [params.radius=3] - board radius (3 = 36 cells)
 * @param {{ next(): number, choice(arr: any[]): any }} params.prng
 * @returns {{ radius: number, holeCell: [number, number],
 *             cells: Array<{q: number, r: number}>,
 *             arrows: Array<{q: number, r: number, dir: number|null}>,
 *             clues: Array<{q: number, r: number, value: number}>,
 *             solutionPath: Array<[number, number]> }}
 *   solutionPath[i] is the cell holding number i+1 (sequence order,
 *   not spatial adjacency). arrows.dir is null only for the final
 *   cell (the goal). clues always include 1 and the highest number.
 */
export function generateSignposts({ radius = 3, prng }) {
    if (radius < 2) {
        throw new Error(`Invalid radius: ${radius}. Must be at least 2.`);
    }

    const grid = buildHexCellGrid(radius, { centerHole: true });
    const cellKeys = [...grid.cells.keys()];
    const total = cellKeys.length;
    const { rays, successors } = buildRays(grid);

    const path = sequencePath(cellKeys, successors, prng);
    if (path === null) {
        throw new Error('Failed to find a signpost sequence within budget');
    }

    // Arrows point from each cell toward its successor
    const arrowByKey = new Map();
    for (let i = 0; i < path.length - 1; i++) {
        arrowByKey.set(path[i], directionBetween(path[i], path[i + 1]));
    }

    // Clue minimization: endpoints stay, everything else is fair game
    const clues = new Map(path.map((key, i) => [key, i + 1]));
    const removalOrder = [...path.slice(1, -1)];
    for (let i = removalOrder.length - 1; i > 0; i--) {
        const j = Math.floor(prng.next() * (i + 1));
        [removalOrder[i], removalOrder[j]] = [removalOrder[j], removalOrder[i]];
    }
    for (const key of removalOrder) {
        const value = clues.get(key);
        clues.delete(key);
        if (countSolutions(rays, arrowByKey, clues, total) !== 1) {
            clues.set(key, value);
        }
    }

    return {
        radius,
        holeCell: [0, 0],
        cells: cellKeys.map(key => grid.cells.get(key)),
        arrows: cellKeys.map(key => {
            const c = grid.cells.get(key);
            const dir = arrowByKey.get(key);
            return { q: c.q, r: c.r, dir: dir === undefined ? null : dir };
        }),
        clues: [...clues.entries()]
            .map(([key, value]) => {
                const c = grid.cells.get(key);
                return { q: c.q, r: c.r, value };
            })
            .sort((a, b) => a.value - b.value),
        solutionPath: path.map(key => {
            const c = grid.cells.get(key);
            return [c.q, c.r];
        }),
    };
}

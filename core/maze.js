// ── Maze generator ──────────────────────────────────────────
//
// Generates a hexagonal maze of triangular cells via iterative
// backtracking (randomized DFS). The center of the hexagon is an open,
// fully-connected region (the goal); the player enters from an opening
// on the border and navigates to the center.

import { buildHexGrid, centerRegionCells } from './hex-grid.js';

/**
 * Generate a maze.
 *
 * @param {number} hexSide - hexagon side length (must be > 0; forced odd)
 * @param {number} centerHexRadius - open center radius (must be >= 0)
 * @param {{ next(): number, choice(arr: any[]): any }} prng - seeded PRNG
 * @returns {{ rows: number, cols: number, cellSize: number, centerHexRadius: number,
 *             margin: number, stretch: number,
 *             cells: Array<{row:number,col:number,upward:boolean}>,
 *             passages: Array<[[number,number],[number,number]]>,
 *             entryCell: [number,number],
 *             goalCells: Array<[number,number]>,
 *             solutionPath: Array<[number,number]> }}
 *   solutionPath is the shortest walk through passages from entryCell
 *   to the center region (first element is entryCell, last is inside
 *   the goal region when centerHexRadius > 0).
 */
export function generateMaze(hexSide, centerHexRadius, prng) {
    if (hexSide <= 0) {
        throw new Error(`Invalid hex_side: ${hexSide}. Must be greater than 0.`);
    }
    if (centerHexRadius < 0) {
        throw new Error(`Invalid center_hex_radius: ${centerHexRadius}. Must be non-negative.`);
    }

    // Build the grid (buildHexGrid forces odd hexSide internally)
    const grid = buildHexGrid(hexSide);
    const effectiveHexSide = (hexSide % 2 === 0) ? hexSide + 1 : hexSide;
    const { rows, cols, cells, neighbors } = grid;

    // Track visited cells and passages
    const visited = new Set();
    // passages stored as Map<string, Set<string>> (cell key → connected neighbor keys)
    const passages = new Map();
    for (const key of cells.keys()) {
        passages.set(key, new Set());
    }

    // ── Open center: mark visited and fully interconnect ────
    const centerKeys = centerRegionCells(grid, effectiveHexSide, centerHexRadius);
    const centerSet = new Set(centerKeys);
    for (const key of centerKeys) {
        visited.add(key);
    }
    for (const key of centerKeys) {
        for (const nk of neighbors.get(key) || []) {
            if (centerSet.has(nk)) {
                passages.get(key).add(nk);
                passages.get(nk).add(key);
            }
        }
    }

    // ── Start cell selection ────────────────────────────────
    // Begin at a cell in the center band and walk right; the DFS starts
    // from the last visited (center-region) cell so the maze tree is
    // rooted at the center's edge.
    const startRow = Math.floor(rows / 2 + centerHexRadius / 2);
    let startCol = Math.floor(cols / 2);

    const hasUnvisited = [...cells.keys()].some(k => !visited.has(k));
    if (!hasUnvisited) {
        throw new Error('No unvisited cells available for maze generation');
    }

    let startKey = `${startRow},${startCol}`;
    while (true) {
        startCol += 1;
        const nextKey = `${startRow},${startCol}`;
        if (!cells.has(nextKey)) {
            break;
        }
        if (!visited.has(nextKey)) {
            break;
        }
        startKey = nextKey;
    }

    // ── Iterative backtracking ──────────────────────────────
    const stack = [startKey];
    visited.add(startKey);

    while (stack.length > 0) {
        const current = stack[stack.length - 1];
        const unvisitedNeighbors = (neighbors.get(current) || []).filter(nk => !visited.has(nk));

        if (unvisitedNeighbors.length > 0) {
            const chosen = prng.choice(unvisitedNeighbors);
            visited.add(chosen);
            passages.get(current).add(chosen);
            passages.get(chosen).add(current);
            stack.push(chosen);
        } else {
            stack.pop();
        }
    }

    // ── BFS from start: distances + parents for exit + solution ──
    const distances = new Map();
    distances.set(startKey, 0);
    const parent = new Map();
    parent.set(startKey, null);
    const queue = [startKey];
    let head = 0;

    while (head < queue.length) {
        const cellKey = queue[head++];
        for (const nk of passages.get(cellKey) || new Set()) {
            if (!distances.has(nk)) {
                distances.set(nk, distances.get(cellKey) + 1);
                parent.set(nk, cellKey);
                queue.push(nk);
            }
        }
    }

    // Exit: farthest border cell (fewer than 3 neighbors) from start.
    // The exit doubles as the player's entry point.
    const borderCells = [];
    for (const [key] of cells) {
        if ((neighbors.get(key) || []).length < 3 && distances.has(key)) {
            borderCells.push(key);
        }
    }

    if (borderCells.length === 0) {
        throw new Error('Failed to find exit cell: no border cells found');
    }

    let exitKey = borderCells[0];
    let maxDist = distances.get(exitKey) || 0;
    for (const bk of borderCells) {
        const d = distances.get(bk) || 0;
        if (d > maxDist) {
            maxDist = d;
            exitKey = bk;
        }
    }

    const exitCell = cells.get(exitKey);
    const entryCell = [exitCell.row, exitCell.col];

    // Solution: walk the BFS parent chain from the entry back to the
    // start cell (which sits in the center region). This is the shortest
    // passage-walk from entryCell to the goal.
    const solutionPath = [];
    for (let k = exitKey; k !== null; k = parent.get(k)) {
        const c = cells.get(k);
        solutionPath.push([c.row, c.col]);
    }

    // ── Goal cells: the open center region ──────────────────
    const goalCells = centerRegionCells(grid, effectiveHexSide, centerHexRadius)
        .map(key => {
            const c = cells.get(key);
            return [c.row, c.col];
        });

    // ── Build output ────────────────────────────────────────
    const cellsArray = [];
    for (const [, cell] of cells) {
        cellsArray.push({ row: cell.row, col: cell.col, upward: cell.upward });
    }

    // Deduplicate passages: each undirected edge appears once
    const seenPassages = new Set();
    const passagesArray = [];
    for (const [key, connectedSet] of passages) {
        for (const nk of connectedSet) {
            const pair = key < nk ? `${key}|${nk}` : `${nk}|${key}`;
            if (!seenPassages.has(pair)) {
                seenPassages.add(pair);
                const c1 = cells.get(key);
                const c2 = cells.get(nk);
                passagesArray.push([[c1.row, c1.col], [c2.row, c2.col]]);
            }
        }
    }

    return {
        rows,
        cols,
        cellSize: 30,
        centerHexRadius,
        margin: 40,
        stretch: 1.03,
        cells: cellsArray,
        passages: passagesArray,
        entryCell,
        goalCells,
        solutionPath,
    };
}

// ── Maze Data Serialization ─────────────────────────────────

/**
 * Export maze data object as a JSON string.
 * @param {object} mazeData - output from generateMaze()
 * @returns {string} JSON string
 */
export function exportMazeJSON(mazeData) {
    return JSON.stringify(mazeData);
}

/**
 * Parse a maze JSON string back into a maze data object.
 * @param {string} json
 * @returns {object} maze data object
 */
export function parseMazeJSON(json) {
    return JSON.parse(json);
}

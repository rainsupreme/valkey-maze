// ── Seeded PRNG (mulberry32) ────────────────────────────────

/**
 * Create a seeded PRNG using the mulberry32 algorithm.
 * @param {number} seed - 32-bit integer seed
 * @returns {{ next(): number, choice(arr): any }}
 *   next() returns a float in [0, 1)
 *   choice(arr) returns a random element from arr
 */
export function createPRNG(seed) {
    let state = seed | 0;
    function next() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    }
    function choice(arr) {
        return arr[Math.floor(next() * arr.length)];
    }
    return { next, choice };
}

// ── Date Seed ───────────────────────────────────────────────

/**
 * Derive a 32-bit integer seed from a date.
 * Pure function of (year, month, day).
 * @param {Date} date
 * @returns {number}
 */
export function dateSeed(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return y * 10000 + m * 100 + d;
}

// ── Difficulty Tiers ────────────────────────────────────────

export const DIFFICULTY_TIERS = [
    { id: 'easy',      name: "I'm too young to cache", hexSide: 9,  centerHexRadius: 5  },
    { id: 'medium',    name: "Hey, not too fast",      hexSide: 17, centerHexRadius: 9  },
    { id: 'hard',      name: "Query me plenty",        hexSide: 25, centerHexRadius: 11 },
    { id: 'nightmare', name: "Ultra-Valkey",           hexSide: 35, centerHexRadius: 15 },
];

// Legacy alias kept for any external references
export const DAILY_PUZZLE_TIER = DIFFICULTY_TIERS[2];

// ── Triangular Grid (port of triangular_grid.py) ───────────

/**
 * Build a hexagonal grid of triangular cells.
 * Ports TriangularGrid._build_hexagonal_grid from Python.
 * @param {number} hexSide - hex_side parameter (will be forced odd)
 * @returns {{ rows: number, cols: number, cells: Map<string, {row:number,col:number,upward:boolean}>, neighbors: Map<string, string[]> }}
 */
export function buildHexGrid(hexSide) {
    // Force odd hex_side
    if (hexSide % 2 === 0) hexSide += 1;

    const rows = hexSide * 2;
    const cols = 4 * hexSide - 1;
    const centerRow = hexSide - 0.5;

    const cells = new Map();
    const neighbors = new Map();

    // Create cells within hexagonal boundary
    for (let row = 0; row < rows; row++) {
        const distanceFromCenter = Math.abs(row - centerRow) - 0.5;
        for (let col = 0; col < cols; col++) {
            if (col < distanceFromCenter || col >= cols - distanceFromCenter) {
                continue;
            }
            const key = `${row},${col}`;
            cells.set(key, { row, col, upward: (row + col) % 2 === 0 });
        }
    }

    // Link neighbors
    for (const [key, cell] of cells) {
        const { row, col, upward } = cell;
        const neighborCoords = upward
            ? [[row + 1, col], [row, col - 1], [row, col + 1]]
            : [[row - 1, col], [row, col - 1], [row, col + 1]];

        const validNeighbors = [];
        for (const [nr, nc] of neighborCoords) {
            const nk = `${nr},${nc}`;
            if (cells.has(nk)) {
                validNeighbors.push(nk);
            }
        }
        neighbors.set(key, validNeighbors);
    }

    return { rows, cols, cells, neighbors };
}

// ── Maze Generator (port of maze_generator.py + maze_data_exporter.py) ──

/**
 * Generate a maze using iterative backtracking.
 * Ports MazeGenerator.generate(), _find_exit(), _create_open_center(),
 * and MazeDataExporter._find_goal_cells() + export() from Python.
 *
 * @param {number} hexSide - hex_side parameter (must be > 0)
 * @param {number} centerHexRadius - open center radius (must be >= 0)
 * @param {{ next(): number, choice(arr: any[]): any }} prng - seeded PRNG
 * @returns {{ rows: number, cols: number, cellSize: number, centerHexRadius: number,
 *             margin: number, stretch: number, cells: Array<{row:number,col:number,upward:boolean}>,
 *             passages: Array<[[number,number],[number,number]]>,
 *             entryCell: [number,number], goalCells: Array<[number,number]> }}
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
    // After buildHexGrid, hexSide may have been bumped to odd; recalculate radius
    const effectiveHexSide = (hexSide % 2 === 0) ? hexSide + 1 : hexSide;
    const radius = effectiveHexSide;
    const { rows, cols, cells, neighbors } = grid;

    // Track visited cells and passages using Sets/Maps
    const visited = new Set();
    // passages stored as Map<string, Set<string>> (cell key → set of connected neighbor keys)
    const passages = new Map();
    for (const key of cells.keys()) {
        passages.set(key, new Set());
    }

    // ── _create_open_center ─────────────────────────────────
    if (centerHexRadius > 0) {
        const centerRow = rows / 2 - 0.5;
        const centerCellKeys = [];

        for (const [key, cell] of cells) {
            const verticalDistance = Math.abs(cell.row - centerRow) - 0.5;
            if (verticalDistance >= centerHexRadius) continue;
            const sideOffset = (radius - centerHexRadius) * 2 + verticalDistance;
            if (cell.col >= sideOffset && cell.col < cols - sideOffset) {
                centerCellKeys.push(key);
            }
        }

        // Mark center cells visited and connect all their passages
        for (const key of centerCellKeys) {
            visited.add(key);
        }
        const centerSet = new Set(centerCellKeys);
        for (const key of centerCellKeys) {
            const cellNeighbors = neighbors.get(key) || [];
            for (const nk of cellNeighbors) {
                if (centerSet.has(nk)) {
                    passages.get(key).add(nk);
                    passages.get(nk).add(key);
                }
            }
        }
    }

    // ── Start cell selection (mirrors Python logic) ─────────
    // Pick start cell: row = rows/2 + centerHexRadius/2, col = cols/2
    // Then walk right until we find an unvisited cell
    const startRow = Math.floor(rows / 2 + centerHexRadius / 2);
    let startCol = Math.floor(cols / 2);

    // Guard: ensure there are unvisited cells available
    const hasUnvisited = [...cells.keys()].some(k => !visited.has(k));
    if (!hasUnvisited) {
        throw new Error('No unvisited cells available for maze generation');
    }

    let startKey = `${startRow},${startCol}`;
    while (true) {
        startCol += 1;
        const nextKey = `${startRow},${startCol}`;
        if (!cells.has(nextKey)) {
            // Shouldn't happen with valid params, but safety check
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
        const currentNeighbors = neighbors.get(current) || [];
        const unvisitedNeighbors = currentNeighbors.filter(nk => !visited.has(nk));

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

    // ── _find_exit: BFS from start cell, find farthest border cell ──
    const distances = new Map();
    distances.set(startKey, 0);
    const parent = new Map();
    parent.set(startKey, null);
    const queue = [startKey];
    let head = 0;

    while (head < queue.length) {
        const cellKey = queue[head++];
        const cellPassages = passages.get(cellKey) || new Set();
        for (const nk of cellPassages) {
            if (!distances.has(nk)) {
                distances.set(nk, distances.get(cellKey) + 1);
                parent.set(nk, cellKey);
                queue.push(nk);
            }
        }
    }

    // Border cells: cells with fewer than 3 neighbors in the grid
    const borderCells = [];
    for (const [key] of cells) {
        const cellNeighbors = neighbors.get(key) || [];
        if (cellNeighbors.length < 3 && distances.has(key)) {
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

    // ── _find_goal_cells (from MazeDataExporter) ────────────
    const goalCells = [];
    if (centerHexRadius > 0) {
        const centerRow = rows / 2 - 0.5;
        for (const [, cell] of cells) {
            const verticalDistance = Math.abs(cell.row - centerRow) - 0.5;
            if (verticalDistance >= centerHexRadius) continue;
            const sideOffset = (radius - centerHexRadius) * 2 + verticalDistance;
            if (cell.col >= sideOffset && cell.col < cols - sideOffset) {
                goalCells.push([cell.row, cell.col]);
            }
        }
    }

    // ── Build output (matches MazeDataExporter.export()) ────
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
    };
}

// ── Maze Data Serialization ─────────────────────────────────

/**
 * Export maze data object as a JSON string matching MazeDataExporter format.
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

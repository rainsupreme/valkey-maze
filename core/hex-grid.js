// ── Hexagonal lattice of triangular cells ───────────────────
//
// The playing field is a hexagon tiled with upward/downward-pointing
// triangles, addressed by (row, col). A cell's key is "row,col".

/**
 * Build a hexagonal grid of triangular cells.
 * @param {number} hexSide - hexagon side length in cells (forced odd)
 * @returns {{ rows: number, cols: number,
 *             cells: Map<string, {row:number,col:number,upward:boolean}>,
 *             neighbors: Map<string, string[]> }}
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

    // Link neighbors: an upward triangle borders the cell below it and its
    // left/right siblings; a downward triangle borders the cell above it.
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

/**
 * Cell keys inside the central hexagonal region of radius
 * `centerHexRadius` (the open area holding the logo / goal).
 *
 * This is the single source of truth for the center-region boundary --
 * used both to carve the open center during generation and to identify
 * goal cells in the exported puzzle data.
 *
 * @param {{ rows: number, cols: number, cells: Map }} grid - from buildHexGrid
 * @param {number} hexSide - the grid's effective (odd) hex side
 * @param {number} centerHexRadius - center region radius; 0 means none
 * @returns {string[]} keys of cells inside the center region
 */
export function centerRegionCells(grid, hexSide, centerHexRadius) {
    if (centerHexRadius <= 0) return [];

    const { rows, cols, cells } = grid;
    const centerRow = rows / 2 - 0.5;
    const keys = [];

    for (const [key, cell] of cells) {
        const verticalDistance = Math.abs(cell.row - centerRow) - 0.5;
        if (verticalDistance >= centerHexRadius) continue;
        const sideOffset = (hexSide - centerHexRadius) * 2 + verticalDistance;
        if (cell.col >= sideOffset && cell.col < cols - sideOffset) {
            keys.push(key);
        }
    }

    return keys;
}

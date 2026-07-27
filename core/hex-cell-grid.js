// ── Hexagonal-cell lattice (pointy-top) ─────────────────────
//
// A hex-shaped board of hexagonal cells in axial coordinates (q, r),
// used by cell-based puzzles like Rikudo. Distinct from hex-grid.js,
// which tiles a hexagon with triangular cells for the maze.
//
// Cells are pointy-top (vertices at 12 and 6 o'clock), matching the
// orientation of the Valkey logo. A cell's key is "q,r".

/** The 6 axial neighbor directions. */
export const HEX_DIRECTIONS = [
    [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
];

/**
 * Hex distance from the origin in axial coordinates.
 */
export function hexDistance(q, r) {
    return Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r));
}

/**
 * Build a hex-shaped board of hexagonal cells.
 *
 * @param {number} radius - board radius in cells (radius 3 = 37 cells)
 * @param {object} [options]
 * @param {boolean} [options.centerHole=false] - exclude the center cell
 *   (0,0), leaving a hole for the logo
 * @returns {{ radius: number, centerHole: boolean,
 *             cells: Map<string, {q: number, r: number}>,
 *             neighbors: Map<string, string[]> }}
 */
export function buildHexCellGrid(radius, { centerHole = false } = {}) {
    const cells = new Map();
    for (let q = -radius; q <= radius; q++) {
        for (let r = -radius; r <= radius; r++) {
            if (hexDistance(q, r) > radius) continue;
            if (centerHole && q === 0 && r === 0) continue;
            cells.set(`${q},${r}`, { q, r });
        }
    }

    const neighbors = new Map();
    for (const [key, { q, r }] of cells) {
        const adj = [];
        for (const [dq, dr] of HEX_DIRECTIONS) {
            const nk = `${q + dq},${r + dr}`;
            if (cells.has(nk)) adj.push(nk);
        }
        neighbors.set(key, adj);
    }

    return { radius, centerHole, cells, neighbors };
}

// ── Pointy-top pixel geometry ───────────────────────────────

/**
 * Center of a pointy-top hex cell in pixels.
 * @param {number} q - axial column
 * @param {number} r - axial row
 * @param {number} size - hex circumradius (center to vertex)
 * @returns {{ x: number, y: number }}
 */
export function axialToPixel(q, r, size) {
    return {
        x: Math.sqrt(3) * size * (q + r / 2),
        y: 1.5 * size * r,
    };
}

/**
 * The 6 vertices of a pointy-top hex centered at (cx, cy):
 * corners at 30° + 60°·k, which puts vertices at 12 and 6 o'clock.
 * @returns {Array<[number, number]>}
 */
export function hexCorners(cx, cy, size) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 180) * (60 * i - 30);
        corners.push([cx + size * Math.cos(angle), cy + size * Math.sin(angle)]);
    }
    return corners;
}

// ── Maze SVG renderer ───────────────────────────────────────
//
// Pure puzzleData -> SVG-string rendering, usable from both the
// browser and Node. All inputs are data (the optional logo is passed
// as SVG source text, not a file path).

const ROW_HEIGHT = Math.sqrt(3) / 2; // height of a triangle row, in cell units

const DEFAULTS = {
    strokeWidth: 3,
    arrowSize: 10,
    logoSvg: null,
    logoColor: 'black',
    showSolution: false,
    solutionColor: 'red',
    solutionWidth: 2,
    background: 'white',
};

/**
 * Render a maze as an SVG string.
 *
 * The maze is drawn in grid coordinates, then rotated 90° and slightly
 * stretched inside the viewport (matching the game's orientation).
 *
 * @param {object} maze - puzzle data from generateMaze()
 * @param {object} [options]
 * @param {number} [options.strokeWidth=3] - wall stroke width
 * @param {number} [options.arrowSize=10] - entry arrow size
 * @param {string|null} [options.logoSvg=null] - SVG source text of a logo
 *   to center in the open region (its first <path> is embedded)
 * @param {string} [options.logoColor='black'] - fill for the embedded logo
 * @param {boolean} [options.showSolution=false] - draw the solution path
 * @param {string} [options.solutionColor='red']
 * @param {number} [options.solutionWidth=2]
 * @param {string} [options.background='white']
 * @returns {string} SVG document
 */
export function renderMazeSVG(maze, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const cs = maze.cellSize;
    const margin = maze.margin;
    const stretch = maze.stretch;
    const h = cs * ROW_HEIGHT;

    const mazeWidth = maze.cols * cs * 0.5 + cs * 0.5;
    const mazeHeight = maze.rows * cs * ROW_HEIGHT;
    const width = mazeHeight + 2 * margin;
    const height = (mazeWidth + 2 * margin) * stretch;

    const { cellSet, passageSet } = indexMaze(maze);
    const entryKey = `${maze.entryCell[0]},${maze.entryCell[1]}`;

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.background}"/>`);

    // Arrow marker for the entry opening
    const a = opts.arrowSize;
    parts.push(
        '<defs>' +
        `<marker id="entry-arrow" markerWidth="${a}" markerHeight="${a}" refX="${a}" refY="${a / 2}" orient="auto">` +
        `<polygon points="0,0 ${a},${a / 2} 0,${a}" fill="black"/>` +
        '</marker></defs>'
    );

    // Rotation/stretch group (90° rotation: maze renders landscape)
    const transform =
        `translate(${width / 2},${height / 2}) rotate(90)` +
        ` scale(${stretch},1)` +
        ` translate(${-(mazeWidth + 2 * margin) / 2},${-width / 2})`;
    parts.push(`<g transform="${transform}">`);

    // ── Walls: edges without passages (deduplicated) ────────
    const drawnWalls = new Set();
    for (const cell of maze.cells) {
        const { row, col } = cell;
        const x = col * 0.5 * cs + margin;
        const y = row * ROW_HEIGHT * cs + margin;
        const { neighborCoords, edges } = cellEdges(cell, x, y, cs, h);

        for (let i = 0; i < 3; i++) {
            const nk = `${neighborCoords[i][0]},${neighborCoords[i][1]}`;
            const hasNeighbor = cellSet.has(nk);
            const key = `${row},${col}`;
            if (hasNeighbor && passageSet.has(edgeKey(key, nk))) continue;
            // The entry cell's border edges are left open
            if (key === entryKey && !hasNeighbor) continue;

            const [[x1, y1], [x2, y2]] = edges[i];
            const wallId = wallKey(x1, y1, x2, y2);
            if (drawnWalls.has(wallId)) continue;
            drawnWalls.add(wallId);
            parts.push(
                `<line class="wall" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"` +
                ` stroke="black" stroke-width="${opts.strokeWidth}"/>`
            );
        }
    }

    // ── Solution path ───────────────────────────────────────
    if (opts.showSolution && maze.solutionPath && maze.solutionPath.length > 1) {
        const centers = maze.solutionPath.map(([row, col]) => [
            col * 0.5 * cs + margin + cs / 2,
            row * ROW_HEIGHT * cs + margin + h / 2,
        ]);
        for (let i = 1; i < centers.length; i++) {
            const [x1, y1] = centers[i - 1];
            const [x2, y2] = centers[i];
            parts.push(
                `<line class="solution" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"` +
                ` stroke="${opts.solutionColor}" stroke-width="${opts.solutionWidth}"/>`
            );
        }
    }

    // ── Entry arrow: points at the first open border edge ───
    parts.push(entryArrow(maze, cellSet, cs, h, margin, opts));

    parts.push('</g>');

    // ── Logo (outside the rotation group, at absolute center) ──
    if (opts.logoSvg && maze.centerHexRadius > 0) {
        parts.push(logoPath(opts.logoSvg, opts.logoColor, width, height, maze.centerHexRadius, cs, stretch));
    }

    parts.push('</svg>');
    return parts.join('');
}

// ── Internals ───────────────────────────────────────────────

function indexMaze(maze) {
    const cellSet = new Set(maze.cells.map(c => `${c.row},${c.col}`));
    const passageSet = new Set(
        maze.passages.map(([[r1, c1], [r2, c2]]) => edgeKey(`${r1},${c1}`, `${r2},${c2}`))
    );
    return { cellSet, passageSet };
}

function edgeKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function wallKey(x1, y1, x2, y2) {
    const a = `${x1.toFixed(3)},${y1.toFixed(3)}`;
    const b = `${x2.toFixed(3)},${y2.toFixed(3)}`;
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Neighbor coordinates and matching edge segments for a cell.
 * Index i of `edges` is the edge shared with `neighborCoords[i]`.
 */
function cellEdges(cell, x, y, cs, h) {
    const { row, col, upward } = cell;
    if (upward) {
        return {
            neighborCoords: [[row + 1, col], [row, col - 1], [row, col + 1]],
            edges: [
                [[x, y + h], [x + cs, y + h]],
                [[x, y + h], [x + cs / 2, y]],
                [[x + cs / 2, y], [x + cs, y + h]],
            ],
            angles: [90, 210, 330],
        };
    }
    return {
        neighborCoords: [[row - 1, col], [row, col - 1], [row, col + 1]],
        edges: [
            [[x, y], [x + cs, y]],
            [[x, y], [x + cs / 2, y + h]],
            [[x + cs / 2, y + h], [x + cs, y]],
        ],
        angles: [270, 150, 30],
    };
}

function entryArrow(maze, cellSet, cs, h, margin, opts) {
    const [row, col] = maze.entryCell;
    const upward = (row + col) % 2 === 0;
    const x = col * 0.5 * cs + margin;
    const y = row * ROW_HEIGHT * cs + margin;
    const { neighborCoords, edges, angles } = cellEdges({ row, col, upward }, x, y, cs, h);

    for (let i = 0; i < 3; i++) {
        const nk = `${neighborCoords[i][0]},${neighborCoords[i][1]}`;
        if (cellSet.has(nk)) continue;
        // Edge center = midpoint of the border edge segment
        const [[x1, y1], [x2, y2]] = edges[i];
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const angle = (angles[i] * Math.PI) / 180;
        const sx = cx + opts.arrowSize * Math.cos(angle);
        const sy = cy + opts.arrowSize * Math.sin(angle);
        return (
            `<line class="entry-arrow" x1="${sx}" y1="${sy}" x2="${cx}" y2="${cy}"` +
            ` stroke="black" stroke-width="${opts.strokeWidth}" marker-end="url(#entry-arrow)"/>`
        );
    }
    return '';
}

/**
 * Extract the first <path> and viewBox from logo SVG source text and
 * emit it scaled to fill the maze's open center.
 */
function logoPath(logoSvg, fill, width, height, centerHexRadius, cs, stretch) {
    const pathMatch = logoSvg.match(/<path[^>]*\bd="([^"]+)"/);
    if (!pathMatch) return '';
    const d = pathMatch[1];

    let logoCx = 32.0;
    let logoCy = 36.5;
    let logoH = 70.0;
    const vbMatch = logoSvg.match(/viewBox="([^"]+)"/);
    if (vbMatch) {
        const vb = vbMatch[1].trim().split(/[\s,]+/).map(Number);
        if (vb.length === 4 && vb.every(Number.isFinite)) {
            logoCx = vb[0] + vb[2] / 2;
            logoCy = vb[1] + vb[3] / 2;
            logoH = vb[3];
        }
    }

    const hexDiameter = centerHexRadius * cs * 2;
    const scale = hexDiameter / logoH;
    const cx = width / 2;
    const cy = height / 2;
    const transform =
        `translate(${cx - logoCx * scale},${cy - logoCy * scale * stretch})` +
        ` scale(${scale},${scale * stretch})`;
    return `<path class="logo" d="${d}" fill="${fill}" transform="${transform}"/>`;
}

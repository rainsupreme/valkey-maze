// ── Rikudo SVG renderer ─────────────────────────────────────
//
// Pure puzzleData -> SVG-string rendering for Rikudo puzzles.
// Pointy-top hex cells (matching the Valkey logo orientation), clue
// numbers pre-filled on shaded cells, the logo in the center hole,
// and an optional solution overlay (all numbers + path polyline).

import { axialToPixel, hexCorners } from '../hex-cell-grid.js';
import { embedLogoPath } from './logo.js';

const DEFAULTS = {
    cellSize: 34,          // hex circumradius
    strokeWidth: 2,
    logoSvg: null,
    logoColor: 'black',
    clueFill: '#e8e8e8',   // shaded clue cells
    cellFill: 'white',
    showSolution: false,
    solutionColor: 'red',
    solutionWidth: 3,
    background: 'white',
};

/**
 * Render a Rikudo puzzle as an SVG string.
 *
 * @param {object} puzzle - from generateRikudo()
 * @param {object} [options]
 * @param {number} [options.cellSize=34] - hex circumradius in px
 * @param {string|null} [options.logoSvg=null] - logo SVG source text,
 *   rendered in the center hole cell
 * @param {boolean} [options.showSolution=false] - draw every number and
 *   the solution path polyline
 * @returns {string} SVG document
 */
export function renderRikudoSVG(puzzle, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const size = opts.cellSize;

    // Board bounding box: the outermost cell centers are at hex distance
    // `radius`; add one cell of margin around them.
    const extent = (puzzle.radius + 1) * 2 * size;
    const width = extent * Math.sqrt(3) / 2 * 2;
    const height = extent * 2 * 0.87;
    const ox = width / 2;  // origin: board center
    const oy = height / 2;

    const center = (q, r) => {
        const p = axialToPixel(q, r, size);
        return { x: ox + p.x, y: oy + p.y };
    };

    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const numberByKey = new Map(puzzle.solutionPath.map(([q, r], i) => [`${q},${r}`, i + 1]));
    const fontSize = Math.round(size * 0.62);

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.background}"/>`);

    // ── Cells ───────────────────────────────────────────────
    for (const { q, r } of puzzle.cells) {
        const key = `${q},${r}`;
        const { x, y } = center(q, r);
        const points = hexCorners(x, y, size)
            .map(([px, py]) => `${round2(px)},${round2(py)}`)
            .join(' ');
        const isClue = clueByKey.has(key);
        parts.push(
            `<polygon class="hex-cell${isClue ? ' clue-cell' : ''}" points="${points}"` +
            ` fill="${isClue ? opts.clueFill : opts.cellFill}" stroke="black" stroke-width="${opts.strokeWidth}"/>`
        );
    }

    // ── Center hole: hex outline + logo ─────────────────────
    const hole = center(puzzle.holeCell[0], puzzle.holeCell[1]);
    const holePoints = hexCorners(hole.x, hole.y, size)
        .map(([px, py]) => `${round2(px)},${round2(py)}`)
        .join(' ');
    parts.push(
        `<polygon class="hole-cell" points="${holePoints}"` +
        ` fill="${opts.cellFill}" stroke="black" stroke-width="${opts.strokeWidth}"/>`
    );
    if (opts.logoSvg) {
        parts.push(embedLogoPath(opts.logoSvg, {
            fill: opts.logoColor,
            cx: hole.x,
            cy: hole.y,
            height: size * 2, // flush: the aligned logo's viewBox is a
                              // pointy-top hex, so vertex-to-vertex height
                              // equals the cell's (2 x circumradius)
        }));
    }

    // ── Solution path (under the numbers) ───────────────────
    if (opts.showSolution) {
        const pts = puzzle.solutionPath
            .map(([q, r]) => {
                const { x, y } = center(q, r);
                return `${round2(x)},${round2(y)}`;
            })
            .join(' ');
        parts.push(
            `<polyline class="solution" points="${pts}" fill="none"` +
            ` stroke="${opts.solutionColor}" stroke-width="${opts.solutionWidth}" opacity="0.5"` +
            ` stroke-linejoin="round" stroke-linecap="round"/>`
        );
    }

    // ── Numbers: clues always; the rest only in solution mode ──
    for (const { q, r } of puzzle.cells) {
        const key = `${q},${r}`;
        const isClue = clueByKey.has(key);
        if (!isClue && !opts.showSolution) continue;
        const value = isClue ? clueByKey.get(key) : numberByKey.get(key);
        const { x, y } = center(q, r);
        parts.push(
            `<text class="${isClue ? 'clue' : 'number'}" x="${round2(x)}" y="${round2(y + fontSize * 0.36)}"` +
            ` text-anchor="middle" font-size="${fontSize}" font-family="Arial"` +
            `${isClue ? ' font-weight="bold"' : ''}>${value}</text>`
        );
    }

    parts.push('</svg>');
    return parts.join('');
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

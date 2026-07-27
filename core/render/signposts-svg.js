// ── Signposts SVG renderer ──────────────────────────────────
//
// Pointy-top hex cells, each with an arrow pointing along its ray
// direction, clue numbers on shaded cells, a goal marker on the
// final cell, the logo flush in the center hole, and an optional
// solution overlay (all numbers + the sequence polyline).

import { axialToPixel, hexCorners, HEX_DIRECTIONS } from '../hex-cell-grid.js';
import { embedLogoPath } from './logo.js';

const DEFAULTS = {
    cellSize: 34,
    strokeWidth: 2,
    logoSvg: null,
    logoColor: 'black',
    clueFill: '#e8e8e8',
    cellFill: 'white',
    showSolution: false,
    solutionColor: 'red',
    solutionWidth: 3,
    background: 'white',
};

/** Pixel angle (degrees) of a hex direction index for pointy-top cells. */
export function directionAngle(dir) {
    const [dq, dr] = HEX_DIRECTIONS[dir];
    const dx = Math.sqrt(3) * (dq + dr / 2);
    const dy = 1.5 * dr;
    return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Render a Signposts puzzle as an SVG string.
 *
 * @param {object} puzzle - from generateSignposts()
 * @param {object} [options] - see DEFAULTS
 * @returns {string} SVG document
 */
export function renderSignpostsSVG(puzzle, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const size = opts.cellSize;

    const extent = (puzzle.radius + 1) * 2 * size;
    const width = extent * Math.sqrt(3);
    const height = extent * 1.74;
    const ox = width / 2;
    const oy = height / 2;

    const center = (q, r) => {
        const p = axialToPixel(q, r, size);
        return { x: ox + p.x, y: oy + p.y };
    };

    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const numberByKey = new Map(puzzle.solutionPath.map(([q, r], i) => [`${q},${r}`, i + 1]));
    const arrowByKey = new Map(puzzle.arrows.map(a => [`${a.q},${a.r}`, a.dir]));
    const fontSize = Math.round(size * 0.5);

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.background}"/>`);

    // ── Cells ───────────────────────────────────────────────
    for (const { q, r } of puzzle.cells) {
        const key = `${q},${r}`;
        const { x, y } = center(q, r);
        const points = hexCorners(x, y, size).map(([px, py]) => `${round2(px)},${round2(py)}`).join(' ');
        const isClue = clueByKey.has(key);
        parts.push(
            `<polygon class="hex-cell${isClue ? ' clue-cell' : ''}" points="${points}"` +
            ` fill="${isClue ? opts.clueFill : opts.cellFill}" stroke="black" stroke-width="${opts.strokeWidth}"/>`
        );
    }

    // ── Center hole + logo ──────────────────────────────────
    const hole = center(puzzle.holeCell[0], puzzle.holeCell[1]);
    const holePoints = hexCorners(hole.x, hole.y, size).map(([px, py]) => `${round2(px)},${round2(py)}`).join(' ');
    parts.push(
        `<polygon class="hole-cell" points="${holePoints}" fill="${opts.cellFill}"` +
        ` stroke="black" stroke-width="${opts.strokeWidth}"/>`
    );
    if (opts.logoSvg) {
        parts.push(embedLogoPath(opts.logoSvg, {
            fill: opts.logoColor, cx: hole.x, cy: hole.y, height: size * 2,
        }));
    }

    // ── Solution polyline (under numbers/arrows) ────────────
    if (opts.showSolution) {
        const pts = puzzle.solutionPath.map(([q, r]) => {
            const { x, y } = center(q, r);
            return `${round2(x)},${round2(y)}`;
        }).join(' ');
        parts.push(
            `<polyline class="solution" points="${pts}" fill="none"` +
            ` stroke="${opts.solutionColor}" stroke-width="${opts.solutionWidth}" opacity="0.45"` +
            ` stroke-linejoin="round" stroke-linecap="round"/>`
        );
    }

    // ── Arrows, goal marker, numbers ────────────────────────
    for (const { q, r } of puzzle.cells) {
        const key = `${q},${r}`;
        const { x, y } = center(q, r);
        const dir = arrowByKey.get(key);
        const arrowY = y + size * 0.33; // lower half; numbers sit above

        if (dir === null) {
            // Goal cell: small hexagon marker instead of an arrow
            const goalPoints = hexCorners(x, arrowY, size * 0.2)
                .map(([px, py]) => `${round2(px)},${round2(py)}`).join(' ');
            parts.push(`<polygon class="goal-marker" points="${goalPoints}" fill="black"/>`);
        } else {
            // Chevron arrow pointing +x, rotated to the ray direction
            const a = size * 0.34;
            const arrow =
                `M ${-a} ${-a * 0.45} L ${a * 0.15} ${-a * 0.45} L ${a * 0.15} ${-a * 0.85}` +
                ` L ${a} 0 L ${a * 0.15} ${a * 0.85} L ${a * 0.15} ${a * 0.45} L ${-a} ${a * 0.45} Z`;
            parts.push(
                `<path class="arrow" d="${arrow}" fill="black"` +
                ` transform="translate(${round2(x)},${round2(arrowY)}) rotate(${round2(directionAngle(dir))})"/>`
            );
        }

        const isClue = clueByKey.has(key);
        if (isClue || opts.showSolution) {
            const value = isClue ? clueByKey.get(key) : numberByKey.get(key);
            parts.push(
                `<text class="${isClue ? 'clue' : 'number'}" x="${round2(x)}" y="${round2(y - size * 0.22)}"` +
                ` text-anchor="middle" font-size="${fontSize}" font-family="Arial"` +
                `${isClue ? ' font-weight="bold"' : ''}>${value}</text>`
            );
        }
    }

    parts.push('</svg>');
    return parts.join('');
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

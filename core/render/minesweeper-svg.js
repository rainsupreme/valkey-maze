// ── Static hex Minesweeper SVG renderer ─────────────────────
//
// Pointy-top hex cells: revealed clue cells show their neighbor-mine
// count, unknown cells are blank. The logo sits flush in the center
// hole, and a mine-count legend is printed under the board. Solution
// mode marks every mine with a small filled hexagon and every hidden
// safe cell with a dot.

import { axialToPixel, hexCorners } from '../hex-cell-grid.js';
import { embedLogoPath } from './logo.js';

const DEFAULTS = {
    cellSize: 34,
    strokeWidth: 2,
    logoSvg: null,
    logoColor: 'black',
    clueFill: '#e8e8e8',
    cellFill: 'white',
    showSolution: false,
    mineColor: 'black',
    background: 'white',
};

/**
 * Render a static hex minesweeper puzzle as an SVG string.
 *
 * @param {object} puzzle - from generateMinesweeper()
 * @param {object} [options] - see DEFAULTS
 * @returns {string} SVG document
 */
export function renderMinesweeperSVG(puzzle, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const size = opts.cellSize;

    const extent = (puzzle.radius + 1) * 2 * size;
    const width = extent * Math.sqrt(3);
    const legendHeight = size * 1.2;
    const height = extent * 1.74 + legendHeight;
    const ox = width / 2;
    const oy = (height - legendHeight) / 2;

    const center = (q, r) => {
        const p = axialToPixel(q, r, size);
        return { x: ox + p.x, y: oy + p.y };
    };

    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const mineSet = new Set(puzzle.solutionMines.map(([q, r]) => `${q},${r}`));
    const fontSize = Math.round(size * 0.62);

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.background}"/>`);

    for (const { q, r } of puzzle.cells) {
        const key = `${q},${r}`;
        const { x, y } = center(q, r);
        const points = hexCorners(x, y, size).map(([px, py]) => `${round2(px)},${round2(py)}`).join(' ');
        const isClue = clueByKey.has(key);
        parts.push(
            `<polygon class="hex-cell${isClue ? ' clue-cell' : ''}" points="${points}"` +
            ` fill="${isClue ? opts.clueFill : opts.cellFill}" stroke="black" stroke-width="${opts.strokeWidth}"/>`
        );

        if (isClue) {
            parts.push(
                `<text class="clue" x="${round2(x)}" y="${round2(y + fontSize * 0.36)}"` +
                ` text-anchor="middle" font-size="${fontSize}" font-family="Arial"` +
                ` font-weight="bold">${clueByKey.get(key)}</text>`
            );
        } else if (opts.showSolution) {
            if (mineSet.has(key)) {
                const minePoints = hexCorners(x, y, size * 0.42)
                    .map(([px, py]) => `${round2(px)},${round2(py)}`).join(' ');
                parts.push(`<polygon class="mine" points="${minePoints}" fill="${opts.mineColor}"/>`);
            } else {
                parts.push(
                    `<circle class="safe-mark" cx="${round2(x)}" cy="${round2(y)}" r="${round2(size * 0.1)}"` +
                    ` fill="${opts.mineColor}"/>`
                );
            }
        }
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

    // ── Mine-count legend ───────────────────────────────────
    parts.push(
        `<text class="mine-count" x="${round2(width / 2)}" y="${round2(height - legendHeight / 2)}"` +
        ` text-anchor="middle" font-size="${Math.round(size * 0.5)}" font-family="Arial">` +
        `Mines: ${puzzle.mineCount}</text>`
    );

    parts.push('</svg>');
    return parts.join('');
}

function round2(n) {
    return Math.round(n * 100) / 100;
}

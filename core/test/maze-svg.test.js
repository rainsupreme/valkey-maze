import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../prng.js';
import { generateMaze } from '../maze.js';
import { renderMazeSVG } from '../render/maze-svg.js';

/** Count occurrences of a regex in a string. */
function count(svg, re) {
    return (svg.match(re) || []).length;
}

/**
 * Expected wall count for a maze, derived independently of the renderer:
 * every undirected cell adjacency that is NOT a passage is a wall, plus
 * every border edge (3 - neighbor count per cell) except the entry
 * cell's open border edges. Interior walls are deduplicated.
 */
function expectedWallCount(maze) {
    const cellSet = new Set(maze.cells.map(c => `${c.row},${c.col}`));

    let internalEdges = 0;
    let borderEdges = 0;
    let entryBorderEdges = 0;
    const entryKey = `${maze.entryCell[0]},${maze.entryCell[1]}`;

    for (const cell of maze.cells) {
        const { row, col, upward } = cell;
        const neighborCoords = upward
            ? [[row + 1, col], [row, col - 1], [row, col + 1]]
            : [[row - 1, col], [row, col - 1], [row, col + 1]];
        for (const [nr, nc] of neighborCoords) {
            if (cellSet.has(`${nr},${nc}`)) {
                internalEdges += 1; // counted from both sides; halved below
            } else {
                borderEdges += 1;
                if (`${row},${col}` === entryKey) entryBorderEdges += 1;
            }
        }
    }
    internalEdges /= 2;

    return (internalEdges - maze.passages.length) + (borderEdges - entryBorderEdges);
}

const SAMPLE_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 73">' +
    '<path fill="#6983ff" d="M 10 10 L 20 20 Z"/></svg>';

describe('renderMazeSVG structure', () => {
    const prng = createPRNG(12345);
    const maze = generateMaze(9, 5, prng);

    it('produces a well-formed SVG document', () => {
        const svg = renderMazeSVG(maze);
        expect(svg.startsWith('<svg ')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
        // Exactly one group open/close for the rotation transform
        expect(count(svg, /<g /g)).toBe(1);
        expect(count(svg, /<\/g>/g)).toBe(1);
    });

    it('has viewport dimensions matching the game renderer formulas', () => {
        const svg = renderMazeSVG(maze);
        const cs = maze.cellSize;
        const mazeWidth = maze.cols * cs * 0.5 + cs * 0.5;
        const mazeHeight = maze.rows * cs * (Math.sqrt(3) / 2);
        const width = mazeHeight + 2 * maze.margin;
        const height = (mazeWidth + 2 * maze.margin) * maze.stretch;
        expect(svg).toContain(`width="${width}"`);
        expect(svg).toContain(`height="${height}"`);
    });

    it('draws exactly one entry arrow', () => {
        const svg = renderMazeSVG(maze);
        expect(count(svg, /class="entry-arrow"/g)).toBe(1);
        expect(svg).toContain('marker-end="url(#entry-arrow)"');
    });

    it('omits the solution by default and draws it when enabled', () => {
        const plain = renderMazeSVG(maze);
        expect(count(plain, /class="solution"/g)).toBe(0);

        const solved = renderMazeSVG(maze, { showSolution: true });
        expect(count(solved, /class="solution"/g)).toBe(maze.solutionPath.length - 1);
    });

    it('embeds the logo path scaled to the center region', () => {
        const withLogo = renderMazeSVG(maze, { logoSvg: SAMPLE_LOGO, logoColor: '#123456' });
        expect(count(withLogo, /class="logo"/g)).toBe(1);
        expect(withLogo).toContain('fill="#123456"');
        expect(withLogo).toContain('d="M 10 10 L 20 20 Z"');

        const without = renderMazeSVG(maze);
        expect(count(without, /class="logo"/g)).toBe(0);
    });

    it('respects stroke and color options', () => {
        const svg = renderMazeSVG(maze, {
            strokeWidth: 7,
            showSolution: true,
            solutionColor: 'magenta',
            solutionWidth: 5,
        });
        expect(svg).toContain('stroke-width="7"');
        expect(svg).toContain('stroke="magenta"');
        expect(svg).toContain('stroke-width="5"');
    });
});

describe('Property: wall count matches maze topology', () => {
    it('renders exactly (internal non-passage edges + border edges - entry opening) walls', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 11 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (hexSide, seed) => {
                    const centerHexRadius = Math.max(1, Math.floor(hexSide / 3));
                    const prng = createPRNG(seed);
                    const maze = generateMaze(hexSide, centerHexRadius, prng);
                    const svg = renderMazeSVG(maze);
                    expect(count(svg, /class="wall"/g)).toBe(expectedWallCount(maze));
                }
            ),
            { numRuns: 50 }
        );
    });

    it('solution segments equal solutionPath.length - 1 for any maze', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 11 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (hexSide, seed) => {
                    const centerHexRadius = Math.max(1, Math.floor(hexSide / 3));
                    const prng = createPRNG(seed);
                    const maze = generateMaze(hexSide, centerHexRadius, prng);
                    const svg = renderMazeSVG(maze, { showSolution: true });
                    expect(count(svg, /class="solution"/g)).toBe(maze.solutionPath.length - 1);
                }
            ),
            { numRuns: 50 }
        );
    });
});

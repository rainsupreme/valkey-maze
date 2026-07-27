import { describe, it, expect } from 'vitest';
import { createPRNG } from '../prng.js';
import { generateRikudo } from '../rikudo.js';
import { renderRikudoSVG } from '../render/rikudo-svg.js';

function count(svg, re) {
    return (svg.match(re) || []).length;
}

const SAMPLE_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 73">' +
    '<path fill="#6983ff" d="M 10 10 L 20 20 Z"/></svg>';

describe('renderRikudoSVG', () => {
    const puzzle = generateRikudo({ radius: 3, prng: createPRNG(123) });

    it('produces a well-formed SVG with one hex per cell plus the hole', () => {
        const svg = renderRikudoSVG(puzzle);
        expect(svg.startsWith('<svg ')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(count(svg, /<polygon class="hex-cell/g)).toBe(puzzle.cells.length);
        expect(count(svg, /class="hole-cell"/g)).toBe(1);
    });

    it('renders pointy-top hexes (a vertex directly above each center)', () => {
        const svg = renderRikudoSVG(puzzle, { cellSize: 30 });
        // The first hex polygon's points: some vertex shares x with the
        // cell center. Cheap proxy: corner list contains two points with
        // equal x (top and bottom vertices).
        const m = svg.match(/<polygon class="hex-cell[^"]*" points="([^"]+)"/);
        const pts = m[1].split(' ').map(p => p.split(',').map(Number));
        const xs = pts.map(([x]) => Math.round(x * 10));
        const dupX = xs.filter((x, i) => xs.indexOf(x) !== i);
        expect(dupX.length).toBeGreaterThan(0);
    });

    it('shows exactly the clue numbers on shaded cells by default', () => {
        const svg = renderRikudoSVG(puzzle);
        expect(count(svg, /class="clue"/g)).toBe(puzzle.clues.length);
        expect(count(svg, /clue-cell/g)).toBe(puzzle.clues.length);
        expect(count(svg, /class="number"/g)).toBe(0);
        expect(count(svg, /class="solution"/g)).toBe(0);
    });

    it('solution mode shows every number and the path polyline', () => {
        const svg = renderRikudoSVG(puzzle, { showSolution: true });
        expect(count(svg, /class="clue"/g)).toBe(puzzle.clues.length);
        expect(count(svg, /class="number"/g)).toBe(puzzle.cells.length - puzzle.clues.length);
        expect(count(svg, /class="solution"/g)).toBe(1);
        // Polyline has one point per cell
        const m = svg.match(/class="solution" points="([^"]+)"/);
        expect(m[1].split(' ').length).toBe(puzzle.cells.length);
    });

    it('embeds the logo in the center hole when provided', () => {
        const withLogo = renderRikudoSVG(puzzle, { logoSvg: SAMPLE_LOGO, logoColor: '#6983ff' });
        expect(count(withLogo, /class="logo"/g)).toBe(1);
        expect(withLogo).toContain('d="M 10 10 L 20 20 Z"');
        const without = renderRikudoSVG(puzzle);
        expect(count(without, /class="logo"/g)).toBe(0);
    });
});

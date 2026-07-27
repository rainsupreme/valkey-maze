import { describe, it, expect } from 'vitest';
import { createPRNG } from '../prng.js';
import { generateSignposts } from '../signposts.js';
import { renderSignpostsSVG, directionAngle } from '../render/signposts-svg.js';

function count(svg, re) {
    return (svg.match(re) || []).length;
}

const SAMPLE_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 73">' +
    '<path fill="#6983ff" d="M 10 10 L 20 20 Z"/></svg>';

describe('directionAngle', () => {
    it('maps hex directions to pointy-top pixel angles', () => {
        expect(directionAngle(0)).toBeCloseTo(0);    // +q -> +x
        expect(directionAngle(3)).toBeCloseTo(180);  // -q -> -x
        expect(directionAngle(5)).toBeCloseTo(60);   // +r -> down-right
        expect(directionAngle(1)).toBeCloseTo(-60);  // +q-r -> up-right
    });
});

describe('renderSignpostsSVG', () => {
    const puzzle = generateSignposts({ radius: 3, prng: createPRNG(31) });

    it('renders one hex per cell, one arrow per non-goal cell, one goal marker', () => {
        const svg = renderSignpostsSVG(puzzle);
        expect(svg.startsWith('<svg ')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(count(svg, /<polygon class="hex-cell/g)).toBe(puzzle.cells.length);
        expect(count(svg, /class="arrow"/g)).toBe(puzzle.cells.length - 1);
        expect(count(svg, /class="goal-marker"/g)).toBe(1);
        expect(count(svg, /class="hole-cell"/g)).toBe(1);
    });

    it('shows exactly the clue numbers by default', () => {
        const svg = renderSignpostsSVG(puzzle);
        expect(count(svg, /class="clue"/g)).toBe(puzzle.clues.length);
        expect(count(svg, /class="number"/g)).toBe(0);
        expect(count(svg, /class="solution"/g)).toBe(0);
    });

    it('solution mode shows every number and the sequence polyline', () => {
        const svg = renderSignpostsSVG(puzzle, { showSolution: true });
        expect(count(svg, /class="clue"/g)).toBe(puzzle.clues.length);
        expect(count(svg, /class="number"/g)).toBe(puzzle.cells.length - puzzle.clues.length);
        const m = svg.match(/class="solution" points="([^"]+)"/);
        expect(m[1].split(' ').length).toBe(puzzle.cells.length);
    });

    it('embeds the logo flush in the hole when provided', () => {
        const svg = renderSignpostsSVG(puzzle, { logoSvg: SAMPLE_LOGO });
        expect(count(svg, /class="logo"/g)).toBe(1);
        expect(renderSignpostsSVG(puzzle)).not.toContain('class="logo"');
    });
});

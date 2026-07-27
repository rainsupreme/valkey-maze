import { describe, it, expect } from 'vitest';
import { createPRNG } from '../prng.js';
import { generateMinesweeper } from '../minesweeper.js';
import { renderMinesweeperSVG } from '../render/minesweeper-svg.js';

function count(svg, re) {
    return (svg.match(re) || []).length;
}

const SAMPLE_LOGO =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 73">' +
    '<path fill="#6983ff" d="M 10 10 L 20 20 Z"/></svg>';

describe('renderMinesweeperSVG', () => {
    const puzzle = generateMinesweeper({ radius: 3, mineCount: 10, prng: createPRNG(9) });

    it('renders one hex per cell, clue numbers, and the mine-count legend', () => {
        const svg = renderMinesweeperSVG(puzzle);
        expect(count(svg, /<polygon class="hex-cell/g)).toBe(puzzle.cells.length);
        expect(count(svg, /class="clue"/g)).toBe(puzzle.clues.length);
        expect(svg).toContain('>Mines: 10</text>');
        expect(count(svg, /class="hole-cell"/g)).toBe(1);
    });

    it('hides mines and safe marks by default', () => {
        const svg = renderMinesweeperSVG(puzzle);
        expect(count(svg, /class="mine"/g)).toBe(0);
        expect(count(svg, /class="safe-mark"/g)).toBe(0);
    });

    it('solution mode marks every mine and every hidden safe cell', () => {
        const svg = renderMinesweeperSVG(puzzle, { showSolution: true });
        expect(count(svg, /class="mine"/g)).toBe(puzzle.mineCount);
        const hiddenSafe = puzzle.cells.length - puzzle.mineCount - puzzle.clues.length;
        expect(count(svg, /class="safe-mark"/g)).toBe(hiddenSafe);
    });

    it('embeds the logo when provided', () => {
        expect(count(renderMinesweeperSVG(puzzle, { logoSvg: SAMPLE_LOGO }), /class="logo"/g)).toBe(1);
        expect(count(renderMinesweeperSVG(puzzle), /class="logo"/g)).toBe(0);
    });
});

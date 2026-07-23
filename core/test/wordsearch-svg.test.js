import { describe, it, expect } from 'vitest';
import { createPRNG } from '../prng.js';
import { generateWordSearch } from '../wordsearch.js';
import { renderWordSearchSVG } from '../render/wordsearch-svg.js';

function count(svg, re) {
    return (svg.match(re) || []).length;
}

describe('renderWordSearchSVG', () => {
    const puzzle = generateWordSearch({
        size: 12,
        words: ['VALKEY', 'CACHE', 'SHARD', 'HIDDEN'],
        prng: createPRNG(7),
    });

    it('produces a well-formed SVG with one cell and letter per grid position', () => {
        const svg = renderWordSearchSVG(puzzle);
        expect(svg.startsWith('<svg ')).toBe(true);
        expect(svg.endsWith('</svg>')).toBe(true);
        expect(count(svg, /class="cell"/g)).toBe(12 * 12);
        expect(count(svg, /class="letter"/g)).toBe(12 * 12);
    });

    it('lists all placed words by default with a Words: header', () => {
        const svg = renderWordSearchSVG(puzzle);
        expect(svg).toContain('>Words:</text>');
        expect(count(svg, /class="word"/g)).toBe(puzzle.placedWords.length);
        expect(count(svg, /class="solution"/g)).toBe(0);
    });

    it('filters the word list via displayWords (hidden words stay off the puzzle)', () => {
        const visible = ['VALKEY', 'CACHE', 'SHARD'];
        const svg = renderWordSearchSVG(puzzle, { displayWords: visible });
        expect(count(svg, /class="word"/g)).toBe(3);
        expect(svg).not.toContain('>HIDDEN</text>');
    });

    it('solution mode strikes every placed word and reveals hidden words', () => {
        const svg = renderWordSearchSVG(puzzle, {
            showSolution: true,
            displayWords: ['VALKEY'], // ignored in solution mode
        });
        expect(svg).toContain('>Solution:</text>');
        expect(count(svg, /class="solution"/g)).toBe(puzzle.placedWords.length);
        expect(count(svg, /class="word"/g)).toBe(puzzle.placedWords.length);
        expect(svg).toContain('>HIDDEN</text>');
    });

    it('solution lines span from first to last letter of each word', () => {
        const svg = renderWordSearchSVG(puzzle, { showSolution: true, cellSize: 30 });
        for (const p of puzzle.placedWords) {
            const x1 = p.col * 30 + 15;
            const y1 = p.row * 30 + 15;
            const x2 = (p.col + (p.word.length - 1) * p.dc) * 30 + 15;
            const y2 = (p.row + (p.word.length - 1) * p.dr) * 30 + 15;
            expect(svg).toContain(`x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`);
        }
    });

    it('viewport height accounts for the word list rows', () => {
        const svg = renderWordSearchSVG(puzzle, { cellSize: 30 });
        const listRows = Math.ceil(puzzle.placedWords.length / 4);
        const height = 12 * 30 + 50 + listRows * 20;
        expect(svg).toContain(`height="${height}"`);
    });
});

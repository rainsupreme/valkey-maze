import { describe, it, expect } from 'vitest';
import { createPRNG } from '../../core/prng.js';
import { generateMaze } from '../../core/maze.js';
import { generateWordSearch } from '../../core/wordsearch.js';
import { parseWordsFile, buildPlacematsHTML, buildAnswerKeyHTML } from '../placemats.js';

function count(html, re) {
    return (html.match(re) || []).length;
}

describe('parseWordsFile', () => {
    it('separates hidden words from display words', () => {
        const text = 'VALKEY\nCACHE\nSECRET # hidden\n\nSHARD\n';
        const { allWords, displayWords } = parseWordsFile(text);
        expect(allWords).toEqual(['VALKEY', 'CACHE', 'SECRET', 'SHARD']);
        expect(displayWords).toEqual(['VALKEY', 'CACHE', 'SHARD']);
    });

    it('ignores blank lines and trims whitespace', () => {
        const { allWords } = parseWordsFile('  A  \n\n\n  B\n');
        expect(allWords).toEqual(['A', 'B']);
    });
});

describe('placemat composition', () => {
    const n = 2;
    const mazes = [];
    const wordSearches = [];
    for (let i = 0; i < n; i++) {
        mazes.push(generateMaze(9, 5, createPRNG(1000 + i)));
        wordSearches.push(generateWordSearch({
            size: 12,
            words: ['VALKEY', 'CACHE', 'SECRET'],
            prng: createPRNG(2000 + i),
        }));
    }
    const displayWords = ['VALKEY', 'CACHE']; // SECRET is hidden

    it('emits one maze page + one word search page per placemat, numbered for duplex', () => {
        const html = buildPlacematsHTML({ mazes, wordSearches, displayWords });
        expect(count(html, /class="page"/g)).toBe(n * 2);
        expect(count(html, /class="puzzle-container maze-container"/g)).toBe(n);
        expect(count(html, /class="puzzle-container wordsearch-container"/g)).toBe(n);
        for (let p = 1; p <= n * 2; p++) {
            expect(html).toContain(`<div class="page-number">${p}</div>`);
        }
    });

    it('embeds SVG puzzles and a notes area on every page', () => {
        const html = buildPlacematsHTML({ mazes, wordSearches, displayWords });
        expect(count(html, /<svg /g)).toBe(n * 2);
        expect(count(html, /<h2>Notes<\/h2>/g)).toBe(n * 2);
    });

    it('keeps hidden words off the puzzle page', () => {
        const html = buildPlacematsHTML({ mazes, wordSearches, displayWords });
        expect(html).not.toContain('>SECRET</text>');
        expect(html).toContain('>VALKEY</text>');
    });

    it('never shows solutions on the placemats', () => {
        const html = buildPlacematsHTML({ mazes, wordSearches, displayWords });
        expect(count(html, /class="solution"/g)).toBe(0);
    });

    it('answer key has one solution per puzzle, labeled with placemat pages', () => {
        const html = buildAnswerKeyHTML({ mazes, wordSearches });
        expect(count(html, /class="answer"/g)).toBe(n * 2);
        expect(html).toContain('Maze 1 Solution (Page 1)');
        expect(html).toContain('Word Search 1 Solution (Page 2)');
        expect(html).toContain('Maze 2 Solution (Page 3)');
        expect(html).toContain('Word Search 2 Solution (Page 4)');
        // Maze solutions drawn + word search strikes drawn
        expect(count(html, /class="solution"/g)).toBeGreaterThan(0);
    });

    it('answer key reveals hidden words', () => {
        const html = buildAnswerKeyHTML({ mazes, wordSearches });
        expect(html).toContain('>SECRET</text>');
    });
});

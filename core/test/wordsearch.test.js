import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createPRNG } from '../prng.js';
import { generateWordSearch, canPlace, isSafePlacement, DIRECTIONS } from '../wordsearch.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BANNED_WORDS = readFileSync(join(HERE, '../data/banned-words.txt'), 'utf8')
    .split('\n')
    .map(l => l.trim().toUpperCase())
    .filter(Boolean);

/** fast-check arbitrary matching the Hypothesis word_lists strategy. */
const wordListsArb = fc.uniqueArray(
    fc.string({ unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'), minLength: 2, maxLength: 8 }),
    { minLength: 1, maxLength: 5 }
);

/** Scan every position/direction for banned words (window up to max banned length). */
function scanGridForBanned(grid, size, banned) {
    const maxLen = Math.max(...[...banned].map(b => b.length));
    const found = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            for (const [dr, dc] of DIRECTIONS) {
                let word = '';
                for (let i = 0; i < maxLen; i++) {
                    const nr = r + i * dr;
                    const nc = c + i * dc;
                    if (nr < 0 || nr >= size || nc < 0 || nc >= size) break;
                    word += grid[nr][nc];
                    if (word.length >= 2 && banned.has(word)) found.push(word);
                }
            }
        }
    }
    return found;
}

describe('canPlace', () => {
    const size = 8;
    const empty = () => Array.from({ length: size }, () => Array(size).fill(''));

    it('rejects out-of-bounds placement', () => {
        expect(canPlace(empty(), size, 'LONGWORD', 0, 5, 0, 1)).toBe(false);
        expect(canPlace(empty(), size, 'CAT', 7, 0, 1, 0)).toBe(false);
    });

    it('rejects conflicting letters and accepts matching overlaps', () => {
        const grid = empty();
        grid[0][1] = 'X';
        expect(canPlace(grid, size, 'CAT', 0, 0, 0, 1)).toBe(false);
        grid[0][1] = 'A';
        expect(canPlace(grid, size, 'CAT', 0, 0, 0, 1)).toBe(true);
    });

    it('accepts placement into empty cells', () => {
        expect(canPlace(empty(), size, 'CAT', 3, 3, 1, 1)).toBe(true);
    });
});

describe('isSafePlacement', () => {
    const size = 8;
    const banned = new Set(['BAD']);

    it('detects completion of a banned word horizontally, vertically, and diagonally', () => {
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1]]) {
            const grid = Array.from({ length: size }, () => Array(size).fill(''));
            // Lay down "BA?" leaving the last cell for the candidate letter
            grid[2][2] = 'B';
            grid[2 + dr][2 + dc] = 'A';
            const r = 2 + 2 * dr;
            const c = 2 + 2 * dc;
            expect(isSafePlacement(grid, size, banned, 3, r, c, 'D')).toBe(false);
            expect(isSafePlacement(grid, size, banned, 3, r, c, 'X')).toBe(true);
        }
    });

    it('detects the banned word when the candidate cell is in the middle', () => {
        const grid = Array.from({ length: size }, () => Array(size).fill(''));
        grid[4][3] = 'B';
        grid[4][5] = 'D';
        expect(isSafePlacement(grid, size, banned, 3, 4, 4, 'A')).toBe(false);
        expect(isSafePlacement(grid, size, banned, 3, 4, 4, 'X')).toBe(true);
    });

    it('window scan covers banned words longer than 9 letters', () => {
        const long = 'ABCDEFGHIJKL'; // 12 letters
        const bannedLong = new Set([long]);
        const grid = Array.from({ length: 15 }, () => Array(15).fill(''));
        for (let i = 0; i < long.length - 1; i++) grid[0][i] = long[i];
        expect(isSafePlacement(grid, 15, bannedLong, long.length, 0, long.length - 1, 'L')).toBe(false);
    });
});

describe('generateWordSearch', () => {
    it('places words readable from the grid (fixed seed)', () => {
        const puzzle = generateWordSearch({
            size: 15,
            words: ['VALKEY', 'CACHE', 'PERFORMANCE'],
            prng: createPRNG(42),
        });
        expect(puzzle.placedWords.length).toBe(3);
        for (const { word, row, col, dr, dc } of puzzle.placedWords) {
            let read = '';
            for (let i = 0; i < word.length; i++) {
                read += puzzle.grid[row + i * dr][col + i * dc];
            }
            expect(read).toBe(word);
        }
    });

    it('reports words too long for the grid as unplaced', () => {
        const puzzle = generateWordSearch({
            size: 8,
            words: ['IMPOSSIBLYLONGWORD'],
            prng: createPRNG(1),
        });
        expect(puzzle.placedWords).toHaveLength(0);
        expect(puzzle.unplacedWords).toEqual(['IMPOSSIBLYLONGWORD']);
    });
});

// ── Ported Hypothesis properties ────────────────────────────

describe('Property: placed words readable from grid', () => {
    it('every placedWords entry reads back from the grid', () => {
        fc.assert(
            fc.property(wordListsArb, fc.integer(), (words, seed) => {
                const puzzle = generateWordSearch({ size: 15, words, prng: createPRNG(seed) });
                for (const { word, row, col, dr, dc } of puzzle.placedWords) {
                    let read = '';
                    for (let i = 0; i < word.length; i++) {
                        read += puzzle.grid[row + i * dr][col + i * dc];
                    }
                    expect(read).toBe(word);
                }
            }),
            { numRuns: 100 }
        );
    });
});

describe('Property: grid fully filled', () => {
    it('every cell contains exactly one A-Z letter', () => {
        fc.assert(
            fc.property(wordListsArb, fc.integer(), (words, seed) => {
                const puzzle = generateWordSearch({ size: 15, words, prng: createPRNG(seed) });
                for (let r = 0; r < puzzle.size; r++) {
                    for (let c = 0; c < puzzle.size; c++) {
                        expect(puzzle.grid[r][c]).toMatch(/^[A-Z]$/);
                    }
                }
            }),
            { numRuns: 100 }
        );
    });
});

describe('Property: all fitting words placed', () => {
    it('every word with length <= grid size ends up in placedWords', () => {
        fc.assert(
            fc.property(wordListsArb, fc.integer(), (words, seed) => {
                const fitting = words.filter(w => w.length <= 15);
                const puzzle = generateWordSearch({ size: 15, words: fitting, prng: createPRNG(seed) });
                const placed = new Set(puzzle.placedWords.map(p => p.word));
                for (const w of fitting) {
                    expect(placed.has(w.toUpperCase())).toBe(true);
                }
            }),
            { numRuns: 100 }
        );
    });
});

describe('Property: no banned words in grid', () => {
    it('completed grids never contain banned words in any direction', () => {
        const banned = new Set(BANNED_WORDS);
        const containsBanned = (text) => {
            for (const b of banned) {
                if (text.includes(b)) return true;
            }
            return false;
        };
        const rev = (s) => [...s].reverse().join('');

        fc.assert(
            fc.property(wordListsArb, fc.integer(), (words, seed) => {
                // Filter out requested words that themselves contain or could
                // combine into banned substrings (mirrors the Python property)
                const safe = words.filter(w => !containsBanned(w) && !containsBanned(rev(w)));
                const filtered = safe.filter(w =>
                    !safe.some(other =>
                        [
                            w + other, other + w,
                            w + rev(other), rev(other) + w,
                            rev(w) + other, other + rev(w),
                            rev(w) + rev(other), rev(other) + rev(w),
                        ].some(containsBanned)
                    )
                );

                const puzzle = generateWordSearch({
                    size: 15,
                    words: filtered,
                    bannedWords: BANNED_WORDS,
                    prng: createPRNG(seed),
                });
                expect(scanGridForBanned(puzzle.grid, puzzle.size, banned)).toEqual([]);
            }),
            { numRuns: 50 }
        );
    }, 60000);
});

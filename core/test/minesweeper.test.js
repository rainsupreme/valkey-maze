import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../prng.js';
import { buildHexCellGrid } from '../hex-cell-grid.js';
import { generateMinesweeper, solveLogically } from '../minesweeper.js';

describe('solveLogically (hand-built boards)', () => {
    // Tiny radius-2 board, hand-placed mines for rule-level checks
    const grid = buildHexCellGrid(2, { centerHole: true });
    const allKeys = [...grid.cells.keys()];

    it('saturation rule: a 0-clue clears its neighbors', () => {
        // No mines at all: any single 0-clue plus the global count (0)
        // solves the whole board
        const clues = new Map([['1,0', 0]]);
        const result = solveLogically(grid.neighbors, clues, 0, allKeys);
        expect(result.solved).toBe(true);
        expect(result.mines.size).toBe(0);
    });

    it('saturation rule: need == cell count marks mines', () => {
        // Corner cell 2,0 has exactly 3 neighbors; give it clue 3
        const neighbors = grid.neighbors.get('2,0');
        expect(neighbors.length).toBe(3);
        const clues = new Map([['2,0', 3]]);
        const result = solveLogically(grid.neighbors, clues, 3, allKeys);
        for (const nk of neighbors) {
            expect(result.mines.has(nk)).toBe(true);
        }
        // Global count then clears everything else
        expect(result.solved).toBe(true);
    });

    it('global mine count acts as a constraint', () => {
        // Zero clues, mineCount equal to all cells: everything is a mine
        const result = solveLogically(grid.neighbors, new Map(), allKeys.length, allKeys);
        expect(result.solved).toBe(true);
        expect(result.mines.size).toBe(allKeys.length);
    });

    it('reports unsolved when information is insufficient', () => {
        // One mine somewhere, no clues: nothing is deducible
        const result = solveLogically(grid.neighbors, new Map(), 1, allKeys);
        expect(result.solved).toBe(false);
    });
});

describe('generateMinesweeper (fixed seed)', () => {
    const puzzle = generateMinesweeper({ radius: 3, mineCount: 10, prng: createPRNG(42) });

    it('produces the 36-cell board with the requested mine count', () => {
        expect(puzzle.cells.length).toBe(36);
        expect(puzzle.solutionMines.length).toBe(10);
        expect(puzzle.mineCount).toBe(10);
    });

    it('is deterministic per seed', () => {
        expect(generateMinesweeper({ radius: 3, mineCount: 10, prng: createPRNG(42) }))
            .toEqual(puzzle);
    });

    it('validates parameters', () => {
        expect(() => generateMinesweeper({ radius: 1, prng: createPRNG(1) })).toThrow(/radius/i);
        expect(() => generateMinesweeper({ radius: 3, mineCount: 0, prng: createPRNG(1) })).toThrow(/mineCount/i);
        expect(() => generateMinesweeper({ radius: 3, mineCount: 36, prng: createPRNG(1) })).toThrow(/mineCount/i);
    });
});

describe('Property: minesweeper validity', () => {
    const params = fc.record({
        radius: fc.integer({ min: 2, max: 3 }),
        seed: fc.integer(),
        density: fc.integer({ min: 20, max: 40 }), // percent
    });

    it('clue cells are safe and their values count adjacent mines exactly', () => {
        fc.assert(
            fc.property(params, ({ radius, seed, density }) => {
                const cells = 3 * radius * (radius + 1);
                const mineCount = Math.max(1, Math.round(cells * density / 100));
                const puzzle = generateMinesweeper({ radius, mineCount, prng: createPRNG(seed) });
                const grid = buildHexCellGrid(radius, { centerHole: true });
                const mineSet = new Set(puzzle.solutionMines.map(([q, r]) => `${q},${r}`));

                for (const { q, r, value } of puzzle.clues) {
                    const key = `${q},${r}`;
                    expect(mineSet.has(key)).toBe(false);
                    const trueCount = (grid.neighbors.get(key) || [])
                        .filter(nk => mineSet.has(nk)).length;
                    expect(value).toBe(trueCount);
                }
            }),
            { numRuns: 30 }
        );
    });

    it('every generated puzzle is solvable by logic alone with the correct mines (no guessing)', () => {
        fc.assert(
            fc.property(params, ({ radius, seed, density }) => {
                const cells = 3 * radius * (radius + 1);
                const mineCount = Math.max(1, Math.round(cells * density / 100));
                const puzzle = generateMinesweeper({ radius, mineCount, prng: createPRNG(seed) });
                const grid = buildHexCellGrid(radius, { centerHole: true });
                const clues = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));

                const result = solveLogically(grid.neighbors, clues, mineCount, [...grid.cells.keys()]);
                expect(result.solved).toBe(true);

                const trueMines = new Set(puzzle.solutionMines.map(([q, r]) => `${q},${r}`));
                expect(result.mines.size).toBe(trueMines.size);
                for (const k of result.mines) {
                    expect(trueMines.has(k)).toBe(true);
                }
            }),
            { numRuns: 30 }
        );
    });
});

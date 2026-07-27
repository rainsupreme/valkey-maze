import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../prng.js';
import { buildHexCellGrid, HEX_DIRECTIONS } from '../hex-cell-grid.js';
import { generateRikudo, countSolutions } from '../rikudo.js';

function isAdjacent([q1, r1], [q2, r2]) {
    return HEX_DIRECTIONS.some(([dq, dr]) => q1 + dq === q2 && r1 + dr === r2);
}

describe('generateRikudo (fixed seed)', () => {
    const puzzle = generateRikudo({ radius: 3, prng: createPRNG(42) });

    it('produces the classic 36-cell board with a center hole', () => {
        expect(puzzle.cells.length).toBe(36);
        expect(puzzle.holeCell).toEqual([0, 0]);
        expect(puzzle.cells.some(c => c.q === 0 && c.r === 0)).toBe(false);
    });

    it('is deterministic for a given seed', () => {
        const again = generateRikudo({ radius: 3, prng: createPRNG(42) });
        expect(again).toEqual(puzzle);
    });

    it('rejects radius < 2', () => {
        expect(() => generateRikudo({ radius: 1, prng: createPRNG(1) })).toThrow(/radius/i);
    });
});

describe('Property: Rikudo solution validity', () => {
    it('solutionPath is a Hamiltonian path of adjacent cells', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 3 }), fc.integer(), (radius, seed) => {
                const puzzle = generateRikudo({ radius, prng: createPRNG(seed) });
                const path = puzzle.solutionPath;

                // Covers every cell exactly once
                expect(path.length).toBe(puzzle.cells.length);
                const seen = new Set(path.map(([q, r]) => `${q},${r}`));
                expect(seen.size).toBe(path.length);
                expect(seen.has('0,0')).toBe(false);

                // Consecutive numbers occupy adjacent cells
                for (let i = 1; i < path.length; i++) {
                    expect(isAdjacent(path[i - 1], path[i])).toBe(true);
                }
            }),
            { numRuns: 15 }
        );
    });

    it('clues agree with the solution and include the endpoints', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 3 }), fc.integer(), (radius, seed) => {
                const puzzle = generateRikudo({ radius, prng: createPRNG(seed) });
                const numberByKey = new Map(
                    puzzle.solutionPath.map(([q, r], i) => [`${q},${r}`, i + 1])
                );
                const values = puzzle.clues.map(c => c.value);
                expect(values).toContain(1);
                expect(values).toContain(puzzle.cells.length);
                for (const { q, r, value } of puzzle.clues) {
                    expect(numberByKey.get(`${q},${r}`)).toBe(value);
                }
            }),
            { numRuns: 15 }
        );
    });

    it('the puzzle has exactly one solution', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 3 }), fc.integer(), (radius, seed) => {
                const puzzle = generateRikudo({ radius, prng: createPRNG(seed) });
                const grid = buildHexCellGrid(radius, { centerHole: true });
                const clues = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
                expect(countSolutions(grid.neighbors, clues, grid.cells.size)).toBe(1);
            }),
            { numRuns: 10 }
        );
    }, 30000);
});

describe('countSolutions', () => {
    it('counts 2+ when clues are too sparse to pin the path', () => {
        // Radius-2 board with only the endpoints as clues is (virtually
        // always) ambiguous -- verify the solver can see that
        const prng = createPRNG(7);
        const puzzle = generateRikudo({ radius: 2, prng });
        const grid = buildHexCellGrid(2, { centerHole: true });
        const endpointOnly = new Map(
            puzzle.clues
                .filter(c => c.value === 1 || c.value === puzzle.cells.length)
                .map(c => [`${c.q},${c.r}`, c.value])
        );
        expect(countSolutions(grid.neighbors, endpointOnly, grid.cells.size)).toBeGreaterThan(1);
    });

    it('requires 1 to be a clue', () => {
        const grid = buildHexCellGrid(2, { centerHole: true });
        expect(() => countSolutions(grid.neighbors, new Map(), grid.cells.size)).toThrow(/requires 1/);
    });
});

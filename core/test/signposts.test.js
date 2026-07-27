import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../prng.js';
import { buildHexCellGrid } from '../hex-cell-grid.js';
import { generateSignposts, countSolutions, buildRays, directionBetween } from '../signposts.js';

describe('directionBetween', () => {
    it('detects ray alignment with the correct direction', () => {
        expect(directionBetween('0,0', '3,0')).toBe(0);  // +q
        expect(directionBetween('0,0', '0,2')).toBe(5);  // +r
        expect(directionBetween('0,0', '-2,2')).toBe(4); // -q +r
    });

    it('returns null for non-aligned cells', () => {
        expect(directionBetween('0,0', '1,1')).toBeNull();
        expect(directionBetween('0,0', '2,-3')).toBeNull();
    });
});

describe('buildRays', () => {
    it('the center hole blocks rays', () => {
        const grid = buildHexCellGrid(2, { centerHole: true });
        const { rays } = buildRays(grid);
        // From (-2,0), direction 0 (+q) runs toward the hole at (0,0):
        // only (-1,0) is visible; (1,0) and (2,0) lie beyond the hole
        const ray = rays.get('-2,0')[0];
        expect(ray).toEqual(['-1,0']);
    });

    it('rays stop at the board edge', () => {
        const grid = buildHexCellGrid(2, { centerHole: true });
        const { rays } = buildRays(grid);
        expect(rays.get('2,0')[0]).toEqual([]); // already at +q edge
    });
});

describe('generateSignposts (fixed seed)', () => {
    const puzzle = generateSignposts({ radius: 3, prng: createPRNG(7) });

    it('produces 36 cells, one goal cell, and arrows everywhere else', () => {
        expect(puzzle.cells.length).toBe(36);
        const goals = puzzle.arrows.filter(a => a.dir === null);
        expect(goals.length).toBe(1);
        // The goal is the last cell of the sequence
        const [gq, gr] = puzzle.solutionPath[puzzle.solutionPath.length - 1];
        expect(goals[0].q).toBe(gq);
        expect(goals[0].r).toBe(gr);
    });

    it('is deterministic per seed', () => {
        expect(generateSignposts({ radius: 3, prng: createPRNG(7) })).toEqual(puzzle);
    });

    it('rejects radius < 2', () => {
        expect(() => generateSignposts({ radius: 1, prng: createPRNG(1) })).toThrow(/radius/i);
    });
});

describe('Property: Signposts solution validity', () => {
    it('sequence covers all cells once; consecutive cells are ray-aligned along the arrow', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 3 }), fc.integer(), (radius, seed) => {
                const puzzle = generateSignposts({ radius, prng: createPRNG(seed) });
                const path = puzzle.solutionPath.map(([q, r]) => `${q},${r}`);

                expect(path.length).toBe(puzzle.cells.length);
                expect(new Set(path).size).toBe(path.length);
                expect(path).not.toContain('0,0');

                const arrowByKey = new Map(puzzle.arrows.map(a => [`${a.q},${a.r}`, a.dir]));
                const grid = buildHexCellGrid(radius, { centerHole: true });
                const { rays } = buildRays(grid);
                for (let i = 0; i < path.length - 1; i++) {
                    const dir = directionBetween(path[i], path[i + 1]);
                    expect(dir).not.toBeNull();
                    // The arrow points exactly at the successor's direction
                    expect(arrowByKey.get(path[i])).toBe(dir);
                    // And the successor is genuinely visible (hole not in between)
                    expect(rays.get(path[i])[dir]).toContain(path[i + 1]);
                }
            }),
            { numRuns: 15 }
        );
    });

    it('clues agree with the solution and include the endpoints', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 3 }), fc.integer(), (radius, seed) => {
                const puzzle = generateSignposts({ radius, prng: createPRNG(seed) });
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
                const puzzle = generateSignposts({ radius, prng: createPRNG(seed) });
                const grid = buildHexCellGrid(radius, { centerHole: true });
                const { rays } = buildRays(grid);
                const arrowByKey = new Map(
                    puzzle.arrows.filter(a => a.dir !== null).map(a => [`${a.q},${a.r}`, a.dir])
                );
                const clues = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
                expect(countSolutions(rays, arrowByKey, clues, grid.cells.size)).toBe(1);
            }),
            { numRuns: 10 }
        );
    }, 30000);
});

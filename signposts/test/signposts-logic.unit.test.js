import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../../core/prng.js';
import { generateSignposts } from '../../core/signposts.js';
import { createBoard, initialPath, candidates, canExtend, applyCell, isWin } from '../signposts.logic.js';

const puzzle = generateSignposts({ radius: 2, prng: createPRNG(55) });
const board = createBoard(puzzle);
const solutionKeys = puzzle.solutionPath.map(([q, r]) => `${q},${r}`);

describe('createBoard / initialPath', () => {
    it('starts at clue 1', () => {
        expect(initialPath(board)).toEqual([solutionKeys[0]]);
        expect(board.clueByKey.get(solutionKeys[0])).toBe(1);
    });
});

describe('candidates', () => {
    it('includes the true next solution cell', () => {
        expect(candidates(board, initialPath(board))).toContain(solutionKeys[1]);
    });

    it('only offers cells on the end arrow ray', () => {
        const path = solutionKeys.slice(0, 3);
        const end = path[path.length - 1];
        const dir = board.arrowByKey.get(end);
        const ray = board.rays.get(end)[dir];
        for (const key of candidates(board, path)) {
            expect(ray).toContain(key);
        }
    });

    it('never offers visited cells or wrong-number clue cells', () => {
        const path = solutionKeys.slice(0, 4);
        for (const key of candidates(board, path)) {
            expect(path).not.toContain(key);
            const clue = board.clueByKey.get(key);
            if (clue !== undefined) expect(clue).toBe(path.length + 1);
        }
    });

    it('is empty once the puzzle is complete', () => {
        expect(candidates(board, solutionKeys)).toEqual([]);
    });
});

describe('applyCell', () => {
    it('extends on a valid tap', () => {
        const { path, changed } = applyCell(board, initialPath(board), solutionKeys[1]);
        expect(changed).toBe(true);
        expect(path).toEqual(solutionKeys.slice(0, 2));
    });

    it('truncates back to a tapped path cell and backtracks on the end', () => {
        expect(applyCell(board, solutionKeys.slice(0, 5), solutionKeys[2]).path)
            .toEqual(solutionKeys.slice(0, 3));
        expect(applyCell(board, solutionKeys.slice(0, 5), solutionKeys[4]).path)
            .toEqual(solutionKeys.slice(0, 4));
    });

    it('never removes cell 1 and ignores invalid taps', () => {
        const start = initialPath(board);
        expect(applyCell(board, start, start[0]).changed).toBe(false);
        const offRay = solutionKeys.find(k => !canExtend(board, start, k) && k !== start[0]);
        expect(applyCell(board, start, offRay).changed).toBe(false);
    });
});

describe('isWin', () => {
    it('the full solution is always reachable through applyCell', () => {
        fc.assert(
            fc.property(fc.integer(), (seed) => {
                const p = generateSignposts({ radius: 2, prng: createPRNG(seed) });
                const b = createBoard(p);
                const keys = p.solutionPath.map(([q, r]) => `${q},${r}`);
                let path = initialPath(b);
                for (const key of keys.slice(1)) {
                    const result = applyCell(b, path, key);
                    expect(result.changed).toBe(true);
                    path = result.path;
                }
                expect(isWin(b, path)).toBe(true);
            }),
            { numRuns: 20 }
        );
    });
});

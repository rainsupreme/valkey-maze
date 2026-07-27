import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../../core/prng.js';
import { generateRikudo } from '../../core/rikudo.js';
import { createBoard, initialPath, canExtend, applyCell, applyDrag, isWin } from '../rikudo.logic.js';

const puzzle = generateRikudo({ radius: 2, prng: createPRNG(99) });
const board = createBoard(puzzle);
const solutionKeys = puzzle.solutionPath.map(([q, r]) => `${q},${r}`);

describe('createBoard / initialPath', () => {
    it('starts the path at clue 1', () => {
        const path = initialPath(board);
        expect(path).toEqual([solutionKeys[0]]);
        expect(board.clueByKey.get(path[0])).toBe(1);
    });
});

describe('canExtend', () => {
    it('accepts the true next solution cell', () => {
        expect(canExtend(board, [solutionKeys[0]], solutionKeys[1])).toBe(true);
    });

    it('rejects non-adjacent cells and revisits', () => {
        const path = solutionKeys.slice(0, 3);
        expect(canExtend(board, path, solutionKeys[0])).toBe(false); // revisit
        // A cell that is on the board but not adjacent to the path end
        const end = path[path.length - 1];
        const nonAdjacent = solutionKeys.find(
            k => !path.includes(k) && !(board.neighbors.get(end) || []).includes(k)
        );
        expect(canExtend(board, path, nonAdjacent)).toBe(false);
    });

    it('forces clue numbers onto their clue cells', () => {
        // Walk the solution up to just before some middle clue
        const middleClue = puzzle.clues.find(c => c.value > 1 && c.value < board.total);
        const clueKey = `${middleClue.q},${middleClue.r}`;
        const path = solutionKeys.slice(0, middleClue.value - 1);

        // The clue cell itself is acceptable...
        expect(canExtend(board, path, clueKey)).toBe(true);
        // ...and any other adjacent unvisited cell is not
        const end = path[path.length - 1];
        for (const nk of board.neighbors.get(end) || []) {
            if (nk === clueKey || path.includes(nk)) continue;
            expect(canExtend(board, path, nk)).toBe(false);
        }
    });

    it('never allows entering a clue cell with the wrong number', () => {
        // From the start, try to step onto a clue whose value is not 2
        const wrongClue = puzzle.clues.find(c => c.value > 2);
        const wrongKey = `${wrongClue.q},${wrongClue.r}`;
        expect(canExtend(board, initialPath(board), wrongKey)).toBe(false);
    });
});

describe('applyCell', () => {
    it('extends on a valid tap and reports change', () => {
        const { path, changed } = applyCell(board, initialPath(board), solutionKeys[1]);
        expect(changed).toBe(true);
        expect(path).toEqual(solutionKeys.slice(0, 2));
    });

    it('truncates back to a tapped path cell', () => {
        const { path, changed } = applyCell(board, solutionKeys.slice(0, 5), solutionKeys[2]);
        expect(changed).toBe(true);
        expect(path).toEqual(solutionKeys.slice(0, 3));
    });

    it('tapping the path end backtracks one step', () => {
        const { path } = applyCell(board, solutionKeys.slice(0, 5), solutionKeys[4]);
        expect(path).toEqual(solutionKeys.slice(0, 4));
    });

    it('never removes cell 1', () => {
        const start = initialPath(board);
        const { path, changed } = applyCell(board, start, start[0]);
        expect(changed).toBe(false);
        expect(path).toEqual(start);
    });

    it('ignores invalid taps', () => {
        const path = solutionKeys.slice(0, 3);
        const end = path[path.length - 1];
        const nonAdjacent = solutionKeys.find(
            k => !path.includes(k) && !(board.neighbors.get(end) || []).includes(k)
        );
        expect(applyCell(board, path, nonAdjacent).changed).toBe(false);
    });
});

describe('applyDrag', () => {
    it('dragging onto the previous cell backtracks', () => {
        const { path, changed } = applyDrag(board, solutionKeys.slice(0, 5), solutionKeys[3]);
        expect(changed).toBe(true);
        expect(path).toEqual(solutionKeys.slice(0, 4));
    });

    it('dragging across an earlier path cell is ignored (no accidental truncation)', () => {
        const { changed } = applyDrag(board, solutionKeys.slice(0, 5), solutionKeys[1]);
        expect(changed).toBe(false);
    });
});

describe('isWin', () => {
    it('is false mid-solve and true when the full solution is drawn', () => {
        expect(isWin(board, solutionKeys.slice(0, 5))).toBe(false);
        expect(isWin(board, solutionKeys)).toBe(true);
    });

    it('the full solution path is always reachable through applyDrag', () => {
        fc.assert(
            fc.property(fc.integer(), (seed) => {
                const p = generateRikudo({ radius: 2, prng: createPRNG(seed) });
                const b = createBoard(p);
                const keys = p.solutionPath.map(([q, r]) => `${q},${r}`);
                let path = initialPath(b);
                for (const key of keys.slice(1)) {
                    const result = applyDrag(b, path, key);
                    expect(result.changed).toBe(true);
                    path = result.path;
                }
                expect(isWin(b, path)).toBe(true);
            }),
            { numRuns: 20 }
        );
    });
});

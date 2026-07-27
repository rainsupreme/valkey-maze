import { describe, it, expect } from 'vitest';
import { createPRNG } from '../../core/prng.js';
import { generateMinesweeper } from '../../core/minesweeper.js';
import { createBoard, initialMarks, cycleMark, flaggedCount, isWin, validateMarks, MARK } from '../minesweeper.logic.js';

const puzzle = generateMinesweeper({ radius: 2, mineCount: 5, prng: createPRNG(11) });
const board = createBoard(puzzle);
const mineKeys = [...board.mineSet];
const unknownSafe = board.cellKeys.filter(k => !board.mineSet.has(k) && !board.clueByKey.has(k));

describe('cycleMark', () => {
    it('cycles unknown -> mine -> safe -> unknown', () => {
        const key = mineKeys[0];
        let { marks } = cycleMark(board, initialMarks(), key);
        expect(marks.get(key)).toBe(MARK.MINE);
        ({ marks } = cycleMark(board, marks, key));
        expect(marks.get(key)).toBe(MARK.SAFE);
        ({ marks } = cycleMark(board, marks, key));
        expect(marks.has(key)).toBe(false);
    });

    it('does not mutate the input marks map', () => {
        const original = initialMarks();
        cycleMark(board, original, mineKeys[0]);
        expect(original.size).toBe(0);
    });

    it('ignores clue cells and off-board keys', () => {
        const clueKey = puzzle.clues[0] && `${puzzle.clues[0].q},${puzzle.clues[0].r}`;
        expect(cycleMark(board, initialMarks(), clueKey).changed).toBe(false);
        expect(cycleMark(board, initialMarks(), '99,99').changed).toBe(false);
    });
});

describe('isWin / flaggedCount', () => {
    it('wins when exactly the mines are flagged', () => {
        let marks = initialMarks();
        for (const key of mineKeys) {
            marks = new Map(marks).set(key, MARK.MINE);
        }
        expect(flaggedCount(marks)).toBe(board.mineCount);
        expect(isWin(board, marks)).toBe(true);
    });

    it('safe marks are optional for the win', () => {
        const marks = new Map(mineKeys.map(k => [k, MARK.MINE]));
        marks.set(unknownSafe[0], MARK.SAFE);
        expect(isWin(board, marks)).toBe(true);
    });

    it('a wrong flag prevents the win even with all mines flagged', () => {
        const marks = new Map(mineKeys.map(k => [k, MARK.MINE]));
        marks.set(unknownSafe[0], MARK.MINE);
        expect(isWin(board, marks)).toBe(false);
    });

    it('partial flagging is not a win', () => {
        const marks = new Map([[mineKeys[0], MARK.MINE]]);
        expect(isWin(board, marks)).toBe(false);
    });
});

describe('validateMarks', () => {
    it('accepts a legal saved state', () => {
        const marks = validateMarks(board, { [mineKeys[0]]: 'mine', [unknownSafe[0]]: 'safe' });
        expect(marks).not.toBeNull();
        expect(marks.get(mineKeys[0])).toBe(MARK.MINE);
    });

    it('rejects clue cells, unknown keys, and bad values', () => {
        const clueKey = `${puzzle.clues[0].q},${puzzle.clues[0].r}`;
        expect(validateMarks(board, { [clueKey]: 'mine' })).toBeNull();
        expect(validateMarks(board, { '99,99': 'mine' })).toBeNull();
        expect(validateMarks(board, { [mineKeys[0]]: 'bomb' })).toBeNull();
        expect(validateMarks(board, null)).toBeNull();
        expect(validateMarks(board, [1, 2])).toBeNull();
    });
});

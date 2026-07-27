import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../../core/prng.js';
import { generateSignposts } from '../../core/signposts.js';
import {
    createBoard, initialLinks, fragments, numbering, candidates,
    canLink, applyLink, removeLink, isWin, winOrder,
} from '../signposts.logic.js';

const puzzle = generateSignposts({ radius: 2, prng: createPRNG(55) });
const board = createBoard(puzzle);
const solutionKeys = puzzle.solutionPath.map(([q, r]) => `${q},${r}`);

/** Link consecutive solution cells for the given index pairs. */
function linkRun(links, from, to) {
    for (let i = from; i < to; i++) {
        const result = applyLink(board, links, solutionKeys[i], solutionKeys[i + 1]);
        expect(result.changed).toBe(true);
        links = result.links;
    }
    return links;
}

describe('createBoard', () => {
    it('startKey is the cell holding clue 1', () => {
        expect(board.clueByKey.get(board.startKey)).toBe(1);
        expect(board.startKey).toBe(solutionKeys[0]);
    });
});

describe('canLink / candidates', () => {
    it('any cell may link along its arrow ray, not just the sequence end', () => {
        const links = initialLinks();
        // A mid-solution link with no other links present
        const from = solutionKeys[3];
        const to = solutionKeys[4];
        expect(canLink(board, links, from, to)).toBe(true);
        expect(candidates(board, links, from)).toContain(to);
    });

    it('only offers cells on the source arrow ray', () => {
        const from = solutionKeys[2];
        const dir = board.arrowByKey.get(from);
        const ray = board.rays.get(from)[dir];
        for (const key of candidates(board, initialLinks(), from)) {
            expect(ray).toContain(key);
        }
    });

    it('rejects a target that already has an incoming link', () => {
        const links = linkRun(initialLinks(), 0, 1);
        // Another cell whose ray contains solutionKeys[1]
        const other = puzzle.cells.map(c => `${c.q},${c.r}`).find(key => {
            const dir = board.arrowByKey.get(key);
            return key !== solutionKeys[0] && dir !== null && dir !== undefined
                && board.rays.get(key)[dir].includes(solutionKeys[1]);
        });
        if (other) expect(canLink(board, links, other, solutionKeys[1])).toBe(false);
    });

    it('rejects cycles', () => {
        // Find two cells that can point at each other
        const keys = puzzle.cells.map(c => `${c.q},${c.r}`);
        for (const a of keys) {
            const dirA = board.arrowByKey.get(a);
            if (dirA === null || dirA === undefined) continue;
            for (const b of board.rays.get(a)[dirA]) {
                const dirB = board.arrowByKey.get(b);
                if (dirB === null || dirB === undefined) continue;
                if (!board.rays.get(b)[dirB].includes(a)) continue;
                const { links } = applyLink(board, initialLinks(), a, b);
                expect(canLink(board, links, b, a)).toBe(false);
                return;
            }
        }
    });

    it('rejects links that violate clue numbering', () => {
        // Linking the 1-clue to a cell holding a clue other than 2 is illegal
        const wrongClue = puzzle.clues.find(c => c.value > 2);
        if (!wrongClue) return;
        const key = `${wrongClue.q},${wrongClue.r}`;
        const dir = board.arrowByKey.get(board.startKey);
        if (board.rays.get(board.startKey)[dir].includes(key)) {
            expect(canLink(board, initialLinks(), board.startKey, key)).toBe(false);
        }
    });

    it('goal cell has no candidates', () => {
        expect(candidates(board, initialLinks(), solutionKeys[solutionKeys.length - 1]))
            .toEqual([]);
    });
});

describe('fragments / numbering', () => {
    it('separate runs form separate fragments and merge when connected', () => {
        let links = linkRun(initialLinks(), 0, 2);   // 1-2-3
        links = linkRun(links, 3, 5);                 // 4-5-6 (separate)
        expect(fragments(links).length).toBe(2);
        links = linkRun(links, 2, 3);                 // join
        expect(fragments(links).length).toBe(1);
    });

    it('anchored fragments show absolute numbers', () => {
        const links = linkRun(initialLinks(), 0, 2);
        const { numberByKey } = numbering(board, links);
        expect(numberByKey.get(solutionKeys[0])).toBe(1);
        expect(numberByKey.get(solutionKeys[1])).toBe(2);
        expect(numberByKey.get(solutionKeys[2])).toBe(3);
    });

    it('unanchored fragments show relative labels', () => {
        // Find a clue-free consecutive solution pair
        let i = 1;
        while (i < solutionKeys.length - 1 &&
            (board.clueByKey.has(solutionKeys[i]) || board.clueByKey.has(solutionKeys[i + 1]))) i++;
        if (i >= solutionKeys.length - 1) return;
        const links = linkRun(initialLinks(), i, i + 1);
        const { numberByKey, labelByKey } = numbering(board, links);
        expect(numberByKey.has(solutionKeys[i])).toBe(false);
        expect(labelByKey.get(solutionKeys[i])).toMatch(/^[a-z]$/);
        expect(labelByKey.get(solutionKeys[i + 1])).toMatch(/^[a-z]\+1$/);
    });
});

describe('applyLink / removeLink', () => {
    it('applyLink adds a link; removeLink removes it', () => {
        const { links, changed } = applyLink(board, initialLinks(), solutionKeys[0], solutionKeys[1]);
        expect(changed).toBe(true);
        expect(links.get(solutionKeys[0])).toBe(solutionKeys[1]);
        const removed = removeLink(links, solutionKeys[0]);
        expect(removed.changed).toBe(true);
        expect(removed.links.size).toBe(0);
    });

    it('invalid links leave the state unchanged', () => {
        const start = initialLinks();
        const offRay = solutionKeys.find(k => {
            const dir = board.arrowByKey.get(board.startKey);
            return k !== board.startKey && !board.rays.get(board.startKey)[dir].includes(k);
        });
        expect(applyLink(board, start, board.startKey, offRay).changed).toBe(false);
        expect(removeLink(start, board.startKey).changed).toBe(false);
    });
});

describe('isWin / winOrder', () => {
    it('solving strictly in order wins', () => {
        const links = linkRun(initialLinks(), 0, solutionKeys.length - 1);
        expect(isWin(board, links)).toBe(true);
        expect(winOrder(board, links)).toEqual(solutionKeys);
    });

    it('solving out of order wins too', () => {
        // Build back half first, then front half, then join
        const n = solutionKeys.length;
        const mid = Math.floor(n / 2);
        let links = linkRun(initialLinks(), mid, n - 1);
        expect(isWin(board, links)).toBe(false);
        links = linkRun(links, 0, mid - 1);
        expect(isWin(board, links)).toBe(false);
        links = linkRun(links, mid - 1, mid); // the joining link
        expect(isWin(board, links)).toBe(true);
        expect(winOrder(board, links)).toEqual(solutionKeys);
    });

    it('property: the solution is reachable via random link order', () => {
        fc.assert(
            fc.property(fc.integer(), (seed) => {
                const p = generateSignposts({ radius: 2, prng: createPRNG(seed) });
                const b = createBoard(p);
                const keys = p.solutionPath.map(([q, r]) => `${q},${r}`);
                // Shuffle the link indices deterministically from the seed
                const order = keys.slice(0, -1).map((_, i) => i);
                const shufflePrng = createPRNG(seed ^ 0x5f5f5f5f);
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(shufflePrng.next() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                let links = initialLinks();
                for (const i of order) {
                    const result = applyLink(b, links, keys[i], keys[i + 1]);
                    expect(result.changed).toBe(true);
                    links = result.links;
                }
                expect(isWin(b, links)).toBe(true);
            }),
            { numRuns: 20 }
        );
    });
});

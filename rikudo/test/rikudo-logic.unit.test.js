import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPRNG } from '../../core/prng.js';
import { generateRikudo } from '../../core/rikudo.js';
import {
    createBoard, initialEdges, edgeId, fragments, feasibleNumberings,
    numbering, canAddEdge, addEdge, removeEdge, isWin, winOrder,
} from '../rikudo.logic.js';

const puzzle = generateRikudo({ radius: 2, prng: createPRNG(7) });
const board = createBoard(puzzle);
const solutionKeys = puzzle.solutionPath.map(([q, r]) => `${q},${r}`);

/** Add the solution edges for indices [from, to). */
function linkRun(edges, from, to) {
    for (let i = from; i < to; i++) {
        const result = addEdge(board, edges, solutionKeys[i], solutionKeys[i + 1]);
        expect(result.changed).toBe(true);
        edges = result.edges;
    }
    return edges;
}

describe('edgeId', () => {
    it('is order-independent', () => {
        expect(edgeId('1,0', '0,1')).toBe(edgeId('0,1', '1,0'));
    });
});

describe('canAddEdge', () => {
    it('accepts any adjacent pair on an empty board (mid-solution too)', () => {
        expect(canAddEdge(board, initialEdges(), solutionKeys[4], solutionKeys[5])).toBe(true);
    });

    it('rejects non-adjacent cells and duplicate edges', () => {
        const far = solutionKeys.find(k => !(board.neighbors.get(solutionKeys[0]) || []).includes(k)
            && k !== solutionKeys[0]);
        expect(canAddEdge(board, initialEdges(), solutionKeys[0], far)).toBe(false);
        const edges = linkRun(initialEdges(), 0, 1);
        expect(canAddEdge(board, edges, solutionKeys[0], solutionKeys[1])).toBe(false);
    });

    it('rejects a third edge on a cell (degree cap 2)', () => {
        const mid = solutionKeys[5];
        const nbrs = board.neighbors.get(mid).filter(k => !board.clueByKey.has(k)
            || board.clueByKey.get(k) > 2);
        if (nbrs.length < 3) return;
        let edges = initialEdges();
        let added = 0;
        for (const n of nbrs) {
            const result = addEdge(board, edges, mid, n);
            if (result.changed) { edges = result.edges; added++; }
            if (added === 2) break;
        }
        if (added === 2) {
            const third = nbrs.find(n => !edges.has(edgeId(mid, n)));
            if (third) expect(canAddEdge(board, edges, mid, third)).toBe(false);
        }
    });

    it('the 1-clue and N-clue cells cap at one edge', () => {
        const edges = linkRun(initialEdges(), 0, 1); // uses 1-clue's only slot
        const other = board.neighbors.get(board.startKey)
            .find(k => k !== solutionKeys[1] && canAddEdge(board, initialEdges(), board.startKey, k));
        if (other) expect(canAddEdge(board, edges, board.startKey, other)).toBe(false);
    });

    it('rejects cycles', () => {
        // Find a triangle: three mutually adjacent clue-free cells
        const keys = puzzle.cells.map(c => `${c.q},${c.r}`);
        for (const a of keys) {
            for (const b of board.neighbors.get(a)) {
                for (const c of board.neighbors.get(b)) {
                    if (c === a || !(board.neighbors.get(c) || []).includes(a)) continue;
                    let edges = initialEdges();
                    const r1 = addEdge(board, edges, a, b);
                    if (!r1.changed) continue;
                    const r2 = addEdge(board, r1.edges, b, c);
                    if (!r2.changed) continue;
                    expect(canAddEdge(board, r2.edges, c, a)).toBe(false);
                    return;
                }
            }
        }
    });

    it('rejects merges that violate the clues', () => {
        // A fragment spanning two clues at the wrong distance is illegal:
        // walk clue values v1 < v2 with a solution-path distance d; a
        // direct chain of length != d between them must be refused when
        // one exists shorter than d. Simplest concrete case: linking two
        // clue cells directly when their values differ by more than 1.
        const clues = [...board.clueByKey.entries()];
        for (const [k1, v1] of clues) {
            for (const [k2, v2] of clues) {
                if (Math.abs(v1 - v2) <= 1) continue;
                if (!(board.neighbors.get(k1) || []).includes(k2)) continue;
                expect(canAddEdge(board, initialEdges(), k1, k2)).toBe(false);
                return;
            }
        }
    });
});

describe('fragments / numbering', () => {
    it('separate runs are separate fragments; joining merges them', () => {
        let edges = linkRun(initialEdges(), 0, 2);
        edges = linkRun(edges, 3, 5);
        expect(fragments(edges).length).toBe(2);
        edges = linkRun(edges, 2, 3);
        expect(fragments(edges).length).toBe(1);
    });

    it('a fragment through a clue shows forced numbers', () => {
        // Edges on both sides of the 1-clue... the 1-clue caps at one
        // edge; use the run starting at it: 1-2-3 is forced (base 1,
        // orientation pinned by the boundary)
        const edges = linkRun(initialEdges(), 0, 2);
        const numberByKey = numbering(board, edges);
        expect(numberByKey.get(solutionKeys[0])).toBe(1);
        expect(numberByKey.get(solutionKeys[1])).toBe(2);
        expect(numberByKey.get(solutionKeys[2])).toBe(3);
    });

    it('clue-free fragments stay unnumbered while ambiguous', () => {
        // Find two consecutive clue-free solution cells away from clues
        let i = 1;
        while (i < solutionKeys.length - 2 &&
            (board.clueByKey.has(solutionKeys[i]) || board.clueByKey.has(solutionKeys[i + 1]))) i++;
        if (i >= solutionKeys.length - 2) return;
        const edges = linkRun(initialEdges(), i, i + 1);
        const numberByKey = numbering(board, edges);
        expect(numberByKey.has(solutionKeys[i])).toBe(false);
        expect(numberByKey.has(solutionKeys[i + 1])).toBe(false);
    });

    it('feasibleNumberings returns both orientations for a symmetric-free fragment', () => {
        const chain = [solutionKeys[0], solutionKeys[1]];
        const feasible = feasibleNumberings(board, chain);
        // 1-clue at an end: only base 1 with the clue first is legal
        expect(feasible.length).toBe(1);
        expect(feasible[0].base).toBe(1);
        expect(feasible[0].chain[0]).toBe(solutionKeys[0]);
    });
});

describe('addEdge / removeEdge', () => {
    it('addEdge adds; removeEdge removes', () => {
        const { edges, changed } = addEdge(board, initialEdges(), solutionKeys[0], solutionKeys[1]);
        expect(changed).toBe(true);
        const id = edgeId(solutionKeys[0], solutionKeys[1]);
        expect(edges.has(id)).toBe(true);
        const removed = removeEdge(edges, id);
        expect(removed.changed).toBe(true);
        expect(removed.edges.size).toBe(0);
    });

    it('invalid operations leave the state unchanged', () => {
        expect(removeEdge(initialEdges(), 'nope|nada').changed).toBe(false);
    });
});

describe('isWin / winOrder', () => {
    it('solving strictly in order wins', () => {
        const edges = linkRun(initialEdges(), 0, solutionKeys.length - 1);
        expect(isWin(board, edges)).toBe(true);
        expect(winOrder(board, edges)).toEqual(solutionKeys);
    });

    it('solving out of order wins too', () => {
        const n = solutionKeys.length;
        const mid = Math.floor(n / 2);
        let edges = linkRun(initialEdges(), mid, n - 1);
        expect(isWin(board, edges)).toBe(false);
        edges = linkRun(edges, 0, mid);
        expect(isWin(board, edges)).toBe(true);
        expect(winOrder(board, edges)).toEqual(solutionKeys);
    });

    it('property: the solution is reachable via random edge order', () => {
        fc.assert(
            fc.property(fc.integer(), (seed) => {
                const p = generateRikudo({ radius: 2, prng: createPRNG(seed) });
                const b = createBoard(p);
                const keys = p.solutionPath.map(([q, r]) => `${q},${r}`);
                const order = keys.slice(0, -1).map((_, i) => i);
                const shufflePrng = createPRNG(seed ^ 0x3c3c3c3c);
                for (let i = order.length - 1; i > 0; i--) {
                    const j = Math.floor(shufflePrng.next() * (i + 1));
                    [order[i], order[j]] = [order[j], order[i]];
                }
                let edges = initialEdges();
                for (const i of order) {
                    const result = addEdge(b, edges, keys[i], keys[i + 1]);
                    expect(result.changed).toBe(true);
                    edges = result.edges;
                }
                expect(isWin(b, edges)).toBe(true);
            }),
            { numRuns: 20 }
        );
    });
});

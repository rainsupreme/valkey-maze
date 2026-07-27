// ── Rikudo edge-drawing logic (pure, no DOM) ────────────────
//
// Link-based play: the player connects adjacent cells with undirected
// edges. Edges form path fragments (each cell touches at most two
// edges, no cycles). Because edges have no direction, a fragment's
// numbering may be ambiguous; numbers display once the clues (or the
// board boundary 1..N) force a unique assignment. The puzzle is
// solved when one fragment covers every cell and satisfies the clues.

import { HEX_DIRECTIONS } from '../core/hex-cell-grid.js';

/**
 * Build the immutable lookup state for a puzzle.
 * @param {object} puzzle - from generateRikudo()
 */
export function createBoard(puzzle) {
    const cellKeys = puzzle.cells.map(({ q, r }) => `${q},${r}`);
    const cellSet = new Set(cellKeys);

    const neighbors = new Map();
    for (const { q, r } of puzzle.cells) {
        const adj = [];
        for (const [dq, dr] of HEX_DIRECTIONS) {
            const nk = `${q + dq},${r + dr}`;
            if (cellSet.has(nk)) adj.push(nk);
        }
        neighbors.set(`${q},${r}`, adj);
    }

    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const clueByNumber = new Map(puzzle.clues.map(c => [c.value, `${c.q},${c.r}`]));

    return {
        total: puzzle.cells.length,
        neighbors,
        clueByKey,
        clueByNumber,
        startKey: clueByNumber.get(1),
    };
}

/** Canonical id of the undirected edge between two cells. */
export function edgeId(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** A fresh state: no edges. */
export function initialEdges() {
    return new Set();
}

/** Map of cell -> array of edge-connected neighbor cells. */
function adjacency(edges) {
    const adj = new Map();
    for (const id of edges) {
        const [a, b] = id.split('|');
        if (!adj.has(a)) adj.set(a, []);
        if (!adj.has(b)) adj.set(b, []);
        adj.get(a).push(b);
        adj.get(b).push(a);
    }
    return adj;
}

/**
 * Decompose the edges into path fragments (arrays of cell keys in
 * walk order; orientation arbitrary). Cells with no edges are not
 * fragments.
 */
export function fragments(edges) {
    const adj = adjacency(edges);
    const seen = new Set();
    const result = [];
    for (const [cell, nbrs] of adj) {
        if (seen.has(cell) || nbrs.length !== 1) continue; // start at ends
        const chain = [cell];
        seen.add(cell);
        let prev = null;
        let cur = cell;
        while (true) {
            const next = (adj.get(cur) || []).find(k => k !== prev);
            if (next === undefined) break;
            chain.push(next);
            seen.add(next);
            prev = cur;
            cur = next;
        }
        result.push(chain);
    }
    return result;
}

/**
 * The feasible numberings of a fragment: for each orientation, the
 * clue-consistent base offsets. A numbering assigns chain[i] the
 * number base + i.
 *
 * @returns {Array<{ chain: string[], base: number }>} 0, 1, or 2
 *   entries (orientations collapse when symmetric)
 */
export function feasibleNumberings(board, chain) {
    const results = [];
    for (const oriented of [chain, [...chain].reverse()]) {
        const clueIdx = oriented.findIndex(key => board.clueByKey.has(key));
        let bases;
        if (clueIdx !== -1) {
            bases = [board.clueByKey.get(oriented[clueIdx]) - clueIdx];
        } else {
            // No clue: any window inside 1..N
            bases = [];
            for (let base = 1; base + oriented.length - 1 <= board.total; base++) {
                bases.push(base);
            }
        }
        outer:
        for (const base of bases) {
            if (base < 1 || base + oriented.length - 1 > board.total) continue;
            for (let i = 0; i < oriented.length; i++) {
                const num = base + i;
                const key = oriented[i];
                if (board.clueByKey.has(key) && board.clueByKey.get(key) !== num) continue outer;
                if (board.clueByNumber.has(num) && board.clueByNumber.get(num) !== key) continue outer;
            }
            results.push({ chain: oriented, base });
        }
    }
    // Deduplicate palindromic single-cell chains
    if (chain.length === 1 && results.length === 2) results.pop();
    return results;
}

/**
 * Compute display numbers: clues always; fragment cells only when
 * every feasible numbering agrees on them.
 *
 * @returns {Map<string, number>}
 */
export function numbering(board, edges) {
    const numberByKey = new Map();
    for (const [key, value] of board.clueByKey) numberByKey.set(key, value);

    for (const chain of fragments(edges)) {
        const feasible = feasibleNumberings(board, chain);
        if (feasible.length === 0) continue; // shouldn't happen (validated)
        const [first, ...rest] = feasible;
        const byKey = new Map(first.chain.map((key, i) => [key, first.base + i]));
        let agreed = [...byKey.keys()];
        for (const alt of rest) {
            const altByKey = new Map(alt.chain.map((key, i) => [key, alt.base + i]));
            agreed = agreed.filter(key => altByKey.get(key) === byKey.get(key));
        }
        // A cell's number displays once every feasible numbering
        // agrees on it
        for (const key of agreed) numberByKey.set(key, byKey.get(key));
    }
    return numberByKey;
}

/**
 * Whether the edge a-b may be added.
 *
 * Requires adjacency, both endpoints with spare degree (< 2 edges,
 * clue-1 cell and clue-N cell allow only 1), no cycle, and the merged
 * fragment must admit at least one clue-consistent numbering.
 */
export function canAddEdge(board, edges, a, b) {
    if (a === b) return false;
    if (!(board.neighbors.get(a) || []).includes(b)) return false;
    const id = edgeId(a, b);
    if (edges.has(id)) return false;

    const adj = adjacency(edges);
    const maxDegree = (key) => {
        const clue = board.clueByKey.get(key);
        return (clue === 1 || clue === board.total) ? 1 : 2;
    };
    if ((adj.get(a) || []).length >= maxDegree(a)) return false;
    if ((adj.get(b) || []).length >= maxDegree(b)) return false;

    // Cycle: a and b already in the same fragment
    let cur = a, prev = null;
    while (true) {
        const next = (adj.get(cur) || []).find(k => k !== prev);
        if (next === undefined) break;
        if (next === b) return false;
        prev = cur;
        cur = next;
    }
    // Walk the other way too (a may be mid-fragment is impossible --
    // degree < 2 means a is an end or isolated, so one walk suffices)

    // Merged fragment must be feasible
    const merged = new Set(edges);
    merged.add(id);
    const mergedAdj = adjacency(merged);
    const chain = [];
    let head = a;
    prev = null;
    // find the end of a's new fragment
    while (true) {
        const next = (mergedAdj.get(head) || []).find(k => k !== prev);
        if (next === undefined) break;
        prev = head;
        head = next;
        if (head === a) break; // safety; cycles rejected above
    }
    prev = null;
    cur = head;
    chain.push(head);
    while (true) {
        const next = (mergedAdj.get(cur) || []).find(k => k !== prev);
        if (next === undefined) break;
        chain.push(next);
        prev = cur;
        cur = next;
    }
    return feasibleNumberings(board, chain).length > 0;
}

/**
 * Add the edge a-b.
 * @returns {{ edges: Set, changed: boolean }}
 */
export function addEdge(board, edges, a, b) {
    if (!canAddEdge(board, edges, a, b)) return { edges, changed: false };
    const next = new Set(edges);
    next.add(edgeId(a, b));
    return { edges: next, changed: true };
}

/**
 * Remove the edge with the given id.
 * @returns {{ edges: Set, changed: boolean }}
 */
export function removeEdge(edges, id) {
    if (!edges.has(id)) return { edges, changed: false };
    const next = new Set(edges);
    next.delete(id);
    return { edges: next, changed: true };
}

/**
 * Solved: N-1 edges forming one fragment over every cell whose forced
 * numbering satisfies the clues. Edge-time validation plus the unique
 * solution guarantee make the full covering fragment the solution.
 */
export function isWin(board, edges) {
    if (edges.size !== board.total - 1) return false;
    const frags = fragments(edges);
    if (frags.length !== 1 || frags[0].length !== board.total) return false;
    return feasibleNumberings(board, frags[0]).length > 0;
}

/**
 * The winning chain in order 1..N (for the win wave).
 * Only meaningful when isWin() is true.
 */
export function winOrder(board, edges) {
    const chain = fragments(edges)[0];
    return chain[0] === board.startKey ? chain : [...chain].reverse();
}

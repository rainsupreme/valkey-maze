// ── Signposts interaction logic (pure, no DOM) ──────────────
//
// Link-based play (Tatham-style): the player connects any cell to a
// cell along its arrow ray. Each cell has at most one outgoing and
// one incoming link, so links form chain fragments. Fragments
// containing a clue are "anchored" and display absolute numbers;
// unanchored fragments display relative labels (a, a+1, ...).
// Fragments merge when linked. The puzzle is solved when one chain
// numbered 1..N covers every cell.

import { buildHexCellGrid } from '../core/hex-cell-grid.js';
import { buildRays } from '../core/signposts.js';

/**
 * Build the immutable lookup state for a puzzle.
 * @param {object} puzzle - from generateSignposts()
 */
export function createBoard(puzzle) {
    const grid = buildHexCellGrid(puzzle.radius, { centerHole: true });
    const { rays } = buildRays(grid);

    const arrowByKey = new Map(puzzle.arrows.map(a => [`${a.q},${a.r}`, a.dir]));
    const clueByKey = new Map(puzzle.clues.map(c => [`${c.q},${c.r}`, c.value]));
    const clueByNumber = new Map(puzzle.clues.map(c => [c.value, `${c.q},${c.r}`]));

    return {
        total: puzzle.cells.length,
        rays,
        arrowByKey,
        clueByKey,
        clueByNumber,
        startKey: clueByNumber.get(1),
    };
}

/** A fresh state: no links. */
export function initialLinks() {
    return new Map();
}

/** Map of target -> source for every link. */
export function incomingMap(links) {
    const m = new Map();
    for (const [from, to] of links) m.set(to, from);
    return m;
}

/**
 * Decompose the links into chain fragments (each an array of cell
 * keys in order). Isolated cells are not fragments.
 */
export function fragments(links) {
    const incoming = incomingMap(links);
    const result = [];
    for (const from of links.keys()) {
        if (incoming.has(from)) continue; // not a head
        const chain = [from];
        let cur = from;
        while (links.has(cur)) {
            cur = links.get(cur);
            chain.push(cur);
        }
        result.push(chain);
    }
    return result;
}

/**
 * Compute display state for every cell.
 *
 * Anchored fragments (containing a clue) and clue cells get absolute
 * numbers; unanchored fragments get relative labels: head "a", then
 * "a+1", ... with a distinct letter per fragment.
 *
 * @returns {{ numberByKey: Map<string, number>,
 *             labelByKey: Map<string, string> }}
 */
export function numbering(board, links) {
    const numberByKey = new Map();
    const labelByKey = new Map();
    for (const [key, value] of board.clueByKey) numberByKey.set(key, value);

    const frags = fragments(links);
    // Deterministic letter assignment: order fragments by head key
    frags.sort((f1, f2) => (f1[0] < f2[0] ? -1 : 1));

    let letterIndex = 0;
    for (const chain of frags) {
        const anchorIdx = chain.findIndex(key => board.clueByKey.has(key));
        if (anchorIdx !== -1) {
            const base = board.clueByKey.get(chain[anchorIdx]) - anchorIdx;
            chain.forEach((key, i) => numberByKey.set(key, base + i));
        } else {
            const letter = String.fromCharCode(97 + (letterIndex % 26));
            letterIndex++;
            chain.forEach((key, i) => labelByKey.set(key, i === 0 ? letter : `${letter}+${i}`));
        }
    }
    return { numberByKey, labelByKey };
}

/**
 * Whether the link from -> to is legal given the current links.
 *
 * Requires: `to` lies on `from`'s arrow ray; `to` has no incoming
 * link; no cycle; and the merged fragment stays consistent with the
 * clues (clue cells keep their values, clue numbers stay reserved
 * for their cells, all numbers within 1..N).
 */
export function canLink(board, links, from, to) {
    const dir = board.arrowByKey.get(from);
    if (dir === null || dir === undefined) return false; // goal cell / hole
    if (!board.rays.get(from)[dir].includes(to)) return false;
    if (links.get(from) === to) return false; // already linked
    if (incomingMap(links).has(to)) return false;

    // Cycle: following links from `to` must never come back to `from`
    for (let cur = to; links.has(cur); ) {
        cur = links.get(cur);
        if (cur === from) return false;
    }

    // Clue consistency of the merged fragment
    const merged = new Map(links);
    merged.set(from, to);
    let head = from;
    const incoming = incomingMap(merged);
    while (incoming.has(head)) head = incoming.get(head);
    const chain = [head];
    for (let cur = head; merged.has(cur); ) {
        cur = merged.get(cur);
        chain.push(cur);
    }
    const anchorIdx = chain.findIndex(key => board.clueByKey.has(key));
    if (anchorIdx !== -1) {
        const base = board.clueByKey.get(chain[anchorIdx]) - anchorIdx;
        for (let i = 0; i < chain.length; i++) {
            const num = base + i;
            const key = chain[i];
            if (num < 1 || num > board.total) return false;
            // A clue cell must hold its own value...
            if (board.clueByKey.has(key) && board.clueByKey.get(key) !== num) return false;
            // ...and a clue's number may only land on that clue's cell.
            if (board.clueByNumber.has(num) && board.clueByNumber.get(num) !== key) return false;
        }
    }
    return true;
}

/** Cells `from` may legally link to right now. */
export function candidates(board, links, from) {
    const dir = board.arrowByKey.get(from);
    if (dir === null || dir === undefined) return [];
    return board.rays.get(from)[dir].filter(to => canLink(board, links, from, to));
}

/**
 * Create (or replace) the outgoing link of `from`.
 * @returns {{ links: Map, changed: boolean }}
 */
export function applyLink(board, links, from, to) {
    if (!canLink(board, links, from, to)) return { links, changed: false };
    const next = new Map(links);
    next.set(from, to);
    return { links: next, changed: true };
}

/**
 * Remove the outgoing link of `from`, if any.
 * @returns {{ links: Map, changed: boolean }}
 */
export function removeLink(links, from) {
    if (!links.has(from)) return { links, changed: false };
    const next = new Map(links);
    next.delete(from);
    return { links: next, changed: true };
}

/**
 * Solved: every cell's number is determined and the induced sequence
 * is the solution -- a bijection onto 1..N in which each consecutive
 * pair respects the arrows. Combined with clue consistency (inherent
 * in numbering()) and the unique-solution guarantee, such a numbering
 * IS the solution, even when some links (like the final one) were
 * never drawn: the numbers being forced is what matters.
 */
export function isWin(board, links) {
    const { numberByKey } = numbering(board, links);
    if (numberByKey.size !== board.total) return false;

    const keyByNumber = new Array(board.total + 1).fill(null);
    for (const [key, num] of numberByKey) {
        if (num < 1 || num > board.total || keyByNumber[num] !== null) return false;
        keyByNumber[num] = key;
    }
    for (let num = 1; num < board.total; num++) {
        const cur = keyByNumber[num];
        const dir = board.arrowByKey.get(cur);
        if (dir === null || dir === undefined) return false;
        if (!board.rays.get(cur)[dir].includes(keyByNumber[num + 1])) return false;
    }
    return true;
}

/**
 * The winning sequence in order 1..N (for the win wave).
 * Only meaningful when isWin() is true.
 */
export function winOrder(board, links) {
    const { numberByKey } = numbering(board, links);
    const order = new Array(board.total);
    for (const [key, num] of numberByKey) order[num - 1] = key;
    return order;
}

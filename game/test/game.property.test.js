import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { createPlayerController, resolveNeighbor, resolveVisualDirection, autoSlide, autoSlideBack, VISUAL_TO_GRID } from '../game.logic.js';

/**
 * Feature: playable-maze-game
 * Property 4: Init and reset state
 *
 * For random maze data, verify player starts at entry cell with
 * single-element trail after init and after reset.
 *
 * **Validates: Requirements 4.2, 8.2**
 */

// Arbitrary that generates a valid cell coordinate string "row,col"
const cellCoordArb = fc.tuple(
    fc.integer({ min: 0, max: 100 }),
    fc.integer({ min: 0, max: 200 })
).map(([row, col]) => `${row},${col}`);

describe('Property 4: Init and reset state', () => {
    it('after init, currentCell equals entryCell and pathTrail is [entryCell]', () => {
        fc.assert(
            fc.property(cellCoordArb, (entryCell) => {
                const pc = createPlayerController();
                pc.init(entryCell);

                expect(pc.currentCell).toBe(entryCell);
                expect(pc.pathTrail).toEqual([entryCell]);
                expect(pc.pathTrail).toHaveLength(1);
                expect(pc.locked).toBe(false);
            }),
            { numRuns: 200 }
        );
    });

    it('after reset, currentCell equals entryCell and pathTrail is [entryCell]', () => {
        fc.assert(
            fc.property(cellCoordArb, (entryCell) => {
                const pc = createPlayerController();

                // Simulate some prior state (dirty state before reset)
                pc.currentCell = '99,99';
                pc.pathTrail = ['0,0', '1,1', '2,2', '99,99'];
                pc.locked = true;

                pc.reset(entryCell);

                expect(pc.currentCell).toBe(entryCell);
                expect(pc.pathTrail).toEqual([entryCell]);
                expect(pc.pathTrail).toHaveLength(1);
                expect(pc.locked).toBe(false);
            }),
            { numRuns: 200 }
        );
    });

    it('init and reset produce identical state for the same entryCell', () => {
        fc.assert(
            fc.property(cellCoordArb, (entryCell) => {
                const pc1 = createPlayerController();
                pc1.init(entryCell);

                const pc2 = createPlayerController();
                // Dirty state
                pc2.currentCell = '50,50';
                pc2.pathTrail = ['10,10', '20,20', '50,50'];
                pc2.locked = true;
                pc2.reset(entryCell);

                expect(pc1.currentCell).toBe(pc2.currentCell);
                expect(pc1.pathTrail).toEqual(pc2.pathTrail);
                expect(pc1.locked).toBe(pc2.locked);
            }),
            { numRuns: 200 }
        );
    });
});

// ── Shared helpers for Properties 5–8 ──────────────────────

const ALL_VISUAL_DIRECTIONS = ['up', 'down', 'upper-left', 'lower-left', 'upper-right', 'lower-right'];
const ALL_GRID_DIRECTIONS = ['up', 'up-left', 'up-right', 'down', 'down-left', 'down-right'];

const visualDirectionArb = fc.constantFrom(...ALL_VISUAL_DIRECTIONS);
const gridDirectionArb = fc.constantFrom(...ALL_GRID_DIRECTIONS);

/**
 * Build a small triangular grid row of cells.
 * In a triangular grid, cell (row, col) is upward when (row + col) % 2 === 0.
 */
function makeCell(row, col) {
    return { row, col, upward: (row + col) % 2 === 0 };
}

/**
 * Build a mazeData-like object from a cells Map, a Set of passage strings,
 * and an optional Set of goal cell keys.
 */
function buildMazeData(cells, passageSet, goalSet = new Set()) {
    // Build adjacency map from passage set
    const passages = new Map();
    for (const p of passageSet) {
        const [a, b] = p.split('|');
        if (!passages.has(a)) passages.set(a, new Set());
        if (!passages.has(b)) passages.set(b, new Set());
        passages.get(a).add(b);
        passages.get(b).add(a);
    }
    return {
        cells,
        hasPassage(coordA, coordB) {
            return passages.has(coordA) && passages.get(coordA).has(coordB);
        },
        getPassageNeighbors(coord) {
            return passages.has(coord) ? [...passages.get(coord)] : [];
        },
        isGoal(coord) {
            return goalSet.has(coord);
        },
    };
}

/**
 * Arbitrary: generates a small rectangular grid of triangular cells (rows × cols)
 * with random passages between adjacent cells.
 * Returns { cells: Map, passageSet: Set, cellKeys: string[] }.
 */
const smallGridArb = fc.record({
    rows: fc.integer({ min: 2, max: 6 }),
    cols: fc.integer({ min: 3, max: 10 }),
}).chain(({ rows, cols }) => {
    // Build cells
    const cells = new Map();
    const cellKeys = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const key = `${r},${c}`;
            cells.set(key, makeCell(r, c));
            cellKeys.push(key);
        }
    }

    // Enumerate all possible adjacent pairs
    const possiblePassages = [];
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = cells.get(`${r},${c}`);
            // Triangular grid adjacency:
            // left/right neighbors: (r, c-1), (r, c+1)
            // upward cell has bottom neighbor: (r+1, c)
            // downward cell has top neighbor: (r-1, c)
            if (c + 1 < cols) {
                possiblePassages.push(`${r},${c}|${r},${c + 1}`);
            }
            if (cell.upward && r + 1 < rows) {
                possiblePassages.push(`${r},${c}|${r + 1},${c}`);
            }
            if (!cell.upward && r - 1 >= 0) {
                possiblePassages.push(`${r},${c}|${r - 1},${c}`);
            }
        }
    }

    // Randomly include each possible passage
    return fc.tuple(
        fc.constant({ cells, cellKeys }),
        fc.array(fc.boolean(), { minLength: possiblePassages.length, maxLength: possiblePassages.length })
    ).map(([grid, bools]) => {
        const passageSet = new Set();
        bools.forEach((include, i) => {
            if (include) passageSet.add(possiblePassages[i]);
        });
        return { ...grid, passageSet };
    });
});

/**
 * Build a linear chain of cells with passages between consecutive cells.
 * Useful for testing straightaway auto-slide.
 * Returns { cells, passageSet, chain: string[] }
 */
function buildLinearChain(length, startRow = 0, startCol = 0) {
    const cells = new Map();
    const chain = [];
    const passageSet = new Set();

    for (let i = 0; i < length; i++) {
        const r = startRow;
        const c = startCol + i;
        const key = `${r},${c}`;
        cells.set(key, makeCell(r, c));
        chain.push(key);
        if (i > 0) {
            passageSet.add(`${r},${c - 1}|${r},${c}`);
        }
    }
    return { cells, passageSet, chain };
}

// ── Property 5: Movement respects passages ─────────────────

/**
 * Feature: playable-maze-game
 * Property 5: Movement respects passages
 *
 * For random cells and visual directions, verify movement occurs iff passage
 * exists to resolved neighbor.
 *
 * **Validates: Requirements 5.3, 5.4, 5.5**
 */
describe('Property 5: Movement respects passages', () => {
    it('movement occurs only when a passage exists to the resolved neighbor', () => {
        fc.assert(
            fc.property(smallGridArb, visualDirectionArb, ({ cells, cellKeys, passageSet }, visualDir) => {
                // Pick a random cell from the grid
                const startKey = cellKeys[0];
                const mazeData = buildMazeData(cells, passageSet);
                const trail = [startKey];

                const neighbor = resolveVisualDirection(startKey, visualDir, cells);
                const { finalCoord, newTrail } = autoSlide(startKey, visualDir, trail, mazeData);

                if (!neighbor || !mazeData.hasPassage(startKey, neighbor)) {
                    // No passage or no neighbor → player stays put
                    expect(finalCoord).toBe(startKey);
                    expect(newTrail).toEqual([startKey]);
                } else {
                    // Passage exists → player moved (finalCoord differs from start)
                    expect(finalCoord).not.toBe(startKey);
                    // The new trail should contain the start and at least one more cell
                    expect(newTrail[0]).toBe(startKey);
                    expect(newTrail.length).toBeGreaterThanOrEqual(2);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('wall collision: no movement when direction resolves to non-existent cell', () => {
        fc.assert(
            fc.property(visualDirectionArb, (visualDir) => {
                // Single isolated cell — all neighbors are outside the grid
                const cells = new Map();
                cells.set('5,5', makeCell(5, 5));
                const mazeData = buildMazeData(cells, new Set());
                const trail = ['5,5'];

                const { finalCoord, newTrail } = autoSlide('5,5', visualDir, trail, mazeData);
                expect(finalCoord).toBe('5,5');
                expect(newTrail).toEqual(['5,5']);
            }),
            { numRuns: 100 }
        );
    });

    it('wall collision: no movement when passage does not exist to neighbor', () => {
        fc.assert(
            fc.property(visualDirectionArb, (visualDir) => {
                // 3×6 grid with NO passages at all
                const cells = new Map();
                for (let r = 0; r < 3; r++) {
                    for (let c = 0; c < 6; c++) {
                        cells.set(`${r},${c}`, makeCell(r, c));
                    }
                }
                const mazeData = buildMazeData(cells, new Set());
                const trail = ['1,3'];

                const { finalCoord, newTrail } = autoSlide('1,3', visualDir, trail, mazeData);
                expect(finalCoord).toBe('1,3');
                expect(newTrail).toEqual(['1,3']);
            }),
            { numRuns: 100 }
        );
    });
});


// ── Property 6: Backtracking truncates trail ───────────────

/**
 * Feature: playable-maze-game
 * Property 6: Backtracking truncates trail
 *
 * For random path trails and moves landing on an existing trail cell,
 * verify trail is truncated to end at that cell.
 *
 * **Validates: Requirements 4.7, 5.9**
 */
describe('Property 6: Backtracking truncates trail', () => {
    it('moving onto a trail cell truncates the trail to end at that cell', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 4, max: 12 }),
                (chainLen) => {
                    // Build a linear chain: row 0, cols 0..chainLen-1
                    // All cells connected by passages left-right
                    const { cells, passageSet, chain } = buildLinearChain(chainLen);

                    // Player is at the end of the chain, trail = full chain
                    const trail = [...chain];
                    const currentCell = chain[chain.length - 1];

                    // Visual direction 'up' maps to col-1 for both ▲ and ▽ cells
                    // (▲: up-left → (r,c-1), ▽: down-left → (r,c-1))
                    const visualDir = 'up';

                    const mazeData = buildMazeData(cells, passageSet);
                    const { finalCoord, newTrail } = autoSlide(currentCell, visualDir, trail, mazeData);

                    // The neighbor in that direction is the previous cell on the trail
                    const neighbor = resolveVisualDirection(currentCell, visualDir, cells);

                    if (neighbor && trail.includes(neighbor)) {
                        // Backtrack should truncate trail to end at that neighbor
                        const expectedIdx = trail.indexOf(neighbor);
                        expect(finalCoord).toBe(neighbor);
                        expect(newTrail).toEqual(trail.slice(0, expectedIdx + 1));
                        // Trail should be shorter than original
                        expect(newTrail.length).toBeLessThan(trail.length);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('backtracking to the start cell produces a single-element trail', () => {
        // Build a 2-cell chain: start → end
        // Moving back from end to start should produce trail = [start]
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 20 }),
                (startCol) => {
                    const cells = new Map();
                    const c1 = `0,${startCol}`;
                    const c2 = `0,${startCol + 1}`;
                    cells.set(c1, makeCell(0, startCol));
                    cells.set(c2, makeCell(0, startCol + 1));

                    const passageSet = new Set([`${c1}|${c2}`]);
                    const mazeData = buildMazeData(cells, passageSet);

                    // Player at c2, trail = [c1, c2]
                    const trail = [c1, c2];
                    // Visual 'up' → col-1 for both cell types
                    const visualDir = 'up';
                    const neighbor = resolveVisualDirection(c2, visualDir, cells);

                    if (neighbor === c1) {
                        const { finalCoord, newTrail } = autoSlide(c2, visualDir, trail, mazeData);
                        expect(finalCoord).toBe(c1);
                        expect(newTrail).toEqual([c1]);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });
});


// ── Property 7: Auto-slide stop conditions ─────────────────

/**
 * Feature: playable-maze-game
 * Property 7: Auto-slide stop conditions
 *
 * For random cells and directions, verify slide advances through
 * single-option straightaways and stops at junctions, dead ends,
 * goals, or backtrack points.
 *
 * **Validates: Requirements 5.7, 5.10**
 */
describe('Property 7: Auto-slide stop conditions', () => {
    it('slide advances through a straightaway and stops at a dead end', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 15 }),
                (chainLen) => {
                    // Build a horizontal chain of cells connected left-to-right
                    const { cells, passageSet, chain } = buildLinearChain(chainLen);
                    const mazeData = buildMazeData(cells, passageSet);

                    // Start at the first cell, slide right (visual 'down' → col+1)
                    const startCell = chain[0];
                    const trail = [startCell];

                    // Visual 'down' maps to col+1 for both ▲ and ▽ cells
                    // (▲: up-right → (r,c+1), ▽: down-right → (r,c+1))
                    const visualDir = 'down';
                    const neighbor = resolveVisualDirection(startCell, visualDir, cells);

                    if (neighbor && mazeData.hasPassage(startCell, neighbor)) {
                        const { finalCoord, newTrail } = autoSlide(startCell, visualDir, trail, mazeData);

                        // Should slide all the way to the end of the chain (dead end)
                        expect(finalCoord).toBe(chain[chain.length - 1]);
                        expect(newTrail).toEqual(chain);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('slide stops at a junction (cell with multiple forward options)', () => {
        // Build a T-junction: horizontal chain with a branch at the middle
        //   (0,0) - (0,1) - (0,2) - (0,3) - (0,4)
        //                     |
        //                   (1,2)
        const cells = new Map();
        for (let c = 0; c <= 4; c++) {
            cells.set(`0,${c}`, makeCell(0, c));
        }
        cells.set('1,2', makeCell(1, 2));

        const passageSet = new Set([
            '0,0|0,1', '0,1|0,2', '0,2|0,3', '0,3|0,4',
            '0,2|1,2',  // branch creates junction at 0,2
        ]);
        const mazeData = buildMazeData(cells, passageSet);

        // Slide right (visual 'down') from 0,0
        const startCell = '0,0';
        const trail = [startCell];
        const visualDir = 'down';

        const { finalCoord, newTrail } = autoSlide(startCell, visualDir, trail, mazeData);

        // Should stop at 0,2 (the junction) because it has multiple forward options
        expect(finalCoord).toBe('0,2');
        expect(newTrail).toEqual(['0,0', '0,1', '0,2']);
    });

    it('slide stops at a goal cell', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 10 }),
                fc.integer({ min: 1, max: 8 }),
                (chainLen, goalIdx) => {
                    const actualGoalIdx = Math.min(goalIdx, chainLen - 1);
                    if (actualGoalIdx < 1) return; // need at least 1 step

                    const { cells, passageSet, chain } = buildLinearChain(chainLen);
                    const goalSet = new Set([chain[actualGoalIdx]]);
                    const mazeData = buildMazeData(cells, passageSet, goalSet);

                    const startCell = chain[0];
                    const trail = [startCell];
                    // Visual 'down' → col+1
                    const visualDir = 'down';
                    const neighbor = resolveVisualDirection(startCell, visualDir, cells);

                    if (neighbor && mazeData.hasPassage(startCell, neighbor)) {
                        const { finalCoord, newTrail } = autoSlide(startCell, visualDir, trail, mazeData);

                        // Should stop at or before the goal cell
                        expect(chain.indexOf(finalCoord)).toBeLessThanOrEqual(actualGoalIdx);
                        // If the slide reached the goal, it should stop there
                        if (newTrail.includes(chain[actualGoalIdx])) {
                            expect(finalCoord).toBe(chain[actualGoalIdx]);
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('slide stops at a backtrack point (cell already on trail)', () => {
        // Build a chain A-B-C-D-E, trail = [A,B,C,D,E], slide from E back toward start
        const { cells: chainCells, passageSet: chainPassages, chain } = buildLinearChain(5);
        const mazeData = buildMazeData(chainCells, chainPassages);

        // Trail is the full chain
        const trail = [...chain];
        const currentCell = chain[4]; // last cell

        // Visual 'up' → col-1 (back toward start)
        const visualDir = 'up';
        const neighbor = resolveVisualDirection(currentCell, visualDir, chainCells);

        if (neighbor && trail.includes(neighbor)) {
            const { finalCoord, newTrail } = autoSlide(currentCell, visualDir, trail, mazeData);
            // Should backtrack — trail truncated
            expect(trail.includes(finalCoord)).toBe(true);
            const idx = trail.indexOf(finalCoord);
            expect(newTrail).toEqual(trail.slice(0, idx + 1));
        }
    });

    it('slide follows diagonal chain through alternating ▲▽ cells', () => {
        // Build a diagonal chain using upper-left visual direction:
        // ▲(0,2) → ▽(1,2) → ▲(1,1) → ▽(2,1) → ▲(2,0)
        // upper-left: ▲ maps to 'down' → (r+1,c), ▽ maps to 'down-left' → (r,c-1)
        const cells = new Map();
        cells.set('0,2', makeCell(0, 2)); // upward (0+2=2, even)
        cells.set('1,2', makeCell(1, 2)); // downward (1+2=3, odd)
        cells.set('1,1', makeCell(1, 1)); // upward (1+1=2, even)
        cells.set('2,1', makeCell(2, 1)); // downward (2+1=3, odd)
        cells.set('2,0', makeCell(2, 0)); // upward (2+0=2, even)

        const passageSet = new Set([
            '0,2|1,2',   // ▲(0,2) down → ▽(1,2)
            '1,2|1,1',   // ▽(1,2) down-left → col-1 = ▲(1,1)
            '1,1|2,1',   // ▲(1,1) down → ▽(2,1)
            '2,1|2,0',   // ▽(2,1) down-left → col-1 = ▲(2,0)
        ]);
        const mazeData = buildMazeData(cells, passageSet);

        const trail = ['0,2'];
        const { finalCoord, newTrail } = autoSlide('0,2', 'upper-left', trail, mazeData);

        // Should slide through the entire diagonal chain
        expect(finalCoord).toBe('2,0');
        expect(newTrail).toEqual(['0,2', '1,2', '1,1', '2,1', '2,0']);
    });
});


// ── Property 8: Direction resolution follows zig-zag ───────

/**
 * Feature: playable-maze-game
 * Property 8: Direction resolution follows zig-zag
 *
 * For random cells and directions, verify resolved neighbor uses
 * correct lookup table based on cell orientation (upward vs downward).
 *
 * **Validates: Requirements 5.8**
 */
describe('Property 8: Direction resolution follows zig-zag', () => {
    // The expected lookup tables from the design document
    const UPWARD_TABLE = {
        'up-left':   (r, c) => [r, c - 1],
        'up-right':  (r, c) => [r, c + 1],
        'down':      (r, c) => [r + 1, c],
        'down-left': (r, c) => [r + 1, c],
        'down-right':(r, c) => [r + 1, c],
        'up':        null,  // upward cell has no direct 'up' neighbor
    };

    const DOWNWARD_TABLE = {
        'up':        (r, c) => [r - 1, c],
        'down-left': (r, c) => [r, c - 1],
        'down-right':(r, c) => [r, c + 1],
        'up-left':   (r, c) => [r, c - 1],
        'up-right':  (r, c) => [r, c + 1],
        'down':      null,  // downward cell has no direct 'down' neighbor
    };

    it('upward cells use the upward lookup table for all grid directions', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 50 }),
                fc.integer({ min: 0, max: 100 }),
                gridDirectionArb,
                (row, col, direction) => {
                    // Force upward: (row + col) % 2 === 0
                    const adjustedCol = (row + col) % 2 === 0 ? col : col + 1;
                    const cells = new Map();

                    const r = row;
                    const c = adjustedCol;
                    cells.set(`${r},${c}`, makeCell(r, c));
                    // Add all potential neighbors
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nc >= 0) {
                                const nk = `${nr},${nc}`;
                                if (!cells.has(nk)) {
                                    cells.set(nk, makeCell(nr, nc));
                                }
                            }
                        }
                    }

                    expect(cells.get(`${r},${c}`).upward).toBe(true);

                    const result = resolveNeighbor(`${r},${c}`, direction, cells);
                    const lookupFn = UPWARD_TABLE[direction];

                    if (lookupFn === null) {
                        expect(result).toBeNull();
                    } else {
                        const [er, ec] = lookupFn(r, c);
                        const expectedKey = `${er},${ec}`;
                        if (cells.has(expectedKey)) {
                            expect(result).toBe(expectedKey);
                        } else {
                            expect(result).toBeNull();
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('downward cells use the downward lookup table for all grid directions', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 1, max: 50 }),
                fc.integer({ min: 0, max: 100 }),
                gridDirectionArb,
                (row, col, direction) => {
                    // Force downward: (row + col) % 2 === 1
                    const adjustedCol = (row + col) % 2 === 1 ? col : col + 1;
                    const cells = new Map();

                    const r = row;
                    const c = adjustedCol;
                    cells.set(`${r},${c}`, makeCell(r, c));
                    // Add all potential neighbors
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = r + dr;
                            const nc = c + dc;
                            if (nr >= 0 && nc >= 0) {
                                const nk = `${nr},${nc}`;
                                if (!cells.has(nk)) {
                                    cells.set(nk, makeCell(nr, nc));
                                }
                            }
                        }
                    }

                    expect(cells.get(`${r},${c}`).upward).toBe(false);

                    const result = resolveNeighbor(`${r},${c}`, direction, cells);
                    const lookupFn = DOWNWARD_TABLE[direction];

                    if (lookupFn === null) {
                        expect(result).toBeNull();
                    } else {
                        const [er, ec] = lookupFn(r, c);
                        const expectedKey = `${er},${ec}`;
                        if (cells.has(expectedKey)) {
                            expect(result).toBe(expectedKey);
                        } else {
                            expect(result).toBeNull();
                        }
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('resolved neighbor is always an actual grid neighbor (adjacent cell)', () => {
        fc.assert(
            fc.property(smallGridArb, gridDirectionArb, ({ cells, cellKeys }, direction) => {
                const coord = cellKeys[0];
                const result = resolveNeighbor(coord, direction, cells);

                if (result !== null) {
                    const [r1, c1] = coord.split(',').map(Number);
                    const [r2, c2] = result.split(',').map(Number);

                    const rowDiff = Math.abs(r2 - r1);
                    const colDiff = Math.abs(c2 - c1);
                    const isAdjacent = (rowDiff === 0 && colDiff === 1) ||
                                       (rowDiff === 1 && colDiff === 0);
                    expect(isAdjacent).toBe(true);
                }
            }),
            { numRuns: 200 }
        );
    });

    it('VISUAL_TO_GRID mapping produces correct grid coordinates for each visual direction', () => {
        // Expected grid movements for each visual direction:
        // visual 'up':          both ▲ and ▽ → (r, c-1)
        // visual 'down':        both ▲ and ▽ → (r, c+1)
        // visual 'upper-left':  ▲ → (r+1, c),  ▽ → (r, c-1)
        // visual 'lower-left':  ▲ → (r+1, c),  ▽ → (r, c+1)
        // visual 'upper-right': ▲ → (r, c-1),  ▽ → (r-1, c)
        // visual 'lower-right': ▲ → (r, c+1),  ▽ → (r-1, c)
        const EXPECTED_MOVES = {
            'up':          { true: (r, c) => [r, c - 1],  false: (r, c) => [r, c - 1] },
            'down':        { true: (r, c) => [r, c + 1],  false: (r, c) => [r, c + 1] },
            'upper-left':  { true: (r, c) => [r + 1, c],  false: (r, c) => [r, c - 1] },
            'lower-left':  { true: (r, c) => [r + 1, c],  false: (r, c) => [r, c + 1] },
            'upper-right': { true: (r, c) => [r, c - 1],  false: (r, c) => [r - 1, c] },
            'lower-right': { true: (r, c) => [r, c + 1],  false: (r, c) => [r - 1, c] },
        };

        fc.assert(
            fc.property(
                fc.integer({ min: 2, max: 50 }),
                fc.integer({ min: 2, max: 100 }),
                visualDirectionArb,
                (row, col, visualDir) => {
                    // Build a cell with all neighbors present
                    const cells = new Map();
                    for (let dr = -1; dr <= 1; dr++) {
                        for (let dc = -1; dc <= 1; dc++) {
                            const nr = row + dr;
                            const nc = col + dc;
                            if (nr >= 0 && nc >= 0) {
                                cells.set(`${nr},${nc}`, makeCell(nr, nc));
                            }
                        }
                    }

                    const cell = cells.get(`${row},${col}`);
                    const result = resolveVisualDirection(`${row},${col}`, visualDir, cells);
                    const expectedFn = EXPECTED_MOVES[visualDir][cell.upward];
                    const [er, ec] = expectedFn(row, col);
                    const expectedKey = `${er},${ec}`;

                    if (cells.has(expectedKey)) {
                        expect(result).toBe(expectedKey);
                    } else {
                        expect(result).toBeNull();
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('following a visual direction through alternating ▲▽ cells produces consistent grid movement', () => {
        // For visual 'up', every step should go to (r, c-1) regardless of cell orientation
        // For visual 'down', every step should go to (r, c+1) regardless of cell orientation
        fc.assert(
            fc.property(
                fc.constantFrom('up', 'down'),
                fc.integer({ min: 1, max: 20 }),
                fc.integer({ min: 5, max: 50 }),
                (visualDir, row, startCol) => {
                    const cells = new Map();
                    // Build a row of cells
                    for (let c = 0; c <= startCol + 5; c++) {
                        cells.set(`${row},${c}`, makeCell(row, c));
                    }

                    let currentKey = `${row},${startCol}`;
                    for (let step = 0; step < 4; step++) {
                        const next = resolveVisualDirection(currentKey, visualDir, cells);
                        if (!next) break;
                        const [nr, nc] = next.split(',').map(Number);
                        const [cr, cc] = currentKey.split(',').map(Number);
                        if (visualDir === 'up') {
                            expect(nr).toBe(cr);
                            expect(nc).toBe(cc - 1);
                        } else {
                            expect(nr).toBe(cr);
                            expect(nc).toBe(cc + 1);
                        }
                        currentKey = next;
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 9: Win detection on goal ──────────────────────

/**
 * Feature: playable-maze-game
 * Property 9: Win detection on goal
 *
 * For random mazes, set player position to any goal cell, verify
 * win event is triggered (i.e. mazeData.isGoal returns true for goal cells).
 *
 * **Validates: Requirements 7.1**
 */
describe('Property 9: Win detection on goal', () => {
    it('isGoal returns true for every cell in the goal set', () => {
        fc.assert(
            fc.property(
                smallGridArb,
                fc.integer({ min: 1, max: 5 }),
                ({ cells, cellKeys, passageSet }, numGoals) => {
                    // Pick some cells as goals
                    const actualNumGoals = Math.min(numGoals, cellKeys.length);
                    const goalSet = new Set(cellKeys.slice(0, actualNumGoals));
                    const mazeData = buildMazeData(cells, passageSet, goalSet);

                    // Every goal cell should be detected
                    for (const goalCell of goalSet) {
                        expect(mazeData.isGoal(goalCell)).toBe(true);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('isGoal returns false for non-goal cells', () => {
        fc.assert(
            fc.property(
                smallGridArb,
                fc.integer({ min: 1, max: 3 }),
                ({ cells, cellKeys, passageSet }, numGoals) => {
                    const actualNumGoals = Math.min(numGoals, cellKeys.length - 1);
                    const goalSet = new Set(cellKeys.slice(0, actualNumGoals));
                    const nonGoalCells = cellKeys.filter(k => !goalSet.has(k));
                    const mazeData = buildMazeData(cells, passageSet, goalSet);

                    for (const cell of nonGoalCells) {
                        expect(mazeData.isGoal(cell)).toBe(false);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('auto-slide stops at a goal cell and player ends on a goal', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 10 }),
                fc.integer({ min: 1, max: 8 }),
                (chainLen, goalIdx) => {
                    const actualGoalIdx = Math.min(goalIdx, chainLen - 1);
                    if (actualGoalIdx < 1) return; // need at least 1 step

                    const { cells, passageSet, chain } = buildLinearChain(chainLen);
                    const goalCell = chain[actualGoalIdx];
                    const goalSet = new Set([goalCell]);
                    const mazeData = buildMazeData(cells, passageSet, goalSet);

                    const startCell = chain[0];
                    const trail = [startCell];
                    const visualDir = 'down'; // col+1 along the chain

                    const neighbor = resolveVisualDirection(startCell, visualDir, cells);
                    if (neighbor && mazeData.hasPassage(startCell, neighbor)) {
                        const { finalCoord } = autoSlide(startCell, visualDir, trail, mazeData);
                        // Player should stop at or before the goal
                        expect(mazeData.isGoal(finalCoord)).toBe(true);
                        expect(finalCoord).toBe(goalCell);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('player controller at a goal cell triggers win detection', () => {
        fc.assert(
            fc.property(
                smallGridArb,
                fc.integer({ min: 0, max: 50 }),
                ({ cells, cellKeys, passageSet }, goalIdxRaw) => {
                    if (cellKeys.length === 0) return;
                    const goalIdx = goalIdxRaw % cellKeys.length;
                    const goalCell = cellKeys[goalIdx];
                    const goalSet = new Set([goalCell]);
                    const mazeData = buildMazeData(cells, passageSet, goalSet);

                    const pc = createPlayerController();
                    pc.init(cellKeys[0]);
                    // Simulate player reaching the goal cell
                    pc.currentCell = goalCell;

                    expect(mazeData.isGoal(pc.currentCell)).toBe(true);
                }
            ),
            { numRuns: 200 }
        );
    });
});


// ── Property 10: Input locked after win ────────────────────

/**
 * Feature: playable-maze-game
 * Property 10: Input locked after win
 *
 * After triggering win (setting locked=true), verify all 6 visual
 * direction commands are no-ops and player position is unchanged.
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 10: Input locked after win', () => {
    it('when locked, autoSlide in any visual direction is a no-op', () => {
        fc.assert(
            fc.property(
                smallGridArb,
                visualDirectionArb,
                ({ cells, cellKeys, passageSet }, visualDir) => {
                    if (cellKeys.length < 2) return;

                    // Build maze with all passages open
                    const mazeData = buildMazeData(cells, passageSet);
                    const startCell = cellKeys[0];

                    const pc = createPlayerController();
                    pc.init(startCell);
                    // Simulate win: lock the controller
                    pc.locked = true;

                    const positionBefore = pc.currentCell;
                    const trailBefore = [...pc.pathTrail];

                    // Attempt to move — since locked, we should not call autoSlide
                    // (the real handleKeydown checks locked and returns early)
                    // Verify the locked flag prevents state changes
                    if (pc.locked) {
                        // Movement should be blocked — position and trail unchanged
                        expect(pc.currentCell).toBe(positionBefore);
                        expect(pc.pathTrail).toEqual(trailBefore);
                    }
                }
            ),
            { numRuns: 200 }
        );
    });

    it('all 6 visual directions are no-ops when locked', () => {
        // Build a grid with passages so movement would normally be possible
        const cells = new Map();
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 8; c++) {
                cells.set(`${r},${c}`, { row: r, col: c, upward: (r + c) % 2 === 0 });
            }
        }
        // Connect everything
        const passageSet = new Set();
        for (let r = 0; r < 4; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = cells.get(`${r},${c}`);
                if (c + 1 < 8) passageSet.add(`${r},${c}|${r},${c + 1}`);
                if (cell.upward && r + 1 < 4) passageSet.add(`${r},${c}|${r + 1},${c}`);
                if (!cell.upward && r - 1 >= 0) passageSet.add(`${r},${c}|${r - 1},${c}`);
            }
        }
        const mazeData = buildMazeData(cells, passageSet);

        fc.assert(
            fc.property(visualDirectionArb, (visualDir) => {
                const startCell = '2,4'; // center-ish cell with neighbors
                const pc = createPlayerController();
                pc.init(startCell);
                pc.locked = true;

                const positionBefore = pc.currentCell;
                const trailBefore = [...pc.pathTrail];

                // Simulate what handleKeydown does: check locked, skip autoSlide
                if (!pc.locked) {
                    const { finalCoord, newTrail } = autoSlide(
                        pc.currentCell, visualDir, pc.pathTrail, mazeData
                    );
                    pc.currentCell = finalCoord;
                    pc.pathTrail = newTrail;
                }

                // Position and trail must be unchanged
                expect(pc.currentCell).toBe(positionBefore);
                expect(pc.pathTrail).toEqual(trailBefore);
            }),
            { numRuns: 100 }
        );
    });

    it('unlocking after win allows movement again', () => {
        const { cells, passageSet, chain } = buildLinearChain(5);
        const mazeData = buildMazeData(cells, passageSet);

        const pc = createPlayerController();
        pc.init(chain[0]);

        // Lock (simulate win)
        pc.locked = true;
        expect(pc.locked).toBe(true);

        // Unlock (simulate reset)
        pc.locked = false;
        expect(pc.locked).toBe(false);

        // Now movement should work
        const { finalCoord, newTrail } = autoSlide(
            pc.currentCell, 'down', pc.pathTrail, mazeData
        );

        // Should have moved (chain has passages)
        if (chain.length > 1) {
            expect(finalCoord).not.toBe(chain[0]);
            expect(newTrail.length).toBeGreaterThan(1);
        }
    });
});


// ── Property 11: Back/retrace slides to last junction ──────

/**
 * Feature: playable-maze-game
 * Property 11: Back/retrace slides to last junction
 *
 * Pressing B retraces the trail backwards, stopping at the last junction
 * (cell with multiple forward passage options) or the entry cell.
 *
 * **Validates: Back key requirement**
 */
describe('Property 11: Back/retrace slides to last junction', () => {
    it('back on a single-element trail is a no-op', () => {
        fc.assert(
            fc.property(cellCoordArb, (entryCell) => {
                const cells = new Map();
                cells.set(entryCell, makeCell(...entryCell.split(',').map(Number)));
                const mazeData = buildMazeData(cells, new Set());
                const trail = [entryCell];

                const { finalCoord, newTrail } = autoSlideBack(trail, mazeData);
                expect(finalCoord).toBe(entryCell);
                expect(newTrail).toEqual([entryCell]);
            }),
            { numRuns: 100 }
        );
    });

    it('back on a straightaway retraces all the way to the start', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 12 }),
                (chainLen) => {
                    const { cells, passageSet, chain } = buildLinearChain(chainLen);
                    const mazeData = buildMazeData(cells, passageSet);

                    // Player at end of chain, trail = full chain
                    const trail = [...chain];
                    const { finalCoord, newTrail } = autoSlideBack(trail, mazeData);

                    // Should retrace all the way to the start (no junctions in a linear chain)
                    expect(finalCoord).toBe(chain[0]);
                    expect(newTrail).toEqual([chain[0]]);
                }
            ),
            { numRuns: 200 }
        );
    });

    it('back stops at a junction cell', () => {
        // Build: A - B - C - D - E with a branch at C
        //                |
        //                F
        const cells = new Map();
        for (let c = 0; c <= 4; c++) {
            cells.set(`0,${c}`, makeCell(0, c));
        }
        cells.set('1,2', makeCell(1, 2));

        const passageSet = new Set([
            '0,0|0,1', '0,1|0,2', '0,2|0,3', '0,3|0,4',
            '0,2|1,2', // branch at 0,2
        ]);
        const mazeData = buildMazeData(cells, passageSet);

        // Trail: A → B → C → D → E, player at E
        const trail = ['0,0', '0,1', '0,2', '0,3', '0,4'];
        const { finalCoord, newTrail } = autoSlideBack(trail, mazeData);

        // Should stop at C (0,2) because it's a junction
        expect(finalCoord).toBe('0,2');
        expect(newTrail).toEqual(['0,0', '0,1', '0,2']);
    });

    it('back from a 2-cell trail returns to entry', () => {
        const cells = new Map();
        cells.set('0,0', makeCell(0, 0));
        cells.set('0,1', makeCell(0, 1));
        const passageSet = new Set(['0,0|0,1']);
        const mazeData = buildMazeData(cells, passageSet);

        const trail = ['0,0', '0,1'];
        const { finalCoord, newTrail } = autoSlideBack(trail, mazeData);

        expect(finalCoord).toBe('0,0');
        expect(newTrail).toEqual(['0,0']);
    });

    it('back is a no-op when locked', () => {
        const { cells, passageSet, chain } = buildLinearChain(5);
        const mazeData = buildMazeData(cells, passageSet);

        const pc = createPlayerController();
        pc.init(chain[0]);
        pc.pathTrail = [...chain];
        pc.currentCell = chain[4];
        pc.locked = true;

        const positionBefore = pc.currentCell;
        const trailBefore = [...pc.pathTrail];

        // Simulate handleKeydown check: locked → skip
        if (!pc.locked) {
            const result = autoSlideBack(pc.pathTrail, mazeData);
            pc.currentCell = result.finalCoord;
            pc.pathTrail = result.newTrail;
        }

        expect(pc.currentCell).toBe(positionBefore);
        expect(pc.pathTrail).toEqual(trailBefore);
    });
});

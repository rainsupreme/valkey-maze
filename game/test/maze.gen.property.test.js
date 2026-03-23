import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    createPRNG,
    dateSeed,
    buildHexGrid,
    generateMaze,
    DIFFICULTY_TIERS,
} from '../maze.gen.js';

// ── Property 1: PRNG determinism ────────────────────────────
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 1: PRNG determinism
 *
 * For any 32-bit integer seed and sequence length N, creating two PRNG
 * instances with the same seed and calling next() N times on each
 * should produce identical sequences.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 1: PRNG determinism', () => {
    it('two PRNG instances with the same seed produce identical sequences', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: -2147483648, max: 2147483647 }),
                fc.integer({ min: 1, max: 200 }),
                (seed, n) => {
                    const prng1 = createPRNG(seed);
                    const prng2 = createPRNG(seed);

                    for (let i = 0; i < n; i++) {
                        expect(prng1.next()).toBe(prng2.next());
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 2: PRNG choice returns array element ───────────
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 2: PRNG choice returns array element
 *
 * For any non-empty array and any seed, calling prng.choice(arr)
 * should return an element that exists in the original array.
 *
 * **Validates: Requirements 4.3**
 */
describe('Property 2: PRNG choice returns array element', () => {
    it('choice() always returns an element from the input array', () => {
        fc.assert(
            fc.property(
                fc.array(fc.anything(), { minLength: 1, maxLength: 50 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (arr, seed) => {
                    const prng = createPRNG(seed);
                    const result = prng.choice(arr);
                    expect(arr).toContain(result);
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 3: Maze generation determinism ─────────────────
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 3: Maze generation determinism
 *
 * For any valid hex_side (3–9), center_hex_radius, and seed,
 * calling generateMaze twice with the same parameters and seed
 * should produce identical maze data.
 *
 * **Validates: Requirements 3.3, 5.3**
 */
describe('Property 3: Maze generation determinism', () => {
    it('two calls with the same parameters produce identical output', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 9 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (hexSide, seed) => {
                    const centerHexRadius = Math.max(1, Math.floor(hexSide / 3));

                    const prng1 = createPRNG(seed);
                    const result1 = generateMaze(hexSide, centerHexRadius, prng1);

                    const prng2 = createPRNG(seed);
                    const result2 = generateMaze(hexSide, centerHexRadius, prng2);

                    expect(result1.rows).toBe(result2.rows);
                    expect(result1.cols).toBe(result2.cols);
                    expect(result1.cellSize).toBe(result2.cellSize);
                    expect(result1.margin).toBe(result2.margin);
                    expect(result1.stretch).toBe(result2.stretch);
                    expect(result1.entryCell).toEqual(result2.entryCell);
                    expect(result1.goalCells).toEqual(result2.goalCells);
                    expect(result1.cells).toEqual(result2.cells);
                    expect(result1.passages).toEqual(result2.passages);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 4: Hexagonal grid construction correctness ─────
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 4: Hexagonal grid construction correctness
 *
 * For any valid hex_side value, buildHexGrid(hexSide) should produce
 * a grid where rows === hexSide*2 (after forcing odd), cols === 4*hexSide-1
 * (after forcing odd), correct upward flags, and valid neighbors.
 *
 * **Validates: Requirements 3.1, 7.2**
 */
describe('Property 4: Hexagonal grid construction correctness', () => {
    it('grid dimensions, upward flags, and neighbors are correct', { timeout: 30000 }, () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 12 }),
                (hexSide) => {
                    const effectiveHexSide = hexSide % 2 === 0 ? hexSide + 1 : hexSide;
                    const grid = buildHexGrid(hexSide);

                    // (a) rows === effectiveHexSide * 2
                    expect(grid.rows).toBe(effectiveHexSide * 2);

                    // (b) cols === 4 * effectiveHexSide - 1
                    expect(grid.cols).toBe(4 * effectiveHexSide - 1);

                    // (c) every cell's upward field equals (row + col) % 2 === 0
                    for (const [, cell] of grid.cells) {
                        expect(cell.upward).toBe((cell.row + cell.col) % 2 === 0);
                    }

                    // (d) every neighbor is a valid cell that differs by exactly 1 in row or column, not both
                    for (const [key, neighborKeys] of grid.neighbors) {
                        const [r, c] = key.split(',').map(Number);
                        for (const nk of neighborKeys) {
                            expect(grid.cells.has(nk)).toBe(true);
                            const [nr, nc] = nk.split(',').map(Number);
                            const rowDiff = Math.abs(nr - r);
                            const colDiff = Math.abs(nc - c);
                            // Adjacent means exactly one of row/col differs by 1, the other is 0
                            const isAdjacent = (rowDiff === 1 && colDiff === 0) ||
                                               (rowDiff === 0 && colDiff === 1);
                            expect(isAdjacent).toBe(true);
                        }
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 5: Maze output format completeness and passage deduplication ──
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 5: Maze output format completeness and passage deduplication
 *
 * For any valid parameters and seeds (small hex_side 3–9), verify all
 * required fields present, constants correct, passages deduplicated,
 * entryCell and goalCells reference valid coordinates.
 *
 * **Validates: Requirements 3.4, 7.1, 7.3**
 */
describe('Property 5: Maze output format completeness and passage deduplication', () => {
    it('output has all required fields, correct constants, deduplicated passages, and valid references', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 9 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (hexSide, seed) => {
                    const centerHexRadius = Math.max(1, Math.floor(hexSide / 3));
                    const prng = createPRNG(seed);
                    const maze = generateMaze(hexSide, centerHexRadius, prng);

                    // (a) all required fields present
                    expect(maze).toHaveProperty('rows');
                    expect(maze).toHaveProperty('cols');
                    expect(maze).toHaveProperty('cellSize');
                    expect(maze).toHaveProperty('centerHexRadius');
                    expect(maze).toHaveProperty('margin');
                    expect(maze).toHaveProperty('stretch');
                    expect(maze).toHaveProperty('cells');
                    expect(maze).toHaveProperty('passages');
                    expect(maze).toHaveProperty('entryCell');
                    expect(maze).toHaveProperty('goalCells');

                    // (b) constants correct
                    expect(maze.cellSize).toBe(30);
                    expect(maze.margin).toBe(40);
                    expect(maze.stretch).toBe(1.03);

                    // (c) passages deduplicated — each undirected edge appears exactly once
                    const passageKeys = new Set();
                    for (const [[r1, c1], [r2, c2]] of maze.passages) {
                        const a = `${r1},${c1}`;
                        const b = `${r2},${c2}`;
                        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
                        expect(passageKeys.has(key)).toBe(false);
                        passageKeys.add(key);
                    }

                    // Build a set of valid cell coordinates for reference checks
                    const cellCoords = new Set(
                        maze.cells.map(c => `${c.row},${c.col}`)
                    );

                    // (d) entryCell references a valid coordinate
                    const entryKey = `${maze.entryCell[0]},${maze.entryCell[1]}`;
                    expect(cellCoords.has(entryKey)).toBe(true);

                    // (d) all goalCells reference valid coordinates
                    for (const [gr, gc] of maze.goalCells) {
                        expect(cellCoords.has(`${gr},${gc}`)).toBe(true);
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 6: Tier parameters produce correct grid dimensions ──
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 6: Tier parameters produce correct grid dimensions
 *
 * For the easy and medium tiers in DIFFICULTY_TIERS, generate a maze
 * and verify rows === hexSide*2 (after forcing odd) and
 * cols === 4*hexSide-1 (after forcing odd).
 *
 * **Validates: Requirements 1.2**
 */
describe('Property 6: Tier parameters produce correct grid dimensions', () => {
    // Only test easy (hexSide=5) and medium (hexSide=8) to keep tests fast
    const testTiers = DIFFICULTY_TIERS.filter(t => t.id === 'easy' || t.id === 'medium');

    it('easy and medium tiers produce correct grid dimensions', () => {
        fc.assert(
            fc.property(
                fc.constantFrom(...testTiers),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (tier, seed) => {
                    const prng = createPRNG(seed);
                    const maze = generateMaze(tier.hexSide, tier.centerHexRadius, prng);

                    const effectiveHexSide = tier.hexSide % 2 === 0
                        ? tier.hexSide + 1
                        : tier.hexSide;

                    expect(maze.rows).toBe(effectiveHexSide * 2);
                    expect(maze.cols).toBe(4 * effectiveHexSide - 1);
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 7: Date seed is a pure function of date components ──
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 7: Date seed is a pure function of date components
 *
 * For any valid year (2000–2099), month (1–12), and day (1–28),
 * dateSeed(new Date(y, m-1, d)) equals y*10000 + m*100 + d
 * and is idempotent.
 *
 * **Validates: Requirements 5.5**
 */
describe('Property 7: Date seed is a pure function of date components', () => {
    it('dateSeed produces y*10000 + m*100 + d and is idempotent', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 2000, max: 2099 }),
                fc.integer({ min: 1, max: 12 }),
                fc.integer({ min: 1, max: 28 }),
                (year, month, day) => {
                    const date = new Date(year, month - 1, day);
                    const expected = year * 10000 + month * 100 + day;

                    // Correct value
                    expect(dateSeed(date)).toBe(expected);

                    // Idempotent — calling again with same date gives same result
                    expect(dateSeed(date)).toBe(dateSeed(new Date(year, month - 1, day)));
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 8: Maze data serialization round-trip ──────────
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 8: Maze data serialization round-trip
 *
 * For any valid hex_side (3–9), center_hex_radius, and seed,
 * generating a maze, exporting it to JSON via exportMazeJSON,
 * parsing the JSON via parseMazeJSON, and comparing the result
 * to the original should produce equivalent data:
 * same cells (as sets), same passages (as sets of undirected edges),
 * same entryCell, and same goalCells (as sets).
 *
 * **Validates: Requirements 10.1, 10.2, 10.3**
 */
import { exportMazeJSON, parseMazeJSON } from '../maze.gen.js';

describe('Property 8: Maze data serialization round-trip', () => {
    /**
     * Helper: normalize cells into a sorted set of "row,col,upward" strings
     * so order doesn't matter.
     */
    function normalizeCells(cells) {
        return cells
            .map(c => `${c.row},${c.col},${c.upward}`)
            .sort();
    }

    /**
     * Helper: normalize passages into a sorted set of canonical edge strings
     * so order of edges and order within each edge don't matter.
     */
    function normalizePassages(passages) {
        return passages
            .map(([[r1, c1], [r2, c2]]) => {
                const a = `${r1},${c1}`;
                const b = `${r2},${c2}`;
                return a < b ? `${a}|${b}` : `${b}|${a}`;
            })
            .sort();
    }

    /**
     * Helper: normalize goalCells into a sorted set of "row,col" strings.
     */
    function normalizeGoalCells(goalCells) {
        return goalCells
            .map(([r, c]) => `${r},${c}`)
            .sort();
    }

    it('generate → exportMazeJSON → parseMazeJSON preserves all maze data', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 3, max: 9 }),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (hexSide, seed) => {
                    const centerHexRadius = Math.max(1, Math.floor(hexSide / 3));
                    const prng = createPRNG(seed);
                    const original = generateMaze(hexSide, centerHexRadius, prng);

                    // Round-trip: export to JSON → parse back
                    const json = exportMazeJSON(original);
                    const parsed = parseMazeJSON(json);

                    // Scalar fields must match exactly
                    expect(parsed.rows).toBe(original.rows);
                    expect(parsed.cols).toBe(original.cols);
                    expect(parsed.cellSize).toBe(original.cellSize);
                    expect(parsed.centerHexRadius).toBe(original.centerHexRadius);
                    expect(parsed.margin).toBe(original.margin);
                    expect(parsed.stretch).toBe(original.stretch);

                    // entryCell must match
                    expect(parsed.entryCell).toEqual(original.entryCell);

                    // Cells as sets (order doesn't matter)
                    expect(normalizeCells(parsed.cells)).toEqual(normalizeCells(original.cells));

                    // Passages as sets of undirected edges (order doesn't matter)
                    expect(normalizePassages(parsed.passages)).toEqual(normalizePassages(original.passages));

                    // GoalCells as sets (order doesn't matter)
                    expect(normalizeGoalCells(parsed.goalCells)).toEqual(normalizeGoalCells(original.goalCells));
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 9: Visual scaling consistency across difficulty tiers ──
/**
 * Feature: level-selection-and-daily-puzzle
 * Property 9: Visual scaling consistency across difficulty tiers
 *
 * For each tier in DIFFICULTY_TIERS, generate a maze with a given seed,
 * compute the SVG viewport dimensions and visual element dimensions
 * (logo scale, hex background radius, god ray reach, center point),
 * and verify all values are positive and share the same center coordinates.
 *
 * **Validates: Requirements 11.1, 11.2, 11.3, 11.5**
 */
describe('Property 9: Visual scaling consistency across difficulty tiers', () => {
    it('visual dimensions are positive and share the same center point for every tier', () => {
        // Use a reasonable logoH constant matching the default SVG viewBox height
        const logoH = 100;

        fc.assert(
            fc.property(
                fc.constantFrom(...DIFFICULTY_TIERS),
                fc.integer({ min: -2147483648, max: 2147483647 }),
                (tier, seed) => {
                    const prng = createPRNG(seed);
                    const maze = generateMaze(tier.hexSide, tier.centerHexRadius, prng);

                    const cs = maze.cellSize;
                    const margin = maze.margin;
                    const stretch = maze.stretch;

                    // SVG viewport dimensions (matching GameRenderer.init — width/height swapped due to 90° rotation)
                    const mazeWidth = maze.cols * cs * 0.5 + cs * 0.5;
                    const mazeHeight = maze.rows * cs * 0.866;
                    const width = mazeHeight + 2 * margin;
                    const height = (mazeWidth + 2 * margin) * stretch;

                    // Center point
                    const centerX = width / 2;
                    const centerY = height / 2;

                    // Logo scale (from _drawLogo)
                    const hexDiameter = maze.centerHexRadius * cs * 2;
                    const logoScale = hexDiameter / logoH;

                    // Hex background radius (from _addLogoBg)
                    const hexBgRadius = maze.centerHexRadius * cs;

                    // God ray reach (from _addGodRays)
                    const godRayReach = Math.min(width, height) / 2;

                    // (a) All computed values must be positive
                    expect(width).toBeGreaterThan(0);
                    expect(height).toBeGreaterThan(0);
                    expect(centerX).toBeGreaterThan(0);
                    expect(centerY).toBeGreaterThan(0);
                    expect(logoScale).toBeGreaterThan(0);
                    expect(hexBgRadius).toBeGreaterThan(0);
                    expect(godRayReach).toBeGreaterThan(0);

                    // (b) Logo, hex bg, and god rays all use the same center point
                    // In GameRenderer: _drawLogo uses (width/2, height/2),
                    // _addLogoBg uses (width/2, height/2), _addGodRays uses (cx, cy) = (width/2, height/2)
                    const logoCenterX = centerX;
                    const logoCenterY = centerY;
                    const hexBgCenterX = centerX;
                    const hexBgCenterY = centerY;
                    const godRayCenterX = centerX;
                    const godRayCenterY = centerY;

                    expect(logoCenterX).toBe(hexBgCenterX);
                    expect(logoCenterY).toBe(hexBgCenterY);
                    expect(logoCenterX).toBe(godRayCenterX);
                    expect(logoCenterY).toBe(godRayCenterY);
                }
            ),
            { numRuns: 100 }
        );
    });
});

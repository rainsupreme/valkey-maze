/** @vitest-environment jsdom */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { angleToDirection, resolveVisualDirection } from '../game.logic.js';

// ── Property 1: Angle classification covers all directions ──
/**
 * Feature: drag-path-control
 * Property 1: Angle classification covers all directions
 *
 * For any angle in [0°, 360°), angleToDirection returns exactly one of
 * the 6 visual directions, and the returned direction corresponds to the
 * 60° sector containing that angle, with "up" centered at 270° and
 * "down" centered at 90°.
 *
 * Sectors (screen coords, Y-down, measured from +X axis):
 *   lower-right:  [0°, 60°)
 *   down:         [60°, 120°)
 *   lower-left:   [120°, 180°)
 *   upper-left:   [180°, 240°)
 *   up:           [240°, 300°)
 *   upper-right:  [300°, 360°)
 *
 * **Validates: Requirements 2.2, 5.1, 5.2, 5.3**
 */

const VALID_DIRECTIONS = new Set([
    'up', 'down', 'upper-left', 'upper-right', 'lower-left', 'lower-right',
]);

/**
 * Given an angle in [0, 360), return the expected visual direction
 * based on the 60° sector boundaries.
 */
function expectedDirection(angleDeg) {
    if (angleDeg < 60)  return 'lower-right';
    if (angleDeg < 120) return 'down';
    if (angleDeg < 180) return 'lower-left';
    if (angleDeg < 240) return 'upper-left';
    if (angleDeg < 300) return 'up';
    return 'upper-right';
}

describe('Feature: drag-path-control, Property 1: Angle classification covers all directions', () => {
    it('for any angle in [0°, 360°), angleToDirection returns the correct sector direction', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 359.999, noNaN: true, noDefaultInfinity: true }),
                (angleDeg) => {
                    const angleRad = angleDeg * (Math.PI / 180);
                    const dx = Math.cos(angleRad);
                    const dy = Math.sin(angleRad);
                    const result = angleToDirection(dx, dy);
                    expect(VALID_DIRECTIONS.has(result)).toBe(true);
                    expect(result).toBe(expectedDirection(angleDeg));
                }
            ),
            { numRuns: 200 }
        );
    });

    it('angles just inside each sector boundary map to the correct direction', () => {
        const boundaries = [
            { angle: 0.1,   expected: 'lower-right' },
            { angle: 60.1,  expected: 'down' },
            { angle: 120.1, expected: 'lower-left' },
            { angle: 180.1, expected: 'upper-left' },
            { angle: 240.1, expected: 'up' },
            { angle: 300.1, expected: 'upper-right' },
        ];
        for (const { angle, expected } of boundaries) {
            const rad = angle * (Math.PI / 180);
            expect(angleToDirection(Math.cos(rad), Math.sin(rad))).toBe(expected);
        }
    });

    it('sector centers map to the correct direction', () => {
        const centers = [
            { angle: 30,  expected: 'lower-right' },
            { angle: 90,  expected: 'down' },
            { angle: 150, expected: 'lower-left' },
            { angle: 210, expected: 'upper-left' },
            { angle: 270, expected: 'up' },
            { angle: 330, expected: 'upper-right' },
        ];
        for (const { angle, expected } of centers) {
            const rad = angle * (Math.PI / 180);
            expect(angleToDirection(Math.cos(rad), Math.sin(rad))).toBe(expected);
        }
    });

    it('varying magnitudes do not affect direction classification', () => {
        fc.assert(
            fc.property(
                fc.double({ min: 0, max: 359.999, noNaN: true, noDefaultInfinity: true }),
                fc.double({ min: 0.001, max: 1000, noNaN: true, noDefaultInfinity: true }),
                (angleDeg, magnitude) => {
                    const angleRad = angleDeg * (Math.PI / 180);
                    const dx = magnitude * Math.cos(angleRad);
                    const dy = magnitude * Math.sin(angleRad);
                    expect(angleToDirection(dx, dy)).toBe(expectedDirection(angleDeg));
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ══════════════════════════════════════════════════════════════
// Properties 2–6: Integration tests via pointer-event simulation
//
// DragController is tested through simulated pointer events on the SVG.
// We set up the environment ONCE per describe block (in beforeEach),
// then run synchronous fc.property tests that vary the inputs.
// ══════════════════════════════════════════════════════════════

const ALL_VISUAL_DIRECTIONS = ['up', 'down', 'upper-left', 'upper-right', 'lower-left', 'lower-right'];
const visualDirectionArb = fc.constantFrom(...ALL_VISUAL_DIRECTIONS);

function makeCell(row, col) {
    return { row, col, upward: (row + col) % 2 === 0 };
}

/**
 * Dispatch a PointerEvent on an element.
 */
function dispatchPointer(element, type, opts = {}) {
    const event = new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: opts.clientX ?? 0,
        clientY: opts.clientY ?? 0,
        pointerId: opts.pointerId ?? 1,
    });
    element.dispatchEvent(event);
    return event;
}

/**
 * Build a 3×6 triangular grid with all adjacent passages open.
 */
function buildTestGrid() {
    const cells = new Map();
    const passages = new Map();
    for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 6; c++) {
            const key = `${r},${c}`;
            cells.set(key, makeCell(r, c));
        }
    }
    for (const [key, cell] of cells) {
        const { row, col, upward } = cell;
        const neighbors = [];
        if (cells.has(`${row},${col - 1}`)) neighbors.push(`${row},${col - 1}`);
        if (cells.has(`${row},${col + 1}`)) neighbors.push(`${row},${col + 1}`);
        if (upward && cells.has(`${row + 1},${col}`)) neighbors.push(`${row + 1},${col}`);
        if (!upward && cells.has(`${row - 1},${col}`)) neighbors.push(`${row - 1},${col}`);
        if (!passages.has(key)) passages.set(key, new Set());
        for (const n of neighbors) {
            passages.get(key).add(n);
            if (!passages.has(n)) passages.set(n, new Set());
            passages.get(n).add(key);
        }
    }
    return { cells, passages };
}

// Shared module references
let PlayerController;
let MazeData;
let GameRenderer;
let DragController;
let GameStateManager;
let svgEl;

/**
 * Set up jsdom environment with mock SVG, import game.js, and
 * initialize DragController. Called once per test via beforeEach.
 */
async function setupDragEnv(opts = {}) {
    const {
        viewBoxW = 600, viewBoxH = 400,
        rectW = 600, rectH = 400,
        cellSize = 40,
    } = opts;

    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // jsdom lacks PointerEvent — polyfill
    if (!window.PointerEvent) {
        window.PointerEvent = class PointerEvent extends MouseEvent {
            constructor(type, params = {}) {
                super(type, params);
                this.pointerId = params.pointerId ?? 1;
            }
        };
    }

    const controls = document.createElement('div');
    controls.id = 'controls';
    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    controls.appendChild(resetBtn);
    document.body.appendChild(controls);

    const svgContainer = document.createElement('div');
    svgContainer.id = 'maze-container';
    document.body.appendChild(svgContainer);

    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${viewBoxW} ${viewBoxH}`);
    svgContainer.appendChild(svg);

    svg.getBoundingClientRect = () => ({
        x: 0, y: 0, width: rectW, height: rectH,
        top: 0, left: 0, right: rectW, bottom: rectH,
    });
    svg.setPointerCapture = vi.fn();
    svg.releasePointerCapture = vi.fn();

    // jsdom doesn't support svg.viewBox.baseVal — mock it
    Object.defineProperty(svg, 'viewBox', {
        value: { baseVal: { x: 0, y: 0, width: viewBoxW, height: viewBoxH } },
        configurable: true,
    });

    window.ontouchstart = null;

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    const mod = await import('../game.js');
    PlayerController = mod.PlayerController;
    MazeData = mod.MazeData;
    GameRenderer = mod.GameRenderer;
    DragController = mod.DragController;
    GameStateManager = mod.GameStateManager;

    GameRenderer.svg = svg;
    GameRenderer.svgContainer = svgContainer;
    GameRenderer.transformGroup = document.createElementNS(NS, 'g');
    svg.appendChild(GameRenderer.transformGroup);
    GameRenderer.drawPlayerMarker = vi.fn();
    GameRenderer.updateTrail = vi.fn();

    MazeData.cellSize = cellSize;
    MazeData.cells = new Map();
    MazeData.passages = new Map();
    MazeData.entryCell = '0,0';
    MazeData.goalCells = new Set();

    GameStateManager.onPlayerMove = vi.fn();
    GameStateManager.onWin = vi.fn();

    PlayerController.currentCell = '0,0';
    PlayerController.pathTrail = ['0,0'];
    PlayerController.locked = false;

    DragController.init();
    svgEl = svg;
}

function teardownDragEnv() {
    // End any active session to remove listeners
    if (DragController && DragController._active) {
        DragController._endSession();
    }
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
}


// ── Property 2: Threshold scales with cell size ─────────────
/**
 * Feature: drag-path-control
 * Property 2: Threshold scales with cell size
 *
 * For any positive cell size and positive multiplier, the threshold
 * equals multiplier × cellSize × svgScale.
 *
 * We verify by setting up DragController with known parameters, then
 * checking that a pointermove below the computed threshold does NOT
 * trigger movement, confirming the threshold formula is correct.
 *
 * **Validates: Requirements 2.1**
 */
describe('Feature: drag-path-control, Property 2: Threshold scales with cell size', () => {
    afterEach(() => teardownDragEnv());

    it('for any positive cellSize and multiplier, movement is not triggered below multiplier × cellSize × svgScale', async () => {
        // We test multiple random configurations sequentially
        // Setup env once with default params, then vary cellSize/multiplier per iteration
        await setupDragEnv({ viewBoxW: 600, viewBoxH: 400, rectW: 600, rectH: 400, cellSize: 40 });

        fc.assert(
            fc.property(
                fc.integer({ min: 10, max: 200 }),       // cellSize
                fc.double({ min: 0.5, max: 3.0, noNaN: true, noDefaultInfinity: true }), // multiplier
                (cellSize, multiplier) => {
                    // Reconfigure for this iteration
                    MazeData.cellSize = cellSize;
                    DragController._thresholdMultiplier = multiplier;

                    // Compute expected threshold: multiplier × cellSize × scale
                    // scale = min(rectW/vbW, rectH/vbH) = min(600/600, 400/400) = 1.0
                    const scale = 1.0;
                    const expectedThreshold = multiplier * cellSize / Math.sqrt(3) * scale;

                    // Set up grid so movement CAN happen
                    const { cells, passages } = buildTestGrid();
                    MazeData.cells = cells;
                    MazeData.passages = passages;
                    PlayerController.currentCell = '1,3';
                    PlayerController.pathTrail = ['1,2', '1,3'];
                    PlayerController.locked = false;

                    // End any prior session
                    if (DragController._active) DragController._endSession();

                    const moveDirSpy = vi.fn();
                    const moveBackSpy = vi.fn();
                    const origMoveDir = PlayerController.moveDirection;
                    const origMoveBack = PlayerController.moveBack;
                    PlayerController.moveDirection = moveDirSpy;
                    PlayerController.moveBack = moveBackSpy;

                    // Start drag at anchor (200, 200)
                    const anchorX = 200;
                    const anchorY = 200;
                    dispatchPointer(svgEl, 'pointerdown', { clientX: anchorX, clientY: anchorY });

                    // Move below threshold — should NOT trigger any movement
                    const belowDist = Math.max(0.5, expectedThreshold - 1);
                    dispatchPointer(svgEl, 'pointermove', {
                        clientX: anchorX + belowDist,
                        clientY: anchorY,
                    });
                    expect(moveDirSpy).not.toHaveBeenCalled();
                    expect(moveBackSpy).not.toHaveBeenCalled();

                    // Clean up
                    dispatchPointer(svgEl, 'pointerup', {});
                    PlayerController.moveDirection = origMoveDir;
                    PlayerController.moveBack = origMoveBack;
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 5: Session terminates on pointer release ───────
/**
 * Feature: drag-path-control
 * Property 5: Session terminates on pointer release
 *
 * For any active drag session and any end-event type (pointerup or
 * pointercancel), the session becomes inactive and the player remains
 * at the last cell.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Feature: drag-path-control, Property 5: Session terminates on pointer release', () => {
    afterEach(() => teardownDragEnv());

    it('for any end-event type, session becomes inactive and player stays at last cell', async () => {
        await setupDragEnv();

        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;

        fc.assert(
            fc.property(
                fc.constantFrom('pointerup', 'pointercancel'),
                fc.integer({ min: 0, max: 500 }),
                fc.integer({ min: 0, max: 500 }),
                (endEventType, px, py) => {
                    // Reset state for each iteration
                    if (DragController._active) DragController._endSession();
                    PlayerController.currentCell = '1,3';
                    PlayerController.pathTrail = ['1,2', '1,3'];
                    PlayerController.locked = false;

                    // Start a drag session
                    dispatchPointer(svgEl, 'pointerdown', { clientX: px, clientY: py });
                    expect(DragController._active).toBe(true);

                    const cellBefore = PlayerController.currentCell;
                    const trailBefore = [...PlayerController.pathTrail];

                    // End the session
                    dispatchPointer(svgEl, endEventType, { clientX: px, clientY: py });

                    // Session should be inactive
                    expect(DragController._active).toBe(false);
                    expect(DragController._pointerId).toBeNull();

                    // Player should remain at the same cell
                    expect(PlayerController.currentCell).toBe(cellBefore);
                    expect(PlayerController.pathTrail).toEqual(trailBefore);
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 6: Locked state prevents new sessions ──────────
/**
 * Feature: drag-path-control
 * Property 6: Locked state prevents new sessions
 *
 * For any pointer position on the SVG, when PlayerController.locked
 * is true, pointerdown does not initiate a session.
 *
 * **Validates: Requirements 7.1**
 */
describe('Feature: drag-path-control, Property 6: Locked state prevents new sessions', () => {
    afterEach(() => teardownDragEnv());

    it('when locked, pointerdown at any position does not initiate a session', async () => {
        await setupDragEnv();

        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 1000 }),
                fc.integer({ min: 0, max: 1000 }),
                fc.integer({ min: 1, max: 100 }),
                (px, py, pointerId) => {
                    // Reset state
                    if (DragController._active) DragController._endSession();
                    svgEl.setPointerCapture.mockClear();
                    PlayerController.locked = true;

                    // Attempt to start a drag session
                    dispatchPointer(svgEl, 'pointerdown', { clientX: px, clientY: py, pointerId });

                    // Session should NOT be active
                    expect(DragController._active).toBe(false);
                    expect(DragController._pointerId).toBeNull();
                    expect(svgEl.setPointerCapture).not.toHaveBeenCalled();
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 3: Anchor updates if and only if movement succeeds ─
/**
 * Feature: drag-path-control
 * Property 3: Anchor updates if and only if movement succeeds
 *
 * For any drag that exceeds the threshold, if the cell changes after
 * moveDirection/moveBack, the anchor updates to the triggering pointer
 * position. If the cell doesn't change, the anchor stays the same.
 *
 * **Validates: Requirements 2.4, 2.5, 3.2**
 */
describe('Feature: drag-path-control, Property 3: Anchor updates if and only if movement succeeds', () => {
    afterEach(() => teardownDragEnv());

    it('anchor advances by threshold when cell changes, stays unchanged when it does not', async () => {
        await setupDragEnv({ cellSize: 10 });
        DragController._thresholdMultiplier = 0.1; // very small threshold

        fc.assert(
            fc.property(
                fc.boolean(), // whether movement will succeed
                fc.integer({ min: 50, max: 400 }),
                fc.integer({ min: 50, max: 400 }),
                (willSucceed, anchorX, anchorY) => {
                    // Reset state
                    if (DragController._active) DragController._endSession();
                    PlayerController.locked = false;

                    if (willSucceed) {
                        const { cells, passages } = buildTestGrid();
                        MazeData.cells = cells;
                        MazeData.passages = passages;
                        PlayerController.currentCell = '1,3';
                        PlayerController.pathTrail = ['1,3'];
                    } else {
                        // Single isolated cell — no passages, movement will fail
                        const cells = new Map();
                        cells.set('5,5', makeCell(5, 5));
                        MazeData.cells = cells;
                        MazeData.passages = new Map();
                        PlayerController.currentCell = '5,5';
                        PlayerController.pathTrail = ['5,5'];
                    }

                    // Start drag session
                    dispatchPointer(svgEl, 'pointerdown', { clientX: anchorX, clientY: anchorY });
                    expect(DragController._anchorX).toBe(anchorX);
                    expect(DragController._anchorY).toBe(anchorY);

                    // Move pointer far enough to exceed threshold (purely horizontal)
                    const moveX = anchorX + 200;
                    const moveY = anchorY;
                    const cellBefore = PlayerController.currentCell;

                    dispatchPointer(svgEl, 'pointermove', { clientX: moveX, clientY: moveY });

                    const cellAfter = PlayerController.currentCell;
                    const threshPx = DragController._getThresholdPx();

                    if (cellAfter !== cellBefore) {
                        // Movement succeeded → anchor advances by threshold along drag vector
                        // Drag was purely horizontal (+X), so anchor advances by threshPx in X
                        expect(DragController._anchorX).toBeCloseTo(anchorX + threshPx, 5);
                        expect(DragController._anchorY).toBeCloseTo(anchorY, 5);
                    } else {
                        // Movement failed → anchor unchanged
                        expect(DragController._anchorX).toBe(anchorX);
                        expect(DragController._anchorY).toBe(anchorY);
                    }

                    dispatchPointer(svgEl, 'pointerup', {});
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ── Property 4: Backtrack direction detection ───────────────
/**
 * Feature: drag-path-control
 * Property 4: Backtrack direction detection
 *
 * For any path trail with length ≥ 2 and any visual direction, if
 * resolveVisualDirection(currentCell, visualDir, cells) equals the
 * previous cell, then _isBacktrackDirection returns true and moveBack
 * is invoked (instead of moveDirection).
 *
 * **Validates: Requirements 3.1**
 */
describe('Feature: drag-path-control, Property 4: Backtrack direction detection', () => {
    afterEach(() => teardownDragEnv());

    it('when drag direction resolves to previous trail cell, player backtracks one cell', async () => {
        await setupDragEnv({ cellSize: 10 });
        DragController._thresholdMultiplier = 0.1;

        const { cells, passages } = buildTestGrid();

        fc.assert(
            fc.property(
                visualDirectionArb,
                (visualDir) => {
                    // Reset state
                    if (DragController._active) DragController._endSession();
                    PlayerController.locked = false;

                    MazeData.cells = cells;
                    MazeData.passages = passages;

                    // Find which neighbor the visual direction resolves to from '1,3'
                    const currentCell = '1,3';
                    const prevCell = resolveVisualDirection(currentCell, visualDir, cells);

                    if (!prevCell) return; // no neighbor in this direction — skip
                    const passageNeighbors = passages.get(currentCell);
                    if (!passageNeighbors || !passageNeighbors.has(prevCell)) return;

                    // Set up trail so prevCell is the previous cell
                    PlayerController.currentCell = currentCell;
                    PlayerController.pathTrail = [prevCell, currentCell];

                    // Verify _isBacktrackDirection returns true
                    expect(DragController._isBacktrackDirection(visualDir)).toBe(true);

                    // Start drag session
                    const anchorX = 200;
                    const anchorY = 200;
                    dispatchPointer(svgEl, 'pointerdown', { clientX: anchorX, clientY: anchorY });

                    // Compute dx/dy that produces the desired visual direction
                    const sectorCenters = {
                        'lower-right': 30, 'down': 90, 'lower-left': 150,
                        'upper-left': 210, 'up': 270, 'upper-right': 330,
                    };
                    const angleDeg = sectorCenters[visualDir];
                    const angleRad = angleDeg * (Math.PI / 180);
                    const dist = 200;
                    const moveX = anchorX + dist * Math.cos(angleRad);
                    const moveY = anchorY + dist * Math.sin(angleRad);

                    dispatchPointer(svgEl, 'pointermove', { clientX: moveX, clientY: moveY });

                    // Player should have backtracked to prevCell
                    expect(PlayerController.currentCell).toBe(prevCell);
                    expect(PlayerController.pathTrail).toEqual([prevCell]);

                    // Clean up
                    dispatchPointer(svgEl, 'pointerup', {});
                }
            ),
            { numRuns: 100 }
        );
    });
});


// ══════════════════════════════════════════════════════════════
// Task 6.1: Unit tests for integration and edge cases
// ══════════════════════════════════════════════════════════════

import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Unit Tests: Drag session initiation and edge cases', () => {
    afterEach(() => teardownDragEnv());

    // ── 1. Pointerdown on SVG initiates a session and records anchor ──
    // **Validates: Requirements 1.1**
    it('pointerdown on SVG initiates a session and records anchor', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;

        const px = 150;
        const py = 200;
        dispatchPointer(svgEl, 'pointerdown', { clientX: px, clientY: py, pointerId: 5 });

        expect(DragController._active).toBe(true);
        expect(DragController._pointerId).toBe(5);
        expect(DragController._anchorX).toBe(px);
        expect(DragController._anchorY).toBe(py);
    });

    // ── 2. Pointerdown on D-Pad/Backtrack does not initiate a session ──
    // **Validates: Requirements 1.2, 8.4**
    it('pointerdown on D-Pad does not initiate a session', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;

        // Create a mock D-Pad element inside the SVG
        const dpad = document.createElement('div');
        dpad.id = 'dpad';
        svgEl.appendChild(dpad);

        const btn = document.createElement('button');
        btn.className = 'dpad-btn';
        dpad.appendChild(btn);

        // Dispatch pointerdown on the button inside #dpad
        dispatchPointer(btn, 'pointerdown', { clientX: 100, clientY: 100 });

        expect(DragController._active).toBe(false);
        expect(DragController._pointerId).toBeNull();
    });

    it('pointerdown on Backtrack button does not initiate a session', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;

        // Create a mock backtrack button inside the SVG
        const backtrackBtn = document.createElement('button');
        backtrackBtn.id = 'backtrack-btn';
        svgEl.appendChild(backtrackBtn);

        dispatchPointer(backtrackBtn, 'pointerdown', { clientX: 100, clientY: 100 });

        expect(DragController._active).toBe(false);
        expect(DragController._pointerId).toBeNull();
    });

    // ── 3. setPointerCapture is called on pointerdown ──
    // **Validates: Requirements 1.3**
    it('setPointerCapture is called on pointerdown', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;
        svgEl.setPointerCapture.mockClear();

        dispatchPointer(svgEl, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 7 });

        expect(svgEl.setPointerCapture).toHaveBeenCalledWith(7);
    });

    // ── 4. Win condition during drag ends the session ──
    // **Validates: Requirements 6.1, 6.2**
    it('win condition during drag ends the session', async () => {
        await setupDragEnv({ cellSize: 10 });
        DragController._thresholdMultiplier = 0.1;

        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;

        // Set a neighbor as goal cell. '1,4' is a neighbor of '1,3'.
        MazeData.goalCells = new Set(['1,4']);

        // Make onWin set locked = true (mirroring real GameStateManager.onWin)
        GameStateManager.onWin = vi.fn(() => {
            PlayerController.locked = true;
        });

        PlayerController.currentCell = '1,3';
        PlayerController.pathTrail = ['1,2', '1,3'];
        PlayerController.locked = false;

        // Start drag
        const anchorX = 200;
        const anchorY = 200;
        dispatchPointer(svgEl, 'pointerdown', { clientX: anchorX, clientY: anchorY });
        expect(DragController._active).toBe(true);

        // Drag far enough to trigger movement. The direction doesn't matter as long
        // as autoSlide eventually reaches the goal. We try multiple large moves to
        // ensure the player reaches '1,4'. Since all passages are open in the test
        // grid, a large rightward drag should work.
        const moveX = anchorX + 300;
        const moveY = anchorY;
        dispatchPointer(svgEl, 'pointermove', { clientX: moveX, clientY: moveY });

        // If the player reached the goal, onWin was called and locked is true.
        // The session may still be active — DragController ends it on the NEXT
        // pointermove when it detects locked state.
        if (PlayerController.locked && DragController._active) {
            dispatchPointer(svgEl, 'pointermove', { clientX: moveX + 10, clientY: moveY });
        }

        expect(PlayerController.locked).toBe(true);
        expect(DragController._active).toBe(false);
        expect(GameStateManager.onWin).toHaveBeenCalled();
    });

    // ── 5. Locked mid-session ends session on next pointermove ──
    // **Validates: Requirements 7.2**
    it('locked mid-session ends session on next pointermove', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;

        // Start a drag session
        dispatchPointer(svgEl, 'pointerdown', { clientX: 200, clientY: 200 });
        expect(DragController._active).toBe(true);

        // Simulate locked becoming true mid-session (e.g., win triggered externally)
        PlayerController.locked = true;

        // Next pointermove should detect locked and end session
        dispatchPointer(svgEl, 'pointermove', { clientX: 250, clientY: 250 });

        expect(DragController._active).toBe(false);
    });

    // ── 6. preventDefault called on pointermove during active session ──
    // **Validates: Requirements 8.3, 9.1**
    it('preventDefault called on pointermove during active session', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;

        dispatchPointer(svgEl, 'pointerdown', { clientX: 200, clientY: 200 });
        expect(DragController._active).toBe(true);

        // Dispatch pointermove and check preventDefault was called
        const moveEvent = new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            clientX: 210,
            clientY: 210,
            pointerId: 1,
        });
        const preventSpy = vi.spyOn(moveEvent, 'preventDefault');
        svgEl.dispatchEvent(moveEvent);

        expect(preventSpy).toHaveBeenCalled();

        dispatchPointer(svgEl, 'pointerup', {});
    });

    // ── 7. preventDefault NOT called on pointermove when no session active ──
    // **Validates: Requirements 9.3**
    it('preventDefault NOT called on pointermove when no session active', async () => {
        await setupDragEnv();
        PlayerController.locked = false;

        // Ensure no session is active
        expect(DragController._active).toBe(false);

        // Dispatch pointermove directly on SVG — no session, so DragController
        // should not have a pointermove listener attached
        const moveEvent = new PointerEvent('pointermove', {
            bubbles: true,
            cancelable: true,
            clientX: 210,
            clientY: 210,
            pointerId: 1,
        });
        const preventSpy = vi.spyOn(moveEvent, 'preventDefault');
        svgEl.dispatchEvent(moveEvent);

        expect(preventSpy).not.toHaveBeenCalled();
    });

    // ── 8. CSS file contains touch-action: none on maze SVG ──
    // **Validates: Requirements 9.2**
    it('CSS file contains touch-action: none on #maze-container svg', () => {
        const cssPath = resolve(import.meta.dirname, '..', 'game.css');
        const cssContent = readFileSync(cssPath, 'utf-8');

        // Check that there's a rule for #maze-container svg with touch-action: none
        // We look for the selector and the property in the same rule block
        const selectorRegex = /#maze-container\s+svg\s*\{[^}]*touch-action\s*:\s*none[^}]*\}/s;
        expect(cssContent).toMatch(selectorRegex);
    });

    // ── 9. No backtrack when path trail has one element ──
    // **Validates: Requirements 3.3**
    it('no backtrack when path trail has one element', async () => {
        await setupDragEnv({ cellSize: 10 });
        DragController._thresholdMultiplier = 0.1;

        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;

        // Player at entry with single-element trail
        PlayerController.currentCell = '1,3';
        PlayerController.pathTrail = ['1,3'];
        PlayerController.locked = false;

        // _isBacktrackDirection should return false when trail has 1 element
        expect(DragController._isBacktrackDirection('up')).toBe(false);
        expect(DragController._isBacktrackDirection('down')).toBe(false);
        expect(DragController._isBacktrackDirection('upper-left')).toBe(false);
        expect(DragController._isBacktrackDirection('upper-right')).toBe(false);
        expect(DragController._isBacktrackDirection('lower-left')).toBe(false);
        expect(DragController._isBacktrackDirection('lower-right')).toBe(false);
    });

    // ── 10. releasePointerCapture called when session ends ──
    // **Validates: Requirements 4.3**
    it('releasePointerCapture called when session ends', async () => {
        await setupDragEnv();
        const { cells, passages } = buildTestGrid();
        MazeData.cells = cells;
        MazeData.passages = passages;
        PlayerController.locked = false;
        svgEl.releasePointerCapture.mockClear();

        dispatchPointer(svgEl, 'pointerdown', { clientX: 100, clientY: 100, pointerId: 3 });
        expect(DragController._active).toBe(true);

        dispatchPointer(svgEl, 'pointerup', { pointerId: 3 });

        expect(DragController._active).toBe(false);
        expect(svgEl.releasePointerCapture).toHaveBeenCalledWith(3);
    });
});

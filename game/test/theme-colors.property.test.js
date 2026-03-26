/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: theme-color-consolidation
 *
 * Property tests for readThemeColors() — CSS custom property round-trip
 * and missing property fallback behavior.
 */

let readThemeColors;
let GameRenderer;
let GameStateManager;

beforeEach(async () => {
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Set up minimal DOM required by game.js module
    window.ontouchstart = null;

    const controls = document.createElement('div');
    controls.id = 'controls';
    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    controls.appendChild(resetBtn);
    document.body.appendChild(controls);

    const svgContainer = document.createElement('div');
    svgContainer.id = 'maze-container';
    document.body.appendChild(svgContainer);

    // Puzzle panel needed by GameStateManager.init()
    const puzzlePanel = document.createElement('div');
    puzzlePanel.id = 'puzzle-panel';
    document.body.appendChild(puzzlePanel);

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    const mod = await import('../game.js');
    readThemeColors = mod.readThemeColors;
    GameRenderer = mod.GameRenderer;
    GameStateManager = mod.GameStateManager;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

// ── Hex color arbitrary ─────────────────────────────────────

/**
 * Arbitrary: generates a valid 6-digit hex color string like "#a3f0b2".
 * Each channel is a random byte rendered as two lowercase hex digits.
 */
const hexColorArb = fc.tuple(
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
    fc.integer({ min: 0, max: 255 }),
).map(([r, g, b]) =>
    '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')
);

// ── Property 1: CSS custom property round-trip ──────────────
/**
 * Feature: theme-color-consolidation
 * Property 1: CSS custom property round-trip
 *
 * For any valid hex color string set on `--color-player` via
 * `style.setProperty`, calling `readThemeColors()` returns an object
 * whose `player` field contains that same color string.
 *
 * **Validates: Requirements 1.3, 3.2**
 */
describe('Feature: theme-color-consolidation, Property 1: CSS custom property round-trip', () => {
    it('setting --color-player and reading it back via readThemeColors() returns the same value', () => {
        fc.assert(
            fc.property(hexColorArb, (color) => {
                document.documentElement.style.setProperty('--color-player', color);

                const theme = readThemeColors();

                expect(theme.player).toBe(color);
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 5: Missing CSS custom property fallback ────────
/**
 * Feature: theme-color-consolidation
 * Property 5: Missing CSS custom property fallback
 *
 * When CSS custom properties are removed from `:root`,
 * `readThemeColors()` returns the hardcoded fallback defaults:
 * player=#ffffff, danger=#ff9b29, maze=#6983ff, bg=#000000.
 *
 * **Validates: Requirements 5.2**
 */
describe('Feature: theme-color-consolidation, Property 5: Missing CSS custom property fallback', () => {
    it('returns fallback defaults when all CSS custom properties are removed', () => {
        // Remove all theme custom properties
        const root = document.documentElement;
        root.style.removeProperty('--color-player');
        root.style.removeProperty('--color-danger');
        root.style.removeProperty('--color-maze');
        root.style.removeProperty('--color-bg');

        const theme = readThemeColors();

        expect(theme.player).toBe('#ffffff');
        expect(theme.danger).toBe('#ff9b29');
        expect(theme.maze).toBe('#6983ff');
        expect(theme.bg).toBe('#000000');
    });
});


// ── Property 2: Player SVG elements use theme player color ──
/**
 * Feature: theme-color-consolidation
 * Property 2: Player SVG elements use theme player color
 *
 * For any color value assigned to `--color-player` in the Theme Registry,
 * after GameRenderer renders a player marker and trail, the marker's `fill`
 * attribute and the trail's `stroke` attribute should both equal THEME.player.
 *
 * **Validates: Requirements 2.3, 2.4**
 */
describe('Feature: theme-color-consolidation, Property 2: Player SVG elements use theme player color', () => {
    it('player marker fill and trail stroke match the --color-player CSS variable', () => {
        fc.assert(
            fc.property(hexColorArb, (color) => {
                // Set the random player color before THEME is read
                document.documentElement.style.setProperty('--color-player', color);

                // Re-initialize: sets THEME = readThemeColors() and renders maze + player
                document.getElementById('maze-container').innerHTML = '';
                GameRenderer.reset();
                GameStateManager.init();

                const theme = readThemeColors();

                // Player marker (polygon) fill must match
                expect(GameRenderer.playerMarker).not.toBeNull();
                expect(GameRenderer.playerMarker.getAttribute('fill')).toBe(theme.player);

                // Trail (polyline) stroke must match
                expect(GameRenderer.trailElement).not.toBeNull();
                expect(GameRenderer.trailElement.getAttribute('stroke')).toBe(theme.player);

                // Both must equal the CSS variable we set
                expect(theme.player).toBe(color);
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 3: Maze structural elements use their respective theme colors ──
/**
 * Feature: theme-color-consolidation
 * Property 3: Maze structural elements use their respective theme colors
 *
 * For any color values assigned to `--color-maze` and `--color-bg`, after
 * GameRenderer renders the maze, all wall <line> elements should have stroke
 * equal to THEME.maze, and the background <rect> should have fill equal to
 * THEME.bg.
 *
 * **Validates: Requirements 4.3, 4.4**
 */
describe('Feature: theme-color-consolidation, Property 3: Maze structural elements use their respective theme colors', () => {
    it('wall line strokes equal THEME.maze and background rect fill equals THEME.bg', () => {
        fc.assert(
            fc.property(hexColorArb, hexColorArb, (mazeColor, bgColor) => {
                // Set random maze and background colors
                document.documentElement.style.setProperty('--color-maze', mazeColor);
                document.documentElement.style.setProperty('--color-bg', bgColor);

                // Re-initialize: sets THEME and renders maze
                document.getElementById('maze-container').innerHTML = '';
                GameRenderer.reset();
                GameStateManager.init();

                const theme = readThemeColors();
                expect(theme.maze).toBe(mazeColor);
                expect(theme.bg).toBe(bgColor);

                // Background rect fill must match THEME.bg
                const bgRect = GameRenderer.svg.querySelector('rect');
                expect(bgRect).not.toBeNull();
                expect(bgRect.getAttribute('fill')).toBe(theme.bg);

                // All wall <line> elements in the transform group must have stroke = THEME.maze
                const walls = GameRenderer.transformGroup.querySelectorAll('line');
                expect(walls.length).toBeGreaterThan(0);
                for (const wall of walls) {
                    expect(wall.getAttribute('stroke')).toBe(theme.maze);
                }
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 4: Fanfare reset restores theme colors ─────────
/**
 * Feature: theme-color-consolidation
 * Property 4: Fanfare reset restores theme colors
 *
 * For any theme color configuration, after resetFanfare() is called, all
 * wall <line> elements should have their stroke style set to THEME.maze,
 * the logo element (if present) should have fill set to THEME.maze, and
 * the player marker should have opacity restored to '1'.
 *
 * **Validates: Requirements 4.5**
 */
describe('Feature: theme-color-consolidation, Property 4: Fanfare reset restores theme colors', () => {
    it('resetFanfare() restores wall strokes to THEME.maze, logo fill to THEME.maze, and player marker opacity to 1', () => {
        fc.assert(
            fc.property(hexColorArb, hexColorArb, (mazeColor, playerColor) => {
                // Set random theme colors
                document.documentElement.style.setProperty('--color-maze', mazeColor);
                document.documentElement.style.setProperty('--color-player', playerColor);

                // Initialize with these colors
                document.getElementById('maze-container').innerHTML = '';
                GameRenderer.reset();
                GameStateManager.init();

                const theme = readThemeColors();

                // Simulate fanfare modifications: change wall colors, logo fill, player opacity
                const walls = GameRenderer.transformGroup.querySelectorAll('line');
                for (const wall of walls) {
                    wall.style.stroke = '#ff00ff'; // arbitrary modified color
                }
                if (GameRenderer.logoElement) {
                    GameRenderer.logoElement.setAttribute('fill', '#00ff00');
                }
                if (GameRenderer.playerMarker) {
                    GameRenderer.playerMarker.setAttribute('opacity', '0');
                }

                // Call resetFanfare to restore colors
                GameRenderer.resetFanfare();

                // Wall strokes should be restored to THEME.maze
                for (const wall of walls) {
                    expect(wall.style.stroke).toBe(theme.maze);
                }

                // Logo fill should be restored to THEME.maze (if logo exists)
                if (GameRenderer.logoElement) {
                    expect(GameRenderer.logoElement.getAttribute('fill')).toBe(theme.maze);
                }

                // Player marker opacity should be restored to '1'
                if (GameRenderer.playerMarker) {
                    expect(GameRenderer.playerMarker.getAttribute('opacity')).toBe('1');
                }
            }),
            { numRuns: 100 }
        );
    });
});

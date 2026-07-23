// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Unit tests for the console-controlled solution overlay:
 * window.solution() toggling, overlay rendering, and reset-on-regenerate.
 * The overlay is deliberately NOT exposed in the game UI -- it lives in
 * game.debug.js alongside cheat() and win().
 */

let GameRenderer;
let GameStateManager;
let MazeData;

beforeEach(async () => {
    const svgContainer = document.createElement('div');
    svgContainer.id = 'maze-container';
    document.body.appendChild(svgContainer);

    const puzzlePanel = document.createElement('div');
    puzzlePanel.id = 'puzzle-panel';
    document.body.appendChild(puzzlePanel);

    vi.resetModules();
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    const mod = await import('../game.js');
    GameRenderer = mod.GameRenderer;
    GameStateManager = mod.GameStateManager;
    MazeData = mod.MazeData;

    GameStateManager.init();

    // Load the debug module to install the console API
    await import('../game.debug.js');
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    localStorage.clear();
    delete window.solution;
    delete window.cheat;
    delete window.win;
});

function overlay() {
    return document.querySelector('.solution-overlay');
}

describe('console cheat: solution overlay', () => {
    it('is not exposed anywhere in the game UI', () => {
        expect(document.getElementById('solution-btn')).toBeNull();
        expect(document.body.textContent).not.toContain('Show Solution');
        expect(overlay()).toBeNull();
    });

    it('window.solution() shows the overlay and returns visibility', () => {
        expect(typeof window.solution).toBe('function');
        const visible = window.solution();

        expect(visible).toBe(true);
        const el = overlay();
        expect(el).not.toBeNull();
        expect(el.tagName.toLowerCase()).toBe('polyline');
        expect(GameRenderer.solutionVisible).toBe(true);
    });

    it('overlay has one point per solution path cell', () => {
        window.solution();
        const points = overlay().getAttribute('points').trim().split(/\s+/);
        expect(points.length).toBe(MazeData.solutionPath.length);
        expect(MazeData.solutionPath.length).toBeGreaterThan(1);
    });

    it('overlay starts at the entry cell center', () => {
        window.solution();
        const firstPoint = overlay().getAttribute('points').trim().split(/\s+/)[0];
        const [r, c] = MazeData.entryCell.split(',').map(Number);
        const center = GameRenderer._cellCenter(r, c);
        expect(firstPoint).toBe(`${center.x},${center.y}`);
    });

    it('overlay renders under the player trail so the player stays on top', () => {
        window.solution();
        const el = overlay();
        if (GameRenderer.trailElement) {
            const siblings = [...el.parentNode.children];
            expect(siblings.indexOf(el)).toBeLessThan(siblings.indexOf(GameRenderer.trailElement));
        } else {
            expect(el.parentNode).toBe(GameRenderer.transformGroup);
        }
    });

    it('calling window.solution() again hides the overlay', () => {
        window.solution();
        const visible = window.solution();

        expect(visible).toBe(false);
        expect(overlay()).toBeNull();
        expect(GameRenderer.solutionVisible).toBe(false);
    });

    it('repeated toggling does not accumulate overlay elements', () => {
        window.solution();
        window.solution();
        window.solution();
        expect(document.querySelectorAll('.solution-overlay').length).toBe(1);
    });

    it('generating a new maze clears the overlay', () => {
        window.solution();
        expect(overlay()).not.toBeNull();

        GameStateManager._generateAndRender();

        expect(overlay()).toBeNull();
        expect(GameRenderer.solutionVisible).toBe(false);
    });

    it('showSolution is a no-op when already visible', () => {
        GameRenderer.showSolution();
        const first = overlay();
        GameRenderer.showSolution();
        expect(document.querySelectorAll('.solution-overlay').length).toBe(1);
        expect(overlay()).toBe(first);
    });
});

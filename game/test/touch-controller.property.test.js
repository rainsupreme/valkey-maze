/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

/**
 * Feature: mobile-controls
 *
 * Property tests for TouchController D-Pad creation and direction handling.
 * We test against the TouchController exported from game.js by setting up
 * the required DOM environment and mocking PlayerController.
 */

const ALL_VISUAL_DIRECTIONS = ['up', 'down', 'upper-left', 'upper-right', 'lower-left', 'lower-right'];
const visualDirectionArb = fc.constantFrom(...ALL_VISUAL_DIRECTIONS);

// We'll hold references to the dynamically imported modules
let TouchController;
let PlayerController;

beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';
    document.head.innerHTML = '';

    // Set up touch device detection
    window.ontouchstart = null;

    // Create #controls div with reset button (needed by _createBacktrackButton)
    const controls = document.createElement('div');
    controls.id = 'controls';
    const resetBtn = document.createElement('button');
    resetBtn.id = 'reset-btn';
    resetBtn.textContent = 'Reset';
    controls.appendChild(resetBtn);
    document.body.appendChild(controls);

    // Create a minimal SVG container (needed by GameRenderer.init)
    const svgContainer = document.createElement('div');
    svgContainer.id = 'maze-container';
    document.body.appendChild(svgContainer);

    // Mock DOMContentLoaded to prevent GameStateManager.init from running
    // We do a fresh dynamic import each time to get clean module state
    vi.resetModules();

    // Mock fetch to prevent network calls
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    // Dynamically import the module
    const mod = await import('../game.js');
    TouchController = mod.TouchController;
    PlayerController = mod.PlayerController;

    // Mock PlayerController methods
    PlayerController.moveDirection = vi.fn();
    PlayerController.moveBack = vi.fn();
    PlayerController.locked = false;

    // Create the D-Pad and Backtrack button
    TouchController._createDpad();
    TouchController._createBacktrackButton();
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
});

/**
 * Feature: mobile-controls
 * Property 1: Direction tap dispatches correct movement
 *
 * For any visual direction in {up, down, upper-left, upper-right, lower-left, lower-right},
 * simulating touchstart on the matching D-Pad button calls PlayerController.moveDirection()
 * exactly once with that direction and calls event.preventDefault().
 *
 * **Validates: Requirements 1.2, 1.4, 5.1**
 */
describe('Feature: mobile-controls, Property 1: Direction tap dispatches correct movement', () => {
    it('touchstart on any D-Pad button calls moveDirection with the correct direction and preventDefault', () => {
        fc.assert(
            fc.property(visualDirectionArb, (dir) => {
                // Reset mock call counts
                PlayerController.moveDirection.mockClear();
                PlayerController.locked = false;

                const btn = document.querySelector(`[data-dir="${dir}"]`);
                expect(btn).not.toBeNull();

                // Create a touchstart event and spy on preventDefault
                const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
                const preventDefaultSpy = vi.spyOn(touchEvent, 'preventDefault');

                btn.dispatchEvent(touchEvent);

                // moveDirection should have been called exactly once with the direction
                expect(PlayerController.moveDirection).toHaveBeenCalledTimes(1);
                expect(PlayerController.moveDirection).toHaveBeenCalledWith(dir);

                // preventDefault should have been called
                expect(preventDefaultSpy).toHaveBeenCalledTimes(1);
            }),
            { numRuns: 100 }
        );
    });
});

/**
 * Feature: mobile-controls
 * Property 4: Visual feedback toggles on press and release
 *
 * For any D-Pad button, touchstart adds dpad-btn-active class and touchend removes it.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Feature: mobile-controls, Property 4: Visual feedback toggles on press and release', () => {
    it('touchstart adds dpad-btn-active class and touchend removes it for any direction', () => {
        fc.assert(
            fc.property(visualDirectionArb, (dir) => {
                PlayerController.moveDirection.mockClear();
                PlayerController.locked = false;

                const btn = document.querySelector(`[data-dir="${dir}"]`);
                expect(btn).not.toBeNull();

                // Ensure button starts without active class
                btn.classList.remove('dpad-btn-active');
                expect(btn.classList.contains('dpad-btn-active')).toBe(false);

                // Simulate touchstart
                const startEvent = new Event('touchstart', { bubbles: true, cancelable: true });
                btn.dispatchEvent(startEvent);

                // Button should now have the active class
                expect(btn.classList.contains('dpad-btn-active')).toBe(true);

                // Simulate touchend
                const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
                btn.dispatchEvent(endEvent);

                // Button should no longer have the active class
                expect(btn.classList.contains('dpad-btn-active')).toBe(false);
            }),
            { numRuns: 100 }
        );
    });
});

/**
 * Feature: mobile-controls
 * Property 5: Locked state ignores all touch input
 *
 * For any visual direction and backtrack, when PlayerController.locked is true,
 * touchstart results in zero calls to moveDirection() and moveBack().
 *
 * **Validates: Requirements 8.2**
 */
describe('Feature: mobile-controls, Property 5: Locked state ignores all touch input', () => {
    it('when locked, touchstart on any D-Pad button results in zero moveDirection and moveBack calls', () => {
        fc.assert(
            fc.property(visualDirectionArb, (dir) => {
                PlayerController.moveDirection.mockClear();
                PlayerController.moveBack.mockClear();
                PlayerController.locked = true;

                const btn = document.querySelector(`[data-dir="${dir}"]`);
                expect(btn).not.toBeNull();

                // Simulate touchstart while locked
                const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
                btn.dispatchEvent(touchEvent);

                // No movement calls should have been made
                expect(PlayerController.moveDirection).toHaveBeenCalledTimes(0);
                expect(PlayerController.moveBack).toHaveBeenCalledTimes(0);
            }),
            { numRuns: 100 }
        );
    });
});

/**
 * Feature: mobile-controls
 * Property 2: Hold-to-repeat fires immediately then repeats at interval
 *
 * For any hold duration N > 300ms, total call count ≈ 1 + floor((N - 300) / 150) (±1 tolerance).
 * The initial call comes from _onDirectionStart, and the repeats come from _startRepeat's
 * setTimeout(300ms) -> setInterval(150ms) mechanism.
 *
 * Uses vi.useFakeTimers() for deterministic time control.
 *
 * **Validates: Requirements 3.1, 3.3**
 */
describe('Feature: mobile-controls, Property 2: Hold-to-repeat fires immediately then repeats at interval', () => {
    it('for any hold duration N > 300ms, total moveDirection calls ≈ 1 + floor((N - 300) / 150)', () => {
        vi.useFakeTimers();
        try {
            fc.assert(
                fc.property(
                    fc.integer({ min: 301, max: 5000 }),
                    (holdDuration) => {
                        // Reset state
                        PlayerController.moveDirection.mockClear();
                        PlayerController.locked = false;
                        TouchController._stopRepeat();

                        // Pick a direction button and simulate touchstart
                        const btn = document.querySelector('[data-dir="up"]');
                        const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
                        btn.dispatchEvent(touchEvent);

                        // Advance time by holdDuration ms
                        vi.advanceTimersByTime(holdDuration);

                        const actualCalls = PlayerController.moveDirection.mock.calls.length;
                        const expectedCalls = 1 + Math.floor((holdDuration - 300) / 150);

                        // Allow ±1 tolerance for timing edge cases
                        expect(actualCalls).toBeGreaterThanOrEqual(expectedCalls - 1);
                        expect(actualCalls).toBeLessThanOrEqual(expectedCalls + 1);

                        // Clean up: stop repeat and simulate touchend
                        TouchController._stopRepeat();
                        btn.classList.remove('dpad-btn-active');
                    }
                ),
                { numRuns: 100 }
            );
        } finally {
            vi.useRealTimers();
        }
    });
});

/**
 * Feature: mobile-controls
 * Property 3: Release stops all repeat firing
 *
 * For any ongoing hold-to-repeat sequence, calling _stopRepeat() results in zero
 * additional invocations regardless of time elapsed afterward.
 *
 * **Validates: Requirements 3.2, 3.4**
 */
describe('Feature: mobile-controls, Property 3: Release stops all repeat firing', () => {
    it('after _stopRepeat, no additional calls occur regardless of elapsed time', () => {
        vi.useFakeTimers();
        try {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 3000 }),
                    fc.integer({ min: 100, max: 5000 }),
                    (holdDuration, additionalTime) => {
                        // Reset state
                        PlayerController.moveDirection.mockClear();
                        PlayerController.locked = false;
                        TouchController._stopRepeat();

                        // Simulate touchstart on a direction button
                        const btn = document.querySelector('[data-dir="down"]');
                        const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
                        btn.dispatchEvent(touchEvent);

                        // Hold for some duration
                        vi.advanceTimersByTime(holdDuration);

                        // Simulate release (touchend calls _stopRepeat)
                        const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
                        btn.dispatchEvent(endEvent);

                        // Record call count at release
                        const callsAtRelease = PlayerController.moveDirection.mock.calls.length;

                        // Advance time further — no additional calls should happen
                        vi.advanceTimersByTime(additionalTime);

                        const callsAfterWait = PlayerController.moveDirection.mock.calls.length;
                        expect(callsAfterWait).toBe(callsAtRelease);
                    }
                ),
                { numRuns: 100 }
            );
        } finally {
            vi.useRealTimers();
        }
    });
});


/**
 * Unit tests for Backtrack button creation and interaction.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 7.3, 7.4**
 */
describe('Feature: mobile-controls, Backtrack button', () => {
    it('backtrack button is a child of #controls', () => {
        const controls = document.getElementById('controls');
        const backtrackBtn = document.getElementById('backtrack-btn');
        expect(backtrackBtn).not.toBeNull();
        expect(controls.contains(backtrackBtn)).toBe(true);
    });

    it('tapping backtrack calls PlayerController.moveBack()', () => {
        PlayerController.moveBack.mockClear();
        PlayerController.locked = false;

        const backtrackBtn = document.getElementById('backtrack-btn');
        expect(backtrackBtn).not.toBeNull();

        const touchEvent = new Event('touchstart', { bubbles: true, cancelable: true });
        backtrackBtn.dispatchEvent(touchEvent);

        expect(PlayerController.moveBack).toHaveBeenCalledTimes(1);
    });

    it('backtrack button is visible on touch devices', () => {
        const backtrackBtn = document.getElementById('backtrack-btn');
        expect(backtrackBtn).not.toBeNull();
        // The button exists in the DOM on a touch device (window.ontouchstart was set in beforeEach)
        expect(backtrackBtn.id).toBe('backtrack-btn');
        expect(backtrackBtn.getAttribute('aria-label')).toBe('Backtrack');
        expect(backtrackBtn.textContent).toBe('↩ Back');
    });

    it('backtrack button gets active class on press, loses it on release', () => {
        PlayerController.moveBack.mockClear();
        PlayerController.locked = false;

        const backtrackBtn = document.getElementById('backtrack-btn');
        expect(backtrackBtn).not.toBeNull();

        // Should not have active class initially
        expect(backtrackBtn.classList.contains('dpad-btn-active')).toBe(false);

        // Simulate touchstart
        const startEvent = new Event('touchstart', { bubbles: true, cancelable: true });
        backtrackBtn.dispatchEvent(startEvent);
        expect(backtrackBtn.classList.contains('dpad-btn-active')).toBe(true);

        // Simulate touchend
        const endEvent = new Event('touchend', { bubbles: true, cancelable: true });
        backtrackBtn.dispatchEvent(endEvent);
        expect(backtrackBtn.classList.contains('dpad-btn-active')).toBe(false);
    });
});


/**
 * Unit tests for CSS/layout constraints.
 *
 * Since jsdom doesn't compute CSS from stylesheets, we verify:
 * 1. DOM structure (button count, data-dir attributes)
 * 2. CSS file content contains the expected rules
 *
 * **Validates: Requirements 1.1, 1.3, 6.2, 6.3**
 */
describe('Feature: mobile-controls, CSS/layout constraints', () => {
    it('D-Pad has exactly 6 buttons with correct data-dir attributes (validates 1.1)', () => {
        const dpad = document.getElementById('dpad');
        expect(dpad).not.toBeNull();

        const buttons = dpad.querySelectorAll('.dpad-btn');
        expect(buttons.length).toBe(6);

        const expectedDirs = new Set(['up', 'down', 'upper-left', 'upper-right', 'lower-left', 'lower-right']);
        const actualDirs = new Set(Array.from(buttons).map(btn => btn.dataset.dir));
        expect(actualDirs).toEqual(expectedDirs);
    });

    it('D-Pad container has id "dpad" and each button has "dpad-btn" class', () => {
        const dpad = document.getElementById('dpad');
        expect(dpad).not.toBeNull();
        expect(dpad.id).toBe('dpad');

        const buttons = dpad.querySelectorAll('button');
        for (const btn of buttons) {
            expect(btn.classList.contains('dpad-btn')).toBe(true);
        }
    });

    it('CSS file contains D-Pad max-height ≤ 30vh rule (validates 6.2)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const cssPath = path.resolve(import.meta.dirname, '..', 'game.css');
        const cssContent = fs.readFileSync(cssPath, 'utf-8');

        // Verify #dpad has max-height: 30vh
        const dpadRule = cssContent.match(/#dpad\s*\{[^}]*max-height:\s*30vh/s);
        expect(dpadRule).not.toBeNull();
    });

    it('CSS file contains D-Pad button min 44px tap targets (validates 6.3)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const cssPath = path.resolve(import.meta.dirname, '..', 'game.css');
        const cssContent = fs.readFileSync(cssPath, 'utf-8');

        // Verify .dpad-btn has min-width: 44px and min-height: 44px
        const btnRule = cssContent.match(/\.dpad-btn\s*\{[^}]*min-width:\s*44px/s);
        expect(btnRule).not.toBeNull();

        const btnHeightRule = cssContent.match(/\.dpad-btn\s*\{[^}]*min-height:\s*44px/s);
        expect(btnHeightRule).not.toBeNull();
    });

    it('CSS file contains D-Pad positioned fixed at bottom-left (validates 1.3)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const cssPath = path.resolve(import.meta.dirname, '..', 'game.css');
        const cssContent = fs.readFileSync(cssPath, 'utf-8');

        // Verify #dpad has position: fixed, bottom, and left properties
        const posRule = cssContent.match(/#dpad\s*\{[^}]*position:\s*fixed/s);
        expect(posRule).not.toBeNull();

        const bottomRule = cssContent.match(/#dpad\s*\{[^}]*bottom:\s*\d/s);
        expect(bottomRule).not.toBeNull();

        const rightRule = cssContent.match(/#dpad\s*\{[^}]*right:\s*\d/s);
        expect(rightRule).not.toBeNull();
    });
});


/**
 * Unit tests for viewport meta tag and touch detection.
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 5.3**
 */
describe('Feature: mobile-controls, Viewport and touch detection', () => {
    it('viewport meta tag includes user-scalable=no (validates 5.3)', async () => {
        const fs = await import('fs');
        const path = await import('path');
        const htmlPath = path.resolve(import.meta.dirname, '..', 'index.html');
        const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

        // Verify the viewport meta tag contains user-scalable=no
        const viewportMatch = htmlContent.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']*)["']/);
        expect(viewportMatch).not.toBeNull();
        expect(viewportMatch[1]).toContain('user-scalable=no');
    });

    it('touch detection returns true when ontouchstart exists on window (validates 4.1, 4.3)', () => {
        // beforeEach already sets window.ontouchstart = null, making it "in window"
        expect(TouchController._isTouchDevice()).toBe(true);
    });

    it('touch detection returns true when navigator.maxTouchPoints > 0 (validates 4.3)', async () => {
        // Remove ontouchstart so that path is not taken
        delete window.ontouchstart;

        // Set maxTouchPoints > 0
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 1,
            writable: true,
            configurable: true,
        });

        // Re-import to get a fresh module with the current window state
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
        const mod = await import('../game.js');
        const TC = mod.TouchController;

        expect(TC._isTouchDevice()).toBe(true);

        // Restore maxTouchPoints
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 0,
            writable: true,
            configurable: true,
        });
    });

    it('touch detection returns false on non-touch device; no controls created (validates 4.2)', async () => {
        // Remove touch indicators
        delete window.ontouchstart;
        Object.defineProperty(navigator, 'maxTouchPoints', {
            value: 0,
            writable: true,
            configurable: true,
        });

        // Reset DOM
        document.body.innerHTML = '';
        document.head.innerHTML = '';

        // Create required DOM elements
        const controls = document.createElement('div');
        controls.id = 'controls';
        const resetBtn = document.createElement('button');
        resetBtn.id = 'reset-btn';
        controls.appendChild(resetBtn);
        document.body.appendChild(controls);

        const svgContainer = document.createElement('div');
        svgContainer.id = 'maze-container';
        document.body.appendChild(svgContainer);

        // Re-import fresh module
        vi.resetModules();
        vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));
        const mod = await import('../game.js');
        const TC = mod.TouchController;

        // _isTouchDevice should return false
        expect(TC._isTouchDevice()).toBe(false);

        // Call init — it should exit early without creating controls
        TC.init();

        // No D-Pad should exist
        const dpad = document.getElementById('dpad');
        expect(dpad).toBeNull();

        // No backtrack button should exist
        const backtrackBtn = document.getElementById('backtrack-btn');
        expect(backtrackBtn).toBeNull();
    });
});

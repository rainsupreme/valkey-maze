/** @vitest-environment jsdom */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Feature: theme-color-consolidation
 *
 * Unit tests for readThemeColors() and static code checks.
 * **Validates: Requirements 1.2, 2.1, 2.2, 3.1, 3.3, 4.2, 5.1, 5.3**
 */

// ── Dynamic import of game.js (needs DOM scaffolding first) ─

let readThemeColors;

beforeAll(async () => {
    // Minimal DOM required by game.js module
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

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false })));

    const mod = await import('../game.js');
    readThemeColors = mod.readThemeColors;
});

// ── Helpers for static source checks ────────────────────────

const gameJsSource = readFileSync(resolve(import.meta.dirname, '..', 'game.js'), 'utf-8');
const gameCssSource = readFileSync(resolve(import.meta.dirname, '..', 'game.css'), 'utf-8');

// ── 1. readThemeColors() returns a frozen object with expected keys ─

describe('readThemeColors() shape and immutability (Req 3.3, 5.1, 5.3)', () => {
    it('returns an object with keys player, danger, maze, bg', () => {
        const theme = readThemeColors();
        expect(theme).toHaveProperty('player');
        expect(theme).toHaveProperty('danger');
        expect(theme).toHaveProperty('maze');
        expect(theme).toHaveProperty('bg');
    });

    it('returns a frozen (immutable) object', () => {
        const theme = readThemeColors();
        expect(Object.isFrozen(theme)).toBe(true);
    });
});

// ── 2. game.js does NOT contain hardcoded THEME with hex literals ───

describe('No hardcoded THEME constant in game.js (Req 3.1)', () => {
    it('source does not contain "const THEME = {" with hex color literals', () => {
        // Match patterns like: const THEME = { ... #ffffff ... }
        const hardcodedPattern = /const\s+THEME\s*=\s*\{[^}]*#[0-9a-fA-F]{3,8}[^}]*\}/;
        expect(hardcodedPattern.test(gameJsSource)).toBe(false);
    });
});

// ── 3. game.css :root defines all 7 required custom properties ──────

describe('CSS :root defines all 7 required custom properties (Req 1.2)', () => {
    const requiredProps = [
        '--color-player',
        '--color-danger',
        '--color-maze',
        '--color-bg',
        '--color-text',
        '--color-text-muted',
        '--color-panel-bg',
    ];

    for (const prop of requiredProps) {
        it(`defines ${prop}`, () => {
            const pattern = new RegExp(`${prop.replace(/[-/]/g, '\\$&')}\\s*:`);
            expect(pattern.test(gameCssSource)).toBe(true);
        });
    }
});

// ── 4. Default color values resolve correctly ───────────────

describe('Default color values (Req 2.1, 2.2)', () => {
    it('--color-player resolves to #ffffff', () => {
        const theme = readThemeColors();
        expect(theme.player).toBe('#ffffff');
    });

    it('--color-danger resolves to #ff9b29', () => {
        const theme = readThemeColors();
        expect(theme.danger).toBe('#ff9b29');
    });
});

// ── 5. #reset-btn CSS uses var(--color-danger) ──────────────

describe('#reset-btn uses var(--color-danger) (Req 4.2)', () => {
    it('reset-btn background rule references var(--color-danger)', () => {
        // Match: #reset-btn { ... background: var(--color-danger) ... }
        const resetBtnBlock = gameCssSource.match(/#reset-btn\s*\{[^}]*\}/);
        expect(resetBtnBlock).not.toBeNull();
        expect(resetBtnBlock[0]).toContain('var(--color-danger)');
    });
});

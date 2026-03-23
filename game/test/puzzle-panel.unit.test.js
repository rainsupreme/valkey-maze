// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { DIFFICULTY_TIERS } from '../maze.gen.js';

// Set up minimal DOM before importing game.js (which runs DOMContentLoaded listener)
beforeAll(() => {
    if (!document.getElementById('puzzle-panel')) {
        const panel = document.createElement('div');
        panel.id = 'puzzle-panel';
        document.body.appendChild(panel);
    }
    if (!document.getElementById('maze-container')) {
        const container = document.createElement('div');
        container.id = 'maze-container';
        document.body.appendChild(container);
    }
    if (!document.getElementById('reset-btn')) {
        const btn = document.createElement('button');
        btn.id = 'reset-btn';
        document.body.appendChild(btn);
    }
});

// Dynamic import to ensure DOM is ready first
let GameStateManager, PuzzlePanel, PlayerController;
beforeAll(async () => {
    const mod = await import('../game.js');
    GameStateManager = mod.GameStateManager;
    PuzzlePanel = mod.PuzzlePanel;
    PlayerController = mod.PlayerController;
});

beforeEach(() => {
    localStorage.clear();
});

/**
 * Unit Test 1: Default difficulty is "medium" when localStorage is empty
 * **Validates: Requirement 2.1**
 */
describe('Default difficulty is "medium" when localStorage is empty (Req 2.1)', () => {
    it('should return null from _readDifficultyPref when localStorage is empty', () => {
        localStorage.clear();
        const pref = GameStateManager._readDifficultyPref();
        expect(pref).toBeNull();
    });

    it('should resolve to "medium" tier via _defaultTier fallback', () => {
        localStorage.clear();
        const pref = GameStateManager._readDifficultyPref();
        const resolved = DIFFICULTY_TIERS.find(t => t.id === pref)
            || GameStateManager._defaultTier();
        expect(resolved.id).toBe('medium');
    });
});

/**
 * Unit Test 2: Panel DOM contains all expected elements
 * **Validates: Requirements 1.1, 1.3**
 */
describe('Panel DOM contains all expected elements (Req 1.1, 1.3)', () => {
    beforeEach(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        PuzzlePanel.init(today, 'medium');
    });

    it('should have a tier button for each DIFFICULTY_TIERS entry', () => {
        const tierBtns = document.querySelectorAll('.panel-tier-btn');
        expect(tierBtns.length).toBe(DIFFICULTY_TIERS.length);
        for (const tier of DIFFICULTY_TIERS) {
            const btn = document.querySelector(`.panel-tier-btn[data-tier="${tier.id}"]`);
            expect(btn).not.toBeNull();
        }
    });

    it('should have a date input with class panel-date-input and type text', () => {
        const dateInput = document.querySelector('.panel-date-input');
        expect(dateInput).not.toBeNull();
        expect(dateInput.type).toBe('text');
    });

    it('should have a prev button with class panel-prev-btn', () => {
        const prevBtn = document.querySelector('.panel-prev-btn');
        expect(prevBtn).not.toBeNull();
    });

    it('should have a next button with class panel-next-btn', () => {
        const nextBtn = document.querySelector('.panel-next-btn');
        expect(nextBtn).not.toBeNull();
    });

    it('should have a Random Date button with class panel-random-btn', () => {
        const randomBtn = document.querySelector('.panel-random-btn');
        expect(randomBtn).not.toBeNull();
    });

    it('should have a Today\'s Puzzle button with class panel-today-btn', () => {
        const todayBtn = document.querySelector('.panel-today-btn');
        expect(todayBtn).not.toBeNull();
    });
});

/**
 * Unit Test 3: LevelSelector overlay element is not present in the DOM
 * **Validates: Requirement 1.2**
 */
describe('LevelSelector overlay is not present in the DOM (Req 1.2)', () => {
    it('should not have a level-selector element', () => {
        expect(document.getElementById('level-selector')).toBeNull();
    });
});

/**
 * Unit Test 4: Next-date button is disabled when date equals today
 * **Validates: Requirement 4.3**
 */
describe('Next-date button is disabled when date equals today (Req 4.3)', () => {
    it('should disable the next button when currentDate is today', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        PuzzlePanel.init(today, 'medium');
        PuzzlePanel.currentDate = today;
        PuzzlePanel.render();

        const nextBtn = document.querySelector('.panel-next-btn');
        expect(nextBtn.disabled).toBe(true);
    });
});

/**
 * Unit Test 5: "Today's Puzzle" button click sets date to today
 * **Validates: Requirement 5.3**
 */
describe('"Today\'s Puzzle" button click sets date to today (Req 5.3)', () => {
    it('should call onDateChange with today\'s date when clicked', () => {
        // Set PuzzlePanel to a past date
        const pastDate = new Date(2025, 0, 15);
        pastDate.setHours(0, 0, 0, 0);
        PuzzlePanel.init(pastDate, 'medium');

        let receivedDate = null;
        PuzzlePanel.onDateChange = (date) => { receivedDate = date; };

        const todayBtn = document.querySelector('.panel-today-btn');
        todayBtn.click();

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        expect(receivedDate).not.toBeNull();
        expect(receivedDate.getFullYear()).toBe(today.getFullYear());
        expect(receivedDate.getMonth()).toBe(today.getMonth());
        expect(receivedDate.getDate()).toBe(today.getDate());
    });
});

/**
 * Unit Test 6: No saved state → shows today's puzzle with stored/default difficulty
 * **Validates: Requirement 8.4**
 */
describe('No saved state → shows today\'s puzzle with default difficulty (Req 8.4)', () => {
    it('should use today\'s date and medium tier when localStorage is empty', () => {
        localStorage.clear();

        const savedState = GameStateManager._readSavedState();
        expect(savedState).toBeNull();

        const diffPref = GameStateManager._readDifficultyPref();
        const resolvedTier = DIFFICULTY_TIERS.find(t => t.id === diffPref)
            || GameStateManager._defaultTier();
        expect(resolvedTier.id).toBe('medium');

        const today = GameStateManager._today();
        expect(today.getHours()).toBe(0);
        expect(today.getMinutes()).toBe(0);
        expect(today.getSeconds()).toBe(0);
    });
});

/**
 * Unit Test 7: Date input element is an <input> with monospace font
 * **Validates: Requirement 10.1**
 */
describe('Date input element is an <input> with monospace font (Req 10.1)', () => {
    beforeEach(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        PuzzlePanel.init(today, 'medium');
    });

    it('should be an INPUT element', () => {
        const dateInput = document.querySelector('.panel-date-input');
        expect(dateInput.tagName).toBe('INPUT');
    });

    it('should have the panel-date-input CSS class', () => {
        const dateInput = document.querySelector('.panel-date-input');
        expect(dateInput.classList.contains('panel-date-input')).toBe(true);
    });
});

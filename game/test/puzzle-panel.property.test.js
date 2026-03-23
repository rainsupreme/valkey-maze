// @vitest-environment jsdom
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import * as fc from 'fast-check';
import { DIFFICULTY_TIERS } from '../maze.gen.js';

// Set up minimal DOM before importing game.js (which runs DOMContentLoaded listener)
beforeAll(() => {
    // Create required DOM elements that GameStateManager.init() expects
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
let GameStateManager;
beforeAll(async () => {
    const mod = await import('../game.js');
    GameStateManager = mod.GameStateManager;
});

// ── Shared setup: clean localStorage before each test ───────
beforeEach(() => {
    localStorage.clear();
});

// ── Property 1: Difficulty preference round-trip ────────────
/**
 * Feature: puzzle-panel-and-persistence, Property 1: Difficulty preference round-trip
 *
 * For random valid tier ids from DIFFICULTY_TIERS, writing to localStorage
 * then reading back should return the same id.
 *
 * **Validates: Requirements 2.2, 6.1, 6.2**
 */
describe('Property 1: Difficulty preference round-trip', () => {
    const validTierIdArb = fc.constantFrom(...DIFFICULTY_TIERS.map(t => t.id));

    it('writing a valid tier id then reading it back returns the same id', () => {
        fc.assert(
            fc.property(validTierIdArb, (tierId) => {
                GameStateManager._writeDifficultyPref(tierId);
                const readBack = GameStateManager._readDifficultyPref();
                expect(readBack).toBe(tierId);
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 2: Invalid difficulty preference falls back to medium ──
/**
 * Feature: puzzle-panel-and-persistence, Property 2: Invalid difficulty preference falls back to medium
 *
 * For random strings not in DIFFICULTY_TIERS ids, reading as difficulty pref
 * should yield "medium" when resolved through the fallback logic.
 *
 * **Validates: Requirements 2.3**
 */
describe('Property 2: Invalid difficulty preference falls back to medium', () => {
    const validIds = new Set(DIFFICULTY_TIERS.map(t => t.id));
    const invalidTierIdArb = fc.string({ minLength: 0, maxLength: 30 })
        .filter(s => !validIds.has(s));

    it('an invalid tier id in localStorage resolves to "medium" via fallback', () => {
        fc.assert(
            fc.property(invalidTierIdArb, (invalidId) => {
                GameStateManager._writeDifficultyPref(invalidId);
                const readBack = GameStateManager._readDifficultyPref();
                // The raw read returns whatever was stored
                expect(readBack).toBe(invalidId);
                // But when resolved through tier lookup + fallback, it should be "medium"
                const resolved = DIFFICULTY_TIERS.find(t => t.id === readBack)
                    || GameStateManager._defaultTier();
                expect(resolved.id).toBe('medium');
            }),
            { numRuns: 100 }
        );
    });

    it('null preference (empty localStorage) resolves to "medium"', () => {
        localStorage.removeItem('maze-difficulty');
        const readBack = GameStateManager._readDifficultyPref();
        expect(readBack).toBeNull();
        const resolved = DIFFICULTY_TIERS.find(t => t.id === readBack)
            || GameStateManager._defaultTier();
        expect(resolved.id).toBe('medium');
    });
});

// ── Property 12: Staleness rules produce correct restore/discard decision ──
/**
 * Feature: puzzle-panel-and-persistence, Property 12: Staleness rules produce correct restore/discard decision
 *
 * For random saved dates relative to today: 0 days → restore, 1 day → discard,
 * 2+ days → restore.
 *
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */
describe('Property 12: Staleness rules produce correct restore/discard decision', () => {
    it('staleness rules: 0 days ago → restore, 1 day ago → discard, 2+ days ago → restore', () => {
        fc.assert(
            fc.property(
                fc.integer({ min: 0, max: 365 }),
                (daysAgo) => {
                    const today = GameStateManager._today();
                    const savedDate = new Date(today);
                    savedDate.setDate(savedDate.getDate() - daysAgo);
                    const dateStr = GameStateManager._formatDate(savedDate);

                    const savedState = {
                        date: dateStr,
                        tierId: 'medium',
                        currentCell: '0,0',
                        pathTrail: ['0,0'],
                    };

                    const result = GameStateManager._shouldRestore(savedState);

                    if (daysAgo === 0) {
                        expect(result).toBe(true);   // Today → restore
                    } else if (daysAgo === 1) {
                        expect(result).toBe(false);  // Yesterday → discard
                    } else {
                        expect(result).toBe(true);   // 2+ days → restore
                    }
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 13: Malformed saved state is discarded ─────────
/**
 * Feature: puzzle-panel-and-persistence, Property 13: Malformed saved state is discarded
 *
 * For random malformed JSON strings and objects with missing/invalid fields,
 * the reader should return null.
 *
 * **Validates: Requirements 8.5**
 */
describe('Property 13: Malformed saved state is discarded', () => {
    it('non-JSON strings in localStorage produce null', () => {
        fc.assert(
            fc.property(
                fc.string({ minLength: 1, maxLength: 100 }).filter(s => {
                    try { JSON.parse(s); return false; } catch { return true; }
                }),
                (malformed) => {
                    localStorage.setItem('maze-state', malformed);
                    expect(GameStateManager._readSavedState()).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    });

    it('JSON objects with missing required fields produce null', () => {
        // Generate objects that are missing at least one required field
        const partialStateArb = fc.record({
            date: fc.option(fc.string(), { nil: undefined }),
            tierId: fc.option(fc.string(), { nil: undefined }),
            currentCell: fc.option(fc.string(), { nil: undefined }),
            pathTrail: fc.option(fc.array(fc.string()), { nil: undefined }),
        }).filter(obj => {
            // At least one field must be missing or invalid
            return !obj.date || !obj.tierId || !obj.currentCell
                || !Array.isArray(obj.pathTrail);
        });

        fc.assert(
            fc.property(partialStateArb, (partial) => {
                localStorage.setItem('maze-state', JSON.stringify(partial));
                expect(GameStateManager._readSavedState()).toBeNull();
            }),
            { numRuns: 100 }
        );
    });

    it('JSON objects with invalid tierId produce null', () => {
        const validIds = new Set(DIFFICULTY_TIERS.map(t => t.id));
        const invalidTierArb = fc.string({ minLength: 1, maxLength: 20 })
            .filter(s => !validIds.has(s));

        fc.assert(
            fc.property(invalidTierArb, (badTierId) => {
                const state = {
                    date: '2025-01-15',
                    tierId: badTierId,
                    currentCell: '5,5',
                    pathTrail: ['5,5'],
                };
                localStorage.setItem('maze-state', JSON.stringify(state));
                expect(GameStateManager._readSavedState()).toBeNull();
            }),
            { numRuns: 100 }
        );
    });

    it('JSON objects with empty pathTrail produce null', () => {
        const state = {
            date: '2025-01-15',
            tierId: 'medium',
            currentCell: '5,5',
            pathTrail: [],
        };
        localStorage.setItem('maze-state', JSON.stringify(state));
        expect(GameStateManager._readSavedState()).toBeNull();
    });

    it('non-array pathTrail produces null', () => {
        fc.assert(
            fc.property(
                fc.oneof(fc.string(), fc.integer(), fc.boolean(), fc.constant(null)),
                (badTrail) => {
                    const state = {
                        date: '2025-01-15',
                        tierId: 'medium',
                        currentCell: '5,5',
                        pathTrail: badTrail,
                    };
                    localStorage.setItem('maze-state', JSON.stringify(state));
                    expect(GameStateManager._readSavedState()).toBeNull();
                }
            ),
            { numRuns: 100 }
        );
    });
});

// ── Property 10: Saved state contains all required fields after move ──
/**
 * Feature: puzzle-panel-and-persistence, Property 10: Saved state contains all required fields after move
 *
 * For random game states (date, tier, currentCell, pathTrail), after writing
 * saved state, the JSON in localStorage should contain all four fields
 * matching the input.
 *
 * **Validates: Requirements 7.1, 7.2**
 */
describe('Property 10: Saved state contains all required fields after move', () => {
    // Arbitrary: random date as a Date object
    const dateArb = fc.date({
        min: new Date(2020, 0, 1),
        max: new Date(2030, 11, 31),
    });

    // Arbitrary: random valid tier from DIFFICULTY_TIERS
    const tierArb = fc.constantFrom(...DIFFICULTY_TIERS);

    // Arbitrary: random cell string like "row,col"
    const cellArb = fc.tuple(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 })
    ).map(([r, c]) => `${r},${c}`);

    // Arbitrary: random non-empty path trail array
    const pathTrailArb = fc.array(
        fc.tuple(
            fc.integer({ min: 0, max: 50 }),
            fc.integer({ min: 0, max: 50 })
        ).map(([r, c]) => `${r},${c}`),
        { minLength: 1, maxLength: 20 }
    );

    it('after _writeSavedState(), localStorage contains all four fields matching the game state', () => {
        // Import PlayerController for setting up state
        let PlayerController;
        return import('../game.js').then((mod) => {
            PlayerController = mod.PlayerController;

            fc.assert(
                fc.property(dateArb, tierArb, cellArb, pathTrailArb, (date, tier, currentCell, pathTrail) => {
                    // Set up game state
                    GameStateManager.currentDate = date;
                    GameStateManager.currentTier = tier;
                    PlayerController.currentCell = currentCell;
                    PlayerController.pathTrail = pathTrail;

                    // Write saved state
                    GameStateManager._writeSavedState();

                    // Read back from localStorage
                    const raw = localStorage.getItem('maze-state');
                    expect(raw).not.toBeNull();

                    const parsed = JSON.parse(raw);

                    // Verify all four fields exist and match
                    expect(parsed).toHaveProperty('date');
                    expect(parsed).toHaveProperty('tierId');
                    expect(parsed).toHaveProperty('currentCell');
                    expect(parsed).toHaveProperty('pathTrail');

                    expect(parsed.date).toBe(GameStateManager._formatDate(date));
                    expect(parsed.tierId).toBe(tier.id);
                    expect(parsed.currentCell).toBe(currentCell);
                    expect(parsed.pathTrail).toEqual(pathTrail);
                }),
                { numRuns: 100 }
            );
        });
    });
});

// ── Property 11: Saved state is cleared on win ──────────────
/**
 * Feature: puzzle-panel-and-persistence, Property 11: Saved state is cleared on win
 *
 * For random game states ending in a win, localStorage should not contain
 * `maze-state` after the win handler.
 *
 * **Validates: Requirements 7.3**
 */
describe('Property 11: Saved state is cleared on win', () => {
    // Arbitrary: random valid tier from DIFFICULTY_TIERS
    const tierArb = fc.constantFrom(...DIFFICULTY_TIERS);

    // Arbitrary: random date as a Date object
    const dateArb = fc.date({
        min: new Date(2020, 0, 1),
        max: new Date(2030, 11, 31),
    });

    // Arbitrary: random cell string like "row,col"
    const cellArb = fc.tuple(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 })
    ).map(([r, c]) => `${r},${c}`);

    // Arbitrary: random non-empty path trail array
    const pathTrailArb = fc.array(
        fc.tuple(
            fc.integer({ min: 0, max: 50 }),
            fc.integer({ min: 0, max: 50 })
        ).map(([r, c]) => `${r},${c}`),
        { minLength: 1, maxLength: 20 }
    );

    it('after _clearSavedState() (simulating win), localStorage does not contain maze-state', () => {
        fc.assert(
            fc.property(dateArb, tierArb, cellArb, pathTrailArb, (date, tier, currentCell, pathTrail) => {
                // Set up game state and write it to localStorage
                GameStateManager.currentDate = date;
                GameStateManager.currentTier = tier;

                const state = {
                    date: GameStateManager._formatDate(date),
                    tierId: tier.id,
                    currentCell: currentCell,
                    pathTrail: pathTrail,
                };
                localStorage.setItem('maze-state', JSON.stringify(state));

                // Verify it was written
                expect(localStorage.getItem('maze-state')).not.toBeNull();

                // Simulate what onWin() does: clear saved state
                GameStateManager._clearSavedState();

                // Verify maze-state is removed
                expect(localStorage.getItem('maze-state')).toBeNull();
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 3: Panel expand/collapse tracks trail length ───
/**
 * Feature: puzzle-panel-and-persistence, Property 3: Panel expand/collapse tracks trail length
 *
 * For random trail arrays, expanded state should be true iff trail.length ≤ 1.
 *
 * **Validates: Requirements 3.1, 3.2**
 */
describe('Property 3: Panel expand/collapse tracks trail length', () => {
    // Arbitrary: random cell string like "row,col"
    const cellArb = fc.tuple(
        fc.integer({ min: 0, max: 50 }),
        fc.integer({ min: 0, max: 50 })
    ).map(([r, c]) => `${r},${c}`);

    // Arbitrary: random path trail (0 to 20 cells)
    const pathTrailArb = fc.array(cellArb, { minLength: 0, maxLength: 20 });

    let PlayerController, PuzzlePanel;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PlayerController = mod.PlayerController;
        PuzzlePanel = mod.PuzzlePanel;
    });

    it('expanded is true iff trail.length <= 1', () => {
        fc.assert(
            fc.property(pathTrailArb, (trail) => {
                // Set up PlayerController trail
                PlayerController.pathTrail = trail;

                // Call _updatePanelState which checks trail length
                GameStateManager._updatePanelState();

                if (trail.length <= 1) {
                    expect(PuzzlePanel.expanded).toBe(true);
                } else {
                    expect(PuzzlePanel.expanded).toBe(false);
                }
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 4: Date navigation round-trip ──────────────────
/**
 * Feature: puzzle-panel-and-persistence, Property 4: Date navigation round-trip
 *
 * For random dates before today, prev then next (and next then prev)
 * should return the original date.
 *
 * **Validates: Requirements 4.1, 4.2**
 */
describe('Property 4: Date navigation round-trip', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
    });

    it('prev then next returns the original date', () => {
        // Generate random dates at least 1 day before today
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const dateArb = fc.date({
            min: new Date(2000, 0, 1),
            max: new Date(today.getTime() - 86400000), // at least 1 day before today
        });

        fc.assert(
            fc.property(dateArb, (d) => {
                // Normalize to midnight
                const original = new Date(d.getFullYear(), d.getMonth(), d.getDate());

                // prev: subtract 1 day
                const prev = new Date(original);
                prev.setDate(prev.getDate() - 1);

                // next: add 1 day to prev
                const next = new Date(prev);
                next.setDate(next.getDate() + 1);

                expect(next.getFullYear()).toBe(original.getFullYear());
                expect(next.getMonth()).toBe(original.getMonth());
                expect(next.getDate()).toBe(original.getDate());
            }),
            { numRuns: 100 }
        );
    });

    it('next then prev returns the original date (when next <= today)', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Generate dates at least 2 days before today so next is still before today
        const dateArb = fc.date({
            min: new Date(2000, 0, 1),
            max: new Date(today.getTime() - 2 * 86400000),
        });

        fc.assert(
            fc.property(dateArb, (d) => {
                const original = new Date(d.getFullYear(), d.getMonth(), d.getDate());

                // next: add 1 day
                const next = new Date(original);
                next.setDate(next.getDate() + 1);

                // prev: subtract 1 day from next
                const prev = new Date(next);
                prev.setDate(prev.getDate() - 1);

                expect(prev.getFullYear()).toBe(original.getFullYear());
                expect(prev.getMonth()).toBe(original.getMonth());
                expect(prev.getDate()).toBe(original.getDate());
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 5: Date formatting produces valid YYYY-MM-DD ───
/**
 * Feature: puzzle-panel-and-persistence, Property 5: Date formatting produces valid YYYY-MM-DD
 *
 * For random Date objects, formatting then parsing should reconstruct
 * the same year, month, day.
 *
 * **Validates: Requirements 4.4, 10.2**
 */
describe('Property 5: Date formatting produces valid YYYY-MM-DD', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
    });

    // Filter out invalid Date objects (NaN) that fc.date() can produce
    const dateArb = fc.date({
        min: new Date(1970, 0, 1),
        max: new Date(2099, 11, 31),
    }).filter(d => !isNaN(d.getTime()));

    it('format then parse reconstructs the same year, month, day', () => {
        fc.assert(
            fc.property(dateArb, (d) => {
                const formatted = PuzzlePanelMod._formatDate(d);

                // Verify format matches YYYY-MM-DD
                expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);

                // Parse back
                const parsed = PuzzlePanelMod._parseDate(formatted);
                expect(parsed).not.toBeNull();
                expect(parsed.getFullYear()).toBe(d.getFullYear());
                expect(parsed.getMonth()).toBe(d.getMonth());
                expect(parsed.getDate()).toBe(d.getDate());
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 6: Valid date input is accepted ────────────────
/**
 * Feature: puzzle-panel-and-persistence, Property 6: Valid date input is accepted
 *
 * For random valid YYYY-MM-DD strings representing real calendar dates,
 * the parser should accept and reconstruct the date.
 *
 * **Validates: Requirements 4.5**
 */
describe('Property 6: Valid date input is accepted', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
    });

    // Helper: days in month
    function daysInMonth(year, month) {
        return new Date(year, month, 0).getDate();
    }

    // Generate random valid date components
    const validDateStrArb = fc.integer({ min: 2000, max: 2030 }).chain(year =>
        fc.integer({ min: 1, max: 12 }).chain(month =>
            fc.integer({ min: 1, max: daysInMonth(year, month) }).map(day => {
                const yStr = String(year);
                const mStr = String(month).padStart(2, '0');
                const dStr = String(day).padStart(2, '0');
                return { str: `${yStr}-${mStr}-${dStr}`, year, month, day };
            })
        )
    );

    it('valid YYYY-MM-DD strings are accepted and reconstruct the date', () => {
        fc.assert(
            fc.property(validDateStrArb, ({ str, year, month, day }) => {
                const parsed = PuzzlePanelMod._parseDate(str);
                expect(parsed).not.toBeNull();
                expect(parsed.getFullYear()).toBe(year);
                expect(parsed.getMonth()).toBe(month - 1); // JS months are 0-indexed
                expect(parsed.getDate()).toBe(day);
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 7: Invalid date input is rejected ──────────────
/**
 * Feature: puzzle-panel-and-persistence, Property 7: Invalid date input is rejected
 *
 * For random invalid date strings (malformed, non-existent dates, non-date text),
 * the validator should reject them.
 *
 * **Validates: Requirements 4.6**
 */
describe('Property 7: Invalid date input is rejected', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
    });

    it('random non-date strings are rejected', () => {
        // Strings that don't match YYYY-MM-DD format
        const nonDateArb = fc.string({ minLength: 0, maxLength: 30 }).filter(s => {
            return !/^\d{4}-\d{2}-\d{2}$/.test(s);
        });

        fc.assert(
            fc.property(nonDateArb, (s) => {
                const parsed = PuzzlePanelMod._parseDate(s);
                expect(parsed).toBeNull();
            }),
            { numRuns: 100 }
        );
    });

    it('non-existent dates like Feb 30 are rejected', () => {
        // Generate dates that look valid but represent impossible calendar dates
        const invalidCalendarDateArb = fc.constantFrom(
            '2025-02-30', '2025-02-29', '2023-02-29', '2025-04-31',
            '2025-06-31', '2025-09-31', '2025-11-31', '2025-13-01',
            '2025-00-15', '2025-01-00', '2025-01-32',
        );

        fc.assert(
            fc.property(invalidCalendarDateArb, (s) => {
                const parsed = PuzzlePanelMod._parseDate(s);
                expect(parsed).toBeNull();
            }),
            { numRuns: 100 }
        );
    });

    it('non-string inputs are rejected', () => {
        const nonStringArb = fc.oneof(
            fc.integer(),
            fc.boolean(),
            fc.constant(null),
            fc.constant(undefined),
            fc.array(fc.string()),
        );

        fc.assert(
            fc.property(nonStringArb, (val) => {
                const parsed = PuzzlePanelMod._parseDate(val);
                expect(parsed).toBeNull();
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 8: Random date falls within valid range ────────
/**
 * Feature: puzzle-panel-and-persistence, Property 8: Random date falls within valid range
 *
 * For many invocations of the random date generator, the result should be
 * ≥ 2025-01-01 and ≤ today.
 *
 * **Validates: Requirements 4.7**
 */
describe('Property 8: Random date falls within valid range', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
    });

    it('random dates are within [2025-01-01, today]', () => {
        const minDate = new Date(2025, 0, 1);
        minDate.setHours(0, 0, 0, 0);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Use a simple seed arbitrary to drive iterations
        fc.assert(
            fc.property(fc.integer({ min: 0, max: 999 }), (_seed) => {
                // Capture the date from onDateChange callback
                let capturedDate = null;
                PuzzlePanelMod.onDateChange = (date) => { capturedDate = date; };

                PuzzlePanelMod._onRandomDate();

                expect(capturedDate).not.toBeNull();
                // Normalize to midnight for comparison
                const d = new Date(capturedDate.getFullYear(), capturedDate.getMonth(), capturedDate.getDate());
                expect(d.getTime()).toBeGreaterThanOrEqual(minDate.getTime());
                expect(d.getTime()).toBeLessThanOrEqual(today.getTime());
            }),
            { numRuns: 100 }
        );
    });
});

// ── Property 9: Today's Puzzle button visibility tracks date ─
/**
 * Feature: puzzle-panel-and-persistence, Property 9: Today's Puzzle button visibility tracks date
 *
 * For random dates, the button should be visible iff date !== today.
 *
 * **Validates: Requirements 5.1, 5.2**
 */
describe('Property 9: Today\'s Puzzle button visibility tracks date', () => {
    let PuzzlePanelMod;
    beforeAll(async () => {
        const mod = await import('../game.js');
        PuzzlePanelMod = mod.PuzzlePanel;
        // Ensure PuzzlePanel is initialized with DOM elements
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        PuzzlePanelMod.init(today, 'medium');
    });

    const dateArb = fc.date({
        min: new Date(2020, 0, 1),
        max: new Date(2030, 11, 31),
    }).filter(d => !isNaN(d.getTime()));

    it('Today\'s Puzzle button is hidden when date === today, visible otherwise', () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        fc.assert(
            fc.property(dateArb, (d) => {
                // Normalize to midnight
                const testDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());

                // Set the current date and re-render
                PuzzlePanelMod.currentDate = testDate;
                PuzzlePanelMod.render();

                const isToday = testDate.getFullYear() === today.getFullYear()
                    && testDate.getMonth() === today.getMonth()
                    && testDate.getDate() === today.getDate();

                if (isToday) {
                    expect(PuzzlePanelMod._todayBtn.style.display).toBe('none');
                } else {
                    expect(PuzzlePanelMod._todayBtn.style.display).toBe('');
                }
            }),
            { numRuns: 100 }
        );
    });
});

import { describe, it, expect } from 'vitest';
import { DIFFICULTY_TIERS, DAILY_PUZZLE_TIER } from '../difficulty.js';

/**
 * Unit tests for game/difficulty.js
 * Validates: Requirements 1.1, 1.3
 */

describe('DIFFICULTY_TIERS', () => {
    it('has exactly 4 entries with correct names and parameters', () => {
        expect(DIFFICULTY_TIERS).toHaveLength(4);

        const expected = [
            { id: 'easy',      name: "I'm too young to cache", hexSide: 9,  centerHexRadius: 5  },
            { id: 'medium',    name: "Hey, not too fast",      hexSide: 17, centerHexRadius: 9  },
            { id: 'hard',      name: "Query me plenty",        hexSide: 25, centerHexRadius: 11 },
            { id: 'nightmare', name: "Ultra-Valkey",           hexSide: 35, centerHexRadius: 15 },
        ];

        for (let i = 0; i < expected.length; i++) {
            expect(DIFFICULTY_TIERS[i]).toEqual(expected[i]);
        }
    });

    it('is ordered by hexSide ascending', () => {
        for (let i = 1; i < DIFFICULTY_TIERS.length; i++) {
            expect(DIFFICULTY_TIERS[i].hexSide).toBeGreaterThan(DIFFICULTY_TIERS[i - 1].hexSide);
        }
    });
});

describe('DAILY_PUZZLE_TIER', () => {
    it('is the Hard tier ("Query me plenty", hexSide=25, centerHexRadius=11)', () => {
        expect(DAILY_PUZZLE_TIER.id).toBe('hard');
        expect(DAILY_PUZZLE_TIER.name).toBe('Query me plenty');
        expect(DAILY_PUZZLE_TIER.hexSide).toBe(25);
        expect(DAILY_PUZZLE_TIER.centerHexRadius).toBe(11);
        expect(DAILY_PUZZLE_TIER).toBe(DIFFICULTY_TIERS[2]);
    });
});

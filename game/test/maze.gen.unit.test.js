import { describe, it, expect } from 'vitest';
import {
    DIFFICULTY_TIERS,
    DAILY_PUZZLE_TIER,
    generateMaze,
    createPRNG,
    dateSeed,
} from '../maze.gen.js';

/**
 * Unit tests for maze.gen.js
 * Validates: Requirements 1.1, 1.3, 5.4, 5.5, 8.6
 */

describe('DIFFICULTY_TIERS', () => {
    it('has exactly 4 entries with correct names and parameters', () => {
        expect(DIFFICULTY_TIERS).toHaveLength(4);

        const expected = [
            { id: 'easy',      name: "I'm too young to cache", hexSide: 8,  centerHexRadius: 3  },
            { id: 'medium',    name: "Hey, not too fast",      hexSide: 15, centerHexRadius: 6  },
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

describe('generateMaze error handling', () => {
    it('throws on hex_side = 0', () => {
        const prng = createPRNG(42);
        expect(() => generateMaze(0, 2, prng)).toThrow(/hex_side/i);
    });

    it('throws on negative hex_side', () => {
        const prng = createPRNG(42);
        expect(() => generateMaze(-3, 2, prng)).toThrow(/hex_side/i);
    });

    it('throws on negative center_hex_radius', () => {
        const prng = createPRNG(42);
        expect(() => generateMaze(5, -1, prng)).toThrow(/center_hex_radius/i);
    });
});

describe('dateSeed', () => {
    it('returns 20250715 for 2025-07-15', () => {
        expect(dateSeed(new Date(2025, 6, 15))).toBe(20250715);
    });

    it('returns 20000101 for 2000-01-01', () => {
        expect(dateSeed(new Date(2000, 0, 1))).toBe(20000101);
    });

    it('returns 20241231 for 2024-12-31', () => {
        expect(dateSeed(new Date(2024, 11, 31))).toBe(20241231);
    });

    it('returns 20990228 for 2099-02-28', () => {
        expect(dateSeed(new Date(2099, 1, 28))).toBe(20990228);
    });
});

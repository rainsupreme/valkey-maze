import { describe, it, expect } from 'vitest';
import { createPRNG, dateSeed } from '../prng.js';
import { generateMaze } from '../maze.js';

/**
 * Unit tests for core/maze.js and core/prng.js
 * Validates: Requirements 1.1, 1.3, 5.4, 5.5, 8.6
 */

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

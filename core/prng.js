// ── Seeded PRNG (mulberry32) ────────────────────────────────

/**
 * Create a seeded PRNG using the mulberry32 algorithm.
 * @param {number} seed - 32-bit integer seed
 * @returns {{ next(): number, choice(arr: any[]): any }}
 *   next() returns a float in [0, 1)
 *   choice(arr) returns a random element from arr
 */
export function createPRNG(seed) {
    let state = seed | 0;
    function next() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
    }
    function choice(arr) {
        return arr[Math.floor(next() * arr.length)];
    }
    return { next, choice };
}

// ── Date Seed ───────────────────────────────────────────────

/**
 * Derive a 32-bit integer seed from a date.
 * Pure function of (year, month, day).
 * @param {Date} date
 * @returns {number}
 */
export function dateSeed(date) {
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    return y * 10000 + m * 100 + d;
}

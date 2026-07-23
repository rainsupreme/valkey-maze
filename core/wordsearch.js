// ── Word search generator ───────────────────────────────────
//
// Places words into a square letter grid (8 directions, crossings
// encouraged), then fills the remaining cells with letters chosen so
// no banned word appears anywhere in the completed grid.
//
// Pure module: randomness comes from an injected PRNG, banned words
// are passed as data (see core/data/banned-words.txt for the default
// list; callers load it).

/** The 8 placement/scan directions as [dr, dc]. */
export const DIRECTIONS = [
    [0, 1], [1, 0], [1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1], [-1, 1],
];

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const PLACEMENT_ATTEMPTS = 200;
const BEST_PLACEMENT_BIAS = 0.7; // probability of taking the most-crossing spot
const TOP_CANDIDATES = 5;

/**
 * Check whether `word` fits at (row, col) heading (dr, dc): stays in
 * bounds and only overlaps cells that are empty or hold the same letter.
 * @param {string[][]} grid
 * @param {number} size
 * @param {string} word
 */
export function canPlace(grid, size, word, row, col, dr, dc) {
    for (let i = 0; i < word.length; i++) {
        const r = row + i * dr;
        const c = col + i * dc;
        if (r < 0 || r >= size || c < 0 || c >= size) return false;
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) return false;
    }
    return true;
}

/**
 * Would writing `letter` at (row, col) complete any banned word through
 * that cell? Scans every direction and window position touching the cell,
 * with window lengths up to the longest banned word.
 * @param {string[][]} grid - partially filled grid ('' = empty)
 * @param {number} size
 * @param {Set<string>} bannedWords
 * @param {number} maxBannedLength
 */
export function isSafePlacement(grid, size, bannedWords, maxBannedLength, row, col, letter) {
    for (const [dr, dc] of DIRECTIONS) {
        for (let length = 2; length <= maxBannedLength; length++) {
            for (let startOffset = 0; startOffset < length; startOffset++) {
                let word = '';
                let valid = true;
                for (let i = 0; i < length; i++) {
                    const r = row + (i - startOffset) * dr;
                    const c = col + (i - startOffset) * dc;
                    if (r < 0 || r >= size || c < 0 || c >= size) {
                        valid = false;
                        break;
                    }
                    const ch = (r === row && c === col) ? letter : grid[r][c];
                    if (ch === '') {
                        valid = false;
                        break;
                    }
                    word += ch;
                }
                if (valid && bannedWords.has(word)) return false;
            }
        }
    }
    return true;
}

/**
 * Generate a word search puzzle.
 *
 * Words are placed longest-first. For each word, candidate positions are
 * sampled and ranked by how many existing letters they cross; the
 * best-crossing spot is usually taken (with some randomness among the
 * top candidates) so words interlock like a crossword.
 *
 * @param {object} params
 * @param {number} [params.size=15] - grid dimension
 * @param {string[]} params.words - words to place (case-insensitive)
 * @param {string[]} [params.bannedWords=[]] - words that must not appear
 *   anywhere in the completed grid (uppercase)
 * @param {{ next(): number, choice(arr: any[]): any }} params.prng
 * @returns {{ size: number, grid: string[][],
 *             placedWords: Array<{word: string, row: number, col: number, dr: number, dc: number}>,
 *             unplacedWords: string[] }}
 *   placedWords is the puzzle's solution data.
 */
export function generateWordSearch({ size = 15, words, bannedWords = [], prng }) {
    const grid = Array.from({ length: size }, () => Array(size).fill(''));
    const placedWords = [];
    const unplacedWords = [];

    const banned = new Set(bannedWords.map(w => w.toUpperCase()));
    let maxBannedLength = 0;
    for (const b of banned) {
        if (b.length > maxBannedLength) maxBannedLength = b.length;
    }

    const randInt = (n) => Math.floor(prng.next() * n);

    // ── Place words, longest first ──────────────────────────
    const sorted = words.map(w => w.toUpperCase()).sort((a, b) => b.length - a.length);

    for (const word of sorted) {
        const attempts = [];
        for (let t = 0; t < PLACEMENT_ATTEMPTS; t++) {
            const row = randInt(size);
            const col = randInt(size);
            const [dr, dc] = prng.choice(DIRECTIONS);
            if (canPlace(grid, size, word, row, col, dr, dc)) {
                let crosses = 0;
                for (let i = 0; i < word.length; i++) {
                    if (grid[row + i * dr][col + i * dc] !== '') crosses += 1;
                }
                attempts.push({ crosses, row, col, dr, dc });
            }
        }

        if (attempts.length === 0) {
            unplacedWords.push(word);
            continue;
        }

        attempts.sort((a, b) =>
            b.crosses - a.crosses || a.row - b.row || a.col - b.col || a.dr - b.dr || a.dc - b.dc
        );
        const top = attempts.slice(0, TOP_CANDIDATES);
        const pick = prng.next() < BEST_PLACEMENT_BIAS ? attempts[0] : prng.choice(top);

        for (let i = 0; i < word.length; i++) {
            grid[pick.row + i * pick.dr][pick.col + i * pick.dc] = word[i];
        }
        placedWords.push({ word, row: pick.row, col: pick.col, dr: pick.dr, dc: pick.dc });
    }

    // ── Fill remaining cells with banned-word-safe letters ──
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            if (grid[r][c] !== '') continue;
            if (banned.size === 0) {
                grid[r][c] = ALPHABET[randInt(26)];
                continue;
            }
            const candidates = ALPHABET.split('');
            // Fisher-Yates shuffle with the injected PRNG
            for (let i = candidates.length - 1; i > 0; i--) {
                const j = randInt(i + 1);
                [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
            }
            let filled = false;
            for (const letter of candidates) {
                if (isSafePlacement(grid, size, banned, maxBannedLength, r, c, letter)) {
                    grid[r][c] = letter;
                    filled = true;
                    break;
                }
            }
            if (!filled) {
                throw new Error(`No safe letter for cell (${r}, ${c})`);
            }
        }
    }

    return { size, grid, placedWords, unplacedWords };
}

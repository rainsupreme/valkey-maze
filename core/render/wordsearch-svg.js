// ── Word search SVG renderer ────────────────────────────────
//
// Pure puzzleData -> SVG-string rendering for word search puzzles,
// with an optional solution overlay (colored strike lines + colored
// word list).

const DEFAULTS = {
    cellSize: 30,
    fontSize: 20,
    wordListFontSize: 14,
    showSolution: false,
    displayWords: null, // null = show all placed words (hidden-word filter)
    background: 'white',
};

const SOLUTION_COLORS = [
    '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
    '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
];

const WORDS_PER_ROW = 4;
const WORD_COLUMN_WIDTH = 120;
const WORD_ROW_HEIGHT = 20;
const LIST_GAP = 20;
const LIST_HEADER_TO_WORDS = 25;

/**
 * Render a word search as an SVG string.
 *
 * @param {object} puzzle - from generateWordSearch()
 * @param {object} [options]
 * @param {number} [options.cellSize=30]
 * @param {boolean} [options.showSolution=false] - strike placed words in
 *   color and color the word list (always lists ALL placed words,
 *   including hidden ones)
 * @param {string[]|null} [options.displayWords=null] - words to list under
 *   the puzzle; null lists every placed word. Ignored when showSolution
 *   (solutions always reveal hidden words)
 * @param {string} [options.background='white']
 * @returns {string} SVG document
 */
export function renderWordSearchSVG(puzzle, options = {}) {
    const opts = { ...DEFAULTS, ...options };
    const { size, grid, placedWords } = puzzle;
    const cs = opts.cellSize;

    let wordsToDisplay;
    if (opts.showSolution) {
        wordsToDisplay = placedWords.map(p => p.word);
    } else if (opts.displayWords !== null) {
        const allow = new Set(opts.displayWords.map(w => w.toUpperCase()));
        wordsToDisplay = placedWords.map(p => p.word).filter(w => allow.has(w));
    } else {
        wordsToDisplay = placedWords.map(p => p.word);
    }

    const listRows = Math.ceil(wordsToDisplay.length / WORDS_PER_ROW);
    const width = size * cs;
    const height = size * cs + 50 + listRows * WORD_ROW_HEIGHT;

    const parts = [];
    parts.push(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`
    );
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${opts.background}"/>`);

    // ── Grid cells + letters ────────────────────────────────
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            const x = c * cs;
            const y = r * cs;
            parts.push(
                `<rect class="cell" x="${x}" y="${y}" width="${cs}" height="${cs}" fill="white" stroke="black"/>`
            );
            parts.push(
                `<text class="letter" x="${x + cs / 2}" y="${y + cs * 0.7}" text-anchor="middle"` +
                ` font-size="${opts.fontSize}" font-family="Arial">${grid[r][c]}</text>`
            );
        }
    }

    // ── Solution strike lines ───────────────────────────────
    if (opts.showSolution) {
        placedWords.forEach((p, i) => {
            const color = SOLUTION_COLORS[i % SOLUTION_COLORS.length];
            const x1 = p.col * cs + cs / 2;
            const y1 = p.row * cs + cs / 2;
            const x2 = (p.col + (p.word.length - 1) * p.dc) * cs + cs / 2;
            const y2 = (p.row + (p.word.length - 1) * p.dr) * cs + cs / 2;
            parts.push(
                `<line class="solution" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"` +
                ` stroke="${color}" stroke-width="4" opacity="0.5"/>`
            );
        });
    }

    // ── Word list ───────────────────────────────────────────
    const listY = size * cs + LIST_GAP;
    const header = opts.showSolution ? 'Solution:' : 'Words:';
    parts.push(
        `<text class="list-header" x="10" y="${listY}" font-size="16" font-weight="bold">${header}</text>`
    );
    wordsToDisplay.forEach((word, i) => {
        const x = 10 + (i % WORDS_PER_ROW) * WORD_COLUMN_WIDTH;
        const y = listY + LIST_HEADER_TO_WORDS + Math.floor(i / WORDS_PER_ROW) * WORD_ROW_HEIGHT;
        const fill = opts.showSolution
            ? ` fill="${SOLUTION_COLORS[i % SOLUTION_COLORS.length]}"`
            : '';
        parts.push(
            `<text class="word" x="${x}" y="${y}" font-size="${opts.wordListFontSize}"${fill}>${word}</text>`
        );
    });

    parts.push('</svg>');
    return parts.join('');
}

// ── Placemat composition ────────────────────────────────────
//
// Pure functions that compose printable placemat HTML (and the answer
// key) from generated puzzles. The CLI entry point (build-placemats.js)
// handles file I/O; everything here is data-in, string-out.

import { renderMazeSVG } from '../core/render/maze-svg.js';
import { renderWordSearchSVG } from '../core/render/wordsearch-svg.js';

/**
 * Parse a words file: one word per line, blank lines ignored.
 * Lines ending in "# hidden" are placed in the grid but excluded
 * from the displayed word list.
 * @param {string} text
 * @returns {{ allWords: string[], displayWords: string[] }}
 */
export function parseWordsFile(text) {
    const allWords = [];
    const displayWords = [];
    for (let line of text.split('\n')) {
        line = line.trim();
        if (!line) continue;
        if (line.endsWith('# hidden')) {
            allWords.push(line.split('#', 1)[0].trim());
        } else {
            allWords.push(line);
            displayWords.push(line);
        }
    }
    return { allWords, displayWords };
}

const PLACEMAT_CSS = `
@page { size: letter landscape; margin: 0.5in; }
body { margin: 0; padding: 0; font-family: 'Open Sans', sans-serif; }
.page {
    width: 10.5in;
    height: 8in;
    page-break-after: always;
    display: flex;
    box-sizing: border-box;
    position: relative;
}
.page-number {
    position: absolute;
    bottom: 0.1in;
    left: 0.25in;
    font-size: 10pt;
    color: #666;
}
.puzzle {
    width: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.25in;
    overflow: hidden;
}
.puzzle-title {
    font-size: 24pt;
    font-weight: bold;
    margin-bottom: 10px;
    text-align: center;
    flex-shrink: 0;
}
.puzzle-container {
    transform-origin: center;
    max-height: 90%;
    display: flex;
    align-items: center;
    justify-content: center;
}
.puzzle svg { display: block; }
.maze-container {
    transform: scale(0.35);
}
.wordsearch-container {
    transform: scale(0.75);
}
.notes {
    width: 50%;
    padding: 0.25in;
    position: relative;
}
.notes h2 { margin: 0 0 20px 0; font-size: 18pt; }
.line {
    height: 30px;
    border-bottom: 1px solid #999;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
@media print {
    .page { page-break-after: always; }
}
`;

const ANSWER_KEY_CSS = `
@page { size: letter; margin: 0.5in; }
body { font-family: Arial, sans-serif; }
.answer { page-break-after: always; text-align: center; }
.answer h2 { margin: 20px 0; }
.answer svg { max-width: 90%; height: auto; }
`;

const NOTES_LINES = 20;

function puzzlePage(title, containerClass, svg, pageNum) {
    const lines = '<div class="line"></div>'.repeat(NOTES_LINES);
    return `
<div class="page">
    <div class="puzzle">
        <div class="puzzle-title">${title}</div>
        <div class="puzzle-container ${containerClass}">${svg}</div>
    </div>
    <div class="notes"><h2>Notes</h2>${lines}</div>
    <div class="page-number">${pageNum}</div>
</div>
`;
}

/**
 * Compose the printable placemats document. Each placemat is a
 * maze page + word search page pair (duplex-ready: odd/even).
 *
 * @param {object} params
 * @param {Array<object>} params.mazes - maze puzzle data
 * @param {Array<object>} params.wordSearches - word search puzzle data
 * @param {string[]} params.displayWords - word list shown on puzzles
 *   (hidden words excluded)
 * @param {string|null} [params.logoSvg=null] - logo SVG source text
 * @returns {string} HTML document
 */
export function buildPlacematsHTML({ mazes, wordSearches, displayWords, logoSvg = null }) {
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap">
<style>${PLACEMAT_CSS}</style>
</head>
<body>
`;

    for (let i = 0; i < mazes.length; i++) {
        const mazeSvg = renderMazeSVG(mazes[i], { logoSvg });
        html += puzzlePage('Valkey.io', 'maze-container', mazeSvg, i * 2 + 1);

        const wsSvg = renderWordSearchSVG(wordSearches[i], { displayWords });
        html += puzzlePage('Valkey.io', 'wordsearch-container', wsSvg, i * 2 + 2);
    }

    html += `
</body>
</html>
`;
    return html;
}

/**
 * Compose the answer key document: every puzzle's solution, labeled
 * with the placemat page it answers.
 *
 * @param {object} params
 * @param {Array<object>} params.mazes
 * @param {Array<object>} params.wordSearches
 * @param {string|null} [params.logoSvg=null]
 * @returns {string} HTML document
 */
export function buildAnswerKeyHTML({ mazes, wordSearches, logoSvg = null }) {
    let html = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>${ANSWER_KEY_CSS}</style>
</head>
<body>
`;

    for (let i = 0; i < mazes.length; i++) {
        const mazeSolution = renderMazeSVG(mazes[i], {
            logoSvg,
            showSolution: true,
            solutionColor: 'red',
            solutionWidth: 3,
        });
        const wsSolution = renderWordSearchSVG(wordSearches[i], { showSolution: true });
        html += `<div class="answer"><h2>Maze ${i + 1} Solution (Page ${i * 2 + 1})</h2>${mazeSolution}</div>`;
        html += `<div class="answer"><h2>Word Search ${i + 1} Solution (Page ${i * 2 + 2})</h2>${wsSolution}</div>`;
    }

    html += '</body></html>';
    return html;
}

#!/usr/bin/env node
// ── Placemat generator CLI ──────────────────────────────────
//
// Generates printable placemats (maze + word search pairs) and an
// answer key from the shared puzzle core.
//
// Usage:
//   node print/build-placemats.js [options]
//
// Options:
//   --count N          number of placemats (default 10)
//   --seed S           base seed; placemat i uses seed S+i (default 1000)
//   --hex-side N       maze hexagon side (default 25)
//   --center-radius N  maze open-center radius (default 11)
//   --ws-size N        word search grid size (default 18)
//   --words PATH       words file (default words.txt)
//   --out-dir PATH     output directory (default .)

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createPRNG } from '../core/prng.js';
import { generateMaze } from '../core/maze.js';
import { generateWordSearch } from '../core/wordsearch.js';
import { parseWordsFile, buildPlacematsHTML, buildAnswerKeyHTML } from './placemats.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DEFAULTS = {
    count: 10,
    seed: 1000,
    hexSide: 25,
    centerRadius: 11,
    wsSize: 18,
    words: join(REPO_ROOT, 'words.txt'),
    outDir: '.',
};

function parseArgs(argv) {
    const opts = { ...DEFAULTS };
    const flagMap = {
        '--count': ['count', Number],
        '--seed': ['seed', Number],
        '--hex-side': ['hexSide', Number],
        '--center-radius': ['centerRadius', Number],
        '--ws-size': ['wsSize', Number],
        '--words': ['words', String],
        '--out-dir': ['outDir', String],
    };
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        if (flag === '--help' || flag === '-h') {
            console.log('Usage: node print/build-placemats.js [--count N] [--seed S] [--hex-side N] [--center-radius N] [--ws-size N] [--words PATH] [--out-dir PATH]');
            process.exit(0);
        }
        const entry = flagMap[flag];
        if (!entry) {
            console.error(`Unknown option: ${flag}`);
            process.exit(1);
        }
        const [key, cast] = entry;
        const value = argv[++i];
        if (value === undefined) {
            console.error(`Missing value for ${flag}`);
            process.exit(1);
        }
        opts[key] = cast(value);
        if (cast === Number && !Number.isFinite(opts[key])) {
            console.error(`Invalid number for ${flag}: ${value}`);
            process.exit(1);
        }
    }
    return opts;
}

function main() {
    const opts = parseArgs(process.argv.slice(2));

    const logoSvg = readFileSync(join(REPO_ROOT, 'assets', 'valkey-logo-aligned.svg'), 'utf8');
    const bannedWords = readFileSync(join(REPO_ROOT, 'core', 'data', 'banned-words.txt'), 'utf8')
        .split('\n').map(l => l.trim()).filter(Boolean);
    const { allWords, displayWords } = parseWordsFile(readFileSync(opts.words, 'utf8'));

    const mazes = [];
    const wordSearches = [];
    for (let i = 0; i < opts.count; i++) {
        console.log(`Generating placemat ${i + 1} of ${opts.count}...`);
        mazes.push(generateMaze(opts.hexSide, opts.centerRadius, createPRNG(opts.seed + i)));
        const ws = generateWordSearch({
            size: opts.wsSize,
            words: allWords,
            bannedWords,
            prng: createPRNG(opts.seed + 100000 + i),
        });
        if (ws.unplacedWords.length > 0) {
            console.warn(`  Warning: could not place: ${ws.unplacedWords.join(', ')}`);
        }
        wordSearches.push(ws);
    }

    mkdirSync(opts.outDir, { recursive: true });
    const placematsPath = join(opts.outDir, 'placemats.html');
    const answerKeyPath = join(opts.outDir, 'answer_key.html');
    writeFileSync(placematsPath, buildPlacematsHTML({ mazes, wordSearches, displayWords, logoSvg }));
    writeFileSync(answerKeyPath, buildAnswerKeyHTML({ mazes, wordSearches, logoSvg }));

    console.log(`Generated ${opts.count} placemats in ${placematsPath}`);
    console.log(`Generated answer key in ${answerKeyPath}`);
    console.log(`Total pages: ${opts.count * 2}`);
    console.log('Open in browser and print with duplex/double-sided enabled');
}

main();

// ── Minesweeper page controller ─────────────────────────────
//
// Daily-seeded static hex minesweeper: every clue is visible from the
// start, and tapping an unknown cell cycles unknown -> mine flag ->
// safe mark -> unknown. Win by flagging exactly the mines. Type
// solution() in the console for the cheat overlay.

import { createPRNG, dateSeed } from '../core/prng.js';
import { generateMinesweeper } from '../core/minesweeper.js';
import { axialToPixel, hexCorners, hexDistance } from '../core/hex-cell-grid.js';
import { createBoard, initialMarks, cycleMark, flaggedCount, isWin, validateMarks, MARK } from './minesweeper.logic.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 34;
const RADIUS = 3;
const MINES = 10;
const STORAGE_KEY = 'minesweeper-state';

export const Minesweeper = {
    puzzle: null,
    board: null,
    marks: new Map(),
    dateKey: '',

    svg: null,
    cellElements: new Map(),
    markElements: new Map(),   // key -> <g> holding the mine/safe glyphs
    solutionGroup: null,
    logoElement: null,
    _winTimers: [],

    init() {
        const today = new Date();
        this.dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        this.puzzle = generateMinesweeper({ radius: RADIUS, mineCount: MINES, prng: createPRNG(dateSeed(today)) });
        this.board = createBoard(this.puzzle);
        this.marks = this._restore() || initialMarks();

        this._buildBoard();
        this.svg.addEventListener('pointerdown', (e) => {
            const key = e.target.dataset && e.target.dataset.key;
            if (key) {
                this._apply(cycleMark(this.board, this.marks, key));
                e.preventDefault();
            }
        });
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.marks = initialMarks();
            this._save();
            this.render();
        });
        this.render();

        window.solution = () => this.toggleSolution();
    },

    // ── Board construction ──────────────────────────────────

    _center(q, r) {
        const p = axialToPixel(q, r, CELL_SIZE);
        return { x: this._ox + p.x, y: this._oy + p.y };
    },

    _buildBoard() {
        const extent = (RADIUS + 1) * 2 * CELL_SIZE;
        const width = extent * Math.sqrt(3);
        const height = extent * 1.74;
        this._ox = width / 2;
        this._oy = height / 2;

        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        svg.id = 'minesweeper-board';

        const fontSize = Math.round(CELL_SIZE * 0.62);

        for (const { q, r } of this.puzzle.cells) {
            const key = `${q},${r}`;
            const { x, y } = this._center(q, r);
            const isClue = this.board.clueByKey.has(key);

            const poly = document.createElementNS(NS, 'polygon');
            poly.setAttribute('points', hexCorners(x, y, CELL_SIZE).map(([px, py]) => `${px},${py}`).join(' '));
            poly.setAttribute('class', `cell${isClue ? ' clue' : ' unknown'}`);
            poly.dataset.key = key;
            svg.appendChild(poly);
            this.cellElements.set(key, poly);

            if (isClue) {
                const text = document.createElementNS(NS, 'text');
                text.setAttribute('x', x);
                text.setAttribute('y', y + fontSize * 0.36);
                text.setAttribute('text-anchor', 'middle');
                text.setAttribute('font-size', fontSize);
                text.setAttribute('class', 'num clue-num');
                text.textContent = this.board.clueByKey.get(key);
                svg.appendChild(text);
            } else {
                // Mark glyphs: a small hex (mine) and a dot (safe), toggled
                // via classes so taps don't rebuild DOM
                const g = document.createElementNS(NS, 'g');
                g.setAttribute('class', 'mark');
                const mine = document.createElementNS(NS, 'polygon');
                mine.setAttribute('points',
                    hexCorners(x, y, CELL_SIZE * 0.42).map(([px, py]) => `${px},${py}`).join(' '));
                mine.setAttribute('class', 'mine-flag');
                const dot = document.createElementNS(NS, 'circle');
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
                dot.setAttribute('r', CELL_SIZE * 0.1);
                dot.setAttribute('class', 'safe-mark');
                g.appendChild(mine);
                g.appendChild(dot);
                svg.appendChild(g);
                this.markElements.set(key, g);
            }
        }

        // Center hole + flush logo
        const hole = this._center(0, 0);
        const holePoly = document.createElementNS(NS, 'polygon');
        holePoly.setAttribute('points', hexCorners(hole.x, hole.y, CELL_SIZE).map(([px, py]) => `${px},${py}`).join(' '));
        holePoly.setAttribute('class', 'hole');
        svg.appendChild(holePoly);
        this._embedLogo(svg, hole);

        document.getElementById('board-container').appendChild(svg);
        this.svg = svg;
    },

    async _embedLogo(svg, hole) {
        try {
            const resp = await fetch('../assets/valkey-logo-aligned.svg');
            if (!resp.ok) return;
            const doc = new DOMParser().parseFromString(await resp.text(), 'image/svg+xml');
            const path = doc.querySelector('path');
            const vb = (doc.documentElement.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
            if (!path || vb.length !== 4) return;
            const scale = (CELL_SIZE * 2) / vb[3];
            const el = document.createElementNS(NS, 'path');
            el.setAttribute('d', path.getAttribute('d'));
            el.setAttribute('class', 'logo');
            el.setAttribute('transform',
                `translate(${hole.x - (vb[0] + vb[2] / 2) * scale},${hole.y - (vb[1] + vb[3] / 2) * scale}) scale(${scale})`);
            svg.appendChild(el);
            this.logoElement = el;
        } catch { /* decorative */ }
    },

    // ── State + rendering ───────────────────────────────────

    _apply(result) {
        if (!result.changed) return;
        this.marks = result.marks;
        this._save();
        this.render();
        if (isWin(this.board, this.marks)) this._celebrate();
    },

    render() {
        for (const [key, g] of this.markElements) {
            const mark = this.marks.get(key);
            g.classList.toggle('is-mine', mark === MARK.MINE);
            g.classList.toggle('is-safe', mark === MARK.SAFE);
        }

        document.getElementById('mine-counter').textContent =
            `⬢ ${flaggedCount(this.marks)} / ${this.board.mineCount} flagged`;

        const won = isWin(this.board, this.marks);
        if (!won && this.svg) this._clearWinWave();
        document.getElementById('win-banner').classList.toggle('hidden', !won);
    },

    _celebrate() {
        // Radial ripple from the logo outward
        this._clearWinWave();
        const ordered = [...this.cellElements.keys()].sort((a, b) => {
            const [aq, ar] = a.split(',').map(Number);
            const [bq, br] = b.split(',').map(Number);
            return hexDistance(aq, ar) - hexDistance(bq, br);
        });
        ordered.forEach((key, i) => {
            this._winTimers.push(setTimeout(() => {
                this.cellElements.get(key).classList.add('win-lit');
                const g = this.markElements.get(key);
                if (g) g.classList.add('win-lit');
            }, i * 30));
        });
        if (this.logoElement) {
            this._winTimers.push(setTimeout(() => {
                this.logoElement.classList.add('win-lit');
            }, ordered.length * 30));
        }
    },

    _clearWinWave() {
        for (const t of this._winTimers) clearTimeout(t);
        this._winTimers = [];
        for (const el of this.svg.querySelectorAll('.win-lit')) {
            el.classList.remove('win-lit');
        }
    },

    // ── Solution overlay (console cheat) ────────────────────

    toggleSolution() {
        if (this.solutionGroup) {
            this.solutionGroup.remove();
            this.solutionGroup = null;
            return false;
        }
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'solution-overlay');
        for (const [q, r] of this.puzzle.solutionMines) {
            const { x, y } = this._center(q, r);
            const mine = document.createElementNS(NS, 'polygon');
            mine.setAttribute('points',
                hexCorners(x, y, CELL_SIZE * 0.5).map(([px, py]) => `${px},${py}`).join(' '));
            g.appendChild(mine);
        }
        this.svg.appendChild(g);
        this.solutionGroup = g;
        return true;
    },

    // ── Persistence ─────────────────────────────────────────

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                dateKey: this.dateKey,
                marks: Object.fromEntries(this.marks),
            }));
        } catch { /* play without saving */ }
    },

    _restore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (saved.dateKey !== this.dateKey) return null;
            return validateMarks(this.board, saved.marks);
        } catch {
            return null;
        }
    },
};

Minesweeper.init();

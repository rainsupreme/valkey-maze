// ── Signposts page controller ───────────────────────────────
//
// Daily-seeded hex Signposts. Tap cells to build the sequence: from
// the current number, any highlighted cell along its arrow is a valid
// next step. Tap a placed cell to rewind. Type solution() in the
// console for the cheat overlay.

import { createPRNG, dateSeed } from '../core/prng.js';
import { generateSignposts } from '../core/signposts.js';
import { axialToPixel, hexCorners } from '../core/hex-cell-grid.js';
import { directionAngle } from '../core/render/signposts-svg.js';
import { createBoard, initialPath, candidates, applyCell, isWin } from './signposts.logic.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 34;
const RADIUS = 3;
const STORAGE_KEY = 'signposts-state';

export const Signposts = {
    puzzle: null,
    board: null,
    path: [],
    dateKey: '',

    svg: null,
    cellElements: new Map(),
    numberElements: new Map(),
    pathLine: null,
    solutionLine: null,
    logoElement: null,
    _winTimers: [],

    init() {
        const today = new Date();
        this.dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        this.puzzle = generateSignposts({ radius: RADIUS, prng: createPRNG(dateSeed(today)) });
        this.board = createBoard(this.puzzle);
        this.path = this._restore() || initialPath(this.board);

        this._buildBoard();
        this.svg.addEventListener('pointerdown', (e) => {
            const key = e.target.dataset && e.target.dataset.key;
            if (key) {
                this._apply(applyCell(this.board, this.path, key));
                e.preventDefault();
            }
        });
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.path = initialPath(this.board);
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
        svg.id = 'signposts-board';

        const fontSize = Math.round(CELL_SIZE * 0.5);

        for (const { q, r } of this.puzzle.cells) {
            const key = `${q},${r}`;
            const { x, y } = this._center(q, r);
            const isClue = this.board.clueByKey.has(key);

            const poly = document.createElementNS(NS, 'polygon');
            poly.setAttribute('points', hexCorners(x, y, CELL_SIZE).map(([px, py]) => `${px},${py}`).join(' '));
            poly.setAttribute('class', `cell${isClue ? ' clue' : ''}`);
            poly.dataset.key = key;
            svg.appendChild(poly);
            this.cellElements.set(key, poly);

            // Arrow (or goal marker), lower half of the cell
            const dir = this.board.arrowByKey.get(key);
            const glyphY = y + CELL_SIZE * 0.33;
            if (dir === null || dir === undefined) {
                const goal = document.createElementNS(NS, 'polygon');
                goal.setAttribute('points',
                    hexCorners(x, glyphY, CELL_SIZE * 0.2).map(([px, py]) => `${px},${py}`).join(' '));
                goal.setAttribute('class', 'goal-marker');
                svg.appendChild(goal);
            } else {
                const a = CELL_SIZE * 0.34;
                const arrow = document.createElementNS(NS, 'path');
                arrow.setAttribute('d',
                    `M ${-a} ${-a * 0.45} L ${a * 0.15} ${-a * 0.45} L ${a * 0.15} ${-a * 0.85}` +
                    ` L ${a} 0 L ${a * 0.15} ${a * 0.85} L ${a * 0.15} ${a * 0.45} L ${-a} ${a * 0.45} Z`);
                arrow.setAttribute('class', 'arrow');
                arrow.setAttribute('transform', `translate(${x},${glyphY}) rotate(${directionAngle(dir)})`);
                svg.appendChild(arrow);
            }

            const text = document.createElementNS(NS, 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y - CELL_SIZE * 0.22 + fontSize * 0.36);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', fontSize);
            text.setAttribute('class', `num${isClue ? ' clue-num' : ''}`);
            if (isClue) text.textContent = this.board.clueByKey.get(key);
            svg.appendChild(text);
            this.numberElements.set(key, text);
        }

        // Center hole + flush logo
        const hole = this._center(0, 0);
        const holePoly = document.createElementNS(NS, 'polygon');
        holePoly.setAttribute('points', hexCorners(hole.x, hole.y, CELL_SIZE).map(([px, py]) => `${px},${py}`).join(' '));
        holePoly.setAttribute('class', 'hole');
        svg.appendChild(holePoly);
        this._embedLogo(svg, hole);

        this.pathLine = document.createElementNS(NS, 'polyline');
        this.pathLine.setAttribute('class', 'path-line');
        this.pathLine.setAttribute('fill', 'none');
        svg.appendChild(this.pathLine);

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
        this.path = result.path;
        this._save();
        this.render();
        if (isWin(this.board, this.path)) this._celebrate();
    },

    render() {
        const numberByKey = new Map(this.path.map((key, i) => [key, i + 1]));
        const nextCells = new Set(candidates(this.board, this.path));
        const end = this.path[this.path.length - 1];

        for (const [key, text] of this.numberElements) {
            if (this.board.clueByKey.has(key)) continue;
            text.textContent = numberByKey.has(key) ? numberByKey.get(key) : '';
        }
        for (const [key, poly] of this.cellElements) {
            poly.classList.toggle('on-path', numberByKey.has(key));
            poly.classList.toggle('path-end', key === end);
            poly.classList.toggle('candidate', nextCells.has(key));
        }

        this.pathLine.setAttribute('points', this.path.map(key => {
            const [q, r] = key.split(',').map(Number);
            const { x, y } = this._center(q, r);
            return `${x},${y}`;
        }).join(' '));

        const won = isWin(this.board, this.path);
        if (!won && this.svg) this._clearWinWave();
        document.getElementById('win-banner').classList.toggle('hidden', !won);
    },

    _celebrate() {
        this._clearWinWave();
        this.path.forEach((key, i) => {
            this._winTimers.push(setTimeout(() => {
                this.cellElements.get(key).classList.add('win-lit');
                this.numberElements.get(key).classList.add('win-lit');
            }, i * 45));
        });
        if (this.logoElement) {
            this._winTimers.push(setTimeout(() => {
                this.logoElement.classList.add('win-lit');
            }, this.path.length * 45));
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
        if (this.solutionLine) {
            this.solutionLine.remove();
            this.solutionLine = null;
            return false;
        }
        const line = document.createElementNS(NS, 'polyline');
        line.setAttribute('class', 'solution-overlay');
        line.setAttribute('fill', 'none');
        line.setAttribute('points', this.puzzle.solutionPath.map(([q, r]) => {
            const { x, y } = this._center(q, r);
            return `${x},${y}`;
        }).join(' '));
        this.svg.appendChild(line);
        this.solutionLine = line;
        return true;
    },

    // ── Persistence ─────────────────────────────────────────

    _save() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateKey: this.dateKey, path: this.path }));
        } catch { /* play without saving */ }
    },

    _restore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (saved.dateKey !== this.dateKey) return null;
            if (!Array.isArray(saved.path) || saved.path[0] !== this.board.startKey) return null;
            let path = initialPath(this.board);
            for (const key of saved.path.slice(1)) {
                const result = applyCell(this.board, path, key);
                if (!result.changed) return null;
                path = result.path;
            }
            return path;
        } catch {
            return null;
        }
    },
};

Signposts.init();

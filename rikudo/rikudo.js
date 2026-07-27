// ── Rikudo page controller ──────────────────────────────────
//
// Daily-seeded Rikudo with path-drawing interaction: drag (or tap)
// from 1 to extend the number path; drag backwards or tap a path
// cell to undo. Type solution() in the console for the cheat overlay.

import { createPRNG, dateSeed } from '../core/prng.js';
import { generateRikudo } from '../core/rikudo.js';
import { axialToPixel, hexCorners } from '../core/hex-cell-grid.js';
import { createBoard, initialPath, applyCell, applyDrag, isWin } from './rikudo.logic.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 34;
const RADIUS = 3;
const STORAGE_KEY = 'rikudo-state';

function readTheme() {
    const style = getComputedStyle(document.documentElement);
    const get = (prop, fallback) => style.getPropertyValue(prop).trim() || fallback;
    return {
        accent: get('--color-maze', '#6983ff'),
        danger: get('--color-danger', '#ff9b29'),
        bg: get('--color-bg', '#000000'),
        cell: get('--rikudo-cell', '#14141c'),
        clueCell: get('--rikudo-clue-cell', '#2a2a3a'),
        text: get('--color-player', '#ffffff'),
    };
}

export const Rikudo = {
    puzzle: null,
    board: null,
    path: [],
    dateKey: '',

    svg: null,
    cellElements: new Map(),   // key -> polygon
    numberElements: new Map(), // key -> text
    pathLine: null,
    solutionLine: null,
    theme: null,
    _dragging: false,

    init() {
        this.theme = readTheme();
        const today = new Date();
        this.dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        this.puzzle = generateRikudo({ radius: RADIUS, prng: createPRNG(dateSeed(today)) });
        this.board = createBoard(this.puzzle);
        this.path = this._restore() || initialPath(this.board);

        this._buildBoard();
        this._bindPointer();
        this._bindControls();
        this.render();

        // Console cheat, mirroring the maze page
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
        svg.id = 'rikudo-board';

        const fontSize = Math.round(CELL_SIZE * 0.62);

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

            const text = document.createElementNS(NS, 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y + fontSize * 0.36);
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

        // Player path polyline (above cells, below numbers is fine)
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

            const scale = (CELL_SIZE * 2) / vb[3]; // flush: logo viewBox is a pointy-top hex
            const logoCx = vb[0] + vb[2] / 2;
            const logoCy = vb[1] + vb[3] / 2;
            const el = document.createElementNS(NS, 'path');
            el.setAttribute('d', path.getAttribute('d'));
            el.setAttribute('class', 'logo');
            el.setAttribute('transform',
                `translate(${hole.x - logoCx * scale},${hole.y - logoCy * scale}) scale(${scale})`);
            svg.appendChild(el);
        } catch {
            // Logo is decorative; play on without it
        }
    },

    // ── Interaction ─────────────────────────────────────────

    _cellKeyAt(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        return el && el.dataset ? el.dataset.key || null : null;
    },

    _bindPointer() {
        this.svg.addEventListener('pointerdown', (e) => {
            const key = e.target.dataset && e.target.dataset.key;
            if (!key) return;
            this._dragging = true;
            this._apply(applyCell(this.board, this.path, key));
            e.preventDefault();
        });
        this.svg.addEventListener('pointermove', (e) => {
            if (!this._dragging) return;
            const key = this._cellKeyAt(e.clientX, e.clientY);
            if (key) this._apply(applyDrag(this.board, this.path, key));
            e.preventDefault();
        });
        const stop = () => { this._dragging = false; };
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    },

    _bindControls() {
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.path = initialPath(this.board);
            this._save();
            this.render();
        });
    },

    _apply(result) {
        if (!result.changed) return;
        this.path = result.path;
        this._save();
        this.render();
        if (isWin(this.board, this.path)) this._celebrate();
    },

    // ── Rendering ───────────────────────────────────────────

    render() {
        const numberByKey = new Map(this.path.map((key, i) => [key, i + 1]));

        for (const [key, text] of this.numberElements) {
            if (this.board.clueByKey.has(key)) continue; // clues always shown
            text.textContent = numberByKey.has(key) ? numberByKey.get(key) : '';
        }
        for (const [key, poly] of this.cellElements) {
            poly.classList.toggle('on-path', numberByKey.has(key));
            poly.classList.toggle('path-end', key === this.path[this.path.length - 1]);
        }

        const points = this.path.map(key => {
            const [q, r] = key.split(',').map(Number);
            const { x, y } = this._center(q, r);
            return `${x},${y}`;
        });
        this.pathLine.setAttribute('points', points.join(' '));

        const banner = document.getElementById('win-banner');
        banner.classList.toggle('hidden', !isWin(this.board, this.path));
    },

    _celebrate() {
        this.svg.classList.add('solved');
        setTimeout(() => this.svg.classList.remove('solved'), 1600);
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
        } catch { /* storage unavailable: play without saving */ }
    },

    _restore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (saved.dateKey !== this.dateKey) return null;
            if (!Array.isArray(saved.path) || saved.path[0] !== this.board.startKey) return null;
            // Replay through the logic layer so a stale/corrupt path can't
            // put the board in an invalid state
            let path = initialPath(this.board);
            for (const key of saved.path.slice(1)) {
                const result = applyDrag(this.board, path, key);
                if (!result.changed) return null;
                path = result.path;
            }
            return path;
        } catch {
            return null;
        }
    },
};

Rikudo.init();

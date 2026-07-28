// ── Signposts page controller ───────────────────────────────
//
// Daily-seeded hex Signposts, link-based play: tap a cell to select
// it (legal targets along its arrow glow), tap a target to connect.
// Chains not yet joined to a numbered clue show relative labels
// (a, a+1, ...). Tap a cell's current target again to disconnect.
// Type solution() in the console for the cheat overlay.

import { createPRNG, dateSeed } from '../core/prng.js';
import { generateSignposts } from '../core/signposts.js';
import { axialToPixel, hexCorners } from '../core/hex-cell-grid.js';
import { directionAngle } from '../core/render/signposts-svg.js';
import {
    createBoard, initialLinks, numbering, candidates,
    applyLink, removeLink, isWin, winOrder,
} from './signposts.logic.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 34;
const STORAGE_KEY = 'signposts-state';

export const DIFFICULTIES = {
    easy: { radius: 2, cornerEndpoints: true },
    medium: { radius: 3, cornerEndpoints: true },
    hard: { radius: 3, cornerEndpoints: false },
};
const DEFAULT_DIFFICULTY = 'easy';

export const Signposts = {
    puzzle: null,
    board: null,
    links: null,
    selected: null,
    dateKey: '',
    difficulty: DEFAULT_DIFFICULTY,

    svg: null,
    cellElements: new Map(),
    numberElements: new Map(),
    arrowElements: new Map(),
    dotElements: new Map(),
    solutionLine: null,
    logoElement: null,
    _winTimers: [],

    init() {
        const today = new Date();
        this.dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        this.difficulty = this._restoreDifficulty();
        this._setupPuzzle();

        document.getElementById('reset-btn').addEventListener('click', () => {
            this.links = initialLinks();
            this.selected = null;
            this._save();
            this.render();
        });
        document.getElementById('difficulty-row').addEventListener('click', (e) => {
            const d = e.target.dataset && e.target.dataset.difficulty;
            if (d && d !== this.difficulty) this.setDifficulty(d);
        });

        window.solution = () => this.toggleSolution();
    },

    /** (Re)generate the current difficulty's daily puzzle and board. */
    _setupPuzzle() {
        const today = new Date();
        this.puzzle = generateSignposts({
            ...DIFFICULTIES[this.difficulty],
            prng: createPRNG(dateSeed(today)),
        });
        this.board = createBoard(this.puzzle);
        this.links = this._restore() || initialLinks();
        this.selected = null;

        if (this.svg) {
            this._clearWinWave();
            this.svg.remove();
            this.solutionLine = null;
            this.logoElement = null;
            this.cellElements.clear();
            this.numberElements.clear();
            this.arrowElements.clear();
            this.dotElements.clear();
        }
        this._buildBoard();
        this.svg.addEventListener('pointerdown', (e) => {
            const key = e.target.dataset && e.target.dataset.key;
            this._tap(key || null);
            if (key) e.preventDefault();
        });

        for (const btn of document.querySelectorAll('#difficulty-row button')) {
            btn.classList.toggle('active', btn.dataset.difficulty === this.difficulty);
        }
        this.render();
    },

    setDifficulty(difficulty) {
        if (!DIFFICULTIES[difficulty]) return;
        this.difficulty = difficulty;
        try { localStorage.setItem(`${STORAGE_KEY}-difficulty`, difficulty); } catch { /* ok */ }
        this._setupPuzzle();
    },

    _restoreDifficulty() {
        try {
            const d = localStorage.getItem(`${STORAGE_KEY}-difficulty`);
            return DIFFICULTIES[d] ? d : DEFAULT_DIFFICULTY;
        } catch {
            return DEFAULT_DIFFICULTY;
        }
    },

    // ── Interaction ─────────────────────────────────────────

    _tap(key) {
        if (!key) { this._select(null); return; }

        if (this.selected && this.selected !== key) {
            // Tap on the selected cell's current target -> disconnect
            if (this.links.get(this.selected) === key) {
                const result = removeLink(this.links, this.selected);
                this._apply(result);
                this._select(key); // keep flow going from the tapped cell
                return;
            }
            // Tap on a legal target -> connect, selection follows
            const result = applyLink(this.board, this.links, this.selected, key);
            if (result.changed) {
                this._apply(result);
                this._select(key);
                return;
            }
        }
        // Otherwise (re)select the tapped cell
        this._select(this.selected === key ? null : key);
    },

    _select(key) {
        this.selected = key;
        this.render();
    },

    _apply(result) {
        if (!result.changed) return;
        this.links = result.links;
        this._save();
        this.render();
        if (isWin(this.board, this.links)) this._celebrate();
    },

    // ── Board construction ──────────────────────────────────

    _center(q, r) {
        const p = axialToPixel(q, r, CELL_SIZE);
        return { x: this._ox + p.x, y: this._oy + p.y };
    },

    _buildBoard() {
        const extent = (this.puzzle.radius + 1) * 2 * CELL_SIZE;
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

            // Arrow (or goal marker), centered in the cell; the
            // number/label renders in a small badge above it
            const dir = this.board.arrowByKey.get(key);
            if (dir === null || dir === undefined) {
                const goal = document.createElementNS(NS, 'polygon');
                goal.setAttribute('points',
                    hexCorners(x, y, CELL_SIZE * 0.24).map(([px, py]) => `${px},${py}`).join(' '));
                goal.setAttribute('class', 'goal-marker');
                svg.appendChild(goal);
            } else {
                const a = CELL_SIZE * 0.34;
                const arrow = document.createElementNS(NS, 'path');
                arrow.setAttribute('d',
                    `M ${-a} ${-a * 0.45} L ${a * 0.15} ${-a * 0.45} L ${a * 0.15} ${-a * 0.85}` +
                    ` L ${a} 0 L ${a * 0.15} ${a * 0.85} L ${a * 0.15} ${a * 0.45} L ${-a} ${a * 0.45} Z`);
                arrow.setAttribute('class', 'arrow');
                arrow.setAttribute('transform', `translate(${x},${y}) rotate(${directionAngle(dir)})`);
                svg.appendChild(arrow);
                this.arrowElements.set(key, arrow);
            }

            // Incoming indicator: a small hexagon dot shown while
            // nothing points to this cell (never on the 1-cell --
            // nothing ever points to it)
            if (key !== this.board.startKey) {
                const dot = document.createElementNS(NS, 'polygon');
                dot.setAttribute('points',
                    hexCorners(x, y + CELL_SIZE * 0.52, CELL_SIZE * 0.11)
                        .map(([px, py]) => `${px},${py}`).join(' '));
                dot.setAttribute('class', 'incoming-dot');
                svg.appendChild(dot);
                this.dotElements.set(key, dot);
            }

            const text = document.createElementNS(NS, 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y - CELL_SIZE * 0.42 + fontSize * 0.36);
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

    // ── Rendering ───────────────────────────────────────────

    render() {
        const { numberByKey, labelByKey } = numbering(this.board, this.links);
        const incoming = new Set(this.links.values());
        const targets = this.selected
            ? new Set(candidates(this.board, this.links, this.selected))
            : new Set();
        const currentTarget = this.selected ? this.links.get(this.selected) : undefined;

        const FRAG_COLORS = 6;
        for (const [key, text] of this.numberElements) {
            if (this.board.clueByKey.has(key)) continue;
            text.textContent = numberByKey.has(key) ? numberByKey.get(key)
                : labelByKey.has(key) ? labelByKey.get(key) : '';
            text.classList.toggle('relative-label', labelByKey.has(key));
            // Gentle per-fragment color, derived from the fragment letter
            for (let i = 0; i < FRAG_COLORS; i++) text.classList.remove(`frag-c${i}`);
            if (labelByKey.has(key)) {
                const letter = labelByKey.get(key).charCodeAt(0) - 97;
                text.classList.add(`frag-c${letter % FRAG_COLORS}`);
            }
        }
        for (const [key, poly] of this.cellElements) {
            poly.classList.toggle('linked', this.links.has(key) || incoming.has(key));
            poly.classList.toggle('selected', key === this.selected);
            poly.classList.toggle('candidate', targets.has(key));
            poly.classList.toggle('unlink-target', key === currentTarget);
        }
        // A used-up arrow dims; the dot shows while nothing points here
        for (const [key, arrow] of this.arrowElements) {
            arrow.classList.toggle('used', this.links.has(key));
        }
        for (const [key, dot] of this.dotElements) {
            dot.classList.toggle('hidden', incoming.has(key));
        }

        const won = isWin(this.board, this.links);
        if (!won && this.svg) this._clearWinWave();
        document.getElementById('win-banner').classList.toggle('hidden', !won);
    },

    _celebrate() {
        this._clearWinWave();
        const order = winOrder(this.board, this.links);
        order.forEach((key, i) => {
            this._winTimers.push(setTimeout(() => {
                this.cellElements.get(key).classList.add('win-lit');
                this.numberElements.get(key).classList.add('win-lit');
            }, i * 45));
        });
        if (this.logoElement) {
            this._winTimers.push(setTimeout(() => {
                this.logoElement.classList.add('win-lit');
            }, order.length * 45));
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
            localStorage.setItem(`${STORAGE_KEY}-${this.difficulty}`, JSON.stringify({
                dateKey: this.dateKey,
                links: [...this.links],
            }));
        } catch { /* play without saving */ }
    },

    _restore() {
        try {
            const raw = localStorage.getItem(`${STORAGE_KEY}-${this.difficulty}`);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (saved.dateKey !== this.dateKey) return null;
            if (!Array.isArray(saved.links)) return null;
            // Replay through the validator so a stale/corrupt save
            // can never produce an illegal board
            let links = initialLinks();
            for (const pair of saved.links) {
                if (!Array.isArray(pair) || pair.length !== 2) return null;
                const result = applyLink(this.board, links, pair[0], pair[1]);
                if (!result.changed) return null;
                links = result.links;
            }
            return links;
        } catch {
            return null;
        }
    },
};

Signposts.init();

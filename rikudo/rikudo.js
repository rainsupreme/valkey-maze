// ── Rikudo page controller ──────────────────────────────────
//
// Daily-seeded Rikudo with edge-drawing interaction: drag across
// adjacent cells to connect them -- anywhere on the board, in any
// order. Fragments show numbers once the clues force them. Tap a
// drawn segment to erase it. Type solution() in the console for the
// cheat overlay.

import { createPRNG, dateSeed } from '../core/prng.js';
import { generateRikudo } from '../core/rikudo.js';
import { axialToPixel, hexCorners } from '../core/hex-cell-grid.js';
import {
    createBoard, initialEdges, edgeId, numbering, orientedFragments,
    addEdge, removeEdge, isWin, winOrder,
} from './rikudo.logic.js';

const NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 34;
const RADIUS = 3;
const STORAGE_KEY = 'rikudo-state';

export const Rikudo = {
    puzzle: null,
    board: null,
    edges: null,
    dateKey: '',

    svg: null,
    cellElements: new Map(),   // key -> polygon
    numberElements: new Map(), // key -> text
    edgeElements: new Map(),   // edgeId -> line group
    edgeLayer: null,
    solutionLine: null,
    logoElement: null,
    _dragging: false,
    _dragKey: null,
    _winTimers: [],

    init() {
        const today = new Date();
        this.dateKey = `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`;
        this.puzzle = generateRikudo({ radius: RADIUS, prng: createPRNG(dateSeed(today)) });
        this.board = createBoard(this.puzzle);
        this.edges = this._restore() || initialEdges();

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

    _centerOf(key) {
        const [q, r] = key.split(',').map(Number);
        return this._center(q, r);
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

        // Edge layer sits above cells, below numbers
        this.edgeLayer = document.createElementNS(NS, 'g');
        this.edgeLayer.setAttribute('class', 'edge-layer');
        svg.appendChild(this.edgeLayer);

        // Arrowheads marking the ascending end of determined fragments
        this.arrowLayer = document.createElementNS(NS, 'g');
        this.arrowLayer.setAttribute('class', 'arrow-layer');
        svg.appendChild(this.arrowLayer);

        document.getElementById('board-container').appendChild(svg);
        this.svg = svg;

        // Numbers must render above the edge lines
        for (const text of this.numberElements.values()) svg.appendChild(text);
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
            this.logoElement = el;
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
            const edge = e.target.dataset && e.target.dataset.edge;
            if (edge) {
                // Tap a drawn segment -> erase it
                this._apply(removeEdge(this.edges, edge));
                e.preventDefault();
                return;
            }
            const key = e.target.dataset && e.target.dataset.key;
            if (!key) return;
            this._dragging = true;
            this._dragKey = key;
            e.preventDefault();
        });
        this.svg.addEventListener('pointermove', (e) => {
            if (!this._dragging) return;
            const key = this._cellKeyAt(e.clientX, e.clientY);
            if (key && key !== this._dragKey) {
                const result = addEdge(this.board, this.edges, this._dragKey, key);
                if (result.changed) this._apply(result);
                // Follow the pointer even when the edge was refused,
                // so drawing can continue from wherever the finger is
                this._dragKey = key;
            }
            e.preventDefault();
        });
        const stop = () => { this._dragging = false; this._dragKey = null; };
        window.addEventListener('pointerup', stop);
        window.addEventListener('pointercancel', stop);
    },

    _bindControls() {
        document.getElementById('reset-btn').addEventListener('click', () => {
            this.edges = initialEdges();
            this._save();
            this.render();
        });
    },

    _apply(result) {
        if (!result.changed) return;
        this.edges = result.edges;
        this._save();
        this.render();
        if (isWin(this.board, this.edges)) this._celebrate();
    },

    // ── Rendering ───────────────────────────────────────────

    render() {
        const numberByKey = numbering(this.board, this.edges);
        const touched = new Set();
        for (const id of this.edges) {
            const [a, b] = id.split('|');
            touched.add(a);
            touched.add(b);
        }

        for (const [key, text] of this.numberElements) {
            if (this.board.clueByKey.has(key)) continue; // clues always shown
            text.textContent = numberByKey.has(key) ? numberByKey.get(key) : '';
        }
        for (const [key, poly] of this.cellElements) {
            poly.classList.toggle('on-path', touched.has(key));
        }

        // Edge lines: one group (visible line + fat hit line) per edge
        for (const [id, el] of this.edgeElements) {
            if (!this.edges.has(id)) {
                el.remove();
                this.edgeElements.delete(id);
            }
        }
        for (const id of this.edges) {
            if (this.edgeElements.has(id)) continue;
            const [a, b] = id.split('|');
            const pa = this._centerOf(a);
            const pb = this._centerOf(b);
            const group = document.createElementNS(NS, 'g');
            const mk = (cls) => {
                const line = document.createElementNS(NS, 'line');
                line.setAttribute('x1', pa.x); line.setAttribute('y1', pa.y);
                line.setAttribute('x2', pb.x); line.setAttribute('y2', pb.y);
                line.setAttribute('class', cls);
                line.dataset.edge = id;
                group.appendChild(line);
            };
            mk('edge-line');
            mk('edge-hit');
            this.edgeLayer.appendChild(group);
            this.edgeElements.set(id, group);
        }

        const won = isWin(this.board, this.edges);
        if (!won && this.svg) this._clearWinWave();
        document.getElementById('win-banner').classList.toggle('hidden', !won);

        this._renderArrowheads(won);
    },

    /**
     * An arrowhead marks the ascending end of every fragment whose
     * direction the clues have pinned down; ambiguous fragments get
     * none (their direction is genuinely unknown). Hidden on a win --
     * the wave takes over.
     */
    _renderArrowheads(won) {
        while (this.arrowLayer.firstChild) this.arrowLayer.firstChild.remove();
        if (won) return;
        for (const { chain, determined } of orientedFragments(this.board, this.edges)) {
            if (!determined || chain.length < 2) continue;
            const tip = this._centerOf(chain[chain.length - 1]);
            const prev = this._centerOf(chain[chain.length - 2]);
            const dx = tip.x - prev.x;
            const dy = tip.y - prev.y;
            const len = Math.hypot(dx, dy) || 1;
            const ux = dx / len;
            const uy = dy / len;
            // Sits past the number badge, inside the end cell
            const px = tip.x + ux * CELL_SIZE * 0.62;
            const py = tip.y + uy * CELL_SIZE * 0.62;
            const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
            const s = CELL_SIZE * 0.24;
            const head = document.createElementNS(NS, 'path');
            head.setAttribute('d', `M ${-s * 0.7} ${-s} L ${s} 0 L ${-s * 0.7} ${s} Z`);
            head.setAttribute('class', 'frag-arrow');
            head.setAttribute('transform', `translate(${px},${py}) rotate(${angle})`);
            this.arrowLayer.appendChild(head);
        }
    },

    _celebrate() {
        // Light the path up in periwinkle, cell by cell, 1 -> N
        this._clearWinWave();
        const order = winOrder(this.board, this.edges);
        order.forEach((key, i) => {
            this._winTimers.push(setTimeout(() => {
                this.cellElements.get(key).classList.add('win-lit');
                this.numberElements.get(key).classList.add('win-lit');
            }, i * 45));
        });
        // Finale: the logo flips white so it stays readable in a sea
        // of periwinkle
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
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                dateKey: this.dateKey,
                edges: [...this.edges],
            }));
        } catch { /* storage unavailable: play without saving */ }
    },

    _restore() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return null;
            const saved = JSON.parse(raw);
            if (saved.dateKey !== this.dateKey) return null;
            if (!Array.isArray(saved.edges)) return null;
            // Replay through the validator so a stale/corrupt save can
            // never produce an illegal board
            let edges = initialEdges();
            for (const id of saved.edges) {
                if (typeof id !== 'string') return null;
                const [a, b] = id.split('|');
                const result = addEdge(this.board, edges, a, b);
                if (!result.changed) return null;
                edges = result.edges;
            }
            return edges;
        } catch {
            return null;
        }
    },
};

Rikudo.init();

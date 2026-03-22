// ── Theme Colors ────────────────────────────────────────────
const THEME = {
    player: '#ffffff',    // bright copper/orange — player marker & trail
    maze:   '#6983ff',    // vivid periwinkle — walls & logo
    bg:     '#000000',    // black — SVG background
};

// ── Trail Dash Configuration ────────────────────────────────
// All dash-related values derive from these two numbers.
const TRAIL = {
    dash: 9,              // visible dash length (SVG units)
    gap: 40,              // gap between dashes (SVG units)
    get cycle() { return this.dash + this.gap; },   // total cycle length
    normalDuration: 1.5,  // seconds per cycle at normal speed
};

// ── Visual-to-Grid Direction Mapping ────────────────────────
// The SVG has a 90° CW rotation. Each visual direction maps to a different
// grid direction depending on whether the current cell is ▲ or ▽.
const VISUAL_TO_GRID = {
    'up':          { true: 'up-left',  false: 'down-left'  },
    'down':        { true: 'up-right', false: 'down-right' },
    'upper-left':  { true: 'down',     false: 'down-left'  },
    'lower-left':  { true: 'down',     false: 'down-right' },
    'upper-right': { true: 'up-left',  false: 'up'         },
    'lower-right': { true: 'up-right', false: 'up'         },
};

// ── Key Bindings ────────────────────────────────────────────
// QWEASD layout maps to 6 visual directions.
const KEY_BINDINGS = {
    'KeyW': 'up',
    'KeyS': 'down',
    'KeyQ': 'upper-left',
    'KeyE': 'upper-right',
    'KeyA': 'lower-left',
    'KeyD': 'lower-right',
};

// ── MazeData ────────────────────────────────────────────────
const MazeData = {
    rows: 0,
    cols: 0,
    cellSize: 0,
    centerHexRadius: 0,
    margin: 0,
    stretch: 0,
    cells: new Map(),       // Map<string, {row, col, upward}>
    passages: new Map(),    // Map<string, Set<string>>
    entryCell: '',          // "row,col"
    goalCells: new Set(),   // Set<string>

    async load(jsonUrl) {
        const resp = await fetch(jsonUrl);
        if (!resp.ok) {
            throw new Error(`Failed to fetch maze data: ${resp.status}`);
        }
        const data = await resp.json();

        this.rows = data.rows;
        this.cols = data.cols;
        this.cellSize = data.cellSize;
        this.centerHexRadius = data.centerHexRadius;
        this.margin = data.margin;
        this.stretch = data.stretch;

        // Build cells Map keyed by "row,col"
        this.cells = new Map();
        for (const c of data.cells) {
            const key = `${c.row},${c.col}`;
            this.cells.set(key, { row: c.row, col: c.col, upward: c.upward });
        }

        // Build passages adjacency Map (both directions)
        this.passages = new Map();
        for (const [a, b] of data.passages) {
            const keyA = `${a[0]},${a[1]}`;
            const keyB = `${b[0]},${b[1]}`;
            if (!this.passages.has(keyA)) this.passages.set(keyA, new Set());
            if (!this.passages.has(keyB)) this.passages.set(keyB, new Set());
            this.passages.get(keyA).add(keyB);
            this.passages.get(keyB).add(keyA);
        }

        // Set entryCell as "row,col" string
        this.entryCell = `${data.entryCell[0]},${data.entryCell[1]}`;

        // Build goalCells Set of "row,col" strings
        this.goalCells = new Set();
        for (const g of data.goalCells) {
            this.goalCells.add(`${g[0]},${g[1]}`);
        }
    },

    hasPassage(coordA, coordB) {
        const neighbors = this.passages.get(coordA);
        return neighbors ? neighbors.has(coordB) : false;
    },

    getPassageNeighbors(coord) {
        const neighbors = this.passages.get(coord);
        return neighbors ? Array.from(neighbors) : [];
    },

    isGoal(coord) {
        return this.goalCells.has(coord);
    },
};

// ── GameRenderer ────────────────────────────────────────────
const GameRenderer = {
    mazeData: null,
    svgContainer: null,
    svg: null,
    transformGroup: null,

    init(mazeData, svgContainer) {
        this.mazeData = mazeData;
        this.svgContainer = svgContainer;

        const cs = mazeData.cellSize;
        const margin = mazeData.margin;
        const stretch = mazeData.stretch;

        const mazeWidth = mazeData.cols * cs * 0.5 + cs * 0.5;
        const mazeHeight = mazeData.rows * cs * 0.866;
        // Width and height are swapped due to 90° rotation
        const width = mazeHeight + 2 * margin;
        const height = (mazeWidth + 2 * margin) * stretch;

        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', `0 0 ${width} ${height}`);

        // White background
        const bg = document.createElementNS(NS, 'rect');
        bg.setAttribute('x', 0);
        bg.setAttribute('y', 0);
        bg.setAttribute('width', width);
        bg.setAttribute('height', height);
        bg.setAttribute('fill', THEME.bg);
        svg.appendChild(bg);

        // Transform group matching the Python renderer
        const g = document.createElementNS(NS, 'g');
        const transform =
            `translate(${width / 2},${height / 2}) rotate(90)` +
            ` scale(${stretch},1.0)` +
            ` translate(${-(mazeWidth + 2 * margin) / 2},${-width / 2})`;
        g.setAttribute('transform', transform);
        svg.appendChild(g);

        this.svg = svg;
        this.transformGroup = g;
        svgContainer.appendChild(svg);

        // Set CSS custom properties for trail dash animation
        document.documentElement.style.setProperty('--trail-cycle-neg', `${-TRAIL.cycle}`);
        document.documentElement.style.setProperty('--trail-duration', `${TRAIL.normalDuration}s`);
    },

    drawMaze() {
        const md = this.mazeData;
        const g = this.transformGroup;
        const NS = 'http://www.w3.org/2000/svg';
        const cs = md.cellSize;
        const margin = md.margin;
        const h = cs * 0.866;
        const entryKey = md.entryCell;

        for (const [key, cell] of md.cells) {
            const { row, col, upward } = cell;
            const x = col * cs * 0.5 + margin;
            const y = row * cs * 0.866 + margin;

            let neighborCoords, edges;
            if (upward) {
                neighborCoords = [
                    `${row + 1},${col}`,
                    `${row},${col - 1}`,
                    `${row},${col + 1}`,
                ];
                edges = [
                    { x1: x, y1: y + h, x2: x + cs, y2: y + h },
                    { x1: x, y1: y + h, x2: x + cs / 2, y2: y },
                    { x1: x + cs / 2, y1: y, x2: x + cs, y2: y + h },
                ];
            } else {
                neighborCoords = [
                    `${row - 1},${col}`,
                    `${row},${col - 1}`,
                    `${row},${col + 1}`,
                ];
                edges = [
                    { x1: x, y1: y, x2: x + cs, y2: y },
                    { x1: x, y1: y, x2: x + cs / 2, y2: y + h },
                    { x1: x + cs / 2, y1: y + h, x2: x + cs, y2: y },
                ];
            }

            for (let i = 0; i < 3; i++) {
                const nKey = neighborCoords[i];
                const neighborExists = md.cells.has(nKey);
                const hasPassage = md.hasPassage(key, nKey);

                if (!neighborExists || !hasPassage) {
                    // Skip wall for entry cell's border edge (open entrance)
                    if (key === entryKey && !neighborExists) {
                        continue;
                    }
                    const e = edges[i];
                    const line = document.createElementNS(NS, 'line');
                    line.setAttribute('x1', e.x1);
                    line.setAttribute('y1', e.y1);
                    line.setAttribute('x2', e.x2);
                    line.setAttribute('y2', e.y2);
                    line.setAttribute('stroke', THEME.maze);
                    line.setAttribute('stroke-width', '3');
                    g.appendChild(line);
                }
            }
        }

        // Draw logo after walls
        this._drawLogo();
    },

    async _drawLogo() {
        const md = this.mazeData;
        if (md.centerHexRadius <= 0) return;

        try {
            const resp = await fetch('../assets/valkey-logo-aligned.svg');
            if (!resp.ok) return;
            const svgText = await resp.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgRoot = doc.documentElement;
            const pathElem = svgRoot.querySelector('path');
            if (!pathElem) return;

            const pathD = pathElem.getAttribute('d');
            const NS = 'http://www.w3.org/2000/svg';

            // Parse viewBox to find logo center and height
            const vb = svgRoot.getAttribute('viewBox');
            let logoCx, logoCy, logoH;
            if (vb) {
                const parts = vb.split(/\s+/).map(Number);
                logoCx = parts[0] + parts[2] / 2;
                logoCy = parts[1] + parts[3] / 2;
                logoH = parts[3];
            } else {
                logoCx = 32.0;
                logoCy = 36.5;
                logoH = 70.0;
            }

            // SVG element dimensions (computed in init)
            const cs = md.cellSize;
            const margin = md.margin;
            const stretch = md.stretch;
            const mazeWidth = md.cols * cs * 0.5 + cs * 0.5;
            const mazeHeight = md.rows * cs * 0.866;
            const width = mazeHeight + 2 * margin;
            const height = (mazeWidth + 2 * margin) * stretch;

            const centerX = width / 2;
            const centerY = height / 2;

            // Scale logo to fit center hex region
            const hexDiameter = md.centerHexRadius * cs * 2;
            const scale = hexDiameter / logoH;

            // Build transform matching Python renderer's _add_logo
            const tx = centerX - logoCx * scale;
            const ty = centerY - logoCy * scale * stretch;
            const transform =
                `translate(${tx},${ty})` +
                ` scale(${scale},${scale * stretch})`;

            const path = document.createElementNS(NS, 'path');
            path.setAttribute('d', pathD);
            path.setAttribute('fill', THEME.maze);
            path.setAttribute('fill-rule', 'evenodd');
            path.setAttribute('transform', transform);

            // Add directly to SVG element, outside the transform group
            this.svg.appendChild(path);
            this.logoElement = path;
        } catch (e) {
            // Logo fetch failed — silently continue without logo
        }
    },

    playerMarker: null,
    trailElement: null,
    logoElement: null,

    drawPlayerMarker(coord) {
        const NS = 'http://www.w3.org/2000/svg';
        const [row, col] = coord.split(',').map(Number);
        const cs = this.mazeData.cellSize;
        const margin = this.mazeData.margin;
        const h = cs * 0.866;
        const x = col * cs * 0.5 + margin;
        const y = row * cs * 0.866 + margin;
        const upward = (row + col) % 2 === 0;

        // Inset factor — shrink triangle slightly so it doesn't overlap walls
        const inset = 0.15;
        let points;
        if (upward) {
            // Upward triangle: vertices at bottom-left, top-center, bottom-right
            points = [
                [x + cs * inset, y + h * (1 - inset)],
                [x + cs / 2, y + h * inset],
                [x + cs * (1 - inset), y + h * (1 - inset)],
            ];
        } else {
            // Downward triangle: vertices at top-left, top-right, bottom-center
            points = [
                [x + cs * inset, y + h * inset],
                [x + cs * (1 - inset), y + h * inset],
                [x + cs / 2, y + h * (1 - inset)],
            ];
        }

        const pointsStr = points.map(p => `${p[0]},${p[1]}`).join(' ');

        if (this.playerMarker) {
            this.playerMarker.setAttribute('points', pointsStr);
            return;
        }

        const polygon = document.createElementNS(NS, 'polygon');
        polygon.setAttribute('points', pointsStr);
        polygon.setAttribute('fill', THEME.player);
        this.playerMarker = polygon;
        this.transformGroup.appendChild(polygon);
    },

    updateTrail(pathStack) {
        const NS = 'http://www.w3.org/2000/svg';

        // Build points array, starting with the entry tail point outside the maze
        const allPoints = [];
        const entryTail = this._entryTailPoint();
        if (entryTail) {
            allPoints.push(`${entryTail.x},${entryTail.y}`);
        }

        // For a single cell, just show the cell center
        if (pathStack.length <= 1) {
            const [r, c] = MazeData.entryCell.split(',').map(Number);
            const center = this._cellCenter(r, c);
            allPoints.push(`${center.x},${center.y}`);
        } else {
            // First cell center (entry point)
            const [r0, c0] = pathStack[0].split(',').map(Number);
            allPoints.push(`${this._cellCenter(r0, c0).x},${this._cellCenter(r0, c0).y}`);

            // Passage midpoints between consecutive cells
            for (let i = 0; i < pathStack.length - 1; i++) {
                const mid = this._passageMidpoint(pathStack[i], pathStack[i + 1]);
                if (mid) {
                    allPoints.push(`${mid.x},${mid.y}`);
                }
            }

            // Last cell center (current position)
            const [rN, cN] = pathStack[pathStack.length - 1].split(',').map(Number);
            allPoints.push(`${this._cellCenter(rN, cN).x},${this._cellCenter(rN, cN).y}`);
        }

        // Reuse existing polyline to preserve CSS animation state
        if (this.trailElement) {
            this.trailElement.setAttribute('points', allPoints.join(' '));
            return;
        }

        const polyline = document.createElementNS(NS, 'polyline');
        polyline.setAttribute('points', allPoints.join(' '));
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', THEME.player);
        polyline.setAttribute('stroke-width', '9');
        polyline.setAttribute('stroke-linecap', 'round');
        polyline.setAttribute('stroke-linejoin', 'round');
        polyline.setAttribute('stroke-dasharray', `${TRAIL.dash} ${TRAIL.gap}`);
        polyline.classList.add('trail-animated');
        this.trailElement = polyline;

        // Insert trail before the player marker so marker renders on top
        if (this.playerMarker) {
            this.transformGroup.insertBefore(polyline, this.playerMarker);
        } else {
            this.transformGroup.appendChild(polyline);
        }
    },
    reset() {
        this.resetFanfare();
        if (this.trailElement) {
            this.trailElement.remove();
            this.trailElement = null;
        }
        if (this.playerMarker) {
            this.playerMarker.remove();
            this.playerMarker = null;
        }
    },

    _cellCenter(row, col) {
        const cs = this.mazeData.cellSize;
        const margin = this.mazeData.margin;
        const h = cs * 0.866;
        const x = col * cs * 0.5 + margin;
        const y = row * cs * 0.866 + margin;
        const upward = (row + col) % 2 === 0;

        if (upward) {
            return { x: x + cs / 2, y: y + h * 2 / 3 };
        } else {
            return { x: x + cs / 2, y: y + h * 1 / 3 };
        }
    },

    _passageMidpoint(coordA, coordB) {
        // Find the shared edge between two adjacent cells and return its midpoint.
        const md = this.mazeData;
        const cellA = md.cells.get(coordA);
        const cellB = md.cells.get(coordB);
        if (!cellA || !cellB) return null;

        const cs = md.cellSize;
        const margin = md.margin;
        const h = cs * 0.866;

        // Get edges for cellA and find which neighbor slot matches coordB
        const { row, col, upward } = cellA;
        const x = col * cs * 0.5 + margin;
        const y = row * cs * 0.866 + margin;

        let neighborCoords, edges;
        if (upward) {
            neighborCoords = [`${row + 1},${col}`, `${row},${col - 1}`, `${row},${col + 1}`];
            edges = [
                { x1: x, y1: y + h, x2: x + cs, y2: y + h },
                { x1: x, y1: y + h, x2: x + cs / 2, y2: y },
                { x1: x + cs / 2, y1: y, x2: x + cs, y2: y + h },
            ];
        } else {
            neighborCoords = [`${row - 1},${col}`, `${row},${col - 1}`, `${row},${col + 1}`];
            edges = [
                { x1: x, y1: y, x2: x + cs, y2: y },
                { x1: x, y1: y, x2: x + cs / 2, y2: y + h },
                { x1: x + cs / 2, y1: y + h, x2: x + cs, y2: y },
            ];
        }

        for (let i = 0; i < 3; i++) {
            if (neighborCoords[i] === coordB) {
                const e = edges[i];
                return { x: (e.x1 + e.x2) / 2, y: (e.y1 + e.y2) / 2 };
            }
        }
        return null;
    },

    _entryTailPoint() {
        const md = this.mazeData;
        const entryCell = md.cells.get(md.entryCell);
        if (!entryCell) return null;

        const { row, col, upward } = entryCell;
        const cs = md.cellSize;
        const margin = md.margin;
        const h = cs * 0.866;
        const x = col * cs * 0.5 + margin;
        const y = row * cs * 0.866 + margin;

        // Find the open border edge (neighbor that doesn't exist in the grid)
        let neighborCoords, edges;
        if (upward) {
            neighborCoords = [`${row + 1},${col}`, `${row},${col - 1}`, `${row},${col + 1}`];
            edges = [
                { x1: x, y1: y + h, x2: x + cs, y2: y + h },       // bottom
                { x1: x, y1: y + h, x2: x + cs / 2, y2: y },       // left
                { x1: x + cs / 2, y1: y, x2: x + cs, y2: y + h },  // right
            ];
        } else {
            neighborCoords = [`${row - 1},${col}`, `${row},${col - 1}`, `${row},${col + 1}`];
            edges = [
                { x1: x, y1: y, x2: x + cs, y2: y },               // top
                { x1: x, y1: y, x2: x + cs / 2, y2: y + h },       // left
                { x1: x + cs / 2, y1: y + h, x2: x + cs, y2: y },  // right
            ];
        }

        for (let i = 0; i < 3; i++) {
            if (!md.cells.has(neighborCoords[i])) {
                const e = edges[i];
                const midX = (e.x1 + e.x2) / 2;
                const midY = (e.y1 + e.y2) / 2;
                const center = this._cellCenter(row, col);
                // Extend outward from center through edge midpoint
                const dx = midX - center.x;
                const dy = midY - center.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const extend = cs * 0.8;
                return {
                    x: midX + (dx / len) * extend,
                    y: midY + (dy / len) * extend,
                };
            }
        }
        return null;
    },

    /**
     * Win fanfare sequence:
     * Phase 1: Trail goes rainbow + 10x crawl speed
     * Phase 2: After a beat, trail "slurps" into the logo (shrinks from entry end)
     * Phase 3: Logo glows white, walls fade to white
     */
    _winTimers: [],
    _winHexBg: null,

    playWinFanfare() {
        const trail = this.trailElement;
        if (!trail) return;
        const NS = 'http://www.w3.org/2000/svg';
        const svg = this.svg;

        // Hide player marker immediately
        if (this.playerMarker) {
            this.playerMarker.setAttribute('opacity', '0');
        }

        const totalLen = trail.getTotalLength();

        // ── Win animation speed (single source of truth) ──
        // 10x normal crawl speed
        const winCrawlDuration = TRAIL.normalDuration / 10;
        const winCrawlPxPerSec = TRAIL.cycle / winCrawlDuration;

        const slurpSeconds = totalLen / winCrawlPxPerSec;
        const slurpMs = slurpSeconds * 1000;

        const pastelColors = [
            '#ff8a95', '#ffca85', '#fff085', '#85f0a8',
            '#85c8ff', '#b885ff', '#ff85c0',
        ];

        // ── Phase 1: SVG mask + rainbow segments ──
        // The mask is a white dashed polyline (same shape as trail) — white = visible.
        // The rainbow is solid colored segments underneath, clipped by the mask.
        const segLen = 6;
        const numSegs = Math.ceil(totalLen / segLen);

        // Build <defs> with <mask>
        const defs = document.createElementNS(NS, 'defs');
        const mask = document.createElementNS(NS, 'mask');
        mask.setAttribute('id', 'win-trail-mask');
        mask.setAttribute('maskUnits', 'userSpaceOnUse');
        // Set mask bounds very large to cover the full transform group coordinate space
        mask.setAttribute('x', '-10000');
        mask.setAttribute('y', '-10000');
        mask.setAttribute('width', '20000');
        mask.setAttribute('height', '20000');

        // Clone the trail polyline as the mask shape
        const maskPoly = trail.cloneNode(false);
        maskPoly.setAttribute('stroke', 'white');
        maskPoly.setAttribute('fill', 'none');
        maskPoly.setAttribute('stroke-width', '9');
        maskPoly.setAttribute('stroke-linecap', 'round');
        maskPoly.setAttribute('stroke-linejoin', 'round');
        maskPoly.setAttribute('stroke-dasharray', `${TRAIL.dash} ${TRAIL.gap}`);
        maskPoly.classList.add('trail-animated');
        maskPoly.style.animationDuration = `${winCrawlDuration}s`;
        mask.appendChild(maskPoly);
        defs.appendChild(mask);
        svg.insertBefore(defs, svg.firstChild);
        this._winDefs = defs;

        // Build solid rainbow segments (no dashes — the mask handles that)
        const rainbowGroup = document.createElementNS(NS, 'g');
        rainbowGroup.setAttribute('mask', 'url(#win-trail-mask)');
        const segments = [];

        for (let i = 0; i < numSegs; i++) {
            const d0 = i * segLen;
            const d1 = Math.min((i + 1) * segLen, totalLen);
            const p0 = trail.getPointAtLength(d0);
            const p1 = trail.getPointAtLength(d1);
            const line = document.createElementNS(NS, 'line');
            line.setAttribute('x1', p0.x);
            line.setAttribute('y1', p0.y);
            line.setAttribute('x2', p1.x);
            line.setAttribute('y2', p1.y);
            line.setAttribute('stroke-width', '12');
            line.setAttribute('stroke-linecap', 'round');
            segments.push(line);
            rainbowGroup.appendChild(line);
        }

        // Insert rainbow group where the trail is, then hide the original
        if (trail.parentNode) {
            trail.parentNode.insertBefore(rainbowGroup, trail);
        }
        trail.style.display = 'none';
        this._winRainbowGroup = rainbowGroup;
        this._winRainbowSegs = segments;

        // Color-cycling via requestAnimationFrame — synced to dash crawl rate
        let colorOffset = 0;
        const rainbowLen = pastelColors.length * segLen * 3;

        const updateRainbowColors = () => {
            for (let i = 0; i < segments.length; i++) {
                if (!segments[i].parentNode) continue;
                const dist = i * segLen + colorOffset;
                const t = ((dist % rainbowLen) + rainbowLen) % rainbowLen;
                const colorIdx = (t / rainbowLen) * pastelColors.length;
                const ci = Math.floor(colorIdx) % pastelColors.length;
                segments[i].setAttribute('stroke', pastelColors[ci]);
            }
        };
        updateRainbowColors();

        let lastTime = performance.now();
        const animateRainbow = (now) => {
            const dt = (now - lastTime) / 1000;
            lastTime = now;
            colorOffset -= winCrawlPxPerSec * dt;
            updateRainbowColors();
            this._winRafId = requestAnimationFrame(animateRainbow);
        };
        this._winRafId = requestAnimationFrame(animateRainbow);

        // ── Phase 2: (logo glow removed — hex bg glow handles this now) ──

        // ── Phase 3: After a short beat, start the slurp ──
        this._winTimers.push(setTimeout(() => {
            // Color cycling + mask dash animation keep running during slurp

            // Slurp: progressively remove segments from the entry end
            const slurpInterval = slurpMs / segments.length;
            let slurpIdx = 0;
            const slurpTimer = setInterval(() => {
                if (slurpIdx >= segments.length) {
                    clearInterval(slurpTimer);
                    if (this._winRafId) {
                        cancelAnimationFrame(this._winRafId);
                        this._winRafId = null;
                    }
                    if (rainbowGroup.parentNode) rainbowGroup.remove();
                    this._winRainbowGroup = null;
                    this._winRainbowSegs = null;
                    return;
                }
                segments[slurpIdx].remove();
                slurpIdx++;
            }, slurpInterval);
            this._winSlurpTimer = slurpTimer;

            // Start hex background ~1.2s before slurp ends so its fade-in finishes with the slurp
            const hexDelay = Math.max(0, slurpMs - 1200);
            this._winTimers.push(setTimeout(() => {
                this._addLogoBg();
            }, hexDelay));

            // ── Phase 4: After slurp completes ──
            this._winTimers.push(setTimeout(() => {
                if (trail.parentNode) trail.remove();
                this.trailElement = null;
                if (this._winDefs) {
                    this._winDefs.remove();
                    this._winDefs = null;
                }

                if (this.logoElement) {
                    this.logoElement.setAttribute('fill', THEME.maze);
                }

                this._addGodRays();
            }, slurpMs));
        }, 500));
    },

    _addLogoBg() {
        if (!this.logoElement) return;
        const md = this.mazeData;
        if (!md || md.centerHexRadius <= 0) return;
        const NS = 'http://www.w3.org/2000/svg';

        const cs = md.cellSize;
        const margin = md.margin;
        const stretch = md.stretch;
        const mazeWidth = md.cols * cs * 0.5 + cs * 0.5;
        const mazeHeight = md.rows * cs * 0.866;
        const width = mazeHeight + 2 * margin;
        const height = (mazeWidth + 2 * margin) * stretch;
        const cx = width / 2;
        const cy = height / 2;

        const hexR = md.centerHexRadius * cs;

        const points = [];
        for (let i = 0; i < 6; i++) {
            const angle = (Math.PI / 3) * i - Math.PI / 6;
            const px = cx + hexR * Math.cos(angle);
            const py = cy + hexR * Math.sin(angle) * stretch;
            points.push(`${px},${py}`);
        }

        const hex = document.createElementNS(NS, 'polygon');
        hex.setAttribute('points', points.join(' '));
        hex.setAttribute('fill', 'hsl(0, 70%, 88%)');
        hex.setAttribute('opacity', '0');
        hex.style.transition = 'opacity 1s ease';

        this.svg.insertBefore(hex, this.logoElement);
        this._winHexBg = hex;

        hex.getBoundingClientRect();
        hex.setAttribute('opacity', '1');

        // Smooth hue rotation — soft pastels, slow cycle (12s full rotation)
        // Also applies a matching color glow (drop-shadow) to the hex
        const cycleDuration = 12;  // seconds per full hue rotation
        let startTime = null;
        const animateHue = (now) => {
            if (!startTime) startTime = now;
            const elapsed = (now - startTime) / 1000;
            const hue = (elapsed / cycleDuration) * 360 % 360;
            const fillColor = `hsl(${hue}, 70%, 88%)`;
            const glowColor = `hsl(${hue}, 80%, 70%)`;
            hex.setAttribute('fill', fillColor);
            hex.style.filter = `drop-shadow(0 0 25px ${glowColor}) drop-shadow(0 0 50px ${glowColor})`;
            this._winBgRafId = requestAnimationFrame(animateHue);
        };
        this._winBgRafId = requestAnimationFrame(animateHue);
    },

    _addGodRays() {
        const md = this.mazeData;
        if (!md) return;
        const NS = 'http://www.w3.org/2000/svg';

        const cs = md.cellSize;
        const margin = md.margin;
        const stretch = md.stretch;
        const mazeWidth = md.cols * cs * 0.5 + cs * 0.5;
        const mazeHeight = md.rows * cs * 0.866;
        const width = mazeHeight + 2 * margin;
        const height = (mazeWidth + 2 * margin) * stretch;
        const cx = width / 2;
        const cy = height / 2;

        const reach = Math.min(width, height) / 2;
        const numRays = 32;
        // Wide rays — lots of overlap for rich additive blending
        const rayHalfAngle = Math.PI / 16 * 0.5;

        // Simple seeded PRNG for deterministic but random-looking values
        const seed = 42;
        let _rng = seed;
        const rng = () => { _rng = (_rng * 16807 + 0) % 2147483647; return _rng / 2147483647; };

        // Get or create <defs>
        const defs = this.svg.querySelector('defs') || (() => {
            const d = document.createElementNS(NS, 'defs');
            this.svg.insertBefore(d, this.svg.firstChild);
            return d;
        })();

        // Radial gradient mask: white at center (visible), black at edges (hidden)
        // Opaque out to the logo hex radius, then fades to transparent by the maze edge
        const hexR = md.centerHexRadius * cs;
        const opaqueStop = Math.round((hexR / reach) * 100);
        const fadeStop = 100;
        const grad = document.createElementNS(NS, 'radialGradient');
        grad.setAttribute('id', 'god-ray-fade');
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('cx', cx);
        grad.setAttribute('cy', cy);
        grad.setAttribute('r', reach);
        const stop1 = document.createElementNS(NS, 'stop');
        stop1.setAttribute('offset', `${opaqueStop}%`);
        stop1.setAttribute('stop-color', 'white');
        const stop2 = document.createElementNS(NS, 'stop');
        stop2.setAttribute('offset', `${fadeStop}%`);
        stop2.setAttribute('stop-color', 'black');
        grad.appendChild(stop1);
        grad.appendChild(stop2);
        defs.appendChild(grad);
        this._winRayGradient = grad;

        // SVG mask using the radial gradient — fades rays from center outward
        const fadeMask = document.createElementNS(NS, 'mask');
        fadeMask.setAttribute('id', 'god-ray-mask');
        fadeMask.setAttribute('maskUnits', 'userSpaceOnUse');
        fadeMask.setAttribute('x', '0');
        fadeMask.setAttribute('y', '0');
        fadeMask.setAttribute('width', width);
        fadeMask.setAttribute('height', height);
        const maskRect = document.createElementNS(NS, 'rect');
        maskRect.setAttribute('x', '0');
        maskRect.setAttribute('y', '0');
        maskRect.setAttribute('width', width);
        maskRect.setAttribute('height', height);
        maskRect.setAttribute('fill', 'url(#god-ray-fade)');
        fadeMask.appendChild(maskRect);
        defs.appendChild(fadeMask);
        this._winRayMask = fadeMask;

        // Container group: masked for radial fade, behind maze walls
        // isolation: isolate creates a compositing boundary so rays screen-blend
        // against each other within the group, producing brighter overlaps
        const containerGroup = document.createElementNS(NS, 'g');
        containerGroup.setAttribute('mask', 'url(#god-ray-mask)');
        containerGroup.style.isolation = 'isolate';
        containerGroup.setAttribute('opacity', '0');
        containerGroup.style.transition = 'opacity 2s ease';

        // Build rays with seeded random speeds, directions, and hue phases
        const rayData = [];
        for (let i = 0; i < numRays; i++) {
            const baseAngle = (2 * Math.PI / numRays) * i;
            // Random speed 2-10 deg/s, random direction, random hue phase
            const speed = 2 + rng() * 8;
            const dir = rng() < 0.5 ? -1 : 1;
            const huePhase = rng() * 360;

            const rayG = document.createElementNS(NS, 'g');
            rayG.style.mixBlendMode = 'screen';

            const a1 = baseAngle - rayHalfAngle;
            const a2 = baseAngle + rayHalfAngle;
            const x1 = cx + reach * Math.cos(a1);
            const y1 = cy + reach * Math.sin(a1) * stretch;
            const x2 = cx + reach * Math.cos(a2);
            const y2 = cy + reach * Math.sin(a2) * stretch;

            // Colored triangle — the mask handles the radial fade
            const poly = document.createElementNS(NS, 'polygon');
            poly.setAttribute('points', `${cx},${cy} ${x1},${y1} ${x2},${y2}`);

            rayG.appendChild(poly);
            containerGroup.appendChild(rayG);
            rayData.push({ group: rayG, poly, speed, dir, huePhase, baseAngle });
        }

        // Insert BEFORE the transform group so maze walls render on top
        this.svg.insertBefore(containerGroup, this.transformGroup);

        this._winRayGroup = containerGroup;

        // Fade in
        containerGroup.getBoundingClientRect();
        containerGroup.setAttribute('opacity', '1');

        // Animate each ray independently
        const cycleDuration = 10;
        let startTime = null;

        const animateRays = (now) => {
            if (!startTime) startTime = now;
            const elapsed = (now - startTime) / 1000;

            for (const r of rayData) {
                const angle = r.dir * r.speed * elapsed;
                r.group.setAttribute('transform', `rotate(${angle}, ${cx}, ${cy})`);

                const hue = ((elapsed / cycleDuration) * 360 + r.huePhase) % 360;
                const color = `hsl(${hue}, 80%, 75%)`;
                r.poly.setAttribute('fill', color);
            }

            this._winRayRafId = requestAnimationFrame(animateRays);
        };
        this._winRayRafId = requestAnimationFrame(animateRays);
    },

    resetFanfare() {
        // Clear all pending timers
        this._winTimers.forEach(t => clearTimeout(t));
        this._winTimers = [];

        // Cancel rainbow animation frame
        if (this._winRafId) {
            cancelAnimationFrame(this._winRafId);
            this._winRafId = null;
        }

        // Cancel slurp interval
        if (this._winSlurpTimer) {
            clearInterval(this._winSlurpTimer);
            this._winSlurpTimer = null;
        }

        // Remove mask defs
        if (this._winDefs) {
            this._winDefs.remove();
            this._winDefs = null;
        }

        // Remove rainbow segments group
        if (this._winRainbowGroup) {
            this._winRainbowGroup.remove();
            this._winRainbowGroup = null;
            this._winRainbowSegs = null;
        }

        // Remove hex background
        if (this._winHexBg) {
            this._winHexBg.remove();
            this._winHexBg = null;
        }

        // Cancel logo bg color cycling
        if (this._winBgRafId) {
            cancelAnimationFrame(this._winBgRafId);
            this._winBgRafId = null;
        }

        // Remove god rays
        if (this._winRayRafId) {
            cancelAnimationFrame(this._winRayRafId);
            this._winRayRafId = null;
        }
        if (this._winRayGroup) {
            this._winRayGroup.remove();
            this._winRayGroup = null;
        }
        if (this._winRayGradient) {
            this._winRayGradient.remove();
            this._winRayGradient = null;
        }
        if (this._winRayMask) {
            this._winRayMask.remove();
            this._winRayMask = null;
        }

        // Reset logo
        if (this.logoElement) {
            this.logoElement.setAttribute('fill', THEME.maze);
        }

        // Reset wall colors
        if (this.transformGroup) {
            const walls = this.transformGroup.querySelectorAll('line');
            walls.forEach(w => {
                w.style.transition = '';
                w.style.stroke = THEME.maze;
            });
        }

        // Reset player marker opacity
        if (this.playerMarker) {
            this.playerMarker.setAttribute('opacity', '1');
        }

        // Reset trail if it still exists
        if (this.trailElement) {
            this.trailElement.setAttribute('stroke', THEME.player);
            this.trailElement.style.display = '';
            this.trailElement.style.animation = '';
            this.trailElement.style.strokeDasharray = '';
            this.trailElement.style.strokeDashoffset = '';
            this.trailElement.style.transition = '';
            this.trailElement.classList.add('trail-animated');
        }
    },
};

// ── PlayerController ────────────────────────────────────────
const PlayerController = {
    currentCell: '',
    pathTrail: [],
    locked: false,

    init(entryCell) {
        this.currentCell = entryCell;
        this.pathTrail = [entryCell];
        this.locked = false;
        GameRenderer.drawPlayerMarker(entryCell);
        GameRenderer.updateTrail(this.pathTrail);
    },
    handleKeydown(event) {
        if (this.locked) return;
        if (event.code === 'KeyB') {
            this.moveBack();
            return;
        }
        const direction = KEY_BINDINGS[event.code];
        if (!direction) return;
        this.moveDirection(direction);
    },
    moveDirection(direction) {
        const result = this._autoSlide(this.currentCell, direction);
        if (result.finalCoord === this.currentCell && result.newTrail.length === this.pathTrail.length) {
            return; // No movement occurred
        }
        this.currentCell = result.finalCoord;
        this.pathTrail = result.newTrail;
        GameRenderer.drawPlayerMarker(this.currentCell);
        GameRenderer.updateTrail(this.pathTrail);

        // Check win condition
        if (MazeData.isGoal(this.currentCell)) {
            GameStateManager.onWin();
        }
    },
    reset() {
        this.init(MazeData.entryCell);
    },
    moveBack() {
        if (this.pathTrail.length <= 1) return;
        const result = this._autoSlideBack();
        if (result.finalCoord === this.currentCell) return;
        this.currentCell = result.finalCoord;
        this.pathTrail = result.newTrail;
        GameRenderer.drawPlayerMarker(this.currentCell);
        GameRenderer.updateTrail(this.pathTrail);
    },
    _autoSlideBack() {
        const trail = [...this.pathTrail];

        while (trail.length > 1) {
            const current = trail[trail.length - 1];
            const prev = trail[trail.length - 2];

            const neighbors = MazeData.getPassageNeighbors(current);
            const forwardOptions = neighbors.filter(n => n !== prev);
            if (forwardOptions.length > 1 && trail.length < this.pathTrail.length) {
                break;
            }

            trail.pop();

            if (trail.length > 1) {
                const newCurrent = trail[trail.length - 1];
                const newPrev = trail[trail.length - 2];
                const newNeighbors = MazeData.getPassageNeighbors(newCurrent);
                const newForward = newNeighbors.filter(n => n !== newPrev);
                if (newForward.length > 1) {
                    break;
                }
            }
        }

        return { finalCoord: trail[trail.length - 1], newTrail: trail };
    },
    _resolveNeighbor(coord, direction) {
        const cell = MazeData.cells.get(coord);
        if (!cell) return null;

        const { row, col, upward } = cell;
        let nr, nc;

        if (upward) {
            switch (direction) {
                case 'up-left':   nr = row;     nc = col - 1; break;
                case 'up-right':  nr = row;     nc = col + 1; break;
                case 'down':      nr = row + 1; nc = col;     break;
                case 'down-left': nr = row + 1; nc = col;     break;
                case 'down-right':nr = row + 1; nc = col;     break;
                case 'up':        return null;
                default:          return null;
            }
        } else {
            switch (direction) {
                case 'up':        nr = row - 1; nc = col;     break;
                case 'down-left': nr = row;     nc = col - 1; break;
                case 'down-right':nr = row;     nc = col + 1; break;
                case 'up-left':   nr = row;     nc = col - 1; break;
                case 'up-right':  nr = row;     nc = col + 1; break;
                case 'down':      return null;
                default:          return null;
            }
        }

        const neighborKey = `${nr},${nc}`;
        return MazeData.cells.has(neighborKey) ? neighborKey : null;
    },
    _resolveVisualNeighbor(coord, visualDir) {
        const cell = MazeData.cells.get(coord);
        if (!cell) return null;
        const mapping = VISUAL_TO_GRID[visualDir];
        if (!mapping) return null;
        const gridDir = mapping[cell.upward];
        return this._resolveNeighbor(coord, gridDir);
    },
    _autoSlide(startCoord, visualDir) {
        const trail = [...this.pathTrail];
        let current = startCoord;

        const firstNeighbor = this._resolveVisualNeighbor(current, visualDir);
        if (!firstNeighbor || !MazeData.hasPassage(current, firstNeighbor)) {
            return { finalCoord: current, newTrail: trail };
        }

        // Check backtrack on first neighbor
        const backtrackIdx = trail.indexOf(firstNeighbor);
        if (backtrackIdx !== -1) {
            const truncated = trail.slice(0, backtrackIdx + 1);
            return { finalCoord: firstNeighbor, newTrail: truncated };
        }

        current = firstNeighbor;
        trail.push(current);

        if (MazeData.isGoal(current)) {
            return { finalCoord: current, newTrail: trail };
        }

        while (true) {
            const next = this._resolveVisualNeighbor(current, visualDir);
            if (!next || !MazeData.hasPassage(current, next)) {
                break;
            }

            const btIdx = trail.indexOf(next);
            if (btIdx !== -1) {
                const truncated = trail.slice(0, btIdx + 1);
                return { finalCoord: next, newTrail: truncated };
            }

            const prev = trail.length >= 2 ? trail[trail.length - 2] : null;
            const neighbors = MazeData.getPassageNeighbors(current);
            const forwardOptions = neighbors.filter(n => n !== prev);
            if (forwardOptions.length > 1) {
                break;
            }

            current = next;
            trail.push(current);

            if (MazeData.isGoal(current)) {
                break;
            }
        }

        return { finalCoord: current, newTrail: trail };
    },
};

// ── GameStateManager ────────────────────────────────────────
const GameStateManager = {
    async init() {
        const container = document.getElementById('maze-container');
        try {
            const indexResp = await fetch('data/index.json');
            if (!indexResp.ok) {
                throw new Error(`Failed to load maze index: ${indexResp.status}`);
            }
            const index = await indexResp.json();
            if (!index.mazes || index.mazes.length === 0) {
                throw new Error('No mazes available in index.json');
            }
            const mazeFile = index.mazes[0];
            await MazeData.load(`data/${mazeFile}`);
            GameRenderer.init(MazeData, container);
            GameRenderer.drawMaze();
            PlayerController.init(MazeData.entryCell);
            document.addEventListener('keydown', (e) => PlayerController.handleKeydown(e));
            document.getElementById('reset-btn').addEventListener('click', () => GameStateManager.onReset());
        } catch (err) {
            container.innerHTML =
                `<p style="color:red;padding:1rem;">Error loading maze: ${err.message}</p>`;
        }
    },
    onWin() {
        PlayerController.locked = true;
        GameRenderer.playWinFanfare();
    },
    onReset() {
        GameRenderer.reset();
        PlayerController.init(MazeData.entryCell);
    },
};

document.addEventListener('DOMContentLoaded', () => {
    GameStateManager.init();
});

// ── Cheat Mode (for testing) ────────────────────────────────
// Type cheat() in the browser console to enable, then press R to take the
// optimal next step toward the goal. Uses BFS to find the shortest path.
let _cheatEnabled = false;

function cheat() {
    _cheatEnabled = true;
    console.log('%c🔓 Cheat mode enabled. Press R to take the next optimal step.', 'color: #0f0; font-size: 14px');
}

function _bfsNextStep() {
    const start = PlayerController.currentCell;
    if (MazeData.isGoal(start)) return null;

    const visited = new Set([start]);
    const parent = new Map();
    const queue = [start];

    while (queue.length > 0) {
        const current = queue.shift();
        if (MazeData.isGoal(current)) {
            // Trace back to find the first step from start
            let step = current;
            while (parent.get(step) !== start) {
                step = parent.get(step);
            }
            return step;
        }
        for (const neighbor of MazeData.getPassageNeighbors(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }
    return null; // no path found
}

document.addEventListener('keydown', (e) => {
    if (!_cheatEnabled || e.code !== 'KeyR') return;
    if (PlayerController.locked) return;

    const nextCell = _bfsNextStep();
    if (!nextCell) return;

    // Check if next step is a backtrack (already on trail)
    const trailIdx = PlayerController.pathTrail.indexOf(nextCell);
    if (trailIdx !== -1) {
        PlayerController.pathTrail = PlayerController.pathTrail.slice(0, trailIdx + 1);
    } else {
        PlayerController.pathTrail.push(nextCell);
    }
    PlayerController.currentCell = nextCell;
    GameRenderer.drawPlayerMarker(nextCell);
    GameRenderer.updateTrail(PlayerController.pathTrail);

    if (MazeData.isGoal(nextCell)) {
        GameStateManager.onWin();
    }
});

function _bfsFullPath() {
    const start = PlayerController.currentCell;
    if (MazeData.isGoal(start)) return null;

    const visited = new Set([start]);
    const parent = new Map();
    const queue = [start];

    while (queue.length > 0) {
        const current = queue.shift();
        if (MazeData.isGoal(current)) {
            const path = [current];
            let step = current;
            while (parent.has(step)) {
                step = parent.get(step);
                path.unshift(step);
            }
            return path;
        }
        for (const neighbor of MazeData.getPassageNeighbors(current)) {
            if (!visited.has(neighbor)) {
                visited.add(neighbor);
                parent.set(neighbor, current);
                queue.push(neighbor);
            }
        }
    }
    return null;
}

function win(stepDelay = 30) {
    if (PlayerController.locked) {
        console.log('%c⚠️ Game already won. Reset first.', 'color: #ff0');
        return;
    }
    const fullPath = _bfsFullPath();
    if (!fullPath) {
        console.log('%c⚠️ Already at goal or no path found.', 'color: #ff0');
        return;
    }
    // Remove the first element (current cell, already on trail)
    const steps = fullPath.slice(1);
    console.log(`%c🏆 Auto-solving: ${steps.length} steps...`, 'color: #0f0; font-size: 14px');

    let i = 0;
    const interval = setInterval(() => {
        if (i >= steps.length) {
            clearInterval(interval);
            return;
        }
        const nextCell = steps[i];
        const trailIdx = PlayerController.pathTrail.indexOf(nextCell);
        if (trailIdx !== -1) {
            PlayerController.pathTrail = PlayerController.pathTrail.slice(0, trailIdx + 1);
        } else {
            PlayerController.pathTrail.push(nextCell);
        }
        PlayerController.currentCell = nextCell;
        GameRenderer.drawPlayerMarker(nextCell);
        GameRenderer.updateTrail(PlayerController.pathTrail);

        if (MazeData.isGoal(nextCell)) {
            clearInterval(interval);
            GameStateManager.onWin();
        }
        i++;
    }, stepDelay);
}

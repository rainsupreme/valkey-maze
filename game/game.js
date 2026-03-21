// ── Theme Colors ────────────────────────────────────────────
const THEME = {
    player: '#ffffff',    // bright copper/orange — player marker & trail
    maze:   '#6983ff',    // vivid periwinkle — walls & logo
    bg:     '#000000',    // black — SVG background
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
        } catch (e) {
            // Logo fetch failed — silently continue without logo
        }
    },

    playerMarker: null,
    trailElement: null,

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

        // Always include the entry cell center (even for single-element trail)
        const entryCenter = (() => {
            const [r, c] = MazeData.entryCell.split(',').map(Number);
            return this._cellCenter(r, c);
        })();
        allPoints.push(`${entryCenter.x},${entryCenter.y}`);

        // Add remaining trail points (skip first since we already added entry center)
        for (let i = 1; i < pathStack.length; i++) {
            const [row, col] = pathStack[i].split(',').map(Number);
            const center = this._cellCenter(row, col);
            allPoints.push(`${center.x},${center.y}`);
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
        polyline.setAttribute('stroke-dasharray', '9 15');
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
        alert('Congratulations! You solved the maze!');
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

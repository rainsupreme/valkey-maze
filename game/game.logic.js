// ── Pure game logic extracted for testability ───────────────
// This module exports the pure state-management functions from game.js
// so they can be tested without browser DOM dependencies.

/**
 * VISUAL_TO_GRID maps visual direction names to grid directions based on cell orientation.
 *
 * The SVG has a 90° CW rotation. There are 6 visual directions the player can move.
 * Each visual direction maps to a different grid direction depending on whether the
 * current cell is upward (▲) or downward (▽).
 *
 * Keys are visual directions; values map {true: gridDir for ▲, false: gridDir for ▽}.
 */
export const VISUAL_TO_GRID = {
    'up':          { true: 'up-left',  false: 'down-left'  },
    'down':        { true: 'up-right', false: 'down-right' },
    'upper-left':  { true: 'down',     false: 'down-left'  },
    'lower-left':  { true: 'down',     false: 'down-right' },
    'upper-right': { true: 'up-left',  false: 'up'         },
    'lower-right': { true: 'up-right', false: 'up'         },
};

/**
 * KEY_BINDINGS maps keyboard event codes to visual direction names.
 *
 * The QWEASD layout maps naturally to the 6 visual directions:
 *   W = up, S = down
 *   Q = upper-left, E = upper-right
 *   A = lower-left, D = lower-right
 */
export const KEY_BINDINGS = {
    'KeyW': 'up',
    'KeyS': 'down',
    'KeyQ': 'upper-left',
    'KeyE': 'upper-right',
    'KeyA': 'lower-left',
    'KeyD': 'lower-right',
};

/**
 * Resolve the neighbor cell coordinate for a given cell and hex direction.
 *
 * The lookup table encodes the triangular zig-zag: upward and downward cells
 * have different neighbor mappings for the same hex direction.
 *
 * @param {string} coord - "row,col" of the current cell
 * @param {string} direction - one of 'up','up-left','up-right','down','down-left','down-right'
 * @param {Map<string, {row: number, col: number, upward: boolean}>} cells - the maze cells map
 * @returns {string|null} "row,col" of the neighbor, or null if it doesn't exist in the grid
 */
export function resolveNeighbor(coord, direction, cells) {
    const cell = cells.get(coord);
    if (!cell) return null;

    const { row, col, upward } = cell;
    let nr, nc;

    if (upward) {
        // Upward cell neighbor lookup
        switch (direction) {
            case 'up-left':   nr = row;     nc = col - 1; break;
            case 'up-right':  nr = row;     nc = col + 1; break;
            case 'down':      nr = row + 1; nc = col;     break;
            case 'down-left': nr = row + 1; nc = col;     break;
            case 'down-right':nr = row + 1; nc = col;     break;
            case 'up':        // upward cell has no direct 'up' neighbor
                              return null;
            default:          return null;
        }
    } else {
        // Downward cell neighbor lookup
        switch (direction) {
            case 'up':        nr = row - 1; nc = col;     break;
            case 'down-left': nr = row;     nc = col - 1; break;
            case 'down-right':nr = row;     nc = col + 1; break;
            case 'up-left':   nr = row;     nc = col - 1; break;
            case 'up-right':  nr = row;     nc = col + 1; break;
            case 'down':      // downward cell has no direct 'down' neighbor
                              return null;
            default:          return null;
        }
    }

    const neighborKey = `${nr},${nc}`;
    return cells.has(neighborKey) ? neighborKey : null;
}

/**
 * Resolve the neighbor cell for a visual direction from a given cell.
 *
 * Maps the visual direction to the appropriate grid direction based on the
 * cell's orientation (upward/downward), then delegates to resolveNeighbor.
 *
 * @param {string} coord - "row,col" of the current cell
 * @param {string} visualDir - one of 'up','down','upper-left','lower-left','upper-right','lower-right'
 * @param {Map<string, {row: number, col: number, upward: boolean}>} cells - the maze cells map
 * @returns {string|null} "row,col" of the neighbor, or null if it doesn't exist in the grid
 */
export function resolveVisualDirection(coord, visualDir, cells) {
    const cell = cells.get(coord);
    if (!cell) return null;
    const mapping = VISUAL_TO_GRID[visualDir];
    if (!mapping) return null;
    const gridDir = mapping[cell.upward];
    return resolveNeighbor(coord, gridDir, cells);
}

/**
 * Auto-slide from startCoord in the given visual direction.
 *
 * Advances through consecutive cells that have a passage in the slide direction,
 * stopping at junctions, dead ends, goal cells, or backtrack points.
 * The visual direction is re-resolved at each cell based on its orientation,
 * so diagonal chains through alternating ▲▽ cells follow visual straight lines.
 *
 * @param {string} startCoord - "row,col" of the starting cell
 * @param {string} visualDir - visual direction to slide ('up','down','upper-left','lower-left','upper-right','lower-right')
 * @param {string[]} pathTrail - current path trail (stack)
 * @param {object} mazeData - object with cells, hasPassage(), getPassageNeighbors(), isGoal()
 * @returns {{ finalCoord: string, newTrail: string[] }} the final position and updated trail
 */
export function autoSlide(startCoord, visualDir, pathTrail, mazeData) {
    const trail = [...pathTrail];
    let current = startCoord;

    // Resolve the first neighbor in the chosen visual direction
    const firstNeighbor = resolveVisualDirection(current, visualDir, mazeData.cells);
    if (!firstNeighbor || !mazeData.hasPassage(current, firstNeighbor)) {
        // Wall collision or border — no movement
        return { finalCoord: current, newTrail: trail };
    }

    // Check if first neighbor is a backtrack (already on trail)
    const backtrackIdx = trail.indexOf(firstNeighbor);
    if (backtrackIdx !== -1) {
        // Truncate trail to that cell
        const truncated = trail.slice(0, backtrackIdx + 1);
        return { finalCoord: firstNeighbor, newTrail: truncated };
    }

    // Move to first neighbor
    current = firstNeighbor;
    trail.push(current);

    // Check if we landed on a goal — stop immediately
    if (mazeData.isGoal(current)) {
        return { finalCoord: current, newTrail: trail };
    }

    // Continue sliding in the same visual direction
    while (true) {
        const next = resolveVisualDirection(current, visualDir, mazeData.cells);

        // If no neighbor in this direction or no passage, stop (dead end or wall in slide direction)
        if (!next || !mazeData.hasPassage(current, next)) {
            break;
        }

        // Check if next is a backtrack point
        const btIdx = trail.indexOf(next);
        if (btIdx !== -1) {
            // Truncate trail to that cell
            const truncated = trail.slice(0, btIdx + 1);
            return { finalCoord: next, newTrail: truncated };
        }

        // Check if current cell is a junction: count passage neighbors excluding where we came from
        const prev = trail.length >= 2 ? trail[trail.length - 2] : null;
        const neighbors = mazeData.getPassageNeighbors(current);
        const forwardOptions = neighbors.filter(n => n !== prev);
        if (forwardOptions.length > 1) {
            // Junction — stop at current cell
            break;
        }

        // Move to next
        current = next;
        trail.push(current);

        // Check goal
        if (mazeData.isGoal(current)) {
            break;
        }
    }

    return { finalCoord: current, newTrail: trail };
}

/**
 * Auto-slide backwards along the path trail.
 *
 * Retraces the trail in reverse, popping cells off the stack, stopping at
 * the first junction encountered (a cell that has more than one passage
 * neighbor excluding the cell we just came from on the trail) or at the
 * entry cell (trail[0]).
 *
 * @param {string[]} pathTrail - current path trail (stack), at least 1 element
 * @param {object} mazeData - object with getPassageNeighbors()
 * @returns {{ finalCoord: string, newTrail: string[] }} the final position and updated trail
 */
export function autoSlideBack(pathTrail, mazeData) {
    if (pathTrail.length <= 1) {
        return { finalCoord: pathTrail[0], newTrail: [...pathTrail] };
    }

    const trail = [...pathTrail];

    while (trail.length > 1) {
        const current = trail[trail.length - 1];
        const prev = trail[trail.length - 2];

        // Check if current cell is a junction (multiple forward options from here)
        const neighbors = mazeData.getPassageNeighbors(current);
        const forwardOptions = neighbors.filter(n => n !== prev);
        if (forwardOptions.length > 1 && trail.length < pathTrail.length) {
            // We've moved at least one step and hit a junction — stop here
            break;
        }

        // Pop current cell and move back
        trail.pop();

        // If we just arrived at a junction, stop
        if (trail.length > 1) {
            const newCurrent = trail[trail.length - 1];
            const newPrev = trail[trail.length - 2];
            const newNeighbors = mazeData.getPassageNeighbors(newCurrent);
            const newForward = newNeighbors.filter(n => n !== newPrev);
            if (newForward.length > 1) {
                break;
            }
        }
    }

    return { finalCoord: trail[trail.length - 1], newTrail: trail };
}

/**
 * Creates a new PlayerController state object.
 * This mirrors the PlayerController object in game.js but without renderer calls.
 */
export function createPlayerController() {
    return {
        currentCell: '',
        pathTrail: [],
        locked: false,

        /**
         * Initialize player state at the given entry cell.
         * Sets currentCell to entryCell, pathTrail to [entryCell], locked to false.
         */
        init(entryCell) {
            this.currentCell = entryCell;
            this.pathTrail = [entryCell];
            this.locked = false;
        },

        /**
         * Reset player state back to the given entry cell.
         * Same state as init: currentCell = entryCell, pathTrail = [entryCell], locked = false.
         */
        reset(entryCell) {
            this.currentCell = entryCell;
            this.pathTrail = [entryCell];
            this.locked = false;
        },
    };
}

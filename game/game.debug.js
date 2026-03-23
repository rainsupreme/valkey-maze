// ── Cheat / Debug Utilities ──────────────────────────────────
// Loaded separately so production game code stays clean.
// Type cheat() in the browser console to enable, then press R to take the
// optimal next step toward the goal. Type win() to auto-solve.

import { MazeData, GameRenderer, PlayerController, GameStateManager } from './game.js';

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

// Cheat key listener
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

// Expose to browser console
window.cheat = cheat;
window.win = win;

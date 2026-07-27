import { describe, it, expect } from 'vitest';
import { buildHexCellGrid, hexDistance, axialToPixel, hexCorners } from '../hex-cell-grid.js';

describe('buildHexCellGrid', () => {
    it('has 3R(R+1)+1 cells for radius R', () => {
        for (const radius of [1, 2, 3, 4]) {
            const grid = buildHexCellGrid(radius);
            expect(grid.cells.size).toBe(3 * radius * (radius + 1) + 1);
        }
    });

    it('centerHole removes exactly the origin cell', () => {
        const grid = buildHexCellGrid(3, { centerHole: true });
        expect(grid.cells.size).toBe(3 * 3 * 4); // 37 - 1
        expect(grid.cells.has('0,0')).toBe(false);
    });

    it('interior cells have 6 neighbors, corner cells have 3', () => {
        const grid = buildHexCellGrid(3);
        expect(grid.neighbors.get('1,0').length).toBe(6);
        expect(grid.neighbors.get('3,0').length).toBe(3); // board corner
    });

    it('neighbor relation is symmetric', () => {
        const grid = buildHexCellGrid(3, { centerHole: true });
        for (const [key, adj] of grid.neighbors) {
            for (const nk of adj) {
                expect(grid.neighbors.get(nk)).toContain(key);
            }
        }
    });

    it('all cells lie within the board radius', () => {
        const grid = buildHexCellGrid(4);
        for (const { q, r } of grid.cells.values()) {
            expect(hexDistance(q, r)).toBeLessThanOrEqual(4);
        }
    });
});

describe('pointy-top geometry', () => {
    it('hexCorners produces vertices at 12 and 6 o clock (pointy-top)', () => {
        const corners = hexCorners(0, 0, 10);
        // One vertex directly above center, one directly below
        const top = corners.find(([x, y]) => Math.abs(x) < 1e-9 && y < 0);
        const bottom = corners.find(([x, y]) => Math.abs(x) < 1e-9 && y > 0);
        expect(top).toBeDefined();
        expect(bottom).toBeDefined();
        expect(top[1]).toBeCloseTo(-10);
        expect(bottom[1]).toBeCloseTo(10);
    });

    it('adjacent cells are exactly sqrt(3)*size apart', () => {
        const size = 20;
        const a = axialToPixel(0, 0, size);
        for (const [q, r] of [[1, 0], [0, 1], [1, -1]]) {
            const b = axialToPixel(q, r, size);
            const d = Math.hypot(b.x - a.x, b.y - a.y);
            expect(d).toBeCloseTo(Math.sqrt(3) * size);
        }
    });
});

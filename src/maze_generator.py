import random
import svgwrite
from src.triangular_grid import TriangularGrid


class MazeGenerator:
    def __init__(self, hex_side):
        self.grid = TriangularGrid(0, 0, hexagonal=True, hex_side=hex_side)

    def generate(self):
        """Generate maze using iterative backtracking"""
        start_cell = random.choice(list(self.grid.cells.values()))
        stack = [start_cell]
        start_cell.visited = True

        while stack:
            cell = stack[-1]
            neighbors = [n for n in cell.neighbors if not n.visited]
            
            if neighbors:
                neighbor = random.choice(neighbors)
                neighbor.visited = True
                cell.passages.add(neighbor)
                neighbor.passages.add(cell)
                stack.append(neighbor)
            else:
                stack.pop()

    def render_maze(self, filename, cell_size=30, stroke_width=3):
        """Render maze by drawing walls where there are no passages"""
        width = self.grid.cols * cell_size * 0.5 + cell_size * 0.5
        height = self.grid.rows * cell_size * 0.866

        dwg = svgwrite.Drawing(filename, size=(width, height))
        dwg.add(dwg.rect((0, 0), (width, height), fill="white"))

        for cell in self.grid.cells.values():
            self._draw_walls(dwg, cell, cell_size, stroke_width)

        dwg.save()

    def render_debug(self, filename, cell_size=30, stroke_width=4):
        """Render debug view showing grid structure"""
        self.grid.render_svg(filename, cell_size, stroke_width)

    def _draw_walls(self, dwg, cell, cell_size, stroke_width):
        """Draw walls for edges without passages"""
        x, y = cell.get_position()
        x *= cell_size
        y *= cell_size
        height = cell_size * 0.866

        if cell.is_upward:
            neighbor_coords = [(cell.row + 1, cell.col), (cell.row, cell.col - 1), (cell.row, cell.col + 1)]
            edges = [
                ((x, y + height), (x + cell_size, y + height)),
                ((x, y + height), (x + cell_size / 2, y)),
                ((x + cell_size / 2, y), (x + cell_size, y + height)),
            ]
        else:
            neighbor_coords = [(cell.row - 1, cell.col), (cell.row, cell.col - 1), (cell.row, cell.col + 1)]
            edges = [
                ((x, y), (x + cell_size, y)),
                ((x, y), (x + cell_size / 2, y + height)),
                ((x + cell_size / 2, y + height), (x + cell_size, y)),
            ]

        for i, coord in enumerate(neighbor_coords):
            neighbor = self.grid.cells.get(coord)
            if not neighbor or neighbor not in cell.passages:
                p1, p2 = edges[i]
                dwg.add(dwg.line(p1, p2, stroke="black", stroke_width=stroke_width))

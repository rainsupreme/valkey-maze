import random
import svgwrite
from collections import deque
from src.triangular_grid import TriangularGrid


class MazeGenerator:
    def __init__(self, hex_side, center_hex_radius=0):
        self.grid = TriangularGrid(0, 0, hexagonal=True, hex_side=hex_side)
        self.radius = hex_side
        self.center_hex_radius = center_hex_radius
        self.start_cell = None
        self.exit_cell = None

    def generate(self):
        """Generate maze using iterative backtracking"""
        if self.center_hex_radius > 0:
            self._create_open_center()

        # random start
        # start_cell = random.choice([c for c in self.grid.cells.values() if not c.visited])

        # connect to valkey logo
        row = int(self.grid.rows / 2 + self.center_hex_radius / 2)
        column = int(self.grid.cols / 2)
        start_cell = self.grid.get_cell((row, column))
        while True:
            column += 1
            next = self.grid.get_cell((row, column))
            if not next.visited:
                break
            start_cell = next
        self.start_cell = start_cell
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

        self._find_exit()

    def _find_exit(self):
        """Find farthest border cell from start using BFS"""
        distances = {self.start_cell: 0}
        queue = deque([self.start_cell])

        while queue:
            cell = queue.popleft()
            for neighbor in cell.passages:
                if neighbor not in distances:
                    distances[neighbor] = distances[cell] + 1
                    queue.append(neighbor)

        # Find border cells (cells with missing neighbors)
        border_cells = [
            c
            for c in self.grid.cells.values()
            if len(c.neighbors) < 3 and c in distances
        ]

        self.exit_cell = max(border_cells, key=lambda c: distances[c])

    def _create_open_center(self):
        """Create fully connected hexagon in center"""
        center_row = self.grid.rows / 2 - 0.5

        center_cells = []
        for cell in self.grid.cells.values():
            vertical_distance_from_center = abs(cell.row - center_row) - 0.5
            if vertical_distance_from_center >= self.center_hex_radius:
                continue
            side_offset = (
                self.radius - self.center_hex_radius
            ) * 2 + vertical_distance_from_center
            if cell.col >= side_offset and cell.col < self.grid.cols - side_offset:
                center_cells.append(cell)

        for cell in center_cells:
            cell.visited = True
            for neighbor in cell.neighbors:
                if neighbor in center_cells:
                    cell.passages.add(neighbor)
                    neighbor.passages.add(cell)

    def render_maze(self, filename, cell_size=30, stroke_width=3, arrow_size=10, margin=40, logo_svg=None, logo_color='black'):
        """Render maze by drawing walls where there are no passages"""
        stretch = 1.03
        self.stretch = stretch

        maze_width = self.grid.cols * cell_size * 0.5 + cell_size * 0.5
        maze_height = self.grid.rows * cell_size * 0.866
        width = maze_height + 2 * margin
        height = (maze_width + 2 * margin) * stretch

        dwg = svgwrite.Drawing(filename, size=(width, height))
        dwg.add(dwg.rect((0, 0), (width, height), fill="white"))

        # Create transform group for rotation and scaling
        transform = f"translate({width/2},{height/2}) rotate({90}) scale({stretch},{1.0}) translate({-(maze_width + 2 * margin)/2},{-width/2})"
        g = dwg.g(transform=transform)

        for cell in self.grid.cells.values():
            self._draw_walls(dwg, g, cell, cell_size, stroke_width, margin)

        self._draw_exit_arrow(dwg, g, cell_size, arrow_size, stroke_width, margin)

        dwg.add(g)
        
        if logo_svg and self.center_hex_radius > 0:
            self._add_logo(dwg, logo_svg, width, height, self.center_hex_radius, cell_size, stretch, logo_color)
        
        dwg.save()

    def _add_logo(self, dwg, logo_svg, width, height, center_hex_radius, cell_size, stretch, logo_color):
        """Extract path from logo SVG and center it in the maze"""
        import xml.etree.ElementTree as ET
        
        tree = ET.parse(logo_svg)
        root = tree.getroot()
        
        # Find the path element
        path_elem = root.find('.//{http://www.w3.org/2000/svg}path')
        
        if path_elem is not None:
            path_d = path_elem.get('d')
            fill = logo_color
            center_x = width / 2
            center_y = height / 2
            
            # Scale logo to match inner hexagon radius (original viewBox is 64x73)
            hex_diameter = center_hex_radius * cell_size * 2
            scale = hex_diameter / 70
            dwg.add(dwg.path(d=path_d, fill=fill, transform=f'translate({center_x - 32*scale},{center_y - 36.5*scale*stretch}) scale({scale},{scale*stretch})'))

    def render_debug(self, filename, cell_size=30, stroke_width=4):
        """Render debug view showing grid structure"""
        self.grid.render_svg(filename, cell_size, stroke_width)

    def _draw_exit_arrow(self, dwg, g, cell_size, arrow_size, stroke_width, margin):
        """Draw arrow pointing to exit opening"""
        import math

        # Create arrow marker
        marker = dwg.marker(
            insert=(arrow_size, arrow_size / 2),
            size=(arrow_size, arrow_size),
            orient="auto",
        )
        marker.add(
            dwg.polygon(
                [(0, 0), (arrow_size, arrow_size / 2), (0, arrow_size)], fill="black"
            )
        )
        dwg.defs.add(marker)

        x, y = self.exit_cell.get_position()
        x = x * cell_size + margin
        y = y * cell_size + margin
        height = cell_size * 0.866

        # Find which edge is the border (no neighbor)
        if self.exit_cell.is_upward:
            neighbor_coords = [
                (self.exit_cell.row + 1, self.exit_cell.col),
                (self.exit_cell.row, self.exit_cell.col - 1),
                (self.exit_cell.row, self.exit_cell.col + 1),
            ]
            edge_centers = [
                (x + cell_size / 2, y + height),
                (x + cell_size / 4, y + height / 2),
                (x + 3 * cell_size / 4, y + height / 2),
            ]
            angles = [90, 210, 330]
        else:
            neighbor_coords = [
                (self.exit_cell.row - 1, self.exit_cell.col),
                (self.exit_cell.row, self.exit_cell.col - 1),
                (self.exit_cell.row, self.exit_cell.col + 1),
            ]
            edge_centers = [
                (x + cell_size / 2, y),
                (x + cell_size / 4, y + height / 2),
                (x + 3 * cell_size / 4, y + height / 2),
            ]
            angles = [270, 150, 30]

        for i, coord in enumerate(neighbor_coords):
            if not self.grid.cells.get(coord):
                cx, cy = edge_centers[i]
                angle = math.radians(angles[i])
                start_x = cx + arrow_size * math.cos(angle)
                start_y = cy + arrow_size * math.sin(angle)
                g.add(
                    dwg.line(
                        (start_x, start_y),
                        (cx, cy),
                        stroke="black",
                        stroke_width=stroke_width,
                        marker_end=marker.get_funciri(),
                    )
                )
                break

    def _draw_walls(self, dwg, g, cell, cell_size, stroke_width, margin):
        """Draw walls for edges without passages"""
        x, y = cell.get_position()
        x = x * cell_size + margin
        y = y * cell_size + margin
        height = cell_size * 0.866

        if cell.is_upward:
            neighbor_coords = [
                (cell.row + 1, cell.col),
                (cell.row, cell.col - 1),
                (cell.row, cell.col + 1),
            ]
            edges = [
                ((x, y + height), (x + cell_size, y + height)),
                ((x, y + height), (x + cell_size / 2, y)),
                ((x + cell_size / 2, y), (x + cell_size, y + height)),
            ]
        else:
            neighbor_coords = [
                (cell.row - 1, cell.col),
                (cell.row, cell.col - 1),
                (cell.row, cell.col + 1),
            ]
            edges = [
                ((x, y), (x + cell_size, y)),
                ((x, y), (x + cell_size / 2, y + height)),
                ((x + cell_size / 2, y + height), (x + cell_size, y)),
            ]

        for i, coord in enumerate(neighbor_coords):
            neighbor = self.grid.cells.get(coord)
            if not neighbor or neighbor not in cell.passages:
                # Skip drawing wall if this is the exit cell's border edge
                if cell == self.exit_cell and not neighbor:
                    continue
                p1, p2 = edges[i]
                g.add(dwg.line(p1, p2, stroke="black", stroke_width=stroke_width))

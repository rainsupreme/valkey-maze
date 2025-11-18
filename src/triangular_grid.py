from dataclasses import dataclass, field
from typing import Set
import svgwrite
import math

@dataclass(frozen=True)
class TriangleCell:
    row: int
    col: int
    neighbors: Set['TriangleCell'] = field(default_factory=set, compare=False, hash=False)
    
    @property
    def coord(self):
        return (self.row, self.col)
    
    @property
    def is_upward(self):
        return (self.row + self.col) % 2 == 0
    
    def get_position(self):
        return (self.col * 0.5, self.row * 0.866)

class TriangularGrid:
    # Color constants
    BACKGROUND_COLOR = 'white'
    FOREGROUND_COLOR = 'black'
    
    def __init__(self, rows, cols, hexagonal=False, hex_side=0):
        self.rows = rows
        self.cols = cols
        self.cells = {}
        
        if hexagonal:
            if hex_side == 0:
                hex_side = min(cols//2, (rows +1)//4)
            if hex_side % 2 == 0:
                hex_side += 1
            self._build_hexagonal_grid(hex_side)
        else:
            self._build_grid()
    
    def _build_grid(self):
        # Create all cells first
        for row in range(self.rows):
            for col in range(self.cols):
                coord = (row, col)
                self.cells[coord] = TriangleCell(row, col)
        
        # Then link neighbors
        for coord, cell in self.cells.items():
            self._add_neighbors(cell)
    
    def _build_hexagonal_grid(self, hex_side):
        """Build a hexagonal arrangement of triangular cells"""
        self.rows = hex_side * 2
        self.cols = 4 * hex_side - 1
        
        center_row = hex_side - 0.5
        # Create cells within hexagonal boundary
        for row in range(self.rows):
            distance_from_center = abs(row - center_row) - 0.5
            for col in range(self.cols):
                if col < distance_from_center or col >= self.cols - distance_from_center:
                    continue
                coord = (row, col)
                self.cells[coord] = TriangleCell(row, col)
        
        # Link neighbors
        for coord, cell in self.cells.items():
            self._add_neighbors(cell)
    
    def _is_in_hexagon(self, row, col, center_row, center_col, radius):
        """Check if a cell is within the hexagonal boundary"""
        dx = abs(col - center_col)
        dy = abs(row - center_row)
        return dx <= radius and dy <= radius and dx + dy <= radius * 1.5
    
    def _add_neighbors(self, cell):
        row, col = cell.row, cell.col
        
        if cell.is_upward:
            neighbor_coords = [(row+1, col), (row, col-1), (row, col+1)]
        else:
            neighbor_coords = [(row-1, col), (row, col-1), (row, col+1)]
        
        for coord in neighbor_coords:
            if coord in self.cells:
                cell.neighbors.add(self.cells[coord])
    
    def _is_valid_coord(self, coord):
        row, col = coord
        return 0 <= row < self.rows and 0 <= col < self.cols
    
    def get_cell(self, coord):
        return self.cells.get(coord)
    
    def get_neighbors(self, coord):
        cell = self.cells.get(coord)
        return cell.neighbors if cell else set()
    
    def get_all_coords(self):
        return list(self.cells.keys())
    
    def get_position(self, coord):
        cell = self.cells.get(coord)
        return cell.get_position() if cell else None
    
    def render_svg(self, filename, cell_size=30, stroke_width=1):
        """Render the triangular grid as SVG"""
        width = self.cols * cell_size * 0.5 + cell_size * 0.5
        height = self.rows * cell_size * 0.866
        
        dwg = svgwrite.Drawing(filename, size=(width, height))
        
        for coord, cell in self.cells.items():
            self._draw_triangle(dwg, cell, cell_size, stroke_width)
        
        self._draw_connections(dwg, cell_size, stroke_width)
        
        dwg.save()
    
    def _draw_triangle(self, dwg, cell, cell_size, stroke_width):
        """Draw a single triangle cell"""
        x, y = cell.get_position()
        x *= cell_size
        y *= cell_size
        
        height = cell_size * 0.866
        
        if cell.is_upward:
            points = [
                (x, y + height),
                (x + cell_size/2, y),
                (x + cell_size, y + height)
            ]
        else:
            points = [
                (x, y),
                (x + cell_size/2, y + height),
                (x + cell_size, y)
            ]
        
        dwg.add(dwg.polygon(points, 
                           fill=self.BACKGROUND_COLOR, 
                           stroke=self.FOREGROUND_COLOR, 
                           stroke_width=stroke_width))
    
    def _get_center(self, cell, cell_size):
        """Get the center point of a triangle"""
        x, y = cell.get_position()
        x *= cell_size
        y *= cell_size
        height = cell_size * 0.866
        
        if cell.is_upward:
            return (x + cell_size/2, y + height * 2/3)
        else:
            return (x + cell_size/2, y + height * 1/3)
    
    def _draw_connections(self, dwg, cell_size, stroke_width):
        """Draw red lines between connected cells"""
        drawn = set()
        for coord, cell in self.cells.items():
            for neighbor in cell.neighbors:
                pair = tuple(sorted([coord, neighbor.coord]))
                if pair not in drawn:
                    x1, y1 = self._get_center(cell, cell_size)
                    x2, y2 = self._get_center(neighbor, cell_size)
                    dwg.add(dwg.line((x1, y1), (x2, y2),
                                    stroke='red', stroke_width=stroke_width))
                    drawn.add(pair)
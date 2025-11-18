import sys
import os

# Add src directory to Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from triangular_grid import TriangularGrid

# Create and render a triangular grid
grid = TriangularGrid(20,60)
grid.render_svg('triangular_grid_test.svg', stroke_width=4)
print("Triangular grid rendered to triangular_grid_test.svg")

# Create and render a hexagonal triangular grid
hex_grid = TriangularGrid(30, 30, hexagonal=True, hex_side=5)
hex_grid.render_svg('hexagonal_grid_test.svg', stroke_width=4)
print("Hexagonal grid rendered to hexagonal_grid_test.svg")
import pytest

from src.triangular_grid import TriangleCell, TriangularGrid


def test_coord_property():
    cell = TriangleCell(2, 3)
    assert cell.coord == (2, 3)


def test_is_upward_true():
    # For upward triangles, (row + col) % 2 == 0
    cell = TriangleCell(2, 4)  # 2+4=6, even
    assert cell.is_upward


def test_is_upward_false():
    # For downward triangles, (row + col) % 2 == 1
    cell = TriangleCell(2, 3)  # 2+3=5, odd
    assert not cell.is_upward


def test_get_position():
    cell = TriangleCell(2, 3)
    pos = cell.get_position()
    expected_x = 3 * 0.5  # col * 0.5
    expected_y = 2 * 0.866  # row * 0.866
    assert pos == (expected_x, expected_y)


@pytest.fixture
def triangular_grid():
    return TriangularGrid(3, 4)  # 3 rows, 4 columns


def test_grid_dimensions(triangular_grid):
    assert triangular_grid.rows == 3
    assert triangular_grid.cols == 4


def test_cell_creation(triangular_grid):
    # Check that all cells were created
    assert len(triangular_grid.cells) == 12  # 3*4

    # Check specific cell
    cell = triangular_grid.get_cell((1, 2))
    assert isinstance(cell, TriangleCell)
    assert cell.row == 1
    assert cell.col == 2


def test_invalid_cell_access(triangular_grid):
    # Accessing non-existent cell should return None
    cell = triangular_grid.get_cell((10, 10))
    assert cell is None


def test_neighbor_count(triangular_grid):
    # Interior cells should have 3 neighbors
    interior_cell = triangular_grid.get_cell((1, 1))
    assert len(interior_cell.neighbors) == 3


def test_upward_triangle_neighbors():
    # Create a larger grid to properly test neighbors
    grid = TriangularGrid(5, 5)

    # Test upward triangle at (2, 2) - should connect to (3,2), (2,1), (2,3)
    cell = grid.get_cell((2, 2))
    assert cell.is_upward

    neighbor_coords = {n.coord for n in cell.neighbors}
    expected_coords = {(3, 2), (2, 1), (2, 3)}
    assert neighbor_coords == expected_coords


def test_downward_triangle_neighbors():
    # Create a larger grid to properly test neighbors
    grid = TriangularGrid(5, 5)

    # Test downward triangle at (1, 2) - should connect to (0,2), (1,1), (1,3)
    cell = grid.get_cell((1, 2))
    assert not cell.is_upward

    neighbor_coords = {n.coord for n in cell.neighbors}
    expected_coords = {(0, 2), (1, 1), (1, 3)}
    assert neighbor_coords == expected_coords


def test_edge_cell_neighbors(triangular_grid):
    # Edge cells should have fewer neighbors
    edge_cell = triangular_grid.get_cell((0, 0))
    # Corner cell (0,0) should only have 1 or 2 neighbors depending on orientation
    assert len(edge_cell.neighbors) <= 2


def test_get_all_coords(triangular_grid):
    coords = triangular_grid.get_all_coords()
    assert len(coords) == 12  # 3*4
    assert (0, 0) in coords
    assert (2, 3) in coords


def test_get_position_via_grid(triangular_grid):
    pos = triangular_grid.get_position((1, 2))
    expected_x = 2 * 0.5  # col * 0.5
    expected_y = 1 * 0.866  # row * 0.866
    assert pos == (expected_x, expected_y)


def test_get_position_invalid_coord(triangular_grid):
    pos = triangular_grid.get_position((10, 10))
    assert pos is None


def test_max_three_neighbors():
    """Ensure no cell has more than 3 neighbors in a uniform grid"""
    grid = TriangularGrid(10, 10)
    for coord, cell in grid.cells.items():
        assert len(cell.neighbors) <= 3, f"Cell {coord} has {len(cell.neighbors)} neighbors"


def test_interior_cells_have_three_neighbors():
    """Interior cells should have exactly 3 neighbors"""
    grid = TriangularGrid(10, 10)
    interior_cell = grid.get_cell((5, 5))
    assert len(interior_cell.neighbors) == 3


def test_neighbor_symmetry():
    """If A is a neighbor of B, then B must be a neighbor of A"""
    grid = TriangularGrid(10, 10)
    for coord, cell in grid.cells.items():
        for neighbor in cell.neighbors:
            assert cell in neighbor.neighbors, f"Asymmetric neighbor relationship between {coord} and {neighbor.coord}"


def test_upward_connects_to_next_row():
    """Upward triangles should connect to row+1, downward to row-1"""
    grid = TriangularGrid(10, 10)
    for coord, cell in grid.cells.items():
        cross_row_neighbors = [n for n in cell.neighbors if n.row != cell.row]
        if cell.is_upward:
            for neighbor in cross_row_neighbors:
                assert neighbor.row == cell.row + 1, (
                    f"Upward cell {coord} connects to row {neighbor.row}, expected {cell.row + 1}"
                )
        else:
            for neighbor in cross_row_neighbors:
                assert neighbor.row == cell.row - 1, (
                    f"Downward cell {coord} connects to row {neighbor.row}, expected {cell.row - 1}"
                )

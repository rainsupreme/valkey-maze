"""Edge case and error handling tests."""

import random
from unittest.mock import patch

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.maze_generator import MazeGenerator
from src.triangular_grid import TriangularGrid
from src.word_search_generator import WordSearchGenerator


def test_size_1_grid_single_letter_word():
    """WordSearchGenerator(size=1) with a single one-letter word completes without error."""
    random.seed(42)
    ws = WordSearchGenerator(size=1, banned_words_file=None)
    ws.add_words(["A"])
    assert ws.grid[0][0] == "A"
    assert len(ws.placed_words) == 1
    assert ws.placed_words[0][0] == "A"


def test_word_longer_than_grid_not_placed():
    """A word longer than the grid size is not placed and no exception is raised."""
    random.seed(42)
    ws = WordSearchGenerator(size=3, banned_words_file=None)
    ws.add_words(["TOOLONGWORD"])
    placed = {w for w, *_ in ws.placed_words}
    assert "TOOLONGWORD" not in placed
    # Grid should still be fully filled with A-Z
    for r in range(ws.size):
        for c in range(ws.size):
            ch = ws.grid[r][c]
            assert len(ch) == 1 and "A" <= ch <= "Z"


def test_get_safe_letter_raises_valueerror():
    """_get_safe_letter() must raise ValueError when all 26 letters are unsafe."""
    ws = WordSearchGenerator(size=5, banned_words_file=None)
    ws.banned_words = {"DUMMY"}  # non-empty so the fast path is skipped

    with patch.object(ws, "_is_safe_placement", return_value=False):
        with pytest.raises(ValueError):
            ws._get_safe_letter(0, 0)


def test_missing_logo_raises_filenotfounderror():
    """render_maze_string(logo_svg='nonexistent.svg') must raise FileNotFoundError."""
    random.seed(42)
    mg = MazeGenerator(hex_side=3, center_hex_radius=1)
    mg.generate()
    with pytest.raises(FileNotFoundError):
        mg.render_maze_string(logo_svg="nonexistent.svg")


def test_generate_all_cells_previsited_raises_valueerror():
    """generate() must raise ValueError when all cells are already visited."""
    mg = MazeGenerator(hex_side=3)
    # Pre-visit every cell
    for cell in mg.grid.cells.values():
        cell.visited = True
    with pytest.raises(ValueError):
        mg.generate()


def test_even_hex_side_adjusted_to_odd():
    """When hexagonal=True and hex_side is even, hex_side is adjusted to odd."""
    grid = TriangularGrid(0, 0, hexagonal=True, hex_side=4)
    # hex_side=4 should become 5, so rows = 5*2 = 10, cols = 4*5-1 = 19
    assert grid.rows == 10
    assert grid.cols == 19
    assert len(grid.cells) > 0
    # All cells should have valid neighbors
    for coord, cell in grid.cells.items():
        assert len(cell.neighbors) <= 3
        for neighbor in cell.neighbors:
            assert cell in neighbor.neighbors


# ---------------------------------------------------------------------------
# Property-Based Tests (Hypothesis)
# ---------------------------------------------------------------------------


@given(hex_side=st.integers(min_value=2, max_value=20).filter(lambda x: x % 2 == 0))
@settings(max_examples=100)
def test_property_even_hex_side_adjusted_to_odd(hex_side):
    """For any even hex_side, TriangularGrid adjusts to odd and builds valid hexagonal grid."""
    grid = TriangularGrid(0, 0, hexagonal=True, hex_side=hex_side)
    adjusted = hex_side + 1  # even -> odd

    # Grid dimensions match the adjusted (odd) hex_side
    assert grid.rows == adjusted * 2
    assert grid.cols == 4 * adjusted - 1

    # Grid has cells
    assert len(grid.cells) > 0

    # All cells have at most 3 neighbors
    for coord, cell in grid.cells.items():
        assert len(cell.neighbors) <= 3, f"Cell {coord} has {len(cell.neighbors)} neighbors"

    # Neighbor symmetry: if A neighbors B, then B neighbors A
    for coord, cell in grid.cells.items():
        for neighbor in cell.neighbors:
            assert cell in neighbor.neighbors, f"Asymmetric neighbor: {coord} -> {neighbor.coord}"

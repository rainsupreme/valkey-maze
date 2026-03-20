"""Unit tests for MazeGenerator."""

import random
from collections import deque

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.maze_generator import MazeGenerator


@pytest.fixture
def maze_5():
    """Generate a hex_side=5 maze with a fixed seed."""
    random.seed(42)
    mg = MazeGenerator(hex_side=5)
    mg.generate()
    return mg


@pytest.fixture
def maze_5_center():
    """Generate a hex_side=5 maze with center_hex_radius=1 and a fixed seed."""
    random.seed(42)
    mg = MazeGenerator(hex_side=5, center_hex_radius=1)
    mg.generate()
    return mg


@pytest.fixture
def maze_3():
    """Generate a hex_side=3 (minimum) maze with a fixed seed."""
    random.seed(42)
    mg = MazeGenerator(hex_side=3)
    mg.generate()
    return mg


def test_all_cells_visited(maze_5):
    """After generate(), every cell in the grid must be visited."""
    for coord, cell in maze_5.grid.cells.items():
        assert cell.visited, f"Cell {coord} was not visited"


def test_passages_symmetric(maze_5):
    """If cell A has a passage to B, then B must have a passage to A."""
    for coord, cell in maze_5.grid.cells.items():
        for passage in cell.passages:
            assert cell in passage.passages, (
                f"Asymmetric passage: {coord} -> {passage.coord} but {passage.coord} does not have passage back"
            )


def test_single_connected_component(maze_5):
    """Traversing passages from any cell must reach all other cells."""
    all_cells = list(maze_5.grid.cells.values())
    start = all_cells[0]
    visited = set()
    queue = deque([start])
    visited.add(start)

    while queue:
        cell = queue.popleft()
        for neighbor in cell.passages:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)

    assert len(visited) == len(all_cells), f"Only {len(visited)} of {len(all_cells)} cells reachable via passages"


def _get_center_cells(mg):
    """Replicate the center cell identification logic from MazeGenerator."""
    center_row = mg.grid.rows / 2 - 0.5
    center_cells = []
    for cell in mg.grid.cells.values():
        vertical_distance_from_center = abs(cell.row - center_row) - 0.5
        if vertical_distance_from_center >= mg.center_hex_radius:
            continue
        side_offset = (mg.radius - mg.center_hex_radius) * 2 + vertical_distance_from_center
        if cell.col >= side_offset and cell.col < mg.grid.cols - side_offset:
            center_cells.append(cell)
    return center_cells


def test_center_hex_cells_fully_connected(maze_5_center):
    """When center_hex_radius > 0, all center cells must have passages to all their center neighbors."""
    center_cells = _get_center_cells(maze_5_center)
    assert len(center_cells) > 0, "Expected center cells but found none"

    center_set = set(center_cells)
    for cell in center_cells:
        for neighbor in cell.neighbors:
            if neighbor in center_set:
                assert neighbor in cell.passages, (
                    f"Center cell {cell.coord} missing passage to center neighbor {neighbor.coord}"
                )


def test_exit_cell_is_border(maze_5):
    """The exit_cell must be a border cell (fewer than 3 neighbors)."""
    assert len(maze_5.exit_cell.neighbors) < 3, (
        f"Exit cell {maze_5.exit_cell.coord} has {len(maze_5.exit_cell.neighbors)} neighbors, expected fewer than 3"
    )


def test_solution_path_starts_at_start(maze_5):
    """The solution_path must start at start_cell."""
    assert maze_5.solution_path[0] == maze_5.start_cell, (
        f"Solution path starts at {maze_5.solution_path[0].coord}, expected start_cell {maze_5.start_cell.coord}"
    )


def test_solution_path_ends_at_exit(maze_5):
    """The solution_path must end at exit_cell."""
    assert maze_5.solution_path[-1] == maze_5.exit_cell, (
        f"Solution path ends at {maze_5.solution_path[-1].coord}, expected exit_cell {maze_5.exit_cell.coord}"
    )


def test_solution_path_consecutive_passages(maze_5):
    """Each consecutive pair of cells in solution_path must share a passage."""
    path = maze_5.solution_path
    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        assert b in a.passages, f"No passage between consecutive solution cells {a.coord} and {b.coord} at index {i}"
        assert a in b.passages, (
            f"Passage not symmetric between consecutive solution cells {a.coord} and {b.coord} at index {i}"
        )


def test_minimum_hex_side_generates_valid_maze(maze_3):
    """hex_side=3 (minimum viable size) must produce a valid maze."""
    # All cells visited
    for coord, cell in maze_3.grid.cells.items():
        assert cell.visited, f"Cell {coord} not visited in hex_side=3 maze"

    # Passages symmetric
    for coord, cell in maze_3.grid.cells.items():
        for passage in cell.passages:
            assert cell in passage.passages

    # Single connected component
    all_cells = list(maze_3.grid.cells.values())
    start = all_cells[0]
    visited = set()
    queue = deque([start])
    visited.add(start)
    while queue:
        cell = queue.popleft()
        for neighbor in cell.passages:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    assert len(visited) == len(all_cells)

    # Exit is border cell
    assert len(maze_3.exit_cell.neighbors) < 3

    # Solution path valid
    assert maze_3.solution_path[0] == maze_3.start_cell
    assert maze_3.solution_path[-1] == maze_3.exit_cell
    for i in range(len(maze_3.solution_path) - 1):
        assert maze_3.solution_path[i + 1] in maze_3.solution_path[i].passages


# ---------------------------------------------------------------------------
# Property-based tests (Hypothesis)
# ---------------------------------------------------------------------------

hex_sides = st.sampled_from([3, 5, 7, 9])


def center_radii(hex_side):
    max_r = hex_side - 2
    return st.integers(min_value=0, max_value=max(0, max_r)).filter(lambda r: r == 0 or r % 2 == 1)


@given(data=st.data())
@settings(max_examples=100)
def test_perfect_maze_invariant(data):
    """For any valid hex_side and center_hex_radius, after generate():
    (a) every cell is visited,
    (b) passages form a single connected component,
    (c) passages are symmetric (A->B implies B->A).
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    cells = mg.grid.cells

    # (a) All cells visited
    for coord, cell in cells.items():
        assert cell.visited, f"Cell {coord} not visited"

    # (b) Single connected component via BFS over passages
    all_cells = list(cells.values())
    visited = set()
    queue = deque([all_cells[0]])
    visited.add(all_cells[0])
    while queue:
        cell = queue.popleft()
        for neighbor in cell.passages:
            if neighbor not in visited:
                visited.add(neighbor)
                queue.append(neighbor)
    assert len(visited) == len(all_cells), f"Only {len(visited)}/{len(all_cells)} cells reachable"

    # (c) Symmetric passages
    for coord, cell in cells.items():
        for passage in cell.passages:
            assert cell in passage.passages, f"Asymmetric: {coord}->{passage.coord}"


@given(data=st.data())
@settings(max_examples=100)
def test_center_hexagon_fully_connected(data):
    """For any maze with center_hex_radius > 0, all cells within the
    center hexagon region have passages to every one of their neighbors
    that is also in the center region.
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(
        center_radii(hex_side).filter(lambda r: r > 0),
        label="center_hex_radius",
    )

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    center_cells = _get_center_cells(mg)
    assert len(center_cells) > 0, f"Expected center cells for center_hex_radius={cr}"

    center_set = set(center_cells)
    for cell in center_cells:
        for neighbor in cell.neighbors:
            if neighbor in center_set:
                assert neighbor in cell.passages, (
                    f"Center cell {cell.coord} missing passage to center neighbor {neighbor.coord}"
                )


@given(data=st.data())
@settings(max_examples=100)
def test_valid_solution_path(data):
    """For any generated maze, the solution_path starts at start_cell,
    ends at exit_cell, the exit_cell is a border cell (fewer than 3
    neighbors), and each consecutive pair of cells shares a passage.
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    path = mg.solution_path
    assert len(path) >= 2, "Solution path must have at least 2 cells"

    assert path[0] == mg.start_cell, f"Path starts at {path[0].coord}, expected start_cell {mg.start_cell.coord}"
    assert path[-1] == mg.exit_cell, f"Path ends at {path[-1].coord}, expected exit_cell {mg.exit_cell.coord}"

    assert len(mg.exit_cell.neighbors) < 3, (
        f"Exit cell {mg.exit_cell.coord} has {len(mg.exit_cell.neighbors)} neighbors, expected fewer than 3"
    )

    for i in range(len(path) - 1):
        a, b = path[i], path[i + 1]
        assert b in a.passages, f"No passage from {a.coord} to {b.coord} at index {i}"

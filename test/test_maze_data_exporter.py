"""Property-based tests for MazeDataExporter.

Feature: playable-maze-game
"""

import json
import os
import re
import tempfile

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from generate_maze_data import generate_maze_data
from src.maze_data_exporter import MazeDataExporter
from src.maze_generator import MazeGenerator

# Strategy: hex_side from 3 to 15
hex_sides = st.integers(min_value=3, max_value=15)


def center_radii(hex_side: int):
    """Generate valid center_hex_radius values for a given hex_side.

    Must be 0 or an odd number up to hex_side - 2.
    """
    max_r = hex_side - 2
    if max_r < 1:
        return st.just(0)
    return st.integers(min_value=0, max_value=max_r).filter(lambda r: r == 0 or r % 2 == 1)


@given(data=st.data())
@settings(max_examples=100)
def test_maze_data_round_trip(data):
    """Property 1: Maze data round-trip

    For any valid generated maze (any hex_side 3-15 and
    center_hex_radius), exporting the maze to JSON and then
    reconstructing the cell set and passage set from that JSON
    should produce sets equivalent to the original maze's cells
    and passages.

    **Validates: Requirements 1.1, 1.3, 1.4**

    Tag: Feature: playable-maze-game, Property 1: Maze data round-trip
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    exporter = MazeDataExporter(mg)

    # Export to JSON string and parse back
    json_str = exporter.export_json()
    parsed = json.loads(json_str)

    # --- Reconstruct cell set from JSON ---
    reconstructed_cells = {(c["row"], c["col"]) for c in parsed["cells"]}

    # Original cell set from the grid
    original_cells = set(mg.grid.cells.keys())

    assert reconstructed_cells == original_cells, (
        f"Cell sets differ. "
        f"Missing from JSON: {original_cells - reconstructed_cells}, "
        f"Extra in JSON: {reconstructed_cells - original_cells}"
    )

    # --- Reconstruct passage set from JSON ---
    # Each passage in JSON is [[r1, c1], [r2, c2]]
    # Normalize as frozenset of tuples for undirected comparison
    reconstructed_passages = set()
    for pair in parsed["passages"]:
        a = tuple(pair[0])
        b = tuple(pair[1])
        reconstructed_passages.add(frozenset([a, b]))

    # Original passage set from the grid (deduplicated)
    original_passages = set()
    for cell in mg.grid.cells.values():
        for neighbor in cell.passages:
            edge = frozenset([cell.coord, neighbor.coord])
            original_passages.add(edge)

    assert reconstructed_passages == original_passages, (
        f"Passage sets differ. "
        f"Missing from JSON: {original_passages - reconstructed_passages}, "
        f"Extra in JSON: {reconstructed_passages - original_passages}"
    )

    # --- Verify grid metadata round-trips ---
    assert parsed["rows"] == mg.grid.rows
    assert parsed["cols"] == mg.grid.cols
    assert parsed["centerHexRadius"] == mg.center_hex_radius

    # --- Verify cell orientation round-trips ---
    orientation_map = {(c["row"], c["col"]): c["upward"] for c in parsed["cells"]}
    for coord, cell in mg.grid.cells.items():
        assert orientation_map[coord] == cell.is_upward, (
            f"Cell {coord} orientation mismatch: expected {cell.is_upward}, got {orientation_map[coord]}"
        )


@given(data=st.data())
@settings(max_examples=100)
def test_passage_deduplication(data):
    """Property 2: Passage deduplication

    For any valid generated maze, the number of passage pairs in
    the exported dict should equal the number of unique undirected
    passage edges in the maze grid. Each bidirectional passage A↔B
    appears exactly once in the export.

    **Validates: Requirements 1.2**

    Tag: Feature: playable-maze-game, Property 2: Passage deduplication
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    exporter = MazeDataExporter(mg)
    exported = exporter.export()

    # Count passage pairs in the exported dict
    exported_passage_count = len(exported["passages"])

    # Count unique undirected edges in the original grid
    unique_edges: set[frozenset[tuple[int, int]]] = set()
    for cell in mg.grid.cells.values():
        for neighbor in cell.passages:
            edge = frozenset([cell.coord, neighbor.coord])
            unique_edges.add(edge)

    grid_edge_count = len(unique_edges)

    assert exported_passage_count == grid_edge_count, (
        f"Passage count mismatch: exported {exported_passage_count} "
        f"pairs but grid has {grid_edge_count} unique undirected edges"
    )


# ── Unit tests for MazeDataExporter and generate_maze_data ──


def _make_maze(hex_side=5, center_hex_radius=3):
    """Helper: create and generate a maze, return the generator."""
    mg = MazeGenerator(
        hex_side=hex_side,
        center_hex_radius=center_hex_radius,
    )
    mg.generate()
    return mg


class TestMazeDataExporterUnit:
    """Unit tests for MazeDataExporter."""

    def test_export_json_is_parseable(self):
        """Exported JSON string is valid JSON."""
        mg = _make_maze()
        exporter = MazeDataExporter(mg)
        parsed = json.loads(exporter.export_json())
        assert isinstance(parsed, dict)

    def test_export_has_correct_schema_keys(self):
        """Exported dict contains all required top-level keys."""
        mg = _make_maze()
        exporter = MazeDataExporter(mg)
        data = exporter.export()
        expected_keys = {
            "rows",
            "cols",
            "cellSize",
            "centerHexRadius",
            "margin",
            "stretch",
            "cells",
            "passages",
            "entryCell",
            "goalCells",
        }
        assert set(data.keys()) == expected_keys

    def test_cells_have_correct_fields(self):
        """Each cell dict has row, col, and upward fields."""
        mg = _make_maze()
        data = MazeDataExporter(mg).export()
        for cell in data["cells"]:
            assert "row" in cell
            assert "col" in cell
            assert "upward" in cell
            assert isinstance(cell["row"], int)
            assert isinstance(cell["col"], int)
            assert isinstance(cell["upward"], bool)

    def test_passages_are_coordinate_pairs(self):
        """Each passage is a list of two [row, col] pairs."""
        mg = _make_maze()
        data = MazeDataExporter(mg).export()
        for passage in data["passages"]:
            assert len(passage) == 2
            for coord in passage:
                assert len(coord) == 2
                assert isinstance(coord[0], int)
                assert isinstance(coord[1], int)

    def test_entry_cell_matches_exit_cell(self):
        """entryCell in export matches the generator's exit_cell."""
        mg = _make_maze()
        data = MazeDataExporter(mg).export()
        assert data["entryCell"] == [
            mg.exit_cell.row,
            mg.exit_cell.col,
        ]

    def test_goal_cells_match_center_region(self):
        """goalCells match the cells identified by the center
        region logic in _create_open_center."""
        mg = _make_maze(hex_side=7, center_hex_radius=3)
        data = MazeDataExporter(mg).export()

        # Replicate center region detection
        grid = mg.grid
        center_row = grid.rows / 2 - 0.5
        expected_goals = []
        for cell in grid.cells.values():
            vd = abs(cell.row - center_row) - 0.5
            if vd >= mg.center_hex_radius:
                continue
            side_offset = (mg.radius - mg.center_hex_radius) * 2 + vd
            if cell.col >= side_offset and cell.col < grid.cols - side_offset:
                expected_goals.append([cell.row, cell.col])

        assert sorted(data["goalCells"]) == sorted(expected_goals)

    def test_goal_cells_empty_when_no_center(self):
        """goalCells is empty when center_hex_radius is 0."""
        mg = _make_maze(hex_side=5, center_hex_radius=0)
        data = MazeDataExporter(mg).export()
        assert data["goalCells"] == []

    def test_raises_value_error_when_not_generated(self):
        """ValueError raised if maze not generated before export."""
        mg = MazeGenerator(hex_side=5, center_hex_radius=0)
        # Don't call mg.generate()
        exporter = MazeDataExporter(mg)
        with pytest.raises(ValueError, match="not been generated"):
            exporter.export()

    def test_raises_value_error_for_export_json(self):
        """ValueError raised from export_json() too."""
        mg = MazeGenerator(hex_side=5, center_hex_radius=0)
        exporter = MazeDataExporter(mg)
        with pytest.raises(ValueError, match="not been generated"):
            exporter.export_json()


class TestGenerateMazeData:
    """Unit tests for generate_maze_data function."""

    def test_creates_maze_files(self, tmp_path):
        """generate_maze_data creates the expected maze JSON files."""
        generate_maze_data(
            output_dir=str(tmp_path),
            num_mazes=2,
            hex_side=5,
            center_hex_radius=3,
        )
        assert (tmp_path / "maze_1.json").exists()
        assert (tmp_path / "maze_2.json").exists()

    def test_creates_index_json(self, tmp_path):
        """generate_maze_data creates index.json."""
        generate_maze_data(
            output_dir=str(tmp_path),
            num_mazes=2,
            hex_side=5,
            center_hex_radius=3,
        )
        assert (tmp_path / "index.json").exists()

    def test_index_json_lists_all_mazes(self, tmp_path):
        """index.json lists all generated maze filenames."""
        generate_maze_data(
            output_dir=str(tmp_path),
            num_mazes=3,
            hex_side=5,
            center_hex_radius=3,
        )
        with open(tmp_path / "index.json") as f:
            index = json.load(f)
        assert index["mazes"] == [
            "maze_1.json",
            "maze_2.json",
            "maze_3.json",
        ]

    def test_maze_files_are_valid_json(self, tmp_path):
        """Each generated maze file is valid parseable JSON."""
        generate_maze_data(
            output_dir=str(tmp_path),
            num_mazes=2,
            hex_side=5,
            center_hex_radius=3,
        )
        for name in ["maze_1.json", "maze_2.json"]:
            with open(tmp_path / name) as f:
                data = json.load(f)
            assert "cells" in data
            assert "passages" in data
            assert "entryCell" in data
            assert "goalCells" in data

    def test_creates_output_directory(self, tmp_path):
        """generate_maze_data creates the output dir if missing."""
        out = tmp_path / "nested" / "dir"
        generate_maze_data(
            output_dir=str(out),
            num_mazes=1,
            hex_side=5,
            center_hex_radius=3,
        )
        assert out.is_dir()
        assert (out / "maze_1.json").exists()
        assert (out / "index.json").exists()


# ── Patterns that indicate external CDN / remote resource references ──
# The first pattern excludes xmlns namespace declarations (e.g. xmlns="http://www.w3.org/2000/svg")
# which are standard XML/SVG attributes, not external resource fetches.
_EXTERNAL_REF_PATTERNS = [
    re.compile(r'(?<!xmlns=")(?<!href=")https?://(?!www\.w3\.org/)', re.IGNORECASE),
    re.compile(r"//cdn\.", re.IGNORECASE),
    re.compile(r"//unpkg\.", re.IGNORECASE),
    re.compile(r"//cdnjs\.", re.IGNORECASE),
]

# Paths to the static game files (relative to project root)
_STATIC_GAME_FILES = [
    os.path.join("game", "index.html"),
    os.path.join("game", "game.css"),
    os.path.join("game", "game.js"),
]


@given(
    num_mazes=st.integers(min_value=1, max_value=5),
    hex_side=st.integers(min_value=3, max_value=10),
)
@settings(max_examples=30)
def test_static_file_structure(num_mazes, hex_side):
    """Property 3: Static file structure

    After generating maze data, verify game/data/ contains valid
    JSON files listed in index.json. Verify game/index.html,
    game/game.css, game/game.js contain no external CDN or remote
    resource references.

    **Validates: Requirements 2.1, 2.2, 2.3**

    Tag: Feature: playable-maze-game, Property 3: Static file structure
    """
    # Derive a valid center_hex_radius for the given hex_side.
    # Must be 0 or odd, and <= hex_side - 2.
    max_r = hex_side - 2
    if max_r >= 3:
        center_hex_radius = 3
    elif max_r >= 1:
        center_hex_radius = 1
    else:
        center_hex_radius = 0

    with tempfile.TemporaryDirectory() as tmp_dir:
        output_dir = os.path.join(tmp_dir, "data")
        generate_maze_data(
            output_dir=output_dir,
            num_mazes=num_mazes,
            hex_side=hex_side,
            center_hex_radius=center_hex_radius,
        )

        # ── 1. index.json exists and is valid JSON ──
        index_path = os.path.join(output_dir, "index.json")
        assert os.path.isfile(index_path), "index.json must exist"
        with open(index_path) as f:
            index_data = json.load(f)
        assert "mazes" in index_data, "index.json must have a 'mazes' key"

        # ── 2. Each file listed in index.json exists and is valid JSON ──
        maze_filenames = index_data["mazes"]
        assert len(maze_filenames) == num_mazes, f"Expected {num_mazes} maze files, got {len(maze_filenames)}"
        for filename in maze_filenames:
            maze_path = os.path.join(output_dir, filename)
            assert os.path.isfile(maze_path), f"Maze file {filename} listed in index.json must exist"
            with open(maze_path) as f:
                maze_data = json.load(f)
            # Basic schema check
            assert isinstance(maze_data, dict), f"{filename} must contain a JSON object"
            for key in ("cells", "passages", "entryCell", "goalCells"):
                assert key in maze_data, f"{filename} must contain key '{key}'"

    # ── 3. Static game files contain no external CDN/remote refs ──
    for filepath in _STATIC_GAME_FILES:
        assert os.path.isfile(filepath), f"Static game file {filepath} must exist"
        with open(filepath) as f:
            content = f.read()
        for pattern in _EXTERNAL_REF_PATTERNS:
            assert not pattern.search(content), (
                f"{filepath} must not contain external references matching {pattern.pattern!r}"
            )

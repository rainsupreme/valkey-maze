# Valkey Maze

A puzzle generator that creates hexagonal mazes and word search puzzles themed around [Valkey](https://valkey.io). Designed to produce printable placemats with a maze on one side and a word search on the other.

## Setup

Requires Python 3.10+.

```bash
# Install in editable mode (runtime dependency: svgwrite)
pip install -e .

# Include dev tools (pytest, hypothesis, ruff, mypy)
pip install -e ".[dev]"
```

## Usage

### Generate placemats

The main entry point produces an HTML file with paired maze/word search pages, plus an answer key:

```bash
# Generate 10 placemats (default)
python generate_placemats.py

# Generate a specific number
python generate_placemats.py 5
```

Output files:
- `placemats.html` — printable placemats (landscape, duplex-ready)
- `answer_key.html` — solutions for all puzzles

Words are loaded from `words.txt`. Lines ending with `# hidden` are placed in the grid but hidden from the displayed word list.

### Standalone examples

```bash
# Generate a single hexagonal maze
python example_maze.py
# Output: hexagonal_maze.svg

# Generate a single word search
python example_word_search.py
# Output: word_search.svg, word_search_solution.svg
```

### Logo alignment utility

```bash
# Align the Valkey logo SVG for use in maze centers
python align_hexagon.py
# Input: assets/valkey-logo.svg → Output: assets/valkey-logo-aligned.svg
```

## Core API

### MazeGenerator

Generates a hexagonal maze on a triangular grid using randomized DFS.

```python
from src.maze_generator import MazeGenerator

maze = MazeGenerator(hex_side=25, center_hex_radius=11)
maze.generate()

# Render to file
maze.render_maze("maze.svg", logo_svg="assets/valkey-logo-aligned.svg")

# Render to string (for embedding in HTML)
svg_string = maze.render_maze_string(show_solution=True)
```

### WordSearchGenerator

Creates a word search puzzle with banned-word filtering.

```python
from src.word_search_generator import WordSearchGenerator

ws = WordSearchGenerator(size=18)
ws.add_words(["VALKEY", "CACHE", "PERFORMANCE"])

# Render puzzle and solution
ws.render_svg("puzzle.svg")
ws.render_solution("solution.svg")

# Render to string with filtered display words
svg = ws.render_svg_string(display_words=["VALKEY", "CACHE"])
```

### TriangularGrid

Low-level triangular grid used by MazeGenerator. Supports both rectangular and hexagonal layouts.

```python
from src.triangular_grid import TriangularGrid

grid = TriangularGrid(rows=10, cols=10, hexagonal=True, hex_side=9)
```

## Testing

The project uses pytest with Hypothesis for property-based testing. The test suite includes 15 correctness properties covering maze generation, word placement, SVG rendering, and edge cases.

```bash
# Run all tests
pytest

# Run with verbose output
pytest -v

# Run a specific test file
pytest test/test_maze_generator.py
```

## Linting and formatting

Configured via ruff (settings in `pyproject.toml`):

```bash
ruff check .
ruff format --check .
```

## Project structure

```
├── generate_placemats.py      # Main entry point — placemat generation
├── example_maze.py            # Standalone maze example
├── example_word_search.py     # Standalone word search example
├── align_hexagon.py           # SVG logo alignment utility
├── words.txt                  # Word list (# hidden suffix for hidden words)
├── pyproject.toml             # Project config, dependencies, ruff/pytest settings
├── assets/
│   ├── valkey-logo.svg        # Original Valkey logo
│   └── valkey-logo-aligned.svg  # Hexagon-aligned logo for maze centers
├── src/
│   ├── maze_generator.py      # MazeGenerator class
│   ├── word_search_generator.py  # WordSearchGenerator class
│   ├── triangular_grid.py     # TriangularGrid and TriangleCell
│   └── banned_words.txt       # Words to avoid in random grid fill
└── test/
    ├── test_maze_generator.py
    ├── test_word_search_generator.py
    ├── test_svg_rendering.py
    ├── test_edge_cases.py
    ├── test_load_words.py
    ├── test_banned_words.py
    └── test_triangular_grid.py
```

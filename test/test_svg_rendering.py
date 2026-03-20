"""Unit tests for SVG rendering output."""

import random
import re

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.maze_generator import MazeGenerator
from src.word_search_generator import WordSearchGenerator

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _normalize_marker_ids(svg: str) -> str:
    """Normalize auto-incrementing svgwrite marker IDs for comparison."""
    return re.sub(r"id\d+", "idN", svg)


def _extract_word_list_texts(svg: str) -> list[str]:
    """Extract the word names shown in the word-list section of the SVG."""
    texts = re.findall(r"<text [^>]*>([^<]*)</text>", svg)
    try:
        idx = texts.index("Words:")
        return texts[idx + 1 :]
    except ValueError:
        return []


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def maze():
    """A hex_side=5 maze with a fixed seed."""
    random.seed(42)
    mg = MazeGenerator(hex_side=5)
    mg.generate()
    return mg


@pytest.fixture
def word_search():
    """A 10x10 word search with several words placed, fixed seed."""
    random.seed(42)
    ws = WordSearchGenerator(size=10, banned_words_file=None)
    ws.add_words(["VALKEY", "CACHE", "REDIS", "DATA"])
    return ws


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_maze_svg_has_svg_root(maze):
    """render_maze_string() must return a string containing an <svg root element."""
    svg = maze.render_maze_string()
    assert "<svg " in svg or svg.startswith("<svg"), "SVG output does not contain an <svg root element"


def test_maze_svg_idempotent(maze):
    """Two calls to render_maze_string() on the same maze produce identical output
    (after normalizing auto-incrementing marker IDs from svgwrite)."""
    svg1 = maze.render_maze_string()
    svg2 = maze.render_maze_string()
    assert _normalize_marker_ids(svg1) == _normalize_marker_ids(svg2), "render_maze_string() is not idempotent"


def test_maze_solution_svg_contains_lines(maze):
    """render_maze_string(show_solution=True) must contain line elements for
    the solution path — at least N-1 lines for N cells in the path."""
    svg_no_sol = maze.render_maze_string(show_solution=False)
    svg_sol = maze.render_maze_string(show_solution=True)

    lines_without = len(re.findall(r"<line ", svg_no_sol))
    lines_with = len(re.findall(r"<line ", svg_sol))
    expected_solution_lines = len(maze.solution_path) - 1

    extra_lines = lines_with - lines_without
    assert extra_lines >= expected_solution_lines, (
        f"Expected at least {expected_solution_lines} extra line elements for solution path, got {extra_lines}"
    )


def test_word_search_svg_text_per_cell(word_search):
    """render_svg_string() must contain at least S² text elements (one per cell)."""
    svg = word_search.render_svg_string()
    text_count = len(re.findall(r"<text ", svg))
    grid_cells = word_search.size**2
    assert text_count >= grid_cells, (
        f"Expected at least {grid_cells} <text elements for a "
        f"{word_search.size}x{word_search.size} grid, got {text_count}"
    )


def test_word_search_svg_display_words_subset(word_search):
    """render_svg_string(display_words=subset) must only show the subset words
    in the word list section."""
    subset = ["VALKEY", "CACHE"]
    svg = word_search.render_svg_string(display_words=subset)
    displayed = _extract_word_list_texts(svg)
    assert set(displayed) == set(subset), f"Expected word list to contain {subset}, got {displayed}"


def test_solution_svg_contains_lines_for_placed_words(word_search):
    """render_solution_svg_string() must contain at least one line element
    per placed word."""
    svg = word_search.render_solution_svg_string()
    line_count = len(re.findall(r"<line ", svg))
    placed_count = len(word_search.placed_words)
    assert line_count >= placed_count, (
        f"Expected at least {placed_count} <line elements for {placed_count} placed words, got {line_count}"
    )


# ---------------------------------------------------------------------------
# Property-Based Tests (Hypothesis)
# ---------------------------------------------------------------------------

hex_sides = st.sampled_from([3, 5, 7, 9])


def center_radii(hex_side):
    max_r = hex_side - 2
    return st.integers(min_value=0, max_value=max(0, max_r)).filter(lambda r: r == 0 or r % 2 == 1)


word_lists = st.lists(
    st.text(
        alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        min_size=2,
        max_size=8,
    ),
    min_size=1,
    max_size=5,
    unique=True,
)


@given(data=st.data())
@settings(max_examples=100, deadline=None)
def test_property_maze_svg_valid_and_idempotent(data):
    """For any generated maze, render_maze_string() returns a string
    containing an <svg root element, and calling it twice with the
    same parameters produces identical output.
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    svg1 = mg.render_maze_string()
    svg2 = mg.render_maze_string()

    assert "<svg " in svg1 or svg1.startswith("<svg"), "SVG output does not contain an <svg root element"
    assert _normalize_marker_ids(svg1) == _normalize_marker_ids(svg2), "render_maze_string() is not idempotent"


@given(data=st.data())
@settings(max_examples=100, deadline=None)
def test_property_solution_svg_contains_path_lines(data):
    """For any generated maze with N cells in the solution_path,
    render_maze_string(show_solution=True) produces SVG containing
    at least N-1 <line elements (one per consecutive pair in the path).
    """
    hex_side = data.draw(hex_sides, label="hex_side")
    cr = data.draw(center_radii(hex_side), label="center_hex_radius")

    mg = MazeGenerator(hex_side=hex_side, center_hex_radius=cr)
    mg.generate()

    svg_no_sol = mg.render_maze_string(show_solution=False)
    svg_sol = mg.render_maze_string(show_solution=True)

    lines_without = len(re.findall(r"<line ", svg_no_sol))
    lines_with = len(re.findall(r"<line ", svg_sol))
    expected = len(mg.solution_path) - 1

    extra_lines = lines_with - lines_without
    assert extra_lines >= expected, (
        f"Expected at least {expected} extra <line elements for solution path, got {extra_lines}"
    )


@given(words=word_lists)
@settings(max_examples=100, deadline=None)
def test_property_word_search_svg_text_count(words):
    """For any word search of size S, render_svg_string() produces SVG
    containing at least S^2 <text elements (one per grid cell).
    """
    ws = WordSearchGenerator(size=10, banned_words_file=None)
    ws.add_words(words)

    svg = ws.render_svg_string()
    text_count = len(re.findall(r"<text ", svg))
    grid_cells = ws.size**2

    assert text_count >= grid_cells, (
        f"Expected at least {grid_cells} <text elements for a {ws.size}x{ws.size} grid, got {text_count}"
    )


@given(words=word_lists, data=st.data())
@settings(max_examples=100, deadline=None)
def test_property_display_words_filtering(words, data):
    """For any word search with placed words and any subset passed as
    display_words, the word list section of the SVG output from
    render_svg_string(display_words=subset) contains only the words
    in that subset.
    """
    ws = WordSearchGenerator(size=15, banned_words_file=None)
    ws.add_words(words)

    placed = [w for w, *_ in ws.placed_words]
    if not placed:
        return  # nothing to test if no words were placed

    subset_size = data.draw(
        st.integers(min_value=0, max_value=len(placed)),
        label="subset_size",
    )
    subset = data.draw(
        st.sampled_from(
            sorted(set(tuple(sorted(random.sample(placed, subset_size))) for _ in range(min(20, max(1, subset_size)))))
        )
        if subset_size > 0
        else st.just(()),
        label="subset",
    )
    subset = list(subset)

    svg = ws.render_svg_string(display_words=subset)
    displayed = _extract_word_list_texts(svg)

    assert set(displayed) == set(subset), f"Expected word list {subset}, got {displayed}"


@given(words=word_lists)
@settings(max_examples=100, deadline=None)
def test_property_solution_svg_lines_per_placed_word(words):
    """For any word search with N placed words,
    render_solution_svg_string() produces SVG containing at least
    N <line elements.
    """
    ws = WordSearchGenerator(size=15, banned_words_file=None)
    ws.add_words(words)

    svg = ws.render_solution_svg_string()
    line_count = len(re.findall(r"<line ", svg))
    placed_count = len(ws.placed_words)

    assert line_count >= placed_count, (
        f"Expected at least {placed_count} <line elements for {placed_count} placed words, got {line_count}"
    )


@given(words=word_lists)
@settings(max_examples=100, deadline=None)
def test_property_file_writing_matches_string_methods(words):
    """For any WordSearchGenerator instance, the content written by
    render_svg(filename) is identical to render_svg_string(), and
    the content written by render_solution(filename) is identical
    to render_solution_svg_string().
    """
    import os
    import tempfile

    ws = WordSearchGenerator(size=10, banned_words_file=None)
    ws.add_words(words)

    with tempfile.TemporaryDirectory() as tmp_dir:
        svg_file = os.path.join(tmp_dir, "puzzle.svg")
        ws.render_svg(svg_file)
        with open(svg_file, "r") as f:
            file_content = f.read()
        string_content = ws.render_svg_string()
        assert file_content == string_content, "render_svg(file) content differs from render_svg_string()"

        sol_file = os.path.join(tmp_dir, "solution.svg")
        ws.render_solution(sol_file)
        with open(sol_file, "r") as f:
            sol_file_content = f.read()
        sol_string_content = ws.render_solution_svg_string()

        # render_solution() uses svgwrite.Drawing(filename, ...) +
        # dwg.save(), which prepends an XML declaration that
        # dwg.tostring() (used by render_solution_svg_string) omits.
        normalized_file = re.sub(r"^<\?xml [^?]*\?>\n?", "", sol_file_content)

        assert normalized_file == sol_string_content, (
            "render_solution(file) content differs from render_solution_svg_string() (after XML declaration strip)"
        )

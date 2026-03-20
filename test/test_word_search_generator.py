"""Unit tests for WordSearchGenerator word placement."""

import random

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from src.word_search_generator import WordSearchGenerator

# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def ws_basic():
    """A 15x15 word search with a few words placed, fixed seed."""
    random.seed(42)
    ws = WordSearchGenerator(size=15)
    ws.add_words(["VALKEY", "CACHE", "PERFORMANCE"])
    return ws


@pytest.fixture
def ws_small():
    """A small 8x8 word search with short words, fixed seed."""
    random.seed(99)
    ws = WordSearchGenerator(size=8)
    ws.add_words(["CAT", "DOG", "SUN"])
    return ws


# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_placed_words_readable_from_grid(ws_basic):
    """Each placed word can be read back from the grid at its recorded position."""
    for word, row, col, dr, dc in ws_basic.placed_words:
        chars = []
        for i in range(len(word)):
            r, c = row + i * dr, col + i * dc
            chars.append(ws_basic.grid[r][c])
        assert "".join(chars) == word, f"Word '{word}' at ({row},{col}) dir=({dr},{dc}) reads as '{''.join(chars)}'"


def test_placed_words_readable_small_grid(ws_small):
    """Readback check on a smaller grid with different words."""
    for word, row, col, dr, dc in ws_small.placed_words:
        chars = []
        for i in range(len(word)):
            r, c = row + i * dr, col + i * dc
            chars.append(ws_small.grid[r][c])
        assert "".join(chars) == word


def test_all_cells_filled_az(ws_basic):
    """Every cell in the grid must contain exactly one uppercase A-Z letter."""
    for r in range(ws_basic.size):
        for c in range(ws_basic.size):
            ch = ws_basic.grid[r][c]
            assert len(ch) == 1 and ch.isalpha() and ch.isupper(), f"Cell ({r},{c}) contains '{ch}', expected A-Z"


def test_all_cells_filled_az_small(ws_small):
    """Grid fill check on a smaller grid."""
    for r in range(ws_small.size):
        for c in range(ws_small.size):
            ch = ws_small.grid[r][c]
            assert len(ch) == 1 and "A" <= ch <= "Z", f"Cell ({r},{c}) contains '{ch}'"


def test_all_fitting_words_placed(ws_basic):
    """Words that fit within the grid size must all appear in placed_words."""
    expected = {"VALKEY", "CACHE", "PERFORMANCE"}
    placed = {w for w, *_ in ws_basic.placed_words}
    assert expected == placed, f"Missing words: {expected - placed}"


def test_all_short_words_placed():
    """Several short words on a large grid should all be placed."""
    random.seed(7)
    ws = WordSearchGenerator(size=15)
    words = ["AB", "CD", "EF", "GH", "IJ"]
    ws.add_words(words)
    placed = {w for w, *_ in ws.placed_words}
    for word in words:
        assert word in placed, f"'{word}' was not placed"


def test_can_place_conflict():
    """can_place() must return False when an existing letter conflicts."""
    ws = WordSearchGenerator(size=5, banned_words_file=None)
    ws.grid[0][0] = "A"
    # Trying to place "BCD" starting at (0,0) going right — 'B' conflicts with 'A'
    assert ws.can_place("BCD", 0, 0, 0, 1) is False


def test_can_place_out_of_bounds():
    """can_place() must return False when the word goes out of bounds."""
    ws = WordSearchGenerator(size=3, banned_words_file=None)
    # "ABCD" is length 4, grid is 3x3 — goes out of bounds
    assert ws.can_place("ABCD", 0, 0, 0, 1) is False


def test_can_place_matching_letters():
    """can_place() must return True when existing letters match the word."""
    ws = WordSearchGenerator(size=5, banned_words_file=None)
    ws.grid[0][0] = "H"
    ws.grid[0][1] = "E"
    # "HELLO" starts with H, E which already match
    assert ws.can_place("HELLO", 0, 0, 0, 1) is True


def test_can_place_empty_cells():
    """can_place() returns True when all cells along the path are empty."""
    ws = WordSearchGenerator(size=5, banned_words_file=None)
    assert ws.can_place("HELLO", 0, 0, 0, 1) is True


def _scan_grid_for_banned(ws):
    """Scan every position/direction for substrings matching banned words."""
    found = []
    for r in range(ws.size):
        for c in range(ws.size):
            for dr, dc in ws.DIRECTIONS:
                for length in range(2, 10):
                    chars = []
                    valid = True
                    for i in range(length):
                        nr, nc = r + i * dr, c + i * dc
                        if 0 <= nr < ws.size and 0 <= nc < ws.size:
                            chars.append(ws.grid[nr][nc])
                        else:
                            valid = False
                            break
                    if valid and len(chars) == length:
                        word = "".join(chars)
                        if word in ws.banned_words:
                            found.append(word)
    return found


def test_no_banned_words_in_grid(ws_basic):
    """After add_words(), no banned word should appear in any direction."""
    found = _scan_grid_for_banned(ws_basic)
    assert found == [], f"Banned words found in grid: {found}"


def test_no_banned_words_small_grid(ws_small):
    """Banned word scan on a smaller grid."""
    found = _scan_grid_for_banned(ws_small)
    assert found == [], f"Banned words found in grid: {found}"


# ---------------------------------------------------------------------------
# Property-Based Tests (Hypothesis)
# ---------------------------------------------------------------------------


@given(words=word_lists)
@settings(max_examples=100)
def test_property_placed_words_readable_from_grid(words):
    """For any set of words added to a WordSearchGenerator, each entry in
    placed_words can be read back from the grid by following the recorded
    (row, col, dr, dc).
    """
    ws = WordSearchGenerator(size=15, banned_words_file=None)
    ws.add_words(words)

    for word, row, col, dr, dc in ws.placed_words:
        chars = []
        for i in range(len(word)):
            r, c = row + i * dr, col + i * dc
            chars.append(ws.grid[r][c])
        assert "".join(chars) == word, f"Word '{word}' at ({row},{col}) dir=({dr},{dc}) reads as '{''.join(chars)}'"


@given(words=word_lists)
@settings(max_examples=100)
def test_property_grid_fully_filled(words):
    """For any set of words added to a WordSearchGenerator, every cell
    in the grid contains exactly one uppercase letter from A-Z.
    """
    ws = WordSearchGenerator(size=15, banned_words_file=None)
    ws.add_words(words)

    for r in range(ws.size):
        for c in range(ws.size):
            ch = ws.grid[r][c]
            assert len(ch) == 1 and "A" <= ch <= "Z", f"Cell ({r},{c}) contains '{ch}', expected A-Z"


@given(words=word_lists)
@settings(max_examples=100)
def test_property_all_fitting_words_placed(words):
    """For any list of words where every word's length is <= the grid
    size, after add_words() all words appear in placed_words.
    """
    grid_size = 15
    fitting = [w for w in words if len(w) <= grid_size]
    ws = WordSearchGenerator(size=grid_size, banned_words_file=None)
    ws.add_words(fitting)

    placed = {w for w, *_ in ws.placed_words}
    for word in fitting:
        assert word in placed, f"'{word}' (len {len(word)}) was not placed"


@given(words=word_lists, seed=st.integers(min_value=0, max_value=2**32 - 1))
@settings(max_examples=100, deadline=None)
def test_property_no_banned_words_in_grid(words, seed):
    """For any completed word search grid with the default banned words
    loaded, scanning every position in every direction for substrings
    of length 2-9 yields zero matches against the banned words set.
    """
    random.seed(seed)
    ws = WordSearchGenerator(size=15)

    banned = ws.banned_words

    def _contains_banned(text):
        for b in banned:
            if b in text:
                return True
        return False

    safe_words = []
    for w in words:
        if _contains_banned(w) or _contains_banned(w[::-1]):
            continue
        safe_words.append(w)

    # Remove words that could form banned substrings when
    # placed adjacent to any other word in the list.
    filtered = []
    for w in safe_words:
        dominated = False
        for other in safe_words:
            for combo in [
                w + other,
                other + w,
                w + other[::-1],
                other[::-1] + w,
                w[::-1] + other,
                other + w[::-1],
                w[::-1] + other[::-1],
                other[::-1] + w[::-1],
            ]:
                if _contains_banned(combo):
                    dominated = True
                    break
            if dominated:
                break
        if not dominated:
            filtered.append(w)
    safe_words = filtered

    ws.add_words(safe_words)

    found = _scan_grid_for_banned(ws)
    assert found == [], f"Banned words found in grid: {found}"

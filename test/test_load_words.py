"""Tests for word list loading and hidden word parsing."""

import os
import tempfile

from hypothesis import given, settings
from hypothesis import strategies as st

from generate_placemats import load_words

# ---------------------------------------------------------------------------
# Unit tests
# ---------------------------------------------------------------------------


def test_load_words_basic():
    """load_words returns all words and filters hidden ones from display list."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("VALKEY\nCACHE\nFIREDUCKS  # hidden\nRAIN  # hidden\n")
        f.flush()
        path = f.name
    try:
        all_words, display_words = load_words(path)
        assert all_words == ["VALKEY", "CACHE", "FIREDUCKS", "RAIN"]
        assert display_words == ["VALKEY", "CACHE"]
    finally:
        os.unlink(path)


def test_load_words_no_hidden():
    """When no words are hidden, all_words and display_words are identical."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("ALPHA\nBRAVO\nCHARLIE\n")
        f.flush()
        path = f.name
    try:
        all_words, display_words = load_words(path)
        assert all_words == display_words
    finally:
        os.unlink(path)


def test_load_words_all_hidden():
    """When all words are hidden, display_words is empty."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("SECRET  # hidden\nSPY  # hidden\n")
        f.flush()
        path = f.name
    try:
        all_words, display_words = load_words(path)
        assert all_words == ["SECRET", "SPY"]
        assert display_words == []
    finally:
        os.unlink(path)


def test_load_words_skips_blank_lines():
    """Blank lines in the file are ignored."""
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("HELLO\n\n\nWORLD\n")
        f.flush()
        path = f.name
    try:
        all_words, display_words = load_words(path)
        assert all_words == ["HELLO", "WORLD"]
    finally:
        os.unlink(path)


# ---------------------------------------------------------------------------
# Property-Based Tests (Hypothesis)
# ---------------------------------------------------------------------------

word_strategy = st.text(
    alphabet=st.sampled_from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    min_size=2,
    max_size=10,
)

word_entries = st.lists(
    st.tuples(word_strategy, st.booleans()),
    min_size=1,
    max_size=20,
)


@given(entries=word_entries)
@settings(max_examples=100)
def test_property_hidden_word_parsing(entries):
    """Parser returns all words for placement but marks hidden words as excluded from display."""
    lines = []
    expected_all = []
    expected_display = []
    for word, is_hidden in entries:
        if is_hidden:
            lines.append(f"{word}  # hidden")
        else:
            lines.append(word)
        expected_all.append(word)
        if not is_hidden:
            expected_display.append(word)

    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        f.write("\n".join(lines) + "\n")
        f.flush()
        path = f.name

    try:
        all_words, display_words = load_words(path)

        assert all_words == expected_all
        assert display_words == expected_display
        assert set(display_words).issubset(set(all_words))

        hidden_count = sum(1 for _, h in entries if h)
        assert len(all_words) - len(display_words) == hidden_count
    finally:
        os.unlink(path)

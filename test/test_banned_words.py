import sys
import os
import tempfile

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from word_search_generator import WordSearchGenerator


def test_is_safe_placement_detects_horizontal():
    gen = WordSearchGenerator(size=5, banned_words_file=None)
    gen.banned_words = {"BAD", "EVIL"}
    gen.grid[0] = ["B", "A", "", "", ""]
    assert not gen._is_safe_placement(0, 2, "D")  # Would form "BAD"
    assert gen._is_safe_placement(0, 2, "X")  # Safe


def test_is_safe_placement_detects_vertical():
    gen = WordSearchGenerator(size=5, banned_words_file=None)
    gen.banned_words = {"BAD"}
    gen.grid[0][0] = "B"
    gen.grid[1][0] = "A"
    assert not gen._is_safe_placement(2, 0, "D")  # Would form "BAD" vertically
    assert gen._is_safe_placement(2, 0, "X")  # Safe


def test_is_safe_placement_detects_diagonal():
    gen = WordSearchGenerator(size=5, banned_words_file=None)
    gen.banned_words = {"BAD"}
    gen.grid[0][0] = "B"
    gen.grid[1][1] = "A"
    assert not gen._is_safe_placement(2, 2, "D")  # Would form "BAD" diagonally
    assert gen._is_safe_placement(2, 2, "X")  # Safe


def test_is_safe_placement_middle_position():
    gen = WordSearchGenerator(size=5, banned_words_file=None)
    gen.banned_words = {"BAD"}
    gen.grid[0][0] = "B"
    gen.grid[0][2] = "D"
    assert not gen._is_safe_placement(0, 1, "A")  # Would form "BAD" with A in middle
    assert gen._is_safe_placement(0, 1, "X")  # Safe


def test_full_grid_no_banned_words():
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as f:
        f.write("FUCK\nSHIT\nASS\n")
        banned_file = f.name

    try:
        gen = WordSearchGenerator(size=10, banned_words_file=banned_file)
        gen.add_words(["CACHE", "DATA", "KEY"])

        # Scan entire grid for banned words
        banned_found = []
        for r in range(gen.size):
            for c in range(gen.size):
                for dr, dc in gen.DIRECTIONS:
                    for length in range(2, 10):
                        word = []
                        for i in range(length):
                            nr, nc = r + i * dr, c + i * dc
                            if 0 <= nr < gen.size and 0 <= nc < gen.size:
                                word.append(gen.grid[nr][nc])
                            else:
                                break
                        if len(word) == length:
                            word_str = "".join(word)
                            if word_str in gen.banned_words:
                                banned_found.append(word_str)

        assert len(banned_found) == 0, f"Found banned words: {banned_found}"
    finally:
        os.unlink(banned_file)


def test_load_banned_words_from_file():
    with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as f:
        f.write("word1\nword2\n\nword3\n")
        banned_file = f.name

    try:
        gen = WordSearchGenerator(size=5, banned_words_file=banned_file)
        assert gen.banned_words == {"WORD1", "WORD2", "WORD3"}
    finally:
        os.unlink(banned_file)


if __name__ == "__main__":
    test_is_safe_placement_detects_horizontal()
    test_is_safe_placement_detects_vertical()
    test_is_safe_placement_detects_diagonal()
    test_is_safe_placement_middle_position()
    test_full_grid_no_banned_words()
    test_load_banned_words_from_file()
    print("All tests passed!")

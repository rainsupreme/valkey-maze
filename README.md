# Valkey Maze

A puzzle generator that creates hexagonal mazes and word search puzzles themed around [Valkey](https://valkey.io). One shared JavaScript core powers both:

- **A browser game** ([play it here](https://rainsupreme.github.io/valkey-maze/)) — daily puzzles with difficulty tiers
- **Printable placemats** — a maze on one side and a word search on the other, with an answer key

## Setup

Requires Node.js 18+.

```bash
npm ci
```

## Usage

### Generate placemats

Produces an HTML file with paired maze/word search pages, plus an answer key:

```bash
# Generate 10 placemats (default)
npm run placemats

# Custom batch
npm run placemats -- --count 5 --seed 42 --out-dir out/
```

Options: `--count N`, `--seed S` (placemat *i* uses seed S+i, so batches are reproducible), `--hex-side N`, `--center-radius N`, `--ws-size N`, `--words PATH`, `--out-dir PATH`.

Output files:
- `placemats.html` — printable placemats (landscape, duplex-ready)
- `answer_key.html` — solutions for all puzzles

Words are loaded from `words.txt`. Lines ending with `# hidden` are placed in the grid but hidden from the displayed word list (they still appear in the answer key).

### Run the game locally

The game is static files — serve the repo root and open `/game/`:

```bash
python3 -m http.server 8000 --bind 127.0.0.1
# then open http://127.0.0.1:8000/game/
```

The puzzle panel includes difficulty tiers, a daily puzzle (seeded from the date), and a **Show Solution** cheat toggle.

## Architecture

```
├── core/                      # Environment-free puzzle engine (browser + Node)
│   ├── prng.js                # Seeded PRNG (mulberry32) + date seeds
│   ├── hex-grid.js            # Triangular-cell hex lattice
│   ├── maze.js                # Maze generator (emits solutionPath)
│   ├── wordsearch.js          # Word search generator (emits placedWords)
│   ├── render/
│   │   ├── maze-svg.js        # Maze → SVG string (solution overlay mode)
│   │   └── wordsearch-svg.js  # Word search → SVG string (solution mode)
│   ├── data/banned-words.txt  # Words excluded from random grid fill
│   └── test/
├── game/                      # Browser game (imports core/)
│   ├── index.html, game.js, game.css, game.logic.js, difficulty.js
│   └── test/
├── print/                     # Placemat generation (imports core/)
│   ├── build-placemats.js     # CLI entry point
│   ├── placemats.js           # HTML composition
│   └── test/
├── assets/                    # Valkey logo (original + hexagon-aligned)
├── words.txt                  # Word list (# hidden suffix for hidden words)
└── align_hexagon.py           # One-off logo alignment utility (stdlib-only;
                               #   its output is already committed in assets/)
```

Design rules:

- **Generators are pure**: randomness comes from an injected seeded PRNG, so the same seed always produces the same puzzle in any environment.
- **Solutions are first-class**: every generator emits its solution as part of the puzzle data (`solutionPath`, `placedWords`). Renderers have solution-overlay modes; print always gets an answer key; the game gets a cheat toggle.
- **Renderers are data-in, string-out**: no DOM or file I/O in `core/` (the logo is passed as SVG source text).

## Testing

Vitest with fast-check for property-based testing — placement validity, banned-word absence, maze topology (wall counts, solution-path validity), and serialization round-trips.

```bash
npm test

# Single file
npx vitest run core/test/maze.property.test.js
```

## Contributing

Commits require a DCO sign-off (`git commit -s`); CI enforces it on pull requests.

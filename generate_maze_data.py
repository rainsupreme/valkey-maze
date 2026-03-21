#!/usr/bin/env python3
"""Generate maze JSON data files for the browser game.

Usage:
    python generate_maze_data.py
    python generate_maze_data.py --num-mazes 5 \
        --hex-side 20 --center-hex-radius 9
"""

from __future__ import annotations

import argparse
import json
import os
import random

from src.maze_data_exporter import MazeDataExporter
from src.maze_generator import MazeGenerator


def generate_maze_data(
    output_dir: str = "game/data",
    num_mazes: int = 3,
    hex_side: int = 25,
    center_hex_radius: int = 11,
) -> None:
    """Generate maze JSON files for the web game."""
    os.makedirs(output_dir, exist_ok=True)

    filenames: list[str] = []

    for i in range(1, num_mazes + 1):
        seed = random.randint(0, 2**32 - 1)
        random.seed(seed)

        maze = MazeGenerator(
            hex_side=hex_side,
            center_hex_radius=center_hex_radius,
        )
        maze.generate()

        exporter = MazeDataExporter(maze)
        maze_json = exporter.export_json()

        filename = f"maze_{i}.json"
        filepath = os.path.join(output_dir, filename)
        with open(filepath, "w") as f:
            f.write(maze_json)

        filenames.append(filename)
        print(f"Generated {filepath} (seed={seed})")

    index_path = os.path.join(output_dir, "index.json")
    with open(index_path, "w") as f:
        json.dump({"mazes": filenames}, f, indent=2)

    print(f"Generated {index_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate maze JSON data for the browser game.",
    )
    parser.add_argument(
        "--hex-side",
        type=int,
        default=25,
        help="Hex side length (default: 25)",
    )
    parser.add_argument(
        "--center-hex-radius",
        type=int,
        default=11,
        help="Center hex radius (default: 11)",
    )
    parser.add_argument(
        "--num-mazes",
        type=int,
        default=3,
        help="Number of mazes to generate (default: 3)",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="game/data",
        help="Output directory (default: game/data)",
    )
    args = parser.parse_args()

    generate_maze_data(
        output_dir=args.output_dir,
        num_mazes=args.num_mazes,
        hex_side=args.hex_side,
        center_hex_radius=args.center_hex_radius,
    )


if __name__ == "__main__":
    main()

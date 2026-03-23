from __future__ import annotations

import json
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.maze_generator import MazeGenerator


class MazeDataExporter:
    """Serializes a generated MazeGenerator instance into
    a JSON-compatible dict for the browser game."""

    DEFAULT_CELL_SIZE = 30
    DEFAULT_MARGIN = 40
    DEFAULT_STRETCH = 1.03

    def __init__(self, maze: MazeGenerator) -> None:
        self.maze = maze

    def export(self) -> dict:
        """Return a dict with maze data for the JS renderer.

        Keys: rows, cols, cellSize, centerHexRadius, margin,
        stretch, cells, passages, entryCell, goalCells.

        Raises ValueError if the maze has not been generated.
        """
        if self.maze.exit_cell is None:
            raise ValueError("Maze has not been generated. Call generate() before exporting.")

        grid = self.maze.grid

        cells = [
            {
                "row": cell.row,
                "col": cell.col,
                "upward": cell.is_upward,
            }
            for cell in grid.cells.values()
        ]

        # Deduplicate passages: each undirected edge appears once
        seen: set[tuple[tuple[int, int], tuple[int, int]]] = set()
        passages: list[list[list[int]]] = []
        for cell in grid.cells.values():
            for neighbor in cell.passages:
                pair = tuple(sorted([cell.coord, neighbor.coord]))
                if pair not in seen:
                    seen.add(pair)
                    passages.append(
                        [
                            [cell.coord[0], cell.coord[1]],
                            [
                                neighbor.coord[0],
                                neighbor.coord[1],
                            ],
                        ]
                    )

        entry_cell = [
            self.maze.exit_cell.row,
            self.maze.exit_cell.col,
        ]

        goal_cells = self._find_goal_cells()

        return {
            "rows": grid.rows,
            "cols": grid.cols,
            "cellSize": self.DEFAULT_CELL_SIZE,
            "centerHexRadius": self.maze.center_hex_radius,
            "margin": self.DEFAULT_MARGIN,
            "stretch": self.DEFAULT_STRETCH,
            "cells": cells,
            "passages": passages,
            "entryCell": entry_cell,
            "goalCells": goal_cells,
        }

    def export_json(self) -> str:
        """Return JSON string of export()."""
        return json.dumps(self.export())

    def _find_goal_cells(self) -> list[list[int]]:
        """Identify all cells in the open center region.

        Replicates the boundary logic from
        MazeGenerator._create_open_center() to find cells
        within the center_hex_radius.
        """
        if self.maze.center_hex_radius <= 0:
            return []

        grid = self.maze.grid
        radius = self.maze.radius
        center_hex_radius = self.maze.center_hex_radius
        center_row = grid.rows / 2 - 0.5

        goal_cells: list[list[int]] = []
        for cell in grid.cells.values():
            vertical_distance = abs(cell.row - center_row) - 0.5
            if vertical_distance >= center_hex_radius:
                continue
            side_offset = (radius - center_hex_radius) * 2 + vertical_distance
            if cell.col >= side_offset and cell.col < grid.cols - side_offset:
                goal_cells.append([cell.row, cell.col])

        return goal_cells

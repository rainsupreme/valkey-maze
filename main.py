from src.maze_generator import MazeGenerator

# Generate and render a hexagonal maze
maze = MazeGenerator(hex_side=15)
maze.generate()
maze.render_maze('hexagonal_maze.svg')
# maze.render_debug('hexagonal_maze_debug.svg')

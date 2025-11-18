from src.maze_generator import MazeGenerator

# Generate and render a hexagonal maze with open center
maze = MazeGenerator(hex_side=25, center_hex_radius=7)
maze.generate()
maze.render_maze('hexagonal_maze.svg')
# maze.render_debug('hexagonal_maze_debug.svg')

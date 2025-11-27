import random
from src.maze_generator import MazeGenerator
from src.word_search_generator import WordSearchGenerator

def generate_puzzles(num_placemats, words):
    # Generate all mazes
    mazes = []
    for i in range(num_placemats):
        print(f"Generating maze {i+1} of {num_placemats}...")
        random.seed(1000 + i)
        maze = MazeGenerator(hex_side=25, center_hex_radius=11)
        maze.generate()
        mazes.append(maze)
    
    # Generate all word searches
    word_searches = []
    for i in range(num_placemats):
        print(f"Generating word search {i+1} of {num_placemats}...")
        random.seed(2000 + i)
        ws = WordSearchGenerator(size=18)
        ws.add_words(words)
        word_searches.append(ws)
    
    return mazes, word_searches

def generate_answer_key(mazes, word_searches, output_file='answer_key.html'):
    num_placemats = len(mazes)
    
    html = """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
@page { size: letter; margin: 0.5in; }
body { font-family: Arial, sans-serif; }
.answer { page-break-after: always; text-align: center; }
.answer h2 { margin: 20px 0; }
.answer svg { max-width: 90%; height: auto; }
</style>
</head>
<body>
"""
    
    for i in range(num_placemats):
        maze_page = i * 2 + 1
        ws_page = i * 2 + 2
        maze_solution = mazes[i].render_maze_string(logo_svg='Valkey-logo-aligned.svg', show_solution=True, solution_color='red', solution_width=3)
        ws_solution = word_searches[i].render_solution_svg_string()
        html += f'<div class="answer"><h2>Maze {i+1} Solution (Page {maze_page})</h2>{maze_solution}</div>'
        html += f'<div class="answer"><h2>Word Search {i+1} Solution (Page {ws_page})</h2>{ws_solution}</div>'
    
    html += "</body></html>"
    
    with open(output_file, 'w') as f:
        f.write(html)
    
    print(f"Generated answer key in {output_file}")

def generate_placemats(mazes, word_searches, output_file='placemats.html'):
    words = """
VALKEY
PERFORMANCE
KEYVALUE
DATABASE
CACHE
MEMORY
FAST
RELIABLE
SCALABLE
AVAILABILITY
MICROSECOND
OPENSOURCE
COMMUNITY
PRIMARY
REPLICA
CLUSTER
SHARD
OPTIMIZED
DISTRIBUTED
FIREDUCKS
RAIN
""".strip().split('\n')
    
    html = """<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Open+Sans:wght@400;700&display=swap">
<style>
@page { size: letter landscape; margin: 0.5in; }
body { margin: 0; padding: 0; font-family: 'Open Sans', sans-serif; }
.page { 
    width: 10.5in; 
    height: 8in; 
    page-break-after: always; 
    display: flex;
    box-sizing: border-box;
    position: relative;
}
.page-number {
    position: absolute;
    bottom: 0.1in;
    left: 0.25in;
    font-size: 10pt;
    color: #666;
}
.puzzle { 
    width: 50%; 
    display: flex; 
    flex-direction: column;
    align-items: center; 
    justify-content: center;
    padding: 0.25in;
    overflow: hidden;
}
.puzzle-title {
    font-size: 24pt;
    font-weight: bold;
    margin-bottom: 10px;
    text-align: center;
    flex-shrink: 0;
}
.puzzle-container {
    transform-origin: center;
    max-height: 90%;
    display: flex;
    align-items: center;
    justify-content: center;
}
.puzzle svg { display: block; }
.maze-container {
    transform: scale(0.35);
}
.wordsearch-container {
    transform: scale(0.75);
}
.notes { 
    width: 50%; 
    padding: 0.25in;
    position: relative;
}
.notes h2 { margin: 0 0 20px 0; font-size: 18pt; }
.line { 
    height: 30px; 
    border-bottom: 1px solid #999; 
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}
@media print {
    .page { page-break-after: always; }
}
</style>
</head>
<body>
"""
    
    display_words = [w.upper() for w in words if w.upper() not in {'FIREDUCKS', 'RAIN'}]
    num_placemats = len(mazes)
    
    # Build HTML output
    lines = ''.join(['<div class="line"></div>' for _ in range(20)])
    for i in range(num_placemats):
        page_num = i * 2 + 1
        html += f"""
<div class="page">
    <div class="puzzle">
        <div class="puzzle-title">Valkey.io</div>
        <div class="puzzle-container maze-container">{mazes[i].render_maze_string(logo_svg='Valkey-logo-aligned.svg')}</div>
    </div>
    <div class="notes"><h2>Notes</h2>{lines}</div>
    <div class="page-number">{page_num}</div>
</div>
"""
        
        page_num = i * 2 + 2
        html += f"""
<div class="page">
    <div class="puzzle">
        <div class="puzzle-title">Valkey.io</div>
        <div class="puzzle-container wordsearch-container">{word_searches[i].render_svg_string(display_words=display_words)}</div>
    </div>
    <div class="notes"><h2>Notes</h2>{lines}</div>
    <div class="page-number">{page_num}</div>
</div>
"""
    
    html += """
</body>
</html>
"""
    
    with open(output_file, 'w') as f:
        f.write(html)
    
    print(f"Generated {num_placemats} placemats in {output_file}")
    print(f"Total pages: {num_placemats * 2}")
    print("Open in browser and print with duplex/double-sided enabled")

if __name__ == '__main__':
    import sys
    num = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    
    words = """
VALKEY
PERFORMANCE
KEYVALUE
DATABASE
CACHE
MEMORY
FAST
RELIABLE
SCALABLE
AVAILABILITY
MICROSECOND
OPENSOURCE
COMMUNITY
PRIMARY
REPLICA
CLUSTER
SHARD
OPTIMIZED
DISTRIBUTED
FIREDUCKS
RAIN
""".strip().split('\n')
    
    mazes, word_searches = generate_puzzles(num, words)
    generate_placemats(mazes, word_searches)
    generate_answer_key(mazes, word_searches)

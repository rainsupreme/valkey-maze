import random
import svgwrite

class WordSearchGenerator:
    DIRECTIONS = [(0, 1), (1, 0), (1, 1), (0, -1), (-1, 0), (-1, -1), (1, -1), (-1, 1)]
    
    def __init__(self, size=15):
        self.size = size
        self.grid = [['' for _ in range(size)] for _ in range(size)]
        self.placed_words = []
    
    def can_place(self, word, row, col, dr, dc):
        for i, char in enumerate(word):
            r, c = row + i * dr, col + i * dc
            if not (0 <= r < self.size and 0 <= c < self.size):
                return False
            if self.grid[r][c] and self.grid[r][c] != char:
                return False
        return True
    
    def place_word(self, word, row, col, dr, dc):
        for i, char in enumerate(word):
            self.grid[row + i * dr][col + i * dc] = char
        self.placed_words.append((word, row, col, dr, dc))
    
    def add_words(self, words):
        for word in words:
            word = word.upper()
            placed = False
            for _ in range(100):
                row, col = random.randint(0, self.size - 1), random.randint(0, self.size - 1)
                dr, dc = random.choice(self.DIRECTIONS)
                if self.can_place(word, row, col, dr, dc):
                    self.place_word(word, row, col, dr, dc)
                    placed = True
                    break
            if not placed:
                print(f"Warning: Could not place '{word}'")
        
        for r in range(self.size):
            for c in range(self.size):
                if not self.grid[r][c]:
                    self.grid[r][c] = random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    
    def render_svg(self, filename, cell_size=30):
        dwg = svgwrite.Drawing(filename, size=(self.size * cell_size, self.size * cell_size + 100))
        
        for r in range(self.size):
            for c in range(self.size):
                x, y = c * cell_size, r * cell_size
                dwg.add(dwg.rect((x, y), (cell_size, cell_size), fill='white', stroke='black'))
                dwg.add(dwg.text(self.grid[r][c], insert=(x + cell_size/2, y + cell_size*0.7),
                                text_anchor='middle', font_size=20, font_family='Arial'))
        
        y_offset = self.size * cell_size + 20
        dwg.add(dwg.text('Words:', insert=(10, y_offset), font_size=16, font_weight='bold'))
        for i, (word, _, _, _, _) in enumerate(self.placed_words):
            dwg.add(dwg.text(word, insert=(10 + (i % 5) * 120, y_offset + 25 + (i // 5) * 20), font_size=14))
        
        dwg.save()
    
    def render_solution(self, filename, cell_size=30):
        dwg = svgwrite.Drawing(filename, size=(self.size * cell_size, self.size * cell_size + 100))
        colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2']
        
        for r in range(self.size):
            for c in range(self.size):
                x, y = c * cell_size, r * cell_size
                dwg.add(dwg.rect((x, y), (cell_size, cell_size), fill='white', stroke='black'))
                dwg.add(dwg.text(self.grid[r][c], insert=(x + cell_size/2, y + cell_size*0.7),
                                text_anchor='middle', font_size=20, font_family='Arial'))
        
        for i, (word, row, col, dr, dc) in enumerate(self.placed_words):
            color = colors[i % len(colors)]
            x1 = col * cell_size + cell_size / 2
            y1 = row * cell_size + cell_size / 2
            x2 = (col + (len(word) - 1) * dc) * cell_size + cell_size / 2
            y2 = (row + (len(word) - 1) * dr) * cell_size + cell_size / 2
            dwg.add(dwg.line((x1, y1), (x2, y2), stroke=color, stroke_width=4, opacity=0.5))
        
        y_offset = self.size * cell_size + 20
        dwg.add(dwg.text('Solution:', insert=(10, y_offset), font_size=16, font_weight='bold'))
        for i, (word, _, _, _, _) in enumerate(self.placed_words):
            color = colors[i % len(colors)]
            dwg.add(dwg.text(word, insert=(10 + (i % 5) * 120, y_offset + 25 + (i // 5) * 20), 
                           font_size=14, fill=color))
        
        dwg.save()

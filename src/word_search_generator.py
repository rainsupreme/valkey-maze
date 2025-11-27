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
        words = sorted([w.upper() for w in words], key=len, reverse=True)
        
        for word in words:
            placed = False
            attempts = []
            
            for _ in range(200):
                row, col = random.randint(0, self.size - 1), random.randint(0, self.size - 1)
                dr, dc = random.choice(self.DIRECTIONS)
                if self.can_place(word, row, col, dr, dc):
                    crosses = sum(1 for i in range(len(word)) 
                                if self.grid[row + i * dr][col + i * dc])
                    attempts.append((crosses, row, col, dr, dc))
            
            if attempts:
                attempts.sort(reverse=True)
                _, row, col, dr, dc = attempts[0] if random.random() < 0.7 else random.choice(attempts[:5] if len(attempts) > 5 else attempts)
                self.place_word(word, row, col, dr, dc)
                placed = True
            
            if not placed:
                print(f"Warning: Could not place '{word}'")
        
        for r in range(self.size):
            for c in range(self.size):
                if not self.grid[r][c]:
                    self.grid[r][c] = random.choice('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
    
    def render_svg(self, filename, cell_size=30, display_words=None):
        svg_string = self.render_svg_string(cell_size, display_words)
        with open(filename, 'w') as f:
            f.write(svg_string)
    
    def render_svg_string(self, cell_size=30, display_words=None):
        words_to_display = [w for w, _, _, _, _ in self.placed_words if display_words is None or w in display_words]
        rows_needed = (len(words_to_display) + 3) // 4
        canvas_height = self.size * cell_size + 50 + rows_needed * 20
        dwg = svgwrite.Drawing(size=(self.size * cell_size, canvas_height))
        dwg.add(dwg.rect((0, 0), (self.size * cell_size, canvas_height), fill='white'))
        
        for r in range(self.size):
            for c in range(self.size):
                x, y = c * cell_size, r * cell_size
                dwg.add(dwg.rect((x, y), (cell_size, cell_size), fill='white', stroke='black'))
                dwg.add(dwg.text(self.grid[r][c], insert=(x + cell_size/2, y + cell_size*0.7),
                                text_anchor='middle', font_size=20, font_family='Arial'))
        
        y_offset = self.size * cell_size + 20
        dwg.add(dwg.text('Words:', insert=(10, y_offset), font_size=16, font_weight='bold'))
        for i, word in enumerate(words_to_display):
            dwg.add(dwg.text(word, insert=(10 + (i % 4) * 120, y_offset + 25 + (i // 4) * 20), font_size=14))
        
        return dwg.tostring()
    
    def render_solution_svg_string(self, cell_size=30):
        rows_needed = (len(self.placed_words) + 3) // 4
        canvas_height = self.size * cell_size + 50 + rows_needed * 20
        dwg = svgwrite.Drawing(size=(self.size * cell_size, canvas_height))
        dwg.add(dwg.rect((0, 0), (self.size * cell_size, canvas_height), fill='white'))
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
            dwg.add(dwg.text(word, insert=(10 + (i % 4) * 120, y_offset + 25 + (i // 4) * 20), 
                           font_size=14, fill=color))
        
        return dwg.tostring()
    
    def render_solution(self, filename, cell_size=30):
        rows_needed = (len(self.placed_words) + 3) // 4
        canvas_height = self.size * cell_size + 50 + rows_needed * 20
        dwg = svgwrite.Drawing(filename, size=(self.size * cell_size, canvas_height))
        dwg.add(dwg.rect((0, 0), (self.size * cell_size, canvas_height), fill='white'))
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
            dwg.add(dwg.text(word, insert=(10 + (i % 4) * 120, y_offset + 25 + (i // 4) * 20), 
                           font_size=14, fill=color))
        
        dwg.save()

from src.word_search_generator import WordSearchGenerator

# Create word search with Valkey-related terms
words = """
VALKEY
PERFORMANCE
CACHE
DATABASE
MEMORY
FAST
BSD
KEYVALUE
SCALABLE
MICROSECOND
OPENSOURCE
PRIMARY
REPLICA
CLUSTER
SHARD
COMMUNITY
OPTIMIZED
FIREDUCKS
""".strip().split('\n')

generator = WordSearchGenerator(size=15)
generator.add_words(words)
generator.render_svg('word_search.svg')
generator.render_solution('word_search_solution.svg')

print("Word search generated: word_search.svg")
print("Solution generated: word_search_solution.svg")

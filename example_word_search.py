from src.word_search_generator import WordSearchGenerator

# Create word search with Valkey-related terms
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
""".strip().split("\n")

generator = WordSearchGenerator(size=18)
generator.add_words(words)
generator.render_svg("word_search.svg")
generator.render_solution("word_search_solution.svg")

print("Word search generated: word_search.svg")
print("Solution generated: word_search_solution.svg")

// ── Difficulty Tiers ────────────────────────────────────────
//
// Game-facing presets mapping difficulty names to maze generator
// parameters (hexSide, centerHexRadius).

export const DIFFICULTY_TIERS = [
    { id: 'easy',      name: "I'm too young to cache", hexSide: 9,  centerHexRadius: 5  },
    { id: 'medium',    name: "Hey, not too fast",      hexSide: 17, centerHexRadius: 9  },
    { id: 'hard',      name: "Query me plenty",        hexSide: 25, centerHexRadius: 11 },
    { id: 'nightmare', name: "Ultra-Valkey",           hexSide: 35, centerHexRadius: 15 },
];

// Legacy alias kept for any external references
export const DAILY_PUZZLE_TIER = DIFFICULTY_TIERS[2];

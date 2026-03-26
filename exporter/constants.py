"""
Constants for the exporter module.

These constants define limits and thresholds used throughout the export process
to prevent infinite loops and runaway resource usage.
"""

# =============================================================================
# Analysis Safety Limits
# =============================================================================

# Maximum number of times analyze_rule can be called in a single export.
# This catches infinite loops where rules keep spawning new analyze_rule calls.
# Set to 15000 to accommodate complex configurations like ALttP's entrance_shuffle=full
# which creates many more region/entrance rules that need analysis.
# With closure function identity caching, this limit is rarely hit.
MAX_ANALYZE_RULE_CALLS = 15000

# Maximum number of AST node visits within a single RuleAnalyzer instance.
# This catches infinite loops within a single rule's AST traversal.
MAX_ANALYZER_OPERATIONS = 5000

# Maximum recursion depth for rule expansion (expand_rule).
# This catches circular helper references where helpers call each other.
MAX_RULE_EXPANSION_DEPTH = 100

# Maximum iterations for helper discovery in get_helper_definitions.
# Each iteration may discover new helpers that need to be processed.
MAX_HELPER_DISCOVERY_ITERATIONS = 10

# =============================================================================
# Size Limits
# =============================================================================

# Maximum size of a single expanded rule in kilobytes.
# Rules larger than this likely indicate runaway expansion.
MAX_RULE_SIZE_KB = 100

# Maximum size of total export data in megabytes (per game).
# The effective limit is: BASE + (EXTRA_PER_GAME * (num_players - 1))
# This allows larger exports for multiworld while still catching loops.
#
# INTERIM size limits - checked periodically during region processing.
# These are higher because interim measurements use Python object string
# representations which are larger than final JSON. For example, a 658 KB
# final file may measure as 12.9 MB during processing. Set higher to
# accommodate complex games like LADX (377+ regions) during processing.
MAX_INTERIM_EXPORT_SIZE_MB_BASE = 20
MAX_INTERIM_EXPORT_SIZE_MB_PER_EXTRA_GAME = 2

# FINAL size limits - checked when writing the final JSON file.
# These are the actual limits for the output file size.
MAX_FINAL_EXPORT_SIZE_MB_BASE = 10
MAX_FINAL_EXPORT_SIZE_MB_PER_EXTRA_GAME = 1

# =============================================================================
# Sorting Configuration
# =============================================================================

# Keys where sorting list values is safe (order is not semantically meaningful).
# Used by sort_lists_for_consistency() to ensure deterministic JSON output.
SAFE_TO_SORT_KEYS = {
    'allowed_legendary_hunt_encounters',
    'dependencies',
    'dexsanity_encounter_types',  # Pokemon Emerald: OptionList from set, order non-deterministic
    'disabled_entities',
    'enabled_filler_buffs',
    'exclude_locations',
    'goal',
    'move_rando_actions',
    'own_itempool',  # The Witness: built from dict.values() iteration, order non-deterministic
    'precompleted_puzzles',  # The Witness: built from set iteration, order non-deterministic
    'StartingRecipies',  # Satisfactory: set iteration order is non-deterministic
}

# Keys where sorting dict keys is safe (key order is not semantically meaningful).
# These are dicts where the insertion order comes from non-deterministic sources
# (e.g., set iteration in original world code) but the order has no semantic meaning.
SAFE_TO_SORT_DICT_KEYS = {
    'AVAILABLE_EASTER_EGGS_PER_REGION',  # The Witness: built from set/dict iteration
    'EVENT_ITEM_PAIRS',  # The Witness: built from dict iteration, order non-deterministic
    'item_classification_overrides',
    'ter_goals',  # Terraria: built from set iteration order
    'added_hint_types',       # OOT: keys inserted via set iteration over hint_dist_keys
    'item_added_hint_types',  # OOT: keys inserted via set iteration over hint_dist_keys
    'hint_type_overrides',    # OOT: keys inserted via set iteration over hint_dist_keys
    'item_hint_type_overrides',  # OOT: keys inserted via set iteration over hint_dist_keys
    'PARENT_ITEM_COUNT_PER_BASE_ITEM',  # The Witness
    'PROGRESSIVE_LISTS',  # The Witness
}

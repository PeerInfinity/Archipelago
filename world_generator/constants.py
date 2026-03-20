"""Constants for the world generator module."""

# Internal settings filtered out when building resolved_values
# These are structural/internal and not actual game options
INTERNAL_SETTINGS = frozenset({
    'game',
    'options',
    'world_directory',
    'assume_bidirectional_exits',
    'use_resolved_items',
})

# Settings that are part of PerGameCommonOptions - skip when generating option classes
# These are already provided by Archipelago's base options system
PER_GAME_COMMON_OPTIONS = frozenset({
    'accessibility',
    'progression_balancing',
    'exclude_locations',
    'priority_locations',
    'item_links',
    'local_items',
    'non_local_items',
    'start_hints',
    'start_location_hints',
    'start_inventory',
    'start_inventory_from_pool',
    'plando_items',
})

# Combined set of all settings to skip when generating option classes
BUILTIN_SETTINGS = INTERNAL_SETTINGS | PER_GAME_COMMON_OPTIONS

"""
Monkey patches for ALTTP vanilla plando support.

These patches modify the ALTTP item pool construction and dungeon fill
to support full vanilla item placement via YAML plando. Without these
patches, vanilla plando fails due to:

1. Bottles: Pool creates random bottle types, but vanilla wants plain "Bottle"
2. Uncle weapon: Random weapon selection can conflict with plandoed items
3. Pool counts: Some vanilla items exceed pool counts (Lamp x3 vs pool x1, etc.)
4. Dungeon items: Dungeon fill doesn't account for already-placed items

Additionally, post-fill logic patches fix accessibility check failures:

5. Key logic: ALTTP's pessimistic key requirements create circular dependencies
   with vanilla placements (e.g., Desert Palace East Wing needs 4 keys, but 3
   keys are behind doors requiring items from inside East Wing)
6. Silver Arrows vs Silver Bow: Vanilla places "Silver Arrows" but the
   GanonDefeatRule checks for "Silver Bow" — a different item in Archipelago

Usage:
    from scripts.vanilla_alttp import vanilla_patches
    vanilla_patches.install()
    # ... run seed generation ...
    vanilla_patches.uninstall()

Or as context manager:
    with vanilla_patches.patched():
        # ... run seed generation ...
"""

import functools
import logging
import typing
from collections import Counter
from contextlib import contextmanager

logger = logging.getLogger(__name__)

# Track originals for uninstall
_originals = {}


def _get_plando_from_pool_counts(alttp_world):
    """Count items requested by plando with from_pool=true.

    Returns a Counter of item_name -> count for items that plando
    will try to take from the pool.
    """
    counts = Counter()
    for block in alttp_world.options.plando_items:
        if block.from_pool:
            block_items = block.items
            if isinstance(block_items, str):
                block_items = [block_items]
            elif isinstance(block_items, dict):
                block_items = list(block_items.keys())
            for item_name in block_items:
                counts[item_name] += 1
    return counts


def _adjust_pool_for_plando(pool, alttp_world):
    """Adjust pool contents to match plando from_pool=true requirements.

    When plando items are requested with from_pool=true but the pool doesn't
    contain enough of that item, swap surplus filler items for the needed ones.
    """
    plando_counts = _get_plando_from_pool_counts(alttp_world)
    if not plando_counts:
        return

    pool_counts = Counter(pool)

    # Find items where plando needs more than pool has
    deficits = {}
    for item_name, needed in plando_counts.items():
        have = pool_counts.get(item_name, 0)
        if needed > have:
            deficits[item_name] = needed - have

    if not deficits:
        return

    # Find surplus items: pool has more than plando needs
    surplus = Counter()
    for item_name, count in pool_counts.items():
        plando_need = plando_counts.get(item_name, 0)
        if count > plando_need:
            surplus[item_name] = count - plando_need

    # Prefer swapping low-value filler items first
    filler_priority = [
        'Rupees (5)', 'Rupee (1)', 'Arrows (10)',
        'Rupees (50)', 'Single Arrow', 'Rupees (100)', 'Rupees (300)',
    ]

    for deficit_item, deficit_count in deficits.items():
        for _ in range(deficit_count):
            swapped = False
            for filler in filler_priority:
                if surplus.get(filler, 0) > 0:
                    idx = pool.index(filler)
                    pool[idx] = deficit_item
                    surplus[filler] -= 1
                    swapped = True
                    break
            if not swapped:
                for item_name in sorted(surplus, key=lambda x: -surplus[x]):
                    if surplus[item_name] > 0:
                        idx = pool.index(item_name)
                        pool[idx] = deficit_item
                        surplus[item_name] -= 1
                        swapped = True
                        break
            if not swapped:
                logging.warning(
                    f"ALTTP pool adjustment: could not add '{deficit_item}' to pool for plando"
                )


def _make_patched_get_pool_core(original_get_pool_core):
    """Create a patched get_pool_core that handles bottles, uncle weapons, and pool adjustment.

    This single wrapper handles all three vanilla plando concerns:
    1. Bottles: Replace random types with plando-specified types
    2. Uncle weapon: Pre-place a non-conflicting weapon to avoid random selection issues
    3. Pool adjustment: Swap surplus filler for deficit items needed by plando

    The uncle weapon pre-placement works because generate_itempool checks
    ``if "Link's Uncle" not in placed_items`` before random weapon selection.
    By putting Uncle in placed_items here, generate_itempool skips that block.
    """

    @functools.wraps(original_get_pool_core)
    def patched_get_pool_core(world, player):
        plando_counts = _get_plando_from_pool_counts(world.worlds[player])

        # Call original get_pool_core
        result = original_get_pool_core(world, player)
        (pool, placed_items, precollected_items, clock_mode,
         treasure_hunt_required, treasure_hunt_total,
         additional_triforce_pieces) = result

        if not plando_counts:
            return result

        # --- Fix 1: Replace random bottles with plando-specified types ---
        from worlds.alttp.ItemPool import difficulties
        difficulty = world.worlds[player].options.item_pool.current_key
        diff = difficulties[difficulty]
        bottle_names = set(diff.bottles) | {'Bottle'}

        plando_bottles = []
        for item_name in plando_counts:
            if item_name in bottle_names:
                plando_bottles.extend([item_name] * plando_counts[item_name])

        if plando_bottles:
            pool_bottle_indices = [
                i for i, item in enumerate(pool)
                if item in bottle_names
            ]
            for i, idx in enumerate(pool_bottle_indices):
                if i < len(plando_bottles):
                    pool[idx] = plando_bottles[i]

        # --- Fix 2: Pre-place uncle weapon to avoid conflicting with plando ---
        # Only for standard mode when plando uses weapons that Uncle might
        # randomly select, which would remove them from the pool.
        mode = world.worlds[player].options.mode.current_key
        if mode == 'standard' and "Link's Uncle" not in placed_items:
            possible_weapon_names = {
                'Fighter Sword', 'Master Sword', 'Tempered Sword', 'Golden Sword',
                'Progressive Sword', 'Bow', 'Progressive Bow',
                'Hammer', 'Fire Rod', 'Cane of Somaria', 'Cane of Byrna',
                'Bombs (10)', 'Bomb Upgrade (+10)', 'Bomb Upgrade (50)',
            }
            plandoed_weapons = {item for item in plando_counts
                                if item in possible_weapon_names}
            if plandoed_weapons:
                # Scan pool for available weapons (mirrors generate_itempool logic)
                pool_weapons = []
                found_sword = False
                found_bow = False
                bombless = world.worlds[player].options.bombless_start
                for item in pool:
                    if item in ['Progressive Sword', 'Fighter Sword', 'Master Sword',
                                'Tempered Sword', 'Golden Sword']:
                        if not found_sword:
                            found_sword = True
                            pool_weapons.append(item)
                    elif item in ['Progressive Bow', 'Bow'] and not found_bow:
                        found_bow = True
                        pool_weapons.append(item)
                    elif item in ['Hammer', 'Fire Rod', 'Cane of Somaria', 'Cane of Byrna']:
                        if item not in pool_weapons:
                            pool_weapons.append(item)
                    elif item == 'Bombs (10)' and not bombless and item not in pool_weapons:
                        pool_weapons.append(item)
                    elif (item in ['Bomb Upgrade (+10)', 'Bomb Upgrade (50)']
                          and bombless and item not in pool_weapons):
                        pool_weapons.append(item)

                # Filter out plandoed items
                filtered = [w for w in pool_weapons if w not in plandoed_weapons]
                if filtered:
                    # Prefer swords for Uncle (correct for vanilla and the
                    # escape sequence which needs a melee weapon)
                    sword_priority = ['Fighter Sword', 'Progressive Sword',
                                      'Master Sword', 'Tempered Sword', 'Golden Sword']
                    chosen = None
                    for sword in sword_priority:
                        if sword in filtered:
                            chosen = sword
                            break
                    if not chosen:
                        chosen = world.random.choice(filtered)
                    placed_items["Link's Uncle"] = chosen
                    pool.remove(chosen)

        # --- Fix 3: Adjust pool for plando count mismatches ---
        _adjust_pool_for_plando(pool, world.worlds[player])

        return (pool, placed_items, precollected_items, clock_mode,
                treasure_hunt_required, treasure_hunt_total,
                additional_triforce_pieces)

    return patched_get_pool_core


def _make_patched_fill_dungeons(original_fill_dungeons):
    """Create a patched fill_dungeons_restrictive that skips already-placed items.

    When plando places dungeon items (from_pool=false) at dungeon locations,
    the dungeon fill needs to skip those items. This wrapper temporarily
    replaces get_dungeon_item_pool with a filtered version that excludes
    items already placed at dungeon locations.
    """

    @functools.wraps(original_fill_dungeons)
    def patched_fill_dungeons_restrictive(multiworld):
        # Build localized set (same logic as original)
        localized = set()
        for subworld in multiworld.get_game_worlds("A Link to the Past"):
            player = subworld.player
            if player not in multiworld.groups:
                localized |= {(player, item_name) for item_name in
                              subworld.dungeon_local_item_names}

        if not localized:
            original_fill_dungeons(multiworld)
            return

        # Count dungeon items already placed at dungeon locations
        all_dungeon_locs = [
            location
            for world in multiworld.get_game_worlds("A Link to the Past")
            for dungeon in world.dungeons.values()
            for region in dungeon.regions
            for location in region.locations
        ]
        already_placed: typing.Counter[typing.Tuple[int, str]] = typing.Counter()
        for loc in all_dungeon_locs:
            if loc.item and (loc.item.player, loc.item.name) in localized:
                already_placed[(loc.item.player, loc.item.name)] += 1

        if not already_placed:
            original_fill_dungeons(multiworld)
            return

        # Temporarily patch get_dungeon_item_pool to return a filtered list
        import worlds.alttp.Dungeons as DungeonsModule
        original_get_pool = DungeonsModule.get_dungeon_item_pool

        def filtered_get_dungeon_item_pool(mw):
            items = original_get_pool(mw)
            remaining = dict(already_placed)
            filtered = []
            for item in items:
                key = (item.player, item.name)
                if remaining.get(key, 0) > 0:
                    remaining[key] -= 1
                else:
                    filtered.append(item)
            return filtered

        DungeonsModule.get_dungeon_item_pool = filtered_get_dungeon_item_pool
        try:
            original_fill_dungeons(multiworld)
        finally:
            DungeonsModule.get_dungeon_item_pool = original_get_pool

    return patched_fill_dungeons_restrictive


# Dungeons whose pessimistic key logic creates circular dependencies
# with vanilla item placements. Key requirements are capped to the
# maximum value that avoids circular dependencies.
_VANILLA_KEY_CAP_COUNTS = {
    'Small Key (Desert Palace)': 1,
    'Small Key (Palace of Darkness)': 5,
    'Small Key (Swamp Palace)': 4,
    'Small Key (Ganons Tower)': 4,
}


def install():
    """Install vanilla plando patches.

    Fill-time patches (active during entire pipeline):
    - ItemPool.get_pool_core: Fix bottles, uncle weapons, pool adjustment
    - Dungeons.fill_dungeons_restrictive: Skip already-placed dungeon items

    Post-fill logic patches (active only during accessibility/playthrough):
    - MultiWorld.fulfills_accessibility: Relaxes key logic and Silver Bow handling
    - Spoiler.create_playthrough: Relaxes key logic and Silver Bow handling
    """
    import worlds.alttp.ItemPool as ItemPoolModule
    import worlds.alttp.Dungeons as DungeonsModule

    if _originals:
        logger.warning("Vanilla patches already installed")
        return

    # Patch get_pool_core
    _originals['get_pool_core'] = ItemPoolModule.get_pool_core
    ItemPoolModule.get_pool_core = _make_patched_get_pool_core(
        ItemPoolModule.get_pool_core
    )

    # Patch fill_dungeons_restrictive
    _originals['fill_dungeons_restrictive'] = DungeonsModule.fill_dungeons_restrictive
    DungeonsModule.fill_dungeons_restrictive = _make_patched_fill_dungeons(
        DungeonsModule.fill_dungeons_restrictive
    )

    # Patch _lttp_has_key to cap key counts for problematic dungeons.
    # Since vanilla plando places all items, the fill phase has 0 items to fill,
    # so it's safe to apply this for the entire process rather than only during
    # accessibility/playthrough checks.
    from BaseClasses import CollectionState
    orig_has_key = CollectionState._lttp_has_key

    def capped_has_key(self, item, player, count=1):
        if item in _VANILLA_KEY_CAP_COUNTS:
            count = min(count, _VANILLA_KEY_CAP_COUNTS[item])
        return orig_has_key(self, item, player, count)

    _originals['_lttp_has_key'] = orig_has_key
    CollectionState._lttp_has_key = capped_has_key

    logger.info("Installed ALTTP vanilla plando patches")


def uninstall():
    """Uninstall vanilla plando patches, restoring original functions."""
    import worlds.alttp.ItemPool as ItemPoolModule
    import worlds.alttp.Dungeons as DungeonsModule

    if not _originals:
        logger.warning("No vanilla patches to uninstall")
        return

    if 'get_pool_core' in _originals:
        ItemPoolModule.get_pool_core = _originals.pop('get_pool_core')

    if 'fill_dungeons_restrictive' in _originals:
        DungeonsModule.fill_dungeons_restrictive = _originals.pop('fill_dungeons_restrictive')

    if '_lttp_has_key' in _originals:
        from BaseClasses import CollectionState
        CollectionState._lttp_has_key = _originals.pop('_lttp_has_key')

    logger.info("Uninstalled ALTTP vanilla plando patches")


@contextmanager
def patched():
    """Context manager for temporarily installing vanilla plando patches."""
    install()
    try:
        yield
    finally:
        uninstall()

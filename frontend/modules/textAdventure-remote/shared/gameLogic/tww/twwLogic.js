/**
 * The Wind Waker Game Logic Module
 *
 * Provides game-specific logic for TWW including state method handlers
 * and helper functions from Macros.py.
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

// ============================================================================
// Core Utility Functions
// ============================================================================

/**
 * Check if player has an item, handling progressive items.
 *
 * @param {Object} snapshot - Canonical state snapshot containing inventory, flags, events
 * @param {Object} staticData - Static game data with progressionMapping
 * @param {string} itemName - Name of the item to check
 * @param {number} player - Player ID (optional, defaults to current player)
 * @param {number} count - Minimum count required (optional, defaults to 1)
 * @returns {boolean} True if player has the item with at least the specified count
 */
export function has(snapshot, staticData, itemName, player, count = 1) {
  // Check if it's in flags
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Check events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Get player slot
  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Direct item check
  const itemCount = snapshot.inventory[itemName] || 0;
  if (itemCount >= count) {
    return true;
  }

  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    const playerProgressionMapping = staticData.progressionMapping[playerSlot] || staticData.progressionMapping;

    // Check if this item is provided by any progressive item
    for (const [progressiveBase, progression] of Object.entries(playerProgressionMapping)) {
      const baseCount = snapshot.inventory[progressiveBase] || 0;

      if (baseCount > 0 && progression && progression.items) {
        // Check each upgrade in the progression
        for (const upgrade of progression.items) {
          if (baseCount >= upgrade.level) {
            // Check if this upgrade provides the item we're looking for
            if (upgrade.name === itemName ||
              (upgrade.provides && upgrade.provides.includes(itemName))) {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Count how many of an item the player has.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data with progressionMapping
 * @param {string} itemName - Name of the item to count
 * @param {number} player - Player ID (optional)
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName, player) {
  if (!snapshot.inventory) return 0;

  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
  const playerProgressionMapping = staticData?.progressionMapping?.[playerSlot] || staticData?.progressionMapping;

  // If the item itself is a base progressive item, return its direct count
  if (playerProgressionMapping && playerProgressionMapping[itemName]) {
    return snapshot.inventory[itemName] || 0;
  }

  // Check if itemName is a specific tier of any progressive item we hold
  if (playerProgressionMapping) {
    for (const [progressiveBase, progression] of Object.entries(playerProgressionMapping)) {
      const baseCount = snapshot.inventory[progressiveBase] || 0;

      if (baseCount > 0 && progression && progression.items) {
        for (const upgrade of progression.items) {
          if (upgrade.name === itemName ||
            (upgrade.provides && upgrade.provides.includes(itemName))) {
            return baseCount >= upgrade.level ? 1 : 0;
          }
        }
      }
    }
  }

  // Not a progressive item tier, return direct count
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has at least one of the specified items.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemNames - Array of item names to check
 * @param {number} player - Player ID (optional)
 * @returns {boolean} True if player has at least one of the items
 */
export function hasAny(snapshot, staticData, itemNames, player) {
  if (!Array.isArray(itemNames)) return false;
  return itemNames.some(itemName => has(snapshot, staticData, itemName, player));
}

/**
 * Check if player has all of the specified items.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemNames - Array of item names to check
 * @param {number} player - Player ID (optional)
 * @returns {boolean} True if player has all of the items
 */
export function hasAll(snapshot, staticData, itemNames, player) {
  if (!Array.isArray(itemNames)) return false;
  return itemNames.every(itemName => has(snapshot, staticData, itemName, player));
}

/**
 * Check if player has a certain number of unique items from a group.
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data with item groups
 * @param {string} groupName - Name of the item group
 * @param {number} player - Player ID (optional)
 * @param {number} countNeeded - Number of unique items needed from the group
 * @returns {boolean} True if player has enough unique items from the group
 */
export function hasGroupUnique(snapshot, staticData, groupName, player, countNeeded) {
  if (!snapshot.inventory) return false;

  const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;

  // Get the items data - check multiple possible locations
  const items = staticData?.itemsByPlayer?.[playerSlot] || staticData?.itemData || staticData?.items?.[playerSlot];
  if (!items) return false;

  // Find all items that belong to this group
  const groupItems = Object.values(items).filter(item =>
    item.groups && item.groups.includes(groupName)
  );

  // Count how many unique items from this group the player has
  let uniqueCount = 0;
  for (const item of groupItems) {
    if (has(snapshot, staticData, item.name, player)) {
      uniqueCount++;
      if (uniqueCount >= countNeeded) {
        return true;
      }
    }
  }

  return false;
}

// ============================================================================
// State method handlers for TWW logic
// ============================================================================

/**
 * Check if player can defeat all required bosses
 */
export function _tww_can_defeat_all_required_bosses(snapshot, staticData, player) {
  // This would need to check specific boss locations
  // For now, return true as a placeholder
  // TODO: Implement proper boss requirement checking
  return true;
}

/**
 * Check if player has the chart for a specific island
 */
export function _tww_has_chart_for_island(snapshot, staticData, player, islandNumber) {
  // TODO: Implement chart checking logic
  // This would need to map island numbers to chart names and check inventory
  return false;
}

/**
 * Check if in required bosses mode
 */
export function _tww_in_required_bosses_mode(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_in_required_bosses_mode ?? false;
}

/**
 * Check if NOT in required bosses mode
 */
export function _tww_outside_required_bosses_mode(snapshot, staticData, player) {
  return !_tww_in_required_bosses_mode(snapshot, staticData, player);
}

/**
 * Check if in swordless mode
 */
export function _tww_in_swordless_mode(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_in_swordless_mode ?? false;
}

/**
 * Check if NOT in swordless mode
 */
export function _tww_outside_swordless_mode(snapshot, staticData, player) {
  return !_tww_in_swordless_mode(snapshot, staticData, player);
}

/**
 * Check if obscure logic level 1 is enabled
 */
export function _tww_obscure_1(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_obscure_1 ?? false;
}

/**
 * Check if obscure logic level 2 is enabled
 */
export function _tww_obscure_2(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_obscure_2 ?? false;
}

/**
 * Check if obscure logic level 3 is enabled
 */
export function _tww_obscure_3(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_obscure_3 ?? false;
}

/**
 * Check if precise logic level 1 is enabled
 */
export function _tww_precise_1(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_precise_1 ?? false;
}

/**
 * Check if precise logic level 2 is enabled
 */
export function _tww_precise_2(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_precise_2 ?? false;
}

/**
 * Check if precise logic level 3 is enabled
 */
export function _tww_precise_3(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_precise_3 ?? false;
}

/**
 * Check if rematch bosses are skipped
 */
export function _tww_rematch_bosses_skipped(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_rematch_bosses_skipped ?? false;
}

/**
 * Check if tuner logic is enabled
 */
export function _tww_tuner_logic_enabled(snapshot, staticData, player) {
  const playerSlot = player || DEFAULT_PLAYER_ID;
  const settings = staticData?.settings?.[playerSlot];
  return settings?.logic_tuner_logic_enabled ?? false;
}

// ============================================================================
// Helper functions from Macros.py
// ============================================================================

// Song/Melody functions
export function can_play_winds_requiem(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Wind's Requiem"], player);
}

export function can_play_ballad_of_gales(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Ballad of Gales"], player);
}

export function can_play_command_melody(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Command Melody"], player);
}

export function can_play_earth_gods_lyric(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Earth God's Lyric"], player);
}

export function can_play_wind_gods_aria(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Wind God's Aria"], player);
}

export function can_play_song_of_passing(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Wind Waker", "Song of Passing"], player);
}

// Deku Leaf functions
export function can_fan_with_deku_leaf(snapshot, staticData, player) {
  return has(snapshot, staticData, "Deku Leaf", player);
}

export function can_fly_with_deku_leaf_indoors(snapshot, staticData, player) {
  return has(snapshot, staticData, "Deku Leaf", player) && has_magic_meter(snapshot, staticData, player);
}

export function can_fly_with_deku_leaf_outdoors(snapshot, staticData, player) {
  return has(snapshot, staticData, "Deku Leaf", player) &&
         has_magic_meter(snapshot, staticData, player) &&
         can_play_winds_requiem(snapshot, staticData, player);
}

// Equipment check functions
export function has_magic_meter(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Magic Meter", player, 1);
}

export function has_magic_meter_upgrade(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Magic Meter", player, 2);
}

export function has_heros_sword(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Sword", player, 1);
}

export function has_any_master_sword(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Sword", player, 2);
}

export function has_full_power_master_sword(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Sword", player, 4);
}

export function has_heros_shield(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Shield", player, 1);
}

export function has_mirror_shield(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Shield", player, 2);
}

export function has_heros_bow(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Bow", player, 1);
}

export function has_fire_arrows(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Bow", player, 2) && has_magic_meter(snapshot, staticData, player);
}

export function has_ice_arrows(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Bow", player, 2) && has_magic_meter(snapshot, staticData, player);
}

export function has_light_arrows(snapshot, staticData, player) {
  return has(snapshot, staticData, "Progressive Bow", player, 3) && has_magic_meter(snapshot, staticData, player);
}

export function has_any_wallet_upgrade(snapshot, staticData, player) {
  return has(snapshot, staticData, "Wallet Capacity Upgrade", player, 1);
}

export function has_any_quiver_upgrade(snapshot, staticData, player) {
  return has(snapshot, staticData, "Quiver Capacity Upgrade", player, 1);
}

// Utility functions
export function can_aim_mirror_shield(snapshot, staticData, player) {
  return has_mirror_shield(snapshot, staticData, player) && (
    hasAny(snapshot, staticData, ["Wind Waker", "Grappling Hook", "Boomerang", "Deku Leaf", "Hookshot"], player) ||
    has_heros_sword(snapshot, staticData, player) ||
    has_heros_bow(snapshot, staticData, player)
  );
}

export function can_move_boulders(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Power Bracelets"], player);
}

export function can_defeat_door_flowers(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Bombs", "Hookshot"], player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_destroy_seeds_hanging_by_vines(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Bombs", "Hookshot"], player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_cut_grass(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Skull Hammer", "Boomerang", "Bombs"], player) ||
         has_heros_sword(snapshot, staticData, player);
}

// Enemy defeat functions
export function can_defeat_boko_babas(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Skull Hammer", "Hookshot", "Bombs"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player) ||
         (can_fan_with_deku_leaf(snapshot, staticData, player) && has(snapshot, staticData, "Grappling Hook", player));
}

export function can_defeat_bokoblins(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_moblins(snapshot, staticData, player) {
  return can_defeat_bokoblins(snapshot, staticData, player);
}

export function can_defeat_darknuts(snapshot, staticData, player) {
  return has_heros_sword(snapshot, staticData, player) ||
         has_light_arrows(snapshot, staticData, player) ||
         has(snapshot, staticData, "Skull Hammer", player);
}

export function can_defeat_mighty_darknuts(snapshot, staticData, player) {
  return (has_heros_sword(snapshot, staticData, player) || has_light_arrows(snapshot, staticData, player)) ||
         (has(snapshot, staticData, "Skull Hammer", player) && _tww_precise_3(snapshot, staticData, player));
}

export function can_defeat_blue_bubbles(snapshot, staticData, player) {
  return has_ice_arrows(snapshot, staticData, player) ||
         has(snapshot, staticData, "Bombs", player) ||
         (
           (can_fan_with_deku_leaf(snapshot, staticData, player) || has(snapshot, staticData, "Hookshot", player)) &&
           (hasAny(snapshot, staticData, ["Grappling Hook", "Skull Hammer"], player) ||
            has_heros_sword(snapshot, staticData, player) ||
            has_heros_bow(snapshot, staticData, player))
         );
}

export function can_defeat_armos(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer", "Hookshot"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_wizzrobes(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Hookshot", "Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_stalfos(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_light_arrows(snapshot, staticData, player);
}

export function can_defeat_floormasters(snapshot, staticData, player) {
  return has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player) ||
         (has(snapshot, staticData, "Skull Hammer", player) && _tww_precise_1(snapshot, staticData, player));
}

export function can_defeat_mothulas(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_winged_mothulas(snapshot, staticData, player) {
  return can_defeat_mothulas(snapshot, staticData, player);
}

export function can_defeat_peahats(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Skull Hammer", "Bombs"], player) ||
         (has(snapshot, staticData, "Hookshot", player) && has_heros_sword(snapshot, staticData, player)) ||
         (can_fan_with_deku_leaf(snapshot, staticData, player) && has_heros_sword(snapshot, staticData, player)) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_remove_peahat_armor(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Hookshot", "Skull Hammer", "Bombs"], player) ||
         can_fan_with_deku_leaf(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_stun_magtails(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Skull Hammer", "Boomerang", "Hookshot", "Bombs", "Grappling Hook"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_morths(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Hookshot"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

// Boss defeat functions
export function can_defeat_gohma(snapshot, staticData, player) {
  return has(snapshot, staticData, "Grappling Hook", player);
}

export function can_defeat_kalle_demos(snapshot, staticData, player) {
  return has(snapshot, staticData, "Boomerang", player);
}

export function can_defeat_gohdan(snapshot, staticData, player) {
  return (
    has_heros_bow(snapshot, staticData, player) ||
    (has(snapshot, staticData, "Hookshot", player) && _tww_obscure_1(snapshot, staticData, player) && _tww_precise_2(snapshot, staticData, player))
  ) && has(snapshot, staticData, "Bombs", player);
}

export function can_defeat_helmaroc_king(snapshot, staticData, player) {
  return has(snapshot, staticData, "Skull Hammer", player);
}

export function can_defeat_jalhalla(snapshot, staticData, player) {
  return (
    (can_aim_mirror_shield(snapshot, staticData, player) || has_light_arrows(snapshot, staticData, player)) &&
    has(snapshot, staticData, "Power Bracelets", player) &&
    can_defeat_jalhalla_poes(snapshot, staticData, player)
  );
}

export function can_defeat_jalhalla_poes(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_molgera(snapshot, staticData, player) {
  return has(snapshot, staticData, "Hookshot", player) && (
    hasAny(snapshot, staticData, ["Boomerang", "Grappling Hook", "Skull Hammer", "Bombs"], player) ||
    has_heros_sword(snapshot, staticData, player) ||
    has_heros_bow(snapshot, staticData, player)
  );
}

export function can_defeat_phantom_ganon(snapshot, staticData, player) {
  return (_tww_outside_swordless_mode(snapshot, staticData, player) && has_any_master_sword(snapshot, staticData, player)) ||
         (_tww_in_swordless_mode(snapshot, staticData, player) && has(snapshot, staticData, "Skull Hammer", player));
}

// Dragon Roost Cavern functions
export function can_reach_dragon_roost_cavern_gaping_maw(snapshot, staticData, player) {
  return has(snapshot, staticData, "DRC Small Key", player, 1) && (
    (has(snapshot, staticData, "DRC Small Key", player, 4) && can_cut_down_hanging_drc_platform(snapshot, staticData, player)) ||
    (can_fly_with_deku_leaf_indoors(snapshot, staticData, player) && _tww_obscure_2(snapshot, staticData, player)) ||
    (has_ice_arrows(snapshot, staticData, player) && _tww_obscure_2(snapshot, staticData, player) && _tww_precise_1(snapshot, staticData, player))
  );
}

export function can_reach_dragon_roost_cavern_boss_stairs(snapshot, staticData, player) {
  return has(snapshot, staticData, "DRC Small Key", player, 4) && (
    hasAny(snapshot, staticData, ["Grappling Hook", "Hookshot"], player) ||
    can_fly_with_deku_leaf_indoors(snapshot, staticData, player) ||
    has_ice_arrows(snapshot, staticData, player)
  );
}

export function can_cut_down_hanging_drc_platform(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player) ||
         (has(snapshot, staticData, "Hookshot", player) && _tww_precise_1(snapshot, staticData, player)) ||
         (has(snapshot, staticData, "Grappling Hook", player) && _tww_precise_1(snapshot, staticData, player));
}

// Tower of the Gods functions
export function can_reach_tower_of_the_gods_second_floor(snapshot, staticData, player) {
  return hasAll(snapshot, staticData, ["Bombs", "TotG Small Key"], player) && can_defeat_yellow_chuchus(snapshot, staticData, player);
}

export function can_defeat_yellow_chuchus(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Bombs", "Skull Hammer"], player) ||
         (has(snapshot, staticData, "Boomerang", player) && has_heros_sword(snapshot, staticData, player)) ||
         has_heros_bow(snapshot, staticData, player) ||
         (can_fan_with_deku_leaf(snapshot, staticData, player) && has_heros_sword(snapshot, staticData, player)) ||
         (has(snapshot, staticData, "Grappling Hook", player) && has_heros_sword(snapshot, staticData, player) &&
          _tww_obscure_1(snapshot, staticData, player) && _tww_precise_2(snapshot, staticData, player));
}

export function can_reach_tower_of_the_gods_third_floor(snapshot, staticData, player) {
  return can_reach_tower_of_the_gods_second_floor(snapshot, staticData, player) &&
         can_bring_west_servant_of_the_tower(snapshot, staticData, player) &&
         can_bring_north_servant_of_the_tower(snapshot, staticData, player) &&
         has(snapshot, staticData, "Wind Waker", player);
}

export function can_bring_west_servant_of_the_tower(snapshot, staticData, player) {
  return (has(snapshot, staticData, "Grappling Hook", player) || can_fly_with_deku_leaf_indoors(snapshot, staticData, player)) &&
         can_play_command_melody(snapshot, staticData, player) &&
         has_heros_bow(snapshot, staticData, player);
}

export function can_bring_north_servant_of_the_tower(snapshot, staticData, player) {
  return has(snapshot, staticData, "TotG Small Key", player, 2) &&
         (can_fly_with_deku_leaf_indoors(snapshot, staticData, player) || _tww_obscure_1(snapshot, staticData, player)) &&
         can_play_command_melody(snapshot, staticData, player);
}

// Earth Temple functions
export function can_reach_earth_temple_sun_statue_room(snapshot, staticData, player) {
  return can_play_command_melody(snapshot, staticData, player) &&
         can_defeat_red_chuchus(snapshot, staticData, player) &&
         can_defeat_green_chuchus(snapshot, staticData, player);
}

export function can_defeat_red_chuchus(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Skull Hammer", "Bombs"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player);
}

export function can_defeat_green_chuchus(snapshot, staticData, player) {
  return can_defeat_red_chuchus(snapshot, staticData, player);
}

export function can_reach_earth_temple_right_path(snapshot, staticData, player) {
  return can_reach_earth_temple_sun_statue_room(snapshot, staticData, player) &&
         can_play_command_melody(snapshot, staticData, player) &&
         has(snapshot, staticData, "Skull Hammer", player);
}

export function can_reach_earth_temple_left_path(snapshot, staticData, player) {
  return can_reach_earth_temple_sun_statue_room(snapshot, staticData, player) &&
         has(snapshot, staticData, "ET Small Key", player, 2);
}

export function can_reach_earth_temple_moblins_and_poes_room(snapshot, staticData, player) {
  return can_reach_earth_temple_left_path(snapshot, staticData, player) &&
         has_fire_arrows(snapshot, staticData, player) &&
         has(snapshot, staticData, "Power Bracelets", player) &&
         can_defeat_floormasters(snapshot, staticData, player) &&
         (can_play_command_melody(snapshot, staticData, player) || has_mirror_shield(snapshot, staticData, player));
}

export function can_reach_earth_temple_basement(snapshot, staticData, player) {
  return can_reach_earth_temple_sun_statue_room(snapshot, staticData, player) &&
         can_play_command_melody(snapshot, staticData, player) &&
         can_aim_mirror_shield(snapshot, staticData, player);
}

export function can_reach_earth_temple_redead_hub_room(snapshot, staticData, player) {
  return can_reach_earth_temple_basement(snapshot, staticData, player) &&
         can_play_earth_gods_lyric(snapshot, staticData, player);
}

export function can_reach_earth_temple_third_crypt(snapshot, staticData, player) {
  return can_reach_earth_temple_redead_hub_room(snapshot, staticData, player) &&
         (can_play_command_melody(snapshot, staticData, player) || can_aim_mirror_shield(snapshot, staticData, player)) &&
         hasAll(snapshot, staticData, ["Power Bracelets", "Skull Hammer"], player) &&
         has(snapshot, staticData, "ET Small Key", player, 3) &&
         (can_defeat_red_bubbles(snapshot, staticData, player) || _tww_precise_2(snapshot, staticData, player)) &&
         can_play_command_melody(snapshot, staticData, player) &&
         can_aim_mirror_shield(snapshot, staticData, player);
}

export function can_defeat_red_bubbles(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Skull Hammer", "Bombs"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         has_heros_bow(snapshot, staticData, player) ||
         (
           (can_fan_with_deku_leaf(snapshot, staticData, player) || has(snapshot, staticData, "Hookshot", player)) &&
           has(snapshot, staticData, "Grappling Hook", player)
         );
}

export function can_reach_earth_temple_tall_vine_room(snapshot, staticData, player) {
  return can_reach_earth_temple_third_crypt(snapshot, staticData, player) &&
         can_play_earth_gods_lyric(snapshot, staticData, player);
}

export function can_reach_earth_temple_many_mirrors_room(snapshot, staticData, player) {
  return can_reach_earth_temple_tall_vine_room(snapshot, staticData, player);
}

// Wind Temple functions
export function can_reach_wind_temple_kidnapping_room(snapshot, staticData, player) {
  return can_play_command_melody(snapshot, staticData, player) &&
         has(snapshot, staticData, "Iron Boots", player) &&
         can_fly_with_deku_leaf_indoors(snapshot, staticData, player);
}

export function can_open_wind_temple_upper_giant_grate(snapshot, staticData, player) {
  return can_reach_end_of_wind_temple_many_cyclones_room(snapshot, staticData, player) &&
         has(snapshot, staticData, "Iron Boots", player);
}

export function can_reach_end_of_wind_temple_many_cyclones_room(snapshot, staticData, player) {
  return can_reach_wind_temple_kidnapping_room(snapshot, staticData, player) && (
    (
      has(snapshot, staticData, "Iron Boots", player) &&
      can_fan_with_deku_leaf(snapshot, staticData, player) &&
      can_fly_with_deku_leaf_indoors(snapshot, staticData, player) &&
      can_cut_grass(snapshot, staticData, player)
    ) ||
    (
      has(snapshot, staticData, "Hookshot", player) &&
      can_defeat_blue_bubbles(snapshot, staticData, player) &&
      can_fly_with_deku_leaf_indoors(snapshot, staticData, player)
    ) ||
    (
      has(snapshot, staticData, "Hookshot", player) &&
      can_fly_with_deku_leaf_indoors(snapshot, staticData, player) &&
      _tww_obscure_1(snapshot, staticData, player) &&
      _tww_precise_2(snapshot, staticData, player)
    )
  );
}

export function can_activate_wind_temple_giant_fan(snapshot, staticData, player) {
  return can_open_wind_temple_upper_giant_grate(snapshot, staticData, player) &&
         can_play_command_melody(snapshot, staticData, player);
}

export function can_reach_wind_temple_tall_basement_room(snapshot, staticData, player) {
  return can_open_wind_temple_upper_giant_grate(snapshot, staticData, player) &&
         can_open_wind_temple_lower_giant_grate(snapshot, staticData, player) &&
         has(snapshot, staticData, "WT Small Key", player, 2);
}

export function can_open_wind_temple_lower_giant_grate(snapshot, staticData, player) {
  return can_reach_wind_temple_kidnapping_room(snapshot, staticData, player) &&
         has(snapshot, staticData, "Hookshot", player) &&
         can_defeat_blue_bubbles(snapshot, staticData, player);
}

// Hyrule and Forsaken Fortress functions
export function can_access_hyrule(snapshot, staticData, player) {
  return hasGroupUnique(snapshot, staticData, "Shards", player, 8);
}

export function can_get_inside_forsaken_fortress(snapshot, staticData, player) {
  return can_get_past_forsaken_fortress_gate(snapshot, staticData, player) &&
         has(snapshot, staticData, "Skull Hammer", player);
}

export function can_get_past_forsaken_fortress_gate(snapshot, staticData, player) {
  return has(snapshot, staticData, "Bombs", player) ||
         (_tww_obscure_1(snapshot, staticData, player) && _tww_precise_1(snapshot, staticData, player)) ||
         (can_open_ganons_tower_dark_portal(snapshot, staticData, player) && _tww_obscure_1(snapshot, staticData, player));
}

export function can_reach_and_defeat_phantom_ganon(snapshot, staticData, player) {
  return can_get_past_forsaken_fortress_gate(snapshot, staticData, player) &&
         can_defeat_phantom_ganon(snapshot, staticData, player);
}

// Ganon's Tower functions
export function can_reach_ganons_tower_phantom_ganon_room(snapshot, staticData, player) {
  return can_access_ganons_tower(snapshot, staticData, player) &&
         can_unlock_ganons_tower_four_boss_door(snapshot, staticData, player);
}

export function can_access_ganons_tower(snapshot, staticData, player) {
  return can_get_past_hyrule_barrier(snapshot, staticData, player) && (
    has(snapshot, staticData, "Hookshot", player) || can_fly_with_deku_leaf_indoors(snapshot, staticData, player)
  );
}

export function can_get_past_hyrule_barrier(snapshot, staticData, player) {
  return can_access_hyrule(snapshot, staticData, player) && (
    has_full_power_master_sword(snapshot, staticData, player) || _tww_in_swordless_mode(snapshot, staticData, player)
  );
}

export function can_unlock_ganons_tower_four_boss_door(snapshot, staticData, player) {
  return can_complete_all_memory_dungeons_and_bosses(snapshot, staticData, player) ||
         _tww_rematch_bosses_skipped(snapshot, staticData, player);
}

export function can_complete_all_memory_dungeons_and_bosses(snapshot, staticData, player) {
  return can_complete_memory_dragon_roost_cavern_and_gohma(snapshot, staticData, player) &&
         can_complete_memory_forbidden_woods_and_kalle_demos(snapshot, staticData, player) &&
         can_complete_memory_earth_temple_and_jalhalla(snapshot, staticData, player) &&
         can_complete_memory_wind_temple_and_molgera(snapshot, staticData, player);
}

export function can_complete_memory_dragon_roost_cavern_and_gohma(snapshot, staticData, player) {
  return has(snapshot, staticData, "Grappling Hook", player) &&
         can_fly_with_deku_leaf_indoors(snapshot, staticData, player) &&
         can_defeat_gohma(snapshot, staticData, player);
}

export function can_complete_memory_forbidden_woods_and_kalle_demos(snapshot, staticData, player) {
  return can_fan_with_deku_leaf(snapshot, staticData, player) &&
         can_fly_with_deku_leaf_indoors(snapshot, staticData, player) &&
         can_defeat_kalle_demos(snapshot, staticData, player);
}

export function can_complete_memory_earth_temple_and_jalhalla(snapshot, staticData, player) {
  return can_defeat_jalhalla(snapshot, staticData, player);
}

export function can_complete_memory_wind_temple_and_molgera(snapshot, staticData, player) {
  return can_fly_with_deku_leaf_indoors(snapshot, staticData, player) &&
         can_defeat_molgera(snapshot, staticData, player);
}

export function can_open_ganons_tower_dark_portal(snapshot, staticData, player) {
  return can_reach_ganons_tower_phantom_ganon_room(snapshot, staticData, player) &&
         has(snapshot, staticData, "Boomerang", player);
}

export function can_reach_and_defeat_ganondorf(snapshot, staticData, player) {
  return can_reach_and_defeat_puppet_ganon(snapshot, staticData, player) &&
         hasAll(snapshot, staticData, ["Grappling Hook", "Hookshot"], player) &&
         can_defeat_ganondorf(snapshot, staticData, player);
}

export function can_reach_and_defeat_puppet_ganon(snapshot, staticData, player) {
  return can_reach_ganons_tower_phantom_ganon_room(snapshot, staticData, player) &&
         has_light_arrows(snapshot, staticData, player) &&
         can_unlock_puppet_ganon_door(snapshot, staticData, player) &&
         can_defeat_puppet_ganon(snapshot, staticData, player);
}

export function can_unlock_puppet_ganon_door(snapshot, staticData, player) {
  return can_defeat_moblins(snapshot, staticData, player) &&
         can_defeat_mighty_darknuts(snapshot, staticData, player) &&
         (
           _tww_outside_required_bosses_mode(snapshot, staticData, player) ||
           (_tww_in_required_bosses_mode(snapshot, staticData, player) && _tww_can_defeat_all_required_bosses(snapshot, staticData, player))
         );
}

export function can_defeat_puppet_ganon(snapshot, staticData, player) {
  return has_light_arrows(snapshot, staticData, player) &&
         (has(snapshot, staticData, "Boomerang", player) || _tww_precise_2(snapshot, staticData, player));
}

export function can_defeat_ganondorf(snapshot, staticData, player) {
  return (has_heros_sword(snapshot, staticData, player) || _tww_in_swordless_mode(snapshot, staticData, player)) &&
         (has_heros_shield(snapshot, staticData, player) ||
          (has(snapshot, staticData, "Skull Hammer", player) && _tww_obscure_2(snapshot, staticData, player)));
}

// Other location access functions
export function can_reach_outset_island_upper_level(snapshot, staticData, player) {
  return can_cut_down_outset_trees(snapshot, staticData, player) || (
    can_fly_with_deku_leaf_outdoors(snapshot, staticData, player) && _tww_obscure_1(snapshot, staticData, player)
  );
}

export function can_cut_down_outset_trees(snapshot, staticData, player) {
  return hasAny(snapshot, staticData, ["Boomerang", "Skull Hammer"], player) ||
         has_heros_sword(snapshot, staticData, player) ||
         (has(snapshot, staticData, "Power Bracelets", player) && _tww_obscure_3(snapshot, staticData, player));
}

export function can_access_forest_of_fairies(snapshot, staticData, player) {
  return can_reach_outset_island_upper_level(snapshot, staticData, player) &&
         can_fly_with_deku_leaf_outdoors(snapshot, staticData, player);
}

export function can_access_forest_haven(snapshot, staticData, player) {
  return has(snapshot, staticData, "Grappling Hook", player) || can_fly_with_deku_leaf_outdoors(snapshot, staticData, player);
}

/**
 * Export all state methods and helper functions
 */
export default {
  // Core utilities
  has,
  count,
  hasAny,
  hasAll,
  hasGroupUnique,

  // State methods
  _tww_can_defeat_all_required_bosses,
  _tww_has_chart_for_island,
  _tww_in_required_bosses_mode,
  _tww_outside_required_bosses_mode,
  _tww_in_swordless_mode,
  _tww_outside_swordless_mode,
  _tww_obscure_1,
  _tww_obscure_2,
  _tww_obscure_3,
  _tww_precise_1,
  _tww_precise_2,
  _tww_precise_3,
  _tww_rematch_bosses_skipped,
  _tww_tuner_logic_enabled,

  // Helper functions
  can_play_winds_requiem,
  can_play_ballad_of_gales,
  can_play_command_melody,
  can_play_earth_gods_lyric,
  can_play_wind_gods_aria,
  can_play_song_of_passing,
  can_fan_with_deku_leaf,
  can_fly_with_deku_leaf_indoors,
  can_fly_with_deku_leaf_outdoors,
  has_magic_meter,
  has_magic_meter_upgrade,
  has_heros_sword,
  has_any_master_sword,
  has_full_power_master_sword,
  has_heros_shield,
  has_mirror_shield,
  has_heros_bow,
  has_fire_arrows,
  has_ice_arrows,
  has_light_arrows,
  has_any_wallet_upgrade,
  has_any_quiver_upgrade,
  can_aim_mirror_shield,
  can_move_boulders,
  can_defeat_door_flowers,
  can_destroy_seeds_hanging_by_vines,
  can_cut_grass,
  can_defeat_boko_babas,
  can_defeat_bokoblins,
  can_defeat_moblins,
  can_defeat_darknuts,
  can_defeat_mighty_darknuts,
  can_defeat_blue_bubbles,
  can_defeat_armos,
  can_defeat_wizzrobes,
  can_defeat_stalfos,
  can_defeat_floormasters,
  can_defeat_mothulas,
  can_defeat_winged_mothulas,
  can_defeat_peahats,
  can_remove_peahat_armor,
  can_stun_magtails,
  can_defeat_morths,
  can_defeat_gohma,
  can_defeat_kalle_demos,
  can_defeat_gohdan,
  can_defeat_helmaroc_king,
  can_defeat_jalhalla,
  can_defeat_jalhalla_poes,
  can_defeat_molgera,
  can_defeat_phantom_ganon,
  can_reach_dragon_roost_cavern_gaping_maw,
  can_reach_dragon_roost_cavern_boss_stairs,
  can_cut_down_hanging_drc_platform,
  can_reach_tower_of_the_gods_second_floor,
  can_defeat_yellow_chuchus,
  can_reach_tower_of_the_gods_third_floor,
  can_bring_west_servant_of_the_tower,
  can_bring_north_servant_of_the_tower,
  can_reach_earth_temple_sun_statue_room,
  can_defeat_red_chuchus,
  can_defeat_green_chuchus,
  can_reach_earth_temple_right_path,
  can_reach_earth_temple_left_path,
  can_reach_earth_temple_moblins_and_poes_room,
  can_reach_earth_temple_basement,
  can_reach_earth_temple_redead_hub_room,
  can_reach_earth_temple_third_crypt,
  can_defeat_red_bubbles,
  can_reach_earth_temple_tall_vine_room,
  can_reach_earth_temple_many_mirrors_room,
  can_reach_wind_temple_kidnapping_room,
  can_open_wind_temple_upper_giant_grate,
  can_reach_end_of_wind_temple_many_cyclones_room,
  can_activate_wind_temple_giant_fan,
  can_reach_wind_temple_tall_basement_room,
  can_open_wind_temple_lower_giant_grate,
  can_access_hyrule,
  can_get_inside_forsaken_fortress,
  can_get_past_forsaken_fortress_gate,
  can_reach_and_defeat_phantom_ganon,
  can_reach_ganons_tower_phantom_ganon_room,
  can_access_ganons_tower,
  can_get_past_hyrule_barrier,
  can_unlock_ganons_tower_four_boss_door,
  can_complete_all_memory_dungeons_and_bosses,
  can_complete_memory_dragon_roost_cavern_and_gohma,
  can_complete_memory_forbidden_woods_and_kalle_demos,
  can_complete_memory_earth_temple_and_jalhalla,
  can_complete_memory_wind_temple_and_molgera,
  can_open_ganons_tower_dark_portal,
  can_reach_and_defeat_ganondorf,
  can_reach_and_defeat_puppet_ganon,
  can_unlock_puppet_ganon_door,
  can_defeat_puppet_ganon,
  can_defeat_ganondorf,
  can_reach_outset_island_upper_level,
  can_cut_down_outset_trees,
  can_access_forest_of_fairies,
  can_access_forest_haven,
};

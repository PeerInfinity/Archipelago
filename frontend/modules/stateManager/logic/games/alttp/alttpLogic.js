/**
 * Thread-agnostic ALTTP game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

/**
 * Check if player has an item, handling progressive items
 * @param {Object} state - Canonical state object
 * @param {string} itemName - Name of the item to check
 * @param {Object} staticData - Static game data including progressionMapping
 * @returns {boolean} True if player has the item
 */
export function has(state, itemName, staticData) {
  // First check if it's in flags (events, checked locations, etc.)
  if (state.flags && state.flags.includes(itemName)) {
    return true;
  }
  
  // Also check state.state.events for compatibility with current format
  if (state.state && state.state.events && state.state.events.includes(itemName)) {
    return true;
  }
  
  // Check inventory
  if (!state.inventory) return false;
  
  // Direct item check
  if ((state.inventory[itemName] || 0) > 0) {
    return true;
  }
  
  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    // Check if this item is provided by any progressive item
    for (const [progressiveBase, tiers] of Object.entries(staticData.progressionMapping)) {
      const baseCount = state.inventory[progressiveBase] || 0;
      if (baseCount > 0 && Array.isArray(tiers)) {
        // Check each tier up to our count
        for (let i = 0; i < Math.min(baseCount, tiers.length); i++) {
          if (tiers[i] === itemName || 
              (Array.isArray(tiers[i]) && tiers[i].includes(itemName))) {
            return true;
          }
        }
      }
    }
  }
  
  return false;
}

/**
 * Count how many of an item the player has
 * @param {Object} state - Canonical state object
 * @param {string} itemName - Name of the item to count
 * @param {Object} staticData - Static game data
 * @returns {number} Count of the item
 */
export function count(state, itemName, staticData) {
  if (!state.inventory) return 0;
  
  // For progressive items, we need to check if this is a specific tier
  if (staticData && staticData.progressionMapping) {
    for (const [progressiveBase, tiers] of Object.entries(staticData.progressionMapping)) {
      if (Array.isArray(tiers)) {
        for (let i = 0; i < tiers.length; i++) {
          const tier = tiers[i];
          if (tier === itemName || (Array.isArray(tier) && tier.includes(itemName))) {
            // This item is provided by a progressive item
            // Return 1 if we have enough of the base item, 0 otherwise
            const baseCount = state.inventory[progressiveBase] || 0;
            return baseCount > i ? 1 : 0;
          }
        }
      }
    }
  }
  
  // Not a progressive item tier, return direct count
  return state.inventory[itemName] || 0;
}

// --- ALTTP-specific helper functions ---

export function is_not_bunny(state, world, itemName, staticData) {
  return has(state, 'Moon Pearl', staticData);
}

export function can_lift_rocks(state, world, itemName, staticData) {
  return has(state, 'Power Glove', staticData) || has(state, 'Titans Mitts', staticData);
}

export function can_lift_heavy_rocks(state, world, itemName, staticData) {
  return has(state, 'Titans Mitts', staticData);
}

export function can_light_torches(state, world, itemName, staticData) {
  return has(state, 'Fire Rod', staticData) || has(state, 'Lamp', staticData);
}

export function can_melt_things(state, world, itemName, staticData) {
  return has(state, 'Fire Rod', staticData) || 
         (has(state, 'Bombos', staticData) && 
          (has(state, 'Progressive Sword', staticData) || state.settings?.swordless));
}

export function can_fly(state, world, itemName, staticData) {
  return has(state, 'Flute', staticData);
}

export function can_dash(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData);
}

export function is_invincible(state, world, itemName, staticData) {
  return has(state, 'Cape', staticData) || 
         has(state, 'Cane of Byrna', staticData) || 
         state.settings?.goal === 'triforce_hunt';
}

export function can_block_lasers(state, world, itemName, staticData) {
  return has(state, 'Mirror Shield', staticData);
}

export function can_extend_magic(state, world, itemName, staticData) {
  const bottleCount = count(state, 'Bottle', staticData);
  return (has(state, 'Magic Upgrade (1/2)', staticData) || 
          has(state, 'Magic Upgrade (1/4)', staticData) || 
          bottleCount > 0);
}

export function can_kill_most_things(state, world, itemName, staticData) {
  return (has(state, 'Progressive Sword', staticData) || 
          has(state, 'Cane of Somaria', staticData) || 
          has(state, 'Fire Rod', staticData) || 
          (has(state, 'Bombos', staticData) && 
           (has(state, 'Progressive Sword', staticData) || state.settings?.swordless)) || 
          has(state, 'Progressive Bow', staticData) || 
          has(state, 'Hammer', staticData) || 
          can_shoot_silver_arrows(state, world, itemName, staticData));
}

export function can_shoot_silver_arrows(state, world, itemName, staticData) {
  return has(state, 'Progressive Bow', staticData) && 
         has(state, 'Silver Arrows', staticData);
}

export function can_defeat_ganon(state, world, itemName, staticData) {
  if (has(state, 'Triforce', staticData)) {
    return true;
  }
  
  return can_shoot_silver_arrows(state, world, itemName, staticData) && 
         (has(state, 'Lamp', staticData) || 
          (has(state, 'Fire Rod', staticData) && can_extend_magic(state, world, itemName, staticData))) &&
         (count(state, 'Progressive Sword', staticData) >= 2 || 
          (has(state, 'Hammer', staticData) && 
           (state.settings?.game_mode === 'swordless' || state.settings?.swordless)));
}

export function can_get_good_bee(state, world, itemName, staticData) {
  const bottleCount = count(state, 'Bottle', staticData);
  return (has(state, 'Bug Catching Net', staticData) && 
          bottleCount > 0 && 
          (has(state, 'Pegasus Boots', staticData) || 
           (has(state, 'Progressive Sword', staticData) && has(state, 'Quake', staticData))));
}

export function can_retrieve_tablet(state, world, itemName, staticData) {
  return has(state, 'Book of Mudora', staticData) && 
         count(state, 'Progressive Sword', staticData) >= 2;
}

export function can_flute(state, world, itemName, staticData) {
  return has(state, 'Flute', staticData);
}

export function can_flute_spot_5(state, world, itemName, staticData) {
  return has(state, 'Flute', staticData) && has(state, 'Titans Mitts', staticData);
}

export function has_bottle(state, world, itemName, staticData) {
  return count(state, 'Bottle', staticData) > 0;
}

export function has_hearts(state, world, itemName, staticData) {
  // Get heart count from parameters
  const heartCount = parseInt(itemName, 10) || 0;
  if (heartCount === 0) return true;
  
  // Count heart containers and pieces
  const heartContainers = count(state, 'Boss Heart Container', staticData);
  const heartPieces = count(state, 'Piece of Heart', staticData);
  const totalHearts = 3 + heartContainers + Math.floor(heartPieces / 4);
  
  return totalHearts >= heartCount;
}

export function can_heart_skip(state, world, itemName, staticData) {
  return is_invincible(state, world, itemName, staticData);
}

export function has_fire_source(state, world, itemName, staticData) {
  return has(state, 'Lamp', staticData) || has(state, 'Fire Rod', staticData);
}

export function can_anima_transfigure(state, world, itemName, staticData) {
  const pendantCount = 
    (has(state, 'Green Pendant', staticData) ? 1 : 0) +
    (has(state, 'Blue Pendant', staticData) ? 1 : 0) +
    (has(state, 'Red Pendant', staticData) ? 1 : 0);
  return pendantCount >= 2;
}

export function has_crystals(state, world, itemName, staticData) {
  const crystalCount = parseInt(itemName, 10) || 0;
  if (crystalCount === 0) return true;
  
  let totalCrystals = 0;
  for (let i = 1; i <= 7; i++) {
    if (has(state, `Crystal ${i}`, staticData)) {
      totalCrystals++;
    }
  }
  
  return totalCrystals >= crystalCount;
}

export function has_beam_sword(state, world, itemName, staticData) {
  return count(state, 'Progressive Sword', staticData) >= 2;
}

export function has_melee_weapon(state, world, itemName, staticData) {
  return has(state, 'Progressive Sword', staticData) || 
         has(state, 'Hammer', staticData) || 
         has(state, 'Fire Rod', staticData) || 
         has(state, 'Cane of Somaria', staticData) || 
         has(state, 'Cane of Byrna', staticData) || 
         has(state, 'Bug Catching Net', staticData);
}

export function has_rod(state, world, itemName, staticData) {
  return has(state, 'Fire Rod', staticData) || 
         has(state, 'Ice Rod', staticData);
}

// Mode-specific helpers

export function can_bomb_clip(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) && 
         state.settings?.mode === 'minor_glitches';
}

export function can_spin_speed(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) && 
         has(state, 'Progressive Sword', staticData) && 
         state.settings?.mode === 'minor_glitches';
}

export function can_revival_fairy_shop(state, world, itemName, staticData) {
  return count(state, 'Bottle', staticData) > 0 && 
         state.settings?.mode === 'minor_glitches';
}

export function can_boots_clip_lw(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) && 
         state.settings?.mode === 'minor_glitches';
}

export function can_boots_clip_dw(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) && 
         has(state, 'Moon Pearl', staticData) && 
         state.settings?.mode === 'minor_glitches';
}

// Dungeon-specific helpers

export function can_complete_gt_climb(state, world, itemName, staticData) {
  return (has(state, 'Hammer', staticData) || 
          (has(state, 'Hookshot', staticData) && 
           (has(state, 'Lamp', staticData) || has(state, 'Fire Rod', staticData)))) && 
         has(state, 'Progressive Bow', staticData) && 
         has(state, 'Big Key (Ganons Tower)', staticData);
}

// Medallion helpers

export function has_misery_mire_medallion(state, world, itemName, staticData) {
  const medallion = state.settings?.mm_medallion || 'Ether';
  return has(state, medallion, staticData);
}

export function has_turtle_rock_medallion(state, world, itemName, staticData) {
  const medallion = state.settings?.tr_medallion || 'Quake';
  return has(state, medallion, staticData);
}

// Helper function registry
export const helperFunctions = {
  is_not_bunny,
  can_lift_rocks,
  can_lift_heavy_rocks,
  can_light_torches,
  can_melt_things,
  can_fly,
  can_dash,
  is_invincible,
  can_block_lasers,
  can_extend_magic,
  can_kill_most_things,
  can_shoot_silver_arrows,
  can_defeat_ganon,
  can_get_good_bee,
  can_retrieve_tablet,
  can_flute,
  can_flute_spot_5,
  has_bottle,
  has_hearts,
  can_heart_skip,
  has_fire_source,
  can_anima_transfigure,
  has_crystals,
  has_beam_sword,
  has_melee_weapon,
  has_rod,
  can_bomb_clip,
  can_spin_speed,
  can_revival_fairy_shop,
  can_boots_clip_lw,
  can_boots_clip_dw,
  can_complete_gt_climb,
  has_misery_mire_medallion,
  has_turtle_rock_medallion,
  has,
  count
};
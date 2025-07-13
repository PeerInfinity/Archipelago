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
  
  // Also check state.events (promoted from state.state.events)
  if (state.events && state.events.includes(itemName)) {
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
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = state.inventory[progressiveBase] || 0;
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
 * Count how many of an item the player has
 * @param {Object} state - Canonical state object
 * @param {string} itemName - Name of the item to count
 * @param {Object} staticData - Static game data
 * @returns {number} Count of the item
 */
export function count(state, itemName, staticData) {
  if (!state.inventory) return 0;
  
  // If the item itself is a base progressive item, return its direct count
  if (staticData && staticData.progressionMapping && staticData.progressionMapping[itemName]) {
    return state.inventory[itemName] || 0;
  }
  
  // Check if itemName is a specific tier of any progressive item we hold
  if (staticData && staticData.progressionMapping) {
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = state.inventory[progressiveBase] || 0;
      if (baseCount > 0 && progression && progression.items) {
        // Check each upgrade in the progression
        for (const upgrade of progression.items) {
          if (upgrade.name === itemName || 
              (upgrade.provides && upgrade.provides.includes(itemName))) {
            // Return 1 if we have enough of the base item to have reached this tier, 0 otherwise
            return baseCount >= upgrade.level ? 1 : 0;
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
          (has_sword(state, world, itemName, staticData) || state.settings?.swordless));
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
  const enemies = parseInt(itemName, 10) || 5;
  
  // Check if enemy shuffle is enabled
  const enemyShuffle = state.settings?.enemy_shuffle;
  
  if (enemyShuffle) {
    // Enemizer mode - need everything
    return has_melee_weapon(state, world, itemName, staticData) &&
           has(state, 'Cane of Somaria', staticData) &&
           has(state, 'Cane of Byrna', staticData) &&
           can_extend_magic(state, world, itemName, staticData) &&
           can_shoot_arrows(state, world, '0', staticData) &&
           has(state, 'Fire Rod', staticData) &&
           can_use_bombs(state, world, (enemies * 4).toString(), staticData);
  } else {
    // Normal enemy logic - any of these work
    if (has_melee_weapon(state, world, itemName, staticData)) return true;
    if (has(state, 'Cane of Somaria', staticData)) return true;
    if (has(state, 'Cane of Byrna', staticData) && 
        (enemies < 6 || can_extend_magic(state, world, itemName, staticData))) return true;
    if (can_shoot_arrows(state, world, '0', staticData)) return true;
    if (has(state, 'Fire Rod', staticData)) return true;
    
    // Bombs work on easy/default enemy health
    const enemyHealth = state.settings?.enemy_health || 'default';
    if ((enemyHealth === 'easy' || enemyHealth === 'default') &&
        can_use_bombs(state, world, (enemies * 4).toString(), staticData)) {
      return true;
    }
    
    return false;
  }
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
         (has_beam_sword(state, world, itemName, staticData) || 
          (has(state, 'Hammer', staticData) && 
           (state.settings?.game_mode === 'swordless' || state.settings?.swordless)));
}

// Additional commonly used helpers

export function can_use_bombs(state, world, itemName, staticData) {
  const quantity = parseInt(itemName, 10) || 1;
  
  // Start with base bombs (10 unless bombless start)
  let bombs = 0;
  const bomblessStart = state.settings?.bombless_start || 
                       (state.flags && state.flags.includes('bombless_start'));
  if (!bomblessStart) {
    bombs = 10;
  }
  
  // Add bomb upgrades
  bombs += count(state, 'Bomb Upgrade (+5)', staticData) * 5;
  bombs += count(state, 'Bomb Upgrade (+10)', staticData) * 10;
  bombs += count(state, 'Bomb Upgrade (50)', staticData) * 50;
  
  // Bomb Upgrade (+5) beyond the 6th gives +10
  const upgrade5Count = count(state, 'Bomb Upgrade (+5)', staticData);
  bombs += Math.max(0, (upgrade5Count - 6) * 10);
  
  // If capacity upgrades are NOT shuffled and we have Capacity Upgrade Shop, add 40
  const shuffleUpgrades = state.settings?.shuffle_capacity_upgrades;
  if (!shuffleUpgrades && has(state, 'Capacity Upgrade Shop', staticData)) {
    bombs += 40;
  }
  
  return bombs >= Math.min(quantity, 50);
}

export function can_bomb_or_bonk(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) || can_use_bombs(state, world, '1', staticData);
}

export function can_activate_crystal_switch(state, world, itemName, staticData) {
  return has_melee_weapon(state, world, itemName, staticData) ||
         can_use_bombs(state, world, '1', staticData) ||
         can_shoot_arrows(state, world, '0', staticData) ||
         has(state, 'Hookshot', staticData) ||
         has(state, 'Cane of Somaria', staticData) ||
         has(state, 'Cane of Byrna', staticData) ||
         has(state, 'Fire Rod', staticData) ||
         has(state, 'Ice Rod', staticData) ||
         has(state, 'Blue Boomerang', staticData) ||
         has(state, 'Red Boomerang', staticData);
}

export function can_buy(state, world, itemName, staticData) {
  // TODO: Implement proper shop logic
  // Requires: staticData.shops array with shop inventory and region data
  // For now, assume basic purchases are always available
  return true;
}

export function can_buy_unlimited(state, world, itemName, staticData) {
  // TODO: Implement proper unlimited shop logic
  // Requires: staticData.shops array with:
  //   - shop.region_name for reachability checks
  //   - shop.inventory array with { item, max } objects
  //   - max === 0 or max > 99 indicates unlimited
  // Current implementation assumes no unlimited shops available
  
  // ALTTP-specific fallback for potions - basic implementation
  if (itemName === 'Green Potion' || itemName === 'Blue Potion') {
    const potionShopReachable = state.regionReachability && state.regionReachability['Potion Shop'];
    return potionShopReachable === 'reachable';
  }
  
  return false;
}

export function can_hold_arrows(state, world, itemName, staticData) {
  const quantity = parseInt(itemName, 10) || 0;
  
  // Check if capacity upgrades are shuffled
  const shuffleUpgrades = state.settings?.shuffle_capacity_upgrades;
  
  if (shuffleUpgrades) {
    if (quantity === 0) return true;
    
    let arrows = 30; // Base capacity
    
    if (has(state, 'Arrow Upgrade (70)', staticData)) {
      arrows = 70;
    } else {
      arrows += count(state, 'Arrow Upgrade (+5)', staticData) * 5;
      arrows += count(state, 'Arrow Upgrade (+10)', staticData) * 10;
      
      // Arrow Upgrade (+5) beyond the 6th gives +10
      const upgrade5Count = count(state, 'Arrow Upgrade (+5)', staticData);
      arrows += Math.max(0, (upgrade5Count - 6) * 10);
    }
    
    return Math.min(70, arrows) >= quantity;
  } else {
    // Non-shuffled capacity upgrades
    if (quantity <= 30) return true;
    return has(state, 'Capacity Upgrade Shop', staticData);
  }
}

export function can_get_good_bee(state, world, itemName, staticData) {
  const bottleCount = count(state, 'Bottle', staticData);
  return (has(state, 'Bug Catching Net', staticData) && 
          bottleCount > 0 && 
          (has(state, 'Pegasus Boots', staticData) || 
           (has_sword(state, world, itemName, staticData) && has(state, 'Quake', staticData))));
}

export function can_retrieve_tablet(state, world, itemName, staticData) {
  return has(state, 'Book of Mudora', staticData) && 
         (has_beam_sword(state, world, itemName, staticData) ||
          (state.settings?.swordless && has(state, 'Hammer', staticData)));
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
  return has(state, 'Master Sword', staticData) || 
         has(state, 'Tempered Sword', staticData) || 
         has(state, 'Golden Sword', staticData) ||
         count(state, 'Progressive Sword', staticData) >= 2;
}

export function has_melee_weapon(state, world, itemName, staticData) {
  return has_sword(state, world, itemName, staticData) || 
         has(state, 'Hammer', staticData);
}

export function has_sword(state, world, itemName, staticData) {
  return has(state, 'Fighter Sword', staticData) || 
         has(state, 'Master Sword', staticData) || 
         has(state, 'Tempered Sword', staticData) || 
         has(state, 'Golden Sword', staticData) ||
         has(state, 'Progressive Sword', staticData);
}

export function has_rod(state, world, itemName, staticData) {
  return has(state, 'Fire Rod', staticData) || 
         has(state, 'Ice Rod', staticData);
}

// Bottle-related helpers

export function bottle_count(state, world, itemName, staticData) {
  const bottleLimit = state.state?.requirements?.progressive_bottle_limit || 
                     state.difficultyRequirements?.progressive_bottle_limit || 
                     4; // Default to 4
  
  const currentBottles = count(state, 'Bottle', staticData);
  return Math.min(currentBottles, bottleLimit);
}

// Mode-specific helpers

export function can_bomb_clip(state, world, itemName, staticData) {
  // Need bombs, boots, and to not be bunny
  return can_use_bombs(state, world, '1', staticData) &&
         has(state, 'Pegasus Boots', staticData) &&
         is_not_bunny(state, world, itemName, staticData);
}

export function can_spin_speed(state, world, itemName, staticData) {
  return has(state, 'Pegasus Boots', staticData) && 
         has_sword(state, world, itemName, staticData) && 
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

// Critical missing functions from Python StateHelpers.py

export function can_shoot_arrows(state, world, itemName, staticData) {
  const count_param = parseInt(itemName, 10) || 0;
  
  // Must have bow first
  if (!has(state, 'Bow', staticData) && !has(state, 'Silver Bow', staticData)) {
    return false;
  }
  
  // Check retro bow mode
  const retroBow = state.settings?.retro_bow || 
                  (state.flags && state.flags.includes('retro_bow'));
  
  if (retroBow) {
    // In retro bow mode, need to buy arrows from shops
    return can_buy(state, 'Single Arrow', staticData);
  } else {
    // Normal mode - need arrow capacity
    return can_hold_arrows(state, world, count_param.toString(), staticData);
  }
}

export function has_triforce_pieces(state, world, itemName, staticData) {
  // Get required count from world settings
  const requiredCount = state.settings?.treasure_hunt_required || 
                       state.treasureHuntRequired || 0;
  
  const triforceCount = count(state, 'Triforce Piece', staticData);
  const powerStarCount = count(state, 'Power Star', staticData);
  
  return triforceCount + powerStarCount >= requiredCount;
}



export function has_any(state, world, itemName, staticData) {
  // itemName should be an array of item names for this function
  const items = Array.isArray(itemName) ? itemName : [itemName];
  
  return items.some(item => has(state, item, staticData));
}

export function location_item_name(state, world, itemName, staticData) {
  // Look up what item is placed at a specific location
  const locationName = itemName;
  
  // First check if we have location-item mapping in static data locations object
  if (staticData && staticData.locations) {
    // Check if locations is a direct mapping object
    if (typeof staticData.locations === 'object' && !Array.isArray(staticData.locations)) {
      const locationData = staticData.locations[locationName];
      if (locationData && locationData.item) {
        // Return array format: [item_name, player_number]
        return [locationData.item.name, locationData.item.player || 1];
      }
    }
  }
  
  // Search through regions for the location
  if (staticData && staticData.regions) {
    const playerSlot = state.player?.slot || '1';
    const playerRegions = staticData.regions[playerSlot];
    
    if (playerRegions) {
      for (const regionName in playerRegions) {
        const region = playerRegions[regionName];
        if (region.locations && Array.isArray(region.locations)) {
          const location = region.locations.find(loc => loc.name === locationName);
          if (location && location.item) {
            // Return array format: [item_name, player_number]
            return [location.item.name, location.item.player || 1];
          }
        }
      }
    }
  }
  
  // Check if we have item placement data in the state itself
  if (state.locationItems && state.locationItems[locationName]) {
    const item = state.locationItems[locationName];
    if (typeof item === 'string') {
      return [item, state.player?.slot || 1];
    } else if (item && item.name) {
      return [item.name, item.player || state.player?.slot || 1];
    }
  }
  
  // Return null if no data available
  return null;
}

export function item_name_in_location_names(state, world, itemName, staticData) {
  // TODO: Implement multi-location item checking
  // Requires: Array of [locationName, playerNum] pairs as itemName parameter
  // And: location item data in staticData
  // This function checks if a specific item is placed in any of the given locations
  
  // Parse parameters - itemName should contain the item to search for
  // and world should contain the location pairs array
  const searchItem = itemName;
  const locationPairs = Array.isArray(world) ? world : [];
  const currentPlayer = state.player?.slot || 1;
  
  for (const [locationName, locationPlayer] of locationPairs) {
    if (typeof locationName !== 'string') continue;
    
    const itemAtLocation = location_item_name(state, world, locationName, staticData);
    if (itemAtLocation && Array.isArray(itemAtLocation)) {
      const [foundItem, foundPlayer] = itemAtLocation;
      if (foundItem === searchItem && foundPlayer === currentPlayer) {
        return true;
      }
    }
  }
  
  return false;
}

export function GanonDefeatRule(state, world, itemName, staticData) {
  const isSwordless = state.settings?.swordless ||
                     (state.flags && state.flags.includes('swordless'));
  
  if (isSwordless) {
    // Swordless mode requirements
    return has(state, 'Hammer', staticData) &&
           has_fire_source(state, world, itemName, staticData) &&
           has(state, 'Silver Bow', staticData) &&
           can_shoot_arrows(state, world, '0', staticData);
  } else {
    // Normal mode requirements
    const hasBeamSword = has_beam_sword(state, world, itemName, staticData);
    const hasFireSource = has_fire_source(state, world, itemName, staticData);
    
    if (!hasBeamSword || !hasFireSource) {
      return false;
    }
    
    const glitchesRequired = state.settings?.glitches_required || 'no_glitches';
    
    if (glitchesRequired !== 'no_glitches') {
      // With glitches, more options available
      return has(state, 'Tempered Sword', staticData) ||
             has(state, 'Golden Sword', staticData) ||
             (has(state, 'Silver Bow', staticData) && can_shoot_arrows(state, world, '0', staticData)) ||
             has(state, 'Lamp', staticData) ||
             can_extend_magic(state, world, '12', staticData);
    } else {
      // No glitches - need silver arrows
      return has(state, 'Silver Bow', staticData) &&
             can_shoot_arrows(state, world, '0', staticData);
    }
  }
}

export function can_get_glitched_speed_dw(state, world, itemName, staticData) {
  if (!has(state, 'Pegasus Boots', staticData)) {
    return false;
  }
  
  if (!has(state, 'Hookshot', staticData) && !has_sword(state, world, itemName, staticData)) {
    return false;
  }
  
  // Check if in inverted mode
  const gameMode = state.settings?.mode || state.settings?.game_mode || 'standard';
  if (gameMode !== 'inverted') {
    // Need Moon Pearl for dark world in standard mode
    return has(state, 'Moon Pearl', staticData);
  }
  
  return true; // In inverted mode, no Moon Pearl needed
}

export function _has_specific_key_count(state, world, itemName, staticData) {
  const [keyName, requiredCountStr] = itemName.split(',');
  const requiredCount = parseInt(requiredCountStr, 10) || 1;
  
  return count(state, keyName.trim(), staticData) >= requiredCount;
}

export function basement_key_rule(state, world, itemName, staticData) {
  // This is a complex rule that checks if Key Rat has the key
  // For now, assume we need 3 keys (simplified)
  return count(state, 'Small Key (Hyrule Castle)', staticData) >= 3;
}

export function cross_peg_bridge(state, world, itemName, staticData) {
  return has(state, 'Hammer', staticData) && has(state, 'Moon Pearl', staticData);
}

// Update existing can_extend_magic to match Python implementation
export function can_extend_magic_complex(state, world, itemName, staticData) {
  const smallmagic = parseInt(itemName, 10) || 16;
  const fullrefill = itemName?.includes('fullrefill') || false;
  
  let basemagic = 8;
  
  if (has(state, 'Magic Upgrade (1/4)', staticData)) {
    basemagic = 32;
  } else if (has(state, 'Magic Upgrade (1/2)', staticData)) {
    basemagic = 16;
  }
  
  if (can_buy_unlimited(state, world, 'Green Potion', staticData) ||
      can_buy_unlimited(state, world, 'Blue Potion', staticData)) {
    
    const bottles = bottle_count(state, world, itemName, staticData);
    const functionality = state.settings?.item_functionality || 'normal';
    
    if (functionality === 'hard' && !fullrefill) {
      basemagic += Math.floor(basemagic * 0.5 * bottles);
    } else if (functionality === 'expert' && !fullrefill) {
      basemagic += Math.floor(basemagic * 0.25 * bottles);
    } else {
      basemagic += basemagic * bottles;
    }
  }
  
  return basemagic >= smallmagic;
}

// Additional helper functions from the analysis

export function heart_count(state, world, itemName, staticData) {
  // Get difficulty requirements
  const bossHeartLimit = state.state?.requirements?.boss_heart_container_limit ||
                        state.difficultyRequirements?.boss_heart_container_limit || 20;
  const heartPieceLimit = state.state?.requirements?.heart_piece_limit ||
                         state.difficultyRequirements?.heart_piece_limit || 80;
  
  const bossHearts = Math.min(count(state, 'Boss Heart Container', staticData), bossHeartLimit);
  const sanctuaryHearts = count(state, 'Sanctuary Heart Container', staticData);
  const pieceHearts = Math.floor(Math.min(count(state, 'Piece of Heart', staticData), heartPieceLimit) / 4);
  
  return bossHearts + sanctuaryHearts + pieceHearts + 3; // +3 for starting hearts
}

export function enhanceLocationsWithShopData(state, world, itemName, staticData) {
  // TODO: Implement shop data enhancement for locations
  // This function appears to be a worker-specific utility for enhancing location data with shop information
  // Requires: Complex integration between location data and shop data
  // Not critical for rule evaluation, more of a data processing utility
  return undefined;
}

export function can_revival_fairy_shop(state, world, itemName, staticData) {
  const hasBottle = count(state, 'Bottle', staticData) > 0;
  const minorGlitches = state.settings?.mode === 'minor_glitches' ||
                       state.settings?.glitches_required === 'minor_glitches';
  return hasBottle && minorGlitches;
}

export function countGroup(state, world, itemName, staticData) {
  // Count items in a specific group (e.g., "Bottles", "Crystals")
  const groupName = itemName;
  
  if (!staticData || !staticData.groupData || !staticData.groupData[groupName]) {
    return 0;
  }
  
  const groupItems = staticData.groupData[groupName];
  let totalCount = 0;
  
  for (const itemName of groupItems) {
    totalCount += count(state, itemName, staticData);
  }
  
  return totalCount;
}

export function has_crystals_count(state, world, itemName, staticData) {
  // Alternative crystal counting that uses group data
  const requiredCount = parseInt(itemName, 10) || 7;
  const crystalCount = countGroup(state, world, 'Crystals', staticData);
  return crystalCount >= requiredCount;
}

export function can_reach_region(state, world, itemName, staticData) {
  // Check if a specific region is reachable
  const regionName = itemName;
  
  if (!state.regionReachability) return false;
  return state.regionReachability?.[regionName] === 'reachable';
}

export function can_get_bottle(state, world, itemName, staticData) {
  // Check if player can obtain any bottle
  // This is a simplified version - full implementation would check specific bottle locations
  return count(state, 'Bottle', staticData) > 0 ||
         can_reach_region(state, world, 'Bottle Merchant', staticData) ||
         can_reach_region(state, world, 'Magic Shop', staticData);
}

// Additional utility functions that may be referenced in rules

export function can_bomb_things(state, world, itemName, staticData) {
  // Alias for can_use_bombs for rule compatibility
  return can_use_bombs(state, world, itemName, staticData);
}

export function can_pass_curtains(state, world, itemName, staticData) {
  // Curtains can be passed with lantern or fire rod
  return has(state, 'Lamp', staticData) || has(state, 'Fire Rod', staticData);
}

export function can_see_in_dark(state, world, itemName, staticData) {
  // Alias for can_pass_curtains
  return can_pass_curtains(state, world, itemName, staticData);
}

export function can_pass_rocks(state, world, itemName, staticData) {
  // Rocks can be lifted or bombed
  return can_lift_rocks(state, world, itemName, staticData) || 
         can_use_bombs(state, world, '1', staticData);
}

export function can_swim(state, world, itemName, staticData) {
  // Need flippers to swim
  return has(state, 'Flippers', staticData);
}

export function can_waterwalk(state, world, itemName, staticData) {
  // Water walking boots or hookshot for crossing water
  return has(state, 'Flippers', staticData) || has(state, 'Hookshot', staticData);
}

export function can_reach_light_world(state, world, itemName, staticData) {
  // Check if light world is accessible
  const gameMode = state.settings?.mode || state.settings?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    // In inverted mode, need Moon Pearl to access light world safely
    return has(state, 'Moon Pearl', staticData);
  }
  return true; // Always accessible in standard mode
}

export function can_reach_dark_world(state, world, itemName, staticData) {
  // Check if dark world is accessible  
  const gameMode = state.settings?.mode || state.settings?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    return true; // Always accessible in inverted mode
  } else {
    // Need access to dark world portals or magic mirror
    return has(state, 'Moon Pearl', staticData) &&
           (has(state, 'Magic Mirror', staticData) || 
            can_reach_region(state, world, 'Dark World', staticData));
  }
}

export function open_mode(state, world, itemName, staticData) {
  // Check if this is open mode (affects certain accessibility rules)
  return state.settings?.mode === 'open' || 
         state.settings?.open_pyramid === true;
}

export function swordless_mode(state, world, itemName, staticData) {
  // Check if this is swordless mode
  return state.settings?.swordless === true ||
         (state.flags && state.flags.includes('swordless'));
}

// Helper function registry
export const helperFunctions = {
  // Core inventory functions
  has,
  count,
  
  // Movement and traversal
  is_not_bunny,
  can_fly,
  can_dash,
  can_flute,
  can_flute_spot_5,
  
  // Physical abilities
  can_lift_rocks,
  can_lift_heavy_rocks,
  can_light_torches,
  can_melt_things,
  can_bomb_or_bonk,
  
  // Combat and weapons
  can_kill_most_things,
  can_shoot_silver_arrows,
  can_defeat_ganon,
  has_beam_sword,
  has_melee_weapon,
  has_rod,
  
  // Magic and special abilities
  is_invincible,
  can_block_lasers,
  can_extend_magic,
  can_activate_crystal_switch,
  
  // Items and equipment
  has_bottle,
  bottle_count,
  can_get_good_bee,
  can_retrieve_tablet,
  has_hearts,
  can_heart_skip,
  has_fire_source,
  can_hold_arrows,
  
  // Game progression
  can_anima_transfigure,
  has_crystals,
  has_misery_mire_medallion,
  has_turtle_rock_medallion,
  
  // Glitches and advanced techniques
  can_bomb_clip,
  can_spin_speed,
  can_boots_clip_lw,
  can_boots_clip_dw,
  
  // Dungeon-specific
  can_complete_gt_climb,
  
  // Economy
  can_buy,
  can_buy_unlimited,
  
  // Critical functions from StateHelpers.py
  can_use_bombs,
  can_shoot_arrows,
  has_triforce_pieces,
  has_sword,
  has_any,
  location_item_name,
  item_name_in_location_names,
  GanonDefeatRule,
  can_get_glitched_speed_dw,
  _has_specific_key_count,
  basement_key_rule,
  cross_peg_bridge,
  can_extend_magic_complex,
  heart_count,
  enhanceLocationsWithShopData,
  can_revival_fairy_shop,
  countGroup,
  has_crystals_count,
  can_reach_region,
  can_get_bottle,
  
  // Additional utility functions
  can_bomb_things,
  can_pass_curtains,
  can_see_in_dark,
  can_pass_rocks,
  can_swim,
  can_waterwalk,
  can_reach_light_world,
  can_reach_dark_world,
  open_mode,
  swordless_mode
};

// ============================================================================
// ALTTP State Management Module (Option 2 implementation)
// ============================================================================

/**
 * ALTTP-specific state management module
 * Handles game-specific state properties that were previously in ALTTPState
 */
export const alttpStateModule = {
  /**
   * Initialize ALTTP-specific state
   * @returns {Object} Initial ALTTP state object
   */
  initializeState() {
    return {
      gameMode: null,
      difficultyRequirements: {
        progressive_bottle_limit: 4,
        boss_heart_container_limit: 10,
        heart_piece_limit: 24,
      },
      requiredMedallions: ['Ether', 'Quake'], // Default medallions
      shops: [],
      treasureHuntRequired: 20,
      // BATCH 2: Add flags and events management
      flags: [], // Array of flags (replaces Set from ALTTPState)
      events: [], // Array of events (replaces Set from ALTTPState)
    };
  },

  /**
   * Load game settings and update ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {Object} settings - Settings from rules JSON
   * @returns {Object} Updated ALTTP state
   */
  loadSettings(gameState, settings) {
    if (!settings) return gameState;

    const updatedState = { ...gameState };

    // Store game mode
    updatedState.gameMode = settings.game_mode || 'standard';

    // Store difficulty requirements
    if (settings.difficulty_requirements) {
      updatedState.difficultyRequirements = {
        ...updatedState.difficultyRequirements,
        ...settings.difficulty_requirements,
      };
    }

    // Store medallions
    if (settings.required_medallions && Array.isArray(settings.required_medallions)) {
      updatedState.requiredMedallions = settings.required_medallions;
    }

    // Store treasure hunt count
    if (typeof settings.treasure_hunt_required === 'number') {
      updatedState.treasureHuntRequired = settings.treasure_hunt_required;
    }

    // BATCH 2: Set common flags based on settings (from ALTTPState.loadSettings)
    if (settings.bombless_start) {
      updatedState = this.setFlag(updatedState, 'bombless_start');
    }
    if (settings.retro_bow) {
      updatedState = this.setFlag(updatedState, 'retro_bow');
    }
    if (settings.swordless) {
      updatedState = this.setFlag(updatedState, 'swordless');
    }
    if (settings.enemy_shuffle) {
      updatedState = this.setFlag(updatedState, 'enemy_shuffle');
    }

    return updatedState;
  },

  /**
   * Load shop data
   * @param {Object} gameState - Current ALTTP game state
   * @param {Array} shops - Array of shop data objects
   * @returns {Object} Updated ALTTP state
   */
  loadShops(gameState, shops) {
    return {
      ...gameState,
      shops: shops || [],
    };
  },

  /**
   * Get state data for snapshot (backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Object} State data for snapshot
   */
  getStateForSnapshot(gameState) {
    return {
      gameMode: gameState.gameMode,
      difficultyRequirements: gameState.difficultyRequirements,
      requiredMedallions: gameState.requiredMedallions,
      shops: gameState.shops,
      treasureHuntRequired: gameState.treasureHuntRequired,
      // BATCH 2: Include flags and events in snapshot
      flags: gameState.flags || [],
      events: gameState.events || [],
    };
  },

  /**
   * Reset ALTTP state to defaults
   * @returns {Object} Reset ALTTP state
   */
  resetState() {
    return this.initializeState();
  },

  // BATCH 2: Flags and Events Management Functions

  /**
   * Set a flag in the ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} flagName - Name of the flag to set
   * @returns {Object} Updated ALTTP state
   */
  setFlag(gameState, flagName) {
    const updatedState = { ...gameState };
    if (!updatedState.flags.includes(flagName)) {
      updatedState.flags = [...updatedState.flags, flagName];
    }
    return updatedState;
  },

  /**
   * Check if a flag is set
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} flagName - Name of the flag to check
   * @returns {boolean} True if flag is set
   */
  hasFlag(gameState, flagName) {
    return gameState.flags && gameState.flags.includes(flagName);
  },

  /**
   * Set an event in the ALTTP state
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} eventName - Name of the event to set
   * @returns {Object} Updated ALTTP state
   */
  setEvent(gameState, eventName) {
    const updatedState = { ...gameState };
    if (!updatedState.events.includes(eventName)) {
      updatedState.events = [...updatedState.events, eventName];
    }
    return updatedState;
  },

  /**
   * Check if an event is set (checks both flags and events)
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} eventName - Name of the event to check
   * @returns {boolean} True if event is set
   */
  hasEvent(gameState, eventName) {
    return (gameState.flags && gameState.flags.includes(eventName)) ||
           (gameState.events && gameState.events.includes(eventName));
  },

  /**
   * Process an event item and set appropriate event flag
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} itemName - Name of the item that triggers an event
   * @returns {Object} Updated ALTTP state or null if no event triggered
   */
  processEventItem(gameState, itemName) {
    // Event mapping from ALTTPState
    const eventMapping = {
      'Beat Agahnim 1': 'Beat Agahnim 1',
      'Beat Agahnim 2': 'Beat Agahnim 2',
      'Open Floodgate': 'Open Floodgate',
      'Crystal 1': 'Crystal 1',
      'Crystal 2': 'Crystal 2',
      'Crystal 3': 'Crystal 3',
      'Crystal 4': 'Crystal 4',
      'Crystal 5': 'Crystal 5',
      'Crystal 6': 'Crystal 6',
      'Crystal 7': 'Crystal 7',
      'Red Pendant': 'Red Pendant',
      'Blue Pendant': 'Blue Pendant',
      'Green Pendant': 'Green Pendant',
      'Get Frog': 'Get Frog',
      'Pick Up Purple Chest': 'Pick Up Purple Chest',
      'Return Smith': 'Return Smith',
      'Shovel': 'Shovel',
      'Flute': 'Flute',
      'Activated Flute': 'Activated Flute',
    };

    if (eventMapping[itemName]) {
      return this.setEvent(gameState, eventMapping[itemName]);
    }
    return null; // No event triggered
  },

  /**
   * Check if an item/flag/event exists (unified check)
   * @param {Object} gameState - Current ALTTP game state
   * @param {string} itemName - Name to check (could be flag or event)
   * @returns {boolean} True if item/flag/event exists
   */
  has(gameState, itemName) {
    // Check if it's an event first
    if (this.hasEvent(gameState, itemName)) {
      return true;
    }
    // Else fall back to flag check
    return this.hasFlag(gameState, itemName);
  },

  /**
   * Get flags array (for backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Array} Array of flags
   */
  getFlags(gameState) {
    return gameState.flags || [];
  },

  /**
   * Get events array (for backward compatibility)
   * @param {Object} gameState - Current ALTTP game state
   * @returns {Array} Array of events
   */
  getEvents(gameState) {
    return gameState.events || [];
  }
};
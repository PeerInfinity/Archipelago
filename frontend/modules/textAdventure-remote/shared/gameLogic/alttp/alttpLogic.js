/**
 * Thread-agnostic ALTTP game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

/**
 * Check if player has an item, handling progressive items
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including progressionMapping
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // First check if it's in flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Also check snapshot.events (promoted from snapshot.snapshot.events)
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;

  // Direct item check
  if ((snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  // Check progressive items
  if (staticData && staticData.progressionMapping) {
    // Check if this item is provided by any progressive item
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
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
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName) {
  if (!snapshot.inventory) return 0;

  // If the item itself is a base progressive item, return its direct count
  if (staticData && staticData.progressionMapping && staticData.progressionMapping[itemName]) {
    return snapshot.inventory[itemName] || 0;
  }

  // Check if itemName is a specific tier of any progressive item we hold
  if (staticData && staticData.progressionMapping) {
    for (const [progressiveBase, progression] of Object.entries(staticData.progressionMapping)) {
      const baseCount = snapshot.inventory[progressiveBase] || 0;
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
  return snapshot.inventory[itemName] || 0;
}

// --- ALTTP-specific helper functions ---

export function is_not_bunny(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Moon Pearl');
}

export function can_lift_rocks(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Power Glove') || has(snapshot, staticData, 'Titans Mitts');
}

export function can_lift_heavy_rocks(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Titans Mitts');
}

export function can_light_torches(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Fire Rod') || has(snapshot, staticData, 'Lamp');
}

export function can_melt_things(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Fire Rod') ||
         (has(snapshot, staticData, 'Bombos') &&
          (has_sword(snapshot, staticData, itemName) || staticData.settings?.['1']?.swordless));
}

export function can_fly(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Flute');
}

export function can_dash(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pegasus Boots');
}

export function is_invincible(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Cape') ||
         has(snapshot, staticData, 'Cane of Byrna') ||
         staticData.settings?.['1']?.goal === 'triforce_hunt';
}

export function can_block_lasers(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Mirror Shield');
}

export function can_extend_magic(snapshot, staticData, itemName) {
  const bottleCount = count(snapshot, staticData, 'Bottle');
  return (has(snapshot, staticData, 'Magic Upgrade (1/2)') || 
          has(snapshot, staticData, 'Magic Upgrade (1/4)') || 
          bottleCount > 0);
}

export function can_kill_most_things(snapshot, staticData, itemName) {
  const enemies = parseInt(itemName, 10) || 5;

  // Check if enemy shuffle is enabled
  const enemyShuffle = staticData.settings?.['1']?.enemy_shuffle;
  
  if (enemyShuffle) {
    // Enemizer mode - need everything
    return has_melee_weapon(snapshot, staticData, itemName) &&
           has(snapshot, staticData, 'Cane of Somaria') &&
           has(snapshot, staticData, 'Cane of Byrna') &&
           can_extend_magic(snapshot, staticData, itemName) &&
           can_shoot_arrows(snapshot, staticData, '0') &&
           has(snapshot, staticData, 'Fire Rod') &&
           can_use_bombs(snapshot, staticData, (enemies * 4).toString());
  } else {
    // Normal enemy logic - any of these work
    if (has_melee_weapon(snapshot, staticData, itemName)) return true;
    if (has(snapshot, staticData, 'Cane of Somaria')) return true;
    if (has(snapshot, staticData, 'Cane of Byrna') && 
        (enemies < 6 || can_extend_magic(snapshot, staticData, itemName))) return true;
    if (can_shoot_arrows(snapshot, staticData, '0')) return true;
    if (has(snapshot, staticData, 'Fire Rod')) return true;
    
    // Bombs work on easy/default enemy health
    const enemyHealth = staticData.settings?.['1']?.enemy_health || 'default';
    if ((enemyHealth === 'easy' || enemyHealth === 'default') &&
        can_use_bombs(snapshot, staticData, (enemies * 4).toString())) {
      return true;
    }
    
    return false;
  }
}

export function can_shoot_silver_arrows(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Progressive Bow') && 
         has(snapshot, staticData, 'Silver Arrows');
}

export function can_defeat_ganon(snapshot, staticData, itemName) {
  if (has(snapshot, staticData, 'Triforce')) {
    return true;
  }
  
  return can_shoot_silver_arrows(snapshot, staticData, itemName) &&
         (has(snapshot, staticData, 'Lamp') ||
          (has(snapshot, staticData, 'Fire Rod') && can_extend_magic(snapshot, staticData, itemName))) &&
         (has_beam_sword(snapshot, staticData, itemName) ||
          (has(snapshot, staticData, 'Hammer') &&
           (staticData.settings?.['1']?.game_mode === 'swordless' || staticData.settings?.['1']?.swordless)));
}

export function can_defeat_boss(snapshot, staticData, locationName, bossType) {
  // For Desert Palace and most other bosses, just need to be able to kill things
  // The specific requirements are already checked in the location's access rules
  // This is a simplified version - the actual boss defeat is handled by the dungeon's rules
  return can_kill_most_things(snapshot, staticData, "1");
}

export function can_take_damage(snapshot, staticData, itemName) {
  // Check if the game settings allow taking damage
  // Default is true unless explicitly set to false in settings
  const canTakeDamage = staticData.settings?.['1']?.can_take_damage;
  // If not explicitly set to false, assume true
  return canTakeDamage !== false;
}

// Additional commonly used helpers

export function can_use_bombs(snapshot, staticData, itemName) {
  const quantity = parseInt(itemName, 10) || 1;

  // Start with base bombs (10 unless bombless start)
  let bombs = 0;
  const bomblessStart = staticData.settings?.['1']?.bombless_start ||
                       (snapshot.flags && snapshot.flags.includes('bombless_start'));
  if (!bomblessStart) {
    bombs = 10;
  }
  
  // Add bomb upgrades
  bombs += count(snapshot, staticData, 'Bomb Upgrade (+5)') * 5;
  bombs += count(snapshot, staticData, 'Bomb Upgrade (+10)') * 10;
  bombs += count(snapshot, staticData, 'Bomb Upgrade (50)') * 50;
  
  // Bomb Upgrade (+5) beyond the 6th gives +10
  const upgrade5Count = count(snapshot, staticData, 'Bomb Upgrade (+5)');
  bombs += Math.max(0, (upgrade5Count - 6) * 10);
  
  // If capacity upgrades are NOT shuffled and we have Capacity Upgrade Shop, add 40
  const shuffleUpgrades = staticData.settings?.['1']?.shuffle_capacity_upgrades;
  if (!shuffleUpgrades && has(snapshot, staticData, 'Capacity Upgrade Shop')) {
    bombs += 40;
  }
  
  return bombs >= Math.min(quantity, 50);
}

export function can_bomb_or_bonk(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pegasus Boots') || can_use_bombs(snapshot, staticData, '1');
}

export function can_activate_crystal_switch(snapshot, staticData, itemName) {
  return has_melee_weapon(snapshot, staticData, itemName) ||
         can_use_bombs(snapshot, staticData, '1') ||
         can_shoot_arrows(snapshot, staticData, '0') ||
         has(snapshot, staticData, 'Hookshot') ||
         has(snapshot, staticData, 'Cane of Somaria') ||
         has(snapshot, staticData, 'Cane of Byrna') ||
         has(snapshot, staticData, 'Fire Rod') ||
         has(snapshot, staticData, 'Ice Rod') ||
         has(snapshot, staticData, 'Blue Boomerang') ||
         has(snapshot, staticData, 'Red Boomerang');
}

export function can_buy(snapshot, staticData, itemName) {
  // TODO: Implement proper shop logic
  // Requires: staticData.shops array with shop inventory and region data
  // For now, assume basic purchases are always available
  return true;
}

export function can_buy_unlimited(snapshot, staticData, itemName) {
  // TODO: Implement proper unlimited shop logic
  // Requires: staticData.shops array with:
  //   - shop.region_name for reachability checks
  //   - shop.inventory array with { item, max } objects
  //   - max === 0 or max > 99 indicates unlimited
  // Current implementation assumes no unlimited shops available
  
  // ALTTP-specific fallback for potions - basic implementation
  if (itemName === 'Green Potion' || itemName === 'Blue Potion') {
    const potionShopReachable = snapshot.regionReachability && snapshot.regionReachability['Potion Shop'];
    return potionShopReachable === 'reachable';
  }
  
  return false;
}

export function can_hold_arrows(snapshot, staticData, itemName) {
  const quantity = parseInt(itemName, 10) || 0;

  // Check if capacity upgrades are shuffled
  const shuffleUpgrades = staticData.settings?.['1']?.shuffle_capacity_upgrades;
  
  if (shuffleUpgrades) {
    if (quantity === 0) return true;
    
    let arrows = 30; // Base capacity
    
    if (has(snapshot, staticData, 'Arrow Upgrade (70)')) {
      arrows = 70;
    } else {
      arrows += count(snapshot, staticData, 'Arrow Upgrade (+5)') * 5;
      arrows += count(snapshot, staticData, 'Arrow Upgrade (+10)') * 10;
      
      // Arrow Upgrade (+5) beyond the 6th gives +10
      const upgrade5Count = count(snapshot, staticData, 'Arrow Upgrade (+5)');
      arrows += Math.max(0, (upgrade5Count - 6) * 10);
    }
    
    return Math.min(70, arrows) >= quantity;
  } else {
    // Non-shuffled capacity upgrades
    if (quantity <= 30) return true;
    return has(snapshot, staticData, 'Capacity Upgrade Shop');
  }
}

export function can_get_good_bee(snapshot, staticData, itemName) {
  const bottleCount = count(snapshot, staticData, 'Bottle');
  return (has(snapshot, staticData, 'Bug Catching Net') && 
          bottleCount > 0 && 
          (has(snapshot, staticData, 'Pegasus Boots') || 
           (has_sword(snapshot, staticData, itemName) && has(snapshot, staticData, 'Quake'))));
}

export function can_retrieve_tablet(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Book of Mudora') &&
         (has_beam_sword(snapshot, staticData, itemName) ||
          (staticData.settings?.['1']?.swordless && has(snapshot, staticData, 'Hammer')));
}

export function can_flute(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Flute');
}

export function can_flute_spot_5(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Flute') && has(snapshot, staticData, 'Titans Mitts');
}

export function has_bottle(snapshot, staticData, itemName) {
  return count(snapshot, staticData, 'Bottle') > 0;
}

export function has_hearts(snapshot, staticData, itemName) {
  // Get heart count from parameters
  const heartCount = parseInt(itemName, 10) || 0;
  if (heartCount === 0) return true;
  
  // Count heart containers and pieces
  const heartContainers = count(snapshot, staticData, 'Boss Heart Container');
  const heartPieces = count(snapshot, staticData, 'Piece of Heart');
  const totalHearts = 3 + heartContainers + Math.floor(heartPieces / 4);
  
  return totalHearts >= heartCount;
}

export function can_heart_skip(snapshot, staticData, itemName) {
  return is_invincible(snapshot, staticData, itemName);
}

export function has_fire_source(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod');
}

export function can_anima_transfigure(snapshot, staticData, itemName) {
  const pendantCount = 
    (has(snapshot, staticData, 'Green Pendant') ? 1 : 0) +
    (has(snapshot, staticData, 'Blue Pendant') ? 1 : 0) +
    (has(snapshot, staticData, 'Red Pendant') ? 1 : 0);
  return pendantCount >= 2;
}

export function has_crystals(snapshot, staticData, itemName) {
  const crystalCount = parseInt(itemName, 10) || 0;
  if (crystalCount === 0) return true;
  
  let totalCrystals = 0;
  for (let i = 1; i <= 7; i++) {
    if (has(snapshot, staticData, `Crystal ${i}`)) {
      totalCrystals++;
    }
  }
  
  return totalCrystals >= crystalCount;
}

export function has_beam_sword(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Master Sword') || 
         has(snapshot, staticData, 'Tempered Sword') || 
         has(snapshot, staticData, 'Golden Sword') ||
         count(snapshot, staticData, 'Progressive Sword') >= 2;
}

export function has_melee_weapon(snapshot, staticData, itemName) {
  return has_sword(snapshot, staticData, itemName) || 
         has(snapshot, staticData, 'Hammer');
}

export function has_sword(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Fighter Sword') || 
         has(snapshot, staticData, 'Master Sword') || 
         has(snapshot, staticData, 'Tempered Sword') || 
         has(snapshot, staticData, 'Golden Sword') ||
         has(snapshot, staticData, 'Progressive Sword');
}

export function has_rod(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Fire Rod') || 
         has(snapshot, staticData, 'Ice Rod');
}

// Bottle-related helpers

export function bottle_count(snapshot, staticData, itemName) {
  const bottleLimit = snapshot.state?.requirements?.progressive_bottle_limit || 
                     snapshot.difficultyRequirements?.progressive_bottle_limit || 
                     4; // Default to 4
  
  const currentBottles = count(snapshot, staticData, 'Bottle');
  return Math.min(currentBottles, bottleLimit);
}

// Mode-specific helpers

export function can_bomb_clip(snapshot, staticData, itemName) {
  // Need bombs, boots, and to not be bunny
  return can_use_bombs(snapshot, staticData, '1') &&
         has(snapshot, staticData, 'Pegasus Boots') &&
         is_not_bunny(snapshot, staticData, itemName);
}

export function can_spin_speed(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pegasus Boots') &&
         has_sword(snapshot, staticData, itemName) &&
         staticData.settings?.['1']?.mode === 'minor_glitches';
}

export function can_boots_clip_lw(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pegasus Boots') &&
         staticData.settings?.['1']?.mode === 'minor_glitches';
}

export function can_boots_clip_dw(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Pegasus Boots') &&
         has(snapshot, staticData, 'Moon Pearl') &&
         staticData.settings?.['1']?.mode === 'minor_glitches';
}

// Dungeon-specific helpers

export function can_complete_gt_climb(snapshot, staticData, itemName) {
  return (has(snapshot, staticData, 'Hammer') || 
          (has(snapshot, staticData, 'Hookshot') && 
           (has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod')))) && 
         has(snapshot, staticData, 'Progressive Bow') && 
         has(snapshot, staticData, 'Big Key (Ganons Tower)');
}

// Medallion helpers

export function has_misery_mire_medallion(snapshot, staticData, itemName) {
  const medallion = staticData.settings?.['1']?.misery_mire_medallion || 'Ether';
  return has(snapshot, staticData, medallion);
}

export function has_turtle_rock_medallion(snapshot, staticData, itemName) {
  const medallion = staticData.settings?.['1']?.turtle_rock_medallion || 'Quake';
  return has(snapshot, staticData, medallion);
}

// Critical missing functions from Python StateHelpers.py

export function can_shoot_arrows(snapshot, staticData, itemName) {
  const count_param = parseInt(itemName, 10) || 0;

  // Must have bow first
  if (!has(snapshot, staticData, 'Bow') && !has(snapshot, staticData, 'Silver Bow')) {
    return false;
  }

  // Check retro bow mode
  const retroBow = staticData.settings?.['1']?.retro_bow ||
                  (snapshot.flags && snapshot.flags.includes('retro_bow'));
  
  if (retroBow) {
    // In retro bow mode, need to buy arrows from shops
    return can_buy(snapshot, staticData, 'Single Arrow');
  } else {
    // Normal mode - need arrow capacity
    return can_hold_arrows(snapshot, staticData, count_param.toString());
  }
}

export function has_triforce_pieces(snapshot, staticData, itemName) {
  // Get required count from world settings
  const requiredCount = staticData.settings?.['1']?.treasure_hunt_required ||
                       snapshot.treasureHuntRequired || 0;
  
  const triforceCount = count(snapshot, staticData, 'Triforce Piece');
  const powerStarCount = count(snapshot, staticData, 'Power Star');
  
  return triforceCount + powerStarCount >= requiredCount;
}



export function has_any(snapshot, staticData, itemName) {
  // itemName should be an array of item names for this function
  const items = Array.isArray(itemName) ? itemName : [itemName];
  
  return items.some(item => has(snapshot, staticData, item));
}

export function location_item_name(snapshot, staticData, itemName) {
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
    
    // If locations is an array, convert it to object mapping on-the-fly
    if (Array.isArray(staticData.locations)) {
      for (const location of staticData.locations) {
        if (location && location.name === locationName && location.item) {
          return [location.item.name, location.item.player || 1];
        }
      }
    }
  }
  
  // Search through regions for the location
  if (staticData && staticData.regions) {
    const playerSlot = snapshot.player?.slot || '1';

    // Check if regions are nested by player or if it's a direct regions object
    let regionsToSearch = staticData.regions[playerSlot] || staticData.regions;

    // Iterate through regions
    for (const regionName in regionsToSearch) {
      const region = regionsToSearch[regionName];
      if (region && region.locations && Array.isArray(region.locations)) {
        const location = region.locations.find(loc => loc.name === locationName);
        if (location && location.item) {
          // Return array format: [item_name, player_number]
          return [location.item.name, location.item.player || 1];
        }
      }
    }
  }

  // Check if we have item placement data in the static data
  if (staticData && staticData.locationItems && staticData.locationItems[locationName]) {
    const item = staticData.locationItems[locationName];
    if (typeof item === 'string') {
      return [item, snapshot.player?.slot || 1];
    } else if (item && item.name) {
      return [item.name, item.player || snapshot.player?.slot || 1];
    }
  }
  
  // Return null if no data available
  return null;
}

export function tr_big_key_chest_keys_needed(snapshot, staticData, itemName) {
  // This function handles the key requirements for the TR Big Chest
  // Based on the Python function in worlds/alttp/Rules.py

  const item = location_item_name(snapshot, staticData, 'Turtle Rock - Big Key Chest');

  if (!item) {
    // If we can't determine the item, use the default (6 keys)
    return 6;
  }

  const [locationItemName, locationPlayer] = item;
  const currentPlayer = snapshot.player?.slot || 1;

  // Only consider items for the current player
  if (locationPlayer != currentPlayer) {
    return 6;
  }

  // Implement tr_big_key_chest_keys_needed logic:
  // - Small Key (Turtle Rock): 0 keys needed
  // - Big Key (Turtle Rock): 4 keys needed
  // - Anything else: 6 keys needed
  if (locationItemName === 'Small Key (Turtle Rock)') {
    return 0;
  } else if (locationItemName === 'Big Key (Turtle Rock)') {
    return 4;
  } else {
    return 6;
  }
}

export function item_name_in_location_names(snapshot, staticData, searchItem, locationPairs) {
  // Check if a specific item is placed in any of the given locations
  // New signature: (snapshot, staticData, searchItem, locationPairs)
  // searchItem: string - the item name to search for (e.g., "Big Key (Ganons Tower)")
  // locationPairs: array - list of [locationName, playerNumber] pairs to check

  if (!Array.isArray(locationPairs)) {
    return false;
  }

  const currentPlayer = snapshot.player?.slot || parseInt(snapshot.player) || 1;

  for (const locationPair of locationPairs) {
    if (!Array.isArray(locationPair) || locationPair.length < 2) continue;

    const [locationName, locationPlayer] = locationPair;
    if (typeof locationName !== 'string') continue;

    const itemAtLocation = location_item_name(snapshot, staticData, locationName);
    if (itemAtLocation && Array.isArray(itemAtLocation)) {
      const [foundItem, foundPlayer] = itemAtLocation;
      // Check if this is the item we're looking for and it belongs to the right player
      if (foundItem === searchItem && parseInt(foundPlayer) === parseInt(locationPlayer)) {
        return true;
      }
    }
  }

  return false;
}


export function has_crystals_for_ganon(snapshot, staticData, itemName) {
  // Check if player has required number of crystals for Ganon
  // The required number comes from settings
  const requiredCrystals = staticData.settings?.['1']?.crystals_needed_for_ganon || 7;
  
  // Use the simpler has_crystals function that counts Crystal 1-7 directly
  return has_crystals(snapshot, staticData, requiredCrystals.toString());
}

export function GanonDefeatRule(snapshot, staticData, itemName) {
  const isSwordless = staticData.settings?.['1']?.swordless ||
                     (snapshot.flags && snapshot.flags.includes('swordless'));
  
  if (isSwordless) {
    // Swordless mode requirements
    return has(snapshot, staticData, 'Hammer') &&
           has_fire_source(snapshot, staticData, itemName) &&
           has(snapshot, staticData, 'Silver Bow') &&
           can_shoot_arrows(snapshot, staticData, '0');
  } else {
    // Normal mode requirements
    const hasBeamSword = has_beam_sword(snapshot, staticData, itemName);
    const hasFireSource = has_fire_source(snapshot, staticData, itemName);
    
    if (!hasBeamSword || !hasFireSource) {
      return false;
    }
    
    // Check for glitches - 'none' and 'no_glitches' both mean no glitches allowed
    const glitchesRequired = staticData.settings?.['1']?.glitches_required;
    const isGlitchesAllowed = glitchesRequired && 
                             glitchesRequired !== 'none' && 
                             glitchesRequired !== 'no_glitches';
    
    if (isGlitchesAllowed) {
      // With glitches, more options available
      return has(snapshot, staticData, 'Tempered Sword') ||
             has(snapshot, staticData, 'Golden Sword') ||
             (has(snapshot, staticData, 'Silver Bow') && can_shoot_arrows(snapshot, staticData, '0')) ||
             has(snapshot, staticData, 'Lamp') ||
             can_extend_magic(snapshot, staticData, '12');
    } else {
      // No glitches (default) - need silver arrows
      return has(snapshot, staticData, 'Silver Bow') &&
             can_shoot_arrows(snapshot, staticData, '0');
    }
  }
}

export function can_get_glitched_speed_dw(snapshot, staticData, itemName) {
  if (!has(snapshot, staticData, 'Pegasus Boots')) {
    return false;
  }

  if (!has(snapshot, staticData, 'Hookshot') && !has_sword(snapshot, staticData, itemName)) {
    return false;
  }

  // Check if in inverted mode
  const gameMode = staticData.settings?.['1']?.mode || staticData.settings?.['1']?.game_mode || 'standard';
  if (gameMode !== 'inverted') {
    // Need Moon Pearl for dark world in standard mode
    return has(snapshot, staticData, 'Moon Pearl');
  }
  
  return true; // In inverted mode, no Moon Pearl needed
}

export function _has_specific_key_count(snapshot, staticData, itemName) {
  const [keyName, requiredCountStr] = itemName.split(',');
  const requiredCount = parseInt(requiredCountStr, 10) || 1;
  
  return count(snapshot, staticData, keyName.trim()) >= requiredCount;
}

export function basement_key_rule(snapshot, staticData, itemName) {
  // This is a complex rule that checks if Key Rat has the key
  // For now, assume we need 3 keys (simplified)
  return count(snapshot, staticData, 'Small Key (Hyrule Castle)') >= 3;
}

export function cross_peg_bridge(snapshot, staticData, itemName) {
  return has(snapshot, staticData, 'Hammer') && has(snapshot, staticData, 'Moon Pearl');
}

// Update existing can_extend_magic to match Python implementation
export function can_extend_magic_complex(snapshot, staticData, itemName) {
  const smallmagic = parseInt(itemName, 10) || 16;
  const fullrefill = itemName?.includes('fullrefill') || false;

  let basemagic = 8;

  if (has(snapshot, staticData, 'Magic Upgrade (1/4)')) {
    basemagic = 32;
  } else if (has(snapshot, staticData, 'Magic Upgrade (1/2)')) {
    basemagic = 16;
  }

  if (can_buy_unlimited(snapshot, staticData, 'Green Potion') ||
      can_buy_unlimited(snapshot, staticData, 'Blue Potion')) {

    const bottles = bottle_count(snapshot, staticData, itemName);
    const functionality = staticData.settings?.['1']?.item_functionality || 'normal';
    
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

export function heart_count(snapshot, staticData, itemName) {
  // Get difficulty requirements
  const bossHeartLimit = snapshot.state?.requirements?.boss_heart_container_limit ||
                        snapshot.difficultyRequirements?.boss_heart_container_limit || 20;
  const heartPieceLimit = snapshot.state?.requirements?.heart_piece_limit ||
                         snapshot.difficultyRequirements?.heart_piece_limit || 80;
  
  const bossHearts = Math.min(count(snapshot, staticData, 'Boss Heart Container'), bossHeartLimit);
  const sanctuaryHearts = count(snapshot, staticData, 'Sanctuary Heart Container');
  const pieceHearts = Math.floor(Math.min(count(snapshot, staticData, 'Piece of Heart'), heartPieceLimit) / 4);
  
  return bossHearts + sanctuaryHearts + pieceHearts + 3; // +3 for starting hearts
}

export function enhanceLocationsWithShopData(snapshot, staticData, itemName) {
  // TODO: Implement shop data enhancement for locations
  // This function appears to be a worker-specific utility for enhancing location data with shop information
  // Requires: Complex integration between location data and shop data
  // Not critical for rule evaluation, more of a data processing utility
  return undefined;
}

export function can_revival_fairy_shop(snapshot, staticData, itemName) {
  const hasBottle = count(snapshot, staticData, 'Bottle') > 0;
  const minorGlitches = staticData.settings?.['1']?.mode === 'minor_glitches' ||
                       staticData.settings?.['1']?.glitches_required === 'minor_glitches';
  return hasBottle && minorGlitches;
}

export function countGroup(snapshot, staticData, itemName) {
  // Count items in a specific group (e.g., "Bottles", "Crystals")
  const groupName = itemName;
  
  if (!staticData || !staticData.groupData || !staticData.groupData[groupName]) {
    return 0;
  }
  
  const groupItems = staticData.groupData[groupName];
  let totalCount = 0;
  
  for (const itemName of groupItems) {
    totalCount += count(snapshot, staticData, itemName);
  }
  
  return totalCount;
}

export function has_crystals_count(snapshot, staticData, itemName) {
  // Alternative crystal counting that uses group data
  const requiredCount = parseInt(itemName, 10) || 7;
  const crystalCount = countGroup(snapshot, staticData, 'Crystals');
  return crystalCount >= requiredCount;
}

export function can_reach_region(snapshot, staticData, itemName) {
  // Check if a specific region is reachable
  const regionName = itemName;
  
  if (!snapshot.regionReachability) return false;
  return snapshot.regionReachability?.[regionName] === 'reachable';
}

export function can_get_bottle(snapshot, staticData, itemName) {
  // Check if player can obtain any bottle
  // This is a simplified version - full implementation would check specific bottle locations
  return count(snapshot, staticData, 'Bottle') > 0 ||
         can_reach_region(snapshot, staticData, 'Bottle Merchant') ||
         can_reach_region(snapshot, staticData, 'Magic Shop');
}

export function zip(snapshot, staticData, itemName) {
  // Python's zip function - combines multiple iterables element-wise
  // Expected usage: zip([list1], [list2], ...) -> [[item1_from_list1, item1_from_list2], ...]
  // When called from rule engine, itemName is an array of arguments: [arg1, arg2, ...]
  
  if (!Array.isArray(itemName) || itemName.length === 0) {
    return [];
  }
  
  // itemName contains the arguments to zip together
  const arrays = itemName;
  
  // Ensure we have valid arrays to work with
  const validArrays = arrays.filter(arr => Array.isArray(arr));
  
  if (validArrays.length === 0) {
    return [];
  }
  
  // Get the shortest length among all arrays
  const minLength = Math.min(...validArrays.map(arr => arr.length));
  
  // Create the zipped result
  const result = [];
  for (let i = 0; i < minLength; i++) {
    const tuple = validArrays.map(arr => arr[i]);
    result.push(tuple);
  }
  
  return result;
}

export function len(snapshot, staticData, itemName) {
  // Python's len function - returns the length of a collection
  if (Array.isArray(itemName)) {
    return itemName.length;
  } else if (typeof itemName === 'string') {
    return itemName.length;
  } else if (itemName && typeof itemName === 'object') {
    return Object.keys(itemName).length;
  }
  return 0;
}

// Additional utility functions that may be referenced in rules

export function can_bomb_things(snapshot, staticData, itemName) {
  // Alias for can_use_bombs for rule compatibility
  return can_use_bombs(snapshot, staticData, itemName);
}

export function can_pass_curtains(snapshot, staticData, itemName) {
  // Curtains can be passed with lantern or fire rod
  return has(snapshot, staticData, 'Lamp') || has(snapshot, staticData, 'Fire Rod');
}

export function can_see_in_dark(snapshot, staticData, itemName) {
  // Alias for can_pass_curtains
  return can_pass_curtains(snapshot, staticData, itemName);
}

export function can_pass_rocks(snapshot, staticData, itemName) {
  // Rocks can be lifted or bombed
  return can_lift_rocks(snapshot, staticData, itemName) || 
         can_use_bombs(snapshot, staticData, '1');
}

export function can_swim(snapshot, staticData, itemName) {
  // Need flippers to swim
  return has(snapshot, staticData, 'Flippers');
}

export function can_waterwalk(snapshot, staticData, itemName) {
  // Water walking boots or hookshot for crossing water
  return has(snapshot, staticData, 'Flippers') || has(snapshot, staticData, 'Hookshot');
}

export function can_reach_light_world(snapshot, staticData, itemName) {
  // Check if light world is accessible
  const gameMode = staticData.settings?.['1']?.mode || staticData.settings?.['1']?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    // In inverted mode, need Moon Pearl to access light world safely
    return has(snapshot, staticData, 'Moon Pearl');
  }
  return true; // Always accessible in standard mode
}

export function can_reach_dark_world(snapshot, staticData, itemName) {
  // Check if dark world is accessible
  const gameMode = staticData.settings?.['1']?.mode || staticData.settings?.['1']?.game_mode || 'standard';
  if (gameMode === 'inverted') {
    return true; // Always accessible in inverted mode
  } else {
    // Need access to dark world portals or magic mirror
    return has(snapshot, staticData, 'Moon Pearl') &&
           (has(snapshot, staticData, 'Magic Mirror') || 
            can_reach_region(snapshot, staticData, 'Dark World'));
  }
}

export function open_mode(snapshot, staticData, itemName) {
  // Check if this is open mode (affects certain accessibility rules)
  return staticData.settings?.['1']?.mode === 'open' ||
         staticData.settings?.['1']?.open_pyramid === true;
}

export function swordless_mode(snapshot, staticData, itemName) {
  // Check if this is swordless mode
  return staticData.settings?.['1']?.swordless === true ||
         (snapshot.flags && snapshot.flags.includes('swordless'));
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
  can_defeat_boss,
  has_beam_sword,
  has_melee_weapon,
  has_rod,
  can_take_damage,
  
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
  tr_big_key_chest_keys_needed,
  item_name_in_location_names,
  GanonDefeatRule,
  has_crystals_for_ganon,
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
  zip,
  len,
  
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
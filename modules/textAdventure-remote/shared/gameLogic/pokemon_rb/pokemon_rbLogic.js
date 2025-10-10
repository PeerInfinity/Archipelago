/**
 * Thread-agnostic Pokemon Red/Blue game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 *
 * Ported from worlds/pokemon_rb/logic.py
 */

/**
 * Check if player has an item
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
  // Check flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Check events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (!snapshot.inventory) return false;
  return (snapshot.inventory[itemName] || 0) > 0;
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
  return snapshot.inventory[itemName] || 0;
}

/**
 * Check if player has all items in a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - List of item names
 * @returns {boolean} True if player has all items
 */
export function has_all(snapshot, staticData, items) {
  for (const item of items) {
    if (!has(snapshot, staticData, item)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if player has any item in a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - List of item names
 * @returns {boolean} True if player has any item
 */
export function has_any(snapshot, staticData, items) {
  for (const item of items) {
    if (has(snapshot, staticData, item)) {
      return true;
    }
  }
  return false;
}

// Helper function to get world options
function getOptions(staticData) {
  // Settings are nested by player ID
  const playerId = staticData?.playerId || '1';
  const settings = staticData?.settings?.[playerId] || staticData?.settings || {};
  return settings;
}

// Helper function to get game-specific data from game_info
function getGameData(staticData, key) {
  const playerId = staticData?.playerId || '1';

  // Try to get from game_info first (nested by player)
  if (staticData?.game_info?.[playerId]?.[key]) {
    return staticData.game_info[playerId][key];
  }

  // Fallback to top-level (for backward compatibility)
  if (staticData?.[key]) {
    return staticData[key];
  }

  return null;
}

/**
 * Check if a Pokemon can learn a specific HM move
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data (contains local_poke_data)
 * @param {string} move - HM move name
 * @returns {boolean} True if any owned Pokemon can learn the move
 */
export function can_learn_hm(snapshot, staticData, move) {
  const local_poke_data = getGameData(staticData, 'local_poke_data');
  if (!local_poke_data) return false;

  const moveIndex = ["Cut", "Fly", "Surf", "Strength", "Flash"].indexOf(move);
  if (moveIndex === -1) return false;

  for (const [pokemon, data] of Object.entries(local_poke_data)) {
    if (has(snapshot, staticData, pokemon) && data.tms && data.tms[6]) {
      // Check if the Pokemon can learn this HM
      if (data.tms[6] & (1 << (moveIndex + 2))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Check if player can use Surf
 */
export function can_surf(snapshot, staticData) {
  const options = getOptions(staticData);
  const extra_badges = getGameData(staticData, 'extra_badges') || {};

  return (
    has(snapshot, staticData, "HM03 Surf") &&
    can_learn_hm(snapshot, staticData, "Surf") &&
    (has(snapshot, staticData, "Soul Badge") ||
     has(snapshot, staticData, extra_badges["Surf"]) ||
     options.badges_needed_for_hm_moves === 0)
  );
}

/**
 * Check if player can use Cut
 */
export function can_cut(snapshot, staticData) {
  const options = getOptions(staticData);
  const extra_badges = getGameData(staticData, 'extra_badges') || {};

  return (
    has(snapshot, staticData, "HM01 Cut") &&
    can_learn_hm(snapshot, staticData, "Cut") &&
    (has(snapshot, staticData, "Cascade Badge") ||
     has(snapshot, staticData, extra_badges["Cut"]) ||
     options.badges_needed_for_hm_moves === 0)
  );
}

/**
 * Check if player can use Fly
 */
export function can_fly(snapshot, staticData) {
  const options = getOptions(staticData);
  const extra_badges = getGameData(staticData, 'extra_badges') || {};

  return (
    (has(snapshot, staticData, "HM02 Fly") &&
     can_learn_hm(snapshot, staticData, "Fly") ||
     has(snapshot, staticData, "Flute")) &&
    (has(snapshot, staticData, "Thunder Badge") ||
     has(snapshot, staticData, extra_badges["Fly"]) ||
     options.badges_needed_for_hm_moves === 0)
  );
}

/**
 * Check if player can use Strength
 */
export function can_strength(snapshot, staticData) {
  const options = getOptions(staticData);
  const extra_badges = getGameData(staticData, 'extra_badges') || {};

  return (
    (has(snapshot, staticData, "HM04 Strength") &&
     can_learn_hm(snapshot, staticData, "Strength") ||
     has(snapshot, staticData, "Titan's Mitt")) &&
    (has(snapshot, staticData, "Rainbow Badge") ||
     has(snapshot, staticData, extra_badges["Strength"]) ||
     options.badges_needed_for_hm_moves === 0)
  );
}

/**
 * Check if player can use Flash
 */
export function can_flash(snapshot, staticData) {
  const options = getOptions(staticData);
  const extra_badges = getGameData(staticData, 'extra_badges') || {};

  return (
    (has(snapshot, staticData, "HM05 Flash") &&
     can_learn_hm(snapshot, staticData, "Flash") ||
     has(snapshot, staticData, "Lamp")) &&
    (has(snapshot, staticData, "Boulder Badge") ||
     has(snapshot, staticData, extra_badges["Flash"]) ||
     options.badges_needed_for_hm_moves === 0)
  );
}

/**
 * Check if player can get hidden items
 */
export function can_get_hidden_items(snapshot, staticData) {
  const options = getOptions(staticData);
  return has(snapshot, staticData, "Item Finder") || !options.require_item_finder;
}

/**
 * Check if player has a certain number of key items
 */
export function has_key_items(snapshot, staticData, count) {
  const keyItemsList = [
    "Bicycle", "Silph Scope", "Item Finder", "Super Rod", "Good Rod",
    "Old Rod", "Lift Key", "Card Key", "Town Map", "Coin Case", "S.S. Ticket",
    "Secret Key", "Poke Flute", "Mansion Key", "Safari Pass", "Plant Key",
    "Hideout Key", "Card Key 2F", "Card Key 3F", "Card Key 4F", "Card Key 5F",
    "Card Key 6F", "Card Key 7F", "Card Key 8F", "Card Key 9F", "Card Key 10F",
    "Card Key 11F", "Exp. All", "Fire Stone", "Thunder Stone", "Water Stone",
    "Leaf Stone", "Moon Stone", "Oak's Parcel", "Helix Fossil", "Dome Fossil",
    "Old Amber", "Tea", "Gold Teeth", "Bike Voucher"
  ];

  let keyItemCount = 0;
  for (const item of keyItemsList) {
    if (has(snapshot, staticData, item)) {
      keyItemCount++;
    }
  }

  // Add progressive card keys
  const progressiveCardKeys = Math.min(count(snapshot, staticData, "Progressive Card Key"), 10);
  keyItemCount += progressiveCardKeys;

  return keyItemCount >= count;
}

/**
 * Check if player can pass the guards (Saffron City)
 */
export function can_pass_guards(snapshot, staticData) {
  const options = getOptions(staticData);
  if (options.tea) {
    return has(snapshot, staticData, "Tea");
  } else {
    return has(snapshot, staticData, "Vending Machine Drinks");
  }
}

/**
 * Check if player has a certain number of badges
 */
export function has_badges(snapshot, staticData, badgeCount) {
  const badges = [
    "Boulder Badge", "Cascade Badge", "Thunder Badge", "Rainbow Badge",
    "Marsh Badge", "Soul Badge", "Volcano Badge", "Earth Badge"
  ];

  let count = 0;
  for (const badge of badges) {
    if (has(snapshot, staticData, badge)) {
      count++;
    }
  }

  return count >= badgeCount;
}

/**
 * Check if player has enough Pokemon for Oak's Aide
 */
export function oaks_aide(snapshot, staticData, pokemonCount) {
  const options = getOptions(staticData);

  if (options.require_pokedex && !has(snapshot, staticData, "Pokedex")) {
    return false;
  }

  return has_pokemon(snapshot, staticData, pokemonCount);
}

/**
 * Count how many different Pokemon the player has obtained
 */
export function has_pokemon(snapshot, staticData, pokemonCount) {
  // Get the list of all Pokemon from poke_data
  const poke_data = getGameData(staticData, 'poke_data');
  if (!poke_data) {
    // Fallback: just count Pokemon-like items in inventory
    // This isn't perfect but better than nothing
    return false;
  }

  const obtained_pokemon = new Set();
  for (const pokemon of Object.keys(poke_data)) {
    if (has(snapshot, staticData, pokemon) || has(snapshot, staticData, `Static ${pokemon}`)) {
      obtained_pokemon.add(pokemon);
    }
  }

  return obtained_pokemon.size >= pokemonCount;
}

/**
 * Check fossil-related requirements
 */
export function fossil_checks(snapshot, staticData, fossilCount) {
  if (!has_all(snapshot, staticData, ["Mt Moon Fossils", "Cinnabar Lab", "Cinnabar Island"])) {
    return false;
  }

  const fossils = ["Dome Fossil", "Helix Fossil", "Old Amber"];
  let count = 0;
  for (const fossil of fossils) {
    if (has(snapshot, staticData, fossil)) {
      count++;
    }
  }

  return count >= fossilCount;
}

/**
 * Check if player has card key for a specific floor
 */
export function card_key(snapshot, staticData, floor) {
  return (
    has(snapshot, staticData, `Card Key ${floor}F`) ||
    has(snapshot, staticData, "Card Key") ||
    count(snapshot, staticData, "Progressive Card Key") >= (floor - 1)
  );
}

/**
 * Check if player can navigate Rock Tunnel
 */
export function rock_tunnel(snapshot, staticData) {
  const options = getOptions(staticData);
  return can_flash(snapshot, staticData) || !options.dark_rock_tunnel_logic;
}

/**
 * Check if player can access Route 3 based on options
 */
export function route(snapshot, staticData) {
  const options = getOptions(staticData);
  const condition = options.route_3_condition;

  // Route3Condition values:
  // option_open = 0
  // option_defeat_brock = 1 (default)
  // option_defeat_any_gym = 2
  // option_boulder_badge = 3
  // option_any_badge = 4

  if (condition === 1 || condition === "defeat_brock") {
    return has(snapshot, staticData, "Defeat Brock");
  } else if (condition === 2 || condition === "defeat_any_gym") {
    return has_any(snapshot, staticData, [
      "Defeat Brock", "Defeat Misty", "Defeat Lt. Surge", "Defeat Erika",
      "Defeat Koga", "Defeat Blaine", "Defeat Sabrina", "Defeat Viridian Gym Giovanni"
    ]);
  } else if (condition === 3 || condition === "boulder_badge") {
    return has(snapshot, staticData, "Boulder Badge");
  } else if (condition === 4 || condition === "any_badge") {
    return has_any(snapshot, staticData, [
      "Boulder Badge", "Cascade Badge", "Thunder Badge", "Rainbow Badge",
      "Marsh Badge", "Soul Badge", "Volcano Badge", "Earth Badge"
    ]);
  }

  // Default: open (condition === 0 or undefined)
  return true;
}

/**
 * Check if player has defeated enough gym leaders to reach a Pokemon's evolution level
 * The logic is: number of gym leaders defeated > level / 7
 */
export function evolve_level(snapshot, staticData, level) {
  const gymLeaders = [
    "Defeat Brock", "Defeat Misty", "Defeat Lt. Surge", "Defeat Erika",
    "Defeat Koga", "Defeat Blaine", "Defeat Sabrina", "Defeat Viridian Gym Giovanni"
  ];

  let count = 0;
  for (const leader of gymLeaders) {
    if (has(snapshot, staticData, leader)) {
      count++;
    }
  }

  return count > (level / 7);
}

// Export all helper functions
export const helperFunctions = {
  has,
  count,
  has_all,
  has_any,
  can_surf,
  can_cut,
  can_fly,
  can_strength,
  can_flash,
  can_learn_hm,
  can_get_hidden_items,
  has_key_items,
  can_pass_guards,
  has_badges,
  oaks_aide,
  has_pokemon,
  fossil_checks,
  card_key,
  rock_tunnel,
  route,
  evolve_level
};

// Use generic state module for now
import { genericStateModule } from '../generic/genericLogic.js';
export const pokemon_rbStateModule = genericStateModule;

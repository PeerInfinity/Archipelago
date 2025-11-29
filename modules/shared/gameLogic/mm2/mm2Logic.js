/**
 * Thread-agnostic Mega Man 2 game logic functions
 * These pure functions operate on a canonical state object and return results
 * without modifying the state
 */

/**
 * Robot Master boss names (for reference)
 * Boss IDs 0-7 are Robot Masters, 12 is Wily Machine
 */
const robot_masters = {
  0: "Heat Man Defeated",
  1: "Air Man Defeated",
  2: "Wood Man Defeated",
  3: "Bubble Man Defeated",
  4: "Quick Man Defeated",
  5: "Flash Man Defeated",
  6: "Metal Man Defeated",
  7: "Crash Man Defeated"
};

/**
 * Check if player has an item in their inventory
 * @param {Object} snapshot - Canonical state snapshot
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
function has(snapshot, itemName) {
  // Check flags (events, checked locations, etc.)
  if (snapshot.flags && snapshot.flags.includes(itemName)) {
    return true;
  }

  // Check events
  if (snapshot.events && snapshot.events.includes(itemName)) {
    return true;
  }

  // Check inventory
  if (snapshot.inventory && (snapshot.inventory[itemName] || 0) > 0) {
    return true;
  }

  return false;
}

/**
 * Check if player has all items in a list
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Array<string>} items - List of item names
 * @returns {boolean} True if player has all items
 */
function has_all(snapshot, items) {
  if (!items || items.length === 0) {
    return true; // No requirements means always accessible
  }

  for (const item of items) {
    if (!has(snapshot, item)) {
      return false;
    }
  }
  return true;
}

/**
 * Check if player can defeat enough robot masters to access Wily Stage 5
 * This is based on the can_defeat_enough_rbms function from worlds/mm2/rules.py
 *
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data (contains settings)
 * @param {number} required - Number of robot masters required to defeat
 * @param {Object} boss_requirements - Dict mapping boss_id to array of required weapon names
 * @returns {boolean} True if player can defeat enough robot masters
 */
export function can_defeat_enough_rbms(snapshot, staticData, required, boss_requirements) {
  // Get wily_5 data from settings
  const settings = staticData?.settings?.[1];
  const wily_5_requirement = required || settings?.wily_5_requirement || 8;
  const wily_5_weapons = boss_requirements || settings?.wily_5_weapons || {};

  let can_defeat = 0;

  // Iterate through all bosses in the requirements
  for (const [boss_id_str, weapon_names] of Object.entries(wily_5_weapons)) {
    const boss_id = parseInt(boss_id_str);

    // Only count robot masters (0-7), not Wily Machine (12)
    if (boss_id in robot_masters) {
      // Check if player has all required weapons for this boss
      // If the weapon list is empty, boss can be defeated with buster (always available)
      if (weapon_names.length === 0 || has_all(snapshot, weapon_names)) {
        can_defeat += 1;
        if (can_defeat >= wily_5_requirement) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Helper functions registry for Mega Man 2
 * Maps helper function names to their implementations
 */
export const helperFunctions = {
  can_defeat_enough_rbms
};

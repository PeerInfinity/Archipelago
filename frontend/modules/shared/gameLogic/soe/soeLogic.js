/**
 * Secret of Evermore game logic functions
 *
 * SOE uses pyevermizer's progress system where items and rules provide
 * progress IDs. The main helper function `has` checks if the player has
 * collected enough items to reach a certain progress count.
 */

/**
 * Count how many units of a progress ID the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data including items with provides
 * @param {number} progressId - Progress ID to count
 * @param {Set} visitedRules - Set of rule indices already checked (prevents infinite recursion)
 * @returns {number} Count of progress units
 */
function countProgress(snapshot, staticData, progressId, visitedRules = new Set()) {
  try {
    if (!snapshot || !staticData) {
      console.error('[SOE] countProgress: missing snapshot or staticData');
      return 0;
    }

    const inventory = snapshot.inventory || {};

    // StateManager flattens items to staticData.items (no player ID needed)
    const items = staticData.items;

    if (!items) {
      console.error('[SOE] No items found in staticData');
      return 0;
    }

    let count = 0;

    // Count progress from items in inventory
    for (const [itemName, itemCount] of Object.entries(inventory)) {
      if (itemCount > 0) {
        const itemData = items[itemName];
        if (itemData && Array.isArray(itemData.provides)) {
          for (const provide of itemData.provides) {
            if (provide.progress_id === progressId) {
              count += itemCount * provide.count;
            }
          }
        }
      }
    }

    // Count progress from logic rules (with recursion protection)
    const logicRules = items.__soe_logic_rules__;
    if (logicRules && Array.isArray(logicRules.rules)) {
      // Limit recursion depth to prevent infinite loops
      const MAX_RECURSION_DEPTH = 10;
      if (visitedRules.size >= MAX_RECURSION_DEPTH) {
        return count; // Stop if we're too deep
      }

      for (let i = 0; i < logicRules.rules.length; i++) {
        const rule = logicRules.rules[i];

        // Skip if this rule doesn't provide the progress we're looking for
        const providesThisProgress = rule.provides.some(p => p.progress_id === progressId);
        if (!providesThisProgress) continue;

        // Skip if we're already evaluating this rule (prevents circular dependencies)
        if (visitedRules.has(i)) continue;

        // Check if all requirements are met
        let requirementsMet = true;
        for (const req of rule.requires) {
          // Create a new visited set for this branch
          const newVisited = new Set(visitedRules);
          newVisited.add(i);

          // Recursively check requirement
          const reqCount = countProgress(snapshot, staticData, req.progress_id, newVisited);
          if (reqCount < req.count) {
            requirementsMet = false;
            break;
          }
        }

        // If requirements are met, add the provides to our count
        // Only add positive counts - matches Python logic in worlds/soe/logic.py:70
        if (requirementsMet) {
          for (const provide of rule.provides) {
            if (provide.progress_id === progressId && provide.count > 0) {
              count += provide.count;
            }
          }
        }
      }
    }

    return count;
  } catch (error) {
    console.error('[SOE] Error in countProgress:', error);
    console.error('[SOE] progressId:', progressId);
    console.error('[SOE] snapshot:', snapshot);
    return 0;
  }
}

/**
 * Check if the player has reached a certain progress count
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} progressId - Progress ID to check
 * @param {number} requiredCount - Required count (default: 1)
 * @returns {boolean} True if player has enough progress
 */
export function has(snapshot, staticData, progressId, requiredCount = 1) {
  try {
    // Validate inputs
    if (progressId === undefined || progressId === null) {
      console.error('[SOE] has() called with undefined/null progressId');
      return false;
    }

    // Special handling for P_ALLOW_OOB (25) and P_ALLOW_SEQUENCE_BREAKS (26)
    // These are controlled by settings
    const settings = staticData?.settings?.[1];

    if (progressId === 25) { // P_ALLOW_OOB
      // Check if out_of_bounds is set to 'logic' (option value 2)
      return settings?.out_of_bounds === 2;
    }

    if (progressId === 26) { // P_ALLOW_SEQUENCE_BREAKS
      // Check if sequence_breaks is set to 'logic' (option value 2)
      return settings?.sequence_breaks === 2;
    }

    // For energy core fragments mode
    if (progressId === 9) { // P_ENERGY_CORE
      // Check if we're in fragments mode
      if (settings?.energy_core === 1) { // fragments mode
        // Use P_CORE_FRAGMENT (10) instead and required_fragments count
        const requiredFragments = settings?.required_fragments || 21;
        progressId = 10; // P_CORE_FRAGMENT
        requiredCount = requiredFragments;
      }
    }

    const count = countProgress(snapshot, staticData, progressId);
    const result = count >= requiredCount;

    return result;
  } catch (error) {
    console.error('[SOE] Error in has():', error);
    console.error('[SOE] progressId:', progressId, 'requiredCount:', requiredCount);
    console.error('[SOE] Stack:', error.stack);
    return false;
  }
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Canonical state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName) {
  try {
    if (!snapshot || !snapshot.inventory) return 0;
    return snapshot.inventory[itemName] || 0;
  } catch (error) {
    console.error('[SOE] Error in count():', error);
    return 0;
  }
}

/**
 * Get the item placed at a specific location (for self-locking logic)
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data (contains locations with item data)
 * @param {string} locationName - Name of the location to check
 * @returns {Array|null} Array of [itemName, playerId] or null if no item
 */
export function location_item_name(snapshot, staticData, locationName) {
  try {
    const regions = staticData?.regions?.[1];
    if (!regions) return null;

    // Search through all regions for the location
    for (const region of Object.values(regions)) {
      if (!region.locations) continue;

      const location = region.locations.find(loc => loc?.name === locationName);
      if (location && location.item) {
        return [location.item.name, location.item.player];
      }
    }

    return null;
  } catch (error) {
    console.error('[SOE] Error in location_item_name():', error);
    return null;
  }
}

/**
 * Helper functions object for game logic registry
 */
export const helperFunctions = {
  has,
  count,
  location_item_name
};

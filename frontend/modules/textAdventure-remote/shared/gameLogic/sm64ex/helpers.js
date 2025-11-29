/**
 * Super Mario 64 EX game-specific helper functions
 */

/**
 * Check if a region is reachable
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} regionName - Name of the region to check
 * @returns {boolean} True if the region is reachable
 */
export function can_reach_region(snapshot, staticData, regionName) {
    const status = snapshot?.regionReachability?.[regionName];
    return status === 'reachable' || status === 'checked';
}

/**
 * Check if a location is accessible (checked)
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} locationName - Name of the location to check
 * @returns {boolean} True if the location is accessible
 */
export function can_reach_location(snapshot, staticData, locationName) {
    // A location is accessible if it's been checked (collected)
    // or if it's currently available to check
    if (!snapshot?.locations) return false;

    // Check all regions for this location
    for (const region of Object.values(snapshot.locations)) {
        if (region[locationName]) {
            const locStatus = region[locationName];
            return locStatus === 'available' || locStatus === 'checked';
        }
    }

    return false;
}

/**
 * Check if the player has all items in the array
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - Array of item names to check
 * @returns {boolean} True if player has all items
 */
export function has_all_items(snapshot, staticData, items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return true; // Empty array means no requirements
    }

    const inventory = snapshot?.inventory || {};

    // Check each item
    for (const itemName of items) {
        const count = inventory[itemName] || 0;
        if (count === 0) {
            return false; // Missing this item
        }
    }

    return true; // Has all items
}

/**
 * Check if the player has any item from the array
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} items - Array of item names to check
 * @returns {boolean} True if player has at least one item
 */
export function has_any_item(snapshot, staticData, items) {
    if (!items || !Array.isArray(items) || items.length === 0) {
        return false; // Empty array means no items
    }

    const inventory = snapshot?.inventory || {};

    // Check each item
    for (const itemName of items) {
        const count = inventory[itemName] || 0;
        if (count > 0) {
            return true; // Has at least this item
        }
    }

    return false; // Has none of the items
}

export default {
    can_reach_region,
    can_reach_location,
    has_all_items,
    has_any_item
};

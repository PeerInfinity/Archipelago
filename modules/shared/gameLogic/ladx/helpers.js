/**
 * Links Awakening DX Helper Functions
 *
 * These helpers implement game-specific logic that can't be expressed
 * purely through the rule system.
 *
 * All helper functions follow the standardized signature:
 * `(snapshot, staticData, ...args) => boolean | number | any`
 *
 * Where:
 * - snapshot: { inventory, flags, events, player, regionReachability, evaluateRule }
 * - staticData: { settings, progressionMapping, regions, locations, items }
 */

/**
 * Calculate total RUPEES from collected rupee items.
 *
 * In LADX, RUPEES is a cumulative currency counter computed from
 * collected rupee items (20 Rupees, 50 Rupees, etc.), not a direct item.
 *
 * This matches the Python behavior in worlds/ladx/__init__.py lines 514-521
 * where the collect() method adds rupee values to prog_items["RUPEES"].
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {number} Total rupees collected
 */
export function calculateRupees(snapshot, staticData) {
    const rupeeItems = {
        '20 Rupees': 20,
        '50 Rupees': 50,
        '100 Rupees': 100,
        '200 Rupees': 200,
        '500 Rupees': 500
    };

    let total = 0;
    if (snapshot && snapshot.inventory) {
        for (const [itemName, value] of Object.entries(rupeeItems)) {
            const itemCount = snapshot.inventory[itemName] || 0;
            total += itemCount * value;
        }
    }

    return total;
}

/**
 * Helper to check if player has enough RUPEES.
 * This is used by rules that check: FOUND("RUPEES", amount) or COUNT("RUPEES", amount)
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} amount - Required amount of rupees
 * @returns {boolean} True if player has >= amount rupees
 */
export function hasRupees(snapshot, staticData, amount) {
    return calculateRupees(snapshot, staticData) >= amount;
}

/**
 * Count helper function for LADX - handles RUPEES specially.
 * This is called by stateInterface.js countItem() when checking item counts.
 *
 * @param {Object} snapshot - The state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - The item to count
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName) {
    // Special handling for RUPEES currency
    if (itemName === 'RUPEES') {
        // Calculate total rupees from rupee items in inventory
        const rupeeItems = {
            '20 Rupees': 20,
            '50 Rupees': 50,
            '100 Rupees': 100,
            '200 Rupees': 200,
            '500 Rupees': 500
        };

        let total = 0;
        if (snapshot && snapshot.inventory) {
            for (const [rupeeItemName, value] of Object.entries(rupeeItems)) {
                const itemCount = snapshot.inventory[rupeeItemName] || 0;
                total += itemCount * value;
            }
        }
        return total;
    }

    // For all other items, return standard inventory count
    return snapshot?.inventory?.[itemName] || 0;
}

// Export all helpers as default for game logic registry
export default {
    calculateRupees,
    hasRupees,
    count
};

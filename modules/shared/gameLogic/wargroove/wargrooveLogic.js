/**
 * Wargroove Game Logic Module
 *
 * Provides game-specific logic for Wargroove including state methods
 * for item and region checking.
 */

/**
 * State methods for Wargroove.
 * These implement the custom state methods used by Wargroove's Python logic.
 */
export const stateMethods = {
    /**
     * Check if player has a specific item.
     * This is the JavaScript implementation of _wargroove_has_item from worlds/wargroove/Rules.py
     *
     * Python signature: def _wargroove_has_item(self, player: int, item: str) -> bool
     *
     * @param {Object} snapshot - Game state snapshot
     * @param {Object} staticData - Static game data
     * @param {string} item - Item name to check
     * @returns {boolean} True if player has the item
     */
    _wargroove_has_item(snapshot, staticData, item) {
        const inventory = snapshot?.inventory || {};
        return (inventory[item] || 0) > 0;
    },

    /**
     * Check if player has a specific item AND can reach a specific region.
     * This is the JavaScript implementation of _wargroove_has_item_and_region from worlds/wargroove/Rules.py
     *
     * Python signature: def _wargroove_has_item_and_region(self, player: int, item: str, region: str) -> bool
     *
     * @param {Object} snapshot - Game state snapshot
     * @param {Object} staticData - Static game data
     * @param {string} item - Item name to check
     * @param {string} region - Region name to check reachability
     * @returns {boolean} True if player has the item and can reach the region
     */
    _wargroove_has_item_and_region(snapshot, staticData, item, region) {
        // Check if player has the item
        const inventory = snapshot?.inventory || {};
        const hasItem = (inventory[item] || 0) > 0;

        // Check if player can reach the region
        // regionReachability is an object with keys as region names and values as 'reachable'/'checked'/'unreachable'
        const regionStatus = snapshot?.regionReachability?.[region];
        const canReachRegion = regionStatus === 'reachable' || regionStatus === 'checked';

        return hasItem && canReachRegion;
    }
};

/**
 * Helper functions for Wargroove.
 * Currently none are needed, but this is here for future expansion.
 */
export const helperFunctions = {};

/**
 * Initialize Wargroove game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Wargroove-specific logic handlers
 */
export function initializeGameLogic(context) {
    return {
        helpers: helperFunctions,
        stateMethods: stateMethods
    };
}

// Export for game logic registry
export default {
    initializeGameLogic,
    helperFunctions,
    stateMethods
};

/**
 * Links Awakening DX Game Logic Module
 *
 * Provides game-specific logic for LADX including helper functions
 * and custom state handling.
 */

import { calculateRupees, hasRupees, count } from './helpers.js';

/**
 * LADX Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    calculateRupees,
    hasRupees,
    count  // Used by stateInterface.js countItem() for all item count checks
};

/**
 * Initialize LADX game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} LADX-specific logic handlers
 */
export function initializeGameLogic(context) {
    return {
        helpers: helperFunctions,

        /**
         * Override item count retrieval to handle RUPEES currency.
         * RUPEES is computed from collected rupee items, not stored directly.
         *
         * Note: This function uses the legacy interface for backward compatibility
         * with the initializeGameLogic context. The helperFunctions exported above
         * use the standardized (snapshot, staticData, ...args) signature.
         */
        getItemCount: function(snapshot, itemName, staticData) {
            if (itemName === 'RUPEES') {
                return calculateRupees(snapshot, staticData);
            }
            // For all other items, use default behavior
            return snapshot?.inventory?.[itemName] || 0;
        },

        /**
         * Check if player has an item, with special handling for RUPEES.
         *
         * Note: This function uses the legacy interface for backward compatibility
         * with the initializeGameLogic context. The helperFunctions exported above
         * use the standardized (snapshot, staticData, ...args) signature.
         */
        hasItem: function(snapshot, itemName, staticData, count = 1) {
            if (itemName === 'RUPEES') {
                return hasRupees(snapshot, staticData, count);
            }
            // For all other items, use default behavior
            return (snapshot?.inventory?.[itemName] || 0) >= count;
        }
    };
}

// Export for game logic registry
export default {
    initializeGameLogic,
    helperFunctions
};

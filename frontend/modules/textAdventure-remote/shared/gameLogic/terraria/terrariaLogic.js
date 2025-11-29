/**
 * Terraria Game Logic Module
 *
 * Provides game-specific logic for Terraria including helper functions
 * for checking settings, NPC counts, tool power levels, and minion slots.
 */

import { check_setting, has_n_from_list, has_minions } from './helpers.js';

/**
 * Terraria Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    check_setting,
    has_n_from_list,
    has_minions
};

/**
 * Initialize Terraria game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Terraria-specific logic handlers
 */
export function initializeGameLogic(context) {
    return {
        helpers: helperFunctions
    };
}

// Export for game logic registry
export default {
    initializeGameLogic,
    helperFunctions
};

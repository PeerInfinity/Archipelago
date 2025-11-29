/**
 * The Legend of Zelda Game Logic Module
 *
 * Provides game-specific logic for TLOZ including helper functions.
 */

import { int } from './helpers.js';

/**
 * TLOZ Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    int
};

/**
 * Initialize TLOZ game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} TLOZ-specific logic handlers
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

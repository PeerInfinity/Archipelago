/**
 * Starcraft 2 Game Logic Module
 *
 * Provides game-specific logic for SC2 including helper functions
 * and custom state handling.
 */

import * as helpers from './helpers.js';

/**
 * SC2 Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = helpers.default;

/**
 * Initialize SC2 game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} SC2-specific logic handlers
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

/**
 * Paint Game Logic Module
 *
 * Provides game-specific logic for Paint including the paint percentage
 * calculation helper function.
 */

import { paint_percent_available } from './helpers.js';

/**
 * Paint Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    paint_percent_available
};

/**
 * Initialize Paint game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Paint-specific logic handlers
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

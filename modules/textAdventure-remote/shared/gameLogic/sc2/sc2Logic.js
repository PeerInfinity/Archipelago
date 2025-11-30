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
 * SC2-specific helper name prefixes.
 * When resolving a helper by name (e.g., 'power_rating'), the system will try
 * these prefixes to find faction-specific implementations (e.g., 'terran_power_rating').
 */
export const helperPrefixes = ['terran_', 'zerg_', 'protoss_', 'nova_'];

/**
 * Get the base power rating based on required tactics setting.
 * In Python: self.base_power_rating = 2 if self.advanced_tactics else 0
 *
 * @param {Object} settings - Player settings
 * @returns {number} Base power rating (0 for standard, 2 for advanced tactics)
 */
function getBasePowerRating(settings) {
    // required_tactics: 0 = standard, non-zero = advanced
    const isAdvancedTactics = settings?.required_tactics !== undefined && settings.required_tactics !== 0;
    return isAdvancedTactics ? 2 : 0;
}

/**
 * Wrap the state snapshot to add SC2-specific computed properties.
 * This adds 'power_rating' which is referenced in some rules.
 *
 * @param {Object} snapshot - Current game state snapshot
 * @param {Object} staticData - Static game data including settings
 * @returns {Object} Enhanced state object with power_rating
 */
export function wrapState(snapshot, staticData) {
    if (!snapshot) return {};

    // Get player settings
    const playerId = snapshot?.player?.id || snapshot?.player?.slot || 1;
    const settings = staticData?.settings?.[playerId] || {};

    // Compute power rating
    // In Python: power_rating is base_power_rating + various upgrade bonuses
    // For simplicity, we just return base_power_rating as a starting point
    // The full calculation would include checking for specific upgrade items
    const basePowerRating = getBasePowerRating(settings);

    return {
        ...snapshot,
        power_rating: basePowerRating
    };
}

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
    helperFunctions,
    helperPrefixes,
    wrapState
};

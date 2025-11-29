/**
 * Shivers Game Logic Module
 *
 * Provides game-specific logic for Shivers including helper functions
 * for checking Ixupi capture conditions.
 */

import {
    water_capturable,
    wax_capturable,
    ash_capturable,
    oil_capturable,
    cloth_capturable,
    wood_capturable,
    crystal_capturable,
    sand_capturable,
    metal_capturable,
    lightning_capturable,
    beths_body_available,
    first_nine_ixupi_capturable,
    all_skull_dials_set,
    completion_condition
} from './helpers.js';

/**
 * Shivers Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    water_capturable,
    wax_capturable,
    ash_capturable,
    oil_capturable,
    cloth_capturable,
    wood_capturable,
    crystal_capturable,
    sand_capturable,
    metal_capturable,
    lightning_capturable,
    beths_body_available,
    first_nine_ixupi_capturable,
    all_skull_dials_set,
    completion_condition
};

/**
 * Initialize Shivers game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Shivers-specific logic handlers
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

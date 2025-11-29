/**
 * Yacht Dice game logic module
 *
 * This module provides game-specific state management and helper functions
 * for Yacht Dice in the Archipelago JSON export tools.
 */

import { genericStateModule } from '../generic/genericLogic.js';
import * as helpers from './helpers.js';

/**
 * Yacht Dice state module
 * Uses generic state module as Yacht Dice doesn't need custom state management
 */
export const yachtdiceStateModule = genericStateModule;

/**
 * Yacht Dice helper functions
 * These are called during rule evaluation to determine location accessibility
 */
export const helperFunctions = {
    // Export the main helper function
    dice_simulation_state_change: helpers.dice_simulation_state_change,
};

// Export default object with both
export default {
    yachtdiceStateModule,
    helperFunctions
};

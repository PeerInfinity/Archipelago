/**
 * Overcooked! 2 game logic module
 *
 * This provides the helper functions for Overcooked! 2 game logic.
 */

import * as helpers from './helpers.js';
import { genericStateModule } from '../generic/genericLogic.js';

// Export helper functions for use by the game logic registry
export const helperFunctions = helpers;

// Use generic state module since Overcooked! 2 doesn't need custom state management
export const overcooked2StateModule = genericStateModule;

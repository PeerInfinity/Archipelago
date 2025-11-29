/**
 * MegaMan Battle Network 3 - Game Logic Module
 */

import { genericStateModule } from '../generic/genericLogic.js';
import * as helpers from './helpers.js';

/**
 * Export helper functions for use by the rule engine
 */
export const helperFunctions = helpers;

/**
 * Use generic state module for now
 * Can be customized later if needed
 */
export const mmbn3StateModule = genericStateModule;

export default {
  helperFunctions,
  mmbn3StateModule
};

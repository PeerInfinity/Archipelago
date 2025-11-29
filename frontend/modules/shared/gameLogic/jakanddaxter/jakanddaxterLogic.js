/**
 * Jak and Daxter: The Precursor Legacy Game Logic Module
 *
 * Provides game-specific logic for Jak and Daxter including helper functions
 * and custom state handling.
 */

import { has, count, can_reach_orbs } from './helpers.js';

/**
 * Jak and Daxter Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
  has,
  count,
  can_reach_orbs
};

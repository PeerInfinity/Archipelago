/**
 * Jak and Daxter: The Precursor Legacy Game Logic Module
 *
 * Provides game-specific logic for Jak and Daxter.
 * Most helpers are now inlined by the Python exporter.
 * can_reach_orbs and can_reach_orbs_level require JavaScript implementation
 * due to their complex runtime logic (iterating regions and summing orb counts).
 */

import { can_reach_orbs, can_reach_orbs_level } from './helpers.js';

/**
 * Jak and Daxter Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
  can_reach_orbs,
  can_reach_orbs_level
};

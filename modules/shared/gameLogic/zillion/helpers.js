/**
 * Zillion game-specific helper functions
 */

/**
 * Check if a location is accessible based on Zillion logic.
 *
 * Zillion uses the zilliandomizer library with a complex logic cache system.
 * Access rules are stored as functools.partial objects that can't be analyzed statically.
 *
 * For now, we return null to indicate we can't evaluate this helper,
 * which will cause the location to be inaccessible until we implement
 * proper Zillion logic support.
 */
export function can_access_zillion_location() {
    // TODO: Implement Zillion-specific logic
    // This requires understanding the zilliandomizer logic system
    return null;
}

/**
 * Export all helpers for registration
 */
export default {
    can_access_zillion_location,
};

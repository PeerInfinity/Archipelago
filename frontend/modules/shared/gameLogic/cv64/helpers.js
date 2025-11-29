/**
 * Castlevania 64 game-specific helper functions
 */

/**
 * Get the item placed at a specific location
 * Returns a tuple-like array [item_name, player_id] matching the Python function signature
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} locationName - Name of the location to check
 * @returns {Array|null} [item_name, player_id] or null if not found
 */
export function location_item_name(snapshot, staticData, locationName) {
    console.log('[CV64 Helper] location_item_name called with location:', locationName);

    // Use the locationItems map which contains the item placement data
    if (staticData?.locationItems) {
        // locationItems is a Map, use Map methods
        if (staticData.locationItems.has(locationName)) {
            const item = staticData.locationItems.get(locationName);
            if (item) {
                const result = [item.name, item.player];
                console.log('[CV64 Helper] Found via locationItems, returning:', result);
                return result;
            }
        } else {
            // Debug: show what's available
            const availableKeys = Array.from(staticData.locationItems.keys());
            console.log('[CV64 Helper] Location not in map. Sample keys:', availableKeys.slice(0, 5));
            const matching = availableKeys.filter(k => k.includes('Storeroom'));
            if (matching.length > 0) {
                console.log('[CV64 Helper] Storeroom-related keys found:', matching);
            }
        }
    } else {
        console.log('[CV64 Helper] No locationItems in staticData');
    }

    console.log('[CV64 Helper] Location not found in locationItems');
    return null;
}

export default {
    location_item_name
};

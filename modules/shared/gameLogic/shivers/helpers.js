/**
 * Shivers Helper Functions
 *
 * These helpers implement game-specific logic for checking Ixupi capture conditions
 * and other Shivers-specific requirements.
 *
 * Note: Helper functions receive (snapshot, staticData, ...args) parameters, where:
 * - snapshot: Current game state with inventory, flags, events
 * - staticData: Static game data with items, regions, locations, settings
 */

/**
 * Helper to check if player has all items in a list
 * @param {Object} snapshot - Game state snapshot
 * @param {string[]} items - Array of item names to check
 * @returns {boolean} True if player has all items
 */
function hasAll(snapshot, items) {
    if (!snapshot || !snapshot.inventory) return false;
    return items.every(item => (snapshot.inventory[item] || 0) > 0);
}

/**
 * Check if Water Ixupi can be captured.
 * Requires either both pot pieces or the complete pot (and their DUPEs).
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Water can be captured
 */
export function water_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Water Pot Bottom", "Water Pot Top", "Water Pot Bottom DUPE", "Water Pot Top DUPE"]) ||
        hasAll(snapshot, ["Water Pot Complete", "Water Pot Complete DUPE"])
    );
}

/**
 * Check if Wax Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Wax can be captured
 */
export function wax_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Wax Pot Bottom", "Wax Pot Top", "Wax Pot Bottom DUPE", "Wax Pot Top DUPE"]) ||
        hasAll(snapshot, ["Wax Pot Complete", "Wax Pot Complete DUPE"])
    );
}

/**
 * Check if Ash Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Ash can be captured
 */
export function ash_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Ash Pot Bottom", "Ash Pot Top", "Ash Pot Bottom DUPE", "Ash Pot Top DUPE"]) ||
        hasAll(snapshot, ["Ash Pot Complete", "Ash Pot Complete DUPE"])
    );
}

/**
 * Check if Oil Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Oil can be captured
 */
export function oil_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Oil Pot Bottom", "Oil Pot Top", "Oil Pot Bottom DUPE", "Oil Pot Top DUPE"]) ||
        hasAll(snapshot, ["Oil Pot Complete", "Oil Pot Complete DUPE"])
    );
}

/**
 * Check if Cloth Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Cloth can be captured
 */
export function cloth_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Cloth Pot Bottom", "Cloth Pot Top", "Cloth Pot Bottom DUPE", "Cloth Pot Top DUPE"]) ||
        hasAll(snapshot, ["Cloth Pot Complete", "Cloth Pot Complete DUPE"])
    );
}

/**
 * Check if Wood Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Wood can be captured
 */
export function wood_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Wood Pot Bottom", "Wood Pot Top", "Wood Pot Bottom DUPE", "Wood Pot Top DUPE"]) ||
        hasAll(snapshot, ["Wood Pot Complete", "Wood Pot Complete DUPE"])
    );
}

/**
 * Check if Crystal Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Crystal can be captured
 */
export function crystal_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Crystal Pot Bottom", "Crystal Pot Top", "Crystal Pot Bottom DUPE", "Crystal Pot Top DUPE"]) ||
        hasAll(snapshot, ["Crystal Pot Complete", "Crystal Pot Complete DUPE"])
    );
}

/**
 * Check if Sand Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Sand can be captured
 */
export function sand_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Sand Pot Bottom", "Sand Pot Top", "Sand Pot Bottom DUPE", "Sand Pot Top DUPE"]) ||
        hasAll(snapshot, ["Sand Pot Complete", "Sand Pot Complete DUPE"])
    );
}

/**
 * Check if Metal Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Metal can be captured
 */
export function metal_capturable(snapshot, staticData) {
    return (
        hasAll(snapshot, ["Metal Pot Bottom", "Metal Pot Top", "Metal Pot Bottom DUPE", "Metal Pot Top DUPE"]) ||
        hasAll(snapshot, ["Metal Pot Complete", "Metal Pot Complete DUPE"])
    );
}

/**
 * Check if Lightning Ixupi can be captured.
 * Note: The world options check for early_lightning is resolved at export time.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Lightning can be captured
 */
export function lightning_capturable(snapshot, staticData) {
    // Note: first_nine_ixupi_capturable check is handled by rule system
    // early_lightning option is resolved at export time to a boolean constant
    return (
        hasAll(snapshot, ["Lightning Pot Bottom", "Lightning Pot Top", "Lightning Pot Bottom DUPE", "Lightning Pot Top DUPE"]) ||
        hasAll(snapshot, ["Lightning Pot Complete", "Lightning Pot Complete DUPE"])
    );
}

/**
 * Check if Beth's Body is available.
 * Note: The world options check for early_beth is resolved at export time.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if Beth's Body is available
 */
export function beths_body_available(snapshot, staticData) {
    // Note: first_nine_ixupi_capturable check is handled by rule system
    // early_beth option is resolved at export time to a boolean constant
    return true; // The actual check is in the rule system
}

/**
 * Check if the first nine Ixupi can be captured.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if all first nine Ixupi are capturable
 */
export function first_nine_ixupi_capturable(snapshot, staticData) {
    return (
        water_capturable(snapshot, staticData) &&
        wax_capturable(snapshot, staticData) &&
        ash_capturable(snapshot, staticData) &&
        oil_capturable(snapshot, staticData) &&
        cloth_capturable(snapshot, staticData) &&
        wood_capturable(snapshot, staticData) &&
        crystal_capturable(snapshot, staticData) &&
        sand_capturable(snapshot, staticData) &&
        metal_capturable(snapshot, staticData)
    );
}

/**
 * Check if all skull dials are set.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if all skull dials are set
 */
export function all_skull_dials_set(snapshot, staticData) {
    return hasAll(snapshot, [
        "Set Skull Dial: Prehistoric",
        "Set Skull Dial: Tar River",
        "Set Skull Dial: Egypt",
        "Set Skull Dial: Burial",
        "Set Skull Dial: Gods Room",
        "Set Skull Dial: Werewolf"
    ]);
}

/**
 * Check the completion condition for Shivers.
 * This is a helper that should be called to check victory condition.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if the game is complete
 */
export function completion_condition(snapshot, staticData) {
    // The actual item name includes a dynamic year count
    // This function may need adjustment based on how the item is named in rules.json
    // For now, we'll check for any item matching the pattern
    // Note: This might need to be handled differently in the rule system
    return true; // Placeholder - actual check depends on item naming
}

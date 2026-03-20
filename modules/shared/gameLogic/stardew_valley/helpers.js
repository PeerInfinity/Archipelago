/**
 * Stardew Valley game-specific helper functions
 */

/**
 * Check if the total count of multiple items meets a required threshold
 * This helper counts items across multiple item names and returns true if the total is >= requiredCount.
 *
 * Corresponds to the Python `TotalReceived` class in stardew_rule/received.py
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} requiredCount - The minimum total count required
 * @param {Array<string>} itemNames - Array of item names to count
 * @returns {boolean} True if the total count of all items >= requiredCount
 */
export function total_received(snapshot, staticData, requiredCount, itemNames) {
    if (!Array.isArray(itemNames)) {
        console.warn('[Stardew Valley helpers] total_received: itemNames is not an array', itemNames);
        return false;
    }

    if (typeof requiredCount !== 'number' || requiredCount < 0) {
        console.warn('[Stardew Valley helpers] total_received: invalid requiredCount', requiredCount);
        return false;
    }

    let totalCount = 0;
    for (const itemName of itemNames) {
        totalCount += snapshot?.inventory?.[itemName] || 0;
    }

    return totalCount >= requiredCount;
}

/**
 * Stardew Valley game-specific helper functions
 */

/**
 * Check if the player has an item
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to check
 * @returns {boolean} True if player has the item
 */
export function has(snapshot, staticData, itemName) {
    return !!(snapshot?.inventory && snapshot.inventory[itemName] > 0);
}

/**
 * Count how many of an item the player has
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} itemName - Name of the item to count
 * @returns {number} Count of the item
 */
export function count(snapshot, staticData, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
}

/**
 * Count how many conditions in a list are true
 * This helper evaluates a list of conditions and returns true if at least 'requiredCount' of them evaluate to true.
 *
 * Corresponds to the Python `Count` class in stardew_rule/base.py
 *
 * @param {Object} snapshot - Game state snapshot (includes evaluateRule method)
 * @param {Object} staticData - Static game data
 * @param {number} requiredCount - The minimum number of conditions that must be true
 * @param {Array} conditions - Array of rule objects to evaluate
 * @returns {boolean} True if at least requiredCount conditions are true
 */
export function count_true(snapshot, staticData, requiredCount, conditions) {
    if (!Array.isArray(conditions)) {
        console.warn('[Stardew Valley helpers] count_true: conditions is not an array', conditions);
        return false;
    }

    if (typeof snapshot.evaluateRule !== 'function') {
        console.error('[Stardew Valley helpers] count_true: snapshot.evaluateRule is not available');
        return false;
    }

    let trueCount = 0;
    const totalConditions = conditions.length;

    for (let i = 0; i < totalConditions; i++) {
        const condition = conditions[i];

        // Evaluate the condition rule
        try {
            const result = snapshot.evaluateRule(condition);
            if (result === true) {
                trueCount++;
            }
        } catch (error) {
            console.error('[Stardew Valley helpers] count_true: error evaluating condition', condition, error);
            // Treat evaluation errors as false
        }

        // Short-circuit if we've already met the required count
        if (trueCount >= requiredCount) {
            return true;
        }

        // Short-circuit if it's impossible to meet the required count
        const remainingConditions = totalConditions - i - 1;
        if (trueCount + remainingConditions < requiredCount) {
            return false;
        }
    }

    return trueCount >= requiredCount;
}

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

/**
 * The Legend of Zelda Helper Functions
 *
 * These helpers implement game-specific logic that can't be expressed
 * purely through the rule system.
 */

/**
 * Convert a value to an integer.
 *
 * In TLOZ, the Python code uses int() to convert division results to integers
 * for calculating heart container requirements with defense rings.
 *
 * For example: int(5 / 4) = 1 (with Red Ring, need only 1 heart instead of 5)
 *
 * @param {Object} snapshot - Game state snapshot (unused but required for helper signature)
 * @param {Object} staticData - Static game data (unused but required for helper signature)
 * @param {number} value - The value to convert to an integer
 * @returns {number} The integer value (using Math.trunc for consistency with Python's int())
 */
export function int(snapshot, staticData, value) {
    // Math.trunc() removes the fractional part, matching Python's int() behavior for positive numbers
    // For negative numbers, Python's int() rounds toward zero, which is also what Math.trunc() does
    return Math.trunc(value);
}

// Export all helpers as default for game logic registry
export default {
    int
};

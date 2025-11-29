/**
 * Overcooked! 2 game-specific helper functions
 *
 * This implements the access logic for Overcooked! 2, including star counting
 * and level completion requirements.
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

/**
 * Check if player has enough total stars (Star + Bonus Star)
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} requiredStars - Number of stars required
 * @returns {boolean} True if player has enough stars
 */
export function has_enough_stars(snapshot, staticData, requiredStars) {
    if (!snapshot || !snapshot.inventory) {
        return false;
    }

    // Count both Star and Bonus Star items
    const starCount = snapshot.inventory['Star'] || 0;
    const bonusStarCount = snapshot.inventory['Bonus Star'] || 0;
    const totalStars = starCount + bonusStarCount;

    return totalStars >= requiredStars;
}

/**
 * Check if player can earn a specific number of stars on a level
 *
 * This implements the has_requirements_for_level_star logic from worlds/overcooked2/Logic.py
 * It checks if the player has the required items to earn a specific star count on a level.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data (includes level_logic in game_info)
 * @param {string} levelShortname - Level shortname (e.g., "Story 1-1", "Chinese 1-3")
 * @param {number} stars - Number of stars to check for (1, 2, or 3)
 * @returns {boolean} True if player can earn the stars
 */
export function has_requirements_for_level_star(snapshot, staticData, levelShortname, stars, context) {
    if (!snapshot || !staticData) {
        return false;
    }

    // Get level logic from game_info
    const playerId = staticData?.playerId || DEFAULT_PLAYER_ID;
    const levelLogic = staticData?.game_info?.[playerId]?.level_logic;
    if (!levelLogic) {
        // No logic defined at all - assume accessible
        return true;
    }

    // First check global "*" requirements for this star count
    // (Python: if not meets_requirements(state, "*", stars, player): return False)
    const globalRequirements = levelLogic["*"];
    if (globalRequirements && Array.isArray(globalRequirements)) {
        if (!checkStarRequirements(snapshot, globalRequirements, stars)) {
            return false;
        }
    }

    // Then check level-specific requirements for all stars up through this one
    // (Python: return all(meets_requirements(state, level.shortname, s, player) for s in range(1, stars + 1)))
    const levelRequirements = levelLogic[levelShortname];
    if (levelRequirements && Array.isArray(levelRequirements)) {
        for (let s = 1; s <= stars; s++) {
            if (!checkStarRequirements(snapshot, levelRequirements, s)) {
                return false;
            }
        }
    }

    // All requirements met
    return true;
}

/**
 * Helper function to check if requirements for a specific star count are met
 * @param {Object} snapshot - Game state snapshot
 * @param {Array} requirements - Array of requirement tuples for each star level
 * @param {number} stars - Star count to check (1, 2, or 3)
 * @returns {boolean} True if requirements are met
 */
function checkStarRequirements(snapshot, requirements, stars) {
    // Get the requirements for this star count (stars is 1, 2, or 3)
    // Array index is stars - 1 (0-indexed)
    const starIndex = stars - 1;
    if (starIndex < 0 || starIndex >= requirements.length) {
        // Invalid star count - assume accessible
        return true;
    }

    const starRequirement = requirements[starIndex];
    if (!Array.isArray(starRequirement) || starRequirement.length < 2) {
        // Invalid structure - assume accessible
        return true;
    }

    // Extract exclusive and additive requirements
    // starRequirement is [exclusive, additive]
    const exclusive = starRequirement[0];
    const additive = starRequirement[1];

    // Check exclusive requirements (must have ALL of these items)
    // exclusive can be:
    // - empty object {} (no requirements)
    // - array of item names
    if (Array.isArray(exclusive) && exclusive.length > 0) {
        // Double-check snapshot.inventory exists (defensive programming)
        if (!snapshot || !snapshot.inventory) {
            return false;
        }
        for (const itemName of exclusive) {
            if (!snapshot.inventory[itemName]) {
                return false;
            }
        }
    }

    // Check additive requirements (sum of weights must be >= 1.0)
    // additive can be:
    // - empty object {} (no requirements)
    // - array of [itemName, weight] pairs
    if (Array.isArray(additive) && additive.length > 0) {
        // Double-check snapshot.inventory exists (defensive programming)
        if (!snapshot || !snapshot.inventory) {
            return false;
        }
        let totalWeight = 0;
        for (const pair of additive) {
            if (Array.isArray(pair) && pair.length >= 2) {
                const itemName = pair[0];
                const weight = pair[1];
                if (snapshot.inventory[itemName]) {
                    totalWeight += weight;
                }
            }
        }

        // Need at least weight of 1.0 to complete (with tolerance for rounding)
        if (totalWeight < 0.99) {
            return false;
        }
    }

    // All requirements met
    return true;
}

/**
 * Check if player meets requirements for a level
 *
 * This is a simpler version that just checks the requirements without star-specific logic.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {Object} level - Level object
 * @param {Object} requirements - Requirements object with exclusive and additive properties
 * @returns {boolean} True if player meets the requirements
 */
export function meets_requirements(snapshot, staticData, level, requirements) {
    if (!snapshot || !requirements) {
        return false;
    }

    // Check exclusive requirements (must have ALL of these items)
    if (requirements.exclusive && requirements.exclusive.length > 0) {
        for (const itemName of requirements.exclusive) {
            if (!snapshot.inventory[itemName]) {
                return false;
            }
        }
    }

    // Check additive requirements (sum of weights must be >= 1.0)
    if (requirements.additive && Object.keys(requirements.additive).length > 0) {
        let totalWeight = 0;
        for (const [itemName, weight] of Object.entries(requirements.additive)) {
            if (snapshot.inventory[itemName]) {
                totalWeight += weight;
            }
        }

        // Need at least weight of 1.0 to complete
        if (totalWeight < 1.0) {
            return false;
        }
    }

    // All requirements met
    return true;
}

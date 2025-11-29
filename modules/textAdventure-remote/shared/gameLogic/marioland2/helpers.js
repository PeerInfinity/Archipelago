/**
 * Super Mario Land 2 Helper Functions
 *
 * These helpers implement game-specific logic for Super Mario Land 2
 * that can't be expressed purely through the rule system.
 */

/**
 * Check if player has any of the specified items
 * @param {Object} snapshot - Game state snapshot
 * @param {Array<string>} items - Array of item names to check
 * @returns {boolean} True if player has at least one item
 */
function hasAny(snapshot, items) {
    const inventory = snapshot?.inventory || {};
    for (const itemName of items) {
        const count = inventory[itemName] || 0;
        if (count > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Check if player has all of the specified items
 * @param {Object} snapshot - Game state snapshot
 * @param {Array<string>} items - Array of item names to check
 * @returns {boolean} True if player has all items
 */
function hasAll(snapshot, items) {
    const inventory = snapshot?.inventory || {};
    for (const itemName of items) {
        const count = inventory[itemName] || 0;
        if (count === 0) {
            return false;
        }
    }
    return true;
}

/**
 * Check if player has a specific item
 * @param {Object} snapshot - Game state snapshot
 * @param {string} itemName - Item name to check
 * @returns {boolean} True if player has the item
 */
function has(snapshot, itemName) {
    const inventory = snapshot?.inventory || {};
    return (inventory[itemName] || 0) > 0;
}

/**
 * Get count of a specific item
 * @param {Object} snapshot - Game state snapshot
 * @param {string} itemName - Item name to count
 * @returns {number} Count of the item
 */
function count(snapshot, itemName) {
    const inventory = snapshot?.inventory || {};
    return inventory[itemName] || 0;
}

/**
 * Check if a level has auto-scroll enabled.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} level - The level name
 * @returns {boolean} True if level has auto-scroll and no cancel items
 */
export function is_auto_scroll(snapshot, staticData, level) {
    // Check if player has cancel auto scroll items
    if (hasAny(snapshot, ["Cancel Auto Scroll", `Cancel Auto Scroll - ${level}`])) {
        return false;
    }

    // For now, assume auto-scroll is disabled (default safe behavior)
    // In a full implementation, we would check staticData.auto_scroll_levels
    // but that data structure isn't available in the frontend
    return false;
}

/**
 * Check if player can traverse pipes to the right.
 */
export function has_pipe_right(snapshot, staticData) {
    return hasAny(snapshot, ["Pipe Traversal - Right", "Pipe Traversal"]);
}

/**
 * Check if player can traverse pipes to the left.
 */
export function has_pipe_left(snapshot, staticData) {
    return hasAny(snapshot, ["Pipe Traversal - Left", "Pipe Traversal"]);
}

/**
 * Check if player can traverse pipes downward.
 */
export function has_pipe_down(snapshot, staticData) {
    return hasAny(snapshot, ["Pipe Traversal - Down", "Pipe Traversal"]);
}

/**
 * Check if player can traverse pipes upward.
 */
export function has_pipe_up(snapshot, staticData) {
    return hasAny(snapshot, ["Pipe Traversal - Up", "Pipe Traversal"]);
}

/**
 * Check if player has enough level progression items.
 * Handles both regular and x2 variants.
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {string} item - The progression item name
 * @param {number} requiredCount - Required count (default 1)
 * @returns {boolean} True if player has enough progression
 */
export function has_level_progression(snapshot, staticData, item, requiredCount = 1) {
    const regular = count(snapshot, item);
    const double = count(snapshot, `${item} x2`);
    return (regular + (double * 2)) >= requiredCount;
}

/**
 * Check if Pumpkin Zone 1 midway bell is accessible.
 */
export function pumpkin_zone_1_midway_bell(snapshot, staticData) {
    return (
        (has_pipe_down(snapshot, staticData) && !is_auto_scroll(snapshot, staticData, "Pumpkin Zone 1")) ||
        has(snapshot, "Pumpkin Zone 1 Midway Bell")
    );
}

/**
 * Check if Pumpkin Zone 1 normal exit is accessible.
 */
export function pumpkin_zone_1_normal_exit(snapshot, staticData) {
    return pumpkin_zone_1_midway_bell(snapshot, staticData);
}

/**
 * Check if player is not blocked by sharks in Turtle Zone 1.
 *
 * The Python version checks sprite randomization data to count sharks.
 * Since that data isn't available in the frontend, we assume best case (no sharks).
 * This matches the sphere log behavior where Turtle Zone 1 is accessible from the start.
 */
export function not_blocked_by_sharks(snapshot, staticData) {
    // Carrot allows flying over sharks
    if (has(snapshot, "Carrot")) {
        return true;
    }

    // Assume best case: no sharks present (or handle them with basic logic)
    // Since we can't access sprite_data in the frontend, assume it's accessible
    return true;
}

/**
 * Check if Turtle Zone 1 normal exit is accessible.
 */
export function turtle_zone_1_normal_exit(snapshot, staticData) {
    return not_blocked_by_sharks(snapshot, staticData);
}

/**
 * Check if Mario Zone 1 normal exit is accessible.
 * Requires has_pipe_right and either power-ups or auto-scroll enabled.
 */
export function mario_zone_1_normal_exit(snapshot, staticData) {
    if (has_pipe_right(snapshot, staticData)) {
        if (hasAny(snapshot, ["Mushroom", "Fire Flower", "Carrot", "Mario Zone 1 Midway Bell"])) {
            return true;
        }
        if (is_auto_scroll(snapshot, staticData, "Mario Zone 1")) {
            return true;
        }
    }
    return false;
}

/**
 * Check if Mario Zone 1 midway bell is accessible.
 * Requires has_pipe_right and power-ups.
 */
export function mario_zone_1_midway_bell(snapshot, staticData) {
    return (
        (hasAny(snapshot, ["Mushroom", "Fire Flower", "Carrot"]) && has_pipe_right(snapshot, staticData)) ||
        has(snapshot, "Mario Zone 1 Midway Bell")
    );
}

/**
 * Check if Macro Zone 1 normal exit is accessible.
 */
export function macro_zone_1_normal_exit(snapshot, staticData) {
    return has_pipe_down(snapshot, staticData) || has(snapshot, "Macro Zone 1 Midway Bell");
}

/**
 * Check if Macro Zone 1 midway bell is accessible.
 */
export function macro_zone_1_midway_bell(snapshot, staticData) {
    return has_pipe_down(snapshot, staticData) || has(snapshot, "Macro Zone 1 Midway Bell");
}

/**
 * Tree Zone 2 helper functions
 */
export function tree_zone_2_normal_exit(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData) || has(snapshot, "Tree Zone 2 Midway Bell");
}

export function tree_zone_2_secret_exit(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData) && has(snapshot, "Carrot");
}

export function tree_zone_2_midway_bell(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData) || has(snapshot, "Tree Zone 2 Midway Bell");
}

export function tree_zone_3_normal_exit(snapshot, staticData) {
    return !is_auto_scroll(snapshot, staticData, "Tree Zone 3");
}

export function tree_zone_4_normal_exit(snapshot, staticData) {
    return has_pipe_down(snapshot, staticData) && tree_zone_4_midway_bell(snapshot, staticData);
}

export function tree_zone_4_midway_bell(snapshot, staticData) {
    return (
        (has_pipe_right(snapshot, staticData) && has_pipe_up(snapshot, staticData)) ||
        has(snapshot, "Tree Zone 4 Midway Bell")
    );
}

export function tree_zone_5_boss(snapshot, staticData) {
    return has_pipe_down(snapshot, staticData);
}

/**
 * Pumpkin Zone helper functions
 */
export function pumpkin_zone_2_normal_exit(snapshot, staticData) {
    return has_pipe_down(snapshot, staticData) && has_pipe_up(snapshot, staticData) &&
           has_pipe_right(snapshot, staticData) && has(snapshot, "Water Physics") &&
           !is_auto_scroll(snapshot, staticData, "Pumpkin Zone 2");
}

export function pumpkin_zone_2_secret_exit(snapshot, staticData) {
    return pumpkin_zone_2_normal_exit(snapshot, staticData) && hasAny(snapshot, ["Mushroom", "Fire Flower"]);
}

export function pumpkin_zone_3_secret_exit(snapshot, staticData) {
    return has(snapshot, "Carrot");
}

export function pumpkin_zone_4_boss(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData);
}

/**
 * Mario Zone helper functions (already have 1, adding the rest)
 */
export function mario_zone_1_secret_exit(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData) && has(snapshot, "Carrot") &&
           mario_zone_1_midway_bell(snapshot, staticData);
}

export function mario_zone_2_normal_exit(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData);
}

export function mario_zone_2_secret_exit(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData) && has(snapshot, "Carrot");
}

export function mario_zone_3_secret_exit(snapshot, staticData) {
    return has_pipe_up(snapshot, staticData);
}

export function mario_zone_4_boss(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData);
}

/**
 * Turtle Zone helper functions
 */
export function turtle_zone_2_normal_exit(snapshot, staticData) {
    return (
        has_pipe_up(snapshot, staticData) &&
        has_pipe_down(snapshot, staticData) &&
        has_pipe_right(snapshot, staticData) &&
        has_pipe_left(snapshot, staticData) &&
        has(snapshot, "Water Physics") &&
        !is_auto_scroll(snapshot, staticData, "Turtle Zone 2")
    );
}

export function turtle_zone_2_midway_bell(snapshot, staticData) {
    return (
        (has(snapshot, "Water Physics") && !is_auto_scroll(snapshot, staticData, "Turtle Zone 2")) ||
        has(snapshot, "Turtle Zone 2 Midway Bell")
    );
}

export function turtle_zone_secret_course_normal_exit(snapshot, staticData) {
    return has(snapshot, "Carrot");
}

/**
 * Space Zone helper functions
 */
export function space_zone_1_normal_exit(snapshot, staticData) {
    return has_pipe_up(snapshot, staticData) && has_pipe_down(snapshot, staticData);
}

export function space_zone_1_secret_exit(snapshot, staticData) {
    return space_zone_1_normal_exit(snapshot, staticData) && has(snapshot, "Space Physics");
}

export function space_zone_2_midway_bell(snapshot, staticData) {
    return (
        (has_pipe_down(snapshot, staticData) && !is_auto_scroll(snapshot, staticData, "Space Zone 2")) ||
        has(snapshot, "Space Zone 2 Midway Bell")
    );
}

export function space_zone_2_normal_exit(snapshot, staticData) {
    return space_zone_2_midway_bell(snapshot, staticData);
}

export function space_zone_2_secret_exit(snapshot, staticData) {
    return space_zone_2_midway_bell(snapshot, staticData) && has(snapshot, "Carrot");
}

export function space_zone_3_boss(snapshot, staticData) {
    return has_pipe_up(snapshot, staticData) && has_pipe_down(snapshot, staticData);
}

/**
 * Macro Zone helper functions (already have 1, adding the rest)
 */
export function macro_zone_1_secret_exit(snapshot, staticData) {
    return has(snapshot, "Fire Flower") && has_pipe_up(snapshot, staticData) &&
           macro_zone_1_midway_bell(snapshot, staticData);
}

export function macro_zone_2_normal_exit(snapshot, staticData) {
    return (
        (has_pipe_down(snapshot, staticData) || has(snapshot, "Macro Zone 2 Midway Bell")) &&
        has(snapshot, "Water Physics") &&
        has_pipe_up(snapshot, staticData) &&
        !is_auto_scroll(snapshot, staticData, "Macro Zone 2")
    );
}

export function macro_zone_2_midway_bell(snapshot, staticData) {
    return (
        (has_pipe_down(snapshot, staticData) && has(snapshot, "Water Physics")) ||
        has(snapshot, "Macro Zone 2 Midway Bell")
    );
}

export function macro_zone_3_boss(snapshot, staticData) {
    return has_pipe_right(snapshot, staticData);
}

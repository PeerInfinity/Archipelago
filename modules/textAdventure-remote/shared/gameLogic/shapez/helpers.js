/**
 * shapez helper functions
 *
 * These functions mirror the logic from worlds/shapez/regions.py
 * Helpers receive (snapshot, staticData, ...args) parameters
 */

/**
 * Helper to check if player has an item
 */
function has(snapshot, itemName) {
    const inventory = snapshot?.inventory || {};
    return (inventory[itemName] || 0) > 0;
}

/**
 * Helper to check if player has any of the listed items
 */
function has_any(snapshot, items) {
    const inventory = snapshot?.inventory || {};
    for (const item of items) {
        if ((inventory[item] || 0) > 0) {
            return true;
        }
    }
    return false;
}

/**
 * Helper to check if player has all of the listed items
 */
function has_all(snapshot, items) {
    const inventory = snapshot?.inventory || {};
    for (const item of items) {
        if ((inventory[item] || 0) <= 0) {
            return false;
        }
    }
    return true;
}

/**
 * Helper to count how many of an item the player has
 */
function count(snapshot, itemName) {
    const inventory = snapshot?.inventory || {};
    return inventory[itemName] || 0;
}

/**
 * Check if player can cut shapes in half
 */
export function can_cut_half(snapshot, staticData) {
    return has(snapshot, "Cutter");
}

/**
 * Check if player can rotate shapes 90 degrees
 */
export function can_rotate_90(snapshot, staticData) {
    return has_any(snapshot, ["Rotator", "Rotator (CCW)"]);
}

/**
 * Check if player can rotate shapes 180 degrees
 */
export function can_rotate_180(snapshot, staticData) {
    return has_any(snapshot, ["Rotator", "Rotator (CCW)", "Rotator (180°)"]);
}

/**
 * Check if player can stack shapes
 */
export function can_stack(snapshot, staticData) {
    return has(snapshot, "Stacker");
}

/**
 * Check if player can paint shapes
 */
export function can_paint(snapshot, staticData) {
    return has_any(snapshot, ["Painter", "Double Painter"]) || can_use_quad_painter(snapshot, staticData);
}

/**
 * Check if player can mix colors
 */
export function can_mix_colors(snapshot, staticData) {
    return has(snapshot, "Color Mixer");
}

/**
 * Check if player has a tunnel
 */
export function has_tunnel(snapshot, staticData) {
    return has_any(snapshot, ["Tunnel", "Tunnel Tier II"]);
}

/**
 * Check if player has a balancer
 */
export function has_balancer(snapshot, staticData) {
    return has(snapshot, "Balancer") || has_all(snapshot, ["Compact Merger", "Compact Splitter"]);
}

/**
 * Check if player can use quad painter
 * Requires: Quad Painter + Wires + (Switch OR Constant Signal)
 */
export function can_use_quad_painter(snapshot, staticData) {
    return has_all(snapshot, ["Quad Painter", "Wires"]) &&
           has_any(snapshot, ["Switch", "Constant Signal"]);
}

/**
 * Check if player can make stitched shapes
 * @param {Object} snapshot - The game state snapshot
 * @param {Object} staticData - Static game data
 * @param {boolean} floating - Whether floating layers are allowed
 */
export function can_make_stitched_shape(snapshot, staticData, floating = false) {
    if (!can_stack(snapshot, staticData)) {
        return false;
    }

    // If not floating, can use quad cutter
    if (!floating && has(snapshot, "Quad Cutter")) {
        return true;
    }

    // Otherwise need half cutter and rotation
    return can_cut_half(snapshot, staticData) && can_rotate_90(snapshot, staticData);
}

/**
 * Check if player can build Make Anything Machine (MAM)
 * @param {Object} snapshot - The game state snapshot
 * @param {Object} staticData - Static game data
 * @param {boolean} floating - Whether floating layers are allowed
 */
export function can_build_mam(snapshot, staticData, floating = false) {
    return can_make_stitched_shape(snapshot, staticData, floating) &&
           can_paint(snapshot, staticData) &&
           can_mix_colors(snapshot, staticData) &&
           has_balancer(snapshot, staticData) &&
           has_tunnel(snapshot, staticData) &&
           has_all(snapshot, ["Belt Reader", "Storage", "Item Filter",
                          "Wires", "Logic Gates", "Virtual Processing"]);
}

/**
 * Check if player can make east windmill shapes
 * Only used for shapesanity (single layers)
 */
export function can_make_east_windmill(snapshot, staticData) {
    if (!can_stack(snapshot, staticData)) {
        return false;
    }

    return has(snapshot, "Quad Cutter") ||
           (can_cut_half(snapshot, staticData) && can_rotate_180(snapshot, staticData));
}

/**
 * Check if player can make half-half shapes
 * Only used for shapesanity (single layers)
 */
export function can_make_half_half_shape(snapshot, staticData) {
    return can_stack(snapshot, staticData) && has_any(snapshot, ["Cutter", "Quad Cutter"]);
}

/**
 * Check if player can make half shapes
 * Only used for shapesanity (single layers)
 */
export function can_make_half_shape(snapshot, staticData) {
    return can_cut_half(snapshot, staticData) || has_all(snapshot, ["Quad Cutter", "Stacker"]);
}

/**
 * Check if player has required belt speed multiplier
 * @param {Object} snapshot - The game state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} needed - The required multiplier
 */
export function has_x_belt_multiplier(snapshot, staticData, needed) {
    let multiplier = 1.0;

    // Rising upgrades do the least improvement if received before other upgrades
    const risingCount = count(snapshot, "Rising Belt Upgrade");
    for (let i = 0; i < risingCount; i++) {
        multiplier *= 2;
    }

    multiplier += count(snapshot, "Gigantic Belt Upgrade") * 10;
    multiplier += count(snapshot, "Big Belt Upgrade");
    multiplier += count(snapshot, "Small Belt Upgrade") * 0.1;

    return multiplier >= needed;
}

/**
 * Check if player has specific building for logic progression
 * @param {Object} snapshot - The game state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array} buildings - List of buildings in order
 * @param {number} index - Index of building to check
 * @param {boolean} includeuseful - Whether to include useful items in logic
 */
export function has_logic_list_building(snapshot, staticData, buildings, index, includeuseful) {
    // Includes balancer, tunnel, and trash in logic to make them appear in earlier spheres
    if (includeuseful && !(has(snapshot, "Trash") && has_balancer(snapshot, staticData) && has_tunnel(snapshot, staticData))) {
        return false;
    }

    const building = buildings[index];

    if (building === "Cutter") {
        const stackerIndex = buildings.indexOf("Stacker");
        if (stackerIndex >= 0 && stackerIndex < index) {
            return has_any(snapshot, ["Cutter", "Quad Cutter"]);
        } else {
            return can_cut_half(snapshot, staticData);
        }
    } else if (building === "Rotator") {
        return can_rotate_90(snapshot, staticData);
    } else if (building === "Stacker") {
        return can_stack(snapshot, staticData);
    } else if (building === "Painter") {
        return can_paint(snapshot, staticData);
    } else if (building === "Color Mixer") {
        return can_mix_colors(snapshot, staticData);
    }

    return false;
}

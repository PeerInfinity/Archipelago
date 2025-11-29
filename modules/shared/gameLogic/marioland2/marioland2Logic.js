/**
 * Super Mario Land 2 Game Logic Module
 *
 * Provides game-specific logic for Super Mario Land 2 including helper functions
 * for pipe traversal, auto-scroll detection, and zone-specific rules.
 */

import {
    is_auto_scroll,
    has_pipe_right,
    has_pipe_left,
    has_pipe_down,
    has_pipe_up,
    has_level_progression,
    pumpkin_zone_1_midway_bell,
    pumpkin_zone_1_normal_exit,
    pumpkin_zone_2_normal_exit,
    pumpkin_zone_2_secret_exit,
    pumpkin_zone_3_secret_exit,
    pumpkin_zone_4_boss,
    not_blocked_by_sharks,
    turtle_zone_1_normal_exit,
    turtle_zone_2_normal_exit,
    turtle_zone_2_midway_bell,
    turtle_zone_secret_course_normal_exit,
    mario_zone_1_normal_exit,
    mario_zone_1_midway_bell,
    mario_zone_1_secret_exit,
    mario_zone_2_normal_exit,
    mario_zone_2_secret_exit,
    mario_zone_3_secret_exit,
    mario_zone_4_boss,
    macro_zone_1_normal_exit,
    macro_zone_1_midway_bell,
    macro_zone_1_secret_exit,
    macro_zone_2_normal_exit,
    macro_zone_2_midway_bell,
    macro_zone_3_boss,
    tree_zone_2_normal_exit,
    tree_zone_2_secret_exit,
    tree_zone_2_midway_bell,
    tree_zone_3_normal_exit,
    tree_zone_4_normal_exit,
    tree_zone_4_midway_bell,
    tree_zone_5_boss,
    space_zone_1_normal_exit,
    space_zone_1_secret_exit,
    space_zone_2_midway_bell,
    space_zone_2_normal_exit,
    space_zone_2_secret_exit,
    space_zone_3_boss
} from './helpers.js';

/**
 * Super Mario Land 2 Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    is_auto_scroll,
    has_pipe_right,
    has_pipe_left,
    has_pipe_down,
    has_pipe_up,
    has_level_progression,
    pumpkin_zone_1_midway_bell,
    pumpkin_zone_1_normal_exit,
    pumpkin_zone_2_normal_exit,
    pumpkin_zone_2_secret_exit,
    pumpkin_zone_3_secret_exit,
    pumpkin_zone_4_boss,
    not_blocked_by_sharks,
    turtle_zone_1_normal_exit,
    turtle_zone_2_normal_exit,
    turtle_zone_2_midway_bell,
    turtle_zone_secret_course_normal_exit,
    mario_zone_1_normal_exit,
    mario_zone_1_midway_bell,
    mario_zone_1_secret_exit,
    mario_zone_2_normal_exit,
    mario_zone_2_secret_exit,
    mario_zone_3_secret_exit,
    mario_zone_4_boss,
    macro_zone_1_normal_exit,
    macro_zone_1_midway_bell,
    macro_zone_1_secret_exit,
    macro_zone_2_normal_exit,
    macro_zone_2_midway_bell,
    macro_zone_3_boss,
    tree_zone_2_normal_exit,
    tree_zone_2_secret_exit,
    tree_zone_2_midway_bell,
    tree_zone_3_normal_exit,
    tree_zone_4_normal_exit,
    tree_zone_4_midway_bell,
    tree_zone_5_boss,
    space_zone_1_normal_exit,
    space_zone_1_secret_exit,
    space_zone_2_midway_bell,
    space_zone_2_normal_exit,
    space_zone_2_secret_exit,
    space_zone_3_boss
};

/**
 * State methods for Super Mario Land 2.
 * These handle special state checks like counting unique items from a list.
 */
export const stateMethods = {
    has_from_list_unique(snapshot, staticData, items, count) {
        let found = 0;
        for (const itemName of items) {
            if (snapshot?.inventory?.[itemName] > 0) {
                found++;
                if (found >= count) {
                    return true;
                }
            }
        }
        return false;
    }
};

/**
 * Initialize Super Mario Land 2 game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Super Mario Land 2-specific logic handlers
 */
export function initializeGameLogic(context) {
    return {
        helpers: helperFunctions,
        stateMethods: stateMethods
    };
}

// Export for game logic registry
export default {
    initializeGameLogic,
    helperFunctions,
    stateMethods
};

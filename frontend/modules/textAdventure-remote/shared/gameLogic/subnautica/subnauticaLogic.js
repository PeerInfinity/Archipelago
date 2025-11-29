/**
 * Subnautica Game Logic Module
 *
 * Provides game-specific logic for Subnautica including helper functions
 * and custom state handling.
 */

import * as helpers from './helpers.js';

/**
 * Subnautica Helper Functions
 * These can be called from rules using the helper type.
 */
export const helperFunctions = {
    // Vehicle and equipment helpers
    has_seaglide: helpers.has_seaglide,
    has_modification_station: helpers.has_modification_station,
    has_mobile_vehicle_bay: helpers.has_mobile_vehicle_bay,
    has_moonpool: helpers.has_moonpool,
    has_vehicle_upgrade_console: helpers.has_vehicle_upgrade_console,

    // Seamoth helpers
    has_seamoth: helpers.has_seamoth,
    has_seamoth_depth_module_mk1: helpers.has_seamoth_depth_module_mk1,
    has_seamoth_depth_module_mk2: helpers.has_seamoth_depth_module_mk2,
    has_seamoth_depth_module_mk3: helpers.has_seamoth_depth_module_mk3,

    // Cyclops helpers
    has_cyclops_bridge: helpers.has_cyclops_bridge,
    has_cyclops_engine: helpers.has_cyclops_engine,
    has_cyclops_hull: helpers.has_cyclops_hull,
    has_cyclops: helpers.has_cyclops,
    has_cyclops_depth_module_mk1: helpers.has_cyclops_depth_module_mk1,
    has_cyclops_depth_module_mk2: helpers.has_cyclops_depth_module_mk2,
    has_cyclops_depth_module_mk3: helpers.has_cyclops_depth_module_mk3,

    // Prawn suit helpers
    has_prawn: helpers.has_prawn,
    has_prawn_propulsion_arm: helpers.has_prawn_propulsion_arm,
    has_prawn_depth_module_mk1: helpers.has_prawn_depth_module_mk1,
    has_prawn_depth_module_mk2: helpers.has_prawn_depth_module_mk2,

    // Tools and equipment
    has_laser_cutter: helpers.has_laser_cutter,
    has_stasis_rifle: helpers.has_stasis_rifle,
    has_containment: helpers.has_containment,
    has_utility_room: helpers.has_utility_room,
    has_propulsion_cannon: helpers.has_propulsion_cannon,
    has_cyclops_shield: helpers.has_cyclops_shield,

    // Special tanks and fins
    has_ultra_high_capacity_tank: helpers.has_ultra_high_capacity_tank,
    has_lightweight_high_capacity_tank: helpers.has_lightweight_high_capacity_tank,
    has_ultra_glide_fins: helpers.has_ultra_glide_fins,

    // Depth calculation helpers
    get_max_swim_depth: helpers.get_max_swim_depth,
    get_seamoth_max_depth: helpers.get_seamoth_max_depth,
    get_cyclops_max_depth: helpers.get_cyclops_max_depth,
    get_prawn_max_depth: helpers.get_prawn_max_depth,
    get_max_depth: helpers.get_max_depth,

    // Location and creature helpers
    is_radiated: helpers.is_radiated,
    can_access_location: helpers.can_access_location,
    can_scan_creature: helpers.can_scan_creature,
    can_reach_location: helpers.can_reach_location,
};

/**
 * Initialize Subnautica game logic.
 *
 * @param {Object} context - The game logic context
 * @returns {Object} Subnautica-specific logic handlers
 */
export function initializeGameLogic(context) {
    return {
        helpers: helperFunctions,
    };
}

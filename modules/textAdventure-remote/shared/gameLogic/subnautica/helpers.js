/**
 * Subnautica Helper Functions
 *
 * Translated from worlds/subnautica/rules.py
 *
 * Helper function signature: (snapshot, staticData, ...args)
 * - snapshot: Contains inventory, flags, events, regionReachability
 * - staticData: Contains items, regions, locations, settings
 */

// Utility function to check if player has an item
function has(snapshot, itemName, count = 1) {
    return (snapshot?.inventory?.[itemName] || 0) >= count;
}

// Vehicle and equipment helpers

export function has_seaglide(snapshot, staticData) {
    return has(snapshot, "Seaglide Fragment", 2);
}

export function has_modification_station(snapshot, staticData) {
    return has(snapshot, "Modification Station Fragment", 3);
}

export function has_mobile_vehicle_bay(snapshot, staticData) {
    return has(snapshot, "Mobile Vehicle Bay Fragment", 3);
}

export function has_moonpool(snapshot, staticData) {
    return has(snapshot, "Moonpool Fragment", 2);
}

export function has_vehicle_upgrade_console(snapshot, staticData) {
    return has(snapshot, "Vehicle Upgrade Console") &&
           has_moonpool(snapshot, staticData);
}

// Seamoth helpers

export function has_seamoth(snapshot, staticData) {
    return has(snapshot, "Seamoth Fragment", 3) &&
           has_mobile_vehicle_bay(snapshot, staticData);
}

export function has_seamoth_depth_module_mk1(snapshot, staticData) {
    return has_vehicle_upgrade_console(snapshot, staticData);
}

export function has_seamoth_depth_module_mk2(snapshot, staticData) {
    return has_seamoth_depth_module_mk1(snapshot, staticData) &&
           has_modification_station(snapshot, staticData);
}

export function has_seamoth_depth_module_mk3(snapshot, staticData) {
    return has_seamoth_depth_module_mk2(snapshot, staticData) &&
           has_modification_station(snapshot, staticData);
}

// Cyclops helpers

export function has_cyclops_bridge(snapshot, staticData) {
    return has(snapshot, "Cyclops Bridge Fragment", 3);
}

export function has_cyclops_engine(snapshot, staticData) {
    return has(snapshot, "Cyclops Engine Fragment", 3);
}

export function has_cyclops_hull(snapshot, staticData) {
    return has(snapshot, "Cyclops Hull Fragment", 3);
}

export function has_cyclops(snapshot, staticData) {
    return has_cyclops_bridge(snapshot, staticData) &&
           has_cyclops_engine(snapshot, staticData) &&
           has_cyclops_hull(snapshot, staticData) &&
           has_mobile_vehicle_bay(snapshot, staticData);
}

export function has_cyclops_depth_module_mk1(snapshot, staticData) {
    // Crafted in the Cyclops, so we don't need to check for crafting station
    return has(snapshot, "Cyclops Depth Module MK1");
}

export function has_cyclops_depth_module_mk2(snapshot, staticData) {
    return has_cyclops_depth_module_mk1(snapshot, staticData) &&
           has_modification_station(snapshot, staticData);
}

export function has_cyclops_depth_module_mk3(snapshot, staticData) {
    return has_cyclops_depth_module_mk2(snapshot, staticData) &&
           has_modification_station(snapshot, staticData);
}

// Prawn suit helpers

export function has_prawn(snapshot, staticData) {
    return has(snapshot, "Prawn Suit Fragment", 4) &&
           has_mobile_vehicle_bay(snapshot, staticData);
}

export function has_prawn_propulsion_arm(snapshot, staticData) {
    return has(snapshot, "Prawn Suit Propulsion Cannon Fragment", 2) &&
           has_vehicle_upgrade_console(snapshot, staticData);
}

export function has_prawn_depth_module_mk1(snapshot, staticData) {
    return has_vehicle_upgrade_console(snapshot, staticData);
}

export function has_prawn_depth_module_mk2(snapshot, staticData) {
    return has_prawn_depth_module_mk1(snapshot, staticData) &&
           has_modification_station(snapshot, staticData);
}

// Tools and equipment

export function has_laser_cutter(snapshot, staticData) {
    return has(snapshot, "Laser Cutter Fragment", 3);
}

export function has_stasis_rifle(snapshot, staticData) {
    return has(snapshot, "Stasis Rifle Fragment", 2);
}

export function has_containment(snapshot, staticData) {
    return has(snapshot, "Alien Containment") && has_utility_room(snapshot, staticData);
}

export function has_utility_room(snapshot, staticData) {
    return has(snapshot, "Large Room") || has(snapshot, "Multipurpose Room");
}

export function has_propulsion_cannon(snapshot, staticData) {
    return has(snapshot, "Propulsion Cannon Fragment", 2);
}

export function has_cyclops_shield(snapshot, staticData) {
    return has_cyclops(snapshot, staticData) &&
           has(snapshot, "Cyclops Shield Generator");
}

// Special tanks and fins

export function has_ultra_high_capacity_tank(snapshot, staticData) {
    return has_modification_station(snapshot, staticData) && has(snapshot, "Ultra High Capacity Tank");
}

export function has_lightweight_high_capacity_tank(snapshot, staticData) {
    return has_modification_station(snapshot, staticData) && has(snapshot, "Lightweight High Capacity Tank");
}

export function has_ultra_glide_fins(snapshot, staticData) {
    return has_modification_station(snapshot, staticData) && has(snapshot, "Ultra Glide Fins");
}

// Depth calculation helpers

export function get_max_swim_depth(snapshot, staticData) {
    // Get swim_rule option from settings
    // Player ID is typically "1" for single player
    // Default is option_easy (0): base_depth=200, consider_items=false
    const settings = staticData?.settings?.["1"];
    const swimRule = settings?.swim_rule || { base_depth: 200, consider_items: false };

    let depth = swimRule.base_depth;

    if (swimRule.consider_items) {
        if (has_seaglide(snapshot, staticData)) {
            if (has_ultra_high_capacity_tank(snapshot, staticData)) {
                depth += 350;  // It's about 800m. Give some room
            } else {
                depth += 200;  // It's about 650m. Give some room
            }
        }
        // seaglide and fins cannot be used together
        else if (has_ultra_glide_fins(snapshot, staticData)) {
            if (has_ultra_high_capacity_tank(snapshot, staticData)) {
                depth += 150;
            } else if (has_lightweight_high_capacity_tank(snapshot, staticData)) {
                depth += 75;
            } else {
                depth += 50;
            }
        } else if (has_ultra_high_capacity_tank(snapshot, staticData)) {
            depth += 100;
        } else if (has_lightweight_high_capacity_tank(snapshot, staticData)) {
            depth += 25;
        }
    }

    return depth;
}

export function get_seamoth_max_depth(snapshot, staticData) {
    if (has_seamoth(snapshot, staticData)) {
        if (has_seamoth_depth_module_mk3(snapshot, staticData)) {
            return 900;
        } else if (has_seamoth_depth_module_mk2(snapshot, staticData)) {
            return 500;
        } else if (has_seamoth_depth_module_mk1(snapshot, staticData)) {
            return 300;
        } else {
            return 200;
        }
    } else {
        return 0;
    }
}

export function get_cyclops_max_depth(snapshot, staticData) {
    if (has_cyclops(snapshot, staticData)) {
        if (has_cyclops_depth_module_mk3(snapshot, staticData)) {
            return 1700;
        } else if (has_cyclops_depth_module_mk2(snapshot, staticData)) {
            return 1300;
        } else if (has_cyclops_depth_module_mk1(snapshot, staticData)) {
            return 900;
        } else {
            return 500;
        }
    } else {
        return 0;
    }
}

export function get_prawn_max_depth(snapshot, staticData) {
    if (has_prawn(snapshot, staticData)) {
        if (has_prawn_depth_module_mk2(snapshot, staticData)) {
            return 1700;
        } else if (has_prawn_depth_module_mk1(snapshot, staticData)) {
            return 1300;
        } else {
            return 900;
        }
    } else {
        return 0;
    }
}

export function get_max_depth(snapshot, staticData) {
    return get_max_swim_depth(snapshot, staticData) + Math.max(
        get_seamoth_max_depth(snapshot, staticData),
        get_cyclops_max_depth(snapshot, staticData),
        get_prawn_max_depth(snapshot, staticData)
    );
}

// Location access helpers

export function is_radiated(snapshot, staticData, x, y, z) {
    const aurora_dist = Math.sqrt(Math.pow(x - 1038.0, 2) + Math.pow(y, 2) + Math.pow(z - (-163.1), 2));
    return aurora_dist < 950;
}

export function can_access_location(snapshot, staticData, loc) {
    // loc is a LocationDict passed as the first argument after snapshot and staticData
    const need_laser_cutter = loc.need_laser_cutter || false;
    if (need_laser_cutter && !has_laser_cutter(snapshot, staticData)) {
        return false;
    }

    const need_propulsion_cannon = loc.need_propulsion_cannon || false;
    if (need_propulsion_cannon && !has_propulsion_cannon(snapshot, staticData)) {
        return false;
    }

    const pos = loc.position;
    const pos_x = pos.x;
    const pos_y = pos.y;
    const pos_z = pos.z;

    const need_radiation_suit = is_radiated(snapshot, staticData, pos_x, pos_y, pos_z);
    if (need_radiation_suit && !has(snapshot, "Radiation Suit")) {
        return false;
    }

    // Seaglide doesn't unlock anything specific, but just allows for faster movement.
    // Otherwise the game is painfully slow.
    const map_center_dist = Math.sqrt(Math.pow(pos_x, 2) + Math.pow(pos_z, 2));
    if ((map_center_dist > 800 || pos_y < -200) && !has_seaglide(snapshot, staticData)) {
        return false;
    }

    const depth = -pos_y;  // y-up
    return get_max_depth(snapshot, staticData) >= depth;
}

export function can_scan_creature(snapshot, staticData, creature) {
    // creature is a string passed as the first argument after snapshot and staticData
    if (!has_seaglide(snapshot, staticData)) {
        return false;
    }

    // Get creature depth from settings or assume default
    // In the Python code, this references all_creatures[creature]
    // For now, we'll need to handle this based on the creature name
    // This may need to be enhanced with actual creature data
    const creatureDepth = getCreatureDepth(creature);
    return get_max_depth(snapshot, staticData) >= creatureDepth;
}

// Helper to check if a location is reachable
// Used for location dependencies like "Repair Aurora Drive" depending on "Aurora Drive Room - Upgrade Console"
export function can_reach_location(snapshot, staticData, locationName) {
    // A location is reachable if it appears in the accessible locations list
    // This is set by the reachability engine when evaluating location access rules
    // For now, we check if it's in the snapshot's accessible locations
    // Note: This may need to be enhanced to actually evaluate the location's access rule
    // But typically this helper is called after reachability has been computed

    // Check if location is in accessible locations (already computed by reachability engine)
    if (snapshot?.reachableLocations) {
        return snapshot.reachableLocations.has(locationName) || snapshot.reachableLocations.includes(locationName);
    }

    // Fallback: try to find and evaluate the location's access rule
    // This requires accessing the locations data from staticData
    const locations = staticData?.locations;
    if (!locations) {
        return false;
    }

    // Find the location
    let location = null;
    if (Array.isArray(locations)) {
        location = locations.find(loc => loc?.name === locationName);
    } else if (typeof locations === 'object') {
        location = locations[locationName];
    }

    if (!location) {
        return false;
    }

    // If location has access_rule, evaluate it
    // But we can't evaluate it here without recursion
    // So we return false if it's not in reachableLocations
    return false;
}

// Helper function to get creature depths
// This would ideally be loaded from game data
function getCreatureDepth(creature) {
    // Default depths for creatures - these should match the Python world data
    // For now returning a conservative default
    return 200;
}

/**
 * Bomb Rush Cyberfunk helper functions
 * Translated from worlds/bomb_rush_cyberfunk/Rules.py
 *
 * Note: This is a simplified implementation for initial testing.
 * The actual graffiti counting logic may be more complex and will need
 * refinement based on how items are represented in the game data.
 */

import { DEFAULT_PLAYER_ID } from '../../playerIdUtils.js';

// Basic helper function to count items
function getItemCount(snapshot, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
}

// Basic helper function to check if player has any of an item
function hasItem(snapshot, itemName, count = 1) {
    return getItemCount(snapshot, itemName) >= count;
}

// Basic helper function to check if an event has occurred
function hasEvent(snapshot, eventName) {
    return snapshot?.events?.includes(eventName) || snapshot?.flags?.includes(eventName);
}

// Helper function to check if player has any item from a group
function hasGroup(snapshot, groupName, staticData) {
    if (!snapshot?.inventory || !staticData?.items) {
        return false;
    }

    // Check if any item in inventory belongs to the specified group
    for (const itemName in snapshot.inventory) {
        const count = snapshot.inventory[itemName];
        if (count > 0) {
            const itemDef = staticData.items[itemName];
            const matches = itemDef?.groups?.includes(groupName);
            if (matches) {
                return true;
            }
        }
    }
    return false;
}

// Helper function to count unique items from a group
function countGroupUnique(snapshot, groupName, staticData) {
    if (!snapshot?.inventory || !staticData?.items) {
        return 0;
    }

    let count = 0;
    for (const itemName in snapshot.inventory) {
        const itemCount = snapshot.inventory[itemName];
        if (itemCount > 0) {
            const itemDef = staticData.items[itemName];
            if (itemDef?.groups?.includes(groupName)) {
                count++;  // Count unique items, not total quantity
            }
        }
    }
    return count;
}

function graffitiM(snapshot, staticData, limit, spots) {
    if (limit) {
        const count = countGroupUnique(snapshot, 'graffitim', staticData);
        return count * 7 >= spots;
    } else {
        return hasGroup(snapshot, 'graffitim', staticData);
    }
}

function graffitiL(snapshot, staticData, limit, spots) {
    if (limit) {
        const count = countGroupUnique(snapshot, 'graffitil', staticData);
        return count * 6 >= spots;
    } else {
        return hasGroup(snapshot, 'graffitil', staticData);
    }
}

function graffitiXL(snapshot, staticData, limit, spots) {
    if (limit) {
        const count = countGroupUnique(snapshot, 'graffitixl', staticData);
        return count * 4 >= spots;
    } else {
        return hasGroup(snapshot, 'graffitixl', staticData);
    }
}

function skateboard(snapshot, staticData, movestyle) {
    return movestyle === 2 || hasGroup(snapshot, 'skateboard', staticData);
}

function inline_skates(snapshot, staticData, movestyle) {
    const hasSkatesGroup = hasGroup(snapshot, 'skates', staticData);
    const result = movestyle === 3 || hasSkatesGroup;
    return result;
}

function bmx(snapshot, staticData, movestyle) {
    return movestyle === 1 || hasGroup(snapshot, 'bmx', staticData);
}

function camera(snapshot, staticData) {
    return hasItem(snapshot, 'Camera App');
}

function is_girl(snapshot, staticData) {
    return hasGroup(snapshot, 'girl', staticData);
}

function current_chapter(snapshot, staticData, chapter) {
    // Check inventory for "Chapter Completed" (from progressionMapping or direct)
    const inventoryChapters = getItemCount(snapshot, 'Chapter Completed');
    if (inventoryChapters >= chapter - 1) {
        return true;
    }

    // Fallback: check prog_items structure
    const progChapters = snapshot?.prog_items?.['1']?.['Chapter Completed'] ||
                         snapshot?.prog_items?.[1]?.['Chapter Completed'] || 0;
    if (progChapters >= chapter - 1) {
        return true;
    }

    // Check events array (if events are tracked separately)
    const events = snapshot?.events || [];
    let chaptersCompleted = 0;
    for (const event of events) {
        if (event.includes('Chapter') && event.includes('Complete')) {
            chaptersCompleted++;
        }
    }

    return chaptersCompleted >= chapter - 1;
}

function rep(snapshot, staticData, required) {
    // The progressionMapping in rules should aggregate "8 REP", "16 REP", etc.
    // into inventory["rep"]. This is handled by stateManager.addItemToInventory().
    // We check both the aggregated "rep" counter and fall back to manual aggregation
    // for spoiler tests that may use prog_items directly.

    // First check the aggregated "rep" counter (from progressionMapping)
    const aggregatedRep = getItemCount(snapshot, 'rep');
    if (aggregatedRep >= required) {
        return true;
    }

    // Fallback: check prog_items structure (used by spoiler tests)
    const progRep = snapshot?.prog_items?.['1']?.rep || snapshot?.prog_items?.[1]?.rep || 0;
    if (progRep >= required) {
        return true;
    }

    // Second fallback: manually aggregate REP items (for cases where progressionMapping hasn't run)
    const repItemAmounts = [8, 16, 24, 32, 48];
    let totalRep = 0;
    for (const amount of repItemAmounts) {
        const itemName = `${amount} REP`;
        const count = getItemCount(snapshot, itemName);
        totalRep += amount * count;
    }

    return totalRep >= required;
}

// Progression functions
function versum_hill_entrance(snapshot, staticData) {
    return rep(snapshot, staticData, 20);
}

function versum_hill_ch1_roadblock(snapshot, staticData, limit) {
    return graffitiL(snapshot, staticData, limit, 10);
}

function versum_hill_challenge1(snapshot, staticData) {
    return rep(snapshot, staticData, 50);
}

function versum_hill_challenge2(snapshot, staticData) {
    return rep(snapshot, staticData, 58);
}

function versum_hill_challenge3(snapshot, staticData) {
    return rep(snapshot, staticData, 65);
}

function versum_hill_all_challenges(snapshot, staticData) {
    return versum_hill_challenge3(snapshot, staticData);
}

function versum_hill_basketball_court(snapshot, staticData) {
    return rep(snapshot, staticData, 90);
}

function versum_hill_oldhead(snapshot, staticData) {
    return rep(snapshot, staticData, 120);
}

function versum_hill_crew_battle(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return rep(snapshot, staticData, 90) &&
               graffitiM(snapshot, staticData, limit, 98);
    } else {
        return rep(snapshot, staticData, 90) &&
               graffitiM(snapshot, staticData, limit, 27);
    }
}

function versum_hill_rave(snapshot, staticData, limit, glitched) {
    if (glitched) {
        if (current_chapter(snapshot, staticData, 4)) {
            return graffitiL(snapshot, staticData, limit, 90) &&
                   graffitiXL(snapshot, staticData, limit, 51);
        } else if (current_chapter(snapshot, staticData, 3)) {
            return graffitiL(snapshot, staticData, limit, 89) &&
                   graffitiXL(snapshot, staticData, limit, 51);
        } else {
            return graffitiL(snapshot, staticData, limit, 85) &&
                   graffitiXL(snapshot, staticData, limit, 48);
        }
    } else {
        return graffitiL(snapshot, staticData, limit, 26) &&
               graffitiXL(snapshot, staticData, limit, 10);
    }
}

function versum_hill_rietveld(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return current_chapter(snapshot, staticData, 2) &&
               graffitiM(snapshot, staticData, limit, 114);
    } else {
        return current_chapter(snapshot, staticData, 2) &&
               graffitiM(snapshot, staticData, limit, 67);
    }
}

function brink_terminal_entrance(snapshot, staticData) {
    return is_girl(snapshot, staticData) &&
           rep(snapshot, staticData, 180) &&
           current_chapter(snapshot, staticData, 2);
}

function brink_terminal_challenge1(snapshot, staticData) {
    return rep(snapshot, staticData, 188);
}

function brink_terminal_challenge2(snapshot, staticData) {
    return rep(snapshot, staticData, 200);
}

function brink_terminal_challenge3(snapshot, staticData) {
    return rep(snapshot, staticData, 220);
}

function brink_terminal_all_challenges(snapshot, staticData) {
    return brink_terminal_challenge3(snapshot, staticData);
}

function brink_terminal_plaza(snapshot, staticData) {
    return brink_terminal_all_challenges(snapshot, staticData);
}

function brink_terminal_tower(snapshot, staticData) {
    return rep(snapshot, staticData, 280);
}

function brink_terminal_oldhead_underground(snapshot, staticData) {
    return rep(snapshot, staticData, 250);
}

function brink_terminal_oldhead_dock(snapshot, staticData) {
    return rep(snapshot, staticData, 320);
}

function brink_terminal_crew_battle(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return rep(snapshot, staticData, 280) &&
               graffitiL(snapshot, staticData, limit, 103);
    } else {
        return rep(snapshot, staticData, 280) &&
               graffitiL(snapshot, staticData, limit, 62);
    }
}

function brink_terminal_mesh(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return graffitiM(snapshot, staticData, limit, 114) &&
               graffitiXL(snapshot, staticData, limit, 45);
    } else {
        return graffitiM(snapshot, staticData, limit, 67) &&
               graffitiXL(snapshot, staticData, limit, 45);
    }
}

function millennium_square_entrance(snapshot, staticData) {
    return current_chapter(snapshot, staticData, 2);
}

function millennium_mall_entrance(snapshot, staticData) {
    return rep(snapshot, staticData, 380) &&
           current_chapter(snapshot, staticData, 3);
}

function millennium_mall_theater(snapshot, staticData, limit) {
    return rep(snapshot, staticData, 491) &&
           graffitiM(snapshot, staticData, limit, 78);
}

function millennium_mall_oldhead_ceiling(snapshot, staticData, limit) {
    return rep(snapshot, staticData, 580) ||
           millennium_mall_theater(snapshot, staticData, limit);
}

function millennium_mall_switch(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return graffitiM(snapshot, staticData, limit, 114) &&
               current_chapter(snapshot, staticData, 3);
    } else {
        return graffitiM(snapshot, staticData, limit, 72) &&
               current_chapter(snapshot, staticData, 3);
    }
}

function millennium_mall_big(snapshot, staticData, limit, glitched) {
    return millennium_mall_switch(snapshot, staticData, limit, glitched);
}

function millennium_mall_oldhead_race(snapshot, staticData) {
    return rep(snapshot, staticData, 530);
}

function millennium_mall_challenge1(snapshot, staticData) {
    return rep(snapshot, staticData, 434);
}

function millennium_mall_challenge2(snapshot, staticData) {
    return rep(snapshot, staticData, 442);
}

function millennium_mall_challenge3(snapshot, staticData) {
    return rep(snapshot, staticData, 450);
}

function millennium_mall_challenge4(snapshot, staticData) {
    return rep(snapshot, staticData, 458);
}

function millennium_mall_all_challenges(snapshot, staticData) {
    return millennium_mall_challenge4(snapshot, staticData);
}

function millennium_mall_crew_battle(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return rep(snapshot, staticData, 491) &&
               graffitiM(snapshot, staticData, limit, 114) &&
               graffitiL(snapshot, staticData, limit, 107);
    } else {
        return rep(snapshot, staticData, 491) &&
               graffitiM(snapshot, staticData, limit, 78) &&
               graffitiL(snapshot, staticData, limit, 80);
    }
}

function pyramid_island_entrance(snapshot, staticData) {
    return current_chapter(snapshot, staticData, 4);
}

function pyramid_island_gate(snapshot, staticData) {
    return rep(snapshot, staticData, 620);
}

function pyramid_island_oldhead(snapshot, staticData) {
    return rep(snapshot, staticData, 780);
}

function pyramid_island_challenge1(snapshot, staticData) {
    return rep(snapshot, staticData, 630) &&
           current_chapter(snapshot, staticData, 4);
}

function pyramid_island_all_challenges(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return graffitiM(snapshot, staticData, limit, 114) &&
               rep(snapshot, staticData, 660);
    } else {
        return graffitiM(snapshot, staticData, limit, 88) &&
               rep(snapshot, staticData, 660);
    }
}

function pyramid_island_upper_half(snapshot, staticData, limit, glitched) {
    return pyramid_island_all_challenges(snapshot, staticData, limit, glitched);
}

function pyramid_island_crew_battle(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return rep(snapshot, staticData, 730) &&
               graffitiL(snapshot, staticData, limit, 108);
    } else {
        return rep(snapshot, staticData, 730) &&
               graffitiL(snapshot, staticData, limit, 97);
    }
}

function pyramid_island_race(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return pyramid_island_challenge1(snapshot, staticData) &&
               graffitiL(snapshot, staticData, limit, 108);
    } else {
        return pyramid_island_challenge1(snapshot, staticData) &&
               graffitiL(snapshot, staticData, limit, 93);
    }
}

function pyramid_island_challenge2(snapshot, staticData) {
    return rep(snapshot, staticData, 650);
}

function pyramid_island_challenge3(snapshot, staticData) {
    return rep(snapshot, staticData, 660);
}

function pyramid_island_top(snapshot, staticData) {
    return current_chapter(snapshot, staticData, 5);
}

function mataan_entrance(snapshot, staticData) {
    return current_chapter(snapshot, staticData, 2);
}

function mataan_smoke_wall(snapshot, staticData) {
    return current_chapter(snapshot, staticData, 5) &&
           rep(snapshot, staticData, 850);
}

function mataan_challenge1(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return current_chapter(snapshot, staticData, 5) &&
               rep(snapshot, staticData, 864) &&
               graffitiL(snapshot, staticData, limit, 108);
    } else {
        return current_chapter(snapshot, staticData, 5) &&
               rep(snapshot, staticData, 864) &&
               graffitiL(snapshot, staticData, limit, 98);
    }
}

function mataan_deep_city(snapshot, staticData, limit, glitched) {
    return mataan_challenge1(snapshot, staticData, limit, glitched);
}

function mataan_oldhead(snapshot, staticData) {
    return rep(snapshot, staticData, 935);
}

function mataan_challenge2(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return rep(snapshot, staticData, 880) &&
               graffitiXL(snapshot, staticData, limit, 59);
    } else {
        return rep(snapshot, staticData, 880) &&
               graffitiXL(snapshot, staticData, limit, 57);
    }
}

function mataan_challenge3(snapshot, staticData) {
    return rep(snapshot, staticData, 920);
}

function mataan_all_challenges(snapshot, staticData, limit, glitched) {
    return mataan_challenge2(snapshot, staticData, limit, glitched) &&
           mataan_challenge3(snapshot, staticData);
}

function mataan_smoke_wall2(snapshot, staticData, limit, glitched) {
    return mataan_all_challenges(snapshot, staticData, limit, glitched) &&
           rep(snapshot, staticData, 960);
}

function mataan_deepest(snapshot, staticData, limit, glitched) {
    return mataan_crew_battle(snapshot, staticData, limit, glitched);
}

function mataan_crew_battle(snapshot, staticData, limit, glitched) {
    if (glitched) {
        return mataan_smoke_wall2(snapshot, staticData, limit, glitched) &&
               graffitiM(snapshot, staticData, limit, 122) &&
               graffitiXL(snapshot, staticData, limit, 59);
    } else {
        return mataan_smoke_wall2(snapshot, staticData, limit, glitched) &&
               graffitiM(snapshot, staticData, limit, 117) &&
               graffitiXL(snapshot, staticData, limit, 57);
    }
}

function mataan_faux(snapshot, staticData, limit, glitched) {
    return mataan_deepest(snapshot, staticData, limit, glitched) &&
           graffitiM(snapshot, staticData, limit, 122);
}

// Helper to get options from static data
function getOptionsFromStaticData(snapshot, staticData) {
    const playerSlot = snapshot?.player?.id || snapshot?.player?.slot || staticData?.playerId || DEFAULT_PLAYER_ID;
    const settings = staticData?.settings?.[playerSlot];
    if (!settings) {
        return {
            movestyle: 2,  // Default: skateboard
            limit: false,
            glitched: false
        };
    }

    return {
        movestyle: settings.starting_movestyle ?? 2,
        limit: settings.limited_graffiti ?? false,
        glitched: settings.logic ?? false
    };
}

// Spot counting functions based on Python implementation
function spots_s_glitchless(snapshot, staticData, limit, accessCache) {
    // Extract actual value if limit comes as a rule tree object
    if (typeof limit === 'object' && limit?.type === 'constant') {
        limit = limit.value;
    }

    // If accessCache is a name reference or undefined, build it
    if (!accessCache || (typeof accessCache === 'object' && accessCache?.type === 'name')) {
        const options = getOptionsFromStaticData(snapshot, staticData);
        accessCache = build_access_cache(snapshot, staticData, options.movestyle, options.limit, options.glitched);
    }

    // Small spots can be tagged without any graffiti items
    // Starting with 10 spots accessible in the Hideout
    let total = 10;

    // Additional spots become available as regions are accessed
    const conditions = [
        ["versum_hill_entrance", 1],
        ["versum_hill_ch1_roadblock", 11],
        ["chapter2", 12],
        ["versum_hill_oldhead", 1],
        ["brink_terminal_entrance", 9],
        ["brink_terminal_plaza", 3],
        ["brink_terminal_tower", 0],
        ["chapter3", 6],
        ["brink_terminal_oldhead_dock", 1],
        ["millennium_mall_entrance", 3],
        ["millennium_mall_switch", 4],
        ["millennium_mall_theater", 3],
        ["chapter4", 2],
        ["pyramid_island_gate", 5],
        ["pyramid_island_upper_half", 8],
        ["pyramid_island_oldhead", 2],
        ["mataan_smoke_wall", 3],
        ["mataan_deep_city", 5],
        ["mataan_oldhead", 3],
        ["mataan_deepest", 2]
    ];

    // Add graffiti counts for accessible regions, stop at first inaccessible
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }

    if (limit) {
        // With limit, spots are limited by character count
        let characterCount = 0;
        if (snapshot?.inventory) {
            // Count unique character items
            for (const itemName in snapshot?.inventory) {
                if (itemName.match(/^(Red|Tryce|Bel|Vinyl|Solace|Rave|Mesh|Shine|Rise|Coil|DOT EXE|Dev|Frank|Rietveld|DJ Cyber|Eclipse|Vela|Max|Nunchaku Girl|Bumpy|Flesh Prince|Irene|Felix|Oldhead|Base|Jay|Futurism|Jazz|Veronica|Magnum)$/) && snapshot?.inventory[itemName] > 0) {
                    characterCount++;
                }
            }
        }
        const sprayable = 5 + (characterCount * 5);
        return Math.min(total, sprayable);
    } else {
        // Without limit, all accessible small spots can be tagged
        return total;
    }
}

function spots_s_glitched(snapshot, staticData, limit, accessCache) {
    // Extract actual value if limit comes as a rule tree object
    if (typeof limit === 'object' && limit?.type === 'constant') {
        limit = limit.value;
    }

    // If accessCache is a name reference or undefined, build it
    if (!accessCache || (typeof accessCache === 'object' && accessCache?.type === 'name')) {
        const options = getOptionsFromStaticData(snapshot, staticData);
        accessCache = build_access_cache(snapshot, staticData, options.movestyle, options.limit, options.glitched);
    }

    let total = 75;

    const conditions = [
        ["brink_terminal_entrance", 13],
        ["chapter3", 6]
    ];

    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }

    if (limit) {
        let characterCount = 0;
        if (snapshot?.inventory) {
            // Count unique character items
            for (const itemName in snapshot?.inventory) {
                if (itemName.match(/^(Red|Tryce|Bel|Vinyl|Solace|Rave|Mesh|Shine|Rise|Coil|DOT EXE|Dev|Frank|Rietveld|DJ Cyber|Eclipse|Vela|Max|Nunchaku Girl|Bumpy|Flesh Prince|Irene|Felix|Oldhead|Base|Jay|Futurism|Jazz|Veronica|Magnum)$/) && snapshot?.inventory[itemName] > 0) {
                    characterCount++;
                }
            }
        }
        const sprayable = 5 + (characterCount * 5);
        return Math.min(total, sprayable);
    }
    return total;
}

function spots_m_glitchless(snapshot, staticData, limit, accessCache) {
    // Medium spots require graffiti M items
    let total = 4;  // Base spots accessible in Hideout
    
    const conditions = [
        ["versum_hill_entrance", 3],
        ["versum_hill_ch1_roadblock", 13],
        ["versum_hill_all_challenges", 3],
        ["chapter2", 16],
        ["versum_hill_oldhead", 4],
        ["brink_terminal_entrance", 13],
        ["brink_terminal_plaza", 4],
        ["brink_terminal_tower", 0],
        ["chapter3", 3],
        ["brink_terminal_oldhead_dock", 4],
        ["millennium_mall_entrance", 5],
        ["millennium_mall_big", 6],
        ["millennium_mall_theater", 4],
        ["chapter4", 2],
        ["millennium_mall_oldhead_ceiling", 1],
        ["pyramid_island_gate", 3],
        ["pyramid_island_upper_half", 8],
        ["chapter5", 2],
        ["pyramid_island_oldhead", 5],
        ["mataan_deep_city", 7],
        ["skateboard", 1],
        ["mataan_oldhead", 1],
        ["mataan_smoke_wall2", 1],
        ["mataan_deepest", 10]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else if (accessName !== "skateboard") {
            break;
        }
    }
    
    if (limit) {
        // Count unique graffiti M items
        let graffitiMCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot?.inventory[itemName] > 0) {
                    graffitiMCount++;
                }
            }
        }
        const sprayable = graffitiMCount * 7;
        return Math.min(total, sprayable);
    } else {
        // Without limit, need at least one graffiti M to access any M spots
        let hasGraffitiM = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiM = true;
                    break;
                }
            }
        }
        return hasGraffitiM ? total : 0;
    }
}

function spots_m_glitched(snapshot, staticData, limit, accessCache) {
    let total = 99;
    
    const conditions = [
        ["brink_terminal_entrance", 21],
        ["chapter3", 3]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }
    
    if (limit) {
        let graffitiMCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot?.inventory[itemName] > 0) {
                    graffitiMCount++;
                }
            }
        }
        const sprayable = graffitiMCount * 7;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiM = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiM = true;
                    break;
                }
            }
        }
        return hasGraffitiM ? total : 0;
    }
}

function spots_l_glitchless(snapshot, staticData, limit, accessCache) {
    // Large spots require graffiti L items
    let total = 7;  // Base spots
    
    const conditions = [
        ["inline_skates", 1],
        ["versum_hill_entrance", 2],
        ["versum_hill_ch1_roadblock", 13],
        ["versum_hill_all_challenges", 1],
        ["chapter2", 14],
        ["versum_hill_oldhead", 2],
        ["brink_terminal_entrance", 10],
        ["brink_terminal_plaza", 2],
        ["brink_terminal_oldhead_underground", 1],
        ["brink_terminal_tower", 1],
        ["chapter3", 4],
        ["brink_terminal_oldhead_dock", 4],
        ["millennium_mall_entrance", 3],
        ["millennium_mall_big", 8],
        ["millennium_mall_theater", 4],
        ["chapter4", 5],
        ["millennium_mall_oldhead_ceiling", 3],
        ["pyramid_island_gate", 4],
        ["pyramid_island_upper_half", 5],
        ["pyramid_island_crew_battle", 1],
        ["chapter5", 1],
        ["pyramid_island_oldhead", 2],
        ["mataan_smoke_wall", 1],
        ["mataan_deep_city", 2],
        ["skateboard", 1],
        ["mataan_oldhead", 2],
        ["mataan_deepest", 7]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else if (!(accessName === "inline_skates" || accessName === "skateboard")) {
            break;
        }
    }
    
    if (limit) {
        let graffitiLCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot?.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiL = true;
                    break;
                }
            }
        }
        return hasGraffitiL ? total : 0;
    }
}

function spots_l_glitched(snapshot, staticData, limit, accessCache) {
    let total = 88;
    
    const conditions = [
        ["brink_terminal_entrance", 18],
        ["chapter3", 4],
        ["chapter4", 1]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }
    
    if (limit) {
        let graffitiLCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot?.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiL = true;
                    break;
                }
            }
        }
        return hasGraffitiL ? total : 0;
    }
}

function spots_xl_glitchless(snapshot, staticData, limit, accessCache) {
    // XL spots require graffiti XL items
    let total = 3;  // Base spots
    
    const conditions = [
        ["versum_hill_ch1_roadblock", 6],
        ["versum_hill_basketball_court", 1],
        ["chapter2", 9],
        ["brink_terminal_entrance", 3],
        ["brink_terminal_plaza", 1],
        ["brink_terminal_oldhead_underground", 1],
        ["brink_terminal_tower", 1],
        ["chapter3", 3],
        ["brink_terminal_oldhead_dock", 2],
        ["millennium_mall_entrance", 2],
        ["millennium_mall_big", 5],
        ["millennium_mall_theater", 5],
        ["chapter4", 3],
        ["millennium_mall_oldhead_ceiling", 1],
        ["pyramid_island_upper_half", 5],
        ["pyramid_island_oldhead", 3],
        ["mataan_smoke_wall", 2],
        ["mataan_deep_city", 2],
        ["mataan_oldhead", 2],
        ["mataan_deepest", 2]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }
    
    if (limit) {
        let graffitiXLCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot?.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiXL = true;
                    break;
                }
            }
        }
        return hasGraffitiXL ? total : 0;
    }
}

function spots_xl_glitched(snapshot, staticData, limit, accessCache) {
    let total = 51;
    
    const conditions = [
        ["brink_terminal_entrance", 7],
        ["chapter3", 3],
        ["chapter4", 1]
    ];
    
    for (const [accessName, graffitiCount] of conditions) {
        if (accessCache[accessName]) {
            total += graffitiCount;
        } else {
            break;
        }
    }
    
    if (limit) {
        let graffitiXLCount = 0;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot?.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot?.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot?.inventory[itemName] > 0) {
                    hasGraffitiXL = true;
                    break;
                }
            }
        }
        return hasGraffitiXL ? total : 0;
    }
}

function build_access_cache(snapshot, staticData, movestyle, limit, glitched) {
    // Build the initial cache with basic access checks
    const accessCache = {
        "skateboard": skateboard(snapshot, staticData, movestyle),
        "inline_skates": inline_skates(snapshot, staticData, movestyle),
        "chapter2": current_chapter(snapshot, staticData, 2),
        "chapter3": current_chapter(snapshot, staticData, 3),
        "chapter4": current_chapter(snapshot, staticData, 4),
        "chapter5": current_chapter(snapshot, staticData, 5)
    };

    // Define functions to check for each region in order
    // Each entry is [functionName, args]
    // Functions expect: (snapshot, staticData, ...)
    const funcs = [
        ["versum_hill_entrance", [snapshot, staticData]],
        ["versum_hill_ch1_roadblock", [snapshot, staticData, limit]],
        ["versum_hill_oldhead", [snapshot, staticData]],
        ["versum_hill_all_challenges", [snapshot, staticData]],
        ["versum_hill_basketball_court", [snapshot, staticData]],
        ["brink_terminal_entrance", [snapshot, staticData]],
        ["brink_terminal_oldhead_underground", [snapshot, staticData]],
        ["brink_terminal_oldhead_dock", [snapshot, staticData]],
        ["brink_terminal_plaza", [snapshot, staticData]],
        ["brink_terminal_tower", [snapshot, staticData]],
        ["millennium_mall_entrance", [snapshot, staticData]],
        ["millennium_mall_switch", [snapshot, staticData, limit, glitched]],
        ["millennium_mall_oldhead_ceiling", [snapshot, staticData, limit]],
        ["millennium_mall_big", [snapshot, staticData, limit, glitched]],
        ["millennium_mall_theater", [snapshot, staticData, limit]],
        ["pyramid_island_gate", [snapshot, staticData]],
        ["pyramid_island_oldhead", [snapshot, staticData]],
        ["pyramid_island_upper_half", [snapshot, staticData, limit, glitched]],
        ["pyramid_island_crew_battle", [snapshot, staticData, limit, glitched]],
        ["mataan_smoke_wall", [snapshot, staticData]],
        ["mataan_deep_city", [snapshot, staticData, limit, glitched]],
        ["mataan_oldhead", [snapshot, staticData]],
        ["mataan_smoke_wall2", [snapshot, staticData, limit, glitched]],
        ["mataan_deepest", [snapshot, staticData, limit, glitched]]
    ];
    
    // Map function names to actual functions
    const functionMap = {
        versum_hill_entrance,
        versum_hill_ch1_roadblock,
        versum_hill_oldhead,
        versum_hill_all_challenges,
        versum_hill_basketball_court,
        brink_terminal_entrance,
        brink_terminal_oldhead_underground,
        brink_terminal_oldhead_dock,
        brink_terminal_plaza,
        brink_terminal_tower,
        millennium_mall_entrance,
        millennium_mall_switch,
        millennium_mall_oldhead_ceiling,
        millennium_mall_big,
        millennium_mall_theater,
        pyramid_island_gate,
        pyramid_island_oldhead,
        pyramid_island_upper_half,
        pyramid_island_crew_battle,
        mataan_smoke_wall,
        mataan_deep_city,
        mataan_oldhead,
        mataan_smoke_wall2,
        mataan_deepest,
        mataan_crew_battle
    };
    
    // Check each region in order, stopping when we hit an inaccessible one
    let stop = false;
    for (const [funcName, args] of funcs) {
        if (stop) {
            accessCache[funcName] = false;
            continue;
        }

        const func = functionMap[funcName];
        const access = func ? func(...args) : false;
        accessCache[funcName] = access;

        // Stop at first inaccessible region (unless it's an oldhead)
        if (!access && !funcName.includes("oldhead")) {
            stop = true;
        }
    }

    return accessCache;
}

// Main graffiti_spots function - matches Python implementation
function graffiti_spots(snapshot, staticData, movestyle, limit, glitched, spots) {
    // Extract actual values if arguments come as rule tree objects
    if (typeof movestyle === 'object' && movestyle?.type === 'constant') {
        movestyle = movestyle.value;
    }
    if (typeof limit === 'object' && limit?.type === 'constant') {
        limit = limit.value;
    }
    if (typeof glitched === 'object' && glitched?.type === 'constant') {
        glitched = glitched.value;
    }
    if (typeof spots === 'object' && spots?.type === 'constant') {
        spots = spots.value;
    }

    // Build access cache for checking region accessibility
    const accessCache = build_access_cache(snapshot, staticData, movestyle, limit, glitched);

    let total = 0;
    let s_spots, m_spots, l_spots, xl_spots;

    if (glitched) {
        s_spots = spots_s_glitched(snapshot, staticData, limit, accessCache);
        m_spots = spots_m_glitched(snapshot, staticData, limit, accessCache);
        l_spots = spots_l_glitched(snapshot, staticData, limit, accessCache);
        xl_spots = spots_xl_glitched(snapshot, staticData, limit, accessCache);
        total = s_spots + m_spots + l_spots + xl_spots;
    } else {
        s_spots = spots_s_glitchless(snapshot, staticData, limit, accessCache);
        m_spots = spots_m_glitchless(snapshot, staticData, limit, accessCache);
        l_spots = spots_l_glitchless(snapshot, staticData, limit, accessCache);
        xl_spots = spots_xl_glitchless(snapshot, staticData, limit, accessCache);
        total = s_spots + m_spots + l_spots + xl_spots;
    }

    return total >= spots;
}

// Export the helper functions in the expected format
export const helperFunctions = {
    // Main graffiti spots calculation function
    graffiti_spots,

    // Graffiti type helpers
    graffitiM,
    graffitiL,
    graffitiXL,

    // Movement style helpers
    skateboard,
    inline_skates,
    bmx,

    // Utility helpers
    camera,
    is_girl,
    current_chapter,
    rep,

    // Region access helpers
    versum_hill_entrance,
    versum_hill_ch1_roadblock,
    versum_hill_challenge1,
    versum_hill_challenge2,
    versum_hill_challenge3,
    versum_hill_all_challenges,
    versum_hill_basketball_court,
    versum_hill_oldhead,
    versum_hill_crew_battle,
    versum_hill_rave,
    versum_hill_rietveld,
    brink_terminal_entrance,
    brink_terminal_challenge1,
    brink_terminal_challenge2,
    brink_terminal_challenge3,
    brink_terminal_all_challenges,
    brink_terminal_plaza,
    brink_terminal_tower,
    brink_terminal_oldhead_underground,
    brink_terminal_oldhead_dock,
    brink_terminal_crew_battle,
    brink_terminal_mesh,
    millennium_square_entrance,
    millennium_mall_entrance,
    millennium_mall_theater,
    millennium_mall_oldhead_ceiling,
    millennium_mall_switch,
    millennium_mall_big,
    millennium_mall_oldhead_race,
    millennium_mall_challenge1,
    millennium_mall_challenge2,
    millennium_mall_challenge3,
    millennium_mall_challenge4,
    millennium_mall_all_challenges,
    millennium_mall_crew_battle,
    pyramid_island_entrance,
    pyramid_island_gate,
    pyramid_island_oldhead,
    pyramid_island_challenge1,
    pyramid_island_challenge2,
    pyramid_island_challenge3,
    pyramid_island_all_challenges,
    pyramid_island_upper_half,
    pyramid_island_crew_battle,
    pyramid_island_race,
    pyramid_island_top,
    mataan_entrance,
    mataan_smoke_wall,
    mataan_challenge1,
    mataan_deep_city,
    mataan_oldhead,
    mataan_challenge2,
    mataan_challenge3,
    mataan_all_challenges,
    mataan_smoke_wall2,
    mataan_deepest,
    mataan_crew_battle,
    mataan_faux,

    // Internal spot counting functions (exported for use by helpers.js)
    spots_s_glitchless,
    spots_s_glitched,
    spots_m_glitchless,
    spots_m_glitched,
    spots_l_glitchless,
    spots_l_glitched,
    spots_xl_glitchless,
    spots_xl_glitched,
    build_access_cache
};
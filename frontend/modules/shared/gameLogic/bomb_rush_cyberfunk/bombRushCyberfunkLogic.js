/**
 * Bomb Rush Cyberfunk helper functions
 * Translated from worlds/bomb_rush_cyberfunk/Rules.py
 * 
 * Note: This is a simplified implementation for initial testing.
 * The actual graffiti counting logic may be more complex and will need
 * refinement based on how items are represented in the game data.
 */

// Basic helper function to count items
function getItemCount(state, itemName) {
    return snapshot?.inventory?.[itemName] || 0;
}

// Basic helper function to check if player has any of an item
function hasItem(state, itemName, count = 1) {
    return getItemCount(state, itemName) >= count;
}

// Basic helper function to check if an event has occurred
function hasEvent(state, eventName) {
    return snapshot?.events?.includes(eventName) || snapshot?.flags?.includes(eventName);
}

function graffitiM(state, playerId, limit, spots, staticData) {
    // Simplified implementation - may need adjustment based on actual data structure
    if (limit) {
        // Assuming we count unique graffiti M items somehow
        const count = getItemCount(state, 'graffitim');
        return count * 7 >= spots;
    } else {
        return hasItem(state, 'graffitim');
    }
}

function graffitiL(state, playerId, limit, spots, staticData) {
    if (limit) {
        const count = getItemCount(state, 'graffitil');
        return count * 6 >= spots;
    } else {
        return hasItem(state, 'graffitil');
    }
}

function graffitiXL(state, playerId, limit, spots, staticData) {
    if (limit) {
        const count = getItemCount(state, 'graffitixl');
        return count * 4 >= spots;
    } else {
        return hasItem(state, 'graffitixl');
    }
}

function skateboard(state, playerId, movestyle, staticData) {
    return movestyle === 2 || hasItem(state, 'skateboard');
}

function inline_skates(state, playerId, movestyle, staticData) {
    return movestyle === 3 || hasItem(state, 'skates');
}

function bmx(state, playerId, movestyle, staticData) {
    return movestyle === 1 || hasItem(state, 'bmx');
}

function camera(snapshot, staticData, playerId) {
    return hasItem(state, 'Camera App');
}

function is_girl(snapshot, staticData, playerId) {
    // Simplified - may need to check character groups
    return hasItem(state, 'girl');
}

function current_chapter(state, playerId, chapter, staticData) {
    return hasItem(state, 'Chapter Completed', chapter - 1);
}

function rep(state, playerId, required, staticData) {
    return hasItem(state, 'rep', required);
}

// Progression functions
function versum_hill_entrance(snapshot, staticData, playerId) {
    return rep(state, playerId, 20, staticData);
}

function versum_hill_ch1_roadblock(state, playerId, limit, staticData) {
    return graffitiL(state, playerId, limit, 10, staticData);
}

function versum_hill_challenge1(snapshot, staticData, playerId) {
    return rep(state, playerId, 50, staticData);
}

function versum_hill_challenge2(snapshot, staticData, playerId) {
    return rep(state, playerId, 58, staticData);
}

function versum_hill_challenge3(snapshot, staticData, playerId) {
    return rep(state, playerId, 65, staticData);
}

function versum_hill_all_challenges(snapshot, staticData, playerId) {
    return versum_hill_challenge3(snapshot, staticData, playerId);
}

function versum_hill_basketball_court(snapshot, staticData, playerId) {
    return rep(state, playerId, 90, staticData);
}

function versum_hill_oldhead(snapshot, staticData, playerId) {
    return rep(state, playerId, 120, staticData);
}

function versum_hill_crew_battle(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return rep(state, playerId, 90, staticData) && 
               graffitiM(state, playerId, limit, 98, staticData);
    } else {
        return rep(state, playerId, 90, staticData) && 
               graffitiM(state, playerId, limit, 27, staticData);
    }
}

function brink_terminal_entrance(snapshot, staticData, playerId) {
    return is_girl(snapshot, staticData, playerId) && 
           rep(state, playerId, 180, staticData) && 
           current_chapter(state, playerId, 2, staticData);
}

function brink_terminal_challenge1(snapshot, staticData, playerId) {
    return rep(state, playerId, 188, staticData);
}

function brink_terminal_challenge2(snapshot, staticData, playerId) {
    return rep(state, playerId, 200, staticData);
}

function brink_terminal_challenge3(snapshot, staticData, playerId) {
    return rep(state, playerId, 220, staticData);
}

function brink_terminal_all_challenges(snapshot, staticData, playerId) {
    return brink_terminal_challenge3(snapshot, staticData, playerId);
}

function brink_terminal_plaza(snapshot, staticData, playerId) {
    return brink_terminal_all_challenges(snapshot, staticData, playerId);
}

function brink_terminal_tower(snapshot, staticData, playerId) {
    return rep(state, playerId, 280, staticData);
}

function brink_terminal_oldhead_underground(snapshot, staticData, playerId) {
    return rep(state, playerId, 250, staticData);
}

function brink_terminal_oldhead_dock(snapshot, staticData, playerId) {
    return rep(state, playerId, 320, staticData);
}

function millennium_square_entrance(snapshot, staticData, playerId) {
    return current_chapter(state, playerId, 2, staticData);
}

function millennium_mall_entrance(snapshot, staticData, playerId) {
    return rep(state, playerId, 380, staticData) && 
           current_chapter(state, playerId, 3, staticData);
}

function millennium_mall_theater(state, playerId, limit, staticData) {
    return rep(state, playerId, 491, staticData) && 
           graffitiM(state, playerId, limit, 78, staticData);
}

function millennium_mall_oldhead_ceiling(state, playerId, limit, staticData) {
    return rep(state, playerId, 580, staticData) || 
           millennium_mall_theater(state, playerId, limit, staticData);
}

function millennium_mall_switch(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return graffitiM(state, playerId, limit, 114, staticData) && 
               current_chapter(state, playerId, 3, staticData);
    } else {
        return graffitiM(state, playerId, limit, 72, staticData) && 
               current_chapter(state, playerId, 3, staticData);
    }
}

function millennium_mall_big(state, playerId, limit, glitched, staticData) {
    return millennium_mall_switch(state, playerId, limit, glitched, staticData);
}

function pyramid_island_entrance(snapshot, staticData, playerId) {
    return current_chapter(state, playerId, 4, staticData);
}

function pyramid_island_gate(snapshot, staticData, playerId) {
    return rep(state, playerId, 620, staticData);
}

function pyramid_island_oldhead(snapshot, staticData, playerId) {
    return rep(state, playerId, 780, staticData);
}

function pyramid_island_challenge1(snapshot, staticData, playerId) {
    return rep(state, playerId, 630, staticData) && 
           current_chapter(state, playerId, 4, staticData);
}

function pyramid_island_all_challenges(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return graffitiM(state, playerId, limit, 114, staticData) && 
               rep(state, playerId, 660, staticData);
    } else {
        return graffitiM(state, playerId, limit, 88, staticData) && 
               rep(state, playerId, 660, staticData);
    }
}

function pyramid_island_upper_half(state, playerId, limit, glitched, staticData) {
    return pyramid_island_all_challenges(state, playerId, limit, glitched, staticData);
}

function pyramid_island_crew_battle(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return rep(state, playerId, 730, staticData) && 
               graffitiL(state, playerId, limit, 108, staticData);
    } else {
        return rep(state, playerId, 730, staticData) && 
               graffitiL(state, playerId, limit, 97, staticData);
    }
}

function mataan_entrance(snapshot, staticData, playerId) {
    return current_chapter(state, playerId, 2, staticData);
}

function mataan_smoke_wall(snapshot, staticData, playerId) {
    return current_chapter(state, playerId, 5, staticData) && 
           rep(state, playerId, 850, staticData);
}

function mataan_challenge1(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return current_chapter(state, playerId, 5, staticData) && 
               rep(state, playerId, 864, staticData) && 
               graffitiL(state, playerId, limit, 108, staticData);
    } else {
        return current_chapter(state, playerId, 5, staticData) && 
               rep(state, playerId, 864, staticData) && 
               graffitiL(state, playerId, limit, 98, staticData);
    }
}

function mataan_deep_city(state, playerId, limit, glitched, staticData) {
    return mataan_challenge1(state, playerId, limit, glitched, staticData);
}

function mataan_oldhead(snapshot, staticData, playerId) {
    return rep(state, playerId, 935, staticData);
}

function mataan_challenge2(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return rep(state, playerId, 880, staticData) && 
               graffitiXL(state, playerId, limit, 59, staticData);
    } else {
        return rep(state, playerId, 880, staticData) && 
               graffitiXL(state, playerId, limit, 57, staticData);
    }
}

function mataan_challenge3(snapshot, staticData, playerId) {
    return rep(state, playerId, 920, staticData);
}

function mataan_all_challenges(state, playerId, limit, glitched, staticData) {
    return mataan_challenge2(state, playerId, limit, glitched, staticData) && 
           mataan_challenge3(snapshot, staticData, playerId);
}

function mataan_smoke_wall2(state, playerId, limit, glitched, staticData) {
    return mataan_all_challenges(state, playerId, limit, glitched, staticData) && 
           rep(state, playerId, 960, staticData);
}

function mataan_deepest(state, playerId, limit, glitched, staticData) {
    return mataan_crew_battle(state, playerId, limit, glitched, staticData);
}

function mataan_crew_battle(state, playerId, limit, glitched, staticData) {
    if (glitched) {
        return mataan_smoke_wall2(state, playerId, limit, glitched, staticData) && 
               graffitiM(state, playerId, limit, 122, staticData) && 
               graffitiXL(state, playerId, limit, 59, staticData);
    } else {
        return mataan_smoke_wall2(state, playerId, limit, glitched, staticData) && 
               graffitiM(state, playerId, limit, 117, staticData) && 
               graffitiXL(state, playerId, limit, 57, staticData);
    }
}

// Spot counting functions based on Python implementation
function spots_s_glitchless(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.match(/^(Red|Tryce|Bel|Vinyl|Solace|Rave|Mesh|Shine|Rise|Coil|DOT EXE|Dev|Frank|Rietveld|DJ Cyber|Eclipse|Vela|Max|Nunchaku Girl|Bumpy|Flesh Prince|Irene|Felix|Oldhead|Base|Jay|Futurism|Jazz|Veronica|Magnum)$/) && snapshot.inventory[itemName] > 0) {
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

function spots_s_glitched(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.match(/^(Red|Tryce|Bel|Vinyl|Solace|Rave|Mesh|Shine|Rise|Coil|DOT EXE|Dev|Frank|Rietveld|DJ Cyber|Eclipse|Vela|Max|Nunchaku Girl|Bumpy|Flesh Prince|Irene|Felix|Oldhead|Base|Jay|Futurism|Jazz|Veronica|Magnum)$/) && snapshot.inventory[itemName] > 0) {
                    characterCount++;
                }
            }
        }
        const sprayable = 5 + (characterCount * 5);
        return Math.min(total, sprayable);
    }
    return total;
}

function spots_m_glitchless(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot.inventory[itemName] > 0) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiM = true;
                    break;
                }
            }
        }
        return hasGraffitiM ? total : 0;
    }
}

function spots_m_glitched(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot.inventory[itemName] > 0) {
                    graffitiMCount++;
                }
            }
        }
        const sprayable = graffitiMCount * 7;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiM = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (M') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiM = true;
                    break;
                }
            }
        }
        return hasGraffitiM ? total : 0;
    }
}

function spots_l_glitchless(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiL = true;
                    break;
                }
            }
        }
        return hasGraffitiL ? total : 0;
    }
}

function spots_l_glitched(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (L') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiL = true;
                    break;
                }
            }
        }
        return hasGraffitiL ? total : 0;
    }
}

function spots_xl_glitchless(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiXL = true;
                    break;
                }
            }
        }
        return hasGraffitiXL ? total : 0;
    }
}

function spots_xl_glitched(state, playerId, limit, accessCache, staticData) {
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
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (snapshot?.inventory) {
            for (const itemName in snapshot.inventory) {
                if (itemName.includes('Graffiti (XL') && snapshot.inventory[itemName] > 0) {
                    hasGraffitiXL = true;
                    break;
                }
            }
        }
        return hasGraffitiXL ? total : 0;
    }
}

function build_access_cache(state, playerId, movestyle, limit, glitched, staticData) {
    // Build the initial cache with basic access checks
    const accessCache = {
        "skateboard": skateboard(state, playerId, movestyle, staticData),
        "inline_skates": inline_skates(state, playerId, movestyle, staticData),
        "chapter2": current_chapter(state, playerId, 2, staticData),
        "chapter3": current_chapter(state, playerId, 3, staticData),
        "chapter4": current_chapter(state, playerId, 4, staticData),
        "chapter5": current_chapter(state, playerId, 5, staticData)
    };
    
    // Define functions to check for each region in order
    // Each entry is [functionName, args]
    const funcs = [
        ["versum_hill_entrance", [state, playerId, staticData]],
        ["versum_hill_ch1_roadblock", [state, playerId, limit, staticData]],
        ["versum_hill_oldhead", [state, playerId, staticData]],
        ["versum_hill_all_challenges", [state, playerId, staticData]],
        ["versum_hill_basketball_court", [state, playerId, staticData]],
        ["brink_terminal_entrance", [state, playerId, staticData]],
        ["brink_terminal_oldhead_underground", [state, playerId, staticData]],
        ["brink_terminal_oldhead_dock", [state, playerId, staticData]],
        ["brink_terminal_plaza", [state, playerId, staticData]],
        ["brink_terminal_tower", [state, playerId, staticData]],
        ["millennium_mall_entrance", [state, playerId, staticData]],
        ["millennium_mall_switch", [state, playerId, limit, glitched, staticData]],
        ["millennium_mall_oldhead_ceiling", [state, playerId, limit, staticData]],
        ["millennium_mall_big", [state, playerId, limit, glitched, staticData]],
        ["millennium_mall_theater", [state, playerId, limit, staticData]],
        ["pyramid_island_gate", [state, playerId, staticData]],
        ["pyramid_island_oldhead", [state, playerId, staticData]],
        ["pyramid_island_upper_half", [state, playerId, limit, glitched, staticData]],
        ["pyramid_island_crew_battle", [state, playerId, limit, glitched, staticData]],
        ["mataan_smoke_wall", [state, playerId, staticData]],
        ["mataan_deep_city", [state, playerId, limit, glitched, staticData]],
        ["mataan_oldhead", [state, playerId, staticData]],
        ["mataan_smoke_wall2", [state, playerId, limit, glitched, staticData]],
        ["mataan_deepest", [state, playerId, limit, glitched, staticData]]
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
function graffiti_spots(state, playerId, movestyle, limit, glitched, spots, staticData) {
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
    const accessCache = build_access_cache(state, playerId, movestyle, limit, glitched, staticData);
    
    let total = 0;
    
    if (glitched) {
        total = spots_s_glitched(state, playerId, limit, accessCache, staticData) +
               spots_m_glitched(state, playerId, limit, accessCache, staticData) +
               spots_l_glitched(state, playerId, limit, accessCache, staticData) +
               spots_xl_glitched(state, playerId, limit, accessCache, staticData);
    } else {
        total = spots_s_glitchless(state, playerId, limit, accessCache, staticData) +
               spots_m_glitchless(state, playerId, limit, accessCache, staticData) +
               spots_l_glitchless(state, playerId, limit, accessCache, staticData) +
               spots_xl_glitchless(state, playerId, limit, accessCache, staticData);
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
    rep
};
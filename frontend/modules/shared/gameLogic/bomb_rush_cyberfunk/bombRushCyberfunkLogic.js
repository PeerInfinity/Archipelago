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
    return state?.inventory?.[itemName] || 0;
}

// Basic helper function to check if player has any of an item
function hasItem(state, itemName, count = 1) {
    return getItemCount(state, itemName) >= count;
}

// Basic helper function to check if an event has occurred
function hasEvent(state, eventName) {
    return state?.events?.includes(eventName) || state?.flags?.includes(eventName);
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

function camera(state, playerId, staticData) {
    return hasItem(state, 'Camera App');
}

function is_girl(state, playerId, staticData) {
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
function versum_hill_entrance(state, playerId, staticData) {
    return rep(state, playerId, 20, staticData);
}

function versum_hill_ch1_roadblock(state, playerId, limit, staticData) {
    return graffitiL(state, playerId, limit, 10, staticData);
}

function versum_hill_challenge1(state, playerId, staticData) {
    return rep(state, playerId, 50, staticData);
}

function versum_hill_challenge2(state, playerId, staticData) {
    return rep(state, playerId, 58, staticData);
}

function versum_hill_challenge3(state, playerId, staticData) {
    return rep(state, playerId, 65, staticData);
}

function versum_hill_all_challenges(state, playerId, staticData) {
    return versum_hill_challenge3(state, playerId, staticData);
}

function versum_hill_basketball_court(state, playerId, staticData) {
    return rep(state, playerId, 90, staticData);
}

function versum_hill_oldhead(state, playerId, staticData) {
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

function brink_terminal_entrance(state, playerId, staticData) {
    return is_girl(state, playerId, staticData) && 
           rep(state, playerId, 180, staticData) && 
           current_chapter(state, playerId, 2, staticData);
}

function brink_terminal_challenge1(state, playerId, staticData) {
    return rep(state, playerId, 188, staticData);
}

function brink_terminal_challenge2(state, playerId, staticData) {
    return rep(state, playerId, 200, staticData);
}

function brink_terminal_challenge3(state, playerId, staticData) {
    return rep(state, playerId, 220, staticData);
}

function brink_terminal_all_challenges(state, playerId, staticData) {
    return brink_terminal_challenge3(state, playerId, staticData);
}

function brink_terminal_plaza(state, playerId, staticData) {
    return brink_terminal_all_challenges(state, playerId, staticData);
}

function brink_terminal_tower(state, playerId, staticData) {
    return rep(state, playerId, 280, staticData);
}

function brink_terminal_oldhead_underground(state, playerId, staticData) {
    return rep(state, playerId, 250, staticData);
}

function brink_terminal_oldhead_dock(state, playerId, staticData) {
    return rep(state, playerId, 320, staticData);
}

function millennium_square_entrance(state, playerId, staticData) {
    return current_chapter(state, playerId, 2, staticData);
}

function millennium_mall_entrance(state, playerId, staticData) {
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

function pyramid_island_entrance(state, playerId, staticData) {
    return current_chapter(state, playerId, 4, staticData);
}

function pyramid_island_gate(state, playerId, staticData) {
    return rep(state, playerId, 620, staticData);
}

function pyramid_island_oldhead(state, playerId, staticData) {
    return rep(state, playerId, 780, staticData);
}

function pyramid_island_challenge1(state, playerId, staticData) {
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

function mataan_entrance(state, playerId, staticData) {
    return current_chapter(state, playerId, 2, staticData);
}

function mataan_smoke_wall(state, playerId, staticData) {
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

function mataan_oldhead(state, playerId, staticData) {
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

function mataan_challenge3(state, playerId, staticData) {
    return rep(state, playerId, 920, staticData);
}

function mataan_all_challenges(state, playerId, limit, glitched, staticData) {
    return mataan_challenge2(state, playerId, limit, glitched, staticData) && 
           mataan_challenge3(state, playerId, staticData);
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
    // (simplified - full implementation would check each region)
    
    if (limit) {
        // With limit, spots are limited by character count
        const characterCount = getItemCount(state, 'characters') || 0;
        const sprayable = 5 + (characterCount * 5);
        return Math.min(total, sprayable);
    } else {
        // Without limit, all accessible small spots can be tagged
        return total;
    }
}

function spots_s_glitched(state, playerId, limit, accessCache, staticData) {
    let total = 75;
    // Additional logic for glitched mode
    if (limit) {
        const characterCount = getItemCount(state, 'characters') || 0;
        const sprayable = 5 + (characterCount * 5);
        return Math.min(total, sprayable);
    }
    return total;
}

function spots_m_glitchless(state, playerId, limit, accessCache, staticData) {
    // Medium spots require graffiti M items
    let total = 4;  // Base spots accessible in Hideout
    
    // Additional spots would be added based on region access
    // (simplified for now)
    
    console.log(`[spots_m_glitchless] limit=${limit}, inventory keys:`, state?.inventory ? Object.keys(state.inventory) : 'no inventory');
    
    if (limit) {
        // Count unique graffiti M items
        let graffitiMCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (M') && state.inventory[itemName] > 0) {
                    graffitiMCount++;
                }
            }
        }
        const sprayable = graffitiMCount * 7;
        return Math.min(total, sprayable);
    } else {
        // Without limit, need at least one graffiti M to access any M spots
        let hasGraffitiM = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                const count = state.inventory[itemName];
                console.log(`[spots_m_glitchless] Checking item: "${itemName}", count: ${count}, includes check: ${itemName.includes('Graffiti (M')}`);
                if (itemName.includes('Graffiti (M') && count > 0) {
                    hasGraffitiM = true;
                    break;
                }
            }
        }
        console.log(`[spots_m_glitchless] hasGraffitiM=${hasGraffitiM}, returning ${hasGraffitiM ? total : 0}`);
        return hasGraffitiM ? total : 0;
    }
}

function spots_m_glitched(state, playerId, limit, accessCache, staticData) {
    let total = 99;
    
    if (limit) {
        let graffitiMCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (M') && state.inventory[itemName] > 0) {
                    graffitiMCount++;
                }
            }
        }
        const sprayable = graffitiMCount * 7;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiM = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (M') && state.inventory[itemName] > 0) {
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
    
    if (limit) {
        let graffitiLCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (L') && state.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (L') && state.inventory[itemName] > 0) {
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
    
    if (limit) {
        let graffitiLCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (L') && state.inventory[itemName] > 0) {
                    graffitiLCount++;
                }
            }
        }
        const sprayable = graffitiLCount * 6;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiL = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (L') && state.inventory[itemName] > 0) {
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
    
    if (limit) {
        let graffitiXLCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (XL') && state.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (XL') && state.inventory[itemName] > 0) {
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
    
    if (limit) {
        let graffitiXLCount = 0;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (XL') && state.inventory[itemName] > 0) {
                    graffitiXLCount++;
                }
            }
        }
        const sprayable = graffitiXLCount * 4;
        return Math.min(total, sprayable);
    } else {
        let hasGraffitiXL = false;
        if (state?.inventory) {
            for (const itemName in state.inventory) {
                if (itemName.includes('Graffiti (XL') && state.inventory[itemName] > 0) {
                    hasGraffitiXL = true;
                    break;
                }
            }
        }
        return hasGraffitiXL ? total : 0;
    }
}

function build_access_cache(state, playerId, movestyle, limit, glitched, staticData) {
    // For now, return a simple cache with basic chapter access
    return {
        "skateboard": skateboard(state, playerId, movestyle, staticData),
        "inline_skates": inline_skates(state, playerId, movestyle, staticData),
        "chapter2": current_chapter(state, playerId, 2, staticData),
        "chapter3": current_chapter(state, playerId, 3, staticData),
        "chapter4": current_chapter(state, playerId, 4, staticData),
        "chapter5": current_chapter(state, playerId, 5, staticData),
        // For simplicity, assume most areas are accessible for now
        "versum_hill_entrance": true,
        "versum_hill_ch1_roadblock": true,
        "versum_hill_oldhead": true,
        "versum_hill_all_challenges": true,
        "versum_hill_basketball_court": true,
        "brink_terminal_entrance": true,
        "brink_terminal_oldhead_underground": true,
        "brink_terminal_oldhead_dock": true,
        "brink_terminal_plaza": true,
        "brink_terminal_tower": true,
        "millennium_mall_entrance": true,
        "millennium_mall_switch": true,
        "millennium_mall_oldhead_ceiling": true,
        "millennium_mall_big": true,
        "millennium_mall_theater": true,
        "pyramid_island_gate": true,
        "pyramid_island_oldhead": true,
        "pyramid_island_upper_half": true,
        "pyramid_island_crew_battle": true,
        "mataan_smoke_wall": true,
        "mataan_deep_city": true,
        "mataan_oldhead": true,
        "mataan_smoke_wall2": true,
        "mataan_deepest": true
    };
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
        const s_spots = spots_s_glitchless(state, playerId, limit, accessCache, staticData);
        const m_spots = spots_m_glitchless(state, playerId, limit, accessCache, staticData);
        const l_spots = spots_l_glitchless(state, playerId, limit, accessCache, staticData);
        const xl_spots = spots_xl_glitchless(state, playerId, limit, accessCache, staticData);
        
        // Debug logging (remove after fixing)
        if (spots <= 25) {
            console.log(`[graffiti_spots] Checking ${spots} spots: S=${s_spots}, M=${m_spots}, L=${l_spots}, XL=${xl_spots}, Total=${s_spots + m_spots + l_spots + xl_spots}`);
            console.log(`[graffiti_spots] State inventory:`, state?.inventory);
        }
        
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
    rep
};
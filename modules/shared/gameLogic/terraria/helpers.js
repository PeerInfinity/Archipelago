/**
 * Terraria-specific helper functions for rule evaluation.
 */

/**
 * Check if a game setting is enabled.
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data (contains settings)
 * @param {string} settingName - Name of the setting to check
 * @returns {boolean} True if setting is enabled
 */
export function check_setting(snapshot, staticData, settingName) {
    const settings = staticData?.settings || {};
    const settingValue = settings[settingName];

    // Settings are typically boolean or numeric
    // Treat truthy values as enabled
    return !!settingValue;
}

/**
 * Check if player has at least N items from a list.
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {Array<string>} itemList - List of item names
 * @param {number} requiredCount - Required count of items from the list
 * @returns {boolean} True if player has at least requiredCount items from the list
 */
export function has_n_from_list(snapshot, staticData, itemList, requiredCount) {
    if (!snapshot?.inventory || !Array.isArray(itemList)) {
        return false;
    }

    let count = 0;
    for (const itemName of itemList) {
        if (snapshot.inventory[itemName] > 0) {
            count++;
            if (count >= requiredCount) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Check if player has at least N minion slots.
 *
 * Minion calculation in Terraria:
 * - Base minion count: 1
 * - Armor sets provide a fixed number of minions (only the best one counts)
 * - Accessories add their minion counts together
 *
 * @param {Object} snapshot - Game state snapshot
 * @param {Object} staticData - Static game data
 * @param {number} requiredCount - Required number of minion slots
 * @returns {boolean} True if player has at least requiredCount minion slots
 */
export function has_minions(snapshot, staticData, requiredCount) {
    if (!snapshot?.inventory) {
        return false;
    }

    // Base minion count
    let minionCount = 1;

    // Armor sets that provide minions (only the best one counts)
    const armorMinions = {
        'Wulfrum Armor': 1,
        'Flinx Fur Coat': 1,
        'Victide Armor': 1,
        'Obsidian Armor': 1,
        'Bee Armor': 2,
        'Spider Armor': 3,
        'Forbidden Armor': 1,
        'Hallowed Armor': 1,
        'Squire Armor': 1,
        'Monk Armor': 1,
        'Shinobi Infiltrator Armor': 1,
        'Huntress Armor': 1,
        'Apprentice Armor': 1,
        'Tiki Armor': 1,
        'Spooky Armor': 4,
        'Stardust Armor': 3,
        'Tavernkeep Armor': 1,
        'Plaguebringer Armor': 1,
        'Statigel Armor': 1,
        'Demonshade Armor': 5,
        'Fearmonger Armor': 1,
        'Godslayer Armor': 1,
        'Silva Armor': 2,
        'Auric Tesla Armor': 7,
        'Tarragon Armor': 1,
        'Bloodflare Armor': 1,
    };

    // Find the best armor bonus
    let bestArmorBonus = 0;
    for (const [armorName, bonus] of Object.entries(armorMinions)) {
        if (snapshot.inventory[armorName] > 0 && bonus > bestArmorBonus) {
            bestArmorBonus = bonus;
        }
    }
    minionCount += bestArmorBonus;

    // Accessories that provide minions (these stack)
    const accessoryMinions = {
        'Summoning Potion': 1,
        'Voltaic Jelly': 1,
        'Pygmy Necklace': 1,
        'Bewitching Table': 1,
        'The First Shadowflame': 1,
        'Corvid Harbor Pass': 1,
        'Necromantic Scroll': 1,
        'Papyrus Scarab': 1,
        'Starbuster Core': 2,
        'Profaned Soul Crystal': 3,
    };

    for (const [accessoryName, bonus] of Object.entries(accessoryMinions)) {
        if (snapshot.inventory[accessoryName] > 0) {
            minionCount += bonus;
        }
    }

    return minionCount >= requiredCount;
}

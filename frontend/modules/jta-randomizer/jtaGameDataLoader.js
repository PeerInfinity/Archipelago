/**
 * JTA Game Data Loader
 *
 * Converts game data from JSON format (jta_game_data.json) into the format
 * expected by the simulator and other modules (matching gameData.js exports).
 *
 * Used by:
 * - Cost adjustment tool (CLI and frontend) to load randomized game data
 * - Frontend to apply game data to the live JTA iframe
 */

import { SkillType, PerkType, TaskType, ItemType } from './gameData.js';

/**
 * Convert JSON game data into the format expected by the simulator.
 *
 * @param {object} jsonData - Parsed JSON from jta_game_data.json or _gamedata.json
 * @returns {object} Game data in simulator-compatible format
 */
export function loadGameDataFromJson(jsonData) {
    // Skills: build SKILL_XP_MULT map and SKILL_NAMES array
    const SKILL_XP_MULT = {};
    const SKILL_NAMES = new Array(12).fill('REMOVED');
    const SKILLS = [];
    for (const skill of jsonData.skills) {
        SKILL_XP_MULT[skill.id] = skill.xpMult;
        SKILL_NAMES[skill.id] = skill.name;
        SKILLS.push(skill.id);
    }

    // Perks: convert string keys to integer keys, convert skillModifier keys
    const PERKS = {};
    const PERK_NAMES = [];
    let maxPerkId = 0;
    for (const [idStr, perk] of Object.entries(jsonData.perks)) {
        const id = parseInt(idStr);
        if (id > maxPerkId) maxPerkId = id;
        const skillModifiers = {};
        for (const [skillIdStr, mod] of Object.entries(perk.skillModifiers)) {
            skillModifiers[parseInt(skillIdStr)] = mod;
        }
        PERKS[id] = { name: perk.name, skillModifiers, special: perk.special };
    }
    // Build PERK_NAMES array (indexed by perk type ID)
    for (let i = 0; i <= maxPerkId; i++) {
        if (PERKS[i]) {
            // Convert display name to enum-style name (strip spaces, special chars)
            // Use the raw name from the enum if available, otherwise derive from display name
            PERK_NAMES[i] = PERKS[i].name;
        } else {
            PERK_NAMES[i] = 'DELETED';
        }
    }

    // Items: build ENERGY_ITEMS, ITEM_SKILL_MODIFIERS, ARTIFACTS
    const ENERGY_ITEMS = {};
    const ITEM_SKILL_MODIFIERS = {};
    const ARTIFACTS = [];
    for (const [idStr, item] of Object.entries(jsonData.items)) {
        const id = parseInt(idStr);
        if (item.energy) {
            ENERGY_ITEMS[id] = item.energy;
        }
        if (item.artifact) {
            ARTIFACTS.push(id);
        }
        if (item.skillModifiers && Object.keys(item.skillModifiers).length > 0) {
            const mods = {};
            for (const [skillIdStr, mod] of Object.entries(item.skillModifiers)) {
                mods[parseInt(skillIdStr)] = mod;
            }
            ITEM_SKILL_MODIFIERS[id] = mods;
        }
    }

    // Boss unlocks: convert string keys to integer keys
    const BOSS_UNLOCKS = {};
    for (const [bossIdStr, hiddenId] of Object.entries(jsonData.bossUnlocks)) {
        BOSS_UNLOCKS[parseInt(bossIdStr)] = hiddenId;
    }

    // Zones: already in the right format (numeric IDs in arrays)
    const ZONES = jsonData.zones;

    // Constants
    const c = jsonData.constants;

    return {
        // Data
        ZONES,
        PERKS,
        SKILL_XP_MULT,
        SKILL_NAMES,
        SKILLS,
        PERK_NAMES,
        ENERGY_ITEMS,
        ITEM_SKILL_MODIFIERS,
        BOSS_UNLOCKS,
        ARTIFACTS,

        // Constants (unpacked to match gameData.js exports)
        BASE_COST: c.baseCost,
        ZONE_COST_EXPONENT: c.zoneCostExponent,
        BOSS_COST_EXPONENT: c.bossCostExponent,
        ZONE_SPEEDUP_BASE: c.zoneSpeedupBase,
        SKILL_LEVEL_EXPONENT: c.skillLevelExponent,
        SKILL_XP_EXPONENT: c.skillXpExponent,
        STARTING_ENERGY: c.startingEnergy,
        HASTE_MULT: c.hasteMult,
        MAGIC_RING_MULT: c.magicRingMult,
        BOTTLED_LIGHTNING_MULT: c.bottledLightningMult,
        GOTTA_GO_FAST_BASE: c.gottaGoFastBase,
        PERKY_BASE: c.perkyBase,
        MANDATORY_SCHMANDATORY_MULT: c.mandatorySchmandatoryMult,
        SPITE_THE_GODS_MULT: c.spiteTheGodsMult,
        DIVINE_KNOWLEDGE_MULT: c.divineKnowledgeMult,
        DIVINER_KNOWLEDGE_MULT: c.divinerKnowledgeMult,
        DEENERGIZED_BASE: c.deenergizedBase,

        // Enums (pass-through from gameData.js for convenience)
        SkillType,
        PerkType,
        TaskType,
        ItemType,

        // Helpers
        getMandatoryTasks: (zone) => zone.tasks.filter(t =>
            t.type === TaskType.Mandatory || t.type === TaskType.Travel
        ),

        // Metadata
        version: jsonData.version,
    };
}

/**
 * Build an array of task patches from game data zones, suitable for
 * sending to the JTA iframe via the jta:patchTaskDefs event.
 *
 * Each patch contains the full task definition so the iframe's task
 * objects are completely replaced (not partially updated).
 *
 * @param {Array} zones - ZONES array (from loadGameDataFromJson or raw JSON)
 * @returns {Array} Patches array for jta:patchTaskDefs
 */
export function buildTaskPatches(zones) {
    const patches = [];
    for (const zone of zones) {
        for (const task of zone.tasks) {
            patches.push({
                id: task.id,
                name: task.name,
                type: task.type,
                costMult: task.costMult,
                skills: task.skills,
                xpMult: task.xpMult,
                maxReps: task.maxReps,
                perk: task.perk,
                item: task.item,
                hidden: task.hidden || false,
            });
        }
    }
    return patches;
}

/**
 * Load game data JSON from a URL.
 *
 * @param {string} url - URL to the game data JSON file
 * @returns {Promise<object>} Loaded game data in simulator-compatible format
 */
export async function loadGameDataFromUrl(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to load game data from ${url}: ${response.status}`);
    }
    const jsonData = await response.json();
    return loadGameDataFromJson(jsonData);
}

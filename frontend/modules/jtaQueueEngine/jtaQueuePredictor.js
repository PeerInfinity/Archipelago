// JTA Queue Predictor - predicts energy cost, time, and skill gains for queue entries
// Uses the JTA simulator's exported calculation functions with a rolling state clone

import {
    ZONES, ENERGY_ITEMS, ITEM_SKILL_MODIFIERS, SKILL_NAMES,
} from '../jta-randomizer/gameData.js';
import {
    calcTaskEnergyCost, calcTaskEnergyCostSingleRep, calcTaskTicks, calcXpNeeded,
    applyTaskXp, createInitialState,
} from '../jta-randomizer/simulator.js';
import { JTAActionType } from './jtaActionDefs.js';

// Build a lookup: taskId -> { task, zoneId }
const TASK_LOOKUP = new Map();
for (const zone of ZONES) {
    for (const task of zone.tasks) {
        TASK_LOOKUP.set(task.id, { task, zoneId: zone.id });
    }
}

/**
 * Convert a jta:detailedStateSnapshot into the simulator's state format.
 * @param {object} snapshot - From jta:detailedStateSnapshot event data
 * @returns {object} Simulator-compatible state object
 */
export function convertToSimState(snapshot) {
    const state = createInitialState();

    // Energy
    state.maxEnergy = snapshot.maxEnergy || 100;
    state.currentEnergy = snapshot.currentEnergy || state.maxEnergy;
    state.currentZone = snapshot.currentZone || 0;
    state.highestZone = snapshot.highestZone ?? -1;
    state.highestZoneFullyCompleted = snapshot.highestZoneFullyCompleted ?? -1;

    // Skills
    if (snapshot.skills) {
        for (const [skillId, data] of Object.entries(snapshot.skills)) {
            const id = Number(skillId);
            state.skillLevels[id] = data.level || 0;
            state.skillXp[id] = data.xp || 0;
            // Game uses multiplicative speed_modifier (base=1), simulator uses additive (base=0)
            state.skillSpeedModifiers[id] = (data.speedModifier ?? 1) - 1;
        }
    }

    // Perks
    state.perks = new Set(snapshot.perks || []);

    // Power / Attunement
    state.power = snapshot.power || 0;
    state.attunement = snapshot.attunement || 0;

    // Items
    state.items = new Map();
    if (snapshot.items) {
        for (const [itemType, count] of Object.entries(snapshot.items)) {
            state.items.set(Number(itemType), count);
        }
    }

    // Artifacts
    state.scrollsOfHaste = snapshot.queuedScrollsOfHaste || 0;
    state.magicRings = snapshot.queuedMagicRings || 0;
    state.bottledLightnings = snapshot.queuedLightning || 0;

    // Prestige
    state.prestigeUnlocks = new Set(snapshot.prestigeUnlocks || []);
    state.prestigeRepeatables = new Map();
    if (snapshot.prestigeRepeatables) {
        for (const [type, level] of Object.entries(snapshot.prestigeRepeatables)) {
            state.prestigeRepeatables.set(Number(type), level);
        }
    }

    return state;
}

/**
 * @typedef {object} EntryPrediction
 * @property {string} entryId
 * @property {number} energyCost - Total energy for all loops
 * @property {number} energyRemaining - Energy after this entry
 * @property {number} ticks - Total ticks for all loops
 * @property {number} timeMs - Estimated wall-clock time
 * @property {boolean} canComplete - Whether there's enough energy
 * @property {string} [note] - Special note (e.g., "resets state")
 */

const TICK_MS = 66.6;

/**
 * Predict energy cost and remaining energy for each queue entry,
 * walking the queue sequentially with a rolling state clone.
 *
 * @param {import('../shared/actionQueue/actionQueue.js').ActionQueue} queue
 * @param {object} simState - From convertToSimState()
 * @returns {Map<string, EntryPrediction>} Map of entryId -> prediction
 */
export function predictQueue(queue, simState) {
    const predictions = new Map();
    const entries = queue.getEntries();
    let remainingEnergy = simState.maxEnergy;

    // Deep-clone mutable parts of state for rolling simulation
    const state = cloneSimState(simState);

    for (const entry of entries) {
        if (entry.disabled) continue;

        const pred = predictEntry(entry, state, remainingEnergy);
        predictions.set(entry.entryId, pred);
        remainingEnergy = pred.energyRemaining;

        // If prestige, we can't predict further meaningfully
        if (entry.actionType === JTAActionType.PRESTIGE) break;
    }

    return predictions;
}

/**
 * Predict a single queue entry and mutate rolling state.
 */
function predictEntry(entry, state, remainingEnergy) {
    switch (entry.actionType) {
        case JTAActionType.CLICK_TASK:
            return predictTask(entry, state, remainingEnergy);
        case JTAActionType.USE_ITEM:
            return predictItem(entry, state, remainingEnergy, false);
        case JTAActionType.USE_ALL_ITEMS:
            return predictItem(entry, state, remainingEnergy, true);
        case JTAActionType.PRESTIGE:
            return {
                entryId: entry.entryId,
                energyCost: 0,
                energyRemaining: remainingEnergy,
                ticks: 0,
                timeMs: 0,
                canComplete: true,
                note: 'Resets state',
            };
        default:
            return {
                entryId: entry.entryId,
                energyCost: 0,
                energyRemaining: remainingEnergy,
                ticks: 0,
                timeMs: 0,
                canComplete: true,
            };
    }
}

/**
 * Snapshot skill levels + fractional progress for a set of skill IDs.
 * Fractional level = level + (currentXp / xpNeeded).
 */
function snapshotSkills(state, skillIds) {
    const snap = {};
    for (const skill of skillIds) {
        const level = state.skillLevels[skill] || 0;
        const xp = state.skillXp[skill] || 0;
        const needed = calcXpNeeded(level, skill);
        snap[skill] = level + (needed > 0 ? xp / needed : 0);
    }
    return snap;
}

/**
 * Compute skill gains: { skillId: { name, gained } } where gained is fractional levels.
 */
function computeSkillGains(beforeSnap, afterState, skillIds) {
    const gains = {};
    for (const skill of skillIds) {
        const before = beforeSnap[skill] || 0;
        const level = afterState.skillLevels[skill] || 0;
        const xp = afterState.skillXp[skill] || 0;
        const needed = calcXpNeeded(level, skill);
        const after = level + (needed > 0 ? xp / needed : 0);
        const gained = after - before;
        if (gained > 0.001) {
            gains[skill] = { name: SKILL_NAMES[skill] || `Skill ${skill}`, gained };
        }
    }
    return gains;
}

/**
 * Predict a clickTask entry.
 */
function predictTask(entry, state, remainingEnergy) {
    const lookup = TASK_LOOKUP.get(entry.actionId);
    if (!lookup) {
        return {
            entryId: entry.entryId,
            energyCost: 0,
            energyRemaining: remainingEnergy,
            ticks: 0,
            timeMs: 0,
            canComplete: true,
            skillGains: {},
            note: 'Unknown task',
        };
    }

    const { task, zoneId } = lookup;
    const loops = entry.loops || 1;

    // Cost for one full task completion (all maxReps), handles MTC+single-tick edge case
    const costPerCompletion = calcTaskEnergyCost(task, zoneId, state);
    const ticksPerRep = calcTaskTicks(task, zoneId, state) * task.maxReps;

    const totalCost = costPerCompletion * loops;
    const totalTicks = ticksPerRep * loops;
    const canComplete = remainingEnergy >= totalCost;

    // Snapshot skills before XP application
    const before = snapshotSkills(state, task.skills);

    // Apply XP to rolling state (mutates state for subsequent predictions)
    applyTaskXp(task, zoneId, state, loops);

    // Compute skill gains
    const skillGains = computeSkillGains(before, state, task.skills);

    return {
        entryId: entry.entryId,
        energyCost: totalCost,
        energyRemaining: remainingEnergy - totalCost,
        ticks: totalTicks,
        timeMs: totalTicks * TICK_MS,
        canComplete,
        skillGains,
    };
}

/**
 * Predict a useItem/useAllItems entry.
 * Items are instant (0 ticks). Energy items restore energy.
 * Skill modifier items boost speed (applied to rolling state).
 */
function predictItem(entry, state, remainingEnergy, useAll) {
    const itemType = entry.actionId;
    const count = useAll ? (state.items.get(itemType) || 0) : (entry.loops || 1);

    let energyGain = 0;
    const energyValue = ENERGY_ITEMS[itemType];
    if (energyValue) {
        energyGain = energyValue * count;
    }

    // Apply skill speed modifiers to rolling state
    const mods = ITEM_SKILL_MODIFIERS[itemType];
    if (mods) {
        for (const [skill, bonus] of Object.entries(mods)) {
            const skillId = Number(skill);
            state.skillSpeedModifiers[skillId] = (state.skillSpeedModifiers[skillId] || 0) + bonus * count;
        }
    }

    // Deduct items from rolling state
    const current = state.items.get(itemType) || 0;
    state.items.set(itemType, Math.max(0, current - count));

    return {
        entryId: entry.entryId,
        energyCost: -energyGain,
        energyRemaining: remainingEnergy + energyGain,
        ticks: 0,
        timeMs: 0,
        canComplete: true,
    };
}

/**
 * From a raw detailedStateSnapshot (jta:detailedStateSnapshot.state),
 * extract fractional skill levels for all skills.
 * @param {object} gameState - Raw state from readDetailedGameState()
 * @returns {object} { skillId: fractionalLevel }
 */
export function snapshotSkillsFromGameState(gameState) {
    const snap = {};
    if (!gameState?.skills) return snap;
    for (const [skillId, data] of Object.entries(gameState.skills)) {
        const id = Number(skillId);
        const level = data.level || 0;
        const xp = data.xp || 0;
        const needed = calcXpNeeded(level, id);
        snap[id] = level + (needed > 0 ? xp / needed : 0);
    }
    return snap;
}

/**
 * Compute skill gains between two { skillId: fractionalLevel } snapshots.
 * @param {object} before
 * @param {object} after
 * @returns {object} { skillId: { name, gained } }
 */
export function computeSkillGainsBetween(before, after) {
    const gains = {};
    const allSkills = new Set([
        ...Object.keys(before).map(Number),
        ...Object.keys(after).map(Number),
    ]);
    for (const skill of allSkills) {
        const beforeVal = before[skill] || 0;
        const afterVal = after[skill] || 0;
        const gained = afterVal - beforeVal;
        if (gained > 0.001) {
            gains[skill] = { name: SKILL_NAMES[skill] || `Skill ${skill}`, gained };
        }
    }
    return gains;
}

/**
 * Deep-clone the mutable parts of a sim state for rolling prediction.
 */
function cloneSimState(state) {
    return {
        ...state,
        skillLevels: { ...state.skillLevels },
        skillXp: { ...state.skillXp },
        skillSpeedModifiers: { ...state.skillSpeedModifiers },
        perks: new Set(state.perks),
        items: new Map(state.items),
        bossesDefeated: new Set(state.bossesDefeated || []),
        unlockedHiddenTasks: new Set(state.unlockedHiddenTasks || []),
        itemsFoundThisReset: [...(state.itemsFoundThisReset || [])],
        prestigeUnlocks: new Set(state.prestigeUnlocks),
        prestigeRepeatables: new Map(state.prestigeRepeatables),
    };
}

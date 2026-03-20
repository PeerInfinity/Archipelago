/**
 * JTA Simulator Comparison
 * Converts live game state to simulator format and compares formula outputs.
 */

import {
    calcTaskCost, calcProgressPerTick, calcTaskTicks,
    isSingleTick, calcEnergyDrainPerTick, calcTaskXp,
    calcXpNeeded, createInitialState,
} from './simulator.js';

import {
    SkillType, PerkType, ItemType, TaskType, ZONES,
    PrestigeUnlockType, PrestigeRepeatableType,
    SKILL_NAMES,
} from './gameData.js';

/**
 * Convert a detailed game state snapshot (from jtaGameClient) to the
 * simulator's internal state format.
 * @param {object} gs - Detailed game state from jta:detailedStateSnapshot
 * @returns {object} - State compatible with simulator formula functions
 */
export function gameStateToSimState(gs) {
    const state = createInitialState();

    // Zone/energy
    state.currentZone = gs.currentZone;
    state.highestZone = gs.highestZone;
    state.highestZoneFullyCompleted = gs.highestZoneFullyCompleted ?? -1;
    state.maxEnergy = gs.maxEnergy;

    // Skills
    if (gs.skills) {
        for (const [skillTypeStr, skillData] of Object.entries(gs.skills)) {
            const skillType = Number(skillTypeStr);
            state.skillLevels[skillType] = skillData.level;
            state.skillXp[skillType] = skillData.xp;
            if (skillData.speedModifier !== 1) {
                state.skillSpeedModifiers[skillType] = skillData.speedModifier - 1;
            }
        }
    }

    // Perks (game sends array of owned perk type IDs)
    if (Array.isArray(gs.perks)) {
        for (const perkType of gs.perks) {
            state.perks.add(perkType);
        }
    }

    // Items
    if (gs.items) {
        for (const [itemTypeStr, count] of Object.entries(gs.items)) {
            state.items.set(Number(itemTypeStr), count);
        }
    }

    // Power / Attunement
    state.power = gs.power || 0;
    state.attunement = gs.attunement || 0;

    // Artifacts
    state.scrollsOfHaste = gs.queuedScrollsOfHaste || 0;
    state.magicRings = gs.queuedMagicRings || 0;
    state.bottledLightnings = gs.queuedLightning || 0;

    // Prestige
    if (Array.isArray(gs.prestigeUnlocks)) {
        for (const unlock of gs.prestigeUnlocks) {
            state.prestigeUnlocks.add(unlock);
        }
    }
    if (gs.prestigeRepeatables) {
        for (const [typeStr, level] of Object.entries(gs.prestigeRepeatables)) {
            state.prestigeRepeatables.set(Number(typeStr), level);
        }
    }

    return state;
}

/**
 * Task type display names
 */
const TASK_TYPE_NAMES = {
    [TaskType.Normal]: 'Normal',
    [TaskType.Mandatory]: 'Mandatory',
    [TaskType.Travel]: 'Travel',
    [TaskType.Boss]: 'Boss',
    [TaskType.Prestige]: 'Prestige',
};

/**
 * Compare simulator predictions against game task data for the current zone.
 * @param {object} gs - Detailed game state from jta:detailedStateSnapshot
 * @returns {object} - { zoneId, zoneName, simState, tasks: [...comparisons] }
 */
export function compareZoneTasks(gs) {
    const simState = gameStateToSimState(gs);
    const zoneId = gs.currentZone;
    const zone = ZONES[zoneId];

    if (!zone) {
        return { zoneId, zoneName: `Zone ${zoneId}`, simState, tasks: [], error: `Zone ${zoneId} not found in gameData.js` };
    }

    const comparisons = [];

    // Match game's live tasks with our static zone data
    for (const gameTask of (gs.tasks || [])) {
        // Find matching task definition in our gameData
        const simTask = zone.tasks.find(t => t.id === gameTask.id);
        if (!simTask) {
            comparisons.push({
                id: gameTask.id,
                name: gameTask.name,
                error: `Task ${gameTask.id} not in simulator's zone data`,
            });
            continue;
        }

        // Run simulator formulas
        const simCost = calcTaskCost(simTask, zoneId);
        const simProgress = calcProgressPerTick(simTask, zoneId, simState);
        const simSingleTick = isSingleTick(simTask, zoneId, simState);
        const simTicks = calcTaskTicks(simTask, zoneId, simState);
        const simDrain = calcEnergyDrainPerTick(simTask, zoneId, simState, simSingleTick);
        const simEnergyCostPerRep = simTicks * simDrain;
        const simXpPerRep = calcTaskXp(simTask, zoneId, simState, gameTask.xpBoosted);

        comparisons.push({
            id: gameTask.id,
            name: gameTask.name,
            type: TASK_TYPE_NAMES[gameTask.type] || `Type${gameTask.type}`,
            skills: gameTask.skills.map(s => SKILL_NAMES[s] || `Skill${s}`).join(', '),
            reps: `${gameTask.reps}/${gameTask.maxReps}`,
            hasted: gameTask.hasted,
            xpBoosted: gameTask.xpBoosted,
            lightning: gameTask.lightning,
            // Simulator predictions
            sim: {
                cost: simCost,
                progressPerTick: simProgress,
                singleTick: simSingleTick,
                ticks: simTicks,
                energyDrainPerTick: simDrain,
                energyCostPerRep: simEnergyCostPerRep,
                xpPerRep: simXpPerRep,
            },
        });
    }

    return {
        zoneId,
        zoneName: zone.name,
        simState,
        tasks: comparisons,
    };
}

/**
 * Generate a concise state summary for display.
 * @param {object} gs - Detailed game state
 * @param {object} simState - Converted simulator state
 * @returns {object}
 */
export function stateSummary(gs, simState) {
    const skillSummary = {};
    if (gs.skills) {
        for (const [typeStr, data] of Object.entries(gs.skills)) {
            const type = Number(typeStr);
            const name = SKILL_NAMES[type];
            if (name && !name.startsWith('REMOVED')) {
                skillSummary[name] = data.level;
            }
        }
    }

    return {
        zone: `${gs.currentZone} (highest: ${gs.highestZone}, fully: ${gs.highestZoneFullyCompleted})`,
        energy: `${Math.floor(gs.currentEnergy)} / ${gs.maxEnergy}`,
        resets: gs.energyResetCount,
        perks: gs.perks?.length ?? 0,
        power: gs.power,
        attunement: gs.attunement,
        skills: skillSummary,
        prestige: gs.prestigeCount || 0,
        artifacts: {
            haste: gs.queuedScrollsOfHaste || 0,
            magicRing: gs.queuedMagicRings || 0,
            lightning: gs.queuedLightning || 0,
        },
    };
}

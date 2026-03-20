/**
 * JTA Game Calculation Functions - Pure Math (No Global State)
 *
 * These are the exact formulas from the game's simulation.ts, extracted
 * as pure functions that take state as parameters instead of reading
 * from global GAMESTATE. Both the game engine and the cost planner
 * can use these to guarantee identical calculations.
 *
 * Constants match the game's values exactly.
 */

// --- Constants (matching simulation.ts / simulation_constants.ts) ---
export const BASE_COST = 10;
export const ZONE_COST_EXPONENT = 2.2;
export const BOSS_COST_EXPONENT = 4;
export const SKILL_LEVEL_EXPONENT = 1.01;
export const SKILL_XP_EXPONENT = 1.02;
export const SKILL_XP_BASE = 10;
export const XP_PER_TICK_MULT = 8;
export const ZONE_SPEEDUP_BASE = 1.05;
export const MAJOR_TIME_COMPRESSION_EFFECT = 1.5;
export const UNIFIED_THEORY_OF_MAGIC_EFFECT = 0.02;
export const HASTE_MULT = 5;
export const BOTTLED_LIGHTNING_MULT = 2;

// Perk types used in formulas
export const PerkType = {
    Writing: 1,
    MinorTimeCompression: 7,
    HighAltitudeClimbing: 8,
    Attunement: 11,
    ReflectionsOnTheJourney: 16,
    MajorTimeCompression: 23,
    UnifiedTheoryOfMagic: 27,
    GazedBeyondTheVeil: 33,
};

// Task types
export const TaskType = {
    Normal: 0,
    Travel: 1,
    Mandatory: 2,
    Prestige: 3,
    Boss: 4,
};

// --- Pure calculation functions ---

/**
 * Calculate task base cost (matching simulation.ts calcTaskCost)
 * @param {number} costMult - task_definition.cost_multiplier
 * @param {number} zoneId - task_definition.zone_id
 * @param {number} taskType - task_definition.type
 */
export function calcTaskCost(costMult, zoneId, taskType) {
    const exp = taskType === TaskType.Boss ? BOSS_COST_EXPONENT : ZONE_COST_EXPONENT;
    return BASE_COST * costMult * Math.pow(exp, zoneId);
}

/**
 * Calculate skill progress multiplier from level (matching calcSkillTaskProgressMultiplierFromLevel)
 */
export function calcProgressFromLevel(level) {
    return Math.pow(SKILL_LEVEL_EXPONENT, level);
}

/**
 * Calculate task progress per tick (matching calcTaskProgressMultiplier)
 * @param {number[]} skills - task skill types
 * @param {object} state - { skillLevels, perks (Set or Array), highestZoneFullyCompleted, ... }
 * @param {number} zoneId - task zone
 * @param {number} taskType - task type
 * @param {object} [perkDefs] - perk definitions for skill modifiers
 */
export function calcTaskProgressPerTick(skills, state, zoneId, taskType, perkDefs) {
    let mult = 1;

    // Skill level multiplier (geometric mean for multi-skill)
    let skillLevelMult = 1;
    for (const skill of skills) {
        const level = state.skillLevels?.[skill] || 0;
        skillLevelMult *= calcProgressFromLevel(level);
    }
    if (skills.length > 0) {
        mult *= Math.pow(skillLevelMult, 1 / skills.length);
    }

    // Per-skill modifiers (perk skill modifiers, speed_modifier)
    if (perkDefs) {
        const perks = state.perks instanceof Set ? state.perks : new Set(state.perks || []);
        for (const skill of skills) {
            for (const perkId of perks) {
                const perk = perkDefs[perkId];
                if (!perk) continue;
                const mod = perk.skillModifiers?.[skill];
                if (mod) mult *= (1 + mod);
            }
        }
    }

    // Zone speedup
    mult *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

    return mult;
}

/**
 * Check if task completes in a single tick
 */
export function isSingleTick(addedProgress, cost) {
    return addedProgress >= cost;
}

/**
 * Calculate energy drain per tick (matching calcEnergyDrainPerTick)
 * @param {number} zoneId
 * @param {boolean} singleTick - whether this tick completes the full cost
 * @param {object} state - { perks, highestZone }
 */
export function calcEnergyDrainPerTick(zoneId, singleTick, state) {
    const perks = state.perks instanceof Set ? state.perks : new Set(state.perks || []);
    let drain = 1;

    if (singleTick && perks.has(PerkType.MinorTimeCompression)) {
        drain *= 0.2;
    }
    if (perks.has(PerkType.HighAltitudeClimbing)) {
        drain *= 0.8;
    }
    if (perks.has(PerkType.ReflectionsOnTheJourney)) {
        const zoneDiff = Math.max(0, (state.highestZone || 0) - zoneId);
        drain *= Math.pow(0.95, zoneDiff);
    }
    drain *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

    return drain;
}

/**
 * Calculate skill XP gained per tick (matching calcSkillXp)
 * @param {number} progressThisTick - actual progress added this tick
 * @param {number} xpMult - task_definition.xp_mult
 * @param {number} zoneId
 * @param {object} state - { perks }
 */
export function calcSkillXpPerTick(progressThisTick, xpMult, zoneId, state) {
    const perks = state.perks instanceof Set ? state.perks : new Set(state.perks || []);
    let xp = progressThisTick * XP_PER_TICK_MULT * xpMult;
    if (perks.has(PerkType.Writing)) xp *= 1.5;
    if (perks.has(PerkType.GazedBeyondTheVeil)) xp *= 2;
    xp *= Math.pow(1.25, zoneId);
    return xp;
}

/**
 * Calculate XP needed to reach the next level (matching calcSkillXpNeededAtLevel)
 * @param {number} level - current level
 * @param {number} skillXpMult - SKILL_DEFINITIONS[type].xp_needed_mult
 */
export function calcSkillXpNeeded(level, skillXpMult) {
    return Math.pow(SKILL_XP_EXPONENT, level) * SKILL_XP_BASE * skillXpMult;
}

/**
 * Execute a task tick-by-tick with an energy budget.
 * Uses the exact same formulas as the game engine.
 *
 * @param {object} taskDef - { costMult, xpMult, maxReps, skills, type, zoneId (or passed separately) }
 * @param {number} zoneId
 * @param {object} state - { skillLevels: {id: level}, skillXp: {id: xp}, perks, highestZone, ... }
 *   State is MUTATED (skill levels/XP updated). Clone before calling if you need immutability.
 * @param {object} ctx - { SKILL_XP_MULT: {id: mult}, PERKS: {...} }
 * @param {number} energyBudget
 * @returns {{ energyUsed: number, completed: boolean }}
 */
export function executeTask(taskDef, zoneId, state, ctx, energyBudget) {
    const cost = calcTaskCost(taskDef.costMult, zoneId, taskDef.type);
    let energyUsed = 0;
    let repsCompleted = 0;
    let progress = 0.01; // Game starts each rep at 0.01

    for (let tick = 0; tick < 100000 && repsCompleted < taskDef.maxReps; tick++) {
        const progressPerTick = calcTaskProgressPerTick(
            taskDef.skills, state, zoneId, taskDef.type, ctx?.PERKS
        );
        const addedProgress = Math.min(progressPerTick, cost - progress);
        progress += addedProgress;
        const single = isSingleTick(addedProgress, cost);
        const drain = calcEnergyDrainPerTick(zoneId, single, state);

        if (energyUsed + drain > energyBudget) break;
        energyUsed += drain;

        // Apply XP per tick
        if (taskDef.skills.length > 0) {
            const xp = calcSkillXpPerTick(addedProgress, taskDef.xpMult, zoneId, state);
            for (const skill of taskDef.skills) {
                if (state.skillLevels[skill] === undefined) {
                    state.skillLevels[skill] = 0;
                    state.skillXp[skill] = 0;
                }
                state.skillXp[skill] += xp;
                const skillXpMult = ctx?.SKILL_XP_MULT?.[skill] || 1;
                let needed = calcSkillXpNeeded(state.skillLevels[skill], skillXpMult);
                while (state.skillXp[skill] >= needed) {
                    state.skillXp[skill] -= needed;
                    state.skillLevels[skill]++;
                    needed = calcSkillXpNeeded(state.skillLevels[skill], skillXpMult);
                }
            }
        }

        if (progress >= cost) {
            repsCompleted++;
            progress = 0.01;
        }
    }

    return {
        energyUsed,
        completed: repsCompleted >= taskDef.maxReps,
    };
}

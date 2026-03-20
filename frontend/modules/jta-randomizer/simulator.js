/**
 * Journey to Ascension - Game Simulator
 * Simulates game progression to estimate resets needed per zone
 */

import {
    ZONES, PERKS, PerkType, SkillType, TaskType,
    SKILL_XP_MULT, SKILL_NAMES, PERK_NAMES, getMandatoryTasks,
    ENERGY_ITEMS, ItemType, ARTIFACTS, HASTE_MULT, MAGIC_RING_MULT,
    BOTTLED_LIGHTNING_MULT, ITEM_SKILL_MODIFIERS, BOSS_UNLOCKS,
    PrestigeUnlockType, PrestigeRepeatableType,
    GOTTA_GO_FAST_BASE, MANDATORY_SCHMANDATORY_MULT,
    SPITE_THE_GODS_MULT, DIVINE_KNOWLEDGE_MULT, DIVINER_KNOWLEDGE_MULT,
} from './gameData.js';

// Game constants from simulation.ts / simulation_constants.ts
const BASE_COST = 10;
const ZONE_COST_EXPONENT = 2.2;
const ZONE_SPEEDUP_BASE = 1.05;
const SKILL_LEVEL_EXPONENT = 1.01;
const SKILL_XP_EXPONENT = 1.02;
const TICK_RATE_MS = 66.6;
const STARTING_ENERGY = 100;
const ENERGETIC_MEMORY_MULT = 0.1;
const REFLECTIONS_BASE = 0.95;
const REFLECTIONS_BOOSTED_BASE = 0.9;
const MAJOR_TIME_COMPRESSION_EFFECT = 1.5;
const UNIFIED_THEORY_OF_MAGIC_EFFECT = 0.02;
const COMPULSIVE_NOTE_TAKING_AMOUNT = 2;
const NOTE_ITEMS = [ItemType.ScrollOfHaste, ItemType.Book, ItemType.CraftingRecipe, ItemType.DivineNotes, ItemType.GriffinQuill];

// Prestige state helpers
function hasPrestigeUnlock(state, type) {
    return state.prestigeUnlocks.has(type);
}

function getPrestigeLevel(state, type) {
    return state.prestigeRepeatables.get(type) || 0;
}

function getReflectionsBase(state) {
    return hasPrestigeUnlock(state, PrestigeUnlockType.LookInTheMirror)
        ? REFLECTIONS_BOOSTED_BASE
        : REFLECTIONS_BASE;
}

function getAttunementSkills(state) {
    const skills = [SkillType.Magic, SkillType.Study];
    if (hasPrestigeUnlock(state, PrestigeUnlockType.FullyAttuned)) {
        skills.push(SkillType.Search);
    }
    if (hasPrestigeUnlock(state, PrestigeUnlockType.CraftingBreakthrough)) {
        skills.push(SkillType.Crafting);
    }
    return skills;
}

/**
 * Calculate the base cost of a task
 */
export function calcTaskCost(task, zoneId) {
    const exp = task.type === TaskType.Boss ? 4 : ZONE_COST_EXPONENT;
    return BASE_COST * task.costMult * Math.pow(exp, zoneId);
}

/**
 * Calculate progress per tick (determines how many ticks to complete)
 */
export function calcProgressPerTick(task, zoneId, state) {
    let mult = 1.0;

    // Skill level bonus (geometric mean for multi-skill tasks)
    let skillMult = 1.0;
    for (const skill of task.skills) {
        const level = state.skillLevels[skill] || 0;
        skillMult *= Math.pow(SKILL_LEVEL_EXPONENT, level);
    }
    mult *= Math.pow(skillMult, 1 / task.skills.length);

    // Perk bonuses + item speed modifiers (per-skill, matching game's calcSkillTaskProgressWithoutLevel)
    const attunementSkills = getAttunementSkills(state);
    let hasAttunementSkill = false;
    for (const skill of task.skills) {
        // Perk skill modifiers
        for (const perkId of state.perks) {
            const perk = PERKS[perkId];
            if (perk && perk.skillModifiers[skill]) {
                mult *= (1 + perk.skillModifiers[skill]);
            }
        }

        // Item speed modifiers (from consumed items)
        const speedMod = state.skillSpeedModifiers[skill] || 0;
        if (speedMod > 0) {
            mult *= (1 + speedMod);
        }

        // Power bonus (for Combat/Fortitude)
        if (skill === SkillType.Combat || skill === SkillType.Fortitude) {
            mult *= (1 + state.power / 100);
        }

        // Track attunement skills (applied once after loop to avoid stacking)
        if (attunementSkills.includes(skill)) {
            hasAttunementSkill = true;
        }

        // Spite The Gods prestige repeatable (Ascension + Charisma)
        if (skill === SkillType.Ascension || skill === SkillType.Charisma) {
            mult *= 1 + getPrestigeLevel(state, PrestigeRepeatableType.SpiteTheGods) * SPITE_THE_GODS_MULT;
        }
    }

    // Apply attunement bonus once (unconditional, matching game's calcSkillTaskProgressWithoutLevel)
    if (hasAttunementSkill && state.attunement > 0) {
        mult *= (1 + state.attunement / 1000);
    }

    // GottaGoFast prestige repeatable
    mult *= Math.pow(GOTTA_GO_FAST_BASE, getPrestigeLevel(state, PrestigeRepeatableType.GottaGoFast));

    // Zone speedup
    mult *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

    // Major Time Compression - doubles speed for non-single-tick tasks
    // (but also doubles energy cost, so net effect on energy is neutral for multi-tick)
    if (state.perks.has(PerkType.MajorTimeCompression)) {
        mult *= MAJOR_TIME_COMPRESSION_EFFECT;
    }

    // Unified Theory of Magic
    if (state.perks.has(PerkType.UnifiedTheoryOfMagic)) {
        mult *= Math.pow(1 + UNIFIED_THEORY_OF_MAGIC_EFFECT, state.highestZoneFullyCompleted + 1);
    }

    // MandatorySchmandatory prestige repeatable - bonus for mandatory/travel/prestige tasks
    const mandatoryish = task.type === TaskType.Travel || task.type === TaskType.Mandatory || task.type === TaskType.Prestige;
    if (mandatoryish) {
        mult *= 1 + getPrestigeLevel(state, PrestigeRepeatableType.MandatorySchmandatory) * MANDATORY_SCHMANDATORY_MULT;
    }

    // BottledLightning - 2x speed for boss tasks
    if (task.type === TaskType.Boss && state.bottledLightnings > 0) {
        mult *= BOTTLED_LIGHTNING_MULT;
    }

    return mult;
}

/**
 * Calculate ticks needed to complete a task
 */
export function calcTaskTicks(task, zoneId, state) {
    const cost = calcTaskCost(task, zoneId);
    const progress = calcProgressPerTick(task, zoneId, state);
    return Math.ceil(cost / progress);
}

/**
 * Check if a task completes in a single tick
 */
export function isSingleTick(task, zoneId, state) {
    const cost = calcTaskCost(task, zoneId);
    const progress = calcProgressPerTick(task, zoneId, state);
    return progress >= cost;
}

/**
 * Calculate energy drain per tick for a task
 */
export function calcEnergyDrainPerTick(task, zoneId, state, singleTick) {
    let drain = 1;

    // MasteryOfTime prestige - single tick tasks cost 0 energy
    if (singleTick && hasPrestigeUnlock(state, PrestigeUnlockType.MasteryOfTime)) {
        return 0;
    }

    // Minor Time Compression - single tick tasks cost 80% less energy
    if (singleTick && state.perks.has(PerkType.MinorTimeCompression)) {
        drain *= 0.2;
    }

    // High Altitude Climbing - 20% energy reduction
    if (state.perks.has(PerkType.HighAltitudeClimbing)) {
        drain *= 0.8;
    }

    // Reflections on the Journey - reduce drain based on zone difference
    // Base is 0.95 normally, 0.9 with LookInTheMirror prestige
    if (state.perks.has(PerkType.ReflectionsOnTheJourney)) {
        const zoneDiff = state.highestZone - zoneId;
        drain *= Math.pow(getReflectionsBase(state), zoneDiff);
    }

    // Zone scaling - later zones cost more energy per tick
    drain *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

    // Major Time Compression - increases drain for multi-tick tasks
    if (!singleTick && state.perks.has(PerkType.MajorTimeCompression)) {
        drain *= MAJOR_TIME_COMPRESSION_EFFECT;
    }

    return drain;
}

/**
 * Calculate energy cost for a single rep of a task
 */
export function calcTaskEnergyCostSingleRep(task, zoneId, state) {
    const singleTick = isSingleTick(task, zoneId, state);
    const ticks = calcTaskTicks(task, zoneId, state);
    const drainPerTick = calcEnergyDrainPerTick(task, zoneId, state, singleTick);
    return ticks * drainPerTick;
}

/**
 * Calculate total energy cost for a task (all reps)
 */
export function calcTaskEnergyCost(task, zoneId, state) {
    const singleRep = calcTaskEnergyCostSingleRep(task, zoneId, state);

    // If MajorTimeCompression and single-tick, all reps complete in one tick
    const singleTick = isSingleTick(task, zoneId, state);
    if (singleTick && state.perks.has(PerkType.MajorTimeCompression)) {
        // Just one tick for all reps
        const drainPerTick = calcEnergyDrainPerTick(task, zoneId, state, singleTick);
        return drainPerTick;
    }

    // Otherwise, multiply by reps
    return singleRep * task.maxReps;
}

/**
 * Calculate XP needed for next skill level
 */
export function calcXpNeeded(level, skillType) {
    const skillMult = SKILL_XP_MULT[skillType] || 1;
    return Math.pow(SKILL_XP_EXPONENT, level) * 10 * skillMult;
}

/**
 * Calculate XP gained from completing a task (one rep)
 *
 * The game awards XP every tick proportional to progress made that tick.
 * Since progress is capped at remaining cost, the sum of all progress
 * across ticks equals exactly `cost`. So total XP per rep = cost * 8 * xpMult,
 * independent of progress-per-tick and skill levels.
 *
 * @param xpBoosted - if true, applies Magic Ring 5x XP multiplier
 */
export function calcTaskXp(task, zoneId, state, xpBoosted = false) {
    const cost = calcTaskCost(task, zoneId);

    // Total XP per rep = cost * 8 * xpMult (progress cancels out across ticks)
    const XP_MULT = 8;
    let xp = cost * XP_MULT * task.xpMult;

    // Writing perk - 50% more XP
    if (state.perks.has(PerkType.Writing)) {
        xp *= 1.5;
    }

    // Gazed Beyond the Veil perk - 2x XP
    if (state.perks.has(PerkType.GazedBeyondTheVeil)) {
        xp *= 2;
    }

    // Divine Inspiration prestige unlock - 1.5x XP
    if (hasPrestigeUnlock(state, PrestigeUnlockType.DivineInspiration)) {
        xp *= 1.5;
    }

    // Divine Knowledge prestige repeatable
    xp *= 1 + getPrestigeLevel(state, PrestigeRepeatableType.DivineKnowledge) * DIVINE_KNOWLEDGE_MULT;

    // Diviner Knowledge prestige repeatable
    xp *= 1 + getPrestigeLevel(state, PrestigeRepeatableType.DivinerKnowledge) * DIVINER_KNOWLEDGE_MULT;

    // Zone scaling
    xp *= Math.pow(1.25, zoneId);

    // Magic Ring - 5x XP boost
    if (xpBoosted) {
        xp *= MAGIC_RING_MULT;
    }

    return xp;
}

/**
 * Calculate energy cost for completing mandatory tasks in a zone (all reps)
 * All reps are required to unlock the Travel task to the next zone
 */
export function calcZoneMandatoryEnergyCost(zoneId, state) {
    const zone = ZONES[zoneId];
    if (!zone) return Infinity;

    const mandatoryTasks = getMandatoryTasks(zone);
    let totalEnergy = 0;

    for (const task of mandatoryTasks) {
        totalEnergy += calcTaskEnergyCost(task, zoneId, state);
    }

    return totalEnergy;
}

/**
 * Calculate which zones are reachable with current energy and stats
 * Returns array of { zoneId, energyAtStart, energyAfterMandatory, mandatoryCost }
 * where energyAtStart is how much energy we'd have BEFORE doing that zone's mandatory tasks
 */
export function getReachableZones(startingEnergy, state, maxZone = ZONES.length - 1) {
    const reachable = [];
    let remainingEnergy = startingEnergy;

    for (let z = 0; z <= maxZone && z < ZONES.length; z++) {
        const mandatoryCost = calcZoneMandatoryEnergyCost(z, state);

        if (mandatoryCost > remainingEnergy) {
            // Can't afford this zone - stop here
            // But still add it as a "border" zone we can partially access
            reachable.push({
                zoneId: z,
                energyAtStart: remainingEnergy,
                energyAfterMandatory: 0,
                mandatoryCost,
                canComplete: false,
            });
            break;
        }

        reachable.push({
            zoneId: z,
            energyAtStart: remainingEnergy,
            energyAfterMandatory: remainingEnergy - mandatoryCost,
            mandatoryCost,
            canComplete: true,
        });

        remainingEnergy -= mandatoryCost;
    }

    return reachable;
}

/**
 * Apply XP gain from completing a task
 * Properly tracks partial XP and levels up only when enough XP is accumulated.
 * Matches the original game's leveling system.
 *
 * @param reps - number of full task completions (each completion = maxReps of the task)
 * @param actualReps - if set, use this for XP calculation instead of task.maxReps
 * @param xpBoosted - if true, applies Magic Ring 5x XP multiplier
 */
export function applyTaskXp(task, zoneId, state, reps = 1, actualReps = null, xpBoosted = false) {
    const xpPerRep = calcTaskXp(task, zoneId, state, xpBoosted);
    const repsPerCompletion = actualReps !== null ? actualReps : task.maxReps;
    const totalXp = xpPerRep * repsPerCompletion * reps;

    for (const skill of task.skills) {
        // Initialize skill if needed
        if (state.skillLevels[skill] === undefined) {
            state.skillLevels[skill] = 0;
            state.skillXp[skill] = 0;
        }

        // Add XP to the skill
        state.skillXp[skill] += totalXp;

        // Level up while we have enough XP (matching original game logic)
        let xpNeeded = calcXpNeeded(state.skillLevels[skill], skill);
        while (state.skillXp[skill] >= xpNeeded) {
            state.skillXp[skill] -= xpNeeded;
            state.skillLevels[skill] += 1;
            xpNeeded = calcXpNeeded(state.skillLevels[skill], skill);
        }
    }
}

/**
 * Calculate total XP value of a task (sum across all skills it trains)
 * Weighted by skill XP multipliers so harder-to-level skills count more
 */
export function calcTotalXpValue(task, zoneId, state) {
    const xpPerRep = calcTaskXp(task, zoneId, state);
    let totalValue = 0;
    for (const skill of task.skills) {
        // Weight by inverse of skill XP multiplier (harder skills = more valuable)
        const skillMult = SKILL_XP_MULT[skill] || 1;
        totalValue += xpPerRep / skillMult;
    }
    return totalValue;
}

/**
 * Get all tasks available for farming/grinding in a zone
 * Excludes Travel tasks (only done when ready to advance)
 */
function getGrindableTasks(zoneId, state, includeBosses = false) {
    const zone = ZONES[zoneId];
    if (!zone) return [];

    const tasks = [];
    for (const task of zone.tasks) {
        // Skip Travel tasks (only do these when advancing to next zone)
        if (task.type === TaskType.Travel) continue;

        // Handle hidden tasks - only include if unlocked
        if (task.hidden) {
            if (!state.unlockedHiddenTasks.has(task.id)) continue;
        }

        // Handle boss tasks
        if (task.type === TaskType.Boss) {
            // Skip if already defeated
            if (state.bossesDefeated.has(task.id)) continue;
            // Only include bosses if specifically requested
            if (!includeBosses) continue;
        }

        const singleRepCost = calcTaskEnergyCostSingleRep(task, zoneId, state);
        const xpPerRep = calcTaskXp(task, zoneId, state);
        const totalXpValue = calcTotalXpValue(task, zoneId, state);
        const hasPerk = task.perk !== null && !state.perks.has(task.perk);
        const itemType = task.item !== null ? getItemType(task.item) : null;
        const hasEnergyItem = itemType !== null && ENERGY_ITEMS[itemType] !== undefined;
        const hasArtifact = itemType !== null && ARTIFACTS.includes(itemType);

        tasks.push({
            task,
            zoneId,
            singleRepCost,
            fullCost: calcTaskEnergyCost(task, zoneId, state),
            xpPerRep,
            totalXpValue,
            xpPerEnergy: xpPerRep / singleRepCost,
            totalXpPerEnergy: totalXpValue / singleRepCost,
            hasPerk,
            hasEnergyItem,
            hasArtifact,
            isBoss: task.type === TaskType.Boss,
            energyPerItem: hasEnergyItem ? ENERGY_ITEMS[itemType] : 0,
        });
    }
    return tasks;
}

/**
 * Get all boss tasks from reachable zones that haven't been defeated
 */
function getReachableBossTasks(maxZone, state) {
    const bossTasks = [];
    for (let z = 0; z <= maxZone && z < ZONES.length; z++) {
        const zone = ZONES[z];
        for (const task of zone.tasks) {
            if (task.type === TaskType.Boss && !state.bossesDefeated.has(task.id)) {
                const singleRepCost = calcTaskEnergyCostSingleRep(task, z, state);
                const fullCost = calcTaskEnergyCost(task, z, state);
                const itemType = task.item !== null ? getItemType(task.item) : null;
                const unlocksTask = BOSS_UNLOCKS[task.id];

                bossTasks.push({
                    task,
                    zoneId: z,
                    singleRepCost,
                    fullCost,
                    itemType,
                    hasArtifact: itemType !== null && ARTIFACTS.includes(itemType),
                    unlocksTaskId: unlocksTask,
                });
            }
        }
    }
    // Sort by cost (cheapest first - these are most affordable)
    return bossTasks.sort((a, b) => a.fullCost - b.fullCost);
}

/**
 * Get all grindable tasks from all reachable zones (0 through maxZone)
 */
function getAllReachableGrindableTasks(maxZone, state) {
    const allTasks = [];
    for (let z = 0; z <= maxZone && z < ZONES.length; z++) {
        const zoneTasks = getGrindableTasks(z, state);
        allTasks.push(...zoneTasks);
    }
    return allTasks;
}

/**
 * Identify skills that are bottlenecks for reaching future zones.
 * Returns a Map of skill -> priority (lower = more urgent).
 * Priority is based on how soon we need the skill.
 *
 * @param maxReachableZone - highest zone we can currently complete
 * @returns Map of skill ID -> priority weight (higher weight = more important)
 */
function getBottleneckSkills(state, maxEnergy, maxReachableZone) {
    const skillWeights = new Map();

    // Look at ALL remaining zones, with weight decreasing by distance
    // Closer zones get much higher weight (exponential decay)
    const startZone = maxReachableZone + 1;

    for (let z = startZone; z < ZONES.length; z++) {
        const zone = ZONES[z];
        const mandatory = getMandatoryTasks(zone);
        // Weight by inverse of zone distance (exponential decay)
        const zoneDistance = z - maxReachableZone;
        // Weight formula: 100 / (distance^1.5) - gives high priority to nearby zones
        const weight = 100 / Math.pow(zoneDistance, 1.5);

        for (const task of mandatory) {
            for (const skill of task.skills) {
                const currentWeight = skillWeights.get(skill) || 0;
                skillWeights.set(skill, currentWeight + weight);
            }
        }
    }

    // Convert to Set for backward compatibility, but return the weights too
    const bottlenecks = new Set(skillWeights.keys());
    bottlenecks._weights = skillWeights;
    return bottlenecks;
}

/**
 * Get skills that can actually be trained from available (non-hidden) tasks
 */
function getTrainableSkills(maxZone, state) {
    const trainable = new Set();
    const allTasks = getAllReachableGrindableTasks(maxZone, state);
    for (const gt of allTasks) {
        for (const skill of gt.task.skills) {
            trainable.add(skill);
        }
    }
    return trainable;
}

/**
 * Get tasks that train bottleneck skills, sorted by how much they help with progression.
 * Factors in:
 * 1. Skill weights (skills needed sooner = higher weight)
 * 2. Current skill level (lower level skills = higher priority)
 * 3. Energy efficiency
 */
function getBottleneckTrainingTasks(maxZone, state, bottleneckSkills) {
    if (bottleneckSkills.size === 0) return [];

    const skillWeights = bottleneckSkills._weights || new Map();
    const allTasks = getAllReachableGrindableTasks(maxZone, state);
    const relevantTasks = [];

    // Calculate average skill level for comparison
    const allSkillLevels = Object.values(state.skillLevels);
    const avgSkillLevel = allSkillLevels.length > 0
        ? allSkillLevels.reduce((a, b) => a + b, 0) / allSkillLevels.length
        : 0;

    for (const gt of allTasks) {
        // Count how many bottleneck skills this task trains directly
        const bottleneckSkillsTrained = gt.task.skills.filter(s => bottleneckSkills.has(s));
        let numBottlenecks = bottleneckSkillsTrained.length;

        // Also check if task gives items that boost bottleneck skills
        const itemType = gt.task.item !== null ? getItemType(gt.task.item) : null;
        const itemMods = itemType !== null ? ITEM_SKILL_MODIFIERS[itemType] : null;
        const itemBoostsBottleneck = [];
        if (itemMods) {
            for (const skill of bottleneckSkills) {
                if (itemMods[skill]) {
                    itemBoostsBottleneck.push(skill);
                }
            }
        }

        // Include task if it either trains or boosts bottleneck skills via items
        if (numBottlenecks > 0 || itemBoostsBottleneck.length > 0) {
            // Calculate value considering:
            // - Skill weight (how soon we need it)
            // - Skill deficit (how far below average we are)
            // - Item bonuses (items that boost bottleneck skills are very valuable)
            let priorityScore = 0;

            // Score for directly trained skills
            for (const skill of bottleneckSkillsTrained) {
                const weight = skillWeights.get(skill) || 1;
                const level = state.skillLevels[skill] || 0;
                const deficit = Math.max(0, avgSkillLevel - level);
                const deficitBonus = Math.sqrt(deficit + 1);
                priorityScore += weight * deficitBonus;
            }

            // Score for item skill boosts (items provide persistent bonuses!)
            // Weight item bonuses highly because they accumulate across resets
            for (const skill of itemBoostsBottleneck) {
                const weight = skillWeights.get(skill) || 1;
                const itemBonus = itemMods[skill] * gt.task.maxReps; // Total boost from all items
                // Give 2x weight to item bonuses since they persist
                priorityScore += weight * itemBonus * 2;
            }

            relevantTasks.push({
                ...gt,
                numBottlenecks,
                bottleneckSkillsTrained,
                itemBoostsBottleneck,
                priorityScore,
                priorityPerEnergy: priorityScore / gt.singleRepCost,
            });
        }
    }

    // Sort by priority per energy
    return relevantTasks.sort((a, b) => b.priorityPerEnergy - a.priorityPerEnergy);
}

/**
 * Get all perk-granting tasks from reachable zones that we don't already have
 * Returns tasks sorted by total energy needed to reach and complete them
 */
function getReachablePerkTasks(reachableZones, state) {
    const perkTasks = [];

    for (const zoneInfo of reachableZones) {
        const zoneTasks = getGrindableTasks(zoneInfo.zoneId, state);
        for (const gt of zoneTasks) {
            if (gt.hasPerk) {
                // Calculate total energy needed: energy to reach this zone + task cost
                // We need to reserve energy to get here first
                const energyToReachZone = state.maxEnergy - zoneInfo.energyAtStart;
                const totalEnergyNeeded = energyToReachZone + gt.fullCost;

                perkTasks.push({
                    ...gt,
                    energyAtZone: zoneInfo.energyAtStart,
                    totalEnergyNeeded,
                    canAfford: gt.fullCost <= zoneInfo.energyAtStart,
                });
            }
        }
    }

    // Sort by total energy needed (cheapest perks first)
    return perkTasks.sort((a, b) => a.totalEnergyNeeded - b.totalEnergyNeeded);
}

/**
 * Get all energy item tasks from reachable zones
 * Returns tasks sorted by net energy gain (items gained - cost to get them)
 */
function getReachableItemTasks(reachableZones, state) {
    const itemTasks = [];

    for (const zoneInfo of reachableZones) {
        const zoneTasks = getGrindableTasks(zoneInfo.zoneId, state);
        for (const gt of zoneTasks) {
            if (gt.hasEnergyItem) {
                const energyToReachZone = state.maxEnergy - zoneInfo.energyAtStart;
                const totalCost = energyToReachZone + gt.fullCost;
                const itemValue = gt.energyPerItem * gt.task.maxReps;
                const netGain = itemValue - gt.fullCost; // Net gain IN the zone

                itemTasks.push({
                    ...gt,
                    energyAtZone: zoneInfo.energyAtStart,
                    totalCost,
                    itemValue,
                    netGain,
                    canAfford: gt.fullCost <= zoneInfo.energyAtStart,
                });
            }
        }
    }

    // Sort by net gain (best items first)
    return itemTasks.sort((a, b) => b.netGain - a.netGain);
}

/**
 * Get all skill-boosting item tasks from reachable zones
 * These items provide passive bonuses to skills just by holding them
 * Returns tasks sorted by total skill bonus value
 */
function getReachableSkillBoostTasks(reachableZones, state) {
    const boostTasks = [];

    for (const zoneInfo of reachableZones) {
        const zoneTasks = getGrindableTasks(zoneInfo.zoneId, state);
        for (const gt of zoneTasks) {
            // Check if this task gives a skill-boosting item
            const itemType = gt.task.item !== null ? getItemType(gt.task.item) : null;
            if (itemType !== null && ITEM_SKILL_MODIFIERS[itemType]) {
                const mods = ITEM_SKILL_MODIFIERS[itemType];
                const totalBonus = Object.values(mods).reduce((sum, val) => sum + val, 0);
                const itemCount = gt.task.maxReps;
                const totalBonusValue = totalBonus * itemCount;

                const energyToReachZone = state.maxEnergy - zoneInfo.energyAtStart;
                const totalCost = energyToReachZone + gt.fullCost;

                boostTasks.push({
                    ...gt,
                    itemType,
                    modifiers: mods,
                    totalBonusValue,
                    energyAtZone: zoneInfo.energyAtStart,
                    totalCost,
                    bonusPerEnergy: totalBonusValue / gt.fullCost,
                    canAfford: gt.fullCost <= zoneInfo.energyAtStart,
                });
            }
        }
    }

    // Sort by bonus per energy (best value first)
    return boostTasks.sort((a, b) => b.bonusPerEnergy - a.bonusPerEnergy);
}

/**
 * Calculate total energy value of held items
 */
function calcItemEnergy(state) {
    let total = 0;
    for (const [itemType, count] of state.items) {
        const energyPerItem = ENERGY_ITEMS[itemType];
        if (energyPerItem !== undefined) {
            total += energyPerItem * count;
        }
    }
    return total;
}

/**
 * Simulate a single run (until energy runs out or game complete)
 *
 * New strategy based on reachability:
 * 1. Calculate which zones are reachable with current energy
 * 2. Unlock perks from ANY reachable zone (cheapest first)
 * 3. Collect items from any reachable zone (best value first)
 * 4. Farm best XP tasks from all reachable zones
 *
 * Run types:
 * - "collect": Gather items but don't consume them (save for push run)
 * - "push": Consume all items at start for maximum energy
 * - "auto": Decide based on whether items would help reach a new zone
 */
export function simulateRun(state, options = {}) {
    const {
        maxZone = ZONES.length - 1,
        verbose = false,
        runType = "auto"
    } = options;

    let energy = state.maxEnergy;
    const runLog = [];
    const tasksCompletedThisRun = new Set(); // Track task IDs completed this run

    // Determine if this should be a push run
    const itemEnergy = calcItemEnergy(state);
    const nextNewZone = state.highestZone + 1;
    const nextZoneCost = nextNewZone < ZONES.length
        ? calcZoneMandatoryEnergyCost(nextNewZone, state)
        : Infinity;

    // Calculate total cost to reach next new zone
    let totalCostToNextNewZone = 0;
    for (let z = 0; z <= nextNewZone && z < ZONES.length; z++) {
        totalCostToNextNewZone += calcZoneMandatoryEnergyCost(z, state);
    }

    // Push when items could help us reach a new zone OR items are decaying
    const itemsCouldReachNewZone = energy + itemEnergy >= totalCostToNextNewZone * 0.9;
    // Push when items are at least 20% of max energy (lower threshold to use items sooner)
    const itemsAreRipe = itemEnergy >= energy * 0.2;
    const shouldPush = runType === "push" ||
        (runType === "auto" && itemEnergy > 0 && (itemsCouldReachNewZone || itemsAreRipe));

    if (shouldPush && itemEnergy > 0) {
        const consumed = consumeAllItems(state);
        energy += consumed;
        if (verbose) {
            runLog.push(`PUSH RUN: +${consumed.toFixed(1)} energy from items, total: ${energy.toFixed(1)}`);
        }
    } else if (verbose && itemEnergy > 0) {
        runLog.push(`COLLECT RUN: Saving ${itemEnergy.toFixed(0)} energy worth of items`);
    }

    // Track zones we've processed this run
    const zonesCompleted = new Set();
    let iterations = 0;
    const MAX_ITERATIONS = 1000;

    // Main loop: make decisions about what to do with our energy
    while (energy > 0.1 && iterations < MAX_ITERATIONS) {
        iterations++;

        // Calculate reachable zones with current energy
        const reachableZones = getReachableZones(energy, state, maxZone);
        const highestReachable = reachableZones.length > 0
            ? Math.max(...reachableZones.filter(z => z.canComplete).map(z => z.zoneId), -1)
            : -1;

        if (verbose && iterations === 1) {
            runLog.push(`Reachable zones: ${reachableZones.filter(z => z.canComplete).map(z => z.zoneId).join(', ') || 'none'}`);
        }

        let didSomething = false;

        // Priority 1: Unlock any affordable perk from reachable zones
        // Use ScrollOfHaste for expensive perks
        const perkTasks = getReachablePerkTasks(reachableZones, state);
        for (const pt of perkTasks) {
            // Calculate cost with potential haste scroll
            const hastedPerkCost = pt.fullCost / HASTE_MULT;
            const hastedTotalCost = pt.totalEnergyNeeded - pt.fullCost + hastedPerkCost;
            const canAffordWithHaste = state.scrollsOfHaste > 0 && hastedTotalCost <= energy;
            const canAffordNormal = pt.totalEnergyNeeded <= energy;

            if (canAffordWithHaste || canAffordNormal) {
                // Use haste for expensive perk tasks (>50% of energy)
                const useHaste = canAffordWithHaste && pt.fullCost > energy * 0.3;
                const actualPerkCost = useHaste ? hastedPerkCost : pt.fullCost;

                // Navigate to the zone and complete the perk task
                const zoneInfo = reachableZones.find(z => z.zoneId === pt.zoneId);
                if (zoneInfo) {
                    // Pay cost to reach this zone (complete mandatory tasks in earlier zones)
                    for (let z = 0; z < pt.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            const mandatoryTasks = getMandatoryTasks(zone);
                            for (const task of mandatoryTasks) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) addPerk(state, task.perk);
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;

                            // On push runs, consume items immediately
                            if (shouldPush) {
                                const gained = consumeAllItems(state);
                                if (gained > 0) {
                                    energy += gained;
                                    if (verbose) runLog.push(`  +${gained.toFixed(0)} from items`);
                                }
                            }
                        }
                    }

                    // Use haste scroll if decided
                    if (useHaste) {
                        state.scrollsOfHaste--;
                        if (verbose) runLog.push(`  Used Scroll of Haste for perk`);
                    }

                    // Now complete the perk task
                    energy -= actualPerkCost;
                    applyTaskXp(pt.task, pt.zoneId, state);
                    addPerk(state, pt.task.perk);
                    if (pt.task.item !== null) addItems(state, pt.task.item, pt.task.maxReps);
                    tasksCompletedThisRun.add(pt.task.id);

                    // On push runs, consume items immediately
                    if (shouldPush) {
                        const gained = consumeAllItems(state);
                        if (gained > 0) {
                            energy += gained;
                            if (verbose) runLog.push(`  +${gained.toFixed(0)} from items`);
                        }
                    }

                    if (verbose) {
                        runLog.push(`Zone ${pt.zoneId} ${pt.task.name}: unlocked perk (cost=${(pt.totalEnergyNeeded - pt.fullCost + actualPerkCost).toFixed(1)}${useHaste ? ' with haste' : ''})`);
                    }
                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 2: Collect energy items (on all runs)
        if (!didSomething) {
            const itemTasks = getReachableItemTasks(reachableZones, state);
            for (const it of itemTasks) {
                // Only collect if we can afford the task in the zone
                if (it.canAfford && it.totalCost <= energy) {
                    // Navigate to the zone
                    for (let z = 0; z < it.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            const mandatoryTasks = getMandatoryTasks(zone);
                            for (const task of mandatoryTasks) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) addPerk(state, task.perk);
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;
                        }
                    }

                    // Collect the items
                    energy -= it.fullCost;
                    applyTaskXp(it.task, it.zoneId, state);
                    addItems(state, it.task.item, it.task.maxReps);
                    tasksCompletedThisRun.add(it.task.id);

                    // On push runs, consume energy items immediately
                    if (shouldPush) {
                        const gained = consumeAllItems(state);
                        if (gained > 0) {
                            energy += gained;
                            if (verbose) runLog.push(`  +${gained.toFixed(0)} from items`);
                        }
                    }

                    if (verbose) {
                        runLog.push(`Zone ${it.zoneId} ${it.task.name}: collected (value=${it.itemValue.toFixed(0)})`);
                    }
                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 3: Collect skill-boosting items (on all runs)
        // These items provide bonuses when consumed on push runs
        if (!didSomething) {
            const boostTasks = getReachableSkillBoostTasks(reachableZones, state);
            for (const bt of boostTasks) {
                // Only collect if we can afford the task
                if (bt.canAfford && bt.totalCost <= energy) {
                    // Navigate to the zone
                    for (let z = 0; z < bt.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            const mandatoryTasks = getMandatoryTasks(zone);
                            for (const task of mandatoryTasks) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) addPerk(state, task.perk);
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;
                        }
                    }

                    // Collect the skill-boosting items
                    energy -= bt.fullCost;
                    applyTaskXp(bt.task, bt.zoneId, state);
                    addItems(state, bt.task.item, bt.task.maxReps);
                    tasksCompletedThisRun.add(bt.task.id);

                    if (verbose) {
                        runLog.push(`Zone ${bt.zoneId} ${bt.task.name}: collected skill items (boost=${bt.totalBonusValue.toFixed(2)})`);
                    }
                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 5: Defeat affordable bosses (use ScrollOfHaste if available)
        // Bosses unlock hidden tasks and give valuable items (often artifacts)
        if (!didSomething && highestReachable >= 0) {
            const bossTasks = getReachableBossTasks(highestReachable, state);
            for (const bt of bossTasks) {
                // Calculate cost with potential haste scroll
                const baseFullCost = bt.fullCost;
                const hastedCost = baseFullCost / HASTE_MULT;
                const canAffordWithHaste = state.scrollsOfHaste > 0 && hastedCost <= energy;
                const canAffordNormal = baseFullCost <= energy;

                if (canAffordWithHaste || canAffordNormal) {
                    // Use haste scroll for expensive bosses
                    const useHaste = canAffordWithHaste && baseFullCost > energy * 0.5;
                    const actualCost = useHaste ? hastedCost : baseFullCost;

                    if (useHaste) {
                        state.scrollsOfHaste--;
                        if (verbose) runLog.push(`  Used Scroll of Haste for boss`);
                    }

                    energy -= actualCost;
                    applyTaskXp(bt.task, bt.zoneId, state);
                    if (bt.task.item !== null) addItems(state, bt.task.item, bt.task.maxReps);
                    state.bossesDefeated.add(bt.task.id);
                    tasksCompletedThisRun.add(bt.task.id);

                    // Unlock the hidden task
                    if (bt.unlocksTaskId) {
                        state.unlockedHiddenTasks.add(bt.unlocksTaskId);
                    }

                    if (verbose) {
                        runLog.push(`Zone ${bt.zoneId} ${bt.task.name}: BOSS DEFEATED (cost=${actualCost.toFixed(1)}${useHaste ? ' with haste' : ''})`);
                    }

                    // On push runs, consume items immediately
                    if (shouldPush) {
                        const gained = consumeAllItems(state);
                        if (gained > 0) {
                            energy += gained;
                            if (verbose) runLog.push(`  +${gained.toFixed(0)} from items`);
                        }
                    }

                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 6: Advance through any zones we haven't completed this run
        // This includes zones we may have visited before but not finished mandatory tasks
        if (!didSomething && highestReachable >= 0) {
            // Complete zones up to the highest we can reach
            for (let z = 0; z <= highestReachable; z++) {
                if (!zonesCompleted.has(z)) {
                    const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                    if (zoneCost <= energy) {
                        energy -= zoneCost;
                        const zone = ZONES[z];
                        const mandatoryTasks = getMandatoryTasks(zone);
                        for (const task of mandatoryTasks) {
                            applyTaskXp(task, z, state);
                            if (task.item !== null) addItems(state, task.item, task.maxReps);
                            if (task.perk !== null) addPerk(state, task.perk);
                            tasksCompletedThisRun.add(task.id);
                        }
                        zonesCompleted.add(z);
                        state.currentZone = z;
                        if (z > state.highestZone) {
                            state.highestZone = z;
                            if (verbose) {
                                runLog.push(`Zone ${z} (${zone.name}): reached (cost=${zoneCost.toFixed(1)})`);
                            }
                        }

                        // On push runs, consume items as we go
                        if (shouldPush) {
                            const gained = consumeAllItems(state);
                            if (gained > 0) {
                                energy += gained;
                                if (verbose) runLog.push(`  +${gained.toFixed(0)} from items`);
                            }
                        }
                        didSomething = true;
                    }
                }
            }
        }

        // Priority 7: Farm tasks - prioritize bottleneck skills, then best XP
        if (!didSomething) {
            // First, identify bottleneck skills for future zones
            const maxReachable = highestReachable >= 0 ? highestReachable : 0;
            const bottleneckSkills = getBottleneckSkills(state, energy, maxReachable);
            let tasksToFarm = [];

            // If we have bottleneck skills, prioritize tasks that train them
            if (bottleneckSkills.size > 0) {
                tasksToFarm = getBottleneckTrainingTasks(maxReachable, state, bottleneckSkills);
            }

            // If no bottleneck tasks available, fall back to best XP tasks
            // Prefer tasks that give skill-boosting items
            if (tasksToFarm.length === 0) {
                const allReachableTasks = getAllReachableGrindableTasks(maxReachable, state);
                tasksToFarm = [...allReachableTasks].sort((a, b) => {
                    // Bonus for tasks that give skill-boosting items
                    const aItemType = a.task.item !== null ? getItemType(a.task.item) : null;
                    const bItemType = b.task.item !== null ? getItemType(b.task.item) : null;
                    const aHasSkillItem = aItemType !== null && ITEM_SKILL_MODIFIERS[aItemType];
                    const bHasSkillItem = bItemType !== null && ITEM_SKILL_MODIFIERS[bItemType];

                    // Give 50% bonus to XP value for tasks with skill items
                    const aValue = a.totalXpPerEnergy * (aHasSkillItem ? 1.5 : 1);
                    const bValue = b.totalXpPerEnergy * (bHasSkillItem ? 1.5 : 1);
                    return bValue - aValue;
                });
            }

            for (const gt of tasksToFarm) {
                // Check if we can afford to reach this zone
                const zoneInfo = reachableZones.find(z => z.zoneId === gt.zoneId);
                if (!zoneInfo) continue;

                // Calculate energy we'd have after reaching this zone
                let energyAtZone = energy;
                for (let z = 0; z < gt.zoneId; z++) {
                    if (!zonesCompleted.has(z)) {
                        energyAtZone -= calcZoneMandatoryEnergyCost(z, state);
                    }
                }

                // Can we afford at least one rep?
                if (gt.singleRepCost <= energyAtZone) {
                    // Navigate to the zone first
                    for (let z = 0; z < gt.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            for (const task of getMandatoryTasks(zone)) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) addPerk(state, task.perk);
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;
                        }
                    }

                    // Farm as many reps as we can afford
                    const reps = Math.min(
                        Math.floor(energy / gt.singleRepCost),
                        gt.task.maxReps * 3
                    );
                    if (reps > 0) {
                        energy -= reps * gt.singleRepCost;
                        applyTaskXp(gt.task, gt.zoneId, state, 1, reps);
                        tasksCompletedThisRun.add(gt.task.id);

                        // Collect items from farming (items per full task completion)
                        // Each full completion = maxReps reps
                        if (gt.task.item !== null) {
                            const fullCompletions = Math.floor(reps / gt.task.maxReps);
                            if (fullCompletions > 0) {
                                addItems(state, gt.task.item, gt.task.maxReps * fullCompletions);
                            }
                        }

                        if (verbose) {
                            const skillNames = gt.task.skills.map(s => SKILL_NAMES[s]).join('/');
                            runLog.push(`Zone ${gt.zoneId} ${gt.task.name} x${reps} [${skillNames}]: -${(reps * gt.singleRepCost).toFixed(1)}`);
                        }
                        didSomething = true;
                        break;
                    }
                }
            }

            // If we still have energy but can't afford any full reps,
            // spend remaining energy on partial progress for XP
            if (!didSomething && energy > 0.5) {
                const allTasks = getAllReachableGrindableTasks(maxReachable, state);
                // Sort by XP per energy, prefer bottleneck skills
                const sorted = allTasks.sort((a, b) => {
                    const aTrainsBottleneck = a.task.skills.some(s => bottleneckSkills.has(s));
                    const bTrainsBottleneck = b.task.skills.some(s => bottleneckSkills.has(s));
                    if (aTrainsBottleneck && !bTrainsBottleneck) return -1;
                    if (!aTrainsBottleneck && bTrainsBottleneck) return 1;
                    return b.xpPerEnergy - a.xpPerEnergy;
                });

                for (const gt of sorted) {
                    if (gt.zoneId === 0 || zonesCompleted.has(gt.zoneId - 1) || gt.zoneId <= highestReachable) {
                        // Spend remaining energy on this task for partial XP
                        // Calculate XP proportional to energy spent (partial rep)
                        const partialReps = energy / gt.singleRepCost;
                        if (partialReps > 0.01) {
                            applyTaskXp(gt.task, gt.zoneId, state, 1, partialReps);
                            tasksCompletedThisRun.add(gt.task.id);
                            if (verbose) {
                                runLog.push(`Zone ${gt.zoneId} ${gt.task.name} (partial): -${energy.toFixed(1)}`);
                            }
                            energy = 0;
                            didSomething = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!didSomething) {
            // Nothing left to do
            if (verbose) {
                runLog.push(`Stuck with ${energy.toFixed(1)} energy remaining`);
            }
            break;
        }
    }

    return {
        highestZoneReached: state.highestZone,
        remainingEnergy: energy,
        state,
        runLog,
        isPushRun: shouldPush,
        itemsHeld: calcItemEnergy(state),
        tasksCompleted: tasksCompletedThisRun,
    };
}

/**
 * Simulate energy reset
 */
export function doEnergyReset(state) {
    // Energetic Memory - gain max energy based on current zone when energy ran out
    // Uses currentZone (where player ended up), not highestZone (highest ever reached)
    if (state.perks.has(PerkType.EnergeticMemory)) {
        const gain = (state.currentZone + 1) * ENERGETIC_MEMORY_MULT;
        state.maxEnergy += gain;
    }

    // Items only persist at 50% if player has UnderstandingTheReset perk; otherwise go to 0
    handleEnergyResetItemCounts(state);

    // Reset skill speed modifiers (temporary bonuses from consumed items)
    state.skillSpeedModifiers = {};

    // Artifacts follow same rules as regular items
    if (state.perks.has(PerkType.UnderstandingTheReset)) {
        state.scrollsOfHaste = Math.ceil(state.scrollsOfHaste / 2);
        state.magicRings = Math.ceil(state.magicRings / 2);
        state.bottledLightnings = Math.ceil(state.bottledLightnings / 2);
    } else {
        state.scrollsOfHaste = 0;
        state.magicRings = 0;
        state.bottledLightnings = 0;
    }

    // Reset items found this reset (for Dreamcatcher)
    state.itemsFoundThisReset = [];

    // Update highest zone fully completed if applicable
    // (simplified - assume we completed all zones we reached)
    state.highestZoneFullyCompleted = Math.max(
        state.highestZoneFullyCompleted,
        state.highestZone - 1
    );

    // Reset current zone to 0 for next run
    state.currentZone = 0;

    return state;
}

/**
 * Create initial game state
 */
export function createInitialState() {
    return {
        maxEnergy: STARTING_ENERGY,
        skillLevels: {},      // skill -> level (integer)
        skillXp: {},          // skill -> partial XP progress (decimal)
        skillSpeedModifiers: {},  // skill -> accumulated bonus from consumed items (resets each run)
        perks: new Set(),
        power: 0,
        attunement: 0,
        currentZone: 0,       // Zone player is currently in (for Energetic Memory)
        highestZone: -1,
        highestZoneFullyCompleted: -1,
        energySpellApplied: false,
        items: new Map(),           // ItemType -> count (all items)
        scrollsOfHaste: 0,          // Artifact: 5x speed on next task
        magicRings: 0,              // Artifact: 5x XP on next task
        bottledLightnings: 0,       // Artifact: 2x speed on boss tasks
        bossesDefeated: new Set(),  // Set of boss task IDs that have been defeated
        unlockedHiddenTasks: new Set(), // Hidden tasks unlocked by defeating bosses
        itemsFoundThisReset: [],    // For Dreamcatcher artifact
        // Prestige state (defaults to no prestige; set externally if prestige is active)
        prestigeUnlocks: new Set(),       // PrestigeUnlockType values
        prestigeRepeatables: new Map(),   // PrestigeRepeatableType -> level
    };
}

/**
 * Add a perk to the state, applying any immediate effects
 * Matches the original game's tryAddPerk behavior
 */
function addPerk(state, perkType) {
    if (perkType === null || state.perks.has(perkType)) {
        return; // Already has perk or no perk to add
    }

    // Energy Spell gives +50 max energy immediately when acquired
    if (perkType === PerkType.EnergySpell) {
        state.maxEnergy += 50;
    }

    state.perks.add(perkType);
}

/**
 * Convert item string name to ItemType enum
 */
function getItemType(itemNameOrType) {
    if (typeof itemNameOrType === 'number') return itemNameOrType;
    // Map string names to ItemType enum
    const nameMap = {
        'Food': ItemType.Food, 'Arrow': ItemType.Arrow, 'Coin': ItemType.Coin,
        'Mushroom': ItemType.Mushroom, 'GoblinSupplies': ItemType.GoblinSupplies,
        'TravelEquipment': ItemType.TravelEquipment, 'Book': ItemType.Book,
        'ScrollOfHaste': ItemType.ScrollOfHaste, 'GoblinWaraxe': ItemType.GoblinWaraxe,
        'CampingEquipment': ItemType.CampingEquipment, 'Reagents': ItemType.Reagents,
        'MagicalRoots': ItemType.MagicalRoots, 'GoblinTreasure': ItemType.GoblinTreasure,
        'Fish': ItemType.Fish, 'BanditWeapons': ItemType.BanditWeapons,
        'Cactus': ItemType.Cactus, 'CityChain': ItemType.CityChain,
        'WerewolfFur': ItemType.WerewolfFur, 'OasisWater': ItemType.OasisWater,
        'Calamari': ItemType.Calamari, 'MysticIncense': ItemType.MysticIncense,
        'OracleBones': ItemType.OracleBones, 'WormHideCoat': ItemType.WormHideCoat,
        'DjinnLamp': ItemType.DjinnLamp, 'Dreamcatcher': ItemType.Dreamcatcher,
        'MagicEssence': ItemType.MagicEssence, 'CraftingRecipe': ItemType.CraftingRecipe,
        'KnightlyBoots': ItemType.KnightlyBoots, 'DragonScale': ItemType.DragonScale,
        'CaveInsects': ItemType.CaveInsects, 'MagicalVessel': ItemType.MagicalVessel,
        'MagicRing': ItemType.MagicRing,
        'BottledLightning': ItemType.BottledLightning, 'HeatEssence': ItemType.HeatEssence,
        'DivineNotes': ItemType.DivineNotes, 'GriffinQuill': ItemType.GriffinQuill,
        'WingsOfShadow': ItemType.WingsOfShadow, 'RitualSymbol': ItemType.RitualSymbol,
        'Glasses': ItemType.Glasses, 'Light': ItemType.Light,
        'MadContraption': ItemType.MadContraption,
    };
    return nameMap[itemNameOrType] ?? null;
}

/**
 * Add items to state, handling artifacts specially
 */
function addItems(state, itemNameOrType, count) {
    const itemType = getItemType(itemNameOrType);
    if (itemType === null) return;

    // Track items found this reset (for Dreamcatcher)
    if (!state.itemsFoundThisReset.includes(itemType)) {
        state.itemsFoundThisReset.push(itemType);
    }

    // Handle artifacts specially
    if (itemType === ItemType.ScrollOfHaste) {
        state.scrollsOfHaste += count;
        return;
    }
    if (itemType === ItemType.MagicRing) {
        state.magicRings += count;
        return;
    }
    if (itemType === ItemType.BottledLightning) {
        state.bottledLightnings += count;
        return;
    }
    if (itemType === ItemType.Dreamcatcher) {
        // Dreamcatcher: duplicate all items found this reset (except Dreamcatcher)
        for (const foundItem of state.itemsFoundThisReset) {
            if (foundItem !== ItemType.Dreamcatcher) {
                addItems(state, foundItem, count);
            }
        }
        return;
    }

    // Regular items
    const current = state.items.get(itemType) || 0;
    state.items.set(itemType, current + count);
}

/**
 * Consume all items - both energy items and skill-boosting items
 * Energy items provide immediate energy
 * Skill-boosting items add to skillSpeedModifiers for the current run
 */
function consumeAllItems(state) {
    let energyGained = 0;

    for (const [itemType, count] of state.items) {
        if (count <= 0) continue;

        // Energy items provide energy
        const energyPerItem = ENERGY_ITEMS[itemType];
        if (energyPerItem !== undefined) {
            energyGained += energyPerItem * count;
        }

        // Skill-boosting items add to speed modifiers
        const mods = ITEM_SKILL_MODIFIERS[itemType];
        if (mods) {
            for (const [skill, bonus] of Object.entries(mods)) {
                const skillId = Number(skill);
                state.skillSpeedModifiers[skillId] = (state.skillSpeedModifiers[skillId] || 0) + bonus * count;
            }
        }

        // Consume the items
        state.items.set(itemType, 0);
    }

    return energyGained;
}

/**
 * Use a scroll of haste if available (returns true if used)
 * Scroll of Haste makes next task 5x faster
 */
function useScrollOfHaste(state) {
    if (state.scrollsOfHaste > 0) {
        state.scrollsOfHaste--;
        return true;
    }
    return false;
}

/**
 * Calculate task energy cost with optional haste modifier
 */
function calcTaskEnergyCostWithHaste(task, zoneId, state, useHaste = false) {
    const baseCost = calcTaskEnergyCostSingleRep(task, zoneId, state);
    return useHaste ? baseCost / HASTE_MULT : baseCost;
}

/**
 * Handle item counts on energy reset (matching game's handleEnergyResetItemCounts)
 * Items only persist at 50% with UnderstandingTheReset perk; otherwise go to 0.
 * CompulsiveNotetaking prestige guarantees minimum NOTE_ITEMS counts.
 */
function handleEnergyResetItemCounts(state) {
    const hasReset = state.perks.has(PerkType.UnderstandingTheReset);
    for (const [itemType, count] of state.items) {
        const newValue = hasReset ? Math.ceil(count / 2) : 0;
        state.items.set(itemType, newValue);
    }

    // CompulsiveNotetaking prestige - guarantee minimum NOTE_ITEMS
    if (hasPrestigeUnlock(state, PrestigeUnlockType.CompulsiveNotetaking)) {
        for (const item of NOTE_ITEMS) {
            const current = state.items.get(item) || 0;
            if (current < COMPULSIVE_NOTE_TAKING_AMOUNT) {
                state.items.set(item, COMPULSIVE_NOTE_TAKING_AMOUNT);
            }
        }
    }
}

/**
 * Build a lookup of task ID -> { zoneId, zoneName, taskName }
 */
function buildTaskLookup() {
    const lookup = new Map();
    for (const zone of ZONES) {
        for (const task of zone.tasks) {
            lookup.set(task.id, {
                taskId: task.id,
                zoneId: zone.id,
                zoneName: zone.name,
                taskName: task.name,
                taskType: task.type,
            });
        }
    }
    return lookup;
}

/**
 * Simulate full game until target zone is reached
 * Returns number of resets needed and final state
 * Now also tracks task milestones (first time each task is completed)
 */
export function simulateUntilZone(targetZone, options = {}) {
    const { maxResets = 500, verbose = false, timeoutMs = 0 } = options;
    const startTime = timeoutMs > 0 ? Date.now() : 0;

    let state = createInitialState();
    const zoneMilestones = new Map(); // zoneId -> { reset, zoneId }
    const taskMilestones = new Map(); // taskId -> { reset, taskId, zoneId, taskName }
    const taskLookup = buildTaskLookup();
    let totalResets = 0;

    for (let reset = 0; reset < maxResets; reset++) {
        const runResult = simulateRun(state, { maxZone: targetZone, verbose });

        // Record first time reaching each zone
        for (let z = 0; z <= runResult.highestZoneReached; z++) {
            if (!zoneMilestones.has(z)) {
                zoneMilestones.set(z, { reset, zoneId: z });
            }
        }

        // Record first time completing each task
        for (const taskId of runResult.tasksCompleted) {
            if (!taskMilestones.has(taskId)) {
                const taskInfo = taskLookup.get(taskId);
                if (taskInfo) {
                    taskMilestones.set(taskId, {
                        reset,
                        ...taskInfo,
                    });
                }
            }
        }

        // Check if we reached target
        if (runResult.highestZoneReached >= targetZone) {
            totalResets = reset + 1;
            break;
        }

        // Do energy reset
        state = doEnergyReset(state);
        totalResets = reset + 1;

        if (verbose) {
            console.log(`Reset ${reset + 1}: Reached zone ${runResult.highestZoneReached}, maxEnergy now ${state.maxEnergy.toFixed(1)}`);
        }

        // Check timeout
        if (startTime > 0 && Date.now() - startTime > timeoutMs) {
            if (verbose) {
                console.log(`Timeout after ${totalResets} resets`);
            }
            break;
        }
    }

    // Sort task milestones by reset number
    const sortedTaskMilestones = Array.from(taskMilestones.values())
        .sort((a, b) => a.reset - b.reset || a.zoneId - b.zoneId || a.taskId - b.taskId);

    return {
        totalResets,
        reachedTarget: zoneMilestones.has(targetZone),
        zoneMilestones: Array.from(zoneMilestones.values()).sort((a, b) => a.zoneId - b.zoneId),
        taskMilestones: sortedTaskMilestones,
        finalState: state,
    };
}

/**
 * Run baseline simulation and report results
 */
export function runBaselineSimulation(maxZone = 15, options = {}) {
    const { timeoutMs = 0 } = options;
    console.log(`\n=== Journey to Ascension Baseline Simulation ===`);
    console.log(`Simulating original game progression up to zone ${maxZone}\n`);

    const result = simulateUntilZone(maxZone, { verbose: false, timeoutMs });

    console.log(`Total resets to reach zone ${maxZone}: ${result.totalResets}`);

    // Zone milestones
    console.log(`\nZone Milestones (first reset to reach each zone):`);
    console.log(`${'Zone'.padEnd(6)} ${'Name'.padEnd(25)} ${'Reset'.padEnd(8)} ${'Delta'}`);
    console.log('-'.repeat(55));

    let prevZoneReset = 0;
    for (const milestone of result.zoneMilestones) {
        const zone = ZONES[milestone.zoneId];
        const delta = milestone.reset - prevZoneReset;
        console.log(
            `${milestone.zoneId.toString().padEnd(6)} ` +
            `${zone.name.padEnd(25)} ` +
            `${milestone.reset.toString().padEnd(8)} ` +
            `+${delta}`
        );
        prevZoneReset = milestone.reset;
    }

    // Task milestones
    console.log(`\nTask Milestones (first reset to complete each task):`);
    console.log(`${'Reset'.padEnd(8)} ${'Delta'.padEnd(8)} ${'Zone'.padEnd(22)} ${'Task'}`);
    console.log('-'.repeat(80));

    let prevTaskReset = 0;
    for (const milestone of result.taskMilestones) {
        const delta = milestone.reset - prevTaskReset;
        console.log(
            `${milestone.reset.toString().padEnd(8)} ` +
            `+${delta.toString().padEnd(7)} ` +
            `${milestone.zoneName.substring(0, 20).padEnd(22)} ` +
            `${milestone.taskName}`
        );
        prevTaskReset = milestone.reset;
    }

    console.log(`\nFinal state:`);
    console.log(`  Max Energy: ${result.finalState.maxEnergy.toFixed(1)}`);
    console.log(`  Perks: ${result.finalState.perks.size}`);
    console.log(`  Highest Zone: ${result.finalState.highestZone}`);

    // Show skill levels
    console.log(`  Skill Levels:`);
    for (let i = 0; i < SKILL_NAMES.length; i++) {
        const level = result.finalState.skillLevels[i] || 0;
        if (level > 0) {
            console.log(`    ${SKILL_NAMES[i]}: ${level}`);
        }
    }

    return result;
}

// Re-export ZONES for convenience
export { ZONES } from './gameData.js';

// Export strategy helper functions for queue builder
export {
    getGrindableTasks,
    getAllReachableGrindableTasks,
    getReachablePerkTasks,
    getReachableItemTasks,
    getReachableSkillBoostTasks,
    getReachableBossTasks,
    getBottleneckSkills,
    getBottleneckTrainingTasks,
    calcItemEnergy,
    getItemType,
};

/**
 * Run a detailed simulation showing every action taken
 * @param maxResets - maximum number of resets to simulate
 * @param targetZone - target zone to reach
 * @returns detailed log of all actions
 */
export function runDetailedSimulation(maxResets = 10, targetZone = 15) {
    let state = createInitialState();
    const output = [];

    output.push('='.repeat(80));
    output.push('DETAILED SIMULATION LOG');
    output.push('='.repeat(80));
    output.push('');

    for (let reset = 0; reset < maxResets; reset++) {
        output.push(`${'='.repeat(30)} RESET ${reset} ${'='.repeat(30)}`);
        output.push(`Starting state:`);
        output.push(`  Max Energy: ${state.maxEnergy.toFixed(1)}`);
        output.push(`  Highest Zone: ${state.highestZone}`);
        output.push(`  Perks: ${state.perks.size} [${Array.from(state.perks).map(p => PERK_NAMES[p]).join(', ')}]`);

        // Show key skill levels
        const skillSummary = [];
        for (let i = 0; i < SKILL_NAMES.length; i++) {
            const level = state.skillLevels[i] || 0;
            if (level > 0) {
                skillSummary.push(`${SKILL_NAMES[i].substring(0,3)}:${level}`);
            }
        }
        if (skillSummary.length > 0) {
            output.push(`  Skills: ${skillSummary.join(' ')}`);
        }

        // Show items
        const itemEnergy = calcItemEnergy(state);
        if (itemEnergy > 0) {
            output.push(`  Items: ${itemEnergy.toFixed(0)} energy worth`);
        }
        output.push('');

        // Simulate this run with detailed tracking
        const runResult = simulateRunDetailed(state, { maxZone: targetZone });

        // Output the detailed run log
        for (const entry of runResult.detailedLog) {
            output.push(entry);
        }

        output.push('');
        output.push(`Run summary:`);
        output.push(`  Zones completed: ${runResult.zonesVisited.join(' -> ') || 'none'}`);
        output.push(`  Highest zone this run: ${runResult.highestZoneReached}`);
        output.push(`  Tasks completed: ${runResult.tasksCompleted.size}`);
        output.push(`  Perks gained: ${runResult.perksGained.length > 0 ? runResult.perksGained.map(p => PERK_NAMES[p]).join(', ') : 'none'}`);
        output.push('');

        // Check if we reached target
        if (runResult.highestZoneReached >= targetZone) {
            output.push(`*** TARGET ZONE ${targetZone} REACHED! ***`);
            break;
        }

        // Do energy reset
        const prevMaxEnergy = state.maxEnergy;
        state = doEnergyReset(state);
        const energyGain = state.maxEnergy - prevMaxEnergy;

        output.push(`Energy reset:`);
        if (energyGain > 0) {
            output.push(`  Energetic Memory: +${energyGain.toFixed(2)} max energy`);
        }
        output.push(`  New max energy: ${state.maxEnergy.toFixed(1)}`);
        output.push('');
    }

    return output.join('\n');
}

/**
 * Simulate a single run with detailed action logging
 */
function simulateRunDetailed(state, options = {}) {
    const { maxZone = ZONES.length - 1 } = options;

    let energy = state.maxEnergy;
    const detailedLog = [];
    const tasksCompletedThisRun = new Set();
    const perksGained = [];
    const zonesVisited = [];

    // Track starting skill levels to show gains
    const startingSkillLevels = { ...state.skillLevels };

    // Determine if this should be a push run
    const itemEnergy = calcItemEnergy(state);
    const nextNewZone = state.highestZone + 1;

    let totalCostToNextNewZone = 0;
    for (let z = 0; z <= nextNewZone && z < ZONES.length; z++) {
        totalCostToNextNewZone += calcZoneMandatoryEnergyCost(z, state);
    }

    const itemsCouldReachNewZone = energy + itemEnergy >= totalCostToNextNewZone * 0.9;
    const itemsAreRipe = itemEnergy >= energy * 0.2;
    const shouldPush = itemEnergy > 0 && (itemsCouldReachNewZone || itemsAreRipe);

    detailedLog.push(`Run type: ${shouldPush ? 'PUSH' : 'COLLECT'}`);
    detailedLog.push(`Starting energy: ${energy.toFixed(1)}`);

    if (shouldPush && itemEnergy > 0) {
        const consumed = consumeAllItems(state);
        energy += consumed;
        detailedLog.push(`Consumed items: +${consumed.toFixed(1)} energy -> ${energy.toFixed(1)} total`);
    } else if (itemEnergy > 0) {
        detailedLog.push(`Saving items: ${itemEnergy.toFixed(0)} energy worth`);
    }
    detailedLog.push('');

    // Show zone costs
    detailedLog.push('Zone mandatory costs:');
    for (let z = 0; z <= Math.min(maxZone, state.highestZone + 3); z++) {
        const cost = calcZoneMandatoryEnergyCost(z, state);
        const zoneName = ZONES[z]?.name || `Zone ${z}`;
        const reachable = cost <= energy ? '✓' : '✗';
        detailedLog.push(`  ${z}: ${zoneName.padEnd(22)} cost=${cost.toFixed(1).padStart(8)} ${reachable}`);
    }
    detailedLog.push('');

    const zonesCompleted = new Set();
    let iterations = 0;
    const MAX_ITERATIONS = 100; // Lower limit for detailed logging

    detailedLog.push('Actions:');

    while (energy > 0.1 && iterations < MAX_ITERATIONS) {
        iterations++;

        const reachableZones = getReachableZones(energy, state, maxZone);
        const highestReachable = reachableZones.length > 0
            ? Math.max(...reachableZones.filter(z => z.canComplete).map(z => z.zoneId), -1)
            : -1;

        let didSomething = false;

        // Priority 1: Perks
        const perkTasks = getReachablePerkTasks(reachableZones, state);
        for (const pt of perkTasks) {
            const hastedPerkCost = pt.fullCost / HASTE_MULT;
            const hastedTotalCost = pt.totalEnergyNeeded - pt.fullCost + hastedPerkCost;
            const canAffordWithHaste = state.scrollsOfHaste > 0 && hastedTotalCost <= energy;
            const canAffordNormal = pt.totalEnergyNeeded <= energy;

            if (canAffordWithHaste || canAffordNormal) {
                const useHaste = canAffordWithHaste && pt.fullCost > energy * 0.3;
                const actualPerkCost = useHaste ? hastedPerkCost : pt.fullCost;

                // Navigate to zone
                for (let z = 0; z < pt.zoneId; z++) {
                    if (!zonesCompleted.has(z)) {
                        const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                        energy -= zoneCost;
                        const zone = ZONES[z];
                        const mandatoryTasks = getMandatoryTasks(zone);
                        for (const task of mandatoryTasks) {
                            applyTaskXp(task, z, state);
                            if (task.item !== null) addItems(state, task.item, task.maxReps);
                            if (task.perk !== null) {
                                addPerk(state, task.perk);
                                perksGained.push(task.perk);
                            }
                            tasksCompletedThisRun.add(task.id);
                        }
                        zonesCompleted.add(z);
                        zonesVisited.push(z);
                        state.currentZone = z;
                        if (z > state.highestZone) state.highestZone = z;

                        detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] Zone ${z} mandatory tasks (cost=${zoneCost.toFixed(1)})`);

                        if (shouldPush) {
                            const gained = consumeAllItems(state);
                            if (gained > 0) {
                                energy += gained;
                                detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] +${gained.toFixed(0)} from items`);
                            }
                        }
                    }
                }

                if (useHaste) {
                    state.scrollsOfHaste--;
                }

                energy -= actualPerkCost;
                applyTaskXp(pt.task, pt.zoneId, state);
                addPerk(state, pt.task.perk);
                perksGained.push(pt.task.perk);
                if (pt.task.item !== null) addItems(state, pt.task.item, pt.task.maxReps);
                tasksCompletedThisRun.add(pt.task.id);

                if (shouldPush) {
                    const gained = consumeAllItems(state);
                    if (gained > 0) {
                        energy += gained;
                    }
                }

                detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] PERK: ${pt.task.name} -> ${PERK_NAMES[pt.task.perk]}${useHaste ? ' (hasted)' : ''} (cost=${actualPerkCost.toFixed(1)})`);
                didSomething = true;
                break;
            }
        }

        // Priority 2: Items (on collect runs)
        if (!didSomething && !shouldPush) {
            const itemTasks = getReachableItemTasks(reachableZones, state);
            for (const it of itemTasks) {
                if (it.canAfford && it.totalCost <= energy) {
                    for (let z = 0; z < it.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            for (const task of getMandatoryTasks(zone)) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) {
                                    addPerk(state, task.perk);
                                    perksGained.push(task.perk);
                                }
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            zonesVisited.push(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;

                            detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] Zone ${z} mandatory (cost=${zoneCost.toFixed(1)})`);
                        }
                    }

                    energy -= it.fullCost;
                    applyTaskXp(it.task, it.zoneId, state);
                    addItems(state, it.task.item, it.task.maxReps);
                    tasksCompletedThisRun.add(it.task.id);

                    detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] ITEM: ${it.task.name} (value=${it.itemValue.toFixed(0)}, cost=${it.fullCost.toFixed(1)})`);
                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 3: Bosses
        if (!didSomething && highestReachable >= 0) {
            const bossTasks = getReachableBossTasks(highestReachable, state);
            for (const bt of bossTasks) {
                const baseFullCost = bt.fullCost;
                const hastedCost = baseFullCost / HASTE_MULT;
                const canAffordWithHaste = state.scrollsOfHaste > 0 && hastedCost <= energy;
                const canAffordNormal = baseFullCost <= energy;

                if (canAffordWithHaste || canAffordNormal) {
                    const useHaste = canAffordWithHaste && baseFullCost > energy * 0.5;
                    const actualCost = useHaste ? hastedCost : baseFullCost;

                    if (useHaste) state.scrollsOfHaste--;

                    energy -= actualCost;
                    applyTaskXp(bt.task, bt.zoneId, state);
                    if (bt.task.item !== null) addItems(state, bt.task.item, bt.task.maxReps);
                    state.bossesDefeated.add(bt.task.id);
                    tasksCompletedThisRun.add(bt.task.id);

                    if (bt.unlocksTaskId) {
                        state.unlockedHiddenTasks.add(bt.unlocksTaskId);
                    }

                    detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] BOSS: ${bt.task.name}${useHaste ? ' (hasted)' : ''} (cost=${actualCost.toFixed(1)})`);

                    if (shouldPush) {
                        const gained = consumeAllItems(state);
                        if (gained > 0) {
                            energy += gained;
                            detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] +${gained.toFixed(0)} from items`);
                        }
                    }

                    didSomething = true;
                    break;
                }
            }
        }

        // Priority 4: Advance zones
        if (!didSomething && highestReachable >= 0) {
            for (let z = 0; z <= highestReachable; z++) {
                if (!zonesCompleted.has(z)) {
                    const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                    if (zoneCost <= energy) {
                        energy -= zoneCost;
                        const zone = ZONES[z];
                        for (const task of getMandatoryTasks(zone)) {
                            applyTaskXp(task, z, state);
                            if (task.item !== null) addItems(state, task.item, task.maxReps);
                            if (task.perk !== null) {
                                addPerk(state, task.perk);
                                perksGained.push(task.perk);
                            }
                            tasksCompletedThisRun.add(task.id);
                        }
                        zonesCompleted.add(z);
                        zonesVisited.push(z);
                        state.currentZone = z;
                        if (z > state.highestZone) {
                            state.highestZone = z;
                            detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] NEW ZONE ${z}: ${zone.name} (cost=${zoneCost.toFixed(1)})`);
                        } else {
                            detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] Zone ${z} mandatory (cost=${zoneCost.toFixed(1)})`);
                        }

                        if (shouldPush) {
                            const gained = consumeAllItems(state);
                            if (gained > 0) {
                                energy += gained;
                                detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] +${gained.toFixed(0)} from items`);
                            }
                        }
                        didSomething = true;
                    }
                }
            }
        }

        // Priority 5: Farm XP
        if (!didSomething) {
            const maxReachable = highestReachable >= 0 ? highestReachable : 0;
            const bottleneckSkills = getBottleneckSkills(state, energy, maxReachable);
            let tasksToFarm = [];

            if (bottleneckSkills.size > 0) {
                tasksToFarm = getBottleneckTrainingTasks(maxReachable, state, bottleneckSkills);
            }

            if (tasksToFarm.length === 0) {
                const allReachableTasks = getAllReachableGrindableTasks(maxReachable, state);
                tasksToFarm = [...allReachableTasks].sort((a, b) => b.totalXpPerEnergy - a.totalXpPerEnergy);
            }

            for (const gt of tasksToFarm) {
                const zoneInfo = reachableZones.find(z => z.zoneId === gt.zoneId);
                if (!zoneInfo) continue;

                let energyAtZone = energy;
                for (let z = 0; z < gt.zoneId; z++) {
                    if (!zonesCompleted.has(z)) {
                        energyAtZone -= calcZoneMandatoryEnergyCost(z, state);
                    }
                }

                if (gt.singleRepCost <= energyAtZone) {
                    for (let z = 0; z < gt.zoneId; z++) {
                        if (!zonesCompleted.has(z)) {
                            const zoneCost = calcZoneMandatoryEnergyCost(z, state);
                            energy -= zoneCost;
                            const zone = ZONES[z];
                            for (const task of getMandatoryTasks(zone)) {
                                applyTaskXp(task, z, state);
                                if (task.item !== null) addItems(state, task.item, task.maxReps);
                                if (task.perk !== null) {
                                    addPerk(state, task.perk);
                                    perksGained.push(task.perk);
                                }
                                tasksCompletedThisRun.add(task.id);
                            }
                            zonesCompleted.add(z);
                            zonesVisited.push(z);
                            state.currentZone = z;
                            if (z > state.highestZone) state.highestZone = z;
                        }
                    }

                    const reps = Math.min(
                        Math.floor(energy / gt.singleRepCost),
                        gt.task.maxReps * 3
                    );
                    if (reps > 0) {
                        const cost = reps * gt.singleRepCost;
                        energy -= cost;
                        applyTaskXp(gt.task, gt.zoneId, state, 1, reps);
                        tasksCompletedThisRun.add(gt.task.id);

                        const skillNames = gt.task.skills.map(s => SKILL_NAMES[s].substring(0,3)).join('/');
                        detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] FARM: ${gt.task.name} x${reps} [${skillNames}] (cost=${cost.toFixed(1)})`);
                        didSomething = true;
                        break;
                    }
                }
            }

            // Partial XP spending
            if (!didSomething && energy > 0.5) {
                const allTasks = getAllReachableGrindableTasks(maxReachable, state);
                const sorted = allTasks.sort((a, b) => b.xpPerEnergy - a.xpPerEnergy);

                for (const gt of sorted) {
                    if (gt.zoneId === 0 || zonesCompleted.has(gt.zoneId - 1) || gt.zoneId <= highestReachable) {
                        const partialReps = energy / gt.singleRepCost;
                        if (partialReps > 0.01) {
                            applyTaskXp(gt.task, gt.zoneId, state, 1, partialReps);
                            tasksCompletedThisRun.add(gt.task.id);

                            const skillNames = gt.task.skills.map(s => SKILL_NAMES[s].substring(0,3)).join('/');
                            detailedLog.push(`  [${(0).toFixed(1).padStart(6)}] PARTIAL: ${gt.task.name} [${skillNames}] (spent=${energy.toFixed(1)})`);
                            energy = 0;
                            didSomething = true;
                            break;
                        }
                    }
                }
            }
        }

        if (!didSomething) {
            detailedLog.push(`  [${energy.toFixed(1).padStart(6)}] Stuck - no actions available`);
            break;
        }
    }

    // Show skill gains
    const skillGains = [];
    for (let i = 0; i < SKILL_NAMES.length; i++) {
        const startLevel = startingSkillLevels[i] || 0;
        const endLevel = state.skillLevels[i] || 0;
        const gain = endLevel - startLevel;
        if (gain > 0) {
            skillGains.push(`${SKILL_NAMES[i].substring(0,3)}:+${gain}`);
        }
    }
    if (skillGains.length > 0) {
        detailedLog.push('');
        detailedLog.push(`Skill gains: ${skillGains.join(' ')}`);
    }

    return {
        highestZoneReached: state.highestZone,
        remainingEnergy: energy,
        state,
        detailedLog,
        tasksCompleted: tasksCompletedThisRun,
        perksGained,
        zonesVisited,
    };
}

// If running directly with Node.js
if (typeof process !== 'undefined' && process.argv[1]?.includes('simulator')) {
    runBaselineSimulation(15);
}

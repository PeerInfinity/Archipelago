/**
 * JTA Cost Generator
 *
 * Adjusts costMult values in randomized game data so that perk tasks are
 * completable within a target number of energy resets per sphere.
 *
 * Handles multiworld: some perk tasks give items to other players, and some
 * perks arrive from other players' games. The sphere log ordering determines
 * the sequence of task completions and perk grants.
 *
 * Pure function: takes game data + sphere log + options → returns adjusted game data.
 * No browser dependencies (works in Node.js and browser).
 */

import { loadGameDataFromJson } from './jtaGameDataLoader.js';

// ============================================================================
// Sphere Log Parsing
// ============================================================================

/**
 * Parse sphere log JSONL and extract ordered steps for a specific player.
 *
 * Each step contains:
 * - locationsChecked: task names the player must complete (in sphere order)
 * - perksReceived: perk display names the player receives (from any source)
 *
 * In multiworld:
 * - Some locationsChecked give items for other players (not perks)
 * - Some perksReceived come from other players' games
 * - The player must still complete tasks in locationsChecked order
 *
 * @param {string} jsonlContent - Sphere log JSONL content
 * @param {number} playerNumber - Player number (default 1)
 * @returns {Array<{sphereIndex: string, locationsChecked: string[], perksReceived: string[]}>}
 */
export function parseSphereLog(jsonlContent, playerNumber = 1) {
    const lines = jsonlContent.trim().split('\n');
    const steps = [];
    const playerKey = String(playerNumber);

    for (const line of lines) {
        const entry = JSON.parse(line);
        if (entry.type !== 'state_update') continue;

        const playerData = entry.player_data?.[playerKey];
        if (!playerData) continue;

        const locationsChecked = playerData.sphere_locations || [];
        const baseItems = playerData.new_inventory_details?.base_items || {};

        if (locationsChecked.length === 0 && Object.keys(baseItems).length === 0) continue;

        steps.push({
            sphereIndex: entry.sphere_index,
            locationsChecked,
            perksReceived: Object.keys(baseItems),
        });
    }

    return steps;
}

// ============================================================================
// Simulation Helpers (parameterized with game data context)
// ============================================================================

function createSimState(ctx) {
    return {
        maxEnergy: ctx.STARTING_ENERGY,
        skillLevels: {},
        skillXp: {},
        perks: new Set(),
        highestZone: -1,
        highestZoneFullyCompleted: -1,
        currentZone: 0,
    };
}

function cloneState(state) {
    return {
        maxEnergy: state.maxEnergy,
        skillLevels: { ...state.skillLevels },
        skillXp: { ...state.skillXp },
        perks: new Set(state.perks),
        highestZone: state.highestZone,
        highestZoneFullyCompleted: state.highestZoneFullyCompleted,
        currentZone: state.currentZone,
    };
}

// --- Energy/Cost Calculations ---

function calcTaskBaseCost(task, zoneId, ctx) {
    const exp = task.type === ctx.TaskType.Boss
        ? ctx.BOSS_COST_EXPONENT
        : ctx.ZONE_COST_EXPONENT;
    return ctx.BASE_COST * task.costMult * Math.pow(exp, zoneId);
}

function calcProgressMult(task, zoneId, state, ctx) {
    let mult = 1.0;

    // Skill level bonus (geometric mean for multi-skill tasks)
    let skillMult = 1.0;
    for (const skill of task.skills) {
        const level = state.skillLevels[skill] || 0;
        skillMult *= Math.pow(ctx.SKILL_LEVEL_EXPONENT, level);
    }
    if (task.skills.length > 0) {
        mult *= Math.pow(skillMult, 1 / task.skills.length);
    }

    // Perk skill modifiers (per-skill, multiplicative)
    for (const perkId of state.perks) {
        const perk = ctx.PERKS[perkId];
        if (!perk) continue;
        for (const skill of task.skills) {
            const mod = perk.skillModifiers[skill];
            if (mod) mult *= (1 + mod);
        }
    }

    // Zone speedup
    mult *= Math.pow(ctx.ZONE_SPEEDUP_BASE, zoneId);

    return mult;
}

function calcTicks(task, zoneId, state, ctx) {
    const cost = calcTaskBaseCost(task, zoneId, ctx);
    const progress = calcProgressMult(task, zoneId, state, ctx);
    return Math.ceil(cost / progress);
}

function calcDrainPerTick(task, zoneId, state, ctx) {
    const singleTick = calcTicks(task, zoneId, state, ctx) <= 1;
    let drain = 1;

    // Minor Time Compression — single-tick tasks cost 80% less
    if (singleTick && state.perks.has(ctx.PerkType.MinorTimeCompression)) {
        drain *= 0.2;
    }

    // High Altitude Climbing — 20% energy reduction
    if (state.perks.has(ctx.PerkType.HighAltitudeClimbing)) {
        drain *= 0.8;
    }

    // Reflections on the Journey — reduction based on zone difference
    if (state.perks.has(ctx.PerkType.ReflectionsOnTheJourney)) {
        const zoneDiff = Math.max(0, state.highestZone - zoneId);
        drain *= Math.pow(0.95, zoneDiff);
    }

    // Zone scaling
    drain *= Math.pow(ctx.ZONE_SPEEDUP_BASE, zoneId);

    return drain;
}

function calcTaskEnergyCost(task, zoneId, state, ctx) {
    const ticks = calcTicks(task, zoneId, state, ctx);
    const drain = calcDrainPerTick(task, zoneId, state, ctx);
    return ticks * drain * task.maxReps;
}

function getMandatoryTasks(zone, ctx) {
    return zone.tasks.filter(t =>
        t.type === ctx.TaskType.Mandatory || t.type === ctx.TaskType.Travel
    );
}

function calcZoneMandatoryCost(zoneId, state, ctx) {
    const zone = ctx.ZONES[zoneId];
    if (!zone) return Infinity;
    let total = 0;
    for (const task of getMandatoryTasks(zone, ctx)) {
        total += calcTaskEnergyCost(task, zoneId, state, ctx);
    }
    return total;
}

// --- XP Calculations ---

function calcTaskXp(task, zoneId, state, ctx) {
    const cost = calcTaskBaseCost(task, zoneId, ctx);
    let xp = cost * 8 * task.xpMult;

    // Writing perk — 50% more XP
    if (state.perks.has(ctx.PerkType.Writing)) xp *= 1.5;

    // Zone scaling
    xp *= Math.pow(1.25, zoneId);

    return xp;
}

function calcXpNeeded(level, skillType, ctx) {
    const skillMult = ctx.SKILL_XP_MULT[skillType] || 1;
    return Math.pow(ctx.SKILL_XP_EXPONENT, level) * 10 * skillMult;
}

function applyTaskXp(task, zoneId, state, ctx) {
    const xpPerRep = calcTaskXp(task, zoneId, state, ctx);
    const totalXp = xpPerRep * task.maxReps;

    for (const skill of task.skills) {
        if (state.skillLevels[skill] === undefined) {
            state.skillLevels[skill] = 0;
            state.skillXp[skill] = 0;
        }
        state.skillXp[skill] += totalXp;
        let needed = calcXpNeeded(state.skillLevels[skill], skill, ctx);
        while (state.skillXp[skill] >= needed) {
            state.skillXp[skill] -= needed;
            state.skillLevels[skill]++;
            needed = calcXpNeeded(state.skillLevels[skill], skill, ctx);
        }
    }
}

// --- State Management ---

function grantPerk(state, perkType, ctx) {
    if (perkType === null || perkType === undefined || state.perks.has(perkType)) return;
    if (perkType === ctx.PerkType.EnergySpell) {
        state.maxEnergy += 50;
    }
    state.perks.add(perkType);
}

function doReset(state, ctx) {
    // Energetic Memory — gain max energy based on current zone
    if (state.perks.has(ctx.PerkType.EnergeticMemory)) {
        const ENERGETIC_MEMORY_MULT = 0.1;
        state.maxEnergy += (state.currentZone + 1) * ENERGETIC_MEMORY_MULT;
    }

    state.highestZoneFullyCompleted = Math.max(
        state.highestZoneFullyCompleted,
        state.highestZone - 1
    );
    state.currentZone = 0;
}

// ============================================================================
// Simulation
// ============================================================================

function getNormalTasks(zone, ctx) {
    return zone.tasks.filter(t => t.type === ctx.TaskType.Normal);
}

/**
 * Spend remaining energy on Normal tasks for XP grinding.
 * Grinds from highest zone down (higher zones give better XP).
 * Mutates state (XP). Returns remaining energy.
 */
function grindForXp(energy, highestReached, state, ctx) {
    for (let z = highestReached; z >= 0 && energy > 0; z--) {
        const zone = ctx.ZONES[z];
        for (const task of getNormalTasks(zone, ctx)) {
            const cost = calcTaskEnergyCost(task, z, state, ctx);
            if (cost <= 0 || cost > energy) continue;
            energy -= cost;
            applyTaskXp(task, z, state, ctx);
        }
    }
    return energy;
}

/**
 * Simulate one run: zone traversal (mandatory+travel tasks) then XP grinding
 * on Normal tasks with remaining energy. Mutates state (XP, highestZone).
 */
function simulateRun(state, maxZone, ctx) {
    let energy = state.maxEnergy;
    let highestReached = -1;

    for (let z = 0; z <= maxZone && z < ctx.ZONES.length; z++) {
        const zone = ctx.ZONES[z];
        const mandatory = getMandatoryTasks(zone, ctx);
        let completedZone = true;

        for (const task of mandatory) {
            const cost = calcTaskEnergyCost(task, z, state, ctx);
            if (cost > energy) {
                completedZone = false;
                break;
            }
            energy -= cost;
            applyTaskXp(task, z, state, ctx);
        }

        if (!completedZone) break;

        highestReached = z;
        state.currentZone = z;
        if (z > state.highestZone) state.highestZone = z;
    }

    // XP grinding: spend remaining energy on Normal tasks
    if (highestReached >= 0) {
        energy = grindForXp(energy, highestReached, state, ctx);
    }

    return { highestReached, remainingEnergy: energy };
}

/**
 * Simulate multiple resets of play.
 * Used to advance state forward after a sphere step.
 * Each reset explores as far as possible then grinds for XP.
 */
function simulateResets(state, numResets, ctx) {
    for (let i = 0; i < numResets; i++) {
        simulateRun(state, ctx.ZONES.length - 1, ctx);
        doReset(state, ctx);
    }
}

/**
 * Estimate how many resets needed to reach and complete a specific task.
 * Includes XP grinding on each run. Clones state so the original is not modified.
 *
 * @returns {number} Number of resets (0 = completable on first try)
 */
function estimateResetsForTask(targetTask, targetZoneId, state, ctx, maxResets = 200) {
    const sim = cloneState(state);

    for (let reset = 0; reset < maxResets; reset++) {
        let energy = sim.maxEnergy;
        let reachable = true;
        let highestReached = -1;

        // Walk zones 0..targetZoneId completing mandatory tasks
        for (let z = 0; z <= targetZoneId && z < ctx.ZONES.length; z++) {
            const zone = ctx.ZONES[z];
            for (const task of getMandatoryTasks(zone, ctx)) {
                const cost = calcTaskEnergyCost(task, z, sim, ctx);
                if (cost > energy) {
                    reachable = false;
                    break;
                }
                energy -= cost;
                applyTaskXp(task, z, sim, ctx);
            }
            if (!reachable) break;

            highestReached = z;
            sim.currentZone = z;
            if (z > sim.highestZone) sim.highestZone = z;
        }

        if (reachable) {
            // If the target task is mandatory/travel, it was already completed
            // during zone traversal (no separate energy check needed)
            const isMandatory = targetTask.type === ctx.TaskType.Mandatory
                || targetTask.type === ctx.TaskType.Travel;
            if (isMandatory) {
                return reset;
            }
            // For normal/boss/prestige tasks, check remaining energy
            const targetCost = calcTaskEnergyCost(targetTask, targetZoneId, sim, ctx);
            if (targetCost <= energy) {
                return reset;
            }
        }

        // XP grinding: spend remaining energy on Normal tasks
        if (highestReached >= 0) {
            grindForXp(energy, highestReached, sim, ctx);
        }

        doReset(sim, ctx);
    }

    return maxResets;
}

// ============================================================================
// Zone Traversal Adjustment
// ============================================================================

/**
 * Adjust mandatory task costs in zones 0..targetZoneId so the zone is
 * reachable within targetResets resets.
 *
 * Finds the maximum multiplier M (least cost reduction) such that
 * estimateResetsForTask(freeTarget, zone) <= targetResets.
 *
 * Mandatory task costMults are modified in-place (persists for future steps).
 *
 * @returns {{ multiplier: number, adjustments: Array<{task: string, zoneId: number, oldCost: number, newCost: number}> }}
 */
function adjustZoneTraversal(targetTask, targetZoneId, state, ctx, targetResets) {
    // Collect mandatory tasks in zones 0..targetZoneId
    const mandatoryEntries = [];
    for (let z = 0; z <= targetZoneId && z < ctx.ZONES.length; z++) {
        for (const task of getMandatoryTasks(ctx.ZONES[z], ctx)) {
            mandatoryEntries.push({ task, zoneId: z, origCost: task.costMult });
        }
    }

    if (mandatoryEntries.length === 0) {
        return { multiplier: 1, adjustments: [] };
    }

    // Set target task to nearly free for zone traversal testing
    const savedTargetCost = targetTask.costMult;
    targetTask.costMult = 0.01;

    // Check if already reachable
    let resets = estimateResetsForTask(targetTask, targetZoneId, state, ctx, targetResets * 3 + 10);
    if (resets <= targetResets) {
        targetTask.costMult = savedTargetCost;
        return { multiplier: 1, adjustments: [] };
    }

    // Binary search for maximum multiplier that makes zone reachable.
    // We want the highest M (least reduction) where resets <= targetResets.
    // Uses log-scale for efficient convergence across the [0.0001, 1.0] range.
    let logLo = Math.log(0.0001);
    let logHi = Math.log(1.0);
    let bestMult = Math.exp(logLo);

    for (let i = 0; i < 25; i++) {
        const logMid = (logLo + logHi) / 2;
        const mid = Math.exp(logMid);
        for (const entry of mandatoryEntries) {
            entry.task.costMult = entry.origCost * mid;
        }

        resets = estimateResetsForTask(targetTask, targetZoneId, state, ctx, targetResets * 3 + 10);

        if (resets <= targetResets) {
            bestMult = mid;
            logLo = logMid; // Try reducing less (higher M)
        } else {
            logHi = logMid; // Need to reduce more (lower M)
        }
    }

    // Apply best multiplier and collect adjustments
    const adjustments = [];
    for (const entry of mandatoryEntries) {
        const newCost = Math.max(0.01, entry.origCost * bestMult);
        entry.task.costMult = newCost;
        if (newCost !== entry.origCost) {
            adjustments.push({
                task: entry.task.name,
                zoneId: entry.zoneId,
                oldCost: entry.origCost,
                newCost,
            });
        }
    }

    targetTask.costMult = savedTargetCost;
    return { multiplier: bestMult, adjustments };
}

// ============================================================================
// XP Boost Adjustment
// ============================================================================

/**
 * Boost xpMult on all tasks in zones 0..targetZoneId to help the player
 * build skill levels faster for reaching the target zone.
 *
 * Finds the minimum multiplier M (least XP boost) such that
 * estimateResetsForTask(freeTarget, zone) <= targetResets.
 *
 * Task xpMults are modified in-place (persists for future steps).
 *
 * @returns {{ multiplier: number, count: number }}
 */
function adjustXpBoost(targetTask, targetZoneId, state, ctx, targetResets) {
    // Collect all tasks in zones 0..targetZoneId
    const xpEntries = [];
    for (let z = 0; z <= targetZoneId && z < ctx.ZONES.length; z++) {
        for (const task of ctx.ZONES[z].tasks) {
            xpEntries.push({ task, origXpMult: task.xpMult });
        }
    }

    if (xpEntries.length === 0) {
        return { multiplier: 1, count: 0 };
    }

    // Set target task to nearly free for testing
    const savedTargetCost = targetTask.costMult;
    targetTask.costMult = 0.01;

    // Check if already reachable
    let resets = estimateResetsForTask(targetTask, targetZoneId, state, ctx, targetResets * 3 + 10);
    if (resets <= targetResets) {
        targetTask.costMult = savedTargetCost;
        return { multiplier: 1, count: 0 };
    }

    // Binary search for minimum XP multiplier that makes zone reachable.
    // M > 1 = boosted XP. We want the lowest M where resets <= targetResets.
    let logLo = Math.log(1.0);
    let logHi = Math.log(10000.0);
    let bestMult = Math.exp(logHi);

    for (let i = 0; i < 25; i++) {
        const logMid = (logLo + logHi) / 2;
        const mid = Math.exp(logMid);
        for (const entry of xpEntries) {
            entry.task.xpMult = entry.origXpMult * mid;
        }

        resets = estimateResetsForTask(targetTask, targetZoneId, state, ctx, targetResets * 3 + 10);

        if (resets <= targetResets) {
            bestMult = mid;
            logHi = logMid; // Try boosting less (lower M)
        } else {
            logLo = logMid; // Need to boost more (higher M)
        }
    }

    // Apply best multiplier
    let count = 0;
    for (const entry of xpEntries) {
        const newXpMult = entry.origXpMult * bestMult;
        if (newXpMult !== entry.origXpMult) {
            entry.task.xpMult = newXpMult;
            count++;
        }
    }

    targetTask.costMult = savedTargetCost;
    return { multiplier: bestMult, count };
}

// ============================================================================
// Cost Adjustment
// ============================================================================

/**
 * Adjust costMult values in game data based on sphere log ordering.
 *
 * For each task the player must complete (from the sphere log), estimates how
 * many resets are needed and adjusts costMult to target resetsPerSphere.
 * When zone traversal is the bottleneck, mandatory task costs along the path
 * are also reduced. Perks from all sources (own tasks + other players) are
 * granted in sphere order.
 *
 * @param {object} gameDataJson - Raw JSON game data (deep-cloned internally)
 * @param {string} sphereLogContent - JSONL content of the sphere log
 * @param {object} options
 * @param {number} options.resetsPerSphere - Target resets between perk tasks (default 5)
 * @param {number} options.playerNumber - Player number in sphere log (default 1)
 * @param {boolean} options.verbose - Log adjustment details (default false)
 * @returns {{ adjustedData: object, log: Array, mandatoryLog: Array }}
 */
export function adjustCosts(gameDataJson, sphereLogContent, options = {}) {
    const { resetsPerSphere = 5, playerNumber = 1, verbose = false } = options;
    const targetResets = Math.max(2, resetsPerSphere);

    // Parse sphere log
    const steps = parseSphereLog(sphereLogContent, playerNumber);

    // Deep clone game data — ctx.ZONES references adjustedData objects
    const adjustedData = JSON.parse(JSON.stringify(gameDataJson));
    const ctx = loadGameDataFromJson(adjustedData);

    // Build task name → { task, zoneId } lookup
    // We need both adjustedData tasks (for output) and ctx tasks (for simulation)
    const taskByName = new Map();
    for (const zone of adjustedData.zones) {
        for (const task of zone.tasks) {
            taskByName.set(task.name, { task, zoneId: zone.id });
        }
    }

    // Build ctx task lookup by (zoneId, taskIndex) for syncing back to adjustedData
    const ctxTaskByName = new Map();
    for (const zone of ctx.ZONES) {
        for (const task of zone.tasks) {
            ctxTaskByName.set(task.name, task);
        }
    }

    // Build perk display name → perk type ID lookup
    const perkNameToId = new Map();
    for (const [idStr, perk] of Object.entries(ctx.PERKS)) {
        perkNameToId.set(perk.name, parseInt(idStr));
    }

    const state = createSimState(ctx);
    const adjustmentLog = [];
    const mandatoryLog = [];

    for (const step of steps) {
        // 1. Complete tasks the player must check (in sphere order)
        for (const locationName of step.locationsChecked) {
            if (locationName === 'Reach Goal Zone') continue;

            const taskInfo = taskByName.get(locationName);
            if (!taskInfo) continue;

            // Get the ctx version of this task (used by simulation)
            const ctxTask = ctxTaskByName.get(locationName);
            if (!ctxTask) continue;

            const { zoneId } = taskInfo;
            const oldCostMult = ctxTask.costMult;

            // Check if zone traversal is the bottleneck by testing with nearly-free task
            const savedCost = ctxTask.costMult;
            ctxTask.costMult = 0.01;
            let minResets = estimateResetsForTask(ctxTask, zoneId, state, ctx);
            ctxTask.costMult = savedCost;

            let actualResets;
            let bottleneck = null;

            if (minResets > targetResets) {
                // Zone traversal is the bottleneck — adjust mandatory costs first
                const { multiplier, adjustments } = adjustZoneTraversal(
                    ctxTask, zoneId, state, ctx, targetResets
                );

                if (adjustments.length > 0) {
                    mandatoryLog.push({
                        trigger: locationName,
                        triggerZone: ctx.ZONES[zoneId]?.name || `Zone ${zoneId}`,
                        type: 'cost',
                        multiplier,
                        count: adjustments.length,
                    });

                    if (verbose) {
                        console.log(
                            `[CostGen] Zone cost adjustment for ${locationName} (zone ${zoneId}): ` +
                            `multiplier=${multiplier.toFixed(6)}, ${adjustments.length} mandatory tasks`
                        );
                    }
                }

                // Re-check after zone cost adjustment
                ctxTask.costMult = 0.01;
                minResets = estimateResetsForTask(ctxTask, zoneId, state, ctx);
                ctxTask.costMult = savedCost;

                if (minResets > targetResets) {
                    // Still unreachable — try XP boosting
                    const { multiplier: xpMult, count: xpCount } = adjustXpBoost(
                        ctxTask, zoneId, state, ctx, targetResets
                    );

                    if (xpCount > 0) {
                        mandatoryLog.push({
                            trigger: locationName,
                            triggerZone: ctx.ZONES[zoneId]?.name || `Zone ${zoneId}`,
                            type: 'xp_boost',
                            multiplier: xpMult,
                            count: xpCount,
                        });

                        if (verbose) {
                            console.log(
                                `[CostGen] XP boost for ${locationName} (zone ${zoneId}): ` +
                                `multiplier=${xpMult.toFixed(2)}, ${xpCount} tasks boosted`
                            );
                        }
                    }

                    // Re-check after XP boost
                    ctxTask.costMult = 0.01;
                    minResets = estimateResetsForTask(ctxTask, zoneId, state, ctx);
                    ctxTask.costMult = savedCost;

                    if (minResets > targetResets) {
                        actualResets = minResets;
                        bottleneck = 'zone_traversal';
                        ctxTask.costMult = 0.01;
                    }
                }
            }

            if (!bottleneck) {
                // Zone is reachable — adjust target task cost
                actualResets = estimateResetsForTask(ctxTask, zoneId, state, ctx);

                if (actualResets < targetResets) {
                    // Too easy — scale up
                    ctxTask.costMult = binarySearchCostMult(
                        ctxTask, zoneId, state, ctx, targetResets,
                        ctxTask.costMult, ctxTask.costMult * 1000
                    );
                } else if (actualResets > targetResets) {
                    if (actualResets >= 200) {
                        // Very hard — scale down from current
                        ctxTask.costMult = binarySearchCostMult(
                            ctxTask, zoneId, state, ctx, targetResets,
                            0.01, ctxTask.costMult
                        );
                    } else {
                        // In range — binary search around ratio estimate
                        const estimate = ctxTask.costMult * (targetResets / actualResets);
                        const lo = Math.min(estimate * 0.5, ctxTask.costMult * 0.1);
                        const hi = Math.max(estimate * 2, ctxTask.costMult * 10);
                        ctxTask.costMult = binarySearchCostMult(
                            ctxTask, zoneId, state, ctx, targetResets, lo, hi
                        );
                    }
                }
            }

            // Clamp to reasonable range
            ctxTask.costMult = Math.max(0.01, ctxTask.costMult);

            const entry = {
                task: locationName,
                zone: ctx.ZONES[zoneId]?.name || `Zone ${zoneId}`,
                zoneId,
                oldCost: oldCostMult,
                newCost: ctxTask.costMult,
                resets: actualResets,
                targetResets,
                bottleneck,
            };
            adjustmentLog.push(entry);

            if (verbose) {
                const change = ctxTask.costMult !== oldCostMult
                    ? `${oldCostMult.toFixed(2)} → ${ctxTask.costMult.toFixed(2)}`
                    : 'unchanged';
                const note = bottleneck ? ' [still bottlenecked]' : '';
                console.log(
                    `[CostGen] ${locationName} (zone ${zoneId}): ` +
                    `${actualResets} resets → target ${targetResets}, costMult ${change}${note}`
                );
            }
        }

        // 2. Grant perks received (from own tasks or other players)
        for (const perkName of step.perksReceived) {
            const perkId = perkNameToId.get(perkName);
            if (perkId !== undefined) {
                grantPerk(state, perkId, ctx);
            }
        }

        // 3. Simulate XP gain from playing targetResets resets
        simulateResets(state, targetResets, ctx);
    }

    // Sync all ctx modifications back to adjustedData
    for (let z = 0; z < ctx.ZONES.length && z < adjustedData.zones.length; z++) {
        const ctxZone = ctx.ZONES[z];
        const dataZone = adjustedData.zones[z];
        for (let t = 0; t < ctxZone.tasks.length && t < dataZone.tasks.length; t++) {
            dataZone.tasks[t].costMult = ctxZone.tasks[t].costMult;
            dataZone.tasks[t].xpMult = ctxZone.tasks[t].xpMult;
        }
    }

    return { adjustedData, log: adjustmentLog, mandatoryLog };
}

/**
 * Binary search for the costMult value that produces ~targetResets.
 * Uses log-scale search to converge efficiently across large ranges
 * (e.g., [0.01, 600000]).
 */
function binarySearchCostMult(task, zoneId, state, ctx, targetResets, lo, hi, iterations = 25) {
    lo = Math.max(lo, 0.001);
    hi = Math.max(hi, lo * 2);
    const savedCost = task.costMult;
    let bestCost = lo;
    let bestDiff = Infinity;
    let logLo = Math.log(lo);
    let logHi = Math.log(hi);

    for (let i = 0; i < iterations; i++) {
        const logMid = (logLo + logHi) / 2;
        const mid = Math.exp(logMid);
        task.costMult = mid;
        const resets = estimateResetsForTask(task, zoneId, state, ctx, targetResets * 3 + 10);
        const diff = Math.abs(resets - targetResets);

        if (diff < bestDiff) {
            bestDiff = diff;
            bestCost = mid;
        }

        if (resets === targetResets) {
            task.costMult = savedCost;
            return mid;
        }

        if (resets > targetResets) {
            logHi = logMid;
        } else {
            logLo = logMid;
        }
    }

    task.costMult = savedCost;
    return bestCost;
}

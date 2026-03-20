/**
 * JTA Cost Planner - Simulated playthrough cost generation
 *
 * Constructs cost data (costMult/xpMult) by simulating a playthrough step by step,
 * generating one action queue per step. Costs are assigned the first time a task
 * appears in the queue, based on what the simulated player can afford.
 *
 * Algorithm per step:
 *   1. Build an action queue: zone traversal (mandatory/travel) → target task → XP grinding
 *   2. Walk the queue; for the first uncosted task:
 *      - Regular tasks: set costMult so energy cost = remaining energy (1st attempt)
 *      - Perk/Boss tasks: set costMult so it takes N attempts (configurable)
 *   3. Simulate the queue (energy drain, XP gain)
 *   4. Reset and repeat until all sphere tasks are completed
 *
 * Modeled after the Loops CostPlanner pattern: simulated playthrough with
 * step-by-step reporting.
 */

import { loadGameDataFromJson } from '../jta-randomizer/jtaGameDataLoader.js';
import { parseSphereLog } from '../jta-randomizer/jtaCostGenerator.js';
import {
    executeTask as sharedExecuteTask,
    calcTaskCost as sharedCalcTaskCost,
    calcTaskProgressPerTick as sharedCalcProgress,
    calcEnergyDrainPerTick as sharedCalcDrain,
    calcSkillXpPerTick as sharedCalcXp,
    calcSkillXpNeeded as sharedCalcXpNeeded,
    isSingleTick as sharedIsSingleTick,
} from '../shared/jtaGameCalc.js';

// ============================================================================
// Simulation Helpers (mirror jtaCostGenerator's internal functions)
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
        // Items/prestige not tracked in cost planning (first playthrough)
        skillSpeedModifiers: {},
        power: 0,
        attunement: 0,
        bottledLightnings: 0,
        prestigeUnlocks: new Set(),
        prestigeRepeatables: new Map(),
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
        skillSpeedModifiers: { ...state.skillSpeedModifiers },
        power: state.power,
        attunement: state.attunement,
        bottledLightnings: state.bottledLightnings,
        prestigeUnlocks: new Set(state.prestigeUnlocks),
        prestigeRepeatables: new Map(state.prestigeRepeatables),
    };
}

function snapshotState(state) {
    return {
        maxEnergy: state.maxEnergy,
        skillLevels: { ...state.skillLevels },
        skillXp: { ...state.skillXp },
        perks: [...state.perks],
        highestZone: state.highestZone,
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

    // Perk skill modifiers
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

function isSingleTick(task, zoneId, state, ctx) {
    return calcTicks(task, zoneId, state, ctx) <= 1;
}

function calcDrainPerTick(task, zoneId, state, ctx) {
    const singleTick = isSingleTick(task, zoneId, state, ctx);
    let drain = 1;

    if (singleTick && state.perks.has(ctx.PerkType.MinorTimeCompression)) {
        drain *= 0.2;
    }
    if (state.perks.has(ctx.PerkType.HighAltitudeClimbing)) {
        drain *= 0.8;
    }
    if (state.perks.has(ctx.PerkType.ReflectionsOnTheJourney)) {
        const zoneDiff = Math.max(0, state.highestZone - zoneId);
        drain *= Math.pow(0.95, zoneDiff);
    }
    drain *= Math.pow(ctx.ZONE_SPEEDUP_BASE, zoneId);

    return drain;
}

/**
 * Calculate energy cost for a task using the shared game calculation module.
 * Uses a cloned state so the caller's state isn't modified.
 */
function calcTaskEnergyCost(task, zoneId, state, ctx) {
    const clonedState = {
        ...state,
        skillLevels: { ...state.skillLevels },
        skillXp: { ...state.skillXp },
    };
    const { energyUsed } = sharedExecuteTask(
        { costMult: task.costMult, xpMult: task.xpMult, maxReps: task.maxReps, skills: task.skills, type: task.type },
        zoneId, clonedState, ctx, Infinity
    );
    return energyUsed;
}

function getMandatoryTasks(zone, ctx) {
    return zone.tasks.filter(t =>
        t.type === ctx.TaskType.Mandatory || t.type === ctx.TaskType.Travel
    );
}

function getNormalTasks(zone, ctx) {
    return zone.tasks.filter(t => t.type === ctx.TaskType.Normal);
}

// --- XP Calculations ---

/**
 * Calculate XP gained per tick, matching the real game's calcSkillXp.
 * The game uses (progressThisTick * 8 * xpMult * ...), NOT (baseCost * 8 * ...).
 * @param {number} progressThisTick - The progress made this tick (calcProgressMult result)
 */
function calcTickXp(task, zoneId, progressThisTick, state, ctx) {
    let xp = progressThisTick * 8 * task.xpMult;
    if (state.perks.has(ctx.PerkType.Writing)) xp *= 1.5;
    xp *= Math.pow(1.25, zoneId);
    return xp;
}

/**
 * Approximate total XP for a full task execution (all reps).
 * Used for display/grinding calculations, not for tick-by-tick simulation.
 */
function calcTaskXp(task, zoneId, state, ctx) {
    const cost = calcTaskBaseCost(task, zoneId, ctx);
    let xp = cost * 8 * task.xpMult;
    if (state.perks.has(ctx.PerkType.Writing)) xp *= 1.5;
    xp *= Math.pow(1.25, zoneId);
    return xp;
}

function calcXpNeeded(level, skillType, ctx) {
    const skillMult = ctx.SKILL_XP_MULT[skillType] || 1;
    return Math.pow(ctx.SKILL_XP_EXPONENT, level) * 10 * skillMult;
}

/**
 * Execute a task tick-by-tick with an energy budget, applying XP to state.
 *
 * Delegates to the shared jtaGameCalc module which has the canonical
 * formulas matching the real game engine exactly.
 *
 * @param {number} energyBudget - Available energy for this task
 * @returns {{ energyUsed: number, completed: boolean }}
 */
function executeTaskWithBudget(task, zoneId, state, ctx, energyBudget) {
    return sharedExecuteTask(
        { costMult: task.costMult, xpMult: task.xpMult, maxReps: task.maxReps, skills: task.skills, type: task.type },
        zoneId, state, ctx, energyBudget
    );
}

/**
 * Apply XP from a full task execution (all reps).
 */
function applyTaskXp(task, zoneId, state, ctx) {
    sharedExecuteTask(
        { costMult: task.costMult, xpMult: task.xpMult, maxReps: task.maxReps, skills: task.skills, type: task.type },
        zoneId, state, ctx, Infinity
    );
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
    if (state.perks.has(ctx.PerkType.EnergeticMemory)) {
        state.maxEnergy += (state.currentZone + 1) * 0.1;
    }
    state.highestZoneFullyCompleted = Math.max(
        state.highestZoneFullyCompleted,
        state.highestZone - 1
    );
    state.currentZone = 0;
}

// ============================================================================
// Cost Solving
// ============================================================================

/**
 * Solve for costMult that makes a task cost exactly `targetEnergy`.
 *
 * energyCost = ceil(BASE_COST * costMult * exp^zone / progress) * drainPerTick * maxReps
 *
 * We solve approximately then verify with ceil.
 */
function solveCostMultForEnergy(task, zoneId, targetEnergy, state, ctx, margin = 0.95, debugLog = null) {
    const exp = task.type === ctx.TaskType.Boss
        ? ctx.BOSS_COST_EXPONENT
        : ctx.ZONE_COST_EXPONENT;
    const progress = calcProgressMult(task, zoneId, state, ctx);
    const drain = calcDrainPerTick(task, zoneId, state, ctx);
    const maxReps = task.maxReps;

    if (drain <= 0 || maxReps <= 0) return 0.01;

    // Target: ceil(BASE_COST * costMult * exp^zone / progress) * drain * maxReps = targetEnergy * margin
    // Approximate (ignoring ceil):
    // costMult = (targetEnergy * margin * progress) / (BASE_COST * exp^zone * drain * maxReps)
    const expPow = Math.pow(exp, zoneId);
    const approxCostMult = (targetEnergy * margin * progress) / (ctx.BASE_COST * expPow * drain * maxReps);

    // Verify and adjust for ceil
    const savedCost = task.costMult;
    task.costMult = approxCostMult;
    let actualCost = calcTaskEnergyCost(task, zoneId, state, ctx);

    if (debugLog) {
        debugLog.push({ type: 'energy_initial_approx', approxCostMult, actualCost, target: targetEnergy * margin, targetEnergy, margin, progress, drain, maxReps });
    }

    // Binary refine if needed (3 iterations)
    let lo = approxCostMult * 0.5;
    let hi = approxCostMult * 2.0;
    const target = targetEnergy * margin;

    for (let i = 0; i < 20; i++) {
        const mid = (lo + hi) / 2;
        task.costMult = mid;
        actualCost = calcTaskEnergyCost(task, zoneId, state, ctx);
        const decision = actualCost > target ? 'hi=mid' : 'lo=mid';
        if (debugLog) {
            debugLog.push({ type: 'energy_iteration', iteration: i, lo, hi, mid, actualCost, target, decision });
        }
        if (actualCost > target) {
            hi = mid;
        } else {
            lo = mid;
        }
    }

    // Use `lo` (last verified-affordable value), not the midpoint.
    // The ceil() in tick calculation makes cost a step function, so
    // (lo+hi)/2 can land on the wrong side of a step boundary.
    const result = Math.max(0.01, lo);
    task.costMult = savedCost;

    if (debugLog) {
        debugLog.push({ type: 'energy_result', finalCostMult: result, totalIterations: 20 });
    }

    return result;
}

/**
 * Solve for costMult (and optionally xpMult) that makes a task require
 * exactly `targetAttempts` attempts.
 *
 * Phase 1: Binary search costMult alone.
 * Phase 2: If no costMult gives exactly targetAttempts (discrete jump),
 *          fix costMult at the boundary and binary search an xpMult
 *          multiplier on all tasks in zones 0..zoneId to fine-tune
 *          the XP gain rate.
 *
 * @param {Map} assignedCosts - Already-assigned costs (from prior steps)
 * @param {object} settings - Planner settings (energyMargin, attempt counts)
 * @param {object} [queueContext] - Sphere target context for queue building.
 *   When provided, the solver builds the same traversal chain as the main loop
 *   (including preceding mandatory tasks). Without it, the solver targets
 *   the focus task directly (no traversal overhead).
 * @param {object} [queueContext.sphereTarget] - The sphere target task
 * @param {number} [queueContext.sphereTargetZoneId] - The sphere target's zone
 * @returns {{ costMult: number, xpAdjustments: Array|null }}
 */
function solveCostMultForAttempts(task, zoneId, targetAttempts, remainingEnergyAtTask, state, ctx, assignedCosts, settings, debugLog = null, expandIter = null, queueContext = null) {
    if (targetAttempts <= 1) {
        const costMult = solveCostMultForEnergy(task, zoneId, remainingEnergyAtTask, state, ctx, undefined, debugLog);
        // If costMult hit the floor and xpMult adjustment is enabled,
        // fall through to Phase 3 to try boosting XP instead.
        if (!(costMult <= 0.01 && settings?.adjustXpMult)) {
            return { costMult, xpAdjustments: null };
        }
        // Fall through — Phase 1 will confirm the floor, then Phase 3 activates
    }

    const savedCost = task.costMult;

    // Phase 1: Binary search costMult alone.
    let logLo = Math.log(0.01);
    let logHi = Math.log(100000);
    let bestCost = null;
    let bestAttempts = 0;

    for (let iter = 0; iter < 30; iter++) {
        const logMid = (logLo + logHi) / 2;
        const candidateCost = Math.exp(logMid);
        task.costMult = candidateCost;

        const isExpandedIter = expandIter && expandIter.phase === 1 && expandIter.iteration === iter;
        const substepLog = isExpandedIter ? [] : null;
        const attempts = simulateActualAttempts(task, zoneId, state, ctx, assignedCosts, targetAttempts + 10, settings, substepLog, queueContext);

        const decision = attempts <= targetAttempts ? 'lo=mid' : 'hi=mid';
        if (debugLog) {
            debugLog.push({
                type: 'attempts_phase1', phase: 1, iteration: iter,
                logLo, logHi, logMid, candidateCost, attempts,
                bestCost, bestAttempts, decision,
                substeps: substepLog,
            });
        }

        if (attempts <= targetAttempts) {
            if (bestCost === null || candidateCost > bestCost) {
                bestCost = candidateCost;
                bestAttempts = attempts;
            }
            logLo = logMid;
        } else {
            logHi = logMid;
        }
    }

    const finalCostMult = Math.max(0.01, bestCost ?? 0.01);

    if (debugLog) {
        debugLog.push({ type: 'attempts_phase1_result', finalCostMult, bestAttempts, targetAttempts });
    }

    // If costMult alone gives the exact target, or xpMult adjustment is disabled, done
    if (bestAttempts === targetAttempts || !settings?.adjustXpMult) {
        task.costMult = savedCost;
        return { costMult: finalCostMult, xpAdjustments: null };
    }

    // Determine whether we need to increase or decrease attempts.
    // Check the actual attempt count at the costMult floor.
    task.costMult = finalCostMult;
    const attemptsAtFloor = simulateActualAttempts(task, zoneId, state, ctx, assignedCosts, targetAttempts + 10, settings, null, queueContext);
    const needMoreAttempts = attemptsAtFloor < targetAttempts;
    const needFewerAttempts = attemptsAtFloor > targetAttempts;

    // Collect tasks whose xpMult we'll adjust.
    // Phase 2 (need more attempts): adjust uncosted tasks only — reducing their
    //   XP slows skill growth, keeping costs high longer.
    // Phase 3 (need fewer attempts): adjust only costed tasks that are actually
    //   executed in the queue (traversal + grinding). These provide the XP that
    //   drives skill growth. Uncosted tasks aren't executed so adjusting them
    //   has no effect.
    const xpTasks = [];
    for (let z = 0; z <= zoneId && z < ctx.ZONES.length; z++) {
        for (const t of ctx.ZONES[z].tasks) {
            if (t.name === task.name) continue;
            if (needMoreAttempts && assignedCosts.has(t.name)) continue; // Phase 2: uncosted only
            if (needFewerAttempts && !assignedCosts.has(t.name)) continue; // Phase 3: costed only
            xpTasks.push({ task: t, origXpMult: t.xpMult });
        }
    }

    if (xpTasks.length === 0) {
        task.costMult = savedCost;
        return { costMult: finalCostMult, xpAdjustments: null };
    }

    const phase = needFewerAttempts ? 3 : 2;
    if (debugLog) {
        debugLog.push({ type: 'phase_separator', phase, taskCount: xpTasks.length, attemptsAtFloor, needMoreAttempts, needFewerAttempts });
    }

    // Binary search for xpMult multiplier M.
    // Phase 2 (M < 1): reduce XP to increase attempts. Want HIGHEST M where attempts >= target.
    // Phase 3 (M > 1): increase XP to decrease attempts. Want LOWEST M where attempts <= target.
    let xpLogLo, xpLogHi;
    let bestXpMult = null;

    if (needFewerAttempts) {
        // Phase 3: search M > 1 (increase XP)
        xpLogLo = Math.log(1.0);
        xpLogHi = Math.log(10000);
    } else {
        // Phase 2: search M < 1 (decrease XP)
        xpLogLo = Math.log(0.0001);
        xpLogHi = Math.log(1.0);
    }

    for (let iter = 0; iter < 30; iter++) {
        const logMid = (xpLogLo + xpLogHi) / 2;
        const mid = Math.exp(logMid);
        for (const entry of xpTasks) {
            entry.task.xpMult = entry.origXpMult * mid;
        }

        const isExpandedIter2 = expandIter && expandIter.phase === phase && expandIter.iteration === iter;
        const substepLog2 = isExpandedIter2 ? [] : null;
        const attempts = simulateActualAttempts(task, zoneId, state, ctx, assignedCosts, targetAttempts + 10, settings, substepLog2, queueContext);

        let decision;
        if (needFewerAttempts) {
            // Phase 3: want attempts <= target
            decision = attempts <= targetAttempts ? 'hi=mid' : 'lo=mid';
            if (attempts <= targetAttempts) {
                if (bestXpMult === null || mid < bestXpMult) bestXpMult = mid;
                xpLogHi = logMid; // try less boost
            } else {
                xpLogLo = logMid; // need more boost
            }
        } else {
            // Phase 2: want attempts >= target
            decision = attempts >= targetAttempts ? 'lo=mid' : 'hi=mid';
            if (attempts >= targetAttempts) {
                if (bestXpMult === null || mid > bestXpMult) bestXpMult = mid;
                xpLogLo = logMid; // try less reduction
            } else {
                xpLogHi = logMid;
            }
        }

        if (debugLog) {
            debugLog.push({
                type: `attempts_phase${phase}`, phase, iteration: iter,
                xpMultiplier: mid, attempts, bestXpMult, decision,
                substeps: substepLog2,
            });
        }
    }

    if (bestXpMult === null) {
        // Adjustment didn't help — fall back to phase 1
        for (const entry of xpTasks) {
            entry.task.xpMult = entry.origXpMult;
        }
        task.costMult = savedCost;
        return { costMult: finalCostMult, xpAdjustments: null };
    }

    // Build xpAdjustments list, but RESTORE xpMult on task objects.
    // The adjustments are applied during the focus task's attempt execution
    // (in the caller) and restored afterward to avoid cascading effects.
    const xpAdjustments = [];
    for (const entry of xpTasks) {
        const newXpMult = entry.origXpMult * bestXpMult;
        if (Math.abs(newXpMult - entry.origXpMult) > 0.0001) {
            xpAdjustments.push({
                taskName: entry.task.name,
                origXpMult: entry.origXpMult,
                newXpMult,
                multiplier: bestXpMult,
            });
        }
        entry.task.xpMult = entry.origXpMult; // always restore
    }

    task.costMult = savedCost;
    return {
        costMult: finalCostMult,
        xpAdjustments: xpAdjustments.length > 0 ? xpAdjustments : null,
    };
}

/**
 * Simulate actual attempts using the same logic as the main planner loop.
 *
 * Mirrors the main loop exactly:
 * - Each attempt builds an action queue and walks it
 * - The first uncosted task (other than the target) gets trial-costed
 *   using solveCostMultForEnergy, just as the main loop would
 * - Trial costs persist across attempts within this simulation
 * - Costed tasks: check affordability, deduct energy, apply XP
 * - Unaffordable tasks: break
 * - Reset between attempts
 *
 * All trial costMult modifications are restored before returning.
 *
 * Returns the 1-based attempt number on which the task is completed.
 * (1 = first try, 5 = fifth try, maxAttempts+1 = never completed)
 */
function simulateActualAttempts(task, zoneId, state, ctx, assignedCosts, maxAttempts, settings, substepLog = null, queueContext = null) {
    const sim = cloneState(state);
    const margin = settings?.energyMargin ?? 0.95;

    // Track trial costs assigned during simulation (separate from real assignedCosts)
    const trialCosts = new Map();
    // Save original costMults for tasks we modify, so we can restore them
    const savedCostMults = new Map();

    // When queueContext is provided, build the queue the same way the main loop
    // does: target the sphere target (so the traversal chain includes all
    // mandatory tasks preceding the focus task), and pass focusSkills/focusTaskName
    // so grinding is scoped to the focus task's skills.
    const useQueueContext = queueContext && queueContext.sphereTarget;
    const queueTarget = useQueueContext ? queueContext.sphereTarget : task;
    const queueTargetZoneId = useQueueContext ? queueContext.sphereTargetZoneId : zoneId;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Build queue using both real and trial costs for the isCosted check.
        // Include the target task so buildActionQueue can check its affordability
        // and skip grinding when the target is already affordable.
        const effectiveCosts = new Map([...assignedCosts, ...trialCosts]);
        effectiveCosts.set(task.name, { costMult: task.costMult });
        const { queue } = buildActionQueue(
            queueTarget, queueTargetZoneId, sim, ctx, effectiveCosts, settings,
            useQueueContext ? task.skills : undefined,
            useQueueContext ? task.name : undefined
        );
        let energy = sim.maxEnergy;
        let completed = false;
        let firstNewCosted = false;

        const stateBefore = substepLog ? snapshotState(sim) : null;
        const queueResults = substepLog ? [] : null;

        for (const entry of queue) {
            const isTarget = entry.task.name === task.name;
            const isCosted = effectiveCosts.has(entry.task.name) || isTarget;

            if (!isCosted) {
                if (!firstNewCosted) {
                    // Trial-cost this task as the main loop would (1-attempt tasks only)
                    firstNewCosted = true;
                    const taskAttempts = getTargetAttempts(entry.task, ctx, settings || {});
                    if (taskAttempts <= 1) {
                        if (!savedCostMults.has(entry.task.name)) {
                            savedCostMults.set(entry.task.name, entry.task.costMult);
                        }
                        const trialCostMult = solveCostMultForEnergy(
                            entry.task, entry.zoneId, energy, sim, ctx, margin
                        );
                        entry.task.costMult = trialCostMult;
                        trialCosts.set(entry.task.name, { costMult: trialCostMult });
                        // Fall through to execute it — record as trial_costed
                        if (queueResults) {
                            // Will be updated below after energy check
                        }
                    } else {
                        // Multi-attempt task encountered during simulation — skip to avoid recursion
                        if (queueResults) {
                            queueResults.push({
                                taskName: entry.task.name, zoneName: entry.zoneName, zoneId: entry.zoneId,
                                type: entry.type, status: 'uncosted_skipped',
                                energyBefore: energy, energyCost: 0, energyAfter: energy,
                            });
                        }
                        continue;
                    }
                } else {
                    if (queueResults) {
                        queueResults.push({
                            taskName: entry.task.name, zoneName: entry.zoneName, zoneId: entry.zoneId,
                            type: entry.type, status: 'uncosted_skipped',
                            energyBefore: energy, energyCost: 0, energyAfter: energy,
                        });
                    }
                    continue;
                }
            }

            const { energyUsed, completed: taskDone } = executeTaskWithBudget(
                entry.task, entry.zoneId, sim, ctx, energy
            );
            const eBefore = energy;
            energy -= energyUsed;

            if (entry.zoneId > sim.highestZone) sim.highestZone = entry.zoneId;
            sim.currentZone = entry.zoneId;

            if (queueResults) {
                queueResults.push({
                    taskName: entry.task.name, zoneName: entry.zoneName, zoneId: entry.zoneId,
                    type: entry.type,
                    status: taskDone ? 'completed' : (energyUsed > 0 ? 'partial' : 'cannot_afford'),
                    energyBefore: eBefore, energyCost: energyUsed, energyAfter: energy,
                });
            }

            if (taskDone && isTarget) {
                completed = true;
            }

            if (!taskDone) break;
        }

        if (substepLog) {
            substepLog.push({
                substep: true,
                attemptNumber: attempt,
                targetTask: task.name,
                targetCompleted: completed,
                queue: queueResults,
                stateBefore,
                stateAfter: snapshotState(sim),
                energyBudget: sim.maxEnergy,
                energyUsed: sim.maxEnergy - energy,
                energyRemaining: energy,
                trialCosts: [...trialCosts.entries()].map(([name, info]) => ({ name, costMult: info.costMult })),
            });
        }

        if (completed) {
            // Restore all modified costMults
            for (const [name, origCost] of savedCostMults) {
                const taskInfo = findTaskByName(name, ctx);
                if (taskInfo) taskInfo.task.costMult = origCost;
            }
            return attempt;
        }

        doReset(sim, ctx);
    }

    // Restore all modified costMults
    for (const [name, origCost] of savedCostMults) {
        const taskInfo = findTaskByName(name, ctx);
        if (taskInfo) taskInfo.task.costMult = origCost;
    }
    return maxAttempts + 1;
}

/**
 * Find a task by name across all zones.
 */
function findTaskByName(name, ctx) {
    for (const zone of ctx.ZONES) {
        for (const task of zone.tasks) {
            if (task.name === name) return { task, zoneId: zone.id };
        }
    }
    return null;
}

// ============================================================================
// Action Queue Generation (simplified strategy for cost planning)
// ============================================================================

/**
 * Build an action queue for reaching and completing a target task.
 * Queue: zone traversal (zones before targetZone) → target task → XP grinding.
 * The player starts in zone 0, so no traversal is needed for zone 0 tasks.
 * Mandatory/travel tasks in a zone are required to LEAVE that zone for the next one.
 */
function buildActionQueue(targetTask, targetZoneId, state, ctx, assignedCosts, settings, focusSkills, focusTaskName) {
    const queue = [];

    // Zone traversal: mandatory/travel tasks for zones BEFORE targetZoneId
    // (completing these lets the player travel through to the target zone)
    // Sort order within each zone:
    //   1. Costed mandatory tasks (known costs deducted first for accurate energy calc)
    //   2. Uncosted mandatory tasks (will be costed based on remaining energy)
    //   3. Travel task (last — requires all mandatory tasks complete)
    // The game allows mandatory tasks in any order, so this reordering is valid.
    for (let z = 0; z < targetZoneId && z < ctx.ZONES.length; z++) {
        const zone = ctx.ZONES[z];
        const tasks = getMandatoryTasks(zone, ctx).slice().sort((a, b) => {
            const aIsTravel = a.type === ctx.TaskType.Travel;
            const bIsTravel = b.type === ctx.TaskType.Travel;
            // Travel tasks always last
            if (aIsTravel !== bIsTravel) return aIsTravel ? 1 : -1;
            // Among non-travel: costed tasks before uncosted
            const aCosted = assignedCosts.has(a.name) ? 0 : 1;
            const bCosted = assignedCosts.has(b.name) ? 0 : 1;
            return aCosted - bCosted;
        });
        for (const task of tasks) {
            queue.push({
                task,
                zoneId: z,
                zoneName: zone.name,
                type: 'traversal',
                isCosted: assignedCosts.has(task.name),
            });
        }
    }

    // Calculate remaining energy after traversal, excluding the focus task
    // (its cost shouldn't reduce the grinding budget — it's what we're grinding FOR)
    let energyAfterTraversal = state.maxEnergy;
    for (const entry of queue) {
        if (entry.task.name === targetTask.name) continue;
        if (focusTaskName && entry.task.name === focusTaskName) continue;
        if (assignedCosts.has(entry.task.name)) {
            energyAfterTraversal -= calcTaskEnergyCost(entry.task, entry.zoneId, state, ctx);
        }
    }

    // Check if the target task is already affordable without grinding.
    // If so, skip grinding and go straight to the target (saves energy).
    // The target's cost is known if it's in assignedCosts OR if the caller
    // (e.g. simulateActualAttempts) has set its costMult directly via the
    // effectiveCosts map passed as assignedCosts.
    const targetCostKnown = assignedCosts.has(targetTask.name);
    const targetCost = targetCostKnown
        ? calcTaskEnergyCost(targetTask, targetZoneId, state, ctx)
        : Infinity;
    const targetAffordable = targetCost <= energyAfterTraversal;

    // Also check if the focus task (if different from the target) is affordable.
    // When the focus task is already affordable after traversal, inserting
    // grinding tasks before it wastes energy and prevents completion.
    let focusAffordable = false;
    if (!targetAffordable && focusTaskName) {
        // Check queue first (focus may be in traversal section)
        const focusQueueEntry = queue.find(e => e.task.name === focusTaskName);
        if (focusQueueEntry && assignedCosts.has(focusQueueEntry.task.name)) {
            const focusCost = calcTaskEnergyCost(focusQueueEntry.task, focusQueueEntry.zoneId, state, ctx);
            focusAffordable = focusCost <= energyAfterTraversal;
        } else if (assignedCosts.has(focusTaskName)) {
            // Focus not in queue (e.g. normal/perk task found via reachability scan).
            // Look it up from game data and check affordability.
            const focusInfo = findTaskByName(focusTaskName, ctx);
            if (focusInfo) {
                const focusCost = calcTaskEnergyCost(focusInfo.task, focusInfo.zoneId, state, ctx);
                focusAffordable = focusCost <= energyAfterTraversal;
            }
        }
    }
    const skipGrinding = targetAffordable || focusAffordable;

    // Identify which skills need grinding — use focusSkills if provided
    // (the actual focus task's skills), otherwise fall back to target task's skills
    const targetSkills = new Set(focusSkills || targetTask.skills || []);

    // Collect grinding candidates from all reachable zones.
    // Only include tasks that already have costs assigned.
    const grindCandidates = [];
    if (!skipGrinding) {
        for (let z = targetZoneId; z >= 0; z--) {
            const zone = ctx.ZONES[z];
            for (const task of getNormalTasks(zone, ctx)) {
                if (task.name === targetTask.name) continue;
                if (task.type === ctx.TaskType.Boss) continue;
                if (!assignedCosts.has(task.name)) continue;
                const cost = calcTaskEnergyCost(task, z, state, ctx);
                if (cost <= 0) continue;
                const xp = calcTaskXp(task, z, state, ctx) * task.maxReps;
                const skills = task.skills.map(s => ctx.SKILL_NAMES?.[s] || `S${s}`);

                // Check if task trains any of the focus's skills
                const trainsTargetSkill = task.skills.some(s => targetSkills.has(s));
                const effectiveXpPerEnergy = xp / cost;

                grindCandidates.push({
                    task, zoneId: z, zoneName: zone.name,
                    cost, xp, xpPerEnergy: xp / cost,
                    effectiveXpPerEnergy, trainsTargetSkill, skills,
                });
            }
        }

    }

    // Only grind tasks that train the focus task's skills.
    // Grinding irrelevant skills wastes energy without reducing the focus task's cost.
    const candidatesToUse = grindCandidates.filter(gc => gc.trainsTargetSkill);
    candidatesToUse.sort((a, b) => b.effectiveXpPerEnergy - a.effectiveXpPerEnergy);

    // Fill the grinding budget with the most efficient tasks.
    // Insert grinding tasks BEFORE the focus task in the queue so the player
    // grinds XP before attempting the expensive focus task.
    const grindBudget = skipGrinding ? 0 : energyAfterTraversal;
    let grindRemaining = grindBudget;
    const selectedGrind = [];
    const grindEntries = [];
    for (const gc of candidatesToUse) {
        if (grindRemaining <= 0) break;
        grindEntries.push({
            task: gc.task,
            zoneId: gc.zoneId,
            zoneName: gc.zoneName,
            type: 'grinding',
            isCosted: assignedCosts.has(gc.task.name),
        });
        selectedGrind.push(gc);
        grindRemaining -= gc.cost;
    }

    // Insert grinding entries before the focus task in the queue
    if (grindEntries.length > 0 && focusTaskName) {
        const focusIdx = queue.findIndex(e => e.task.name === focusTaskName);
        if (focusIdx >= 0) {
            queue.splice(focusIdx, 0, ...grindEntries);
        } else {
            // Focus not in traversal section — append before target
            queue.push(...grindEntries);
        }
    } else {
        queue.push(...grindEntries);
    }

    // Build grinding plan report
    const grindPlan = {
        budget: grindBudget,
        targetAffordable,
        focusAffordable,
        targetSkills: [...targetSkills].map(s => ctx.SKILL_NAMES?.[s] || `S${s}`),
        candidatesConsidered: grindCandidates.length,
        tasksSelected: selectedGrind.length,
        tasks: grindCandidates.map(gc => ({
            taskName: gc.task.name,
            zoneName: gc.zoneName,
            zoneId: gc.zoneId,
            cost: gc.cost,
            xp: gc.xp,
            xpPerEnergy: gc.xpPerEnergy,
            effectiveXpPerEnergy: gc.effectiveXpPerEnergy,
            trainsTargetSkill: gc.trainsTargetSkill,
            skills: gc.skills,
            selected: selectedGrind.includes(gc),
        })),
    };

    // Ensure the focus task is always in the queue (it's what we're trying
    // to complete). It may not be present if it's a Normal task and grinding
    // was skipped or it wasn't selected as a grinding candidate.
    if (focusTaskName && !queue.some(e => e.task.name === focusTaskName) && focusTaskName !== targetTask.name) {
        const focusInfo = findTaskByName(focusTaskName, ctx);
        if (focusInfo && assignedCosts.has(focusTaskName)) {
            queue.push({
                task: focusInfo.task,
                zoneId: focusInfo.zoneId,
                zoneName: ctx.ZONES[focusInfo.zoneId]?.name || `Zone ${focusInfo.zoneId}`,
                type: getTaskCategory(focusInfo.task, ctx),
                isCosted: true,
            });
        }
    }

    // Target task (after grinding — attempt with whatever energy remains)
    queue.push({
        task: targetTask,
        zoneId: targetZoneId,
        zoneName: ctx.ZONES[targetZoneId]?.name || `Zone ${targetZoneId}`,
        type: getTaskCategory(targetTask, ctx),
        isCosted: assignedCosts.has(targetTask.name),
    });

    return { queue, grindPlan };
}

function getTaskCategory(task, ctx) {
    // Mandatory/Travel type takes priority — a task's role in the traversal
    // chain is fundamental. Having a perk is incidental and shouldn't change
    // cost scaling (e.g. Find an Amulet is Mandatory + perk).
    if (task.type === ctx.TaskType.Mandatory || task.type === ctx.TaskType.Travel) return 'traversal';
    if (task.perk !== null && task.perk !== undefined) return 'perk';
    if (task.type === ctx.TaskType.Boss) return 'boss';
    return 'normal';
}

function getTargetAttempts(task, ctx, settings) {
    const category = getTaskCategory(task, ctx);
    if (category === 'perk') return settings.perkAttempts;
    if (category === 'boss') return settings.bossAttempts;
    if (category === 'traversal') return settings.traversalAttempts ?? settings.normalAttempts;
    return settings.normalAttempts;
}

// ============================================================================
// Main Planner
// ============================================================================

/**
 * Default settings for the JTA Cost Planner.
 */
export const DEFAULT_SETTINGS = {
    normalAttempts: 2,     // Regular tasks completable on 2nd try
    perkAttempts: 5,       // Perk tasks completable on 5th try
    bossAttempts: 5,       // Boss tasks completable on 5th try
    traversalAttempts: 5,  // Traversal (mandatory/travel) tasks
    playerNumber: 1,
    energyMargin: 0.90,    // Leave 10% margin on energy calculations
    normalCostScale: 0.5,  // Scale normal task costs down after solving
    traversalCostScale: 0.5, // Scale traversal task costs down after solving
    adjustXpMult: false,   // Whether to adjust xpMult on grinding tasks to hit exact attempt counts
    captureSolverDebug: false,  // Capture binary search iteration data in costAssignment.solverDebug
    solverDebugSteps: null,     // number[] | null — only capture solver debug for these step indices
    expandSolverIteration: null, // { stepIndex, iteration, phase } — capture inner sim substeps for this iteration
};

/**
 * JTA Cost Planner
 *
 * Plans cost generation via simulated playthrough, producing detailed
 * step-by-step reports like the Loops CostPlanner.
 */
export class JTACostPlanner {
    constructor() {
        this._steps = [];
        this._costData = null;
        this._settings = { ...DEFAULT_SETTINGS };
        this._lastPlanResult = null;
        this._verificationResults = null;
    }

    getPlannedSteps() { return this._steps; }
    getCostData() { return this._costData; }
    getSettings() { return { ...this._settings }; }
    getLastPlanResult() { return this._lastPlanResult; }
    getVerificationResults() { return this._verificationResults; }

    updateSettings(newSettings) {
        Object.assign(this._settings, newSettings);
    }

    /**
     * Plan all costs from game data + sphere log.
     *
     * @param {object} gameDataJson - Raw game data JSON
     * @param {string} sphereLogContent - JSONL sphere log content
     * @param {object} [settingsOverride] - Override default settings
     * @returns {{ costData: object, steps: Array, adjustedData: object }}
     */
    /**
     * @param {Function} [settingsOverride.onProgress] - Optional async callback
     *   called after each sphere: onProgress({ sphereIndex, totalSpheres, stepsGenerated }).
     *   When provided, planCosts returns a Promise (yields between spheres for UI updates).
     *   When omitted, runs synchronously and returns the result directly.
     */
    /**
     * Plan costs synchronously. Use planCostsAsync for UI with progress updates.
     */
    planCosts(gameDataJson, sphereLogContent, settingsOverride = {}) {
        const settings = { ...this._settings, ...settingsOverride };
        return this._planCostsCore(gameDataJson, sphereLogContent, settings);
    }

    /**
     * Plan costs asynchronously, yielding between spheres for UI updates.
     * Processes one sphere at a time with setTimeout yields so the browser
     * can repaint between spheres.
     *
     * @param {Function} [onProgress] - Called after each sphere
     * @returns {Promise<object>} Same result as planCosts
     */
    async planCostsAsync(gameDataJson, sphereLogContent, settingsOverride = {}, onProgress = null) {
        const settings = { ...this._settings, ...settingsOverride };

        // --- Setup (same as _planCostsCore) ---
        const steps = parseSphereLog(sphereLogContent, settings.playerNumber);
        const adjustedData = JSON.parse(JSON.stringify(gameDataJson));
        const ctx = loadGameDataFromJson(adjustedData);
        const taskByName = new Map();
        for (const zone of ctx.ZONES) {
            for (const task of zone.tasks) taskByName.set(task.name, { task, zoneId: zone.id });
        }
        const perkNameToId = new Map();
        for (const [idStr, perk] of Object.entries(ctx.PERKS)) perkNameToId.set(perk.name, parseInt(idStr));

        const state = createSimState(ctx);
        const assignedCosts = new Map();
        const plannedSteps = [];
        let globalStepIndex = 0;

        // --- Process spheres with yields ---
        for (let si = 0; si < steps.length; si++) {
            const sphereStep = steps[si];

            // Process this sphere's tasks (reuse _planCostsCore's sphere body).
            // We pass the shared mutable state; the sphere processing mutates it.
            globalStepIndex = this._processSphereInPlace(
                sphereStep, steps, state, ctx, assignedCosts, taskByName, perkNameToId,
                plannedSteps, globalStepIndex, settings
            );

            // Report progress and yield to browser
            if (onProgress) {
                onProgress({
                    sphereIndex: sphereStep.sphereIndex,
                    totalSpheres: steps.length,
                    sphereNum: si + 1,
                    stepsGenerated: globalStepIndex,
                    tasksCosted: assignedCosts.size,
                });
            }
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        return this._finalizePlan(plannedSteps, assignedCosts, adjustedData, taskByName, ctx);
    }

    /** @private */
    _planCostsCore(gameDataJson, sphereLogContent, settings, onProgress) {

        // Parse inputs
        const steps = parseSphereLog(sphereLogContent, settings.playerNumber);
        const adjustedData = JSON.parse(JSON.stringify(gameDataJson));
        const ctx = loadGameDataFromJson(adjustedData);

        // Build lookups
        const taskByName = new Map();
        for (const zone of ctx.ZONES) {
            for (const task of zone.tasks) {
                taskByName.set(task.name, { task, zoneId: zone.id });
            }
        }
        const perkNameToId = new Map();
        for (const [idStr, perk] of Object.entries(ctx.PERKS)) {
            perkNameToId.set(perk.name, parseInt(idStr));
        }

        // Initialize simulation
        const state = createSimState(ctx);
        const assignedCosts = new Map(); // taskName → { costMult, xpMult, assignedOnStep }
        const plannedSteps = [];
        let globalStepIndex = 0;

        // Process each sphere
        for (const sphereStep of steps) {
            globalStepIndex = this._processSphereInPlace(
                sphereStep, steps, state, ctx, assignedCosts, taskByName, perkNameToId,
                plannedSteps, globalStepIndex, settings
            );
            if (onProgress) {
                onProgress({
                    sphereIndex: sphereStep.sphereIndex,
                    totalSpheres: steps.length,
                    sphereNum: steps.indexOf(sphereStep) + 1,
                    stepsGenerated: globalStepIndex,
                    tasksCosted: assignedCosts.size,
                });
            }
        }

        return this._finalizePlan(plannedSteps, assignedCosts, adjustedData, taskByName, ctx);
    }

    /**
     * Process a single sphere's tasks. Mutates state, assignedCosts, plannedSteps in place.
     * @returns {number} Updated globalStepIndex
     * @private
     */
    _processSphereInPlace(sphereStep, steps, state, ctx, assignedCosts, taskByName, perkNameToId, plannedSteps, globalStepIndex, settings) {
            const sphereIndex = sphereStep.sphereIndex;

            // Tasks to complete this sphere
            const tasksToComplete = [];
            for (const locName of sphereStep.locationsChecked) {
                if (locName === 'Reach Goal Zone') continue;
                const info = taskByName.get(locName);
                if (info) tasksToComplete.push({ name: locName, ...info });
            }

            // Process each task in the sphere
            for (const targetInfo of tasksToComplete) {
                const { task: sphereTarget, zoneId: sphereTargetZoneId, name: sphereTargetName } = targetInfo;
                let sphereTargetCompleted = false;
                const maxSteps = 200; // safety limit
                let safetyCounter = 0;

                while (!sphereTargetCompleted && safetyCounter++ < maxSteps) {
                    // Build queue for the sphere target
                    const { queue } = buildActionQueue(sphereTarget, sphereTargetZoneId, state, ctx, assignedCosts, settings);

                    // Find the focus task. Priority:
                    // 1. First uncosted traversal/mandatory task (needed to reach target)
                    // 2. Any uncosted Normal task in reachable zones (cost these before
                    //    perk/boss tasks so they're available as grinding tasks)
                    // 3. First uncosted non-Normal task (perk/boss/travel in target zone)
                    let focusEntry = null;
                    let firstUncostedNonNormal = null;

                    for (const entry of queue) {
                        if (assignedCosts.has(entry.task.name)) continue;

                        const cat = getTaskCategory(entry.task, ctx);
                        if (cat === 'traversal') {
                            // Traversal tasks always take priority — needed to progress
                            focusEntry = entry;
                            break;
                        }
                        if (cat === 'normal') {
                            // Normal task — cost it before perk/boss tasks
                            focusEntry = entry;
                            break;
                        }
                        // Non-normal, non-traversal (perk/boss) — remember it but
                        // check for uncosted Normal tasks first
                        if (!firstUncostedNonNormal) {
                            firstUncostedNonNormal = entry;
                        }
                    }

                    // If no traversal or normal tasks need costing, check for uncosted
                    // Normal tasks in reachable zones (they might not be in the queue
                    // because the queue only includes grinding tasks that fit the budget).
                    // A zone is reachable if all its preceding traversal tasks are costed
                    // AND affordable with current energy.
                    if (!focusEntry && firstUncostedNonNormal) {
                        for (let z = 0; z <= sphereTargetZoneId && z < ctx.ZONES.length; z++) {
                            // Check if zone z is reachable: all traversal in zones before z must be costed
                            let zoneReachable = true;
                            for (let pz = 0; pz < z; pz++) {
                                const pzone = ctx.ZONES[pz];
                                for (const t of getMandatoryTasks(pzone, ctx)) {
                                    if (!assignedCosts.has(t.name)) {
                                        zoneReachable = false;
                                        break;
                                    }
                                }
                                if (!zoneReachable) break;
                            }
                            if (!zoneReachable) break; // can't reach this or any later zone

                            const zone = ctx.ZONES[z];
                            for (const task of getNormalTasks(zone, ctx)) {
                                if (!assignedCosts.has(task.name) && task.name !== sphereTarget.name) {
                                    focusEntry = {
                                        task, zoneId: z, zoneName: zone.name,
                                        type: 'normal', isCosted: false,
                                    };
                                    break;
                                }
                            }
                            if (focusEntry) break;
                        }
                    }

                    // If still no Normal tasks to cost, use the perk/boss task
                    if (!focusEntry) {
                        focusEntry = firstUncostedNonNormal;
                    }

                    if (!focusEntry) {
                        // All tasks costed but sphere target not completed — shouldn't happen
                        break;
                    }

                    const focusTask = focusEntry.task;
                    const focusZoneId = focusEntry.zoneId;
                    const focusZoneName = focusEntry.zoneName;
                    const focusCategory = getTaskCategory(focusTask, ctx);
                    const focusAttempts = getTargetAttempts(focusTask, ctx, settings);

                    // Simulate traversal up to the focus task to get accurate energy
                    // and state (with XP from preceding tasks applied).
                    //
                    // Only count traversal-type entries — grinding entries are not
                    // prerequisites and shouldn't reduce the energy budget.
                    const stateBeforeCost = cloneState(state);
                    const stateAtFocus = cloneState(state);
                    let energyAtFocus = state.maxEnergy;
                    for (const entry of queue) {
                        if (entry.task.name === focusTask.name) break;
                        // Skip non-traversal entries (grinding, perk, etc.)
                        if (entry.type !== 'traversal') continue;
                        if (assignedCosts.has(entry.task.name)) {
                            const cost = calcTaskEnergyCost(entry.task, entry.zoneId, stateAtFocus, ctx);
                            if (cost <= energyAtFocus) {
                                energyAtFocus -= cost;
                                applyTaskXp(entry.task, entry.zoneId, stateAtFocus, ctx);
                                if (entry.zoneId > stateAtFocus.highestZone) stateAtFocus.highestZone = entry.zoneId;
                                stateAtFocus.currentZone = entry.zoneId;
                            } else {
                                energyAtFocus = 0;
                                break;
                            }
                        }
                    }

                    // If the focus task is unreachable (preceding costed tasks consume
                    // all energy), don't cost it yet. Run a grinding step to gain XP —
                    // skills will reduce preceding costs on the next reset.
                    if (energyAtFocus <= 0) {
                        const stateBefore = snapshotState(state);
                        const { queue: stepQueue } = buildActionQueue(sphereTarget, sphereTargetZoneId, state, ctx, assignedCosts, settings, focusTask.skills, focusTask.name);

                        let energy = state.maxEnergy;
                        const queueResults = [];

                        for (const entry of stepQueue) {
                            const { task, zoneId, zoneName, type } = entry;
                            if (!assignedCosts.has(task.name)) {
                                queueResults.push({
                                    taskName: task.name, zoneName, zoneId, type,
                                    status: 'uncosted_skipped',
                                    energyBefore: energy, energyCost: 0, energyAfter: energy,
                                });
                                continue;
                            }
                            const { energyUsed, completed: taskDone } = executeTaskWithBudget(
                                task, zoneId, state, ctx, energy
                            );
                            const eBefore = energy;
                            energy -= energyUsed;
                            if (zoneId > state.highestZone) state.highestZone = zoneId;
                            state.currentZone = zoneId;
                            queueResults.push({
                                taskName: task.name, zoneName, zoneId, type,
                                status: taskDone ? 'completed' : (energyUsed > 0 ? 'partial' : 'cannot_afford'),
                                energyBefore: eBefore, energyCost: energyUsed, energyAfter: energy,
                            });
                            if (!taskDone) break;
                        }

                        plannedSteps.push({
                            stepIndex: globalStepIndex,
                            sphereIndex,
                            sphereTargetTask: sphereTargetName,
                            sphereTargetZoneId: sphereTargetZoneId,
                            targetTask: focusTask.name,
                            targetZone: focusZoneName,
                            targetZoneId: focusZoneId,
                            targetCategory: focusCategory,
                            targetAttempts: focusAttempts,
                            attemptNumber: 0,
                            targetCompleted: false,
                            costAssignment: null,
                            queue: queueResults,
                            stateBefore,
                            stateAfter: snapshotState(state),
                            energyBudget: state.maxEnergy,
                            energyUsed: state.maxEnergy - energy,
                            energyRemaining: energy,
                            notes: [`Focus "${focusTask.name}" unreachable (0 energy at position), grinding for XP`],
                        });

                        globalStepIndex++;
                        doReset(state, ctx);
                        continue; // back to while loop — try again with improved skills
                    }

                    // Assign cost to the focus task
                    // Use stateAtFocus for 1-attempt tasks (matches execution state)
                    // Use stateBeforeCost for multi-attempt tasks (simulation re-walks full queue)
                    const expandIterSetting = settings.expandSolverIteration;
                    const shouldCaptureSolver = (settings.captureSolverDebug &&
                        (settings.solverDebugSteps === null || settings.solverDebugSteps.includes(globalStepIndex))) ||
                        (expandIterSetting && expandIterSetting.stepIndex === globalStepIndex);
                    const solverDebugLog = shouldCaptureSolver ? [] : null;
                    const expandForThisStep = expandIterSetting && expandIterSetting.stepIndex === globalStepIndex
                        ? expandIterSetting : null;

                    let newCostMult;
                    let xpAdjustments = null;
                    // Pass sphere target context so the solver builds the same
                    // traversal chain as the main loop (including mandatory tasks
                    // that precede the focus task).
                    const queueContext = {
                        sphereTarget: sphereTarget,
                        sphereTargetZoneId: sphereTargetZoneId,
                    };
                    if (focusAttempts <= 1) {
                        const result = solveCostMultForAttempts(
                            focusTask, focusZoneId, focusAttempts, energyAtFocus,
                            stateAtFocus, ctx, assignedCosts, settings, solverDebugLog, expandForThisStep, queueContext
                        );
                        newCostMult = result.costMult;
                        xpAdjustments = result.xpAdjustments;
                    } else {
                        const result = solveCostMultForAttempts(
                            focusTask, focusZoneId, focusAttempts, energyAtFocus,
                            stateBeforeCost, ctx, assignedCosts, settings, solverDebugLog, expandForThisStep, queueContext
                        );
                        newCostMult = result.costMult;
                        xpAdjustments = result.xpAdjustments;
                    }

                    // Capture pre-scale costMult before scaling
                    const preSolvedCostMult = newCostMult;

                    // Scale down costs by category to leave more energy for
                    // subsequent tasks in the queue. Only apply for single-attempt
                    // tasks (energy-based solver) — multi-attempt tasks use
                    // simulation that already finds the exact costMult, and
                    // scaling afterward would break the calibrated result.
                    const costScale = focusAttempts <= 1
                        ? (focusCategory === 'traversal' ? (settings.traversalCostScale ?? 1) :
                           focusCategory === 'normal' ? (settings.normalCostScale ?? 1) : 1)
                        : 1;
                    if (costScale < 1) {
                        newCostMult = Math.max(0.01, newCostMult * costScale);
                    }

                    focusTask.costMult = newCostMult;
                    assignedCosts.set(focusTask.name, {
                        costMult: newCostMult,
                        xpMult: focusTask.xpMult,
                        assignedOnStep: globalStepIndex,
                        category: focusCategory,
                        targetAttempts: focusAttempts,
                        energyAtAssignment: energyAtFocus,
                        zoneId: focusZoneId,
                    });

                    // xpAdjustments are recorded in the report but NOT persisted to task
                    // objects — they only affect the binary search simulation for this
                    // focus task, not future steps.

                    let formula;
                    if (focusAttempts <= 1 && !xpAdjustments) {
                        formula = `costMult solved for energyCost = ${(energyAtFocus * settings.energyMargin).toFixed(1)} (${(settings.energyMargin * 100).toFixed(0)}% of ${energyAtFocus.toFixed(1)} remaining)`;
                    } else if (xpAdjustments) {
                        formula = `costMult=${newCostMult.toFixed(4)} + xpMult adjusted on ${xpAdjustments.length} tasks (x${xpAdjustments[0]?.multiplier.toFixed(4)}) for ${focusAttempts} attempts`;
                    } else {
                        formula = `costMult solved for ${focusAttempts} attempts (binary search with actual simulation)`;
                    }

                    const costAssignment = {
                        taskName: focusTask.name,
                        zoneName: focusZoneName,
                        zoneId: focusZoneId,
                        category: focusCategory,
                        costMult: newCostMult,
                        xpMult: focusTask.xpMult,
                        targetAttempts: focusAttempts,
                        energyAvailable: energyAtFocus,
                        formula,
                        xpAdjustments,
                        costScale,
                        preSolvedCostMult,
                        solverDebug: solverDebugLog,
                    };

                    // Apply xpMult adjustments during the focus task's attempts
                    // (restored after the attempts loop completes)
                    if (xpAdjustments) {
                        for (const adj of xpAdjustments) {
                            const info = taskByName.get(adj.taskName);
                            if (info) info.task.xpMult = adj.newXpMult;
                        }
                    }

                    // Run attempts for the focus task
                    let focusCompleted = false;
                    for (let attempt = 1; attempt <= focusAttempts + 20 && !focusCompleted; attempt++) {
                        const stateBefore = snapshotState(state);
                        const { queue: stepQueue, grindPlan: stepGrindPlan } = buildActionQueue(sphereTarget, sphereTargetZoneId, state, ctx, assignedCosts, settings, focusTask.skills, focusTask.name);

                        let energy = state.maxEnergy;
                        const queueResults = [];

                        for (const entry of stepQueue) {
                            const { task, zoneId, zoneName, type } = entry;

                            if (!assignedCosts.has(task.name)) {
                                // Uncosted task — skip (will be its own focus later)
                                queueResults.push({
                                    taskName: task.name, zoneName, zoneId, type,
                                    status: 'uncosted_skipped',
                                    energyBefore: energy, energyCost: 0, energyAfter: energy,
                                });
                                continue;
                            }

                            // Execute task with available energy (supports partial execution).
                            // The real game runs tasks tick-by-tick and gains XP even if
                            // the task can't fully complete within the energy budget.
                            const { energyUsed, completed: taskCompleted } = executeTaskWithBudget(
                                task, zoneId, state, ctx, energy
                            );
                            const energyBefore = energy;
                            energy -= energyUsed;

                            if (zoneId > state.highestZone) state.highestZone = zoneId;
                            state.currentZone = zoneId;

                            queueResults.push({
                                taskName: task.name, zoneName, zoneId, type,
                                status: taskCompleted ? 'completed' : (energyUsed > 0 ? 'partial' : 'cannot_afford'),
                                energyBefore, energyCost: energyUsed, energyAfter: energy,
                                xpGained: taskCompleted ? calcTaskXp(task, zoneId, state, ctx) * task.maxReps : 0,
                            });

                            if (taskCompleted && task.name === focusTask.name) {
                                focusCompleted = true;
                            }
                            if (taskCompleted && task.name === sphereTargetName) {
                                sphereTargetCompleted = true;
                            }

                            if (!taskCompleted) break;
                        }

                        const stateAfter = snapshotState(state);

                        plannedSteps.push({
                            stepIndex: globalStepIndex,
                            sphereIndex,
                            sphereTargetTask: sphereTargetName,
                            sphereTargetZoneId: sphereTargetZoneId,
                            targetTask: focusTask.name,
                            targetZone: focusZoneName,
                            targetZoneId: focusZoneId,
                            targetCategory: focusCategory,
                            targetAttempts: focusAttempts,
                            attemptNumber: attempt,
                            targetCompleted: focusCompleted,
                            costAssignment: attempt === 1 ? costAssignment : null,
                            grindPlan: attempt === 1 ? stepGrindPlan : null,
                            queue: queueResults,
                            stateBefore,
                            stateAfter,
                            energyBudget: state.maxEnergy,
                            energyUsed: state.maxEnergy - energy,
                            energyRemaining: energy,
                            notes: buildStepNotes(
                                attempt === 1 ? costAssignment : null,
                                focusCompleted, attempt, focusAttempts, focusTask.name
                            ),
                        });

                        globalStepIndex++;

                        if (!focusCompleted) {
                            doReset(state, ctx);
                        }
                    }

                    // Restore xpMult adjustments after focus task attempts complete
                    if (xpAdjustments) {
                        for (const adj of xpAdjustments) {
                            const info = taskByName.get(adj.taskName);
                            if (info) info.task.xpMult = adj.origXpMult;
                        }
                    }
                }
            }

            // Grant perks received this sphere
            for (const perkName of sphereStep.perksReceived) {
                const perkId = perkNameToId.get(perkName);
                if (perkId !== undefined) {
                    grantPerk(state, perkId, ctx);
                }
            }

        return globalStepIndex;
    }

    /** @private Finalize the plan result after all spheres are processed. */
    _finalizePlan(plannedSteps, assignedCosts, adjustedData, taskByName, ctx) {
        // Build cost data output (matching the format expected by the game)
        const costData = buildCostOutput(adjustedData, assignedCosts, ctx);

        // Sync assigned costs back to adjustedData
        for (const [taskName, costInfo] of assignedCosts) {
            const info = taskByName.get(taskName);
            if (!info) continue;
            info.task.costMult = costInfo.costMult;
            info.task.xpMult = costInfo.xpMult;
        }
        // Also sync to adjustedData zones
        for (let z = 0; z < ctx.ZONES.length && z < adjustedData.zones.length; z++) {
            for (let t = 0; t < ctx.ZONES[z].tasks.length && t < adjustedData.zones[z].tasks.length; t++) {
                adjustedData.zones[z].tasks[t].costMult = ctx.ZONES[z].tasks[t].costMult;
                adjustedData.zones[z].tasks[t].xpMult = ctx.ZONES[z].tasks[t].xpMult;
            }
        }

        this._steps = plannedSteps;
        this._costData = costData;

        const result = { costData, steps: plannedSteps, adjustedData, assignedCosts };
        this._lastPlanResult = result;
        this._verificationResults = null;
        return result;
    }

    /**
     * Re-run cost planning with solver iteration expansion.
     *
     * Calls planCosts with settings that capture substeps for a specific
     * binary search iteration, then inserts those substeps into the step list.
     *
     * @param {object} gameDataJson - Raw game data JSON
     * @param {string} sphereLogContent - JSONL sphere log content
     * @param {object} settingsOverride - Base settings
     * @param {number} stepIndex - Which step's solver to expand
     * @param {number} iteration - Which binary search iteration to expand
     * @param {number} [phase=1] - Which solver phase (1 or 2)
     * @returns {object} Same as planCosts, with substeps inserted
     */
    planCostsWithExpansion(gameDataJson, sphereLogContent, settingsOverride, stepIndex, iteration, phase = 1) {
        const result = this.planCosts(gameDataJson, sphereLogContent, {
            ...settingsOverride,
            captureSolverDebug: true,
            solverDebugSteps: [stepIndex],
            expandSolverIteration: { stepIndex, iteration, phase },
        });

        // Find the step and extract substeps from the matching debug log entry
        const targetStep = result.steps.find(s => s.stepIndex === stepIndex && s.costAssignment?.solverDebug);
        if (targetStep) {
            const phaseType = phase === 1 ? 'attempts_phase1' : 'attempts_phase2';
            const debugEntry = targetStep.costAssignment.solverDebug.find(
                e => e.type === phaseType && e.iteration === iteration && e.substeps
            );
            if (debugEntry && debugEntry.substeps.length > 0) {
                const insertIdx = result.steps.indexOf(targetStep);
                const substepsWithIndex = debugEntry.substeps.map((sub, i) => ({
                    ...sub,
                    stepIndex: targetStep.stepIndex,
                    substepIteration: iteration,
                    substepPhase: phase,
                    substepNumber: i + 1,
                    displayIndex: `${stepIndex}.${iteration}.${i + 1}`,
                    sphereIndex: targetStep.sphereIndex,
                    targetCategory: targetStep.targetCategory,
                    targetAttempts: debugEntry.attempts,
                }));
                result.steps.splice(insertIdx, 0, ...substepsWithIndex);
            }
        }

        return result;
    }

    /**
     * Verify planned costs by re-running the simulation with all costs pre-assigned.
     *
     * Instead of solving for costs, applies the previously assigned costMults
     * and runs the same step-by-step simulation. Compares actual attempt counts
     * and energy usage against the plan.
     *
     * @param {object} gameDataJson - Same game data used for planning
     * @param {string} sphereLogContent - Same sphere log used for planning
     * @param {Map|object} plannedCosts - assignedCosts from planCosts result
     * @param {object} [settingsOverride] - Override settings
     * @returns {{ verifySteps: Array, comparison: Array }}
     */
    verifyCosts(gameDataJson, sphereLogContent, plannedCosts, settingsOverride = {}) {
        // Delegate to stepVerify and derive per-task comparison from annotated steps
        const { annotatedSteps } = this.stepVerify(gameDataJson, sphereLogContent);
        const costsMap = plannedCosts instanceof Map ? plannedCosts : new Map(Object.entries(plannedCosts));

        // Count planned and actual (verify) attempts per task from the annotated steps
        const plannedAttemptCounts = new Map(); // from plan step data
        const verifyAttemptCounts = new Map();  // from verify completion status
        for (const step of annotatedSteps) {
            const taskName = step.targetTask;
            const attemptNum = step.attemptNumber || 0;
            if (attemptNum > 0) {
                // Planned: highest attempt number the planner generated
                plannedAttemptCounts.set(taskName, Math.max(
                    plannedAttemptCounts.get(taskName) || 0, attemptNum
                ));
            }
            // Verify: count steps where the verify says the task wasn't completed
            const v = step.verification;
            if (v) {
                const prev = verifyAttemptCounts.get(taskName) || 0;
                verifyAttemptCounts.set(taskName, prev + 1);
            }
        }

        // Build comparison: planned attempts (from plan) vs verify attempts
        const comparison = [];
        for (const [taskName, costInfo] of costsMap) {
            const plannedAttempts = plannedAttemptCounts.get(taskName) || (costInfo.targetAttempts || 1);
            const actual = verifyAttemptCounts.get(taskName) || 0;
            const delta = actual - plannedAttempts;
            comparison.push({
                taskName,
                category: costInfo.category || 'unknown',
                zoneId: costInfo.zoneId,
                costMult: costInfo.costMult,
                plannedAttempts,
                actualAttempts: actual,
                delta,
                match: delta === 0,
            });
        }

        const results = { verifySteps: annotatedSteps, comparison, plannedAttemptCounts, verifyAttemptCounts };
        this._verificationResults = results;
        return results;

    }

    /**
     * Step-by-step verification: re-run the simulation with pre-assigned costs,
     * annotating each planned step with verification data (actual energy costs,
     * actual state, deltas). Results are added to the planned steps in-place.
     *
     * @param {object} gameDataJson - Same game data used for planning
     * @param {string} sphereLogContent - Same sphere log used for planning
     * @returns {{ annotatedSteps: Array, summary: object }}
     */
    stepVerify(gameDataJson, sphereLogContent) {
        if (!this._lastPlanResult) {
            throw new Error('No plan to verify. Run planCosts first.');
        }

        const plannedSteps = this._lastPlanResult.steps;
        const costsMap = this._lastPlanResult.assignedCosts;
        const settings = this._settings;

        // Set up fresh simulation with all costs pre-assigned
        const adjustedData = JSON.parse(JSON.stringify(gameDataJson));
        const ctx = loadGameDataFromJson(adjustedData);

        const taskByName = new Map();
        for (const zone of ctx.ZONES) {
            for (const task of zone.tasks) {
                taskByName.set(task.name, { task, zoneId: zone.id });
            }
        }
        const perkNameToId = new Map();
        for (const [idStr, perk] of Object.entries(ctx.PERKS)) {
            perkNameToId.set(perk.name, parseInt(idStr));
        }

        // Don't pre-apply costs — set costMult/xpMult on task objects
        // progressively as cost assignments are encountered, exactly like
        // the planner does. This ensures energy and XP calculations match
        // the planner's state at each step.
        const assignedCosts = new Map();
        const state = createSimState(ctx);
        const stepVerifyData = []; // one entry per planned step

        // Walk through the PLANNED steps directly. Each step tells us
        // exactly what the focus task was — no need to guess.
        let lastSphereIndex = null;
        const steps = parseSphereLog(sphereLogContent, settings.playerNumber);
        const perkNameToIdForGrant = new Map(Object.entries(ctx.PERKS).map(
            ([idStr, p]) => [p.name, parseInt(idStr)]
        ));

        // Build a sphere perk grant schedule from the sphere log
        const spherePerks = new Map(); // sphereIndex → perkNames[]
        for (const sphereStep of steps) {
            spherePerks.set(sphereStep.sphereIndex, sphereStep.perksReceived || []);
        }

        // Track active xpMult adjustments across the entire focus task
        // attempt sequence (the planner applies them before the attempt loop
        // and restores after, so all attempts see the adjusted values).
        let activeXpAdj = null;

        // Build ordered list of sphere indices for perk granting
        const sphereIndices = [...spherePerks.keys()].sort((a, b) => a - b);

        for (const planned of plannedSteps) {
            // Grant perks when we transition to a new sphere.
            // Grant perks for ALL spheres between the old and new index,
            // not just the last one — some spheres may have no planned steps
            // (their tasks were costed during an earlier sphere's processing).
            if (lastSphereIndex !== null && planned.sphereIndex !== lastSphereIndex) {
                for (const si of sphereIndices) {
                    if (si < lastSphereIndex) continue;    // already granted
                    if (si >= planned.sphereIndex) break;   // not yet
                    const perksToGrant = spherePerks.get(si) || [];
                    for (const perkName of perksToGrant) {
                        const perkId = perkNameToIdForGrant.get(perkName);
                        if (perkId !== undefined) grantPerk(state, perkId, ctx);
                    }
                }
            }
            lastSphereIndex = planned.sphereIndex;

            const focusName = planned.targetTask;

            // Use the SPHERE target (not the focus task) to build the queue,
            // so it includes the correct traversal + grinding + target structure.
            // Pass focusTask skills and name so the queue matches the planner's
            // queue (including focus task in queue, scoped grinding, affordability skip).
            const sphereTargetInfo = taskByName.get(planned.sphereTargetTask || focusName);
            if (!sphereTargetInfo) {
                stepVerifyData.push(null);
                continue;
            }
            const sphereTarget = sphereTargetInfo.task;
            const sphereTargetZoneId = planned.sphereTargetZoneId ?? sphereTargetInfo.zoneId;
            const focusInfo = taskByName.get(focusName);

            // Progressively add to assignedCosts and set task object costMult/xpMult
            // when we encounter a cost assignment, matching the planner's state.
            if (planned.costAssignment) {
                const ca = planned.costAssignment;
                assignedCosts.set(ca.taskName, {
                    costMult: ca.costMult,
                    xpMult: ca.xpMult,
                    category: ca.category,
                    targetAttempts: ca.targetAttempts,
                    energyAtAssignment: ca.energyAvailable,
                    zoneId: ca.zoneId,
                });
                // Set on task object so calcTaskEnergyCost/calcTaskXp see the right values
                const caInfo = taskByName.get(ca.taskName);
                if (caInfo) {
                    caInfo.task.costMult = ca.costMult;
                    if (ca.xpMult !== undefined) caInfo.task.xpMult = ca.xpMult;
                }
            }

            // Manage xpMult adjustments: apply when a new costAssignment has them,
            // restore when the focus task completes or changes.
            const newXpAdj = planned.costAssignment?.xpAdjustments;
            if (newXpAdj) {
                // Restore any previous adjustments before applying new ones
                if (activeXpAdj) {
                    for (const adj of activeXpAdj) {
                        const info = taskByName.get(adj.taskName);
                        if (info) info.task.xpMult = adj.origXpMult;
                    }
                }
                activeXpAdj = newXpAdj;
                for (const adj of activeXpAdj) {
                    const info = taskByName.get(adj.taskName);
                    if (info) info.task.xpMult = adj.newXpMult;
                }
            }

            // Replay the planner's recorded queue entries instead of rebuilding
            // the queue. This guarantees the same task ordering and selection
            // as the planner — only energy costs may differ due to state.
            const plannedQueue = planned.queue || [];
            const stateBefore = snapshotState(state);

            let energy = state.maxEnergy;
            const queueResults = [];
            let focusCompleted = false;

            for (const pEntry of plannedQueue) {
                const info = taskByName.get(pEntry.taskName);
                if (!info) continue;
                const { task } = info;
                const zoneId = pEntry.zoneId;
                const zoneName = pEntry.zoneName;
                const type = pEntry.type;

                if (pEntry.status === 'uncosted_skipped') {
                    queueResults.push({
                        taskName: task.name, zoneName, zoneId, type,
                        status: 'uncosted_skipped',
                        energyBefore: energy, energyCost: 0, energyAfter: energy,
                    });
                    continue;
                }

                const energyCost = calcTaskEnergyCost(task, zoneId, state, ctx);

                if (energyCost > energy) {
                    queueResults.push({
                        taskName: task.name, zoneName, zoneId, type,
                        status: 'cannot_afford',
                        energyBefore: energy, energyCost, energyAfter: energy,
                    });
                    break;
                }

                energy -= energyCost;
                applyTaskXp(task, zoneId, state, ctx);
                if (zoneId > state.highestZone) state.highestZone = zoneId;
                state.currentZone = zoneId;

                queueResults.push({
                    taskName: task.name, zoneName, zoneId, type,
                    status: 'completed',
                    energyBefore: energy + energyCost, energyCost, energyAfter: energy,
                });

                if (task.name === focusName) focusCompleted = true;
            }

            // Restore xpMult adjustments when the focus task completes
            if (focusCompleted && activeXpAdj) {
                for (const adj of activeXpAdj) {
                    const info = taskByName.get(adj.taskName);
                    if (info) info.task.xpMult = adj.origXpMult;
                }
                activeXpAdj = null;
            }

            stepVerifyData.push({
                verifyStepIndex: stepVerifyData.length,
                sphereIndex: planned.sphereIndex,
                focusTask: focusName,
                completed: focusCompleted,
                queue: queueResults,
                stateBefore,
                stateAfter: snapshotState(state),
                energyBudget: state.maxEnergy,
                energyUsed: state.maxEnergy - energy,
                energyRemaining: energy,
            });

            if (!focusCompleted) {
                doReset(state, ctx);
            }
        }

        // Restore any dangling xpMult adjustments
        if (activeXpAdj) {
            for (const adj of activeXpAdj) {
                const info = taskByName.get(adj.taskName);
                if (info) info.task.xpMult = adj.origXpMult;
            }
            activeXpAdj = null;
        }

        // Grant perks for the last sphere
        if (lastSphereIndex !== null) {
            const perksToGrant = spherePerks.get(lastSphereIndex) || [];
            for (const perkName of perksToGrant) {
                const perkId = perkNameToIdForGrant.get(perkName);
                if (perkId !== undefined) grantPerk(state, perkId, ctx);
            }
        }

        // Match verify steps to planned steps and annotate
        // Both walk the same sphere log in the same order, so we can match by index
        // within each focus task's attempt sequence.
        const annotatedSteps = plannedSteps.map((planned, i) => {
            const verify = stepVerifyData[i] || null;
            if (!verify) {
                return { ...planned, verification: null };
            }

            // Compare queue entries: match by task name, compare energy costs
            const queueComparison = [];
            const plannedQueue = planned.queue || [];
            const verifyQueue = verify.queue || [];

            // Build verify queue lookup by task name
            const verifyByTask = new Map();
            for (const vq of verifyQueue) {
                verifyByTask.set(vq.taskName, vq);
            }

            for (const pq of plannedQueue) {
                const vq = verifyByTask.get(pq.taskName);
                queueComparison.push({
                    taskName: pq.taskName,
                    planned: {
                        status: pq.status,
                        energyCost: pq.energyCost,
                        energyBefore: pq.energyBefore,
                        energyAfter: pq.energyAfter,
                    },
                    actual: vq ? {
                        status: vq.status,
                        energyCost: vq.energyCost,
                        energyBefore: vq.energyBefore,
                        energyAfter: vq.energyAfter,
                    } : null,
                    delta: vq ? (vq.energyCost || 0) - (pq.energyCost || 0) : null,
                    statusMatch: vq ? vq.status === pq.status : false,
                });
            }

            return {
                ...planned,
                verification: {
                    verifyStepIndex: verify.verifyStepIndex,
                    focusTask: verify.focusTask,
                    completed: verify.completed,
                    energyBudget: verify.energyBudget,
                    energyUsed: verify.energyUsed,
                    energyRemaining: verify.energyRemaining,
                    stateBefore: verify.stateBefore,
                    stateAfter: verify.stateAfter,
                    verifyQueue: verify.queue,
                    queueComparison,
                    energyDelta: verify.energyRemaining - planned.energyRemaining,
                    focusMatch: verify.focusTask === planned.targetTask,
                    completedMatch: verify.completed === planned.targetCompleted,
                },
            };
        });

        // Summary
        const totalSteps = annotatedSteps.length;
        const matched = annotatedSteps.filter(s => s.verification?.completedMatch && s.verification?.focusMatch).length;
        const energyMismatches = annotatedSteps.filter(s =>
            s.verification && Math.abs(s.verification.energyDelta) > 1
        ).length;

        const summary = {
            totalPlannedSteps: totalSteps,
            totalVerifySteps: stepVerifyData.length,
            stepsMatched: matched,
            stepsMismatched: totalSteps - matched,
            energyMismatches,
        };

        // Store for UI access
        this._stepVerifyResults = { annotatedSteps, summary };
        return { annotatedSteps, summary };
    }

    getStepVerifyResults() { return this._stepVerifyResults; }

    /**
     * Real-game verification: replays planned steps using the actual game
     * engine via instant mode. Requires the game iframe to be loaded with
     * the instant mode wrapper.
     *
     * @param {object} eventBus - Event bus for communicating with the game iframe
     * @param {object} gameDataJson - Game data to load into the game
     * @param {Function} [onProgress] - Called with { step, total, taskName } for each step
     * @returns {Promise<{ annotatedSteps: Array, summary: object }>}
     */
    async realGameVerify(eventBus, gameDataJson, onProgress = null) {
        if (!this._lastPlanResult) {
            throw new Error('No plan to verify. Run planCosts first.');
        }

        const plannedSteps = this._lastPlanResult.steps;

        // Helper: publish and wait for response
        function sendAndWait(publishEvent, publishData, responseEvent, timeoutMs = 5000) {
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    unsub();
                    reject(new Error(`Timeout waiting for ${responseEvent}`));
                }, timeoutMs);
                const unsub = eventBus.subscribe(responseEvent, (data) => {
                    clearTimeout(timer);
                    unsub();
                    resolve(data);
                });
                eventBus.publish(publishEvent, publishData || {});
            });
        }

        // 1. Save game state so we can restore after verification
        await sendAndWait('jta:saveGameState', {}, 'jta:gameStateSaved');

        // 2. Pause the game loop to prevent conflicts during verification
        await sendAndWait('jta:pauseGameLoop', {}, 'jta:gameLoopPaused').catch(() => {});

        // 3. Enable instant mode
        const imResult = await sendAndWait('jta:setInstantMode', { enabled: true }, 'jta:instantModeSet');
        if (imResult.error) {
            await sendAndWait('jta:resumeGameLoop', {}, 'jta:gameLoopResumed').catch(() => {});
            throw new Error('Failed to enable instant mode: ' + imResult.error);
        }

        // 4. Reset game to fresh state (clear skills, perks, items from previous play)
        await sendAndWait('jta:resetToFreshState', {}, 'jta:freshStateReady');

        // 5. Load ONLY costMult/xpMult changes into the game.
        // Sending the full adjustedData corrupts other task properties
        // (item/perk refs) that the game's rendering code depends on.
        const costsOnlyData = this._buildCostsOnlyData(gameDataJson);
        await sendAndWait('jta:replaceGameData', costsOnlyData, 'jta:gameDataReplaced', 10000);

        // 4. Get initial state
        const initialState = await sendAndWait('jta:getFullState', {}, 'jta:fullState');

        // 4. Replay each planned step
        const stepResults = [];
        let lastSphereIndex = null;

        // Build sphere perk schedule from planned steps
        const spherePerksGranted = new Set();

        for (let i = 0; i < plannedSteps.length; i++) {
            const planned = plannedSteps[i];
            const focusName = planned.targetTask;

            if (onProgress) {
                onProgress({ step: i, total: plannedSteps.length, taskName: focusName });
            }

            // Get state before this step
            const beforeState = await sendAndWait('jta:getFullState', {}, 'jta:fullState');
            const stateBefore = beforeState.state;

            // Execute each task in the planned queue
            const queueResults = [];
            let focusCompleted = false;

            for (const pEntry of (planned.queue || [])) {
                if (pEntry.status === 'uncosted_skipped') {
                    queueResults.push({
                        taskName: pEntry.taskName,
                        zoneName: pEntry.zoneName,
                        zoneId: pEntry.zoneId,
                        type: pEntry.type,
                        status: 'uncosted_skipped',
                        energyBefore: stateBefore?.currentEnergy,
                        energyCost: 0,
                        energyAfter: stateBefore?.currentEnergy,
                    });
                    continue;
                }

                // Look up the task ID from the game data
                const taskId = this._findTaskId(gameDataJson, pEntry.taskName);
                if (taskId === null) {
                    queueResults.push({
                        taskName: pEntry.taskName, type: pEntry.type,
                        status: 'error', error: 'Task ID not found',
                        energyCost: 0,
                    });
                    continue;
                }

                // Execute the task using the real game engine (tick by tick)
                const result = await sendAndWait(
                    'jta:executeTaskReal', { taskId },
                    'jta:taskExecutedReal'
                );

                if (!result.success) {
                    queueResults.push({
                        taskName: pEntry.taskName,
                        zoneName: pEntry.zoneName,
                        zoneId: pEntry.zoneId,
                        type: pEntry.type,
                        status: result.alreadyCompleted ? 'already_completed' : 'cannot_afford',
                        error: result.error,
                        energyCost: 0,
                    });
                    break;
                }

                queueResults.push({
                    taskName: pEntry.taskName,
                    zoneName: pEntry.zoneName,
                    zoneId: pEntry.zoneId,
                    type: pEntry.type,
                    status: result.completed ? 'completed' : 'partial',
                    energyCost: result.ticks, // energy = ticks (1 drain/tick at zone 0 baseline)
                    energyAfter: result.energy,
                    gameEnergy: result.energy,
                });

                if (result.completed && pEntry.taskName === focusName) {
                    focusCompleted = true;
                }

                // Check if energy reset triggered
                if (result.isInEnergyReset || result.energy <= 0) break;
            }

            // Get state after this step
            const afterStateResponse = await sendAndWait('jta:getFullState', {}, 'jta:fullState');
            const stateAfter = afterStateResponse.state;

            stepResults.push({
                stepIndex: i,
                sphereIndex: planned.sphereIndex,
                focusTask: focusName,
                completed: focusCompleted,
                queue: queueResults,
                stateBefore,
                stateAfter,
                energyBudget: stateBefore?.maxEnergy,
                energyRemaining: stateAfter?.currentEnergy,
            });

            // Reset for next step: restore energy, zone, tasks (skills persist).
            // Matches the planner's model where each step starts fresh.
            await sendAndWait('jta:doHeadlessReset', {}, 'jta:headlessResetDone', 2000).catch(() => {});
        }

        // 5. Restore game state (reloads the game iframe from saved state)
        await sendAndWait('jta:restoreGameState', {}, 'jta:gameStateRestoring').catch(() => {});

        // 6. Annotate planned steps with real game results
        const annotatedSteps = plannedSteps.map((planned, i) => {
            const verify = stepResults[i] || null;
            if (!verify) return { ...planned, realGameVerification: null };

            return {
                ...planned,
                realGameVerification: {
                    completed: verify.completed,
                    energyBudget: verify.energyBudget,
                    energyRemaining: verify.energyRemaining,
                    energyDelta: (verify.energyRemaining ?? 0) - planned.energyRemaining,
                    completedMatch: verify.completed === planned.targetCompleted,
                    queue: verify.queue,
                    stateBefore: verify.stateBefore,
                    stateAfter: verify.stateAfter,
                },
            };
        });

        const totalSteps = annotatedSteps.length;
        const matched = annotatedSteps.filter(s =>
            s.realGameVerification?.completedMatch
        ).length;
        const energyMismatches = annotatedSteps.filter(s =>
            s.realGameVerification && Math.abs(s.realGameVerification.energyDelta) > 1
        ).length;

        const summary = {
            totalPlannedSteps: totalSteps,
            totalVerifySteps: stepResults.length,
            stepsMatched: matched,
            stepsMismatched: totalSteps - matched,
            energyMismatches,
            mode: 'realGame',
        };

        this._realGameVerifyResults = { annotatedSteps, summary };
        return { annotatedSteps, summary };
    }

    getRealGameVerifyResults() { return this._realGameVerifyResults; }

    _buildCostsOnlyData(gameDataJson) {
        // Build a minimal data object with only the fields replaceGameData
        // needs to update costs — avoids corrupting item/perk/rendering data.
        return {
            zones: (gameDataJson.zones || []).map(zone => ({
                tasks: (zone.tasks || []).map(task => ({
                    id: task.id,
                    costMult: task.costMult,
                    xpMult: task.xpMult,
                })),
            })),
        };
    }

    _findTaskId(gameDataJson, taskName) {
        for (const zone of gameDataJson.zones || []) {
            for (const task of zone.tasks || []) {
                if (task.name === taskName) return task.id;
            }
        }
        return null;
    }

    reset() {
        this._steps = [];
        this._costData = null;
        this._lastPlanResult = null;
        this._verificationResults = null;
        this._stepVerifyResults = null;
        this._realGameVerifyResults = null;
    }
}

// ============================================================================
// Helpers
// ============================================================================

function buildStepNotes(costAssignment, targetCompleted, attemptNumber, targetAttempts, targetName) {
    const notes = [];
    if (costAssignment) {
        const { taskName, category, costMult, targetAttempts: ta } = costAssignment;
        notes.push(`Assigned cost to "${taskName}" (${category}): costMult=${costMult.toFixed(4)}, target=${ta} attempt(s)`);
    }
    if (targetCompleted) {
        notes.push(`Target "${targetName}" completed on attempt ${attemptNumber}`);
    } else {
        notes.push(`Target "${targetName}" not completed (attempt ${attemptNumber}/${targetAttempts}), will reset`);
    }
    return notes;
}

function buildCostOutput(adjustedData, assignedCosts, ctx) {
    const taskCosts = {};
    for (const [taskName, info] of assignedCosts) {
        taskCosts[taskName] = {
            costMult: info.costMult,
            xpMult: info.xpMult,
            category: info.category,
            zoneId: info.zoneId,
            targetAttempts: info.targetAttempts,
            assignedOnStep: info.assignedOnStep,
        };
    }

    return {
        version: '1.0',
        generatedAt: new Date().toISOString(),
        generatedFrom: 'jtaCostDebugger',
        settings: { ...DEFAULT_SETTINGS },
        taskCosts,
        adjustedData,
    };
}

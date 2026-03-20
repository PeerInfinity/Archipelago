// JTA Queue Builder - generates queue entries from game state + strategy config
// Converts simulator strategy logic into concrete QueueEntry arrays
//
// Strategy levels (composable, each builds on the previous):
//   baseline         - mandatory zone traversal + perk tasks + XP grinding
//   itemCollection   - baseline + collect & immediately use items
//   pushCollect      - itemCollection + push/collect alternation
//   grindPushCollect - (not yet implemented)
//   artifactUsage    - (not yet implemented)

import {
    ZONES, ENERGY_ITEMS, ITEM_SKILL_MODIFIERS, ARTIFACTS, SKILL_NAMES,
    getMandatoryTasks, TaskType, ItemType,
} from '../jta-randomizer/gameData.js';
import {
    getReachableZones, calcZoneMandatoryEnergyCost, calcItemEnergy,
    getReachablePerkTasks, getReachableItemTasks, getReachableSkillBoostTasks,
    getReachableBossTasks, getAllReachableGrindableTasks, getItemType,
    calcTaskEnergyCostSingleRep, calcTaskEnergyCost, calcTaskXp, calcTotalXpValue,
} from '../jta-randomizer/simulator.js';
import { JTAActionType } from './jtaActionDefs.js';
import { generateEntryId } from '../shared/actionQueue/actionTypes.js';

/**
 * Strategy levels — each level enables all factors up to that point.
 * @enum {string}
 */
export const StrategyLevel = Object.freeze({
    BASELINE: 'baseline',
    ITEM_COLLECTION: 'itemCollection',
    PUSH_COLLECT: 'pushCollect',
    GRIND_PUSH_COLLECT: 'grindPushCollect',
    ARTIFACT_USAGE: 'artifactUsage',
});

// Keep StrategyType for backward compat with loadout storage
export const StrategyType = Object.freeze({
    AUTO: 'auto',
    PUSH: 'push',
    COLLECT: 'collect',
    GRIND_XP: 'grindXp',
});

/**
 * Determine whether the given strategy level enables a factor.
 */
function hasItemCollection(level) {
    return level === StrategyLevel.ITEM_COLLECTION
        || level === StrategyLevel.PUSH_COLLECT
        || level === StrategyLevel.GRIND_PUSH_COLLECT
        || level === StrategyLevel.ARTIFACT_USAGE;
}

function hasPushCollect(level) {
    return level === StrategyLevel.PUSH_COLLECT
        || level === StrategyLevel.GRIND_PUSH_COLLECT
        || level === StrategyLevel.ARTIFACT_USAGE;
}

/**
 * Build queue entries for a strategy given current game state.
 *
 * @param {object} simState - Simulator-format state (from convertToSimState)
 * @param {object} strategy - { type: 'auto' } (from loadout)
 * @param {string} [strategyLevel] - Strategy level from settings (defaults to 'pushCollect' for backward compat)
 * @returns {{ entries: import('../shared/actionQueue/actionTypes.js').QueueEntry[], reasoning: StrategyReasoning }}
 */
export function buildQueueForStrategy(simState, strategy, strategyLevel) {
    const level = strategyLevel || StrategyLevel.PUSH_COLLECT;
    const reasoning = createReasoning(simState, level);

    // Push/collect: decide whether this run should push or collect
    if (hasPushCollect(level)) {
        const pushDecision = analyzePushDecision(simState);
        reasoning.pushCollect = pushDecision;
        if (pushDecision.shouldPush) {
            reasoning.runType = 'push';
            reasoning.notes.push(`Push run: ${pushDecision.reason}`);
        } else {
            reasoning.runType = 'collect';
            reasoning.notes.push(`Collect run: ${pushDecision.reason}`);
        }
        const entries = buildItemCollectionQueue(simState, pushDecision.shouldPush, reasoning);
        return { entries, reasoning };
    }

    // Item collection: always use items immediately
    if (hasItemCollection(level)) {
        reasoning.runType = 'push';
        reasoning.notes.push('Item collection: consume all items at start');
        const entries = buildItemCollectionQueue(simState, true, reasoning);
        return { entries, reasoning };
    }

    // Baseline: mandatory zones + perks + XP grinding, no items
    reasoning.runType = 'baseline';
    reasoning.notes.push('Baseline: mandatory traversal + perk tasks + XP grinding');
    const entries = buildBaselineQueue(simState, reasoning);
    return { entries, reasoning };
}

/**
 * @typedef {object} StrategyReasoning
 * @property {string} strategyLevel - Strategy level used
 * @property {string} runType - 'push' | 'collect' | 'baseline'
 * @property {object} state - Snapshot of key state values
 * @property {object|null} pushCollect - Push/collect decision details
 * @property {object} reachability - Zone reachability analysis
 * @property {object[]} perkDecisions - Per-perk task decisions
 * @property {object[]} itemDecisions - Per-item task decisions
 * @property {object[]} boostDecisions - Per-boost task decisions
 * @property {object[]} bossDecisions - Per-boss task decisions
 * @property {object} grindPlan - XP grinding plan details
 * @property {object[]} allTasks - All tasks in reachable zones with XP/E (verbose mode)
 * @property {object[]} itemsConsumed - Items consumed at start (push run)
 * @property {string[]} notes - General notes/observations
 */

function createReasoning(simState, level) {
    // Summarize skill levels using 3-letter abbreviations
    const skillSummary = {};
    for (const [skill, level_] of Object.entries(simState.skillLevels || {})) {
        if (level_ > 0) {
            const name = (SKILL_NAMES[skill] || `S${skill}`).substring(0, 3);
            skillSummary[name] = level_;
        }
    }

    // Summarize items
    const itemSummary = {};
    if (simState.items) {
        for (const [itemType, count] of simState.items) {
            if (count > 0) itemSummary[getItemName(itemType)] = count;
        }
    }

    return {
        strategyLevel: level,
        runType: null,
        state: {
            maxEnergy: simState.maxEnergy,
            currentEnergy: simState.currentEnergy,
            highestZone: simState.highestZone,
            highestZoneFullyCompleted: simState.highestZoneFullyCompleted,
            perkCount: simState.perks ? simState.perks.size : 0,
            skillLevels: skillSummary,
            items: itemSummary,
            itemEnergy: calcItemEnergy(simState),
        },
        pushCollect: null,
        reachability: {},
        perkDecisions: [],
        itemDecisions: [],
        boostDecisions: [],
        bossDecisions: [],
        grindPlan: { budget: 0, tasksSelected: 0, tasksConsidered: 0, tasks: [] },
        allTasks: null,
        itemsConsumed: [],
        notes: [],
    };
}

/**
 * Analyze push/collect decision with full details.
 */
function analyzePushDecision(simState) {
    const energy = simState.maxEnergy;
    const itemEnergy = calcItemEnergy(simState);

    if (itemEnergy <= 0) {
        return {
            shouldPush: false,
            reason: 'no items held',
            energy,
            itemEnergy,
            nextNewZone: null,
            totalCostToNextNewZone: null,
            itemsCouldReachNewZone: false,
            itemsAreRipe: false,
        };
    }

    const nextNewZone = simState.highestZone + 1;
    let totalCostToNextNewZone = 0;
    for (let z = 0; z <= nextNewZone && z < ZONES.length; z++) {
        totalCostToNextNewZone += calcZoneMandatoryEnergyCost(z, simState);
    }

    const itemsCouldReachNewZone = energy + itemEnergy >= totalCostToNextNewZone * 0.9;
    const itemsAreRipe = itemEnergy >= energy * 0.2;
    const shouldPush = itemsCouldReachNewZone || itemsAreRipe;

    const reasons = [];
    if (itemsCouldReachNewZone) reasons.push(`items could reach zone ${nextNewZone + 1} (${fmtNum(energy + itemEnergy)} >= ${fmtNum(totalCostToNextNewZone * 0.9)} needed)`);
    if (itemsAreRipe) reasons.push(`items are ripe (${fmtNum(itemEnergy)} >= ${fmtNum(energy * 0.2)} threshold)`);
    if (!shouldPush) reasons.push(`items not enough (${fmtNum(itemEnergy)} energy, need ${fmtNum(totalCostToNextNewZone * 0.9)} for zone ${nextNewZone + 1})`);

    return {
        shouldPush,
        reason: reasons.join('; '),
        energy,
        itemEnergy,
        nextNewZone,
        totalCostToNextNewZone,
        itemsCouldReachNewZone,
        itemsAreRipe,
    };
}

function fmtNum(n) {
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.round(n).toLocaleString();
}

/**
 * Determine whether the auto strategy would push or collect,
 * mirroring simulateRun's decision logic.
 */
export function wouldAutoPush(simState) {
    return analyzePushDecision(simState).shouldPush;
}

// ============================================================================
// Strategy: Baseline
// ============================================================================

/**
 * Baseline queue: mandatory zone traversal + perk tasks + XP grinding.
 * No item collection or consumption.
 */
function buildBaselineQueue(simState, reasoning) {
    const energy = simState.maxEnergy;

    // Pass 1: traverse without grind tasks to determine remaining energy
    const plan = planZoneProgression(simState, energy, false, false, undefined, reasoning);

    // Plan grind tasks with the remaining energy budget
    const grindByZone = plan.maxReachableZone >= 0
        ? planXpGrindingByZone(simState, plan.maxReachableZone, plan.remainingEnergy, reasoning)
        : new Map();

    // Catalog all tasks for verbose mode
    catalogAllTasks(simState, plan.maxReachableZone, reasoning);

    // Pass 2: re-traverse with grind tasks interleaved
    const finalPlan = planZoneProgression(simState, energy, false, false, grindByZone);
    return finalPlan.entries;
}

// ============================================================================
// Strategy: Item Collection (also used by Push/Collect)
// ============================================================================

/**
 * Item collection queue. When consumeItems=true (push or standalone item collection),
 * uses all items at start and collects along the way. When consumeItems=false (collect
 * run in push/collect mode), collects items but doesn't consume stockpiled ones.
 */
function buildItemCollectionQueue(simState, consumeItems, reasoning) {
    const entries = [];
    const energy = simState.maxEnergy;

    if (consumeItems) {
        // Use all stockpiled items at start of run
        addUseAllItemEntries(entries, simState, reasoning);
    }

    // Calculate effective energy (with or without item energy)
    const itemEnergy = consumeItems ? calcItemEnergy(simState) : 0;
    const effectiveEnergy = energy + itemEnergy;

    if (reasoning) {
        reasoning.notes.push(`Effective energy: ${fmtNum(effectiveEnergy)} (base ${fmtNum(energy)}${itemEnergy > 0 ? ` + ${fmtNum(itemEnergy)} from items` : ''})`);
    }

    // Pass 1: traverse without grind tasks to determine remaining energy
    const plan = planZoneProgression(simState, effectiveEnergy, consumeItems, true, undefined, reasoning);

    // Plan grind tasks with the remaining energy budget
    const grindByZone = plan.maxReachableZone >= 0
        ? planXpGrindingByZone(simState, plan.maxReachableZone, plan.remainingEnergy, reasoning)
        : new Map();

    // Catalog all tasks for verbose mode
    catalogAllTasks(simState, plan.maxReachableZone, reasoning);

    // Pass 2: re-traverse with grind tasks interleaved
    const finalPlan = planZoneProgression(simState, effectiveEnergy, consumeItems, true, grindByZone);
    entries.push(...finalPlan.entries);

    return entries;
}

// ============================================================================
// Shared Building Blocks
// ============================================================================

/**
 * Plan zone progression: mandatory tasks + perks, optionally + items + bosses.
 * Returns the entries and estimated remaining energy.
 *
 * @param {object} simState
 * @param {number} totalEnergy
 * @param {boolean} consumeItems - Whether items are being consumed (affects energy budget)
 * @param {boolean} collectItems - Whether to include item/boost collection tasks
 * @param {Map<number, QueueEntry[]>} [grindByZone] - Grind tasks grouped by zone to interleave
 * @param {StrategyReasoning} [reasoning] - If provided, collect decision details (only on pass 1)
 */
function planZoneProgression(simState, totalEnergy, consumeItems, collectItems, grindByZone, reasoning) {
    const entries = [];
    let energy = totalEnergy;
    const zonesTraversed = new Set();
    const tasksPlanned = new Set();

    const reachable = getReachableZones(energy, simState);
    const maxReachable = Math.max(...reachable.filter(z => z.canComplete).map(z => z.zoneId), -1);

    if (reasoning) {
        // Record reachability details
        const borderZone = reachable.find(z => !z.canComplete);
        reasoning.reachability = {
            totalEnergy,
            maxReachableZone: maxReachable,
            zonesReachable: reachable.filter(z => z.canComplete).length,
            borderZone: borderZone ? {
                zoneId: borderZone.zoneId,
                zoneName: ZONES[borderZone.zoneId]?.name || `Zone ${borderZone.zoneId + 1}`,
                energyAtStart: borderZone.energyAtStart,
                mandatoryCost: borderZone.mandatoryCost,
                deficit: borderZone.mandatoryCost - borderZone.energyAtStart,
                nextZoneId: borderZone.zoneId + 1,
                nextZoneName: ZONES[borderZone.zoneId + 1]?.name || `Zone ${borderZone.zoneId + 2}`,
            } : null,
            zones: reachable.filter(z => z.canComplete).map(z => ({
                zoneId: z.zoneId,
                zoneName: ZONES[z.zoneId]?.name || `Zone ${z.zoneId + 1}`,
                mandatoryCost: z.mandatoryCost,
                energyAfter: z.energyAfterMandatory,
            })),
        };
    }

    // Build traversal cost lookup: how much energy to reach each zone
    const traversalCostTo = new Map();
    for (const z of reachable) {
        traversalCostTo.set(z.zoneId, totalEnergy - z.energyAtStart);
    }

    if (maxReachable < 0) {
        if (reasoning) {
            reasoning.notes.push('Cannot reach any zone — energy too low');
        }
        return { entries, remainingEnergy: energy, maxReachableZone: 0 };
    }

    // Helper: traverse a zone with its grind tasks interleaved
    const traverseZone = (z) => {
        if (zonesTraversed.has(z)) return;
        const extras = grindByZone ? (grindByZone.get(z) || []) : [];
        addZoneEntries(entries, z, extras);
        energy -= calcZoneMandatoryEnergyCost(z, simState);
        zonesTraversed.add(z);
    };

    // Priority 1: Perks — interleaved with zone navigation
    const perkTasks = getReachablePerkTasks(reachable, simState);
    for (const pt of perkTasks) {
        const affordable = pt.totalEnergyNeeded <= energy;
        if (reasoning) {
            reasoning.perkDecisions.push({
                task: pt.task.name,
                zoneId: pt.zoneId,
                zoneName: ZONES[pt.zoneId]?.name || `Zone ${pt.zoneId + 1}`,
                traversalCost: pt.totalEnergyNeeded - pt.fullCost,
                fullCost: pt.fullCost,
                totalEnergyNeeded: pt.totalEnergyNeeded,
                energyAvailable: energy,
                queued: affordable && !tasksPlanned.has(pt.task.id),
                reason: !affordable ? `too expensive (need ${fmtNum(pt.totalEnergyNeeded)}, have ${fmtNum(energy)})` : 'affordable',
            });
        }
        if (!affordable) continue;
        // Navigate to the zone
        for (let z = 0; z < pt.zoneId; z++) {
            traverseZone(z);
        }
        // Add the perk task
        if (!tasksPlanned.has(pt.task.id)) {
            entries.push(makeTaskEntry(pt.task, pt.zoneId));
            energy -= pt.fullCost;
            tasksPlanned.add(pt.task.id);
        }
    }

    // Priority 2: Energy items (only when item collection is enabled)
    if (collectItems) {
        const itemTasks = getReachableItemTasks(reachable, simState);
        for (const it of itemTasks) {
            const affordable = it.totalCost <= energy && !tasksPlanned.has(it.task.id);
            if (reasoning) {
                reasoning.itemDecisions.push({
                    task: it.task.name,
                    zoneId: it.zoneId,
                    zoneName: ZONES[it.zoneId]?.name || `Zone ${it.zoneId + 1}`,
                    traversalCost: it.totalCost - it.fullCost,
                    fullCost: it.fullCost,
                    totalCost: it.totalCost,
                    itemValue: it.itemValue,
                    netGain: it.netGain,
                    energyAvailable: energy,
                    queued: affordable,
                    reason: !affordable ? `too expensive (need ${fmtNum(it.totalCost)}, have ${fmtNum(energy)})` : `net gain ${fmtNum(it.netGain)}`,
                });
            }
            if (!affordable) continue;
            for (let z = 0; z < it.zoneId; z++) {
                traverseZone(z);
            }
            entries.push(makeTaskEntry(it.task, it.zoneId));
            energy -= it.fullCost;
            tasksPlanned.add(it.task.id);
        }
    }

    // Priority 3: Skill boost items (only when item collection is enabled)
    if (collectItems) {
        const boostTasks = getReachableSkillBoostTasks(reachable, simState);
        for (const bt of boostTasks) {
            const affordable = bt.totalCost <= energy && !tasksPlanned.has(bt.task.id);
            if (reasoning) {
                reasoning.boostDecisions.push({
                    task: bt.task.name,
                    zoneId: bt.zoneId,
                    zoneName: ZONES[bt.zoneId]?.name || `Zone ${bt.zoneId + 1}`,
                    traversalCost: bt.totalCost - bt.fullCost,
                    fullCost: bt.fullCost,
                    totalCost: bt.totalCost,
                    totalBonusValue: bt.totalBonusValue,
                    bonusPerEnergy: bt.bonusPerEnergy,
                    energyAvailable: energy,
                    queued: affordable,
                    reason: !affordable ? `too expensive (need ${fmtNum(bt.totalCost)}, have ${fmtNum(energy)})` : `bonus/energy ${bt.bonusPerEnergy.toFixed(3)}`,
                });
            }
            if (!affordable) continue;
            for (let z = 0; z < bt.zoneId; z++) {
                traverseZone(z);
            }
            entries.push(makeTaskEntry(bt.task, bt.zoneId));
            energy -= bt.fullCost;
            tasksPlanned.add(bt.task.id);
        }
    }

    // Priority 4: Bosses
    const bossTasks = getReachableBossTasks(maxReachable, simState);
    for (const bt of bossTasks) {
        const affordable = bt.fullCost <= energy && !tasksPlanned.has(bt.task.id);
        if (reasoning) {
            reasoning.bossDecisions.push({
                task: bt.task.name,
                zoneId: bt.zoneId,
                zoneName: ZONES[bt.zoneId]?.name || `Zone ${bt.zoneId + 1}`,
                traversalCost: traversalCostTo.get(bt.zoneId) || 0,
                fullCost: bt.fullCost,
                energyAvailable: energy,
                queued: affordable,
                reason: !affordable ? `too expensive (need ${fmtNum(bt.fullCost)}, have ${fmtNum(energy)})` : 'affordable',
            });
        }
        if (!affordable) continue;
        entries.push(makeTaskEntry(bt.task, bt.zoneId));
        energy -= bt.fullCost;
        tasksPlanned.add(bt.task.id);
    }

    // Priority 5: Complete remaining zones (mandatory tasks)
    for (let z = 0; z <= maxReachable; z++) {
        const cost = calcZoneMandatoryEnergyCost(z, simState);
        if (!zonesTraversed.has(z) && cost <= energy) {
            traverseZone(z);
        }
    }

    if (reasoning) {
        reasoning.notes.push(`Zones traversed: ${zonesTraversed.size} (1..${maxReachable + 1}), remaining energy: ${fmtNum(energy)}`);
    }

    return { entries, remainingEnergy: energy, maxReachableZone: maxReachable };
}

/**
 * Pick grinding tasks to fill the energy budget.
 * Tasks are selected by XP/energy efficiency, each with 1 loop (tasks
 * can only be performed once per reset). The last task included may cost
 * more than the remaining budget — we'll run out of energy during it.
 *
 * @param {object} simState
 * @param {number} maxReachableZone
 * @param {number} energyBudget - remaining energy after mandatory traversal
 * @param {StrategyReasoning} [reasoning]
 * @returns {Map<number, QueueEntry[]>} zoneId -> entries for that zone
 */
function planXpGrindingByZone(simState, maxReachableZone, energyBudget, reasoning) {
    const result = new Map();
    if (energyBudget <= 0 || maxReachableZone < 0) {
        if (reasoning) {
            reasoning.grindPlan = { budget: energyBudget, tasksSelected: 0, tasksConsidered: 0, tasks: [] };
            if (energyBudget <= 0) reasoning.notes.push('No energy remaining for XP grinding');
        }
        return result;
    }

    const maxZone = Math.max(maxReachableZone, 0);
    const candidates = getAllReachableGrindableTasks(maxZone, simState);
    candidates.sort((a, b) => b.totalXpPerEnergy - a.totalXpPerEnergy);

    // Select tasks in efficiency order, 1 loop each.
    // Include the first task that exceeds the budget (we'll drain during it).
    let remaining = energyBudget;
    const seen = new Set();
    const grindTasks = [];

    for (const gt of candidates) {
        if (remaining <= 0) break;
        if (seen.has(gt.task.id)) continue;
        if (gt.fullCost <= 0) continue;
        seen.add(gt.task.id);
        remaining -= gt.fullCost;

        const entry = makeTaskEntry(gt.task, gt.zoneId, 1);
        if (!result.has(gt.zoneId)) result.set(gt.zoneId, []);
        result.get(gt.zoneId).push(entry);

        grindTasks.push({
            task: gt.task.name,
            zoneId: gt.zoneId,
            zoneName: ZONES[gt.zoneId]?.name || `Zone ${gt.zoneId + 1}`,
            fullCost: gt.fullCost,
            totalXpPerEnergy: gt.totalXpPerEnergy,
            skills: gt.task.skills.map(s => (SKILL_NAMES[s] || `S${s}`).substring(0, 3)),
            overBudget: remaining < 0,
        });
    }

    if (reasoning) {
        reasoning.grindPlan = {
            budget: energyBudget,
            tasksConsidered: candidates.length,
            tasksSelected: grindTasks.length,
            tasks: grindTasks,
        };
        if (grindTasks.length > 0) {
            reasoning.notes.push(`XP grinding: ${grindTasks.length} tasks from ${candidates.length} candidates, budget ${fmtNum(energyBudget)}`);
        }
    }

    return result;
}

const TASK_TYPE_LABELS = { [TaskType.Normal]: 'Normal', [TaskType.Travel]: 'Travel', [TaskType.Mandatory]: 'Mandatory', [TaskType.Prestige]: 'Prestige', [TaskType.Boss]: 'Boss' };

/**
 * Catalog ALL tasks in reachable zones with XP/E data for verbose strategy log.
 * Includes mandatory, travel, perk, boss, hidden — everything.
 */
function catalogAllTasks(simState, maxReachableZone, reasoning) {
    if (!reasoning || maxReachableZone < 0) return;
    const allTasks = [];
    for (let z = 0; z <= maxReachableZone && z < ZONES.length; z++) {
        const zone = ZONES[z];
        for (const task of zone.tasks) {
            // Skip hidden tasks that haven't been unlocked
            if (task.hidden && !simState.unlockedHiddenTasks.has(task.id)) continue;

            const singleRepCost = calcTaskEnergyCostSingleRep(task, z, simState);
            const fullCost = calcTaskEnergyCost(task, z, simState);
            const xpPerRep = calcTaskXp(task, z, simState);
            const totalXpValue = calcTotalXpValue(task, z, simState);
            const xpPerEnergy = singleRepCost > 0 ? totalXpValue / singleRepCost : 0;

            allTasks.push({
                task: task.name,
                zoneId: z,
                zoneName: zone.name,
                type: TASK_TYPE_LABELS[task.type] || `Type${task.type}`,
                fullCost,
                xpPerEnergy,
                skills: task.skills.map(s => (SKILL_NAMES[s] || `S${s}`).substring(0, 3)),
                hasPerk: task.perk !== null && !simState.perks.has(task.perk),
                isBoss: task.type === TaskType.Boss,
            });
        }
    }
    allTasks.sort((a, b) => b.xpPerEnergy - a.xpPerEnergy);
    reasoning.allTasks = allTasks;
}

// ============================================================================
// Entry Creation Helpers
// ============================================================================

function makeTaskEntry(task, zoneId, loops = 1) {
    const zone = ZONES[zoneId];
    return {
        entryId: generateEntryId(),
        actionType: JTAActionType.CLICK_TASK,
        actionId: task.id,
        label: task.name,
        group: zone ? zone.name : `Zone ${zoneId + 1}`,
        zoneId,
        loops,
        disabled: false,
    };
}

/**
 * Add all tasks for a zone: extras (e.g. grind), then mandatory non-travel, then travel.
 * @param {Array} entries - queue entries to append to
 * @param {number} zoneId
 * @param {Array} [extraEntries] - additional entries to insert before mandatory tasks
 */
function addZoneEntries(entries, zoneId, extraEntries = []) {
    const zone = ZONES[zoneId];
    if (!zone) return;
    const mandatory = getMandatoryTasks(zone);
    // Extra tasks first (e.g. grind tasks chosen for XP)
    entries.push(...extraEntries);
    // Mandatory (non-travel) tasks
    for (const task of mandatory) {
        if (task.type !== TaskType.Travel) {
            entries.push(makeTaskEntry(task, zoneId));
        }
    }
    // Travel task last (leaves the zone)
    for (const task of mandatory) {
        if (task.type === TaskType.Travel) {
            entries.push(makeTaskEntry(task, zoneId));
        }
    }
}

function addUseAllItemEntries(entries, simState, reasoning) {
    // Energy items
    for (const [itemType, count] of simState.items) {
        if (count <= 0) continue;
        if (ENERGY_ITEMS[itemType] !== undefined) {
            entries.push({
                entryId: generateEntryId(),
                actionType: JTAActionType.USE_ALL_ITEMS,
                actionId: itemType,
                label: getItemName(itemType),
                group: 'Items',
                loops: 1,
                disabled: false,
            });
            if (reasoning) {
                reasoning.itemsConsumed.push({
                    name: getItemName(itemType),
                    count,
                    type: 'energy',
                    energyValue: ENERGY_ITEMS[itemType] * count,
                });
            }
        }
    }

    // Skill boost items
    for (const [itemType, count] of simState.items) {
        if (count <= 0) continue;
        if (ITEM_SKILL_MODIFIERS[itemType]) {
            entries.push({
                entryId: generateEntryId(),
                actionType: JTAActionType.USE_ALL_ITEMS,
                actionId: itemType,
                label: getItemName(itemType),
                group: 'Items',
                loops: 1,
                disabled: false,
            });
            if (reasoning) {
                reasoning.itemsConsumed.push({
                    name: getItemName(itemType),
                    count,
                    type: 'skillBoost',
                    modifiers: { ...ITEM_SKILL_MODIFIERS[itemType] },
                });
            }
        }
    }
}

// Simple reverse lookup for item names
const ITEM_NAMES = {};
for (const [name, value] of Object.entries(ItemType)) {
    ITEM_NAMES[value] = name;
}

function getItemName(itemType) {
    return ITEM_NAMES[itemType] || `Item ${itemType}`;
}

/**
 * Generate a set of strategy-backed loadouts for a multi-queue strategy.
 *
 * @param {StrategyType} strategyType
 * @returns {{ loadouts: Array<{name: string, strategy: StrategyConfig, repeatCount: number, nextLoadout: number}> }}
 */
export function generateStrategyLoadouts(strategyType) {
    return {
        loadouts: [{
            name: '[Auto]',
            strategy: { type: StrategyType.AUTO },
            repeatCount: 0, // infinite
            nextLoadout: -1,
        }],
    };
}

import { Task, ZONES, TaskType, TASK_LOOKUP, TaskDefinition } from "./zones.js";
import { GAMESTATE, setTickRate } from "./game.js";
import { HASTE_MULT, ItemDefinition, ITEMS, ARTIFACTS, ItemType, MAGIC_RING_MULT, BOTTLED_LIGHTNING_MULT, NOTE_ITEMS } from "./items.js";
import { getReflectionsOnTheJourneyExponent, PerkDefinition, PERKS, PerkType } from "./perks.js";
import { SkillUpContext, EventType, RenderEvent, GainedPerkContext, UsedItemContext, UnlockedTaskContext, UnlockedSkillContext, EventContext, HighestZoneContext, SkippedTasksContext } from "./events.js";
import { SKILL_DEFINITIONS, SkillDefinition, SKILLS, SkillType } from "./skills.js";
import { PRESTIGE_UNLOCKABLES, PRESTIGE_REPEATABLES, PrestigeRepeatableType, PrestigeUnlock, PrestigeUnlockType, PrestigeRepeatable, DIVINE_KNOWLEDGE_MULT, DIVINE_APPETITE_ENERGY_ITEM_BOOST_MULT, GOTTA_GO_FAST_BASE, PrestigeLayer, DIVINE_LIGHTNING_EXPONENT_INCREASE, TRANSCENDANT_APTITUDE_MULT, ENERGIZED_INCREASE, DIVINE_SPEED_TICKS_PER_PERCENT, PERKY_BASE, COMPULSIVE_NOTE_TAKING_AMOUNT, ENERGIZED_PERK_INCREASE, MANDATORY_SCHMANDATORY_MULT, DIVINE_ATTUNEMENT_BASE, SPITE_THE_GODS_MULT, DIVINER_KNOWLEDGE_MULT } from "./prestige_upgrades.js";
import { AWAKENING_DIVINE_SPARK_MULT, DEFIED_THE_GODS_SPARK_MULT, ENERGETIC_MEMORY_MULT, MAJOR_TIME_COMPRESSION_EFFECT, UNIFIED_THEORY_OF_MAGIC_EFFECT } from "./simulation_constants.js";
// MARK: Constants
let task_progress_mult = 1;
const ZONE_SPEEDUP_BASE = 1.05;
export const BOSS_MAX_ENERGY_DISPARITY = 5;
const STARTING_ENERGY = 100;
const DEFAULT_TICK_RATE = 66.6;
export const SAVE_VERSION = "0.5.0";
// MARK: Skills
export class Skill {
    type = SkillType.Count;
    level = 0;
    progress = 0;
    speed_modifier = 1;
    constructor(type, level) {
        this.type = type;
        this.level = level;
    }
}
export function calcSkillXp(task, task_progress, ignore_boost = false) {
    const xp_mult = 8;
    let xp = task_progress * xp_mult * task.task_definition.xp_mult;
    if (hasPerk(PerkType.Writing)) {
        xp *= 1.5;
    }
    if (hasPerk(PerkType.GazedBeyondTheVeil)) {
        xp *= 2;
    }
    if (hasPrestigeUnlock(PrestigeUnlockType.DivineInspiration)) {
        xp *= 1.5;
    }
    xp *= 1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.DivineKnowledge) * DIVINE_KNOWLEDGE_MULT;
    xp *= 1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.DivinerKnowledge) * DIVINER_KNOWLEDGE_MULT;
    xp *= Math.pow(1.25, task.task_definition.zone_id);
    if (!ignore_boost && task.xp_boosted) {
        xp *= MAGIC_RING_MULT;
    }
    return xp;
}
export function calcSkillXpNeeded(skill) {
    return calcSkillXpNeededAtLevel(skill.level, skill.type);
}
export function calcSkillXpNeededAtLevel(level, skill_type) {
    const exponent_base = 1.02;
    const base_amount = 10;
    const skill_modifier = SKILL_DEFINITIONS[skill_type].xp_needed_mult;
    return Math.pow(exponent_base, level) * base_amount * skill_modifier;
}
export function addSkillXp(skill, xp) {
    const skill_entry = getSkill(skill);
    skill_entry.progress += xp;
    let xp_to_level_up = calcSkillXpNeeded(skill_entry);
    const old_level = skill_entry.level;
    while (skill_entry.progress >= xp_to_level_up) {
        skill_entry.progress -= xp_to_level_up;
        skill_entry.level += 1;
        xp_to_level_up = calcSkillXpNeeded(skill_entry);
    }
    if (skill_entry.level > old_level) {
        const context = { skill: skill_entry.type, new_level: skill_entry.level, levels_gained: skill_entry.level - old_level };
        const event = new RenderEvent(EventType.SkillUp, context);
        GAMESTATE.queueRenderEvent(event);
    }
}
function removeTemporarySkillBonuses() {
    for (const skill of GAMESTATE.skills.values()) {
        skill.speed_modifier = 1;
    }
}
export function calcSkillTaskProgressMultiplierFromLevel(level) {
    const exponent = 1.01;
    return Math.pow(exponent, level);
}
export function calcSkillTaskProgressWithoutLevel(skill_type) {
    let mult = 1;
    const skill = getSkill(skill_type);
    mult *= skill.speed_modifier;
    for (const [perk_type, active] of GAMESTATE.perks) {
        if (!active) {
            continue;
        }
        const perk = PERKS[perk_type];
        mult *= 1 + perk.skill_modifiers.getSkillEffect(skill_type);
    }
    if (getPowerSkills().includes(skill_type)) {
        mult *= calcPowerSpeedBonusAtLevel(GAMESTATE.power);
    }
    if (calcAttunementSkills().includes(skill_type)) {
        mult *= calcAttunementSpeedBonusAtLevel(GAMESTATE.attunement);
    }
    if (getSpiteTheGodsSkills().includes(skill_type)) {
        mult *= calcSpiteTheGodsBonus();
    }
    return mult;
}
export function calcSkillTaskProgressMultiplier(skill_type) {
    const skill = getSkill(skill_type);
    let mult = calcSkillTaskProgressWithoutLevel(skill_type);
    mult *= calcSkillTaskProgressMultiplierFromLevel(skill.level);
    return mult;
}
export function getSkill(skill) {
    const ret = GAMESTATE.skills[skill];
    if (!ret) {
        console.error("Couldn't find skill");
        return new Skill(skill, 0);
    }
    return ret;
}
function initializeSkills() {
    GAMESTATE.skills = [];
    GAMESTATE.skills_at_start_of_reset = [];
    const global_target_level = getPrestigeRepeatableLevel(PrestigeRepeatableType.TranscendantAptitude) * TRANSCENDANT_APTITUDE_MULT;
    for (let skill = 0; skill < SkillType.Count; ++skill) {
        const target_level = skill == SkillType.Ascension ? global_target_level / 2 : global_target_level;
        GAMESTATE.skills.push(new Skill(skill, target_level));
        GAMESTATE.skills_at_start_of_reset.push(target_level);
    }
}
function storeLoopStartNumbersForNextGameOver() {
    for (const skill of SKILLS) {
        GAMESTATE.skills_at_start_of_reset[skill] = getSkill(skill).level;
    }
    GAMESTATE.attunement_at_start_of_reset = GAMESTATE.attunement;
    GAMESTATE.power_at_start_of_reset = GAMESTATE.power;
}
// MARK: Tasks
export function calcTaskCost(task) {
    const base_cost = 10;
    const normal_exponent = 2.2;
    const boss_exponent = 4;
    const zone_exponent = task.task_definition.type == TaskType.Boss ? boss_exponent : normal_exponent;
    const zone_mult = Math.pow(zone_exponent, task.task_definition.zone_id);
    return base_cost * task.task_definition.cost_multiplier * zone_mult;
}
export function calcTaskProgressMultiplier(task, override_haste = null, override_lightning = null) {
    let mult = 1;
    let skill_level_mult = 1;
    for (const skill_type of task.task_definition.skills) {
        skill_level_mult *= calcSkillTaskProgressMultiplierFromLevel(getSkill(skill_type).level);
    }
    // Avoid multi-skill tasks scaling much faster than all other tasks
    mult *= Math.pow(skill_level_mult, 1 / task.task_definition.skills.length);
    let has_attunement_skill = false;
    for (const skill_type of task.task_definition.skills) {
        mult *= calcSkillTaskProgressWithoutLevel(skill_type);
        const is_attunement_skill = calcAttunementSkills().includes(skill_type);
        if (is_attunement_skill) {
            has_attunement_skill = true;
            mult /= calcAttunementSpeedBonusAtLevel(GAMESTATE.attunement);
        }
    }
    // The bonus gets truly ridiculous if we let it stack, so let's not
    if (has_attunement_skill) {
        mult *= calcAttunementSpeedBonusAtLevel(GAMESTATE.attunement);
    }
    mult *= Math.pow(GOTTA_GO_FAST_BASE, getPrestigeRepeatableLevel(PrestigeRepeatableType.GottaGoFast));
    if ((override_haste === null && task.hasted) || override_haste === true) {
        mult *= HASTE_MULT;
    }
    if ((override_lightning === null && task.lightning) || override_lightning === true) {
        mult *= BOTTLED_LIGHTNING_MULT;
    }
    mult *= Math.pow(ZONE_SPEEDUP_BASE, task.task_definition.zone_id);
    if (hasPerk(PerkType.MajorTimeCompression)) {
        mult *= MAJOR_TIME_COMPRESSION_EFFECT;
    }
    if (hasPerk(PerkType.UnifiedTheoryOfMagic)) {
        mult *= Math.pow(1 + UNIFIED_THEORY_OF_MAGIC_EFFECT, GAMESTATE.highest_zone_fully_completed + 1);
    }
    const mandatoryish = task.task_definition.type == TaskType.Travel || task.task_definition.type == TaskType.Mandatory || task.task_definition.type == TaskType.Prestige;
    if (mandatoryish) {
        mult *= 1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.MandatorySchmandatory) * MANDATORY_SCHMANDATORY_MULT;
    }
    return mult * task_progress_mult;
}
export function calcTaskProgressPerTick(task) {
    return calcTaskProgressMultiplier(task);
}
export function calcTaskTicks(progress_per_tick, cost) {
    return Math.ceil(cost / progress_per_tick);
}
function calcTaskEnergyCost(task, hasted, lightning) {
    const progress_per_tick = calcTaskProgressMultiplier(task, hasted, lightning);
    const cost = calcTaskCost(task);
    const energy_per_tick = calcEnergyDrainPerTick(task, isSingleTickTaskImpl(progress_per_tick, cost));
    const ticks = calcTaskTicks(progress_per_tick, cost);
    return ticks * energy_per_tick;
}
function isSingleTickTaskImpl(progress, cost) {
    return progress >= cost;
}
function isSingleTickTask(task) {
    const progress = calcTaskProgressPerTick(task);
    const cost = calcTaskCost(task);
    return isSingleTickTaskImpl(progress, cost);
}
export function willCompleteAllRepsInOneTick(task) {
    if (!hasPerk(PerkType.MajorTimeCompression)) {
        return false;
    }
    return isSingleTickTask(task);
}
function progressTask(task, progress, consume_energy = true) {
    const cost = calcTaskCost(task);
    progress = Math.min(progress, cost - task.progress);
    task.progress += progress;
    const is_single_tick = isSingleTickTaskImpl(progress, cost);
    if (consume_energy) {
        modifyEnergy(-calcEnergyDrainPerTick(task, is_single_tick));
    }
    for (const skill of task.task_definition.skills) {
        addSkillXp(skill, calcSkillXp(task, progress));
    }
    const finished_rep = task.progress >= cost;
    if (finished_rep) {
        applyFinishTaskRepEffects(task);
    }
    else {
        return;
    }
    if (is_single_tick && hasPerk(PerkType.MajorTimeCompression)) {
        while (task.reps < task.task_definition.max_reps) {
            applyFinishTaskRepEffects(task);
            for (const skill of task.task_definition.skills) {
                addSkillXp(skill, calcSkillXp(task, progress));
            }
        }
    }
    const fully_finished = task.reps == task.task_definition.max_reps;
    if (fully_finished) {
        onFullyFinishTask(task);
    }
    updateEnabledTasks();
}
function updateActiveTask() {
    let active_task = GAMESTATE.active_task;
    if (!active_task) {
        GAMESTATE.active_task = pickNextTaskInAutomationQueue();
        active_task = GAMESTATE.active_task;
        if (active_task && active_task.progress == 0) {
            applyTaskRepStartEffects(active_task);
        }
    }
    if (!active_task) {
        return;
    }
    // Can't undo after the item's started having an effect
    disableItemUndo();
    const progress = calcTaskProgressPerTick(active_task);
    const old_rep_count = active_task.reps;
    progressTask(active_task, progress);
    if (old_rep_count == active_task.reps) {
        return;
    }
    const fully_finished = active_task.reps == active_task.task_definition.max_reps;
    if (!GAMESTATE.repeat_tasks || fully_finished) {
        GAMESTATE.active_task = null;
    }
    else if (!fully_finished) {
        applyTaskRepStartEffects(active_task);
    }
    saveGame();
}
// Note that free executions don't call this
export function applyTaskRepStartEffects(task) {
    if (GAMESTATE.queued_scrolls_of_haste > 0) {
        task.hasted = true;
        GAMESTATE.queued_scrolls_of_haste--;
    }
    if (GAMESTATE.queued_magic_rings > 0) {
        task.xp_boosted = true;
        GAMESTATE.queued_magic_rings--;
    }
    if (GAMESTATE.queued_lightning > 0 && task.task_definition.type == TaskType.Boss) {
        task.lightning = true;
        GAMESTATE.queued_lightning--;
    }
    if (task.task_definition.use_item != ItemType.Count) {
        consumeItem(task.task_definition.use_item, 1);
    }
    task.progress = Math.max(task.progress, 0.01); // Slight progress to ensure it counts as started
}
export function clickTask(task) {
    if (GAMESTATE.active_task == task) {
        GAMESTATE.active_task = null;
    }
    else {
        GAMESTATE.active_task = task;
        applyTaskRepStartEffects(task);
    }
}
function onFullyFinishTask(task) {
    if (task.task_definition.perk != PerkType.Count) {
        tryAddPerk(task.task_definition.perk);
    }
    if (task.task_definition.unlocks_task >= 0) {
        unlockTask(task.task_definition.unlocks_task);
    }
    if (task.task_definition.type == TaskType.Travel) {
        advanceZone();
    }
    if (task.task_definition.type == TaskType.Prestige && !GAMESTATE.prestige_layers_unlocked.includes(task.task_definition.prestige_layer)) {
        GAMESTATE.prestige_layers_unlocked.push(task.task_definition.prestige_layer);
        GAMESTATE.unlocked_new_prestige_this_prestige = true;
        const event = new RenderEvent(EventType.NewPrestigeLayer, {});
        GAMESTATE.queueRenderEvent(event);
    }
    if (task.task_definition.type == TaskType.Prestige && !GAMESTATE.prestige_available) {
        GAMESTATE.prestige_available = true;
        const event = new RenderEvent(EventType.PrestigeAvailable, {});
        GAMESTATE.queueRenderEvent(event);
    }
}
function doAllTaskRepsForFree(task) {
    const consume_energy = false;
    while (task.reps < task.task_definition.max_reps) {
        progressTask(task, calcTaskCost(task), consume_energy);
        // Deliberately doesn't call applyTaskRepStartEffects, we get to skip those
    }
}
function applyFinishTaskRepEffects(task) {
    if (task.task_definition.item != ItemType.Count) {
        addItem(task.task_definition.item, 1);
    }
    task.reps += 1;
    if (task.reps < task.task_definition.max_reps) {
        task.progress = 0;
    }
    task.hasted = false;
    task.xp_boosted = false;
    addPower(calcPowerGain(task));
    addAttunement(calcAttunementGain(task));
    const event = new RenderEvent(EventType.TaskCompleted, {});
    GAMESTATE.queueRenderEvent(event);
}
export function isTaskDisabledDueToTooStrongBoss(task) {
    if (task.progress > 0) {
        return false;
    }
    if (task.task_definition.type != TaskType.Boss) {
        return false;
    }
    const lightning = GAMESTATE.queued_lightning > 0 && task.task_definition.type == TaskType.Boss;
    return calcTaskEnergyCost(task, GAMESTATE.queued_scrolls_of_haste > 0, lightning) > (GAMESTATE.current_energy * BOSS_MAX_ENERGY_DISPARITY);
}
export function isTaskDisabledDueToMissingItem(task) {
    if (isSingleTickTask(task)) {
        return false; // If it is that cheap, we don't care about the item
    }
    if (task.progress > 0) {
        return false;
    }
    if (task.task_definition.use_item == ItemType.Count) {
        return false;
    }
    const item_count = GAMESTATE.items.get(task.task_definition.use_item) ?? 0;
    return item_count <= 0;
}
export function isTaskDisabledWithoutBeingFinished(task) {
    if (isTaskDisabledDueToTooStrongBoss(task)) {
        return true;
    }
    if (isTaskDisabledDueToMissingItem(task)) {
        return true;
    }
    return false;
}
function updateEnabledTasks() {
    let has_unfinished_mandatory_task = false;
    for (const task of GAMESTATE.tasks) {
        const finished = task.reps >= task.task_definition.max_reps;
        task.enabled = !finished && !isTaskDisabledWithoutBeingFinished(task);
        has_unfinished_mandatory_task = has_unfinished_mandatory_task
            || (task.task_definition.type == TaskType.Mandatory && !finished)
            || (task.task_definition.type == TaskType.Prestige && !finished);
    }
    if (has_unfinished_mandatory_task) {
        for (const task of GAMESTATE.tasks) {
            if (task.task_definition.type == TaskType.Travel) {
                task.enabled = false;
            }
        }
    }
}
export function resetTasks() {
    initializeTasks();
    updateEnabledTasks();
    GAMESTATE.is_at_end_of_content = false;
}
function initializeTasks() {
    GAMESTATE.active_task = null;
    GAMESTATE.tasks = [];
    const zone = ZONES[GAMESTATE.current_zone];
    if (zone) {
        for (const task of zone.tasks) {
            if (task.hidden_by_default && !GAMESTATE.unlocked_tasks.includes(task.id)) {
                continue;
            }
            GAMESTATE.tasks.push(new Task(task));
            for (const skill of task.skills) {
                if (!GAMESTATE.unlocked_skills.includes(skill)) {
                    GAMESTATE.unlocked_skills.push(skill);
                    // Don't cause notifications when literally just starting the game
                    if (GAMESTATE.current_zone != 0) {
                        const context = { skill: skill };
                        const event = new RenderEvent(EventType.UnlockedSkill, context);
                        GAMESTATE.queueRenderEvent(event);
                    }
                }
            }
        }
    }
    updateEnabledTasks();
}
export function toggleRepeatTasks() {
    GAMESTATE.repeat_tasks = !GAMESTATE.repeat_tasks;
}
function taskUnlocksTask(task) {
    return task.task_definition.unlocks_task >= 0 && !GAMESTATE.unlocked_tasks.includes(task.task_definition.unlocks_task);
}
function unlockTask(task_id) {
    if (GAMESTATE.unlocked_tasks.includes(task_id)) {
        return;
    }
    const task = TASK_LOOKUP.get(task_id);
    GAMESTATE.unlocked_tasks.push(task_id);
    if (GAMESTATE.current_zone == task.zone_id) {
        GAMESTATE.tasks.push(new Task(task));
        const context = { task_definition: task };
        const event = new RenderEvent(EventType.UnlockedTask, context);
        GAMESTATE.queueRenderEvent(event);
    }
}
function isTaskFullyCompleted(task) {
    return task.reps >= task.task_definition.max_reps;
}
function doMasteryOfTimeTaskCompletion() {
    if (!hasPrestigeUnlock(PrestigeUnlockType.MasteryOfTime)) {
        return;
    }
    if (GAMESTATE.is_in_zone_skip) {
        // Gets handled at the end of the zone skipping so we don't spam unnecessary notifications
        return;
    }
    let num_complete = 0;
    for (const task of GAMESTATE.tasks) {
        if (isTaskFullyCompleted(task)) {
            continue;
        }
        // TODO - Ignore artifacts
        if (!isSingleTickTask(task)) {
            continue;
        }
        if (task.task_definition.type == TaskType.Travel) {
            continue;
        }
        doAllTaskRepsForFree(task);
        ++num_complete;
    }
    if (num_complete > 0) {
        autoUseItems(); // Before the render event so the event's at the top
        const context = { tasks: num_complete };
        const event = new RenderEvent(EventType.SkippedTasks, context);
        GAMESTATE.queueRenderEvent(event);
    }
}
// MARK: Energy
function modifyEnergy(delta) {
    GAMESTATE.current_energy += delta;
}
function modifyMaxEnergy(delta) {
    GAMESTATE.max_energy += delta;
    setTickRate();
}
export function calcReflectionsOnTheJourneyMult(zone) {
    const zone_diff = GAMESTATE.highest_zone - zone;
    const base = getReflectionsOnTheJourneyExponent();
    return Math.pow(base, zone_diff);
}
export function calcEnergyDrainPerTick(task, is_single_tick) {
    let drain = 1;
    if (is_single_tick && hasPrestigeUnlock(PrestigeUnlockType.MasteryOfTime)) {
        return 0;
    }
    if (is_single_tick && hasPerk(PerkType.MinorTimeCompression)) {
        drain *= 0.2;
    }
    if (hasPerk(PerkType.HighAltitudeClimbing)) {
        drain *= 0.8;
    }
    if (hasPerk(PerkType.ReflectionsOnTheJourney)) {
        drain *= calcReflectionsOnTheJourneyMult(task.task_definition.zone_id);
    }
    drain *= Math.pow(ZONE_SPEEDUP_BASE, task.task_definition.zone_id);
    if (!is_single_tick && hasPerk(PerkType.MajorTimeCompression)) {
        drain *= MAJOR_TIME_COMPRESSION_EFFECT;
    }
    return drain;
}
function doAnyReset() {
    GAMESTATE.current_zone = 0;
    resetTasks();
    GAMESTATE.current_energy = GAMESTATE.max_energy;
    GAMESTATE.is_in_energy_reset = false;
    GAMESTATE.is_at_end_of_content = false;
    GAMESTATE.automation_mode = AutomationMode.Off;
    GAMESTATE.queued_scrolls_of_haste = 0;
    GAMESTATE.queued_magic_rings = 0;
    GAMESTATE.queued_lightning = 0;
    GAMESTATE.items_found_this_energy_reset = [];
    GAMESTATE.used_items.clear();
    removeTemporarySkillBonuses();
}
function calcEnergeticMemoryGain() {
    if (!hasPerk(PerkType.EnergeticMemory)) {
        return 0;
    }
    let energy_gain = (GAMESTATE.current_zone + 1) * ENERGETIC_MEMORY_MULT;
    if (energy_gain > 1 && hasPrestigeUnlock(PrestigeUnlockType.TranscendantMemory)) {
        energy_gain *= energy_gain;
    }
    const energized_level = getPrestigeRepeatableLevel(PrestigeRepeatableType.Energized);
    energy_gain *= 1 + energized_level * ENERGIZED_PERK_INCREASE;
    return energy_gain;
}
export function doEnergyReset() {
    modifyMaxEnergy(calcEnergeticMemoryGain());
    updatePrepRunHint(); // Needs to be before we reset the item use
    doAnyReset(); // Gotta be after the current_zone check in calcEnergeticMemoryGain
    GAMESTATE.energy_reset_count += 1;
    handleEnergyResetItemCounts();
    storeLoopStartNumbersForNextGameOver();
    skipFreeZones();
    saveGame();
}
export function calcItemEnergyGain(base_energy) {
    return Math.floor(base_energy * (1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.DivineAppetite) * DIVINE_APPETITE_ENERGY_ITEM_BOOST_MULT));
}
// MARK: Items
export function addItem(item, count) {
    const oldValue = GAMESTATE.items.get(item) ?? 0;
    GAMESTATE.items.set(item, oldValue + count);
    if (!GAMESTATE.items_found_this_energy_reset.includes(item)) {
        GAMESTATE.items_found_this_energy_reset.push(item);
    }
    const event = new RenderEvent(EventType.GainedItem, {});
    GAMESTATE.queueRenderEvent(event);
}
function consumeItem(item, amount) {
    const old_value = GAMESTATE.items.get(item) ?? 0;
    GAMESTATE.items.set(item, old_value - amount);
}
function useItem(item, amount) {
    consumeItem(item, amount);
    const old_use_value = GAMESTATE.used_items.get(item) ?? 0;
    const definition = ITEMS[item];
    definition.applyEffects(amount);
    GAMESTATE.used_items.set(item, old_use_value + amount);
    const context = { item: item, count: Math.abs(amount) };
    const event = new RenderEvent(amount > 0 ? EventType.UsedItem : EventType.UndidItem, context);
    GAMESTATE.queueRenderEvent(event);
    // Can't undo after the item's started having an effect
    if (GAMESTATE.active_task == null && amount > 0) {
        GAMESTATE.undo_item = [item, amount];
    }
    updateEnabledTasks();
}
export function clickItem(item, use_all) {
    const old_value = GAMESTATE.items.get(item) ?? 0;
    if (old_value <= 0) {
        console.error("Not held item?");
        return;
    }
    const num_used = use_all ? old_value : 1;
    useItem(item, num_used);
}
function handleEnergyResetItemCounts() {
    for (const [key, value] of GAMESTATE.items) {
        const new_value = hasPerk(PerkType.UnderstandingTheReset) ? Math.ceil(value / 2) : 0;
        GAMESTATE.items.set(key, new_value);
    }
    if (hasPrestigeUnlock(PrestigeUnlockType.CompulsiveNotetaking)) {
        for (const item of NOTE_ITEMS) {
            const new_value = Math.max(GAMESTATE.items.get(item) ?? 0, COMPULSIVE_NOTE_TAKING_AMOUNT);
            GAMESTATE.items.set(item, new_value);
        }
    }
}
function autoUseItems() {
    if (!GAMESTATE.auto_use_items) {
        return;
    }
    for (const [key, value] of GAMESTATE.items) {
        if (ARTIFACTS.includes(key)) {
            continue;
        }
        if (value > 0) {
            clickItem(key, true);
            disableItemUndo(); // It'd just cause weird flashing
        }
    }
}
function disableItemUndo() {
    GAMESTATE.undo_item = [ItemType.Count, 0];
}
export function undoItemUse() {
    const [item_type, amount] = GAMESTATE.undo_item;
    if (item_type == ItemType.Count) {
        console.error("Trying to undo non-existing item");
        return;
    }
    disableItemUndo();
    useItem(item_type, -amount);
}
export function gatherItemBonuses(skill) {
    const ret = [];
    for (const [item_type, amount] of GAMESTATE.used_items) {
        const item = ITEMS[item_type];
        if (!item.skill_modifiers.affectsSkill(skill)) {
            continue;
        }
        ret.push([item_type, amount]);
    }
    return ret;
}
function updatePrepRunHint() {
    if (!hasPerk(PerkType.UnderstandingTheReset)) {
        return;
    }
    if (GAMESTATE.used_items.size == 0) {
        GAMESTATE.hint_prep_runs_done++;
    }
    else {
        GAMESTATE.hint_non_prep_runs_done++;
    }
}
export function setHasGottenPrepRunHint() {
    GAMESTATE.hint_has_gotten_prep_run_hint = true;
}
export function setHasGottenBossHint() {
    GAMESTATE.hint_has_gotten_boss_hint = true;
}
export function knowsItem(item) {
    return GAMESTATE.items.get(item) != null;
}
// MARK: Perks
export function tryAddPerk(perk, show_notification = true) {
    if (hasPerk(perk)) {
        return;
    }
    if (perk == PerkType.EnergySpell) {
        modifyMaxEnergy(50);
    }
    GAMESTATE.perks.set(perk, true);
    if (show_notification) {
        const context = { perk: perk };
        const event = new RenderEvent(EventType.GainedPerk, context);
        GAMESTATE.queueRenderEvent(event);
    }
}
export function hasPerk(perk) {
    return GAMESTATE.perks.get(perk) == true;
}
export function knowsPerk(perk) {
    return GAMESTATE.perks.get(perk) != null;
}
function skipCurrentZoneIfFree() {
    if (!GAMESTATE.tasks.every(task => {
        // Unlocking stuff the player needs to deal with themselves
        return !taskUnlocksTask(task) && isSingleTickTask(task);
    })) {
        return false;
    }
    // In reverse so travel happens last
    for (const task of GAMESTATE.tasks.slice().reverse()) {
        doAllTaskRepsForFree(task);
    }
    return true;
}
function skipFreeZones() {
    if (!hasPerk(PerkType.MinorTimeCompression)) {
        return;
    }
    GAMESTATE.is_in_zone_skip = true;
    while (skipCurrentZoneIfFree()) { /* Effect is in conditional */ }
    if (GAMESTATE.current_zone > 0) {
        autoUseItems(); // Do this first so our zone skip notification is at the top
        const event = new RenderEvent(EventType.SkippedZones, {});
        GAMESTATE.queueRenderEvent(event);
    }
    GAMESTATE.is_in_zone_skip = false;
    doMasteryOfTimeTaskCompletion();
}
export function gatherPerkBonuses(skill) {
    const ret = [];
    for (const [perk_type, active] of GAMESTATE.perks) {
        const perk = PERKS[perk_type];
        if (!active || !perk.skill_modifiers.affectsSkill(skill)) {
            continue;
        }
        ret.push(perk_type);
    }
    return ret;
}
// MARK: Extra stats
function addPower(amount) {
    if (amount <= 0) {
        return;
    }
    if (!GAMESTATE.has_unlocked_power) {
        const event = new RenderEvent(EventType.UnlockedPower, new EventContext());
        GAMESTATE.queueRenderEvent(event);
        GAMESTATE.has_unlocked_power = true;
    }
    GAMESTATE.power += amount;
}
export function calcPowerGain(task) {
    if (task.task_definition.type != TaskType.Boss) {
        return 0;
    }
    const mult = Math.max(task.task_definition.zone_id - 1, 1); // First boss is zone 3, which is internally 2
    let powerAmount = 5 * mult;
    powerAmount *= Math.pow(2, getPrestigeRepeatableLevel(PrestigeRepeatableType.UnlimitedPower));
    return powerAmount;
}
export function calcPowerSpeedBonusAtLevel(level) {
    return 1 + level / 100;
}
export function calcAttunementSpeedBonusAtLevel(level) {
    return 1 + level / 1000;
}
export function calcSpiteTheGodsBonus() {
    return 1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.SpiteTheGods) * SPITE_THE_GODS_MULT;
}
function addAttunement(amount) {
    GAMESTATE.attunement += amount;
}
export function calcAttunementGain(task) {
    if (!hasPerk(PerkType.Attunement)) {
        return 0;
    }
    const attunement_skills = calcAttunementSkills();
    if (!attunement_skills.some(skill => task.task_definition.skills.includes(skill))) {
        return 0;
    }
    let value = task.task_definition.zone_id + 1;
    if (hasPrestigeUnlock(PrestigeUnlockType.DivineInspiration)) {
        value *= 2;
    }
    if (hasPrestigeUnlock(PrestigeUnlockType.FullyAttuned)) {
        value *= 1 + getPrestigeRepeatableLevel(PrestigeRepeatableType.DivineKnowledge) * DIVINE_KNOWLEDGE_MULT;
    }
    if (hasPerk(PerkType.CommunedWithDamnedSouls)) {
        value *= 2;
    }
    value *= Math.pow(DIVINE_ATTUNEMENT_BASE, getPrestigeRepeatableLevel(PrestigeRepeatableType.DivineAttunement));
    return value;
}
export function calcAttunementSkills() {
    const attunement_skills = [SkillType.Magic, SkillType.Study];
    if (hasPrestigeUnlock(PrestigeUnlockType.FullyAttuned)) {
        attunement_skills.push(SkillType.Search);
    }
    if (hasPrestigeUnlock(PrestigeUnlockType.CraftingBreakthrough)) {
        attunement_skills.push(SkillType.Crafting);
    }
    return attunement_skills;
}
export function getPowerSkills() {
    return [SkillType.Combat, SkillType.Fortitude];
}
export function getSpiteTheGodsSkills() {
    return [SkillType.Ascension, SkillType.Charisma];
}
// MARK: Automation
export var AutomationMode;
(function (AutomationMode) {
    AutomationMode[AutomationMode["All"] = 0] = "All";
    AutomationMode[AutomationMode["Zone"] = 1] = "Zone";
    AutomationMode[AutomationMode["Off"] = 2] = "Off";
})(AutomationMode || (AutomationMode = {}));
function hasAutomatedTask(task) {
    if (!GAMESTATE.automation_prios.has(task.zone_id)) {
        return false;
    }
    const prios = GAMESTATE.automation_prios.get(task.zone_id);
    return prios.includes(task.id);
}
export function toggleAutomation(task) {
    if (!hasPerk(PerkType.Amulet) && !hasAutomatedTask(task)) {
        return;
    }
    if (!GAMESTATE.automation_prios.has(task.zone_id)) {
        GAMESTATE.automation_prios.set(task.zone_id, []);
    }
    const prios = GAMESTATE.automation_prios.get(task.zone_id);
    if (prios.includes(task.id)) {
        prios.splice(prios.indexOf(task.id), 1);
    }
    else {
        prios.push(task.id);
        // Ensure travel always happens last
        prios.sort((a, b) => {
            const task_a = TASK_LOOKUP.get(a);
            const task_b = TASK_LOOKUP.get(b);
            if (task_a.type == TaskType.Travel || task_b.type == TaskType.Travel) {
                return task_a.type == TaskType.Travel ? 1 : -1;
            }
            return 0;
        });
    }
}
function pickNextTaskInAutomationQueue() {
    if (GAMESTATE.automation_mode == AutomationMode.Off) {
        return null;
    }
    const prios = GAMESTATE.automation_prios.get(GAMESTATE.current_zone);
    if (!prios) {
        return null;
    }
    for (const task_id of prios) {
        for (const task of GAMESTATE.tasks) {
            if (task.task_definition.id != task_id) {
                continue;
            }
            if (isTaskDisabledWithoutBeingFinished(task)) {
                return null; // Better to stop automating than having it fuck up by skipping a Task
            }
            if (!task.enabled) {
                break;
            }
            return task;
        }
    }
    return null;
}
export function setAutomationMode(mode) {
    // If the player turns off automation they probably want to stop the ongoing task
    if (GAMESTATE.automation_mode != AutomationMode.Off && mode == AutomationMode.Off) {
        GAMESTATE.active_task = null;
    }
    GAMESTATE.automation_mode = mode;
}
export function setAutomationEndZone(zone) {
    GAMESTATE.automation_end = zone;
    if (GAMESTATE.automation_mode == AutomationMode.All && GAMESTATE.current_zone >= zone) {
        setAutomationMode(AutomationMode.Off);
    }
}
// MARK: Energy Reset
export class EnergyResetInfo {
    skill_gains = [];
    power_at_start = 0;
    power_at_end = 0;
    attunement_at_start = 0;
    attunement_at_end = 0;
    energetic_memory_gain = 0;
}
function checkEnergyReset() {
    if (GAMESTATE.current_energy > 0) {
        return;
    }
    GAMESTATE.is_in_energy_reset = true;
    GAMESTATE.current_energy = 0;
    populateEnergyResetInfo();
}
function populateEnergyResetInfo() {
    const info = new EnergyResetInfo();
    for (const skill of SKILLS) {
        const current_level = getSkill(skill).level;
        const starting_level = GAMESTATE.skills_at_start_of_reset[skill];
        const skill_diff = current_level - starting_level;
        if (skill_diff > 0) {
            info.skill_gains.push([skill, skill_diff]);
        }
    }
    // Biggest gain first
    info.skill_gains.sort((a, b) => b[1] - a[1]);
    info.power_at_end = GAMESTATE.power;
    info.power_at_start = GAMESTATE.power_at_start_of_reset;
    info.attunement_at_end = GAMESTATE.attunement;
    info.attunement_at_start = GAMESTATE.attunement_at_start_of_reset;
    info.energetic_memory_gain = calcEnergeticMemoryGain();
    GAMESTATE.energy_reset_info = info;
}
// MARK: Prestige
export function hasUnlockedPrestige() {
    return GAMESTATE.prestige_available || GAMESTATE.prestige_count > 0;
}
export const PRESTIGE_GAIN_EXPONENT = 2.0;
export const BASE_PRESTIGE_GAIN = 100;
export function getPrestigeGainExponent() {
    return PRESTIGE_GAIN_EXPONENT + DIVINE_LIGHTNING_EXPONENT_INCREASE * getPrestigeRepeatableLevel(PrestigeRepeatableType.DivineLightning);
}
export function calcDivineSparkGainFromHighestZone(zone) {
    const prestige_zone = 15 - 1; // Due to 0-indexing
    const effective_zone = Math.max(0, zone - prestige_zone);
    let gain_mult = Math.pow(getPrestigeGainExponent(), effective_zone);
    if (hasPerk(PerkType.Awakening)) {
        gain_mult *= 1 + AWAKENING_DIVINE_SPARK_MULT;
    }
    if (hasPerk(PerkType.DefiedTheGods)) {
        gain_mult *= 1 + DEFIED_THE_GODS_SPARK_MULT;
    }
    return Math.ceil(gain_mult * BASE_PRESTIGE_GAIN);
}
export function calcDivineSparkGain() {
    return calcDivineSparkGainFromHighestZone(GAMESTATE.highest_zone);
}
export function hasPrestigeUnlock(unlock) {
    return GAMESTATE.prestige_unlocks.includes(unlock);
}
export function getPrestigeRepeatableLevel(repeatable) {
    return GAMESTATE.prestige_repeatables.get(repeatable) ?? 0;
}
function applyPrestigeUnlockEffects(unlock, show_notification) {
    if (unlock == PrestigeUnlockType.PermanentAutomation) {
        tryAddPerk(PerkType.Amulet, show_notification);
    }
    else if (unlock == PrestigeUnlockType.LookInTheMirror) {
        tryAddPerk(PerkType.ReflectionsOnTheJourney, show_notification);
    }
    else if (unlock == PrestigeUnlockType.FullyAttuned) {
        tryAddPerk(PerkType.Attunement, show_notification);
    }
    else if (unlock == PrestigeUnlockType.TranscendantMemory) {
        tryAddPerk(PerkType.EnergeticMemory, show_notification);
    }
    else if (unlock == PrestigeUnlockType.MasteryOfTime) {
        tryAddPerk(PerkType.MinorTimeCompression, show_notification);
        tryAddPerk(PerkType.MajorTimeCompression, show_notification);
        doMasteryOfTimeTaskCompletion();
    }
    else if (unlock == PrestigeUnlockType.SeeBeyondTheVeil) {
        unlockTask(17); // Secret Fishing Spot
        unlockTask(28); // Training Dummy
        unlockTask(88); // Train at every Guild
        unlockTask(158); // Divine Notes
        unlockTask(209); // Gaze Beyond the Veil
    }
}
export function addPrestigeUnlock(unlock) {
    if (hasPrestigeUnlock(unlock)) {
        console.error("Already has prestige unlock");
        return;
    }
    const definition = PRESTIGE_UNLOCKABLES[unlock];
    if (GAMESTATE.divine_spark < definition.cost) {
        console.error("Not enough prestige currency");
        return;
    }
    GAMESTATE.divine_spark -= definition.cost;
    GAMESTATE.prestige_unlocks.push(unlock);
    const show_notification = true;
    applyPrestigeUnlockEffects(unlock, show_notification);
}
export function calcPrestigeRepeatableCost(repeatable) {
    const definition = PRESTIGE_REPEATABLES[repeatable];
    const current_level = getPrestigeRepeatableLevel(repeatable);
    const base_cost = definition.initial_cost;
    return Math.ceil(base_cost * Math.pow(definition.scaling_exponent, current_level));
}
export function increasePrestigeRepeatableLevel(repeatable) {
    const cost = calcPrestigeRepeatableCost(repeatable);
    if (GAMESTATE.divine_spark < cost) {
        console.error("Not enough prestige currency");
        return;
    }
    const current_level = getPrestigeRepeatableLevel(repeatable);
    GAMESTATE.prestige_repeatables.set(repeatable, current_level + 1);
    GAMESTATE.divine_spark -= cost;
    if (repeatable == PrestigeRepeatableType.TranscendantAptitude) {
        const global_target_level = (current_level + 1) * TRANSCENDANT_APTITUDE_MULT;
        for (const skill of GAMESTATE.skills) {
            const target_level = skill.type == SkillType.Ascension ? global_target_level / 2 : global_target_level;
            skill.level = Math.max(target_level, skill.level);
        }
    }
    else if (repeatable == PrestigeRepeatableType.Energized) {
        modifyEnergy(ENERGIZED_INCREASE);
        modifyMaxEnergy(ENERGIZED_INCREASE);
    }
}
function applyGameStartPrestigeEffects() {
    const show_notification = false;
    // We set this so Mastery of Time doesn't trigger and cause notifications
    GAMESTATE.is_in_zone_skip = true;
    for (const unlock of GAMESTATE.prestige_unlocks) {
        applyPrestigeUnlockEffects(unlock, show_notification);
    }
    const energy_boost = ENERGIZED_INCREASE * getPrestigeRepeatableLevel(PrestigeRepeatableType.Energized);
    modifyEnergy(energy_boost);
    modifyMaxEnergy(energy_boost);
    skipFreeZones();
    GAMESTATE.is_in_zone_skip = false;
    doMasteryOfTimeTaskCompletion();
}
export function doPrestige() {
    doAnyReset();
    GAMESTATE.prestige_count++;
    GAMESTATE.highest_prestige_zone = Math.max(GAMESTATE.highest_zone, GAMESTATE.highest_prestige_zone);
    GAMESTATE.divine_spark += calcDivineSparkGain();
    // Reset most game state
    GAMESTATE.unlocked_tasks = [];
    GAMESTATE.highest_zone = 0;
    GAMESTATE.highest_zone_fully_completed = -1;
    initializeSkills();
    // We set these to false/zero rather than clearing it, so the player can still see everything they've unlocked in the past
    for (const perk of GAMESTATE.perks.keys()) {
        GAMESTATE.perks.set(perk, false);
    }
    for (const item of GAMESTATE.items.keys()) {
        GAMESTATE.items.set(item, 0);
    }
    // Ensure we apply Compulsive Notetaking
    handleEnergyResetItemCounts();
    GAMESTATE.energy_reset_info = new EnergyResetInfo();
    GAMESTATE.energy_reset_count = 0;
    GAMESTATE.max_energy = STARTING_ENERGY;
    GAMESTATE.current_energy = STARTING_ENERGY;
    GAMESTATE.power = 0;
    GAMESTATE.attunement = 0;
    GAMESTATE.prestige_available = false;
    GAMESTATE.auto_use_items = false;
    GAMESTATE.unlocked_new_prestige_this_prestige = false;
    if (!hasPrestigeUnlock(PrestigeUnlockType.SeeBeyondTheVeil)) {
        for (const [, task] of TASK_LOOKUP) {
            if (task.type == TaskType.Boss && hasAutomatedTask(task)) {
                toggleAutomation(task);
            }
        }
    }
    // Things not reset:
    // has_unlocked_power - No reason to hide that from the UI
    // unlocked_skills - No reason to hide that either
    // Any prestige variable, duh. Except prestige_available
    resetTasks();
    applyGameStartPrestigeEffects();
    storeLoopStartNumbersForNextGameOver();
    setTickRate();
    saveGame();
}
export function calcPerkySpeedMultiplier() {
    let unlocked_perks = 0;
    for (const [, active] of GAMESTATE.perks) {
        if (active) {
            ++unlocked_perks;
        }
    }
    return Math.pow(PERKY_BASE, unlocked_perks);
}
// MARK: Persistence
export const SAVE_LOCATION = "incrementalGameSave";
export function saveGame() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const saveData = {};
    GAMESTATE.save_version = SAVE_VERSION;
    for (const key in GAMESTATE) {
        if (key == "active_task") {
            continue; // This would feel weird for the player if was persisted
        }
        if (key == "automation_mode") {
            continue;
        }
        if (Object.prototype.hasOwnProperty.call(GAMESTATE, key)) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const value = GAMESTATE[key];
            // Check if the value is a Map and convert it to an array
            if (value instanceof Map) {
                saveData[key] = Array.from(value.entries());
            }
            else {
                saveData[key] = value;
            }
        }
    }
    // Save to localStorage
    const json = JSON.stringify(saveData, (key, value) => {
        if (typeof value === 'object' && value !== null && 'id' in value) {
            return value.id; // Replace object with its ID
        }
        return value;
    });
    localStorage.setItem(SAVE_LOCATION, json);
}
function parseSave(save) {
    const data = JSON.parse(save, function (key, value) {
        if (key == "task_definition") {
            return TASK_LOOKUP.get(value); // Replace ID with the actual object
        }
        return value;
    });
    return data;
}
function loadGame() {
    const saved_game = localStorage.getItem(SAVE_LOCATION);
    if (!saved_game) {
        return false;
    }
    try {
        const data = parseSave(saved_game);
        loadGameFromData(data);
    }
    catch (e) {
        console.log(e);
        return false;
    }
    return true;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadGameFromData(data) {
    Object.keys(data).forEach(key => {
        const value = data[key];
        // Convert it back to a Map if that's what we want
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        GAMESTATE[key] = GAMESTATE[key] instanceof Map ? new Map(value) : value;
    });
    // Get rid of any skills that no longer exist
    GAMESTATE.unlocked_skills = GAMESTATE.unlocked_skills.filter((skill) => SKILLS.includes(skill));
    for (const task of GAMESTATE.tasks) {
        task.reps = Math.min(task.reps, task.task_definition.max_reps);
    }
    // At least not as inaccurate as shwoing these as 1/0
    GAMESTATE.highest_zone_ever = Math.max(GAMESTATE.highest_zone, GAMESTATE.highest_zone_ever);
    GAMESTATE.highest_zone_fully_completed_ever = Math.max(GAMESTATE.highest_zone_fully_completed, GAMESTATE.highest_zone_fully_completed_ever);
    // We didn't use to track this, so let's get as close as we can
    if (GAMESTATE.highest_prestige_zone == 0 && GAMESTATE.prestige_count > 0) {
        GAMESTATE.highest_prestige_zone = GAMESTATE.highest_zone_ever;
    }
}
// MARK: Gamestate
export class Gamestate {
    save_version = "";
    tasks = [];
    active_task = null;
    unlocked_tasks = [];
    current_zone = 0;
    highest_zone = 0;
    highest_zone_fully_completed = -1;
    highest_zone_ever = 0;
    highest_zone_fully_completed_ever = -1;
    repeat_tasks = true;
    automation_mode = AutomationMode.Off;
    automation_prios = new Map();
    automation_end = 99;
    auto_use_items = false;
    undo_item = [ItemType.Count, 0];
    manual_tooltips = false;
    skills_at_start_of_reset = [];
    power_at_start_of_reset = 0;
    attunement_at_start_of_reset = 0;
    skills = [];
    unlocked_skills = [];
    perks = new Map();
    items = new Map();
    items_found_this_energy_reset = [];
    used_items = new Map();
    queued_scrolls_of_haste = 0;
    queued_magic_rings = 0;
    queued_lightning = 0;
    is_in_energy_reset = false;
    is_at_end_of_content = false;
    energy_reset_info = new EnergyResetInfo();
    is_in_zone_skip = false;
    current_energy = STARTING_ENERGY;
    max_energy = STARTING_ENERGY;
    energy_reset_count = 0;
    power = 0;
    has_unlocked_power = false;
    attunement = 0;
    prestige_available = false;
    prestige_count = 0;
    highest_prestige_zone = 0;
    unlocked_new_prestige_this_prestige = false;
    divine_spark = 0;
    prestige_unlocks = [];
    prestige_repeatables = new Map();
    prestige_layers_unlocked = [];
    pending_render_events = [];
    hint_prep_runs_done = 0;
    hint_non_prep_runs_done = 0; // Since unlocking prep runs
    hint_has_gotten_prep_run_hint = false;
    hint_has_gotten_boss_hint = false;
    start() {
        if (!loadGame()) {
            this.initialize();
        }
    }
    initialize() {
        resetTasks();
        initializeSkills();
        GAMESTATE.save_version = SAVE_VERSION;
    }
    popRenderEvents() {
        const events = this.pending_render_events;
        this.pending_render_events = [];
        return events;
    }
    queueRenderEvent(event) {
        this.pending_render_events.push(event);
    }
}
function advanceZone() {
    const new_zone = GAMESTATE.current_zone + 1;
    if (GAMESTATE.current_zone > GAMESTATE.highest_zone_fully_completed
        && GAMESTATE.tasks.every((task) => { return isTaskFullyCompleted(task); })) {
        GAMESTATE.highest_zone_fully_completed = GAMESTATE.current_zone;
        GAMESTATE.highest_zone_fully_completed_ever = Math.max(GAMESTATE.highest_zone_fully_completed, GAMESTATE.highest_zone_fully_completed_ever);
        const context = { zone: GAMESTATE.current_zone };
        const event = new RenderEvent(EventType.NewHighestZoneFullyCompleted, context);
        GAMESTATE.queueRenderEvent(event);
    }
    if (GAMESTATE.current_zone >= GAMESTATE.highest_zone) {
        GAMESTATE.highest_zone = new_zone;
        GAMESTATE.highest_zone_ever = Math.max(GAMESTATE.highest_zone, GAMESTATE.highest_zone_ever);
        const context = { zone: GAMESTATE.current_zone + 1 };
        const event = new RenderEvent(EventType.NewHighestZone, context);
        GAMESTATE.queueRenderEvent(event);
    }
    if (GAMESTATE.automation_mode == AutomationMode.Zone) {
        GAMESTATE.automation_mode = AutomationMode.Off;
    }
    else if (GAMESTATE.automation_mode == AutomationMode.All && (new_zone + 1) >= GAMESTATE.automation_end) {
        GAMESTATE.automation_mode = AutomationMode.Off;
    }
    // Happens after the highest zone stuff, since we do want the user to get those effects at the end of content
    if (new_zone >= ZONES.length) {
        GAMESTATE.is_at_end_of_content = true;
        return;
    }
    GAMESTATE.current_zone = new_zone;
    resetTasks();
    doMasteryOfTimeTaskCompletion();
}
export function calcTickRate() {
    let tick_rate = DEFAULT_TICK_RATE;
    if (hasPrestigeUnlock(PrestigeUnlockType.DivineSpeed)) {
        const overflow = GAMESTATE.max_energy - STARTING_ENERGY;
        tick_rate /= 1 + overflow / DIVINE_SPEED_TICKS_PER_PERCENT / 100;
    }
    return tick_rate;
}
export function updateGamestate() {
    if (GAMESTATE.is_in_energy_reset) {
        return;
    }
    updateActiveTask();
    autoUseItems();
    checkEnergyReset();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.setProgressMult = (new_mult) => task_progress_mult = new_mult;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.saveGame = () => saveGame();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.doEnergyReset = () => doEnergyReset();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.advanceZone = () => advanceZone();
//# sourceMappingURL=simulation.js.map
import { handleHotkeyPressed, handleHotkeyReleased, Rendering, updateRendering } from "./rendering.js";
import { Gamestate, Skill, saveGame, updateGamestate, resetTasks, calcTickRate, clickTask, clickItem, doPrestige, doEnergyReset, tryAddPerk, calcTaskCost, calcTaskProgressPerTick, calcEnergyDrainPerTick, calcSkillXp, addSkillXp, calcSkillXpNeededAtLevel } from "./simulation.js";
import { Task, ZONES, TASK_LOOKUP } from "./zones.js";
import { ITEMS, ARTIFACTS } from "./items.js";
import { SKILL_DEFINITIONS } from "./skills.js";
import { PERKS } from "./perks.js";
import { PRESTIGE_UNLOCKABLES, PRESTIGE_REPEATABLES } from "./prestige_upgrades.js";
import { ItemSkillModifierList, PerkSkillModifierList } from "./modifiers.js";
import { patchRenderingConstants, readRenderingConstants } from "./rendering_constants.js";
function gameLoop() {
    updateGamestate();
    updateRendering();
}
export function setTickRate() {
    if (GAME_LOOP_INTERVAL > 0) {
        clearInterval(GAME_LOOP_INTERVAL);
    }
    GAME_LOOP_INTERVAL = setInterval(gameLoop, calcTickRate());
}
export let GAMESTATE = new Gamestate();
export let RENDERING = new Rendering();
let GAME_LOOP_INTERVAL = 0;
function initGame() {
    GAMESTATE.start();
    RENDERING.initialize();
    RENDERING.start();
    setTickRate();
}
// Support both static module loading (DOMContentLoaded hasn't fired yet)
// and dynamic import() where DOM is already ready
if (document.readyState === 'loading') {
    document.addEventListener("DOMContentLoaded", initGame);
}
else {
    initGame();
}
document.addEventListener("keyup", handleHotkeyReleased);
document.addEventListener("keydown", handleHotkeyPressed);
export function resetSave() {
    GAMESTATE = new Gamestate();
    GAMESTATE.initialize();
    saveGame();
    location.reload();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.getGamestate = GAMESTATE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.resetSave = resetSave;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.resetZone = () => {
    resetTasks();
    RENDERING = new Rendering();
    RENDERING.initialize();
    RENDERING.start();
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.ZONES = ZONES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.TASK_LOOKUP = TASK_LOOKUP;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.resetTasks = resetTasks;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.updateGamestate = updateGamestate;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.doHeadlessReset = () => {
    // Clean energy reset for headless verification: resets zone, tasks,
    // and energy without side effects (no maxEnergy change, no saves,
    // no rendering). Skills and perks persist across resets.
    GAMESTATE.current_zone = 0;
    GAMESTATE.active_task = null;
    resetTasks();
    GAMESTATE.current_energy = GAMESTATE.max_energy;
    GAMESTATE.is_in_energy_reset = false;
    GAMESTATE.is_at_end_of_content = false;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.clickTask = clickTask;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.clickItem = clickItem;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.doPrestige = doPrestige;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.doEnergyReset = doEnergyReset;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.saveGame = saveGame;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.ITEMS = ITEMS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.ARTIFACTS = ARTIFACTS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.SKILL_DEFINITIONS = SKILL_DEFINITIONS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.PERKS = PERKS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.PRESTIGE_UNLOCKABLES = PRESTIGE_UNLOCKABLES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.PRESTIGE_REPEATABLES = PRESTIGE_REPEATABLES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.ItemSkillModifierList = ItemSkillModifierList;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.PerkSkillModifierList = PerkSkillModifierList;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.tryAddPerk = tryAddPerk;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.patchRenderingConstants = patchRenderingConstants;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.readRenderingConstants = readRenderingConstants;

// Expose game calculation functions for the cost debugger's simulator.
// These use the real game formulas with the live GAMESTATE.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
window.gameCalc = {
    /**
     * Simulate one tick of a task using the real game engine formulas.
     * Sets up GAMESTATE properties from the provided state, runs the
     * calculation, and returns the results without mutating GAMESTATE.
     *
     * @param {number} taskId - Task definition ID
     * @param {object} state - { skillLevels: {id: level}, perks: [id, ...], highestZone, currentZone }
     * @param {number} currentProgress - Current progress within the rep
     * @returns {{ progressPerTick, addedProgress, energyDrain, xpPerSkill, isSingleTick, repCompleted, cost }}
     */
    calcTick(taskId, state, currentProgress) {
        // Find the task in the current zone's tasks (or create a temp one)
        const taskDef = TASK_LOOKUP.get(taskId);
        if (!taskDef) return null;

        // Save GAMESTATE and set up our state
        const savedSkills = GAMESTATE.skills;
        const savedPerks = GAMESTATE.perks;
        const savedHighestZone = GAMESTATE.highest_zone;
        const savedHighestZoneFC = GAMESTATE.highest_zone_fully_completed;
        const savedPower = GAMESTATE.power;
        const savedAttunement = GAMESTATE.attunement;
        const savedPrestigeUnlocks = GAMESTATE.prestige_unlocks;
        const savedPrestigeRepeatables = GAMESTATE.prestige_repeatables;

        // Set up skills from state
        const tempSkills = [];
        for (let i = 0; i < SKILL_DEFINITIONS.length; i++) {
            const s = new Skill(i, state.skillLevels?.[i] || 0);
            s.progress = state.skillXp?.[i] || 0;
            tempSkills.push(s);
        }
        GAMESTATE.skills = tempSkills;
        GAMESTATE.perks = new Map((state.perks || []).map(p => [p, true]));
        GAMESTATE.highest_zone = state.highestZone || 0;
        GAMESTATE.highest_zone_fully_completed = state.highestZoneFullyCompleted ?? -1;
        GAMESTATE.power = state.power || 0;
        GAMESTATE.attunement = state.attunement || 0;
        GAMESTATE.prestige_unlocks = Array.isArray(state.prestigeUnlocks) ? state.prestigeUnlocks : [];
        GAMESTATE.prestige_repeatables = state.prestigeRepeatables instanceof Map ? state.prestigeRepeatables : new Map();

        // Create a temporary Task object
        const tempTask = new Task(taskDef);
        tempTask.progress = currentProgress;

        try {
            const cost = calcTaskCost(tempTask);
            const progressPerTick = calcTaskProgressPerTick(tempTask);
            const addedProgress = Math.min(progressPerTick, cost - tempTask.progress);
            tempTask.progress += addedProgress;
            const isSingleTick = progressPerTick >= cost;
            const energyDrain = calcEnergyDrainPerTick(tempTask, isSingleTick);

            // Calculate XP per skill
            const xpPerSkill = {};
            for (const skillType of taskDef.skills) {
                xpPerSkill[skillType] = calcSkillXp(tempTask, addedProgress);
            }

            // Apply XP to temp skills to get updated levels
            for (const skillType of taskDef.skills) {
                addSkillXp(skillType, xpPerSkill[skillType]);
            }
            const updatedLevels = {};
            const updatedXp = {};
            for (let i = 0; i < tempSkills.length; i++) {
                if (tempSkills[i].level > 0 || (state.skillLevels?.[i] || 0) > 0) {
                    updatedLevels[i] = tempSkills[i].level;
                    updatedXp[i] = tempSkills[i].progress;
                }
            }

            const repCompleted = tempTask.progress >= cost;

            return {
                cost,
                progressPerTick,
                addedProgress,
                energyDrain,
                isSingleTick,
                repCompleted,
                xpPerSkill,
                updatedLevels,
                updatedXp,
            };
        } finally {
            // Restore GAMESTATE
            GAMESTATE.skills = savedSkills;
            GAMESTATE.perks = savedPerks;
            GAMESTATE.highest_zone = savedHighestZone;
            GAMESTATE.highest_zone_fully_completed = savedHighestZoneFC;
            GAMESTATE.power = savedPower;
            GAMESTATE.attunement = savedAttunement;
            GAMESTATE.prestige_unlocks = savedPrestigeUnlocks;
            GAMESTATE.prestige_repeatables = savedPrestigeRepeatables;
        }
    },

    /** Get the XP needed for a specific skill level */
    calcSkillXpNeeded(level, skillType) {
        return calcSkillXpNeededAtLevel(level, skillType);
    },

    /**
     * Execute an entire task (all reps) with an energy budget using the real
     * game engine. Sets up GAMESTATE once, runs the full tick loop, returns
     * the result. Much faster than calling calcTick per-tick.
     *
     * @param {number} taskId
     * @param {object} state - { skillLevels, skillXp, perks, highestZone, ... }
     * @param {number} energyBudget
     * @returns {{ energyUsed, completed, updatedLevels, updatedXp }}
     */
    executeTask(taskId, state, energyBudget) {
        const taskDef = TASK_LOOKUP.get(taskId);
        if (!taskDef) return null;

        // Save skill state in-place (avoid creating new Skill objects)
        const savedLevels = new Array(GAMESTATE.skills.length);
        const savedXp = new Array(GAMESTATE.skills.length);
        for (let i = 0; i < GAMESTATE.skills.length; i++) {
            savedLevels[i] = GAMESTATE.skills[i].level;
            savedXp[i] = GAMESTATE.skills[i].progress;
            GAMESTATE.skills[i].level = state.skillLevels?.[i] || 0;
            GAMESTATE.skills[i].progress = state.skillXp?.[i] || 0;
        }

        // Save and set scalar state
        const savedEnergy = GAMESTATE.current_energy;
        const savedMaxEnergy = GAMESTATE.max_energy;
        const savedReset = GAMESTATE.is_in_energy_reset;
        const savedActiveTask = GAMESTATE.active_task;
        const savedZone = GAMESTATE.current_zone;
        const savedTasks = GAMESTATE.tasks;
        const savedHighestZone = GAMESTATE.highest_zone;
        const savedHighestZoneFC = GAMESTATE.highest_zone_fully_completed;

        // Save and set perks (modify existing Map in-place)
        const savedPerks = new Map(GAMESTATE.perks);
        GAMESTATE.perks.clear();
        for (const p of (state.perks || [])) GAMESTATE.perks.set(p, true);

        GAMESTATE.highest_zone = state.highestZone || 0;
        GAMESTATE.highest_zone_fully_completed = state.highestZoneFullyCompleted ?? -1;
        GAMESTATE.current_energy = energyBudget;
        GAMESTATE.max_energy = energyBudget;
        GAMESTATE.is_in_energy_reset = false;
        GAMESTATE.current_zone = taskDef.zone_id;

        // Create task and run
        const task = new Task(taskDef);
        GAMESTATE.tasks = [task];
        GAMESTATE.active_task = task;

        let ticks = 0;
        while (ticks < 100000 && GAMESTATE.active_task === task && !GAMESTATE.is_in_energy_reset) {
            updateGamestate();
            ticks++;
        }

        const energyUsed = energyBudget - Math.max(0, GAMESTATE.current_energy);
        const completed = task.reps >= taskDef.max_reps;

        // Extract updated skill state BEFORE restoring
        const updatedLevels = {}, updatedXp = {};
        for (let i = 0; i < GAMESTATE.skills.length; i++) {
            updatedLevels[i] = GAMESTATE.skills[i].level;
            updatedXp[i] = GAMESTATE.skills[i].progress;
        }

        // Restore all state
        for (let i = 0; i < GAMESTATE.skills.length; i++) {
            GAMESTATE.skills[i].level = savedLevels[i];
            GAMESTATE.skills[i].progress = savedXp[i];
        }
        GAMESTATE.perks.clear();
        for (const [k, v] of savedPerks) GAMESTATE.perks.set(k, v);
        GAMESTATE.current_energy = savedEnergy;
        GAMESTATE.max_energy = savedMaxEnergy;
        GAMESTATE.is_in_energy_reset = savedReset;
        GAMESTATE.active_task = savedActiveTask;
        GAMESTATE.current_zone = savedZone;
        GAMESTATE.tasks = savedTasks;
        GAMESTATE.highest_zone = savedHighestZone;
        GAMESTATE.highest_zone_fully_completed = savedHighestZoneFC;

        return { energyUsed, completed, updatedLevels, updatedXp };
    },
};
//# sourceMappingURL=game.js.map
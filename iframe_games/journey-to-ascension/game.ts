import { handleHotkeyPressed, handleHotkeyReleased, Rendering, updateRendering } from "./rendering.js";
import { Gamestate, saveGame, updateGamestate, resetTasks, calcTickRate, clickTask, clickItem, doPrestige, doEnergyReset, tryAddPerk } from "./simulation.js";
import { ZONES, TASK_LOOKUP } from "./zones.js";
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
} else {
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
(window as any).getGamestate = GAMESTATE;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).resetSave = resetSave;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).resetZone = () => {
    resetTasks();
    RENDERING = new Rendering();
    RENDERING.initialize();
    RENDERING.start();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ZONES = ZONES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).TASK_LOOKUP = TASK_LOOKUP;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).resetTasks = resetTasks;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).clickTask = clickTask;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).clickItem = clickItem;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).doPrestige = doPrestige;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).doEnergyReset = doEnergyReset;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).saveGame = saveGame;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ITEMS = ITEMS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ARTIFACTS = ARTIFACTS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).SKILL_DEFINITIONS = SKILL_DEFINITIONS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).PERKS = PERKS;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).PRESTIGE_UNLOCKABLES = PRESTIGE_UNLOCKABLES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).PRESTIGE_REPEATABLES = PRESTIGE_REPEATABLES;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).ItemSkillModifierList = ItemSkillModifierList;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).PerkSkillModifierList = PerkSkillModifierList;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).tryAddPerk = tryAddPerk;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).patchRenderingConstants = patchRenderingConstants;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).readRenderingConstants = readRenderingConstants;

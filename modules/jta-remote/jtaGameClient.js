// Journey to Ascension integration client for Archipelago iframe adapter
// Connects the JTA game to the Archipelago eventBus via IframeClient
import { IframeClient } from '../iframe-base/iframeClient.js';
import { createSharedLogger, initializeIframeLogger } from '../iframe-base/shared/sharedLogger.js';

initializeIframeLogger({ defaultLevel: 'WARN' });
const log = createSharedLogger('jtaGameClient');
const SAVE_KEY = 'incrementalGameSave';

/**
 * Update connection status bar in UI
 * @param {string} status - Status message
 * @param {string} type - Status type ('connecting', 'connected', 'error')
 */
function updateConnectionStatus(status, type = 'connecting') {
    const statusElement = document.getElementById('connectionStatus');
    if (statusElement) {
        statusElement.textContent = status;
        statusElement.className = `connection-status ${type}`;
    }
}

/**
 * Trigger the game's save function to flush state to localStorage
 */
function triggerManualSave() {
    if (window.saveGame) {
        window.saveGame();
    }
}

/**
 * Wait for the game to initialize (game-area becomes visible)
 * @param {number} timeoutMs - Maximum wait time
 * @returns {Promise<void>}
 */
function waitForGameReady(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const startTime = Date.now();

        function check() {
            const gameArea = document.getElementById('game-area');
            // Game removes 'hidden' class when ready
            if (gameArea && !gameArea.classList.contains('hidden')) {
                log.info(`Game initialized (game-area visible)`);
                resolve();
                return;
            }
            // Also check if GAMESTATE is available on window
            if (window.getGamestate && typeof window.getGamestate === 'object') {
                log.info(`Game initialized (GAMESTATE available)`);
                resolve();
                return;
            }
            if (Date.now() - startTime > timeoutMs) {
                reject(new Error('Timed out waiting for game initialization'));
                return;
            }
            setTimeout(check, 200);
        }

        check();
    });
}

/**
 * Read game state summary from the live GAMESTATE object
 * @returns {object|null}
 */
function readGameState() {
    const gs = window.getGamestate;
    if (!gs) return null;

    // Count perks (it's a Map<PerkType, boolean>)
    let perkCount = 0;
    if (gs.perks instanceof Map) {
        for (const [, owned] of gs.perks) {
            if (owned) perkCount++;
        }
    }

    return {
        currentZone: gs.current_zone,
        highestZone: gs.highest_zone,
        highestZoneEver: gs.highest_zone_ever,
        currentEnergy: gs.current_energy,
        maxEnergy: gs.max_energy,
        energyResetCount: gs.energy_reset_count,
        prestigeCount: gs.prestige_count,
        perkCount,
        isAtEndOfContent: gs.is_at_end_of_content,
    };
}

/**
 * Read detailed game state for simulator comparison.
 * Extracts skill levels, perks, items, power/attunement, prestige, and
 * per-task computed values from the live GAMESTATE.
 * @returns {object|null}
 */
function readDetailedGameState() {
    const gs = window.getGamestate;
    if (!gs) return null;

    // Skills: array of {type, level, progress, speed_modifier}
    const skills = {};
    if (Array.isArray(gs.skills)) {
        for (const skill of gs.skills) {
            skills[skill.type] = {
                level: skill.level,
                xp: skill.progress,
                speedModifier: skill.speed_modifier,
            };
        }
    }

    // Perks: array of perk type IDs that are owned
    const perks = [];
    if (gs.perks instanceof Map) {
        for (const [perkType, owned] of gs.perks) {
            if (owned) perks.push(perkType);
        }
    }

    // Items: object of itemType -> count
    const items = {};
    if (gs.items instanceof Map) {
        for (const [itemType, count] of gs.items) {
            if (count > 0) items[itemType] = count;
        }
    }

    // Prestige unlocks and repeatables
    const prestigeUnlocks = Array.isArray(gs.prestige_unlocks) ? [...gs.prestige_unlocks] : [];
    const prestigeRepeatables = {};
    if (gs.prestige_repeatables instanceof Map) {
        for (const [type, level] of gs.prestige_repeatables) {
            prestigeRepeatables[type] = level;
        }
    }

    // Per-task data for current zone's tasks (Task objects with runtime state)
    const tasks = [];
    if (Array.isArray(gs.tasks)) {
        for (const task of gs.tasks) {
            const def = task.task_definition;
            tasks.push({
                id: def.id,
                name: def.name,
                type: def.type,
                zoneId: def.zone_id,
                costMult: def.cost_multiplier,
                skills: [...def.skills],
                xpMult: def.xp_mult,
                maxReps: def.max_reps,
                perk: def.perk,
                item: def.item,
                useItem: def.use_item,
                hidden: def.hidden_by_default,
                // Runtime state
                progress: task.progress,
                reps: task.reps,
                enabled: task.enabled,
                hasted: task.hasted,
                xpBoosted: task.xp_boosted,
                lightning: task.lightning,
            });
        }
    }

    return {
        // Zone/energy
        currentZone: gs.current_zone,
        highestZone: gs.highest_zone,
        highestZoneEver: gs.highest_zone_ever,
        highestZoneFullyCompleted: gs.highest_zone_fully_completed,
        highestZoneFullyCompletedEver: gs.highest_zone_fully_completed_ever,
        currentEnergy: gs.current_energy,
        maxEnergy: gs.max_energy,
        energyResetCount: gs.energy_reset_count,
        // Skills, perks, items
        skills,
        perks,
        items,
        // Power/attunement
        power: gs.power,
        attunement: gs.attunement,
        // Prestige
        prestigeCount: gs.prestige_count,
        prestigeUnlocks,
        prestigeRepeatables,
        // Artifacts
        queuedScrollsOfHaste: gs.queued_scrolls_of_haste,
        queuedMagicRings: gs.queued_magic_rings,
        queuedLightning: gs.queued_lightning,
        // Current zone tasks with runtime state
        tasks,
    };
}

/**
 * Build a lookup of perk-granting task IDs from the game definitions.
 * Returns a Map<taskId, {taskName, perkType}> for all tasks that grant perks.
 */
function buildPerkTaskLookup() {
    const lookup = new Map();
    const zones = window.ZONES;
    if (!zones) return lookup;

    for (const zone of zones) {
        if (!zone.tasks) continue;
        for (const def of zone.tasks) {
            // PerkType.Count (41) means "no perk"; null/undefined also means no perk
            if (def.perk != null && def.perk !== 41) {
                lookup.set(def.id, { taskName: def.name, perkType: def.perk });
            }
        }
    }
    return lookup;
}

/**
 * Set up polling to detect game state changes and publish events
 * @param {IframeClient} client
 */
function setupStateChangeDetection(client) {
    let lastZone = -1;
    let lastResetCount = -1;
    let lastPrestigeCount = -1;
    let lastIsInEnergyReset = false;

    // Track owned perks as a Set of perk type IDs
    const ownedPerks = new Set();
    let perkTrackingInitialized = false;

    // Track completed perk-granting tasks
    const completedPerkTasks = new Set();
    const perkTaskLookup = buildPerkTaskLookup();

    // Initialize from current state
    const gs = window.getGamestate;
    if (gs) {
        lastZone = gs.current_zone;
        lastResetCount = gs.energy_reset_count;
        lastPrestigeCount = gs.prestige_count;
        lastIsInEnergyReset = !!gs.is_in_energy_reset;
        if (gs.perks instanceof Map) {
            for (const [perkType, owned] of gs.perks) {
                if (owned) ownedPerks.add(perkType);
            }
            perkTrackingInitialized = true;
        }
    }

    log.info(`Perk task lookup built: ${perkTaskLookup.size} perk-granting tasks`);

    setInterval(() => {
        const gs = window.getGamestate;
        if (!gs) return;

        // Zone change detection
        if (gs.current_zone !== lastZone) {
            const prevZone = lastZone;
            lastZone = gs.current_zone;
            if (prevZone >= 0) {
                log.info(`Zone changed: ${prevZone} -> ${gs.current_zone}`);
                client.publishEventBus('jta:zoneChanged', {
                    previousZone: prevZone,
                    currentZone: gs.current_zone,
                    highestZone: gs.highest_zone,
                    timestamp: Date.now()
                });
            }
        }

        // Energy reset detection
        if (gs.energy_reset_count !== lastResetCount) {
            const prevCount = lastResetCount;
            lastResetCount = gs.energy_reset_count;
            if (prevCount >= 0) {
                log.info(`Energy reset #${gs.energy_reset_count}`);
                client.publishEventBus('jta:energyReset', {
                    resetCount: gs.energy_reset_count,
                    timestamp: Date.now()
                });
            }
        }

        // Prestige detection
        if (gs.prestige_count !== lastPrestigeCount) {
            const prevCount = lastPrestigeCount;
            lastPrestigeCount = gs.prestige_count;
            if (prevCount >= 0) {
                log.info(`Prestige #${gs.prestige_count}`);
                client.publishEventBus('jta:prestige', {
                    prestigeCount: gs.prestige_count,
                    timestamp: Date.now()
                });
            }
        }

        // Perk task completion detection: check current zone's tasks
        if (Array.isArray(gs.tasks)) {
            for (const task of gs.tasks) {
                const taskId = task.task_definition.id;
                if (perkTaskLookup.has(taskId) && !completedPerkTasks.has(taskId)) {
                    if (task.reps >= task.task_definition.max_reps) {
                        completedPerkTasks.add(taskId);
                        const info = perkTaskLookup.get(taskId);
                        log.info(`Perk task completed: ${info.taskName} (task ${taskId}, perk ${info.perkType})`);
                        client.publishEventBus('jta:perkTaskCompleted', {
                            taskId,
                            taskName: info.taskName,
                            perkType: info.perkType,
                            timestamp: Date.now()
                        });
                    }
                }
            }
        }

        // Perk grant detection (enhanced: tracks full set of owned perks)
        if (gs.perks instanceof Map) {
            const currentPerks = new Set();
            for (const [perkType, owned] of gs.perks) {
                if (owned) currentPerks.add(perkType);
            }

            if (perkTrackingInitialized) {
                // Find newly gained perks
                const newPerks = [];
                for (const pt of currentPerks) {
                    if (!ownedPerks.has(pt)) newPerks.push(pt);
                }

                if (newPerks.length > 0) {
                    // Update tracked set
                    for (const pt of newPerks) ownedPerks.add(pt);
                    log.info(`Perk count changed to ${currentPerks.size} (new: ${newPerks.join(', ')})`);
                    client.publishEventBus('jta:perkChanged', {
                        perkCount: currentPerks.size,
                        ownedPerks: [...currentPerks],
                        newPerks,
                        timestamp: Date.now()
                    });
                }
            } else {
                // First time — initialize without publishing
                for (const pt of currentPerks) ownedPerks.add(pt);
                perkTrackingInitialized = true;
            }
        }

        // Energy depleted detection (game-over overlay showing, game paused)
        if (gs.is_in_energy_reset && !lastIsInEnergyReset) {
            log.info(`Energy depleted — game-over overlay showing`);
            client.publishEventBus('jta:energyDepleted', {
                resetCount: gs.energy_reset_count,
                timestamp: Date.now()
            });
        }
        lastIsInEnergyReset = gs.is_in_energy_reset;

    }, 500); // Poll every 500ms

    log.info(`State change detection active`);
}

/**
 * Export the current game save from localStorage
 * @param {IframeClient} client
 */
function exportSave(client) {
    triggerManualSave();
    const saveData = localStorage.getItem(SAVE_KEY);
    if (saveData) {
        log.info(`Exporting save (${saveData.length} chars)`);
        client.publishEventBus('jta:saveExported', {
            saveJson: saveData,
            timestamp: Date.now()
        });
    } else {
        log.warn(`No save data found in localStorage`);
        client.publishEventBus('jta:saveExported', {
            saveJson: null,
            error: 'No save data found',
            timestamp: Date.now()
        });
    }
}

/**
 * Import a save by writing to localStorage and reloading
 * @param {string} saveJson - JSON string of the save data
 */
function importSave(saveJson) {
    log.info(`Importing save (${saveJson.length} chars)`);

    // Validate JSON
    try {
        JSON.parse(saveJson);
    } catch (e) {
        log.error(`Invalid save JSON:`, e.message);
        return;
    }

    // Block the game's own saves during import
    const origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function() {};

    // Write the save data directly
    origSetItem(SAVE_KEY, saveJson);

    // Reload to apply
    location.reload();
}

/**
 * Patch the live game runtime state.
 * Accepts a partial state object matching the detailedGameState structure.
 * Only provided fields are modified; omitted fields are untouched.
 * @param {object} patch
 * @param {IframeClient} client
 */
function patchGameState(patch, client) {
    const gs = window.getGamestate;
    if (!gs) {
        log.error(`patchGameState: no GAMESTATE`);
        return;
    }

    let changes = 0;

    // Energy
    if (patch.currentEnergy !== undefined) { gs.current_energy = patch.currentEnergy; changes++; }
    if (patch.maxEnergy !== undefined) { gs.max_energy = patch.maxEnergy; changes++; }

    // Zone tracking
    if (patch.currentZone !== undefined) { gs.current_zone = patch.currentZone; changes++; }
    if (patch.highestZone !== undefined) { gs.highest_zone = patch.highestZone; changes++; }
    if (patch.highestZoneEver !== undefined) { gs.highest_zone_ever = patch.highestZoneEver; changes++; }
    if (patch.highestZoneFullyCompleted !== undefined) { gs.highest_zone_fully_completed = patch.highestZoneFullyCompleted; changes++; }
    if (patch.highestZoneFullyCompletedEver !== undefined) { gs.highest_zone_fully_completed_ever = patch.highestZoneFullyCompletedEver; changes++; }
    if (patch.energyResetCount !== undefined) { gs.energy_reset_count = patch.energyResetCount; changes++; }

    // Skills: { skillType: { level, xp, speedModifier } }
    if (patch.skills && Array.isArray(gs.skills)) {
        for (const [skillTypeStr, data] of Object.entries(patch.skills)) {
            const skillType = Number(skillTypeStr);
            const skill = gs.skills[skillType];
            if (!skill) continue;
            if (data.level !== undefined) { skill.level = data.level; changes++; }
            if (data.xp !== undefined) { skill.progress = data.xp; changes++; }
            if (data.speedModifier !== undefined) { skill.speed_modifier = data.speedModifier; changes++; }
        }
    }

    // Perks: array of perk type IDs to set as owned (replaces current perks)
    if (Array.isArray(patch.perks) && gs.perks instanceof Map) {
        gs.perks.clear();
        for (const perkType of patch.perks) {
            gs.perks.set(perkType, true);
        }
        changes++;
    }

    // Items: { itemType: count }
    if (patch.items && gs.items instanceof Map) {
        for (const [itemTypeStr, count] of Object.entries(patch.items)) {
            gs.items.set(Number(itemTypeStr), count);
        }
        changes++;
    }

    // Power / Attunement
    if (patch.power !== undefined) { gs.power = patch.power; changes++; }
    if (patch.attunement !== undefined) { gs.attunement = patch.attunement; changes++; }

    // Artifacts
    if (patch.queuedScrollsOfHaste !== undefined) { gs.queued_scrolls_of_haste = patch.queuedScrollsOfHaste; changes++; }
    if (patch.queuedMagicRings !== undefined) { gs.queued_magic_rings = patch.queuedMagicRings; changes++; }
    if (patch.queuedLightning !== undefined) { gs.queued_lightning = patch.queuedLightning; changes++; }

    // Prestige unlocks: array of PrestigeUnlockType values (replaces current)
    if (Array.isArray(patch.prestigeUnlocks)) {
        gs.prestige_unlocks = [...patch.prestigeUnlocks];
        changes++;
    }

    // Prestige repeatables: { type: level }
    if (patch.prestigeRepeatables && gs.prestige_repeatables instanceof Map) {
        for (const [typeStr, level] of Object.entries(patch.prestigeRepeatables)) {
            gs.prestige_repeatables.set(Number(typeStr), level);
        }
        changes++;
    }

    if (patch.prestigeCount !== undefined) { gs.prestige_count = patch.prestigeCount; changes++; }

    // Optionally rebuild current zone tasks after state changes
    if (patch.resetTasks && window.resetTasks) {
        window.resetTasks();
        changes++;
    }

    log.info(`patchGameState: ${changes} changes applied`);
    client.publishEventBus('jta:gameStatePatched', { changes, timestamp: Date.now() });
}

/**
 * Patch task definitions in the game's ZONES/TASK_LOOKUP data.
 * Each entry in the patches array targets a task by ID and modifies its fields.
 * After patching, optionally calls resetTasks() to rebuild current zone.
 *
 * @param {object} data - { patches: [{id, perk?, item?, skills?, costMult?, xpMult?, maxReps?, ...}], resetTasks? }
 * @param {IframeClient} client
 */
function patchTaskDefs(data, client) {
    const taskLookup = window.TASK_LOOKUP;
    if (!taskLookup) {
        log.error(`patchTaskDefs: TASK_LOOKUP not available on window`);
        client.publishEventBus('jta:taskDefsPatched', { error: 'TASK_LOOKUP not available', timestamp: Date.now() });
        return;
    }

    const patches = data.patches || [];
    let patched = 0;
    let notFound = 0;

    for (const patch of patches) {
        const def = taskLookup.get(patch.id);
        if (!def) {
            log.warn(`patchTaskDefs: task ${patch.id} not found`);
            notFound++;
            continue;
        }

        if (patch.perk !== undefined) def.perk = patch.perk;
        if (patch.item !== undefined) def.item = patch.item;
        if (patch.useItem !== undefined) def.use_item = patch.useItem;
        if (patch.skills !== undefined) def.skills = [...patch.skills];
        if (patch.costMult !== undefined) def.cost_multiplier = patch.costMult;
        if (patch.xpMult !== undefined) def.xp_mult = patch.xpMult;
        if (patch.maxReps !== undefined) def.max_reps = patch.maxReps;
        if (patch.type !== undefined) def.type = patch.type;
        if (patch.name !== undefined) def.name = patch.name;
        if (patch.hidden !== undefined) def.hidden_by_default = patch.hidden;

        patched++;
    }

    // Rebuild current zone tasks so active Task objects pick up changes
    if (data.resetTasks !== false && window.resetTasks) {
        window.resetTasks();
    }

    log.info(`patchTaskDefs: ${patched} patched, ${notFound} not found`);
    client.publishEventBus('jta:taskDefsPatched', { patched, notFound, timestamp: Date.now() });
}

/**
 * Build a skill modifier list from a JSON { skillId: effect } object.
 * @param {'item'|'perk'} type
 * @param {object} modObj - { skillId: effect }
 * @returns {object|null} An ItemSkillModifierList or PerkSkillModifierList, or null if constructor unavailable
 */
function buildSkillModifierList(type, modObj) {
    const Ctor = type === 'item' ? window.ItemSkillModifierList : window.PerkSkillModifierList;
    if (!Ctor) return null;
    const pairs = Object.entries(modObj).map(([k, v]) => [Number(k), v]);
    return new Ctor(pairs);
}

/**
 * Replace the game's complete definition data from a game data JSON.
 * Patches: tasks, zone names, skills, items, perks, prestige upgrades,
 * and rendering constants.
 *
 * @param {object} data - Full game data object
 * @param {IframeClient} client
 */
function replaceGameData(data, client) {
    const taskLookup = window.TASK_LOOKUP;
    if (!taskLookup) {
        log.error(`replaceGameData: TASK_LOOKUP not available on window`);
        client.publishEventBus('jta:gameDataReplaced', { error: 'TASK_LOOKUP not available', timestamp: Date.now() });
        return;
    }

    const counts = { tasks: 0, tasksNotFound: 0, skills: 0, items: 0, perks: 0, prestigeUnlocks: 0, prestigeRepeatables: 0, renderingConstants: 0 };

    // --- Zones & Tasks ---
    const zones = data.zones || [];
    for (let zoneIdx = 0; zoneIdx < zones.length; zoneIdx++) {
        const zone = zones[zoneIdx];

        if (zone.name !== undefined && window.ZONES && window.ZONES[zoneIdx]) {
            window.ZONES[zoneIdx].name = zone.name;
        }

        for (const task of zone.tasks) {
            const def = taskLookup.get(task.id);
            if (!def) {
                counts.tasksNotFound++;
                continue;
            }

            if (task.perk !== undefined) def.perk = task.perk;
            if (task.item !== undefined) def.item = task.item;
            if (task.useItem !== undefined) def.use_item = task.useItem;
            if (task.skills !== undefined) def.skills = [...task.skills];
            if (task.costMult !== undefined) def.cost_multiplier = task.costMult;
            if (task.xpMult !== undefined) def.xp_mult = task.xpMult;
            if (task.maxReps !== undefined) def.max_reps = task.maxReps;
            if (task.type !== undefined) def.type = task.type;
            if (task.name !== undefined) def.name = task.name;
            if (task.hidden !== undefined) def.hidden_by_default = task.hidden;
            if (task.zoneId !== undefined) def.zone_id = task.zoneId;

            counts.tasks++;
        }
    }

    // --- Skills ---
    const skills = data.skills || [];
    const skillDefs = window.SKILL_DEFINITIONS;
    if (skillDefs && skills.length > 0) {
        for (const skill of skills) {
            if (skill.id === undefined) continue;
            const def = skillDefs[skill.id];
            if (!def) continue;
            if (skill.xpMult !== undefined) def.xp_needed_mult = skill.xpMult;
            if (skill.name !== undefined) def.name = skill.name;
            if (skill.icon !== undefined) def.icon = skill.icon;
            counts.skills++;
        }
    }

    // --- Items ---
    const itemsData = data.items;
    const itemDefs = window.ITEMS;
    if (itemDefs && itemsData) {
        // items can be an array (from readGameDefinitions) or an object keyed by ID (from gamedata JSON)
        const entries = Array.isArray(itemsData)
            ? itemsData.map(it => [it.index !== undefined ? it.index : it.enumValue, it])
            : Object.entries(itemsData).map(([k, v]) => [Number(k), v]);

        for (const [idx, item] of entries) {
            const def = itemDefs[idx];
            if (!def) continue;
            if (item.name !== undefined) def.name = item.name;
            if (item.namePlural !== undefined) def.name_plural = item.namePlural;
            if (item.name_plural !== undefined) def.name_plural = item.name_plural;
            if (item.icon !== undefined) def.icon = item.icon;
            if (item.skillModifiers !== undefined) {
                const modList = buildSkillModifierList('item', item.skillModifiers);
                if (modList) def.skill_modifiers = modList;
            }
            counts.items++;
        }
    }

    // --- Perks ---
    const perksData = data.perks;
    const perkDefs = window.PERKS;
    if (perkDefs && perksData) {
        for (const [idStr, perk] of Object.entries(perksData)) {
            const idx = Number(idStr);
            const def = perkDefs[idx];
            if (!def) continue;
            if (perk.name !== undefined) def.name = perk.name;
            if (perk.icon !== undefined) def.icon = perk.icon;
            if (perk.skillModifiers !== undefined) {
                const modList = buildSkillModifierList('perk', perk.skillModifiers);
                if (modList) def.skill_modifiers = modList;
            }
            counts.perks++;
        }
    }

    // --- Prestige Unlocks ---
    // Support both top-level prestigeUnlocks (from readGameDefinitions) and nested prestige.unlocks (from JSON files)
    const puData = data.prestigeUnlocks || (data.prestige && data.prestige.unlocks);
    const puDefs = window.PRESTIGE_UNLOCKABLES;
    if (puDefs && Array.isArray(puData)) {
        for (let i = 0; i < puData.length && i < puDefs.length; i++) {
            const src = puData[i];
            if (src.name !== undefined) puDefs[i].name = src.name;
            if (src.cost !== undefined) puDefs[i].cost = src.cost;
            counts.prestigeUnlocks++;
        }
    }

    // --- Prestige Repeatables ---
    const prData = data.prestigeRepeatables || (data.prestige && data.prestige.repeatables);
    const prDefs = window.PRESTIGE_REPEATABLES;
    if (prDefs && Array.isArray(prData)) {
        for (let i = 0; i < prData.length && i < prDefs.length; i++) {
            const src = prData[i];
            if (src.name !== undefined) prDefs[i].name = src.name;
            if (src.initialCost !== undefined) prDefs[i].initial_cost = src.initialCost;
            if (src.initial_cost !== undefined) prDefs[i].initial_cost = src.initial_cost;
            if (src.scalingExponent !== undefined) prDefs[i].scaling_exponent = src.scalingExponent;
            if (src.scaling_exponent !== undefined) prDefs[i].scaling_exponent = src.scaling_exponent;
            counts.prestigeRepeatables++;
        }
    }

    // --- Rendering Constants ---
    if (data.renderingConstants && window.patchRenderingConstants) {
        window.patchRenderingConstants(data.renderingConstants);
        counts.renderingConstants = Object.keys(data.renderingConstants).length;
    }

    if (data.resetTasks !== false && window.resetTasks) {
        window.resetTasks();
    }

    const parts = [`${counts.tasks} tasks`];
    if (counts.tasksNotFound) parts.push(`${counts.tasksNotFound} not found`);
    if (counts.skills) parts.push(`${counts.skills} skills`);
    if (counts.items) parts.push(`${counts.items} items`);
    if (counts.perks) parts.push(`${counts.perks} perks`);
    if (counts.prestigeUnlocks) parts.push(`${counts.prestigeUnlocks} prestige unlocks`);
    if (counts.prestigeRepeatables) parts.push(`${counts.prestigeRepeatables} prestige repeatables`);
    if (counts.renderingConstants) parts.push(`${counts.renderingConstants} rendering constants`);
    log.info(`replaceGameData: ${parts.join(', ')}`);
    client.publishEventBus('jta:gameDataReplaced', { ...counts, timestamp: Date.now() });
}

/**
 * Serialize a SkillModifierList's modifiers to a plain { skillId: effect } object.
 * @param {object} modList - An ItemSkillModifierList or PerkSkillModifierList instance
 * @returns {object}
 */
function serializeSkillModifiers(modList) {
    const result = {};
    if (modList && Array.isArray(modList.modifiers)) {
        for (const mod of modList.modifiers) {
            result[mod.skill] = mod.effect;
        }
    }
    return result;
}

/**
 * Read the game's full definition data: zones, tasks, skills, items, perks,
 * prestige upgrades, and rendering constants.
 * @returns {object|null}
 */
function readGameDefinitions() {
    const zones = window.ZONES;
    if (!zones) return null;

    const result = {
        zones: zones.map((zone, zoneId) => ({
            name: zone.name,
            zoneId,
            tasks: zone.tasks.map(def => ({
                id: def.id,
                name: def.name,
                type: def.type,
                zoneId: def.zone_id,
                costMult: def.cost_multiplier,
                skills: [...def.skills],
                xpMult: def.xp_mult,
                maxReps: def.max_reps,
                perk: def.perk,
                item: def.item,
                useItem: def.use_item,
                hidden: def.hidden_by_default,
            })),
        })),
    };

    // Skills
    const skillDefs = window.SKILL_DEFINITIONS;
    if (skillDefs) {
        result.skills = [];
        for (let i = 0; i < skillDefs.length; i++) {
            const sd = skillDefs[i];
            if (sd && sd.name) {
                result.skills.push({
                    id: sd.type !== undefined ? sd.type : i,
                    name: sd.name,
                    icon: sd.icon || '',
                    xpMult: sd.xp_needed_mult,
                });
            }
        }
    }

    // Items
    const items = window.ITEMS;
    const artifacts = window.ARTIFACTS;
    if (items) {
        result.items = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item || !item.name) continue;
            const def = {
                index: i,
                enumValue: item.enum,
                name: item.name,
                namePlural: item.name_plural || '',
                icon: item.icon || '',
                skillModifiers: serializeSkillModifiers(item.skill_modifiers),
            };
            // Energy items (Food, Fish, etc.) - check on_consume for energy value
            // Energy value isn't stored as a field, so we can't read it generically
            if (item.enum !== undefined && artifacts && artifacts.includes(item.enum)) {
                def.artifact = true;
            }
            result.items.push(def);
        }
        if (artifacts) {
            result.artifacts = [...artifacts];
        }
    }

    // Perks
    const perks = window.PERKS;
    if (perks) {
        result.perks = {};
        for (let i = 0; i < perks.length; i++) {
            const p = perks[i];
            if (!p || !p.name || p.name === 'DELETED PERK - Deep Trance') continue;
            result.perks[i] = {
                name: p.name,
                icon: p.icon || '',
                skillModifiers: serializeSkillModifiers(p.skill_modifiers),
            };
        }
    }

    // Prestige unlocks
    const prestigeUnlocks = window.PRESTIGE_UNLOCKABLES;
    if (prestigeUnlocks) {
        result.prestigeUnlocks = [];
        for (const pu of prestigeUnlocks) {
            result.prestigeUnlocks.push({
                type: pu.type,
                layer: pu.layer,
                name: pu.name,
                cost: pu.cost,
            });
        }
    }

    // Prestige repeatables
    const prestigeRepeatables = window.PRESTIGE_REPEATABLES;
    if (prestigeRepeatables) {
        result.prestigeRepeatables = [];
        for (const pr of prestigeRepeatables) {
            result.prestigeRepeatables.push({
                type: pr.type,
                layer: pr.layer,
                name: pr.name,
                initialCost: pr.initial_cost,
                scalingExponent: pr.scaling_exponent,
            });
        }
    }

    // Rendering constants
    if (window.readRenderingConstants) {
        result.renderingConstants = window.readRenderingConstants();
    }

    return result;
}

/**
 * Set up eventBus subscriptions for save import/export and game commands
 * @param {IframeClient} client
 */
function setupSubscriptions(client) {
    // Save export requests
    client.subscribeEventBus('jta:exportSave', () => {
        exportSave(client);
    });

    // Save import requests
    client.subscribeEventBus('jta:importSave', (data) => {
        if (data && data.saveJson) {
            importSave(data.saveJson);
        } else {
            log.warn(`importSave event received without saveJson`);
        }
    });

    // Request game state snapshot (summary)
    client.subscribeEventBus('jta:requestState', () => {
        const state = readGameState();
        client.publishEventBus('jta:stateSnapshot', {
            state,
            timestamp: Date.now()
        });
    });

    // Request detailed game state for simulator comparison
    client.subscribeEventBus('jta:requestDetailedState', () => {
        const detailedState = readDetailedGameState();
        client.publishEventBus('jta:detailedStateSnapshot', {
            state: detailedState,
            timestamp: Date.now()
        });
    });

    // Request game zone/task definitions (includes all data categories)
    client.subscribeEventBus('jta:requestGameDefs', () => {
        const defs = readGameDefinitions();
        client.publishEventBus('jta:gameDefsSnapshot', {
            ...defs,
            timestamp: Date.now()
        });
    });

    // Patch runtime game state
    client.subscribeEventBus('jta:patchGameState', (data) => {
        patchGameState(data, client);
    });

    // Patch task definitions
    client.subscribeEventBus('jta:patchTaskDefs', (data) => {
        patchTaskDefs(data, client);
    });

    // Replace all game data (full zones array from game data JSON)
    client.subscribeEventBus('jta:replaceGameData', (data) => {
        replaceGameData(data, client);
    });

    // Click a task by definition ID (sets it as active_task)
    client.subscribeEventBus('jta:clickTask', (data) => {
        const gs = window.getGamestate;
        if (!gs) {
            client.publishEventBus('jta:taskClicked', { success: false, error: 'No GAMESTATE', timestamp: Date.now() });
            return;
        }
        const taskId = data.taskId;
        const task = gs.tasks.find(t => t.task_definition.id === taskId);
        if (!task) {
            log.warn(`clickTask: task ${taskId} not found in current zone ${gs.current_zone}`);
            client.publishEventBus('jta:taskClicked', {
                success: false,
                taskId,
                error: `Task ${taskId} not in current zone`,
                timestamp: Date.now()
            });
            return;
        }
        // Check if task is already completed (reps maxed out for this cycle)
        const maxReps = task.task_definition.max_reps;
        if (maxReps > 0 && task.reps >= maxReps) {
            log.info(`clickTask: task ${taskId} "${task.task_definition.name}" already completed (${task.reps}/${maxReps})`);
            client.publishEventBus('jta:taskClicked', {
                success: false,
                taskId,
                taskName: task.task_definition.name,
                alreadyCompleted: true,
                error: `Task already completed (${task.reps}/${maxReps})`,
                timestamp: Date.now()
            });
            return;
        }
        if (window.clickTask) {
            window.clickTask(task);
            log.info(`clickTask: activated task ${taskId} "${task.task_definition.name}"`);
            client.publishEventBus('jta:taskClicked', {
                success: true,
                taskId,
                taskName: task.task_definition.name,
                timestamp: Date.now()
            });
        } else {
            client.publishEventBus('jta:taskClicked', { success: false, taskId, error: 'clickTask not on window', timestamp: Date.now() });
        }
    });

    // Use an item (clickItem)
    client.subscribeEventBus('jta:clickItem', (data) => {
        if (window.clickItem) {
            window.clickItem(data.itemType, !!data.useAll);
            log.info(`clickItem: used item type ${data.itemType} (useAll: ${!!data.useAll})`);
            client.publishEventBus('jta:itemClicked', {
                success: true,
                itemType: data.itemType,
                useAll: !!data.useAll,
                timestamp: Date.now()
            });
        } else {
            client.publishEventBus('jta:itemClicked', { success: false, error: 'clickItem not on window', timestamp: Date.now() });
        }
    });

    // Trigger prestige
    client.subscribeEventBus('jta:doPrestige', () => {
        if (window.doPrestige) {
            window.doPrestige();
            log.info(`doPrestige: triggered`);
            client.publishEventBus('jta:prestigeDone', { success: true, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:prestigeDone', { success: false, error: 'doPrestige not on window', timestamp: Date.now() });
        }
    });

    // Dismiss the game-over overlay and trigger energy reset
    client.subscribeEventBus('jta:dismissGameOver', () => {
        const gs = window.getGamestate;
        if (!gs || !gs.is_in_energy_reset) {
            client.publishEventBus('jta:gameOverDismissed', {
                success: false,
                error: 'Not in energy reset state',
                timestamp: Date.now()
            });
            return;
        }
        // Hide the overlay (same as clicking the dismiss button)
        const overlay = document.getElementById('game-over-overlay');
        if (overlay) overlay.classList.add('hidden');
        // Perform the actual energy reset
        if (window.doEnergyReset) {
            window.doEnergyReset();
            log.info(`dismissGameOver: reset triggered`);
            client.publishEventBus('jta:gameOverDismissed', { success: true, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:gameOverDismissed', { success: false, error: 'doEnergyReset not on window', timestamp: Date.now() });
        }
    });

    // Request current task status (active task + all tasks in zone)
    client.subscribeEventBus('jta:requestTaskStatus', () => {
        const gs = window.getGamestate;
        if (!gs) {
            client.publishEventBus('jta:taskStatus', { error: 'No GAMESTATE', timestamp: Date.now() });
            return;
        }
        const tasks = (gs.tasks || []).map(t => ({
            id: t.task_definition.id,
            name: t.task_definition.name,
            type: t.task_definition.type,
            progress: t.progress,
            reps: t.reps,
            maxReps: t.task_definition.max_reps,
            enabled: t.enabled,
        }));
        client.publishEventBus('jta:taskStatus', {
            activeTaskId: gs.active_task ? gs.active_task.task_definition.id : null,
            currentZone: gs.current_zone,
            currentEnergy: gs.current_energy,
            maxEnergy: gs.max_energy,
            tasks,
            timestamp: Date.now()
        });
    });

    // --- Game state save/restore (for verification) ---

    // Save game state to localStorage (so we can restore after verification)
    client.subscribeEventBus('jta:saveGameState', () => {
        triggerManualSave();
        const saved = localStorage.getItem(SAVE_KEY);
        client.publishEventBus('jta:gameStateSaved', {
            success: !!saved,
            saveSize: saved ? saved.length : 0,
            timestamp: Date.now()
        });
    });

    // Restore game state by reloading the page (restores from localStorage save)
    client.subscribeEventBus('jta:restoreGameState', () => {
        log.info('Restoring game state — reloading page');
        client.publishEventBus('jta:gameStateRestoring', { timestamp: Date.now() });
        // Small delay to let the response get sent
        setTimeout(() => { location.reload(); }, 100);
    });

    // Headless reset: reset zone, tasks, energy but keep skills/perks (matches doHeadlessReset)
    client.subscribeEventBus('jta:doHeadlessReset', () => {
        if (window.doHeadlessReset) {
            window.doHeadlessReset();
            client.publishEventBus('jta:headlessResetDone', { success: true, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:headlessResetDone', { success: false, error: 'doHeadlessReset not available', timestamp: Date.now() });
        }
    });

    // Reset game to fresh state (for verification — clears skills, perks, items, etc.)
    client.subscribeEventBus('jta:resetToFreshState', () => {
        const gs = window.getGamestate;
        if (!gs) {
            client.publishEventBus('jta:freshStateReady', { success: false, error: 'No GAMESTATE', timestamp: Date.now() });
            return;
        }
        // Reset all persistent state
        gs.current_zone = 0;
        gs.highest_zone = 0;
        gs.highest_zone_fully_completed = -1;
        gs.highest_zone_ever = 0;
        gs.highest_zone_fully_completed_ever = -1;
        gs.energy_reset_count = 0;
        gs.current_energy = gs.max_energy;
        gs.max_energy = 100;
        gs.is_in_energy_reset = false;
        gs.is_at_end_of_content = false;
        gs.active_task = null;
        gs.power = 0;
        gs.attunement = 0;
        gs.bottled_lightnings = 0;
        // Clear perks
        if (gs.perks instanceof Map) gs.perks.clear();
        // Clear items
        if (gs.items instanceof Map) gs.items.clear();
        if (gs.used_items instanceof Map) gs.used_items.clear();
        gs.items_found_this_energy_reset = [];
        // Clear prestige
        if (gs.prestige_unlocks instanceof Map) gs.prestige_unlocks.clear();
        if (gs.prestige_repeatables instanceof Map) gs.prestige_repeatables.clear();
        gs.prestige_available = false;
        gs.prestige_layers_unlocked = [];
        // Reset skills to level 0
        for (const skill of gs.skills) {
            skill.level = 0;
            skill.progress = 0;
            skill.speed_modifier = 1;
        }
        gs.skills_at_start_of_reset = gs.skills.map(() => 0);
        gs.unlocked_skills = [0]; // Charisma is always unlocked
        gs.unlocked_tasks = [];
        // Reset tasks for zone 0
        if (window.resetTasks) window.resetTasks();
        log.info('Game state reset to fresh');
        client.publishEventBus('jta:freshStateReady', { success: true, timestamp: Date.now() });
    });

    // --- Instant mode APIs (for cost debugger verification) ---

    // Lazily inject the instant mode wrapper script into the game context.
    // Can't use <script src> because the <base> tag redirects relative URLs
    // to the remote game server. Instead, fetch and eval on first use.
    let _instantWrapperLoaded = !!(window.jta?.setInstantMode || window.setInstantMode);
    async function ensureInstantWrapper() {
        if (_instantWrapperLoaded) return true;
        try {
            // Resolve path relative to this module, not the <base> tag
            const resp = await fetch(new URL('../jta-randomizer/jta-instant-mode-wrapper.js', import.meta.url).href);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const code = await resp.text();
            // eslint-disable-next-line no-eval
            (0, eval)(code);
            _instantWrapperLoaded = true;
            log.info('Instant mode wrapper injected');
            return true;
        } catch (err) {
            log.error('Failed to inject instant mode wrapper:', err);
            return false;
        }
    }

    // Enable/disable instant mode (tasks complete in one tick)
    client.subscribeEventBus('jta:setInstantMode', async (data) => {
        if (!_instantWrapperLoaded) await ensureInstantWrapper();
        const fn = window.jta?.setInstantMode || window.setInstantMode;
        if (fn) {
            fn(!!data.enabled);
            log.info(`setInstantMode: ${data.enabled}`);
            client.publishEventBus('jta:instantModeSet', { enabled: !!data.enabled, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:instantModeSet', { success: false, error: 'Instant mode wrapper not loaded', timestamp: Date.now() });
        }
    });

    // Perform a task instantly: click it, step tick to complete, return state
    client.subscribeEventBus('jta:performTaskInstant', async (data) => {
        if (!_instantWrapperLoaded) await ensureInstantWrapper();
        const performFn = window.jta?.performTask || window.performTask;
        const stepFn = window.jta?.stepTick || window.stepTick;
        const stateFn = window.jta?.getFullState || window.getFullState;

        if (!performFn || !stepFn) {
            client.publishEventBus('jta:taskPerformedInstant', {
                success: false, error: 'Instant mode wrapper not loaded', timestamp: Date.now()
            });
            return;
        }

        const result = performFn(data.taskId);
        if (!result.success) {
            client.publishEventBus('jta:taskPerformedInstant', {
                success: false, taskId: data.taskId, error: result.error, timestamp: Date.now()
            });
            return;
        }

        // Step tick to complete the task instantly
        const tickResult = stepFn();

        client.publishEventBus('jta:taskPerformedInstant', {
            success: true,
            taskId: data.taskId,
            taskName: result.taskName,
            energy: tickResult.energy,
            isInEnergyReset: tickResult.isInEnergyReset || false,
            state: stateFn ? stateFn() : null,
            timestamp: Date.now()
        });
    });

    // Pause/resume game loop (prevents conflicts during verification)
    client.subscribeEventBus('jta:pauseGameLoop', async () => {
        if (!_instantWrapperLoaded) await ensureInstantWrapper();
        const fn = window.jta?.pauseGameLoop || window.pauseGameLoop;
        if (fn) {
            fn();
            log.info('Game loop paused');
            client.publishEventBus('jta:gameLoopPaused', { success: true, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:gameLoopPaused', { success: false, error: 'pauseGameLoop not available', timestamp: Date.now() });
        }
    });

    client.subscribeEventBus('jta:resumeGameLoop', async () => {
        if (!_instantWrapperLoaded) await ensureInstantWrapper();
        const fn = window.jta?.resumeGameLoop || window.resumeGameLoop;
        if (fn) {
            fn();
            log.info('Game loop resumed');
            client.publishEventBus('jta:gameLoopResumed', { success: true, timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:gameLoopResumed', { success: false, error: 'resumeGameLoop not available', timestamp: Date.now() });
        }
    });

    // Execute a task using the REAL game engine (clickTask + updateGamestate loop).
    // Unlike performTaskInstant, this respects energy limits and uses actual game formulas.
    client.subscribeEventBus('jta:executeTaskReal', (data) => {
        const gs = window.getGamestate;
        if (!gs) {
            client.publishEventBus('jta:taskExecutedReal', { success: false, error: 'No GAMESTATE', timestamp: Date.now() });
            return;
        }
        const taskId = data.taskId;
        const task = gs.tasks?.find(t => t.task_definition?.id === taskId);
        if (!task || !task.enabled) {
            client.publishEventBus('jta:taskExecutedReal', {
                success: false, taskId, error: task ? 'Task not enabled' : 'Task not found', timestamp: Date.now()
            });
            return;
        }
        if (task.reps >= task.task_definition.max_reps) {
            client.publishEventBus('jta:taskExecutedReal', {
                success: false, taskId, alreadyCompleted: true, error: 'Already completed', timestamp: Date.now()
            });
            return;
        }
        // Click the task to activate it
        window.clickTask(task);
        // Run updateGamestate tick by tick until task completes or energy runs out
        let ticks = 0;
        while (ticks < 100000 && gs.active_task === task && !gs.is_in_energy_reset) {
            window.updateGamestate();
            ticks++;
        }
        const completed = task.reps >= task.task_definition.max_reps;
        client.publishEventBus('jta:taskExecutedReal', {
            success: true,
            taskId,
            taskName: task.task_definition.name,
            ticks,
            completed,
            energy: gs.current_energy,
            isInEnergyReset: gs.is_in_energy_reset || false,
            timestamp: Date.now()
        });
    });

    // Get full game state (detailed snapshot for verification)
    client.subscribeEventBus('jta:getFullState', async () => {
        if (!_instantWrapperLoaded) await ensureInstantWrapper();
        const fn = window.jta?.getFullState || window.getFullState;
        if (fn) {
            client.publishEventBus('jta:fullState', { state: fn(), timestamp: Date.now() });
        } else {
            client.publishEventBus('jta:fullState', { state: null, error: 'Instant mode wrapper not loaded', timestamp: Date.now() });
        }
    });

    // Grant perks from Archipelago (incrementally via tryAddPerk)
    client.subscribeEventBus('jta:grantPerks', (data) => {
        if (!Array.isArray(data.perkTypes)) return;
        if (!window.tryAddPerk) {
            log.error(`grantPerks: tryAddPerk not available on window`);
            client.publishEventBus('jta:perksGranted', {
                success: false,
                error: 'tryAddPerk not available',
                timestamp: Date.now()
            });
            return;
        }

        const granted = [];
        for (const perkType of data.perkTypes) {
            const gs = window.getGamestate;
            if (gs && gs.perks instanceof Map && gs.perks.get(perkType)) {
                continue; // Already owned
            }
            window.tryAddPerk(perkType, !data.silent);
            granted.push(perkType);
        }

        if (granted.length > 0) {
            log.info(`grantPerks: granted ${granted.length} perk(s): ${granted.join(', ')}`);
        }
        client.publishEventBus('jta:perksGranted', {
            success: true,
            granted,
            timestamp: Date.now()
        });
    });

    log.info(`Subscriptions active`);
}

/**
 * Main initialization flow
 */
async function initialize() {
    try {
        log.info(`Starting initialization...`);

        // Hide connection status when embedded in iframe panel
        if (window.self !== window.top) {
            document.body.classList.add('iframe-embedded');
        }

        updateConnectionStatus('Waiting for game to load...');

        // 1. Wait for game DOM ready
        await waitForGameReady();

        updateConnectionStatus('Connecting to Archipelago...');

        // 2. Create IframeClient and connect
        const client = new IframeClient();
        const connected = await client.connect();

        if (!connected) {
            throw new Error('Failed to establish connection with Archipelago adapter');
        }

        log.info(`Connected to Archipelago adapter`);
        updateConnectionStatus('Connected', 'connected');

        // Make client available for debugging
        window.jtaGameClient = client;

        // 3. Set up state change detection (zone changes, resets, perks)
        setupStateChangeDetection(client);

        // 4. Set up save import/export and command subscriptions
        setupSubscriptions(client);

        // 5. Notify adapter that we're fully ready
        client.notifyAppReady();

        updateConnectionStatus('Ready - Journey to Ascension loaded', 'connected');
        log.info(`Initialization complete`);

    } catch (error) {
        log.error(`Initialization failed:`, error);
        updateConnectionStatus(`Error: ${error.message}`, 'error');
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    initialize();
}

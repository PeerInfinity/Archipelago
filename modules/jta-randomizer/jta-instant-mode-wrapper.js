/**
 * JTA Instant Mode Wrapper
 *
 * This script injects instant mode support into Journey to Ascension
 * WITHOUT modifying the original game code. It works by:
 *
 * 1. Intercepting window property assignments to capture GAMESTATE
 * 2. Monkey-patching the game loop to add instant mode behavior
 * 3. Providing APIs for external control (simulator, tests, etc.)
 *
 * Usage:
 *   - Inject this script BEFORE the game loads (via iframe postMessage or script tag)
 *   - Or call initWrapper() after the game has loaded
 */

(function() {
    'use strict';

    // State tracking
    let _gamestate = null;
    let _instantMode = false;
    let _gameLoopInterval = null;
    let _originalGameLoop = null;
    let _initialized = false;

    // Constants matching the game's internal values
    const BASE_COST = 10;
    const ZONE_EXPONENT = 2.2;
    const ZONE_SPEEDUP_BASE = 1.05;
    const SKILL_LEVEL_EXPONENT = 1.01;
    const SKILL_XP_EXPONENT = 1.02;
    const XP_PER_TICK_MULT = 8;
    const REFLECTIONS_BASE = 0.95;
    const REFLECTIONS_BOOSTED_BASE = 0.9;
    const MAJOR_TIME_COMPRESSION_EFFECT = 1.5;
    const UNIFIED_THEORY_OF_MAGIC_EFFECT = 0.02;
    const HASTE_MULT = 5;
    const BOTTLED_LIGHTNING_MULT = 2;
    const MAGIC_RING_MULT = 5;
    const GOTTA_GO_FAST_BASE = 1.1;
    const MANDATORY_SCHMANDATORY_MULT = 0.2;

    // Task types (matching game's TaskType enum)
    const TaskType = {
        Normal: 0,
        Travel: 1,
        Mandatory: 2,
        Prestige: 3,
        Boss: 4
    };

    // Perk types used in formulas
    const PerkType = {
        MinorTimeCompression: 7,
        HighAltitudeClimbing: 8,
        Attunement: 11,
        ReflectionsOnTheJourney: 16,
        MajorTimeCompression: 23,
        UnifiedTheoryOfMagic: 27,
        Writing: 1,
        GazedBeyondTheVeil: 33,
        CommunedWithDamnedSouls: 39,
    };

    // Prestige types used in formulas
    const PrestigeUnlockType = {
        LookInTheMirror: 2,
        FullyAttuned: 3,
        MasteryOfTime: 6,
        CraftingBreakthrough: 10,
    };

    const PrestigeRepeatableType = {
        GottaGoFast: 3,
        MandatorySchmandatory: 8,
    };

    // Skill types used in formulas
    const SkillType = {
        Study: 1,
        Combat: 2,
        Search: 3,
        Crafting: 5,
        Magic: 8,
        Fortitude: 9,
        Ascension: 11,
    };

    // Helper: check if gamestate has a perk
    function hasPerk(gs, perkType) {
        const perks = gs.perks;
        if (perks instanceof Map) return perks.get(perkType) === true;
        return false;
    }

    // Helper: check prestige unlock
    function hasPrestigeUnlockGS(gs, type) {
        const unlocks = gs.prestige_unlocks;
        if (unlocks instanceof Map) return unlocks.get(type) === true;
        return false;
    }

    // Helper: get prestige repeatable level
    function getPrestigeLevelGS(gs, type) {
        const reps = gs.prestige_repeatables;
        if (reps instanceof Map) return reps.get(type) ?? 0;
        return 0;
    }

    // Helper: get attunement skills based on prestige
    function getAttunementSkillsGS(gs) {
        const skills = [SkillType.Magic, SkillType.Study];
        if (hasPrestigeUnlockGS(gs, PrestigeUnlockType.FullyAttuned)) {
            skills.push(SkillType.Search);
        }
        if (hasPrestigeUnlockGS(gs, PrestigeUnlockType.CraftingBreakthrough)) {
            skills.push(SkillType.Crafting);
        }
        return skills;
    }

    // Skill XP multipliers (higher = slower to level)
    const SKILL_XP_MULT = {
        0: 1, 1: 1, 2: 5, 3: 1, 4: 1, 5: 1, 6: 1, 7: 1, 8: 3, 9: 5, 10: 1, 11: 200
    };

    /**
     * Calculate task cost (energy required to complete one rep)
     */
    function calcTaskCost(task, zoneId) {
        const costMult = task.task_definition?.cost_multiplier ?? task.costMult ?? 1;
        const type = task.task_definition?.type ?? TaskType.Normal;
        const exp = type === TaskType.Boss ? 4 : ZONE_EXPONENT;
        return BASE_COST * costMult * Math.pow(exp, zoneId);
    }

    /**
     * Calculate progress per tick based on skill levels, perks, items, power, attunement, prestige
     * Matches game's calcTaskProgressMultiplier from simulation.ts
     */
    function calcProgressPerTick(task, zoneId, gamestate) {
        if (!gamestate) return 1.0;

        const skills = task.task_definition?.skills ?? task.skills ?? [];
        let mult = 1.0;

        // Skill level bonus (geometric mean for multi-skill tasks)
        let skillLevelMult = 1.0;
        for (const skillType of skills) {
            const skill = gamestate.skills?.[skillType];
            if (skill) {
                skillLevelMult *= Math.pow(SKILL_LEVEL_EXPONENT, skill.level);
            }
        }
        mult *= Math.pow(skillLevelMult, 1 / skills.length);

        // Per-skill bonuses: perk modifiers, speed modifiers, power, attunement
        const attunementSkills = getAttunementSkillsGS(gamestate);
        let hasAttunementSkill = false;
        for (const skillType of skills) {
            const skill = gamestate.skills?.[skillType];

            // Skill speed modifier (from consumed items, set by game)
            if (skill) {
                mult *= (skill.speed_modifier ?? 1.0);
            }

            // Perk skill modifiers
            if (gamestate.perks) {
                for (const [perkId, active] of gamestate.perks) {
                    if (!active) continue;
                    // Access perk definitions from the game's PERKS array if available
                    // Fall back to checking the skill modifier directly
                    const perkDef = window.PERKS?.[perkId];
                    if (perkDef?.skill_modifiers) {
                        const effect = perkDef.skill_modifiers.getSkillEffect?.(skillType) ??
                                       perkDef.skill_modifiers[skillType] ?? 0;
                        if (effect) mult *= (1 + effect);
                    }
                }
            }

            // Power bonus (Combat/Fortitude)
            if (skillType === SkillType.Combat || skillType === SkillType.Fortitude) {
                mult *= (1 + (gamestate.power ?? 0) / 100);
            }

            // Attunement (anti-stacking: divide per skill, apply once after)
            if (hasPerk(gamestate, PerkType.Attunement) && attunementSkills.includes(skillType)) {
                hasAttunementSkill = true;
                mult /= (1 + (gamestate.attunement ?? 0) / 1000);
            }
        }

        // Apply attunement once (anti-stacking)
        if (hasAttunementSkill) {
            mult *= (1 + (gamestate.attunement ?? 0) / 1000);
        }

        // GottaGoFast prestige
        mult *= Math.pow(GOTTA_GO_FAST_BASE, getPrestigeLevelGS(gamestate, PrestigeRepeatableType.GottaGoFast));

        // Haste (5x speed)
        if (task.hasted) {
            mult *= HASTE_MULT;
        }

        // Bottled Lightning (2x speed for bosses)
        if (task.lightning) {
            mult *= BOTTLED_LIGHTNING_MULT;
        }

        // Zone speedup
        mult *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

        // Major Time Compression
        if (hasPerk(gamestate, PerkType.MajorTimeCompression)) {
            mult *= MAJOR_TIME_COMPRESSION_EFFECT;
        }

        // Unified Theory of Magic
        if (hasPerk(gamestate, PerkType.UnifiedTheoryOfMagic)) {
            const highestFullyCompleted = gamestate.highest_zone_fully_completed ?? -1;
            mult *= Math.pow(1 + UNIFIED_THEORY_OF_MAGIC_EFFECT, highestFullyCompleted + 1);
        }

        // MandatorySchmandatory prestige
        const taskType = task.task_definition?.type ?? TaskType.Normal;
        const mandatoryish = taskType === TaskType.Travel || taskType === TaskType.Mandatory || taskType === TaskType.Prestige;
        if (mandatoryish) {
            mult *= 1 + getPrestigeLevelGS(gamestate, PrestigeRepeatableType.MandatorySchmandatory) * MANDATORY_SCHMANDATORY_MULT;
        }

        return mult;
    }

    /**
     * Calculate number of ticks needed to complete one rep
     */
    function calcTaskTicks(task, zoneId, gamestate) {
        const cost = calcTaskCost(task, zoneId);
        const progressPerTick = calcProgressPerTick(task, zoneId, gamestate);
        return Math.ceil(cost / progressPerTick);
    }

    /**
     * Check if task completes in a single tick
     */
    function isSingleTick(task, zoneId, gamestate) {
        const cost = calcTaskCost(task, zoneId);
        const progressPerTick = calcProgressPerTick(task, zoneId, gamestate);
        return progressPerTick >= cost;
    }

    /**
     * Calculate energy drain per tick (matching game's calcEnergyDrainPerTick)
     */
    function calcEnergyDrainPerTick(task, zoneId, gamestate, singleTick) {
        let drain = 1;

        // MasteryOfTime - single tick tasks cost 0 energy
        if (singleTick && hasPrestigeUnlockGS(gamestate, PrestigeUnlockType.MasteryOfTime)) {
            return 0;
        }

        // MinorTimeCompression - single tick tasks cost 80% less energy
        if (singleTick && hasPerk(gamestate, PerkType.MinorTimeCompression)) {
            drain *= 0.2;
        }

        // HighAltitudeClimbing - 20% energy reduction
        if (hasPerk(gamestate, PerkType.HighAltitudeClimbing)) {
            drain *= 0.8;
        }

        // Reflections on the Journey
        if (hasPerk(gamestate, PerkType.ReflectionsOnTheJourney)) {
            const highestZone = gamestate.highest_zone ?? 0;
            const zoneDiff = highestZone - zoneId;
            const base = hasPrestigeUnlockGS(gamestate, PrestigeUnlockType.LookInTheMirror)
                ? REFLECTIONS_BOOSTED_BASE : REFLECTIONS_BASE;
            drain *= Math.pow(base, zoneDiff);
        }

        // Zone scaling
        drain *= Math.pow(ZONE_SPEEDUP_BASE, zoneId);

        // Major Time Compression - increases drain for multi-tick tasks
        if (!singleTick && hasPerk(gamestate, PerkType.MajorTimeCompression)) {
            drain *= MAJOR_TIME_COMPRESSION_EFFECT;
        }

        return drain;
    }

    /**
     * Calculate XP gained per tick (matching game's doTaskTick: progress * 8 * xp_mult)
     */
    function calcSkillXpPerTick(task, progressPerTick, gamestate) {
        const xpMult = task.task_definition?.xp_mult ?? task.xpMult ?? 1;
        let xp = progressPerTick * XP_PER_TICK_MULT * xpMult;

        // Writing perk - 50% more XP (game's PerkDefinition for Writing has xp_bonus effect)
        if (hasPerk(gamestate, PerkType.Writing)) {
            xp *= 1.5;
        }

        // GazedBeyondTheVeil - 2x XP
        if (hasPerk(gamestate, PerkType.GazedBeyondTheVeil)) {
            xp *= 2;
        }

        // Magic Ring XP boost (applied per-task via xp_boosted flag)
        if (task.xp_boosted) {
            xp *= MAGIC_RING_MULT;
        }

        return xp;
    }

    /**
     * Complete a task instantly (all remaining reps)
     * Replicates the game's performTask logic with correct formulas
     */
    function completeTaskInstantly(task, gamestate) {
        if (!task || !gamestate) return;

        const taskDef = task.task_definition;
        const maxReps = taskDef?.max_reps ?? task.maxReps ?? 1;
        const remainingReps = maxReps - task.reps;

        if (remainingReps <= 0) return;

        const zoneId = gamestate.current_zone ?? 0;
        const cost = calcTaskCost(task, zoneId);
        const progressPerTick = calcProgressPerTick(task, zoneId, gamestate);
        const singleTick = progressPerTick >= cost;

        // Process each remaining rep
        for (let rep = 0; rep < remainingReps; rep++) {
            // Check energy before completing
            if (gamestate.current_energy <= 0) break;

            const ticksForRep = Math.ceil(cost / progressPerTick);
            const energyPerTick = calcEnergyDrainPerTick(task, zoneId, gamestate, singleTick);
            const energyForRep = ticksForRep * energyPerTick;

            // Deduct energy
            gamestate.current_energy -= energyForRep;

            // Grant XP for each skill (matching game: xp_per_tick * ticks)
            const skills = taskDef?.skills ?? [];
            const xpPerTick = calcSkillXpPerTick(task, progressPerTick, gamestate);
            const totalXp = xpPerTick * ticksForRep;

            for (const skillType of skills) {
                const skill = gamestate.skills?.[skillType];
                if (skill) {
                    skill.progress += totalXp;
                    // Level up (matching game: 1.02^level * 10 * skillMult)
                    let xpNeeded = getXpForLevel(skill.level, skillType);
                    while (skill.progress >= xpNeeded) {
                        skill.progress -= xpNeeded;
                        skill.level++;
                        xpNeeded = getXpForLevel(skill.level, skillType);
                    }
                }
            }

            // Increment rep count
            task.reps++;

            // Reset progress for next rep
            task.progress = 0;

            // Apply item drops (one per rep, matching game)
            const itemType = taskDef?.item;
            if (itemType !== undefined && itemType !== null) {
                // ItemType.Count means no item (game uses Count as sentinel)
                const ItemTypeCount = 41;
                if (itemType !== ItemTypeCount) {
                    const currentCount = gamestate.items?.get(itemType) ?? 0;
                    gamestate.items?.set(itemType, currentCount + 1);
                }
            }

            // Apply perk if this is the last rep and task grants one
            const perkType = taskDef?.perk;
            if (perkType !== undefined && perkType !== null && task.reps >= maxReps) {
                const PerkTypeCount = 41;
                if (perkType !== PerkTypeCount) {
                    gamestate.perks?.set(perkType, true);
                }
            }
        }

        // Update enabled tasks
        updateEnabledTasks(gamestate);
    }

    /**
     * Get XP required for next level (matching game's formula: 1.02^level * 10 * skillXpMult)
     */
    function getXpForLevel(level, skillType) {
        const skillMult = SKILL_XP_MULT[skillType] ?? 1;
        return Math.pow(SKILL_XP_EXPONENT, level) * 10 * skillMult;
    }

    /**
     * Update which tasks are enabled based on game state
     */
    function updateEnabledTasks(gamestate) {
        if (!gamestate?.tasks) return;

        let hasUnfinishedMandatory = false;

        for (const task of gamestate.tasks) {
            const taskDef = task.task_definition;
            const maxReps = taskDef?.max_reps ?? 1;
            const finished = task.reps >= maxReps;
            const type = taskDef?.type ?? TaskType.Normal;

            // Check for unfinished mandatory/prestige tasks
            if ((type === TaskType.Mandatory || type === TaskType.Prestige) && !finished) {
                hasUnfinishedMandatory = true;
            }

            // Boss tasks have special enabling logic (simplified)
            task.enabled = !finished;
        }

        // Disable Travel tasks if mandatory tasks remain
        if (hasUnfinishedMandatory) {
            for (const task of gamestate.tasks) {
                const type = task.task_definition?.type ?? TaskType.Normal;
                if (type === TaskType.Travel) {
                    task.enabled = false;
                }
            }
        }
    }

    /**
     * Get the current GAMESTATE, handling the stale reference issue
     */
    function getGamestate() {
        // Try multiple ways to get the current gamestate
        if (window._jta_current_gamestate) {
            return window._jta_current_gamestate;
        }
        if (_gamestate) {
            return _gamestate;
        }
        // Fallback to window.getGamestate (may be stale after reset)
        return window.getGamestate;
    }

    // Captured game loop callback and delay for pause/resume
    let _gameLoopFn = null;
    let _gameLoopDelay = 0;
    const _origSetInterval = window.setInterval.bind(window);

    /**
     * Intercept setInterval to capture the game loop interval ID,
     * callback, and delay. The game calls setInterval(gameLoop, calcTickRate())
     * in setTickRate().
     */
    function setupIntervalCapture() {
        window.setInterval = function(fn, delay) {
            const args = Array.prototype.slice.call(arguments);
            const id = _origSetInterval.apply(window, args);
            // The game loop runs at ~66ms intervals; capture anything in that range
            if (typeof fn === 'function' && delay > 10 && delay < 200) {
                _gameLoopInterval = id;
                _gameLoopFn = fn;
                _gameLoopDelay = delay;
            }
            return id;
        };
    }

    /**
     * Set up interception for GAMESTATE updates
     */
    function setupGamestateInterception() {
        // Store original descriptor
        const originalDescriptor = Object.getOwnPropertyDescriptor(window, 'getGamestate');

        // Create a proxy to intercept GAMESTATE assignments
        let currentGamestate = window.getGamestate;

        Object.defineProperty(window, 'getGamestate', {
            get() {
                return currentGamestate;
            },
            set(value) {
                currentGamestate = value;
                _gamestate = value;
                window._jta_current_gamestate = value;
                console.log('[JTA Wrapper] GAMESTATE updated');
            },
            configurable: true
        });

        // If already set, capture it
        if (window.getGamestate) {
            _gamestate = window.getGamestate;
            window._jta_current_gamestate = window.getGamestate;
        }
    }

    /**
     * Wrap the game's updateGamestate function to add instant mode
     */
    function wrapUpdateGamestate() {
        // Wait for the game to expose updateGamestate
        const checkInterval = setInterval(() => {
            // The game exposes stepTick which calls updateGamestate internally
            // We need to intercept the active task processing

            const gs = getGamestate();
            if (!gs) return;

            // Clear interval once we've set up
            clearInterval(checkInterval);

            console.log('[JTA Wrapper] Gamestate available, instant mode ready');
            _initialized = true;
        }, 100);
    }

    /**
     * Initialize the wrapper
     * Call this after the game has loaded, or let it auto-initialize
     */
    function initWrapper() {
        if (_initialized) return;

        console.log('[JTA Wrapper] Initializing...');

        // Capture setInterval calls to get the game loop interval ID
        setupIntervalCapture();

        // Set up GAMESTATE interception
        setupGamestateInterception();

        // Set up updateGamestate wrapper
        wrapUpdateGamestate();

        // Expose our APIs on window
        exposeAPIs();

        console.log('[JTA Wrapper] APIs exposed');
    }

    /**
     * Expose wrapper APIs on window for external use
     */
    function exposeAPIs() {
        // Instant mode control
        window.jta = window.jta || {};

        window.jta.setInstantMode = function(enabled) {
            _instantMode = enabled;
            return _instantMode;
        };

        window.jta.isInstantMode = function() {
            return _instantMode;
        };

        // Manual tick with instant mode support
        window.jta.stepTick = function() {
            const gs = getGamestate();
            if (!gs) return { error: 'No gamestate' };

            // Check for energy reset
            if (gs.is_in_energy_reset) {
                return {
                    energy: gs.current_energy,
                    zone: gs.current_zone,
                    isInEnergyReset: true
                };
            }

            // If instant mode and there's an active task, complete it instantly
            if (_instantMode && gs.active_task) {
                completeTaskInstantly(gs.active_task, gs);
                gs.active_task = null;
            } else if (window.updateGamestate) {
                // Use game's own updateGamestate if available
                window.updateGamestate();
            }

            // Check for energy depletion
            if (gs.current_energy <= 0) {
                gs.is_in_energy_reset = true;
            }

            return {
                energy: gs.current_energy,
                zone: gs.current_zone,
                isInEnergyReset: gs.is_in_energy_reset ?? false
            };
        };

        // Perform a specific task by ID
        window.jta.performTask = function(taskId) {
            const gs = getGamestate();
            if (!gs) return { success: false, error: 'No gamestate' };

            const task = gs.tasks?.find(t =>
                (t.task_definition?.id ?? t.id) === taskId
            );

            if (!task) {
                return { success: false, error: `Task ${taskId} not found in current zone` };
            }
            if (!task.enabled) {
                return { success: false, error: `Task ${taskId} is not enabled` };
            }

            const maxReps = task.task_definition?.max_reps ?? task.maxReps ?? 1;
            if (task.reps >= maxReps) {
                return { success: false, error: `Task ${taskId} is already completed` };
            }

            gs.active_task = task;
            return {
                success: true,
                taskName: task.task_definition?.name ?? task.name
            };
        };

        // Get full serialized state
        window.jta.getFullState = function() {
            const gs = getGamestate();
            if (!gs) return null;

            return {
                currentEnergy: gs.current_energy,
                maxEnergy: gs.max_energy,
                isInEnergyReset: gs.is_in_energy_reset ?? false,
                energyResetCount: gs.energy_reset_count ?? 0,
                currentZone: gs.current_zone ?? 0,
                highestZone: gs.highest_zone ?? 0,
                highestZoneFullyCompleted: gs.highest_zone_fully_completed ?? -1,
                skills: (gs.skills ?? []).map(s => ({
                    type: s.type,
                    level: s.level,
                    progress: s.progress
                })),
                perks: Array.from(gs.perks?.entries?.() ?? [])
                    .filter(([_, active]) => active)
                    .map(([perkType, _]) => perkType),
                items: Array.from(gs.items?.entries?.() ?? [])
                    .filter(([_, count]) => count > 0)
                    .map(([itemType, count]) => ({ type: itemType, count })),
                tasks: (gs.tasks ?? []).map(t => ({
                    id: t.task_definition?.id ?? t.id,
                    name: t.task_definition?.name ?? t.name,
                    reps: t.reps,
                    maxReps: t.task_definition?.max_reps ?? t.maxReps ?? 1,
                    progress: t.progress ?? 0,
                    enabled: t.enabled ?? false,
                    completed: t.reps >= (t.task_definition?.max_reps ?? t.maxReps ?? 1)
                })),
                power: gs.power ?? 0,
                attunement: gs.attunement ?? 0,
                prestigeCount: gs.prestige_count ?? 0
            };
        };

        // Get available (enabled, incomplete) tasks
        window.jta.getAvailableTasks = function() {
            const gs = getGamestate();
            if (!gs?.tasks) return [];

            return gs.tasks
                .filter(t => t.enabled && t.reps < (t.task_definition?.max_reps ?? t.maxReps ?? 1))
                .map(t => ({
                    id: t.task_definition?.id ?? t.id,
                    name: t.task_definition?.name ?? t.name,
                    type: t.task_definition?.type ?? TaskType.Normal,
                    reps: t.reps,
                    maxReps: t.task_definition?.max_reps ?? t.maxReps ?? 1,
                    costMult: t.task_definition?.cost_multiplier ?? t.costMult ?? 1,
                    skills: t.task_definition?.skills ?? [],
                    enabled: t.enabled
                }));
        };

        // Set energy (for testing)
        window.jta.setEnergy = function(current, max) {
            const gs = getGamestate();
            if (!gs) return { error: 'No gamestate' };

            gs.current_energy = current;
            if (max !== undefined) {
                gs.max_energy = max;
            }
            return { current: gs.current_energy, max: gs.max_energy };
        };

        // Pause/resume game loop by clearing/restoring the interval
        window.jta.pauseGameLoop = function() {
            if (_gameLoopInterval !== null) {
                clearInterval(_gameLoopInterval);
                console.log('[JTA Wrapper] Game loop paused');
                return true;
            }
            console.warn('[JTA Wrapper] Cannot pause - game loop interval not captured');
            return false;
        };

        window.jta.resumeGameLoop = function() {
            if (_gameLoopFn) {
                _gameLoopInterval = _origSetInterval(_gameLoopFn, _gameLoopDelay);
                console.log('[JTA Wrapper] Game loop resumed');
                return true;
            }
            console.warn('[JTA Wrapper] Cannot resume - game loop callback not captured');
            return false;
        };

        // Initialize headless (create fresh game state)
        window.jta.initializeHeadless = function() {
            if (window.initializeHeadless) {
                const result = window.initializeHeadless();
                // Re-capture the new gamestate
                setTimeout(() => {
                    const gs = window.getGamestate;
                    if (gs) {
                        _gamestate = gs;
                        window._jta_current_gamestate = gs;
                    }
                }, 10);
                return result;
            }
            console.warn('[JTA Wrapper] Cannot initialize headless - game API not available');
            return false;
        };

        // Also expose under the original names for compatibility
        window.setInstantMode = window.jta.setInstantMode;
        window.isInstantMode = window.jta.isInstantMode;
        window.stepTick = window.jta.stepTick;
        window.performTask = window.jta.performTask;
        window.getFullState = window.jta.getFullState;
        window.getAvailableTasks = window.jta.getAvailableTasks;
        window.setEnergy = window.jta.setEnergy;
    }

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initWrapper);
    } else {
        // DOM already loaded, initialize now
        initWrapper();
    }

    // Also try to initialize when the game's script loads
    window.addEventListener('load', () => {
        setTimeout(initWrapper, 100);
    });

    // Expose init function for manual initialization
    window.initJTAWrapper = initWrapper;

    console.log('[JTA Wrapper] Script loaded, waiting for game...');
})();

// JTAQueueExecutor - drives queue execution by sending eventBus commands to the iframe
// Uses ExecutionSnapshot (current list) for execution, leaving ActionQueue (next list) editable
import { ActionState } from '../shared/actionQueue/actionTypes.js';
import { ExecutionSnapshot } from '../shared/actionQueue/executionSnapshot.js';
import { JTAActionType } from './jtaActionDefs.js';
import { DrainStrategy, pickDrainTask } from './jtaEnergyDrainStrategy.js';
import { snapshotSkillsFromGameState, computeSkillGainsBetween } from './jtaQueuePredictor.js';

const LOG_CAT = 'jtaQueueExecutor';
const POLL_INTERVAL = 500; // ms

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level](LOG_CAT, message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[${LOG_CAT}] ${message}`, ...data);
    }
}

/**
 * @typedef {object} ExecutorConfig
 * @property {DrainStrategy} [drainStrategy='mostDraining']
 * @property {number} [drainTaskId] - For SPECIFIC_TASK strategy
 * @property {boolean} [drainEnabled=true] - Whether to auto-drain when queue exhausted
 * @property {boolean} [autoReset=false] - Auto-click "Start the Journey Over, Wiser" on energy depletion
 */

export class JTAQueueExecutor {
    /** @type {import('../shared/actionQueue/actionQueue.js').ActionQueue} */
    #queue;

    /** @type {ExecutionSnapshot|null} */
    #snapshot = null;

    /** @type {{ publish: Function, subscribe: Function, unsubscribe: Function }} */
    #eventBus;

    /** @type {string} */
    #moduleName;

    /** @type {number|null} */
    #pollTimer = null;

    /** @type {boolean} */
    #waitingForCompletion = false;

    /** @type {number|null} Task ID we're currently waiting to complete */
    #activeTaskId = null;

    /** @type {boolean} */
    #draining = false;

    /** @type {ExecutorConfig} */
    #config;

    /** @type {Function[]} Unsubscribe callbacks */
    #unsubs = [];

    /** @type {Function|null} */
    #onQueueExhausted = null;

    /** @type {Function|null} */
    #onStatusChange = null;

    /** @type {Function|null} Called before creating a new snapshot on energy reset */
    #onBeforeReset = null;

    /** @type {number} Last known energy from polls/snapshots */
    #lastKnownEnergy = 0;

    /** @type {object|null} { skillId: fractionalLevel } */
    #lastSkillSnapshot = null;

    /** @type {string|null} Entry ID awaiting skill/energy fix from detailed state */
    #pendingSkillsEntryId = null;

    /** @type {string|null} Entry ID that started right after the pending one (needs energyBefore fix) */
    #pendingNextEntryId = null;

    /** @type {boolean} Waiting for initial state before first execution */
    #awaitingInitialState = false;

    /** @type {boolean} Events should be unsubscribed after pending skill data is processed */
    #deferredUnsubscribe = false;

    /** @type {boolean} Stop after the current entry completes (for step-one mode) */
    #stopAfterEntry = false;

    /**
     * @param {import('../shared/actionQueue/actionQueue.js').ActionQueue} queue
     * @param {{ publish: Function, subscribe: Function, unsubscribe: Function }} eventBus
     * @param {string} moduleName
     * @param {ExecutorConfig} [config]
     */
    constructor(queue, eventBus, moduleName, config = {}) {
        this.#queue = queue;
        this.#eventBus = eventBus;
        this.#moduleName = moduleName;
        this.#config = {
            drainStrategy: config.drainStrategy || DrainStrategy.MOST_DRAINING,
            drainTaskId: config.drainTaskId,
            drainEnabled: config.drainEnabled !== false,
            autoReset: config.autoReset || false,
        };
    }

    /**
     * Set a callback for when the queue is fully exhausted
     * @param {Function} cb
     */
    set onQueueExhausted(cb) { this.#onQueueExhausted = cb; }

    /**
     * Set a callback for when any status changes (for UI updates)
     * @param {Function} cb
     */
    set onStatusChange(cb) { this.#onStatusChange = cb; }

    /**
     * Set a callback called before creating a new snapshot on energy reset.
     * Use to regenerate strategy queues before the snapshot is taken.
     * @param {Function} cb
     */
    set onBeforeReset(cb) { this.#onBeforeReset = cb; }

    /**
     * Update drain strategy config
     * @param {Partial<ExecutorConfig>} config
     */
    updateConfig(config) {
        if (config.drainStrategy !== undefined) this.#config.drainStrategy = config.drainStrategy;
        if (config.drainTaskId !== undefined) this.#config.drainTaskId = config.drainTaskId;
        if (config.drainEnabled !== undefined) this.#config.drainEnabled = config.drainEnabled;
        if (config.autoReset !== undefined) this.#config.autoReset = config.autoReset;
    }

    /** @returns {ExecutorConfig} Current config (copy) */
    getConfig() {
        return { ...this.#config };
    }

    /**
     * Initialize tracking state with current game values.
     * Call before start() for accurate first-entry tracking.
     * @param {number} [energy]
     * @param {object} [skillSnapshot] - { skillId: fractionalLevel }
     */
    setTrackingState(energy, skillSnapshot) {
        if (energy !== undefined) this.#lastKnownEnergy = energy;
        if (skillSnapshot) this.#lastSkillSnapshot = skillSnapshot;
    }

    /** @returns {boolean} */
    get isRunning() {
        return this.#snapshot?.running ?? false;
    }

    /** @returns {boolean} */
    get isDraining() {
        return this.#draining;
    }

    /**
     * Get the current execution snapshot (current list), or null if not started
     * @returns {ExecutionSnapshot|null}
     */
    get snapshot() {
        return this.#snapshot;
    }

    /**
     * Start executing. Creates a snapshot from the queue if none exists (first start or after restart).
     * If a snapshot exists (resume after stop), continues from where it left off.
     */
    start() {
        if (this.#snapshot?.running) return;

        if (!this.#snapshot) {
            this.#snapshot = ExecutionSnapshot.fromQueue(this.#queue);
        }
        this.#snapshot.running = true;
        this.#draining = false;
        this.#pendingSkillsEntryId = null;
        this.#pendingNextEntryId = null;
        this.#deferredUnsubscribe = false;
        log('info', 'Starting queue execution');
        this.#subscribeEvents();

        if (this.#lastKnownEnergy > 0 && this.#lastSkillSnapshot) {
            // Already have valid tracking state (from setTrackingState or previous run)
            this.#awaitingInitialState = false;
            this.#executeNext();
        } else {
            // Request initial state before executing first entry
            this.#awaitingInitialState = true;
            this.#notifyStatusChange();
            this.#eventBus.publish('jta:requestDetailedState', {}, this.#moduleName);
        }
    }

    /**
     * Stop execution (pause). Snapshot is preserved for resume.
     */
    stop() {
        log('info', 'Stopping queue execution');
        if (this.#snapshot) this.#snapshot.running = false;
        this.#draining = false;
        this.#awaitingInitialState = false;
        this.#stopAfterEntry = false;
        this.#stopPolling();
        // Defer unsubscribe if we're still waiting for a detailedStateSnapshot response
        // for the last completed entry — #onDetailedState will clean up after processing
        if (this.#pendingSkillsEntryId) {
            this.#deferredUnsubscribe = true;
        } else {
            this.#unsubscribeEvents();
        }
        this.#waitingForCompletion = false;
        this.#activeTaskId = null;
    }

    /**
     * Reset and restart: creates a new snapshot from the current queue and starts from the beginning.
     */
    restart() {
        this.#pendingSkillsEntryId = null;
        this.#pendingNextEntryId = null;
        this.stop();
        this.#snapshot = null; // force new snapshot on next start()
        this.#lastKnownEnergy = 0;
        this.#lastSkillSnapshot = null;
        this.#notifyStatusChange();
        this.start();
    }

    /**
     * Execute just the next entry, then stop.
     */
    stepOne() {
        this.#stopAfterEntry = true;
        if (!this.#snapshot?.running) {
            this.start();
        } else {
            // Already running — flag is set, will stop after current entry completes
        }
    }

    /**
     * Clear the snapshot (e.g., when queue is cleared or reset from UI)
     */
    clearSnapshot() {
        this.#pendingSkillsEntryId = null;
        this.#pendingNextEntryId = null;
        this.stop();
        this.#snapshot = null;
        this.#lastKnownEnergy = 0;
        this.#lastSkillSnapshot = null;
        this.#notifyStatusChange();
    }

    /**
     * Append new queue entries to the existing snapshot (entries not already present).
     * Preserves completed/skipped state of existing entries.
     */
    appendNewEntries() {
        if (this.#snapshot) {
            this.#snapshot.appendFromQueue(this.#queue);
            this.#notifyStatusChange();
        }
    }

    /**
     * Resume execution after new entries were appended.
     * Called from within the execution chain (snapshot is still running).
     */
    resumeAfterAppend() {
        if (!this.#snapshot?.running) return;
        this.#draining = false;
        this.#executeNext();
    }

    /** Subscribe to iframe response events */
    #subscribeEvents() {
        this.#unsubscribeEvents();
        const sub = (event, handler) => {
            const unsub = this.#eventBus.subscribe(event, handler);
            this.#unsubs.push(typeof unsub === 'function' ? unsub : () => this.#eventBus.unsubscribe(event, handler));
        };
        sub('jta:taskClicked', (data) => this.#onTaskClicked(data));
        sub('jta:itemClicked', (data) => this.#onItemClicked(data));
        sub('jta:prestigeDone', (data) => this.#onPrestigeDone(data));
        sub('jta:taskStatus', (data) => this.#onTaskStatus(data));
        sub('jta:energyDepleted', (data) => this.#onEnergyDepleted(data));
        sub('jta:gameOverDismissed', (data) => this.#onGameOverDismissed(data));
        sub('jta:detailedStateSnapshot', (data) => this.#onDetailedState(data));
    }

    /** Unsubscribe from all events */
    #unsubscribeEvents() {
        for (const unsub of this.#unsubs) {
            try { unsub(); } catch (e) { /* ignore */ }
        }
        this.#unsubs = [];
    }

    /** Execute the next action in the snapshot */
    #executeNext() {
        if (!this.#snapshot?.running) return;

        const entry = this.#snapshot.currentEntry();
        if (!entry) {
            // Queue exhausted — start drain strategy
            this.#startDraining();
            return;
        }

        log('debug', `Executing: ${entry.label} (${entry.actionType}:${entry.actionId})`);
        this.#snapshot.updateStatus(entry.entryId, {
            state: ActionState.ACTIVE,
            energyBefore: this.#lastKnownEnergy,
            startTime: Date.now(),
        });
        this.#notifyStatusChange();

        switch (entry.actionType) {
            case JTAActionType.CLICK_TASK:
                this.#executeTask(entry);
                break;
            case JTAActionType.USE_ITEM:
                this.#executeItem(entry, false);
                break;
            case JTAActionType.USE_ALL_ITEMS:
                this.#executeItem(entry, true);
                break;
            case JTAActionType.PRESTIGE:
                this.#executePrestige(entry);
                break;
            default:
                log('warn', `Unknown action type: ${entry.actionType}`);
                this.#markFailedAndAdvance(entry, `Unknown action type: ${entry.actionType}`);
        }
    }

    /** Execute a clickTask action */
    #executeTask(entry) {
        this.#activeTaskId = entry.actionId;
        this.#waitingForCompletion = false;
        this.#eventBus.publish('jta:clickTask', { taskId: entry.actionId }, this.#moduleName);
    }

    /** Execute a useItem/useAllItems action */
    #executeItem(entry, useAll) {
        this.#eventBus.publish('jta:clickItem', { itemType: entry.actionId, useAll }, this.#moduleName);
    }

    /** Execute a prestige action */
    #executePrestige(entry) {
        this.#eventBus.publish('jta:doPrestige', {}, this.#moduleName);
    }

    /** Handle jta:taskClicked response */
    #onTaskClicked(data) {
        if (!this.#snapshot?.running) return;

        const entry = this.#snapshot.currentEntry();
        if (!entry || entry.actionType !== JTAActionType.CLICK_TASK) return;

        if (!data.success) {
            if (data.alreadyCompleted) {
                log('info', `Task ${data.taskId} already completed — skipping`);
                this.#markSkippedAndAdvance(entry, data.error);
            } else {
                log('warn', `clickTask failed: ${data.error}`);
                this.#markFailedAndAdvance(entry, data.error);
            }
            return;
        }

        // Task activated — start polling for completion
        this.#waitingForCompletion = true;
        this.#startPolling();
    }

    /** Handle jta:itemClicked response */
    #onItemClicked(data) {
        if (!this.#snapshot?.running) return;

        const entry = this.#snapshot.currentEntry();
        if (!entry) return;
        if (entry.actionType !== JTAActionType.USE_ITEM && entry.actionType !== JTAActionType.USE_ALL_ITEMS) return;

        // Items are immediate — mark loop completed and check loops
        this.#completeLoop(entry);
    }

    /** Handle jta:prestigeDone response */
    #onPrestigeDone(data) {
        if (!this.#snapshot?.running) return;

        const entry = this.#snapshot.currentEntry();
        if (!entry || entry.actionType !== JTAActionType.PRESTIGE) return;

        if (!data.success) {
            this.#markFailedAndAdvance(entry, data.error);
            return;
        }

        this.#completeLoop(entry);
    }

    /** Handle jta:taskStatus poll response */
    #onTaskStatus(data) {
        if (data.currentEnergy !== undefined) {
            this.#lastKnownEnergy = data.currentEnergy;
        }
        if (!this.#snapshot?.running || !this.#waitingForCompletion) {
            // Also handle drain task status
            if (this.#draining && data.activeTaskId === null) {
                // Drain task finished, start another
                this.#pickAndStartDrainTask(data);
            }
            return;
        }

        const entry = this.#snapshot.currentEntry();
        if (!entry) return;

        // Check if our task is no longer active (completed or cancelled)
        if (data.activeTaskId === null || data.activeTaskId !== this.#activeTaskId) {
            // Task completed (or was replaced)
            this.#waitingForCompletion = false;
            this.#stopPolling();
            this.#completeLoop(entry);
        }
    }

    /** Complete one loop of an entry, advance if all loops done */
    #completeLoop(entry) {
        const status = this.#snapshot.getStatus(entry.entryId);
        if (!status) return;

        const completed = (status.loopsCompleted || 0) + 1;
        this.#snapshot.updateStatus(entry.entryId, { loopsCompleted: completed });

        if (completed >= entry.loops) {
            // All loops done — record preliminary actuals (will be retroactively fixed by #onDetailedState)
            const now = Date.now();
            this.#snapshot.updateStatus(entry.entryId, {
                state: ActionState.COMPLETED,
                energyAfter: this.#lastKnownEnergy,
                actualEnergyCost: (status.energyBefore ?? this.#lastKnownEnergy) - this.#lastKnownEnergy,
                endTime: now,
                actualTimeMs: now - (status.startTime || now),
            });
            // Request detailed state for authoritative skill/energy data (async — fixes arrive in #onDetailedState)
            this.#pendingSkillsEntryId = entry.entryId;
            this.#eventBus.publish('jta:requestDetailedState', {}, this.#moduleName);
            this.#snapshot.advance();
            // Track the entry that's about to start so we can fix its energyBefore retroactively
            this.#pendingNextEntryId = this.#snapshot.currentEntry()?.entryId || null;
            this.#notifyStatusChange();
            // Step-one mode: stop after completing this entry
            if (this.#stopAfterEntry) {
                this.#stopAfterEntry = false;
                this.stop();
                this.#notifyStatusChange();
                return;
            }
            this.#executeNext();
        } else {
            // More loops needed — re-execute same entry
            this.#notifyStatusChange();
            this.#executeCurrentAgain(entry);
        }
    }

    /** Re-execute the current entry for another loop */
    #executeCurrentAgain(entry) {
        if (!this.#snapshot?.running) return;
        switch (entry.actionType) {
            case JTAActionType.CLICK_TASK:
                this.#executeTask(entry);
                break;
            case JTAActionType.USE_ITEM:
                this.#executeItem(entry, false);
                break;
            case JTAActionType.USE_ALL_ITEMS:
                this.#executeItem(entry, true);
                break;
            case JTAActionType.PRESTIGE:
                this.#executePrestige(entry);
                break;
        }
    }

    /** Mark entry as failed and advance */
    #markFailedAndAdvance(entry, error) {
        const status = this.#snapshot.getStatus(entry.entryId);
        const now = Date.now();
        this.#snapshot.updateStatus(entry.entryId, {
            state: ActionState.FAILED,
            error,
            energyAfter: this.#lastKnownEnergy,
            actualEnergyCost: (status?.energyBefore ?? this.#lastKnownEnergy) - this.#lastKnownEnergy,
            endTime: now,
            actualTimeMs: now - (status?.startTime || now),
        });
        this.#stopPolling();
        this.#waitingForCompletion = false;
        this.#snapshot.advance();
        this.#notifyStatusChange();
        if (this.#stopAfterEntry) {
            this.#stopAfterEntry = false;
            this.stop();
            this.#notifyStatusChange();
            return;
        }
        this.#executeNext();
    }

    /** Mark entry as skipped (already completed) and advance */
    #markSkippedAndAdvance(entry, reason) {
        const now = Date.now();
        this.#snapshot.updateStatus(entry.entryId, {
            state: ActionState.SKIPPED,
            error: reason,
            energyAfter: this.#lastKnownEnergy,
            actualEnergyCost: 0,
            endTime: now,
            actualTimeMs: 0,
        });
        this.#stopPolling();
        this.#waitingForCompletion = false;
        this.#snapshot.advance();
        this.#notifyStatusChange();
        if (this.#stopAfterEntry) {
            this.#stopAfterEntry = false;
            this.stop();
            this.#notifyStatusChange();
            return;
        }
        this.#executeNext();
    }

    /** Start polling for task completion */
    #startPolling() {
        this.#stopPolling();
        this.#pollTimer = setInterval(() => {
            this.#eventBus.publish('jta:requestTaskStatus', {}, this.#moduleName);
        }, POLL_INTERVAL);
    }

    /** Stop polling */
    #stopPolling() {
        if (this.#pollTimer !== null) {
            clearInterval(this.#pollTimer);
            this.#pollTimer = null;
        }
    }

    /** Handle energy depletion (game-over overlay appeared) */
    #onEnergyDepleted(data) {
        if (!this.#snapshot?.running) return;
        if (!this.#config.autoReset) {
            log('info', 'Energy depleted — autoReset disabled, pausing');
            return;
        }
        log('info', 'Energy depleted — auto-dismissing game-over');
        this.#stopPolling();
        this.#waitingForCompletion = false;
        this.#draining = false;
        this.#eventBus.publish('jta:dismissGameOver', {}, this.#moduleName);
    }

    /** Handle game-over dismissed (energy reset performed) */
    #onGameOverDismissed(data) {
        if (!this.#snapshot?.running) return;
        if (!data.success) {
            log('warn', `dismissGameOver failed: ${data.error}`);
            return;
        }
        log('info', 'Game-over dismissed, creating fresh snapshot from queue');
        // Allow strategy regeneration before snapshotting
        if (this.#onBeforeReset) this.#onBeforeReset();
        // Create new snapshot from current queue so Next list edits take effect
        this.#snapshot = ExecutionSnapshot.fromQueue(this.#queue);
        this.#snapshot.running = true;
        this.#draining = false;
        this.#pendingSkillsEntryId = null;
        this.#pendingNextEntryId = null;
        this.#lastKnownEnergy = 0;
        this.#lastSkillSnapshot = null;

        // Step-one mode: stop after the energy reset instead of continuing
        if (this.#stopAfterEntry) {
            this.#stopAfterEntry = false;
            this.stop();
            this.#notifyStatusChange();
            return;
        }

        // Request fresh state before restarting execution
        this.#awaitingInitialState = true;
        this.#notifyStatusChange();
        this.#eventBus.publish('jta:requestDetailedState', {}, this.#moduleName);
    }

    /** Handle detailed state snapshot for skill/energy tracking during execution */
    #onDetailedState(data) {
        if (!data?.state) return;
        // Allow processing if snapshot exists and either running OR has pending skill data
        // (executor may have been stopped by onQueueExhausted before this async response arrived)
        if (!this.#snapshot) return;
        if (!this.#snapshot.running && !this.#pendingSkillsEntryId && !this.#awaitingInitialState) return;

        const skillSnap = snapshotSkillsFromGameState(data.state);
        if (data.state.currentEnergy !== undefined) {
            this.#lastKnownEnergy = data.state.currentEnergy;
        }

        // Handle initial state: begin execution now that we have tracking data
        if (this.#awaitingInitialState) {
            this.#awaitingInitialState = false;
            this.#lastSkillSnapshot = skillSnap;
            log('info', `Initial state received (energy=${this.#lastKnownEnergy}), starting execution`);
            this.#executeNext();
            return;
        }

        // Retroactively fix the just-completed entry's actuals from authoritative state.
        // This is critical for items (instant, no poll between them) and also improves
        // task accuracy since the snapshot is taken right at the entry boundary.
        if (this.#pendingSkillsEntryId) {
            const entryId = this.#pendingSkillsEntryId;
            const nextEntryId = this.#pendingNextEntryId;
            this.#pendingSkillsEntryId = null;
            this.#pendingNextEntryId = null;

            const status = this.#snapshot.getStatus(entryId);
            const update = {};

            // Skill gains: use consecutive "after" snapshots as baseline
            const before = this.#lastSkillSnapshot || {};
            update.actualSkillGains = computeSkillGainsBetween(before, skillSnap);

            // Energy: retroactively fix energyAfter and actualEnergyCost from authoritative state.
            // The detailed snapshot is read in the iframe BEFORE the next entry starts,
            // so this energy value is the true post-entry energy.
            if (data.state.currentEnergy !== undefined) {
                update.energyAfter = data.state.currentEnergy;
                update.actualEnergyCost = (status?.energyBefore ?? data.state.currentEnergy) - data.state.currentEnergy;

                // Also fix the next entry's energyBefore — it was set with stale #lastKnownEnergy
                // but the authoritative energy is the true starting point
                if (nextEntryId) {
                    this.#snapshot.updateStatus(nextEntryId, {
                        energyBefore: data.state.currentEnergy,
                    });
                }
            }

            this.#snapshot.updateStatus(entryId, update);
            this.#notifyStatusChange();

            // If stop() was called while we had pending data, finish cleanup now
            if (this.#deferredUnsubscribe) {
                this.#deferredUnsubscribe = false;
                this.#unsubscribeEvents();
            }
        }

        this.#lastSkillSnapshot = skillSnap;
    }

    /** Start the energy drain strategy */
    #startDraining() {
        if (!this.#config.drainEnabled) {
            log('info', 'Queue exhausted, drain disabled — idling');
            this.#notifyStatusChange();
            if (this.#onQueueExhausted) this.#onQueueExhausted();
            return;
        }
        log('info', `Queue exhausted, starting drain strategy: ${this.#config.drainStrategy}`);
        this.#draining = true;
        this.#notifyStatusChange();
        if (this.#onQueueExhausted) this.#onQueueExhausted();

        // Request task status to pick a drain task
        this.#startPolling();
        this.#eventBus.publish('jta:requestTaskStatus', {}, this.#moduleName);
    }

    /** Pick a drain task and send clickTask */
    #pickAndStartDrainTask(statusData) {
        if (!this.#draining || !this.#snapshot?.running) return;

        const taskId = pickDrainTask(
            this.#config.drainStrategy,
            statusData.tasks,
            this.#config.drainTaskId
        );

        if (taskId !== null) {
            this.#activeTaskId = taskId;
            this.#eventBus.publish('jta:clickTask', { taskId }, this.#moduleName);
        }
    }

    /** Notify status change callback */
    #notifyStatusChange() {
        if (this.#onStatusChange) this.#onStatusChange();
    }
}

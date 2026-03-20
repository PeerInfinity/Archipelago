// JTAQueueEngine - headless engine for JTA action queue execution, strategy, and predictions
// Owns all queue state and logic; UI panels interact through the public API and callbacks.

import { ActionQueue } from '../shared/actionQueue/actionQueue.js';
import { LoadoutManager } from '../shared/actionQueue/loadoutManager.js';
import { JTAQueueExecutor } from './jtaQueueExecutor.js';
import { buildActionCatalog } from './jtaActionDefs.js';
import { convertToSimState, predictQueue, snapshotSkillsFromGameState } from './jtaQueuePredictor.js';
import { StrategyType, buildQueueForStrategy } from './jtaQueueBuilder.js';

const LOG_CAT = 'jtaQueueEngine';

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level](LOG_CAT, message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[${LOG_CAT}] ${message}`, ...data);
    }
}

const DEFAULT_SETTINGS = Object.freeze({
    drainEnabled: true,
    drainStrategy: 'mostDraining',
    autoReset: false,
    addToTop: false,
    immediateMode: false,
    showActuals: false,
    showComparison: false,
    strategyLevel: 'pushCollect',
    verboseLog: false,
});

export class JTAQueueEngine {
    // --- State ---
    /** @type {ActionQueue|null} */
    #queue = null;

    /** @type {LoadoutManager|null} */
    #loadoutManager = null;

    /** @type {JTAQueueExecutor|null} */
    #executor = null;

    /** @type {object|null} */
    #catalog = null;

    /** @type {object|null} */
    #lastSimState = null;

    /** @type {object|null} */
    #lastGameState = null;

    /** @type {Map<string,object>|null} */
    #predictions = null;

    /** @type {number|null} */
    #predictionDebounceTimer = null;

    /** @type {number} */
    #loadoutRunCount = 0;

    /** @type {object|null} */
    #lastReasoning = null;

    /** @type {{ publish: Function, subscribe: Function, unsubscribe: Function }} */
    #eventBus;

    /** @type {string} */
    #moduleName;

    /** @type {Function[]} */
    #unsubs = [];

    /** @type {object} */
    #settings;

    // --- Callbacks ---
    /** @type {Function|null} Fired when executor/snapshot status changes */
    #onStatusChange = null;

    /** @type {Function|null} Fired with a string status message for the UI */
    #onStatusMessage = null;

    /** @type {Function|null} Fired when predictions are recalculated */
    #onPredictionsChanged = null;

    /** @type {Function|null} Fired when the action catalog is (re)built */
    #onCatalogChanged = null;

    /** @type {Function|null} Fired when strategy reasoning data changes */
    #onReasoningChanged = null;

    /** @type {Function|null} Fired when loadout list or active loadout changes */
    #onLoadoutsChanged = null;

    // =====================================================================
    // Construction / Lifecycle
    // =====================================================================

    /**
     * @param {{ publish: Function, subscribe: Function, unsubscribe: Function }} eventBus
     * @param {string} moduleName
     */
    constructor(eventBus, moduleName) {
        this.#eventBus = eventBus;
        this.#moduleName = moduleName;
        this.#settings = { ...DEFAULT_SETTINGS };
    }

    /** Create queue, loadout manager, load settings, subscribe to game events. */
    initialize() {
        this.#queue = new ActionQueue();
        this.#loadoutManager = new LoadoutManager('jta-action-loadouts');
        this.#ensureStrategyLoadouts();
        this.#loadoutManager.loadActive(this.#queue);
        this.#loadSettings();
        this.#subscribeGameEvents();

        // Request game defs in case iframe is already connected
        setTimeout(() => {
            this.#eventBus.publish('jta:requestGameDefs', {}, this.#moduleName);
        }, 1000);
    }

    /** Tear down: unsubscribe events and stop executor. */
    destroy() {
        for (const unsub of this.#unsubs) {
            try { unsub(); } catch (e) { /* ignore */ }
        }
        this.#unsubs = [];
        if (this.#executor) this.#executor.stop();
        if (this.#predictionDebounceTimer) clearTimeout(this.#predictionDebounceTimer);
    }

    // =====================================================================
    // Read-Only Accessors
    // =====================================================================

    /** @returns {ActionQueue|null} */
    get queue() { return this.#queue; }

    /** @returns {LoadoutManager|null} */
    get loadoutManager() { return this.#loadoutManager; }

    /** @returns {JTAQueueExecutor|null} */
    get executor() { return this.#executor; }

    /** @returns {object|null} */
    get catalog() { return this.#catalog; }

    /** @returns {Map<string,object>|null} */
    get predictions() { return this.#predictions; }

    /** @returns {object|null} */
    get lastReasoning() { return this.#lastReasoning; }

    /** @returns {object|null} */
    get lastSimState() { return this.#lastSimState; }

    /** @returns {object|null} */
    get lastGameState() { return this.#lastGameState; }

    /** @returns {object} */
    get settings() { return { ...this.#settings }; }

    /** @returns {number} */
    get loadoutRunCount() { return this.#loadoutRunCount; }

    // =====================================================================
    // Callback Setters
    // =====================================================================

    set onStatusChange(cb) { this.#onStatusChange = cb; }
    set onStatusMessage(cb) { this.#onStatusMessage = cb; }
    set onPredictionsChanged(cb) { this.#onPredictionsChanged = cb; }
    set onCatalogChanged(cb) { this.#onCatalogChanged = cb; }
    set onReasoningChanged(cb) { this.#onReasoningChanged = cb; }
    set onLoadoutsChanged(cb) { this.#onLoadoutsChanged = cb; }

    // =====================================================================
    // Execution Commands
    // =====================================================================

    /** Start (or resume) queue execution. */
    start() {
        const isImmediate = this.#isImmediateMode();

        this.#ensureExecutor(isImmediate);

        if (this.#executor) {
            if (isImmediate) {
                this.#executor.updateConfig({ drainEnabled: false, autoReset: false });
                this.#executor.clearSnapshot();
            } else {
                if (this.regenerateStrategyQueue()) {
                    this.#executor.clearSnapshot();
                }
            }
            this.#initTrackingState();
            this.#executor.start();

            if (isImmediate) {
                this.#emitStatusMessage('Running (immediate)...');
            } else {
                const isStrategy = this.#loadoutManager?.isStrategyBacked(this.#loadoutManager.activeIndex);
                this.#emitStatusMessage(isStrategy ? `Running [${this.#settings.strategyLevel}]...` : 'Running...');
            }
            this.#notifyStatusChange();
        }
    }

    /** Stop (pause) execution. */
    stop() {
        if (this.#executor) {
            this.#executor.stop();
            this.#emitStatusMessage('Stopped');
            this.#notifyStatusChange();
        }
    }

    /** Execute the next queue entry, then stop. */
    stepOne() {
        const isImmediate = this.#isImmediateMode();

        this.#ensureExecutor(isImmediate);

        if (this.#executor) {
            if (!this.#executor.snapshot) {
                if (!isImmediate) {
                    if (this.regenerateStrategyQueue()) {
                        this.#executor.clearSnapshot();
                    }
                }
                this.#initTrackingState();
            }
            if (isImmediate) {
                this.#executor.updateConfig({ drainEnabled: false, autoReset: false });
            }
            this.#executor.stepOne();
            this.#emitStatusMessage('Stepping...');
            this.#notifyStatusChange();
        }
    }

    /** Drain all energy via a temporary executor, then reset. */
    drain() {
        if (this.#executor) this.#executor.stop();

        const emptyQueue = new ActionQueue();
        const drainSettings = { ...this.#settings, drainEnabled: true, autoReset: true };
        const drainExecutor = new JTAQueueExecutor(emptyQueue, this.#eventBus, this.#moduleName, drainSettings);
        drainExecutor.onStatusChange = () => this.#notifyStatusChange();

        let drainResetOccurred = false;
        drainExecutor.onQueueExhausted = () => {
            if (drainResetOccurred) {
                drainExecutor.stop();
                this.#executor = null;
                this.#emitStatusMessage('Drained and reset');
                this.#notifyStatusChange();
                this.#requestPredictionState();
                return;
            }
            drainResetOccurred = true;
            this.#emitStatusMessage('Draining energy...');
        };

        this.#executor = drainExecutor;
        drainExecutor.start();
        this.#emitStatusMessage('Draining...');
        this.#notifyStatusChange();
    }

    /** Clear the execution snapshot (reset progress without clearing queue). */
    reset() {
        this.#loadoutRunCount = 0;
        if (this.#executor) {
            this.#executor.clearSnapshot();
            this.#emitStatusMessage('Reset');
            this.#notifyStatusChange();
        }
    }

    /** Clear both the execution snapshot and the queue. */
    clear() {
        if (this.#executor) this.#executor.clearSnapshot();
        if (this.#queue) {
            this.#queue.clear();
            this.#emitStatusMessage('Cleared');
            this.#notifyStatusChange();
            this.saveActiveLoadout();
        }
    }

    /** Undo the last queue mutation. */
    undo() {
        if (this.#queue && this.#queue.undoLast()) {
            this.#emitStatusMessage('Undone');
            this.#notifyStatusChange();
            this.saveActiveLoadout();
        }
    }

    /**
     * If immediate mode is active and the executor is idle, start execution
     * so newly-added entries run immediately.
     */
    maybeExecuteImmediate() {
        if (!this.#settings.immediateMode) return;
        if (!this.#queue) return;
        if (this.#loadoutManager?.isStrategyBacked(this.#loadoutManager.activeIndex)) return;

        this.#ensureExecutor(true);
        if (!this.#executor) return;

        // If already running, new entries will be picked up by #handleQueueExhausted
        if (this.#executor.isRunning) return;

        this.#executor.updateConfig({ drainEnabled: false, autoReset: false });

        // Append new entries to existing snapshot (preserves completed state)
        if (this.#executor.snapshot) {
            this.#executor.appendNewEntries();
        }

        this.#initTrackingState();
        this.#executor.start();
        this.#emitStatusMessage('Running (immediate)...');
        this.#notifyStatusChange();
    }

    // =====================================================================
    // Settings
    // =====================================================================

    /**
     * Merge partial settings, persist to localStorage, and update executor config.
     * @param {object} partial
     */
    updateSettings(partial) {
        Object.assign(this.#settings, partial);
        this.#persistSettings();
        if (this.#executor) {
            this.#executor.updateConfig({
                drainEnabled: this.#settings.drainEnabled,
                drainStrategy: this.#settings.drainStrategy,
                autoReset: this.#settings.autoReset,
            });
        }
    }

    // =====================================================================
    // Loadout Management
    // =====================================================================

    /** Save the current queue into the active loadout. */
    saveActiveLoadout() {
        if (this.#loadoutManager && this.#queue) {
            this.#loadoutManager.saveActive(this.#queue);
        }
    }

    /**
     * Switch to a different loadout by index.
     * Saves the current loadout first, clears executor snapshot, switches, and regenerates if needed.
     * @param {number} index
     */
    switchLoadout(index) {
        if (!this.#loadoutManager || !this.#queue) return;
        this.#loadoutManager.saveActive(this.#queue);
        if (this.#executor) this.#executor.clearSnapshot();
        this.#loadoutManager.switchTo(index, this.#queue);
        if (!this.regenerateStrategyQueue()) {
            this.#lastReasoning = null;
            if (this.#onReasoningChanged) this.#onReasoningChanged();
        }
        this.#notifyStatusChange();
        if (this.#onLoadoutsChanged) this.#onLoadoutsChanged();
        this.schedulePredictions();
    }

    /**
     * Create a new loadout with the given name, using the current queue.
     * @param {string} name
     */
    createLoadout(name) {
        if (!this.#loadoutManager || !this.#queue) return;
        this.#loadoutManager.saveActive(this.#queue);
        this.#loadoutManager.create(name, this.#queue);
        if (this.#executor) this.#executor.clearSnapshot();
        this.#notifyStatusChange();
        if (this.#onLoadoutsChanged) this.#onLoadoutsChanged();
    }

    /**
     * Rename a loadout.
     * @param {number} index
     * @param {string} name
     */
    renameLoadout(index, name) {
        if (!this.#loadoutManager) return;
        this.#loadoutManager.rename(index, name);
        if (this.#onLoadoutsChanged) this.#onLoadoutsChanged();
    }

    /**
     * Delete a loadout by index.
     * @param {number} index
     */
    deleteLoadout(index) {
        if (!this.#loadoutManager || !this.#queue) return;
        if (this.#loadoutManager.count <= 1) return;
        this.#loadoutManager.delete(index);
        this.#loadoutManager.loadActive(this.#queue);
        if (this.#executor) this.#executor.clearSnapshot();
        this.#notifyStatusChange();
        if (this.#onLoadoutsChanged) this.#onLoadoutsChanged();
    }

    /**
     * Update sequencing for a loadout.
     * @param {number} index
     * @param {{ repeatCount?: number, nextLoadout?: number }} config
     */
    updateSequencing(index, config) {
        if (!this.#loadoutManager) return;
        this.#loadoutManager.updateSequencing(index, config);
    }

    // =====================================================================
    // Strategy Queue Regeneration
    // =====================================================================

    /**
     * If the active loadout is strategy-backed, regenerate its queue entries from current game state.
     * @returns {boolean} true if regeneration occurred
     */
    regenerateStrategyQueue() {
        if (!this.#loadoutManager || !this.#queue || !this.#lastSimState) return false;
        const strategy = this.#loadoutManager.getStrategy(this.#loadoutManager.activeIndex);
        if (!strategy) return false;

        const result = buildQueueForStrategy(this.#lastSimState, strategy, this.#settings.strategyLevel);
        this.#queue.clear();
        for (const entry of result.entries) this.#queue.add(entry);
        this.#loadoutManager.saveActive(this.#queue);
        this.#lastReasoning = result.reasoning;
        if (this.#onReasoningChanged) this.#onReasoningChanged();
        log('info', `Regenerated strategy queue: ${this.#settings.strategyLevel} (${result.entries.length} entries)`);
        return true;
    }

    // =====================================================================
    // Predictions
    // =====================================================================

    /** Schedule a prediction update (debounced). */
    schedulePredictions() {
        if (this.#predictionDebounceTimer) clearTimeout(this.#predictionDebounceTimer);
        this.#predictionDebounceTimer = setTimeout(() => {
            this.#predictionDebounceTimer = null;
            this.#requestPredictionState();
        }, 250);
    }

    // =====================================================================
    // Stop-After Flag
    // =====================================================================

    /** @type {boolean} */
    #stopAfter = false;

    /** @returns {boolean} */
    get stopAfter() { return this.#stopAfter; }
    set stopAfter(value) { this.#stopAfter = !!value; }

    // =====================================================================
    // Internal: Settings Persistence
    // =====================================================================

    #loadSettings() {
        try {
            const saved = JSON.parse(localStorage.getItem('jta-aq-settings') || '{}');
            if (saved.drainEnabled === false) this.#settings.drainEnabled = false;
            if (saved.autoReset === true) this.#settings.autoReset = true;
            if (saved.addToTop === true) this.#settings.addToTop = true;
            if (saved.immediateMode === true) this.#settings.immediateMode = true;
            if (saved.showActuals === true) this.#settings.showActuals = true;
            if (saved.showComparison === true) this.#settings.showComparison = true;
            if (saved.drainStrategy) this.#settings.drainStrategy = saved.drainStrategy;
            if (saved.strategyLevel) this.#settings.strategyLevel = saved.strategyLevel;
            if (saved.verboseLog === true) this.#settings.verboseLog = true;
        } catch (e) { /* ignore */ }
    }

    #persistSettings() {
        try {
            localStorage.setItem('jta-aq-settings', JSON.stringify(this.#settings));
        } catch (e) { /* ignore */ }
    }

    // =====================================================================
    // Internal: Executor Management
    // =====================================================================

    #isImmediateMode() {
        return this.#settings.immediateMode &&
            !this.#loadoutManager?.isStrategyBacked(this.#loadoutManager.activeIndex);
    }

    #ensureExecutor(isImmediate) {
        if (this.#executor) return;
        if (!this.#queue) return;

        const config = isImmediate
            ? { ...this.#settings, drainEnabled: false, autoReset: false }
            : this.#settings;

        this.#executor = new JTAQueueExecutor(this.#queue, this.#eventBus, this.#moduleName, config);
        this.#executor.onStatusChange = () => this.#notifyStatusChange();
        this.#executor.onQueueExhausted = () => this.#handleQueueExhausted();
        this.#executor.onBeforeReset = () => this.regenerateStrategyQueue();
    }

    #initTrackingState() {
        if (this.#lastSimState && this.#executor) {
            this.#executor.setTrackingState(
                this.#lastSimState.currentEnergy,
                this.#lastGameState ? snapshotSkillsFromGameState(this.#lastGameState) : null
            );
        }
    }

    // =====================================================================
    // Internal: Queue Exhaustion Handler
    // =====================================================================

    #handleQueueExhausted() {
        // "Stop after" overrides all continuation logic
        if (this.#stopAfter) {
            this.#stopAfter = false;
            if (this.#executor) this.#executor.stop();
            this.#emitStatusMessage('Queue finished (stopped)');
            this.#notifyStatusChange();
            return;
        }

        // Immediate mode: check if new entries were added while executing
        if (this.#isImmediateMode()) {
            const snapshotCount = this.#executor?.snapshot?.length || 0;
            const queueCount = this.#queue ? this.#queue.getEntries().length : 0;
            if (queueCount > snapshotCount) {
                if (this.#executor) {
                    this.#executor.appendNewEntries();
                    this.#executor.resumeAfterAppend();
                }
                this.#emitStatusMessage('Running (immediate)...');
                this.#notifyStatusChange();
                return;
            }
            if (this.#executor) this.#executor.stop();
            this.#emitStatusMessage('Ready (immediate)');
            this.#notifyStatusChange();
            return;
        }

        if (!this.#loadoutManager) {
            this.#emitStatusMessage('Queue finished');
            return;
        }

        this.#loadoutRunCount = (this.#loadoutRunCount || 0) + 1;
        const seq = this.#loadoutManager.getSequencing(this.#loadoutManager.activeIndex);

        // Check if we should repeat this loadout
        if (seq.repeatCount === 0 || this.#loadoutRunCount < seq.repeatCount) {
            if (this.regenerateStrategyQueue()) {
                if (this.#executor) this.#executor.clearSnapshot();
                if (this.#executor) this.#executor.start();
            } else {
                if (this.#executor) this.#executor.restart();
            }
            const isStrategy = this.#loadoutManager.isStrategyBacked(this.#loadoutManager.activeIndex);
            const levelLabel = this.#settings.strategyLevel;
            this.#emitStatusMessage(
                `Running${isStrategy ? ` [${levelLabel}]` : ''}... (repeat ${this.#loadoutRunCount + 1}${seq.repeatCount > 0 ? '/' + seq.repeatCount : ''})`
            );
            return;
        }

        // Check if we should switch to next loadout
        if (seq.nextLoadout >= 0 && seq.nextLoadout < this.#loadoutManager.count) {
            this.#loadoutRunCount = 0;
            this.#loadoutManager.saveActive(this.#queue);
            if (this.#executor) this.#executor.clearSnapshot();
            this.#loadoutManager.switchTo(seq.nextLoadout, this.#queue);
            this.regenerateStrategyQueue();
            if (this.#onLoadoutsChanged) this.#onLoadoutsChanged();
            this.#notifyStatusChange();

            if (this.#executor) this.#executor.start();
            this.#emitStatusMessage(`Running ${this.#loadoutManager.activeName}...`);
            return;
        }

        // No sequencing — fall through to drain or stop
        this.#emitStatusMessage(this.#settings.drainEnabled ? 'Draining energy...' : 'Queue finished');
    }

    // =====================================================================
    // Internal: EventBus Subscriptions
    // =====================================================================

    #subscribeGameEvents() {
        const sub = (event, handler) => {
            const unsub = this.#eventBus.subscribe(event, handler);
            this.#unsubs.push(typeof unsub === 'function' ? unsub : () => this.#eventBus.unsubscribe(event, handler));
        };

        sub('jta:gameDefsSnapshot', (data) => this.#handleGameDefs(data));
        sub('jta:detailedStateSnapshot', (data) => this.#handleDetailedState(data));
        sub('iframe:connected', () => this.#handleConnected());
    }

    #handleGameDefs(data) {
        if (!data || !data.zones) return;
        log('info', `Received game definitions: ${data.zones.length} zones`);

        this.#catalog = buildActionCatalog(data.zones, data.items || null);
        if (this.#onCatalogChanged) this.#onCatalogChanged(this.#catalog);

        this.#requestPredictionState();
    }

    #handleDetailedState(data) {
        if (!data || !data.state) return;
        this.#lastGameState = data.state;
        this.#lastSimState = convertToSimState(data.state);
        this.#runPredictions();
    }

    #handleConnected() {
        setTimeout(() => {
            this.#eventBus.publish('jta:requestGameDefs', {}, this.#moduleName);
        }, 500);
    }

    // =====================================================================
    // Internal: Predictions
    // =====================================================================

    #requestPredictionState() {
        this.#eventBus.publish('jta:requestDetailedState', {}, this.#moduleName);
    }

    #runPredictions() {
        if (!this.#lastSimState || !this.#queue) {
            this.#predictions = null;
        } else {
            try {
                this.#predictions = predictQueue(this.#queue, this.#lastSimState);
            } catch (e) {
                log('warn', 'Prediction error:', e);
                this.#predictions = null;
            }
        }
        if (this.#onPredictionsChanged) this.#onPredictionsChanged(this.#predictions);
    }

    // =====================================================================
    // Internal: Strategy Loadout Setup
    // =====================================================================

    #ensureStrategyLoadouts() {
        if (!this.#loadoutManager) return;
        const existing = this.#loadoutManager.getLoadouts();
        const existingNames = new Set(existing.map(l => l.name));

        // Remove obsolete per-strategy loadouts from earlier versions
        const obsolete = ['[Push]', '[Collect]', '[Grind XP]'];
        for (let i = existing.length - 1; i >= 0; i--) {
            if (obsolete.includes(existing[i].name)) {
                this.#loadoutManager.delete(i);
            }
        }

        // Ensure the single [Auto] strategy loadout exists
        if (!existingNames.has('[Auto]')) {
            this.#loadoutManager.create('[Auto]', null, {
                strategy: { type: StrategyType.AUTO },
                repeatCount: 0,
                nextLoadout: -1,
            });
        }

        // Clean up: only [Auto] should have a strategy — strip stray strategies
        const cleaned = this.#loadoutManager.getLoadouts();
        for (let i = 0; i < cleaned.length; i++) {
            if (cleaned[i].name !== '[Auto]' && this.#loadoutManager.isStrategyBacked(i)) {
                this.#loadoutManager.setStrategy(i, null);
            }
        }
    }

    // =====================================================================
    // Internal: Notification Helpers
    // =====================================================================

    #notifyStatusChange() {
        if (this.#onStatusChange) this.#onStatusChange();
    }

    #emitStatusMessage(message) {
        if (this.#onStatusMessage) this.#onStatusMessage(message);
    }
}

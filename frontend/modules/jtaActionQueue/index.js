// jtaActionQueue module — UI panel for JTA action queue
// All state and logic lives in the jtaQueueEngine module; this is a pure UI shell.
import { JTAQueuePanelUI } from './jtaQueuePanelUI.js';
import { JTAActionsPanelUI } from './jtaActionsPanelUI.js';
import { getEngine, createQueueEntry } from '../jtaQueueEngine/index.js';

// --- Module Info ---
export const moduleInfo = {
    name: 'jtaActionQueue',
    title: 'JTA Action Queue',
    componentType: 'jtaActionQueue',
    icon: '',
    column: 2,
    description: 'Queue and execute actions for Journey to Ascension.',
};

function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('jtaActionQueue', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[jtaActionQueue] ${message}`, ...data);
    }
}

/** Format energy value for display in reasoning log */
function fmtE(value) {
    if (value === null || value === undefined) return '—';
    if (Math.abs(value) >= 1e6) return (value / 1e6).toFixed(1) + 'M';
    if (Math.abs(value) >= 1e3) return (value / 1e3).toFixed(1) + 'K';
    return Math.round(value).toLocaleString();
}

export async function register(registrationApi) {
    registrationApi.registerPanelComponent('jtaActionQueue', JTAActionQueuePanel);
}

export async function initialize(mId, priorityIndex, initializationApi) {
    // Nothing to do — all state lives in jtaQueueEngine
    log('info', `[${mId}] Initialized (UI only).`);
}

/**
 * Panel component for Golden Layout.
 * Pure UI: delegates all state and logic to the engine.
 */
class JTAActionQueuePanel {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        this.rootElement = null;
        this._queuePanelUI = null;
        this._actionsPanelUI = null;
    }

    getRootElement() {
        if (!this.rootElement) {
            this._createRootElement();
            this._wireEngine();
        }
        return this.rootElement;
    }

    _createRootElement() {
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'jtaActionQueue-panel';
        this.rootElement.style.cssText = 'display: flex; flex-direction: column; height: 100%; overflow: auto; background: #1e1e1e; color: #cccccc; padding: 8px; gap: 8px; box-sizing: border-box;';
        this.rootElement.innerHTML = `
            <style>
                .jtaActionQueue-panel button {
                    background: #3a3a3a;
                    color: #ccc;
                    border: 1px solid #555;
                    border-radius: 3px;
                    padding: 3px 8px;
                    cursor: pointer;
                }
                .jtaActionQueue-panel button:hover {
                    background: #4a4a4a;
                    border-color: #777;
                }
                .jtaActionQueue-panel button:active {
                    background: #333;
                }

                /* Queue entries */
                .aq-entry {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 3px 4px;
                    border: 1px solid transparent;
                    border-radius: 3px;
                    cursor: grab;
                    transition: background-color 0.1s;
                    font-size: 1em;
                }
                .aq-entry:hover {
                    background: rgba(255, 255, 255, 0.05);
                }
                .aq-entry-index {
                    min-width: 20px;
                    text-align: right;
                    opacity: 0.5;
                    font-size: 0.8em;
                    font-family: monospace;
                }
                .aq-col-zone {
                    min-width: 16px;
                    text-align: right;
                    opacity: 0.5;
                    font-size: 0.8em;
                    font-family: monospace;
                }
                .aq-col-name {
                    width: 14ch;
                    min-width: 14ch;
                    max-width: 14ch;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    font-family: monospace;
                    font-size: 0.85em;
                }
                .aq-entry-label {
                    flex: 1;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .aq-entry-group {
                    font-size: 0.75em;
                    opacity: 0.5;
                    max-width: 80px;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }
                .aq-entry-state {
                    font-size: 0.7em;
                    opacity: 0.6;
                    min-width: 50px;
                    text-align: center;
                }

                /* Entry action buttons */
                .aq-entry-buttons {
                    display: flex;
                    gap: 1px;
                    flex-shrink: 0;
                }
                .aq-entry-buttons .aq-btn {
                    padding: 1px 4px;
                    font-size: 0.75em;
                    min-width: 20px;
                    line-height: 1.2;
                }

                /* Entry states */
                .aq-current {
                    border-color: #5a9;
                    background: rgba(85, 170, 153, 0.15);
                }
                .aq-disabled {
                    opacity: 0.4;
                }
                .aq-disabled .aq-entry-label {
                    text-decoration: line-through;
                }
                .aq-state-completed .aq-entry-state {
                    color: #5a5;
                }
                .aq-state-failed .aq-entry-state {
                    color: #d55;
                }
                .aq-state-active .aq-entry-state {
                    color: #5af;
                }

                /* Drag states */
                .aq-dragging {
                    opacity: 0.4;
                }
                .aq-drag-over {
                    border-color: #5af !important;
                    background: rgba(85, 170, 255, 0.15);
                }

                /* Amount selector */
                .aq-queue-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 4px;
                }
                .aq-amount-selector {
                    display: flex;
                    align-items: center;
                    gap: 2px;
                    font-size: 0.8em;
                }
                .aq-amount-label {
                    opacity: 0.6;
                    margin-right: 2px;
                }
                .aq-amount-btn {
                    padding: 1px 5px !important;
                    font-size: 0.85em;
                }
                .aq-amount-active {
                    background: #555 !important;
                    border-color: #888 !important;
                }

                /* Current list (execution snapshot) */
                .aq-current-section {
                    border-bottom: 1px solid #444;
                    padding-bottom: 6px;
                }
                .aq-section-header {
                    font-size: 0.85em;
                    padding: 2px 4px;
                    opacity: 0.7;
                }
                .aq-next-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 2px 4px 4px;
                }
                .aq-current-entry {
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    padding: 2px 4px;
                    border-radius: 3px;
                    position: relative;
                    overflow: hidden;
                    font-size: 1em;
                }
                .aq-current-entry .aq-progress-bar {
                    position: absolute;
                    left: 0;
                    top: 0;
                    bottom: 0;
                    background: rgba(85, 170, 153, 0.15);
                    transition: width 0.3s ease;
                    z-index: 0;
                }
                .aq-current-entry > * {
                    position: relative;
                    z-index: 1;
                }
                .aq-current-entry.aq-current {
                    border: 1px solid #5a9;
                    background: rgba(85, 170, 153, 0.1);
                }
                .aq-current-entry.aq-state-completed {
                    opacity: 0.5;
                }
                .aq-current-entry.aq-state-completed .aq-progress-bar {
                    background: rgba(85, 170, 85, 0.2);
                }
                .aq-current-entry.aq-state-active .aq-progress-bar {
                    background: rgba(85, 170, 255, 0.2);
                }
                .aq-current-entry.aq-state-failed .aq-entry-state {
                    color: #d55;
                }
                .aq-current-loops {
                    font-size: 0.8em;
                    opacity: 0.7;
                    min-width: 30px;
                    text-align: center;
                }

                /* Predictions */
                .aq-prediction {
                    display: flex;
                    gap: 4px;
                    font-size: 0.8em;
                    font-family: monospace;
                    flex-shrink: 0;
                    margin-left: auto;
                    margin-right: 4px;
                }
                .aq-pred-cost {
                    opacity: 0.6;
                    min-width: 5ch;
                    text-align: right;
                }
                .aq-pred-remaining {
                    font-weight: bold;
                    min-width: 5ch;
                    text-align: right;
                }
                .aq-pred-good {
                    color: #5a5;
                }
                .aq-pred-warn {
                    color: #da5;
                }
                .aq-pred-low {
                    color: #d55;
                }
                .aq-pred-insufficient {
                    color: #a33;
                }
                .aq-pred-insufficient .aq-col-name {
                    text-decoration: line-through;
                }
                .aq-pred-skills {
                    display: flex;
                    gap: 3px;
                    opacity: 0.7;
                    width: 18ch;
                    min-width: 18ch;
                    justify-content: flex-end;
                }
                .aq-pred-skill {
                    color: #8bf;
                }

                /* Actuals in current list */
                .aq-actuals {
                    display: flex;
                    gap: 4px;
                    font-size: 0.8em;
                    font-family: monospace;
                    flex-shrink: 0;
                    margin-left: auto;
                    margin-right: 4px;
                }
                .aq-actual-cost {
                    opacity: 0.7;
                    min-width: 5ch;
                    text-align: right;
                }
                .aq-actual-remaining {
                    font-weight: bold;
                    color: #8cf;
                    min-width: 5ch;
                    text-align: right;
                }
                .aq-actual-skills {
                    display: flex;
                    gap: 3px;
                    opacity: 0.7;
                    width: 18ch;
                    min-width: 18ch;
                    justify-content: flex-end;
                }
                .aq-actual-skill {
                    color: #8bf;
                }
                .aq-actual-time {
                    opacity: 0.5;
                }

                /* Comparison table */
                .aq-comp-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 0.75em;
                }
                .aq-comp-table th, .aq-comp-table td {
                    padding: 2px 4px;
                    text-align: left;
                    border-bottom: 1px solid #333;
                }
                .aq-comp-table th {
                    opacity: 0.6;
                    font-weight: normal;
                }
                .aq-comp-worse {
                    color: #d55;
                }
                .aq-comp-better {
                    color: #5a5;
                }
                .aq-comp-exact {
                    color: #888;
                }
                .aq-comp-skills {
                    font-size: 0.9em;
                    opacity: 0.8;
                }

                /* Empty state */
                .aq-empty {
                    opacity: 0.5;
                    font-style: italic;
                    padding: 8px;
                    text-align: center;
                }

                /* Strategy reasoning log */
                .aq-reason-header {
                    padding: 2px 0 4px;
                    border-bottom: 1px solid #444;
                    margin-bottom: 4px;
                }
                .aq-reason-section {
                    margin: 4px 0;
                }
                .aq-reason-label {
                    font-weight: bold;
                    opacity: 0.7;
                    font-size: 0.9em;
                    margin-bottom: 2px;
                }
                .aq-reason-grid {
                    display: flex;
                    flex-direction: column;
                    gap: 1px;
                    padding-left: 8px;
                }
                .aq-reason-grid > span {
                    line-height: 1.4;
                }
                .aq-reason-queued {
                    color: #8c8;
                }
                .aq-reason-skipped {
                    color: #c88;
                    opacity: 0.8;
                }
            </style>
            <div class="aq-controls" style="display: flex; gap: 4px; flex-wrap: wrap;">
                <button class="aq-start-btn">Start</button>
                <button class="aq-stop-btn">Stop</button>
                <button class="aq-next-btn" title="Execute the next queue entry, then stop">Next</button>
                <button class="aq-drain-btn" title="Drain all energy using the drain strategy, then trigger reset">Drain</button>
                <button class="aq-reset-btn">Reset</button>
                <button class="aq-clear-btn">Clear</button>
                <button class="aq-undo-btn">Undo</button>
                <label class="aq-stop-after" style="margin-left: 8px; display: flex; align-items: center; gap: 4px; font-size: 0.85em; opacity: 0.8;" title="Stop after the current queue finishes (no drain, no repeat, no sequencing)">
                    <input type="checkbox" class="aq-setting-stop-after"> Stop after
                </label>
                <span class="aq-status-text" style="margin-left: 8px; align-self: center;"></span>
            </div>
            <div class="aq-loadout-bar" style="display: flex; gap: 4px; align-items: center; flex-wrap: wrap;">
                <select class="aq-loadout-select" style="flex: 1; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 2px 4px;"></select>
                <button class="aq-loadout-save" title="Save current queue to loadout">Save</button>
                <button class="aq-loadout-new" title="Create new loadout">New</button>
                <button class="aq-loadout-rename" title="Rename loadout">Rename</button>
                <button class="aq-loadout-delete" title="Delete loadout">Del</button>
            </div>
            <details class="aq-settings" style="border: 1px solid #444; border-radius: 4px; padding: 4px 8px; background: #252525;">
                <summary style="cursor: pointer; user-select: none; font-weight: bold; padding: 2px 0;">Settings</summary>
                <div class="aq-settings-body" style="display: flex; flex-direction: column; gap: 6px; padding: 6px 0 2px;">
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-drain" checked>
                        Auto-drain energy when queue finishes
                    </label>
                    <div class="aq-drain-options" style="padding-left: 22px; display: flex; flex-direction: column; gap: 4px;">
                        <label style="display: flex; align-items: center; gap: 6px;">
                            <input type="radio" name="aq-drain-strategy" value="mostDraining" checked>
                            Most draining task
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px;">
                            <input type="radio" name="aq-drain-strategy" value="highestXp">
                            Highest XP task
                        </label>
                    </div>
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-autoreset">
                        Auto-reset when energy depleted
                    </label>
                    <hr style="border: none; border-top: 1px solid #444; margin: 4px 0;">
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-add-to-top">
                        Add new actions to top of queue
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px;" title="Actions are executed immediately when added. Queue stops at the end.">
                        <input type="checkbox" class="aq-setting-immediate">
                        Immediate mode
                    </label>
                    <hr style="border: none; border-top: 1px solid #444; margin: 4px 0;">
                    <div class="aq-sequencing" style="display: flex; flex-direction: column; gap: 4px;">
                        <div style="font-weight: bold; font-size: 0.85em;">Loadout Sequencing</div>
                        <label style="display: flex; align-items: center; gap: 6px;">
                            Repeat
                            <input type="number" class="aq-seq-repeat" min="0" max="9999" value="1" style="width: 50px; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 1px 3px;">
                            times (0 = infinite)
                        </label>
                        <label style="display: flex; align-items: center; gap: 6px;">
                            Then switch to
                            <select class="aq-seq-next" style="flex: 1; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 2px 4px;">
                                <option value="-1">(stop)</option>
                            </select>
                        </label>
                    </div>
                    <hr style="border: none; border-top: 1px solid #444; margin: 4px 0;">
                    <div style="font-weight: bold; font-size: 0.85em; opacity: 0.7;">Debug</div>
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-show-actuals">
                        Show actuals in current list
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-show-comparison">
                        Show prediction comparison
                    </label>
                    <hr style="border: none; border-top: 1px solid #444; margin: 4px 0;">
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <span style="font-weight: bold; font-size: 0.85em;">Auto-Queue Strategy</span>
                        <select class="aq-strategy-level" style="flex: 1; background: #333; color: #ccc; border: 1px solid #555; border-radius: 3px; padding: 2px 4px;">
                            <option value="baseline">Baseline</option>
                            <option value="itemCollection">Item Collection</option>
                            <option value="pushCollect" selected>Push/Collect</option>
                            <option value="grindPushCollect" disabled>Grind with Push/Collect</option>
                            <option value="artifactUsage" disabled>Artifact Usage</option>
                        </select>
                    </label>
                    <label style="display: flex; align-items: center; gap: 6px;">
                        <input type="checkbox" class="aq-setting-verbose-log">
                        Verbose Strategy Log
                    </label>
                </div>
            </details>
            <details class="aq-actions-section" style="flex-shrink: 0;" open></details>
            <details class="aq-reasoning-details" style="border: 1px solid #444; border-radius: 4px; padding: 4px 8px; background: #252525; flex-shrink: 0;">
                <summary style="cursor: pointer; user-select: none; font-weight: bold; padding: 2px 0; font-size: 0.85em;">Strategy Log</summary>
                <div class="aq-reasoning-body" style="font-size: 0.8em; padding: 4px 0; font-family: monospace;"></div>
            </details>
            <div class="aq-queue-section" style="min-height: 60px;"></div>
        `;

        this._setupControls();
        this._setupLoadouts();
        this._setupSettings();
        this._setupSequencing();
        this._setupQueue();
        this._setupCollapsibleState();
    }

    // =================================================================
    // Wire engine callbacks
    // =================================================================

    _wireEngine() {
        const engine = getEngine();
        if (!engine) {
            log('info', 'Engine not available yet — will poll until ready');
            // GL creates panels before module init phase, so engine doesn't exist yet.
            // Poll until it's available, then do late binding.
            this._engineRetryTimer = setInterval(() => {
                const e = getEngine();
                if (e) {
                    clearInterval(this._engineRetryTimer);
                    this._engineRetryTimer = null;
                    this._lateWireEngine(e);
                }
            }, 100);
            return;
        }
        this._connectEngineCallbacks(engine);
    }

    /**
     * Called when the engine becomes available after the panel was already created.
     * Performs all the wiring that couldn't happen during initial setup.
     */
    _lateWireEngine(engine) {
        log('info', 'Engine now available — performing late wiring');
        this._connectEngineCallbacks(engine);

        // Bind queue panel (couldn't bind during _setupQueue because engine was null)
        const queue = engine.queue;
        if (queue && this._queuePanelUI) {
            this._queuePanelUI.bind(queue, () => {
                engine.saveActiveLoadout();
                engine.schedulePredictions();
            });
        }

        // Sync engine settings to UI controls (they defaulted to HTML defaults)
        this._syncSettingsToUI(engine);

        // Refresh loadout dropdown with engine data
        this._refreshLoadoutSelect();

        // If catalog already arrived before we wired up, handle it now
        if (engine.catalog) {
            this._handleCatalogChanged(engine.catalog);
        }
    }

    _connectEngineCallbacks(engine) {
        if (!engine) return;

        const statusText = this.rootElement.querySelector('.aq-status-text');

        engine.onStatusChange = () => this._refreshUI();
        engine.onStatusMessage = (msg) => { if (statusText) statusText.textContent = msg; };
        engine.onPredictionsChanged = (preds) => {
            if (this._queuePanelUI) this._queuePanelUI.setPredictions(preds);
        };
        engine.onCatalogChanged = (catalog) => this._handleCatalogChanged(catalog);
        engine.onReasoningChanged = () => this._refreshReasoningLog();
        engine.onLoadoutsChanged = () => this._refreshLoadoutSelect();
    }

    // =================================================================
    // Controls (buttons)
    // =================================================================

    _setupControls() {
        const el = this.rootElement;

        el.querySelector('.aq-start-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.start();
        });

        el.querySelector('.aq-next-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.stepOne();
        });

        el.querySelector('.aq-stop-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.stop();
        });

        el.querySelector('.aq-drain-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.drain();
        });

        el.querySelector('.aq-reset-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.reset();
        });

        el.querySelector('.aq-clear-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.clear();
        });

        el.querySelector('.aq-undo-btn').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.undo();
        });

        // Stop-after checkbox synced to engine
        const stopAfter = el.querySelector('.aq-setting-stop-after');
        stopAfter.addEventListener('change', () => {
            const engine = getEngine();
            if (engine) engine.stopAfter = stopAfter.checked;
        });
    }

    // =================================================================
    // Loadouts
    // =================================================================

    _setupLoadouts() {
        const el = this.rootElement;
        const select = el.querySelector('.aq-loadout-select');

        select.addEventListener('change', () => {
            const engine = getEngine();
            if (engine) {
                engine.switchLoadout(select.selectedIndex);
                if (this._queuePanelUI) this._queuePanelUI.refresh();
                this._refreshSequencingUI();
            }
        });

        el.querySelector('.aq-loadout-save').addEventListener('click', () => {
            const engine = getEngine();
            if (engine) engine.saveActiveLoadout();
        });

        el.querySelector('.aq-loadout-new').addEventListener('click', () => {
            const engine = getEngine();
            if (!engine || !engine.loadoutManager) return;
            engine.saveActiveLoadout();
            const name = prompt('Loadout name:', `Loadout ${engine.loadoutManager.count + 1}`);
            if (name === null) return;
            engine.createLoadout(name);
            if (this._queuePanelUI) this._queuePanelUI.refresh();
        });

        el.querySelector('.aq-loadout-rename').addEventListener('click', () => {
            const engine = getEngine();
            if (!engine || !engine.loadoutManager) return;
            const name = prompt('New name:', engine.loadoutManager.activeName);
            if (name === null) return;
            engine.renameLoadout(engine.loadoutManager.activeIndex, name);
        });

        el.querySelector('.aq-loadout-delete').addEventListener('click', () => {
            const engine = getEngine();
            if (!engine || !engine.loadoutManager) return;
            if (engine.loadoutManager.count <= 1) return;
            if (!confirm(`Delete "${engine.loadoutManager.activeName}"?`)) return;
            engine.deleteLoadout(engine.loadoutManager.activeIndex);
            if (this._queuePanelUI) this._queuePanelUI.refresh();
        });

        this._refreshLoadoutSelect();
    }

    _refreshLoadoutSelect() {
        const engine = getEngine();
        const lm = engine?.loadoutManager;
        if (!lm) return;

        const select = this.rootElement.querySelector('.aq-loadout-select');
        const loadouts = lm.getLoadouts();
        select.innerHTML = loadouts.map((l, i) =>
            `<option value="${i}">${l.name}</option>`
        ).join('');
        select.selectedIndex = lm.activeIndex;
        this._refreshSequencingUI();
    }

    // =================================================================
    // Sequencing
    // =================================================================

    _refreshSequencingUI() {
        const engine = getEngine();
        const lm = engine?.loadoutManager;
        if (!lm) return;

        const el = this.rootElement;
        const repeatInput = el.querySelector('.aq-seq-repeat');
        const nextSelect = el.querySelector('.aq-seq-next');
        if (!repeatInput || !nextSelect) return;

        const seq = lm.getSequencing(lm.activeIndex);
        repeatInput.value = seq.repeatCount;

        const loadouts = lm.getLoadouts();
        nextSelect.innerHTML = '<option value="-1">(stop)</option>' +
            loadouts.map((l, i) => `<option value="${i}">${l.name}</option>`).join('');
        nextSelect.value = String(seq.nextLoadout);
    }

    _setupSequencing() {
        const el = this.rootElement;
        const repeatInput = el.querySelector('.aq-seq-repeat');
        const nextSelect = el.querySelector('.aq-seq-next');

        const persistSeq = () => {
            const engine = getEngine();
            const lm = engine?.loadoutManager;
            if (!lm) return;
            engine.updateSequencing(lm.activeIndex, {
                repeatCount: parseInt(repeatInput.value, 10) || 0,
                nextLoadout: parseInt(nextSelect.value, 10),
            });
        };

        repeatInput.addEventListener('change', persistSeq);
        nextSelect.addEventListener('change', persistSeq);
    }

    // =================================================================
    // Settings
    // =================================================================

    _setupSettings() {
        const el = this.rootElement;
        const drainCheckbox = el.querySelector('.aq-setting-drain');
        const drainOptions = el.querySelector('.aq-drain-options');
        const autoResetCheckbox = el.querySelector('.aq-setting-autoreset');
        const addToTopCheckbox = el.querySelector('.aq-setting-add-to-top');
        const immediateCheckbox = el.querySelector('.aq-setting-immediate');
        const showActualsCheckbox = el.querySelector('.aq-setting-show-actuals');
        const showComparisonCheckbox = el.querySelector('.aq-setting-show-comparison');
        const radios = el.querySelectorAll('input[name="aq-drain-strategy"]');
        const strategyLevelSelect = el.querySelector('.aq-strategy-level');
        const verboseLogCheckbox = el.querySelector('.aq-setting-verbose-log');

        // Load initial values from engine settings
        const engine = getEngine();
        const settings = engine ? engine.settings : {};
        if (settings.drainEnabled === false) {
            drainCheckbox.checked = false;
            drainOptions.style.opacity = '0.5';
            drainOptions.style.pointerEvents = 'none';
        }
        if (settings.autoReset) autoResetCheckbox.checked = true;
        if (settings.addToTop) addToTopCheckbox.checked = true;
        if (settings.immediateMode) immediateCheckbox.checked = true;
        if (settings.showActuals) showActualsCheckbox.checked = true;
        if (settings.showComparison) showComparisonCheckbox.checked = true;
        if (settings.drainStrategy) {
            const radio = el.querySelector(`input[name="aq-drain-strategy"][value="${settings.drainStrategy}"]`);
            if (radio) radio.checked = true;
        }
        if (settings.strategyLevel) strategyLevelSelect.value = settings.strategyLevel;
        if (settings.verboseLog) verboseLogCheckbox.checked = true;

        // Push changes to engine
        const pushSettings = () => {
            const engine = getEngine();
            if (!engine) return;
            const strategy = el.querySelector('input[name="aq-drain-strategy"]:checked')?.value || 'mostDraining';
            engine.updateSettings({
                drainEnabled: drainCheckbox.checked,
                drainStrategy: strategy,
                autoReset: autoResetCheckbox.checked,
                addToTop: addToTopCheckbox.checked,
                immediateMode: immediateCheckbox.checked,
                showActuals: showActualsCheckbox.checked,
                showComparison: showComparisonCheckbox.checked,
                strategyLevel: strategyLevelSelect.value,
                verboseLog: verboseLogCheckbox.checked,
            });
        };

        drainCheckbox.addEventListener('change', () => {
            const enabled = drainCheckbox.checked;
            drainOptions.style.opacity = enabled ? '1' : '0.5';
            drainOptions.style.pointerEvents = enabled ? 'auto' : 'none';
            pushSettings();
        });

        autoResetCheckbox.addEventListener('change', pushSettings);
        addToTopCheckbox.addEventListener('change', pushSettings);
        immediateCheckbox.addEventListener('change', pushSettings);
        strategyLevelSelect.addEventListener('change', pushSettings);
        for (const radio of radios) radio.addEventListener('change', pushSettings);

        const updateDisplayOptions = () => {
            if (this._queuePanelUI) this._queuePanelUI.setDisplayOptions({
                showActuals: showActualsCheckbox.checked,
                showComparison: showComparisonCheckbox.checked,
            });
        };
        showActualsCheckbox.addEventListener('change', () => { pushSettings(); updateDisplayOptions(); });
        showComparisonCheckbox.addEventListener('change', () => { pushSettings(); updateDisplayOptions(); });
        verboseLogCheckbox.addEventListener('change', () => { pushSettings(); this._refreshReasoningLog(); });
    }

    // =================================================================
    // Queue Panel
    // =================================================================

    _setupQueue() {
        const queueSection = this.rootElement.querySelector('.aq-queue-section');
        this._queuePanelUI = new JTAQueuePanelUI(queueSection);

        // Apply saved display options
        const engine = getEngine();
        const settings = engine ? engine.settings : {};
        this._queuePanelUI.setDisplayOptions({
            showActuals: settings.showActuals || false,
            showComparison: settings.showComparison || false,
        });

        const onQueueChanged = () => {
            const engine = getEngine();
            if (engine) {
                engine.saveActiveLoadout();
                engine.schedulePredictions();
            }
        };

        const queue = engine?.queue;
        if (queue) this._queuePanelUI.bind(queue, onQueueChanged);

        // Handle actions dragged from actions panel onto queue
        this._queuePanelUI.onExternalDrop = (catalogEntry, targetIndex) => {
            const engine = getEngine();
            const queue = engine?.queue;
            if (!queue) return;
            const queueEntry = createQueueEntry(catalogEntry);
            queue.add(queueEntry, targetIndex);
            this._queuePanelUI.refresh();
            if (engine) {
                engine.saveActiveLoadout();
                engine.maybeExecuteImmediate();
            }
        };
    }

    // =================================================================
    // Catalog Changed (from engine)
    // =================================================================

    _handleCatalogChanged(catalog) {
        const engine = getEngine();

        // Ensure engine callbacks are wired (handles case where engine wasn't ready at panel creation)
        this._connectEngineCallbacks(engine);

        // Ensure queue panel is bound
        const queue = engine?.queue;
        if (this._queuePanelUI && queue && !this._queuePanelUI._bound) {
            this._queuePanelUI.bind(queue, () => {
                if (engine) {
                    engine.saveActiveLoadout();
                    engine.schedulePredictions();
                }
            });
            this._queuePanelUI._bound = true;
        }

        // Refresh loadout dropdown
        this._refreshLoadoutSelect();

        // Create actions panel
        const actionsSection = this.rootElement.querySelector('.aq-actions-section');
        this._actionsPanelUI = new JTAActionsPanelUI(actionsSection);
        const getInsertIndex = () => {
            const settings = engine ? engine.settings : {};
            return settings.addToTop ? 0 : undefined;
        };
        this._actionsPanelUI.bind(queue, catalog, () => {
            if (this._queuePanelUI) this._queuePanelUI.refresh();
            if (engine) {
                engine.saveActiveLoadout();
                engine.schedulePredictions();
                engine.maybeExecuteImmediate();
            }
        }, getInsertIndex);
    }

    // =================================================================
    // Refresh UI
    // =================================================================

    _refreshUI() {
        const engine = getEngine();
        if (this._queuePanelUI) {
            const snapshot = engine?.executor?.snapshot ?? null;
            const predictions = engine?.predictions ?? null;
            // Freeze predictions onto new snapshots for comparison
            if (snapshot && !snapshot.frozenPredictions && predictions) {
                snapshot.frozenPredictions = new Map(predictions);
            }
            this._queuePanelUI.setSnapshot(snapshot);
            this._queuePanelUI.setPredictions(predictions);
        }
    }

    // =================================================================
    // Reasoning Log (pure rendering)
    // =================================================================

    _refreshReasoningLog() {
        const body = this.rootElement?.querySelector('.aq-reasoning-body');
        if (!body) return;

        const engine = getEngine();
        const r = engine?.lastReasoning;
        if (!r) {
            body.innerHTML = '<div style="opacity: 0.5; font-style: italic;">No strategy queue generated yet.</div>';
            return;
        }

        const pad = (str, len) => String(str).padEnd(len);
        const rpad = (str, len) => String(str).padStart(len);
        const truncName = (name, max) => name.length > max ? name.substring(0, max - 1) + '\u2026' : name;
        const tblRow = (cls, cols) => `<span class="${cls}">${cols}</span>`;
        const pre = (html) => `<pre style="margin:0; font-size:inherit; font-family:inherit; white-space:pre;">${html}</pre>`;

        const sections = [];

        // Header
        sections.push(`<div class="aq-reason-header"><strong>${r.strategyLevel}</strong> \u2014 ${r.runType || 'unknown'} run</div>`);

        // State summary
        const s = r.state;
        const skillParts = Object.entries(s.skillLevels).map(([name, lvl]) => `${name}:${lvl}`).join(' ');
        const itemParts = Object.entries(s.items).map(([name, count]) => `${name}\u00d7${count}`).join(', ');
        sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">State</div><div class="aq-reason-grid">` +
            `<span>Energy: ${fmtE(s.maxEnergy)}${s.currentEnergy !== undefined ? ` (current: ${fmtE(s.currentEnergy)})` : ''} | Zone: ${s.highestZone + 1} | Perks: ${s.perkCount}</span>` +
            (skillParts ? `<span>Skills: ${skillParts}</span>` : '') +
            (itemParts ? `<span>Items: ${itemParts} (${fmtE(s.itemEnergy)} energy)</span>` : '<span>Items: none</span>') +
            `</div></div>`);

        // Push/collect decision
        if (r.pushCollect) {
            const pc = r.pushCollect;
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Push/Collect Decision</div><div class="aq-reason-grid">` +
                `<span>${pc.shouldPush ? '\u2192 PUSH' : '\u2192 COLLECT'}: ${pc.reason}</span>` +
                (pc.nextNewZone !== null ? `<span>Next new zone: ${pc.nextNewZone + 1}, traversal cost: ${fmtE(pc.totalCostToNextNewZone)}</span>` : '') +
                `<span>Energy: ${fmtE(pc.energy)}, item energy: ${fmtE(pc.itemEnergy)}</span>` +
                `</div></div>`);
        }

        // Items consumed
        if (r.itemsConsumed.length > 0) {
            const itemRows = r.itemsConsumed.map(ic => {
                if (ic.type === 'energy') return `<span class="aq-reason-queued">${ic.name} \u00d7${ic.count} (+${fmtE(ic.energyValue)} energy)</span>`;
                return `<span class="aq-reason-queued">${ic.name} \u00d7${ic.count} (skill boost)</span>`;
            }).join('');
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Items Consumed</div><div class="aq-reason-grid">${itemRows}</div></div>`);
        }

        // Reachability table
        if (r.reachability.zones) {
            const reach = r.reachability;
            const NW = 22;
            const rows = [];
            rows.push(`${rpad('Z', 2)} ${pad('Zone', NW)} ${rpad('Cost', 7)} ${rpad('Remain', 7)}`);
            rows.push('\u2500'.repeat(NW + 19));
            for (let i = 0; i < reach.zones.length; i++) {
                const z = reach.zones[i];
                const prev = i > 0 ? reach.zones[i - 1] : null;
                const cost = prev ? prev.mandatoryCost : 0;
                const remain = prev ? prev.energyAfter : 0;
                rows.push(`${rpad(z.zoneId + 1, 2)} ${pad(truncName(z.zoneName, NW), NW)} ${rpad(fmtE(cost), 7)} ${rpad(fmtE(remain), 7)}`);
            }
            if (reach.borderZone) {
                const bz = reach.borderZone;
                const last = reach.zones[reach.zones.length - 1];
                const cost = last ? last.mandatoryCost : 0;
                const remain = last ? last.energyAfter : 0;
                rows.push(`${rpad(bz.zoneId + 1, 2)} ${pad(truncName(bz.zoneName, NW), NW)} ${rpad(fmtE(cost), 7)} ${rpad(fmtE(remain), 7)}`);
                rows.push(`<span class="aq-reason-skipped">${rpad(bz.nextZoneId + 1, 2)} ${pad(truncName(bz.nextZoneName, NW), NW)} ${rpad(fmtE(bz.mandatoryCost), 7)} ${rpad('-' + fmtE(bz.deficit), 7)}  need ${fmtE(bz.mandatoryCost)}</span>`);
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Zone Reachability (${reach.zonesReachable} zones, ${fmtE(reach.totalEnergy)} energy)</div>${pre(rows.join('\n'))}</div>`);
        }

        // Perk decisions
        if (r.perkDecisions.length > 0) {
            const NW = 22;
            const rows = [];
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Trav', 7)} ${rpad('Task', 7)} ${rpad('Total', 7)}  Reason`);
            rows.push('\u2500'.repeat(NW + 41));
            for (const d of r.perkDecisions) {
                const mark = d.queued ? '\u2713' : '\u2717';
                const cls = d.queued ? 'aq-reason-queued' : 'aq-reason-skipped';
                rows.push(tblRow(cls, `${mark} ${rpad(d.zoneId + 1, 2)} ${pad(truncName(d.task, NW), NW)} ${rpad(fmtE(d.traversalCost), 7)} ${rpad(fmtE(d.fullCost), 7)} ${rpad(fmtE(d.totalEnergyNeeded), 7)}  ${d.reason}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Perk Tasks (Priority 1)</div>${pre(rows.join('\n'))}</div>`);
        }

        // Item decisions
        if (r.itemDecisions.length > 0) {
            const NW = 22;
            const rows = [];
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Trav', 7)} ${rpad('Task', 7)} ${rpad('Value', 7)} ${rpad('Net', 7)}  Reason`);
            rows.push('\u2500'.repeat(NW + 48));
            for (const d of r.itemDecisions) {
                const mark = d.queued ? '\u2713' : '\u2717';
                const cls = d.queued ? 'aq-reason-queued' : 'aq-reason-skipped';
                rows.push(tblRow(cls, `${mark} ${rpad(d.zoneId + 1, 2)} ${pad(truncName(d.task, NW), NW)} ${rpad(fmtE(d.traversalCost), 7)} ${rpad(fmtE(d.fullCost), 7)} ${rpad(fmtE(d.itemValue), 7)} ${rpad(fmtE(d.netGain), 7)}  ${d.reason}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Energy Items (Priority 2)</div>${pre(rows.join('\n'))}</div>`);
        }

        // Boost decisions
        if (r.boostDecisions.length > 0) {
            const NW = 22;
            const rows = [];
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Trav', 7)} ${rpad('Task', 7)} ${rpad('Bon/E', 7)}  Reason`);
            rows.push('\u2500'.repeat(NW + 41));
            for (const d of r.boostDecisions) {
                const mark = d.queued ? '\u2713' : '\u2717';
                const cls = d.queued ? 'aq-reason-queued' : 'aq-reason-skipped';
                rows.push(tblRow(cls, `${mark} ${rpad(d.zoneId + 1, 2)} ${pad(truncName(d.task, NW), NW)} ${rpad(fmtE(d.traversalCost), 7)} ${rpad(fmtE(d.fullCost), 7)} ${rpad(d.bonusPerEnergy.toFixed(3), 7)}  ${d.reason}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Skill Boost Items (Priority 3)</div>${pre(rows.join('\n'))}</div>`);
        }

        // Boss decisions
        if (r.bossDecisions.length > 0) {
            const NW = 22;
            const rows = [];
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Trav', 7)} ${rpad('Task', 7)}  Reason`);
            rows.push('\u2500'.repeat(NW + 31));
            for (const d of r.bossDecisions) {
                const mark = d.queued ? '\u2713' : '\u2717';
                const cls = d.queued ? 'aq-reason-queued' : 'aq-reason-skipped';
                rows.push(tblRow(cls, `${mark} ${rpad(d.zoneId + 1, 2)} ${pad(truncName(d.task, NW), NW)} ${rpad(fmtE(d.traversalCost), 7)} ${rpad(fmtE(d.fullCost), 7)}  ${d.reason}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Boss Tasks (Priority 4)</div>${pre(rows.join('\n'))}</div>`);
        }

        // Grind plan / All tasks
        const verbose = this.rootElement?.querySelector('.aq-setting-verbose-log')?.checked || false;
        const NW = 22;
        if (verbose && r.allTasks) {
            const selectedNames = new Set(r.grindPlan.tasks.map(gt => gt.task));
            const gp = r.grindPlan;
            const rows = [];
            rows.push(`Budget: ${fmtE(gp.budget)}, selected ${gp.tasksSelected} of ${gp.tasksConsidered} grindable`);
            rows.push('');
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Cost', 7)} ${rpad('XP/E', 8)} ${pad('Skills', 7)} Type`);
            rows.push('\u2500'.repeat(NW + 38));
            for (const t of r.allTasks) {
                const isSelected = selectedNames.has(t.task);
                const mark = isSelected ? '\u2713' : '\u00b7';
                const cls = isSelected ? 'aq-reason-queued' : 'aq-reason-skipped';
                const tags = [];
                if (t.type !== 'Normal') tags.push(t.type);
                if (t.hasPerk) tags.push('Perk');
                const tagStr = tags.join(',');
                rows.push(tblRow(cls, `${mark} ${rpad(t.zoneId + 1, 2)} ${pad(truncName(t.task, NW), NW)} ${rpad(fmtE(t.fullCost), 7)} ${rpad(t.xpPerEnergy.toFixed(2), 8)} ${pad(t.skills.join('/'), 7)} ${tagStr}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">All Tasks by XP/E (Priority 5)</div>${pre(rows.join('\n'))}</div>`);
        } else if (r.grindPlan.tasksSelected > 0) {
            const gp = r.grindPlan;
            const rows = [];
            rows.push(`Budget: ${fmtE(gp.budget)}, selected ${gp.tasksSelected} of ${gp.tasksConsidered} candidates`);
            rows.push('');
            rows.push(`  ${rpad('Z', 2)} ${pad('Task', NW)} ${rpad('Cost', 7)} ${rpad('XP/E', 8)} Skills`);
            rows.push('\u2500'.repeat(NW + 31));
            for (const gt of gp.tasks) {
                const note = gt.overBudget ? ' drain' : '';
                rows.push(tblRow('aq-reason-queued', `\u2713 ${rpad(gt.zoneId + 1, 2)} ${pad(truncName(gt.task, NW), NW)} ${rpad(fmtE(gt.fullCost), 7)} ${rpad(gt.totalXpPerEnergy.toFixed(2), 8)} ${gt.skills.join('/')}${note}`));
            }
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">XP Grinding (Priority 5)</div>${pre(rows.join('\n'))}</div>`);
        } else if (r.grindPlan.budget !== undefined) {
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">XP Grinding</div><div class="aq-reason-grid"><span class="aq-reason-skipped">None (budget: ${fmtE(r.grindPlan.budget)}, candidates: ${r.grindPlan.tasksConsidered})</span></div></div>`);
        }

        // Notes
        if (r.notes.length > 0) {
            const noteRows = r.notes.map(n => `<span>${n}</span>`).join('');
            sections.push(`<div class="aq-reason-section"><div class="aq-reason-label">Notes</div><div class="aq-reason-grid">${noteRows}</div></div>`);
        }

        body.innerHTML = sections.join('');
    }

    // =================================================================
    // Collapsible State Persistence
    // =================================================================

    _setupCollapsibleState() {
        const sections = [
            { selector: '.aq-settings', id: 'settings' },
            { selector: '.aq-actions-section', id: 'actions' },
            { selector: '.aq-reasoning-details', id: 'reasoning' },
            { selector: '.aq-current-section', id: 'current' },
            { selector: '.aq-next-section', id: 'next' },
        ];
        for (const { selector, id } of sections) {
            const el = this.rootElement.querySelector(selector);
            if (el) this._bindCollapsible(el, id);
        }
    }

    _bindCollapsible(el, id) {
        const KEY = 'jta-aq-collapsed';
        let saved;
        try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { saved = {}; }
        if (saved[id] !== undefined) el.open = saved[id];
        el.addEventListener('toggle', () => {
            let current;
            try { current = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { current = {}; }
            current[id] = el.open;
            localStorage.setItem(KEY, JSON.stringify(current));
        });
    }

    /**
     * Sync engine settings to UI controls. Used during late wiring when
     * _setupSettings() ran before the engine existed.
     */
    _syncSettingsToUI(engine) {
        const settings = engine.settings;
        const el = this.rootElement;

        const drainCheckbox = el.querySelector('.aq-setting-drain');
        const drainOptions = el.querySelector('.aq-drain-options');
        const autoResetCheckbox = el.querySelector('.aq-setting-autoreset');
        const addToTopCheckbox = el.querySelector('.aq-setting-add-to-top');
        const immediateCheckbox = el.querySelector('.aq-setting-immediate');
        const showActualsCheckbox = el.querySelector('.aq-setting-show-actuals');
        const showComparisonCheckbox = el.querySelector('.aq-setting-show-comparison');
        const strategyLevelSelect = el.querySelector('.aq-strategy-level');
        const verboseLogCheckbox = el.querySelector('.aq-setting-verbose-log');

        drainCheckbox.checked = settings.drainEnabled !== false;
        drainOptions.style.opacity = drainCheckbox.checked ? '1' : '0.5';
        drainOptions.style.pointerEvents = drainCheckbox.checked ? 'auto' : 'none';
        autoResetCheckbox.checked = !!settings.autoReset;
        addToTopCheckbox.checked = !!settings.addToTop;
        immediateCheckbox.checked = !!settings.immediateMode;
        showActualsCheckbox.checked = !!settings.showActuals;
        showComparisonCheckbox.checked = !!settings.showComparison;
        if (settings.drainStrategy) {
            const radio = el.querySelector(`input[name="aq-drain-strategy"][value="${settings.drainStrategy}"]`);
            if (radio) radio.checked = true;
        }
        if (settings.strategyLevel) strategyLevelSelect.value = settings.strategyLevel;
        verboseLogCheckbox.checked = !!settings.verboseLog;

        if (this._queuePanelUI) {
            this._queuePanelUI.setDisplayOptions({
                showActuals: !!settings.showActuals,
                showComparison: !!settings.showComparison,
            });
        }
    }

    destroy() {
        if (this._engineRetryTimer) {
            clearInterval(this._engineRetryTimer);
            this._engineRetryTimer = null;
        }
    }
}

// UI component for JTA game data panel module
import { getModuleEventBus } from './index.js';
import { compareZoneTasks, stateSummary, gameStateToSimState } from '../jta-randomizer/jtaSimComparison.js';
import { adjustCosts, parseSphereLog } from '../jta-randomizer/jtaCostGenerator.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('jtaGameDataPanelUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[jtaGameDataPanelUI] ${message}`, ...data);
    }
}

export class JTAGameDataPanelUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });

        // UI element references
        this.rootElement = null;

        // Connection state
        this.isConnected = false;
        this.iframeId = null;
        this.lastConnectedTime = null;
        this.isIframeLoaded = false;
        this.loadedUrl = null;

        // Event log
        this.eventLog = [];
        this.maxLogEntries = 50;

        // CM6 editor
        this.editorView = null;
        this.editorInitialized = false;
        this.cm6Module = null;

        // Event subscriptions
        this.unsubscribeHandles = [];
        this._initialPresetTimer = null;

        this.initialize();
        this.setupEventSubscriptions();
        this._checkInitialPreset();

        log('info', 'JTAGameDataPanelUI initialized');
    }

    // Required method for Golden Layout
    getRootElement() {
        if (!this.rootElement) {
            this.createRootElement();
        }
        return this.rootElement;
    }

    initialize() {
        this.createRootElement();
    }

    createRootElement() {
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'jta-game-data-panel-container';
        this.rootElement.style.cssText = 'height: 100%; overflow: auto; background: #1e1e1e; color: #cccccc;';
        this.rootElement.innerHTML = this._createPanelHTML();
        this._cacheElements();
        this._setupDomListeners();
    }

    _createPanelHTML() {
        return `
            <div class="jta-game-data-panel" style="padding: 15px;">
                <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #cccccc;">JTA Game Data</h3>

                <!-- Connection Status Section -->
                ${this._sectionHTML('connection', 'Connection Status', true, `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <span class="jta-conn-dot" style="
                            width: 10px; height: 10px; border-radius: 50%;
                            background: #666; display: inline-block;
                        "></span>
                        <span class="jta-conn-label" style="font-size: 12px;">Disconnected</span>
                    </div>
                    <div style="font-size: 11px; color: #999;">
                        <div>Iframe ID: <span class="jta-conn-iframe-id">--</span></div>
                        <div>Last connected: <span class="jta-conn-last-time">--</span></div>
                    </div>
                    <div style="margin-top: 6px; font-size: 11px; border-top: 1px solid #333; padding-top: 6px;">
                        <div>Game data: <span class="jta-loaded-data-label" style="color: #999;">Not loaded</span></div>
                    </div>
                `)}

                <!-- Game State Summary Section -->
                ${this._sectionHTML('gameState', 'Game State Summary', true, `
                    <div class="jta-game-state-grid" style="
                        display: grid; grid-template-columns: 1fr 1fr;
                        gap: 4px 12px; font-size: 11px; margin-bottom: 8px;
                    ">
                        <div>Zone: <strong class="jta-gs-zone">--</strong></div>
                        <div>Highest: <strong class="jta-gs-highest-zone">--</strong></div>
                        <div>Energy: <strong class="jta-gs-energy">--</strong></div>
                        <div>Resets: <strong class="jta-gs-resets">--</strong></div>
                        <div>Perks: <strong class="jta-gs-perks">--</strong></div>
                        <div>Prestige: <strong class="jta-gs-prestige">--</strong></div>
                    </div>
                    <button class="jta-refresh-btn" style="
                        padding: 4px 12px; background: #444; color: #ccc;
                        border: 1px solid #555; border-radius: 3px; cursor: pointer;
                        font-size: 11px;
                    ">Refresh</button>
                `)}

                <!-- Event Log Section -->
                ${this._sectionHTML('eventLog', 'Event Log', true, `
                    <div class="jta-log-container" style="
                        max-height: 200px; overflow-y: auto; font-size: 11px;
                        font-family: monospace; background: #2d2d30;
                        border: 1px solid #555; border-radius: 3px; padding: 6px;
                        min-height: 40px;
                    ">
                        <div class="jta-log-entries" style="color: #aaa;">No events yet</div>
                    </div>
                    <button class="jta-log-clear-btn" style="
                        padding: 4px 12px; background: #444; color: #ccc;
                        border: 1px solid #555; border-radius: 3px; cursor: pointer;
                        font-size: 11px; margin-top: 6px;
                    ">Clear</button>
                `)}

                <!-- Simulator Comparison Section -->
                ${this._sectionHTML('simComparison', 'Simulator Comparison', false, `
                    <div style="margin-bottom: 8px; display: flex; gap: 6px; align-items: center;">
                        <button class="jta-compare-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Compare Current Zone</button>
                        <label style="font-size: 11px; display: flex; align-items: center; gap: 4px; cursor: pointer;">
                            <input type="checkbox" class="jta-auto-compare-cb" style="margin: 0;">
                            Auto-refresh on zone change
                        </label>
                        <span class="jta-compare-status" style="font-size: 11px; color: #999;"></span>
                    </div>
                    <div class="jta-compare-state-summary" style="
                        font-size: 11px; margin-bottom: 8px; padding: 6px;
                        background: #2d2d30; border: 1px solid #555; border-radius: 3px;
                        display: none;
                    "></div>
                    <div class="jta-compare-results" style="
                        font-size: 11px; overflow-x: auto;
                    ">
                        <div style="color: #888; padding: 8px;">Click "Compare Current Zone" to run simulator formulas against the live game state.</div>
                    </div>
                `)}

                <!-- Game Data Loading Section -->
                ${this._sectionHTML('gameDataLoad', 'Game Data Loading', false, `
                    <div style="font-size: 11px; color: #999; margin-bottom: 8px;">
                        Load game data from preset files or upload a JSON file.
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px;">
                        <button class="jta-load-gamedata-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Load Randomized Data</button>
                        <button class="jta-load-costs-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Load Adjusted Costs</button>
                        <label style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px; display: inline-block;
                        ">Upload File
                            <input type="file" class="jta-upload-gamedata-input" accept=".json" style="display: none;">
                        </label>
                    </div>
                    <div class="jta-load-status" style="font-size: 11px; color: #999; min-height: 14px;"></div>
                `)}

                <!-- Game Data Editor Section -->
                ${this._sectionHTML('gameDataViewer', 'Game Data Editor', false, `
                    <div style="margin-bottom: 8px; display: flex; gap: 6px; align-items: center;">
                        <button class="jta-viewer-load-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Load from Game</button>
                        <button class="jta-viewer-apply-btn" style="
                            padding: 5px 10px; background: #2a4a6a; color: #ccc;
                            border: 1px solid #3a6a8a; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Apply to Game</button>
                        <span class="jta-viewer-status" style="font-size: 11px; color: #999;"></span>
                    </div>
                    <div class="jta-viewer-wrapper" style="
                        border: 1px solid #555; border-radius: 3px;
                        position: relative;
                    ">
                        <div class="jta-viewer-empty" style="
                            position: absolute; inset: 0; display: flex;
                            align-items: center; justify-content: center;
                            color: #666; font-size: 12px; pointer-events: none;
                        ">Click "Load from Game" or load from preset</div>
                        <div class="jta-viewer-mount" style="height: 400px; overflow-y: auto;"></div>
                    </div>
                `)}

                <!-- Cost Adjustment Section -->
                ${this._sectionHTML('costAdjust', 'Cost Adjustment', false, `
                    <div style="font-size: 11px; color: #999; margin-bottom: 8px;">
                        Run the cost adjustment algorithm in-browser. No Node.js required.
                    </div>
                    <div style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 8px;">
                        <label style="font-size: 11px;">Resets/sphere:
                            <input type="number" class="jta-cost-resets-input" value="5" min="1" max="20" style="
                                width: 40px; background: #333; color: #ccc; border: 1px solid #555;
                                border-radius: 3px; padding: 3px; font-size: 11px; text-align: center;
                            ">
                        </label>
                        <button class="jta-run-cost-adjust-btn" style="
                            padding: 5px 10px; background: #2a6a2a; color: #ccc;
                            border: 1px solid #3a8a3a; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Run Cost Adjustment</button>
                        <button class="jta-min-costs-btn" style="
                            padding: 5px 10px; background: #6a4a2a; color: #ccc;
                            border: 1px solid #8a6a3a; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Set Min Costs</button>
                    </div>
                    <div class="jta-cost-status" style="font-size: 11px; color: #999; min-height: 14px;"></div>
                    <div class="jta-cost-results" style="
                        font-size: 11px; max-height: 300px; overflow-y: auto;
                        display: none;
                    "></div>
                    <div class="jta-cost-actions" style="display: none; margin-top: 8px; gap: 6px;">
                        <button class="jta-apply-costs-btn" style="
                            padding: 5px 10px; background: #2a4a6a; color: #ccc;
                            border: 1px solid #3a6a8a; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Apply to Game</button>
                        <button class="jta-download-costs-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Download Costs JSON</button>
                    </div>
                `)}

                <!-- Save Data Editor Section -->
                ${this._sectionHTML('saveEditor', 'Save Data Editor', false, `
                    <div style="margin-bottom: 8px; display: flex; gap: 6px; align-items: center;">
                        <button class="jta-export-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Export from Game</button>
                        <button class="jta-import-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Import to Game</button>
                        <span class="jta-editor-status" style="font-size: 11px; color: #999;"></span>
                    </div>
                    <div class="jta-editor-wrapper" style="
                        border: 1px solid #555; border-radius: 3px;
                        min-height: 200px; position: relative;
                    ">
                        <div class="jta-editor-empty" style="
                            position: absolute; inset: 0; display: flex;
                            align-items: center; justify-content: center;
                            color: #666; font-size: 12px; pointer-events: none;
                        ">Click "Export from Game" to load save data</div>
                        <div class="jta-editor-mount" style="height: 300px; overflow-y: auto;"></div>
                    </div>
                `)}
            </div>
        `;
    }

    _sectionHTML(id, title, defaultOpen, content) {
        const arrow = defaultOpen ? '\u25BC' : '\u25B6';
        const display = defaultOpen ? 'block' : 'none';
        return `
            <div class="jta-section" data-section="${id}" style="margin-bottom: 12px;">
                <div class="jta-section-header" data-section="${id}" style="
                    cursor: pointer; padding: 6px 8px; background: #2a2a2a;
                    border: 1px solid #444; border-radius: 3px;
                    font-size: 12px; font-weight: bold; user-select: none;
                    display: flex; align-items: center; gap: 6px;
                " title="Click to toggle">
                    <span class="jta-section-arrow">${arrow}</span>
                    ${title}
                </div>
                <div class="jta-section-body" data-section="${id}" style="
                    display: ${display}; padding: 8px; border: 1px solid #333;
                    border-top: none; border-radius: 0 0 3px 3px;
                ">
                    ${content}
                </div>
            </div>
        `;
    }

    _cacheElements() {
        const q = (sel) => this.rootElement.querySelector(sel);

        // Connection
        this._connDot = q('.jta-conn-dot');
        this._connLabel = q('.jta-conn-label');
        this._connIframeId = q('.jta-conn-iframe-id');
        this._connLastTime = q('.jta-conn-last-time');
        this._loadedDataLabel = q('.jta-loaded-data-label');

        // Game state
        this._gsZone = q('.jta-gs-zone');
        this._gsHighestZone = q('.jta-gs-highest-zone');
        this._gsEnergy = q('.jta-gs-energy');
        this._gsResets = q('.jta-gs-resets');
        this._gsPerks = q('.jta-gs-perks');
        this._gsPrestige = q('.jta-gs-prestige');
        this._refreshBtn = q('.jta-refresh-btn');

        // Event log
        this._logEntries = q('.jta-log-entries');
        this._logClearBtn = q('.jta-log-clear-btn');

        // Simulator comparison
        this._compareBtn = q('.jta-compare-btn');
        this._autoCompareCb = q('.jta-auto-compare-cb');
        this._compareStatus = q('.jta-compare-status');
        this._compareStateSummary = q('.jta-compare-state-summary');
        this._compareResults = q('.jta-compare-results');

        // Game data loading
        this._loadGamedataBtn = q('.jta-load-gamedata-btn');
        this._loadCostsBtn = q('.jta-load-costs-btn');
        this._uploadGamedataInput = q('.jta-upload-gamedata-input');
        this._loadStatus = q('.jta-load-status');

        // Game data editor
        this._viewerLoadBtn = q('.jta-viewer-load-btn');
        this._viewerApplyBtn = q('.jta-viewer-apply-btn');
        this._viewerStatus = q('.jta-viewer-status');
        this._viewerEmpty = q('.jta-viewer-empty');
        this._viewerMount = q('.jta-viewer-mount');

        // Cost adjustment
        this._costResetsInput = q('.jta-cost-resets-input');
        this._runCostAdjustBtn = q('.jta-run-cost-adjust-btn');
        this._costStatus = q('.jta-cost-status');
        this._costResults = q('.jta-cost-results');
        this._costActions = q('.jta-cost-actions');
        this._applyCostsBtn = q('.jta-apply-costs-btn');
        this._downloadCostsBtn = q('.jta-download-costs-btn');
        this._minCostsBtn = q('.jta-min-costs-btn');

        // Save editor
        this._exportBtn = q('.jta-export-btn');
        this._importBtn = q('.jta-import-btn');
        this._editorStatus = q('.jta-editor-status');
        this._editorWrapper = q('.jta-editor-wrapper');
        this._editorEmpty = q('.jta-editor-empty');
        this._editorMount = q('.jta-editor-mount');
    }

    _setupDomListeners() {
        // Section toggle headers
        this.rootElement.querySelectorAll('.jta-section-header').forEach(header => {
            header.addEventListener('click', () => {
                const sectionId = header.dataset.section;
                const body = this.rootElement.querySelector(`.jta-section-body[data-section="${sectionId}"]`);
                const arrow = header.querySelector('.jta-section-arrow');
                if (!body) return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                arrow.textContent = isOpen ? '\u25B6' : '\u25BC';

                // Lazy-init CM6 editors on first expand
                if (sectionId === 'saveEditor' && !isOpen && !this.editorInitialized) {
                    this._initEditor();
                }
                if (sectionId === 'gameDataViewer' && !isOpen && !this._viewerEditorView) {
                    this._initViewerEditor();
                }
            });
        });

        // Refresh button - request state from iframe
        if (this._refreshBtn) {
            this._refreshBtn.addEventListener('click', () => {
                this.eventBus.publish('jta:requestState', {});
                this._refreshBtn.textContent = 'Refreshing...';
                setTimeout(() => { this._refreshBtn.textContent = 'Refresh'; }, 2000);
            });
        }

        // Clear log button
        if (this._logClearBtn) {
            this._logClearBtn.addEventListener('click', () => {
                this.eventLog = [];
                this._renderLog();
            });
        }

        // Compare button - request detailed state for simulator comparison
        if (this._compareBtn) {
            this._compareBtn.addEventListener('click', () => {
                this.eventBus.publish('jta:requestDetailedState', {});
                this._setCompareStatus('Requesting game state...');
            });
        }

        // Auto-compare checkbox
        this._autoCompare = false;
        if (this._autoCompareCb) {
            this._autoCompareCb.addEventListener('change', (e) => {
                this._autoCompare = e.target.checked;
            });
        }

        // Export button
        if (this._exportBtn) {
            this._exportBtn.addEventListener('click', () => {
                this.eventBus.publish('jta:exportSave', {});
                this._setEditorStatus('Exporting...');
            });
        }

        // Import button
        if (this._importBtn) {
            this._importBtn.addEventListener('click', () => {
                const content = this._getEditorContent();
                if (!content) {
                    this._setEditorStatus('No data to import', true);
                    return;
                }
                try {
                    JSON.parse(content);
                } catch (e) {
                    this._setEditorStatus('Invalid JSON: ' + e.message, true);
                    return;
                }
                this.eventBus.publish('jta:importSave', { saveJson: content });
                this._setEditorStatus('Importing...');
            });
        }

        // Game data loading buttons
        if (this._loadGamedataBtn) {
            this._loadGamedataBtn.addEventListener('click', () => this._loadPresetFile('gamedata'));
        }
        if (this._loadCostsBtn) {
            this._loadCostsBtn.addEventListener('click', () => this._loadPresetFile('costs'));
        }
        if (this._uploadGamedataInput) {
            this._uploadGamedataInput.addEventListener('change', (e) => this._handleFileUpload(e));
        }

        // Game data editor buttons
        if (this._viewerLoadBtn) {
            this._viewerLoadBtn.addEventListener('click', () => this._loadGameDataFromGame());
        }
        if (this._viewerApplyBtn) {
            this._viewerApplyBtn.addEventListener('click', () => this._applyViewerToGame());
        }

        // Cost adjustment buttons
        if (this._runCostAdjustBtn) {
            this._runCostAdjustBtn.addEventListener('click', () => this._runCostAdjustment());
        }
        if (this._applyCostsBtn) {
            this._applyCostsBtn.addEventListener('click', () => this._applyCostsToGame());
        }
        if (this._minCostsBtn) {
            this._minCostsBtn.addEventListener('click', () => this._setMinCosts());
        }
        if (this._downloadCostsBtn) {
            this._downloadCostsBtn.addEventListener('click', () => this._downloadCosts());
        }

        // Button hover effects
        this.rootElement.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mouseenter', () => { btn.style.background = '#555'; });
            btn.addEventListener('mouseleave', () => { btn.style.background = '#444'; });
        });
    }

    // --- Event subscriptions ---

    setupEventSubscriptions() {
        if (!this.eventBus) return;

        const sub = (event, handler) => {
            const unsub = this.eventBus.subscribe(event, handler);
            this.unsubscribeHandles.push(unsub);
        };

        sub('files:jsonLoaded', (data) => this._handlePresetLoaded(data));
        sub('iframe:connected', (data) => this._handleConnected(data));
        sub('iframe:disconnected', (data) => this._handleDisconnected(data));
        sub('iframePanel:loaded', (data) => this._handleIframeLoaded(data));
        sub('iframePanel:unloaded', (data) => this._handleIframeUnloaded(data));
        sub('jta:saveExported', (data) => this._handleSaveExported(data));
        sub('jta:stateSnapshot', (data) => this._handleStateSnapshot(data));
        sub('jta:detailedStateSnapshot', (data) => this._handleDetailedStateSnapshot(data));
        sub('jta:gameDataReplaced', (data) => this._handleGameDataReplaced(data));
        sub('jta:gameDefsSnapshot', (data) => this._handleGameDefsSnapshot(data));
        sub('jta:zoneChanged', (data) => this._handleZoneChanged(data));
        sub('jta:energyReset', (data) => this._handleEnergyReset(data));
        sub('jta:prestige', (data) => this._handlePrestige(data));
        sub('jta:perkChanged', (data) => this._handlePerkChanged(data));
        sub('jta:perkTaskCompleted', (data) => this._handlePerkTaskCompleted(data));
        sub('jta:perksGranted', (data) => this._handlePerksGranted(data));
    }

    _handleConnected(data) {
        this.isConnected = true;
        this.iframeId = data.iframeId || data.id || '--';
        this.lastConnectedTime = new Date().toLocaleTimeString();
        this._updateConnectionUI();
        log('info', `Connected: ${this.iframeId}`);
    }

    _handleDisconnected(data) {
        this.isConnected = false;
        this._updateConnectionUI();
        log('info', `Disconnected: ${data?.iframeId || ''}`);
    }

    _handleIframeLoaded(data) {
        this.isIframeLoaded = true;
        if (data?.url) this.loadedUrl = data.url;
        log('info', 'Iframe loaded', data);
    }

    _handleIframeUnloaded(data) {
        this.isIframeLoaded = false;
        this.isConnected = false;
        this.iframeId = null;
        this._updateConnectionUI();
        log('info', 'Iframe unloaded', data);
    }

    _handleSaveExported(data) {
        if (data.error) {
            this._setEditorStatus(data.error, true);
            return;
        }

        const saveJson = data.saveJson;
        if (!saveJson) {
            this._setEditorStatus('No save data received', true);
            return;
        }

        // Load into editor
        this._setEditorContent(saveJson);
        this._setEditorStatus('Save data loaded');

        // Parse and update game state summary
        this._parseSaveAndUpdateSummary(saveJson);
    }

    _handleStateSnapshot(data) {
        const state = data.state;
        if (!state) return;

        if (this._gsZone) this._gsZone.textContent = state.currentZone;
        if (this._gsHighestZone) this._gsHighestZone.textContent = state.highestZoneEver;
        if (this._gsEnergy) this._gsEnergy.textContent = `${Math.floor(state.currentEnergy)}/${state.maxEnergy}`;
        if (this._gsResets) this._gsResets.textContent = state.energyResetCount;
        if (this._gsPerks) this._gsPerks.textContent = state.perkCount;
        if (this._gsPrestige) this._gsPrestige.textContent = state.prestigeCount;
    }

    _handleZoneChanged(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        this._addLogEntry(`[${time}] Zone: ${data.previousZone} -> ${data.currentZone} (highest: ${data.highestZone})`);
        // Update zone display
        if (this._gsZone) this._gsZone.textContent = data.currentZone;
        if (this._gsHighestZone) {
            const current = parseInt(this._gsHighestZone.textContent) || 0;
            if (data.highestZone > current) this._gsHighestZone.textContent = data.highestZone;
        }
        // Auto-compare on zone change
        if (this._autoCompare) {
            this.eventBus.publish('jta:requestDetailedState', {});
        }
    }

    _handleEnergyReset(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        this._addLogEntry(`[${time}] Energy reset #${data.resetCount}`);
        if (this._gsResets) this._gsResets.textContent = data.resetCount;
    }

    _handlePrestige(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        this._addLogEntry(`[${time}] Prestige #${data.prestigeCount}`);
        if (this._gsPrestige) this._gsPrestige.textContent = data.prestigeCount;
    }

    _handlePerkChanged(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const newInfo = data.newPerks && data.newPerks.length > 0
            ? ` (new: ${data.newPerks.join(', ')})`
            : '';
        this._addLogEntry(`[${time}] Perks: ${data.perkCount}${newInfo}`);
        if (this._gsPerks) this._gsPerks.textContent = data.perkCount;
    }

    _handlePerkTaskCompleted(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        this._addLogEntry(`[${time}] Location check: "${data.taskName}" (task ${data.taskId})`);
    }

    _handlePerksGranted(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        if (data.success && data.granted && data.granted.length > 0) {
            this._addLogEntry(`[${time}] Perks granted from AP: ${data.granted.join(', ')}`);
        }
    }

    _handleDetailedStateSnapshot(data) {
        const gs = data.state;
        if (!gs) {
            this._setCompareStatus('No game state received', true);
            return;
        }

        try {
            const comparison = compareZoneTasks(gs);
            const summary = stateSummary(gs, comparison.simState);
            this._renderComparison(comparison, summary);
            this._setCompareStatus(`Zone ${comparison.zoneId}: ${comparison.zoneName}`);
        } catch (e) {
            this._setCompareStatus(`Error: ${e.message}`, true);
            log('error', 'Comparison failed:', e);
        }
    }

    _setCompareStatus(msg, isError = false) {
        if (!this._compareStatus) return;
        this._compareStatus.textContent = msg;
        this._compareStatus.style.color = isError ? '#f44336' : '#4CAF50';
    }

    _renderComparison(comparison, summary) {
        // Render state summary
        if (this._compareStateSummary) {
            this._compareStateSummary.style.display = 'block';
            const skills = Object.entries(summary.skills)
                .map(([name, level]) => `${name}: ${level}`)
                .join(', ');
            this._compareStateSummary.innerHTML = `
                <div style="margin-bottom: 4px;"><strong>Zone:</strong> ${summary.zone} | <strong>Energy:</strong> ${summary.energy} | <strong>Resets:</strong> ${summary.resets}</div>
                <div style="margin-bottom: 4px;"><strong>Perks:</strong> ${summary.perks} | <strong>Power:</strong> ${summary.power} | <strong>Attunement:</strong> ${summary.attunement} | <strong>Prestige:</strong> ${summary.prestige}</div>
                <div style="margin-bottom: 4px;"><strong>Artifacts:</strong> Haste: ${summary.artifacts.haste}, Ring: ${summary.artifacts.magicRing}, Lightning: ${summary.artifacts.lightning}</div>
                <div><strong>Skills:</strong> ${skills || 'none'}</div>
            `;
        }

        // Render task comparison table
        if (!this._compareResults) return;

        if (comparison.error) {
            this._compareResults.innerHTML = `<div style="color: #f44336; padding: 8px;">${comparison.error}</div>`;
            return;
        }

        if (comparison.tasks.length === 0) {
            this._compareResults.innerHTML = `<div style="color: #888; padding: 8px;">No tasks in zone ${comparison.zoneId}</div>`;
            return;
        }

        const fmt = (n) => {
            if (n === undefined || n === null) return '--';
            if (Number.isInteger(n)) return n.toLocaleString();
            if (Math.abs(n) >= 100) return n.toFixed(1);
            if (Math.abs(n) >= 1) return n.toFixed(3);
            return n.toFixed(5);
        };

        let html = `
            <table style="width: 100%; border-collapse: collapse; font-size: 11px; font-family: monospace;">
                <thead>
                    <tr style="background: #2a2a2a; border-bottom: 2px solid #555;">
                        <th style="padding: 4px 6px; text-align: left;">Task</th>
                        <th style="padding: 4px 6px; text-align: left;">Type</th>
                        <th style="padding: 4px 6px; text-align: right;">Reps</th>
                        <th style="padding: 4px 6px; text-align: right;">Cost</th>
                        <th style="padding: 4px 6px; text-align: right;">Prog/Tick</th>
                        <th style="padding: 4px 6px; text-align: right;">Ticks</th>
                        <th style="padding: 4px 6px; text-align: right;">Drain/Tick</th>
                        <th style="padding: 4px 6px; text-align: right;">Energy/Rep</th>
                        <th style="padding: 4px 6px; text-align: right;">XP/Rep</th>
                        <th style="padding: 4px 6px; text-align: center;">Flags</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const task of comparison.tasks) {
            if (task.error) {
                html += `<tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 3px 6px; color: #f44336;" colspan="10">${task.name} (${task.id}): ${task.error}</td>
                </tr>`;
                continue;
            }

            const s = task.sim;
            const flags = [
                s.singleTick ? '1T' : '',
                task.hasted ? 'H' : '',
                task.xpBoosted ? 'XP' : '',
                task.lightning ? 'L' : '',
            ].filter(Boolean).join(' ');

            html += `
                <tr style="border-bottom: 1px solid #333;">
                    <td style="padding: 3px 6px;" title="${task.skills}">${task.name}</td>
                    <td style="padding: 3px 6px; color: ${this._taskTypeColor(task.type)};">${task.type}</td>
                    <td style="padding: 3px 6px; text-align: right;">${task.reps}</td>
                    <td style="padding: 3px 6px; text-align: right;">${fmt(s.cost)}</td>
                    <td style="padding: 3px 6px; text-align: right;">${fmt(s.progressPerTick)}</td>
                    <td style="padding: 3px 6px; text-align: right;">${s.ticks}</td>
                    <td style="padding: 3px 6px; text-align: right;">${fmt(s.energyDrainPerTick)}</td>
                    <td style="padding: 3px 6px; text-align: right;">${fmt(s.energyCostPerRep)}</td>
                    <td style="padding: 3px 6px; text-align: right;">${fmt(s.xpPerRep)}</td>
                    <td style="padding: 3px 6px; text-align: center; color: #888;">${flags}</td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        this._compareResults.innerHTML = html;
    }

    _taskTypeColor(type) {
        switch (type) {
            case 'Travel': return '#4fc3f7';
            case 'Mandatory': return '#ffb74d';
            case 'Boss': return '#ef5350';
            case 'Prestige': return '#ce93d8';
            default: return '#ccc';
        }
    }

    // --- UI updates ---

    _updateConnectionUI() {
        if (this._connDot) {
            this._connDot.style.background = this.isConnected ? '#4CAF50' : '#666';
        }
        if (this._connLabel) {
            this._connLabel.textContent = this.isConnected ? 'Connected' : 'Disconnected';
            this._connLabel.style.color = this.isConnected ? '#4CAF50' : '#999';
        }
        if (this._connIframeId) {
            this._connIframeId.textContent = this.iframeId || '--';
        }
        if (this._connLastTime) {
            this._connLastTime.textContent = this.lastConnectedTime || '--';
        }
    }

    _addLogEntry(entry) {
        this.eventLog.unshift(entry);
        if (this.eventLog.length > this.maxLogEntries) {
            this.eventLog.length = this.maxLogEntries;
        }
        this._renderLog();
        log('info', entry);
    }

    _renderLog() {
        if (!this._logEntries) return;
        if (this.eventLog.length === 0) {
            this._logEntries.textContent = 'No events yet';
            this._logEntries.style.color = '#aaa';
            return;
        }
        this._logEntries.style.color = '#ccc';
        this._logEntries.innerHTML = this.eventLog
            .map(entry => `<div style="padding: 1px 0;">${entry}</div>`)
            .join('');
    }

    _setEditorStatus(message, isError = false) {
        if (!this._editorStatus) return;
        this._editorStatus.textContent = message;
        this._editorStatus.style.color = isError ? '#f44336' : '#4CAF50';
        if (!isError) {
            setTimeout(() => {
                if (this._editorStatus) this._editorStatus.textContent = '';
            }, 3000);
        }
    }

    // --- Game state parsing ---

    _parseSaveAndUpdateSummary(saveJson) {
        try {
            const save = JSON.parse(saveJson);

            if (this._gsZone) this._gsZone.textContent = save.current_zone ?? '--';
            if (this._gsHighestZone) this._gsHighestZone.textContent = save.highest_zone_ever ?? save.highest_zone ?? '--';

            const energy = save.current_energy;
            const maxEnergy = save.max_energy;
            if (this._gsEnergy) {
                this._gsEnergy.textContent = energy != null && maxEnergy != null
                    ? `${Math.floor(energy)}/${maxEnergy}`
                    : '--';
            }

            if (this._gsResets) this._gsResets.textContent = save.energy_reset_count ?? '--';

            // Perks are saved as array of [perkType, boolean] entries
            let perkCount = '--';
            if (Array.isArray(save.perks)) {
                perkCount = save.perks.filter(([, owned]) => owned).length;
            }
            if (this._gsPerks) this._gsPerks.textContent = perkCount;

            if (this._gsPrestige) this._gsPrestige.textContent = save.prestige_count ?? '--';

        } catch (e) {
            log('warn', 'Failed to parse save for summary:', e.message);
        }
    }

    // --- CodeMirror 6 Editors ---

    async _ensureCM6() {
        if (!this.cm6Module) {
            this.cm6Module = await import('../../modules/editorCodeMirror6/codemirror6Imports.js');
        }
        return this.cm6Module;
    }

    async _initViewerEditor() {
        if (this._viewerEditorView) return;

        try {
            const cm6 = await this._ensureCM6();
            const { EditorView, EditorState, lineNumbers, highlightActiveLine,
                drawSelection, history, foldGutter, json, oneDark, keymap,
                defaultKeymap, historyKeymap, foldKeymap
            } = cm6;

            const extensions = [
                lineNumbers(),
                highlightActiveLine(),
                drawSelection(),
                history(),
                foldGutter(),
                json(),
                oneDark,
                EditorView.lineWrapping,
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                ]),
            ];

            this._viewerEditorView = new EditorView({
                state: EditorState.create({
                    doc: this._pendingViewerContent || '',
                    extensions,
                }),
                parent: this._viewerMount,
            });
            this._pendingViewerContent = null;

            if (this._viewerEmpty) {
                this._viewerEmpty.style.display = this._viewerEditorView.state.doc.length ? 'none' : 'flex';
            }

            log('info', 'CM6 game data viewer initialized');
        } catch (e) {
            log('error', 'Failed to initialize CM6 viewer:', e);
        }
    }

    async _initEditor() {
        if (this.editorInitialized) return;
        this.editorInitialized = true;

        try {
            const cm6 = await this._ensureCM6();
            const {
                EditorView, EditorState, lineNumbers, highlightActiveLine,
                drawSelection, history, foldGutter, json, oneDark, keymap,
                defaultKeymap, historyKeymap, foldKeymap
            } = cm6;

            const extensions = [
                lineNumbers(),
                highlightActiveLine(),
                drawSelection(),
                history(),
                foldGutter(),
                json(),
                oneDark,
                EditorView.lineWrapping,
                keymap.of([
                    ...defaultKeymap,
                    ...historyKeymap,
                    ...foldKeymap,
                ]),
            ];

            this.editorView = new EditorView({
                state: EditorState.create({
                    doc: '',
                    extensions,
                }),
                parent: this._editorMount,
            });

            log('info', 'CM6 editor initialized');
        } catch (e) {
            log('error', 'Failed to initialize CM6 editor:', e);
            this._setEditorStatus('Editor init failed: ' + e.message, true);
        }
    }

    _setEditorContent(jsonString) {
        // Hide empty overlay
        if (this._editorEmpty) {
            this._editorEmpty.style.display = 'none';
        }

        // Pretty-print
        let formatted = jsonString;
        try {
            formatted = JSON.stringify(JSON.parse(jsonString), null, 2);
        } catch (e) {
            // Use raw string if not valid JSON
        }

        if (this.editorView) {
            this.editorView.dispatch({
                changes: {
                    from: 0,
                    to: this.editorView.state.doc.length,
                    insert: formatted,
                },
            });
        } else {
            // Editor not yet initialized - open the section and init
            const saveSection = this.rootElement.querySelector('.jta-section-body[data-section="saveEditor"]');
            const saveHeader = this.rootElement.querySelector('.jta-section-header[data-section="saveEditor"]');
            if (saveSection && saveSection.style.display === 'none') {
                saveSection.style.display = 'block';
                const arrow = saveHeader?.querySelector('.jta-section-arrow');
                if (arrow) arrow.textContent = '\u25BC';
            }
            this._initEditor().then(() => {
                if (this.editorView) {
                    this.editorView.dispatch({
                        changes: {
                            from: 0,
                            to: this.editorView.state.doc.length,
                            insert: formatted,
                        },
                    });
                }
            });
        }
    }

    _getEditorContent() {
        if (!this.editorView) return '';
        return this.editorView.state.doc.toString();
    }

    // --- Auto-load on preset selection ---

    _checkInitialPreset() {
        // Handle URL-based loading (e.g. ?game=jta&seed=1).
        // modeDataLoader resolves the rules file during init but doesn't
        // publish files:jsonLoaded, so _handlePresetLoaded never fires.
        // Poll briefly for G_combinedModeData which is set after Phase 8.
        let attempts = 0;
        const check = () => {
            this._initialPresetTimer = null;
            // Don't double-load if files:jsonLoaded already triggered
            if (this._currentLoadedFile) return;

            const details = window.G_combinedModeData?.dataSources?.rulesConfig?.details;
            if (details && details.includes('/jta/')) {
                // Extract path from details like "Loaded from URL parameter override: ./presets/jta/AP_X/..."
                const pathMatch = details.match(/(\.\/presets\/jta\/[^/]+\/)/);
                if (pathMatch) {
                    log('info', 'JTA preset detected from URL params, triggering auto-load');
                    this._handlePresetLoaded({ sourceName: pathMatch[1] });
                }
                return;
            }
            if (++attempts < 20) {
                this._initialPresetTimer = setTimeout(check, 100);
            }
        };
        this._initialPresetTimer = setTimeout(check, 100);
    }

    async _handlePresetLoaded(data) {
        const source = data.sourceName || '';
        // Only act on JTA presets
        if (!source.includes('/jta/')) return;

        // Extract the preset base path: presets/jta/AP_SEED
        const match = source.match(/(\.\/)?presets\/jta\/([^/]+)\//);
        if (!match) return;

        const seedFolder = match[2];
        const basePath = `presets/jta/${seedFolder}`;

        log('info', `JTA preset detected: ${seedFolder}, auto-loading game data`);

        // Discover available files
        const preset = await this._discoverPreset();
        if (!preset || preset.folderName !== seedFolder) {
            log('warn', `Preset mismatch: expected ${seedFolder}`);
            return;
        }

        // Try costs file first, fall back to gamedata
        const costsFile = preset.files.find(f => f.endsWith('_costs.json'));
        const gamedataFile = preset.files.find(f => f.endsWith('_gamedata.json'));
        const fileToLoad = costsFile || gamedataFile;

        if (!fileToLoad) {
            log('warn', 'No game data file found in JTA preset');
            return;
        }

        const label = costsFile ? 'adjusted costs' : 'randomized data';
        try {
            const resp = await fetch(`${basePath}/${fileToLoad}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const gameData = await resp.json();

            this._applyGameData(gameData, fileToLoad);
            this._setLoadedDataStatus(fileToLoad, label);
            this._addLogEntry(`Auto-loaded ${label}: ${fileToLoad}`);
        } catch (e) {
            log('error', `Failed to auto-load ${fileToLoad}:`, e);
            this._addLogEntry(`Failed to auto-load ${label}: ${e.message}`);
        }
    }

    _setLoadedDataStatus(fileName, label) {
        this._currentLoadedFile = fileName;
        this._currentLoadedLabel = label;
        if (this._loadedDataLabel) {
            this._loadedDataLabel.textContent = `${label} (${fileName})`;
            this._loadedDataLabel.style.color = '#4CAF50';
        }
    }

    // --- Game Data Loading ---

    async _discoverPreset() {
        try {
            const resp = await fetch('presets/preset_files.json');
            const index = await resp.json();
            const jta = index.jta;
            if (!jta || !jta.folders) return null;

            const folderName = Object.keys(jta.folders)[0];
            if (!folderName) return null;

            const folder = jta.folders[folderName];
            return { folderName, files: folder.files, basePath: `presets/jta/${folderName}` };
        } catch (e) {
            log('warn', 'Failed to discover JTA preset:', e.message);
            return null;
        }
    }

    async _loadPresetFile(type) {
        const statusEl = this._loadStatus;
        const setStatus = (msg, isError) => {
            if (statusEl) {
                statusEl.textContent = msg;
                statusEl.style.color = isError ? '#f44336' : '#4CAF50';
            }
        };

        setStatus('Discovering preset...', false);
        const preset = await this._discoverPreset();
        if (!preset) {
            setStatus('No JTA preset found', true);
            return;
        }

        const suffix = type === 'costs' ? '_costs.json' : '_gamedata.json';
        const file = preset.files.find(f => f.endsWith(suffix));
        if (!file) {
            setStatus(`No ${type} file found in preset`, true);
            return;
        }

        setStatus(`Loading ${file}...`, false);
        try {
            const resp = await fetch(`${preset.basePath}/${file}`);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = await resp.json();
            this._applyGameData(data, file);
            const label = type === 'costs' ? 'adjusted costs' : 'randomized data';
            this._setLoadedDataStatus(file, label);
            setStatus(`Applied ${file} (${data.zones?.length || 0} zones)`, false);
        } catch (e) {
            setStatus(`Failed to load: ${e.message}`, true);
        }
    }

    _handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                this._applyGameData(data, file.name);
                const label = file.name.includes('costs') ? 'adjusted costs' : 'uploaded file';
                this._setLoadedDataStatus(file.name, label);
                if (this._loadStatus) {
                    this._loadStatus.textContent = `Applied ${file.name}`;
                    this._loadStatus.style.color = '#4CAF50';
                }
            } catch (err) {
                if (this._loadStatus) {
                    this._loadStatus.textContent = `Invalid JSON: ${err.message}`;
                    this._loadStatus.style.color = '#f44336';
                }
            }
        };
        reader.readAsText(file);
        // Reset input so the same file can be re-uploaded
        event.target.value = '';
    }

    _applyGameData(data, sourceName) {
        if (!data.zones || !Array.isArray(data.zones)) {
            log('warn', `${sourceName}: no zones array found`);
            if (this._loadStatus) {
                this._loadStatus.textContent = 'Invalid game data: no zones array';
                this._loadStatus.style.color = '#f44336';
            }
            return;
        }
        this._loadedGameData = data;
        this._updateGameDataViewer();
        // Forward all data sections to the game client
        const payload = { zones: data.zones };
        if (data.skills) payload.skills = data.skills;
        if (data.items) payload.items = data.items;
        if (data.perks) payload.perks = data.perks;
        if (data.prestigeUnlocks) payload.prestigeUnlocks = data.prestigeUnlocks;
        if (data.prestigeRepeatables) payload.prestigeRepeatables = data.prestigeRepeatables;
        if (data.prestige) payload.prestige = data.prestige;
        if (data.renderingConstants) payload.renderingConstants = data.renderingConstants;
        this.eventBus.publish('jta:replaceGameData', payload);
        log('info', `Applied game data from ${sourceName}: ${data.zones.length} zones`);
    }

    _updateGameDataViewer() {
        if (!this._viewerStatus) return;
        const data = this._loadedGameData;
        if (!data) {
            this._viewerStatus.textContent = 'No game data loaded.';
            if (this._viewerEmpty) this._viewerEmpty.style.display = 'flex';
            return;
        }
        const zones = data.zones?.length || 0;
        const tasks = data.zones?.reduce((n, z) => n + (z.tasks?.length || 0), 0) || 0;
        this._viewerStatus.textContent = `${zones} zones, ${tasks} tasks`;

        const formatted = JSON.stringify(data, null, 2);
        if (this._viewerEditorView) {
            if (this._viewerEmpty) this._viewerEmpty.style.display = 'none';
            this._viewerEditorView.dispatch({
                changes: {
                    from: 0,
                    to: this._viewerEditorView.state.doc.length,
                    insert: formatted,
                },
            });
        } else {
            // Editor not yet initialized — store content for when it inits
            this._pendingViewerContent = formatted;
        }
    }

    _loadGameDataFromGame() {
        this._setViewerStatus('Requesting game data...');
        this.eventBus.publish('jta:requestGameDefs', {});
    }

    _handleGameDefsSnapshot(data) {
        if (!data.zones) {
            this._setViewerStatus('No zone data received from game', true);
            return;
        }
        const gameData = { zones: data.zones };
        if (data.skills) gameData.skills = data.skills;
        if (data.items) gameData.items = data.items;
        if (data.perks) gameData.perks = data.perks;
        if (data.prestigeUnlocks) gameData.prestigeUnlocks = data.prestigeUnlocks;
        if (data.prestigeRepeatables) gameData.prestigeRepeatables = data.prestigeRepeatables;
        if (data.renderingConstants) gameData.renderingConstants = data.renderingConstants;
        this._loadedGameData = gameData;
        this._updateGameDataViewer();
        const parts = [`${data.zones.length} zones`];
        if (data.skills) parts.push(`${data.skills.length} skills`);
        if (data.items) parts.push(`${data.items.length} items`);
        if (data.perks) parts.push(`${Object.keys(data.perks).length} perks`);
        this._setViewerStatus(`Loaded from game: ${parts.join(', ')}`);
    }

    _applyViewerToGame() {
        if (!this._viewerEditorView) {
            this._setViewerStatus('Editor not initialized', true);
            return;
        }
        const content = this._viewerEditorView.state.doc.toString();
        if (!content.trim()) {
            this._setViewerStatus('Editor is empty', true);
            return;
        }
        let data;
        try {
            data = JSON.parse(content);
        } catch (e) {
            this._setViewerStatus('Invalid JSON: ' + e.message, true);
            return;
        }
        this._applyGameData(data, 'editor');
        this._setLoadedDataStatus('editor', 'manual edit');
        this._setViewerStatus('Applied to game');
    }

    _setViewerStatus(msg, isError) {
        if (this._viewerStatus) {
            this._viewerStatus.textContent = msg;
            this._viewerStatus.style.color = isError ? '#f44336' : '#999';
        }
    }

    _handleGameDataReplaced(data) {
        if (data.error) {
            log('warn', 'Game data replace failed:', data.error);
            return;
        }
        const parts = [];
        if (data.tasks) parts.push(`${data.tasks} tasks`);
        if (data.tasksNotFound) parts.push(`${data.tasksNotFound} not found`);
        if (data.skills) parts.push(`${data.skills} skills`);
        if (data.items) parts.push(`${data.items} items`);
        if (data.perks) parts.push(`${data.perks} perks`);
        if (data.prestigeUnlocks) parts.push(`${data.prestigeUnlocks} prestige unlocks`);
        if (data.prestigeRepeatables) parts.push(`${data.prestigeRepeatables} prestige repeatables`);
        if (data.renderingConstants) parts.push(`${data.renderingConstants} rendering constants`);
        this._addLogEntry(`Game data applied: ${parts.join(', ')}`);
    }

    // --- Cost Adjustment ---

    async _runCostAdjustment() {
        const setStatus = (msg, isError) => {
            if (this._costStatus) {
                this._costStatus.textContent = msg;
                this._costStatus.style.color = isError ? '#f44336' : '#4CAF50';
            }
        };

        setStatus('Discovering preset files...', false);
        const preset = await this._discoverPreset();
        if (!preset) {
            setStatus('No JTA preset found. Generate a seed first.', true);
            return;
        }

        // Find gamedata and sphere log
        const gamedataFile = preset.files.find(f => f.endsWith('_gamedata.json'));
        const sphereLogFile = preset.files.find(f => f.endsWith('_sphere_log.jsonl'));

        if (!gamedataFile) {
            setStatus('No gamedata file found in preset', true);
            return;
        }
        if (!sphereLogFile) {
            setStatus('No sphere log found in preset', true);
            return;
        }

        setStatus('Loading game data and sphere log...', false);
        try {
            const [gamedataResp, sphereLogResp] = await Promise.all([
                fetch(`${preset.basePath}/${gamedataFile}`),
                fetch(`${preset.basePath}/${sphereLogFile}`),
            ]);

            if (!gamedataResp.ok) throw new Error(`Failed to load gamedata: HTTP ${gamedataResp.status}`);
            if (!sphereLogResp.ok) throw new Error(`Failed to load sphere log: HTTP ${sphereLogResp.status}`);

            const gamedataJson = await gamedataResp.json();
            const sphereLogContent = await sphereLogResp.text();

            const resetsPerSphere = parseInt(this._costResetsInput?.value) || 5;

            setStatus(`Running cost adjustment (r=${resetsPerSphere})...`, false);

            // Run async to avoid blocking UI
            await new Promise(resolve => setTimeout(resolve, 10));

            const startTime = performance.now();
            const { adjustedData, log: adjLog, mandatoryLog } = adjustCosts(
                gamedataJson, sphereLogContent, { resetsPerSphere }
            );
            const elapsed = Math.round(performance.now() - startTime);

            // Store results for apply/download
            this._lastAdjustedData = adjustedData;
            this._lastAdjustmentLog = adjLog;
            this._lastMandatoryLog = mandatoryLog;

            // Show results
            const adjusted = adjLog.filter(e => e.oldCost !== e.newCost);
            const bottlenecked = adjLog.filter(e => e.bottleneck);

            setStatus(
                `Done in ${elapsed}ms: ${adjLog.length} tasks, ${adjusted.length} adjusted` +
                (bottlenecked.length ? `, ${bottlenecked.length} bottlenecked` : ''),
                false
            );

            this._renderCostResults(adjLog, mandatoryLog);
            if (this._costActions) this._costActions.style.display = 'flex';

        } catch (e) {
            setStatus(`Error: ${e.message}`, true);
            log('error', 'Cost adjustment failed:', e);
        }
    }

    _renderCostResults(adjLog, mandatoryLog) {
        if (!this._costResults) return;
        this._costResults.style.display = 'block';

        let html = '';

        // Mandatory/XP adjustments
        if (mandatoryLog.length > 0) {
            html += '<div style="margin-bottom: 8px; padding: 6px; background: #2d2d30; border: 1px solid #555; border-radius: 3px;">';
            html += '<div style="font-weight: bold; margin-bottom: 4px;">Zone Adjustments:</div>';
            for (const entry of mandatoryLog) {
                if (entry.type === 'xp_boost') {
                    html += `<div style="color: #81c784;">XP boost for ${entry.trigger}: ${entry.multiplier.toFixed(2)}x (${entry.count} tasks)</div>`;
                } else {
                    html += `<div style="color: #ffb74d;">Cost reduction for ${entry.trigger}: ${entry.multiplier.toFixed(4)}x (${entry.count} tasks)</div>`;
                }
            }
            html += '</div>';
        }

        // Task adjustments table
        const adjusted = adjLog.filter(e => e.oldCost !== e.newCost);
        if (adjusted.length > 0) {
            html += '<table style="width: 100%; border-collapse: collapse; font-family: monospace;">';
            html += `<thead><tr style="background: #2a2a2a; border-bottom: 2px solid #555;">
                <th style="padding: 3px 6px; text-align: left;">Task</th>
                <th style="padding: 3px 6px; text-align: left;">Zone</th>
                <th style="padding: 3px 6px; text-align: right;">Old</th>
                <th style="padding: 3px 6px; text-align: right;">New</th>
                <th style="padding: 3px 6px; text-align: right;">Resets</th>
            </tr></thead><tbody>`;
            for (const entry of adjusted) {
                const dir = entry.newCost > entry.oldCost ? '#81c784' : '#ffb74d';
                const bn = entry.bottleneck ? ' style="color: #f44336;"' : '';
                html += `<tr style="border-bottom: 1px solid #333;"${bn}>
                    <td style="padding: 2px 6px;">${entry.task}</td>
                    <td style="padding: 2px 6px;">${entry.zone}</td>
                    <td style="padding: 2px 6px; text-align: right;">${entry.oldCost.toFixed(2)}</td>
                    <td style="padding: 2px 6px; text-align: right; color: ${dir};">${entry.newCost.toFixed(2)}</td>
                    <td style="padding: 2px 6px; text-align: right;">${entry.resets}/${entry.targetResets}</td>
                </tr>`;
            }
            html += '</tbody></table>';
        }

        this._costResults.innerHTML = html;
    }

    _setMinCosts() {
        if (!this._loadedGameData) {
            if (this._costStatus) {
                this._costStatus.textContent = 'No game data loaded. Load game data first.';
                this._costStatus.style.color = '#f44336';
            }
            return;
        }
        const minData = JSON.parse(JSON.stringify(this._loadedGameData));
        let count = 0;
        for (const zone of minData.zones) {
            for (const task of zone.tasks) {
                task.costMult = 0.01;
                count++;
            }
        }
        this._applyGameData(minData, 'minimum costs');
        this._setLoadedDataStatus('minimum costs', 'all costs set to minimum');
        if (this._costStatus) {
            this._costStatus.textContent = `Set ${count} tasks to minimum costMult (0.01)`;
            this._costStatus.style.color = '#4CAF50';
        }
    }

    _applyCostsToGame() {
        if (!this._lastAdjustedData) {
            if (this._costStatus) {
                this._costStatus.textContent = 'No adjusted data available. Run cost adjustment first.';
                this._costStatus.style.color = '#f44336';
            }
            return;
        }
        this._applyGameData(this._lastAdjustedData, 'cost adjustment');
        this._setLoadedDataStatus('in-browser cost adjustment', 'adjusted costs (generated)');
        if (this._costStatus) {
            this._costStatus.textContent = 'Applied adjusted costs to game';
            this._costStatus.style.color = '#4CAF50';
        }
    }

    _downloadCosts() {
        if (!this._lastAdjustedData) {
            if (this._costStatus) {
                this._costStatus.textContent = 'No adjusted data available. Run cost adjustment first.';
                this._costStatus.style.color = '#f44336';
            }
            return;
        }
        const json = JSON.stringify(this._lastAdjustedData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'jta_adjusted_costs.json';
        a.click();
        URL.revokeObjectURL(url);
    }

    // --- Golden Layout lifecycle ---

    show() {}
    hide() {}
    focus() {}

    dispose() {
        log('info', 'JTAGameDataPanelUI disposing...');

        // Cancel initial preset check timer
        if (this._initialPresetTimer) {
            clearTimeout(this._initialPresetTimer);
            this._initialPresetTimer = null;
        }

        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this.unsubscribeHandles = [];

        // Destroy CM6 editors
        if (this._viewerEditorView) {
            this._viewerEditorView.destroy();
            this._viewerEditorView = null;
        }
        if (this.editorView) {
            this.editorView.destroy();
            this.editorView = null;
        }

        // Clear state
        this.eventLog = [];
        this.cm6Module = null;
        this._connDot = null;
        this._connLabel = null;
        this._connIframeId = null;
        this._connLastTime = null;
        this._gsZone = null;
        this._gsHighestZone = null;
        this._gsEnergy = null;
        this._gsResets = null;
        this._gsPerks = null;
        this._gsPrestige = null;
        this._refreshBtn = null;
        this._compareBtn = null;
        this._autoCompareCb = null;
        this._compareStatus = null;
        this._compareStateSummary = null;
        this._compareResults = null;
        this._logEntries = null;
        this._logClearBtn = null;
        this._loadedDataLabel = null;
        this._currentLoadedFile = null;
        this._currentLoadedLabel = null;
        this._loadGamedataBtn = null;
        this._loadCostsBtn = null;
        this._uploadGamedataInput = null;
        this._loadStatus = null;
        this._viewerLoadBtn = null;
        this._viewerApplyBtn = null;
        this._viewerStatus = null;
        this._viewerEmpty = null;
        this._viewerMount = null;
        this._loadedGameData = null;
        this._pendingViewerContent = null;
        this._costResetsInput = null;
        this._runCostAdjustBtn = null;
        this._costStatus = null;
        this._costResults = null;
        this._costActions = null;
        this._applyCostsBtn = null;
        this._downloadCostsBtn = null;
        this._minCostsBtn = null;
        this._lastAdjustedData = null;
        this._lastAdjustmentLog = null;
        this._lastMandatoryLog = null;
        this._exportBtn = null;
        this._importBtn = null;
        this._editorStatus = null;
        this._editorWrapper = null;
        this._editorEmpty = null;
        this._editorMount = null;
    }
}

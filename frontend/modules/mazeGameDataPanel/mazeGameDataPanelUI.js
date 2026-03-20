// UI component for maze game data panel module
import { getModuleEventBus } from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('mazeGameDataPanelUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[mazeGameDataPanelUI] ${message}`, ...data);
    }
}

// Biome cost table: individual cost per biome level
const BIOME_COSTS = [0, 200, 400, 1000, 2000, 4000, 6000, 10000, 15000, 25000, 50000];

// Cumulative costs: total points needed to reach biome N from 0
const BIOME_CUMULATIVE = BIOME_COSTS.reduce((acc, cost, i) => {
    acc.push((acc[i - 1] || 0) + cost);
    return acc;
}, []);

export class MazeGameDataPanelUI {
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

        // Completion log
        this.completionLog = [];
        this.maxLogEntries = 50;

        // CM6 editor
        this.editorView = null;
        this.editorInitialized = false;
        this.cm6Module = null;

        // Section elements
        this.sections = {};

        // Event subscriptions
        this.unsubscribeHandles = [];

        this.initialize();
        this.setupEventSubscriptions();

        log('info', 'MazeGameDataPanelUI initialized');
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
        this.rootElement.className = 'maze-game-data-panel-container';
        this.rootElement.style.cssText = 'height: 100%; overflow: auto; background: #1e1e1e; color: #cccccc;';
        this.rootElement.innerHTML = this._createPanelHTML();
        this._cacheElements();
        this._setupDomListeners();
    }

    _createPanelHTML() {
        return `
            <div class="maze-game-data-panel" style="padding: 15px;">
                <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #cccccc;">Maze Game Data</h3>

                <!-- Connection Status Section -->
                ${this._sectionHTML('connection', 'Connection Status', true, `
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                        <span class="mgd-conn-dot" style="
                            width: 10px; height: 10px; border-radius: 50%;
                            background: #666; display: inline-block;
                        "></span>
                        <span class="mgd-conn-label" style="font-size: 12px;">Disconnected</span>
                    </div>
                    <div style="font-size: 11px; color: #999;">
                        <div>Iframe ID: <span class="mgd-conn-iframe-id">--</span></div>
                        <div>Last connected: <span class="mgd-conn-last-time">--</span></div>
                    </div>
                `)}

                <!-- Game State Summary Section -->
                ${this._sectionHTML('gameState', 'Game State Summary', true, `
                    <div class="mgd-game-state-grid" style="
                        display: grid; grid-template-columns: 1fr 1fr;
                        gap: 4px 12px; font-size: 11px; margin-bottom: 8px;
                    ">
                        <div>Biome: <strong class="mgd-gs-biome">--</strong></div>
                        <div>Points: <strong class="mgd-gs-points">--</strong></div>
                        <div>Mazes: <strong class="mgd-gs-mazes">--</strong></div>
                        <div>Bot upgrades: <strong class="mgd-gs-bots">--</strong></div>
                    </div>
                    <button class="mgd-refresh-btn" style="
                        padding: 4px 12px; background: #444; color: #ccc;
                        border: 1px solid #555; border-radius: 3px; cursor: pointer;
                        font-size: 11px;
                    ">Refresh</button>
                `)}

                <!-- Completion Log Section -->
                ${this._sectionHTML('completionLog', 'Completion Log', true, `
                    <div class="mgd-log-container" style="
                        max-height: 200px; overflow-y: auto; font-size: 11px;
                        font-family: monospace; background: #2d2d30;
                        border: 1px solid #555; border-radius: 3px; padding: 6px;
                        min-height: 40px;
                    ">
                        <div class="mgd-log-entries" style="color: #aaa;">No completions yet</div>
                    </div>
                    <button class="mgd-log-clear-btn" style="
                        padding: 4px 12px; background: #444; color: #ccc;
                        border: 1px solid #555; border-radius: 3px; cursor: pointer;
                        font-size: 11px; margin-top: 6px;
                    ">Clear</button>
                `)}

                <!-- Quick Actions Section -->
                ${this._sectionHTML('quickActions', 'Quick Actions', false, `
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px;">Inject Points:</label>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <input type="number" class="mgd-inject-points-input" placeholder="e.g. 50000"
                                style="
                                    flex: 1; padding: 5px; background: #2d2d30; color: #ccc;
                                    border: 1px solid #555; border-radius: 3px; font-size: 11px;
                                ">
                            <button class="mgd-inject-btn" style="
                                padding: 5px 10px; background: #444; color: #ccc;
                                border: 1px solid #555; border-radius: 3px; cursor: pointer;
                                font-size: 11px; white-space: nowrap;
                            ">Inject & Reload</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px;">Advance to Biome:</label>
                        <div style="display: flex; gap: 6px; align-items: center;">
                            <select class="mgd-biome-select" style="
                                flex: 1; padding: 5px; background: #2d2d30; color: #ccc;
                                border: 1px solid #555; border-radius: 3px; font-size: 11px;
                            ">
                                ${Array.from({ length: 10 }, (_, i) => `<option value="${i}">Biome ${i} (${BIOME_CUMULATIVE[i].toLocaleString()} pts total)</option>`).join('')}
                            </select>
                            <button class="mgd-advance-btn" style="
                                padding: 5px 10px; background: #444; color: #ccc;
                                border: 1px solid #555; border-radius: 3px; cursor: pointer;
                                font-size: 11px;
                            ">Advance</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 4px; font-size: 11px;">Maze Control:</label>
                        <button class="mgd-new-maze-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Generate New Maze</button>
                    </div>
                    <div style="margin-bottom: 10px;">
                        <label style="display: flex; align-items: center; gap: 6px; font-size: 11px; cursor: pointer;">
                            <input type="checkbox" class="mgd-disable-biome-check-cb">
                            Disable biome check (unlock all upgrades)
                        </label>
                        <div style="font-size: 10px; color: #777; margin-top: 2px; margin-left: 20px;">
                            Zeroes out biome requirements so upgrades take effect at any biome level. Resets on reload.
                        </div>
                    </div>
                    <div class="mgd-action-feedback" style="
                        font-size: 11px; margin-top: 6px; min-height: 16px;
                    "></div>
                `)}

                <!-- Save Data Editor Section -->
                ${this._sectionHTML('saveEditor', 'Save Data Editor', false, `
                    <div style="margin-bottom: 8px; display: flex; gap: 6px; align-items: center;">
                        <button class="mgd-export-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Export from Game</button>
                        <button class="mgd-import-btn" style="
                            padding: 5px 10px; background: #444; color: #ccc;
                            border: 1px solid #555; border-radius: 3px; cursor: pointer;
                            font-size: 11px;
                        ">Import to Game</button>
                        <span class="mgd-editor-status" style="font-size: 11px; color: #999;"></span>
                    </div>
                    <div class="mgd-editor-wrapper" style="
                        border: 1px solid #555; border-radius: 3px;
                        min-height: 200px; position: relative;
                    ">
                        <div class="mgd-editor-empty" style="
                            position: absolute; inset: 0; display: flex;
                            align-items: center; justify-content: center;
                            color: #666; font-size: 12px; pointer-events: none;
                        ">Click "Export from Game" to load save data</div>
                        <div class="mgd-editor-mount" style="height: 300px; overflow-y: auto;"></div>
                    </div>
                `)}
            </div>
        `;
    }

    _sectionHTML(id, title, defaultOpen, content) {
        const arrow = defaultOpen ? '\u25BC' : '\u25B6';
        const display = defaultOpen ? 'block' : 'none';
        return `
            <div class="mgd-section" data-section="${id}" style="margin-bottom: 12px;">
                <div class="mgd-section-header" data-section="${id}" style="
                    cursor: pointer; padding: 6px 8px; background: #2a2a2a;
                    border: 1px solid #444; border-radius: 3px;
                    font-size: 12px; font-weight: bold; user-select: none;
                    display: flex; align-items: center; gap: 6px;
                " title="Click to toggle">
                    <span class="mgd-section-arrow">${arrow}</span>
                    ${title}
                </div>
                <div class="mgd-section-body" data-section="${id}" style="
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
        this._connDot = q('.mgd-conn-dot');
        this._connLabel = q('.mgd-conn-label');
        this._connIframeId = q('.mgd-conn-iframe-id');
        this._connLastTime = q('.mgd-conn-last-time');

        // Game state
        this._gsBiome = q('.mgd-gs-biome');
        this._gsPoints = q('.mgd-gs-points');
        this._gsMazes = q('.mgd-gs-mazes');
        this._gsBots = q('.mgd-gs-bots');
        this._refreshBtn = q('.mgd-refresh-btn');

        // Completion log
        this._logEntries = q('.mgd-log-entries');
        this._logClearBtn = q('.mgd-log-clear-btn');

        // Quick actions
        this._injectInput = q('.mgd-inject-points-input');
        this._injectBtn = q('.mgd-inject-btn');
        this._biomeSelect = q('.mgd-biome-select');
        this._advanceBtn = q('.mgd-advance-btn');
        this._newMazeBtn = q('.mgd-new-maze-btn');
        this._disableBiomeCheckCb = q('.mgd-disable-biome-check-cb');
        this._actionFeedback = q('.mgd-action-feedback');

        // Save editor
        this._exportBtn = q('.mgd-export-btn');
        this._importBtn = q('.mgd-import-btn');
        this._editorStatus = q('.mgd-editor-status');
        this._editorWrapper = q('.mgd-editor-wrapper');
        this._editorEmpty = q('.mgd-editor-empty');
        this._editorMount = q('.mgd-editor-mount');
    }

    _setupDomListeners() {
        // Section toggle headers
        this.rootElement.querySelectorAll('.mgd-section-header').forEach(header => {
            header.addEventListener('click', () => {
                const sectionId = header.dataset.section;
                const body = this.rootElement.querySelector(`.mgd-section-body[data-section="${sectionId}"]`);
                const arrow = header.querySelector('.mgd-section-arrow');
                if (!body) return;
                const isOpen = body.style.display !== 'none';
                body.style.display = isOpen ? 'none' : 'block';
                arrow.textContent = isOpen ? '\u25B6' : '\u25BC';

                // Lazy-init CM6 editor on first expand of save editor section
                if (sectionId === 'saveEditor' && !isOpen && !this.editorInitialized) {
                    this._initEditor();
                }
            });
        });

        // Refresh button
        if (this._refreshBtn) {
            this._refreshBtn.addEventListener('click', () => {
                this.eventBus.publish('amazingIdle:exportSave', {});
                this._refreshBtn.textContent = 'Refreshing...';
                setTimeout(() => { this._refreshBtn.textContent = 'Refresh'; }, 2000);
            });
        }

        // Clear log button
        if (this._logClearBtn) {
            this._logClearBtn.addEventListener('click', () => {
                this.completionLog = [];
                this._renderLog();
            });
        }

        // Inject points button
        if (this._injectBtn) {
            this._injectBtn.addEventListener('click', () => {
                const points = parseInt(this._injectInput.value, 10);
                if (isNaN(points) || points <= 0) {
                    this._showFeedback('Enter a valid positive number', true);
                    return;
                }
                const data = { points };
                if (this._disableBiomeCheckCb?.checked) data.disableBiomeCheck = true;
                this.eventBus.publish('amazingIdle:injectPoints', data);
                this._showFeedback(`Injecting ${points.toLocaleString()} points...`);
            });
        }

        // Set biome button
        if (this._advanceBtn) {
            this._advanceBtn.addEventListener('click', () => {
                const targetBiome = parseInt(this._biomeSelect.value, 10);
                const data = { biome: targetBiome };
                if (this._disableBiomeCheckCb?.checked) data.disableBiomeCheck = true;
                this.eventBus.publish('amazingIdle:setBiome', data);
                this._showFeedback(`Setting biome to ${targetBiome}...`);
            });
        }

        // Generate new maze button (reload iframe)
        if (this._newMazeBtn) {
            this._newMazeBtn.addEventListener('click', () => {
                this.eventBus.publish('amazingIdle:newMaze', {});
                this._showFeedback('Generating new maze...');
            });
        }

        // Disable biome check checkbox
        if (this._disableBiomeCheckCb) {
            this._disableBiomeCheckCb.addEventListener('change', () => {
                if (this._disableBiomeCheckCb.checked) {
                    const targetBiome = parseInt(this._biomeSelect.value, 10) || 0;
                    this.eventBus.publish('amazingIdle:setBiome', {
                        biome: targetBiome,
                        disableBiomeCheck: true,
                        upgrades: {
                            AUTO_MOVE: 1,
                            BOT_MOVEMENT_SPEED: 5,
                            AVOID_REVISIT_LAST_POSITION: 1,
                            PRIORITIZE_UNVISITED: 1,
                            AUTO_EXIT_MAZE: 5,
                            BOT_REMEMBER_DEADEND_TILES: 5,
                            PLAYER_MOVE_INDEPENDENTLY: 1,
                            CLICK_TO_MOVE_UPGRADE: 1,
                            CLICK_TO_MOVE_SPEED_MULTIPLIER_UPGRADE: 5,
                        }
                    });
                    this._showFeedback('Disabling biome check & applying upgrades (reloading)...');
                } else {
                    this._showFeedback('Biome check re-enabled on next reload');
                }
            });
        }

        // Export button
        if (this._exportBtn) {
            this._exportBtn.addEventListener('click', () => {
                this.eventBus.publish('amazingIdle:exportSave', {});
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
                const data = { saveJson: content };
                if (this._disableBiomeCheckCb?.checked) data.disableBiomeCheck = true;
                this.eventBus.publish('amazingIdle:importSave', data);
                this._setEditorStatus('Importing...');
            });
        }

        // Button hover effects
        this.rootElement.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mouseenter', () => { btn.style.background = '#555'; });
            btn.addEventListener('mouseleave', () => {
                // Restore original background based on class
                btn.style.background = '#444';
            });
        });
    }

    // --- Event subscriptions ---

    setupEventSubscriptions() {
        if (!this.eventBus) return;

        const sub = (event, handler) => {
            const unsub = this.eventBus.subscribe(event, handler);
            this.unsubscribeHandles.push(unsub);
        };

        sub('iframe:connected', (data) => this._handleConnected(data));
        sub('iframe:disconnected', (data) => this._handleDisconnected(data));
        sub('iframePanel:loaded', (data) => this._handleIframeLoaded(data));
        sub('iframePanel:unloaded', (data) => this._handleIframeUnloaded(data));
        sub('amazingIdle:saveExported', (data) => this._handleSaveExported(data));
        sub('amazingIdle:mazeCompleted', (data) => this._handleMazeCompleted(data));
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

    _handleMazeCompleted(data) {
        const time = new Date(data.timestamp).toLocaleTimeString('en-US', { hour12: false });
        const entry = `[${time}] Maze #${data.completionCount} (${data.mutationCount} DOM changes)`;

        this.completionLog.unshift(entry);
        if (this.completionLog.length > this.maxLogEntries) {
            this.completionLog.length = this.maxLogEntries;
        }
        this._renderLog();
        log('info', entry);
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

    _renderLog() {
        if (!this._logEntries) return;
        if (this.completionLog.length === 0) {
            this._logEntries.textContent = 'No completions yet';
            this._logEntries.style.color = '#aaa';
            return;
        }
        this._logEntries.style.color = '#ccc';
        this._logEntries.innerHTML = this.completionLog
            .map(entry => `<div style="padding: 1px 0;">${entry}</div>`)
            .join('');
    }

    _showFeedback(message, isError = false) {
        if (!this._actionFeedback) return;
        this._actionFeedback.textContent = message;
        this._actionFeedback.style.color = isError ? '#f44336' : '#4CAF50';
        if (!isError) {
            setTimeout(() => {
                if (this._actionFeedback) this._actionFeedback.textContent = '';
            }, 3000);
        }
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

            // Points
            const points = save?.points?.points ?? '--';
            if (this._gsPoints) this._gsPoints.textContent = typeof points === 'number' ? points.toLocaleString() : points;

            // Biome from upgrades.upgradeMap.BIOME
            const biomeCount = save?.upgrades?.upgradeMap?.BIOME ?? 0;
            if (this._gsBiome) this._gsBiome.textContent = biomeCount;

            // Total mazes completed from stats
            let totalMazes = '--';
            if (save?.stats?.statsMap) {
                try {
                    const mapStr = String(save.stats.statsMap);
                    const cleaned = mapStr.startsWith('~~') ? mapStr.slice(2) : mapStr;
                    const arr = JSON.parse(cleaned);
                    const statsMap = new Map(arr);
                    totalMazes = statsMap.get('TOTAL_MAZES_COMPLETED') ?? '--';
                } catch (e) {
                    log('warn', 'Failed to parse statsMap:', e.message);
                }
            }
            if (this._gsMazes) this._gsMazes.textContent = totalMazes;

            // Bot upgrades from upgrades.upgradeMap
            let botCount = 0;
            const upgradeMap = save?.upgrades?.upgradeMap;
            if (upgradeMap && typeof upgradeMap === 'object') {
                for (const key of Object.keys(upgradeMap)) {
                    if (key.includes('BOT') || key.includes('AUTO')) {
                        const val = upgradeMap[key];
                        if (val && val !== 0) botCount++;
                    }
                }
            }
            if (this._gsBots) this._gsBots.textContent = botCount;

        } catch (e) {
            log('warn', 'Failed to parse save for summary:', e.message);
        }
    }

    // --- CodeMirror 6 Editor ---

    async _initEditor() {
        if (this.editorInitialized) return;
        this.editorInitialized = true;

        try {
            this.cm6Module = await import('../../modules/editorCodeMirror6/codemirror6Imports.js');
            const {
                EditorView, EditorState, lineNumbers, highlightActiveLine,
                drawSelection, history, foldGutter, json, oneDark, keymap,
                defaultKeymap, historyKeymap, foldKeymap
            } = this.cm6Module;

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
            // Editor not yet initialized — open the section and init
            const saveSection = this.rootElement.querySelector('.mgd-section-body[data-section="saveEditor"]');
            const saveHeader = this.rootElement.querySelector('.mgd-section-header[data-section="saveEditor"]');
            if (saveSection && saveSection.style.display === 'none') {
                saveSection.style.display = 'block';
                const arrow = saveHeader?.querySelector('.mgd-section-arrow');
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

    // --- Golden Layout lifecycle ---

    show() {}
    hide() {}
    focus() {}

    dispose() {
        log('info', 'MazeGameDataPanelUI disposing...');

        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsub => {
            if (typeof unsub === 'function') unsub();
        });
        this.unsubscribeHandles = [];

        // Destroy CM6 editor
        if (this.editorView) {
            this.editorView.destroy();
            this.editorView = null;
        }

        // Clear state
        this.completionLog = [];
        this.cm6Module = null;
        this._connDot = null;
        this._connLabel = null;
        this._connIframeId = null;
        this._connLastTime = null;
        this._gsBiome = null;
        this._gsPoints = null;
        this._gsMazes = null;
        this._gsBots = null;
        this._refreshBtn = null;
        this._logEntries = null;
        this._logClearBtn = null;
        this._injectInput = null;
        this._injectBtn = null;
        this._biomeSelect = null;
        this._advanceBtn = null;
        this._newMazeBtn = null;
        this._disableBiomeCheckCb = null;
        this._actionFeedback = null;
        this._exportBtn = null;
        this._importBtn = null;
        this._editorStatus = null;
        this._editorWrapper = null;
        this._editorEmpty = null;
        this._editorMount = null;
    }
}

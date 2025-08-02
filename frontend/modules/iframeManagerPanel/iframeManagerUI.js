// UI component for iframe manager panel module
import { moduleEventBus } from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('iframeManagerUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[iframeManagerUI] ${message}`, ...data);
    }
}

export class IframeManagerUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        
        // UI elements
        this.rootElement = null;
        this.urlInput = null;
        this.knownPagesSelect = null;
        this.loadButton = null;
        this.unloadButton = null;
        this.statusElement = null;
        this.iframeListElement = null;
        
        // State
        this.currentUrl = '';
        this.connectedIframes = new Map(); // iframeId -> info
        
        // Known pages configuration
        this.knownPages = [
            {
                name: "Text Adventure (Standalone)",
                url: "./modules/textAdventure-iframe/index.html",
                description: "Interactive text adventure running in iframe"
            },
            {
                name: "Iframe Base",
                url: "./modules/iframe-base/index.html",
                description: "Basic iframe module showing connection status and heartbeat"
            }
        ];
        
        // Event subscriptions
        this.unsubscribeHandles = [];
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', 'IframeManagerUI initialized');
    }

    // Required method for Golden Layout
    getRootElement() {
        if (!this.rootElement) {
            this.createRootElement();
        }
        return this.rootElement;
    }

    initialize() {
        // Create the root element
        this.createRootElement();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load known pages from settings if available
        this.loadKnownPages();
        
        // Update UI state
        this.updateUI();
    }

    createRootElement() {
        // Create root element
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'iframe-manager-panel-container';
        this.rootElement.style.height = '100%';
        this.rootElement.style.overflow = 'auto';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Get references to UI elements
        this.urlInput = this.rootElement.querySelector('.url-input');
        this.knownPagesSelect = this.rootElement.querySelector('.known-pages-select');
        this.loadButton = this.rootElement.querySelector('.load-button');
        this.unloadButton = this.rootElement.querySelector('.unload-button');
        this.statusElement = this.rootElement.querySelector('.status-text');
        this.iframeListElement = this.rootElement.querySelector('.iframe-list');
    }

    createPanelHTML() {
        return `
            <div class="iframe-manager-panel" style="padding: 15px; background: #1e1e1e; color: #cccccc;">
                <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #cccccc;">
                    Iframe Manager
                </h3>
                
                <!-- URL Input Section -->
                <div class="url-section" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        URL to Load:
                    </label>
                    <input type="text" class="url-input" 
                           placeholder="Enter URL or select from known pages..." 
                           style="
                               width: 100%;
                               padding: 8px;
                               border: 1px solid #555;
                               border-radius: 4px;
                               font-size: 12px;
                               margin-bottom: 10px;
                               background: #2d2d30;
                               color: #cccccc;
                           ">
                    
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        Known Pages:
                    </label>
                    <select class="known-pages-select" 
                            style="
                                width: 100%;
                                padding: 8px;
                                border: 1px solid #555;
                                border-radius: 4px;
                                font-size: 12px;
                                margin-bottom: 10px;
                                background: #2d2d30;
                                color: #cccccc;
                            ">
                        <option value="">Select a known page...</option>
                    </select>
                </div>
                
                <!-- Control Buttons -->
                <div class="controls-section" style="margin-bottom: 20px;">
                    <button class="load-button" 
                            style="
                                padding: 8px 16px;
                                background: #4CAF50;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                margin-right: 10px;
                                font-size: 12px;
                            ">
                        Load Iframe
                    </button>
                    <button class="unload-button" 
                            style="
                                padding: 8px 16px;
                                background: #f44336;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">
                        Unload All
                    </button>
                </div>
                
                <!-- Status Section -->
                <div class="status-section" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        Status:
                    </label>
                    <div class="status-text" 
                         style="
                             padding: 8px;
                             background: #2d2d30;
                             border: 1px solid #555;
                             border-radius: 4px;
                             font-size: 11px;
                             color: #cccccc;
                         ">
                        Ready to load iframe content
                    </div>
                </div>
                
                <!-- Connected Iframes Section -->
                <div class="iframes-section">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        Connected Iframes:
                    </label>
                    <div class="iframe-list" 
                         style="
                             padding: 8px;
                             background: #2d2d30;
                             border: 1px solid #555;
                             border-radius: 4px;
                             font-size: 11px;
                             color: #cccccc;
                             min-height: 60px;
                         ">
                        No iframes connected
                    </div>
                </div>
                
                <!-- Help Section -->
                <div class="help-section" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #555;">
                    <p style="font-size: 11px; color: #aaa; margin: 0; line-height: 1.4;">
                        <strong>Instructions:</strong><br>
                        1. Select a known page or enter a custom URL<br>
                        2. Click "Load Iframe" to load content<br>
                        3. The iframe will appear in the Iframe Panel<br>
                        4. Use "Unload All" to clear all iframes
                    </p>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Known pages dropdown change
        if (this.knownPagesSelect) {
            log('debug', 'Setting up known pages dropdown event listener');
            this.knownPagesSelect.addEventListener('change', (e) => {
                log('debug', `Dropdown changed to: ${e.target.value}`);
                this.handleKnownPageSelection(e.target.value);
            });
        } else {
            log('warn', 'Known pages dropdown not found when setting up event listeners');
        }

        // Load button click
        if (this.loadButton) {
            this.loadButton.addEventListener('click', () => {
                this.handleLoadClick();
            });
        }

        // Unload button click
        if (this.unloadButton) {
            this.unloadButton.addEventListener('click', () => {
                this.handleUnloadClick();
            });
        }

        // URL input change
        if (this.urlInput) {
            this.urlInput.addEventListener('input', (e) => {
                this.currentUrl = e.target.value;
                this.updateUI();
            });

            // Load on Enter key
            this.urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleLoadClick();
                }
            });
        }
    }

    setupEventSubscriptions() {
        if (moduleEventBus) {
            // Subscribe to iframe panel events
            const loadedUnsubscribe = moduleEventBus.subscribe('iframePanel:loaded', (data) => {
                this.handleIframeLoaded(data);
            }, 'iframeManagerUI');
            this.unsubscribeHandles.push(loadedUnsubscribe);

            const unloadedUnsubscribe = moduleEventBus.subscribe('iframePanel:unloaded', (data) => {
                this.handleIframeUnloaded(data);
            }, 'iframeManagerUI');
            this.unsubscribeHandles.push(unloadedUnsubscribe);

            const errorUnsubscribe = moduleEventBus.subscribe('iframePanel:error', (data) => {
                this.handleIframeError(data);
            }, 'iframeManagerUI');
            this.unsubscribeHandles.push(errorUnsubscribe);

            // Subscribe to iframe adapter events
            const connectedUnsubscribe = moduleEventBus.subscribe('iframe:connected', (data) => {
                this.handleIframeConnected(data);
            }, 'iframeManagerUI');
            this.unsubscribeHandles.push(connectedUnsubscribe);

            const disconnectedUnsubscribe = moduleEventBus.subscribe('iframe:disconnected', (data) => {
                this.handleIframeDisconnected(data);
            }, 'iframeManagerUI');
            this.unsubscribeHandles.push(disconnectedUnsubscribe);
        }
    }

    /**
     * Load known pages from settings
     */
    loadKnownPages() {
        // Try to get known pages from settings
        if (typeof window !== 'undefined' && window.settingsManager) {
            try {
                const settings = window.settingsManager.getSettings();
                if (settings.iframeManagerPanel && settings.iframeManagerPanel.knownPages) {
                    this.knownPages = settings.iframeManagerPanel.knownPages;
                }
            } catch (error) {
                log('warn', 'Could not load known pages from settings:', error);
            }
        }

        // Populate dropdown
        this.populateKnownPagesDropdown();
    }

    /**
     * Populate known pages dropdown
     */
    populateKnownPagesDropdown() {
        if (!this.knownPagesSelect) {
            log('warn', 'knownPagesSelect is null, cannot populate dropdown');
            return;
        }

        log('info', `Populating dropdown with ${this.knownPages.length} known pages`);
        log('info', `Dropdown reference valid: ${this.knownPagesSelect !== null}`);

        // Clear existing options (except first)
        this.knownPagesSelect.innerHTML = '<option value="">Select a known page...</option>';

        // Add known pages
        this.knownPages.forEach(page => {
            const option = document.createElement('option');
            option.value = page.url;
            option.textContent = `${page.name} - ${page.description}`;
            this.knownPagesSelect.appendChild(option);
            log('info', `Added option: value="${page.url}", text="${page.name} - ${page.description}"`);
        });
        
        log('info', `Dropdown populated with ${this.knownPagesSelect.options.length} total options`);
        
        // Diagnostic: List all options for debugging
        for (let i = 0; i < this.knownPagesSelect.options.length; i++) {
            const option = this.knownPagesSelect.options[i];
            log('info', `Option ${i}: value="${option.value}", text="${option.textContent}", selected=${option.selected}`);
        }
        
        // Test if event listeners are still working after populating
        log('info', 'Testing if dropdown still has event listeners after population...');
    }


    /**
     * Handle known page selection
     * @param {string} url - Selected URL
     */
    handleKnownPageSelection(url) {
        log('info', `handleKnownPageSelection called with URL: ${url}`);
        log('info', `urlInput exists: ${this.urlInput !== null}`);
        
        if (url && this.urlInput) {
            log('info', `Setting urlInput.value to: ${url}`);
            this.urlInput.value = url;
            this.currentUrl = url;
            this.updateUI();
            log('info', `URL field updated, currentUrl: ${this.currentUrl}`);
        } else {
            log('warn', `Cannot update URL field - url: ${url}, urlInput: ${this.urlInput}`);
        }
    }

    /**
     * Handle load button click
     */
    handleLoadClick() {
        const url = this.urlInput.value.trim();
        
        if (!url) {
            this.updateStatus('Please enter a URL or select a known page');
            return;
        }

        log('info', `Loading iframe with URL: ${url}`);
        
        // Publish load event
        if (moduleEventBus) {
            moduleEventBus.publish('iframe:loadUrl', { 
                url: url,
                // Don't specify panelId to load in any available iframe panel
            }, 'iframeManagerPanel');
        }

        this.updateStatus(`Loading: ${url}`);
    }

    /**
     * Handle unload button click
     */
    handleUnloadClick() {
        log('info', 'Unloading all iframes');
        
        // Publish unload event
        if (moduleEventBus) {
            moduleEventBus.publish('iframe:unload', {
                // Don't specify panelId to unload all iframe panels
            }, 'iframeManagerUI');
        }

        this.updateStatus('Unloading all iframes...');
    }

    /**
     * Handle iframe loaded event
     * @param {object} data - Event data
     */
    handleIframeLoaded(data) {
        const { panelId, iframeId, url } = data;
        log('debug', `Iframe loaded: ${iframeId} in panel ${panelId}`);
        
        this.updateStatus(`Iframe loaded successfully: ${url}`);
        
        // Update iframe list
        this.updateIframeList();
    }

    /**
     * Handle iframe unloaded event
     * @param {object} data - Event data
     */
    handleIframeUnloaded(data) {
        const { panelId } = data;
        log('debug', `Iframe unloaded from panel ${panelId}`);
        
        this.updateStatus('Iframe unloaded');
        
        // Update iframe list
        this.updateIframeList();
    }

    /**
     * Handle iframe error event
     * @param {object} data - Event data
     */
    handleIframeError(data) {
        const { panelId, error, url } = data;
        log('warn', `Iframe error in panel ${panelId}:`, error);
        
        this.updateStatus(`Error loading iframe: ${error}`);
    }

    /**
     * Handle iframe connected to adapter
     * @param {object} data - Event data
     */
    handleIframeConnected(data) {
        const { iframeId } = data;
        log('debug', `Iframe connected to adapter: ${iframeId}`);
        
        this.connectedIframes.set(iframeId, {
            id: iframeId,
            connected: true,
            connectedAt: new Date().toLocaleTimeString()
        });
        
        this.updateIframeList();
    }

    /**
     * Handle iframe disconnected from adapter
     * @param {object} data - Event data
     */
    handleIframeDisconnected(data) {
        const { iframeId } = data;
        log('debug', `Iframe disconnected from adapter: ${iframeId}`);
        
        this.connectedIframes.delete(iframeId);
        this.updateIframeList();
    }

    /**
     * Update status display
     * @param {string} status - Status text
     */
    updateStatus(status) {
        if (this.statusElement) {
            this.statusElement.textContent = status;
        }
    }

    /**
     * Update iframe list display
     */
    updateIframeList() {
        if (!this.iframeListElement) return;

        if (this.connectedIframes.size === 0) {
            this.iframeListElement.textContent = 'No iframes connected';
            return;
        }

        let html = '';
        for (const [iframeId, info] of this.connectedIframes.entries()) {
            html += `
                <div style="
                    padding: 5px;
                    margin: 2px 0;
                    background: #2d4a2d;
                    border-radius: 3px;
                    font-size: 10px;
                    color: #cccccc;
                ">
                    <strong>ID:</strong> ${iframeId}<br>
                    <strong>Connected:</strong> ${info.connectedAt}
                </div>
            `;
        }

        this.iframeListElement.innerHTML = html;
    }

    /**
     * Update UI state
     */
    updateUI() {
        const hasUrl = this.currentUrl && this.currentUrl.trim().length > 0;
        
        log('info', `updateUI called - currentUrl: "${this.currentUrl}", hasUrl: ${hasUrl}`);
        log('info', `loadButton exists: ${this.loadButton !== null}`);
        
        if (this.loadButton) {
            this.loadButton.disabled = !hasUrl;
            this.loadButton.style.opacity = hasUrl ? '1' : '0.5';
            log('info', `Load button disabled: ${this.loadButton.disabled}, opacity: ${this.loadButton.style.opacity}`);
        } else {
            log('warn', 'Load button not found in updateUI');
        }
    }

    // Golden Layout lifecycle methods
    show() {
        // Panel is being shown
    }

    hide() {
        // Panel is being hidden
    }

    focus() {
        // Panel is being focused
        if (this.urlInput) {
            this.urlInput.focus();
        }
    }

    // Cleanup
    dispose() {
        log('info', 'IframeManagerUI disposing...');
        
        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.unsubscribeHandles = [];

        // Clear references
        this.urlInput = null;
        this.knownPagesSelect = null;
        this.loadButton = null;
        this.unloadButton = null;
        this.statusElement = null;
        this.iframeListElement = null;
    }
}
// UI component for window manager panel module
import { moduleEventBus } from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('windowManagerUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[windowManagerUI] ${message}`, ...data);
    }
}

export class WindowManagerUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        
        // UI elements
        this.rootElement = null;
        this.urlInput = null;
        this.knownPagesSelect = null;
        this.openButton = null;
        this.closeAllButton = null;
        this.statusElement = null;
        this.windowListElement = null;
        
        // State
        this.currentUrl = '';
        this.connectedWindows = new Map(); // windowId -> info
        
        // Known pages configuration
        this.knownPages = [
            {
                name: "Text Adventure (Standalone)",
                url: "./modules/textAdventure-iframe/index.html",
                description: "Interactive text adventure running in separate window"
            },
            {
                name: "Window Base",
                url: "./modules/window-base/index.html",
                description: "Basic window module showing connection status and heartbeat"
            }
        ];
        
        // Event subscriptions
        this.unsubscribeHandles = [];
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', 'WindowManagerUI initialized');
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
        this.rootElement.className = 'window-manager-panel-container';
        this.rootElement.style.height = '100%';
        this.rootElement.style.overflow = 'auto';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Get references to UI elements
        this.urlInput = this.rootElement.querySelector('.url-input');
        this.knownPagesSelect = this.rootElement.querySelector('.known-pages-select');
        this.openButton = this.rootElement.querySelector('.open-button');
        this.closeAllButton = this.rootElement.querySelector('.close-all-button');
        this.statusElement = this.rootElement.querySelector('.status-text');
        this.windowListElement = this.rootElement.querySelector('.window-list');
    }

    createPanelHTML() {
        return `
            <div class="window-manager-panel" style="padding: 15px; background: #1e1e1e; color: #cccccc;">
                <h3 style="margin: 0 0 15px 0; font-size: 16px; color: #cccccc;">
                    Window Manager
                </h3>
                
                <!-- URL Input Section -->
                <div class="url-section" style="margin-bottom: 20px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        URL to Open:
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
                    <button class="open-button" 
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
                        Open Window
                    </button>
                    <button class="close-all-button" 
                            style="
                                padding: 8px 16px;
                                background: #f44336;
                                color: white;
                                border: none;
                                border-radius: 4px;
                                cursor: pointer;
                                font-size: 12px;
                            ">
                        Close All
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
                        Ready to open window content
                    </div>
                </div>
                
                <!-- Connected Windows Section -->
                <div class="windows-section">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold; font-size: 12px; color: #cccccc;">
                        Connected Windows:
                    </label>
                    <div class="window-list" 
                         style="
                             padding: 8px;
                             background: #2d2d30;
                             border: 1px solid #555;
                             border-radius: 4px;
                             font-size: 11px;
                             color: #cccccc;
                             min-height: 60px;
                         ">
                        No windows connected
                    </div>
                </div>
                
                <!-- Help Section -->
                <div class="help-section" style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #555;">
                    <p style="font-size: 11px; color: #aaa; margin: 0; line-height: 1.4;">
                        <strong>Instructions:</strong><br>
                        1. Select a known page or enter a custom URL<br>
                        2. Click "Open Window" to open content in a new browser window<br>
                        3. The window will connect back to the main application<br>
                        4. Use "Close All" to close all connected windows<br>
                        5. Monitor connection status in the Window Panel
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

        // Open button click
        if (this.openButton) {
            this.openButton.addEventListener('click', () => {
                this.handleOpenClick();
            });
        }

        // Close All button click
        if (this.closeAllButton) {
            this.closeAllButton.addEventListener('click', () => {
                this.handleCloseAllClick();
            });
        }

        // URL input change
        if (this.urlInput) {
            this.urlInput.addEventListener('input', (e) => {
                this.currentUrl = e.target.value;
                this.updateUI();
            });

            // Open on Enter key
            this.urlInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleOpenClick();
                }
            });
        }
    }

    setupEventSubscriptions() {
        if (moduleEventBus) {
            // Subscribe to window panel events
            const openedUnsubscribe = moduleEventBus.subscribe('windowPanel:opened', (data) => {
                this.handleWindowOpened(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(openedUnsubscribe);

            const closedUnsubscribe = moduleEventBus.subscribe('windowPanel:closed', (data) => {
                this.handleWindowClosed(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(closedUnsubscribe);

            const connectedUnsubscribe = moduleEventBus.subscribe('windowPanel:connected', (data) => {
                this.handleWindowConnected(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(connectedUnsubscribe);

            const errorUnsubscribe = moduleEventBus.subscribe('windowPanel:error', (data) => {
                this.handleWindowError(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(errorUnsubscribe);

            // Subscribe to window adapter events
            const adapterConnectedUnsubscribe = moduleEventBus.subscribe('window:connected', (data) => {
                this.handleWindowAdapterConnected(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(adapterConnectedUnsubscribe);

            const adapterDisconnectedUnsubscribe = moduleEventBus.subscribe('window:disconnected', (data) => {
                this.handleWindowAdapterDisconnected(data);
            }, 'windowManagerUI');
            this.unsubscribeHandles.push(adapterDisconnectedUnsubscribe);
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
                if (settings.windowManagerPanel && settings.windowManagerPanel.knownPages) {
                    this.knownPages = settings.windowManagerPanel.knownPages;
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
    }

    /**
     * Handle known page selection
     * @param {string} url - Selected URL
     */
    handleKnownPageSelection(url) {
        log('info', `handleKnownPageSelection called with URL: ${url}`);
        
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
     * Handle open button click
     */
    handleOpenClick() {
        const url = this.urlInput.value.trim();
        
        if (!url) {
            this.updateStatus('Please enter a URL or select a known page');
            return;
        }

        log('info', `Opening window with URL: ${url}`);
        
        // Publish open window event
        if (moduleEventBus) {
            moduleEventBus.publish('window:loadUrl', { 
                url: url,
                // Don't specify panelId to open in any available window panel
            }, 'windowManagerPanel');
        }

        this.updateStatus(`Opening window: ${url}`);
    }

    /**
     * Handle close all button click
     */
    handleCloseAllClick() {
        log('info', 'Closing all windows');
        
        // Publish close window event
        if (moduleEventBus) {
            moduleEventBus.publish('window:close', {
                // Don't specify panelId to close all window panels
            }, 'windowManagerUI');
        }

        this.updateStatus('Closing all windows...');
    }

    /**
     * Handle window opened event
     * @param {object} data - Event data
     */
    handleWindowOpened(data) {
        const { panelId, windowId, url } = data;
        log('debug', `Window opened: ${windowId} in panel ${panelId}`);
        
        this.updateStatus(`Window opened successfully: ${url}`);
        
        // Update window list
        this.updateWindowList();
    }

    /**
     * Handle window closed event
     * @param {object} data - Event data
     */
    handleWindowClosed(data) {
        const { panelId } = data;
        log('debug', `Window closed from panel ${panelId}`);
        
        this.updateStatus('Window closed');
        
        // Update window list
        this.updateWindowList();
    }

    /**
     * Handle window connected event
     * @param {object} data - Event data
     */
    handleWindowConnected(data) {
        const { panelId, windowId } = data;
        log('debug', `Window connected: ${windowId} in panel ${panelId}`);
        
        this.updateStatus(`Window connected: ${windowId}`);
        
        // Update window list
        this.updateWindowList();
    }

    /**
     * Handle window error event
     * @param {object} data - Event data
     */
    handleWindowError(data) {
        const { panelId, error, windowId } = data;
        log('warn', `Window error in panel ${panelId}:`, error);
        
        this.updateStatus(`Error with window: ${error}`);
    }

    /**
     * Handle window connected to adapter
     * @param {object} data - Event data
     */
    handleWindowAdapterConnected(data) {
        const { windowId } = data;
        log('debug', `Window connected to adapter: ${windowId}`);
        
        this.connectedWindows.set(windowId, {
            id: windowId,
            connected: true,
            connectedAt: new Date().toLocaleTimeString()
        });
        
        this.updateWindowList();
    }

    /**
     * Handle window disconnected from adapter
     * @param {object} data - Event data
     */
    handleWindowAdapterDisconnected(data) {
        const { windowId } = data;
        log('debug', `Window disconnected from adapter: ${windowId}`);
        
        this.connectedWindows.delete(windowId);
        this.updateWindowList();
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
     * Update window list display
     */
    updateWindowList() {
        if (!this.windowListElement) return;

        if (this.connectedWindows.size === 0) {
            this.windowListElement.textContent = 'No windows connected';
            return;
        }

        let html = '';
        for (const [windowId, info] of this.connectedWindows.entries()) {
            html += `
                <div style="
                    padding: 5px;
                    margin: 2px 0;
                    background: #2d4a2d;
                    border-radius: 3px;
                    font-size: 10px;
                    color: #cccccc;
                ">
                    <strong>ID:</strong> ${windowId}<br>
                    <strong>Connected:</strong> ${info.connectedAt}
                </div>
            `;
        }

        this.windowListElement.innerHTML = html;
    }

    /**
     * Update UI state
     */
    updateUI() {
        const hasUrl = this.currentUrl && this.currentUrl.trim().length > 0;
        
        log('info', `updateUI called - currentUrl: "${this.currentUrl}", hasUrl: ${hasUrl}`);
        
        if (this.openButton) {
            this.openButton.disabled = !hasUrl;
            this.openButton.style.opacity = hasUrl ? '1' : '0.5';
            log('info', `Open button disabled: ${this.openButton.disabled}, opacity: ${this.openButton.style.opacity}`);
        } else {
            log('warn', 'Open button not found in updateUI');
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
        log('info', 'WindowManagerUI disposing...');
        
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
        this.openButton = null;
        this.closeAllButton = null;
        this.statusElement = null;
        this.windowListElement = null;
    }
}
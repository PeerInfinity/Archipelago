// UI component for window panel module - displays connection status and heartbeat counter
import { moduleEventBus } from './index.js';
import eventBus from '../../app/core/eventBus.js';
import { 
    MessageTypes, 
    createMessage, 
    validateMessage, 
    safePostMessage,
    generateWindowId 
} from '../windowAdapter/communicationProtocol.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('windowPanelUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[windowPanelUI] ${message}`, ...data);
    }
}

export class WindowPanelUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        
        // UI elements
        this.rootElement = null;
        this.statusElement = null;
        this.errorElement = null;
        this.connectionStatusElement = null;
        this.heartbeatCountElement = null;
        this.windowInfoElement = null;
        
        // Window connection state
        this.windowId = generateWindowId(componentState?.windowName);
        this.isConnected = false;
        this.connectedWindowRef = null;
        this.heartbeatCount = 0;
        
        // Event subscriptions
        this.unsubscribeHandles = [];
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', `WindowPanel initialized with ID: ${this.windowId}`);
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
        
        // Show initial state
        this.updateDisplay();
    }

    createRootElement() {
        // Create root element
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'window-panel-container';
        this.rootElement.style.height = '100%';
        this.rootElement.style.overflow = 'hidden';
        this.rootElement.style.display = 'flex';
        this.rootElement.style.flexDirection = 'column';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Attach UI instance to DOM element for access by tests
        this.rootElement.windowPanelUI = this;
        
        // Get references to UI elements
        this.statusElement = this.rootElement.querySelector('.window-status');
        this.errorElement = this.rootElement.querySelector('.window-error');
        this.connectionStatusElement = this.rootElement.querySelector('.connection-status-value');
        this.heartbeatCountElement = this.rootElement.querySelector('.heartbeat-count-value');
        this.windowInfoElement = this.rootElement.querySelector('.window-info-value');
    }

    createPanelHTML() {
        return `
            <div class="window-panel" style="
                height: 100%;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            ">
                <div class="window-status" style="
                    padding: 10px;
                    background: #2d2d30;
                    border-bottom: 1px solid #3e3e42;
                    font-size: 12px;
                    color: #cccccc;
                    flex-shrink: 0;
                    box-sizing: border-box;
                ">
                    Window Panel Ready - No window connected
                </div>
                
                <div class="window-error" style="
                    display: none;
                    padding: 10px;
                    background: #3c1e1e;
                    border-bottom: 1px solid #f44336;
                    color: #ff6b6b;
                    font-size: 12px;
                    flex-shrink: 0;
                    box-sizing: border-box;
                ">
                    <!-- Error messages will appear here -->
                </div>
                
                <div class="window-content" style="
                    flex: 1;
                    position: relative;
                    background: #1e1e1e;
                    padding: 20px;
                    box-sizing: border-box;
                    min-height: 0;
                    overflow-y: auto;
                ">
                    <div class="connection-info" style="
                        color: #cecece;
                        font-family: monospace;
                        font-size: 14px;
                        line-height: 1.6;
                    ">
                        <h3 style="
                            color: #88cc88;
                            margin-top: 0;
                            margin-bottom: 15px;
                            font-size: 16px;
                        ">Window Connection Status</h3>
                        
                        <div class="status-item" style="margin-bottom: 10px;">
                            <span class="status-label" style="color: #aaa; font-weight: bold;">Connection Status:</span>
                            <span class="connection-status-value" style="color: #ff6b6b;">Disconnected</span>
                        </div>
                        
                        <div class="status-item" style="margin-bottom: 10px;">
                            <span class="status-label" style="color: #aaa; font-weight: bold;">Heartbeat Count:</span>
                            <span class="heartbeat-count-value" style="color: #4da6ff; font-weight: bold;">0</span>
                        </div>
                        
                        <div class="status-item" style="margin-bottom: 10px;">
                            <span class="status-label" style="color: #aaa; font-weight: bold;">Window ID:</span>
                            <span class="window-info-value" style="color: #cecece;">${this.windowId}</span>
                        </div>
                        
                        <div class="status-item" style="margin-top: 20px;">
                            <span class="status-label" style="color: #aaa; font-weight: bold;">Instructions:</span>
                            <div style="color: #cecece; margin-top: 5px; font-size: 12px;">
                                Use the Window Manager to open a new window.<br>
                                This panel will display the connection status and heartbeat information.
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Listen for postMessage events from separate windows
        window.addEventListener('message', (event) => {
            log('debug', `Global postMessage received from window, origin: ${event.origin}`);
            this.handlePostMessage(event);
        });
    }

    setupEventSubscriptions() {
        log('debug', `setupEventSubscriptions: eventBus available: ${eventBus !== null}`);
        if (eventBus) {
            log('debug', 'Subscribing to window events...');
            
            // Subscribe to window connection events
            const windowConnectedUnsubscribe = eventBus.subscribe('window:connected', (data) => {
                log('debug', 'Window connected event received:', data);
                this.handleWindowConnected(data);
            }, 'windowPanel');
            this.unsubscribeHandles.push(windowConnectedUnsubscribe);

            // Subscribe to window disconnection events
            const windowDisconnectedUnsubscribe = eventBus.subscribe('window:disconnected', (data) => {
                log('debug', 'Window disconnected event received:', data);
                this.handleWindowDisconnected(data);
            }, 'windowPanel');
            this.unsubscribeHandles.push(windowDisconnectedUnsubscribe);

            // Subscribe to window load commands
            const loadWindowUnsubscribe = eventBus.subscribe('window:loadUrl', (data) => {
                log('debug', 'UI component received window:loadUrl event:', data);
                this.handleLoadWindow(data);
            }, 'windowPanel');
            this.unsubscribeHandles.push(loadWindowUnsubscribe);

            // Subscribe to window close commands
            const closeWindowUnsubscribe = eventBus.subscribe('window:close', (data) => {
                this.handleCloseWindow(data);
            }, 'windowPanel');
            this.unsubscribeHandles.push(closeWindowUnsubscribe);
            
            log('debug', 'Event subscriptions set up successfully');
        } else {
            log('error', 'eventBus is null! Cannot subscribe to events');
        }
    }

    /**
     * Handle window connected event
     * @param {object} data - Connection data
     */
    handleWindowConnected(data) {
        const { windowId } = data;
        
        // Check if this connection is for our window
        if (windowId === this.windowId) {
            this.isConnected = true;
            this.updateConnectionStatus('Connected');
            this.updateStatus(`Connected to window: ${windowId}`);
            this.hideError();
            
            log('info', `Window panel connected to window: ${windowId}`);
        }
    }

    /**
     * Handle window disconnected event
     * @param {object} data - Disconnection data
     */
    handleWindowDisconnected(data) {
        const { windowId } = data;
        
        // Check if this disconnection is for our window
        if (windowId === this.windowId) {
            this.isConnected = false;
            this.connectedWindowRef = null;
            this.updateConnectionStatus('Disconnected');
            this.updateStatus('Window Panel Ready - No window connected');
            this.hideError();
            
            log('info', `Window panel disconnected from window: ${windowId}`);
        }
    }

    /**
     * Handle load window command
     * @param {object} data - Load window data
     */
    handleLoadWindow(data) {
        const { url, panelId } = data;
        
        // Check if this command is for us (either no panelId specified or matches our container)
        if (panelId && panelId !== this.container?.id) {
            return; // Not for us
        }
        
        log('info', `Opening window with URL: ${url}`);
        this.openWindow(url);
    }

    /**
     * Handle close window command
     * @param {object} data - Close window data
     */
    handleCloseWindow(data) {
        const { panelId } = data;
        
        // Check if this command is for us
        if (panelId && panelId !== this.container?.id) {
            return; // Not for us
        }
        
        log('info', 'Closing connected window');
        this.closeWindow();
    }

    /**
     * Open a new window with the specified URL
     * @param {string} url - URL to open
     */
    openWindow(url) {
        try {
            log('debug', `openWindow called with URL: ${url}`);
            
            // Close any existing window first
            this.closeWindow();
            
            // Update status
            this.updateStatus(`Opening window: ${url}`);
            this.hideError();
            
            // Add window ID parameter to URL
            let urlWithId;
            if (url.includes('?')) {
                urlWithId = `${url}&windowId=${this.windowId}`;
            } else {
                urlWithId = `${url}?windowId=${this.windowId}`;
            }
            
            log('debug', `Opening window with URL: ${urlWithId}`);
            
            // Open the new window
            this.connectedWindowRef = window.open(urlWithId, `window_${this.windowId}`, 'width=800,height=600,scrollbars=yes,resizable=yes');
            
            if (this.connectedWindowRef) {
                this.updateStatus(`Window opened: ${url}`);
                
                // Set up window close detection
                const checkClosed = setInterval(() => {
                    if (this.connectedWindowRef && this.connectedWindowRef.closed) {
                        clearInterval(checkClosed);
                        this.handleWindowClosed();
                    }
                }, 1000);
                
                // Publish window opened event
                if (moduleEventBus) {
                    moduleEventBus.publish('windowPanel:opened', { 
                        panelId: this.container?.id,
                        windowId: this.windowId,
                        url: url
                    }, 'windowPanel');
                }
            } else {
                this.handleWindowError('Failed to open window - popup blocked?');
            }
            
        } catch (error) {
            log('error', 'Error opening window:', error);
            this.handleWindowError(`Error opening window: ${error.message}`);
        }
    }

    /**
     * Close the connected window
     */
    closeWindow() {
        if (this.connectedWindowRef && !this.connectedWindowRef.closed) {
            // Notify adapter that window is disconnecting
            if (this.isConnected && window.windowAdapterCore) {
                window.windowAdapterCore.unregisterWindow(this.windowId);
            }
            
            this.connectedWindowRef.close();
            this.connectedWindowRef = null;
        }
        
        this.isConnected = false;
        this.heartbeatCount = 0;
        this.updateDisplay();
        this.updateStatus('Window Panel Ready - No window connected');
        this.hideError();
        
        // Generate new window ID for next window
        this.windowId = generateWindowId(this.customWindowName);
        this.updateWindowInfo();
        
        // Publish window closed event
        if (moduleEventBus) {
            moduleEventBus.publish('windowPanel:closed', { 
                panelId: this.container?.id 
            }, 'windowPanel');
        }
    }

    /**
     * Handle window closed event (detected via polling)
     */
    handleWindowClosed() {
        log('info', 'Connected window was closed');
        this.isConnected = false;
        this.connectedWindowRef = null;
        this.heartbeatCount = 0;
        this.updateDisplay();
        this.updateStatus('Window closed by user');
        
        // Generate new window ID for next window
        this.windowId = generateWindowId(this.customWindowName);
        this.updateWindowInfo();
        
        // Notify adapter
        if (window.windowAdapterCore) {
            window.windowAdapterCore.unregisterWindow(this.windowId);
        }
    }

    /**
     * Handle window error
     * @param {string} errorMessage - Error message
     */
    handleWindowError(errorMessage) {
        log('error', 'Window error:', errorMessage);
        this.showError(errorMessage);
        this.updateStatus('Error with window');
        
        // Publish error event
        if (moduleEventBus) {
            moduleEventBus.publish('windowPanel:error', { 
                panelId: this.container?.id,
                error: errorMessage,
                windowId: this.windowId
            }, 'windowPanel');
        }
    }

    /**
     * Handle postMessage from connected window
     * @param {MessageEvent} event - Message event
     */
    handlePostMessage(event) {
        // Only process messages if we have a connected window
        if (!this.connectedWindowRef || event.source !== this.connectedWindowRef) {
            return;
        }
        
        const message = event.data;
        log('debug', `Received raw message from window:`, message);
        
        // Validate message
        if (!validateMessage(message)) {
            log('warn', 'Received invalid message from window', message);
            return;
        }
        
        // Check if message is for our window ID
        const messageWindowId = message.windowId || message.iframeId;
        if (messageWindowId !== this.windowId) {
            log('warn', `Received message for different window ID. Expected: ${this.windowId}, Got: ${messageWindowId}`, message);
            return;
        }
        
        log('debug', `Received valid message from window: ${message.type}`);
        
        // Handle specific message types
        switch (message.type) {
            case MessageTypes.WINDOW_READY:
            case MessageTypes.IFRAME_READY: // Support legacy
                this.handleWindowReady(message);
                break;
                
            case MessageTypes.HEARTBEAT:
                this.handleHeartbeat(message);
                break;
                
            default:
                // Forward other messages to the adapter core
                if (window.windowAdapterCore) {
                    window.windowAdapterCore.handlePostMessage(event);
                }
                break;
        }
    }

    /**
     * Handle window ready message
     * @param {object} message - The window ready message
     */
    handleWindowReady(message) {
        log('debug', `handleWindowReady called with message:`, message);
        log('info', `Window ready: ${this.windowId}`);
        
        this.isConnected = true;
        this.updateDisplay();
        this.updateStatus(`Connected to window: ${this.windowId}`);
        this.hideError();
        
        // Forward to adapter core for registration
        if (window.windowAdapterCore) {
            const event = { source: this.connectedWindowRef, data: message };
            window.windowAdapterCore.handlePostMessage(event);
        }
        
        // Publish connected event
        log('debug', `Attempting to publish windowPanel:connected event. moduleEventBus available: ${moduleEventBus !== null}`);
        if (moduleEventBus) {
            moduleEventBus.publish('windowPanel:connected', { 
                panelId: this.container?.id,
                windowId: this.windowId
            }, 'windowPanel');
        }
    }

    /**
     * Handle heartbeat message
     * @param {object} message - The heartbeat message
     */
    handleHeartbeat(message) {
        log('debug', `Received heartbeat from window: ${this.windowId}`);
        
        this.heartbeatCount++;
        this.updateHeartbeatCount();
        
        // Forward to adapter core
        if (window.windowAdapterCore) {
            const event = { source: this.connectedWindowRef, data: message };
            window.windowAdapterCore.handlePostMessage(event);
        }
    }

    /**
     * Update the connection status display
     * @param {string} status - Connection status
     */
    updateConnectionStatus(status) {
        if (this.connectionStatusElement) {
            this.connectionStatusElement.textContent = status;
            
            // Update color based on status
            if (status === 'Connected') {
                this.connectionStatusElement.style.color = '#4da6ff';
            } else {
                this.connectionStatusElement.style.color = '#ff6b6b';
            }
        }
    }

    /**
     * Update the heartbeat count display
     */
    updateHeartbeatCount() {
        if (this.heartbeatCountElement) {
            this.heartbeatCountElement.textContent = this.heartbeatCount.toString();
        }
    }

    /**
     * Update the window info display
     */
    updateWindowInfo() {
        if (this.windowInfoElement) {
            this.windowInfoElement.textContent = this.windowId;
        }
    }

    /**
     * Update all display elements
     */
    updateDisplay() {
        this.updateConnectionStatus(this.isConnected ? 'Connected' : 'Disconnected');
        this.updateHeartbeatCount();
        this.updateWindowInfo();
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
     * Show error message
     * @param {string} errorMessage - Error message
     */
    showError(errorMessage) {
        if (this.errorElement) {
            this.errorElement.textContent = errorMessage;
            this.errorElement.style.display = 'block';
        }
    }

    /**
     * Hide error message
     */
    hideError() {
        if (this.errorElement) {
            this.errorElement.style.display = 'none';
        }
    }

    // Golden Layout lifecycle methods
    show() {
        // Panel is being shown
        this.updateDisplay();
    }

    hide() {
        // Panel is being hidden
    }

    focus() {
        // Panel is being focused
        if (this.connectedWindowRef && !this.connectedWindowRef.closed) {
            this.connectedWindowRef.focus();
        }
    }

    /**
     * Set a custom window name for future window ID generation
     * @param {string} name - Custom name to use
     */
    setCustomWindowName(name) {
        this.customWindowName = name;
        log('info', `WindowPanel custom window name set to: ${name}`);
    }

    // Cleanup
    dispose() {
        log('info', 'WindowPanelUI disposing...');
        
        // Close window
        this.closeWindow();
        
        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.unsubscribeHandles = [];

        // Clear references
        this.connectedWindowRef = null;
        this.statusElement = null;
        this.errorElement = null;
        this.connectionStatusElement = null;
        this.heartbeatCountElement = null;
        this.windowInfoElement = null;
    }
}
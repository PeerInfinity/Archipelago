// UI component for iframe panel module
import { moduleEventBus } from './index.js';
import eventBus from '../../app/core/eventBus.js';
import { 
    MessageTypes, 
    createMessage, 
    validateMessage, 
    safePostMessage,
    generateIframeId 
} from '../iframeAdapter/communicationProtocol.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('iframePanelUI', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[iframePanelUI] ${message}`, ...data);
    }
}

export class IframePanelUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        
        // UI elements
        this.rootElement = null;
        this.iframe = null;
        this.statusElement = null;
        this.errorElement = null;
        
        // Iframe state
        this.currentUrl = null;
        this.iframeId = generateIframeId(componentState?.iframeName);
        this.isLoaded = false;
        this.isConnected = false;
        this.connectionTimeout = null;
        
        // Event subscriptions
        this.unsubscribeHandles = [];
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', `IframePanel initialized with ID: ${this.iframeId}`);
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
        this.showEmptyState();
    }

    createRootElement() {
        // Create root element
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'iframe-panel-container';
        this.rootElement.style.height = '100%';
        this.rootElement.style.overflow = 'hidden';
        this.rootElement.style.display = 'flex';
        this.rootElement.style.flexDirection = 'column';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Attach UI instance to DOM element for access by tests
        this.rootElement.iframePanelUI = this;
        
        // Get references to UI elements
        this.statusElement = this.rootElement.querySelector('.iframe-status');
        this.errorElement = this.rootElement.querySelector('.iframe-error');
    }

    createPanelHTML() {
        return `
            <div class="iframe-panel" style="
                height: 100%;
                display: flex;
                flex-direction: column;
                box-sizing: border-box;
            ">
                <div class="iframe-status" style="
                    padding: 10px;
                    background: #2d2d30;
                    border-bottom: 1px solid #3e3e42;
                    font-size: 12px;
                    color: #cccccc;
                    flex-shrink: 0;
                    box-sizing: border-box;
                ">
                    Iframe Panel Ready - No content loaded
                </div>
                
                <div class="iframe-error" style="
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
                
                <div class="iframe-content" style="
                    flex: 1;
                    position: relative;
                    background: #1e1e1e;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #888;
                    font-style: italic;
                    min-height: 0;
                    box-sizing: border-box;
                ">
                    <div class="empty-state">
                        No iframe content loaded.<br>
                        Use the Iframe Manager to load content.
                    </div>
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Listen for postMessage events from iframe
        window.addEventListener('message', (event) => {
            log('debug', `Global postMessage received, origin: ${event.origin}, source: ${event.source}, has iframe: ${this.iframe !== null}`);
            this.handlePostMessage(event);
        });
    }

    setupEventSubscriptions() {
        log('debug', `setupEventSubscriptions: eventBus available: ${eventBus !== null}`);
        if (eventBus) {
            log('debug', 'Subscribing to iframe:loadUrl event...');
            // Subscribe to load URL commands
            const loadUrlUnsubscribe = eventBus.subscribe('iframe:loadUrl', (data) => {
                log('debug', 'UI component received iframe:loadUrl event:', data);
                this.handleLoadUrl(data);
            }, 'iframePanel');
            this.unsubscribeHandles.push(loadUrlUnsubscribe);

            // Subscribe to unload commands
            const unloadUnsubscribe = eventBus.subscribe('iframe:unload', (data) => {
                this.handleUnload(data);
            }, 'iframePanel');
            this.unsubscribeHandles.push(unloadUnsubscribe);
            
            log('debug', 'Event subscriptions set up successfully');
        } else {
            log('error', 'eventBus is null! Cannot subscribe to events');
        }
    }

    /**
     * Handle load URL command
     * @param {object} data - Load URL data
     */
    handleLoadUrl(data) {
        const { url, panelId } = data;
        
        // Check if this command is for us (either no panelId specified or matches our container)
        if (panelId && panelId !== this.container?.id) {
            return; // Not for us
        }
        
        log('info', `Loading URL: ${url}`);
        this.loadIframe(url);
    }

    /**
     * Handle unload command
     * @param {object} data - Unload data
     */
    handleUnload(data) {
        const { panelId } = data;
        
        // Check if this command is for us
        if (panelId && panelId !== this.container?.id) {
            return; // Not for us
        }
        
        log('info', 'Unloading iframe');
        this.unloadIframe();
    }

    /**
     * Load an iframe with the specified URL
     * @param {string} url - URL to load
     */
    loadIframe(url) {
        try {
            log('debug', `loadIframe called with URL: ${url}`);
            
            // Clear any existing iframe first (this is a replacement)
            this.unloadIframe(true);
            
            // Now set the current URL
            this.currentUrl = url;
            this.isLoaded = false;
            this.isConnected = false;
            
            // Update status
            this.updateStatus(`Loading: ${url}`);
            this.hideError();
            
            log('debug', 'Creating iframe element...');
            
            // Create iframe element
            this.iframe = document.createElement('iframe');
            this.iframe.style.width = '100%';
            this.iframe.style.height = '100%';
            this.iframe.style.border = 'none';
            this.iframe.sandbox = 'allow-scripts allow-same-origin allow-forms allow-popups';
            
            // Set up iframe event listeners
            this.iframe.onload = () => {
                log('debug', `Iframe onload fired for URL: ${url}`);
                this.handleIframeLoad();
            };
            
            this.iframe.onerror = () => {
                log('error', `Iframe onerror fired for URL: ${url}`);
                this.handleIframeError('Failed to load iframe content');
            };
            
            // Set URL with iframe ID parameter and append to content area
            const urlWithId = `${url}?iframeId=${this.iframeId}`;
            this.iframe.src = urlWithId;
            log('debug', `Setting iframe src to: ${urlWithId}`);
            
            const contentArea = this.rootElement.querySelector('.iframe-content');
            if (contentArea) {
                contentArea.innerHTML = '';
                contentArea.appendChild(this.iframe);
            }
            
            // Set connection timeout
            this.connectionTimeout = setTimeout(() => {
                this.handleConnectionTimeout();
            }, 30000); // 30 second timeout
            
        } catch (error) {
            log('error', 'Error loading iframe:', error);
            this.handleIframeError(`Error loading iframe: ${error.message}`);
        }
    }

    /**
     * Unload current iframe
     * @param {boolean} isReplacement - True if this unload is part of loading a new iframe
     */
    unloadIframe(isReplacement = false) {
        if (this.iframe) {
            // Notify adapter that iframe is disconnecting
            if (this.isConnected && window.iframeAdapterCore) {
                window.iframeAdapterCore.unregisterIframe(this.iframeId);
            }
            
            this.iframe.remove();
            this.iframe = null;
            this.isLoaded = false;
            this.isConnected = false;
            // Only reset currentUrl if this is not part of replacement
            if (!isReplacement) {
                this.currentUrl = null;
            }
        }
        
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        // Only show empty state and reset status if not replacing
        if (!isReplacement) {
            this.showEmptyState();
            this.updateStatus('Iframe Panel Ready - No content loaded');
            this.hideError();
        }
        
        // Generate new iframe ID for next load (use custom name if available)
        this.iframeId = generateIframeId(this.customIframeName);
        
        // Publish unload event
        if (moduleEventBus) {
            moduleEventBus.publish('iframePanel:unloaded', { 
                panelId: this.container?.id 
            }, 'iframePanel');
        }
    }

    /**
     * Handle iframe load event
     */
    handleIframeLoad() {
        log('debug', `handleIframeLoad: iframe loaded for URL ${this.currentUrl}`);
        this.isLoaded = true;
        this.updateStatus(`Loaded: ${this.currentUrl} - Waiting for connection...`);
        
        log('debug', 'Iframe loaded, waiting for IFRAME_READY message...');
        // The iframe should send IFRAME_READY message when it's ready to communicate
        // The connection timeout will handle the case where it doesn't
    }

    /**
     * Handle iframe error
     * @param {string} errorMessage - Error message
     */
    handleIframeError(errorMessage) {
        log('error', 'Iframe error:', errorMessage);
        this.showError(errorMessage);
        this.updateStatus('Error loading iframe');
        
        // Publish error event
        if (moduleEventBus) {
            moduleEventBus.publish('iframePanel:error', { 
                panelId: this.container?.id,
                error: errorMessage,
                url: this.currentUrl
            }, 'iframePanel');
        }
    }

    /**
     * Handle connection timeout
     */
    handleConnectionTimeout() {
        if (!this.isConnected) {
            log('warn', 'Iframe connection timeout');
            this.handleIframeError('Connection timeout - iframe did not establish communication');
        }
    }

    /**
     * Handle postMessage from iframe
     * @param {MessageEvent} event - Message event
     */
    handlePostMessage(event) {
        log('debug', `handlePostMessage called, source: ${event.source}, iframe window: ${this.iframe?.contentWindow}`);
        
        // Only process messages from our iframe
        if (!this.iframe || event.source !== this.iframe.contentWindow) {
            log('debug', 'Message not from our iframe, ignoring');
            return;
        }
        
        const message = event.data;
        log('debug', `Received raw message from iframe:`, message);
        
        // Validate message
        if (!validateMessage(message)) {
            log('warn', 'Received invalid message from iframe', message);
            return;
        }
        
        // Check if message is for our iframe ID
        if (message.iframeId !== this.iframeId) {
            log('warn', `Received message for different iframe ID. Expected: ${this.iframeId}, Got: ${message.iframeId}`, message);
            return;
        }
        
        log('debug', `Received valid message from iframe: ${message.type}`);
        
        // Handle specific message types
        switch (message.type) {
            case MessageTypes.IFRAME_READY:
                this.handleIframeReady(message);
                break;
                
            default:
                // Forward other messages to the adapter core
                if (window.iframeAdapterCore) {
                    window.iframeAdapterCore.handlePostMessage(event);
                }
                break;
        }
    }

    /**
     * Handle iframe ready message
     * @param {object} message - The iframe ready message
     */
    handleIframeReady(message) {
        log('debug', `handleIframeReady called with message:`, message);
        log('info', `Iframe ready: ${this.iframeId}`);
        
        this.isConnected = true;
        this.updateStatus(`Connected: ${this.currentUrl}`);
        this.hideError();
        
        // Clear connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        // Forward to adapter core for registration
        if (window.iframeAdapterCore) {
            const event = { source: this.iframe.contentWindow, data: message };
            window.iframeAdapterCore.handlePostMessage(event);
        }
        
        // Publish loaded event
        log('debug', `Attempting to publish iframePanel:loaded event. moduleEventBus available: ${moduleEventBus !== null}`);
        if (moduleEventBus) {
            log('debug', `Publishing iframePanel:loaded event via moduleEventBus with data:`, {
                panelId: this.container?.id,
                iframeId: this.iframeId,
                url: this.currentUrl
            });
            moduleEventBus.publish('iframePanel:loaded', { 
                panelId: this.container?.id,
                iframeId: this.iframeId,
                url: this.currentUrl
            }, 'iframePanel');
            log('debug', `iframePanel:loaded event published successfully via moduleEventBus`);
        } else {
            log('error', `Cannot publish iframePanel:loaded event - moduleEventBus is null`);
        }
    }

    /**
     * Show empty state
     */
    showEmptyState() {
        const contentArea = this.rootElement.querySelector('.iframe-content');
        if (contentArea) {
            contentArea.innerHTML = `
                <div class="empty-state" style="
                    text-align: center;
                    color: #888;
                    font-style: italic;
                ">
                    No iframe content loaded.<br>
                    Use the Iframe Manager to load content.
                </div>
            `;
        }
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
    }

    hide() {
        // Panel is being hidden
    }

    focus() {
        // Panel is being focused
        if (this.iframe) {
            this.iframe.focus();
        }
    }

    /**
     * Set a custom iframe name for future iframe ID generation
     * @param {string} name - Custom name to use
     */
    setCustomIframeName(name) {
        this.customIframeName = name;
        log('info', `IframePanel custom iframe name set to: ${name}`);
    }

    // Cleanup
    dispose() {
        log('info', 'IframePanelUI disposing...');
        
        // Unload iframe
        this.unloadIframe();
        
        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.unsubscribeHandles = [];

        // Clear references
        this.iframe = null;
        this.statusElement = null;
        this.errorElement = null;
    }
}
// Unified adapter client for communication with the main application.
// Auto-detects whether running in an iframe or a separate window and uses
// the appropriate transport (window.parent vs window.opener).

import {
    MessageTypes,
    createMessage,
    validateMessage,
    generateClientId
} from './communicationProtocol.js';

/**
 * Detect whether the current context is an iframe or a separate window.
 * @returns {{ mode: 'iframe'|'window', targetWindow: Window, id: string }}
 */
function detectContext() {
    const urlParams = new URLSearchParams(window.location.search);

    // Explicit URL params take precedence
    const windowIdParam = urlParams.get('windowId');
    const iframeIdParam = urlParams.get('iframeId');
    const clientIdParam = urlParams.get('clientId');
    const customName = urlParams.get('windowName') || urlParams.get('iframeName') || null;

    // Detect window mode: opener exists, is not null, is not closed, is not self
    const hasOpener = window.opener && window.opener !== window && !window.opener.closed;
    // Detect iframe mode: parent exists and is not self
    const hasParent = window.parent && window.parent !== window;

    let mode, targetWindow, id;

    if (windowIdParam) {
        // Explicit window mode via URL param
        mode = 'window';
        targetWindow = window.opener || window.parent;
        id = windowIdParam;
    } else if (iframeIdParam || clientIdParam) {
        // Explicit iframe/client mode via URL param
        mode = hasOpener ? 'window' : 'iframe';
        targetWindow = hasOpener ? window.opener : window.parent;
        id = iframeIdParam || clientIdParam;
    } else if (hasOpener) {
        // Auto-detect: opener available → window mode
        mode = 'window';
        targetWindow = window.opener;
        id = generateClientId(customName || 'window-client');
    } else if (hasParent) {
        // Auto-detect: parent available → iframe mode
        mode = 'iframe';
        targetWindow = window.parent;
        id = generateClientId(customName || 'iframe-client');
    } else {
        // Fallback: not in an embedded context
        mode = 'iframe';
        targetWindow = window.parent;
        id = generateClientId(customName || 'standalone');
    }

    return { mode, targetWindow, id };
}

export class AdapterClient {
    constructor() {
        const { mode, targetWindow, id } = detectContext();

        this.mode = mode;
        this.clientId = id;
        this.targetWindow = targetWindow;

        this.isConnected = false;
        this.connectionTimeout = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.heartbeatInterval = null;

        // Event listeners
        this.eventListeners = new Map(); // eventName -> Set of callbacks

        // Cached data from main app
        this.cachedStateSnapshot = null;
        this.cachedStaticData = null;

        // Logging config update callback (set by consumer if needed)
        this._logConfigHandler = null;

        // Setup postMessage listener
        this.setupPostMessageListener();
    }

    /** @returns {string} Backward-compat alias */
    get iframeId() { return this.clientId; }

    /** @returns {string} Backward-compat alias */
    get windowId() { return this.clientId; }

    /**
     * Initialize connection to main application
     * @returns {Promise<boolean>} True if connection successful
     */
    async connect() {
        return new Promise((resolve, reject) => {
            // Set up connection timeout
            this.connectionTimeout = setTimeout(() => {
                this.handleConnectionTimeout(resolve, reject);
            }, 10000);

            // Store resolve/reject for later use
            this.connectionResolve = resolve;
            this.connectionReject = reject;

            // Send the appropriate ready message based on mode
            const readyType = this.mode === 'window'
                ? MessageTypes.WINDOW_READY
                : MessageTypes.IFRAME_READY;

            this.sendToParent(readyType, {
                clientId: this.clientId,
                iframeId: this.clientId,
                windowId: this.clientId,
                version: '1.0.0',
                capabilities: [this.mode === 'window' ? 'window-base' : 'iframe-base']
            });
        });
    }

    /**
     * Handle connection timeout
     */
    handleConnectionTimeout(resolve, reject) {
        this.retryCount++;

        if (this.retryCount <= this.maxRetries) {
            // Retry connection
            setTimeout(() => {
                const readyType = this.mode === 'window'
                    ? MessageTypes.WINDOW_READY
                    : MessageTypes.IFRAME_READY;

                this.sendToParent(readyType, {
                    clientId: this.clientId,
                    iframeId: this.clientId,
                    windowId: this.clientId,
                    version: '1.0.0',
                    capabilities: [this.mode === 'window' ? 'window-base' : 'iframe-base']
                });

                // Reset timeout
                this.connectionTimeout = setTimeout(() => {
                    this.handleConnectionTimeout(resolve, reject);
                }, 5000);
            }, 1000);
        } else {
            if (reject) {
                reject(new Error('Connection timeout'));
            }
        }
    }

    /**
     * Setup postMessage listener
     */
    setupPostMessageListener() {
        window.addEventListener('message', (event) => {
            this.handlePostMessage(event);
        });
    }

    /**
     * Handle incoming postMessage
     * @param {MessageEvent} event - Message event
     */
    handlePostMessage(event) {
        const message = event.data;

        // Validate message
        if (!validateMessage(message)) {
            return;
        }

        // Check if message is for us (accept any of the ID fields)
        const messageId = message.clientId || message.iframeId || message.windowId;
        if (messageId !== this.clientId) {
            return;
        }

        // Handle different message types
        switch (message.type) {
            case MessageTypes.ADAPTER_READY:
                this.handleAdapterReady(message);
                break;

            case MessageTypes.EVENT_BUS_MESSAGE:
                this.handleEventBusMessage(message);
                break;

            case MessageTypes.EVENT_DISPATCHER_MESSAGE:
                this.handleEventDispatcherMessage(message);
                break;

            case MessageTypes.STATE_SNAPSHOT:
                this.handleStateSnapshot(message);
                break;

            case MessageTypes.STATIC_DATA_RESPONSE:
                this.handleStaticDataResponse(message);
                break;

            case MessageTypes.HEARTBEAT_RESPONSE:
                // Heartbeat acknowledged
                break;

            case MessageTypes.CONNECTION_ERROR:
                this.handleConnectionError(message);
                break;

            case MessageTypes.LOG_CONFIG_UPDATE:
                this.handleLogConfigUpdate(message);
                break;

            case MessageTypes.LOG_CONFIG_RESPONSE:
                this.handleLogConfigResponse(message);
                break;

            default:
                break;
        }
    }

    /**
     * Handle adapter ready message
     * @param {object} message - Message object
     */
    handleAdapterReady(message) {
        this.isConnected = true;

        // Clear connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        // Handle initial logging configuration if provided
        if (message.data && message.data.loggingConfig && this._logConfigHandler) {
            this._logConfigHandler(message.data.loggingConfig);
        }

        // Start heartbeat
        this.startHeartbeat();

        // Resolve connection promise
        if (this.connectionResolve) {
            this.connectionResolve(true);
            this.connectionResolve = null;
            this.connectionReject = null;
        }

        // Request initial static data and state snapshot
        this.requestStaticData();
        this.requestStateSnapshot();
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        // Clear any existing heartbeat interval first
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Get heartbeat interval from URL parameter, default to 30 seconds
        const urlParams = new URLSearchParams(window.location.search);
        const heartbeatInterval = parseInt(urlParams.get('heartbeatInterval')) || 30000;

        this.heartbeatInterval = setInterval(() => {
            this.sendToParent(MessageTypes.HEARTBEAT, {
                timestamp: Date.now()
            });
        }, heartbeatInterval);
    }

    /**
     * Handle event bus message
     * @param {object} message - Message object
     */
    handleEventBusMessage(message) {
        const { eventName, eventData } = message.data;

        // Cache state snapshots
        if (eventName === 'stateManager:snapshotUpdated' || eventName === 'stateManager:rulesLoaded') {
            this.cachedStateSnapshot = eventData.snapshot || eventData;
        }

        // Trigger local event listeners
        this.triggerEventListeners('eventBus', eventName, eventData);
    }

    /**
     * Handle event dispatcher message
     * @param {object} message - Message object
     */
    handleEventDispatcherMessage(message) {
        const { eventName, eventData, propagationOptions } = message.data;

        // Trigger local event listeners
        this.triggerEventListeners('dispatcher', eventName, { eventData, propagationOptions });
    }

    /**
     * Handle state snapshot message
     * @param {object} message - Message object
     */
    handleStateSnapshot(message) {
        this.cachedStateSnapshot = message.data.snapshot;

        // Trigger snapshot update event
        this.triggerEventListeners('eventBus', 'stateManager:snapshotUpdated', {
            snapshot: this.cachedStateSnapshot
        });
    }

    /**
     * Handle static data response
     * @param {object} message - Message object
     */
    handleStaticDataResponse(message) {
        this.cachedStaticData = message.data.staticData;
    }

    /**
     * Handle connection error
     * @param {object} message - Message object
     */
    handleConnectionError(message) {
        // Connection error received from adapter
    }

    /**
     * Handle logging configuration update message
     * @param {object} message - Message object
     */
    handleLogConfigUpdate(message) {
        if (message.data && message.data.loggingConfig && this._logConfigHandler) {
            this._logConfigHandler(message.data.loggingConfig);
        }
    }

    /**
     * Handle logging configuration response message
     * @param {object} message - Message object
     */
    handleLogConfigResponse(message) {
        if (message.data && message.data.loggingConfig && this._logConfigHandler) {
            this._logConfigHandler(message.data.loggingConfig);
        }
    }

    /**
     * Set a handler for logging configuration updates.
     * @param {function} handler - Callback receiving loggingConfig object
     */
    setLogConfigHandler(handler) {
        this._logConfigHandler = handler;
    }

    /**
     * Apply logging configuration (convenience method for backward compat with WindowClient).
     * Consumers should call setLogConfigHandler() to register their logger update function.
     * @param {object} loggingConfig - Logging configuration object
     */
    applyLoggingConfig(loggingConfig) {
        if (this._logConfigHandler) {
            this._logConfigHandler(loggingConfig);
        }
    }

    /**
     * Request current logging configuration from main thread
     */
    requestLogConfig() {
        if (!this.isConnected) {
            return;
        }
        this.sendToParent(MessageTypes.REQUEST_LOG_CONFIG, {});
    }

    /**
     * Subscribe to event bus events
     * @param {string} eventName - Event name to subscribe to
     * @param {function} callback - Callback function
     */
    subscribeEventBus(eventName, callback) {
        if (!this.eventListeners.has(`eventBus:${eventName}`)) {
            this.eventListeners.set(`eventBus:${eventName}`, new Set());
        }

        this.eventListeners.get(`eventBus:${eventName}`).add(callback);

        // Send subscription message to adapter
        this.sendToParent(MessageTypes.SUBSCRIBE_EVENT_BUS, {
            eventName
        });
    }

    /**
     * Subscribe to event dispatcher events
     * @param {string} eventName - Event name to subscribe to
     * @param {function} callback - Callback function
     */
    subscribeEventDispatcher(eventName, callback) {
        if (!this.eventListeners.has(`dispatcher:${eventName}`)) {
            this.eventListeners.set(`dispatcher:${eventName}`, new Set());
        }

        this.eventListeners.get(`dispatcher:${eventName}`).add(callback);

        // Send subscription message to adapter
        this.sendToParent(MessageTypes.SUBSCRIBE_EVENT_DISPATCHER, {
            eventName
        });
    }

    /**
     * Publish to event bus
     * @param {string} eventName - Event name
     * @param {any} eventData - Event data
     */
    publishEventBus(eventName, eventData) {
        this.sendToParent(MessageTypes.PUBLISH_EVENT_BUS, {
            eventName,
            eventData
        });
    }

    /**
     * Publish to event dispatcher
     * @param {string} eventName - Event name
     * @param {any} eventData - Event data
     * @param {string} target - Target for event (optional)
     */
    publishEventDispatcher(eventName, eventData, target) {
        this.sendToParent(MessageTypes.PUBLISH_EVENT_DISPATCHER, {
            eventName,
            eventData,
            target
        });
    }

    /**
     * Request static data from main app
     */
    requestStaticData() {
        this.sendToParent(MessageTypes.REQUEST_STATIC_DATA, {});
    }

    /**
     * Request current state snapshot from main app
     */
    requestStateSnapshot() {
        this.sendToParent(MessageTypes.REQUEST_STATE_SNAPSHOT, {});
    }

    /**
     * Get cached state snapshot
     * @returns {object|null} State snapshot
     */
    getStateSnapshot() {
        return this.cachedStateSnapshot;
    }

    /**
     * Get cached static data
     * @returns {object|null} Static data
     */
    getStaticData() {
        return this.cachedStaticData;
    }

    /**
     * Trigger event listeners
     * @param {string} type - Event type ('eventBus' or 'dispatcher')
     * @param {string} eventName - Event name
     * @param {any} eventData - Event data
     */
    triggerEventListeners(type, eventName, eventData) {
        const key = `${type}:${eventName}`;
        const listeners = this.eventListeners.get(key);

        if (listeners) {
            for (const callback of listeners) {
                try {
                    callback(eventData);
                } catch (error) {
                    // Listener error — do not propagate
                }
            }
        }
    }

    /**
     * Notify adapter that the application is fully initialized and ready.
     * This should be called after all event subscriptions are set up.
     */
    notifyAppReady() {
        this.sendToParent(MessageTypes.IFRAME_APP_READY, {
            timestamp: Date.now()
        });
    }

    /**
     * Send message to the parent/opener window
     * @param {string} type - Message type
     * @param {any} data - Message data
     */
    sendToParent(type, data) {
        if (!this.targetWindow) {
            return;
        }

        // For window mode, check if opener has been closed
        if (this.mode === 'window' && this.targetWindow.closed) {
            return;
        }

        // For iframe mode, check if parent is self (not embedded)
        if (this.mode === 'iframe' && this.targetWindow === window) {
            return;
        }

        const message = createMessage(type, this.clientId, data);

        try {
            // Try origin-specific first for better security
            this.targetWindow.postMessage(message, window.location.origin);
        } catch (originError) {
            try {
                // Fallback to wildcard origin
                this.targetWindow.postMessage(message, '*');
            } catch (error) {
                // Failed to send message
            }
        }
    }

    /**
     * Disconnect from main application
     */
    disconnect() {
        this.isConnected = false;

        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Clear cached data
        this.cachedStateSnapshot = null;
        this.cachedStaticData = null;

        // Clear event listeners
        this.eventListeners.clear();
    }
}

// Iframe client for communication with the main application
import { 
    MessageTypes, 
    createMessage, 
    validateMessage,
    generateIframeId 
} from '../iframeAdapter/communicationProtocol.js';

export class IframeClient {
    constructor() {
        // Get iframe ID from URL parameters, or generate one if not provided
        const urlParams = new URLSearchParams(window.location.search);
        const customId = urlParams.get('iframeId');
        const customName = urlParams.get('iframeName') || 'iframe-base';
        
        // Use custom ID if provided, otherwise generate with custom name, fallback to random
        this.iframeId = customId || generateIframeId(customName);
        
        // Add browser detection for debugging
        const userAgent = navigator.userAgent.toLowerCase();
        const isFirefox = userAgent.includes('firefox');
        const isChrome = userAgent.includes('chrome');
        this.isConnected = false;
        this.connectionTimeout = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.heartbeatInterval = null;
        
        // Event listeners for iframe events
        this.eventListeners = new Map(); // eventName -> Set of callbacks
        
        // Cached data from main app
        this.cachedStateSnapshot = null;
        this.cachedStaticData = null;
        
        // Setup postMessage listener
        this.setupPostMessageListener();
        
    }

    /**
     * Initialize connection to main application
     * @returns {Promise<boolean>} True if connection successful
     */
    async connect() {
        return new Promise((resolve, reject) => {
            
            // Set up connection timeout
            this.connectionTimeout = setTimeout(() => {
                this.handleConnectionTimeout(resolve, reject);
            }, 10000); // Increased timeout for Firefox
            
            // Store resolve/reject for later use
            this.connectionResolve = resolve;
            this.connectionReject = reject;
            
            // Send ready message to parent
            this.sendToParent(MessageTypes.IFRAME_READY, {
                iframeId: this.iframeId,
                version: '1.0.0',
                capabilities: ['iframe-base']
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
                this.sendToParent(MessageTypes.IFRAME_READY, {
                    iframeId: this.iframeId,
                    version: '1.0.0',
                    capabilities: ['iframe-base']
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
        
        // Check if message is for us
        if (message.iframeId !== this.iframeId) {
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
                this.handleHeartbeatResponse(message);
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
        // (Logger removed - applications using IframeClient handle logging themselves)

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
        // For testing, you can add ?heartbeatInterval=3000 to make it 3 seconds
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
     * Handle heartbeat response
     * @param {object} message - Message object
     */
    handleHeartbeatResponse(message) {
        // Heartbeat acknowledged
    }

    /**
     * Handle connection error
     * @param {object} message - Message object
     */
    handleConnectionError(message) {
        const { errorType, message: errorMessage } = message.data;
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
                }
            }
        }
    }

    /**
     * Send message to parent window
     * @param {string} type - Message type
     * @param {any} data - Message data
     */
    sendToParent(type, data) {
        if (!window.parent) {
            return;
        }
        
        if (window.parent === window) {
            return;
        }
        
        const message = createMessage(type, this.iframeId, data);
        
        try {
            // Try multiple origin targets for better Firefox compatibility
            window.parent.postMessage(message, window.location.origin);
        } catch (originError) {
            try {
                // Fallback to wildcard origin
                window.parent.postMessage(message, '*');
            } catch (error) {
            }
        }
    }


    /**
     * Notify adapter that the application is fully initialized and ready
     * This should be called after all event subscriptions are set up
     */
    notifyAppReady() {
        this.sendToParent(MessageTypes.IFRAME_APP_READY, {
            timestamp: Date.now()
        });
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

    /**
     * Handle logging configuration update message
     * @param {object} message - Message object
     */
    handleLogConfigUpdate(message) {
        // Logger removed - this is a no-op now
        // Applications using IframeClient can handle logging themselves
    }

    /**
     * Handle logging configuration response message
     * @param {object} message - Message object
     */
    handleLogConfigResponse(message) {
        // Logger removed - this is a no-op now
        // Applications using IframeClient can handle logging themselves
    }
}
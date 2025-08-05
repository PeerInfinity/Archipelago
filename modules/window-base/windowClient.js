// Window client for communication with the main application
import { 
    MessageTypes, 
    createMessage, 
    validateMessage,
    generateWindowId 
} from '../windowAdapter/communicationProtocol.js';
import { createSharedLogger, updateWindowLoggerConfig } from './shared/sharedLogger.js';

// Create logger for this module  
const logger = createSharedLogger('windowClient');

export class WindowClient {
    constructor() {
        // Get window ID from URL parameters, or generate one if not provided
        const urlParams = new URLSearchParams(window.location.search);
        const customId = urlParams.get('windowId') || urlParams.get('iframeId'); // Support both for compatibility
        const customName = urlParams.get('windowName') || urlParams.get('iframeName') || 'window-base';
        
        // Use custom ID if provided, otherwise generate with custom name, fallback to random
        this.windowId = customId || generateWindowId(customName);
        logger.debug(`WindowClient using window ID: ${this.windowId}`);
        
        // Add browser detection for debugging
        const userAgent = navigator.userAgent.toLowerCase();
        const isFirefox = userAgent.includes('firefox');
        const isChrome = userAgent.includes('chrome');
        logger.info(`Browser detected: Firefox=${isFirefox}, Chrome=${isChrome}, UserAgent=${userAgent}`);
        this.isConnected = false;
        this.connectionTimeout = null;
        this.retryCount = 0;
        this.maxRetries = 3;
        this.heartbeatInterval = null;
        
        // Event listeners for window events
        this.eventListeners = new Map(); // eventName -> Set of callbacks
        
        // Cached data from main app
        this.cachedStateSnapshot = null;
        this.cachedStaticData = null;
        
        // Reference to opener window (the main application)
        this.openerWindow = window.opener;
        
        // Setup postMessage listener
        this.setupPostMessageListener();
        
        logger.info(`WindowClient initialized with ID: ${this.windowId}`);
    }

    /**
     * Initialize connection to main application
     * @returns {Promise<boolean>} True if connection successful
     */
    async connect() {
        return new Promise((resolve, reject) => {
            logger.info('Attempting to connect to main application...');
            logger.info(`Window context: opener=${!!this.openerWindow}, parent=${!!window.parent}, top=${!!window.top}, self=${!!window.self}`);
            logger.info(`Same window check: opener===self=${this.openerWindow === window.self}`);
            
            if (!this.openerWindow) {
                logger.error('No opener window available - window was not opened by main application');
                reject(new Error('No opener window available'));
                return;
            }
            
            // Set up connection timeout
            this.connectionTimeout = setTimeout(() => {
                this.handleConnectionTimeout(resolve, reject);
            }, 10000); // Increased timeout for Firefox
            
            // Store resolve/reject for later use
            this.connectionResolve = resolve;
            this.connectionReject = reject;
            
            // Send ready message to opener
            logger.info('Sending WINDOW_READY message to opener...');
            this.sendToParent(MessageTypes.WINDOW_READY, {
                windowId: this.windowId,
                iframeId: this.windowId, // Include for compatibility
                version: '1.0.0',
                capabilities: ['window-base']
            });
            logger.info('WINDOW_READY message sent');
        });
    }

    /**
     * Handle connection timeout
     */
    handleConnectionTimeout(resolve, reject) {
        this.retryCount++;
        
        if (this.retryCount <= this.maxRetries) {
            logger.warn(`Connection attempt ${this.retryCount} failed, retrying...`);
            
            // Retry connection
            setTimeout(() => {
                this.sendToParent(MessageTypes.WINDOW_READY, {
                    windowId: this.windowId,
                    iframeId: this.windowId, // Include for compatibility
                    version: '1.0.0',
                    capabilities: ['window-base']
                });
                
                // Reset timeout
                this.connectionTimeout = setTimeout(() => {
                    this.handleConnectionTimeout(resolve, reject);
                }, 5000);
            }, 1000);
        } else {
            logger.error('Connection failed after maximum retries');
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
        
        // Check if message is for us (support both windowId and iframeId)
        const messageWindowId = message.windowId || message.iframeId;
        if (messageWindowId !== this.windowId) {
            return;
        }
        
        logger.debug(`Received message: ${message.type}`);
        
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
                logger.warn(`Unhandled message type: ${message.type}`);
        }
    }

    /**
     * Handle adapter ready message
     * @param {object} message - Message object
     */
    handleAdapterReady(message) {
        logger.info('Connected to adapter successfully');
        
        this.isConnected = true;
        
        // Clear connection timeout
        if (this.connectionTimeout) {
            clearTimeout(this.connectionTimeout);
            this.connectionTimeout = null;
        }
        
        // Handle initial logging configuration if provided
        if (message.data && message.data.loggingConfig) {
            this.applyLoggingConfig(message.data.loggingConfig);
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
            logger.debug('Cleared existing heartbeat interval');
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
        
        logger.debug(`Started heartbeat with ${heartbeatInterval}ms interval`);
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
        logger.debug('State snapshot updated:', this.cachedStateSnapshot);
        
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
        logger.debug('Static data received');
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
        logger.error(`Connection error: ${errorType} - ${errorMessage}`);
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
        
        logger.debug(`Subscribed to eventBus event: ${eventName}`);
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
        
        logger.debug(`Subscribed to dispatcher event: ${eventName}`);
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
        
        logger.debug(`Published eventBus event: ${eventName}`);
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
        
        logger.debug(`Published dispatcher event: ${eventName}`);
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
        logger.debug('Requesting state snapshot from main app');
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
                    logger.error(`Error in event listener for ${key}:`, error);
                }
            }
        }
    }

    /**
     * Send message to parent window (opener)
     * @param {string} type - Message type
     * @param {any} data - Message data
     */
    sendToParent(type, data) {
        if (!this.openerWindow) {
            logger.error('No opener window available');
            return;
        }
        
        if (this.openerWindow.closed) {
            logger.warn('Opener window has been closed');
            return;
        }
        
        const message = createMessage(type, this.windowId, data);
        
        try {
            // Try multiple origin targets for better Firefox compatibility
            this.openerWindow.postMessage(message, window.location.origin);
            logger.debug(`Sent message: ${type} to origin ${window.location.origin}`);
        } catch (originError) {
            try {
                // Fallback to wildcard origin
                this.openerWindow.postMessage(message, '*');
                logger.debug(`Sent message: ${type} to wildcard origin`);
            } catch (error) {
                logger.error('Error sending message to opener:', error);
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
        
        logger.info('Disconnected from main application');
    }

    /**
     * Handle logging configuration update message
     * @param {object} message - Message object
     */
    handleLogConfigUpdate(message) {
        if (message.data && message.data.loggingConfig) {
            logger.info('Received logging configuration update from main thread');
            this.applyLoggingConfig(message.data.loggingConfig);
        }
    }

    /**
     * Handle logging configuration response message
     * @param {object} message - Message object
     */
    handleLogConfigResponse(message) {
        if (message.data && message.data.loggingConfig) {
            logger.info('Received logging configuration response from main thread');
            this.applyLoggingConfig(message.data.loggingConfig);
        }
    }

    /**
     * Apply logging configuration to the window logger
     * @param {object} loggingConfig - Logging configuration object
     */
    applyLoggingConfig(loggingConfig) {
        try {
            // Apply configuration synchronously using the imported function
            updateWindowLoggerConfig(loggingConfig);
            logger.debug('Applied logging configuration:', loggingConfig);
        } catch (error) {
            logger.error('Error applying logging configuration:', error);
        }
    }

    /**
     * Request current logging configuration from main thread
     */
    requestLogConfig() {
        if (!this.isConnected) {
            logger.warn('Cannot request log config - not connected to adapter');
            return;
        }

        const message = createMessage(MessageTypes.REQUEST_LOG_CONFIG, this.windowId);
        this.sendToParent(message.type, message.data);
        logger.debug('Requested logging configuration from main thread');
    }
}
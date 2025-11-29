// Core adapter logic for event bridging between main app and separate windows
import {
    MessageTypes,
    createMessage,
    validateMessage,
    safePostMessage,
    createErrorMessage
} from './communicationProtocol.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('windowAdapterCore', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[windowAdapterCore] ${message}`, ...data);
    }
}

export class WindowAdapterCore {
    constructor(eventBus, dispatcher, registerDynamicPublisher) {
        this.eventBus = eventBus;
        this.dispatcher = dispatcher;
        this.registerDynamicPublisher = registerDynamicPublisher;
        
        // Registry of connected windows
        this.windows = new Map(); // windowId -> { window, subscriptions, lastHeartbeat }

        // Event subscriptions tracking
        this.eventBusSubscriptions = new Map(); // windowId -> Set of event names
        this.dispatcherSubscriptions = new Map(); // windowId -> Set of event names
        this._adapterEventBusSubscriptions = new Set(); // Track which events the adapter has subscribed to

        // Message handlers
        this.messageHandlers = new Map();
        this.setupMessageHandlers();
        
        // Listen for postMessage events
        this.setupPostMessageListener();
        
        // Setup heartbeat monitoring
        this.heartbeatInterval = null;
        this.startHeartbeatMonitoring();
        
        log('info', 'WindowAdapterCore initialized');
    }

    /**
     * Setup message handlers for different message types
     */
    setupMessageHandlers() {
        this.messageHandlers.set(MessageTypes.WINDOW_READY, this.handleWindowReady.bind(this));
        this.messageHandlers.set(MessageTypes.HEARTBEAT, this.handleHeartbeat.bind(this));
        this.messageHandlers.set(MessageTypes.SUBSCRIBE_EVENT_BUS, this.handleSubscribeEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.SUBSCRIBE_EVENT_DISPATCHER, this.handleSubscribeEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.UNSUBSCRIBE_EVENT_BUS, this.handleUnsubscribeEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.UNSUBSCRIBE_EVENT_DISPATCHER, this.handleUnsubscribeEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.PUBLISH_EVENT_BUS, this.handlePublishEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.PUBLISH_EVENT_DISPATCHER, this.handlePublishEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.REQUEST_STATIC_DATA, this.handleRequestStaticData.bind(this));
        this.messageHandlers.set(MessageTypes.REQUEST_STATE_SNAPSHOT, this.handleRequestStateSnapshot.bind(this));
        this.messageHandlers.set(MessageTypes.REQUEST_LOG_CONFIG, this.handleRequestLogConfig.bind(this));

        // Stub handlers for iframe-specific messages (handled by iframeAdapterCore instead)
        this.messageHandlers.set(MessageTypes.IFRAME_READY, this.handleIframeMessage.bind(this));
        this.messageHandlers.set(MessageTypes.IFRAME_APP_READY, this.handleIframeMessage.bind(this));
    }

    /**
     * Setup listener for postMessage events from windows
     */
    setupPostMessageListener() {
        window.addEventListener('message', (event) => {
            this.handlePostMessage(event);
        });
    }

    /**
     * Handle incoming postMessage events
     * @param {MessageEvent} event - PostMessage event
     */
    handlePostMessage(event) {
        const message = event.data;
        
        // Validate message structure
        if (!validateMessage(message)) {
            log('warn', 'Received invalid message', message);
            return;
        }
        
        log('debug', `Received message: ${message.type} from window: ${message.windowId || message.iframeId}`);
        
        // Debug log all available handlers
        if (message.type === 'REQUEST_STATE_SNAPSHOT') {
            log('debug', 'Available message handlers:', Array.from(this.messageHandlers.keys()));
        }
        
        // Get message handler
        const handler = this.messageHandlers.get(message.type);
        if (!handler) {
            log('warn', `No handler for message type: ${message.type}`);
            return;
        }
        
        try {
            handler(message, event.source);
        } catch (error) {
            log('error', `Error handling message ${message.type}:`, error);
            this.sendErrorToWindow(event.source, message.windowId || message.iframeId, 'HANDLER_ERROR', error.message);
        }
    }

    /**
     * Register a window with the adapter
     * @param {string} windowId - Unique window identifier
     * @param {Window} windowRef - Window reference
     */
    registerWindow(windowId, windowRef) {
        this.windows.set(windowId, {
            window: windowRef,
            subscriptions: {
                eventBus: new Set(),
                dispatcher: new Set()
            },
            lastHeartbeat: Date.now(),
            connected: true
        });

        this.eventBusSubscriptions.set(windowId, new Set());
        this.dispatcherSubscriptions.set(windowId, new Set());

        log('info', `Window registered: ${windowId}`);

        // Register window-specific publisher for common events that windows might publish
        if (this.registerDynamicPublisher) {
            const publisherId = `${windowId}`;
            // Register for common events that windows typically publish
            this.registerDynamicPublisher(publisherId, 'playerState:regionChanged');
            log('debug', `Registered dynamic publisher ${publisherId} for window events`);
        }

        // Publish connection event
        if (this.eventBus) {
            this.eventBus.publish('window:connected', { windowId }, 'windowAdapter');

            // Send current region to newly connected window so it can initialize its state
            // Use setTimeout to ensure window has finished setting up its event subscriptions
            setTimeout(() => {
                const playerState = getPlayerStateSingleton();
                const currentRegion = playerState?.getCurrentRegion();
                if (currentRegion) {
                    log('debug', `Sending current region to window: ${currentRegion}`);
                    // Publish region changed event so window can sync
                    this.eventBus.publish('playerState:regionChanged', {
                        oldRegion: null,
                        newRegion: currentRegion
                    }, 'windowAdapter');
                } else {
                    log('debug', 'No current region to send to window');
                }
            }, 500); // Delay to ensure window subscriptions are ready
        }
    }

    /**
     * Unregister a window
     * @param {string} windowId - Window identifier
     */
    unregisterWindow(windowId) {
        if (this.windows.has(windowId)) {
            this.windows.delete(windowId);
            this.eventBusSubscriptions.delete(windowId);
            this.dispatcherSubscriptions.delete(windowId);
            
            log('info', `Window unregistered: ${windowId}`);
            
            // Publish disconnection event
            if (this.eventBus) {
                this.eventBus.publish('window:disconnected', { windowId }, 'windowAdapter');
            }
        }
    }

    /**
     * Stub handler for iframe-specific messages
     * These messages are handled by iframeAdapterCore, not windowAdapterCore
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleIframeMessage(message, source) {
        // Silently ignore - these messages are for iframeAdapterCore
        log('debug', `Ignoring iframe-specific message: ${message.type} (handled by iframeAdapterCore)`);
    }

    /**
     * Handle window ready message
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleWindowReady(message, source) {
        const windowId = message.windowId || message.iframeId; // Support both for compatibility
        
        // Register the window
        this.registerWindow(windowId, source);
        
        // Get current logging configuration to send with ready response
        let loggingConfig = null;
        if (typeof window !== 'undefined' && window.logger) {
            try {
                const currentConfig = window.logger.getConfig();
                loggingConfig = {
                    defaultLevel: currentConfig.defaultLevel,
                    categoryLevels: currentConfig.categoryLevels || {},
                    enabled: currentConfig.enabled
                };
            } catch (error) {
                log('warn', 'Could not get logging config for ready response:', error);
            }
        }
        
        // Send adapter ready response with initial logging configuration
        const response = createMessage(MessageTypes.ADAPTER_READY, windowId, {
            adapterVersion: '1.0.0',
            capabilities: ['eventBus', 'dispatcher', 'stateManager', 'logging'],
            loggingConfig: loggingConfig
        });
        
        safePostMessage(source, response);
    }

    /**
     * Handle heartbeat message
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleHeartbeat(message, source) {
        const windowId = message.windowId || message.iframeId; // Support both for compatibility
        
        if (this.windows.has(windowId)) {
            // Update last heartbeat timestamp
            this.windows.get(windowId).lastHeartbeat = Date.now();
            
            // Send heartbeat response
            const response = createMessage(MessageTypes.HEARTBEAT_RESPONSE, windowId, {
                timestamp: Date.now()
            });
            
            safePostMessage(source, response);
        }
    }

    /**
     * Handle event bus subscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleSubscribeEventBus(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName } = data;

        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }

        // Add to subscriptions
        this.eventBusSubscriptions.get(windowId).add(eventName);

        log('debug', `Window ${windowId} subscribed to eventBus event: ${eventName}`);

        // If this is the first window to subscribe to this event, subscribe the adapter to it
        // Check if any window is subscribed to this event
        let anyWindowSubscribed = false;
        for (const subscriptions of this.eventBusSubscriptions.values()) {
            if (subscriptions.has(eventName)) {
                anyWindowSubscribed = true;
                break;
            }
        }

        // Only subscribe once per event (avoid duplicate subscriptions)
        if (anyWindowSubscribed && !this._adapterEventBusSubscriptions.has(eventName)) {
            // Subscribe to the event and forward to interested windows
            this.eventBus.subscribe(eventName, (eventData) => {
                this.handleEventBusEvent(eventName, eventData);
            }, 'windowAdapter');

            this._adapterEventBusSubscriptions.add(eventName);
            log('debug', `WindowAdapter subscribed to eventBus event: ${eventName}`);
        }
    }

    /**
     * Handle event dispatcher subscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleSubscribeEventDispatcher(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName } = data;
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Add to subscriptions
        this.dispatcherSubscriptions.get(windowId).add(eventName);
        
        log('debug', `Window ${windowId} subscribed to dispatcher event: ${eventName}`);
    }

    /**
     * Handle event bus unsubscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleUnsubscribeEventBus(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName } = data;
        
        if (this.eventBusSubscriptions.has(windowId)) {
            this.eventBusSubscriptions.get(windowId).delete(eventName);
            log('debug', `Window ${windowId} unsubscribed from eventBus event: ${eventName}`);
        }
    }

    /**
     * Handle event dispatcher unsubscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleUnsubscribeEventDispatcher(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName } = data;
        
        if (this.dispatcherSubscriptions.has(windowId)) {
            this.dispatcherSubscriptions.get(windowId).delete(eventName);
            log('debug', `Window ${windowId} unsubscribed from dispatcher event: ${eventName}`);
        }
    }

    /**
     * Handle publish to event bus request from window
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handlePublishEventBus(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName, eventData } = data;
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Register publisher just before publishing (in case it wasn't registered during connection)
        if (this.registerDynamicPublisher) {
            this.registerDynamicPublisher(`window_${windowId}`, eventName);
        }
        
        // Publish to main app's event bus
        if (this.eventBus) {
            this.eventBus.publish(eventName, eventData, `window_${windowId}`);
            log('debug', `Published eventBus event from window ${windowId}: ${eventName}`);
        }
    }

    /**
     * Handle publish to event dispatcher request from window
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handlePublishEventDispatcher(message, source) {
        const windowId = message.windowId || message.iframeId;
        const { data } = message;
        const { eventName, eventData, target } = data;
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Publish to main app's event dispatcher
        if (this.dispatcher) {
            this.dispatcher.publish(eventName, eventData, target || 'bottom');
            log('debug', `Published dispatcher event from window ${windowId}: ${eventName}`);
        }
    }

    /**
     * Handle request for static data
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleRequestStaticData(message, source) {
        const windowId = message.windowId || message.iframeId;
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Get static data from state manager if available
        let staticData = null;
        if (typeof window !== 'undefined' && window.stateManagerProxy) {
            try {
                staticData = window.stateManagerProxy.getStaticData();
            } catch (error) {
                log('error', 'Error getting static data:', error);
            }
        }
        
        // Send response
        const response = createMessage(MessageTypes.STATIC_DATA_RESPONSE, windowId, {
            staticData
        });
        
        safePostMessage(source, response);
    }

    /**
     * Handle REQUEST_STATE_SNAPSHOT message
     * @param {object} message - Message object
     * @param {Window} source - Source window
     */
    handleRequestStateSnapshot(message, source) {
        const windowId = message.windowId || message.iframeId;
        
        log('debug', `Received REQUEST_STATE_SNAPSHOT from window: ${windowId}`);
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Get current state snapshot from state manager if available
        let stateSnapshot = null;
        if (typeof window !== 'undefined' && window.stateManagerProxy) {
            try {
                log('debug', `stateManagerProxy is available for window ${windowId}`);
                
                // Use pingWorker to ensure we get fresh state
                // Increased timeout to 10 seconds to handle complex rule evaluation
                window.stateManagerProxy.pingWorker({ requestedBy: `window-${windowId}` }, 10000)
                    .then(() => {
                        // After ping, get the fresh snapshot
                        stateSnapshot = window.stateManagerProxy.getLatestStateSnapshot();
                        log('info', `Retrieved FRESH state snapshot for window ${windowId} - has game data:`, !!(stateSnapshot && stateSnapshot.game));
                        if (stateSnapshot && stateSnapshot.checkedLocations) {
                            log('debug', `Fresh state checkedLocations count:`, stateSnapshot.checkedLocations.length);
                        }
                        
                        // Send the fresh snapshot to window
                        const response = createMessage(MessageTypes.STATE_SNAPSHOT, windowId, {
                            snapshot: stateSnapshot
                        });
                        log('debug', `Sending FRESH STATE_SNAPSHOT response to window ${windowId}`);
                        safePostMessage(source, response);
                    })
                    .catch((error) => {
                        log('warn', 'Ping failed, using cached snapshot:', error);
                        // Fallback to cached snapshot
                        stateSnapshot = window.stateManagerProxy.getLatestStateSnapshot();
                        const response = createMessage(MessageTypes.STATE_SNAPSHOT, windowId, {
                            snapshot: stateSnapshot
                        });
                        log('debug', `Sending fallback STATE_SNAPSHOT response to window ${windowId}`);
                        safePostMessage(source, response);
                    });
                
                // Return early since we're handling this asynchronously
                return;
                
            } catch (error) {
                log('error', 'Error getting state snapshot:', error);
            }
        } else {
            log('warn', `stateManagerProxy not available for window ${windowId} - window:`, typeof window, 'proxy:', !!window.stateManagerProxy);
        }
        
        // Fallback: send null snapshot if no stateManagerProxy available
        const response = createMessage(MessageTypes.STATE_SNAPSHOT, windowId, {
            snapshot: null
        });
        log('debug', `Sending null STATE_SNAPSHOT response to window ${windowId}`);
        safePostMessage(source, response);
    }

    /**
     * Handle request for logging configuration
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleRequestLogConfig(message, source) {
        const windowId = message.windowId || message.iframeId;
        
        log('debug', `Received REQUEST_LOG_CONFIG from window: ${windowId}`);
        
        if (!this.windows.has(windowId)) {
            this.sendErrorToWindow(source, windowId, 'NOT_REGISTERED', 'Window not registered');
            return;
        }
        
        // Get current logging configuration from the main thread logger
        let loggingConfig = null;
        if (typeof window !== 'undefined' && window.logger) {
            try {
                // Get the current logger configuration
                const currentConfig = window.logger.getConfig();
                loggingConfig = {
                    defaultLevel: currentConfig.defaultLevel,
                    categoryLevels: currentConfig.categoryLevels || {},
                    enabled: currentConfig.enabled
                };
                
                log('debug', `Sending logging config to window ${windowId}:`, loggingConfig);
            } catch (error) {
                log('error', 'Error getting logging configuration:', error);
                // Send minimal fallback config
                loggingConfig = {
                    defaultLevel: 'WARN',
                    categoryLevels: {},
                    enabled: true
                };
            }
        } else {
            log('warn', 'Main thread logger not available, sending fallback config');
            // Send minimal fallback config
            loggingConfig = {
                defaultLevel: 'WARN',
                categoryLevels: {},
                enabled: true
            };
        }
        
        // Send logging configuration response
        const response = createMessage(MessageTypes.LOG_CONFIG_RESPONSE, windowId, {
            loggingConfig
        });
        
        safePostMessage(source, response);
    }

    /**
     * Broadcast logging configuration update to all connected windows
     * @param {object} loggingConfig - New logging configuration
     */
    broadcastLogConfigUpdate(loggingConfig) {
        log('debug', 'Broadcasting logging config update to all windows:', loggingConfig);
        
        for (const [windowId, windowRef] of this.windows.entries()) {
            if (windowRef && windowRef.connected) {
                const message = createMessage(MessageTypes.LOG_CONFIG_UPDATE, windowId, {
                    loggingConfig
                });
                
                safePostMessage(windowRef.window, message);
            }
        }
    }

    /**
     * Handle event bus events from main app - forward to subscribed windows
     * @param {string} eventName - Event name
     * @param {any} eventData - Event data
     */
    handleEventBusEvent(eventName, eventData) {
        // Forward to all windows subscribed to this event
        for (const [windowId, subscriptions] of this.eventBusSubscriptions.entries()) {
            if (subscriptions.has(eventName)) {
                const windowRef = this.windows.get(windowId);
                if (windowRef && windowRef.connected) {
                    const message = createMessage(MessageTypes.EVENT_BUS_MESSAGE, windowId, {
                        eventName,
                        eventData
                    });
                    
                    safePostMessage(windowRef.window, message);
                }
            }
        }
    }

    /**
     * Handle dispatcher events from main app - forward to subscribed windows
     * @param {any} eventData - Event data from dispatcher
     * @param {any} propagationOptions - Propagation options
     */
    handleDispatcherEvent(eventData, propagationOptions) {
        // Extract event name - this depends on how dispatcher events are structured
        // For now, we'll assume the event name is in the eventData or propagationOptions
        const eventName = eventData?.type || propagationOptions?.eventType || 'unknown';
        
        // Forward to all windows subscribed to this event
        for (const [windowId, subscriptions] of this.dispatcherSubscriptions.entries()) {
            if (subscriptions.has(eventName)) {
                const windowRef = this.windows.get(windowId);
                if (windowRef && windowRef.connected) {
                    const message = createMessage(MessageTypes.EVENT_DISPATCHER_MESSAGE, windowId, {
                        eventName,
                        eventData,
                        propagationOptions
                    });
                    
                    safePostMessage(windowRef.window, message);
                }
            }
        }
    }

    /**
     * Send error message to window
     * @param {Window} windowRef - Window reference
     * @param {string} windowId - Window identifier
     * @param {string} errorType - Error type
     * @param {string} errorMessage - Error message
     */
    sendErrorToWindow(windowRef, windowId, errorType, errorMessage) {
        const errorMsg = createErrorMessage(windowId, errorType, errorMessage);
        safePostMessage(windowRef, errorMsg);
    }

    /**
     * Start heartbeat monitoring for connected windows
     */
    startHeartbeatMonitoring() {
        // Check heartbeats every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            this.checkHeartbeats();
        }, 30000);
    }

    /**
     * Check heartbeats and disconnect stale windows
     */
    checkHeartbeats() {
        const now = Date.now();
        const timeout = 60000; // 60 second timeout
        
        for (const [windowId, windowRef] of this.windows.entries()) {
            if (now - windowRef.lastHeartbeat > timeout) {
                log('warn', `Window ${windowId} heartbeat timeout, disconnecting`);
                this.unregisterWindow(windowId);
            }
        }
    }

    /**
     * Get list of connected windows
     * @returns {Array} List of window info objects
     */
    getConnectedWindows() {
        return Array.from(this.windows.entries()).map(([windowId, windowRef]) => ({
            windowId,
            connected: windowRef.connected,
            lastHeartbeat: windowRef.lastHeartbeat,
            eventBusSubscriptions: Array.from(this.eventBusSubscriptions.get(windowId) || []),
            dispatcherSubscriptions: Array.from(this.dispatcherSubscriptions.get(windowId) || [])
        }));
    }

    /**
     * Cleanup resources
     */
    dispose() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        
        // Disconnect all windows
        for (const windowId of this.windows.keys()) {
            this.unregisterWindow(windowId);
        }
        
        log('info', 'WindowAdapterCore disposed');
    }
}
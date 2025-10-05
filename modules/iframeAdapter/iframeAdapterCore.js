// Core adapter logic for event bridging between main app and iframes
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
        window.logger[level]('iframeAdapterCore', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[iframeAdapterCore] ${message}`, ...data);
    }
}

export class IframeAdapterCore {
    constructor(eventBus, dispatcher, registerDynamicPublisher, moduleId) {
        this.eventBus = eventBus;
        this.dispatcher = dispatcher;
        this.registerDynamicPublisher = registerDynamicPublisher;
        this.moduleId = moduleId || 'iframeAdapter';

        // Registry of connected iframes
        this.iframes = new Map(); // iframeId -> { window, subscriptions, lastHeartbeat }

        // Event subscriptions tracking
        this.eventBusSubscriptions = new Map(); // iframeId -> Set of event names
        this.dispatcherSubscriptions = new Map(); // iframeId -> Set of event names

        // Message handlers
        this.messageHandlers = new Map();
        this.setupMessageHandlers();

        // Listen for postMessage events
        this.setupPostMessageListener();

        // Setup heartbeat monitoring
        this.heartbeatInterval = null;
        this.startHeartbeatMonitoring();

        log('info', 'IframeAdapterCore initialized');
    }

    /**
     * Setup message handlers for different message types
     */
    setupMessageHandlers() {
        this.messageHandlers.set(MessageTypes.IFRAME_READY, this.handleIframeReady.bind(this));
        this.messageHandlers.set(MessageTypes.IFRAME_APP_READY, this.handleIframeAppReady.bind(this));
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
    }

    /**
     * Setup listener for postMessage events from iframes
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
        
        log('debug', `Received message: ${message.type} from iframe: ${message.iframeId}`);

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
            this.sendErrorToIframe(event.source, message.iframeId, 'HANDLER_ERROR', error.message);
        }
    }

    /**
     * Register an iframe with the adapter
     * @param {string} iframeId - Unique iframe identifier
     * @param {Window} iframeWindow - Iframe window reference
     */
    registerIframe(iframeId, iframeWindow) {
        // Check if already registered to prevent duplicate registration
        const alreadyRegistered = this.iframes.has(iframeId);

        if (alreadyRegistered) {
            log('debug', `Iframe ${iframeId} already registered, updating connection status`);
            // Update the existing iframe entry
            const existingEntry = this.iframes.get(iframeId);
            existingEntry.connected = true;
            existingEntry.lastHeartbeat = Date.now();
            existingEntry.window = iframeWindow;
        } else {
            // First time registration
            this.iframes.set(iframeId, {
                window: iframeWindow,
                subscriptions: {
                    eventBus: new Set(),
                    dispatcher: new Set()
                },
                lastHeartbeat: Date.now(),
                connected: true
            });

            this.eventBusSubscriptions.set(iframeId, new Set());
            this.dispatcherSubscriptions.set(iframeId, new Set());

            log('info', `Iframe registered: ${iframeId}`);

            // Register iframe-specific publisher for common events that iframes might publish
            if (this.registerDynamicPublisher) {
                const publisherId = `${iframeId}`;
                // Register for common events that iframes typically publish
                this.registerDynamicPublisher(publisherId, 'playerState:regionChanged');
                log('debug', `Registered dynamic publisher ${publisherId} for iframe events`);
            }
        }

        // Always publish connection event and send region sync (even for re-registration)
        if (this.eventBus) {
            this.eventBus.publish('iframe:connected', { iframeId }, 'iframeAdapter');

            // Only send initial region sync if this is the first registration
            if (!alreadyRegistered) {
                // Send current region to newly connected iframe so it can initialize its state
                // Use setTimeout to ensure iframe has finished setting up its event subscriptions
                setTimeout(() => {
                    const playerState = getPlayerStateSingleton();
                    console.log('[iframeAdapter] playerState:', playerState);
                    const currentRegion = playerState?.getCurrentRegion();
                    console.log('[iframeAdapter] currentRegion:', currentRegion);
                    if (currentRegion) {
                        console.log(`[iframeAdapter] Sending current region to iframe: ${currentRegion}`);
                        // Publish region changed event so iframe can sync
                        this.eventBus.publish('playerState:regionChanged', {
                            oldRegion: null,
                            newRegion: currentRegion
                        }, 'iframeAdapter');
                    } else {
                        console.log('[iframeAdapter] No current region to send to iframe');
                    }
                }, 500); // Increased delay to ensure iframe subscriptions are ready
            }
        }
    }

    /**
     * Unregister an iframe
     * @param {string} iframeId - Iframe identifier
     */
    unregisterIframe(iframeId) {
        if (this.iframes.has(iframeId)) {
            this.iframes.delete(iframeId);
            this.eventBusSubscriptions.delete(iframeId);
            this.dispatcherSubscriptions.delete(iframeId);
            
            log('info', `Iframe unregistered: ${iframeId}`);
            
            // Publish disconnection event
            if (this.eventBus) {
                this.eventBus.publish('iframe:disconnected', { iframeId }, 'iframeAdapter');
            }
        }
    }

    /**
     * Handle iframe ready message
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleIframeReady(message, source) {
        const { iframeId } = message;
        
        // Register the iframe
        this.registerIframe(iframeId, source);
        
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
        const response = createMessage(MessageTypes.ADAPTER_READY, iframeId, {
            adapterVersion: '1.0.0',
            capabilities: ['eventBus', 'dispatcher', 'stateManager', 'logging'],
            loggingConfig: loggingConfig
        });
        
        safePostMessage(source, response);
    }

    /**
     * Handle iframe app ready message
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleIframeAppReady(message, source) {
        const { iframeId } = message;

        if (this.iframes.has(iframeId)) {
            const iframeState = this.iframes.get(iframeId);
            iframeState.appReady = true;

            // Publish event to notify modules that iframe app is fully initialized
            if (this.eventBus && this.moduleId) {
                this.eventBus.publish('iframe:appReady', {
                    iframeId: iframeId,
                    timestamp: Date.now()
                }, this.moduleId);
            }
        }
    }

    /**
     * Handle heartbeat message
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleHeartbeat(message, source) {
        const { iframeId } = message;

        if (this.iframes.has(iframeId)) {
            // Update last heartbeat timestamp
            this.iframes.get(iframeId).lastHeartbeat = Date.now();

            // Send heartbeat response
            const response = createMessage(MessageTypes.HEARTBEAT_RESPONSE, iframeId, {
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
        const { iframeId, data } = message;
        const { eventName } = data;

        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
            return;
        }

        // Add to subscriptions
        this.eventBusSubscriptions.get(iframeId).add(eventName);

        // If this is the first iframe subscribing to this event, subscribe the adapter to it
        this.ensureEventBusSubscription(eventName);

        log('debug', `Iframe ${iframeId} subscribed to eventBus event: ${eventName}`);
    }

    /**
     * Ensure adapter is subscribed to eventBus event so it can forward to iframes
     * @param {string} eventName - Event name to subscribe to
     */
    ensureEventBusSubscription(eventName) {
        // Track which events we're already subscribed to
        if (!this._adapterEventBusSubscriptions) {
            this._adapterEventBusSubscriptions = new Set();
        }

        // Only subscribe once per event
        if (this._adapterEventBusSubscriptions.has(eventName)) {
            return;
        }

        // Subscribe to the event and forward to interested iframes
        this.eventBus.subscribe(eventName, (eventData) => {
            this.handleEventBusEvent(eventName, eventData);
        }, 'iframeAdapter');

        this._adapterEventBusSubscriptions.add(eventName);
        log('debug', `IframeAdapter subscribed to eventBus event: ${eventName}`);
    }

    /**
     * Handle event dispatcher subscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleSubscribeEventDispatcher(message, source) {
        const { iframeId, data } = message;
        const { eventName } = data;

        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
            return;
        }

        // Add to subscriptions
        this.dispatcherSubscriptions.get(iframeId).add(eventName);

        // If this is the first iframe subscribing to this event, subscribe the adapter to it
        this.ensureDispatcherSubscription(eventName);

        log('debug', `Iframe ${iframeId} subscribed to dispatcher event: ${eventName}`);
    }

    /**
     * Ensure adapter is subscribed to dispatcher event so it can forward to iframes
     * @param {string} eventName - Event name to subscribe to
     */
    ensureDispatcherSubscription(eventName) {
        // Track which events we're already subscribed to
        if (!this._adapterDispatcherSubscriptions) {
            this._adapterDispatcherSubscriptions = new Set();
        }

        // Only subscribe once per event
        if (this._adapterDispatcherSubscriptions.has(eventName)) {
            return;
        }

        // Subscribe to the dispatcher event and forward to interested iframes
        this.dispatcher.subscribe(eventName, (eventData, propagationOptions) => {
            this.handleDispatcherEvent(eventData, propagationOptions);
        });

        this._adapterDispatcherSubscriptions.add(eventName);
        log('debug', `IframeAdapter subscribed to dispatcher event: ${eventName}`);
    }

    /**
     * Handle event bus unsubscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleUnsubscribeEventBus(message, source) {
        const { iframeId, data } = message;
        const { eventName } = data;
        
        if (this.eventBusSubscriptions.has(iframeId)) {
            this.eventBusSubscriptions.get(iframeId).delete(eventName);
            log('debug', `Iframe ${iframeId} unsubscribed from eventBus event: ${eventName}`);
        }
    }

    /**
     * Handle event dispatcher unsubscription request
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleUnsubscribeEventDispatcher(message, source) {
        const { iframeId, data } = message;
        const { eventName } = data;
        
        if (this.dispatcherSubscriptions.has(iframeId)) {
            this.dispatcherSubscriptions.get(iframeId).delete(eventName);
            log('debug', `Iframe ${iframeId} unsubscribed from dispatcher event: ${eventName}`);
        }
    }

    /**
     * Handle publish to event bus request from iframe
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handlePublishEventBus(message, source) {
        const { iframeId, data } = message;
        const { eventName, eventData } = data;
        
        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
            return;
        }
        
        // Register publisher just before publishing (in case it wasn't registered during connection)
        if (this.registerDynamicPublisher) {
            this.registerDynamicPublisher(`iframe_${iframeId}`, eventName);
        }
        
        // Publish to main app's event bus
        if (this.eventBus) {
            this.eventBus.publish(eventName, eventData, `iframe_${iframeId}`);
            log('debug', `Published eventBus event from iframe ${iframeId}: ${eventName}`);
        }
    }

    /**
     * Handle publish to event dispatcher request from iframe
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handlePublishEventDispatcher(message, source) {
        const { iframeId, data } = message;
        const { eventName, eventData, target } = data;
        
        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
            return;
        }
        
        // Publish to main app's event dispatcher
        if (this.dispatcher) {
            this.dispatcher.publish(eventName, eventData, target || 'bottom');
            log('debug', `Published dispatcher event from iframe ${iframeId}: ${eventName}`);
        }
    }

    /**
     * Handle request for static data
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleRequestStaticData(message, source) {
        const { iframeId } = message;
        
        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
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
        const response = createMessage(MessageTypes.STATIC_DATA_RESPONSE, iframeId, {
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
        const { iframeId } = message;
        
        log('debug', `Received REQUEST_STATE_SNAPSHOT from iframe: ${iframeId}`);
        
        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
            return;
        }
        
        // Get current state snapshot from state manager if available
        let stateSnapshot = null;
        if (typeof window !== 'undefined' && window.stateManagerProxy) {
            try {
                log('debug', `stateManagerProxy is available for iframe ${iframeId}`);
                
                // Use pingWorker to ensure we get fresh state
                window.stateManagerProxy.pingWorker({ requestedBy: `iframe-${iframeId}` }, 1000)
                    .then(() => {
                        // After ping, get the fresh snapshot
                        stateSnapshot = window.stateManagerProxy.getLatestStateSnapshot();
                        log('info', `Retrieved FRESH state snapshot for iframe ${iframeId} - has game data:`, !!(stateSnapshot && stateSnapshot.game));
                        if (stateSnapshot && stateSnapshot.checkedLocations) {
                            log('debug', `Fresh state checkedLocations count:`, stateSnapshot.checkedLocations.length);
                        }
                        
                        // Send the fresh snapshot to iframe
                        const response = createMessage(MessageTypes.STATE_SNAPSHOT, iframeId, {
                            snapshot: stateSnapshot
                        });
                        log('debug', `Sending FRESH STATE_SNAPSHOT response to iframe ${iframeId}`);
                        safePostMessage(source, response);
                    })
                    .catch((error) => {
                        log('warn', 'Ping failed, using cached snapshot:', error);
                        // Fallback to cached snapshot
                        stateSnapshot = window.stateManagerProxy.getLatestStateSnapshot();
                        const response = createMessage(MessageTypes.STATE_SNAPSHOT, iframeId, {
                            snapshot: stateSnapshot
                        });
                        log('debug', `Sending fallback STATE_SNAPSHOT response to iframe ${iframeId}`);
                        safePostMessage(source, response);
                    });
                
                // Return early since we're handling this asynchronously
                return;
                
            } catch (error) {
                log('error', 'Error getting state snapshot:', error);
            }
        } else {
            log('warn', `stateManagerProxy not available for iframe ${iframeId} - window:`, typeof window, 'proxy:', !!window.stateManagerProxy);
        }
        
        // Fallback: send null snapshot if no stateManagerProxy available
        const response = createMessage(MessageTypes.STATE_SNAPSHOT, iframeId, {
            snapshot: null
        });
        log('debug', `Sending null STATE_SNAPSHOT response to iframe ${iframeId}`);
        safePostMessage(source, response);
    }

    /**
     * Handle request for logging configuration
     * @param {object} message - The message object
     * @param {Window} source - Source window
     */
    handleRequestLogConfig(message, source) {
        const { iframeId } = message;
        
        log('debug', `Received REQUEST_LOG_CONFIG from iframe: ${iframeId}`);
        
        if (!this.iframes.has(iframeId)) {
            this.sendErrorToIframe(source, iframeId, 'NOT_REGISTERED', 'Iframe not registered');
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
                
                log('debug', `Sending logging config to iframe ${iframeId}:`, loggingConfig);
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
        const response = createMessage(MessageTypes.LOG_CONFIG_RESPONSE, iframeId, {
            loggingConfig
        });
        
        safePostMessage(source, response);
    }

    /**
     * Broadcast logging configuration update to all connected iframes
     * @param {object} loggingConfig - New logging configuration
     */
    broadcastLogConfigUpdate(loggingConfig) {
        log('debug', 'Broadcasting logging config update to all iframes:', loggingConfig);
        
        for (const [iframeId, iframe] of this.iframes.entries()) {
            if (iframe && iframe.connected) {
                const message = createMessage(MessageTypes.LOG_CONFIG_UPDATE, iframeId, {
                    loggingConfig
                });
                
                safePostMessage(iframe.window, message);
            }
        }
    }

    /**
     * Handle event bus events from main app - forward to subscribed iframes
     * @param {string} eventName - Event name
     * @param {any} eventData - Event data
     */
    handleEventBusEvent(eventName, eventData) {
        // Forward to all iframes subscribed to this event
        for (const [iframeId, subscriptions] of this.eventBusSubscriptions.entries()) {
            if (subscriptions.has(eventName)) {
                const iframe = this.iframes.get(iframeId);
                if (iframe && iframe.connected) {
                    const message = createMessage(MessageTypes.EVENT_BUS_MESSAGE, iframeId, {
                        eventName,
                        eventData
                    });
                    
                    safePostMessage(iframe.window, message);
                }
            }
        }
    }

    /**
     * Handle dispatcher events from main app - forward to subscribed iframes
     * @param {any} eventData - Event data from dispatcher
     * @param {any} propagationOptions - Propagation options
     */
    handleDispatcherEvent(eventData, propagationOptions) {
        // Extract event name - this depends on how dispatcher events are structured
        // For now, we'll assume the event name is in the eventData or propagationOptions
        const eventName = eventData?.type || propagationOptions?.eventType || 'unknown';
        
        // Forward to all iframes subscribed to this event
        for (const [iframeId, subscriptions] of this.dispatcherSubscriptions.entries()) {
            if (subscriptions.has(eventName)) {
                const iframe = this.iframes.get(iframeId);
                if (iframe && iframe.connected) {
                    const message = createMessage(MessageTypes.EVENT_DISPATCHER_MESSAGE, iframeId, {
                        eventName,
                        eventData,
                        propagationOptions
                    });
                    
                    safePostMessage(iframe.window, message);
                }
            }
        }
    }

    /**
     * Send error message to iframe
     * @param {Window} iframeWindow - Iframe window
     * @param {string} iframeId - Iframe identifier
     * @param {string} errorType - Error type
     * @param {string} errorMessage - Error message
     */
    sendErrorToIframe(iframeWindow, iframeId, errorType, errorMessage) {
        const errorMsg = createErrorMessage(iframeId, errorType, errorMessage);
        safePostMessage(iframeWindow, errorMsg);
    }

    /**
     * Start heartbeat monitoring for connected iframes
     */
    startHeartbeatMonitoring() {
        // Check heartbeats every 30 seconds
        this.heartbeatInterval = setInterval(() => {
            this.checkHeartbeats();
        }, 30000);
    }

    /**
     * Check heartbeats and disconnect stale iframes
     */
    checkHeartbeats() {
        const now = Date.now();
        const timeout = 60000; // 60 second timeout
        
        for (const [iframeId, iframe] of this.iframes.entries()) {
            if (now - iframe.lastHeartbeat > timeout) {
                log('warn', `Iframe ${iframeId} heartbeat timeout, disconnecting`);
                this.unregisterIframe(iframeId);
            }
        }
    }

    /**
     * Get list of connected iframes
     * @returns {Array} List of iframe info objects
     */
    getConnectedIframes() {
        return Array.from(this.iframes.entries()).map(([iframeId, iframe]) => ({
            iframeId,
            connected: iframe.connected,
            lastHeartbeat: iframe.lastHeartbeat,
            eventBusSubscriptions: Array.from(this.eventBusSubscriptions.get(iframeId) || []),
            dispatcherSubscriptions: Array.from(this.dispatcherSubscriptions.get(iframeId) || [])
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
        
        // Disconnect all iframes
        for (const iframeId of this.iframes.keys()) {
            this.unregisterIframe(iframeId);
        }
        
        log('info', 'IframeAdapterCore disposed');
    }
}
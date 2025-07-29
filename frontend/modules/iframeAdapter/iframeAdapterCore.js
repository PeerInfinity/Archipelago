// Core adapter logic for event bridging between main app and iframes
import { 
    MessageTypes, 
    createMessage, 
    validateMessage, 
    safePostMessage,
    createErrorMessage 
} from './communicationProtocol.js';

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
    constructor(eventBus, dispatcher) {
        this.eventBus = eventBus;
        this.dispatcher = dispatcher;
        
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
        this.messageHandlers.set(MessageTypes.HEARTBEAT, this.handleHeartbeat.bind(this));
        this.messageHandlers.set(MessageTypes.SUBSCRIBE_EVENT_BUS, this.handleSubscribeEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.SUBSCRIBE_EVENT_DISPATCHER, this.handleSubscribeEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.UNSUBSCRIBE_EVENT_BUS, this.handleUnsubscribeEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.UNSUBSCRIBE_EVENT_DISPATCHER, this.handleUnsubscribeEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.PUBLISH_EVENT_BUS, this.handlePublishEventBus.bind(this));
        this.messageHandlers.set(MessageTypes.PUBLISH_EVENT_DISPATCHER, this.handlePublishEventDispatcher.bind(this));
        this.messageHandlers.set(MessageTypes.REQUEST_STATIC_DATA, this.handleRequestStaticData.bind(this));
        this.messageHandlers.set(MessageTypes.REQUEST_STATE_SNAPSHOT, this.handleRequestStateSnapshot.bind(this));
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
        
        // Publish connection event
        if (this.eventBus) {
            this.eventBus.publish('iframe:connected', { iframeId }, 'iframeAdapter');
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
        
        // Send adapter ready response
        const response = createMessage(MessageTypes.ADAPTER_READY, iframeId, {
            adapterVersion: '1.0.0',
            capabilities: ['eventBus', 'dispatcher', 'stateManager']
        });
        
        safePostMessage(source, response);
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
        
        log('debug', `Iframe ${iframeId} subscribed to eventBus event: ${eventName}`);
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
        
        log('debug', `Iframe ${iframeId} subscribed to dispatcher event: ${eventName}`);
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
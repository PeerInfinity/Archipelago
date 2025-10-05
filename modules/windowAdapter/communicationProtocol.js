// Communication protocol definitions and utilities for window adapter

// Message types for window communication
export const MessageTypes = {
    // Handshake messages
    WINDOW_READY: 'WINDOW_READY',
    IFRAME_READY: 'IFRAME_READY', // Support iframe messages (handled by iframeAdapterCore)
    IFRAME_APP_READY: 'IFRAME_APP_READY', // Support iframe app ready messages (handled by iframeAdapterCore)
    ADAPTER_READY: 'ADAPTER_READY',
    HEARTBEAT: 'HEARTBEAT',
    HEARTBEAT_RESPONSE: 'HEARTBEAT_RESPONSE',
    
    // Subscription messages
    SUBSCRIBE_EVENT_BUS: 'SUBSCRIBE_EVENT_BUS',
    SUBSCRIBE_EVENT_DISPATCHER: 'SUBSCRIBE_EVENT_DISPATCHER',
    UNSUBSCRIBE_EVENT_BUS: 'UNSUBSCRIBE_EVENT_BUS',
    UNSUBSCRIBE_EVENT_DISPATCHER: 'UNSUBSCRIBE_EVENT_DISPATCHER',
    
    // Event messages
    EVENT_BUS_MESSAGE: 'EVENT_BUS_MESSAGE',
    EVENT_DISPATCHER_MESSAGE: 'EVENT_DISPATCHER_MESSAGE',
    PUBLISH_EVENT_BUS: 'PUBLISH_EVENT_BUS',
    PUBLISH_EVENT_DISPATCHER: 'PUBLISH_EVENT_DISPATCHER',
    
    // State messages
    STATE_SNAPSHOT: 'STATE_SNAPSHOT',
    REQUEST_STATIC_DATA: 'REQUEST_STATIC_DATA',
    STATIC_DATA_RESPONSE: 'STATIC_DATA_RESPONSE',
    REQUEST_STATE_SNAPSHOT: 'REQUEST_STATE_SNAPSHOT',
    
    // Configuration messages
    LOG_CONFIG_UPDATE: 'LOG_CONFIG_UPDATE',
    REQUEST_LOG_CONFIG: 'REQUEST_LOG_CONFIG',
    LOG_CONFIG_RESPONSE: 'LOG_CONFIG_RESPONSE',
    
    // Error messages
    CONNECTION_ERROR: 'CONNECTION_ERROR',
    SUBSCRIPTION_ERROR: 'SUBSCRIPTION_ERROR',
    INVALID_MESSAGE: 'INVALID_MESSAGE'
};

/**
 * Create a standardized message for window communication
 * @param {string} type - Message type from MessageTypes
 * @param {string} windowId - Unique identifier for the window (or iframeId for compatibility)
 * @param {any} data - Message payload
 * @returns {object} Formatted message object
 */
export function createMessage(type, windowId, data = null) {
    return {
        type,
        windowId,
        iframeId: windowId, // Include both for compatibility
        timestamp: Date.now(),
        data
    };
}

/**
 * Validate that a message has the correct structure
 * @param {any} message - Message to validate
 * @returns {boolean} True if message is valid
 */
export function validateMessage(message) {
    if (!message || typeof message !== 'object') {
        return false;
    }
    
    const { type, windowId, iframeId, timestamp } = message;
    
    // Check required fields - accept either windowId or iframeId for compatibility
    if (!type || (!windowId && !iframeId) || !timestamp) {
        return false;
    }
    
    // Check that type is a known message type
    if (!Object.values(MessageTypes).includes(type)) {
        return false;
    }
    
    // Check that timestamp is a number
    if (typeof timestamp !== 'number') {
        return false;
    }
    
    return true;
}

/**
 * Helper function for logging with fallback
 */
function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
        window.logger[level]('communicationProtocol', message, ...data);
    } else {
        const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
        consoleMethod(`[communicationProtocol] ${message}`, ...data);
    }
}

/**
 * Safe postMessage wrapper with error handling
 * @param {Window} targetWindow - Window to send message to
 * @param {object} message - Message to send
 * @param {string} targetOrigin - Target origin (default '*')
 */
export function safePostMessage(targetWindow, message, targetOrigin = '*') {
    try {
        if (!targetWindow || typeof targetWindow.postMessage !== 'function') {
            log('error', 'Invalid target window for postMessage');
            return false;
        }
        
        if (!validateMessage(message)) {
            log('error', 'Invalid message format', message);
            return false;
        }
        
        targetWindow.postMessage(message, targetOrigin);
        log('debug', `Sent message: ${message.type}`, message);
        return true;
    } catch (error) {
        log('error', 'Error sending postMessage:', error);
        return false;
    }
}

/**
 * Create an error message
 * @param {string} windowId - Window identifier
 * @param {string} errorType - Type of error
 * @param {string} errorMessage - Error description
 * @returns {object} Error message object
 */
export function createErrorMessage(windowId, errorType, errorMessage) {
    return createMessage(MessageTypes.CONNECTION_ERROR, windowId, {
        errorType,
        message: errorMessage,
        timestamp: Date.now()
    });
}

/**
 * Generate a unique window ID
 * @param {string} [customName] - Optional custom name to use instead of random string
 * @returns {string} Unique identifier
 */
export function generateWindowId(customName) {
    if (customName) {
        return `${customName}`;
    }
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique iframe ID (legacy compatibility)
 * @param {string} [customName] - Optional custom name to use instead of random string
 * @returns {string} Unique identifier
 */
export function generateIframeId(customName) {
    return generateWindowId(customName);
}
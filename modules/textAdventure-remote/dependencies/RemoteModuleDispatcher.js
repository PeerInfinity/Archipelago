// Remote Module Dispatcher wrapper
// Provides moduleDispatcher-compatible interface using a client (IframeClient or WindowClient)

/**
 * RemoteModuleDispatcher wraps a client to provide the same interface as moduleDispatcher
 * Used in remote contexts (iframe or separate window) to publish dispatcher events via postMessage
 */
export class RemoteModuleDispatcher {
    constructor(client) {
        this.client = client;
    }

    /**
     * Publish an event to the module dispatcher
     * @param {string} eventName - Event name
     * @param {any} data - Event data
     * @param {string} target - Target for event propagation ('top', 'bottom', 'all')
     */
    publish(eventName, data, target = 'bottom') {
        this.client.publishEventDispatcher(eventName, data, target);
    }

    /**
     * Subscribe to dispatcher events
     * Note: Not typically used by text adventure, but included for completeness
     * @param {string} eventName - Event name
     * @param {function} callback - Callback function
     */
    subscribe(eventName, callback) {
        this.client.subscribeEventDispatcher(eventName, callback);
    }
}

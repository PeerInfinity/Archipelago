// Remote Event Bus wrapper
// Provides eventBus-compatible interface using a client (IframeClient or WindowClient)

/**
 * RemoteEventBus wraps a client to provide the same interface as eventBus
 * Used in remote contexts (iframe or separate window) to subscribe/publish events via postMessage
 */
export class RemoteEventBus {
    constructor(client) {
        this.client = client;
    }

    /**
     * Subscribe to an event
     * @param {string} eventName - Event name to subscribe to
     * @param {function} callback - Callback function
     * @param {string} subscriber - Subscriber identifier (optional)
     */
    subscribe(eventName, callback, subscriber) {
        console.log(`[RemoteEventBus] Subscribing to event: ${eventName}`);
        // Client expects just eventName and callback
        this.client.subscribeEventBus(eventName, callback);
    }

    /**
     * Publish an event
     * @param {string} eventName - Event name
     * @param {any} data - Event data
     * @param {string} publisher - Publisher identifier (optional)
     */
    publish(eventName, data, publisher) {
        // Client expects eventName and data
        this.client.publishEventBus(eventName, data);
    }

    /**
     * Unsubscribe from an event
     * Note: This may not be fully supported in remote context
     * @param {string} eventName - Event name
     * @param {function} callback - Callback function to remove
     */
    unsubscribe(eventName, callback) {
        // Note: Client doesn't currently support unsubscribe
        // Could be implemented by tracking callbacks and filtering them out
        console.warn('RemoteEventBus: unsubscribe not fully implemented in remote context');
    }
}

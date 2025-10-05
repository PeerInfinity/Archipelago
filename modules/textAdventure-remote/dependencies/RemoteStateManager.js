// Remote State Manager wrapper
// Provides stateManager-compatible interface using a client (IframeClient or WindowClient)

/**
 * RemoteStateManager wraps a client to provide the same interface as stateManagerProxy
 * Used in remote contexts (iframe or separate window) to access state via postMessage
 */
export class RemoteStateManager {
    constructor(client) {
        this.client = client;
    }

    /**
     * Get latest state snapshot from cached data
     * @returns {object|null} State snapshot
     */
    getLatestStateSnapshot() {
        return this.client.getStateSnapshot();
    }

    /**
     * Get static data from cached data
     * @returns {object|null} Static data
     */
    getStaticData() {
        return this.client.getStaticData();
    }

    /**
     * Request fresh state snapshot from main app
     * This updates the cache asynchronously - use getLatestStateSnapshot() to read
     */
    requestStateSnapshot() {
        this.client.requestStateSnapshot();
    }

    /**
     * Request fresh static data from main app
     * This updates the cache asynchronously - use getStaticData() to read
     */
    requestStaticData() {
        this.client.requestStaticData();
    }
}

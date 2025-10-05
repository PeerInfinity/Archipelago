// Remote Dependencies container
// Provides unified dependency interface for remote contexts (iframe or window)

import { RemoteStateManager } from './RemoteStateManager.js';
import { RemoteEventBus } from './RemoteEventBus.js';
import { RemoteModuleDispatcher } from './RemoteModuleDispatcher.js';
import { RemotePlayerState } from './RemotePlayerState.js';

/**
 * RemoteDependencies creates a unified dependency container
 * that provides the same interface as the main window dependencies
 * but works via a client (IframeClient or WindowClient) using postMessage
 *
 * Usage:
 *   const client = new IframeClient(); // or WindowClient
 *   await client.connect();
 *   const deps = new RemoteDependencies(client);
 *
 *   // Now use deps.stateManager, deps.eventBus, etc.
 *   const snapshot = deps.stateManager.getLatestStateSnapshot();
 */
export class RemoteDependencies {
    /**
     * Create remote dependencies wrapper
     * @param {IframeClient|WindowClient} client - Connected client instance
     */
    constructor(client) {
        if (!client) {
            throw new Error('RemoteDependencies requires a client instance');
        }

        this.client = client;

        // Create wrapped dependencies that match main window interfaces
        this.stateManager = new RemoteStateManager(client);
        this.eventBus = new RemoteEventBus(client);
        this.moduleDispatcher = new RemoteModuleDispatcher(client);
        this.playerState = new RemotePlayerState(client);

        // discoveryState is not supported in remote mode
        // It's a feature specific to the main window
        this.discoveryState = null;
    }

    /**
     * Check if client is connected
     * @returns {boolean} True if connected
     */
    isConnected() {
        return this.client.isConnected;
    }

    /**
     * Request fresh data from main app
     * This updates all cached data asynchronously
     */
    requestDataRefresh() {
        this.stateManager.requestStateSnapshot();
        this.stateManager.requestStaticData();
        this.playerState.requestUpdate();
    }

    /**
     * Dispose of dependencies and cleanup
     */
    dispose() {
        // Could add cleanup logic here if needed
        // For now, client manages its own lifecycle
    }
}

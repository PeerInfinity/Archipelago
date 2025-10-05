// Remote Player State wrapper
// Provides playerState-compatible interface using a client (IframeClient or WindowClient)

/**
 * RemotePlayerState wraps a client to provide the same interface as playerState
 * Used in remote contexts (iframe or separate window) to manage player state
 *
 * Note: Player state in remote context is managed locally within the remote instance
 * and synced with main app via dispatcher events
 */
export class RemotePlayerState {
    constructor(client) {
        this.client = client;
        this.currentRegion = null;

        // Subscribe to region change events from main app
        this.client.subscribeEventBus('playerState:regionChanged', (data) => {
            console.log('[RemotePlayerState] Received playerState:regionChanged:', data);
            if (data && data.newRegion) {
                this.currentRegion = data.newRegion;
                console.log('[RemotePlayerState] Updated currentRegion to:', this.currentRegion);
            }
        });

        // Initialize current region from cached state if available
        this.initializeFromCache();

        // Request a fresh snapshot to trigger any recent events
        // This ensures we get the current region even if the event was published before we subscribed
        this.requestUpdate();
    }

    /**
     * Initialize current region from cached state snapshot
     */
    initializeFromCache() {
        const snapshot = this.client.getStateSnapshot();
        console.log('[RemotePlayerState] initializeFromCache - snapshot:', snapshot);
        console.log('[RemotePlayerState] snapshot?.currentRegion:', snapshot?.currentRegion);
        if (snapshot && snapshot.currentRegion) {
            this.currentRegion = snapshot.currentRegion;
            console.log('[RemotePlayerState] Set currentRegion to:', this.currentRegion);
        } else {
            console.log('[RemotePlayerState] No currentRegion in snapshot');

            // Try to get current region from main window's PlayerState
            if (window.parent && window.parent !== window) {
                try {
                    const parentPlayerState = window.parent.getPlayerStateSingleton?.();
                    if (parentPlayerState) {
                        this.currentRegion = parentPlayerState.getCurrentRegion();
                        console.log('[RemotePlayerState] Got currentRegion from parent PlayerState:', this.currentRegion);
                    }
                } catch (e) {
                    console.log('[RemotePlayerState] Could not access parent PlayerState:', e.message);
                }
            }
        }
    }

    /**
     * Get current region
     * @returns {string|null} Current region name
     */
    getCurrentRegion() {
        return this.currentRegion;
    }

    /**
     * Set current region
     * Note: This sets it locally and is typically followed by a dispatcher event
     * to sync with main app
     * @param {string} regionName - Region name to set
     */
    setCurrentRegion(regionName) {
        this.currentRegion = regionName;
    }

    /**
     * Request fresh player state from main app
     * This will trigger a region changed event if the region has changed
     */
    requestUpdate() {
        this.client.requestStateSnapshot();
    }
}

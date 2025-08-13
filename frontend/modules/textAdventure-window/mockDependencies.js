// Mock dependencies for the window-based standalone text adventure
// These provide the same APIs as the original modules but communicate via postMessage through WindowAdapter

import { evaluateRule as sharedEvaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface as sharedCreateStateInterface } from '../shared/stateInterface.js';
import { createSharedLogger } from '../window-base/shared/sharedLogger.js';

// Create logger for this module
const logger = createSharedLogger('mockDependencies');

/**
 * Mock StateManager Proxy that communicates with main app via WindowClient
 */
export class StateManagerProxy {
    constructor(windowClient) {
        this.windowClient = windowClient;
    }

    getLatestStateSnapshot() {
        const snapshot = this.windowClient.getStateSnapshot();
        if (!snapshot) {
            logger.warn('No state snapshot available');
            return null;
        }
        return snapshot;
    }

    getStaticData() {
        const staticData = this.windowClient.getStaticData();
        if (!staticData) {
            logger.warn('No static data available');
            return null;
        }
        return staticData;
    }
}

/**
 * Mock EventBus that communicates via postMessage
 */
export class EventBusProxy {
    constructor(windowClient) {
        this.windowClient = windowClient;
    }

    subscribe(event, callback, moduleName) {
        // Subscribe via window client
        this.windowClient.subscribeEventBus(event, callback);
        
        // Return unsubscribe function (not fully implemented yet)
        return () => {
            logger.warn('Unsubscribe not fully implemented in window client');
        };
    }

    publish(event, data, moduleName) {
        this.windowClient.publishEventBus(event, data);
    }
}

/**
 * Mock ModuleDispatcher that communicates via postMessage
 */
export class ModuleDispatcherProxy {
    constructor(windowClient) {
        this.windowClient = windowClient;
    }

    publish(event, data, target) {
        this.windowClient.publishEventDispatcher(event, data, target);
    }
}

/**
 * Mock PlayerState singleton
 */
export class PlayerStateProxy {
    constructor(windowClient) {
        this.windowClient = windowClient;
        this.currentRegion = 'Menu'; // Default starting region
        
        // Listen for region change events
        this.windowClient.subscribeEventBus('playerState:regionChanged', (data) => {
            if (data && data.newRegion) {
                this.currentRegion = data.newRegion;
                logger.debug(`Player region changed to: ${this.currentRegion}`);
            }
        });
    }

    getCurrentRegion() {
        return this.currentRegion;
    }

    setCurrentRegion(region) {
        const oldRegion = this.currentRegion;
        this.currentRegion = region;
        
        // Publish region change event
        this.windowClient.publishEventBus('playerState:regionChanged', {
            oldRegion,
            newRegion: region,
            source: 'textAdventure-window'
        });
    }
}

/**
 * Mock DiscoveryState singleton
 */
export class DiscoveryStateProxy {
    constructor(windowClient) {
        this.windowClient = windowClient;
        this.discoveredLocations = new Set();
        this.discoveredExits = new Map(); // regionName -> Set of exit names
    }

    isLocationDiscovered(locationName) {
        return this.discoveredLocations.has(locationName);
    }

    isExitDiscovered(regionName, exitName) {
        const regionExits = this.discoveredExits.get(regionName);
        return regionExits ? regionExits.has(exitName) : false;
    }

    discoverLocation(locationName) {
        this.discoveredLocations.add(locationName);
    }

    discoverExit(regionName, exitName) {
        if (!this.discoveredExits.has(regionName)) {
            this.discoveredExits.set(regionName, new Set());
        }
        this.discoveredExits.get(regionName).add(exitName);
    }
}

/**
 * Create snapshot interface using the shared implementation
 */
export function createStateSnapshotInterface(snapshot, staticData, context = {}) {
    return sharedCreateStateInterface(snapshot, staticData, context);
}

/**
 * Rule engine evaluation using the shared implementation
 */
export function evaluateRule(rule, snapshotInterface, contextName = null) {
    return sharedEvaluateRule(rule, snapshotInterface, contextName);
}
// Mock dependencies for the standalone text adventure
// These provide the same APIs as the original modules but communicate via postMessage

// Using local shared module copies for iframe self-containment
import { evaluateRule as sharedEvaluateRule } from './shared/ruleEngine.js';
import { createStateSnapshotInterface as sharedCreateStateInterface } from './shared/stateInterface.js';
import { createSharedLogger } from './shared/sharedLogger.js';

// Create logger for this module
const logger = createSharedLogger('mockDependencies');

/**
 * Mock StateManager Proxy that communicates with main app
 */
export class StateManagerProxy {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
    }

    getLatestStateSnapshot() {
        const snapshot = this.iframeClient.getStateSnapshot();
        if (!snapshot) {
            logger.warn('No state snapshot available');
            return null;
        }
        return snapshot;
    }

    getStaticData() {
        const staticData = this.iframeClient.getStaticData();
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
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
    }

    subscribe(event, callback, moduleName) {
        // Subscribe via iframe client
        this.iframeClient.subscribeEventBus(event, callback);
        
        // Return unsubscribe function
        return () => {
            logger.warn('Unsubscribe not fully implemented in iframe client');
        };
    }

    publish(event, data, moduleName) {
        this.iframeClient.publishEventBus(event, data);
    }
}

/**
 * Mock ModuleDispatcher that communicates via postMessage
 */
export class ModuleDispatcherProxy {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
    }

    publish(event, data, target) {
        this.iframeClient.publishEventDispatcher(event, data, target);
    }
}

/**
 * Mock PlayerState singleton
 */
export class PlayerStateProxy {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
        this.currentRegion = 'Menu'; // Default starting region
        
        // Listen for region change events
        this.iframeClient.subscribeEventBus('playerState:regionChanged', (data) => {
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
        this.iframeClient.publishEventBus('playerState:regionChanged', {
            oldRegion,
            newRegion: region,
            source: 'textAdventure-remote'
        });
    }
}

/**
 * Mock DiscoveryState singleton
 */
export class DiscoveryStateProxy {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
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
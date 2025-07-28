// Mock dependencies for the standalone text adventure
// These provide the same APIs as the original modules but communicate via postMessage

// Helper function for logging
function log(level, message, ...data) {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[mockDependencies] ${message}`, ...data);
}

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
            log('warn', 'No state snapshot available');
            return null;
        }
        return snapshot;
    }

    getStaticData() {
        const staticData = this.iframeClient.getStaticData();
        if (!staticData) {
            log('warn', 'No static data available');
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
            log('warn', 'Unsubscribe not fully implemented in iframe client');
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
                log('debug', `Player region changed to: ${this.currentRegion}`);
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
            source: 'textAdventure-iframe'
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
 * Create snapshot interface compatible with the original stateManager
 */
export function createStateSnapshotInterface(snapshot, staticData, context = {}) {
    if (!snapshot || !staticData) {
        log('warn', 'Cannot create snapshot interface: missing snapshot or static data');
        return null;
    }

    // This should mirror the original createStateSnapshotInterface function
    // For now, return a basic interface
    return {
        snapshot,
        staticData,
        context,
        
        // Add helper methods that the rule engine expects
        has: (itemName) => {
            return snapshot.inventory && snapshot.inventory[itemName] > 0;
        },
        
        count: (itemName) => {
            return snapshot.inventory ? (snapshot.inventory[itemName] || 0) : 0;
        }
    };
}

/**
 * Mock rule engine evaluation function
 */
export function evaluateRule(rule, snapshotInterface) {
    // This is a simplified version - the real rule engine is more complex
    // For iframe purposes, we might need to request rule evaluation from the main app
    // or implement a simplified version here
    
    if (!rule || !snapshotInterface) {
        return false;
    }
    
    // Handle simple rule types
    if (typeof rule === 'boolean') {
        return rule;
    }
    
    if (typeof rule === 'string') {
        // Simple item check
        return snapshotInterface.has(rule);
    }
    
    if (Array.isArray(rule)) {
        // Array rules (AND/OR logic)
        const [operator, ...operands] = rule;
        
        switch (operator) {
            case 'AND':
                return operands.every(operand => evaluateRule(operand, snapshotInterface));
            case 'OR':
                return operands.some(operand => evaluateRule(operand, snapshotInterface));
            default:
                log('warn', `Unknown rule operator: ${operator}`);
                return false;
        }
    }
    
    if (typeof rule === 'object') {
        // Object rules (function calls, etc.)
        // This would need more complex handling in a full implementation
        log('warn', 'Complex object rules not fully supported in iframe');
        return false;
    }
    
    return false;
}
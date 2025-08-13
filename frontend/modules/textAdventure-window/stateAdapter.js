// Async wrapper for window data access
// Provides async wrappers around windowClient methods for unified data access

/**
 * Async state adapter for window context
 * Provides unified data access methods that work asynchronously via postMessage
 */
export class WindowStateAdapter {
    constructor(windowClient) {
        this.windowClient = windowClient;
    }

    /**
     * Get current state snapshot asynchronously
     * @returns {Promise<object>} State snapshot
     */
    async getStateSnapshot() {
        this.windowClient.requestStateSnapshot();
        // Wait briefly for response to be cached
        await new Promise(resolve => setTimeout(resolve, 50));
        return this.windowClient.getStateSnapshot();
    }

    /**
     * Get static data asynchronously  
     * @returns {Promise<object>} Static data
     */
    async getStaticData() {
        this.windowClient.requestStaticData();
        await new Promise(resolve => setTimeout(resolve, 50));
        return this.windowClient.getStaticData();
    }

    /**
     * Get both snapshot and static data in one call
     * @returns {Promise<{snapshot: object, staticData: object}>}
     */
    async getSnapshotAndStaticData() {
        const [snapshot, staticData] = await Promise.all([
            this.getStateSnapshot(),
            this.getStaticData()
        ]);
        
        return { snapshot, staticData };
    }

    /**
     * Create a state snapshot interface asynchronously
     * @param {object} contextVariables - Optional context variables
     * @returns {Promise<object>} State snapshot interface
     */
    async createStateInterface(contextVariables = {}) {
        const { snapshot, staticData } = await this.getSnapshotAndStaticData();
        
        // Import the shared function dynamically to avoid circular dependencies
        const { createStateSnapshotInterface } = await import('../shared/stateInterface.js');
        
        return createStateSnapshotInterface(snapshot, staticData, contextVariables);
    }

    /**
     * Evaluate a rule asynchronously using current state
     * @param {object} rule - Rule to evaluate
     * @param {object} contextVariables - Optional context variables
     * @returns {Promise<boolean>} Rule evaluation result
     */
    async evaluateRule(rule, contextVariables = {}) {
        const stateInterface = await this.createStateInterface(contextVariables);
        
        // Import the shared function dynamically
        const { evaluateRule } = await import('../shared/ruleEngine.js');
        
        return evaluateRule(rule, stateInterface);
    }

    async isLocationAccessible(locationName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.isLocationAccessible(locationName);
    }

    async isRegionReachable(regionName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.isRegionReachable(regionName);
    }

    async hasItem(itemName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.hasItem(itemName);
    }

    async countItem(itemName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.countItem(itemName);
    }
}

// Convenience functions for direct use with window client
export async function getStateSnapshot(windowClient) {
    windowClient.requestStateSnapshot();
    await new Promise(resolve => setTimeout(resolve, 50));
    return windowClient.getStateSnapshot();
}

export async function getStaticData(windowClient) {
    windowClient.requestStaticData();
    await new Promise(resolve => setTimeout(resolve, 50));
    return windowClient.getStaticData();
}

export async function createStateInterface(windowClient, contextVariables = {}) {
    const [snapshot, staticData] = await Promise.all([
        getStateSnapshot(windowClient),
        getStaticData(windowClient)
    ]);
    const { createStateSnapshotInterface } = await import('../shared/stateInterface.js');
    return createStateSnapshotInterface(snapshot, staticData, contextVariables);
}

export async function evaluateRuleAsync(rule, windowClient, contextVariables = {}) {
    const stateInterface = await createStateInterface(windowClient, contextVariables);
    const { evaluateRule } = await import('../shared/ruleEngine.js');
    return evaluateRule(rule, stateInterface);
}
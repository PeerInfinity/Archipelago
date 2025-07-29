// Async wrapper for iframe data access
// Provides async wrappers around iframeClient methods for unified data access

/**
 * Async state adapter for iframe context
 * Provides unified data access methods that work asynchronously via postMessage
 */
export class IframeStateAdapter {
    constructor(iframeClient) {
        this.iframeClient = iframeClient;
    }

    /**
     * Get current state snapshot asynchronously
     * @returns {Promise<object>} State snapshot
     */
    async getStateSnapshot() {
        return await this.iframeClient.requestStateSnapshot();
    }

    /**
     * Get static data asynchronously  
     * @returns {Promise<object>} Static data
     */
    async getStaticData() {
        return await this.iframeClient.requestStaticData();
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

    /**
     * Check if a location is accessible using current state
     * @param {string} locationName - Location name
     * @returns {Promise<boolean>} Accessibility result
     */
    async isLocationAccessible(locationName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.isLocationAccessible(locationName);
    }

    /**
     * Check if a region is reachable using current state
     * @param {string} regionName - Region name
     * @returns {Promise<boolean>} Reachability result
     */
    async isRegionReachable(regionName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.isRegionReachable(regionName);
    }

    /**
     * Check if player has an item using current state
     * @param {string} itemName - Item name
     * @returns {Promise<boolean>} Has item result
     */
    async hasItem(itemName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.hasItem(itemName);
    }

    /**
     * Count items in inventory using current state
     * @param {string} itemName - Item name
     * @returns {Promise<number>} Item count
     */
    async countItem(itemName) {
        const stateInterface = await this.createStateInterface();
        return stateInterface.countItem(itemName);
    }
}

/**
 * Convenience functions for use in iframe context
 */

/**
 * Get state snapshot asynchronously
 * @param {object} iframeClient - Iframe client instance
 * @returns {Promise<object>} State snapshot
 */
export async function getStateSnapshot(iframeClient) {
    return await iframeClient.requestStateSnapshot();
}

/**
 * Get static data asynchronously
 * @param {object} iframeClient - Iframe client instance
 * @returns {Promise<object>} Static data
 */
export async function getStaticData(iframeClient) {
    return await iframeClient.requestStaticData();
}

/**
 * Create state interface asynchronously
 * @param {object} iframeClient - Iframe client instance
 * @param {object} contextVariables - Optional context variables
 * @returns {Promise<object>} State interface
 */
export async function createStateInterface(iframeClient, contextVariables = {}) {
    const [snapshot, staticData] = await Promise.all([
        getStateSnapshot(iframeClient),
        getStaticData(iframeClient)
    ]);
    
    const { createStateSnapshotInterface } = await import('../shared/stateInterface.js');
    return createStateSnapshotInterface(snapshot, staticData, contextVariables);
}

/**
 * Evaluate rule asynchronously using iframe client
 * @param {object} rule - Rule to evaluate
 * @param {object} iframeClient - Iframe client instance
 * @param {object} contextVariables - Optional context variables
 * @returns {Promise<boolean>} Rule evaluation result
 */
export async function evaluateRuleAsync(rule, iframeClient, contextVariables = {}) {
    const stateInterface = await createStateInterface(iframeClient, contextVariables);
    
    const { evaluateRule } = await import('../shared/ruleEngine.js');
    return evaluateRule(rule, stateInterface);
}
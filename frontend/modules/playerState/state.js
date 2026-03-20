/**
 * PlayerState - Tracks player-specific state information
 * Tracks the player's current region and path through regions
 */
export class PlayerState {
    constructor(eventBus) {
        this.eventBus = eventBus;

        // Current region — null until setStartRegions is called
        this.currentRegion = null;

        // Start regions - regions where the player begins
        // These are treated specially: they are fully explored from the start
        // and custom actions like 'explore' are not needed for them
        this.startRegions = [];

        // Path data - array of player actions/movements
        // Starts empty; the starting position is tracked by currentRegion, not a path entry.
        // Entry types:
        // - regionMove: { type: 'regionMove', sourceRegion: string|null, destinationRegion: string, exitUsed: string|null, instanceNumber: number }
        // - locationCheck: { type: 'locationCheck', locationName: string, sourceRegion: string, instanceNumber: number }
        // - customAction: { type: 'customAction', actionName: string, params: object, sourceRegion: string, instanceNumber: number }
        this.path = [];

        // Track instance counts for each region
        this.regionInstanceCounts = new Map();

        // Navigation behavior configuration
        // true: create loops when revisiting regions (default)
        // false: trim path on backward navigation
        this.allowLoops = true;
    }

    /**
     * Set the start regions for this game
     * @param {string[]} regions - Array of starting region names
     */
    setStartRegions(regions) {
        // Handle object format: {"default": ["Overworld"], "available": []}
        if (regions && !Array.isArray(regions) && typeof regions === 'object' && Array.isArray(regions.default)) {
            regions = regions.default;
        }
        if (Array.isArray(regions) && regions.length > 0) {
            this.startRegions = regions;
            // Set current region to the first start region if not already set
            if (!this.currentRegion) {
                this.currentRegion = regions[0];
            }
        }
    }

    /**
     * Check if a region is a start region
     * @param {string} regionName - Name of the region to check
     * @returns {boolean} True if the region is a start region
     */
    isStartRegion(regionName) {
        return this.startRegions.includes(regionName);
    }

    /**
     * Set the current region
     * @param {string} regionName - Name of the region
     */
    setCurrentRegion(regionName) {
        if (this.currentRegion !== regionName) {
            const oldRegion = this.currentRegion;
            this.currentRegion = regionName;
            
            // Publish event about region change
            if (this.eventBus) {
                this.eventBus.publish('playerState:regionChanged', {
                    oldRegion,
                    newRegion: regionName
                });
            }
        }
    }

    /**
     * Get the current region
     * @returns {string} Current region name
     */
    getCurrentRegion() {
        return this.currentRegion;
    }

    /**
     * Get the last region in the path (where the queue ends)
     * This is used for queue building - checking against path end, not current position
     * @returns {string|null} Last region name in path, or null if path is empty
     */
    getLastRegionInPath() {
        // Search backwards for the last regionMove entry
        for (let i = this.path.length - 1; i >= 0; i--) {
            if (this.path[i].type === 'regionMove') {
                return this.path[i].destinationRegion;
            }
        }
        // If path is empty or has no regionMove entries, fall back to currentRegion
        return this.currentRegion;
    }

    /**
     * Update path when moving to a new region
     * @param {string} targetRegion - Target region name
     * @param {string} exitUsed - Exit used to reach the target (optional)
     * @param {string} sourceRegion - Source region (optional, for validation)
     */
    updatePath(targetRegion, exitUsed = null, sourceRegion = null) {
        // Get the last region in the path (where the queue currently ends)
        const lastPathRegion = this.getLastRegionInPath();

        // Check if we're already at the target region - ignore redundant moves
        // Use the last region in the path, not currentRegion, so queue building works correctly
        if (targetRegion === lastPathRegion) {
            // Using console.log instead of console.warn since this is expected behavior
            // (prevents duplicate moves when events are processed multiple times)
            console.log(`[PlayerState] Ignoring redundant move to same region: ${targetRegion}. Path ends at: ${lastPathRegion}`);
            return;
        }

        // If sourceRegion is provided, validate it matches the last region in path
        if (sourceRegion && sourceRegion !== lastPathRegion) {
            console.warn(`[PlayerState] Source region mismatch: path ends at ${lastPathRegion}, got sourceRegion ${sourceRegion}. Target: ${targetRegion}, Exit: ${exitUsed}. This may indicate multiple region move events or outdated event data.`);
        }
        
        // Check if we should handle backward navigation (only if loops are disabled)
        if (!this.allowLoops) {
            const currentPathIndex = this.path.length - 1;
            if (currentPathIndex > 0) {
                // Find the previous regionMove entry
                let previousRegionIndex = -1;
                for (let i = currentPathIndex - 1; i >= 0; i--) {
                    const entry = this.path[i];
                    if (entry.type === 'regionMove') {
                        previousRegionIndex = i;
                        break;
                    }
                }
                
                if (previousRegionIndex >= 0 && this.path[previousRegionIndex].destinationRegion === targetRegion) {
                    // Moving backward - remove all entries from current position back to (but not including) the previous region
                    const removedEntries = this.path.splice(previousRegionIndex + 1);
                    
                    // Update instance counts for removed regionMove entries
                    for (const entry of removedEntries) {
                        if (entry.type === 'regionMove') {
                            const currentCount = this.regionInstanceCounts.get(entry.destinationRegion) || 0;
                            if (currentCount > 1) {
                                this.regionInstanceCounts.set(entry.destinationRegion, currentCount - 1);
                            } else {
                                this.regionInstanceCounts.delete(entry.destinationRegion);
                            }
                        }
                    }
                    
                    // Emit path updated event
                    this.emitPathUpdated();
                    return;
                }
            }
        }
        
        // Moving forward - add to path
        const instanceCount = (this.regionInstanceCounts.get(targetRegion) || 0) + 1;
        this.regionInstanceCounts.set(targetRegion, instanceCount);
        
        this.path.push({
            type: 'regionMove',
            sourceRegion: sourceRegion || lastPathRegion,
            destinationRegion: targetRegion,
            exitUsed: exitUsed,
            instanceNumber: instanceCount
        });
        
        // Emit path updated event
        this.emitPathUpdated();
    }
    
    /**
     * Add a location check entry to the path
     * @param {string} locationName - Name of the location checked
     * @param {string} regionName - Name of the region where the location exists (optional, will be looked up if not provided)
     * @param {Object} staticData - Optional staticData for region lookup
     */
    addLocationCheck(locationName, regionName = null, staticData = null) {
        // Find the most recent regionMove entry in the path for instance number
        let lastRegionMove = null;
        for (let i = this.path.length - 1; i >= 0; i--) {
            if (this.path[i].type === 'regionMove') {
                lastRegionMove = this.path[i];
                break;
            }
        }

        if (!lastRegionMove) {
            console.warn(`[PlayerState] Cannot add location check: no regionMove entries found in path`);
            return;
        }

        // Use the provided region name, or look it up from staticData, or fall back to current region
        let locationRegion = regionName;
        if (!locationRegion && staticData && staticData.locations) {
            // Try to find the location in staticData to get its region
            const locationDef = staticData.locations.get(locationName);
            if (locationDef && locationDef.region) {
                locationRegion = locationDef.region;
            }
        }

        // If still no region, use the current region from the last regionMove
        if (!locationRegion) {
            locationRegion = lastRegionMove.destinationRegion;
        }

        this.path.push({
            type: 'locationCheck',
            locationName: locationName,
            sourceRegion: locationRegion,
            instanceNumber: lastRegionMove.instanceNumber
        });
        
        // Emit path updated event
        this.emitPathUpdated();
    }
    
    /**
     * Add a custom action entry to the path
     * @param {string} actionName - Name of the action
     * @param {Object} params - Additional parameters for the action
     */
    addCustomAction(actionName, params = {}) {
        if (!this.currentRegion) {
            console.warn(`[PlayerState] Cannot add custom action when not in a valid region`);
            return;
        }
        // Note: Removed the start region check to allow building paths from start regions
        // Start regions may still need explore/move actions in loop mode
        
        // Get the current region's instance number
        const currentInstanceNumber = this.regionInstanceCounts.get(this.currentRegion) || 1;
        
        this.path.push({
            type: 'customAction',
            actionName: actionName,
            params: params,
            sourceRegion: this.currentRegion,
            instanceNumber: currentInstanceNumber
        });
        
        // Emit path updated event
        this.emitPathUpdated();
    }
    
    /**
     * Insert a location check entry at a specific region instance
     * @param {string} locationName - Name of the location to check
     * @param {string} targetRegionName - Name of the region where the action should be inserted
     * @param {number} targetInstanceNumber - Which instance of the region to insert after
     * @param {string} locationRegionName - Name of the region where the location exists (optional)
     */
    insertLocationCheckAt(locationName, targetRegionName, targetInstanceNumber, locationRegionName = null) {
        // Find the target regionMove entry
        let foundCount = 0;
        let insertIndex = -1;

        for (let i = 0; i < this.path.length; i++) {
            const entry = this.path[i];
            if (entry.type === 'regionMove' && entry.destinationRegion === targetRegionName) {
                foundCount++;
                if (foundCount === targetInstanceNumber) {
                    insertIndex = i;
                    break;
                }
            }
        }
        
        if (insertIndex === -1) {
            console.warn(`[PlayerState] Target region ${targetRegionName} instance ${targetInstanceNumber} not found in path`);
            return false;
        }
        
        // Find the insertion point - after the target regionMove but before the next regionMove
        let insertAfterIndex = insertIndex;
        
        // Look for existing non-regionMove entries after this regionMove to insert at the end
        for (let i = insertIndex + 1; i < this.path.length; i++) {
            const entry = this.path[i];
            if (entry.type === 'regionMove') {
                // Found the next region move, insert before it
                break;
            }
            // This is a location check or custom action, keep looking
            insertAfterIndex = i;
        }
        
        // Use the provided region name or the target region
        const finalRegionName = locationRegionName || targetRegionName;
        
        // Create the location check entry
        const locationCheckEntry = {
            type: 'locationCheck',
            locationName: locationName,
            sourceRegion: finalRegionName,
            instanceNumber: targetInstanceNumber
        };
        
        // Insert the entry
        this.path.splice(insertAfterIndex + 1, 0, locationCheckEntry);
        
        // Emit path updated event
        this.emitPathUpdated();
        
        return true;
    }
    
    /**
     * Insert a custom action entry at a specific region instance
     * @param {string} actionName - Name of the action
     * @param {string} targetRegionName - Name of the region where the action should be inserted
     * @param {number} targetInstanceNumber - Which instance of the region to insert after
     * @param {Object} params - Additional parameters for the action
     */
    insertCustomActionAt(actionName, targetRegionName, targetInstanceNumber, params = {}) {
        // Find the target regionMove entry
        let foundCount = 0;
        let insertIndex = -1;

        for (let i = 0; i < this.path.length; i++) {
            const entry = this.path[i];
            if (entry.type === 'regionMove' && entry.destinationRegion === targetRegionName) {
                foundCount++;
                if (foundCount === targetInstanceNumber) {
                    insertIndex = i;
                    break;
                }
            }
        }
        
        if (insertIndex === -1) {
            console.warn(`[PlayerState] Target region ${targetRegionName} instance ${targetInstanceNumber} not found in path`);
            return false;
        }
        
        // Find the insertion point - after the target regionMove but before the next regionMove
        let insertAfterIndex = insertIndex;
        
        // Look for existing non-regionMove entries after this regionMove to insert at the end
        for (let i = insertIndex + 1; i < this.path.length; i++) {
            const entry = this.path[i];
            if (entry.type === 'regionMove') {
                // Found the next region move, insert before it
                break;
            }
            // This is a location check or custom action, keep looking
            insertAfterIndex = i;
        }
        
        // Create the custom action entry
        const customActionEntry = {
            type: 'customAction',
            actionName: actionName,
            params: params,
            sourceRegion: targetRegionName,
            instanceNumber: targetInstanceNumber
        };
        
        // Insert the entry
        this.path.splice(insertAfterIndex + 1, 0, customActionEntry);
        
        // Emit path updated event
        this.emitPathUpdated();
        
        return true;
    }
    
    /**
     * Remove a specific location check entry from the path
     * @param {string} locationName - Name of the location to remove
     * @param {string} targetRegionName - Name of the region where the action should be removed from
     * @param {number} targetInstanceNumber - Which instance of the region to remove from
     */
    removeLocationCheckAt(locationName, targetRegionName, targetInstanceNumber) {
        let removedCount = 0;
        
        // Find and remove all matching location check entries
        for (let i = this.path.length - 1; i >= 0; i--) {
            const entry = this.path[i];
            if (entry.type === 'locationCheck' &&
                entry.locationName === locationName &&
                entry.sourceRegion === targetRegionName &&
                entry.instanceNumber === targetInstanceNumber) {
                this.path.splice(i, 1);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            // Emit path updated event
            this.emitPathUpdated();
            return true;
        }
        
        console.warn(`[PlayerState] Location check ${locationName} not found in ${targetRegionName} instance ${targetInstanceNumber}`);
        return false;
    }
    
    /**
     * Remove a specific custom action entry from the path
     * @param {string} actionName - Name of the action to remove
     * @param {string} targetRegionName - Name of the region where the action should be removed from
     * @param {number} targetInstanceNumber - Which instance of the region to remove from
     */
    removeCustomActionAt(actionName, targetRegionName, targetInstanceNumber) {
        let removedCount = 0;
        
        // Find and remove all matching custom action entries
        for (let i = this.path.length - 1; i >= 0; i--) {
            const entry = this.path[i];
            if (entry.type === 'customAction' &&
                entry.actionName === actionName &&
                entry.sourceRegion === targetRegionName &&
                entry.instanceNumber === targetInstanceNumber) {
                this.path.splice(i, 1);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            // Emit path updated event
            this.emitPathUpdated();
            return true;
        }
        
        console.warn(`[PlayerState] Custom action ${actionName} not found in ${targetRegionName} instance ${targetInstanceNumber}`);
        return false;
    }
    
    /**
     * Remove all non-regionMove entries from a specific region instance
     * @param {string} targetRegionName - Name of the region to clear actions from
     * @param {number} targetInstanceNumber - Which instance of the region to clear
     */
    clearActionsAt(targetRegionName, targetInstanceNumber) {
        let removedCount = 0;
        
        // Find and remove all non-regionMove entries for the specified region instance
        for (let i = this.path.length - 1; i >= 0; i--) {
            const entry = this.path[i];
            if (entry.type !== 'regionMove' &&
                entry.sourceRegion === targetRegionName &&
                entry.instanceNumber === targetInstanceNumber) {
                this.path.splice(i, 1);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            // Emit path updated event
            this.emitPathUpdated();
            return true;
        }
        
        console.warn(`[PlayerState] No actions found to clear in ${targetRegionName} instance ${targetInstanceNumber}`);
        return false;
    }
    
    /**
     * Remove all actions of a specific type from the entire path
     * @param {string} actionType - Type of action to remove ('locationCheck' or 'customAction')
     * @param {string} specificName - Specific name to match (locationName for locationCheck, actionName for customAction) - optional
     */
    removeAllActionsOfType(actionType, specificName = null) {
        let removedCount = 0;
        
        for (let i = this.path.length - 1; i >= 0; i--) {
            const entry = this.path[i];
            let shouldRemove = false;
            
            if (actionType === 'locationCheck' && entry.type === 'locationCheck') {
                shouldRemove = !specificName || entry.locationName === specificName;
            } else if (actionType === 'customAction' && entry.type === 'customAction') {
                shouldRemove = !specificName || entry.actionName === specificName;
            }
            
            if (shouldRemove) {
                this.path.splice(i, 1);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            // Emit path updated event
            this.emitPathUpdated();
            return removedCount;
        }
        
        return 0;
    }

    /**
     * Trim the path at a specific region instance
     * @param {string} regionName - Region to trim at (default: first start region)
     * @param {number} instanceNumber - Which instance of the region (default: 1)
     */
    trimPath(regionName = null, instanceNumber = 1) {
        // Default to first start region if not specified
        const targetRegion = regionName || this.startRegions[0];
        // Find the nth instance of the specified region (only counting regionMove entries)
        let foundCount = 0;
        let trimIndex = -1;

        for (let i = 0; i < this.path.length; i++) {
            const entry = this.path[i];
            // Count only regionMove entries
            if (entry.type === 'regionMove' && entry.destinationRegion === targetRegion) {
                foundCount++;
                if (foundCount === instanceNumber) {
                    trimIndex = i;
                    break;
                }
            }
        }

        if (trimIndex === -1) {
            console.warn(`[PlayerState] Region ${targetRegion} instance ${instanceNumber} not found in path`);
            return;
        }
        
        // Trim everything after the found index
        const removedEntries = this.path.splice(trimIndex + 1);
        
        // Update instance counts for removed regions (only count regionMove entries)
        for (const entry of removedEntries) {
            // Only decrement counts for regionMove entries
            if (entry.type === 'regionMove') {
                const count = this.regionInstanceCounts.get(entry.destinationRegion) || 0;
                if (count > 1) {
                    this.regionInstanceCounts.set(entry.destinationRegion, count - 1);
                } else {
                    this.regionInstanceCounts.delete(entry.destinationRegion);
                }
            }
        }
        
        // Update current region to the last region in the path
        if (this.path.length > 0) {
            const lastEntry = this.path[this.path.length - 1];
            this.currentRegion = lastEntry.type === 'regionMove'
                ? lastEntry.destinationRegion : lastEntry.sourceRegion;

            // Emit region changed event
            if (this.eventBus && removedEntries.length > 0) {
                const lastRemoved = removedEntries[removedEntries.length - 1];
                const oldRegion = lastRemoved.type === 'regionMove'
                    ? lastRemoved.destinationRegion : lastRemoved.sourceRegion;
                this.eventBus.publish('playerState:regionChanged', {
                    oldRegion,
                    newRegion: this.currentRegion
                });
            }
        }
        
        // Emit path updated event
        this.emitPathUpdated();
    }
    
    /**
     * Emit path updated event
     */
    emitPathUpdated() {
        if (this.eventBus) {
            this.eventBus.publish('playerState:pathUpdated', {
                path: [...this.path], // Send a copy
                currentRegion: this.currentRegion,
                regionCounts: new Map(this.regionInstanceCounts)
            });
        }
    }
    
    /**
     * Get the current path
     * @returns {Array} Copy of the path array
     */
    getPath() {
        return [...this.path];
    }
    
    /**
     * Get region instance counts
     * @returns {Map} Copy of the region instance counts
     */
    getRegionCounts() {
        return new Map(this.regionInstanceCounts);
    }
    
    /**
     * Set whether to allow loops in the path
     * @param {boolean} allowLoops - If true, create loops; if false, trim on backward navigation
     */
    setAllowLoops(allowLoops) {
        this.allowLoops = allowLoops;
    }
    
    /**
     * Get whether loops are allowed
     * @returns {boolean} True if loops are allowed
     */
    getAllowLoops() {
        return this.allowLoops;
    }
    
    /**
     * Reset state to defaults
     */
    reset() {
        const firstStartRegion = this.startRegions[0];
        this.currentRegion = firstStartRegion;
        this.path = [];
        this.regionInstanceCounts.clear();

        // Emit events for the reset
        if (this.eventBus) {
            this.eventBus.publish('playerState:regionChanged', {
                oldRegion: null,
                newRegion: firstStartRegion
            });
        }
        this.emitPathUpdated();
    }

    /**
     * Set the entire path directly (for programmatic queue loading).
     * Rebuilds instance counts from the path data.
     * @param {Array} pathArray - Array of path entries
     * @param {string} startRegion - Starting region for this queue (sets currentRegion)
     */
    setPath(pathArray, startRegion = null) {
        this.path = [...pathArray];

        // Rebuild regionInstanceCounts from path
        this.regionInstanceCounts = new Map();
        for (const entry of this.path) {
            if (entry.type === 'regionMove') {
                const count = (this.regionInstanceCounts.get(entry.destinationRegion) || 0) + 1;
                this.regionInstanceCounts.set(entry.destinationRegion, count);
            }
        }

        // Set current region to start region (where the player begins this queue)
        if (startRegion) {
            this.currentRegion = startRegion;
        }

        this.emitPathUpdated();
    }

    /**
     * Serialize state for potential future persistence
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            currentRegion: this.currentRegion,
            path: [...this.path],
            regionInstanceCounts: Array.from(this.regionInstanceCounts.entries()),
            startRegions: [...this.startRegions]
        };
    }

    /**
     * Load state from serialized data
     * @param {Object} data - Serialized state data
     */
    deserialize(data) {
        if (data) {
            if (data.startRegions && Array.isArray(data.startRegions)) {
                this.startRegions = [...data.startRegions];
            }
            if (data.currentRegion) {
                this.currentRegion = data.currentRegion;
            }
            if (data.path) {
                this.path = [...data.path];
            }
            if (data.regionInstanceCounts) {
                this.regionInstanceCounts = new Map(data.regionInstanceCounts);
            }

            // Emit events for the loaded state
            this.emitPathUpdated();
        }
    }
}
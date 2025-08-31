/**
 * PlayerState - Tracks player-specific state information
 * Tracks the player's current region and path through regions
 */
export class PlayerState {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.currentRegion = 'Menu';
        
        // Path data - array of visited regions with exit information
        // Each entry: { region: string, exitUsed: string|null, instanceNumber: number }
        this.path = [
            { region: 'Menu', exitUsed: null, instanceNumber: 1 }
        ];
        
        // Track instance counts for each region
        this.regionInstanceCounts = new Map();
        this.regionInstanceCounts.set('Menu', 1);
        
        // Navigation behavior configuration
        // true: create loops when revisiting regions (default)
        // false: trim path on backward navigation
        this.allowLoops = true;
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
                }, 'playerState');
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
     * Update path when moving to a new region
     * @param {string} targetRegion - Target region name
     * @param {string} exitUsed - Exit used to reach the target (optional)
     * @param {string} sourceRegion - Source region (optional, for validation)
     */
    updatePath(targetRegion, exitUsed = null, sourceRegion = null) {
        // Check if we're already at the target region - ignore redundant moves
        if (targetRegion === this.currentRegion) {
            console.warn(`[PlayerState] Ignoring redundant move to same region: ${targetRegion}. Current path length: ${this.path.length}`);
            return;
        }
        
        // If sourceRegion is provided, validate it matches current region
        if (sourceRegion && sourceRegion !== this.currentRegion) {
            console.warn(`[PlayerState] Source region mismatch: expected ${this.currentRegion}, got ${sourceRegion}. Target: ${targetRegion}, Exit: ${exitUsed}. This may indicate multiple region move events or outdated event data.`);
        }
        
        // Check if we should handle backward navigation (only if loops are disabled)
        if (!this.allowLoops) {
            const currentPathIndex = this.path.length - 1;
            if (currentPathIndex > 0) {
                const previousRegion = this.path[currentPathIndex - 1];
                if (previousRegion.region === targetRegion) {
                    // Moving backward - get the current entry before popping
                    const currentEntry = this.path[currentPathIndex];
                    
                    // Remove the current entry from the path
                    this.path.pop();
                    
                    // Update instance counts for the removed entry
                    if (currentEntry) {
                        const currentCount = this.regionInstanceCounts.get(currentEntry.region) || 0;
                        if (currentCount > 1) {
                            this.regionInstanceCounts.set(currentEntry.region, currentCount - 1);
                        } else {
                            this.regionInstanceCounts.delete(currentEntry.region);
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
            region: targetRegion,
            exitUsed: exitUsed,
            instanceNumber: instanceCount
        });
        
        // Emit path updated event
        this.emitPathUpdated();
    }
    
    /**
     * Trim the path at a specific region instance
     * @param {string} regionName - Region to trim at (default: "Menu")
     * @param {number} instanceNumber - Which instance of the region (default: 1)
     */
    trimPath(regionName = 'Menu', instanceNumber = 1) {
        // Find the nth instance of the specified region
        let foundCount = 0;
        let trimIndex = -1;
        
        for (let i = 0; i < this.path.length; i++) {
            if (this.path[i].region === regionName) {
                foundCount++;
                if (foundCount === instanceNumber) {
                    trimIndex = i;
                    break;
                }
            }
        }
        
        if (trimIndex === -1) {
            console.warn(`[PlayerState] Region ${regionName} instance ${instanceNumber} not found in path`);
            return;
        }
        
        // Trim everything after the found index
        const removedEntries = this.path.splice(trimIndex + 1);
        
        // Update instance counts for removed regions
        for (const entry of removedEntries) {
            const count = this.regionInstanceCounts.get(entry.region) || 0;
            if (count > 1) {
                this.regionInstanceCounts.set(entry.region, count - 1);
            } else {
                this.regionInstanceCounts.delete(entry.region);
            }
        }
        
        // Update current region to the last region in the path
        if (this.path.length > 0) {
            const lastEntry = this.path[this.path.length - 1];
            this.currentRegion = lastEntry.region;
            
            // Emit region changed event
            if (this.eventBus && removedEntries.length > 0) {
                this.eventBus.publish('playerState:regionChanged', {
                    oldRegion: removedEntries[removedEntries.length - 1].region,
                    newRegion: this.currentRegion
                }, 'playerState');
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
            }, 'playerState');
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
        this.currentRegion = 'Menu';
        this.path = [
            { region: 'Menu', exitUsed: null, instanceNumber: 1 }
        ];
        this.regionInstanceCounts.clear();
        this.regionInstanceCounts.set('Menu', 1);
        
        // Emit events for the reset
        if (this.eventBus) {
            this.eventBus.publish('playerState:regionChanged', {
                oldRegion: null,
                newRegion: 'Menu'
            }, 'playerState');
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
            regionInstanceCounts: Array.from(this.regionInstanceCounts.entries())
        };
    }

    /**
     * Load state from serialized data
     * @param {Object} data - Serialized state data
     */
    deserialize(data) {
        if (data) {
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
/**
 * PlayerState - Tracks player-specific state information
 * Currently tracks the player's current region
 */
export class PlayerState {
    constructor(eventBus) {
        this.eventBus = eventBus;
        this.currentRegion = 'Menu';
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
     * Reset state to defaults
     */
    reset() {
        this.setCurrentRegion('Menu');
    }

    /**
     * Serialize state for potential future persistence
     * @returns {Object} Serialized state
     */
    serialize() {
        return {
            currentRegion: this.currentRegion
        };
    }

    /**
     * Load state from serialized data
     * @param {Object} data - Serialized state data
     */
    deserialize(data) {
        if (data && data.currentRegion) {
            this.currentRegion = data.currentRegion;
        }
    }
}
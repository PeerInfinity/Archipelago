/**
 * Civilization VI-specific game logic functions
 */

/**
 * Check if player has all non-progressive items required for an era
 * @param {Object} snapshot - The state snapshot
 * @param {string} playerId - The player ID (usually 'world')
 * @param {string} era - The era name (e.g., "ERA_ANCIENT")
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has all required non-progressive items
 */
function has_non_progressive_items(snapshot, playerId, era, staticData) {
    const gameInfo = staticData?.game_info?.["1"];
    if (!gameInfo || !gameInfo.era_required_non_progressive_items) {
        return false;
    }
    
    const requiredItems = gameInfo.era_required_non_progressive_items[era];
    if (!requiredItems || requiredItems.length === 0) {
        // No requirements means era is accessible
        return true;
    }
    
    // Check if player has all required items
    const inventory = snapshot?.inventory || {};
    for (const item of requiredItems) {
        if (!inventory[item] || inventory[item] <= 0) {
            return false;
        }
    }
    
    return true;
}

/**
 * Check if player has all progressive items with required counts for an era
 * @param {Object} snapshot - The state snapshot
 * @param {string} playerId - The player ID (usually 'world')
 * @param {string} era - The era name (e.g., "ERA_ANCIENT")
 * @param {Object} staticData - Static game data
 * @returns {boolean} True if player has all required progressive items with correct counts
 */
function has_progressive_items(snapshot, playerId, era, staticData) {
    const gameInfo = staticData?.game_info?.["1"];
    if (!gameInfo || !gameInfo.era_required_progressive_items_counts) {
        return false;
    }
    
    const requiredCounts = gameInfo.era_required_progressive_items_counts[era];
    if (!requiredCounts || Object.keys(requiredCounts).length === 0) {
        // No requirements means era is accessible
        return true;
    }
    
    // Check if player has all required items with correct counts
    const inventory = snapshot?.inventory || {};
    for (const [item, count] of Object.entries(requiredCounts)) {
        if (!inventory[item] || inventory[item] < count) {
            return false;
        }
    }
    
    return true;
}

// Export helper functions
export const helperFunctions = {
    has_non_progressive_items,
    has_progressive_items
};

// Create state module with required functions
export const civ6StateModule = {
    /**
     * Initializes a new, empty Civilization VI game state.
     */
    initializeState() {
        return {
            flags: [], // Checked locations and game-specific flags
            events: [], // Event items
        };
    },

    /**
     * Loads settings into the game state.
     */
    loadSettings(gameState, settings) {
        return { ...gameState };
    },

    /**
     * Process event items for Civilization VI
     */
    processEventItem(gameState, itemName) {
        return null; // Return null to indicate no state change
    },

    /**
     * Returns the state properties for a snapshot.
     */
    getStateForSnapshot(gameState) {
        return {
            flags: gameState.flags || [],
            events: gameState.events || [],
        };
    },

    helperFunctions
};
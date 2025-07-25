// Core logic for text adventure module
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import discoveryStateSingleton from '../discovery/singleton.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventureLogic', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventureLogic] ${message}`, ...data);
  }
}

export class TextAdventureLogic {
    constructor(eventBus, dispatcher) {
        this.eventBus = eventBus;
        this.dispatcher = dispatcher;
        this.customData = null;
        this.messageHistory = [];
        this.messageHistoryLimit = 10;
        this.discoveryMode = false;
        
        // Subscribe to relevant events
        this.setupEventSubscriptions();
        
        log('info', 'TextAdventureLogic initialized');
    }

    setupEventSubscriptions() {
        if (this.eventBus) {
            // Listen for rules loaded to initialize player to starting region
            this.eventBus.subscribe('stateManager:rulesLoaded', (data) => {
                this.handleRulesLoaded(data);
            }, 'textAdventure');

            // Listen for player state changes
            this.eventBus.subscribe('playerState:regionChanged', (data) => {
                this.handleRegionChange(data);
            }, 'textAdventure');

            // Listen for state manager updates
            this.eventBus.subscribe('stateManager:stateChanged', (data) => {
                this.handleStateChange(data);
            }, 'textAdventure');
        }
    }

    /**
     * Handle rules loaded event - initialize player to starting region
     * @param {Object} data - Rules loaded event data
     */
    handleRulesLoaded(data) {
        log('info', 'Rules loaded, initializing player to starting region');
        
        try {
            // Get the current player state
            const playerState = getPlayerStateSingleton();
            const currentRegion = playerState ? playerState.getCurrentRegion() : null;
            
            // If player is not in any region, move them to the starting region
            if (!currentRegion) {
                const snapshot = stateManager.getSnapshot();
                if (snapshot && snapshot.start_regions) {
                    // Get the starting regions for the current player
                    const playerId = snapshot.playerId || '1';
                    const startRegions = snapshot.start_regions[playerId];
                    
                    if (startRegions && startRegions.default && startRegions.default.length > 0) {
                        const startingRegion = startRegions.default[0];
                        log('info', `Moving player to starting region: ${startingRegion}`);
                        
                        // Move player to starting region via dispatcher
                        if (this.dispatcher) {
                            this.dispatcher.publish('user:regionMove', {
                                exitName: 'Initial',
                                targetRegion: startingRegion,
                                sourceRegion: null,
                                sourceModule: 'textAdventure'
                            }, 'bottom');
                        }
                    } else {
                        log('warn', 'No starting regions found in rules data');
                    }
                } else {
                    log('warn', 'No snapshot or start_regions data available');
                }
            } else {
                log('info', `Player already in region: ${currentRegion}`);
                // Just refresh the display for the current region
                this.displayCurrentRegion();
            }
        } catch (error) {
            log('error', 'Error handling rules loaded:', error);
            // Fallback to displaying current region (which will show "nowhere" if needed)
            this.displayCurrentRegion();
        }
    }

    /**
     * Load custom data file
     * @param {Object} customData - Custom data JSON object
     */
    loadCustomData(customData) {
        try {
            this.customData = customData;
            
            // Apply settings from custom data
            if (customData.settings) {
                if (typeof customData.settings.enableDiscoveryMode === 'boolean') {
                    this.discoveryMode = customData.settings.enableDiscoveryMode;
                }
                if (typeof customData.settings.messageHistoryLimit === 'number') {
                    this.messageHistoryLimit = customData.settings.messageHistoryLimit;
                }
            }
            
            log('info', 'Custom data loaded:', { 
                discoveryMode: this.discoveryMode, 
                messageHistoryLimit: this.messageHistoryLimit 
            });
            
            // Trigger region message update with custom data
            this.displayCurrentRegion();
            
            // Publish event
            if (this.eventBus) {
                this.eventBus.publish('textAdventure:customDataLoaded', { customData }, 'textAdventure');
            }
            
            return true;
        } catch (error) {
            log('error', 'Error loading custom data:', error);
            return false;
        }
    }

    /**
     * Get current region info
     * @returns {Object} Current region information
     */
    getCurrentRegionInfo() {
        try {
            const playerState = getPlayerStateSingleton();
            const currentRegion = playerState.getCurrentRegion();
            
            if (!currentRegion) {
                return null;
            }

            const snapshot = stateManager.getSnapshot();
            if (!snapshot || !snapshot.regions) {
                return null;
            }

            const regionData = snapshot.regions[currentRegion];
            if (!regionData) {
                return null;
            }

            return {
                name: currentRegion,
                data: regionData
            };
        } catch (error) {
            log('error', 'Error getting current region info:', error);
            return null;
        }
    }

    /**
     * Get available locations in current region
     * @returns {Array} Array of location names
     */
    getAvailableLocations() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo || !regionInfo.data.locations) {
            return [];
        }

        let locations = regionInfo.data.locations.map(loc => loc.name);

        // Filter by discovery mode if enabled
        if (this.discoveryMode && discoveryStateSingleton) {
            locations = locations.filter(locName => 
                discoveryStateSingleton.isLocationDiscovered(locName)
            );
        }

        return locations;
    }

    /**
     * Get available exits in current region
     * @returns {Array} Array of exit names
     */
    getAvailableExits() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo || !regionInfo.data.exits) {
            return [];
        }

        let exits = regionInfo.data.exits.map(exit => exit.name);

        // Filter by discovery mode if enabled
        if (this.discoveryMode && discoveryStateSingleton) {
            exits = exits.filter(exitName => 
                discoveryStateSingleton.isExitDiscovered(regionInfo.name, exitName)
            );
        }

        return exits;
    }

    /**
     * Check if location is accessible
     * @param {string} locationName - Name of location to check
     * @returns {boolean} True if accessible
     */
    isLocationAccessible(locationName) {
        try {
            const snapshot = stateManager.getSnapshot();
            return snapshot.accessibleLocations.includes(locationName);
        } catch (error) {
            log('error', 'Error checking location accessibility:', error);
            return false;
        }
    }

    /**
     * Check if exit is accessible
     * @param {string} exitName - Name of exit to check
     * @returns {boolean} True if accessible
     */
    isExitAccessible(exitName) {
        try {
            const snapshot = stateManager.getSnapshot();
            return snapshot.accessibleExits.includes(exitName);
        } catch (error) {
            log('error', 'Error checking exit accessibility:', error);
            return false;
        }
    }

    /**
     * Get player inventory
     * @returns {Array} Array of item names
     */
    getPlayerInventory() {
        try {
            const snapshot = stateManager.getSnapshot();
            if (snapshot && snapshot.inventory) {
                return Object.keys(snapshot.inventory).filter(item => snapshot.inventory[item] > 0);
            }
            return [];
        } catch (error) {
            log('error', 'Error getting player inventory:', error);
            return [];
        }
    }

    /**
     * Display current region
     */
    displayCurrentRegion() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo) {
            this.addMessage('You are nowhere. Please load a rules file.');
            return;
        }

        const message = this.generateRegionMessage(regionInfo.name);
        this.addMessage(message);
    }

    /**
     * Generate region enter message
     * @param {string} regionName - Name of region
     * @returns {string} Generated message
     */
    generateRegionMessage(regionName) {
        // Check for custom message first
        if (this.customData && this.customData.regions && this.customData.regions[regionName]) {
            const customRegion = this.customData.regions[regionName];
            if (customRegion.enterMessage) {
                return this.processMessageTemplate(customRegion.enterMessage, { regionName });
            }
        }

        // Generate generic message
        let message = `You are now in ${regionName}.`;
        
        const availableLocations = this.getAvailableLocations();
        const availableExits = this.getAvailableExits();
        
        if (availableLocations.length > 0) {
            const locationLinks = availableLocations.map(loc => this.createLocationLink(loc)).join(', ');
            message += `\n\nYou can search: ${locationLinks}`;
        }
        
        if (availableExits.length > 0) {
            const exitLinks = availableExits.map(exit => this.createExitLink(exit)).join(', ');
            message += `\n\nYou can travel to: ${exitLinks}`;
        }
        
        return message;
    }

    /**
     * Handle location check
     * @param {string} locationName - Name of location to check
     * @returns {string} Result message
     */
    handleLocationCheck(locationName) {
        if (!this.isLocationAccessible(locationName)) {
            // Check for custom inaccessible message
            if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
                const customLocation = this.customData.locations[locationName];
                if (customLocation.inaccessibleMessage) {
                    return this.processMessageTemplate(customLocation.inaccessibleMessage, { locationName });
                }
            }
            return `You cannot reach ${locationName} from here.`;
        }

        // Check if already checked
        try {
            const snapshot = stateManager.getSnapshot();
            if (snapshot.checkedLocations.includes(locationName)) {
                // Check for custom already checked message
                if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
                    const customLocation = this.customData.locations[locationName];
                    if (customLocation.alreadyCheckedMessage) {
                        return this.processMessageTemplate(customLocation.alreadyCheckedMessage, { locationName });
                    }
                }
                return `You have already searched ${locationName}.`;
            }
        } catch (error) {
            log('error', 'Error checking if location already checked:', error);
        }

        // Perform the check via dispatcher
        if (this.dispatcher) {
            this.dispatcher.publish('user:locationCheck', {
                locationName: locationName,
                sourceModule: 'textAdventure'
            }, 'bottom');
        }

        // Get the item that would be found (this is a simplification)
        const itemFound = this.getItemAtLocation(locationName);
        
        // Check for custom check message
        if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
            const customLocation = this.customData.locations[locationName];
            if (customLocation.checkMessage) {
                return this.processMessageTemplate(customLocation.checkMessage, { locationName, item: itemFound });
            }
        }

        // Generic message
        return `You search ${locationName} and find: ${itemFound}!`;
    }

    /**
     * Handle region move
     * @param {string} exitName - Name of exit to use
     * @returns {string} Result message
     */
    handleRegionMove(exitName) {
        if (!this.isExitAccessible(exitName)) {
            // Check for custom inaccessible message
            if (this.customData && this.customData.exits && this.customData.exits[exitName]) {
                const customExit = this.customData.exits[exitName];
                if (customExit.inaccessibleMessage) {
                    return this.processMessageTemplate(customExit.inaccessibleMessage, { exitName });
                }
            }
            return `The path to ${exitName} is blocked.`;
        }

        // Get destination region
        const destinationRegion = this.getExitDestination(exitName);
        if (!destinationRegion) {
            return `Cannot determine where ${exitName} leads.`;
        }

        // Perform the move via dispatcher
        if (this.dispatcher) {
            this.dispatcher.publish('user:regionMove', {
                exitName: exitName,
                targetRegion: destinationRegion,
                sourceRegion: this.getCurrentRegionInfo()?.name,
                sourceModule: 'textAdventure'
            }, 'bottom');
        }

        // Check for custom move message
        if (this.customData && this.customData.exits && this.customData.exits[exitName]) {
            const customExit = this.customData.exits[exitName];
            if (customExit.moveMessage) {
                return this.processMessageTemplate(customExit.moveMessage, { exitName, destinationRegion });
            }
        }

        // Generic message
        return `You travel through ${exitName}.`;
    }

    /**
     * Handle inventory command
     * @returns {string} Inventory message
     */
    handleInventoryCommand() {
        const inventory = this.getPlayerInventory();
        
        if (inventory.length === 0) {
            return 'Your inventory is empty.';
        }
        
        return `Your inventory contains: ${inventory.join(', ')}`;
    }

    /**
     * Get item at location (simplified)
     * @param {string} locationName - Location name
     * @returns {string} Item name
     */
    getItemAtLocation(locationName) {
        try {
            const regionInfo = this.getCurrentRegionInfo();
            if (regionInfo && regionInfo.data.locations) {
                const location = regionInfo.data.locations.find(loc => loc.name === locationName);
                if (location && location.item) {
                    return location.item.name || 'Unknown Item';
                }
            }
        } catch (error) {
            log('error', 'Error getting item at location:', error);
        }
        return 'Something';
    }

    /**
     * Get exit destination
     * @param {string} exitName - Exit name
     * @returns {string} Destination region name
     */
    getExitDestination(exitName) {
        try {
            const regionInfo = this.getCurrentRegionInfo();
            if (regionInfo && regionInfo.data.exits) {
                const exit = regionInfo.data.exits.find(ex => ex.name === exitName);
                if (exit) {
                    return exit.connected_region;
                }
            }
        } catch (error) {
            log('error', 'Error getting exit destination:', error);
        }
        return null;
    }

    /**
     * Create location link HTML
     * @param {string} locationName - Location name
     * @returns {string} HTML link
     */
    createLocationLink(locationName) {
        const accessible = this.isLocationAccessible(locationName);
        const cssClass = accessible ? 'text-adventure-link accessible' : 'text-adventure-link inaccessible';
        return `<span class="${cssClass}" data-type="location" data-target="${locationName}">${locationName}</span>`;
    }

    /**
     * Create exit link HTML
     * @param {string} exitName - Exit name
     * @returns {string} HTML link
     */
    createExitLink(exitName) {
        const accessible = this.isExitAccessible(exitName);
        const cssClass = accessible ? 'text-adventure-link accessible' : 'text-adventure-link inaccessible';
        return `<span class="${cssClass}" data-type="exit" data-target="${exitName}">${exitName}</span>`;
    }

    /**
     * Process message template with variable substitution
     * @param {string} template - Message template
     * @param {Object} variables - Variables to substitute
     * @returns {string} Processed message
     */
    processMessageTemplate(template, variables = {}) {
        let processed = template;
        for (const [key, value] of Object.entries(variables)) {
            const placeholder = `{${key}}`;
            processed = processed.replace(new RegExp(placeholder, 'g'), value);
        }
        return processed;
    }

    /**
     * Add message to history
     * @param {string} message - Message to add
     */
    addMessage(message) {
        // Add to history
        this.messageHistory.push({
            text: message,
            timestamp: Date.now()
        });

        // Trim history to limit
        while (this.messageHistory.length > this.messageHistoryLimit) {
            this.messageHistory.shift();
        }

        // Publish event
        if (this.eventBus) {
            this.eventBus.publish('textAdventure:messageAdded', { message }, 'textAdventure');
        }

        log('debug', 'Message added:', message);
    }

    /**
     * Get message history
     * @returns {Array} Message history array
     */
    getMessageHistory() {
        return [...this.messageHistory];
    }

    /**
     * Clear message history
     */
    clearMessageHistory() {
        this.messageHistory = [];
        if (this.eventBus) {
            this.eventBus.publish('textAdventure:historyCleared', {}, 'textAdventure');
        }
    }

    /**
     * Handle region change event
     * @param {Object} data - Event data
     */
    handleRegionChange(data) {
        log('info', 'Region changed:', data);
        // Display new region after a brief delay to allow state to update
        setTimeout(() => {
            this.displayCurrentRegion();
        }, 100);
    }

    /**
     * Handle state change event
     * @param {Object} data - Event data
     */
    handleStateChange(data) {
        // Could update accessibility of links here if needed
        log('debug', 'State changed, might need to update link colors');
    }

    /**
     * Dispose of resources
     */
    dispose() {
        // Clean up event subscriptions if needed
        log('info', 'TextAdventureLogic disposed');
    }
}
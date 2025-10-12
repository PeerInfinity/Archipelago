// Core logic for text adventure module
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { getPlayerStateSingleton } from '../playerState/singleton.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { moduleDispatcher } from './index.js';
// Instance registration is no longer needed

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
        // Note: We now use moduleDispatcher directly instead of constructor parameter
        log('debug', `Constructor - moduleDispatcher available: ${!!moduleDispatcher}`);
        this.customData = null;
        this.messageHistory = [];
        this.messageHistoryLimit = 10;
        this.discoveryMode = false;
        this.retryAttempts = 0;
        this.maxRetryAttempts = 10; // Limit retries to prevent infinite loops
        this.lastDisplayedRegion = null; // Track last displayed region to prevent duplicates
        
        // Subscribe to relevant events
        this.setupEventSubscriptions();
        
        log('info', 'TextAdventureLogic initialized');
    }

    setupEventSubscriptions() {
        if (this.eventBus) {
            // Listen for player state changes
            this.eventBus.subscribe('playerState:regionChanged', (data) => {
                this.handleRegionChange(data);
            }, 'textAdventure');

            // Listen for rules loaded event directly from StateManager
            this.eventBus.subscribe('stateManager:rulesLoaded', (data) => {
                this.handleRulesLoaded(data);
            }, 'textAdventure');

            // Listen for ready event directly from StateManager  
            this.eventBus.subscribe('stateManager:ready', (data) => {
                this.handleStateManagerReady(data);
            }, 'textAdventure');

            // Listen for state changed event directly from StateManager
            this.eventBus.subscribe('stateManager:snapshotUpdated', (data) => {
                this.handleStateChange(data);
            }, 'textAdventure');
        }
    }

    /**
     * Handle state manager ready event - StateManager is fully ready with data
     * @param {Object} data - Ready event data
     */
    handleStateManagerReady(data) {
        log('info', 'StateManager ready');
        // Don't call displayCurrentRegion here - let handleRulesLoaded handle player initialization
        // This event just confirms the StateManager is ready, but player positioning is handled elsewhere
    }

    /**
     * Handle rules loaded event - initialize player to starting region
     * @param {Object} data - Rules loaded event data
     */
    handleRulesLoaded(data) {
        log('info', 'Rules loaded, initializing player positioning and display');
        log('debug', 'Rules loaded event data:', data);
        
        try {
            // Get snapshot and static data
            const snapshot = data.snapshot;
            const staticData = stateManager.getStaticData();
            
            log('debug', 'Snapshot from event:', { hasSnapshot: !!snapshot });
            log('debug', 'Static data:', { hasStaticData: !!staticData, hasRegions: !!(staticData && staticData.regions) });
            
            if (!snapshot) {
                log('error', 'No snapshot in rules loaded event. Cannot initialize player.');
                this.displayCurrentRegion(); // Show fallback
                return;
            }
            
            if (!staticData || !staticData.regions) {
                log('error', 'No static data or regions available. Cannot initialize player.');
                this.displayCurrentRegion(); // Show fallback
                return;
            }
            
            // Reset retry attempts since we got valid data
            this.retryAttempts = 0;
            
            // Initialize player positioning with the snapshot and static data
            this.initializePlayerWithSnapshot(snapshot, staticData);
            
        } catch (error) {
            log('error', 'Error handling rules loaded:', error);
            this.displayCurrentRegion(); // Show fallback
        }
    }
    
    /**
     * Initialize player positioning with snapshot and static data
     * @param {Object} snapshot - The state snapshot
     * @param {Object} staticData - The static data containing regions
     */
    initializePlayerWithSnapshot(snapshot, staticData) {
        log('info', 'Initializing player with snapshot and static data');
        
        try {
            const playerState = getPlayerStateSingleton();
            const currentRegion = playerState ? playerState.getCurrentRegion() : null;
            
            log('info', `Current player region: ${currentRegion}`);
            // Phase 3.2: Use Map methods
            log('info', `Available regions in static data: ${Array.from(staticData.regions.keys()).join(', ')}`);

            // Phase 3.2: Check if the current region exists in the loaded rules
            if (currentRegion && staticData.regions.has(currentRegion)) {
                log('info', `Player region '${currentRegion}' exists in rules, displaying it`);
                this.displayCurrentRegion();
                return;
            }
            
            // Try to find a suitable starting region
            let targetRegion = null;
            
            // First, try start_regions if available
            if (snapshot.start_regions) {
                const playerId = snapshot.playerId || '1';
                const startRegions = snapshot.start_regions[playerId];
                if (startRegions && startRegions.default && startRegions.default.length > 0) {
                    targetRegion = startRegions.default[0];
                    log('info', `Found starting region from start_regions: ${targetRegion}`);
                }
            }
            
            // Phase 3.2: If no start_regions, look for common starting regions
            if (!targetRegion) {
                const commonStartRegions = ['Menu', 'Overworld', 'Start', 'Beginning'];
                for (const regionName of commonStartRegions) {
                    if (staticData.regions.has(regionName)) {
                        targetRegion = regionName;
                        log('info', `Found common starting region: ${targetRegion}`);
                        break;
                    }
                }
            }
            
            // Phase 3.2: If still no target, use the first available region
            if (!targetRegion) {
                const availableRegions = Array.from(staticData.regions.keys());
                if (availableRegions.length > 0) {
                    targetRegion = availableRegions[0];
                    log('info', `Using first available region: ${targetRegion}`);
                }
            }
            
            if (targetRegion) {
                log('info', `Moving player to target region: ${targetRegion}`);
                
                // Move player to target region via dispatcher
                if (moduleDispatcher) {
                    moduleDispatcher.publish('user:regionMove', {
                        exitName: 'Initial',
                        targetRegion: targetRegion,
                        sourceRegion: currentRegion,
                        sourceModule: 'textAdventure'
                    }, 'bottom');
                    
                    // The handleRegionChange event will display the region when the move completes
                    // No timeout needed - proper event-driven architecture
                } else {
                    log('warn', 'ModuleDispatcher not available, cannot move player');
                    this.displayCurrentRegion();
                }
            } else {
                log('warn', 'No suitable target region found');
                this.displayCurrentRegion();
            }
            
        } catch (error) {
            log('error', 'Error in initializePlayerWithSnapshot:', error);
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

            const staticData = stateManager.getStaticData();
            if (!staticData || !staticData.regions) {
                return null;
            }

            // Phase 3.2: Use Map methods
            const regionData = staticData.regions.get(currentRegion);
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
            const snapshot = stateManager.getLatestStateSnapshot();
            const staticData = stateManager.getStaticData();
            
            if (!snapshot || !staticData || !staticData.locations) {
                return false;
            }
            
            // Phase 3.2: Find the location definition
            const locationDef = staticData.locations.get(locationName);
            if (!locationDef) {
                return false;
            }
            
            // Check if the location's region is reachable
            const regionName = locationDef.region;
            const regionIsReachable = 
                snapshot.regionReachability?.[regionName] === true ||
                snapshot.regionReachability?.[regionName] === 'reachable' ||
                snapshot.regionReachability?.[regionName] === 'checked';
            
            // Determine accessibility using same logic as Regions panel
            let locAccessible = true; // Assume accessible if region is reachable and no rule
            if (locationDef.access_rule) {
                try {
                    // Create context-aware snapshot interface with location object (same as Regions)
                    const locationContextInterface = createStateSnapshotInterface(
                        snapshot,
                        staticData,
                        { location: locationDef }
                    );
                    locAccessible = evaluateRule(locationDef.access_rule, locationContextInterface);
                } catch (e) {
                    log('error', `Error evaluating location rule for ${locationName}:`, e);
                    locAccessible = false;
                }
            }
            
            // Must be in reachable region AND pass rule (same as Regions panel)
            return regionIsReachable && locAccessible;
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
        log('debug', `isExitAccessible called for exit: "${exitName}"`);
        try {
            const snapshot = stateManager.getLatestStateSnapshot();
            const staticData = stateManager.getStaticData();
            
            log('debug', `Got snapshot: ${!!snapshot}, staticData: ${!!staticData}`);
            
            if (!snapshot || !staticData || !staticData.regions) {
                log('warn', `Missing data - snapshot: ${!!snapshot}, staticData: ${!!staticData}, regions: ${!!(staticData && staticData.regions)}`);
                return false;
            }
            
            // Get current region info
            const regionInfo = this.getCurrentRegionInfo();
            log('debug', `isExitAccessible: regionInfo = ${regionInfo ? regionInfo.name : 'null'}`);
            if (!regionInfo || !regionInfo.data.exits) {
                log('debug', `isExitAccessible: No region info or exits for ${exitName}`);
                return false;
            }
            
            // Find the exit definition
            const exitDef = regionInfo.data.exits.find(exit => exit.name === exitName);
            log('debug', `isExitAccessible: Found exit def for ${exitName}: ${!!exitDef}`);
            if (!exitDef) {
                log('debug', `isExitAccessible: Available exits: ${regionInfo.data.exits.map(e => e.name).join(', ')}`);
                return false;
            }
            
            // Check if current region is reachable
            const currentRegion = regionInfo.name;
            const regionIsReachable = snapshot.regionReachability?.[currentRegion] === true ||
                                    snapshot.regionReachability?.[currentRegion] === 'reachable' ||
                                    snapshot.regionReachability?.[currentRegion] === 'checked' ||
                                    currentRegion === 'Menu'; // Menu is always reachable
            
            if (!regionIsReachable) {
                return false;
            }
            
            // Evaluate exit's access rule if it exists
            let exitAccessible = true;
            if (exitDef.access_rule) {
                log('debug', `Evaluating rule for ${exitName}:`, exitDef.access_rule);
                try {
                    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
                    exitAccessible = evaluateRule(exitDef.access_rule, snapshotInterface);
                    log('debug', `Rule evaluation result for ${exitName}: ${exitAccessible}`);
                } catch (e) {
                    log('error', `Error evaluating rule for ${exitName}:`, e);
                    log('error', `Error evaluating exit rule for ${exitName}:`, e);
                    exitAccessible = false;
                }
            } else {
                log('debug', `No access rule for ${exitName}, defaulting to accessible`);
            }
            
            // Check if connected region is reachable  
            const connectedRegionName = exitDef.connected_region;
            const connectedRegionReachable = snapshot.regionReachability?.[connectedRegionName] === true ||
                                           snapshot.regionReachability?.[connectedRegionName] === 'reachable' ||
                                           snapshot.regionReachability?.[connectedRegionName] === 'checked' ||
                                           connectedRegionName === 'Menu'; // Menu is always reachable
            
            // Exit is accessible if all conditions are met
            const result = exitAccessible && connectedRegionReachable;
            log('debug', `Final accessibility result for ${exitName}: ${result} (exitAccessible: ${exitAccessible}, connectedRegionReachable: ${connectedRegionReachable})`);
            return result;
            
        } catch (error) {
            log('error', `Error in isExitAccessible for ${exitName}:`, error);
            return false;
        }
    }

    /**
     * Get player inventory
     * @returns {Array} Array of item names
     */
    getPlayerInventory() {
        try {
            const snapshot = stateManager.getLatestStateSnapshot();
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
     * Handle look command - redisplays current region
     * @returns {string} Response message 
     */
    handleLookCommand() {
        this.displayCurrentRegion();
        return ''; // No additional response needed since displayCurrentRegion handles the message
    }

    /**
     * Generate region enter message
     * @param {string} regionName - Name of region
     * @returns {string} Generated message
     */
    generateRegionMessage(regionName) {
        let message;
        
        // Check for custom message first
        if (this.customData && this.customData.regions && this.customData.regions[regionName]) {
            const customRegion = this.customData.regions[regionName];
            if (customRegion.enterMessage) {
                message = this.processMessageTemplate(customRegion.enterMessage, { regionName });
            }
        }

        // Use generic message if no custom message found
        if (!message) {
            message = `You are now in ${regionName}.`;
        }
        
        // Always add available locations and exits, regardless of message type
        const availableLocations = this.getAvailableLocations();
        const availableExits = this.getAvailableExits();
        
        if (availableLocations.length > 0) {
            // Get current snapshot to check which locations are already checked
            const snapshot = stateManager.getLatestStateSnapshot();
            const checkedLocations = snapshot?.checkedLocations || [];
            
            // Separate unchecked and checked locations
            const uncheckedLocations = availableLocations.filter(loc => !checkedLocations.includes(loc));
            const checkedLocationsList = availableLocations.filter(loc => checkedLocations.includes(loc));
            
            // Add unchecked locations (as clickable links)
            if (uncheckedLocations.length > 0) {
                const locationLinks = uncheckedLocations.map(loc => this.createLocationLink(loc)).join(', ');
                message += `\n\nYou can search: ${locationLinks}`;
            }
            
            // Add checked locations (as plain text)
            if (checkedLocationsList.length > 0) {
                const checkedText = checkedLocationsList.join(', ');
                message += `\n\nAlready searched: ${checkedText}`;
            }
        }
        
        if (availableExits.length > 0) {
            const exitLinks = availableExits.map(exit => this.createExitLink(exit)).join(', ');
            message += `\n\nYou can travel to: ${exitLinks}`;
        }
        
        return message;
    }

    /**
     * Check if a location is currently unchecked
     * @param {string} locationName - Name of location to check
     * @returns {boolean} True if location is unchecked
     */
    isLocationUnchecked(locationName) {
        try {
            const snapshot = stateManager.getLatestStateSnapshot();
            return snapshot?.checkedLocations && !snapshot.checkedLocations.includes(locationName);
        } catch (error) {
            log('error', 'Error checking if location is unchecked:', error);
            return false;
        }
    }

    /**
     * Handle location check
     * @param {string} locationName - Name of location to check
     * @returns {Object} Result object with message and actions
     */
    handleLocationCheck(locationName) {
        if (!this.isLocationAccessible(locationName)) {
            // Prepare inaccessible message
            let inaccessibleMessage;
            if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
                const customLocation = this.customData.locations[locationName];
                if (customLocation.inaccessibleMessage) {
                    inaccessibleMessage = this.processMessageTemplate(customLocation.inaccessibleMessage, { locationName });
                }
            }
            if (!inaccessibleMessage) {
                inaccessibleMessage = `You cannot reach ${locationName} from here.`;
            }

            return {
                message: inaccessibleMessage,
                shouldRedisplayRegion: true,
                wasSuccessful: false
            };
        }

        // Check if already checked
        try {
            const snapshot = stateManager.getLatestStateSnapshot();
            if (snapshot.checkedLocations.includes(locationName)) {
                // Prepare already checked message
                let alreadyCheckedMessage;
                if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
                    const customLocation = this.customData.locations[locationName];
                    if (customLocation.alreadyCheckedMessage) {
                        alreadyCheckedMessage = this.processMessageTemplate(customLocation.alreadyCheckedMessage, { locationName });
                    }
                }
                if (!alreadyCheckedMessage) {
                    alreadyCheckedMessage = `You have already searched ${locationName}.`;
                }

                return {
                    message: alreadyCheckedMessage,
                    shouldRedisplayRegion: true,
                    wasSuccessful: false
                };
            }
        } catch (error) {
            log('error', 'Error checking if location already checked:', error);
        }

        // Check if this was previously unchecked (for item highlighting)
        const wasUnchecked = this.isLocationUnchecked(locationName);

        // Perform the check via dispatcher
        if (moduleDispatcher) {
            // Get current region from player state to include in location check
            const playerState = getPlayerStateSingleton();
            const currentRegion = playerState ? playerState.getCurrentRegion() : null;

            moduleDispatcher.publish('user:locationCheck', {
                locationName: locationName,
                regionName: currentRegion,
                sourceModule: 'textAdventure'
            }, 'bottom');
        }

        // Get the item that would be found (this is a simplification)
        const itemFound = this.getItemAtLocation(locationName);
        
        // Prepare the location check message with item highlighting if it's a new discovery
        let checkMessage;
        const templateVars = { locationName, item: itemFound, wasUnchecked };
        
        if (this.customData && this.customData.locations && this.customData.locations[locationName]) {
            const customLocation = this.customData.locations[locationName];
            if (customLocation.checkMessage) {
                checkMessage = this.processMessageTemplate(customLocation.checkMessage, templateVars);
            }
        }

        // Use generic message if no custom message
        if (!checkMessage) {
            if (wasUnchecked) {
                checkMessage = `You search ${locationName} and find: <span class="item-name">${itemFound}</span>!`;
            } else {
                checkMessage = `You search ${locationName} and find: ${itemFound}!`;
            }
        }

        return {
            message: checkMessage,
            shouldRedisplayRegion: true,
            wasSuccessful: true,
            wasNewDiscovery: wasUnchecked
        };
    }

    /**
     * Handle region move
     * @param {string} exitName - Name of exit to use
     * @returns {string} Result message
     */
    handleRegionMove(exitName) {
        log('debug', `handleRegionMove called with exitName: "${exitName}"`);
        const isAccessible = this.isExitAccessible(exitName);
        log('debug', `isExitAccessible returned: ${isAccessible}`);
        
        if (!isAccessible) {
            log('debug', `Exit ${exitName} not accessible, returning error message`);
            // Check for custom inaccessible message
            if (this.customData && this.customData.exits && this.customData.exits[exitName]) {
                const customExit = this.customData.exits[exitName];
                if (customExit.inaccessibleMessage) {
                    return this.processMessageTemplate(customExit.inaccessibleMessage, { exitName });
                }
            }
            return `The path to ${exitName} is blocked.`;
        }

        log('debug', `Exit ${exitName} is accessible, getting destination region`);
        // Get destination region
        const destinationRegion = this.getExitDestination(exitName);
        log('debug', `Destination region for ${exitName}: ${destinationRegion}`);
        if (!destinationRegion) {
            log('warn', `Could not determine destination region for ${exitName}`);
            return `Cannot determine where ${exitName} leads.`;
        }

        log('debug', `Publishing user:regionMove event for ${exitName} -> ${destinationRegion}`);
        // Perform the move via dispatcher
        if (moduleDispatcher) {
            moduleDispatcher.publish('user:regionMove', {
                exitName: exitName,
                targetRegion: destinationRegion,
                sourceRegion: this.getCurrentRegionInfo()?.name,
                sourceModule: 'textAdventure'
            }, 'bottom');
            log('debug', 'Successfully published user:regionMove event');
        } else {
            log('warn', 'No moduleDispatcher available, cannot publish regionMove event');
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
            
            // Special handling for item highlighting on new discoveries
            if (key === 'item' && variables.wasUnchecked) {
                const highlightedValue = `<span class="item-name">${value}</span>`;
                processed = processed.replace(new RegExp(placeholder, 'g'), highlightedValue);
            } else {
                processed = processed.replace(new RegExp(placeholder, 'g'), value);
            }
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

        // Only display if the region is different from the last one we displayed
        // This prevents duplicate messages when sync events fire
        if (data && data.newRegion && data.newRegion !== this.lastDisplayedRegion) {
            this.lastDisplayedRegion = data.newRegion;
            // Display new region immediately - this event fires when region change is complete
            this.displayCurrentRegion();
        } else {
            log('debug', 'Skipping region display - already displayed this region');
        }
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
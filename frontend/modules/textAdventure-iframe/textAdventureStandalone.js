// Standalone version of TextAdventure adapted for iframe communication
import { createStateSnapshotInterface, evaluateRule } from './mockDependencies.js';
import { IframeStateAdapter } from './stateAdapter.js';

// Helper function for logging
function log(level, message, ...data) {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventureStandalone] ${message}`, ...data);
}

export class TextAdventureStandalone {
    constructor(container, dependencies) {
        this.container = container;
        this.stateManager = dependencies.stateManager;
        this.eventBus = dependencies.eventBus;
        this.moduleDispatcher = dependencies.moduleDispatcher;
        this.playerState = dependencies.playerState;
        this.discoveryState = dependencies.discoveryState;
        this.iframeClient = dependencies.iframeClient;
        
        // NEW: Initialize async state adapter for unified architecture approach
        this.stateAdapter = new IframeStateAdapter(this.iframeClient);
        
        // UI elements
        this.rootElement = null;
        this.textArea = null;
        this.inputField = null;
        this.customDataSelect = null;
        
        // State
        this.customData = null;
        this.messageHistory = [];
        this.messageHistoryLimit = 10;
        this.discoveryMode = false;
        
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', 'TextAdventureStandalone initialized');
    }

    initialize() {
        this.createUI();
        this.setupEventListeners();
        this.displayWelcomeMessage();
        
        // Check if rules are already loaded when we initialize
        this.checkForExistingRules();
    }
    
    checkForExistingRules() {
        // Poll for state availability instead of using a fixed delay
        this.pollForExistingRules(0);
    }
    
    pollForExistingRules(attempt) {
        const maxAttempts = 20; // Maximum 20 attempts (2 seconds total with 100ms intervals)
        const pollInterval = 100; // 100ms between attempts
        
        if (attempt >= maxAttempts) {
            log('warn', 'Timed out waiting for state manager to become available');
            return;
        }
        
        if (this.stateManager && typeof this.stateManager.getLatestStateSnapshot === 'function') {
            const snapshot = this.stateManager.getLatestStateSnapshot();
            log('debug', `checkForExistingRules - attempt ${attempt + 1} - snapshot retrieved:`, snapshot);
            
            if (snapshot && snapshot.game) {
                log('debug', `Found existing rules on attempt ${attempt + 1}, triggering handleRulesLoaded`);
                this.handleRulesLoaded({ snapshot });
                return;
            } else if (attempt > 5) {
                // After several attempts, if we have a state manager but no game data, stop trying
                log('debug', `No existing rules found after ${attempt + 1} attempts - snapshot:`, snapshot);
                return;
            }
        } else {
            log('debug', `StateManager not yet available on attempt ${attempt + 1}, continuing to poll...`);
        }
        
        // Continue polling after a short delay
        setTimeout(() => {
            this.pollForExistingRules(attempt + 1);
        }, pollInterval);
    }

    createUI() {
        // Create the text adventure UI
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'text-adventure-panel-container';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Get references to UI elements
        this.textArea = this.rootElement.querySelector('.text-adventure-display');
        this.inputField = this.rootElement.querySelector('.text-adventure-input');
        this.customDataSelect = this.rootElement.querySelector('.custom-data-select');
        
        // Append to container
        if (this.container) {
            this.container.appendChild(this.rootElement);
        }
    }

    createPanelHTML() {
        return `
            <div class="text-adventure-panel">
                <div class="text-adventure-header">
                    <label for="custom-data-select">Custom Data File:</label>
                    <select class="custom-data-select" id="custom-data-select">
                        <option value="">Select custom data file...</option>
                        <option value="adventure">Adventure Custom Data</option>
                    </select>
                </div>
                
                <div class="text-adventure-display" tabindex="0">
                    <!-- Messages will be inserted here -->
                </div>
                
                <div class="text-adventure-input-container">
                    <input type="text" class="text-adventure-input" placeholder="Enter command..." />
                </div>
            </div>
        `;
    }

    setupEventListeners() {
        // Input field enter key handler
        if (this.inputField) {
            this.inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleCommand();
                }
            });
        }

        // Custom data file selection
        if (this.customDataSelect) {
            this.customDataSelect.addEventListener('change', (e) => {
                this.handleCustomDataSelection(e.target.value);
            });
        }

        // Click handlers for links (delegated)
        if (this.textArea) {
            this.textArea.addEventListener('click', (e) => {
                if (e.target.classList.contains('text-adventure-link')) {
                    this.handleLinkClick(e.target);
                }
            });
        }
    }

    setupEventSubscriptions() {
        // Subscribe to relevant events through iframe client
        this.eventBus.subscribe('stateManager:rulesLoaded', (data) => {
            this.handleRulesLoaded(data);
        }, 'textAdventureStandalone');

        this.eventBus.subscribe('stateManager:snapshotUpdated', (data) => {
            log('debug', 'Received stateManager:snapshotUpdated event in iframe:', data);
            this.handleStateChange(data);
        }, 'textAdventureStandalone');

        this.eventBus.subscribe('playerState:regionChanged', (data) => {
            this.handleRegionChange(data);
        }, 'textAdventureStandalone');
    }

    displayWelcomeMessage() {
        const welcomeMsg = `Welcome to the Text Adventure (Standalone)!

Type commands like:
• "move <exit>" or "go <exit>" to travel
• "check <location>" or "examine <location>" to search
• "inventory" to see your items
• "help" for more commands

Load a rules file in the main application to begin your adventure.`;
        
        this.displayMessage(welcomeMsg);
    }

    handleRulesLoaded(data) {
        log('info', 'Rules loaded in iframe');
        this.clearDisplay();
        this.displayMessage('Rules loaded! Your adventure begins');
        
        // Wait a moment then display current region
        setTimeout(() => {
            this.displayCurrentRegion();
        }, 100);
    }

    handleRegionChange(data) {
        log('info', 'Region changed:', data);
        this.displayCurrentRegion();
    }

    handleStateChange(data) {
        // Normal state change, redisplay current region to show updated location status
        log('debug', 'State changed, redisplaying current region to show updated status');
        // Don't automatically redisplay here to avoid multiple region messages
        // Let the one-time event listener in waitForStateUpdateThenDisplayRegion handle it
    }

    waitForStateUpdateThenDisplayRegion(locationName) {
        log('debug', `Waiting for state update after checking location ${locationName}`);
        
        // Flag to ensure we only display region once
        let hasDisplayed = false;
        
        // Use one-time event listener approach like original textAdventure module
        const onStateUpdate = (eventData) => {
            // Skip if we've already displayed the region
            if (hasDisplayed) {
                log('debug', `Already displayed region for ${locationName}, skipping duplicate event`);
                return;
            }
            
            log('debug', `Received state update event, checking for ${locationName}`, eventData);
            const snapshot = eventData.snapshot || eventData;
            
            if (snapshot && snapshot.checkedLocations && snapshot.checkedLocations.includes(locationName)) {
                log('debug', `Location ${locationName} found in state update, displaying region`);
                hasDisplayed = true; // Set flag before displaying
                this.displayCurrentRegion();
                // Clean up the listener after use (note: unsubscribe not fully implemented in iframe context)
                try {
                    this.eventBus.unsubscribe('stateManager:snapshotUpdated', onStateUpdate);
                } catch (error) {
                    log('debug', 'Unsubscribe not implemented in iframe eventBus, ignoring error');
                }
            } else {
                log('debug', `Location ${locationName} not yet in state update, keeping listener active`, {
                    hasSnapshot: !!snapshot,
                    hasCheckedLocations: !!(snapshot && snapshot.checkedLocations),
                    checkedLocations: snapshot?.checkedLocations || 'none'
                });
            }
        };
        
        // Subscribe to the next state update
        this.eventBus.subscribe('stateManager:snapshotUpdated', onStateUpdate, 'textAdventureStandalone-oneTime');
        
        // Request fresh state snapshot to trigger the update
        this.iframeClient.requestStateSnapshot();
        
        // Fallback timeout in case the state update doesn't include our location
        setTimeout(() => {
            if (!hasDisplayed) {
                log('warn', `Timeout waiting for ${locationName} to appear in state, displaying region anyway`);
                hasDisplayed = true;
                this.displayCurrentRegion();
            }
            // Clean up the listener
            try {
                this.eventBus.unsubscribe('stateManager:snapshotUpdated', onStateUpdate);
            } catch (error) {
                log('debug', 'Unsubscribe not implemented in iframe eventBus, ignoring error');
            }
        }, 2000);
    }

    handleCommand() {
        const input = this.inputField.value.trim();
        if (!input) return;

        log('debug', `Processing command: "${input}"`);

        // Display user input
        this.displayMessage(`> ${input}`, 'user-input');

        // Clear input field
        this.inputField.value = '';

        // Parse and execute command
        const command = this.parseCommand(input);
        this.executeCommand(command);
    }

    parseCommand(input) {
        const words = input.toLowerCase().trim().split(/\s+/);
        const verb = words[0];
        const target = words.slice(1).join(' ');

        // Get available locations and exits for context
        const availableLocations = this.getAvailableLocations();
        const availableExits = this.getAvailableExits();

        switch (verb) {
            case 'move':
            case 'go':
            case 'travel':
                if (!target) {
                    return { type: 'error', message: 'Move where? Specify an exit.' };
                }
                // Check if target is a valid exit
                const exitMatch = availableExits.find(exit => 
                    exit.toLowerCase().includes(target) || target.includes(exit.toLowerCase())
                );
                if (exitMatch) {
                    return { type: 'move', target: exitMatch };
                }
                return { type: 'error', message: `Unrecognized exit: ${target}` };

            case 'check':
            case 'examine':
            case 'search':
                if (!target) {
                    return { type: 'error', message: 'Check what? Specify a location.' };
                }
                // Check if target is a valid location
                const locationMatch = availableLocations.find(loc => 
                    loc.toLowerCase().includes(target) || target.includes(loc.toLowerCase())
                );
                if (locationMatch) {
                    return { type: 'check', target: locationMatch };
                }
                return { type: 'error', message: `Unrecognized location: ${target}` };

            case 'inventory':
            case 'inv':
                return { type: 'inventory' };

            case 'look':
            case 'l':
                return { type: 'look' };

            case 'help':
            case '?':
                return { type: 'help' };

            default:
                return { type: 'error', message: `Unrecognized command: ${verb}. Type "help" for available commands.` };
        }
    }

    executeCommand(command) {
        let response = '';

        switch (command.type) {
            case 'move':
                response = this.handleRegionMove(command.target);
                // For successful moves, display region immediately after
                if (response && !response.includes('blocked') && !response.includes('Cannot determine')) {
                    log('debug', `Successful move completed, displaying current region. Response: "${response}"`);
                    // Display region immediately after response message
                    setTimeout(() => {
                        this.displayCurrentRegion();
                    }, 10); // Very short delay to ensure response message is displayed first
                }
                break;
                
            case 'check':
                const checkResult = this.handleLocationCheck(command.target);
                if (checkResult && checkResult.message) {
                    this.displayMessage(checkResult.message);
                }
                // Wait for state update then redisplay region
                if (checkResult && checkResult.shouldRedisplayRegion) {
                    this.waitForStateUpdateThenDisplayRegion(command.target);
                }
                response = null; // Already handled
                break;
                
            case 'inventory':
                response = this.handleInventoryCommand();
                break;
                
            case 'look':
                this.displayCurrentRegion();
                response = null; // Already handled
                break;
                
            case 'help':
                response = this.getHelpText();
                break;
                
            case 'error':
                response = command.message;
                break;
                
            default:
                response = 'Unknown command type.';
        }

        if (response) {
            this.displayMessage(response);
        }
    }

    handleRegionMove(exitName) {
        log('debug', `Handling region move: ${exitName}`);
        
        if (!this.isExitAccessible(exitName)) {
            return `The path to ${exitName} is blocked.`;
        }

        // Get destination region
        const destinationRegion = this.getExitDestination(exitName);
        if (!destinationRegion) {
            return `Cannot determine where ${exitName} leads.`;
        }

        // Get current region before updating
        const sourceRegion = this.getCurrentRegionInfo()?.name;

        // Update iframe's player state to reflect the new region
        this.playerState.setCurrentRegion(destinationRegion);

        // Publish region move via dispatcher
        this.moduleDispatcher.publish('user:regionMove', {
            exitName: exitName,
            targetRegion: destinationRegion,
            sourceRegion: sourceRegion,
            sourceModule: 'textAdventureStandalone'
        }, 'bottom');

        return `You travel through ${exitName}.`;
    }

    handleLocationCheck(locationName) {
        if (!this.isLocationAccessible(locationName)) {
            return {
                message: `You cannot reach ${locationName} from here.`,
                shouldRedisplayRegion: true,
                wasSuccessful: false
            };
        }

        // Check if already checked
        const snapshot = this.stateManager.getLatestStateSnapshot();
        if (snapshot && snapshot.checkedLocations && snapshot.checkedLocations.includes(locationName)) {
            return {
                message: `You have already searched ${locationName}.`,
                shouldRedisplayRegion: true,
                wasSuccessful: false
            };
        }

        // Perform the check via dispatcher
        this.moduleDispatcher.publish('user:locationCheck', {
            locationName: locationName,
            sourceModule: 'textAdventureStandalone'
        }, 'bottom');

        // Get the item that would be found
        const itemFound = this.getItemAtLocation(locationName);
        
        return {
            message: `You search ${locationName} and find: ${itemFound}!`,
            shouldRedisplayRegion: true,
            wasSuccessful: true
        };
    }

    handleInventoryCommand() {
        const inventory = this.getPlayerInventory();
        
        if (inventory.length === 0) {
            return 'Your inventory is empty.';
        }
        
        return `Your inventory contains: ${inventory.join(', ')}`;
    }

    handleCustomDataSelection(value) {
        if (!value) return;

        log('info', 'Loading custom data:', value);

        // Create mock custom data for Adventure
        if (value === 'adventure') {
            const mockCustomData = {
                settings: {
                    enableDiscoveryMode: false,
                    messageHistoryLimit: 10
                },
                regions: {
                    "Menu": {
                        enterMessage: "You stand at the entrance to Adventure. The path forward awaits your command.",
                        description: "A simple starting point where your journey begins."
                    },
                    "Overworld": {
                        enterMessage: "You emerge into the vast overworld of Adventure, filled with mysteries and treasures to discover.",
                        description: "An expansive realm with many secrets hidden within its borders."
                    }
                },
                locations: {
                    "Blue Labyrinth 0": {
                        checkMessage: "You carefully search the Blue Labyrinth and discover: {item}!",
                        alreadyCheckedMessage: "You've already thoroughly explored this part of the Blue Labyrinth.",
                        inaccessibleMessage: "The entrance to the Blue Labyrinth is blocked by a mysterious force."
                    }
                },
                exits: {
                    "GameStart": {
                        moveMessage: "You take your first steps into the world of Adventure...",
                        inaccessibleMessage: "The way forward is somehow blocked by an unseen barrier."
                    }
                }
            };

            this.customData = mockCustomData;
            
            // Apply settings
            if (mockCustomData.settings) {
                if (typeof mockCustomData.settings.enableDiscoveryMode === 'boolean') {
                    this.discoveryMode = mockCustomData.settings.enableDiscoveryMode;
                }
                if (typeof mockCustomData.settings.messageHistoryLimit === 'number') {
                    this.messageHistoryLimit = mockCustomData.settings.messageHistoryLimit;
                }
            }

            this.displayMessage('Custom Adventure data loaded!', 'system');
            this.displayCurrentRegion();
        }
    }

    // Helper methods (simplified versions of the original textAdventure logic)

    getCurrentRegionInfo() {
        const currentRegion = this.playerState.getCurrentRegion();
        if (!currentRegion) return null;

        const staticData = this.stateManager.getStaticData();
        if (!staticData || !staticData.regions) return null;

        const regionData = staticData.regions[currentRegion];
        if (!regionData) return null;

        return {
            name: currentRegion,
            data: regionData
        };
    }

    getAvailableLocations() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo || !regionInfo.data.locations) {
            return [];
        }
        return regionInfo.data.locations.map(loc => loc.name);
    }

    getAvailableExits() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo || !regionInfo.data.exits) {
            return [];
        }
        return regionInfo.data.exits.map(exit => exit.name);
    }

    isLocationAccessible(locationName) {
        // Simplified accessibility check
        const snapshot = this.stateManager.getLatestStateSnapshot();
        const staticData = this.stateManager.getStaticData();
        
        if (!snapshot || !staticData || !staticData.locations) {
            return false;
        }
        
        const locationDef = staticData.locations[locationName];
        if (!locationDef) return false;
        
        // Check region reachability
        const regionName = locationDef.region;
        const regionIsReachable = 
            snapshot.regionReachability?.[regionName] === true ||
            snapshot.regionReachability?.[regionName] === 'reachable' ||
            snapshot.regionReachability?.[regionName] === 'checked';
        
        // Check access rule if present
        let locAccessible = true;
        if (locationDef.access_rule) {
            try {
                const snapshotInterface = createStateSnapshotInterface(snapshot, staticData, { location: locationDef });
                locAccessible = evaluateRule(locationDef.access_rule, snapshotInterface);
            } catch (e) {
                log('error', `Error evaluating location rule for ${locationName}:`, e);
                locAccessible = false;
            }
        }
        
        return regionIsReachable && locAccessible;
    }

    isExitAccessible(exitName) {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo || !regionInfo.data.exits) return false;
        
        const exitDef = regionInfo.data.exits.find(exit => exit.name === exitName);
        if (!exitDef) return false;
        
        const snapshot = this.stateManager.getLatestStateSnapshot();
        const staticData = this.stateManager.getStaticData();
        if (!snapshot || !staticData) return false;
        
        // Check exit rule if present
        let exitAccessible = true;
        if (exitDef.access_rule) {
            try {
                const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
                exitAccessible = evaluateRule(exitDef.access_rule, snapshotInterface);
            } catch (e) {
                log('error', `Error evaluating exit rule for ${exitName}:`, e);
                exitAccessible = false;
            }
        }
        
        return exitAccessible;
    }

    getPlayerInventory() {
        const snapshot = this.stateManager.getLatestStateSnapshot();
        if (snapshot && snapshot.inventory) {
            return Object.keys(snapshot.inventory).filter(item => snapshot.inventory[item] > 0);
        }
        return [];
    }

    getItemAtLocation(locationName) {
        const regionInfo = this.getCurrentRegionInfo();
        if (regionInfo && regionInfo.data.locations) {
            const location = regionInfo.data.locations.find(loc => loc.name === locationName);
            if (location && location.item) {
                return location.item.name || 'Unknown Item';
            }
        }
        return 'Something';
    }

    getExitDestination(exitName) {
        const regionInfo = this.getCurrentRegionInfo();
        if (regionInfo && regionInfo.data.exits) {
            const exit = regionInfo.data.exits.find(ex => ex.name === exitName);
            if (exit) {
                return exit.connected_region;
            }
        }
        return null;
    }

    displayCurrentRegion() {
        const regionInfo = this.getCurrentRegionInfo();
        if (!regionInfo) {
            this.addMessage('You are nowhere. Load a rules file in the main application.');
            return;
        }

        const message = this.generateRegionMessage(regionInfo.name);
        log('debug', `displayCurrentRegion - generated message for ${regionInfo.name}:`, message);
        this.addMessage(message);
    }

    generateRegionMessage(regionName) {
        let message;
        
        // Check for custom message first
        if (this.customData && this.customData.regions && this.customData.regions[regionName]) {
            const customRegion = this.customData.regions[regionName];
            if (customRegion.enterMessage) {
                message = customRegion.enterMessage;
            }
        }

        // Use generic message if no custom message found
        if (!message) {
            message = `You are now in ${regionName}.`;
        }
        
        // Add available locations and exits
        const availableLocations = this.getAvailableLocations();
        const availableExits = this.getAvailableExits();
        
        if (availableLocations.length > 0) {
            const snapshot = this.stateManager.getLatestStateSnapshot();
            const checkedLocations = snapshot?.checkedLocations || [];
            
            log('debug', `generateRegionMessage - iframe snapshot checkedLocations:`, checkedLocations);
            
            const uncheckedLocations = availableLocations.filter(loc => !checkedLocations.includes(loc));
            const checkedLocationsList = availableLocations.filter(loc => checkedLocations.includes(loc));
            
            log('debug', `generateRegionMessage - unchecked: ${uncheckedLocations.length}, checked: ${checkedLocationsList.length}`);
            
            if (uncheckedLocations.length > 0) {
                const locationLinks = uncheckedLocations.map(loc => this.createLocationLink(loc)).join(', ');
                message += `\n\nYou can search: ${locationLinks}`;
            }
            
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

    createLocationLink(locationName) {
        const accessible = this.isLocationAccessible(locationName);
        const cssClass = accessible ? 'text-adventure-link accessible' : 'text-adventure-link inaccessible';
        return `<span class="${cssClass}" data-type="location" data-target="${locationName}">${locationName}</span>`;
    }

    createExitLink(exitName) {
        const accessible = this.isExitAccessible(exitName);
        const cssClass = accessible ? 'text-adventure-link accessible' : 'text-adventure-link inaccessible';
        return `<span class="${cssClass}" data-type="exit" data-target="${exitName}">${exitName}</span>`;
    }

    handleLinkClick(linkElement) {
        const type = linkElement.getAttribute('data-type');
        const target = linkElement.getAttribute('data-target');
        
        if (!type || !target) return;

        log('debug', 'Link clicked:', { type, target });

        // Display what was clicked
        const actionText = type === 'location' ? 'check' : 'move';
        this.displayMessage(`> ${actionText} ${target}`, 'user-input');

        // Create and execute command
        const command = type === 'location' 
            ? { type: 'check', target: target }
            : { type: 'move', target: target };
        
        this.executeCommand(command);
    }

    getHelpText() {
        return `Available commands:

Movement:
• move <exit> - Travel through an exit
• go <exit> - Same as move

Investigation:
• check <location> - Search a location for items
• examine <location> - Same as check
• look - Redisplay current area

Inventory:
• inventory - Show your current items

Other:
• help - Show this help text

You can also click on location and exit names in the text to interact with them.`;
    }

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

        // Display message
        this.displayMessage(message);
    }

    displayMessage(message, messageType = 'normal') {
        if (!message || !this.textArea) return;

        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `text-adventure-message ${messageType}`;
        messageElement.innerHTML = message;

        // Add to display
        this.textArea.appendChild(messageElement);

        // Add blank line separator (except for first message)
        if (this.textArea.children.length > 1) {
            const separator = document.createElement('div');
            separator.className = 'text-adventure-separator';
            separator.innerHTML = '&nbsp;';
            this.textArea.appendChild(separator);
        }

        // Scroll to bottom
        this.textArea.scrollTop = this.textArea.scrollHeight;

        log('debug', 'Message displayed:', { message, type: messageType });
    }

    clearDisplay() {
        if (this.textArea) {
            this.textArea.innerHTML = '';
        }
    }

    dispose() {
        log('info', 'TextAdventureStandalone disposing...');
        
        // Clean up UI
        if (this.rootElement) {
            this.rootElement.remove();
        }
        
        // Clear references
        this.textArea = null;
        this.inputField = null;
        this.customDataSelect = null;
    }
}
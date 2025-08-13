// Window-adapted version of TextAdventure similar to the iframe standalone
import { WindowStateAdapter } from './stateAdapter.js';
import { createSharedLogger } from '../window-base/shared/sharedLogger.js';

// Create logger for this module
const logger = createSharedLogger('textAdventureStandalone');

export class WindowTextAdventureStandalone {
    constructor(container, dependencies) {
        this.container = container;
        this.stateManager = dependencies.stateManager;
        this.eventBus = dependencies.eventBus;
        this.moduleDispatcher = dependencies.moduleDispatcher;
        this.playerState = dependencies.playerState;
        this.discoveryState = dependencies.discoveryState;
        this.windowClient = dependencies.windowClient;
        
        // Initialize async state adapter for unified architecture approach
        this.stateAdapter = new WindowStateAdapter(this.windowClient);
        
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
        
        logger.info('WindowTextAdventureStandalone initialized');
    }

    initialize() {
        this.createUI();
        this.setupEventListeners();
        this.displayWelcomeMessage();
        this.checkForExistingRules();
    }
    
    checkForExistingRules() {
        this.pollForExistingRules(0);
    }
    
    pollForExistingRules(attempt) {
        const maxAttempts = 20;
        const pollInterval = 100;
        
        if (attempt >= maxAttempts) {
            logger.warn('Timed out waiting for state manager to become available');
            return;
        }
        
        if (this.stateManager && typeof this.stateManager.getLatestStateSnapshot === 'function') {
            const snapshot = this.stateManager.getLatestStateSnapshot();
            logger.debug(`checkForExistingRules - attempt ${attempt + 1} - snapshot retrieved:`, snapshot);
            
            if (snapshot && snapshot.game) {
                logger.debug(`Found existing rules on attempt ${attempt + 1}, triggering handleRulesLoaded`);
                this.handleRulesLoaded({ snapshot });
                return;
            } else if (attempt > 5) {
                logger.debug(`No existing rules found after ${attempt + 1} attempts - snapshot:`, snapshot);
                return;
            }
        } else {
            logger.debug(`StateManager not yet available on attempt ${attempt + 1}, continuing to poll...`);
        }
        
        setTimeout(() => {
            this.pollForExistingRules(attempt + 1);
        }, pollInterval);
    }

    createUI() {
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'text-adventure-panel-container';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        this.textArea = this.rootElement.querySelector('.text-adventure-display');
        this.inputField = this.rootElement.querySelector('.text-adventure-input');
        this.customDataSelect = this.rootElement.querySelector('.custom-data-select');
        
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
        if (this.inputField) {
            this.inputField.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleCommand();
                }
            });
        }

        if (this.customDataSelect) {
            this.customDataSelect.addEventListener('change', (e) => {
                this.handleCustomDataSelection(e.target.value);
            });
        }

        if (this.textArea) {
            this.textArea.addEventListener('click', (e) => {
                if (e.target.classList.contains('text-adventure-link')) {
                    this.handleLinkClick(e.target);
                }
            });
        }
    }

    setupEventSubscriptions() {
        this.eventBus.subscribe('stateManager:rulesLoaded', (data) => {
            this.handleRulesLoaded(data);
        }, 'textAdventureStandalone');

        this.eventBus.subscribe('stateManager:snapshotUpdated', (data) => {
            logger.debug('Received stateManager:snapshotUpdated event in window:', data);
            this.handleStateChange(data);
        }, 'textAdventureStandalone');

        this.eventBus.subscribe('playerState:regionChanged', (data) => {
            this.handleRegionChange(data);
        }, 'textAdventureStandalone');
    }

    displayWelcomeMessage() {
        const welcomeMsg = `Welcome to the Text Adventure (Window)!

Type commands like:
• "move <exit>" or "go <exit>" to travel
• "check <location>" or "examine <location>" to search
• "inventory" to see your items
• "help" for more commands

Load a rules file in the main application to begin your adventure.`;
        
        this.displayMessage(welcomeMsg);
    }

    handleRulesLoaded(data) {
        logger.info('Rules loaded in window');
        this.clearDisplay();
        this.displayMessage('Rules loaded! Your adventure begins');
        
        setTimeout(() => {
            this.displayCurrentRegion();
        }, 100);
    }

    handleRegionChange(data) {
        logger.info('Region changed:', data);
        this.displayCurrentRegion();
    }

    handleStateChange(data) {
        // For now, avoid automatic redisplay to prevent duplicates
    }

    waitForStateUpdateThenDisplayRegion(locationName) {
        logger.debug(`Waiting for state update after checking location ${locationName}`);
        let hasDisplayed = false;
        const onStateUpdate = (eventData) => {
            if (hasDisplayed) {
                return;
            }
            const snapshot = eventData.snapshot || eventData;
            if (snapshot && snapshot.checkedLocations && snapshot.checkedLocations.includes(locationName)) {
                hasDisplayed = true;
                this.displayCurrentRegion();
                try {
                    this.eventBus.unsubscribe('stateManager:snapshotUpdated', onStateUpdate);
                } catch (error) {
                    logger.debug('Unsubscribe not implemented in window eventBus, ignoring error');
                }
            }
        };
        this.eventBus.subscribe('stateManager:snapshotUpdated', onStateUpdate, 'textAdventureStandalone-oneTime');
        this.windowClient.requestStateSnapshot();
        setTimeout(() => {
            if (!hasDisplayed) {
                logger.warn(`Timeout waiting for ${locationName} to appear in state, displaying region anyway`);
                hasDisplayed = true;
                this.displayCurrentRegion();
            }
            try {
                this.eventBus.unsubscribe('stateManager:snapshotUpdated', onStateUpdate);
            } catch (error) {
                logger.debug('Unsubscribe not implemented in window eventBus, ignoring error');
            }
        }, 1000);
    }

    handleCustomDataSelection(value) {
        if (!value) return;
        // Demo custom data for parity
        const customData = {
            settings: { enableDiscoveryMode: true, messageHistoryLimit: 20 }
        };
        this.loadCustomData(customData);
    }

    handleLinkClick(linkElement) {
        const target = linkElement.getAttribute('data-target');
        const type = linkElement.getAttribute('data-type');
        if (!target || !type) return;
        if (type === 'exit') {
            this.executeCommand({ type: 'move', target });
        } else if (type === 'location') {
            this.executeCommand({ type: 'check', target });
        }
    }

    displayMessage(message, cssClass = null) {
        if (!this.textArea) return;
        const messageElement = document.createElement('div');
        messageElement.className = `text-adventure-message${cssClass ? ' ' + cssClass : ''}`;
        messageElement.textContent = message;
        this.textArea.appendChild(messageElement);
        this.textArea.scrollTop = this.textArea.scrollHeight;
    }

    clearDisplay() {
        if (!this.textArea) return;
        this.textArea.innerHTML = '';
    }

    updateDisplay() {
        // Placeholder for any dynamic UI updates when data changes
    }

    handleCommand() {
        const input = this.inputField.value.trim();
        if (!input) return;
        this.displayMessage(`> ${input}`, 'user-input');
        this.inputField.value = '';
        const availableLocations = this.getAvailableLocations();
        const availableExits = this.getAvailableExits();
        const command = this.parseCommand(input, availableLocations, availableExits);
        this.executeCommand(command);
    }

    // Simplified parser inline to avoid cross-file imports; keep similar behavior
    parseCommand(input, availableLocations, availableExits) {
        const normalized = input.toLowerCase();
        if (normalized.startsWith('move ') || normalized.startsWith('go ')) {
            const target = input.split(' ').slice(1).join(' ').trim();
            return { type: 'move', target };
        }
        if (normalized.startsWith('check ') || normalized.startsWith('examine ')) {
            const target = input.split(' ').slice(1).join(' ').trim();
            return { type: 'check', target };
        }
        if (normalized === 'inventory') return { type: 'inventory' };
        if (normalized === 'look') return { type: 'look' };
        if (normalized === 'help') return { type: 'help' };
        return { type: 'error', message: 'Unknown command. Try "help".' };
    }

    executeCommand(command) {
        let response = '';
        switch (command.type) {
            case 'move': {
                response = this.handleRegionMove(command.target);
                if (response && !response.includes('blocked') && !response.includes('Cannot determine')) {
                    setTimeout(() => this.displayCurrentRegion(), 100);
                }
                break;
            }
            case 'check': {
                const checkResult = this.handleLocationCheck(command.target);
                const checkMessage = checkResult.message || checkResult;
                if (checkMessage) this.displayMessage(checkMessage);
                if (checkResult.shouldRedisplayRegion && checkResult.wasSuccessful) {
                    this.waitForStateUpdateThenDisplayRegion(command.target);
                } else if (checkResult.shouldRedisplayRegion) {
                    this.displayCurrentRegion();
                }
                response = null;
                break;
            }
            case 'inventory': {
                response = this.handleInventoryCommand();
                break;
            }
            case 'look': {
                response = this.handleLookCommand();
                break;
            }
            case 'help': {
                response = this.getHelpText();
                break;
            }
            case 'error': {
                response = command.message;
                break;
            }
        }
        if (response) this.displayMessage(response);
    }

    getHelpText() {
        return `Available commands:\n\n- move <exit> / go <exit>\n- check <location> / examine <location>\n- inventory\n- look\n- help`;
    }

    // Logic methods adapted from original textAdventureLogic via proxies
    handleRegionMove(targetExit) {
        try {
            const playerState = this.playerState;
            const currentRegion = playerState.getCurrentRegion();
            const staticData = this.stateManager.getStaticData();
            if (!staticData || !staticData.regions) {
                return 'Cannot determine current region.';
            }
            const regionData = staticData.regions[currentRegion];
            if (!regionData || !regionData.exits || !regionData.exits[targetExit]) {
                return `No exit named "${targetExit}" from ${currentRegion}.`;
            }
            const destination = regionData.exits[targetExit];
            this.moduleDispatcher.publish('user:regionMove', {
                exitName: targetExit,
                targetRegion: destination,
                sourceRegion: currentRegion,
                sourceModule: 'textAdventure-window'
            }, 'bottom');
            return `Moving through ${targetExit} to ${destination}...`;
        } catch (error) {
            logger.error('Error in handleRegionMove:', error);
            return 'An error occurred while moving.';
        }
    }

    handleLocationCheck(locationName) {
        try {
            const staticData = this.stateManager.getStaticData();
            const snapshot = this.stateManager.getLatestStateSnapshot();
            if (!staticData || !staticData.locations || !staticData.locations[locationName]) {
                return { message: `Unknown location: ${locationName}`, shouldRedisplayRegion: false, wasSuccessful: false };
            }
            const alreadyChecked = snapshot && snapshot.checkedLocations && snapshot.checkedLocations.includes(locationName);
            if (alreadyChecked) {
                return { message: `${locationName} already checked.`, shouldRedisplayRegion: true, wasSuccessful: false };
            }
            // Publish location check via dispatcher
            this.moduleDispatcher.publish('user:locationCheck', {
                locationName,
                sourceModule: 'textAdventure-window'
            }, 'bottom');
            return { message: `Checking ${locationName}...`, shouldRedisplayRegion: true, wasSuccessful: true };
        } catch (error) {
            logger.error('Error in handleLocationCheck:', error);
            return { message: 'An error occurred while checking the location.', shouldRedisplayRegion: false, wasSuccessful: false };
        }
    }

    handleInventoryCommand() {
        try {
            const snapshot = this.stateManager.getLatestStateSnapshot();
            if (!snapshot || !snapshot.inventory) {
                return 'Inventory is empty or unavailable.';
            }
            const items = Object.entries(snapshot.inventory).filter(([_, count]) => count > 0);
            if (items.length === 0) return 'Inventory is empty.';
            const lines = items.map(([item, count]) => `- ${item}: ${count}`);
            return `Inventory:\n${lines.join('\n')}`;
        } catch (error) {
            logger.error('Error in handleInventoryCommand:', error);
            return 'An error occurred while retrieving inventory.';
        }
    }

    handleLookCommand() {
        return this.displayCurrentRegion(true);
    }

    getAvailableLocations() {
        const staticData = this.stateManager.getStaticData();
        const snapshot = this.stateManager.getLatestStateSnapshot();
        const playerRegion = this.playerState.getCurrentRegion();
        if (!staticData || !snapshot) return [];
        const regionData = staticData.regions[playerRegion];
        if (!regionData || !regionData.locations) return [];
        return Object.keys(regionData.locations);
    }

    getAvailableExits() {
        const staticData = this.stateManager.getStaticData();
        const playerRegion = this.playerState.getCurrentRegion();
        if (!staticData) return [];
        const regionData = staticData.regions[playerRegion];
        if (!regionData || !regionData.exits) return [];
        return Object.keys(regionData.exits);
    }

    displayCurrentRegion(returnOnly = false) {
        try {
            const staticData = this.stateManager.getStaticData();
            const playerRegion = this.playerState.getCurrentRegion();
            if (!staticData || !staticData.regions || !staticData.regions[playerRegion]) {
                if (!returnOnly) this.displayMessage('Current region information is unavailable.', 'system');
                return 'Current region information is unavailable.';
            }
            const regionData = staticData.regions[playerRegion];
            let message = `You are in ${playerRegion}.`;
            if (regionData.description) {
                message += `\n${regionData.description}`;
            }
            const exits = Object.keys(regionData.exits || {});
            if (exits.length > 0) {
                message += `\n\nExits:`;
                for (const exitName of exits) {
                    message += `\n- ${exitName}`;
                }
            }
            const locations = Object.keys(regionData.locations || {});
            if (locations.length > 0) {
                message += `\n\nLocations:`;
                for (const locationName of locations) {
                    message += `\n- ${locationName}`;
                }
            }
            if (!returnOnly) this.displayMessage(message, 'system');
            return message;
        } catch (error) {
            logger.error('Error in displayCurrentRegion:', error);
            if (!returnOnly) this.displayMessage('An error occurred while displaying the region.', 'error');
            return 'An error occurred while displaying the region.';
        }
    }

    loadCustomData(customData) {
        try {
            this.customData = customData;
            if (customData.settings) {
                if (typeof customData.settings.enableDiscoveryMode === 'boolean') {
                    this.discoveryMode = customData.settings.enableDiscoveryMode;
                }
                if (typeof customData.settings.messageHistoryLimit === 'number') {
                    this.messageHistoryLimit = customData.settings.messageHistoryLimit;
                }
            }
            logger.info('Custom data loaded:', { discoveryMode: this.discoveryMode, messageHistoryLimit: this.messageHistoryLimit });
            this.displayCurrentRegion();
            if (this.eventBus) {
                this.eventBus.publish('textAdventure:customDataLoaded', { customData }, 'textAdventure');
            }
            return true;
        } catch (error) {
            logger.error('Error loading custom data:', error);
            return false;
        }
    }
}
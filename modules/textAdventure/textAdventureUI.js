// UI component for text adventure module
import { TextAdventureParser } from './textAdventureParser.js';
import { TextAdventureLogic } from './textAdventureLogic.js';
import { moduleDispatcher } from './index.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('textAdventureUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[textAdventureUI] ${message}`, ...data);
  }
}

export class TextAdventureUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        
        // Initialize components
        this.parser = new TextAdventureParser();
        this.logic = new TextAdventureLogic(eventBus, moduleDispatcher);
        
        // UI elements
        this.rootElement = null;
        this.textArea = null;
        this.inputField = null;
        this.customDataSelect = null;
        
        // Event subscriptions
        this.unsubscribeHandles = [];
        
        this.initialize();
        this.setupEventSubscriptions();
        
        log('info', 'TextAdventureUI initialized');
    }

    // Required method for Golden Layout
    getRootElement() {
        if (!this.rootElement) {
            this.createRootElement();
        }
        return this.rootElement;
    }

    initialize() {
        // Create the root element
        this.createRootElement();
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Initialize with welcome message
        this.displayWelcomeMessage();
    }

    createRootElement() {
        // Create root element
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'text-adventure-panel-container';
        this.rootElement.style.height = '100%';
        this.rootElement.style.overflow = 'hidden';
        this.rootElement.innerHTML = this.createPanelHTML();
        
        // Get references to UI elements
        this.textArea = this.rootElement.querySelector('.text-adventure-display');
        this.inputField = this.rootElement.querySelector('.text-adventure-input');
        this.customDataSelect = this.rootElement.querySelector('.custom-data-select');
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
        if (eventBus) {
            // Subscribe to message events
            const messageUnsubscribe = eventBus.subscribe('textAdventure:messageAdded', (data) => {
                this.displayMessage(data.message);
            }, 'textAdventureUI');
            this.unsubscribeHandles.push(messageUnsubscribe);

            // Subscribe to custom data loaded event
            const customDataUnsubscribe = eventBus.subscribe('textAdventure:customDataLoaded', () => {
                this.updateDisplay();
            }, 'textAdventureUI');
            this.unsubscribeHandles.push(customDataUnsubscribe);

            // Subscribe to history cleared event
            const historyClearedUnsubscribe = eventBus.subscribe('textAdventure:historyCleared', () => {
                this.clearDisplay();
            }, 'textAdventureUI');
            this.unsubscribeHandles.push(historyClearedUnsubscribe);

            // Subscribe to rules loaded event directly from StateManager
            const rulesUnsubscribe = eventBus.subscribe('stateManager:rulesLoaded', () => {
                this.handleRulesLoaded();
            }, 'textAdventureUI');
            this.unsubscribeHandles.push(rulesUnsubscribe);
        }
    }

    displayWelcomeMessage() {
        const welcomeMsg = `Welcome to the Text Adventure!

Type commands like:
• "move <exit>" or "go <exit>" to travel
• "check <location>" or "examine <location>" to search
• "inventory" to see your items
• "help" for more commands

Load a rules file to begin your adventure.`;
        
        this.displayMessage(welcomeMsg);
    }

    handleRulesLoaded() {
        log('info', 'Rules loaded, displaying current region');
        // Clear previous messages except welcome
        this.clearDisplay();
        this.displayMessage('Rules loaded! Your adventure begins...');
        
        // Give the logic layer a chance to initialize, then display region
        // Use requestAnimationFrame for proper sequencing without arbitrary timeout
        requestAnimationFrame(() => {
            this.logic.displayCurrentRegion();
        });
    }

    handleCommand() {
        const input = this.inputField.value.trim();
        if (!input) return;

        log('debug', `handleCommand called with input: "${input}"`);

        // Display user input
        this.displayMessage(`> ${input}`, 'user-input');

        // Clear input field
        this.inputField.value = '';

        // Parse command
        const availableLocations = this.logic.getAvailableLocations();
        const availableExits = this.logic.getAvailableExits();
        log('debug', `Available locations: ${availableLocations.join(', ')}`);
        log('debug', `Available exits: ${availableExits.join(', ')}`);
        
        const command = this.parser.parseCommand(input, availableLocations, availableExits);

        log('debug', 'Parsed command:', command);
        log('debug', 'Parsed command:', command);

        // Handle command
        this.executeCommand(command);
    }

    executeCommand(command) {
        let response = '';

        switch (command.type) {
            case 'move':
                log('debug', `Processing move command: ${command.target}`);
                response = this.logic.handleRegionMove(command.target);
                log('debug', `Move command response: ${response}`);
                
                // For successful move commands, wait briefly for region change to complete
                // then display updated region info
                if (response && !response.includes('blocked') && !response.includes('Cannot determine')) {
                    setTimeout(() => {
                        this.logic.displayCurrentRegion();
                    }, 100);
                }
                break;
                
            case 'check':
                const checkResult = this.logic.handleLocationCheck(command.target);
                const checkMessage = checkResult.message || checkResult; // Handle both old string format and new object format
                
                // Display the check message immediately
                if (checkMessage) {
                    this.displayMessage(checkMessage);
                }
                
                // If we should redisplay region info, wait for state update first
                if (checkResult.shouldRedisplayRegion && checkResult.wasSuccessful) {
                    // For successful checks, wait for state update before redisplaying region
                    this.waitForStateUpdateThenDisplayRegion();
                } else if (checkResult.shouldRedisplayRegion) {
                    // For unsuccessful checks (already checked, inaccessible), display immediately
                    this.logic.displayCurrentRegion();
                }
                
                // Set response to null so it doesn't get displayed again
                response = null;
                break;
                
            case 'inventory':
                response = this.logic.handleInventoryCommand();
                break;
                
            case 'look':
                response = this.logic.handleLookCommand();
                break;
                
            case 'help':
                response = this.parser.getHelpText();
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

    handleLinkClick(linkElement) {
        const type = linkElement.getAttribute('data-type');
        const target = linkElement.getAttribute('data-target');
        
        if (!type || !target) return;

        log('debug', 'Link clicked:', { type, target });

        // Create command object and execute
        let command;
        if (type === 'location') {
            command = { type: 'check', target: target };
        } else if (type === 'exit') {
            command = { type: 'move', target: target };
        } else {
            return;
        }

        // Display what was clicked
        const actionText = type === 'location' ? 'check' : 'move';
        this.displayMessage(`> ${actionText} ${target}`, 'user-input');

        // Execute command
        this.executeCommand(command);
    }

    handleCustomDataSelection(value) {
        if (!value) return;

        log('info', 'Loading custom data:', value);

        // For now, create a mock custom data file
        // In the future, this would load from actual files
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
                        inaccessibleMessage: "The entrance to the Blue Labyrinth is blocked by an mysterious force."
                    }
                },
                exits: {
                    "GameStart": {
                        moveMessage: "You take your first steps into the world of Adventure...",
                        inaccessibleMessage: "The way forward is somehow blocked by an unseen barrier."
                    }
                }
            };

            // Clear existing messages first
            this.logic.clearMessageHistory();
            
            // Add confirmation message first
            this.displayMessage('Custom Adventure data loaded!', 'system');
            
            // Then load custom data and display the entrance message
            const success = this.logic.loadCustomData(mockCustomData);
            if (!success) {
                this.displayMessage('Failed to load custom data.', 'error');
            }
        }
    }

    displayMessage(message, messageType = 'normal') {
        if (!message || !this.textArea) return;

        // Debug logging
        if (messageType === 'user-input') {
            log('debug', `User input being displayed: "${message}"`);
        }
        if (message.includes('travel through') || message.includes('Overworld') || message.includes('GameStart')) {
            log('debug', `Movement-related message being displayed: "${message}"`);
        }

        // Create message element
        const messageElement = document.createElement('div');
        messageElement.className = `text-adventure-message ${messageType}`;
        
        // Process message for links
        const processedMessage = this.processMessageForLinks(message);
        messageElement.innerHTML = processedMessage;

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

    processMessageForLinks(message) {
        // The logic class already handles link creation, but we might need to 
        // add additional processing here for special cases or formatting
        return message;
    }

    /**
     * Wait for the next state update, then display current region
     */
    waitForStateUpdateThenDisplayRegion() {
        // Set up a one-time listener for the next state update
        const onStateUpdate = () => {
            this.logic.displayCurrentRegion();
            // Clean up the listener after use
            eventBus.unsubscribe('stateManager:snapshotUpdated', onStateUpdate);
        };
        
        eventBus.subscribe('stateManager:snapshotUpdated', onStateUpdate, 'textAdventureUI-oneTime');
    }

    updateDisplay() {
        // Refresh the current view if needed
        // This could be called when custom data is loaded or state changes
        log('debug', 'Display updated');
    }

    clearDisplay() {
        if (this.textArea) {
            this.textArea.innerHTML = '';
        }
    }

    // Golden Layout lifecycle methods
    show() {
        // Golden Layout handles visibility, but we can perform any show-specific logic here
        if (this.inputField) {
            this.inputField.focus();
        }
    }

    hide() {
        // Golden Layout handles visibility, but we can perform any hide-specific logic here
    }

    focus() {
        if (this.inputField) {
            this.inputField.focus();
        }
    }

    // Cleanup
    dispose() {
        log('info', 'TextAdventureUI disposing...');
        
        // Unsubscribe from events
        this.unsubscribeHandles.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.unsubscribeHandles = [];

        // Dispose logic
        if (this.logic) {
            this.logic.dispose();
        }

        // Clear references
        this.textArea = null;
        this.inputField = null;
        this.customDataSelect = null;
        this.parser = null;
        this.logic = null;
    }
}
// MainContentUI - Central panel containing console and connection status

import ConsoleUI from './consoleUI.js';
import eventBus from '../../../app/core/eventBus.js';
import connection from '../core/connection.js';
import { stateManager } from '../../stateManager/index.js';

class MainContentUI {
  constructor() {
    console.log('[MainContentUI] Constructor called');
    this.rootElement = null;
    this.consoleElement = null;
    this.consoleInputElement = null;
    this.consoleHistoryElement = null;
    this.statusIndicator = null;
    this.connectButton = null;
    this.progressBar = null;
    this.checksSentElement = null;
    this.controlButton = null;
    this.quickCheckButton = null;

    // Subscribe to connection events
    eventBus.subscribe('connection:open', () => {
      this.updateConnectionStatus(true);
    });

    eventBus.subscribe('connection:close', () => {
      this.updateConnectionStatus(false);
    });

    eventBus.subscribe('connection:error', () => {
      this.updateConnectionStatus(false);
    });

    eventBus.subscribe('connection:reconnecting', () => {
      this.updateConnectionStatus('connecting');
    });
  }

  getRootElement() {
    console.log('[MainContentUI] Getting root element');
    if (!this.rootElement) {
      console.log('[MainContentUI] Creating new root element');
      this.rootElement = document.createElement('div');
      this.rootElement.className = 'main-content-panel';
      this.rootElement.style.width = '100%';
      this.rootElement.style.height = '100%';
      this.rootElement.style.display = 'flex';
      this.rootElement.style.flexDirection = 'column';
      this.rootElement.style.backgroundColor = '#2d2d2d';
      this.rootElement.style.color = '#cecece';
      this.rootElement.style.padding = '10px';
      this.rootElement.style.boxSizing = 'border-box';

      // Create structure based on the original HTML structure
      this.rootElement.innerHTML = `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #666; padding-bottom: 5px;">
          <h3 style="margin: 0 0 10px 0;">Console & Status</h3>
          
          <!-- Status Bar - Replicating the original structure but with modern styling -->
          <div id="status-bar" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 10px;">
            <div style="display: flex; align-items: center; gap: 5px;">
              AP Server: <span id="server-status" class="status-indicator" style="color: yellow; font-weight: bold;">Not Connected</span>
            </div>
            <div style="display: flex; align-items: center; gap: 5px; margin-left: auto;">
              <label for="server-address">Server Address:</label>
              <input id="server-address" value="ws://localhost:38281" style="background-color: #333; color: #eee; border: 1px solid #555; padding: 4px;" />
              <button class="connect-button" style="padding: 4px 10px;">Connect</button>
            </div>
          </div>
          
          <!-- Progress Container - Replicating the original structure -->
          <div id="progress-container" style="margin-bottom: 10px; padding: 8px; background-color: #333; border-radius: 4px;">
            <h3 id="progress-container-header" style="margin: 0 0 5px 0; font-size: 1em;">Location Check Progress</h3>
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 5px;">
              <progress id="progress-bar" value="0" max="30000" style="flex-grow: 1; height: 15px;"></progress>
              <span id="checks-sent" style="min-width: 80px; text-align: right;">Checked: 0</span>
            </div>
            <div class="button-container" style="display: flex; gap: 10px;">
              <button id="control-button" disabled="disabled" style="padding: 4px 10px;">Begin!</button>
              <button id="quick-check-button" disabled="disabled" style="padding: 4px 10px;">Quick Check</button>
            </div>
          </div>
        </div>
        
        <!-- Console Area - Main output area -->
        <div id="main-console" class="main-console" style="flex-grow: 1; overflow-y: auto; background-color: #222; border: 1px solid #444; padding: 10px;">
          <div id="console-output" class="console-output console-messages">
            <div class="console-message">Welcome to the console!</div>
            <div class="console-message">Type "help" for a list of available commands.</div>
          </div>
        </div>
        
        <!-- Command Input Area -->
        <div id="command-wrapper" style="margin-top: 10px; display: flex;">
          <label for="main-console-input" style="display: none;"></label>
          <input id="main-console-input" type="text" placeholder="Enter command..." style="flex-grow: 1; padding: 5px; background-color: #333; color: #eee; border: 1px solid #555;" />
          <button class="send-button" style="margin-left: 5px; padding: 5px 10px;">Send</button>
        </div>
      `;

      console.log('[MainContentUI] Added content to root element');
    }
    return this.rootElement;
  }

  initializeElements(containerElement) {
    console.log(
      '[MainContentUI] Initializing elements in container:',
      containerElement
    );

    // Get the root element
    const root = this.getRootElement();

    // Clear the container first to prevent duplicates
    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }

    // Append the root element to the container
    containerElement.appendChild(root);
    console.log('[MainContentUI] Root element appended to container');

    // Store references to important elements
    this.consoleElement = root.querySelector('#main-console');
    this.consoleInputElement = root.querySelector('#main-console-input');
    this.consoleHistoryElement = root.querySelector('#console-output');
    this.statusIndicator = root.querySelector('#server-status');
    this.connectButton = root.querySelector('.connect-button');
    this.serverAddressInput = root.querySelector('#server-address');
    this.progressBar = root.querySelector('#progress-bar');
    this.checksSentElement = root.querySelector('#checks-sent');
    this.controlButton = root.querySelector('#control-button');
    this.quickCheckButton = root.querySelector('#quick-check-button');

    // Also create aliases for backwards compatibility with old code
    document.getElementById = (function (originalFunction) {
      return function (id) {
        // First try the original function
        const result = originalFunction.call(document, id);
        if (result) return result;

        // If not found, map our elements for backwards compatibility
        switch (id) {
          case 'console':
            return root.querySelector('#main-console');
          case 'console-input':
            return root.querySelector('#main-console-input');
          case 'server-status':
            return root.querySelector('#server-status');
          case 'progress-bar':
            return root.querySelector('#progress-bar');
          case 'checks-sent':
            return root.querySelector('#checks-sent');
          case 'control-button':
            return root.querySelector('#control-button');
          case 'quick-check-button':
            return root.querySelector('#quick-check-button');
          case 'server-address':
            return root.querySelector('#server-address');
          default:
            return null;
        }
      };
    })(document.getElementById);

    // Attach event listeners
    this.attachEventListeners();

    // Initialize the console
    this.initializeConsole();

    // Register console commands
    this.registerConsoleCommands();

    // Update connection status initially
    this.updateConnectionStatus(
      connection.isConnected() ? 'connected' : 'disconnected'
    );

    console.log('[MainContentUI] Elements initialized and references stored');
  }

  attachEventListeners() {
    // Attach connect button listener
    if (this.connectButton && this.serverAddressInput) {
      this.connectButton.addEventListener('click', () => {
        console.log('[MainContentUI] Connect button clicked');

        if (connection.isConnected()) {
          // If connected, disconnect
          eventBus.publish('network:disconnectRequest', {});
        } else {
          // If disconnected, connect using the address from the input field
          const serverAddress =
            this.serverAddressInput.value || 'ws://localhost:38281';
          eventBus.publish('network:connectRequest', {
            serverAddress,
            password: '', // Add password input if needed
          });
        }
      });
    }

    // Attach control button listener
    if (this.controlButton) {
      this.controlButton.addEventListener('click', () => {
        console.log('[MainContentUI] Control button clicked');
        eventBus.publish('control:start', {});
      });
    }

    // Attach quick check button listener
    if (this.quickCheckButton) {
      this.quickCheckButton.addEventListener('click', () => {
        console.log('[MainContentUI] Quick Check button clicked');
        eventBus.publish('control:quickCheck', {});
      });
    }

    // Attach console input listener
    if (this.consoleInputElement) {
      this.consoleInputElement.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.consoleInputElement.value.trim() !== '') {
          const command = this.consoleInputElement.value.trim();
          this.consoleInputElement.value = ''; // Clear input

          // Display the command
          this.appendConsoleMessage(`> ${command}`, 'command');

          // Process the command
          this.executeCommand(command);
        }
      });
    }
  }

  initializeConsole() {
    console.log('[MainContentUI] Initializing console');

    // If we have the ConsoleUI module available, let it know about our elements
    window.consoleManager = {
      print: this.appendConsoleMessage.bind(this),
      executeCommand: this.executeCommand.bind(this),
      registerCommand: this.registerCommand.bind(this),
      clearConsole: this.clearConsole.bind(this),
      commands: {},
    };

    this.appendConsoleMessage(
      'Console initialized. Type "help" for available commands.',
      'system'
    );
  }

  // Console functionality
  appendConsoleMessage(message, type = 'info') {
    if (!this.consoleHistoryElement) return;

    const messageElement = document.createElement('div');
    messageElement.className = `console-message console-message-${type}`;
    messageElement.textContent = message;

    // Style based on message type
    switch (type) {
      case 'error':
        messageElement.style.color = '#ff6b6b';
        break;
      case 'success':
        messageElement.style.color = '#51cf66';
        break;
      case 'warning':
        messageElement.style.color = '#fcc419';
        break;
      case 'system':
        messageElement.style.color = '#4dabf7';
        messageElement.style.fontStyle = 'italic';
        break;
      case 'command':
        messageElement.style.color = '#94d3a2';
        messageElement.style.fontWeight = 'bold';
        break;
      default:
        messageElement.style.color = '#ced4da';
    }

    this.consoleHistoryElement.appendChild(messageElement);

    // Scroll to bottom
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  executeCommand(command) {
    const args = command.split(' ');
    const cmd = args.shift().toLowerCase();
    const argString = args.join(' ');

    // Check for built-in commands
    if (cmd === 'help') {
      this.showHelp();
      return;
    }

    if (cmd === 'clear') {
      this.clearConsole();
      return;
    }

    // Check for registered commands
    if (
      window.consoleManager &&
      window.consoleManager.commands &&
      window.consoleManager.commands[cmd]
    ) {
      try {
        window.consoleManager.commands[cmd].handler(argString);
      } catch (error) {
        this.appendConsoleMessage(
          `Error executing command: ${error.message}`,
          'error'
        );
      }
      return;
    }

    // Command not found
    this.appendConsoleMessage(
      `Unknown command: ${cmd}. Type "help" for available commands.`,
      'error'
    );
  }

  registerCommand(name, description, handler) {
    if (!window.consoleManager) return;

    window.consoleManager.commands[name] = {
      description,
      handler,
    };

    console.log(`[MainContentUI] Registered console command: ${name}`);
  }

  showHelp() {
    this.appendConsoleMessage('Available commands:', 'system');
    this.appendConsoleMessage('help - Show this help message', 'info');
    this.appendConsoleMessage('clear - Clear the console', 'info');

    // Show registered commands
    if (window.consoleManager && window.consoleManager.commands) {
      Object.entries(window.consoleManager.commands).forEach(
        ([name, { description }]) => {
          this.appendConsoleMessage(`${name} - ${description}`, 'info');
        }
      );
    }
  }

  clearConsole() {
    if (this.consoleHistoryElement) {
      this.consoleHistoryElement.innerHTML = '';
      this.appendConsoleMessage('Console cleared.', 'system');
    }
  }

  registerConsoleCommands() {
    // Command to show current game state
    this.registerCommand('state', 'Show current game state.', () => {
      const currentState = stateManager.getStateForPlayer(
        stateManager.selectedPlayerId
      );
      this.appendConsoleMessage(JSON.stringify(currentState, null, 2), 'info');
    });

    // Command to list reachable locations
    this.registerCommand('reachable', 'List reachable locations.', () => {
      const reachable = stateManager.getPathAnalyzer()?.getReachableLocations();
      this.appendConsoleMessage(
        `Reachable locations: ${reachable?.join(', ') || 'None'}`,
        'info'
      );
    });

    // Command to list inventory items
    this.registerCommand('inventory', 'List current inventory items.', () => {
      const inventory = stateManager.getCurrentInventory();
      this.appendConsoleMessage(
        `Inventory: ${inventory.join(', ') || 'Empty'}`,
        'info'
      );
    });

    // Command to toggle debug mode
    this.registerCommand('debug', 'Toggle debug mode.', () => {
      const debugMode = !stateManager.getDebugMode();
      stateManager.setDebugMode?.(debugMode);
      this.appendConsoleMessage(
        `Debug mode ${debugMode ? 'enabled' : 'disabled'}.`,
        'info'
      );
    });

    // Network command
    this.registerCommand(
      'connect',
      'Connect to a server. Usage: connect [server_address]',
      (args) => {
        const serverAddress = args || 'ws://localhost:38281';
        this.appendConsoleMessage(
          `Connecting to ${serverAddress}...`,
          'system'
        );
        eventBus.publish('network:connectRequest', {
          serverAddress,
          password: '', // Add password input if needed
        });
      }
    );

    this.registerCommand('disconnect', 'Disconnect from the server.', () => {
      this.appendConsoleMessage('Disconnecting...', 'system');
      eventBus.publish('network:disconnectRequest', {});
    });

    console.log('[MainContentUI] Registered console commands');
  }

  updateConnectionStatus(status) {
    if (!this.statusIndicator || !this.connectButton) return;

    // Update the status indicator
    // Handle both string status values and boolean values
    const isConnected =
      typeof status === 'boolean' ? status : status === 'connected';
    const isConnecting = status === 'connecting';

    if (isConnected) {
      this.statusIndicator.textContent = 'Connected';
      this.statusIndicator.style.color = '#51cf66'; // Green
      this.connectButton.textContent = 'Disconnect';

      // Enable control buttons
      if (this.controlButton) this.controlButton.disabled = false;
      if (this.quickCheckButton) this.quickCheckButton.disabled = false;
    } else if (isConnecting) {
      this.statusIndicator.textContent = 'Connecting...';
      this.statusIndicator.style.color = '#fcc419'; // Yellow
      this.connectButton.textContent = 'Cancel';

      // Disable control buttons
      if (this.controlButton) this.controlButton.disabled = true;
      if (this.quickCheckButton) this.quickCheckButton.disabled = true;
    } else {
      this.statusIndicator.textContent = 'Not Connected';
      this.statusIndicator.style.color = '#ff6b6b'; // Red
      this.connectButton.textContent = 'Connect';

      // Disable control buttons
      if (this.controlButton) this.controlButton.disabled = true;
      if (this.quickCheckButton) this.quickCheckButton.disabled = true;
    }
  }

  // Methods for progress functionality
  updateProgressBar(value, max) {
    if (this.progressBar) {
      this.progressBar.value = value;
      if (max) this.progressBar.max = max;
    }
  }

  updateChecksSent(count) {
    if (this.checksSentElement) {
      this.checksSentElement.textContent = `Checked: ${count}`;
    }
  }

  setControlButtonState(isStarted) {
    if (this.controlButton) {
      this.controlButton.textContent = isStarted ? 'Pause' : 'Begin!';
    }
  }
}

export default MainContentUI;

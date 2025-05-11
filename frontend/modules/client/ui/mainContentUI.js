// MainContentUI - Central panel containing console and connection status

import ConsoleUI from './consoleUI.js';
import { stateManagerProxySingleton as stateManager } from '../../stateManager/index.js';
import ProgressUI from './progressUI.js';
import timerState from '../core/timerState.js'; // Import timerState singleton
import messageHandler from '../core/messageHandler.js'; // Import messageHandler singleton
import eventBus from '../../../app/core/eventBus.js'; // Import eventBus singleton
import connection from '../core/connection.js'; // Import connection singleton

class MainContentUI {
  constructor(container, componentState) {
    console.log('[MainContentUI] Constructor called');
    this.container = container;
    this.componentState = componentState;

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
    this.serverAddressInput = null;
    this.progressUICleanup = null; // Add property to store cleanup function

    // Use imported singletons directly
    this.eventBus = eventBus;
    this.connection = connection;

    // Store references needed by console commands
    this.stateManager = stateManager;
    this.timerState = timerState;
    this.messageHandler = messageHandler;

    // Subscribe to connection events using the imported eventBus singleton
    this.eventBus.subscribe('connection:open', () => {
      this.updateConnectionStatus(true);
    });
    this.eventBus.subscribe('connection:close', () => {
      this.updateConnectionStatus(false);
    });
    this.eventBus.subscribe('connection:error', () => {
      this.updateConnectionStatus(false);
    });
    this.eventBus.subscribe('connection:reconnecting', () => {
      this.updateConnectionStatus('connecting');
    });

    // <<< ADDED: Subscribe to console print requests >>>
    this.eventBus.subscribe('ui:printToConsole', (payload) => {
      if (payload && payload.message) {
        this.appendConsoleMessage(payload.message, payload.type || 'info');
      }
    });
    // <<< END ADDED >>>

    // Defer full element initialization and event listener setup
    const readyHandler = (eventPayload) => {
      console.log(
        '[MainContentUI] Received app:readyForUiDataLoad. Initializing elements.'
      );
      // Pass the GoldenLayout container's DOM element to initializeElements
      this.initializeElements(this.container.element);
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.dispose();
    });
  }

  getRootElement() {
    console.log('[MainContentUI] Getting root element');
    if (!this.rootElement) {
      console.log('[MainContentUI] Creating new root element');
      this.rootElement = document.createElement('div');
      this.rootElement.className = 'main-content-panel'; // Restore class name
      this.rootElement.style.width = '100%';
      this.rootElement.style.height = '100%';
      this.rootElement.style.display = 'flex';
      this.rootElement.style.flexDirection = 'column';
      this.rootElement.style.backgroundColor = '#2d2d2d';
      this.rootElement.style.color = '#cecece';
      this.rootElement.style.padding = '10px';
      this.rootElement.style.boxSizing = 'border-box';

      // Restore the original HTML structure
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

    // Get the root element - this will create it if it doesn't exist
    const root = this.getRootElement();

    // Clear the container first to prevent duplicates if called multiple times (though should only be once now)
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

    // Attach event listeners
    this.attachEventListeners();

    // Initialize the console
    this.initializeConsole();

    // Register console commands
    this.registerConsoleCommands();

    // Update connection status initially using injected connection instance
    this.updateConnectionStatus(
      this.connection.isConnected() ? 'connected' : 'disconnected'
    );

    // Initialize ProgressUI within this component's root element
    try {
      if (ProgressUI && typeof ProgressUI.initializeWithin === 'function') {
        console.log('[MainContentUI] Initializing ProgressUI within root...');
        // Pass the root element AND the injected eventBus
        // Store the returned cleanup function
        this.progressUICleanup = ProgressUI.initializeWithin(
          this.rootElement,
          this.eventBus
        );
      } else {
        console.warn(
          '[MainContentUI] ProgressUI or initializeWithin method not found.'
        );
      }
    } catch (error) {
      console.error('[MainContentUI] Error initializing ProgressUI:', error);
    }

    console.log('[MainContentUI] Elements initialized and references stored');
  }

  attachEventListeners() {
    // Attach connect button listener
    if (this.connectButton && this.serverAddressInput) {
      this.connectButton.addEventListener('click', () => {
        console.log('[MainContentUI] Connect button clicked');

        // Use injected connection and eventBus
        if (this.connection.isConnected()) {
          this.eventBus.publish('network:disconnectRequest', {});
        } else {
          const serverAddress =
            this.serverAddressInput.value || 'ws://localhost:38281';
          this.eventBus.publish('network:connectRequest', {
            serverAddress,
            password: '',
          });
        }
      });
    }

    // Attach control button listener
    if (this.controlButton) {
      this.controlButton.addEventListener('click', () => {
        console.log('[MainContentUI] Control button clicked');
        // Use injected eventBus
        this.eventBus.publish('control:start', {});
      });
    }

    // Attach quick check button listener
    if (this.quickCheckButton) {
      this.quickCheckButton.addEventListener('click', () => {
        console.log('[MainContentUI] Quick Check button clicked');
        // Use injected eventBus
        this.eventBus.publish('control:quickCheck', {});
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
    window.consoleManager.commands[name.toLowerCase()] = {
      description,
      handler,
    };
    console.log(`[MainContentUI] Registered console command: ${name}`);
  }

  showHelp() {
    this.appendConsoleMessage('Available commands:', 'system');
    if (window.consoleManager && window.consoleManager.commands) {
      Object.entries(window.consoleManager.commands)
        .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically
        .forEach(([name, { description }]) => {
          this.appendConsoleMessage(
            `${name} - ${description || 'No description'}`,
            'info'
          );
        });
    }
  }

  clearConsole() {
    if (this.consoleHistoryElement) {
      this.consoleHistoryElement.innerHTML = '';
      this.appendConsoleMessage('Console cleared.', 'system');
    }
  }

  registerConsoleCommands() {
    // --- MainContentUI Commands ---
    this.registerCommand('state', 'Show current game state.', () => {
      const currentState = this.stateManager?.instance?.getStateForPlayer(
        this.stateManager?.selectedPlayerId
      );
      this.appendConsoleMessage(
        JSON.stringify(currentState || {}, null, 2),
        'info'
      );
    });
    this.registerCommand('reachable', 'List reachable locations.', () => {
      const reachable = this.stateManager?.instance
        ?.getPathAnalyzer?.()
        ?.getReachableLocations?.();
      this.appendConsoleMessage(
        `Reachable locations: ${reachable?.join(', ') || 'None'}`,
        'info'
      );
    });
    this.registerCommand('inventory', 'List current inventory items.', () => {
      const inventory = this.stateManager?.instance?.getCurrentInventory?.();
      this.appendConsoleMessage(
        `Inventory: ${inventory?.join(', ') || 'Empty'}`,
        'info'
      );
    });
    this.registerCommand('debug', 'Toggle stateManager debug mode.', () => {
      const debugMode = !this.stateManager?.instance?.getDebugMode?.();
      this.stateManager?.instance?.setDebugMode?.(debugMode);
      this.appendConsoleMessage(
        `Debug mode ${debugMode ? 'enabled' : 'disabled'}.`,
        'info'
      );
    });
    this.registerCommand(
      'connect',
      'Connect to server. Usage: connect [addr]',
      (args) => {
        const serverAddress = args || 'ws://localhost:38281';
        this.appendConsoleMessage(
          `Connecting to ${serverAddress}...`,
          'system'
        );
        this.eventBus.publish('network:connectRequest', {
          serverAddress,
          password: '',
        });
      }
    );
    this.registerCommand('disconnect', 'Disconnect from server.', () => {
      this.appendConsoleMessage('Disconnecting...', 'system');
      this.eventBus.publish('network:disconnectRequest', {});
    });
    this.registerCommand('help', 'Show available commands.', () =>
      this.showHelp()
    );
    this.registerCommand('clear', 'Clear the console.', () =>
      this.clearConsole()
    );

    // --- Register ConsoleUI Commands ---
    // Pass the register function and dependencies to ConsoleUI
    ConsoleUI.registerCommands(this.registerCommand.bind(this), {
      stateManager: this.stateManager,
      timerState: this.timerState,
      messageHandler: this.messageHandler,
      connection: this.connection, // From constructor
      // Pass specific console methods needed by ConsoleUI handlers
      consoleManager: {
        print: this.appendConsoleMessage.bind(this),
        // Add clearConsole etc. if needed by ConsoleUI handlers
      },
    });

    console.log('[MainContentUI] Registered all console commands');
  }

  updateConnectionStatus(status) {
    if (!this.statusIndicator || !this.connectButton) return;

    switch (status) {
      case true:
      case 'connected':
        this.statusIndicator.textContent = 'Connected';
        this.statusIndicator.style.color = 'lime';
        this.connectButton.textContent = 'Disconnect';
        break;
      case 'connecting':
        this.statusIndicator.textContent = 'Connecting...';
        this.statusIndicator.style.color = 'orange';
        this.connectButton.textContent = 'Cancel'; // Or keep as Disconnect?
        break;
      case false:
      case 'disconnected':
      default:
        this.statusIndicator.textContent = 'Not Connected';
        this.statusIndicator.style.color = 'yellow';
        this.connectButton.textContent = 'Connect';
        break;
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

  // Add a cleanup method to be called by PanelManager/GoldenLayout
  dispose() {
    console.log('[MainContentUI] Disposing...');
    // Call the cleanup function returned by ProgressUI.initializeWithin
    if (typeof this.progressUICleanup === 'function') {
      console.log('[MainContentUI] Cleaning up ProgressUI listeners...');
      this.progressUICleanup();
      this.progressUICleanup = null;
    }
    // Add any other cleanup needed for MainContentUI itself
    // (e.g., remove own event listeners if any were attached directly to document/window)
    console.log('[MainContentUI] Dispose complete.');
  }
}

export default MainContentUI;

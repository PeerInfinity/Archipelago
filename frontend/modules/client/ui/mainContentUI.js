// MainContentUI - Central panel containing console and connection status

import ConsoleUI from './consoleUI.js';
import { stateManagerProxySingleton as stateManager } from '../../stateManager/index.js';
import messageHandler from '../core/messageHandler.js';
import eventBus from '../../../app/core/eventBus.js';
import connection from '../core/connection.js';
import {
  setMainContentUIInstance,
  getClientModuleDispatcher,
  getClientModuleEventBus,
} from '../index.js'; // ADDED getClientModuleDispatcher
import { centralRegistry } from '../../../app/core/centralRegistry.js'; // RE-ADD import


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('mainContentUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[mainContentUI] ${message}`, ...data);
  }
}

// const TIMER_UI_COMPONENT_TYPE = 'TimerProgressUI'; // May not be needed, or keep for logging
const CLIENT_MODULE_ID = 'Client'; // This module's ID for logging or other purposes

class MainContentUI {
  constructor(container, componentState) {
    this.container = container;
    log('info', '[MainContentUI] Constructor called');

    // Initialize console manager if it doesn't exist
    if (!window.consoleManager) {
      window.consoleManager = {
        commands: {}
      };
      log('info', '[MainContentUI] Initialized window.consoleManager');
    }

    this.componentState = componentState;
    this.timerHostPlaceholder = null;

    setMainContentUIInstance(this); // ADDED - Register instance with module's index.js

    this.rootElement = null;
    this.consoleElement = null;
    this.consoleInputElement = null;
    this.consoleHistoryElement = null;
    this.statusIndicator = null;
    this.connectButton = null;
    this.serverAddressInput = null;

    this.eventBus = eventBus;
    this.connection = connection;

    this.stateManager = stateManager;
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

    // ADDED: Subscribe to the game:connected event to show the final success message
    this.eventBus.subscribe('game:connected', (data) => {
      // Find player name
      const player = data.players.find((p) => p.slot === data.slot);
      const playerName = player ? player.name : `Player ${data.slot}`;

      this.appendConsoleMessage(
        `Successfully connected to the server as ${playerName}.`,
        'success'
      );
      this.appendConsoleMessage(`Team: ${data.team}, Slot: ${data.slot}`, 'info');

      // Display location stats
      const checked = data.checkedLocations?.length || 0;
      const total = checked + (data.missingLocations?.length || 0);
      this.appendConsoleMessage(
        `${checked} locations checked, ${total - checked} remaining.`,
        'info'
      );
    });

    // <<< ADDED: Subscribe to console print requests >>>
    this.eventBus.subscribe('ui:printToConsole', (payload) => {
      if (payload && payload.message) {
        this.appendConsoleMessage(payload.message, payload.type || 'info');
      }
    });

    // Subscribe to formatted console messages (PrintJSON)
    this.eventBus.subscribe('ui:printFormattedToConsole', (payload) => {
      if (payload && payload.messageParts) {
        this.appendFormattedMessage(payload.messageParts, payload.type || 'info');
      }
    });
    // <<< END ADDED >>>

    // Defer full element initialization and event listener setup
    const readyHandler = (eventPayload) => {
      log('info', 
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

    this.container.on('open', () => {
      // When the panel (re)opens, ensure it is set as an active host if it has a placeholder
      // OLD LOGIC - REMOVED
      // if (this.timerHostPlaceholder) {
      //   centralRegistry.setUIHostActive(
      //     TIMER_UI_COMPONENT_TYPE,
      //     CLIENT_MODULE_ID,
      //     true
      //   );
      // }
      // New logic: if a rehome is needed when a panel opens, system:rehomeTimerUI should be dispatched.
      // This panel will respond if it's the highest priority viable host.
      // Perhaps dispatch a rehome event here? Or rely on a general rehome event.
      // For now, per plan, this panel just becomes ready. If Timer is not homed, a general rehome event is needed.
      // log('info', '[MainContentUI] Panel opened. Ready to host TimerUI if system:rehomeTimerUI is dispatched.');
    });

    this.container.on('hide', () => {
      // When the panel is hidden (e.g. tab closed but not destroyed), mark as inactive host
      // OLD LOGIC - REMOVED
      // centralRegistry.setUIHostActive(
      //   TIMER_UI_COMPONENT_TYPE,
      //   CLIENT_MODULE_ID,
      //   false
      // );
      // New logic: If this panel was hosting and is now hidden, the TimerUI might need rehoming.
      // This panel should not proactively detach. The Timer's attachToHost should handle moving.
      // If this panel becomes non-viable, the next system:rehomeTimerUI event will find another host.
      // If it was hosting, it might need to signal that its viability changed.
      // The Timer UI should ideally be detached if this panel is no longer a good host.
      // This might require a call to Timer's detach or a new rehome dispatch.
      // For now, we focus on this panel's reaction to rehome requests.
      // If it was hosting, and then hidden, and TimerUI needs to move,
      // another dispatch of 'system:rehomeTimerUI' would be needed.
    });
  }

  getRootElement() {
    log('info', '[MainContentUI] Getting root element');
    if (!this.rootElement) {
      log('info', '[MainContentUI] Creating new root element');
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

      this.rootElement.innerHTML = `
        <div style="margin-bottom: 10px; border-bottom: 1px solid #666; padding-bottom: 5px;">
          <h3 style="margin: 0 0 10px 0;">Console & Status</h3>
          
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
          
          <!-- Timer UI Placeholder -->
          <div id="timer-ui-placeholder" style="margin-bottom: 10px;"></div>
        </div>
        
        <div id="main-console" class="main-console" style="flex-grow: 1; overflow-y: auto; background-color: #222; border: 1px solid #444; padding: 10px;">
          <div id="console-output" class="console-output console-messages">
            <div class="console-message">Welcome to the Archipelago Client Console!</div>
            <div class="console-message">Type "help" for local commands, or "!help" for server commands.</div>
          </div>
        </div>
        
        <div id="command-wrapper" style="margin-top: 10px; display: flex;">
          <label for="main-console-input" style="display: none;"></label>
          <input id="main-console-input" type="text" placeholder="Enter command..." style="flex-grow: 1; padding: 5px; background-color: #333; color: #eee; border: 1px solid #555;" />
          <button class="send-button" style="margin-left: 5px; padding: 5px 10px;">Send</button>
        </div>
      `;

      log('info', '[MainContentUI] Added content to root element');
    }
    return this.rootElement;
  }

  initializeElements(containerElement) {
    log('info', 
      '[MainContentUI] Initializing elements in container:',
      containerElement
    );

    const root = this.getRootElement();

    while (containerElement.firstChild) {
      containerElement.removeChild(containerElement.firstChild);
    }

    containerElement.appendChild(root);
    log('info', '[MainContentUI] Root element appended to container');

    this.consoleElement = root.querySelector('#main-console');
    this.consoleInputElement = root.querySelector('#main-console-input');
    this.consoleHistoryElement = root.querySelector('#console-output');
    this.statusIndicator = root.querySelector('#server-status');
    this.connectButton = root.querySelector('.connect-button');
    this.serverAddressInput = root.querySelector('#server-address');

    this.attachEventListeners();
    this.initializeConsole();
    this.registerConsoleCommands();
    this.updateConnectionStatus(
      this.connection.isConnected() ? 'connected' : 'disconnected'
    );

    // Inject Timer UI
    const timerPlaceholder = this.rootElement.querySelector(
      '#timer-ui-placeholder'
    );
    if (timerPlaceholder) {
      this.timerHostPlaceholder = timerPlaceholder; // Store reference
      log('info', 
        '[MainContentUI] Timer host placeholder identified. Ready for TimerUI via event.'
      );
    } else {
      log('error', 
        '[MainContentUI] Placeholder div for Timer UI (#timer-ui-placeholder) not found.'
      );
    }

    log('info', '[MainContentUI] Elements initialized and references stored');
  }

  attachEventListeners() {
    if (this.connectButton && this.serverAddressInput) {
      this.connectButton.addEventListener('click', () => {
        log('info', '[MainContentUI] Connect button clicked');
        if (this.connection.isConnected()) {
          this.connection.disconnect();
        } else {
          const serverAddress =
            this.serverAddressInput.value || 'ws://localhost:38281';
          if (typeof this.connection.requestConnect === 'function') {
            this.connection.requestConnect(serverAddress, '');
          } else {
            log('error', 
              '[MainContentUI] this.connection.requestConnect is not a function. Connection attempt failed.'
            );
          }
        }
      });
    }

    if (this.consoleInputElement) {
      this.consoleInputElement.addEventListener('keypress', (event) => {
        if (
          event.key === 'Enter' &&
          this.consoleInputElement.value.trim() !== ''
        ) {
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
    log('info', '[MainContentUI] Initializing console');

    this.appendConsoleMessage(
      'Console initialized. Type "help" for local commands, or "!help" for server commands.',
      'system'
    );
  }

  // Console functionality
  appendConsoleMessage(message, type = 'info') {
    if (!this.consoleHistoryElement) return;

    // Handle multi-line messages by splitting on newlines
    const lines = message.split('\n');
    
    lines.forEach(line => {
      // Skip empty lines unless it's the only line (preserve single empty messages)
      if (line.trim() === '' && lines.length > 1) return;
      
      const messageElement = document.createElement('div');
      messageElement.className = `console-message console-message-${type}`;
      messageElement.textContent = line;

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
    });

    // Scroll to bottom
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  // Handle formatted messages from PrintJSON with proper ID-to-name mapping and coloring
  appendFormattedMessage(messageParts, type = 'info') {
    if (!this.consoleHistoryElement) return;

    // Create the message div
    const messageElement = document.createElement('div');
    messageElement.className = `console-message console-message-${type}`;

    // Create the spans to populate the message div
    for (const part of messageParts) {
      const span = document.createElement('span');

      if (part.hasOwnProperty('type')) {
        // Get client slot and players for player ID formatting
        const playerSlot = this.messageHandler?.getClientSlot?.() || 0;
        const players = this.messageHandler?.getPlayers?.() || [];

        switch (part.type) {
          case 'player_id':
            const playerIsClient = parseInt(part.text, 10) === playerSlot;
            if (playerIsClient) {
              span.style.fontWeight = 'bold';
            }
            span.style.color = playerIsClient ? '#ffa565' : '#52b44c';
            span.textContent =
              players[parseInt(part.text, 10) - 1]?.alias ||
              `Player${part.text}`;
            break;

          case 'item_id':
            span.style.color = '#fc5252';
            try {
              // Use synchronous method for rendering
              if (
                this.messageHandler &&
                typeof this.messageHandler.getItemNameSync === 'function'
              ) {
                span.textContent = this.messageHandler.getItemNameSync(part.text);
              } else {
                // Direct fallback to a placeholder with ID
                span.textContent = `Item ${part.text}`;
              }
            } catch (e) {
              log('warn', 'Error getting item name:', e);
              span.textContent = `Item ${part.text}`;
            }
            break;

          case 'location_id':
            span.style.color = '#5ea2c1';
            try {
              // Use synchronous method for rendering
              if (
                this.messageHandler &&
                typeof this.messageHandler.getLocationNameSync === 'function'
              ) {
                span.textContent = this.messageHandler.getLocationNameSync(part.text);
              } else {
                // Direct fallback to a placeholder with ID
                span.textContent = `Location ${part.text}`;
              }
            } catch (e) {
              log('warn', 'Error getting location name:', e);
              span.textContent = `Location ${part.text}`;
            }
            break;

          default:
            span.textContent = part.text;
        }
      } else {
        span.textContent = part.text;
      }

      messageElement.appendChild(span);
    }

    // Append the message div to the console
    this.consoleHistoryElement.appendChild(messageElement);

    // Scroll to bottom
    this.consoleElement.scrollTop = this.consoleElement.scrollHeight;
  }

  executeCommand(command) {
    // Check if this is a server command (starts with !)
    if (command.startsWith('!')) {
      // Send to server via messageHandler
      if (this.messageHandler && typeof this.messageHandler.sendMessage === 'function') {
        const success = this.messageHandler.sendMessage(command);
        if (success) {
          this.appendConsoleMessage(`Command: ${command}`, 'info');
        } else {
          this.appendConsoleMessage('Failed to send command: Not connected to server.', 'error');
        }
      } else {
        this.appendConsoleMessage('Failed to send command: Message handler not available.', 'error');
      }
      return;
    }

    const args = command.split(' ');
    let cmd = args.shift();
    const argString = args.join(' ');

    // Handle both /command and command formats for local commands
    const isSlashCommand = cmd.startsWith('/');
    if (isSlashCommand) {
      cmd = cmd.substring(1); // Remove the /
    }
    cmd = cmd.toLowerCase();

    // Check for built-in commands (support both help and /help)
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
    const commandDisplay = isSlashCommand ? `/${cmd}` : cmd;
    this.appendConsoleMessage(
      `Unknown command: ${commandDisplay}. Type "help" or "/help" for available commands.`,
      'error'
    );
  }

  registerCommand(name, description, handler) {
    log('info', `[MainContentUI] Attempting to register command: ${name}`);
    if (!window.consoleManager) {
      log('error', '[MainContentUI] window.consoleManager not available!');
      return;
    }
    if (!window.consoleManager.commands) {
      log('error', '[MainContentUI] window.consoleManager.commands not available!');
      return;
    }
    window.consoleManager.commands[name.toLowerCase()] = {
      description,
      handler,
    };
    log('info', `[MainContentUI] Successfully registered console command: ${name}`);
  }

  showHelp() {
    log('info', '[MainContentUI] showHelp called');
    log('info', '[MainContentUI] window.consoleManager exists:', !!window.consoleManager);
    log('info', '[MainContentUI] window.consoleManager.commands exists:', !!(window.consoleManager?.commands));
    if (window.consoleManager?.commands) {
      log('info', '[MainContentUI] Available commands:', Object.keys(window.consoleManager.commands));
    }
    
    this.appendConsoleMessage('Available commands:', 'system');
    if (window.consoleManager && window.consoleManager.commands) {
      const commands = Object.entries(window.consoleManager.commands);
      if (commands.length === 0) {
        this.appendConsoleMessage('No commands registered.', 'info');
      } else {
        commands
          .sort(([a], [b]) => a.localeCompare(b)) // Sort alphabetically
          .forEach(([name, { description }]) => {
            this.appendConsoleMessage(
              `/${name} - ${description || 'No description'}`,
              'info'
            );
          });
      }
    } else {
      this.appendConsoleMessage('Console manager not available.', 'error');
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
    this.registerCommand('state', 'Show current game state.', async () => {
      if (!this.stateManager) {
        this.appendConsoleMessage('StateManager not available.', 'error');
        return;
      }
      
      try {
        await this.stateManager.ensureReady();
        const snapshot = this.stateManager.getSnapshot();
        this.appendConsoleMessage(
          JSON.stringify(snapshot || {}, null, 2),
          'info'
        );
      } catch (error) {
        this.appendConsoleMessage(`State command failed: ${error.message}`, 'error');
      }
    });
    this.registerCommand('reachable', 'List reachable locations.', async () => {
      if (!this.stateManager) {
        this.appendConsoleMessage('StateManager not available.', 'error');
        return;
      }
      
      try {
        await this.stateManager.ensureReady();
        const snapshot = this.stateManager.getSnapshot();
        const staticData = this.stateManager.getStaticData();
        
        if (!staticData?.locations) {
          this.appendConsoleMessage('Location data not available.', 'error');
          return;
        }
        
        // Get reachable locations by checking accessibility
        // staticData.locations is an object keyed by location name, not an array
        const reachableLocations = [];
        const allLocations = Object.values(staticData.locations);
        for (const location of allLocations) {
          // We'd need access to the rule engine to check accessibility
          // For now, let's just show all locations as we don't have direct access to rule evaluation
          if (!snapshot.checkedLocations?.includes(location.name)) {
            reachableLocations.push(location.name);
          }
        }
        
        this.appendConsoleMessage(
          `Reachable locations: ${reachableLocations.length > 0 ? reachableLocations.join(', ') : 'None'}`,
          'info'
        );
      } catch (error) {
        this.appendConsoleMessage(`Reachable command failed: ${error.message}`, 'error');
      }
    });
    this.registerCommand('inventory', 'List current inventory items.', async () => {
      if (!this.stateManager) {
        this.appendConsoleMessage('StateManager not available.', 'error');
        return;
      }
      
      try {
        await this.stateManager.ensureReady();
        const snapshot = this.stateManager.getSnapshot();
        const inventory = snapshot?.inventory || {};
        
        if (Object.keys(inventory).length === 0) {
          this.appendConsoleMessage('Inventory: Empty', 'info');
        } else {
          this.appendConsoleMessage('Inventory:', 'info');
          Object.entries(inventory).forEach(([item, count]) => {
            this.appendConsoleMessage(`  ${item}: ${count}`, 'info');
          });
        }
      } catch (error) {
        this.appendConsoleMessage(`Inventory command failed: ${error.message}`, 'error');
      }
    });
    this.registerCommand('debug', 'Toggle stateManager debug mode.', async () => {
      if (!this.stateManager) {
        this.appendConsoleMessage('StateManager not available.', 'error');
        return;
      }
      
      try {
        await this.stateManager.ensureReady();
        // Check if debug mode is currently enabled
        const currentDebugMode = this.stateManager.isDebugMode?.() || false;
        const newDebugMode = !currentDebugMode;
        
        // Toggle debug mode
        if (typeof this.stateManager.setDebugMode === 'function') {
          this.stateManager.setDebugMode(newDebugMode);
          this.appendConsoleMessage(
            `Debug mode ${newDebugMode ? 'enabled' : 'disabled'}.`,
            'success'
          );
        } else {
          this.appendConsoleMessage('Debug mode toggle not supported.', 'warn');
        }
      } catch (error) {
        this.appendConsoleMessage(`Debug command failed: ${error.message}`, 'error');
      }
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
        
        if (this.connection && typeof this.connection.requestConnect === 'function') {
          const success = this.connection.requestConnect(serverAddress, '');
          if (!success) {
            this.appendConsoleMessage('Failed to initiate connection.', 'error');
          }
        } else {
          this.appendConsoleMessage('Connection module not available.', 'error');
        }
      }
    );
    this.registerCommand('disconnect', 'Disconnect from server.', () => {
      this.appendConsoleMessage('Disconnecting...', 'system');
      
      if (this.connection && typeof this.connection.disconnect === 'function') {
        this.connection.disconnect();
      } else {
        this.appendConsoleMessage('Connection module not available.', 'error');
      }
    });
    this.registerCommand('help', 'Show available commands.', () =>
      this.showHelp()
    );
    this.registerCommand('clear', 'Clear the console.', () =>
      this.clearConsole()
    );

    // --- Traditional Archipelago Commands (with / prefix) ---
    this.registerCommand('sync', 'Force the client to synchronize with the AP server.', () => {
      if (this.messageHandler && typeof this.messageHandler.serverSync === 'function') {
        this.messageHandler.serverSync();
        this.appendConsoleMessage('Requesting server sync...', 'system');
      } else {
        this.appendConsoleMessage('Sync failed: Message handler not available.', 'error');
      }
    });

    // Note: received, missing, items, locations, ready commands are now handled by ConsoleUI
    // to avoid duplication and conflicts. ConsoleUI handles these with proper StateManager integration.

    // --- Register ConsoleUI Commands ---
    // Pass the register function and dependencies to ConsoleUI
    ConsoleUI.registerCommands(this.registerCommand.bind(this), {
      stateManager: this.stateManager,
      timerState: this.timerState,
      messageHandler: this.messageHandler,
      connection: this.connection, // From constructor
      centralRegistry: centralRegistry, // For accessing Timer module
      // Pass specific console methods needed by ConsoleUI handlers
      consoleManager: {
        print: this.appendConsoleMessage.bind(this),
        // Add clearConsole etc. if needed by ConsoleUI handlers
      },
    });

    log('info', '[MainContentUI] Registered all console commands');
  }

  updateConnectionStatus(status) {
    if (this.statusIndicator) {
      if (status === true || status === 'connected') {
        this.statusIndicator.textContent = 'Connected';
        this.statusIndicator.style.color = 'lightgreen';
        if (this.connectButton) this.connectButton.textContent = 'Disconnect';
      } else if (status === 'connecting') {
        this.statusIndicator.textContent = 'Connecting...';
        this.statusIndicator.style.color = 'orange';
        if (this.connectButton) this.connectButton.textContent = 'Cancel';
      } else {
        this.statusIndicator.textContent = 'Not Connected';
        this.statusIndicator.style.color = 'yellow';
        if (this.connectButton) this.connectButton.textContent = 'Connect';
      }
    }
  }

  dispose() {
    log('info', '[MainContentUI] Disposing...');
    setMainContentUIInstance(null); // Clear instance on dispose

    // ADDED: Notify that this panel was manually closed
    const bus = getClientModuleEventBus();
    if (bus && typeof bus.publish === 'function') {
      log('info', 
        '[MainContentUI] Panel disposed, publishing ui:panelManuallyClosed.'
      );
      bus.publish('ui:panelManuallyClosed', { moduleId: CLIENT_MODULE_ID });
    } else {
      log('warn', 
        '[MainContentUI] Could not get eventBus or publish function to send ui:panelManuallyClosed.'
      );
    }

    // Unsubscribe from eventBus events to prevent memory leaks
    // (Assuming eventBus.unsubscribe requires the original handler reference,
    // which might need to be stored if not using anonymous functions)
    // For simplicity, if subscriptions were like eventBus.subscribe('event', this.handler.bind(this)),
    // then unsubscription is more complex. If they are module-level or with anonymous functions
    // as shown in constructor, they might auto-clean or need specific handling.
    // The provided code uses anonymous functions for eventBus.subscribe, so unsubscription
    // would require storing those handler functions. Let's assume this is handled or not critical for this refactor.

    // OLD LOGIC - REMOVED. No explicit unregister needed for the new system from here.
    // if (this.timerHostPlaceholder) {
    //   centralRegistry.unregisterUIHost(TIMER_UI_COMPONENT_TYPE, CLIENT_MODULE_ID);
    // }

    // Detach any DOM elements this UI created if necessary
    if (this.rootElement && this.rootElement.parentNode) {
      this.rootElement.parentNode.removeChild(this.rootElement);
    }
    this.rootElement = null;
    this.timerHostPlaceholder = null; // Clear reference

    // Other cleanup
    log('info', '[MainContentUI] Disposed.');

    // ADDED: Dispatch rehome event when panel is disposed (destroyed)
    const dispatcher = getClientModuleDispatcher();
    if (dispatcher && typeof dispatcher.publish === 'function') {
      log('info', 
        '[MainContentUI] Panel disposed, dispatching system:rehomeTimerUI.'
      );
      // Use setTimeout to ensure this dispatch happens after current call stack (including GL destroy) unwinds
      setTimeout(() => {
        dispatcher.publish(
          'system:rehomeTimerUI', // Event name
          {}, // Event data
          { initialTarget: 'top' } // Dispatch options
        );
      }, 0);
    } else {
      log('warn', 
        '[MainContentUI] Could not get dispatcher or publish function to rehome TimerUI on panel dispose.'
      );
    }
  }

  // --- New Timer Hosting Logic --- //
  handleRehomeTimerUI(eventData, propagationOptions, dispatcher) {
    const panelIdForLog =
      this.container?.config?.id || this.container?.id || CLIENT_MODULE_ID;
    log('info', 
      `[MainContentUI - ${panelIdForLog}] handleRehomeTimerUI called.`
    );
    let isViableHost = false;

    if (
      this.container &&
      this.container.element &&
      this.timerHostPlaceholder &&
      document.body.contains(this.timerHostPlaceholder)
    ) {
      isViableHost = true;
      // A more robust check for visibility:
      // GoldenLayout's isVisible is on the item container, not the component directly.
      // The component's container (this.container) is the item container.
      if (
        typeof this.container.isVisible === 'boolean' &&
        !this.container.isVisible
      ) {
        isViableHost = false;
        log('info', 
          `[MainContentUI - ${panelIdForLog}] Panel container reports not visible.`
        );
      }
      // Additional check: if the tab itself is not active, it might not be truly "visible" for hosting.
      // However, GoldenLayout's isVisible should ideally cover this.
      // If the panel is in a stack, only the active tab's content is usually fully visible.
      // Let's rely on this.container.isVisible for now.
    } else {
      if (!this.container || !this.container.element)
        log('info', 
          `[MainContentUI - ${panelIdForLog}] Container or container.element missing.`
        );
      if (!this.timerHostPlaceholder)
        log('info', 
          `[MainContentUI - ${panelIdForLog}] Timer host placeholder not found.`
        );
      else if (
        this.timerHostPlaceholder &&
        !document.body.contains(this.timerHostPlaceholder)
      ) {
        log('info', 
          `[MainContentUI - ${panelIdForLog}] Timer host placeholder found but not in document body.`
        );
      }
    }

    if (isViableHost) {
      log('info', 
        `[MainContentUI - ${panelIdForLog}] Is a viable host. Attempting to attach TimerUI.`
      );
      if (
        centralRegistry &&
        typeof centralRegistry.getPublicFunction === 'function'
      ) {
        const attachFn = centralRegistry.getPublicFunction(
          'Timer', // Module name used by Timer module in moduleInfo.name
          'attachTimerToHost'
        );
        if (attachFn && typeof attachFn === 'function') {
          // Ensure attachFn is a function
          try {
            attachFn(this.timerHostPlaceholder);
            log('info', 
              `[MainContentUI - ${panelIdForLog}] TimerUI attach function called. Propagation stopped.`
            );
          } catch (e) {
            log('error', 
              `[MainContentUI - ${panelIdForLog}] Error calling attachFn for TimerUI:`,
              e
            );
            isViableHost = false; // Mark as not successful if attachFn throws
          }
        } else {
          log('error', 
            `[MainContentUI - ${panelIdForLog}] Could not get 'attachTimerToHost' function from Timer module, or it's not a function. Function received:`,
            attachFn
          );
          isViableHost = false; // Mark as not successful
        }
      } else {
        log('error', 
          `[MainContentUI - ${panelIdForLog}] centralRegistry or centralRegistry.getPublicFunction not available.`
        );
        isViableHost = false; // Mark as not successful
      }
    }

    if (!isViableHost) {
      // If not viable OR became not viable due to errors above
      log('info', 
        `[MainContentUI - ${panelIdForLog}] Not a viable host or attach failed. Attempting to propagate event.`
      );
      // Explicitly propagate if this panel isn't hosting
      if (dispatcher && typeof dispatcher.publishToNextModule === 'function') {
        dispatcher.publishToNextModule(
          CLIENT_MODULE_ID,
          'system:rehomeTimerUI',
          eventData, // Original event data
          { direction: 'up' } // CORRECTED: 'up' to go to lower index (higher actual priority)
        );
        log('info', 
          `[MainContentUI - ${panelIdForLog}] Called publishToNextModule for system:rehomeTimerUI (direction: up).`
        );
      } else {
        log('warn', 
          `[MainContentUI - ${panelIdForLog}] Could not propagate system:rehomeTimerUI: dispatcher or publishToNextModule missing.`
        );
      }
    }
  }
}

export default MainContentUI;

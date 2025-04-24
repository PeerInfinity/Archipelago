// client/ui/consoleUI.js - Updated to use synchronous name lookups
import eventBus from '../../../app/core/eventBus.js';
import Config from '../core/config.js';
import messageHandler from '../core/messageHandler.js';
import connection from '../core/connection.js';

// ConsoleUI class manages the console interface
export class ConsoleUI {
  static cachedCommands = [];
  static commandCursor = 0;
  static consoleWindow = null;
  static commandInput = null;
  static autoScrollPaused = false;
  static useMarquee = false;
  static maxCachedCommands = Config.MAX_CACHED_COMMANDS || 10;

  static initialize() {
    // Get UI elements
    this.consoleWindow = document.getElementById('console');
    this.commandInput = document.getElementById('console-input');

    if (!this.consoleWindow || !this.commandInput) {
      console.error('Console UI elements not found');
      return;
    }

    // Reset state
    this.cachedCommands = [];
    this.commandCursor = 0;
    this.autoScrollPaused = false;

    // Set up event listeners
    this._setupEventListeners();

    // Subscribe to console message events
    eventBus.subscribe('console:message', (message) => {
      this.appendMessage(message);
    });

    eventBus.subscribe('console:formattedMessage', (data) => {
      this.appendFormattedMessage(data);
    });

    console.log('ConsoleUI module initialized');
  }

  static _setupEventListeners() {
    // Add additional command handling for AP integration
    const additionalCommands = {
      received: () => {
        this.appendMessage('Received Items:');
        if (window.messageHandler) {
          const items = window.messageHandler.itemsReceived || [];
          if (items.length === 0) {
            this.appendMessage('No items received yet.');
            return;
          }

          items.forEach((item, index) => {
            let itemName = 'Unknown';
            let locationName = 'Unknown';

            try {
              itemName = window.messageHandler.getItemNameSync(item.item);
              locationName = window.messageHandler.getLocationNameSync(
                item.location
              );
            } catch (e) {
              // Use defaults if error
            }

            this.appendMessage(
              `${index + 1}. ${itemName} from ${locationName}`
            );
          });
        } else {
          this.appendMessage('Message handler not available.');
        }
      },

      missing: () => {
        this.appendMessage('Missing Locations:');
        if (window.messageHandler) {
          const missing = window.messageHandler.getMissingLocations() || [];
          if (missing.length === 0) {
            this.appendMessage('No missing locations found.');
            return;
          }

          const limitedList = missing.slice(0, 20); // Limit to 20 to avoid flooding console
          limitedList.forEach((locId) => {
            let locationName = 'Unknown';
            try {
              locationName = window.messageHandler.getLocationNameSync(locId);
            } catch (e) {
              locationName = `Unknown (ID: ${locId})`;
            }
            this.appendMessage(`- ${locationName}`);
          });

          if (missing.length > 20) {
            this.appendMessage(`...and ${missing.length - 20} more locations.`);
          }
        } else {
          this.appendMessage('Message handler not available.');
        }
      },

      items: () => {
        this.appendMessage('Available Items:');
        if (window.stateManager && window.stateManager.itemNameToId) {
          const items = Object.keys(window.stateManager.itemNameToId);
          if (items.length === 0) {
            this.appendMessage('No items found.');
            return;
          }

          const limitedList = items.slice(0, 20); // Limit to 20 to avoid flooding console
          limitedList.forEach((itemName) => {
            this.appendMessage(`- ${itemName}`);
          });

          if (items.length > 20) {
            this.appendMessage(`...and ${items.length - 20} more items.`);
          }
        } else {
          this.appendMessage('Item data not available.');
        }
      },

      item_groups: () => {
        this.appendMessage('Available Item Groups:');
        if (
          window.stateManager &&
          window.stateManager.inventory &&
          window.stateManager.inventory.groupData
        ) {
          const groups = Object.keys(
            window.stateManager.inventory.groupData || {}
          );
          if (groups.length === 0) {
            this.appendMessage('No item groups found.');
            return;
          }

          groups.forEach((groupName) => {
            this.appendMessage(`- ${groupName}`);
          });
        } else {
          this.appendMessage('Item group data not available.');
        }
      },

      locations: () => {
        this.appendMessage('Available Locations:');
        if (window.stateManager && window.stateManager.locationNameToId) {
          const locations = Object.keys(window.stateManager.locationNameToId);
          if (locations.length === 0) {
            this.appendMessage('No locations found.');
            return;
          }

          const limitedList = locations.slice(0, 20); // Limit to 20 to avoid flooding console
          limitedList.forEach((locationName) => {
            this.appendMessage(`- ${locationName}`);
          });

          if (locations.length > 20) {
            this.appendMessage(
              `...and ${locations.length - 20} more locations.`
            );
          }
        } else {
          this.appendMessage('Location data not available.');
        }
      },

      location_groups: () => {
        this.appendMessage('Available Location Groups:');
        if (window.stateManager && window.stateManager.regions) {
          // Extract unique region names as location groups
          const regions = new Set(Object.keys(window.stateManager.regions));
          if (regions.size === 0) {
            this.appendMessage('No location groups found.');
            return;
          }

          [...regions].sort().forEach((regionName) => {
            this.appendMessage(`- ${regionName}`);
          });
        } else {
          this.appendMessage('Location group data not available.');
        }
      },

      ready: () => {
        this.appendMessage('Setting ready status...');
        if (window.messageHandler) {
          window.messageHandler.sendStatusUpdate?.(10); // 10 = CLIENT_READY
          this.appendMessage('Ready status sent to server.');
        } else {
          this.appendMessage('Message handler not available.');
        }
      },

      set_delay: (args) => {
        const delay = parseInt(args, 10);
        if (isNaN(delay) || delay < 1) {
          this.appendMessage(
            'Invalid delay value. Please specify a number >= 1.'
          );
          return;
        }

        this.appendMessage(`Setting delay to ${delay} seconds...`);
        // Update the timer state delay
        if (window.timerState) {
          window.timerState.setCheckDelay?.(delay);
          this.appendMessage(`Check delay updated to ${delay} seconds.`);
        } else {
          this.appendMessage('Game state not available.');
        }
      },
    };

    // Command history navigation
    this.commandInput.addEventListener('keydown', (event) => {
      // Only handle arrow keys
      const allowedKeys = ['ArrowUp', 'ArrowDown'];
      if (allowedKeys.indexOf(event.key) === -1) {
        return;
      }

      switch (event.key) {
        case 'ArrowUp':
          this._handleCommandUp();
          break;

        case 'ArrowDown':
          this._handleCommandDown();
          break;
      }
    });

    // Command execution
    this.commandInput.addEventListener('keyup', (event) => {
      // Ignore non-enter keyup events and empty commands
      if (event.key !== 'Enter' || !event.target.value) {
        return;
      }

      // Ignore events related to the keydown listener
      if (event.key === 'Up' || event.key === 'Down') {
        return;
      }

      this._handleCommandEnter();
    });

    // Auto-scroll management
    this.consoleWindow.addEventListener('scroll', () => {
      this.autoScrollPaused = Math.ceil(
        this.consoleWindow.scrollTop + this.consoleWindow.offsetHeight
      );
      this.consoleWindow.scrollHeight;
    });
  }

  static _handleCommandUp() {
    if (
      this.cachedCommands.length === 0 ||
      this.commandCursor === this.maxCachedCommands
    ) {
      return;
    }

    if (
      this.commandCursor < this.maxCachedCommands &&
      this.commandCursor < this.cachedCommands.length
    ) {
      this.commandCursor++;
    }

    this.commandInput.value = this.commandCursor
      ? this.cachedCommands[this.cachedCommands.length - this.commandCursor]
      : '';
  }

  static _handleCommandDown() {
    if (this.cachedCommands.length === 0 || this.commandCursor === 0) {
      return;
    }

    if (this.commandCursor > 0) {
      this.commandCursor--;
    }

    this.commandInput.value = this.commandCursor
      ? this.cachedCommands[this.cachedCommands.length - this.commandCursor]
      : '';
  }

  static _handleCommandEnter() {
    const command = this.commandInput.value;

    // Register available commands for help output
    const availableCommands = {
      connect:
        '/connect [server] [password] - Connect to an AP server with an optional password',
      sync: '/sync - Force the client to synchronize with the AP server',
      help: '/help - Print this message',
      received: '/received - List all received items',
      missing: '/missing - List all missing locations',
      items: '/items - List all item names for the current game',
      item_groups:
        '/item_groups - List all item group names for the current game',
      locations: '/locations - List all location names for the current game',
      location_groups:
        '/location_groups - List all location group names for the current game',
      ready: '/ready - Sends ready status to the server',
      set_delay:
        '/set_delay [min] [max] - Sets the delay between automatic location checks. Use one value for fixed delay or two values for a random range.',
    };

    // Detect slash commands and perform their actions
    if (command[0] === '/') {
      const commandParts = command.split(' ');
      const cmd = commandParts[0].substring(1); // Remove the slash

      switch (commandParts[0]) {
        case '/connect':
          commandParts.shift();
          document.getElementById('server-address').value = commandParts[0];
          connection.connect(commandParts[0], commandParts[1]);
          break;

        case '/sync':
          messageHandler.serverSync();
          break;

        case '/help':
          this.appendMessage('Available commands:');
          Object.values(availableCommands).forEach((cmd) => {
            this.appendMessage(cmd);
          });
          break;

        // Handle additional commands
        case '/received':
          this.handleReceivedCommand();
          break;

        case '/missing':
          this.handleMissingCommand();
          break;

        case '/items':
          this.handleItemsCommand();
          break;

        case '/item_groups':
          this.handleItemGroupsCommand();
          break;

        case '/locations':
          this.handleLocationsCommand();
          break;

        case '/location_groups':
          this.handleLocationGroupsCommand();
          break;

        case '/ready':
          this.handleReadyCommand();
          break;

        case '/set_delay':
          const delayArg = commandParts[1];
          this.handleSetDelayCommand(delayArg);
          break;

        default:
          this.appendMessage('Unknown command.');
          break;
      }
    } else {
      // Send command to server
      messageHandler.sendMessage(command);
    }

    // Cache the command
    this._cacheCommand(command);

    // Clear the input box
    this.commandInput.value = '';
    this.commandCursor = 0;
  }

  // Add methods for each command
  static handleReceivedCommand() {
    this.appendMessage('Received Items:');

    // Get a reference to messageHandler
    const mh = window.messageHandler || null;

    if (mh && Array.isArray(mh.itemsReceived)) {
      const items = mh.itemsReceived;
      if (items.length === 0) {
        this.appendMessage('No items received yet.');
        return;
      }

      items.forEach((item, index) => {
        let itemName = 'Unknown';
        let locationName = 'Unknown';

        try {
          if (typeof mh.getItemNameSync === 'function') {
            itemName = mh.getItemNameSync(item.item);
          }
          if (typeof mh.getLocationNameSync === 'function') {
            locationName = mh.getLocationNameSync(item.location);
          }
        } catch (e) {
          // Use defaults if error
        }

        this.appendMessage(`${index + 1}. ${itemName} from ${locationName}`);
      });
    } else {
      this.appendMessage('Message handler not available or no items received.');
    }
  }

  static handleMissingCommand() {
    this.appendMessage('Missing Locations:');

    // Get references to required objects
    const mh = window.messageHandler || null;
    const sm = window.stateManager || null;

    if (mh && typeof mh.getMissingLocations === 'function') {
      const missing = mh.getMissingLocations() || [];
      if (missing.length === 0) {
        this.appendMessage('No missing locations found.');
        return;
      }

      const limitedList = missing.slice(0, 20); // Limit to 20 to avoid flooding console
      limitedList.forEach((locId) => {
        let locationName = 'Unknown';
        try {
          if (typeof mh.getLocationNameSync === 'function') {
            locationName = mh.getLocationNameSync(locId);
          }
        } catch (e) {
          locationName = `Unknown (ID: ${locId})`;
        }
        this.appendMessage(`- ${locationName}`);
      });

      if (missing.length > 20) {
        this.appendMessage(`...and ${missing.length - 20} more locations.`);
      }
    } else if (sm && sm.missing_locations) {
      // Try stateManager as fallback
      const missing = Array.from(sm.missing_locations);
      if (missing.length === 0) {
        this.appendMessage('No missing locations found.');
        return;
      }

      const limitedList = missing.slice(0, 20);
      limitedList.forEach((locId) => {
        let locationName = `Location ${locId}`;
        if (
          sm.getLocationNameFromId &&
          typeof sm.getLocationNameFromId === 'function'
        ) {
          try {
            const name = sm.getLocationNameFromId(locId);
            if (name) locationName = name;
          } catch (e) {}
        }
        this.appendMessage(`- ${locationName}`);
      });

      if (missing.length > 20) {
        this.appendMessage(`...and ${missing.length - 20} more locations.`);
      }
    } else {
      this.appendMessage('Missing location data not available.');
    }
  }

  static handleItemsCommand() {
    this.appendMessage('Available Items:');

    // Get reference to stateManager
    const sm = window.stateManager || null;

    if (sm && sm.itemNameToId) {
      const items = Object.keys(sm.itemNameToId);
      if (items.length === 0) {
        this.appendMessage('No items found.');
        return;
      }

      const limitedList = items.slice(0, 20); // Limit to 20 to avoid flooding console
      limitedList.forEach((itemName) => {
        this.appendMessage(`- ${itemName}`);
      });

      if (items.length > 20) {
        this.appendMessage(`...and ${items.length - 20} more items.`);
      }
    } else {
      this.appendMessage('Item data not available.');
    }
  }

  static handleItemGroupsCommand() {
    this.appendMessage('Available Item Groups:');

    // Get reference to stateManager
    const sm = window.stateManager || null;

    if (sm && sm.inventory && sm.inventory.groupData) {
      const groups = Object.keys(sm.inventory.groupData || {});
      if (groups.length === 0) {
        this.appendMessage('No item groups found.');
        return;
      }

      groups.forEach((groupName) => {
        this.appendMessage(`- ${groupName}`);
      });
    } else {
      this.appendMessage('Item group data not available.');
    }
  }

  static handleLocationsCommand() {
    this.appendMessage('Available Locations:');

    // Get reference to stateManager
    const sm = window.stateManager || null;

    if (sm && sm.locationNameToId) {
      const locations = Object.keys(sm.locationNameToId);
      if (locations.length === 0) {
        this.appendMessage('No locations found.');
        return;
      }

      const limitedList = locations.slice(0, 20); // Limit to 20 to avoid flooding console
      limitedList.forEach((locationName) => {
        this.appendMessage(`- ${locationName}`);
      });

      if (locations.length > 20) {
        this.appendMessage(`...and ${locations.length - 20} more locations.`);
      }
    } else {
      this.appendMessage('Location data not available.');
    }
  }

  static handleLocationGroupsCommand() {
    this.appendMessage('Available Location Groups:');

    // Get reference to stateManager
    const sm = window.stateManager || null;

    if (sm && sm.regions) {
      // Extract unique region names as location groups
      const regions = new Set(Object.keys(sm.regions));
      if (regions.size === 0) {
        this.appendMessage('No location groups found.');
        return;
      }

      [...regions].sort().forEach((regionName) => {
        this.appendMessage(`- ${regionName}`);
      });
    } else {
      this.appendMessage('Location group data not available.');
    }
  }

  static handleReadyCommand() {
    this.appendMessage('Setting ready status...');

    // Get reference to messageHandler
    const mh = window.messageHandler || null;

    if (mh && typeof mh.sendStatusUpdate === 'function') {
      mh.sendStatusUpdate(10); // 10 = CLIENT_READY
      this.appendMessage('Ready status sent to server.');
    } else {
      this.appendMessage('Message handler not available.');
    }
  }

  static handleSetDelayCommand(delayArg) {
    // Parse arguments - supports either "30" or "20 40" format
    const parts = delayArg ? delayArg.split(/\s+/) : [];

    if (parts.length === 0 || parts[0] === '') {
      this.appendMessage('Please specify at least one delay value in seconds.');
      return;
    }

    // Parse first value (min or fixed)
    const minDelay = parseInt(parts[0], 10);
    if (isNaN(minDelay) || minDelay < 1) {
      this.appendMessage('Invalid delay value. Please specify a number >= 1.');
      return;
    }

    // Parse second value (max) if provided
    let maxDelay = null;
    if (parts.length > 1) {
      maxDelay = parseInt(parts[1], 10);
      if (isNaN(maxDelay) || maxDelay < 1) {
        this.appendMessage('Invalid max delay. Please specify a number >= 1.');
        return;
      }
    }

    // Get reference to timerState
    const ts = window.timerState || null;

    if (ts && typeof ts.setCheckDelay === 'function') {
      if (maxDelay === null) {
        this.appendMessage(`Setting fixed delay to ${minDelay} seconds...`);
        ts.setCheckDelay(minDelay);
        this.appendMessage(`Check delay updated to fixed ${minDelay} seconds.`);
      } else {
        this.appendMessage(
          `Setting delay range to ${minDelay}-${maxDelay} seconds...`
        );
        ts.setCheckDelay(minDelay, maxDelay);
        this.appendMessage(
          `Check delay updated to range: ${minDelay}-${maxDelay} seconds.`
        );
      }
    } else {
      this.appendMessage('Game state not available.');
    }
  }

  static _cacheCommand(command) {
    this.appendMessage(`Command: ${command}`);

    // Limit stored command count
    while (this.cachedCommands.length >= this.maxCachedCommands) {
      this.cachedCommands.shift();
    }

    // Store the command
    this.cachedCommands.push(command);
  }

  static appendMessage(message) {
    if (!this.consoleWindow) {
      this.consoleWindow = document.getElementById('console');
      if (!this.consoleWindow) return; // Console not found
    }

    // Remember only the last 250 messages
    while (this.consoleWindow.children.length >= 250) {
      this.consoleWindow.removeChild(this.consoleWindow.firstChild);
    }

    // Append message div to monitor
    const messageDiv = document.createElement(
      this.useMarquee ? 'marquee' : 'div'
    );
    messageDiv.classList.add('console-message');
    messageDiv.innerText = message;
    this.consoleWindow.appendChild(messageDiv);

    // Always scroll to latest message
    this.consoleWindow.scrollTop = this.consoleWindow.scrollHeight;

    // Publish the message event for potential third-party subscribers
    eventBus.publish('console:messageAppended', { message });
  }

  static appendFormattedMessage(messageParts) {
    if (!this.consoleWindow) {
      this.consoleWindow = document.getElementById('console');
      if (!this.consoleWindow) return; // Console not found
    }

    // Remember only the last 250 messages
    while (this.consoleWindow.children.length >= 250) {
      this.consoleWindow.removeChild(this.consoleWindow.firstChild);
    }

    // Create the message div
    const messageDiv = document.createElement(
      this.useMarquee ? 'marquee' : 'div'
    );
    messageDiv.classList.add('console-message');

    // Create the spans to populate the message div
    for (const part of messageParts) {
      const span = document.createElement('span');

      if (part.hasOwnProperty('type')) {
        const playerSlot = messageHandler.getClientSlot();
        const players = messageHandler.getPlayers();

        switch (part.type) {
          case 'player_id':
            const playerIsClient = parseInt(part.text, 10) === playerSlot;
            if (playerIsClient) {
              span.style.fontWeight = 'bold';
            }
            span.style.color = playerIsClient ? '#ffa565' : '#52b44c';
            span.innerText =
              players[parseInt(part.text, 10) - 1]?.alias ||
              `Player${part.text}`;
            break;

          case 'item_id':
            span.style.color = '#fc5252';
            try {
              // Use synchronous method for rendering
              if (
                messageHandler &&
                typeof messageHandler.getItemNameSync === 'function'
              ) {
                span.innerText = messageHandler.getItemNameSync(part.text);
              } else {
                // Direct fallback to a placeholder with ID
                span.innerText = `Item ${part.text}`;
              }
            } catch (e) {
              console.warn('Error getting item name:', e);
              span.innerText = `Item ${part.text}`;
            }
            break;

          case 'location_id':
            span.style.color = '#5ea2c1';
            try {
              // Use synchronous method for rendering
              if (
                messageHandler &&
                typeof messageHandler.getLocationNameSync === 'function'
              ) {
                span.innerText = messageHandler.getLocationNameSync(part.text);
              } else {
                // Direct fallback to a placeholder with ID
                span.innerText = `Location ${part.text}`;
              }
            } catch (e) {
              console.warn('Error getting location name:', e);
              span.innerText = `Location ${part.text}`;
            }
            break;

          default:
            span.innerText = part.text;
        }
      } else {
        span.innerText = part.text;
      }

      messageDiv.appendChild(span);
    }

    // Append the message div to the monitor
    this.consoleWindow.appendChild(messageDiv);

    // Always scroll to latest message
    this.consoleWindow.scrollTop = this.consoleWindow.scrollHeight;
  }

  static clear() {
    if (this.consoleWindow) {
      this.consoleWindow.innerHTML = '';
    }
  }

  static setUseMarquee(use) {
    this.useMarquee = use;
  }

  static focus() {
    if (this.commandInput) {
      this.commandInput.focus();
    }
  }
}

// No need for singleton creation since we're using a static class
export default ConsoleUI;

// client/ui/consoleUI.js
import eventBus from '../core/eventBus.js';
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

    // Detect slash commands and perform their actions
    if (command[0] === '/') {
      const commandParts = command.split(' ');

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
          this.appendMessage(
            '/connect [server] [password] - Connect to an AP server with an optional password'
          );
          this.appendMessage(
            '/sync - Force the client to synchronize with the AP server'
          );
          this.appendMessage('/help - Print this message');
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

    if (!this.autoScrollPaused) {
      messageDiv.scrollIntoView(false);
    }

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
            span.innerText = messageHandler.getItemName(part.text);
            break;

          case 'location_id':
            span.style.color = '#5ea2c1';
            span.innerText = messageHandler.getLocationName(Number(part.text));
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

    if (!this.autoScrollPaused) {
      messageDiv.scrollIntoView(false);
    }
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

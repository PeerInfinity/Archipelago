// client/app.js
import Config from './core/config.js';
import storage from './core/storage.js';
import eventBus from './core/eventBus.js';
import connection from './core/connection.js';
import messageHandler from './core/messageHandler.js';
import gameState from './core/gameState.js';
import locationManager from './core/locationManager.js';
import ConsoleUI from './ui/consoleUI.js';
import ProgressUI from './ui/progressUI.js';

/**
 * Main application controller for the client modules.
 * Initializes all modules in the correct order and sets up event listeners.
 */
class App {
  constructor() {
    console.log('Initializing client modules...');
  }

  /**
   * Initialize all modules in dependency order
   */
  initialize() {
    try {
      // Core modules first
      storage.initialize();
      eventBus.initialize();
      connection.initialize();
      messageHandler.initialize();
      locationManager.initialize();
      gameState.initialize();

      // UI modules next
      ConsoleUI.initialize();
      ProgressUI.initialize();

      // Set up event listeners
      this._setupEventListeners();

      console.log('Client modules initialized successfully');
    } catch (error) {
      console.error('Error initializing client modules:', error);
    }
  }

  /**
   * Set up event listeners for the application
   * @private
   */
  _setupEventListeners() {
    // Handle server address change
    const serverAddressInput = document.getElementById('server-address');
    if (serverAddressInput) {
      serverAddressInput.addEventListener('keydown', async (event) => {
        if (event.key !== 'Enter') {
          return;
        }

        // If the input value is empty, do not attempt to reconnect
        if (!event.target.value) {
          connection.disconnect();
          return;
        }

        // User specified a server. Attempt to connect
        connection.connect(event.target.value);
      });
    }

    // Handle connection events
    eventBus.subscribe('connection:open', (data) => {
      console.log(`Connected to server: ${data.serverAddress}`);
    });

    eventBus.subscribe('connection:close', () => {
      const serverStatus = document.getElementById('server-status');
      if (serverStatus) {
        serverStatus.classList.remove('green');
        serverStatus.innerText = 'Not Connected';
        serverStatus.classList.add('red');
      }

      // Disable game controls
      ProgressUI.enableControls(false);
    });

    eventBus.subscribe('connection:error', (data) => {
      console.error('Connection error:', data.message);
      ConsoleUI.appendMessage(`Error: ${data.message}`);
    });

    eventBus.subscribe('connection:reconnecting', (data) => {
      ConsoleUI.appendMessage(
        `Connection to AP server lost. Attempting to reconnect ` +
          `(${data.attempt} of ${data.maxAttempts})`
      );
    });

    eventBus.subscribe('connection:refused', (data) => {
      const serverStatus = document.getElementById('server-status');
      if (serverStatus) {
        serverStatus.classList.remove('green');
        serverStatus.innerText = 'Not Connected';
        serverStatus.classList.add('red');
      }

      if (data.errors.includes('InvalidPassword')) {
        ConsoleUI.appendMessage(
          'This server requires a password. Please use /connect [server] [password] to connect.'
        );
      } else {
        ConsoleUI.appendMessage(
          `Error while connecting to AP server: ${data.errors.join(', ')}.`
        );
      }
    });

    // Handle game events
    eventBus.subscribe('game:connected', (data) => {
      const serverStatus = document.getElementById('server-status');
      if (serverStatus) {
        serverStatus.classList.remove('red');
        serverStatus.innerText = 'Connected';
        serverStatus.classList.add('green');
      }

      ConsoleUI.appendMessage(
        `Successfully connected to the server as ${
          data.players[data.slot - 1]?.alias || 'Player' + data.slot
        }`
      );
      ConsoleUI.appendMessage(`Team: ${data.team}, Slot: ${data.slot}`);
      ConsoleUI.appendMessage(
        `${data.checkedLocations.length} locations checked, ${data.missingLocations.length} remaining`
      );
    });

    // Cookie message controller
    const cookieMessage = document.getElementById('cookie-message');
    if (cookieMessage && !storage.getItem('cookie-notice')) {
      cookieMessage.style.display = 'flex';
      cookieMessage.addEventListener('click', () => {
        storage.setItem('cookie-notice', '1');
        cookieMessage.style.display = 'none';
      });
    }
  }
}

// Create an instance and initialize immediately
const app = new App();
app.initialize();

// Export the instance for potential external use
export default app;

// client/app.js - Updated to properly initialize mappings
import Config from './core/config.js';
import storage from './core/storage.js';
import eventBus from './core/eventBus.js';
import connection from './core/connection.js';
import messageHandler from './core/messageHandler.js';
import { gameState } from './core/gameState.js'; // Updated to use named import
import locationManager from './core/locationManager.js';
import ConsoleUI from './ui/consoleUI.js';
import ProgressUI from './ui/progressUI.js';
import { loadMappingsFromStorage } from './utils/idMapping.js';

/**
 * Main application controller for the client modules.
 * Initializes all modules in the correct order and sets up event listeners.
 */
class App {
  constructor() {
    console.log('Initializing client modules...');
    this.stateManager = null;
  }

  /**
   * Initialize all modules in dependency order
   */
  async initialize() {
    try {
      // Load stateManager first
      await this._initializeStateManager();

      // Core modules next
      storage.initialize();
      eventBus.initialize();
      connection.initialize();

      // Load data package mappings before messageHandler initialization
      this._loadDataPackageMappings();

      // Initialize remaining modules
      messageHandler.initialize();
      locationManager.initialize();

      // Initialize gameState (now using the instance)
      if (gameState) {
        // Call the initialize method through the instance
        gameState.initialize();
      } else {
        console.warn('gameState instance not available');
      }

      // UI modules next
      ConsoleUI.initialize();
      ProgressUI.initialize();

      // Directly enable buttons if we have loaded rules
      setTimeout(() => {
        // Enable buttons after a short delay to ensure everything is initialized
        const controlButton = document.getElementById('control-button');
        const quickCheckButton = document.getElementById('quick-check-button');

        if (controlButton) {
          controlButton.removeAttribute('disabled');
        }

        if (quickCheckButton) {
          quickCheckButton.removeAttribute('disabled');
        }

        console.log('Control buttons enabled on startup');
      }, 500);

      // Set up event listeners
      this._setupEventListeners();

      console.log('Client modules initialized successfully');
    } catch (error) {
      console.error('Error initializing client modules:', error);
    }
  }

  /**
   * Initialize stateManager
   * @private
   */
  async _initializeStateManager() {
    try {
      // Try to pre-initialize with cached data package
      await this._preInitializeClient();

      // Import stateManager
      const module = await import('../app/core/stateManagerSingleton.js');
      this.stateManager = module.default;

      // Give access to other modules
      window.stateManager = this.stateManager;

      console.log('StateManager loaded successfully');
      return true;
    } catch (error) {
      console.error('Error initializing stateManager:', error);
      return false;
    }
  }

  /**
   * Load mappings from data package
   * @private
   */
  _loadDataPackageMappings() {
    try {
      if (loadMappingsFromStorage()) {
        console.log('Successfully loaded mappings from cached data package');
      } else {
        console.log(
          'No cached data package available, will request from server when connected'
        );
      }
    } catch (error) {
      console.warn('Error loading data package mappings:', error);
    }
  }

  /**
   * Pre-initialize the client with data from storage
   */
  async _preInitializeClient() {
    // Try to load data package from storage
    try {
      const dataPackageStr = localStorage.getItem('dataPackage');
      if (dataPackageStr) {
        const dataPackage = JSON.parse(dataPackageStr);
        console.log('Pre-initialized client with cached data package');
        return true;
      }
    } catch (e) {
      console.warn('Error pre-initializing client:', e);
    }

    return false;
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

      if (data.errors && data.errors.includes('InvalidPassword')) {
        ConsoleUI.appendMessage(
          'This server requires a password. Please use /connect [server] [password] to connect.'
        );
      } else if (data.errors) {
        ConsoleUI.appendMessage(
          `Error while connecting to AP server: ${data.errors.join(', ')}.`
        );
      } else {
        ConsoleUI.appendMessage('Connection refused by the server.');
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

      // Enable controls
      ProgressUI.enableControls(true);
    });

    // Listen for data package events to initialize mappings
    eventBus.subscribe('game:dataPackageReceived', (dataPackage) => {
      console.log('Data package received, updating client...');
    });

    // Set up Death Link tracking if needed
    this._setupDeathLink();

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

  /**
   * Set up Death Link functionality
   * @private
   */
  _setupDeathLink() {
    // Death Link is simpler now - just listen for bounced events
    eventBus.subscribe('game:bounced', (data) => {
      // Check if this is a DeathLink message
      if (data.tags && data.tags.includes('DeathLink') && data.data) {
        const deathData = data.data;

        // Process death link
        const text = deathData.cause || '';
        if (text) {
          console.log(`DeathLink: ${text}`);
          ConsoleUI.appendMessage(`DeathLink: ${text}`);
        } else {
          console.log(`DeathLink received from ${deathData.source}`);
          ConsoleUI.appendMessage(
            `DeathLink received from ${deathData.source}`
          );
        }

        // Trigger any UI updates or game effects here
        eventBus.publish('game:deathLink', deathData);
      }
    });
  }
}

// Create an instance and initialize immediately
const app = new App();
app.initialize();

// Export the instance for potential external use
export default app;

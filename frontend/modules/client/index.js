// Core client logic and singletons
import connection from './core/connection.js';
import messageHandler from './core/messageHandler.js';
import storage from './core/storage.js';
import timerState from './core/timerState.js';
import locationManager from './core/locationManager.js';
import Config from './core/config.js';

// UI Components
import MainContentUI from './ui/mainContentUI.js';
import ConsoleUI from './ui/consoleUI.js';
import ProgressUI from './ui/progressUI.js';

// Utils
import { loadMappingsFromStorage } from './utils/idMapping.js';

// Main application
import app from './app.js';

// Store module context for later use
let moduleInitApi = null;
let moduleDispatcher = null;
let mainContentInstance = null;

/**
 * Registration function for the Client module.
 * Registers the main panel component and any settings schemas.
 */
export function register(registrationApi) {
  console.log('[Client Module] Registering...');

  // Register the main panel component factory
  registrationApi.registerPanelComponent('mainContentPanel', (container) => {
    // Golden Layout V2 provides the container. We manage the instance.
    if (!mainContentInstance) {
      mainContentInstance = new MainContentUI();
    }
    // Ensure elements are initialized within the provided container
    mainContentInstance.initializeElements(container.element);
    return {
      element: mainContentInstance.getRootElement(),
    };
  });

  // Register settings schema for client module
  registrationApi.registerSettingsSchema({
    type: 'object',
    properties: {
      defaultServer: {
        type: 'string',
        format: 'uri',
        default: 'ws://localhost:38281',
      },
      autoConnect: {
        type: 'boolean',
        default: true,
      },
      maxReconnectAttempts: {
        type: 'integer',
        default: 10,
        minimum: 1,
        maximum: 50,
      },
    },
  });

  // Register event handlers this module handles
  registrationApi.registerEventHandler('network:connectRequest', (data) => {
    connection.connect(data.serverAddress, data.password);
  });

  registrationApi.registerEventHandler('network:disconnectRequest', () => {
    connection.disconnect();
  });
}

/**
 * Initialization function for the Client module.
 * Initializes core logic like connection, message handling, console.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Client Module] Initializing with priority ${priorityIndex}...`);

  // Store references for later use
  moduleInitApi = initializationApi;
  moduleDispatcher = initializationApi.getDispatcher();
  const settings = await initializationApi.getSettings();
  const eventBus = initializationApi.getEventBus();

  // Make sure eventBus is accessible globally
  window.eventBus = eventBus;

  // Initialize the core singletons
  storage.initialize();
  connection.initialize();

  // Load cached data package mappings if available
  try {
    loadMappingsFromStorage();
  } catch (error) {
    console.warn('[Client Module] Error loading data package mappings:', error);
  }

  // Initialize remaining core services
  messageHandler.initialize();
  locationManager.initialize();

  if (timerState) {
    timerState.initialize();
  }

  // Initialize UI components - will be fully activated when attached to DOM
  ConsoleUI.initialize();
  // ProgressUI.initialize(); // Moved to PanelManager wrapper for mainContentPanel

  // Try to initialize the app (will load stateManager etc.)
  try {
    // The app is already being initialized in its own file
    // Just log success
    console.log('[Client Module] App initialized successfully');
  } catch (error) {
    console.error('[Client Module] Failed to initialize app:', error);
  }

  // Make important instances available globally for debugging and legacy code
  window.connection = connection;
  window.messageHandler = messageHandler;
  window.ConsoleUI = ConsoleUI;
  window.ProgressUI = ProgressUI;

  // Set up event listeners on eventBus for connection status changes
  eventBus.subscribe('connection:statusChanged', (status) => {
    console.log(`[Client Module] Connection status changed: ${status}`);
  });

  // Auto-connect to default server if configured
  if (settings?.autoConnect && settings?.defaultServer) {
    console.log(`[Client Module] Auto-connecting to ${settings.defaultServer}`);
    connection.connect(settings.defaultServer);
  }

  console.log('[Client Module] Initialization complete.');
}

// Export core singletons for other modules to import directly if needed
export {
  connection,
  messageHandler,
  ConsoleUI,
  ProgressUI,
  storage,
  timerState,
  locationManager,
};

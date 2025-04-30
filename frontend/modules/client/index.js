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
// import app from './app.js';
// REMOVED: Import for loadAndProcessDefaultRules
// import { loadAndProcessDefaultRules } from './app.js';

// Store module context for later use
let moduleInitApi = null;
let moduleDispatcher = null;
let mainContentInstance = null;

// --- Module Info ---
export const moduleInfo = {
  name: 'Console & Status',
  description: 'Network connection, console, status.',
};

/**
 * Registration function for the Client module.
 * Registers the main panel component and any settings schemas.
 */
export function register(registrationApi) {
  console.log('[Client Module] Registering...');

  // Register the main panel component factory
  // registrationApi.registerPanelComponent('mainContentPanel', (container) => {
  //   // Golden Layout V2 provides the container. We manage the instance.
  //   if (!mainContentInstance) {
  //     mainContentInstance = new MainContentUI();
  //   }
  //   // Let the PanelManager wrapper handle element initialization and retrieval
  //   // Ensure the instance is ready before returning
  //   // mainContentInstance.initializeElements(container.element); // This might be handled by the wrapper now

  //   // *** FIX: Return the instance itself ***
  //   return mainContentInstance;
  // });
  // Pass the class constructor directly
  registrationApi.registerPanelComponent('mainContentPanel', MainContentUI);

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

  // Register network event handlers using the dispatcher receiver with null details
  registrationApi.registerDispatcherReceiver(
    'network:connectRequest',
    (data) => {
      console.log('[Client Module] Received network:connectRequest', data);
      // Call the actual connect function
      connectToServer(
        data?.serverUrl ||
          settingsManager.getModuleSetting('client', 'defaultServer')
      );
    },
    null
  );

  registrationApi.registerDispatcherReceiver(
    'network:disconnectRequest',
    () => {
      console.log('[Client Module] Received network:disconnectRequest');
      // Call the actual disconnect function
      disconnectFromServer();
    }
  );
}

/**
 * Initialization function for the Client module.
 * Initializes core logic like connection, message handling, console.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Client Module] Initializing with priority ${priorityIndex}...`);

  // Store references needed during post-initialization
  moduleInitApi = initializationApi;
  moduleDispatcher = initializationApi.getDispatcher();

  // Make eventBus globally accessible early (if not already done elsewhere)
  window.eventBus = initializationApi.getEventBus();

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

  // Initialize basic UI components
  ConsoleUI.initialize();

  // Make important instances available globally for debugging and legacy code
  window.connection = connection;
  window.messageHandler = messageHandler;
  window.ConsoleUI = ConsoleUI;
  window.ProgressUI = ProgressUI; // Keep ProgressUI available if needed

  console.log('[Client Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Client module.
 * Sets up event listeners and performs auto-connect.
 */
export async function postInitialize(initializationApi) {
  console.log('[Client Module] Post-initializing...');

  const settings = await initializationApi.getAllSettings();
  const eventBus = initializationApi.getEventBus();

  // Set up event listeners on eventBus for connection status changes
  eventBus.subscribe('connection:statusChanged', (status) => {
    console.log(`[Client Module] Connection status changed: ${status}`);
    // Add any UI updates or further logic needed here
  });
  console.log('[Client Module] Subscribed to connection status changes.');

  // Auto-connect to default server if configured
  if (settings?.autoConnect && settings?.defaultServer) {
    console.log(
      `[Client Module] Auto-connecting to ${settings.defaultServer}...`
    );
    // Use the registered handler via dispatcher if appropriate, or connect directly
    // Assuming direct connection is fine here as it's an initial setup action
    connection.connect(settings.defaultServer);
  }

  console.log('[Client Module] Post-initialization complete.');
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

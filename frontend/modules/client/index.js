// client/index.js - TEMPORARILY SIMPLIFIED FOR DEBUGGING

import MainContentUI from './ui/mainContentUI.js';
import storage from './core/storage.js';
import connection from './core/connection.js';
import { loadMappingsFromStorage } from './utils/idMapping.js';
import messageHandler from './core/messageHandler.js';
import LocationManager from './core/locationManager.js';
import timerState from './core/timerState.js'; // Import timerState singleton
// import {
//   initializeTimerState,
//   attachLoopModeListeners,
// } from './core/timerState.js'; // Commented out
// import ProgressUI from './ui/progressUI.js'; // REMOVED Import

// --- Module Info --- //
export const moduleInfo = {
  name: 'Client',
  description: 'Handles Archipelago client connection and communication.',
};

// --- Settings Schema --- //
// const settingsSchema = {
//   clientSettings: {
//     connection: {
//       serverAddress: {
//         type: 'text',
//         label: 'Server Address',
//         default: 'ws://localhost:38281',
//         description: 'WebSocket address of the Archipelago server.',
//       },
//       password: {
//         type: 'password',
//         label: 'Server Password',
//         default: '',
//         description: 'Password for the Archipelago server (if required).',
//       },
//     },
//     timing: {
//       minCheckDelay: {
//         type: 'number',
//         label: 'Min Check Delay (s)',
//         default: 30,
//         min: 1,
//         description: 'Minimum time before the client checks a location.',
//       },
//       maxCheckDelay: {
//         type: 'number',
//         label: 'Max Check Delay (s)',
//         default: 60,
//         min: 1,
//         description: 'Maximum time before the client checks a location.',
//       },
//     },
//   },
// };

// Store core API references received during initialization
let moduleEventBus = null;
let coreStorage = null;
let coreConnection = null;
let coreMessageHandler = null;
let coreLocationManager = LocationManager;
let coreTimerState = timerState; // Store timerState singleton reference

// --- Dispatcher Handlers (Defined before register to ensure availability) --- //
// Note: These handlers now implicitly use the module-level variables
// (moduleEventBus, coreStorage, coreConnection) set during initialize.
// This assumes initialize runs before any events are dispatched to these handlers.
async function handleConnectRequest(data) {
  // Context argument removed for simplicity for now
  console.log('[Client Module] Received connect request via dispatcher.');
  if (!coreStorage || !coreConnection) {
    console.error(
      '[Client Module] Cannot handle connect: Core components not initialized.'
    );
    return;
  }

  // Get settings directly from the module settings potentially?
  // Or rely on coreStorage if it holds the relevant connection settings.
  let settings = {};
  try {
    // Example: Assume connection settings are stored via coreStorage
    const storedSettings = coreStorage.getItem('clientSettings');
    if (storedSettings) settings = JSON.parse(storedSettings);
  } catch (e) {
    console.error('[Client Module] Error reading settings from storage:', e);
  }

  // Use provided data if available, otherwise use stored settings
  const connectAddress =
    data?.serverAddress || settings?.connection?.serverAddress;
  const connectPassword = data?.password || settings?.connection?.password;

  if (connectAddress) {
    coreConnection.connect(connectAddress, connectPassword);
  } else {
    console.warn(
      '[Client Module] Cannot connect: Connection settings not found.'
    );
    if (moduleEventBus) {
      moduleEventBus.publish('error:client', {
        message: 'Connection settings not found.',
      });
    } else {
      console.error(
        '[Client Module] Cannot publish error: moduleEventBus not available.'
      );
    }
  }
}

function handleDisconnectRequest(data) {
  // Context removed
  console.log('[Client Module] Received disconnect request via dispatcher.');
  if (!coreConnection) {
    console.error(
      '[Client Module] Cannot handle disconnect: Core connection not initialized.'
    );
    return;
  }
  coreConnection.disconnect();
}

// --- Registration --- //
export function register(registrationApi) {
  console.log('[Client Module] Registering...');

  // Register panel component with the CLASS CONSTRUCTOR directly
  registrationApi.registerPanelComponent(
    'clientPanel',
    MainContentUI // Pass the class constructor
  );

  // Register dispatcher listeners using registrationApi
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name, // Associate receiver with this module
    'network:connectRequest',
    handleConnectRequest // Pass the handler function directly
  );
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'network:disconnectRequest',
    handleDisconnectRequest
  );

  // Register settings schema if applicable (uncomment if needed)
  // registrationApi.registerSettingsSchema(moduleInfo.name, settingsSchema);

  // Register EventBus publisher intentions if this module publishes
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'error:client');
  // Add other events published by MainContentUI
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'network:disconnectRequest'
  );
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'network:connectRequest'
  );
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'control:start');
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'control:quickCheck'
  );
}

// --- Initialization --- //
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Client Module] Initializing with priority ${priorityIndex}...`);

  // Get core APIs from the initializationApi
  moduleEventBus = initializationApi.getEventBus();
  const moduleSettings = await initializationApi.getModuleSettings(moduleId);

  // Store references
  coreStorage = storage;
  coreConnection = connection;
  coreMessageHandler = messageHandler;

  // Initialize core components and inject dependencies
  coreStorage.initialize();
  coreConnection.initialize();
  coreConnection.setEventBus(moduleEventBus);
  coreMessageHandler.initialize();
  coreMessageHandler.setEventBus(moduleEventBus);
  coreLocationManager.initialize();
  coreLocationManager.setEventBus(moduleEventBus);
  coreTimerState.initialize(); // Initialize timer state
  coreTimerState.setEventBus(moduleEventBus); // Inject eventBus into timer state
  loadMappingsFromStorage();

  console.log('[Client Module] Core components initialized.');
  console.log('[Client Module] Settings retrieved:', moduleSettings);

  // Apply settings if needed (example)
  // if (moduleSettings?.timing) {
  //   console.log('[Client Module] Timing settings found:', moduleSettings.timing);
  // }

  console.log('[Client Module] Initialization complete.');

  // Return cleanup function
  return () => {
    console.log('[Client Module] Cleaning up... (Placeholder)');
    coreConnection?.disconnect?.();
    coreLocationManager?.dispose?.();
    coreTimerState?.dispose?.(); // Call timerState dispose
    // Add cleanup for storage, messageHandler etc.
    moduleEventBus = null;
    coreStorage = null;
    coreConnection = null;
    coreMessageHandler = null;
    coreTimerState = null; // Clear timerState reference
  };
}

// --- Dispatcher Handlers --- //
// REMOVED DUPLICATE DEFINITIONS - These are now defined before the register function.
// async function handleConnectRequest(data) { ... }
// function handleDisconnectRequest(data) { ... }

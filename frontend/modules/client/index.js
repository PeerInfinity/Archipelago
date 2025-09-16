// client/index.js - TEMPORARILY SIMPLIFIED FOR DEBUGGING

import MainContentUI from './ui/mainContentUI.js';
import storage from './core/storage.js';
import connection from './core/connection.js';
import { loadMappingsFromStorage } from './utils/idMapping.js';
import messageHandler, {
  handleUserLocationCheckForClient,
  handleUserItemCheckForClient,
} from './core/messageHandler.js';
import LocationManager from './core/locationManager.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('clientModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[clientModule] ${message}`, ...data);
  }
}

// import timerState from './core/timerState.js'; // Removed
// import {
//   initializeTimerState,
//   attachLoopModeListeners,
// } from './core/timerState.js'; // Commented out
// import ProgressUI from './ui/progressUI.js'; // REMOVED Import

// --- Module Info --- //
export const moduleInfo = {
  name: 'client',
  title: 'Console',
  componentType: 'clientPanel',
  icon: '💻',
  column: 2, // Middle column,
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
let coreMessageHandler = messageHandler;
let coreLocationManager = LocationManager;
// let coreTimerState = timerState; // Removed
let moduleDispatcher = null; // Renamed from 'dispatcher' for clarity and consistency
// let clientModuleLoadPriority = -1; // Added to store load priority // REMOVED
let mainContentUIInstance = null; // Added to hold the UI instance

// --- Dispatcher Handler for Disconnect (Connect is now handled directly by connection.js) --- //
function handleDisconnectRequest(data) {
  log('info', '[Client Module] Received disconnect request via dispatcher.');
  if (!coreConnection) {
    log('error', 
      '[Client Module] Cannot handle disconnect: Core connection not initialized.'
    );
    return;
  }
  coreConnection.disconnect();
}

// --- Registration --- //
export function register(registrationApi) {
  log('info', '[Client Module] Registering...');

  registrationApi.registerPanelComponent('clientPanel', MainContentUI); // Ensure componentType matches GoldenLayout config

  // Register dispatcher receiver for system:rehomeTimerUI
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'system:rehomeTimerUI',
    (eventData, propagationOptions) => {
      if (
        mainContentUIInstance &&
        typeof mainContentUIInstance.handleRehomeTimerUI === 'function'
      ) {
        mainContentUIInstance.handleRehomeTimerUI(
          eventData,
          propagationOptions,
          moduleDispatcher
        );
      } else {
        log('warn', 
          `[Client Module] MainContentUI instance not available or handleRehomeTimerUI method missing for event system:rehomeTimerUI. Attempting to propagate.`
        );
        // Explicitly propagate if this module's UI cannot handle the event
        if (
          moduleDispatcher &&
          typeof moduleDispatcher.publishToNextModule === 'function'
        ) {
          moduleDispatcher.publishToNextModule(
            moduleInfo.name, // This module's ID
            'system:rehomeTimerUI',
            eventData,
            { direction: 'up' } // CORRECTED: 'up' to go to lower index (higher actual priority)
          );
          log('info', 
            `[Client Module] Called publishToNextModule for system:rehomeTimerUI (direction: up) because instance was unavailable.`
          );
        } else {
          log('error', 
            `[Client Module] Could not propagate system:rehomeTimerUI: moduleDispatcher or publishToNextModule missing.`
          );
        }
      }
    }
  );

  // Only register dispatcher listener for disconnect
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'network:disconnectRequest',
    handleDisconnectRequest
  );

  // Register dispatcher receiver for user:locationCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:locationCheck',
    handleUserLocationCheckForClient, // Use the new imported handler
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
  );

  // Register dispatcher receiver for user:itemCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:itemCheck',
    handleUserItemCheckForClient, // Use the new imported handler
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
  );

  // Register EventBus publisher intentions
  registrationApi.registerEventBusPublisher('error:client');
  // MainContentUI might still publish these, so keep registration for now
  registrationApi.registerEventBusPublisher('network:disconnectRequest'); // This is if MainContentUI publishes disconnect on EventBus
  registrationApi.registerEventBusPublisher('network:connectRequest'); // This is if MainContentUI publishes connect on EventBus (though it now calls directly)
  // Removed event bus registrations for control:start and control:quickCheck as they are now internal to Timer module
  // registrationApi.registerEventBusPublisher('control:start');
  // registrationApi.registerEventBusPublisher('control:quickCheck');
}

// --- Initialization --- //
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Client Module] Initializing with priority ${priorityIndex}...`);
  // clientModuleLoadPriority = priorityIndex; // Store it // REMOVED

  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher(); // Store dispatcher
  const moduleSettings = await initializationApi.getModuleSettings(moduleId);

  coreStorage = storage;
  coreConnection = connection;
  coreMessageHandler = messageHandler;

  coreStorage.initialize();
  coreConnection.initialize();
  coreConnection.setEventBus(moduleEventBus); // connection.js still uses eventBus for its own outgoing events
  coreMessageHandler.initialize();
  coreMessageHandler.setEventBus(moduleEventBus);
  // messageHandler will need dispatcher for propagation, set it if it has a method for it
  if (typeof coreMessageHandler.setDispatcher === 'function') {
    coreMessageHandler.setDispatcher(moduleDispatcher);
  } else {
    log('warn', 
      '[Client Module] coreMessageHandler does not have setDispatcher method.'
    );
  }
  coreLocationManager.initialize();
  coreLocationManager.setEventBus(moduleEventBus);
  // coreTimerState.initialize(); // Removed
  // coreTimerState.setEventBus(moduleEventBus); // Removed
  loadMappingsFromStorage();

  log('info', '[Client Module] Core components initialized.');
  log('info', '[Client Module] Settings retrieved:', moduleSettings);
  log('info', '[Client Module] Initialization complete.');

  return () => {
    log('info', '[Client Module] Cleaning up... (Placeholder)');
    coreConnection?.disconnect?.();
    coreLocationManager?.dispose?.();
    // coreTimerState?.dispose?.(); // Removed
    moduleEventBus = null;
    coreStorage = null;
    coreConnection = null;
    coreMessageHandler = null;
    // coreTimerState = null; // Removed
    moduleDispatcher = null;
    // clientModuleLoadPriority = -1; // REMOVED
    mainContentUIInstance = null; // Reset instance on cleanup
  };
}

// Export dispatcher for use by other files in this module (e.g., messageHandler.js)
export function getClientModuleDispatcher() {
  return moduleDispatcher;
}

// ADDED: Export event bus for use by other files in this module
export function getClientModuleEventBus() {
  return moduleEventBus;
}

// Export setter for MainContentUI instance
export function setMainContentUIInstance(instance) {
  mainContentUIInstance = instance;
  log('info', '[Client Module] MainContentUI instance set.');
}

// Export load priority for MainContentUI
// export function getClientModuleLoadPriority() { // REMOVED
//   return clientModuleLoadPriority; // REMOVED
// } // REMOVED

// --- Dispatcher Handlers --- //
// REMOVED DUPLICATE DEFINITIONS - These are now defined before the register function.
// async function handleConnectRequest(data) { ... }
// function handleDisconnectRequest(data) { ... }

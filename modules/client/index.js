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
import stateManagerProxySingleton from '../stateManager/stateManagerProxySingleton.js';

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
  registrationApi.registerEventBusPublisher('connection:open');
  registrationApi.registerEventBusPublisher('connection:message');
  registrationApi.registerEventBusPublisher('connection:close');
  registrationApi.registerEventBusPublisher('connection:error');
  registrationApi.registerEventBusPublisher('connection:reconnecting');
  registrationApi.registerEventBusPublisher('game:roomInfo');
  registrationApi.registerEventBusPublisher('game:connected');
  registrationApi.registerEventBusPublisher('game:bounced');
  registrationApi.registerEventBusPublisher('game:bouncedMessage');
  registrationApi.registerEventBusPublisher('game:roomUpdate');
  registrationApi.registerEventBusPublisher('game:itemsReceived');
  registrationApi.registerEventBusPublisher('game:dataPackageReceived');
  registrationApi.registerEventBusPublisher('game:chatMessage');
  registrationApi.registerEventBusPublisher('ui:printToConsole');
  registrationApi.registerEventBusPublisher('ui:printFormattedToConsole');
  registrationApi.registerEventBusPublisher('network:connectionRefused');
  registrationApi.registerEventBusPublisher('client:checksSentUpdated');
  registrationApi.registerEventBusPublisher('inventory:clear');
  registrationApi.registerEventBusPublisher('locations:updated');
  // MainContentUI might still publish these, so keep registration for now
  registrationApi.registerEventBusPublisher('network:disconnectRequest'); // This is if MainContentUI publishes disconnect on EventBus
  registrationApi.registerEventBusPublisher('network:connectRequest'); // This is if MainContentUI publishes connect on EventBus (though it now calls directly)
  // Removed event bus registrations for control:start and control:quickCheck as they are now internal to Timer module
  // registrationApi.registerEventBusPublisher('control:start');
  // registrationApi.registerEventBusPublisher('control:quickCheck');

  // Register public function for programmatic connection
  registrationApi.registerPublicFunction(moduleInfo.name, 'connect', (serverAddress, playerName) => {
    log('info', `[Client Module] Public connect function called with server: ${serverAddress}, player: ${playerName}`);
    if (!coreConnection) {
      log('error', '[Client Module] Cannot connect: Core connection not initialized.');
      return false;
    }
    // Store player name if provided
    if (playerName && coreStorage) {
      try {
        const settings = JSON.parse(coreStorage.getItem('clientSettings') || '{}');
        if (!settings.connection) settings.connection = {};
        settings.playerName = playerName;
        coreStorage.setItem('clientSettings', JSON.stringify(settings));
      } catch (e) {
        log('error', '[Client Module] Error storing player name:', e);
      }
    }
    return coreConnection.requestConnect(serverAddress);
  });

  // Register public function for sending chat messages
  registrationApi.registerPublicFunction(moduleInfo.name, 'sendChatMessage', (message) => {
    log('info', `[Client Module] Public sendChatMessage function called with message: ${message}`);
    if (!coreMessageHandler) {
      log('error', '[Client Module] Cannot send chat message: Message handler not initialized.');
      return false;
    }
    return coreMessageHandler.sendMessage(message);
  });

  // Register public function for waiting for a chat message
  registrationApi.registerPublicFunction(moduleInfo.name, 'waitForChatMessage', async (filterFn, timeoutMs = 30000) => {
    log('info', `[Client Module] Public waitForChatMessage function called with timeout: ${timeoutMs}ms`);
    if (!moduleEventBus) {
      log('error', '[Client Module] Cannot wait for chat message: EventBus not initialized.');
      return null;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for chat message after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = moduleEventBus.subscribe('game:chatMessage', (chatData) => {
        // If no filter function provided, accept any message
        if (!filterFn || filterFn(chatData)) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(chatData);
        }
      }, 'client-chat-waiter');
    });
  });

  // Register public function for sending ready messages via Bounce
  registrationApi.registerPublicFunction(moduleInfo.name, 'sendReadyMessage', (clientId, options = {}) => {
    log('info', `[Client Module] Sending ready message from ${clientId} with options:`, options);
    if (!coreMessageHandler) {
      log('error', '[Client Module] Cannot send ready message: Message handler not initialized.');
      return false;
    }

    const data = {
      type: 'READY_MESSAGE',
      sender: clientId,
      timestamp: Date.now(),
    };

    return coreMessageHandler.sendBounce(data, options);
  });

  // Register public function for waiting for ready messages via Bounce
  registrationApi.registerPublicFunction(moduleInfo.name, 'waitForReadyMessage', async (expectedSender, timeoutMs = 10000) => {
    log('info', `[Client Module] Waiting for ready message from ${expectedSender}, timeout: ${timeoutMs}ms`);
    if (!moduleEventBus) {
      log('error', '[Client Module] Cannot wait for ready message: EventBus not initialized.');
      return null;
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error(`Timeout waiting for ready message from ${expectedSender} after ${timeoutMs}ms`));
      }, timeoutMs);

      const unsubscribe = moduleEventBus.subscribe('game:bouncedMessage', (bounceData) => {
        // Check if this is a ready message from the expected sender
        if (bounceData.data &&
            bounceData.data.type === 'READY_MESSAGE' &&
            bounceData.data.sender === expectedSender) {
          clearTimeout(timeout);
          unsubscribe();
          resolve(bounceData);
        }
      }, 'client-ready-waiter');
    });
  });

  // Register public function to check if WebSocket is connected
  registrationApi.registerPublicFunction(moduleInfo.name, 'isConnected', () => {
    if (!coreConnection) {
      return false;
    }
    return coreConnection.isConnected();
  });

  // Register public function to check if handshake is complete (full connection established)
  registrationApi.registerPublicFunction(moduleInfo.name, 'isHandshakeComplete', () => {
    if (!coreMessageHandler) {
      return false;
    }
    // Handshake is complete when we have a client slot assigned
    const slot = coreMessageHandler.getClientSlot();
    return slot !== null && slot !== undefined;
  });

  // Register public function to get connection info
  registrationApi.registerPublicFunction(moduleInfo.name, 'getConnectionInfo', () => {
    if (!coreMessageHandler) {
      return null;
    }
    return {
      slot: coreMessageHandler.getClientSlot(),
      team: coreMessageHandler.getClientTeam(),
      isConnected: coreConnection ? coreConnection.isConnected() : false,
      isHandshakeComplete: coreMessageHandler.getClientSlot() !== null && coreMessageHandler.getClientSlot() !== undefined,
    };
  });
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

// --- Post-Initialization --- //
export async function postInitialize(api, config) {
  log('info', '[Client Module] Post-initializing...');

  // Check for URL parameters for autoconnect
  const urlParams = new URLSearchParams(window.location.search);
  const autoConnect = urlParams.get('autoConnect');
  const serverParam = urlParams.get('server');
  const playerNameParam = urlParams.get('playerName');

  log('info', `[Client Module] URL params: autoConnect=${autoConnect}, server=${serverParam}, playerName=${playerNameParam}`);

  if (autoConnect === 'true') {
    log('info', '[Client Module] autoConnect=true detected in URL parameters');

    // Use URL param server address or fall back to settings
    let serverAddress = serverParam;
    if (!serverAddress) {
      const moduleSettings = await api.getModuleSettings(moduleInfo.name);
      serverAddress = moduleSettings?.defaultServer || 'ws://localhost:38281';
      log('info', `[Client Module] No server param, using default: ${serverAddress}`);
    }

    // Store player name if provided
    if (playerNameParam) {
      log('info', `[Client Module] Setting player name from URL: ${playerNameParam}`);
      try {
        const settings = JSON.parse(coreStorage.getItem('clientSettings') || '{}');
        settings.playerName = playerNameParam;
        coreStorage.setItem('clientSettings', JSON.stringify(settings));
        log('info', '[Client Module] Player name stored successfully');
      } catch (e) {
        log('error', '[Client Module] Error storing player name from URL:', e);
      }
    }

    // Wait for stateManager to be ready before connecting
    // This ensures player-specific rules are fully loaded in multiworld scenarios
    log('info', '[Client Module] Waiting for stateManager to be ready before auto-connecting...');

    // Use ensureReady() which waits for the worker to confirm rules are loaded
    try {
      const isReady = await stateManagerProxySingleton.ensureReady(15000);

      if (isReady) {
        const gameName = stateManagerProxySingleton.getGameName();
        log('info', `[Client Module] StateManager is ready (game: ${gameName}). Auto-connecting to ${serverAddress}...`);

        // Small delay to ensure all UI components have processed the ready state
        setTimeout(() => {
          if (coreConnection) {
            coreConnection.requestConnect(serverAddress);
          } else {
            log('error', '[Client Module] Cannot auto-connect: coreConnection not available');
          }
        }, 100);
      } else {
        log('warn', '[Client Module] StateManager did not become ready within timeout. Attempting connection anyway...');
        if (coreConnection) {
          coreConnection.requestConnect(serverAddress);
        }
      }
    } catch (ensureReadyError) {
      log('error', '[Client Module] ensureReady() threw an error:', ensureReadyError);
      // Try to connect anyway
      if (coreConnection) {
        coreConnection.requestConnect(serverAddress);
      }
    }
  } else {
    log('info', '[Client Module] autoConnect not enabled (autoConnect=' + autoConnect + ')');
  }

  log('info', '[Client Module] Post-initialization complete.');
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

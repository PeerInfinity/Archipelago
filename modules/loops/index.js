// Core state and UI for this module
import loopStateSingleton from './loopStateSingleton.js';
import { LoopUI } from './loopUI.js';
import { handleUserLocationCheckForLoops, handleUserItemCheckForLoops, initializeLoopEvents } from './loopEvents.js'; // Import handlers

// --- Module Info ---
export const moduleInfo = {
  name: 'loops',
  title: 'Loops',
  componentType: 'loopsPanel',
  icon: '🔄',
  column: 3, // Right column
  description: 'Loop mode logic and UI panel.',
};

// Other dependencies
// import discoveryStateSingleton from '../discovery/singleton.js'; // Need discovery state
// import eventBus from '../../app/core/eventBus.js'; // Use injected
// import settingsManager from '../../app/core/settingsManager.js'; // Use injected

// Store instance and API
let loopInstance = null;
let _moduleEventBus = null;
let moduleDispatcher = null; // To store the full dispatcher instance
let _playerStateAPI = null; // Store playerState API for access by loopUI

// Export dispatcher for use by other files in this module (e.g., loopEvents.js)
export function getLoopsModuleDispatcher() {
  return moduleDispatcher;
}

// Export function to get playerState API for use by loopUI
export function getPlayerStateAPI() {
  return _playerStateAPI;
}

let loopUnsubscribeHandles = [];

// --- Import the actual singletons needed for injection ---
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('loopsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[loopsModule] ${message}`, ...data);
  }
}

// ----------------------------------------------------- //

// --- Event Handlers --- //

// Handler for rules loaded
function handleRulesLoaded(eventData) {
  log('info', '[Loops Module] Received stateManager:rulesLoaded');
  // Reset loop state now that new rules are loaded
  if (
    loopStateSingleton &&
    typeof loopStateSingleton._resetLoop === 'function'
  ) {
    loopStateSingleton._resetLoop();
  } else {
    log('warn',
      '[Loops Module] LoopState singleton or _resetLoop method not available when handling stateManager:rulesLoaded.'
    );
  }
  // Potentially trigger UI update if loopInstance exists
  loopInstance?.renderLoopPanel();
}

// Removed old handleCheckLocationRequest as it will be replaced by handleUserLocationCheckForLoops from loopEvents.js

/**
 * Registration function for the Loops module.
 * Registers the loops panel and potentially primary event handlers.
 */
export function register(registrationApi) {
  log('info', '[Loops Module] Registering...');

  // Dynamically load module CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.type = 'text/css';
  link.href = 'modules/loops/loop.css';
  document.head.appendChild(link);
  log('info', '[Loops Module] CSS loaded');

  // Register panel component with the CLASS CONSTRUCTOR directly
  registrationApi.registerPanelComponent(
    'loopsPanel',
    LoopUI // Pass the class constructor directly
  );

  // Register Loops settings schema snippet
  registrationApi.registerSettingsSchema({
    type: 'object',
    properties: {
      defaultSpeed: {
        type: 'number',
        minimum: 0.1,
        default: 10,
        label: 'Default Loop Speed',
      },
      autoRestart: {
        type: 'boolean',
        default: false,
        label: 'Auto-Restart Queue',
      },
      loopModeEnabled: {
        type: 'boolean',
        default: false,
        label: 'Auto-Enter Loop Mode',
      },
      // Add other loop-specific settings here
    },
  });

  // Register the new dispatcher receiver for user:locationCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:locationCheck',
    handleUserLocationCheckForLoops,
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
  );

  // Register dispatcher receiver for user:itemCheck
  registrationApi.registerDispatcherReceiver(
    moduleInfo.name,
    'user:itemCheck',
    handleUserItemCheckForLoops,
    { direction: 'up', condition: 'conditional', timing: 'immediate' }
  );

  // Register events that loops publishes
  registrationApi.registerEventBusPublisher('loopState:actionCompleted');
  registrationApi.registerEventBusPublisher('loopState:autoRestartChanged');
  registrationApi.registerEventBusPublisher('loopState:paused');
  registrationApi.registerEventBusPublisher('loopState:pauseStateChanged');
  registrationApi.registerEventBusPublisher('loopState:processingStopped');
  registrationApi.registerEventBusPublisher('loopState:progressUpdated');
  registrationApi.registerEventBusPublisher('loopState:queueCompleted');
  registrationApi.registerEventBusPublisher('loopState:queueUpdated');
  registrationApi.registerEventBusPublisher('loopState:resumed');
  registrationApi.registerEventBusPublisher('loopState:speedChanged');
  registrationApi.registerEventBusPublisher('loopState:stateLoaded');
  registrationApi.registerEventBusPublisher('loopState:xpChanged');
  registrationApi.registerEventBusPublisher('loopState:manaChanged');
  registrationApi.registerEventBusPublisher('loopState:loopReset');
  registrationApi.registerEventBusPublisher('loopState:newActionStarted');
  registrationApi.registerEventBusPublisher('loopState:exploreActionRepeated');
  registrationApi.registerEventBusPublisher('loopUI:modeChanged');
  registrationApi.registerEventBusPublisher('loops:setLoopMode');
}

/**
 * Initialization function for the Loops module.
 * Initializes loop state, loads settings, subscribes to events.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Loops Module] Initializing with priority ${priorityIndex}...`);

  // Store API references
  _moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher(); // Store the full dispatcher instance

  const moduleSettings = await initializationApi.getModuleSettings(moduleId);

  // Get playerState public API functions
  const playerStateAPI = {
    getPath: initializationApi.getModuleFunction('playerState', 'getPath'),
    trimPath: initializationApi.getModuleFunction('playerState', 'trimPath'),
    setAllowLoops: initializationApi.getModuleFunction('playerState', 'setAllowLoops'),
    addLocationCheck: initializationApi.getModuleFunction('playerState', 'addLocationCheck'),
    addCustomAction: initializationApi.getModuleFunction('playerState', 'addCustomAction'),
    insertLocationCheckAt: initializationApi.getModuleFunction('playerState', 'insertLocationCheckAt'),
    insertCustomActionAt: initializationApi.getModuleFunction('playerState', 'insertCustomActionAt'),
    removeLocationCheckAt: initializationApi.getModuleFunction('playerState', 'removeLocationCheckAt'),
    removeCustomActionAt: initializationApi.getModuleFunction('playerState', 'removeCustomActionAt'),
    clearActionsAt: initializationApi.getModuleFunction('playerState', 'clearActionsAt'),
    removeAllActionsOfType: initializationApi.getModuleFunction('playerState', 'removeAllActionsOfType'),
    getCurrentRegion: initializationApi.getModuleFunction('playerState', 'getCurrentRegion'),
    getRegionCounts: initializationApi.getModuleFunction('playerState', 'getRegionCounts')
  };
  
  // Store the API for access by loopUI
  _playerStateAPI = playerStateAPI;
  
  if (!playerStateAPI.getPath) {
    log('error', '[Loops Module] Could not get playerState API functions');
  }

  // Initialize LoopState singleton (which might load from storage)
  log('info', '[Loops Module] Initializing LoopState singleton...');
  if (loopStateSingleton) {
    try {
      // Inject dependencies BEFORE initializing loopState itself
      loopStateSingleton.setDependencies({
        eventBus: _moduleEventBus,
        stateManager: stateManager,
        dispatcher: moduleDispatcher, // Pass dispatcher to loopStateSingleton if needed
        playerState: playerStateAPI.getPath ? playerStateAPI : null
      });

      loopStateSingleton.initialize();
      // Apply settings
      loopStateSingleton.setGameSpeed(moduleSettings?.defaultSpeed ?? 10);
      loopStateSingleton.setAutoRestartQueue(
        moduleSettings?.autoRestart ?? false
      );
      log('info', 
        '[Loops Module] LoopState singleton initialized and settings applied.'
      );
    } catch (error) {
      log('error', 
        '[Loops Module] Error initializing LoopState singleton:',
        error
      );
      // If state fails, maybe disable the module?
    }
  } else {
    log('error', 
      '[Loops Module] LoopState singleton not available during initialization.'
    );
  }

  // Initialize loop events handlers
  initializeLoopEvents(_moduleEventBus);

  // Clean up previous subscriptions before adding new ones
  loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  loopUnsubscribeHandles = [];

  // Subscribe to settings changes
  if (_moduleEventBus) {
    const subscribe = (eventName, handler) => {
      log('info', `[Loops Module] Subscribing to ${eventName}`);
      try {
        const unsubscribe = _moduleEventBus.subscribe(eventName, handler, 'loops');
        loopUnsubscribeHandles.push(unsubscribe);
      } catch (e) {
        log('error', `[Loops Module] Failed to subscribe to ${eventName}:`, e);
      }
    };

    subscribe('settings:changed', (eventData) => {
      // Use getModuleSettings again to be sure, or trust eventData?
      // For now, trust eventData if it looks right
      const loopSettings = eventData?.settings?.moduleSettings?.loops;
      if (loopSettings && loopStateSingleton) {
        log('info', 
          '[Loops Module] Reacting to settings:changed',
          loopSettings
        );
        if (loopSettings.defaultSpeed !== undefined) {
          loopStateSingleton.setGameSpeed(loopSettings.defaultSpeed);
        }
        if (loopSettings.autoRestart !== undefined) {
          loopStateSingleton.setAutoRestartQueue(loopSettings.autoRestart);
        }
      }
    });

    // Subscribe to stateManager:rulesLoaded to reset loop state when rules change
    loopUnsubscribeHandles.push(
      eventBus.subscribe('stateManager:rulesLoaded', handleRulesLoaded, moduleInfo.name)
    );
  } else {
    log('error',
      '[Loops Module] EventBus not available during initialization.'
    );
  }

  log('info', '[Loops Module] Initialization complete.');

  // Return cleanup function
  return () => {
    log('info', '[Loops Module] Cleaning up... Unsubscribing from events.');
    loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    loopUnsubscribeHandles = [];
    _moduleEventBus = null; // Clear references
    moduleDispatcher = null; // Clear the dispatcher on cleanup
    // Call dispose on loopStateSingleton if it exists
    if (
      loopStateSingleton &&
      typeof loopStateSingleton.dispose === 'function'
    ) {
      log('info', '[Loops Module] Disposing LoopState singleton.');
      loopStateSingleton.dispose();
    }
  };
}

// Export singletons/instances if needed (avoid if possible)
// export { loopStateSingleton }; // Already exported by its own file

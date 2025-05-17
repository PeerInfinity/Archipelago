// Core state and UI for this module
import loopStateSingleton from './loopStateSingleton.js';
import { LoopUI } from './loopUI.js';
import { handleUserLocationCheckForLoops } from './loopEvents.js'; // Import new handler

// --- Module Info ---
export const moduleInfo = {
  name: 'Loops',
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

// Export dispatcher for use by other files in this module (e.g., loopEvents.js)
export function getLoopsModuleDispatcher() {
  return moduleDispatcher;
}

let loopUnsubscribeHandles = [];

// --- Import the actual singletons needed for injection ---
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
// ----------------------------------------------------- //

// --- Event Handlers --- //

// Handler for rules loaded
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Loops Module] Received state:rulesLoaded');
  // Reset loop state now that new rules are loaded
  if (
    loopStateSingleton &&
    typeof loopStateSingleton._resetLoop === 'function'
  ) {
    loopStateSingleton._resetLoop();
  } else {
    console.warn(
      '[Loops Module] LoopState singleton or _resetLoop method not available when handling state:rulesLoaded.'
    );
  }
  // Potentially trigger UI update if loopInstance exists
  loopInstance?.renderLoopPanel();

  // Propagate the event to the next module in the chain using stored dispatcher
  if (moduleDispatcher) {
    moduleDispatcher.publishToNextModule(
      'loops',
      'state:rulesLoaded',
      eventData,
      { direction: 'up' }
    );
  } else {
    console.error(
      '[Loops Module] Cannot propagate state:rulesLoaded: Dispatcher not available.'
    );
  }
}

// Removed old handleCheckLocationRequest as it will be replaced by handleUserLocationCheckForLoops from loopEvents.js

/**
 * Registration function for the Loops module.
 * Registers the loops panel and potentially primary event handlers.
 */
export function register(registrationApi) {
  console.log('[Loops Module] Registering...');

  // Register panel component with the CLASS CONSTRUCTOR directly
  registrationApi.registerPanelComponent(
    'loopsPanel',
    LoopUI // Pass the class constructor directly
  );

  // Register Loops settings schema snippet
  // TODO: Confirm this schema structure matches what settingsManager expects
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

  // TODO: Add event bus publisher/subscriber intentions after reviewing loopState/loopUI
}

/**
 * Initialization function for the Loops module.
 * Initializes loop state, loads settings, subscribes to events.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Loops Module] Initializing with priority ${priorityIndex}...`);

  // Store API references
  _moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher(); // Store the full dispatcher instance

  const moduleSettings = await initializationApi.getModuleSettings(moduleId);

  // Initialize LoopState singleton (which might load from storage)
  console.log('[Loops Module] Initializing LoopState singleton...');
  if (loopStateSingleton) {
    try {
      // Inject dependencies BEFORE initializing loopState itself
      loopStateSingleton.setDependencies({
        eventBus: _moduleEventBus,
        stateManager: stateManager,
        dispatcher: moduleDispatcher, // Pass dispatcher to loopStateSingleton if needed
      });

      loopStateSingleton.initialize();
      // Apply settings
      loopStateSingleton.setGameSpeed(moduleSettings?.defaultSpeed ?? 10);
      loopStateSingleton.setAutoRestartQueue(
        moduleSettings?.autoRestart ?? false
      );
      console.log(
        '[Loops Module] LoopState singleton initialized and settings applied.'
      );
    } catch (error) {
      console.error(
        '[Loops Module] Error initializing LoopState singleton:',
        error
      );
      // If state fails, maybe disable the module?
    }
  } else {
    console.error(
      '[Loops Module] LoopState singleton not available during initialization.'
    );
  }

  // Clean up previous subscriptions before adding new ones
  loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  loopUnsubscribeHandles = [];

  // Subscribe to settings changes
  if (_moduleEventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Loops Module] Subscribing to ${eventName}`);
      try {
        const unsubscribe = _moduleEventBus.subscribe(eventName, handler);
        loopUnsubscribeHandles.push(unsubscribe);
      } catch (e) {
        console.error(`[Loops Module] Failed to subscribe to ${eventName}:`, e);
      }
    };

    subscribe('settings:changed', (eventData) => {
      // Use getModuleSettings again to be sure, or trust eventData?
      // For now, trust eventData if it looks right
      const loopSettings = eventData?.settings?.moduleSettings?.loops;
      if (loopSettings && loopStateSingleton) {
        console.log(
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

    // TODO: Add subscription for state:rulesLoaded -> handleRulesLoaded
  } else {
    console.error(
      '[Loops Module] EventBus not available during initialization.'
    );
  }

  console.log('[Loops Module] Initialization complete.');

  // Return cleanup function
  return () => {
    console.log('[Loops Module] Cleaning up... Unsubscribing from events.');
    loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    loopUnsubscribeHandles = [];
    _moduleEventBus = null; // Clear references
    moduleDispatcher = null; // Clear the dispatcher on cleanup
    // Call dispose on loopStateSingleton if it exists
    if (
      loopStateSingleton &&
      typeof loopStateSingleton.dispose === 'function'
    ) {
      console.log('[Loops Module] Disposing LoopState singleton.');
      loopStateSingleton.dispose();
    }
  };
}

// Export singletons/instances if needed (avoid if possible)
// export { loopStateSingleton }; // Already exported by its own file

// Core state and UI for this module
import loopStateSingleton from './loopStateSingleton.js';
import { LoopUI } from './loopUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Loops',
  description: 'Loop mode logic and UI panel.',
};

// Other dependencies
import discoveryStateSingleton from '../discovery/singleton.js'; // Need discovery state

// Store instance and API
let loopInstance = null;
let moduleEventBus = null;
let loopUnsubscribeHandles = [];
let moduleInitApi = null; // Store initApi for use in event handlers

// Handler for rules loaded
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Loops Module] Received state:rulesLoaded');
  // Reset loop state now that new rules are loaded
  // Check if singleton exists and has the method before calling
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

  // Propagate the event to the next module in the chain
  const dispatcher = moduleInitApi?.getDispatcher();
  if (dispatcher) {
    // Assuming the original publish direction was 'highestFirst'
    dispatcher.publishToNextModule('loops', 'state:rulesLoaded', eventData, {
      direction: 'highestFirst',
    });
  } else {
    console.error(
      '[Loops Module] Cannot propagate state:rulesLoaded: Dispatcher not available (initApi missing?).'
    );
  }
}

/**
 * Registration function for the Loops module.
 * Registers the loops panel and potentially primary event handlers.
 */
export function register(registrationApi) {
  console.log('[Loops Module] Registering...');

  // registrationApi.registerPanelComponent('loopsPanel', () => {
  //   loopInstance = new LoopUI();
  //   return loopInstance;
  // });
  registrationApi.registerPanelComponent('loopsPanel', LoopUI);

  // Register Loops settings schema snippet
  registrationApi.registerSettingsSchema({
    type: 'object',
    properties: {
      defaultSpeed: { type: 'number', minimum: 0.1, default: 10 },
      autoRestart: { type: 'boolean', default: false },
      // Add other loop-specific settings here
    },
  });

  // Register event handler for rules loaded
  registrationApi.registerEventHandler('state:rulesLoaded', handleRulesLoaded);

  // Register primary handler for user checking a location IF loop mode is active
  registrationApi.registerEventHandler(
    'user:checkLocation',
    handleCheckLocationRequest
  );
}

/**
 * Initialization function for the Loops module.
 * Basic setup, stores API reference.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Loops Module] Initializing with priority ${priorityIndex}...`);
  // Store API and eventBus for postInitialize and event handlers
  moduleInitApi = initializationApi;
  moduleEventBus = initializationApi.getEventBus();

  // Clean up previous subscriptions
  loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  loopUnsubscribeHandles = [];

  console.log('[Loops Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Loops module.
 * Initializes loop state, loads settings, subscribes to events.
 */
export async function postInitialize(initializationApi) {
  console.log('[Loops Module] Post-initializing...');
  const settings = await initializationApi.getAllSettings();
  const eventBus = moduleEventBus || initializationApi.getEventBus();

  // Initialize LoopState singleton (which might load from storage)
  console.log('[Loops Module] Initializing LoopState singleton...');
  // Check if the singleton itself exists (it's exported directly)
  if (loopStateSingleton) {
    try {
      // Call initialize on the singleton instance directly
      loopStateSingleton.initialize();
      // Apply settings
      loopStateSingleton.setGameSpeed(settings?.defaultSpeed ?? 10);
      loopStateSingleton.setAutoRestartQueue(settings?.autoRestart ?? false);
      console.log(
        '[Loops Module] LoopState singleton initialized and settings applied.'
      );
    } catch (error) {
      console.error(
        '[Loops Module] Error initializing LoopState singleton:',
        error
      );
    }
  } else {
    console.error(
      '[Loops Module] LoopState singleton not available during post-initialization.'
    );
  }

  // Subscribe to settings changes
  if (eventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Loops Module] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      loopUnsubscribeHandles.push(unsubscribe);
    };

    subscribe('settings:changed', (eventData) => {
      console.log('[Loops Module] Received settings:changed');
      // Update loop state based on settings changes if needed
      // Check singleton exists before accessing it
      if (eventData?.settings?.moduleSettings?.loops && loopStateSingleton) {
        const loopSettings = eventData.settings.moduleSettings.loops;
        if (loopSettings.defaultSpeed !== undefined) {
          loopStateSingleton.setGameSpeed(loopSettings.defaultSpeed);
        }
        if (loopSettings.autoRestart !== undefined) {
          loopStateSingleton.setAutoRestartQueue(loopSettings.autoRestart);
        }
      }
    });
  } else {
    console.error(
      '[Loops Module] EventBus not available during post-initialization.'
    );
  }

  console.log('[Loops Module] Post-initialization complete.');
}

// --- Event Handlers --- //

function handleCheckLocationRequest(locationData) {
  console.log(
    `[Loops Module] Intercepting check request for: ${locationData.name}`
  );
  // Check if loop mode is active (requires access to LoopUI or loopState)
  const isLoopModeActive = loopInstance?.isLoopModeActive ?? false;

  if (isLoopModeActive) {
    // Handle loop mode queuing
    console.log(
      `[Loops Module] Loop mode active. Queuing check for ${locationData.name}.`
    );
    loopInstance?._queueCheckLocationAction(
      locationData.region,
      locationData.name
    );
  } else {
    // Pass to predecessors
    console.log(
      '[Loops Module] Loop mode inactive. Passing check request to predecessors.'
    );
    // Use the stored moduleInitApi
    const dispatcher = moduleInitApi?.getDispatcher();
    if (dispatcher) {
      // Assuming the original publish direction was 'highestFirst' for user:checkLocation
      dispatcher.publishToNextModule(
        'loops',
        'user:checkLocation',
        locationData,
        { direction: 'highestFirst' }
      );
    } else {
      console.error(
        '[Loops Module] Cannot pass event to predecessors: Dispatcher not available (initApi missing?).'
      );
    }
  }
}

// Export singletons/instances if needed (avoid if possible)
export { loopStateSingleton };

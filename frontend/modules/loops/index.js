// Core state and UI for this module
import loopStateSingleton from './loopStateSingleton.js';
import { LoopUI } from './loopUI.js';

// Other dependencies
import discoveryStateSingleton from '../discovery/singleton.js'; // Need discovery state

// Store instance
let loopInstance = null;
let moduleEventBus = null;
let loopUnsubscribeHandles = [];

/**
 * Registration function for the Loops module.
 * Registers the loops panel and potentially primary event handlers.
 */
export function register(registrationApi) {
  console.log('[Loops Module] Registering...');

  registrationApi.registerPanelComponent(
    'loopsPanel',
    () => new LoopUI() // Return a new instance directly
  );

  // Register Loops settings schema snippet
  registrationApi.registerSettingsSchema({
    type: 'object',
    properties: {
      defaultSpeed: { type: 'number', minimum: 0.1, default: 10 },
      autoRestart: { type: 'boolean', default: false },
      // Add other loop-specific settings here
    },
  });

  // Register primary handler for user checking a location IF loop mode is active
  // This allows Loops to intercept the check and queue it instead.
  registrationApi.registerEventHandler(
    'user:checkLocation',
    handleCheckLocationRequest
  );
}

/**
 * Initialization function for the Loops module.
 * Initializes loop state, loads settings, subscribes to events.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Loops Module] Initializing with priority ${priorityIndex}...`);
  moduleEventBus = initializationApi.getEventBus();
  const settings = await initializationApi.getSettings();
  const dispatcher = initializationApi.getDispatcher();

  // Initialize LoopState singleton (which might load from storage)
  loopStateSingleton.initialize();
  // Apply settings
  loopStateSingleton.setGameSpeed(settings?.defaultSpeed ?? 10);
  loopStateSingleton.setAutoRestartQueue(settings?.autoRestart ?? false);

  // Clean up previous subscriptions
  loopUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  loopUnsubscribeHandles = [];

  if (moduleEventBus) {
    const subscribe = (eventName, handler) => {
      const unsubscribe = moduleEventBus.subscribe(eventName, handler);
      loopUnsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to necessary events (e.g., game load, settings change)
    subscribe('stateManager:jsonDataLoaded', () => {
      console.log('[Loops Module] Resetting loop state on jsonDataLoaded.');
      // Reset loop state when new game data comes in?
      loopStateSingleton.resetLoop();
    });

    subscribe('settings:changed', (eventData) => {
      // Update loop state based on settings changes if needed
      if (eventData?.settings?.moduleSettings?.loops) {
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
      '[Loops Module] EventBus not available during initialization.'
    );
  }

  console.log('[Loops Module] Initialization complete.');
}

// --- Event Handlers --- //

function handleCheckLocationRequest(locationData) {
  console.log(
    `[Loops Module] Intercepting check request for: ${locationData.name}`
  );
  // Check if loop mode is active (requires access to LoopUI or loopState)
  const isLoopModeActive = loopInstance?.isLoopModeActive ?? false; // Need a reliable way to check mode

  if (isLoopModeActive) {
    // If loop mode is active, handle it here (queue action)
    // Prevent the default action (direct stateManager check) by NOT calling publishToPredecessors
    console.log(
      `[Loops Module] Loop mode active. Queuing check for ${locationData.name}.`
    );
    loopInstance?._queueCheckLocationAction(
      locationData.region,
      locationData.name
    );
  } else {
    // If loop mode is not active, let the next handler (likely StateManager or default behavior) process it.
    console.log(
      '[Loops Module] Loop mode inactive. Passing check request to predecessors.'
    );
    const dispatcher = initApi?.getDispatcher(); // Need access to dispatcher
    if (dispatcher) {
      dispatcher.publishToPredecessors(
        'loops',
        'user:checkLocation',
        locationData
      );
    } else {
      console.error(
        '[Loops Module] Cannot pass event to predecessors: Dispatcher not available.'
      );
    }
  }
}

// Export singletons/instances if needed (avoid if possible)
export { loopStateSingleton };

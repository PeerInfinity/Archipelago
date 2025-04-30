// UI Class for this module
import { LocationUI } from './locationUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Locations',
  description: 'Locations display panel.',
};

// Store instance
let locationInstance = null;
let moduleEventBus = null;
let locationUnsubscribeHandles = []; // Store multiple unsubscribe handles
let initApi = null; // Store the full init API

// Handler for rules loaded
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Locations Module] Received state:rulesLoaded');
  // Update display now that data is available
  // Check if instance exists before calling update
  if (locationInstance) {
    // Use setTimeout to ensure it runs after potential DOM updates
    setTimeout(() => locationInstance.update(), 0);
  } else {
    console.warn(
      '[Locations Module] locationInstance not available for state:rulesLoaded handler.'
    );
  }

  // Propagate the event to the next module in the chain
  const dispatcher = initApi?.getDispatcher(); // Use the stored initApi
  if (dispatcher) {
    const direction = propagationOptions.propagationDirection || 'highestFirst'; // Use incoming direction or default
    dispatcher.publishToNextModule(
      'locations',
      'state:rulesLoaded',
      eventData,
      {
        direction: direction,
      }
    );
  } else {
    console.error(
      '[Locations Module] Cannot propagate state:rulesLoaded: Dispatcher not available (initApi missing?).'
    );
  }
}

/**
 * Registration function for the Locations module.
 * Registers the locations panel component and event handlers.
 */
export function register(registrationApi) {
  console.log('[Locations Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('locationsPanel', LocationUI);

  // Register event handler for rules loaded
  registrationApi.registerDispatcherReceiver(
    'state:rulesLoaded',
    handleRulesLoaded,
    {
      direction: 'highestFirst',
      condition: 'unconditional',
      timing: 'immediate',
    }
  );

  // Locations module *reacts* to checks, but Loops module *primarily handles* the user request
  // So, we register a *receiver* here, not a primary handler.
}

/**
 * Initialization function for the Locations module.
 * Minimal setup.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Locations Module] Initializing with priority ${priorityIndex}...`
  );
  // Store the full API
  initApi = initializationApi;

  // Store eventBus for postInitialize
  moduleEventBus = initializationApi.getEventBus();

  // Clean up previous subscriptions if any (might be redundant but safe)
  locationUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  locationUnsubscribeHandles = [];

  console.log('[Locations Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Locations module.
 * Subscribes to events needed for UI reactivity.
 */
export function postInitialize(initializationApi) {
  console.log('[Locations Module] Post-initializing...');
  const eventBus = moduleEventBus || initializationApi.getEventBus();

  if (eventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Locations Module] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      locationUnsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to state changes that affect location display
    subscribe('stateManager:inventoryChanged', () => {
      console.log('[Locations Module] Received stateManager:inventoryChanged');
      locationInstance?.updateLocationDisplay(); // Update UI
    });
    subscribe('stateManager:regionsComputed', () => {
      console.log('[Locations Module] Received stateManager:regionsComputed');
      locationInstance?.updateLocationDisplay(); // Update UI
    });
    subscribe('stateManager:locationChecked', () => {
      console.log('[Locations Module] Received stateManager:locationChecked');
      locationInstance?.updateLocationDisplay(); // Update UI
    });
    subscribe('stateManager:checkedLocationsCleared', () => {
      console.log(
        '[Locations Module] Received stateManager:checkedLocationsCleared'
      );
      locationInstance?.updateLocationDisplay(); // Update UI
    });

    // Subscribe to loop state changes if relevant
    subscribe('loop:stateChanged', () => {
      locationInstance?.updateLocationDisplay();
    });
    subscribe('loop:actionCompleted', () => {
      locationInstance?.updateLocationDisplay();
    });
    subscribe('loop:discoveryChanged', () => {
      locationInstance?.updateLocationDisplay();
    });
    subscribe('loop:modeChanged', (isLoopMode) => {
      locationInstance?.updateLocationDisplay(); // Update based on mode change
      // Potentially show/hide loop-specific controls
      const exploredCheckbox =
        locationInstance?.rootElement?.querySelector('#show-explored');
      if (exploredCheckbox && exploredCheckbox.parentElement) {
        exploredCheckbox.parentElement.style.display = isLoopMode
          ? 'inline-block'
          : 'none';
      }
    });
  } else {
    console.error(
      '[Locations Module] EventBus not available during post-initialization.'
    );
  }
  console.log('[Locations Module] Post-initialization complete.');
}

// Refactor handleCheckLocationRequest if it becomes a primary handler
// function handleCheckLocationRequest(locationData) {
//     console.log(`[Locations Module] Handling check request for: ${locationData.name}`);
//     // Check conditions (e.g., is loop mode active?)
//     // If conditions met, handle directly (e.g., add to loop queue)
//     // If not, potentially publish to predecessors
//     // dispatcher.publishToPredecessors('locations', 'user:checkLocation', locationData);
// }

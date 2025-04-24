// UI Class for this module
import { LocationUI } from './locationUI.js';

// Store instance
let locationInstance = null;
let moduleEventBus = null;
let locationUnsubscribeHandles = []; // Store multiple unsubscribe handles

/**
 * Registration function for the Locations module.
 * Registers the locations panel component.
 */
export function register(registrationApi) {
  console.log('[Locations Module] Registering...');

  // Register the panel component factory
  registrationApi.registerPanelComponent('locationsPanel', (container) => {
    if (!locationInstance) {
      // Needs refactoring - expects gameUI
      locationInstance = new LocationUI(null);
    }

    const rootElement = locationInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Initialize UI when panel is shown
    if (typeof locationInstance.initialize === 'function') {
      setTimeout(() => locationInstance.initialize(), 0);
    }

    // Return object for Golden Layout lifecycle
    return {
      destroy: () => {
        console.log('LocationUI destroy called by GL');
        if (typeof locationInstance?.onPanelDestroy === 'function') {
          locationInstance.onPanelDestroy();
        }
        locationInstance = null;
      },
      // GL doesn't explicitly provide resize to components, but panels get resized.
      // We might need internal resize observers if needed.
    };
  });

  // Register primary event handler if Locations module owns an action
  // Example: If checking a location *always* goes through this module first
  // registrationApi.registerEventHandler('user:checkLocation', handleCheckLocationRequest);
}

/**
 * Initialization function for the Locations module.
 * Subscribes to events needed for reactivity.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Locations Module] Initializing with priority ${priorityIndex}...`
  );
  moduleEventBus = initializationApi.getEventBus();
  // const settings = await initializationApi.getSettings();
  // const dispatcher = initializationApi.getDispatcher();

  // Clean up previous subscriptions if any
  locationUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  locationUnsubscribeHandles = [];

  if (moduleEventBus) {
    const subscribe = (eventName, handler) => {
      const unsubscribe = moduleEventBus.subscribe(eventName, handler);
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
    subscribe('stateManager:jsonDataLoaded', () => {
      console.log('[Locations Module] Received stateManager:jsonDataLoaded');
      // Initial display update after data is ready
      setTimeout(() => locationInstance?.updateLocationDisplay(), 0);
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
      '[Locations Module] EventBus not available during initialization.'
    );
  }

  console.log('[Locations Module] Initialization complete.');
}

// Refactor handleCheckLocationRequest if it becomes a primary handler
// function handleCheckLocationRequest(locationData) {
//     console.log(`[Locations Module] Handling check request for: ${locationData.name}`);
//     // Check conditions (e.g., is loop mode active?)
//     // If conditions met, handle directly (e.g., add to loop queue)
//     // If not, potentially publish to predecessors
//     // dispatcher.publishToPredecessors('locations', 'user:checkLocation', locationData);
// }

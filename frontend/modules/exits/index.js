// UI Class for this module
import { ExitUI } from './exitUI.js';

// Store instance
let exitInstance = null;
let moduleEventBus = null;
let exitUnsubscribeHandles = []; // Store multiple unsubscribe handles

/**
 * Registration function for the Exits module.
 * Registers the exits panel component.
 */
export function register(registrationApi) {
  console.log('[Exits Module] Registering...');

  // Register the panel component factory
  registrationApi.registerPanelComponent('exitsPanel', (container) => {
    if (!exitInstance) {
      // Needs refactoring - expects gameUI
      exitInstance = new ExitUI(null);
    }

    const rootElement = exitInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Initialize UI when panel is shown
    if (typeof exitInstance.initialize === 'function') {
      setTimeout(() => exitInstance.initialize(), 0);
    }

    // Return object for Golden Layout lifecycle
    return {
      destroy: () => {
        console.log('ExitUI destroy called by GL');
        if (typeof exitInstance?.onPanelDestroy === 'function') {
          exitInstance.onPanelDestroy();
        }
        exitInstance = null;
      },
      // Resize handling if needed
    };
  });

  // No specific settings schema or primary event handlers for Exits registration.
}

/**
 * Initialization function for the Exits module.
 * Subscribes to events needed for reactivity.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Exits Module] Initializing with priority ${priorityIndex}...`);
  moduleEventBus = initializationApi.getEventBus();

  // Clean up previous subscriptions if any
  exitUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  exitUnsubscribeHandles = [];

  if (moduleEventBus) {
    const subscribe = (eventName, handler) => {
      const unsubscribe = moduleEventBus.subscribe(eventName, handler);
      exitUnsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to state changes that affect exit display
    subscribe('stateManager:inventoryChanged', () => {
      console.log('[Exits Module] Received stateManager:inventoryChanged');
      exitInstance?.updateExitDisplay(); // Update UI
    });
    subscribe('stateManager:regionsComputed', () => {
      console.log('[Exits Module] Received stateManager:regionsComputed');
      exitInstance?.updateExitDisplay(); // Update UI
    });
    subscribe('stateManager:jsonDataLoaded', () => {
      console.log('[Exits Module] Received stateManager:jsonDataLoaded');
      setTimeout(() => exitInstance?.updateExitDisplay(), 0);
    });

    // Subscribe to loop state changes
    subscribe('loop:stateChanged', () => {
      exitInstance?.updateExitDisplay();
    });
    subscribe('loop:actionCompleted', () => {
      exitInstance?.updateExitDisplay();
    });
    subscribe('loop:discoveryChanged', () => {
      exitInstance?.updateExitDisplay();
    });
    subscribe('loop:modeChanged', (isLoopMode) => {
      exitInstance?.updateExitDisplay();
      // Show/hide loop-specific controls
      const exploredCheckbox = exitInstance?.rootElement?.querySelector(
        '#exit-show-explored'
      );
      if (exploredCheckbox && exploredCheckbox.parentElement) {
        exploredCheckbox.parentElement.style.display = isLoopMode
          ? 'inline-block'
          : 'none';
      }
    });
  } else {
    console.error(
      '[Exits Module] EventBus not available during initialization.'
    );
  }

  console.log('[Exits Module] Initialization complete.');
}

// UI Class for this module
import { ExitUI } from './exitUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Exits',
  description: 'Exits display panel.',
};

// Store instance
let exitInstance = null;
let moduleEventBus = null;
let exitUnsubscribeHandles = []; // Store multiple unsubscribe handles
let initApi = null; // Store the full init API

// Handler for rules loaded
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Exits Module] Received state:rulesLoaded');
  // Check if instance exists before calling update
  if (exitInstance) {
    // Use setTimeout to ensure it runs after potential DOM updates
    setTimeout(() => exitInstance.updateExitDisplay(), 0);
  } else {
    console.warn(
      '[Exits Module] exitInstance not available for state:rulesLoaded handler.'
    );
  }

  // Propagate the event to the next module in the chain
  const dispatcher = initApi?.getDispatcher(); // Use the stored initApi
  if (dispatcher) {
    const direction = propagationOptions.propagationDirection || 'highestFirst'; // Use incoming direction or default
    dispatcher.publishToNextModule('exits', 'state:rulesLoaded', eventData, {
      direction: direction,
    });
  } else {
    console.error(
      '[Exits Module] Cannot propagate state:rulesLoaded: Dispatcher not available (initApi missing?).'
    );
  }
}

/**
 * Registration function for the Exits module.
 * Registers the exits panel component and event handlers.
 */
export function register(registrationApi) {
  console.log('[Exits Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('exitsPanel', ExitUI);

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

  // Register settings schema if needed

  // No specific settings schema or primary event handlers for Exits registration.
}

/**
 * Initialization function for the Exits module.
 * Minimal setup.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Exits Module] Initializing with priority ${priorityIndex}...`);
  // Store the full API
  initApi = initializationApi;

  // Store eventBus for postInitialize
  moduleEventBus = initializationApi.getEventBus();

  // Clean up previous subscriptions if any (safe practice)
  exitUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  exitUnsubscribeHandles = [];

  console.log('[Exits Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Exits module.
 * Subscribes to events needed for UI reactivity.
 */
export function postInitialize(initializationApi) {
  console.log('[Exits Module] Post-initializing...');
  const eventBus = moduleEventBus || initializationApi.getEventBus();

  if (eventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Exits Module] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
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
      '[Exits Module] EventBus not available during post-initialization.'
    );
  }
  console.log('[Exits Module] Post-initialization complete.');
}

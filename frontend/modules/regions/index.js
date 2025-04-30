// UI Class for this module
import { RegionUI } from './regionUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Regions',
  description: 'Regions display panel.',
};

// Store instance and dependencies
let regionInstance = null;
// Store the function to get the PathAnalyzerUI instance, not the instance itself yet.
let getPathAnalyzerUIFunc = null;
let pathAnalyzerUI = null; // Keep track of the instance once created
let moduleEventBus = null;
let regionUnsubscribeHandles = []; // Store multiple unsubscribe handles
let initApi = null; // Store the full init API

// Handler for rules loaded
function handleRulesLoaded(eventData, propagationOptions = {}) {
  console.log('[Regions Module] Received state:rulesLoaded');
  // Check if instance exists before calling update
  if (regionInstance) {
    // Use setTimeout to ensure it runs after potential DOM updates
    setTimeout(() => regionInstance.update(), 0);
  } else {
    console.warn(
      '[Regions Module] regionInstance not available for state:rulesLoaded handler.'
    );
  }

  // Propagate the event to the next module in the chain
  const dispatcher = initApi?.getDispatcher(); // Use the stored initApi
  if (dispatcher) {
    const direction = propagationOptions.propagationDirection || 'highestFirst'; // Use incoming direction or default
    dispatcher.publishToNextModule('regions', 'state:rulesLoaded', eventData, {
      direction: direction,
    });
  } else {
    console.error(
      '[Regions Module] Cannot propagate state:rulesLoaded: Dispatcher not available (initApi missing?).'
    );
  }
}

/**
 * Registration function for the Regions module.
 * Registers the regions panel component and event handlers.
 */
export function register(registrationApi) {
  console.log('[Regions Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('regionsPanel', RegionUI);

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

  // No specific settings schema or primary event handlers for Regions registration.
}

/**
 * Initialization function for the Regions module.
 * Minimal setup.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Regions Module] Initializing with priority ${priorityIndex}...`
  );
  // Store eventBus for postInitialize
  initApi = initializationApi;

  // Clean up previous subscriptions if any (safe practice)
  regionUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  regionUnsubscribeHandles = [];

  console.log('[Regions Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Regions module.
 * Gets PathAnalyzerUI function reference and subscribes to events.
 */
export async function postInitialize(initializationApi) {
  console.log('[Regions Module] Post-initializing...');
  const eventBus = moduleEventBus || initializationApi.getEventBus();

  // Get the function to create PathAnalyzerUI instance from the pathAnalyzer module
  try {
    getPathAnalyzerUIFunc = initializationApi.getModuleFunction(
      'pathAnalyzer',
      'getPathAnalyzerUIInstance'
    );
    if (!getPathAnalyzerUIFunc) {
      console.error(
        '[Regions Module] Could not find getPathAnalyzerUIInstance function during postInitialize.'
      );
    } else {
      console.log(
        '[Regions Module] Successfully obtained getPathAnalyzerUIInstance function reference.'
      );
      // If regionInstance was already created by the factory, try linking now
      if (regionInstance) {
        tryLinkPathAnalyzer();
      }
    }
  } catch (error) {
    console.error(
      '[Regions Module] Error getting PathAnalyzerUI function reference:',
      error
    );
  }

  // Subscribe to events
  if (eventBus) {
    const subscribe = (eventName, handler) => {
      console.log(`[Regions Module] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      regionUnsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to state changes that affect region display
    subscribe('stateManager:inventoryChanged', () => {
      regionInstance?.update();
    });
    subscribe('stateManager:regionsComputed', () => {
      regionInstance?.update();
    });
    subscribe('stateManager:locationChecked', () => {
      regionInstance?.update();
    });
    subscribe('stateManager:checkedLocationsCleared', () => {
      regionInstance?.update();
    });

    // Subscribe to loop state changes
    subscribe('loop:stateChanged', () => {
      regionInstance?.update();
    });
    subscribe('loop:actionCompleted', () => {
      regionInstance?.update();
    });
    subscribe('loop:discoveryChanged', () => {
      regionInstance?.update();
    });
    subscribe('loop:modeChanged', (isLoopMode) => {
      regionInstance?.update();
      // Show/hide loop-specific controls if any in Regions panel
    });

    // Potentially subscribe to navigation events if Regions needs to react
    // subscribe('ui:navigateToRegion', (regionName) => { ... });
  } else {
    console.error(
      '[Regions Module] EventBus not available during post-initialization.'
    );
  }

  console.log('[Regions Module] Post-initialization complete.');
}

// Helper function to link PathAnalyzerUI
function tryLinkPathAnalyzer() {
  if (!regionInstance) {
    console.warn(
      '[Regions Module] tryLinkPathAnalyzer called but regionInstance is missing.'
    );
    return;
  }
  if (!getPathAnalyzerUIFunc) {
    console.warn(
      '[Regions Module] tryLinkPathAnalyzer called but getPathAnalyzerUIFunc is missing.'
    );
    return;
  }
  if (pathAnalyzerUI) {
    // Already linked
    return;
  }

  console.log('[Regions Module] Attempting to link PathAnalyzerUI...');
  try {
    pathAnalyzerUI = getPathAnalyzerUIFunc(regionInstance); // Call the factory function
    if (pathAnalyzerUI) {
      console.log(
        '[Regions Module] Successfully obtained and linked PathAnalyzerUI instance.'
      );
      // Link it back to the region instance
      regionInstance.pathAnalyzerUI = pathAnalyzerUI;
    } else {
      console.error(
        '[Regions Module] getPathAnalyzerUIFunc returned null or undefined.'
      );
    }
  } catch (error) {
    console.error(
      '[Regions Module] Error calling getPathAnalyzerUIFunc:',
      error
    );
  }
}

// Export the regionInstance or pathAnalyzerUI if needed (generally avoid)
// export { regionInstance };

// UI Class for this module
import { RegionUI } from './regionUI.js';

// Store instance and dependencies
let regionInstance = null;
let pathAnalyzerUI = null; // To store the PathAnalyzerUI instance
let moduleEventBus = null;
let regionUnsubscribeHandles = []; // Store multiple unsubscribe handles

/**
 * Registration function for the Regions module.
 * Registers the regions panel component.
 */
export function register(registrationApi) {
  console.log('[Regions Module] Registering...');

  // Register the panel component factory
  registrationApi.registerPanelComponent(
    'regionsPanel',
    () => new RegionUI() // Return a new instance directly
  );

  // No specific settings schema or primary event handlers for Regions registration.
}

/**
 * Initialization function for the Regions module.
 * Gets PathAnalyzerUI instance and subscribes to events.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Regions Module] Initializing with priority ${priorityIndex}...`
  );
  moduleEventBus = initializationApi.getEventBus();

  // Ensure regionInstance is created before requesting PathAnalyzerUI
  if (!regionInstance) {
    regionInstance = new RegionUI(null, null);
  }

  // Get the PathAnalyzerUI instance from the pathAnalyzer module
  try {
    const getPathAnalyzerUI = initializationApi.getModuleFunction(
      'pathAnalyzer',
      'getPathAnalyzerUIInstance'
    );
    if (getPathAnalyzerUI) {
      // Pass the regionInstance to the PathAnalyzer
      pathAnalyzerUI = getPathAnalyzerUI(regionInstance);
      if (pathAnalyzerUI) {
        console.log(
          '[Regions Module] Successfully obtained PathAnalyzerUI instance.'
        );
        // Update the regionInstance with the pathAnalyzerUI reference
        regionInstance.pathAnalyzerUI = pathAnalyzerUI;
      } else {
        console.error(
          '[Regions Module] Failed to get PathAnalyzerUI instance.'
        );
      }
    } else {
      console.error(
        '[Regions Module] Could not find getPathAnalyzerUIInstance function.'
      );
    }
  } catch (error) {
    console.error('[Regions Module] Error getting PathAnalyzerUI:', error);
  }

  // Clean up previous subscriptions if any
  regionUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
  regionUnsubscribeHandles = [];

  if (moduleEventBus) {
    const subscribe = (eventName, handler) => {
      const unsubscribe = moduleEventBus.subscribe(eventName, handler);
      regionUnsubscribeHandles.push(unsubscribe);
    };

    // Subscribe to state changes that affect region display
    subscribe('stateManager:inventoryChanged', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('stateManager:regionsComputed', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('stateManager:locationChecked', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('stateManager:checkedLocationsCleared', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('stateManager:jsonDataLoaded', () => {
      setTimeout(() => regionInstance?.updateRegionDisplay(), 0);
    });

    // Subscribe to loop state changes
    subscribe('loop:stateChanged', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('loop:actionCompleted', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('loop:discoveryChanged', () => {
      regionInstance?.updateRegionDisplay();
    });
    subscribe('loop:modeChanged', (isLoopMode) => {
      regionInstance?.updateRegionDisplay();
      // Show/hide loop-specific controls if any in Regions panel
    });

    // Potentially subscribe to navigation events if Regions needs to react
    // subscribe('ui:navigateToRegion', (regionName) => { ... });
  } else {
    console.error(
      '[Regions Module] EventBus not available during initialization.'
    );
  }

  console.log('[Regions Module] Initialization complete.');
}

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
  registrationApi.registerPanelComponent('regionsPanel', (container) => {
    if (!regionInstance) {
      // Needs refactoring - expects gameUI and pathAnalyzerUI (or gets it later)
      // For now, create with placeholder and let initialize provide pathAnalyzerUI
      regionInstance = new RegionUI(null, null);
    }

    const rootElement = regionInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Initialize UI when panel is shown
    if (typeof regionInstance.initialize === 'function') {
      // Pass the pathAnalyzerUI instance if it's available
      setTimeout(() => regionInstance.initialize(pathAnalyzerUI), 0);
    }

    // Return object for Golden Layout lifecycle
    return {
      destroy: () => {
        console.log('RegionUI destroy called by GL');
        if (typeof regionInstance?.onPanelDestroy === 'function') {
          regionInstance.onPanelDestroy();
        }
        regionInstance = null;
      },
      // Resize handling if needed
    };
  });

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

  // Get the PathAnalyzerUI instance from the pathAnalyzer module
  try {
    const getPathAnalyzerUI = initializationApi.getModuleFunction(
      'pathAnalyzer',
      'getPathAnalyzerUIInstance'
    );
    if (getPathAnalyzerUI) {
      // Pass 'this' regionInstance (if needed) or null for now.
      // The PathAnalyzer registration expects the requesting UI instance.
      pathAnalyzerUI = getPathAnalyzerUI(regionInstance);
      if (pathAnalyzerUI) {
        console.log(
          '[Regions Module] Successfully obtained PathAnalyzerUI instance.'
        );
        // If regionInstance already exists, potentially update its pathAnalyzerUI reference
        if (regionInstance) {
          regionInstance.pathAnalyzerUI = pathAnalyzerUI;
        }
      } else {
        console.warn('[Regions Module] Failed to get PathAnalyzerUI instance.');
      }
    } else {
      console.warn(
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

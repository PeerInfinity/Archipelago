// Core Logic and UI Classes
import { PathAnalyzerLogic } from './pathAnalyzerLogic.js';
import { PathAnalyzerUI } from './pathAnalyzerUI.js';

// Singletons or other dependencies (if any were needed internally)
// import someDependency from '../../app/core/someDependency.js';

let logicInstance = null;
let uiInstance = null;

// We might not need to store instances globally if they are mainly used by RegionsUI,
// but registerPublicFunction allows RegionsUI to get them when needed.

/**
 * Registration function for the PathAnalyzer module.
 * Registers public functions for other modules to access logic and UI.
 */
export function register(registrationApi) {
  console.log('[PathAnalyzer Module] Registering...');

  // Register public functions for other modules (like Regions) to access
  registrationApi.registerPublicFunction('getPathAnalyzerLogicInstance', () => {
    if (!logicInstance) {
      logicInstance = new PathAnalyzerLogic();
    }
    return logicInstance;
  });

  registrationApi.registerPublicFunction(
    'getPathAnalyzerUIInstance',
    (regionUI) => {
      // PathAnalyzerUI constructor expects regionUI. Pass it when requested.
      // This assumes the requesting module (RegionsUI) will provide its instance.
      if (!uiInstance) {
        if (!regionUI) {
          console.error(
            '[PathAnalyzer Module] getPathAnalyzerUIInstance called without regionUI argument!'
          );
          return null;
        }
        uiInstance = new PathAnalyzerUI(regionUI);
      }
      // If uiInstance already exists, should we update its regionUI reference?
      // For now, return existing instance.
      return uiInstance;
    }
  );

  // Register settings schema if path analyzer has specific settings
  // Example:
  // registrationApi.registerSettingsSchema({
  //     type: 'object',
  //     properties: {
  //         maxAnalysisDepth: { type: 'integer', default: 10 },
  //         defaultMaxPaths: { type: 'integer', default: 100 }
  //     }
  // });
}

/**
 * Initialization function for the PathAnalyzer module.
 * Minimal setup required here, as instances are created on demand.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[PathAnalyzer Module] Initializing with priority ${priorityIndex}...`
  );
  // const settings = await initializationApi.getSettings();
  // const eventBus = initializationApi.getEventBus();

  // Logic and UI are instantiated when requested via getPathAnalyzer... functions.
  // Any non-instance-specific setup could go here.

  console.log('[PathAnalyzer Module] Initialization complete.');
}

// Export the classes directly if needed for type hinting or direct import (less common)
export { PathAnalyzerLogic, PathAnalyzerUI };

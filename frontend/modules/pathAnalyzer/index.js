// Directly export the core classes for other modules to import
export { PathAnalyzerLogic } from './pathAnalyzerLogic.js';
export { PathAnalyzerUI } from './pathAnalyzerUI.js';

// --- Module Info (Optional - keep if used by external tooling) ---
// export const moduleInfo = {
//   name: 'pathAnalyzer',
//   description: 'Path analysis logic.',
// };

/**
 * Registration function for the PathAnalyzer module.
 * Currently only registers settings schema (if defined).
 */
export function register(registrationApi) {
  console.log('[PathAnalyzer Module] Registering...');

  // Remove public function registrations - consumers will import classes directly

  // Register settings schema if path analyzer has specific settings
  // Example:
  // registrationApi.registerSettingsSchema('pathAnalyzer', {
  //     type: 'object',
  //     properties: {
  //         maxAnalysisDepth: { type: 'integer', default: 10 },
  //         defaultMaxPaths: { type: 'integer', default: 100 }
  //     }
  // });

  // Register EventBus publications/subscriptions if needed
  // registrationApi.registerEventBusPublisher('pathAnalyzer', 'someEvent');
  // registrationApi.registerEventBusSubscriber('pathAnalyzer', 'anotherEvent');
}

/**
 * Initialization function for the PathAnalyzer module.
 * Minimal setup needed as logic/UI are instantiated by consumers.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[PathAnalyzer Module] Initializing (ID: ${moduleId}, Priority: ${priorityIndex})...`
  );
  // const settings = initializationApi.getModuleSettings(); // Get module-specific settings
  // const eventBus = initializationApi.getEventBus();
  // const dispatcher = initializationApi.getDispatcher();

  // Perform any module-level setup here that doesn't require class instances.
  // E.g., subscribe to global events if the module itself needs to react.

  console.log('[PathAnalyzer Module] Initialization complete.');
}

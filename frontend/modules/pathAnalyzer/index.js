import eventBus from '../../app/core/eventBus.js';
// Directly export the core classes for other modules to import
export { PathAnalyzerLogic } from './pathAnalyzerLogic.js';
export { PathAnalyzerUI } from './pathAnalyzerUI.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'pathAnalyzer'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'pathAnalyzer'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'pathAnalyzer'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('pathAnalyzerModule', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[pathAnalyzerModule] ${message}`, ...data);
  }
}

// --- Module Info (Optional - keep if used by external tooling) ---
export const moduleInfo = {
  name: 'pathAnalyzer',
  description:
    'Path analysis logic and UI components for region accessibility analysis.',
  version: '1.0.0',
  type: 'utility',
  exports: ['PathAnalyzerLogic', 'PathAnalyzerUI'],
};

/**
 * Registration function for the PathAnalyzer module.
 * Currently only registers settings schema (if defined).
 */
export function register(registrationApi) {
  log('info', '[PathAnalyzer Module] Registering...');

  // Remove public function registrations - consumers will import classes directly

  // Register settings schema for path analyzer
  registrationApi.registerSettingsSchema('pathAnalyzer', {
    type: 'object',
    properties: {
      maxPaths: {
        type: 'integer',
        default: 100,
        minimum: 1,
        maximum: 1000,
        description: 'Maximum number of paths to display in analysis results',
      },
      maxPathFinderIterations: {
        type: 'integer',
        default: 1000,
        minimum: 10,
        maximum: 10000,
        description:
          'Maximum iterations for pathfinding algorithm to prevent infinite loops',
      },
      maxAnalysisTimeMs: {
        type: 'integer',
        default: 5000,
        minimum: 1000,
        maximum: 30000,
        description: 'Maximum time in milliseconds before analysis times out',
      },
    },
  });

  // Register EventBus publications/subscriptions if needed
  // registrationApi.registerEventBusPublisher('someEvent');
  // registrationApi.registerEventBusSubscriber('pathAnalyzer', 'anotherEvent');
}

/**
 * Initialization function for the PathAnalyzer module.
 * Minimal setup needed as logic/UI are instantiated by consumers.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log(
    'info',
    `[PathAnalyzer Module] Initializing (ID: ${moduleId}, Priority: ${priorityIndex})...`
  );
  _moduleEventBus = initializationApi.getEventBus();
  // const settings = initializationApi.getModuleSettings(); // Get module-specific settings
  // const dispatcher = initializationApi.getDispatcher();

  // Perform any module-level setup here that doesn't require class instances.
  // E.g., subscribe to global events if the module itself needs to react.

  log('info', '[PathAnalyzer Module] Initialization complete.');
}

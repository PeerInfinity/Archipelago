// optionsPanel module entry point
import { OptionsPanelUI } from './optionsPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('optionsPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[optionsPanel] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'optionsPanel',
  title: 'Options',
  componentType: 'optionsPanel',
  icon: '\u2699',
  column: 2, // Middle column
  description: 'General application settings and preferences.',
};

// Store module-level references
let moduleEventBus = null;
let moduleDispatcher = null;

/**
 * Registration function for the Options Panel module.
 * Registers the panel component.
 */
export function register(registrationApi) {
  log('info', '[Options Panel Module] Registering...');

  // Register panel component for Golden Layout
  registrationApi.registerPanelComponent('optionsPanel', OptionsPanelUI);

  // Register as publisher for panel activation
  registrationApi.registerEventBusPublisher('ui:activatePanel');

  log('info', '[Options Panel Module] Registration complete.');
}

/**
 * Initialization function for the Options Panel module.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Options Panel Module] Initializing with priority ${priorityIndex}...`);

  // Store API references
  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();

  log('info', '[Options Panel Module] Initialization complete.');
}

// Export getters for use by UI components
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'optionsPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'optionsPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'optionsPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export function getModuleDispatcher() {
  return moduleDispatcher;
}

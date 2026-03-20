// discoveryPanel module entry point
import { DiscoveryPanelUI } from './discoveryPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('discoveryPanel', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[discoveryPanel] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'discoveryPanel',
  title: 'Discovery',
  componentType: 'discoveryPanel',
  icon: '🔍',
  column: 2, // Middle column
  description: 'Discovery mode settings and discovered items display.',
};

// Store module-level references
let moduleEventBus = null;
let moduleDispatcher = null;

/**
 * Registration function for the Discovery Panel module.
 * Registers the panel component.
 */
export function register(registrationApi) {
  log('info', '[Discovery Panel Module] Registering...');

  // Register panel component for Golden Layout
  registrationApi.registerPanelComponent('discoveryPanel', DiscoveryPanelUI);

  log('info', '[Discovery Panel Module] Registration complete.');
}

/**
 * Initialization function for the Discovery Panel module.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Discovery Panel Module] Initializing with priority ${priorityIndex}...`);

  // Store API references
  moduleEventBus = initializationApi.getEventBus();
  moduleDispatcher = initializationApi.getDispatcher();

  log('info', '[Discovery Panel Module] Initialization complete.');
}

// Export getters for use by UI components
export function getModuleEventBus() {
  if (moduleEventBus) return moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'discoveryPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'discoveryPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'discoveryPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

export function getModuleDispatcher() {
  return moduleDispatcher;
}

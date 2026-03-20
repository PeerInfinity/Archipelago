// UI Class for this module
import { ExitUI } from './exitUI.js';
import eventBus from '../../app/core/eventBus.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('exitsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[exitsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'exits',
  title: 'Exits',
  componentType: 'exitsPanel',
  icon: '🚪',
  column: 3, // Right column,
  description: 'Exits display panel.',
};

// Store module-level references
let moduleDispatcher = null;
let _moduleEventBus = null;

// Export function to get dispatcher for use by exitUI
export function getExitsModuleDispatcher() {
  return moduleDispatcher;
}

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'exits'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'exits'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'exits'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

/**
 * Registration function for the Exits module.
 * Registers the exits panel component.
 */
export function register(registrationApi) {
  log('info', '[Exits Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('exitsPanel', ExitUI);

  // Register dispatcher sender for exit click events
  // Uses 'bottom' so that modules loaded later (like loops) get first chance to handle
  registrationApi.registerDispatcherSender('user:exitClicked', 'bottom', 'first');

  // Register settings schema if needed
  // No specific settings schema for Exits registration.
}

/**
 * Initialization function for the Exits module.
 * Gets core APIs and sets up module-level subscriptions if any.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Exits Module] Initializing with priority ${priorityIndex}...`);

  // Store the dispatcher for use by exitUI
  moduleDispatcher = initializationApi.getDispatcher();
  _moduleEventBus = initializationApi.getEventBus();

  log('info', '[Exits Module] Initialization complete.');

  // Return cleanup function
  return () => {
    log('info', '[Exits Module] Cleaning up...');
    moduleDispatcher = null;
    _moduleEventBus = null;
  };
}

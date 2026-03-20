import { PresetUI } from './presetUI.js';
import eventBus from '../../app/core/eventBus.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'presets'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'presets'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'presets'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('presetsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[presetsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'presets',
  title: 'Presets',
  componentType: 'presetsPanel',
  icon: '⚙️',
  column: 2, // Middle column
  description: 'Provides UI for loading preset game rules.',
};

/**
 * Registration function for the Presets module.
 * Registers the panel component and declares event publishing intentions.
 * @param {object} registrationApi - API provided by the initialization script.
 */
export function register(registrationApi) {
  log('info', '[Presets Module] Registering...');

  // Register the panel component, providing the class constructor
  registrationApi.registerPanelComponent('presetsPanel', PresetUI);

  // Declare events published by PresetUI on the EventBus
  registrationApi.registerEventBusPublisher('editor:loadJsonData');
  registrationApi.registerEventBusPublisher('files:jsonLoaded');
  registrationApi.registerEventBusPublisher('ui:notification');
  registrationApi.registerEventBusPublisher('rules:loaded');

  log('info', '[Presets Module] Registration complete.');
}

/**
 * Initialization function for the Presets module.
 * Currently minimal, could be expanded if PresetUI needed injected dependencies.
 * @param {string} moduleId - The unique ID for this module ('presets').
 * @param {number} priorityIndex - The loading priority index.
 * @param {object} initializationApi - API provided by the initialization script.
 */
export async function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[Presets Module] Initializing with priority ${priorityIndex}...`
  );

  _moduleEventBus = initializationApi.getEventBus();

  log('info', '[Presets Module] Initialization complete.');

  // No complex cleanup needed for now, return null or empty function
  return null;
}

// No postInitialize needed currently
// export async function postInitialize(initializationApi) { ... }

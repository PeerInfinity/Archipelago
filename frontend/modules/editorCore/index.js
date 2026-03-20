/**
 * Editor Core Module
 *
 * Provides shared data management for editor UI modules.
 * This is a non-UI module that handles content sources,
 * event subscriptions, and data fetching.
 */

import { editorDataService } from './editorDataService.js';
import { EDITOR_EVENTS } from './editorEvents.js';
import eventBus from '../../app/core/eventBus.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'editorCore'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'editorCore'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'editorCore'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorCoreModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorCoreModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'editorCore',
  title: 'Editor Core',
  description: 'Shared data management for editor panels.',
  // No componentType - this is not a UI module
};

/**
 * Registration function for the Editor Core module.
 * Registers event publishers.
 */
export function register(registrationApi) {
  log('info', '[Editor Core Module] Registering...');

  // Register event publishers
  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('editor:contentResponse');

  log('info', '[Editor Core Module] Registered successfully');
}

/**
 * Initialization function for the Editor Core module.
 * Called after all modules are registered.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Editor Core Module] Initializing (${moduleId}, priority ${priorityIndex})...`);

  _moduleEventBus = initializationApi.getEventBus();

  // Initialize the data service - this sets up all event subscriptions
  editorDataService.initialize();

  log('info', '[Editor Core Module] Initialized successfully');
}

// Re-export for consumers
export { editorDataService } from './editorDataService.js';
export { EDITOR_EVENTS } from './editorEvents.js';
export { defaultConfig, defaultContentSources } from './editorConfig.js';

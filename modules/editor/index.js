// UI Class for this module
import EditorUI from './editorUI.js';
import eventBus from '../../app/core/eventBus.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'editor'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'editor'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'editor'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'editor',
  title: 'Editor',
  componentType: 'editorPanel',
  icon: '✏️',
  column: 2, // Middle column,
  description: 'Text Editor panel.',
};

/**
 * Registration function for the Editor module.
 * Registers the editor panel component.
 */
export function register(registrationApi) {
  log('info', '[Editor Module] Registering...');
  registrationApi.registerPanelComponent('editorPanel', EditorUI);

  registrationApi.registerEventBusPublisher('ui:activatePanel');
  registrationApi.registerEventBusPublisher('editor:contentResponse');
  registrationApi.registerEventBusPublisher('files:jsonLoaded');
}

/**
 * Initialization function for the Editor module.
 * Called after all modules are registered.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Editor Module] Initializing (${moduleId}, priority ${priorityIndex})...`);
  _moduleEventBus = initializationApi.getEventBus();
  log('info', '[Editor Module] Initialized successfully');
}

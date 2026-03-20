// UI Class for this module
import { ProgressBarPanelUI } from './progressBarPanelUI.js';
import eventBus from '../../app/core/eventBus.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'progressBarPanel'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'progressBarPanel'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'progressBarPanel'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('progressBarPanel', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[progressBarPanel] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'progressBarPanel',
  title: 'Progress Bars',
  componentType: 'progressBarPanel',
  icon: '📊',
  column: 2, // Middle column,
  description: 'Panel container for hosting progress bars.',
};

// --- Registration Function ---
export function register(registrationApi) {
  log('info', 'Registering ProgressBarPanel module');
  
  // Register the panel component for Golden Layout
  registrationApi.registerPanelComponent('progressBarPanel', ProgressBarPanelUI);

  registrationApi.registerEventBusPublisher('progressBar:create');
  registrationApi.registerEventBusPublisher('progressBar:destroy');
  registrationApi.registerEventBusPublisher('progressBarPanel:showUIContent');
  registrationApi.registerEventBusPublisher('progressBarPanel:hideUIContent');
  
  log('info', 'ProgressBarPanel module registered successfully');
}

// --- Initialization Function ---
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 'Initializing ProgressBarPanel module');
  _moduleEventBus = initializationApi.getEventBus();

  // No special initialization needed for this simple panel module
  // The UI instances will be created by Golden Layout as needed

  log('info', 'ProgressBarPanel module initialized successfully');

  // Return cleanup function
  return () => {
    log('info', 'Cleaning up ProgressBarPanel module');
    _moduleEventBus = null;
  };
}
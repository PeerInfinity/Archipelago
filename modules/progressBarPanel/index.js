// UI Class for this module
import { ProgressBarPanelUI } from './progressBarPanelUI.js';

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
  name: 'ProgressBarPanel',
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
  
  // No special initialization needed for this simple panel module
  // The UI instances will be created by Golden Layout as needed
  
  log('info', 'ProgressBarPanel module initialized successfully');
  
  // Return cleanup function
  return () => {
    log('info', 'Cleaning up ProgressBarPanel module');
    // No cleanup needed for this module
  };
}
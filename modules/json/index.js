import { JsonUI } from './jsonUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jsonModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[jsonModule] ${message}`, ...data);
  }
}

// Module Info
export const moduleInfo = {
  name: 'JSON Operations',
  description:
    'Manages loading, combining, and saving of various application JSON data sources and modes.',
};

/**
 * Registration function for the JSON module.
 * Registers the panel component.
 */
export function register(registrationApi) {
  log('info', '[JSON Module] Registering...');

  // Register the panel component CLASS constructor
  registrationApi.registerPanelComponent('jsonPanel', JsonUI);

  // TODO: Register any event bus subscribers or publishers if needed directly by the module index
  // TODO: Register any dispatcher receivers or senders if needed
  // TODO: Register settings schema if this module has direct settings

  log('info', '[JSON Module] Registration complete.');
}

/**
 * Initialization function for the JSON module.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[JSON Module] Initializing with ID ${moduleId} and priority ${priorityIndex}...`
  );

  // Logic for this module to interact with the main application components
  // For example, getting the active mode, accessing localStorage, etc.
  // The JsonUI class will handle most of its own internal state and DOM manipulation.

  // Example: Listen for mode changes (if an event is published for it)
  // initializationApi.eventBus.subscribe('app:modeChanged', (newMode) => {
  //   log('info', `[JSON Module] Detected mode change to: ${newMode}`);
  //   // The JsonUI instance itself would need a method to update its display if it's already rendered
  // });

  log('info', '[JSON Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the JSON module.
 */
export function postInitialize(initializationApi) {
  log('info', '[JSON Module] Post-initializing...');
  // Any setup that needs to happen after all other modules are initialized.
  // For instance, fetching initial list of modes from localStorage to display in JsonUI.
}

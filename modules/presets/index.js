import { PresetUI } from './presetUI.js';


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
  title: 'Presets', // Title for the panel
  description: 'Provides UI for loading preset game rules.',
};

// --- Module Scope Variables ---
// Store instances or API references if needed, e.g.,
// let presetUIInstance = null;
// let moduleEventBus = null;

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
  registrationApi.registerEventBusPublisher(
    moduleInfo.name, // Associate with this module
    'editor:loadJsonData'
  );
  registrationApi.registerEventBusPublisher(
    moduleInfo.name,
    'files:jsonLoaded'
  );
  registrationApi.registerEventBusPublisher(moduleInfo.name, 'ui:notification');

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

  // Store API references if needed later
  // moduleEventBus = initializationApi.getEventBus();

  // If PresetUI needed the event bus injected:
  // 1. We'd need a way to get the instance created by PanelManager.
  // 2. Or modify PanelManager to pass the API during construction.
  // 3. Or make PresetUI fetch the bus itself via a static method or singleton.
  // For now, PresetUI will likely continue importing the core eventBus directly internally.

  log('info', '[Presets Module] Initialization complete.');

  // No complex cleanup needed for now, return null or empty function
  return null;
}

// No postInitialize needed currently
// export async function postInitialize(initializationApi) { ... }

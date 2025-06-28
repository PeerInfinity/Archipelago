import { ModulesPanel } from './modulesUI.js';
import eventBus from '../../app/core/eventBus.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('modulesModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[modulesModule] ${message}`, ...data);
  }
}

// Store module ID and API references
let moduleId;
let initializationApi = null;
let modulesPanelInstance = null;

// --- Module Info ---
export const moduleInfo = {
  name: 'Modules',
  description: 'Panel to manage modules.',
};

/**
 * Registers the modules panel component.
 * @param {object} registrationApi - API for registration phase.
 */
export function register(registrationApi) {
  log('info', 'Registering Modules module...');

  // Pass the class constructor directly
  // ModulesPanel constructor no longer takes the initApi directly.
  // It will access the moduleManager via the getInitializationApi function.
  registrationApi.registerPanelComponent('modulesPanel', ModulesPanel);
  // Register intent to subscribe to module state changes
  /* // REMOVED - Registration will happen in UI constructor
  registrationApi.registerEventBusSubscriber(
    'module:stateChanged',
    ModulesPanel.prototype._handleModuleStateChange // Pass the prototype method
  );
  // Register intent to subscribe to init:complete
  registrationApi.registerEventBusSubscriber(
    'init:complete',
    ModulesPanel.prototype._handleInitComplete // Pass the new handler
  );
  */
}

/**
 * Initializes the modules module.
 * @param {string} id - The module's unique ID.
 * @param {number} index - The module's load priority index.
 * @param {object} initApi - API for initialization phase.
 */
export async function initialize(id, index, initApi) {
  log('info', `Initializing Modules module (ID: ${id}, Priority: ${index})`);
  moduleId = id;
  initializationApi = initApi;

  // Get necessary functions/data from initApi
  // const settings = api.getSettings();
  // const dispatcher = api.getDispatcher();
  // const moduleManager = api.getModuleManager(); // Hypothetical manager

  // Subscribe to events needed for UI updates (e.g., when a panel is closed)
  // eventBus.subscribe('panel:closed', handlePanelClosed);
}

// Potentially add an uninitialize function if needed for cleanup
export function uninitialize() {
  log('info', 'Uninitializing Modules module...');
  // eventBus.unsubscribe('panel:closed', handlePanelClosed);
  if (
    modulesPanelInstance &&
    typeof modulesPanelInstance.destroy === 'function'
  ) {
    modulesPanelInstance.destroy();
  }
  modulesPanelInstance = null;
  // Additional cleanup
}

// Export function to get the stored API
export function getInitializationApi() {
  return initializationApi;
}

// Example handler (needs implementation based on panelManager events)
// function handlePanelClosed(closedModuleId) {
//    if (modulesPanelInstance) {
//        modulesPanelInstance.updateCheckboxState(closedModuleId, false);
//    }
// }

// Export any public functions if needed
// export function somePublicFunction() { ... }

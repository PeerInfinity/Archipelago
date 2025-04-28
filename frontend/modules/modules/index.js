import { ModulesPanel } from './modulesUI.js';
import eventBus from '../../app/core/eventBus.js';

// Store module ID and API references
let moduleId;
let api;
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
  console.log('Registering Modules module...');

  // Pass the class constructor directly
  // ModulesPanel constructor no longer takes the initApi directly.
  // It will access the moduleManager via window.moduleManagerApi.
  registrationApi.registerPanelComponent('modulesPanel', ModulesPanel);
}

/**
 * Initializes the modules module.
 * @param {string} id - The module's unique ID.
 * @param {number} index - The module's load priority index.
 * @param {object} initApi - API for initialization phase.
 */
export async function initialize(id, index, initApi) {
  console.log(`Initializing Modules module (ID: ${id}, Priority: ${index})`);
  // api = initApi; // REMOVED: No longer needed for panel factory
  moduleId = id;

  // Get necessary functions/data from initApi
  // const settings = api.getSettings();
  // const dispatcher = api.getDispatcher();
  // const moduleManager = api.getModuleManager(); // Hypothetical manager

  // Subscribe to events needed for UI updates (e.g., when a panel is closed)
  // eventBus.subscribe('panel:closed', handlePanelClosed);
}

// Potentially add an uninitialize function if needed for cleanup
export function uninitialize() {
  console.log('Uninitializing Modules module...');
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

// Example handler (needs implementation based on panelManager events)
// function handlePanelClosed(closedModuleId) {
//    if (modulesPanelInstance) {
//        modulesPanelInstance.updateCheckboxState(closedModuleId, false);
//    }
// }

// Export any public functions if needed
// export function somePublicFunction() { ... }

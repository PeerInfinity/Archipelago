import { ModulesPanel } from './modulesUI.js';
import eventBus from '../../app/core/eventBus.js';

// Store module ID and API references
let moduleId;
let api;
let modulesPanelInstance;

/**
 * Registers the modules panel component.
 * @param {object} registrationApi - API for registration phase.
 */
export function register(registrationApi) {
  console.log('Registering Modules module...');
  registrationApi.registerPanelComponent(
    'modulesPanel',
    (container, componentState) => {
      modulesPanelInstance = new ModulesPanel(container, componentState, api); // Pass api here
      return modulesPanelInstance;
    }
  );
  // register settings schema if needed
  // register event handlers if needed (e.g., for external module state changes)
}

/**
 * Initializes the modules module.
 * @param {string} id - The module's unique ID.
 * @param {number} index - The module's load priority index.
 * @param {object} initApi - API for initialization phase.
 */
export function initialize(id, index, initApi) {
  moduleId = id;
  api = initApi; // Store api for later use in panel creation
  console.log(
    `Initializing Modules module (ID: ${moduleId}, Priority: ${index})`
  );

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

// UI Class for this module
import { InventoryUI } from './inventoryUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Inventory',
  description: 'Inventory display panel.',
};

// // Store instances or state needed by the module
// let inventoryInstance = null; // Instance managed by PanelManager/GoldenLayout
// let moduleEventBus = null; // Get via API or import directly in UI class
// let stateManagerUnsubscribe = null; // Handle for event bus subscription - Handled in UI class
// let initApi = null; // Store the full init API - Handled in UI class if needed

// // Handler for the rules loaded event - Moved to InventoryUI class
// function handleRulesLoaded(eventData, propagationOptions = {}) { ... }

/**
 * Registration function for the Inventory module.
 * Registers the panel component and event bus subscribers.
 */
export function register(registrationApi) {
  console.log('[Inventory Module] Registering...');

  // Register the panel component CLASS constructor
  registrationApi.registerPanelComponent('inventoryPanel', InventoryUI);

  // Register event bus subscribers via centralRegistry for tracking/control
  // The actual subscription happens within the InventoryUI instance.
  registrationApi.registerEventBusSubscriberIntent('stateManager:rulesLoaded');
  registrationApi.registerEventBusSubscriberIntent(
    'stateManager:inventoryChanged'
  );

  // // REMOVED: Dispatcher receiver for state:rulesLoaded
  // registrationApi.registerDispatcherReceiver(
  //   'state:rulesLoaded',
  //   handleRulesLoaded,
  //   { direction: 'up', condition: 'unconditional', timing: 'immediate' } // Propagates
  // );

  // Register settings schema if needed
  // No settings schema specific to Inventory registration.

  console.log('[Inventory Module] Registration complete.');
}

/**
 * Initialization function for the Inventory module.
 * Minimal setup, UI class handles its own initialization.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Inventory Module] Initializing with priority ${priorityIndex}...`
  );
  // Store API if needed by UI class (passed via constructor or method)
  // Currently, UI class imports singletons directly.

  console.log('[Inventory Module] Basic initialization complete.');
}

// REMOVED: postInitialize function. Logic moved to InventoryUI class.
// export function postInitialize(initializationApi) { ... }

// No need to export instance, PanelManager handles it.

// UI Class for this module
import { InventoryUI } from './inventoryUI.js';

// Store dispatcher instance
let moduleDispatcher = null;


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('inventoryModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[inventoryModule] ${message}`, ...data);
  }
}

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
  log('info', '[Inventory Module] Registering...');

  // Register the panel component CLASS constructor
  registrationApi.registerPanelComponent('inventoryPanel', InventoryUI);

  // Register dispatcher sender for user:itemCheck events
  registrationApi.registerDispatcherSender('user:itemCheck', {
    initialTarget: 'bottom',
  });

  // Register event bus subscribers via centralRegistry for tracking/control
  // The actual subscription happens within the InventoryUI instance.
  registrationApi.registerEventBusSubscriberIntent('stateManager:rulesLoaded');
  registrationApi.registerEventBusSubscriberIntent(
    'stateManager:inventoryChanged'
  );
  registrationApi.registerEventBusSubscriberIntent('stateManager:ready');

  // // REMOVED: Dispatcher receiver for state:rulesLoaded
  // registrationApi.registerDispatcherReceiver(
  //   'state:rulesLoaded',
  //   handleRulesLoaded,
  //   { direction: 'up', condition: 'unconditional', timing: 'immediate' } // Propagates
  // );

  // Register settings schema if needed
  // No settings schema specific to Inventory registration.

  log('info', '[Inventory Module] Registration complete.');
}

/**
 * Initialization function for the Inventory module.
 * Minimal setup, UI class handles its own initialization.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[Inventory Module] Initializing with priority ${priorityIndex}...`
  );
  
  // Store dispatcher for use by UI components
  moduleDispatcher = initializationApi.getDispatcher();
  
  // Store API if needed by UI class (passed via constructor or method)
  // Currently, UI class imports singletons directly.

  log('info', '[Inventory Module] Basic initialization complete.');
}

/**
 * Get the dispatcher instance for this module.
 * @returns {object} The dispatcher instance.
 */
export function getDispatcher() {
  return moduleDispatcher;
}

// REMOVED: postInitialize function. Logic moved to InventoryUI class.
// export function postInitialize(initializationApi) { ... }

// No need to export instance, PanelManager handles it.

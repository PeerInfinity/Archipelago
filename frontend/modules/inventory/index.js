// UI Class for this module
import { InventoryUI } from './inventoryUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Inventory',
  description: 'Inventory display panel.',
};

// Store instances or state needed by the module
let inventoryInstance = null;
let moduleEventBus = null;
let stateManagerUnsubscribe = null; // Handle for event bus subscription

// Handler for the rules loaded event
function handleRulesLoaded(eventData) {
  console.log('[Inventory Module] Received state:rulesLoaded');
  // Instance might have been created by registerPanelComponent factory,
  // but check just in case before calling methods.
  if (inventoryInstance) {
    inventoryInstance.syncWithState();
  } else {
    console.warn(
      '[Inventory Module] inventoryInstance not available for state:rulesLoaded handler.'
    );
  }
}

/**
 * Registration function for the Inventory module.
 * Registers the panel component and event handlers.
 */
export function register(registrationApi) {
  console.log('[Inventory Module] Registering...');

  // Register the panel component factory
  // Golden Layout V2 expects the component factory to handle DOM element creation/attachment.
  // registrationApi.registerPanelComponent('inventoryPanel', () => {
  //   // Create instance, assign to module scope, and return
  //   inventoryInstance = new InventoryUI();
  //   return inventoryInstance;
  // });
  // Pass the class constructor directly
  registrationApi.registerPanelComponent('inventoryPanel', InventoryUI);

  // Register event handler for rules loaded
  registrationApi.registerEventHandler('state:rulesLoaded', handleRulesLoaded);

  // Register settings schema if needed

  // No settings schema or primary event handlers specific to Inventory registration.
}

/**
 * Initialization function for the Inventory module.
 * Minimal setup.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Inventory Module] Initializing with priority ${priorityIndex}...`
  );
  // Store eventBus for postInitialize
  moduleEventBus = initializationApi.getEventBus();

  console.log('[Inventory Module] Basic initialization complete.');
}

/**
 * Post-initialization function for the Inventory module.
 * Subscribes to state changes to keep the UI up-to-date.
 */
export function postInitialize(initializationApi) {
  console.log('[Inventory Module] Post-initializing...');

  // Use the stored eventBus or get it again
  const eventBus = moduleEventBus || initializationApi.getEventBus();

  // Subscribe to inventory changes from the stateManager module via eventBus
  if (eventBus) {
    // Ensure previous subscription is cleaned up if somehow run multiple times
    if (stateManagerUnsubscribe) {
      stateManagerUnsubscribe();
    }
    stateManagerUnsubscribe = eventBus.subscribe(
      'stateManager:inventoryChanged',
      () => {
        console.log(
          '[Inventory Module] Received stateManager:inventoryChanged'
        );
        // Instance might have been created by now, or shortly after.
        // Golden Layout will create the instance when the panel is shown.
        inventoryInstance?.syncWithState(); // Update UI based on new state
      }
    );
    console.log(
      '[Inventory Module] Subscribed to stateManager:inventoryChanged.'
    );

    // Subscribe to checked location changes if inventory needs to reflect this
    // eventBus.subscribe('stateManager:locationChecked', () => { ... });
  } else {
    console.error(
      '[Inventory Module] EventBus not available during post-initialization.'
    );
  }

  console.log('[Inventory Module] Post-initialization complete.');
}

// It might be useful to export the instance if other modules need direct access,
// but this should generally be avoided. Communication via events/dispatcher is preferred.
// export { inventoryInstance };

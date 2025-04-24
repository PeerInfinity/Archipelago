// UI Class for this module
import { InventoryUI } from './inventoryUI.js';

// Store instances or state needed by the module
let inventoryInstance = null;
let moduleEventBus = null;
let stateManagerUnsubscribe = null; // Handle for event bus subscription

/**
 * Registration function for the Inventory module.
 * Registers the panel component.
 */
export function register(registrationApi) {
  console.log('[Inventory Module] Registering...');

  // Register the panel component factory
  // Golden Layout V2 expects the component factory to handle DOM element creation/attachment.
  registrationApi.registerPanelComponent('inventoryPanel', (container) => {
    if (!inventoryInstance) {
      // Pass necessary dependencies if InventoryUI constructor requires them.
      // According to the file, it expects `gameUI`. This needs refactoring later.
      // For now, create without args or pass placeholder/null.
      inventoryInstance = new InventoryUI(null);
    }

    // Attach the UI's root element to the container provided by Golden Layout.
    const rootElement = inventoryInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Return an object that Golden Layout might use for lifecycle management (optional).
    // Returning the instance or its root element might be sufficient depending on GL needs.
    return {
      // You might need a destroy method if GL needs to clean up:
      // destroy: () => {
      //     console.log("InventoryUI destroy called by GL");
      //     inventoryInstance?.clear(); // Example cleanup
      //     inventoryInstance = null;
      // }
      // For now, let's assume attaching the element is enough.
    };
  });

  // No settings schema or primary event handlers specific to Inventory registration.
}

/**
 * Initialization function for the Inventory module.
 * Subscribes to state changes to keep the UI up-to-date.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Inventory Module] Initializing with priority ${priorityIndex}...`
  );
  moduleEventBus = initializationApi.getEventBus();
  // const settings = await initializationApi.getSettings(); // If needed
  // const dispatcher = initializationApi.getDispatcher(); // If needed

  // Subscribe to inventory changes from the stateManager module via eventBus
  if (moduleEventBus) {
    // Ensure previous subscription is cleaned up if re-initializing
    if (stateManagerUnsubscribe) {
      stateManagerUnsubscribe();
    }
    stateManagerUnsubscribe = moduleEventBus.subscribe(
      'stateManager:inventoryChanged',
      () => {
        console.log(
          '[Inventory Module] Received stateManager:inventoryChanged'
        );
        // Ensure the inventoryInstance exists before calling sync
        // This check is important because initialization might happen before the panel is rendered.
        if (inventoryInstance) {
          inventoryInstance.syncWithState(); // Update UI based on new state
        } else {
          console.warn(
            '[Inventory Module] InventoryUI instance not yet available for syncWithState.'
          );
        }
      }
    );
    // Also subscribe to data loaded to potentially initialize items/groups
    // This depends on whether InventoryUI needs item/group data passed to it.
    moduleEventBus.subscribe('stateManager:jsonDataLoaded', () => {
      console.log('[Inventory Module] Received stateManager:jsonDataLoaded');
      // We might need to get itemData/groupData from stateManager here?
      // Or perhaps InventoryUI fetches it directly.
      // For now, assume InventoryUI handles its data needs internally or via syncWithState.
      if (inventoryInstance) {
        // Example: inventoryInstance.initialize(stateManager.getItemData(), stateManager.getGroupData());
        // Needs access to stateManager instance/functions.
        // For now, rely on syncWithState being sufficient.
      }
    });

    // Subscribe to checked location changes if inventory needs to reflect this
    // moduleEventBus.subscribe('stateManager:locationChecked', () => { ... });
  } else {
    console.error(
      '[Inventory Module] EventBus not available during initialization.'
    );
  }

  console.log('[Inventory Module] Initialization complete.');
}

// It might be useful to export the instance if other modules need direct access,
// but this should generally be avoided. Communication via events/dispatcher is preferred.
// export { inventoryInstance };

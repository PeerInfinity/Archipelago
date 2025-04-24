// UI Class for this module
import EditorUI from './editorUI.js';

// Store instance if needed
let editorInstance = null;
let moduleEventBus = null;
let editorUnsubscribe = null;

/**
 * Registration function for the Editor module.
 * Registers the editor panel component.
 */
export function register(registrationApi) {
  console.log('[Editor Module] Registering...');

  // Register the panel component factory
  registrationApi.registerPanelComponent('editorPanel', (container) => {
    // Create instance only if it doesn't exist
    if (!editorInstance) {
      editorInstance = new EditorUI();
    }

    // Attach the UI's root element to the container provided by Golden Layout.
    const rootElement = editorInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Call initialize method when panel is shown (if it exists)
    if (typeof editorInstance.initialize === 'function') {
      // Use setTimeout to ensure it runs after attachment
      setTimeout(() => editorInstance.initialize(), 0);
    }

    // Return object for Golden Layout lifecycle events
    return {
      // Provide a destroy callback for Golden Layout
      destroy: () => {
        console.log('EditorUI destroy called by GL');
        if (typeof editorInstance?.onPanelDestroy === 'function') {
          editorInstance.onPanelDestroy();
        }
        editorInstance = null; // Clear instance reference
      },
      // Handle resize events from Golden Layout
      resize: (width, height) => {
        if (typeof editorInstance?.onPanelResize === 'function') {
          editorInstance.onPanelResize(width, height);
        }
      },
    };
  });

  // No specific settings schema for the editor itself is defined in the plan.
  // registrationApi.registerSettingsSchema({ ... });
}

/**
 * Initialization function for the Editor module.
 * Currently minimal, as EditorUI handles its own init logic and event subscriptions.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(`[Editor Module] Initializing with priority ${priorityIndex}...`);
  moduleEventBus = initializationApi.getEventBus();
  // const settings = await initializationApi.getSettings();
  // const dispatcher = initializationApi.getDispatcher();

  // EditorUI handles its own event bus subscriptions within its initialize/destroy methods.
  // We could potentially subscribe here if global coordination is needed.

  console.log('[Editor Module] Initialization complete.');
}

// Export the instance if direct access is needed (generally avoid)
// export { editorInstance };

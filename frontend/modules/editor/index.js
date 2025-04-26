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
  registrationApi.registerPanelComponent(
    'editorPanel',
    () => new EditorUI() // Return a new instance directly
  );

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

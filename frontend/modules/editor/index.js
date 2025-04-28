// UI Class for this module
import EditorUI from './editorUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Editor',
  description: 'JSON Editor panel.',
};

// Store instance and API
let editorInstance = null;
let moduleEventBus = null; // Store eventBus reference if needed
let editorUnsubscribe = null;

// Handler for rules loaded event
function handleRulesLoaded(eventData) {
  console.log('[Editor Module] Received state:rulesLoaded');
  if (editorInstance && eventData.jsonData) {
    editorInstance.loadJsonData(eventData.jsonData);
  } else {
    console.warn(
      '[Editor Module] Editor instance or jsonData not available for state:rulesLoaded.'
    );
  }
}

/**
 * Registration function for the Editor module.
 * Registers the editor panel component and event handler.
 */
export function register(registrationApi) {
  console.log('[Editor Module] Registering...');

  // Register the panel component class constructor directly
  registrationApi.registerPanelComponent('editorPanel', EditorUI);

  // Register event handler for rules loaded
  registrationApi.registerEventHandler('state:rulesLoaded', handleRulesLoaded);

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
  // We previously subscribed to 'editor:loadJsonData' there, which might now be redundant
  // if state:rulesLoaded is the primary way data gets loaded initially.
  // Consider reviewing EditorUI's subscriptions.

  console.log('[Editor Module] Initialization complete.');
}

// Export the instance if direct access is needed (generally avoid)
// export { editorInstance };

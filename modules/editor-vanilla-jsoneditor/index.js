// UI Class for this module
import EditorUI from './editorUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('vanillaJsonEditorModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[vanillaJsonEditorModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'editor-vanilla-jsoneditor',
  description: 'JSON Editor panel.',
};

// Store instance and API
let editorInstance = null;
let moduleEventBus = null; // Store eventBus reference if needed
let editorUnsubscribe = null;
let initApi = null; // Store the full init API
let pendingJsonData = null; // Store data received before UI instance is ready

/**
 * Sets the module-level reference to the EditorUI instance.
 * Called by the EditorUI constructor.
 * Loads any pending data that arrived before the instance was ready.
 * @param {EditorUI} instance The EditorUI instance.
 */
export function setEditorInstance(instance) {
  log('info', '[Editor Module Logic] setEditorInstance called.');
  editorInstance = instance;
  if (pendingJsonData) {
    log('info', 
      '[Editor Module Logic] Loading pending data into newly set instance.'
    );
    editorInstance.loadJsonData(pendingJsonData);
    pendingJsonData = null; // Clear pending data
  }
}

// Handler for rules loaded event
function handleRulesLoaded(eventData) {
  log('info', '[Editor Module Handler] Received stateManager:rulesLoaded');
  if (eventData.jsonData) {
    if (editorInstance) {
      // Instance already exists (set via setEditorInstance), load data directly
      log('info',
        '[Editor Module Handler] Editor instance exists, loading data immediately.'
      );
      editorInstance.loadJsonData(eventData.jsonData);
      pendingJsonData = null; // Ensure pending is clear
    } else {
      // Instance doesn't exist yet, store data for when setEditorInstance is called
      log('info',
        '[Editor Module Handler] Editor instance not yet available, storing pending data.'
      );
      pendingJsonData = eventData.jsonData;
    }
  } else {
    log('warn',
      '[Editor Module Handler] No jsonData received in stateManager:rulesLoaded event.'
    );
  }
}

/**
 * Registration function for the Editor module.
 * Registers the editor panel component and event handler.
 */
export function register(registrationApi) {
  log('info', '[Editor Module] Registering...');

  // Register the panel component class constructor directly
  registrationApi.registerPanelComponent('vanillaJSONEditorPanel', EditorUI);
}

/**
 * Initialization function for the Editor module.
 * Currently minimal, as EditorUI handles its own init logic and event subscriptions.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', `[Editor Module] Initializing with priority ${priorityIndex}...`);
  // Store the full API
  initApi = initializationApi;
  const eventBus = initializationApi.getEventBus();

  // Subscribe to stateManager:rulesLoaded
  if (eventBus) {
    log('info', '[Editor Module] Subscribing to stateManager:rulesLoaded');
    eventBus.subscribe('stateManager:rulesLoaded', handleRulesLoaded, 'editor');
  } else {
    log('error', '[Editor Module] EventBus not available for subscriptions');
  }

  // EditorUI handles its own event bus subscriptions within its initialize/destroy methods.
  // We previously subscribed to 'editor:loadJsonData' there, which might now be redundant
  // if stateManager:rulesLoaded is the primary way data gets loaded initially.
  // Consider reviewing EditorUI's subscriptions.

  log('info', '[Editor Module] Initialization complete.');
}

// Export the instance if direct access is needed (generally avoid)
// export { editorInstance };

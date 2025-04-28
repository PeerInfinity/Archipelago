// UI Class for this module
import OptionsUI from './optionsUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Options',
  description: 'Settings editor panel.',
};

// Store instances or state needed by the module
let optionsInstance = null;

/**
 * Registration function for the Options module.
 * Registers the options panel component.
 */
export function register(registrationApi) {
  console.log('[Options Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('optionsPanel', OptionsUI);

  // Options might have its own settings schema distinct from the main one it edits?
  // registrationApi.registerSettingsSchema({ ... });

  // OptionsUI directly uses settingsManager.updateSettings, doesn't need dispatcher for saves.
  // Might register handlers if it needs to react to external events.
  // registrationApi.registerEventHandler('some:event', handleSomeEvent);
}

/**
 * Initialization function for the Options module.
 * Currently minimal.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  console.log(
    `[Options Module] Initializing with priority ${priorityIndex}...`
  );
  // const eventBus = initializationApi.getEventBus();
  // const settings = await initializationApi.getSettings(); // Maybe get initial settings?
  // const dispatcher = initializationApi.getDispatcher();

  // OptionsUI fetches/updates settings via the imported settingsManager singleton directly.
  // No specific initialization steps required here based on current plan.

  console.log('[Options Module] Initialization complete.');
}

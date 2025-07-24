// UI Class for this module
import SettingsUI from './settingsUI.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('settingsModule', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[settingsModule] ${message}`, ...data);
  }
}

// --- Module Info ---
export const moduleInfo = {
  name: 'Settings',
  description: 'Settings editor panel.',
};

// Store instances or state needed by the module
let settingsInstance = null;

/**
 * Registration function for the settings module.
 * Registers the settings panel component.
 */
export function register(registrationApi) {
  log('info', '[Settings Module] Registering...');

  // Register the panel component class constructor
  registrationApi.registerPanelComponent('settingsPanel', SettingsUI);

  // Settings might have its own settings schema distinct from the main one it edits?
  // registrationApi.registerSettingsSchema({ ... });

  // SettingsUI directly uses settingsManager.updateSettings, doesn't need dispatcher for saves.
  // Might register handlers if it needs to react to external events.
  // registrationApi.registerEventHandler('some:event', handleSomeEvent);
}

/**
 * Initialization function for the Settings module.
 * Currently minimal.
 */
export function initialize(moduleId, priorityIndex, initializationApi) {
  log('info', 
    `[Settings Module] Initializing with priority ${priorityIndex}...`
  );
  // const eventBus = initializationApi.getEventBus();
  // const settings = await initializationApi.getSettings(); // Maybe get initial settings?
  // const dispatcher = initializationApi.getDispatcher();

  // SettingsUI fetches/updates settings via the imported settingsManager singleton directly.
  // No specific initialization steps required here based on current plan.

  log('info', '[Settings Module] Initialization complete.');
}

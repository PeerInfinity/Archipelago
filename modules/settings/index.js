// UI Class for this module
import SettingsUI from './settingsUI.js';
import eventBus from '../../app/core/eventBus.js';

let _moduleEventBus = null;

export function getModuleEventBus() {
  if (_moduleEventBus) return _moduleEventBus;
  // Fallback wrapper before initialize() runs (e.g., GoldenLayout component creation)
  return {
    publish: (event, data) => eventBus.publish(event, data, 'settings'),
    subscribe: (event, callback) => eventBus.subscribe(event, callback, 'settings'),
    unsubscribe: (event, callback) => eventBus.unsubscribe(event, callback, 'settings'),
    publishAs: (event, data, source) => eventBus.publish(event, data, source),
    getAllPublishers: () => eventBus.getAllPublishers(),
    getAllSubscribers: () => eventBus.getAllSubscribers(),
    getAllPublishCounts: () => eventBus.getAllPublishCounts(),
  };
}

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
  name: 'settings',
  title: 'Settings',
  componentType: 'settingsPanel',
  icon: '⚙️',
  column: 2, // Middle column,
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
  _moduleEventBus = initializationApi.getEventBus();

  // SettingsUI fetches/updates settings via the imported settingsManager singleton directly.
  // No specific initialization steps required here based on current plan.

  log('info', '[Settings Module] Initialization complete.');
}

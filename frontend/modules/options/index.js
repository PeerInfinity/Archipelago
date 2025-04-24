// UI Class for this module
import OptionsUI from './optionsUI.js';

// Store instance
let optionsInstance = null;

/**
 * Registration function for the Options module.
 * Registers the options panel component.
 */
export function register(registrationApi) {
  console.log('[Options Module] Registering...');

  // Register the panel component factory
  registrationApi.registerPanelComponent('optionsPanel', (container) => {
    if (!optionsInstance) {
      optionsInstance = new OptionsUI();
    }

    const rootElement = optionsInstance.getRootElement();
    container.element.appendChild(rootElement);

    // Initialize editor when panel is shown
    if (typeof optionsInstance.initialize === 'function') {
      setTimeout(() => optionsInstance.initialize(), 0);
    }

    // Return object for Golden Layout lifecycle
    return {
      destroy: () => {
        console.log('OptionsUI destroy called by GL');
        if (typeof optionsInstance?.onPanelDestroy === 'function') {
          optionsInstance.onPanelDestroy();
        }
        optionsInstance = null;
      },
      resize: (width, height) => {
        if (typeof optionsInstance?.onPanelResize === 'function') {
          optionsInstance.onPanelResize(width, height);
        }
      },
    };
  });

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

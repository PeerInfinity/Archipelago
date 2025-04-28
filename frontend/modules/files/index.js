import FilesUI from './filesUI.js';

// --- Module Info ---
export const moduleInfo = {
  name: 'Files',
  description: 'Presets/Tests/Playthroughs panel.',
};

/**
 * Registers the Files panel component with Golden Layout.
 * @param {GoldenLayout} layoutInstance - The Golden Layout instance.
 */
export function registerFilesComponent(layoutInstance) {
  if (!layoutInstance) {
    console.error(
      'GoldenLayout instance is required to register files component.'
    );
    return;
  }

  const filesUI = new FilesUI(); // Create an instance to manage the UI

  layoutInstance.registerComponentConstructor(
    'filesPanel',
    function (container, componentState) {
      // Get the root element from the FilesUI instance
      const rootElement = filesUI.getRootElement();
      container.element.appendChild(rootElement);

      // Call the initialize method after the element is in the DOM
      filesUI.initialize(rootElement);

      // Optional: Handle component destruction if needed
      container.on('destroy', () => {
        // Perform cleanup if necessary, e.g., remove event listeners
        // filesUI.destroy(); // If you add a destroy method to FilesUI
        console.log('Files Panel component destroyed');
      });
    }
  );

  console.log('Files Panel component registered with Golden Layout.');
}

/**
 * Creates a register function that meets the module architecture requirements.
 * This allows the files module to be loaded and registered like other modules.
 */
export function register(registrationApi) {
  // No-op implementation to ensure the module can be registered
  console.log('[Files Module] Registering...');

  // Register files panel component with the central registry
  registrationApi.registerPanelComponent('filesPanel', FilesUI);
}

/**
 * Initialize function that meets the module architecture requirements.
 * This is called by the initialization system after modules are registered.
 */
export async function initialize(moduleId, priority, initApi) {
  console.log(`[Files Module] Initializing with priority ${priority}...`);

  // Get settings if needed
  const settings = await initApi.getAllSettings();

  // Get event bus if needed for publishing events
  const eventBus = initApi.getEventBus();

  console.log('[Files Module] Initialization complete.');

  return true; // Return success
}

// Optionally export the FilesUI class itself if needed elsewhere
export { FilesUI };

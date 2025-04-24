import FilesUI from './filesUI.js';

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

  layoutInstance.registerComponent(
    'filesPanel',
    function (container, componentState) {
      // Get the root element from the FilesUI instance
      const rootElement = filesUI.getRootElement();
      container.getElement().append(rootElement);

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

// Optionally export the FilesUI class itself if needed elsewhere
export { FilesUI };

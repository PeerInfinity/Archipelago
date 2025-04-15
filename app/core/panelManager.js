// frontend/app/core/panelManager.js
import eventBus from './eventBus.js';
import panelManagerInstance from './panelManagerSingleton.js'; // Import the singleton instance

class PanelManager {
  constructor() {
    this.layout = null; // Golden Layout instance
    this.gameUI = null; // GameUI instance
    this.panelMap = new Map(); // Map<GoldenLayoutContainer, { uiInstance: object, container: GoldenLayoutContainer }>
    console.log('PanelManager instance created');
  }

  /**
   * Initialize the PanelManager with required instances.
   * @param {GoldenLayout} layoutInstance - The Golden Layout instance.
   * @param {GameUI} gameUIInstance - The main GameUI instance.
   */
  initialize(layoutInstance, gameUIInstance) {
    if (!layoutInstance || !gameUIInstance) {
      console.error(
        'PanelManager requires GoldenLayout and GameUI instances for initialization.'
      );
      return;
    }
    this.layout = layoutInstance;
    this.gameUI = gameUIInstance;
    console.log('PanelManager initialized');
  }

  /**
   * Registers a UI component type with Golden Layout using a wrapper class.
   * @param {string} componentTypeName - The name used in Golden Layout config (e.g., 'inventoryPanel').
   * @param {Function} uiInstanceGetter - A function that returns the specific UI instance or provider object.
   */
  registerPanelComponent(componentTypeName, uiInstanceGetter) {
    if (!this.layout) {
      console.error(
        `Cannot register component '${componentTypeName}': PanelManager not initialized.`
      );
      return;
    }
    if (typeof uiInstanceGetter !== 'function') {
      console.error(
        `Cannot register component '${componentTypeName}': uiInstanceGetter must be a function.`
      );
      return;
    }

    console.log(
      `Registering Golden Layout component constructor for: ${componentTypeName}`
    );

    // Define the Wrapper Class Constructor Golden Layout will use
    const WrapperComponent = function (container, componentState) {
      // 'this' refers to the instance of WrapperComponent created by Golden Layout
      console.log(
        `--- WrapperComponent constructor executing for: ${componentTypeName} ---`
      );

      try {
        // 1. Get the actual UI instance/provider
        const uiProvider = uiInstanceGetter();
        if (!uiProvider) {
          throw new Error(
            `Could not get UI instance/provider for ${componentTypeName}`
          );
        }
        console.log(
          `   [${componentTypeName}] Got UI instance/provider:`,
          uiProvider
        );

        // 2. Get the root DOM element
        if (typeof uiProvider.getRootElement !== 'function') {
          throw new Error(
            `UI instance/provider for ${componentTypeName} does not have getRootElement method.`
          );
        }
        const rootElement = uiProvider.getRootElement();
        if (!rootElement || !(rootElement instanceof HTMLElement)) {
          throw new Error(
            `UI instance/provider for ${componentTypeName} did not return a valid root DOM element.`
          );
        }
        console.log(`   [${componentTypeName}] Got root element:`, rootElement);

        // 3. Append the element to the Golden Layout container
        container.getElement().append(rootElement);

        // 4. Add mapping (using the singleton instance of PanelManager)
        panelManagerInstance.addMapping(container, uiProvider);

        // 5. Handle Golden Layout container lifecycle events
        // Store uiProvider in the wrapper instance if needed for event handlers
        this.uiProvider = uiProvider;

        container.on('open', () => {
          console.log(`   [${componentTypeName}] Panel Opened`);
          // Use the captured uiProvider
          if (typeof this.uiProvider.initializeElements === 'function') {
            this.uiProvider.initializeElements(container.getElement());
          } else if (typeof this.uiProvider.syncWithState === 'function') {
            this.uiProvider.syncWithState();
          } // Add other relevant update methods
        });
        container.on('resize', () => {
          console.log(`   [${componentTypeName}] Panel Resized`);
          if (typeof this.uiProvider.onPanelResize === 'function') {
            this.uiProvider.onPanelResize(container.width, container.height);
          }
          // Add other relevant update calls if needed
        });
        container.on('destroy', () => {
          console.log(`   [${componentTypeName}] Panel Destroyed`);
          // Use the captured uiProvider
          if (typeof this.uiProvider.onPanelDestroy === 'function') {
            this.uiProvider.onPanelDestroy();
          }
          // Use the PanelManager singleton instance for cleanup
          panelManagerInstance.removeMapping(container);
        });
        console.log(`   [${componentTypeName}] Lifecycle listeners set up.`);
      } catch (error) {
        console.error(
          `!!! ERROR in WrapperComponent constructor for ${componentTypeName}:`,
          error
        );
        container
          .getElement()
          .html(
            `<h2>Error loading ${componentTypeName}</h2><p>Check console for details.</p><pre style="color: red; white-space: pre-wrap;">${error.stack}</pre>`
          );
      }
      console.log(
        `--- WrapperComponent constructor finished for: ${componentTypeName} ---`
      );
    };

    // Register the WrapperComponent constructor with Golden Layout
    this.layout.registerComponent(componentTypeName, WrapperComponent);
  }

  /**
   * Adds a mapping between a Golden Layout container and a UI instance.
   * @param {GoldenLayoutContainer} container - The Golden Layout container instance.
   * @param {object} uiInstance - The UI component instance.
   */
  addMapping(container, uiInstance) {
    if (this.panelMap.has(container)) {
      console.warn('Container already mapped. Overwriting.', container);
    }
    this.panelMap.set(container, { uiInstance, container });
  }

  /**
   * Removes the mapping for a Golden Layout container.
   * @param {GoldenLayoutContainer} container - The Golden Layout container instance.
   */
  removeMapping(container) {
    if (this.panelMap.has(container)) {
      const { uiInstance } = this.panelMap.get(container);
      this.panelMap.delete(container);
    } else {
    }
  }

  /**
   * Retrieves the UI instance associated with a given Golden Layout container.
   * @param {GoldenLayoutContainer} container - The Golden Layout container instance.
   * @returns {object | null} The UI instance or null if not found.
   */
  getUiInstanceForContainer(container) {
    return this.panelMap.get(container)?.uiInstance || null;
  }

  /**
   * Retrieves the Golden Layout container associated with a given UI instance.
   * @param {object} uiInstance - The UI component instance.
   * @returns {GoldenLayoutContainer | null} The container or null if not found.
   */
  getContainerForUiInstance(uiInstance) {
    for (const [container, mapping] of this.panelMap.entries()) {
      if (mapping.uiInstance === uiInstance) {
        return container;
      }
    }
    return null;
  }

  /**
   * Clears all mappings. Useful during layout reinitialization or major state changes.
   */
  clearAllMappings() {
    this.panelMap.clear();
    console.log('Cleared all panel mappings.');
  }
}

export default PanelManager; // Export the class

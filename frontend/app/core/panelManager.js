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
        this.unsubscribeHandles = []; // Array to store unsubscribe functions

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

        // Subscribe to relevant events based on component type
        if (
          componentTypeName === 'regionsPanel' &&
          uiProvider.navigateToRegion
        ) {
          console.log(
            `[PanelManager] Setting up 'ui:navigateToRegion' listener for regionsPanel`
          );
          const handleRegionNav = eventBus.subscribe(
            'ui:navigateToRegion',
            (data) => {
              console.log(
                `[RegionPanel Wrapper] Event 'ui:navigateToRegion' received for: ${data.regionName}`
              );

              // --- Activate the Panel's Tab ---
              try {
                // --- Add detailed logging for debugging activation ---
                console.log(
                  '[RegionPanel Wrapper] Attempting panel activation...'
                );
                // Find the parent Stack via the tab header
                let stack = container.tab?.header?.parent;
                let contentItemToActivate = null;

                if (stack && stack.type === 'stack') {
                  console.log(
                    '[RegionPanel Wrapper] Found parent stack:',
                    stack
                  );
                  // The content item to activate is usually the one whose tab was clicked,
                  // but since the event originated elsewhere, we need the item linked to *this* container.
                  // The container's parent *should* be the content item itself in GL v2.
                  contentItemToActivate = container.parentItem; // Or container.tab?.contentItem? Let's try parentItem first
                  if (contentItemToActivate) {
                    // Double check it's actually in the found stack
                    if (stack.contentItems.includes(contentItemToActivate)) {
                      console.log(
                        '[RegionPanel Wrapper] Found content item to activate:',
                        contentItemToActivate
                      );
                    } else {
                      console.warn(
                        "[RegionPanel Wrapper] Found content item via parentItem, but it's not in the stack found via tab.header.parent. ContentItem:",
                        contentItemToActivate,
                        'Stack:',
                        stack
                      );
                      contentItemToActivate = null; // Invalidate if not in the stack
                    }
                  } else {
                    // Fallback: find item in stack by container reference if parentItem fails
                    console.warn(
                      '[RegionPanel Wrapper] container.parentItem did not yield a content item. Searching stack...'
                    );
                    contentItemToActivate = stack.contentItems.find(
                      (item) => item.container === container
                    );
                    if (contentItemToActivate) {
                      console.log(
                        '[RegionPanel Wrapper] Found content item by searching stack:',
                        contentItemToActivate
                      );
                    } else {
                      console.warn(
                        '[RegionPanel Wrapper] Could not find content item for this container in the stack.'
                      );
                    }
                  }
                } else {
                  console.warn(
                    '[RegionPanel Wrapper] Could not find parent stack via container.tab.header.parent. Tab:',
                    container.tab,
                    'Header:',
                    container.tab?.header,
                    'Parent:',
                    container.tab?.header?.parent
                  );
                }
                // --- End detailed logging ---

                // Ensure parent stack exists and has the activation method
                if (
                  stack &&
                  stack.type === 'stack' &&
                  contentItemToActivate &&
                  typeof stack.setActiveContentItem === 'function'
                ) {
                  // Check if this container is already the active one to avoid unnecessary calls
                  if (stack.getActiveContentItem() !== contentItemToActivate) {
                    console.log(
                      `[RegionPanel Wrapper] Activating panel tab for ${data.regionName}`
                    );
                    stack.setActiveContentItem(contentItemToActivate); // Activate the specific content item's tab
                  } else {
                    console.log(
                      `[RegionPanel Wrapper] Panel tab for ${data.regionName} is already active.`
                    );
                  }
                } else {
                  console.warn(
                    `[RegionPanel Wrapper] Cannot activate panel tab for ${data.regionName}. Parent stack or setActiveContentItem method not found.`
                  );
                }
              } catch (activationError) {
                console.error(
                  `[RegionPanel Wrapper] Error during panel activation:`,
                  activationError
                );
              }
              // --- End Tab Activation ---

              // Delay slightly to allow Golden Layout to render the activated tab
              setTimeout(() => {
                // Double-check uiProvider and method still exist before calling
                if (
                  this.uiProvider &&
                  typeof this.uiProvider.navigateToRegion === 'function'
                ) {
                  console.log(
                    `[RegionPanel Wrapper] Calling uiProvider.navigateToRegion('${data.regionName}') after delay.`
                  );
                  this.uiProvider.navigateToRegion(data.regionName);
                } else {
                  console.warn(
                    `[RegionPanel Wrapper] Could not call navigateToRegion for ${data.regionName}. uiProvider or method missing after delay.`
                  );
                }
              }, 100); // 100ms delay
            }
          );
          // Store the unsubscribe function for later cleanup
          this.unsubscribeHandles.push(handleRegionNav);
        }

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

          // --- Unsubscribe from events ---
          console.log(
            `[${componentTypeName} Wrapper] Unsubscribing from ${
              this.unsubscribeHandles?.length || 0
            } event(s) on destroy.`
          );
          if (this.unsubscribeHandles && this.unsubscribeHandles.length > 0) {
            this.unsubscribeHandles.forEach((unsubscribe) => {
              try {
                unsubscribe(); // Call the stored unsubscribe function
              } catch (e) {
                console.warn(
                  `[${componentTypeName} Wrapper] Error during event unsubscription:`,
                  e
                );
              }
            });
            this.unsubscribeHandles = []; // Clear the array
          }
          // --- End Unsubscribe ---

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

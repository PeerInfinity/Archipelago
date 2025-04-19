// frontend/app/core/panelManager.js
import eventBus from './eventBus.js';
import panelManagerInstance from './panelManagerSingleton.js'; // Import the singleton instance
import EditorUI from '../ui/editorUI.js'; // <-- Import the new EditorUI
import OptionsUI from '../ui/optionsUI.js'; // <<< Import OptionsUI

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

    // --- Register Core Panels ---
    // Example: Register main content panel if managed here
    // this.registerPanelComponent('mainContentPanel', () => this.gameUI.getMainContentUI());

    // Register the new Editor Panel
    this.registerPanelComponent('editorPanel', () => new EditorUI());
    console.log('Registered editorPanel');
    // Register the new Options Panel
    this.registerPanelComponent('optionsPanel', () => new OptionsUI());
    console.log('Registered optionsPanel');
    // --- End Register Core Panels ---
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
        container.element.append(rootElement);
        console.log(
          `   [${componentTypeName}] Root element appended to container`
        );

        // --- NEW: Attach internal listeners AFTER appending ---
        if (typeof uiProvider.attachInternalListeners === 'function') {
          console.log(
            `   [${componentTypeName}] Calling attachInternalListeners`
          );
          uiProvider.attachInternalListeners();
        }
        // --- END NEW ---

        // --- Call buildInitialStructure if available --- // Keep this for other init tasks if needed
        if (typeof uiProvider.buildInitialStructure === 'function') {
          console.log(
            `   [${componentTypeName}] Calling buildInitialStructure`
          );
          // Pass the rootElement we got and appended
          uiProvider.buildInitialStructure(rootElement);
        }

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

              // --- Add detailed logging for debugging activation ---
              console.log(
                '[RegionPanel Wrapper] Attempting panel activation...'
              );
              // --- V2 Activation Logic (Attempt 4 - Using container.parent) ---
              let componentItem = container.parent; // Use container.parent to get ComponentItem
              let stack = componentItem?.parent; // Get the parent Stack from the ComponentItem

              if (stack && stack.isStack) {
                // Check if the parent is indeed a Stack
                console.log(
                  '[RegionPanel Wrapper] Found parent stack via container.parent.parent:',
                  stack
                );
                console.log(
                  '[RegionPanel Wrapper] Found component item to activate via container.parent:',
                  componentItem
                );
              } else {
                console.warn(
                  '[RegionPanel Wrapper] Could not find parent stack via container.parent.parent. ComponentItem:',
                  componentItem,
                  'Parent:',
                  stack
                );
                stack = null; // Invalidate stack if not found correctly
                componentItem = null;
              }
              // --- End V2 Activation Logic ---

              // Ensure parent stack exists and has the activation method
              if (
                stack &&
                stack.isStack && // Use isStack property check for v2
                componentItem && // Use componentItem here
                typeof stack.setActiveComponentItem === 'function' // V2 uses setActiveComponentItem
              ) {
                // Check if this container is already the active one to avoid unnecessary calls
                if (stack.getActiveComponentItem() !== componentItem) {
                  // V2 uses getActiveComponentItem and compare with componentItem
                  console.log(
                    `[RegionPanel Wrapper] Activating panel tab for ${data.regionName}`
                  );
                  stack.setActiveComponentItem(componentItem); // Activate the specific content item's tab
                } else {
                  console.log(
                    `[RegionPanel Wrapper] Panel tab for ${data.regionName} is already active.`
                  );
                }
              } else {
                console.warn(
                  `[RegionPanel Wrapper] Cannot activate panel tab for ${data.regionName}. Parent stack or setActiveComponentItem method not found.`
                );
              }

              // --- RE-ADD setTimeout block ---
              // Delay slightly to allow Golden Layout to render the activated tab
              setTimeout(() => {
                // Double-check uiProvider and method still exist before calling
                if (
                  this.uiProvider && // 'this' should be correct due to arrow function
                  typeof this.uiProvider.navigateToRegion === 'function'
                ) {
                  console.log(
                    `[RegionPanel Wrapper] Calling uiProvider.navigateToRegion('${data.regionName}') after delay.`
                  );
                  this.uiProvider.navigateToRegion(data.regionName);
                } else {
                  console.warn(
                    `[RegionPanel Wrapper] Could not call navigateToRegion for ${data.regionName}. uiProvider or method missing after delay.`,
                    {
                      hasProvider: !!this.uiProvider,
                      providerType: this.uiProvider?.constructor?.name,
                      hasMethod:
                        typeof this.uiProvider?.navigateToRegion === 'function',
                    }
                  );
                }
              }, 100); // 100ms delay
              // --- END RE-ADD setTimeout block ---
            }
          );
          // Store the unsubscribe function for later cleanup
          this.unsubscribeHandles.push(handleRegionNav);

          // ALSO subscribe to location navigation events if the provider supports it
          if (uiProvider.navigateToLocation) {
            console.log(
              `[PanelManager] Setting up 'ui:navigateToLocation' listener for regionsPanel`
            );
            const handleLocationNav = eventBus.subscribe(
              'ui:navigateToLocation',
              (data) => {
                console.log(
                  `[RegionPanel Wrapper] Event 'ui:navigateToLocation' received for: ${data.locationName} in ${data.regionName}`
                );

                // --- Activate the Panel's Tab (reuse logic from region nav - Apply V2 changes - Attempt 4) ---
                try {
                  // --- V2 Activation Logic ---
                  let componentItem = container.parent; // Use container.parent to get ComponentItem
                  let stack = componentItem?.parent; // Get the parent Stack from the ComponentItem

                  if (stack && stack.isStack) {
                    if (
                      stack.getActiveComponentItem() !== componentItem &&
                      typeof stack.setActiveComponentItem === 'function'
                    ) {
                      console.log(
                        `[RegionPanel Wrapper] Activating panel tab for location ${data.locationName}`
                      );
                      stack.setActiveComponentItem(componentItem); // Use componentItem
                    }
                  } else {
                    console.warn(
                      '[RegionPanel Wrapper] Could not find parent stack for location nav activation via container.parent.parent. ComponentItem:',
                      componentItem,
                      'Parent:',
                      stack
                    );
                  }
                  // --- End V2 Activation Logic ---
                } catch (activationError) {
                  console.error(
                    '[RegionPanel Wrapper] Error during panel activation for location nav:',
                    activationError
                  );
                }
                // --- End Tab Activation ---

                // --- RE-ADD setTimeout block ---
                // Call the internal navigation after delay
                setTimeout(() => {
                  if (
                    this.uiProvider &&
                    typeof this.uiProvider.navigateToLocation === 'function'
                  ) {
                    console.log(
                      `[RegionPanel Wrapper] Calling uiProvider.navigateToLocation('${data.locationName}', '${data.regionName}') after delay.`
                    );
                    this.uiProvider.navigateToLocation(
                      data.locationName,
                      data.regionName
                    );
                  } else {
                    console.warn(
                      `[RegionPanel Wrapper] Could not call navigateToLocation for ${data.locationName}. uiProvider or method missing after delay.`,
                      {
                        hasProvider: !!this.uiProvider,
                        providerType: this.uiProvider?.constructor?.name,
                        hasMethod:
                          typeof this.uiProvider?.navigateToLocation ===
                          'function',
                      }
                    );
                  }
                }, 100); // 100ms delay
                // --- END RE-ADD setTimeout block ---
              }
            );
            this.unsubscribeHandles.push(handleLocationNav);
          }
        }

        // Subscribe LoopUI to queue updates
        if (componentTypeName === 'loopsPanel') {
          console.log(
            `[PanelManager] Setting up 'loopState:queueUpdated' listener for loopsPanel`
          );
          // Ensure uiProvider reference is available within the scope for the handler
          const currentUiProvider = uiProvider; // Capture uiProvider here
          // --- UPDATED CHECK: Use currentUiProvider ---
          if (
            currentUiProvider &&
            typeof currentUiProvider.renderLoopPanel === 'function'
          ) {
            const handleQueueUpdate = eventBus.subscribe(
              'loopState:queueUpdated',
              (data) => {
                console.log(
                  "[LoopPanel Wrapper] Event 'loopState:queueUpdated' received."
                );
                // Use the captured provider instance
                if (currentUiProvider) {
                  currentUiProvider.renderLoopPanel();
                } else {
                  console.warn(
                    '[LoopPanel Wrapper] uiProvider missing on queue update.'
                  );
                }
              }
            );
            this.unsubscribeHandles.push(handleQueueUpdate);
            console.log(
              `   [${componentTypeName}] Subscribed to loopState:queueUpdated`
            );
          } else {
            console.warn(
              `[PanelManager] Could not subscribe loopsPanel to queue updates: currentUiProvider or renderLoopPanel method missing.`
            );
          }
        }

        // 5. Handle Golden Layout container lifecycle events
        // Store uiProvider in the wrapper instance if needed for event handlers
        this.uiProvider = uiProvider;

        container.on('open', () => {
          console.log(`   [${componentTypeName}] Panel Opened`);
          // --- UPDATED: Call syncWithState for inventory instead of initialize ---
          if (componentTypeName === 'inventoryPanel') {
            if (
              this.uiProvider &&
              typeof this.uiProvider.syncWithState === 'function'
            ) {
              console.log(
                `   [${componentTypeName}] Calling syncWithState() on open`
              );
              this.uiProvider.syncWithState();
            } else {
              console.warn(
                `   [${componentTypeName}] syncWithState method not found on open`
              );
            }
          } else {
            // Original logic for other panels (like LoopUI)
            if (
              this.uiProvider &&
              typeof this.uiProvider.initialize === 'function'
            ) {
              console.log(
                `   [${componentTypeName}] Calling initialize() on open`
              );
              this.uiProvider.initialize();
            }
          }
        });
        container.on('resize', () => {
          console.log(`   [${componentTypeName}] Panel Resized`);
          if (
            this.uiProvider &&
            typeof this.uiProvider.onPanelResize === 'function'
          ) {
            this.uiProvider.onPanelResize(
              container.element.clientWidth,
              container.element.clientHeight
            );
          }
          // Add other relevant update calls if needed
        });
        container.on('destroy', () => {
          console.log(`   [${componentTypeName}] Panel Destroyed`);
          if (
            this.uiProvider &&
            typeof this.uiProvider.onPanelDestroy === 'function'
          ) {
            this.uiProvider.onPanelDestroy();
          }
          // Call general dispose if available
          if (
            this.uiProvider &&
            typeof this.uiProvider.dispose === 'function'
          ) {
            console.log(
              `   [${componentTypeName}] Calling uiProvider.dispose()`
            );
            this.uiProvider.dispose();
          }

          // --- Unsubscribe from events managed by the wrapper ---
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
        container.element.innerHTML = `<h2>Error loading ${componentTypeName}</h2><p>Check console for details.</p><pre style="color: red; white-space: pre-wrap;">${error.stack}</pre>`;
      }
      console.log(
        `--- WrapperComponent constructor finished for: ${componentTypeName} ---`
      );
    };

    // Register the WrapperComponent constructor with Golden Layout
    this.layout.registerComponentConstructor(
      componentTypeName,
      WrapperComponent
    );
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

  // --- NEW: Method to easily get EditorUI instance ---
  getEditorUIInstance() {
    for (const [, mapping] of this.panelMap.entries()) {
      if (mapping.uiInstance instanceof EditorUI) {
        return mapping.uiInstance;
      }
    }
    console.warn('Could not find EditorUI instance in panel map.');
    return null;
  }
  // --- END NEW ---

  // --- NEW: Method to easily get OptionsUI instance ---
  getOptionsUIInstance() {
    for (const [, mapping] of this.panelMap.entries()) {
      if (mapping.uiInstance instanceof OptionsUI) {
        return mapping.uiInstance;
      }
    }
    console.warn('Could not find OptionsUI instance in panel map.');
    return null;
  }
  // --- END NEW ---
}

export default PanelManager; // Export the class

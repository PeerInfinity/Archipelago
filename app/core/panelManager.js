// frontend/app/core/panelManager.js
import eventBus from './eventBus.js';
import { GoldenLayout } from '../../libs/golden-layout/js/esm/golden-layout.js';
import { centralRegistry } from './centralRegistry.js'; // Corrected import

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('panelManager', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[panelManager] ${message}`, ...data);
  }
}

class PanelManager {
  constructor() {
    log('info', '[PanelManager CONSTRUCTOR CALLED]', new Date().toISOString());
    this.layout = null; // Golden Layout instance
    this.gameUI = null; // GameUI instance
    this.panelMap = new Map(); // Map<GoldenLayoutContainer, { uiInstance: object, container: GoldenLayoutContainer, componentType: string }>
    this.panelMapById = new Map(); // Map<string, { componentType: string, panelInstance: object }>
    this.isInitialized = false; // Add initialization flag
    log('info', 'PanelManager instance created');
  }

  /**
   * Initialize the PanelManager with required instances.
   * @param {GoldenLayout} goldenLayout - The Golden Layout instance.
   * @param {GameUI} gameUIInstance - The main GameUI instance.
   */
  initialize(goldenLayout, gameUIInstance) {
    // Log entry and the passed goldenLayout object immediately
    // log('info',
    //   '[PanelManager.initialize DEBUG] Method Entered. GoldenLayout object is:',
    //   goldenLayout
    // );
    // Check if goldenLayout looks like a valid GoldenLayout instance
    if (
      !goldenLayout ||
      typeof goldenLayout.registerComponentFactoryFunction !== 'function' ||
      typeof goldenLayout.loadLayout !== 'function'
    ) {
      log(
        'error',
        '[PanelManager.initialize] CRITICAL: Passed goldenLayout object does NOT appear to be a valid GoldenLayout instance.', // Kept as error
        goldenLayout
      );
      this.isInitialized = false;
      return; // Stop if GL instance is bad
    }

    try {
      // log('info', '[PanelManager.initialize DEBUG] Inside main try block.');
      if (this.isInitialized) {
        log('warn', '[PanelManager.initialize] Already initialized. Skipping.');
        return;
      }

      this.goldenLayout = goldenLayout; // Use this.goldenLayout consistently
      this.gameUI = gameUIInstance;
      // log('info',
      //   '[PanelManager.initialize DEBUG] this.goldenLayout has been assigned.'
      // );

      this.panelMap.clear();
      this.panelMapById.clear();
      // log('info',
      //   '[PanelManager.initialize DEBUG] panelMap and panelMapById cleared.'
      // );

      // Subscribe to ui:activatePanel event
      eventBus.subscribe('ui:activatePanel', (payload) => {
        if (payload && payload.panelId) {
          log(
            'info',
            `[PanelManager] Received ui:activatePanel for ${payload.panelId}.`
          );
          this.activatePanel(payload.panelId);
        }
      }, 'panelManager');

      // Subscribe to ui:movePanel event
      eventBus.subscribe('ui:movePanel', (payload) => {
        if (payload && payload.componentType && payload.targetStackId) {
          log(
            'info',
            `[PanelManager] Received ui:movePanel for ${payload.componentType} -> ${payload.targetStackId}`
          );
          this.movePanel(payload.componentType, payload.targetStackId);
        }
      }, 'panelManager');

      // Attempt to populate panelMap from existing items
      if (
        this.goldenLayout &&
        typeof this.goldenLayout.getAllContentItems === 'function'
      ) {
        // log('info',
        //   '[PanelManager.initialize DEBUG] Attempting to get all content items...'
        // );
        const allItems = this.goldenLayout.getAllContentItems(); // Get items
        // log('info',
        //   `[PanelManager.initialize DEBUG] Found ${allItems.length} existing content items.`
        // );
        allItems.forEach((item) => {
          if (item.isComponent && item.componentType && item.id) {
            // For initial population, we don't have the UI instance,
            // so the mapping might be less complete or handled differently.
            // The current addMapping expects (container, uiInstance).
            // For now, let's skip adding to panelMap here as it's primarily populated
            // when components are constructed by GL via registerPanelComponent.
            // The main goal is to get GL initialized.
            // log('info',
            //   `[PanelManager.initialize DEBUG] Existing component found: Type: ${item.componentType}, ID: ${item.id}`
            // );
          }
        });
      } else {
        log(
          'warn',
          '[PanelManager.initialize] this.goldenLayout.getAllContentItems is not a function or goldenLayout not set.' // Kept as warn
        );
      }

      // Attempt to attach event listener
      if (this.goldenLayout && typeof this.goldenLayout.on === 'function') {
        // log('info',
        //   "[PanelManager.initialize DEBUG] Attempting to attach 'itemDestroyed' listener..."
        // );
        this.goldenLayout.on('itemDestroyed', (item) => {
          // Ensure this part is also robust
          try {
            // GL fires itemDestroyed with a BubblingEvent; the actual content item is in item.target
            const contentItem = item.target || item;
            if (contentItem.isComponent) {
              const componentType = contentItem.componentType;
              const panelId = contentItem.id;
              log(
                'info',
                `[PanelManager itemDestroyed Event] Component Type: ${componentType}, Panel ID: ${panelId}`
              );
              if (this.panelMapById.has(panelId)) {
                this.removeMappingByPanelId(panelId);
              } else if (this.panelMap.has(componentType)) {
                log(
                  'warn',
                  `[PanelManager itemDestroyed Event] panelId ${panelId} not in panelMapById. ComponentType ${componentType} might be in panelMap, but not removing by type to avoid ambiguity.`
                );
              }

              // Publish ui:panelManuallyClosed centrally so the modules panel
              // checkbox stays in sync without each module needing to do it.
              const componentEntry = centralRegistry.panelComponents.get(componentType);
              if (componentEntry && componentEntry.moduleId) {
                eventBus.publish('ui:panelManuallyClosed', {
                  moduleId: componentEntry.moduleId,
                }, 'panelManager');
              }
            }
          } catch (e) {
            log(
              'error',
              '[PanelManager itemDestroyed Event] Error in handler:',
              e
            );
          }
        });
        // log('info',
        //   "[PanelManager.initialize DEBUG] 'itemDestroyed' listener attached."
        // );
      } else {
        log(
          'warn',
          '[PanelManager.initialize] this.goldenLayout.on is not a function or goldenLayout not set.' // Kept as warn
        );
      }

      this.isInitialized = true;
      eventBus.publish('panelManager:initialized', {}, 'panelManager');
      // log('info',
      //   '[PanelManager.initialize DEBUG] Initialization COMPLETE. isInitialized set to true.'
      // );
    } catch (error) {
      log(
        'error',
        '[PanelManager.initialize] CRITICAL ERROR during initialization:', // Kept as error
        error,
        error.stack
      );
      this.isInitialized = false; // Ensure it reflects failure
    }
    // log('info',
    //   '[PanelManager.initialize DEBUG] Method Exiting. isInitialized =',
    //   this.isInitialized
    // );
  }

  /**
   * Registers a UI component type with Golden Layout using a wrapper class.
   * @param {string} componentTypeName - The name used in Golden Layout config (e.g., 'inventoryPanel').
   * @param {Function} uiInstanceGetter - A function that returns the specific UI instance or provider object.
   */
  registerPanelComponent(componentTypeName, uiInstanceGetter) {
    if (!this.goldenLayout) {
      log(
        'error',
        `Cannot register component '${componentTypeName}': PanelManager not initialized (goldenLayout instance missing).`
      );
      return;
    }
    if (typeof uiInstanceGetter !== 'function') {
      log(
        'error',
        `Cannot register component '${componentTypeName}': uiInstanceGetter must be a function.`
      );
      return;
    }

    log(
      'info',
      `Registering Golden Layout component constructor for: ${componentTypeName}`
    );

    const self = this; // Capture the PanelManager instance ('this')

    // Define the Wrapper Class Constructor Golden Layout will use
    const WrapperComponent = function (container, componentState) {
      // 'this' refers to the instance of WrapperComponent created by Golden Layout
      log(
        'info',
        `--- WrapperComponent constructor executing for: ${componentTypeName} ---`
      );
      if (componentTypeName === 'timerPanel') {
        log('info', '[timerPanel Wrapper DEBUG] GL Container:', container);
        log(
          'info',
          '[timerPanel Wrapper DEBUG] GL container.element BEFORE append:',
          container.element.cloneNode(true)
        ); // Clone to see its state
      }

      try {
        this.unsubscribeHandles = []; // For eventBus subscriptions specific to this panel instance

        const uiProvider = uiInstanceGetter(container, componentState); // Calls new TimerPanelUI(...)
        if (!uiProvider) throw new Error('Could not get UI instance/provider');

        if (componentTypeName === 'timerPanel') {
          log(
            'info',
            '[timerPanel Wrapper DEBUG] uiProvider (TimerPanelUI instance):'
            //, uiProvider // This might be too verbose or circular for console
          );
        }

        const rootElement = uiProvider.getRootElement(); // This calls TimerPanelUI's getRootElement
        if (!rootElement || !(rootElement instanceof HTMLElement)) {
          log(
            'error',
            `[WrapperComponent for ${componentTypeName}] uiProvider.getRootElement() invalid. Got:`,
            rootElement
          );
          throw new Error('UI did not return a valid root DOM element.');
        }

        if (componentTypeName === 'timerPanel') {
          log(
            'info',
            '[timerPanel Wrapper DEBUG] rootElement from uiProvider.getRootElement():',
            rootElement.cloneNode(true)
          );
          log(
            'info',
            '[timerPanel Wrapper DEBUG] Is rootElement already in DOM?',
            document.body.contains(rootElement)
          );
          if (rootElement.parentNode) {
            log(
              'warn',
              '[timerPanel Wrapper DEBUG] rootElement ALREADY HAS A PARENT before append:',
              rootElement.parentNode
            );
          }
        }

        // THE CRITICAL LINE:
        container.element.append(rootElement);
        // GoldenLayout expects `container.element` to be the direct child it manages for its layout.
        // The UI's content should go *inside* `container.element`.

        if (componentTypeName === 'timerPanel') {
          log(
            'info',
            '[timerPanel Wrapper DEBUG] GL container.element AFTER append:',
            container.element.cloneNode(true)
          );
          log(
            'info',
            '[timerPanel Wrapper DEBUG] Is rootElement now child of container.element?',
            rootElement.parentNode === container.element
          );
        }
        log(
          'info',
          `   [${componentTypeName}] Root element appended to container.element.`
        );

        this.uiProvider = uiProvider;
        this.glContainer = container; // Store GL container

        // Call onMount on the uiProvider, now that its element is in the DOM
        if (typeof uiProvider.onMount === 'function') {
          log(
            'info',
            `   [${componentTypeName}] Calling uiProvider.onMount...`
          );
          uiProvider.onMount(container, componentState); // Pass GL container and state
        }

        // Add mapping to PanelManager for its tracking
        if (self) {
          // 'self' is the PanelManager instance from outer scope
          self.addMapping(container, uiProvider);
        }
      } catch (error) {
        log(
          'error',
          `Error in WrapperComponent constructor for ${componentTypeName}:`,
          error
        );
        container.element.innerHTML = `<div style="padding: 10px; color: red;">Error initializing panel ${componentTypeName}: ${error.message}</div>`;
      }

      // GoldenLayout V2 component lifecycle methods
      // GL will call this.destroy() when the component item is destroyed
      this.destroy = () => {
        log(
          'info',
          `--- WrapperComponent.destroy executing for: ${componentTypeName} ---`
        );
        if (
          this.uiProvider &&
          typeof this.uiProvider.onUnmount === 'function'
        ) {
          try {
            this.uiProvider.onUnmount();
          } catch (unmountError) {
            log(
              'error',
              `Error during ${componentTypeName}.onUnmount:`,
              unmountError
            );
          }
        }
        this.unsubscribeHandles.forEach((unsub) => unsub()); // Clean up any eventBus subscriptions made by this wrapper
        this.unsubscribeHandles = [];

        if (self && this.glContainer) {
          // Use stored GL container for removal
          self.removeMapping(this.glContainer);
        }
        log(
          'info',
          `   [${componentTypeName}] WrapperComponent destroy completed.`
        );
      };

      // Optional: handle show/hide/resize if your UI components need them
      if (this.uiProvider && typeof this.uiProvider.onShow === 'function') {
        container.on('show', () => this.uiProvider.onShow());
      }
      if (this.uiProvider && typeof this.uiProvider.onHide === 'function') {
        container.on('hide', () => this.uiProvider.onHide());
      }
      if (this.uiProvider && typeof this.uiProvider.onResize === 'function') {
        container.on('resize', () => this.uiProvider.onResize());
      }
    };

    // Register the component type with Golden Layout
    try {
      this.goldenLayout.registerComponentFactoryFunction(
        componentTypeName,
        WrapperComponent
      );
      log(
        'info',
        `Successfully registered component factory for ${componentTypeName} with GoldenLayout.`
      );
    } catch (e) {
      log(
        'error',
        `Failed to register component factory for ${componentTypeName} with GoldenLayout:`,
        e
      );
    }
  }

  /**
   * Adds a mapping between a Golden Layout container and a UI instance.
   * @param {GoldenLayoutContainer} container - The Golden Layout container instance.
   * @param {object} uiInstance - The UI component instance.
   */
  addMapping(container, uiInstance) {
    const componentType =
      container.componentType ||
      (uiInstance && uiInstance.constructor
        ? uiInstance.constructor.name
        : 'UnknownType');
    const moduleId =
      uiInstance && uiInstance.moduleId ? uiInstance.moduleId : 'UnknownModule';
    log(
      'info',
      `[PanelManager DEBUG] addMapping: Attempting to ADD componentType '${componentType}' (Module: '${moduleId}'). Current panelMap size BEFORE add: ${this.panelMap.size}. Container componentType: ${container.componentType}`
    );
    if (this.panelMap.has(container)) {
      log(
        'warn',
        '[PanelManager DEBUG] addMapping: Container already mapped. Overwriting.',
        container
      );
    }
    this.panelMap.set(container, { uiInstance, container });
    log(
      'info',
      `[PanelManager DEBUG] addMapping: Successfully ADDED componentType '${componentType}' (Module: '${moduleId}'). New panelMap size AFTER add: ${this.panelMap.size}.`
    );
  }

  /**
   * Removes the mapping for a Golden Layout container.
   * @param {GoldenLayoutContainer} container - The Golden Layout container instance.
   */
  removeMapping(container) {
    if (this.panelMap.has(container)) {
      const { uiInstance } = this.panelMap.get(container);
      // Log before deletion
      const componentType =
        container.componentType ||
        (uiInstance && uiInstance.constructor
          ? uiInstance.constructor.name
          : 'UnknownType');
      const moduleId =
        uiInstance && uiInstance.moduleId
          ? uiInstance.moduleId
          : 'UnknownModule';
      log(
        'info',
        `[PanelManager DEBUG] removeMapping: Attempting to remove componentType '${componentType}' (Module: '${moduleId}') from panelMap. Current size: ${this.panelMap.size}. Container:`,
        container
      );
      this.panelMap.delete(container);
      log(
        'info',
        `[PanelManager DEBUG] removeMapping: Successfully removed. New panelMap size: ${this.panelMap.size}.`
      );
      // Original console log for non-found was empty, let's keep it that way or add a specific one if needed
    } else {
      // log('warn', '[PanelManager] Attempted to remove a container not in panelMap:', container);
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
    log(
      'error',
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    );
    log(
      'error',
      '[PanelManager CRITICAL DEBUG] clearAllMappings CALLED - THIS IS LIKELY THE CULPRIT!',
      new Date().toISOString()
    );
    log(
      'error',
      '!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!'
    );
    this.panelMap.clear();
    log(
      'error',
      '[PanelManager CRITICAL DEBUG] panelMap has been cleared via clearAllMappings.',
      new Date().toISOString()
    );
    log('info', 'Cleared all panel mappings.'); // Original log
  }

  /**
   * Finds and removes the first panel instance corresponding to the given component type.
   * @param {string} componentType - The component type name (e.g., 'filesPanel').
   */
  async destroyPanelByComponentType(componentType) {
    // log('info',
    //   '[PanelManager DEBUG] destroyPanelByComponentType ENTERED. ComponentType:',
    //   componentType
    // );
    // log('info', '[PanelManager DEBUG] `this` context:', this); // Check `this.goldenLayout` and `this.isInitialized` here

    if (!this.isInitialized || !this.goldenLayout || !this.goldenLayout.root) {
      log(
        'error',
        // Kept as error
        '[PanelManager destroy] PanelManager not initialized or GoldenLayout instance/root not available. Cannot destroy panel.',
        {
          isInitialized: this.isInitialized,
          hasGoldenLayout: !!this.goldenLayout,
          hasRoot: !!this.goldenLayout?.root,
        }
      );
      return;
    }

    try {
      log(
        'info',
        // Kept this log as it seems generally useful
        `[PanelManager destroy] Attempting to destroy panel for componentType: ${componentType}`
      );
      let itemToDestroy = null;

      // Use GoldenLayout's API to find the component item(s)
      const components = [];
      // Iterate through all items to find matching componentTypes
      // GoldenLayout V2 does not have a direct getItemsByComponentType on root.
      // We need to traverse the layout.
      function findComponents(item) {
        if (item.isComponent && item.componentType === componentType) {
          components.push(item);
        } else if (item.contentItems && item.contentItems.length > 0) {
          // For Rows, Columns, Stacks
          item.contentItems.forEach(findComponents);
        }
      }

      if (this.goldenLayout.root && this.goldenLayout.root.contentItems) {
        findComponents(this.goldenLayout.root);
      } else {
        log(
          'warn',
          // Kept as warn
          '[PanelManager destroy] GoldenLayout root or root.contentItems is not available for traversal.'
        );
      }

      if (components.length > 0) {
        itemToDestroy = components[0]; // Destroy the first one found, or add more sophisticated logic
        log(
          'info',
          // Kept this log as it seems generally useful
          `[PanelManager destroy] Found panel to destroy via traversal. ComponentType: ${itemToDestroy.componentType}, Title: ${itemToDestroy.title}, ID: ${itemToDestroy.id}`
        );
      } else {
        log(
          'info',
          // Kept this log as it seems generally useful
          `[PanelManager destroy] No panel found with componentType '${componentType}' during layout traversal.`
        );
      }

      // Fallback or alternative: Check panelMapById if traversal fails or as a primary lookup if preferred
      // This assumes panelMapById is correctly populated with component items or their IDs.
      if (!itemToDestroy) {
        log(
          'info',
          // Kept this log as it seems generally useful
          `[PanelManager destroy] Traversal did not find '${componentType}'. Checking panelMapById and panelMap.`
        );
        // Attempt to find via panelMap (which might store component instances or GL containers)
        const panelInfoFromMap = this.getPanelByComponentType(componentType); // Assuming this returns { panelInstance, container, ... }
        if (
          panelInfoFromMap &&
          panelInfoFromMap.container &&
          typeof panelInfoFromMap.container.remove === 'function'
        ) {
          // If panelInfoFromMap.container is the GL ContentItem
          itemToDestroy = panelInfoFromMap.container;
          log(
            'info',
            // Kept this log as it seems generally useful
            `[PanelManager destroy] Found panel to destroy via panelMap/getPanelByComponentType. Type: ${itemToDestroy.componentType}, ID: ${itemToDestroy.id}`
          );
        } else if (
          panelInfoFromMap &&
          panelInfoFromMap.panelInstance &&
          typeof panelInfoFromMap.panelInstance.remove === 'function'
        ) {
          // If panelInfoFromMap.panelInstance is the GL ContentItem (older mapping style)
          itemToDestroy = panelInfoFromMap.panelInstance;
          log(
            'info',
            // Kept this log as it seems generally useful
            `[PanelManager destroy] Found panel to destroy via panelMap (panelInstance). Type: ${itemToDestroy.componentType}, ID: ${itemToDestroy.id}`
          );
        }
      }

      if (itemToDestroy && typeof itemToDestroy.remove === 'function') {
        log(
          'info',
          // Kept this log as it seems generally useful
          `[PanelManager destroy] Calling .remove() on item:`,
          itemToDestroy
        );
        itemToDestroy.remove(); // This should trigger the 'itemDestroyed' event handled in initialize()
        log(
          'info',
          // Kept this log as it seems generally useful
          `[PanelManager destroy] Called .remove() for ${componentType}. Panel should be closing.`
        );
      } else {
        log(
          'warn',
          // Kept as warn
          `[PanelManager destroy] No panel found with componentType '${componentType}' or item is not removable after all checks.`
        );
      }
    } catch (error) {
      log(
        'error',
        '[PanelManager DEBUG] UNCAUGHT ERROR in destroyPanelByComponentType:', // This was important, changed to non-debug
        error,
        error.stack
      );
    }
  }

  /**
   * Destroys ALL panel instances matching the given component type.
   * Used when disabling a module that allows multiple instances.
   * @param {string} componentType - The component type name.
   */
  async destroyAllPanelsByComponentType(componentType) {
    if (!this.isInitialized || !this.goldenLayout || !this.goldenLayout.root) {
      log('error', '[PanelManager destroyAll] Not initialized. Cannot destroy panels.');
      return;
    }

    try {
      const components = [];
      function findComponents(item) {
        if (item.isComponent && item.componentType === componentType) {
          components.push(item);
        } else if (item.contentItems && item.contentItems.length > 0) {
          item.contentItems.forEach(findComponents);
        }
      }
      if (this.goldenLayout.root.contentItems) {
        findComponents(this.goldenLayout.root);
      }

      log('info', `[PanelManager destroyAll] Found ${components.length} instance(s) of ${componentType} to destroy.`);

      // Remove in reverse order to avoid index shifting issues
      for (let i = components.length - 1; i >= 0; i--) {
        const item = components[i];
        if (typeof item.remove === 'function') {
          item.remove();
        }
      }
    } catch (error) {
      log('error', `[PanelManager destroyAll] Error destroying panels for ${componentType}:`, error);
    }
  }

  /**
   * Creates an additional instance of a panel type that supports multiple instances.
   * Unlike createPanelForComponent, this doesn't check for existing instances.
   * @param {string} componentType - The component type name.
   * @param {string} title - The title for the new panel instance.
   * @param {number|null} targetColumn - Target column (1=left, 2=middle, 3=right).
   * @param {object} instanceState - State passed to the component constructor.
   * @returns {object|null} The created panel item.
   */
  async createAdditionalInstance(componentType, title, targetColumn = null, instanceState = {}) {
    log('info', `[PanelManager] Creating additional instance of ${componentType}, title: ${title}`);

    if (!this.isInitialized || !this.goldenLayout) {
      log('error', '[PanelManager] Not initialized. Cannot create instance.');
      return null;
    }

    const state = { ...instanceState, instanceId: Date.now() };

    // Use the same column-based placement as createPanelForComponent
    return this.createPanelForComponent(componentType, title, targetColumn, state);
  }

  // --- NEW: Method to activate a panel --- //
  /**
   * Finds and activates the first panel matching the given component type.
   * @param {string} componentType - The component type name (e.g., 'loopsPanel').
   */
  activatePanel(componentType) {
    log(
      'info',
      `[PanelManager] Attempting to activate panel: ${componentType}`
    );
    if (
      !this.goldenLayout ||
      !this.goldenLayout.isInitialised ||
      !this.goldenLayout.root
    ) {
      log(
        'warn',
        `[PanelManager] Cannot activate panel. GoldenLayout available: ${!!this
          .goldenLayout}, Initialised: ${
          this.goldenLayout ? this.goldenLayout.isInitialised : 'N/A'
        }, Root available: ${
          this.goldenLayout && this.goldenLayout.root
            ? !!this.goldenLayout.root
            : 'N/A'
        }. Panel: ${componentType}`
      );
      return;
    }

    let targetItem = null;
    let stack = null;
    let foundComponent = false;

    // --- BEGIN CORRECTED LOGIC & DEBUG LOGS ---
    log(
      'info',
      '[PanelManager Debug] Trying this.goldenLayout.getAllContentItems()...'
    );
    const allItems = this.goldenLayout.getAllContentItems
      ? this.goldenLayout.getAllContentItems()
      : [];
    log(
      'info',
      `[PanelManager Debug] Found ${allItems.length} items via getAllContentItems.`
    );
    if (allItems.length === 0 && this.goldenLayout.rootItem) {
      log(
        'info',
        '[PanelManager Debug] getAllContentItems returned 0, trying recursive search from rootItem as fallback.'
      );
      // Basic recursive search as a fallback - can be expanded
      function collectComponents(item, collected = []) {
        if (!item) return collected;
        if (item.isComponent) {
          collected.push(item.container); // Usually the container has componentType
        }
        if (item.contentItems && item.contentItems.length > 0) {
          item.contentItems.forEach((child) =>
            collectComponents(child, collected)
          );
        }
        return collected;
      }
      const componentsFromRootItem = collectComponents(
        this.goldenLayout.rootItem
      );
      log(
        'info',
        `[PanelManager Debug] Found ${componentsFromRootItem.length} components via recursive search from rootItem.`
      );
      // This logic path would need to be integrated into the loop below if used
    }
    // --- END CORRECTED LOGIC & DEBUG LOGS ---

    // We will iterate over allItems if populated, otherwise this loop won't run correctly without further changes
    // The main test is whether getAllContentItems works.
    const componentsToSearch = allItems.filter(
      (item) => item.isComponent && item.container
    );

    if (componentsToSearch.length > 0) {
      // Ensure we have components to search
      log(
        'info',
        `[PanelManager] Filtered to ${componentsToSearch.length} actual component items for search.`
      );
      for (const componentItem of componentsToSearch) {
        // componentItem is already the item, not container
        const container = componentItem.container; // The container associated with the component item
        if (!container) {
          log(
            'warn',
            '[PanelManager] ComponentItem found without a container:',
            componentItem
          );
          continue;
        }
        log(
          'info',
          `[PanelManager] Checking component: Type: "${container.componentType}", ID: "${container.id}", Title: "${container.title}"`
        );
        if (container.componentType === componentType) {
          targetItem = componentItem; // This is the ComponentItem (the tab itself)
          stack = targetItem.parent; // Stack should be the parent of the ComponentItem
          foundComponent = true;
          log(
            'info',
            `[PanelManager] MATCH FOUND for "${componentType}". ComponentItem ID: ${targetItem.id}. Stack:`,
            stack
          );
          break;
        }
      }
      if (!foundComponent) {
        log(
          'warn',
          `[PanelManager] Component type "${componentType}" NOT FOUND in layout after checking all components from getAllContentItems.`
        );
      }
    } else {
      log(
        'warn',
        '[PanelManager] No components found via getAllContentItems or searchRoot.getItemsByFilter. Cannot activate panel.'
      );
      return;
    }

    if (
      stack &&
      stack.isStack &&
      targetItem &&
      typeof stack.setActiveComponentItem === 'function'
    ) {
      if (stack.getActiveComponentItem() !== targetItem) {
        log('info', `[PanelManager] Activating panel tab for ${componentType}`);
        stack.setActiveComponentItem(targetItem);
      } else {
        log(
          'info',
          `[PanelManager] Panel tab for ${componentType} is already active.`
        );
      }
    } else {
      log(
        'warn',
        `[PanelManager] Could not activate panel for ${componentType}. Stack or ComponentItem not found, or stack invalid.`
      );
      // Enhanced debug logging for this specific failure case
      log(
        'info',
        `[PanelManager Debug for ${componentType}] Found Component: ${foundComponent}`
      );
      log(
        'info',
        `[PanelManager Debug for ${componentType}] TargetItem:`,
        targetItem
      );
      log('info', `[PanelManager Debug for ${componentType}] Stack:`, stack);
      if (stack) {
        log(
          'info',
          `[PanelManager Debug for ${componentType}] Stack.isStack: ${stack.isStack}`
        );
        log(
          'info',
          `[PanelManager Debug for ${componentType}] typeof Stack.setActiveComponentItem: ${typeof stack.setActiveComponentItem}`
        );
      }
    }
  }
  // --- END NEW METHOD --- //

  removeMappingByPanelId(panelId) {
    if (!panelId) {
      log(
        'warn',
        '[PanelManager removeMappingByPanelId] Panel ID is null or undefined. Cannot remove.'
      );
      return;
    }
    const mappingDetails = this.panelMapById.get(panelId);
    if (mappingDetails) {
      this.panelMapById.delete(panelId);
      // Also remove from the other map if it's consistent
      if (this.panelMap.has(mappingDetails.componentType)) {
        const panelInMap = this.panelMap.get(mappingDetails.componentType);
        if (panelInMap && panelInMap.id === panelId) {
          this.panelMap.delete(mappingDetails.componentType);
          log(
            'info',
            `[PanelManager REMOVE MAPPING BY ID] Removed componentType "${mappingDetails.componentType}" from panelMap as well.`
          );
        }
      }
      log(
        'info',
        `[PanelManager REMOVE MAPPING BY ID] panelId: "${panelId}", componentType: "${mappingDetails.componentType}". panelMapById size: ${this.panelMapById.size}, panelMap size: ${this.panelMap.size}`
      );
    } else {
      log(
        'warn',
        `[PanelManager REMOVE MAPPING BY ID] No mapping found for panelId: "${panelId}".`
      );
    }
  }

  removeMappingByComponentType(componentType) {
    if (!componentType) {
      log(
        'warn',
        '[PanelManager removeMappingByComponentType] Component type is null or undefined. Cannot remove.'
      );
      return;
    }
    const panelInstance = this.panelMap.get(componentType);
    if (panelInstance) {
      this.panelMap.delete(componentType);
      // Also remove from the other map if it's consistent
      if (panelInstance.id && this.panelMapById.has(panelInstance.id)) {
        const mappingDetailsById = this.panelMapById.get(panelInstance.id);
        if (mappingDetailsById.componentType === componentType) {
          this.panelMapById.delete(panelInstance.id);
          log(
            'info',
            `[PanelManager REMOVE MAPPING BY TYPE] Removed panelId "${panelInstance.id}" from panelMapById as well.`
          );
        }
      }
      log(
        'info',
        `[PanelManager REMOVE MAPPING BY TYPE] componentType: "${componentType}", panelId: "${
          panelInstance.id || 'N/A'
        }". panelMap size: ${this.panelMap.size}, panelMapById size: ${
          this.panelMapById.size
        }`
      );
    } else {
      log(
        'warn',
        `[PanelManager REMOVE MAPPING BY TYPE] No mapping found for componentType: "${componentType}".`
      );
    }
  }

  findComponentTypeByPanelId(panelId) {
    const mapping = this.panelMapById.get(panelId);
    if (mapping) {
      return mapping.componentType;
    }
    return null;
  }

  // Utility to find a panel (ContentItem) by its componentType
  getPanelByComponentType(componentType) {
    for (const [container, mapping] of this.panelMap.entries()) {
      if (container.componentType === componentType) {
        return container;
      }
    }
    return null;
  }

  // MODIFIED createPanelForComponent (V9) — supports targetColumn for placement
  async createPanelForComponent(
    componentType,
    title = componentType,
    targetColumn = null,
    additionalState = {}
  ) {
    log(
      'info',
      `[PanelManager createPanelForComponent V9] Called for type: ${componentType}, title: ${title}, targetColumn: ${targetColumn}`
    );

    if (!this.isInitialized || !this.goldenLayout) {
      log(
        'error',
        '[PanelManager V9] PanelManager not initialized or GoldenLayout instance missing.'
      );
      return null;
    }

    try {
      const expectedTitleStr = title || componentType;

      // If a target column is specified, try to add directly to that stack
      if (targetColumn) {
        const targetStack = this._findStackForColumn(targetColumn);
        if (targetStack && typeof targetStack.addChild === 'function') {
          log(
            'info',
            `[PanelManager V9] Adding to target stack for column ${targetColumn} (stack id: ${targetStack.id || 'none'})`
          );
          // addItem resolves the config, creates the ContentItem, then calls addChild.
          // addChild alone requires an already-instantiated ComponentItem (not a config),
          // and throws Assert SACC88532 if given a plain object.
          const newItemIndex = targetStack.addItem({
            type: 'component',
            componentType: componentType,
            title: expectedTitleStr,
            componentState: additionalState || {},
          });
          const newItem = targetStack.contentItems[newItemIndex];
          log('info', '[PanelManager V9] Added to target stack successfully.');
          return newItem;
        }
        log(
          'warn',
          `[PanelManager V9] Could not find target stack for column ${targetColumn}, falling back to default placement.`
        );
      }

      // Default placement: use GL's addComponent
      log(
        'info',
        `[PanelManager V9] Attempting this.goldenLayout.addComponent('${componentType}', '${expectedTitleStr}', ...)`,
        additionalState
      );

      const addResult = this.goldenLayout.addComponent(
        componentType,
        expectedTitleStr,
        additionalState || {}
      );

      log(
        'info',
        '[PanelManager V9] this.goldenLayout.addComponent call result:',
        addResult
      );

      let resolvedItem = null;

      if (
        addResult &&
        addResult.parentItem &&
        typeof addResult.index === 'number' &&
        addResult.parentItem.contentItems
      ) {
        log(
          'info',
          `[PanelManager V9] addResult provides parentItem & index. Accessing parentItem.contentItems[${addResult.index}]`
        );
        resolvedItem = addResult.parentItem.contentItems[addResult.index];
      } else if (
        addResult &&
        typeof addResult.setTitle === 'function' &&
        'id' in addResult &&
        'title' in addResult
      ) {
        log(
          'info',
          '[PanelManager V9] addResult itself looks like a ComponentItem.'
        );
        resolvedItem = addResult;
      } else {
        log(
          'warn',
          '[PanelManager V9] addComponent did not return {parentItem, index} or a direct ComponentItem-like object. addResult:',
          addResult
        );
      }

      if (
        resolvedItem &&
        typeof resolvedItem.setTitle === 'function' &&
        'id' in resolvedItem &&
        'title' in resolvedItem
      ) {
        log(
          'info',
          `[PanelManager V9] Resolved ComponentItem. Current ID: '${resolvedItem.id}', Initial Reported Title: '${resolvedItem.title}', Expected Title: '${expectedTitleStr}'`
        );
        if (String(resolvedItem.title) !== expectedTitleStr) {
          if (
            typeof resolvedItem.title === 'string' &&
            resolvedItem.title !== '[object Object]'
          ) {
            log(
              'warn',
              `[PanelManager V9] Title mismatch. Current: '${resolvedItem.title}'. Attempting setTitle(\'${expectedTitleStr}\').`
            );
          } else if (typeof resolvedItem.title !== 'string') {
            log(
              'info',
              `[PanelManager V9] Initial title was not a string (type: ${typeof resolvedItem.title}). Attempting setTitle(\'${expectedTitleStr}\').`
            );
          }
          resolvedItem.setTitle(expectedTitleStr);
          log(
            'info',
            `[PanelManager V9] Title after setTitle: '${resolvedItem.title}'`
          );
        } else {
          log('info', '[PanelManager V9] Title is already correct.');
        }
        return resolvedItem;
      } else {
        log(
          'error',
          '[PanelManager V9] Could not resolve a valid ComponentItem or it lacks essential properties/methods. Resolved item:',
          resolvedItem,
          'Original addResult:',
          addResult
        );
        return resolvedItem || addResult;
      }
    } catch (error) {
      log(
        'error',
        `[PanelManager V9] Error in createPanelForComponent for '${componentType}':`,
        error,
        error.stack
      );
      if (error.message && error.message.includes('Unknown component type')) {
        log(
          'error',
          `[PanelManager V9] Error suggests componentType "${componentType}" might not be registered.`
        );
      }
      return null;
    }
  }

  // Helper to find the first stack or a valid row/column to add to
  findFirstStackOrParent(item) {
    if (!item) return null; // Guard against null item
    if (item.isStack || item.isRow || item.isColumn) {
      if (typeof item.addChild === 'function') {
        // Ensure it can have children added this way
        return item;
      }
    }
    if (item.contentItems) {
      for (const child of item.contentItems) {
        const found = this.findFirstStackOrParent(child);
        if (found) return found;
      }
    }
    // Fallback to root if it's a suitable container (this might be redundant if initial call is root)
    // if (this.goldenLayout.root && (this.goldenLayout.root.isRow || this.goldenLayout.root.isColumn) && typeof this.goldenLayout.root.addChild === 'function') {
    //     if (item === this.goldenLayout.root) return this.goldenLayout.root; // Avoid re-checking if item is already root
    // }
    return null;
  }

  // Helper function to find an item by ID (recursive)
  findItemByIdRecursive(item, id) {
    if (!item) return null; // Guard against null item
    if (item.id === id) {
      return item;
    }
    if (item.contentItems) {
      for (const child of item.contentItems) {
        const found = this.findItemByIdRecursive(child, id);
        if (found) {
          return found;
        }
      }
    }
    return null;
  }

  /**
   * Find the appropriate stack for a given column number (1=left, 2=middle, 3=right).
   * Tries by stack ID first, then by index, then creates new stacks if needed.
   * @param {number} column - The target column (1-based).
   * @returns {object|null} The stack to add a component to.
   */
  _findStackForColumn(column) {
    const columnToStackId = { 1: 'left-stack', 2: 'middle-stack', 3: 'right-stack' };
    const stackId = columnToStackId[column];
    const root = this.goldenLayout.root;

    // Try by stack ID first
    if (stackId) {
      const stack = this.findItemByIdRecursive(root, stackId);
      if (stack) return stack;
    }

    // Fallback: try by index
    const stacks = this._getAllStacks(root);
    const targetIndex = column - 1;

    if (targetIndex >= 0 && targetIndex < stacks.length) {
      return stacks[targetIndex];
    }

    // Create new stacks until we have enough
    const rootRow = this._findRootRow(root);
    if (!rootRow) {
      log('warn', '[PanelManager] Cannot create new stack: no root row found');
      return stacks.length > 0 ? stacks[stacks.length - 1] : null;
    }

    // Create stacks to fill up to the target index.
    // addItem (not addChild) is required here — addChild expects an already-instantiated
    // ContentItem, while addItem accepts a config and handles creation internally.
    while (this._getAllStacks(root).length <= targetIndex) {
      log('info', `[PanelManager] Creating new stack for column ${this._getAllStacks(root).length + 1}`);
      rootRow.addItem({ type: 'stack', content: [] });
    }

    // Redistribute widths evenly across all stacks in the root row
    const updatedStacks = this._getAllStacks(root);
    if (rootRow.contentItems && rootRow.contentItems.length > 0) {
      const equalWidth = 100 / rootRow.contentItems.length;
      for (const child of rootRow.contentItems) {
        if (typeof child.setSize === 'function') {
          child.setSize(equalWidth, undefined);
        }
      }
    }

    const finalStacks = this._getAllStacks(root);
    if (targetIndex < finalStacks.length) {
      return finalStacks[targetIndex];
    }
    return finalStacks.length > 0 ? finalStacks[finalStacks.length - 1] : null;
  }

  /**
   * Collect all stacks in the layout tree in document order.
   * @param {object} item - The root item to start from.
   * @param {Array} stacks - Accumulator array.
   * @returns {Array} All stack items.
   */
  _getAllStacks(item, stacks = []) {
    if (!item) return stacks;
    if (item.isStack) stacks.push(item);
    if (item.contentItems) {
      for (const child of item.contentItems) {
        this._getAllStacks(child, stacks);
      }
    }
    return stacks;
  }

  /**
   * Move an existing panel to a different stack, identified by its Golden Layout ID
   * (e.g., 'left-stack', 'middle-stack', 'right-stack').
   *
   * Uses the same removeChild(item, true) + addChild(item) reparenting pattern
   * that Golden Layout's own drag/drop system uses internally.
   *
   * @param {string} componentType - The component type to move (e.g., 'loopsPanel').
   * @param {string} targetStackId - The ID of the target stack (e.g., 'left-stack').
   * @returns {boolean} True if the panel was moved successfully.
   */
  movePanel(componentType, targetStackId) {
    if (!this.goldenLayout || !this.goldenLayout.isInitialised || !this.goldenLayout.root) {
      log('warn', `[PanelManager movePanel] Cannot move panel — GoldenLayout not ready.`);
      return false;
    }

    // Find the component item
    const allItems = this.goldenLayout.getAllContentItems ? this.goldenLayout.getAllContentItems() : [];
    const componentItem = allItems.find(
      item => item.isComponent && item.container && item.container.componentType === componentType
    );
    if (!componentItem) {
      log('warn', `[PanelManager movePanel] Component "${componentType}" not found in layout.`);
      return false;
    }

    // Find the target stack by ID
    const targetStack = this.findItemByIdRecursive(this.goldenLayout.root, targetStackId);
    if (!targetStack || !targetStack.isStack) {
      log('warn', `[PanelManager movePanel] Target stack "${targetStackId}" not found.`);
      return false;
    }

    // Check if already in the target stack
    const sourceStack = componentItem.parent;
    if (sourceStack === targetStack) {
      log('info', `[PanelManager movePanel] "${componentType}" is already in "${targetStackId}", activating.`);
      if (typeof targetStack.setActiveComponentItem === 'function') {
        targetStack.setActiveComponentItem(componentItem, true);
      }
      return true;
    }

    // Reparent: remove from source without destroying, add to target
    log('info', `[PanelManager movePanel] Moving "${componentType}" from stack "${sourceStack.id || '?'}" to "${targetStackId}".`);
    sourceStack.removeChild(componentItem, true);
    targetStack.addChild(componentItem);

    // Activate the moved panel in its new stack
    if (typeof targetStack.setActiveComponentItem === 'function') {
      targetStack.setActiveComponentItem(componentItem, true);
    }

    log('info', `[PanelManager movePanel] Successfully moved "${componentType}" to "${targetStackId}".`);
    return true;
  }

  /**
   * Find the root row container in the layout (the top-level row that holds columns/stacks).
   * @param {object} item - The root item to start from.
   * @returns {object|null} The root row item.
   */
  _findRootRow(item) {
    if (!item) return null;
    if (item.isRow) return item;
    if (item.contentItems) {
      for (const child of item.contentItems) {
        const found = this._findRootRow(child);
        if (found) return found;
      }
    }
    return null;
  }
}

export default new PanelManager();

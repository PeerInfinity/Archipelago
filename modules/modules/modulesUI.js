import { centralRegistry } from '../../app/core/centralRegistry.js';
import eventBus from '../../app/core/eventBus.js';
import { getInitializationApi } from './index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('modulesUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[modulesUI] ${message}`, ...data);
  }
}

// import ModuleManagerAPI from '../managerAPI.js'; // REMOVED - Use window.moduleManagerApi instead

// Basic CSS for the panel
const CSS = `
.modules-panel {
    padding: 10px;
    font-family: sans-serif;
    height: 100%;
    overflow-y: auto;
    box-sizing: border-box;
}
.module-entry {
    border: 1px solid #444;
    border-radius: 4px;
    margin-bottom: 8px;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #333;
}
.module-info {
    flex-grow: 1;
    margin-right: 10px;
}
.module-name {
    font-weight: bold;
    margin-bottom: 4px;
}
.module-description {
    font-size: 0.9em;
    color: #ccc;
}
.module-controls {
    display: flex;
    align-items: center;
    gap: 5px;
}
.module-controls label {
    display: flex;
    align-items: center;
    cursor: pointer;
}
.module-controls input[type="checkbox"] {
    margin-right: 5px;
}
/* Basic button styling */
.module-controls button {
    padding: 3px 6px;
    cursor: pointer;
    background-color: #555;
    color: white;
    border: 1px solid #666;
    border-radius: 3px;
}
.module-controls button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
.module-controls button:hover:not(:disabled) {
    background-color: #777;
}
`;

export class ModulesPanel {
  constructor(container, componentState) {
    this.container = container;
    this.moduleStates = {}; // Store state like { moduleId: { enabled: true, definition: {...} } }
    this.loadPriority = [];
    this.rootElement = null;
    this.buttonContainer = null; // Added
    this.moduleListContainer = null; // Added
    this.externalModuleCounter = 0; // Counter for unique external module IDs
    this.appReadyHandler = this._handleAppReady.bind(this); // MODIFIED: Store bound handler for app:ready
    this.moduleStateHandler = this._handleModuleStateChange.bind(this);
    this.moduleLoadHandler = this._handleModuleLoaded.bind(this);
    this.moduleFailHandler = this._handleModuleLoadFailed.bind(this);
    this.moduleId = 'modules'; // Assume module ID is known or passed differently if needed
    this.initApi = getInitializationApi(); // Get the API object

    // GoldenLayout specifics
    // this.container.setTitle('Modules'); // Title is usually set by GL config or PanelManager
    this._initializeUI();
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(container, componentState) {
    // container is the GoldenLayout ComponentContainer
    // componentState is the state passed by GoldenLayout
    log('info', 
      '[ModulesPanel onMount] Called. Container:',
      container,
      'State:',
      componentState
    );
    // this.container = container; // Re-assign if necessary, though constructor already has it.

    // Ensure title is set if not already
    if (this.container && typeof this.container.setTitle === 'function') {
      this.container.setTitle('Modules');
    }
  }

  _initializeUI() {
    // Add basic styling
    const style = document.createElement('style');
    style.textContent = CSS;
    // this.container.getElement().appendChild(style); // REMOVED: Append to rootElement instead

    // Create main panel container
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'modules-panel';
    this.rootElement.appendChild(style); // APPEND STYLE TO ROOT ELEMENT

    // Create container for buttons
    this.buttonContainer = document.createElement('div');
    this.buttonContainer.className = 'modules-panel-buttons';
    this.rootElement.appendChild(this.buttonContainer);

    // Create container for the module list
    this.moduleListContainer = document.createElement('div');
    this.moduleListContainer.className = 'modules-panel-list';
    this.rootElement.appendChild(this.moduleListContainer);

    // Append the main container to Golden Layout
    // this.container.getElement().appendChild(this.rootElement); // REMOVED: Factory in init.js will handle this

    // Add controls like buttons to the button container
    this._addControls(); // Renamed from _addTestButton

    // Listen for app ready event before fetching data
    // Use the bound named handler
    this.appReadyListener = eventBus.subscribe(
      'app:readyForUiDataLoad', // MODIFIED: Listen to app:ready
      this.appReadyHandler
    );
    // NOW register the subscription with the registry
    centralRegistry.registerEventBusSubscriberIntent(
      this.moduleId,
      'app:readyForUiDataLoad' // MODIFIED: Register intent for app:ready
    );

    // Subscribe to external events using bound handlers
    eventBus.subscribe('module:stateChanged', this.moduleStateHandler);
    centralRegistry.registerEventBusSubscriberIntent(
      this.moduleId,
      'module:stateChanged'
    );

    // eventBus.subscribe('panel:closed', this._handlePanelClosed.bind(this)); // Keep commented for now
    eventBus.subscribe('module:loaded', this.moduleLoadHandler); // Listen for newly loaded modules
    // No need to register 'module:loaded' or 'failed' unless we add UI toggles for them
    eventBus.subscribe(
      'module:loadFailed',
      this.moduleFailHandler // Listen for load failures
    );
  }

  async _requestModuleData(moduleManager) {
    // Use the globally exposed moduleManagerApi
    // const moduleManager = window.moduleManagerApi; // REMOVED

    if (
      !moduleManager ||
      typeof moduleManager.getAllModuleStates !== 'function' ||
      typeof moduleManager.getCurrentLoadPriority !== 'function'
    ) {
      log('error', 
        'ModulesPanel: ModuleManager not available or missing expected functions.'
      );
      // Display error in the list container
      if (this.moduleListContainer)
        this.moduleListContainer.textContent =
          'Error: Module management API not available.';
      return;
    }
    try {
      // Fetch data using await for clarity
      const rawModuleStates = await moduleManager.getAllModuleStates();
      this.moduleStates = rawModuleStates;

      this.loadPriority = await moduleManager.getCurrentLoadPriority();

      this._renderModules();
    } catch (error) {
      log('error', 'ModulesPanel: Failed to fetch module data:', error);
      if (this.moduleListContainer)
        this.moduleListContainer.textContent = 'Error loading module data.';
    }
  }

  _renderModules() {
    // log('info', 'ModulesPanel: _renderModules invoked.');

    // Target the specific container for the list
    if (!this.moduleListContainer) {
      // log('error', 
      //   'ModulesPanel: _renderModules - this.moduleListContainer is null or undefined!'
      // );
      return;
    }
    this.moduleListContainer.innerHTML = ''; // Clear previous list content

    if (!this.loadPriority || this.loadPriority.length === 0) {
      // log('warn', 
      //   'ModulesPanel: _renderModules - this.loadPriority is empty or invalid AT THE START of _renderModules.'
      // );
      this.moduleListContainer.textContent =
        'No modules found or priority order missing. Check console for errors.';
      return;
    }

    // Render modules in the current load priority order
    this.loadPriority.forEach((moduleId, index) => {
      // log('info', 
      //   `ModulesPanel: _renderModules - Processing moduleId: ${moduleId}, index: ${index}`
      // );
      const state = this.moduleStates[moduleId];
      if (!state || !state.definition) {
        // log('warn', 
        //   `ModulesPanel: _renderModules - Skipped module ${moduleId} due to missing state or definition. State:`,
        //   state,
        //   'Keys in state:', Object.keys(state || {})
        // );
        return;
      }
      const module = state.definition;
      const isEnabled = state.enabled;
      const isCoreModule =
        moduleId === 'stateManager' || moduleId === 'modules'; // Core modules cannot be disabled/moved initially
      const isExternal = state.isExternal || false; // Check if it's an external module
      const entryDiv = document.createElement('div');
      entryDiv.className = 'module-entry';
      entryDiv.dataset.moduleId = moduleId;
      const infoDiv = document.createElement('div');
      infoDiv.className = 'module-info';
      const nameDiv = document.createElement('div');
      nameDiv.className = 'module-name';
      nameDiv.textContent = state.definition.title || moduleId;
      const descDiv = document.createElement('div');
      descDiv.className = 'module-description';
      descDiv.textContent =
        state.definition.description || 'No description provided';
      if (isExternal) {
        const externalTag = document.createElement('span');
        externalTag.textContent = ' (External)';
        externalTag.style.fontStyle = 'italic';
        externalTag.style.marginLeft = '5px';
        nameDiv.appendChild(externalTag);
        // Potentially add path info to description or tooltip
        descDiv.textContent += ` [${state.path || 'path unknown'}]`;
      }
      infoDiv.appendChild(nameDiv);
      infoDiv.appendChild(descDiv);
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'module-controls';
      const enableLabel = document.createElement('label');
      const enableCheckbox = document.createElement('input');
      enableCheckbox.type = 'checkbox';
      enableCheckbox.checked = isEnabled;
      enableCheckbox.disabled = isCoreModule;
      enableCheckbox.addEventListener('change', (event) => {
        // Prevent user interaction for now until full enable/disable cycle is implemented for external
        if (isExternal) {
          event.target.checked = !event.target.checked; // Revert UI
          alert(
            'Enabling/disabling external modules is not fully implemented yet.'
          );
          return;
        }
        this._handleEnableToggle(moduleId, event.target.checked);
      });
      enableLabel.appendChild(enableCheckbox);
      enableLabel.appendChild(document.createTextNode('Enabled'));
      controlsDiv.appendChild(enableLabel);
      const upButton = document.createElement('button');
      upButton.textContent = '▲';
      upButton.title = 'Increase Priority (Move Up)';
      upButton.disabled = isCoreModule || index === 0;
      const downButton = document.createElement('button');
      downButton.textContent = '▼';
      downButton.title = 'Decrease Priority (Move Down)';
      downButton.disabled =
        isCoreModule || index === this.loadPriority.length - 1 || isExternal; // Disable for external initially
      controlsDiv.appendChild(upButton);
      controlsDiv.appendChild(downButton);
      entryDiv.appendChild(infoDiv);
      entryDiv.appendChild(controlsDiv);

      // if (entryDiv instanceof HTMLElement) {
      //   log('info', 
      //     `ModulesPanel: _renderModules - Appending valid entryDiv for ${moduleId} to moduleListContainer.`
      //   );
      // } else {
      //   log('error', 
      //     `ModulesPanel: _renderModules - entryDiv for ${moduleId} is NOT a valid HTMLElement before append!`,
      //     entryDiv
      //   );
      // }
      // Append the entry to the list container
      this.moduleListContainer.appendChild(entryDiv);
    });
  }

  async _handleEnableToggle(moduleId, shouldBeEnabled) {
    log('info', 
      `Toggling module ${moduleId} to ${
        shouldBeEnabled ? 'enabled' : 'disabled'
      }`
    );
    // Use the globally exposed moduleManagerApi
    const moduleManager = window.moduleManagerApi;

    if (
      !moduleManager ||
      typeof moduleManager.enableModule !== 'function' ||
      typeof moduleManager.disableModule !== 'function'
    ) {
      log('error', 'Cannot toggle module: ModuleManager not available.');
      this._updateCheckboxVisualState(moduleId, !shouldBeEnabled); // Revert visual state
      return;
    }

    try {
      if (shouldBeEnabled) {
        await moduleManager.enableModule(moduleId);
      } else {
        await moduleManager.disableModule(moduleId);
      }
      // Update local state and potentially re-render or update just the checkbox
      if (this.moduleStates[moduleId]) {
        // Ensure state exists
        this.moduleStates[moduleId].enabled = shouldBeEnabled;
      } else {
        log('warn', 
          `State for module ${moduleId} not found locally after toggle.`
        );
        // Request full update if state is missing?
        this._requestModuleData();
        return; // Avoid further processing as state is inconsistent
      }
      log('info', `Module ${moduleId} state updated successfully.`);
      // Optional: Could trigger a full re-render if needed: this._renderModules();
    } catch (error) {
      log('error', 
        `Failed to ${
          shouldBeEnabled ? 'enable' : 'disable'
        } module ${moduleId}:`,
        error
      );
      // Revert the checkbox state on failure
      this._updateCheckboxVisualState(moduleId, !shouldBeEnabled);
      // Show error message to user?
    }
  }

  // _handlePriorityChange(moduleId, direction) {
  //     log('info', `Changing priority for ${moduleId}: ${direction}`);
  //     // TODO: Implement priority change logic using moduleManager
  //     // This will likely involve calling something like moduleManager.changeModulePriority(moduleId, direction)
  //     // and then calling this._requestModuleData() to refresh the UI.
  // }

  _updateCheckboxVisualState(moduleId, isChecked) {
    const checkbox = this.rootElement.querySelector(
      `.module-entry[data-module-id="${moduleId}"] input[type="checkbox"]`
    );
    if (checkbox) {
      checkbox.checked = isChecked;
      // Potentially update associated UI elements if needed
    }
  }

  // Example handler for external state changes
  _handleModuleStateChange({ moduleId, enabled }) {
    log('info', 
      `ModulesPanel received external state change for ${moduleId}: ${enabled}`
    );
    // Update local state if the module exists
    if (this.moduleStates[moduleId]) {
      this.moduleStates[moduleId].enabled = enabled;
    }
    // Update the visual state of the checkbox regardless
    // (Handles cases where state might have been out of sync)
    this._updateCheckboxVisualState(moduleId, enabled);
  }

  // Example handler for panel closing events
  _handlePanelClosed(closedModuleId) {
    // If closing a panel means the module is disabled, update the checkbox.
    // This depends on how panel closing and module disabling are linked.
    log('info', 
      `ModulesPanel received panel closed event for ${closedModuleId}`
    );
    // Assuming closing a panel *implies* disable (this might not be true)
    // Check if the module is actually disabled now before updating UI
    // const moduleManager = this.api.getModuleManager();
    // const state = await moduleManager.getModuleState(closedModuleId);
    // if (state && !state.enabled) {
    //    this._updateCheckboxVisualState(closedModuleId, false);
    // }
  }

  // Handler for when a module is successfully loaded (built-in or external)
  _handleModuleLoaded({ moduleId }) {
    log('info', `ModulesPanel notified that module ${moduleId} has loaded.`);
    // Refresh the entire list to ensure order and state are correct
    // This is simpler than trying to patch the DOM for now
    this._requestModuleData();
  }

  // Handler for when a module fails to load
  _handleModuleLoadFailed({ moduleId, path, error }) {
    log('error', 
      `ModulesPanel notified that module ${moduleId} (${path}) failed to load:`,
      error
    );
    // Optionally display a persistent error message in the panel
    const errorDiv = document.createElement('div');
    errorDiv.textContent = `Error loading module '${moduleId}' from ${path}. Check console.`;
    errorDiv.style.color = 'red';
    errorDiv.style.marginTop = '10px';
    this.moduleListContainer.appendChild(errorDiv);
    // Maybe remove this message after a timeout or on next refresh
  }

  // Renamed from _addTestButton
  _addControls() {
    if (!this.buttonContainer) return;
    this.buttonContainer.innerHTML = ''; // Clear existing buttons

    const addButton = document.createElement('button');
    addButton.textContent = 'Add External Module...';
    addButton.title = 'Load a module from a local path or URL';
    addButton.addEventListener(
      'click',
      this._handleAddExternalModule.bind(this)
    );
    this.buttonContainer.appendChild(addButton);

    // Add other controls here if needed in the future
    // e.g., a "Refresh List" button
    // const refreshButton = document.createElement('button');
    // refreshButton.textContent = 'Refresh List';
    // refreshButton.addEventListener('click', () => this._requestModuleData());
    // this.buttonContainer.appendChild(refreshButton);
  }

  _handleAddExternalModule() {
    const modulePath = prompt("Enter path or URL to the module's index.js:");
    if (!modulePath || modulePath.trim() === '') {
      log('info', 'External module load cancelled.');
      return;
    }

    // Basic sanitization and unique ID generation
    const sanitizedPath = modulePath.replace(/[^a-zA-Z0-9]/g, '_');
    this.externalModuleCounter++;
    const moduleId = `external_${sanitizedPath}_${this.externalModuleCounter}`;

    log('info', 
      `Requesting load for external module: ${moduleId} from ${modulePath}`
    );
    eventBus.publish('module:loadExternalRequest', { moduleId, modulePath });
  }

  // MODIFIED: Renamed from _handleInitComplete to _handleAppReady
  _handleAppReady(eventData) {
    // log('info', 'ModulesPanel: _handleAppReady invoked.');
    // log('info', 
    //   'ModulesPanel: Received app:readyForUiDataLoad. Requesting module data.'
    // );

    // NEW way: Get moduleManager from event payload
    if (eventData && typeof eventData.getModuleManager === 'function') {
      const moduleManager = eventData.getModuleManager();
      if (moduleManager) {
        this._requestModuleData(moduleManager);
      } else {
        log('error', 
          'ModulesPanel: getModuleManager() returned null/undefined.'
        );
        if (this.moduleListContainer)
          this.moduleListContainer.textContent =
            'Error: Module management API getter returned null.';
      }
    } else {
      log('error', 
        'ModulesPanel: ModuleManager API not available from app:readyForUiDataLoad event payload.'
      );
      if (this.moduleListContainer)
        this.moduleListContainer.textContent =
          'Error: Module management API not available from event.';
    }
  }

  // Called by GoldenLayout when the panel is destroyed
  destroy() {
    log('info', 'Destroying ModulesPanel');
    // Remove event listeners using the stored bound handlers
    eventBus.unsubscribe('module:stateChanged', this.moduleStateHandler);
    eventBus.unsubscribe('module:loaded', this.moduleLoadHandler);
    eventBus.unsubscribe('module:loadFailed', this.moduleFailHandler);
    // Unsubscribe from app:ready if listener exists
    // Use the named handler for unsubscribe
    if (this.appReadyListener) {
      eventBus.unsubscribe('app:readyForUiDataLoad', this.appReadyHandler);
      this.appReadyListener = null;
    }

    // Clean up DOM
    if (this.rootElement && this.rootElement.parentNode) {
      this.rootElement.parentNode.removeChild(this.rootElement);
    }
    this.rootElement = null;
    this.container = null; // Release reference to GoldenLayout container
    this.moduleStates = {};
    this.loadPriority = [];
    this.buttonContainer = null;
    this.moduleListContainer = null;
  }

  // Add test button (if needed for other purposes) or remove if replaced by _addControls
  /* // Original _addTestButton - keep for reference or remove if fully replaced
  _addTestButton() {
    if (!this.buttonContainer) return; // Check if container exists
    const testButton = document.createElement('button');
    testButton.textContent = 'Test Button';
    testButton.onclick = () => {
      log('info', 'Modules Panel Test Button Clicked');
      // Example: Try to get module manager again or trigger refresh
      this._requestModuleData();
    };
    // Ensure button container exists before appending
    this.buttonContainer.appendChild(testButton);
  }
  */
}

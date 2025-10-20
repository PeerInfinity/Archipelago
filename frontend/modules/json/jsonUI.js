import eventBus from '../../app/core/eventBus.js';
// Corrected import for settingsManager (default import)
import settingsManager from '../../app/core/settingsManager.js';
// import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js'; // If needed later
import { centralRegistry } from '../../app/core/centralRegistry.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jsonUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[jsonUI] ${message}`, ...data);
  }
}

export class JsonUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.currentModeDisplay = null;
    this.modeNameInput = null;
    this.checkboxes = {}; // Will now hold core AND module checkboxes
    this.knownModesList = null;
    this.modesJsonList = null; // For modes from modes.json
    this.moduleDataList = null; // For module-specific data checkboxes

    this._createBaseUI();
    this._populateKnownModesList(); // Initial population

    // Listen for GoldenLayout destroy event
    this.container.on('destroy', () => {
      this._destroy();
    });

    // Listen for the actual active mode determined by init.js
    eventBus.subscribe('app:activeModeDetermined', (data) => {
      if (data && data.activeMode) {
        log('info', 
          `[JsonUI] Received app:activeModeDetermined, updating display to: ${data.activeMode}`
        );
        this.updateCurrentModeDisplay(data.activeMode);
      } else {
        log('warn', 
          '[JsonUI] Received app:activeModeDetermined but no activeMode in payload.',
          data
        );
      }
    }, 'json');

    // Listen for modes.json being loaded
    eventBus.subscribe('app:modesJsonLoaded', (data) => {
      if (data && data.modesConfig) {
        log('info', 
          '[JsonUI] Received app:modesJsonLoaded event, populating modes.json list.'
        );
        this._populateModesJsonList(data.modesConfig);
      } else {
        log('warn', 
          '[JsonUI] Received app:modesJsonLoaded event but no modesConfig in payload.',
          data
        );
      }
    }, 'json');

    // Check if modes.json was already loaded and the event missed
    if (window.G_modesConfig) {
      log('info', 
        '[JsonUI] G_modesConfig already exists on window. Populating modes.json list directly.'
      );
      this._populateModesJsonList(window.G_modesConfig);
    }

    // Populate module data checkboxes once we know the app is mostly ready
    this._populateModuleDataCheckboxes();

    // TODO: Populate current mode, known modes, and checkbox states
    // this.updateCurrentModeDisplay('default'); // Initial placeholder - REMOVED, will be set by event
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(container, componentState) {
    // container is the GoldenLayout ComponentContainer
    // componentState is the state passed by GoldenLayout
    log('info', 
      '[JsonUI onMount] Called. Container:',
      container,
      'State:',
      componentState
    );
    // this.container = container; // Re-assign if necessary, though constructor already has it.
    // If initial rendering or setup needs to happen *after* DOM attachment, do it here.
  }

  _createBaseUI() {
    const html = `
      <div class="json-panel-container panel-container" style="overflow-y: auto; height: 100%;">
        <div class="json-header">
          <h2>JSON Data Management</h2>
        </div>

        <div class="json-section">
          <h3>Current Mode: <span id="json-current-mode">default</span></h3>
          <label for="json-mode-name">Mode Name for Save/Load:</label>
          <input type="text" id="json-mode-name" value="default" />
        </div>

        <div class="json-section">
          <div class="checkbox-controls" style="margin-top: 15px; margin-bottom: 10px;">
            <button id="json-btn-check-all" class="button button-small">Check All</button>
            <button id="json-btn-uncheck-all" class="button button-small">Uncheck All</button>
          </div>
          <h4>Include in Operations:</h4>
          <div class="checkbox-container">
            <button class="button button-small text-export-btn" data-config-key="rulesConfig">Text</button>
            <input type="checkbox" id="json-chk-rules" data-config-key="rulesConfig" checked />
            <label for="json-chk-rules">Rules Config (rules.json)</label>
          </div>
          <div class="checkbox-container">
            <button class="button button-small text-export-btn" data-config-key="moduleConfig">Text</button>
            <input type="checkbox" id="json-chk-modules" data-config-key="moduleConfig" checked />
            <label for="json-chk-modules">Module Config (modules.json)</label>
          </div>
          <div class="checkbox-container">
            <button class="button button-small text-export-btn" data-config-key="layoutConfig">Text</button>
            <input type="checkbox" id="json-chk-layout" data-config-key="layoutConfig" checked />
            <label for="json-chk-layout">Layout Config (layout_presets.json / Current)</label>
          </div>
          <div class="checkbox-container">
            <button class="button button-small text-export-btn" data-config-key="userSettings">Text</button>
            <input type="checkbox" id="json-chk-settings" data-config-key="userSettings" checked />
            <label for="json-chk-settings">User Settings (settings.json)</label>
          </div>
          <!-- Placeholder for module-specific data checkboxes -->
        </div>

        <div class="json-section">
          <h4>Registered Module Data:</h4>
          <ul id="json-module-data-list">
            <!-- Checkboxes will be populated here by JS -->
            <li><span>No modules registered custom data handlers.</span></li>
          </ul>
        </div>

        <div class="json-section button-group">
          <div style="margin-top: 15px;">
            <button id="json-btn-export-text" class="button">Export to Text</button>
            <button id="json-btn-import-text" class="button">Import from Text</button>
          </div>
          <div style="margin-top: 15px;">
            <button id="json-btn-save-file" class="button">Save Combined to File</button>
            <label class="file-input-button-label">
              Load Combined from File
              <input type="file" id="json-btn-load-file" accept=".json" style="display: none;" />
            </label>
          </div>
          <div style="margin-top: 15px;">
            <button id="json-btn-export-live-layout" class="button">Export Live Layout</button>
          </div>
          <div style="margin-top: 15px;">
            <button id="json-btn-save-localstorage" class="button">Save to LocalStorage</button>
          </div>
          <div style="margin-top: 15px;">
            <button id="json-btn-reset-defaults" class="button button-danger">Reset Default Mode</button>
          </div>
        </div>

        <div class="json-section">
          <h4>Known Modes in LocalStorage:</h4>
          <ul id="json-known-modes-list">
            <!-- Modes will be populated here by JS -->
            <li><span>No modes found in LocalStorage.</span></li>
          </ul>
        </div>

        <div class="json-section">
          <h4>Known Modes in modes.json:</h4>
          <ul id="json-modes-json-list">
            <!-- Modes from modes.json will be populated here -->
            <li><span>Loading modes from modes.json...</span></li>
          </ul>
        </div>
      </div>
    `;

    // Create a temporary wrapper to parse the HTML and get the main panel element
    const tempWrapper = document.createElement('div');
    tempWrapper.innerHTML = html.trim();
    this.rootElement = tempWrapper.firstChild; // Assign the actual panel element to this.rootElement

    // Now that this.rootElement is assigned, append it to the container
    // this.container.element.appendChild(this.rootElement); // REMOVED: Factory in init.js will handle this

    // And then get references to inner elements using this.rootElement
    this.currentModeDisplay =
      this.rootElement.querySelector('#json-current-mode');
    this.modeNameInput = this.rootElement.querySelector('#json-mode-name');
    this.knownModesList = this.rootElement.querySelector(
      '#json-known-modes-list'
    );
    this.modesJsonList = this.rootElement.querySelector(
      '#json-modes-json-list'
    ); // Get new list
    this.moduleDataList = this.rootElement.querySelector(
      '#json-module-data-list'
    ); // Get new list

    this.checkboxes.rulesConfig =
      this.rootElement.querySelector('#json-chk-rules');
    this.checkboxes.moduleConfig =
      this.rootElement.querySelector('#json-chk-modules');
    this.checkboxes.layoutConfig =
      this.rootElement.querySelector('#json-chk-layout');
    this.checkboxes.userSettings =
      this.rootElement.querySelector('#json-chk-settings');

    this._attachEventListeners(this.rootElement);
  }

  _attachEventListeners(contextElement) {
    const exportTextButton = contextElement.querySelector('#json-btn-export-text');
    const importTextButton = contextElement.querySelector('#json-btn-import-text');
    const exportLiveLayoutButton = contextElement.querySelector('#json-btn-export-live-layout');
    const saveFileButton = contextElement.querySelector('#json-btn-save-file');
    const loadFileLabel = contextElement.querySelector(
      '.file-input-button-label'
    );
    const loadFileInput = contextElement.querySelector('#json-btn-load-file');
    const saveLocalStorageButton = contextElement.querySelector(
      '#json-btn-save-localstorage'
    );
    const resetDefaultsButton = contextElement.querySelector(
      '#json-btn-reset-defaults'
    );
    const checkAllButton = contextElement.querySelector('#json-btn-check-all');
    const uncheckAllButton = contextElement.querySelector('#json-btn-uncheck-all');

    if (exportTextButton) {
      exportTextButton.addEventListener('click', () => this._handleExportToText());
    }
    if (importTextButton) {
      importTextButton.addEventListener('click', () => this._handleImportFromText());
    }
    if (exportLiveLayoutButton) {
      exportLiveLayoutButton.addEventListener('click', () => this._handleExportLiveLayout());
    }
    if (saveFileButton) {
      saveFileButton.addEventListener('click', () => this._handleSaveToFile());
    }
    if (loadFileInput) {
      loadFileInput.addEventListener('change', (event) =>
        this._handleLoadFromFile(event)
      );
    }
    if (saveLocalStorageButton) {
      saveLocalStorageButton.addEventListener('click', () =>
        this._handleSaveToLocalStorage()
      );
    }
    if (resetDefaultsButton) {
      resetDefaultsButton.addEventListener('click', () =>
        this._handleResetDefaults()
      );
    }
    if (checkAllButton) {
      checkAllButton.addEventListener('click', () => this._handleCheckAll());
    }
    if (uncheckAllButton) {
      uncheckAllButton.addEventListener('click', () => this._handleUncheckAll());
    }

    // Add event listeners for individual Text export buttons
    const textExportButtons = contextElement.querySelectorAll('.text-export-btn');
    textExportButtons.forEach(button => {
      button.addEventListener('click', (event) => {
        const configKey = event.target.dataset.configKey;
        if (configKey) {
          this._handleExportSectionToText(configKey);
        }
      });
    });

    // TODO: Add event listeners for delete mode buttons when they are generated
  }

  updateCurrentModeDisplay(modeName) {
    if (this.currentModeDisplay) {
      this.currentModeDisplay.textContent = modeName || 'N/A';
    }
    if (this.modeNameInput) {
      this.modeNameInput.value = modeName || '';
    }
  }

  getSelectedDataKeys() {
    const selectedKeys = [];
    for (const key in this.checkboxes) {
      if (this.checkboxes[key] && this.checkboxes[key].checked) {
        selectedKeys.push(this.checkboxes[key].dataset.configKey);
      }
    }
    return selectedKeys;
  }

  _downloadJSON(data, filename) {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      log('info', `[JsonUI] Successfully triggered download for ${filename}`);
    } catch (error) {
      log('error', '[JsonUI] Error preparing JSON for download:', error);
      alert('Error preparing data for download. See console for details.');
    }
  }

  async _gatherSelectedData() {
    const selectedDataKeys = this.getSelectedDataKeys();
    const dataToSave = {};
    const promises = [];
    const keysForPromises = [];

    log('info', '[JsonUI] Gathering data for keys:', selectedDataKeys);

    // Handle Core Data Types (Direct Access)
    if (selectedDataKeys.includes('rulesConfig')) {
      dataToSave.rulesConfig = window.G_combinedModeData?.rulesConfig;
      log('info', 
        '[JsonUI] Included rulesConfig:',
        dataToSave.rulesConfig ? 'Exists' : 'MISSING'
      );
    }
    if (selectedDataKeys.includes('moduleConfig')) {
      dataToSave.moduleConfig = window.G_combinedModeData?.moduleConfig;
      log('info', 
        '[JsonUI] Included moduleConfig:',
        dataToSave.moduleConfig ? 'Exists' : 'MISSING'
      );
    }
    if (selectedDataKeys.includes('layoutConfig')) {
      log('info', '[JsonUI] Starting layout export process');
      
      // Save the current live layout state using Golden Layout 2.x API
      let rawLayoutConfig = null;
      if (
        window.goldenLayoutInstance &&
        typeof window.goldenLayoutInstance.saveLayout === 'function'
      ) {
        rawLayoutConfig = window.goldenLayoutInstance.saveLayout();
        log('info', 
          '[JsonUI] Retrieved current layoutConfig from window.goldenLayoutInstance.saveLayout():',
          rawLayoutConfig ? 'SUCCESS' : 'FAILED'
        );
      } else if (
        this.container &&
        this.container.layoutManager &&
        typeof this.container.layoutManager.saveLayout === 'function'
      ) {
        // Fallback to container.layoutManager if global is not found
        rawLayoutConfig = this.container.layoutManager.saveLayout();
        log('info', 
          '[JsonUI] Used this.container.layoutManager.saveLayout() as fallback for layoutConfig:',
          rawLayoutConfig ? 'SUCCESS' : 'FAILED'
        );
      } else {
        // Fallback to loaded preset if live one isn't available
        rawLayoutConfig = window.G_combinedModeData?.layoutConfig;
        log('info', 
          '[JsonUI] Could not get live layout, falling back to preset layoutConfig from G_combinedModeData:',
          rawLayoutConfig ? 'SUCCESS' : 'FAILED'
        );
      }
      
      log('info', '[JsonUI] rawLayoutConfig type:', typeof rawLayoutConfig);
      log('info', '[JsonUI] rawLayoutConfig exists:', !!rawLayoutConfig);
      
      // Clean the layout config for compatibility with Golden Layout 2.x on reload
      if (rawLayoutConfig) {
        log('info', '[JsonUI] About to transform layout config...');
        try {
          dataToSave.layoutConfig = this._transformLayoutConfigSizes(rawLayoutConfig);
          log('info', '[JsonUI] Successfully processed layoutConfig for export. Keys in result:', Object.keys(dataToSave.layoutConfig || {}));
          log('info', '[JsonUI] Final dataToSave.layoutConfig type:', typeof dataToSave.layoutConfig);
        } catch (transformError) {
          log('error', '[JsonUI] ERROR: _transformLayoutConfigSizes threw an error:', transformError);
          log('error', '[JsonUI] Stack trace:', transformError.stack);
          dataToSave.layoutConfig = rawLayoutConfig; // Use raw data as fallback
          log('warn', '[JsonUI] Used raw layoutConfig as fallback due to transform error');
        }
      } else {
        dataToSave.layoutConfig = rawLayoutConfig;
        log('warn', '[JsonUI] No layoutConfig available - all fallbacks failed');
        log('warn', '[JsonUI] Setting layoutConfig to null/undefined in dataToSave');
      }
    }
    if (selectedDataKeys.includes('userSettings')) {
      try {
        // settingsManager.getSettings() is async, so we need to await it
        dataToSave.userSettings = await settingsManager.getSettings();
        log('info', 
          '[JsonUI] Included userSettings:',
          dataToSave.userSettings ? 'Exists' : 'MISSING'
        );
      } catch (e) {
        log('error', '[JsonUI] Failed to get userSettings:', e);
        dataToSave.userSettings = null; // Indicate failure
      }
    }
    // TODO: Add logic for other module-specific data if checkboxes are added for them

    // Handle Registered Module Data Types (Using registered functions)
    const handlers = centralRegistry.getAllJsonDataHandlers();
    for (const dataKey of selectedDataKeys) {
      if (handlers.has(dataKey)) {
        const handler = handlers.get(dataKey);
        log('info', `[JsonUI] Gathering data for registered key: ${dataKey}`);
        try {
          const saveDataResult = handler.getSaveDataFunction();
          // Check if the result is a Promise
          if (saveDataResult instanceof Promise) {
            promises.push(saveDataResult);
            keysForPromises.push(dataKey);
          } else {
            // If not a promise, assign directly
            dataToSave[dataKey] = saveDataResult;
            log('info', 
              `[JsonUI] Included sync data for ${dataKey}:`,
              dataToSave[dataKey] ? 'Exists' : 'MISSING/NULL'
            );
          }
        } catch (e) {
          log('error', 
            `[JsonUI] Error calling getSaveDataFunction for ${dataKey}:`,
            e
          );
          dataToSave[dataKey] = null; // Indicate failure
        }
      }
    }

    // Wait for all promises to resolve
    if (promises.length > 0) {
      try {
        const results = await Promise.all(promises);
        results.forEach((result, index) => {
          const dataKey = keysForPromises[index];
          dataToSave[dataKey] = result;
          log('info', 
            `[JsonUI] Included async data for ${dataKey}:`,
            dataToSave[dataKey] ? 'Exists' : 'MISSING/NULL'
          );
        });
      } catch (error) {
        log('error', 
          '[JsonUI] Error resolving promises from getSaveDataFunction calls:',
          error
        );
        // Assign null to keys whose promises failed or were part of the failing Promise.all
        keysForPromises.forEach((key) => {
          if (!(key in dataToSave)) {
            // Only mark as null if not already set by sync path or successful promise
            dataToSave[key] = null;
            log('error', 
              `[JsonUI] Failed to get data for ${key} due to Promise.all failure.`
            );
          }
        });
      }
    }

    // Preserve dataSources metadata if available
    // This helps maintain the original file path information even when saving to localStorage
    if (window.G_combinedModeData?.dataSources) {
      // Only include dataSources entries for the data keys we're actually saving
      const relevantDataSources = {};
      for (const key of Object.keys(dataToSave)) {
        if (window.G_combinedModeData.dataSources[key]) {
          relevantDataSources[key] = window.G_combinedModeData.dataSources[key];
        }
      }
      if (Object.keys(relevantDataSources).length > 0) {
        dataToSave.dataSources = relevantDataSources;
        log('info', '[JsonUI] Preserved dataSources metadata for keys:', Object.keys(relevantDataSources));
      }
    }

    log('info', '[JsonUI] Finished gathering data. Keys:', Object.keys(dataToSave));
    log('info', '[JsonUI] layoutConfig exists in result:', !!dataToSave.layoutConfig);
    if (dataToSave.layoutConfig) {
      log('info', '[JsonUI] layoutConfig is type:', typeof dataToSave.layoutConfig);
      log('info', '[JsonUI] layoutConfig has keys:', Object.keys(dataToSave.layoutConfig));
    }
    return dataToSave;
  }

  async _gatherSectionData(configKey) {
    log('info', `[JsonUI] Gathering data for single section: ${configKey}`);

    // Handle Core Data Types (Direct Access)
    if (configKey === 'rulesConfig') {
      return window.G_combinedModeData?.rulesConfig;
    }
    if (configKey === 'moduleConfig') {
      return window.G_combinedModeData?.moduleConfig;
    }
    if (configKey === 'layoutConfig') {
      // Get the current live layout state using Golden Layout 2.x API
      let rawLayoutConfig = null;
      if (
        window.goldenLayoutInstance &&
        typeof window.goldenLayoutInstance.saveLayout === 'function'
      ) {
        rawLayoutConfig = window.goldenLayoutInstance.saveLayout();
      } else if (
        this.container &&
        this.container.layoutManager &&
        typeof this.container.layoutManager.saveLayout === 'function'
      ) {
        rawLayoutConfig = this.container.layoutManager.saveLayout();
      } else {
        // Fallback to loaded preset if live one isn't available
        rawLayoutConfig = window.G_combinedModeData?.layoutConfig;
      }
      
      // Clean the layout config for compatibility with Golden Layout 2.x on reload
      if (rawLayoutConfig) {
        return this._transformLayoutConfigSizes(rawLayoutConfig);
      } else {
        return rawLayoutConfig;
      }
    }
    if (configKey === 'userSettings') {
      try {
        return await settingsManager.getSettings();
      } catch (e) {
        log('error', `[JsonUI] Failed to get userSettings:`, e);
        return null;
      }
    }

    // Handle Registered Module Data Types (Using registered functions)
    const handlers = centralRegistry.getAllJsonDataHandlers();
    if (handlers.has(configKey)) {
      const handler = handlers.get(configKey);
      log('info', `[JsonUI] Gathering data for registered section: ${configKey}`);
      try {
        const saveDataResult = handler.getSaveDataFunction();
        // Check if the result is a Promise
        if (saveDataResult instanceof Promise) {
          return await saveDataResult;
        } else {
          return saveDataResult;
        }
      } catch (e) {
        log('error', 
          `[JsonUI] Error calling getSaveDataFunction for ${configKey}:`,
          e
        );
        return null;
      }
    }

    log('warn', `[JsonUI] Unknown config key: ${configKey}`);
    return null;
  }

  async _handleSaveToFile() {
    const modeName = this.modeNameInput.value.trim() || 'default';
    // Use await here
    const dataToSave = await this._gatherSelectedData();

    if (Object.keys(dataToSave).length === 0) {
      alert('No data types selected to save.');
      return;
    }

    const combinedData = {
      modeName: modeName, // Store the mode name within the file
      savedTimestamp: new Date().toISOString(),
      ...dataToSave,
    };

    log('info', 
      `[JsonUI] Save to file. Mode: ${modeName}, Data:`,
      combinedData
    );
    this._downloadJSON(combinedData, `${modeName}_config.json`);
  }

  async _handleExportToText() {
    const modeName = this.modeNameInput.value.trim() || 'default';
    // Use the same data gathering logic as save to file
    const dataToExport = await this._gatherSelectedData();

    if (Object.keys(dataToExport).length === 0) {
      alert('No data types selected to export.');
      return;
    }

    const combinedData = {
      modeName: modeName, // Store the mode name within the data
      savedTimestamp: new Date().toISOString(),
      ...dataToExport,
    };

    log('info', 
      `[JsonUI] Export to text. Mode: ${modeName}, Combined data keys:`,
      Object.keys(combinedData)
    );
    log('info', '[JsonUI] combinedData contains layoutConfig:', !!combinedData.layoutConfig);

    // Send the data to the Editor panel via eventBus
    log('info', '[JsonUI] About to publish json:exportToEditor event...');
    eventBus.publish('json:exportToEditor', {
      data: combinedData,
      modeName: modeName,
      activatePanel: true
    }, 'json');
    log('info', '[JsonUI] json:exportToEditor event published successfully');
  }

  async _handleExportSectionToText(configKey) {
    log('info', `[JsonUI] Exporting single section to text: ${configKey}`);

    try {
      // Gather data for just this specific section
      const sectionData = await this._gatherSectionData(configKey);
      
      if (sectionData === null || sectionData === undefined) {
        alert(`No data available for section: ${configKey}`);
        return;
      }

      // Export the section data directly (without the outer wrapper key)
      const exportData = sectionData;

      log('info', 
        `[JsonUI] Export section ${configKey} to text. Data:`,
        exportData
      );

      // Send the section data to the Editor panel via eventBus
      eventBus.publish('json:exportToEditor', {
        data: exportData,
        modeName: `${configKey} Section`,
        activatePanel: true
      }, 'json');

    } catch (error) {
      log('error', `[JsonUI] Error exporting section ${configKey}:`, error);
      alert(`Error exporting section ${configKey}. See console for details.`);
    }
  }

  async _handleExportLiveLayout() {
    log('info', '[JsonUI] Export Live Layout button clicked');

    try {
      // Get access to the Golden Layout instance
      const goldenLayoutInstance = window.goldenLayoutInstance || window.panelManager?.goldenLayout;
      
      if (!goldenLayoutInstance) {
        alert('No Golden Layout instance available. Cannot read live layout data.');
        return;
      }

      // Create an object to hold both the live layout data and analysis
      const liveLayoutData = {
        timestamp: new Date().toISOString(),
        description: "Live Golden Layout instance data - traversed from goldenLayoutInstance.root",
        liveLayoutRoot: this._traverseLiveLayout(goldenLayoutInstance.root),
        savedLayoutConfig: null,
        analysis: {}
      };

      // Also get the saved layout config for comparison
      try {
        const savedConfig = goldenLayoutInstance.saveLayout();
        liveLayoutData.savedLayoutConfig = savedConfig;
      } catch (e) {
        log('warn', '[JsonUI] Could not get saved layout config for comparison:', e);
        liveLayoutData.savedLayoutConfig = { error: 'Could not retrieve saved config' };
      }

      // Add some analysis comparing the two
      liveLayoutData.analysis = {
        liveRootType: liveLayoutData.liveLayoutRoot?.type || 'unknown',
        savedRootType: liveLayoutData.savedLayoutConfig?.root?.type || 'unknown',
        typesMatch: (liveLayoutData.liveLayoutRoot?.type === liveLayoutData.savedLayoutConfig?.root?.type),
        liveHasConfig: !!liveLayoutData.liveLayoutRoot?.config,
        liveConfigKeys: liveLayoutData.liveLayoutRoot?.config ? Object.keys(liveLayoutData.liveLayoutRoot.config) : [],
        message: "This shows the difference between goldenLayoutInstance.root (live) and goldenLayoutInstance.saveLayout() (saved)"
      };

      log('info', '[JsonUI] Live layout data gathered:', liveLayoutData);

      // Send the data to the Editor panel via eventBus
      eventBus.publish('json:exportToEditor', {
        data: liveLayoutData,
        modeName: 'Live Layout Data',
        activatePanel: true
      }, 'json');

    } catch (error) {
      log('error', '[JsonUI] Error exporting live layout:', error);
      alert('Error exporting live layout data. See console for details.');
    }
  }

  /**
   * Recursively traverses the live Golden Layout structure to extract all data
   */
  _traverseLiveLayout(item, depth = 0) {
    if (!item) {
      return null;
    }

    const result = {
      type: item.type,
      depth: depth,
    };

    // Add config if it exists
    if (item.config) {
      result.config = { ...item.config };
      result.configKeys = Object.keys(item.config);
    }

    // Add other interesting properties
    if (item.id !== undefined) result.id = item.id;
    if (item.title !== undefined) result.title = item.title;
    if (item.isInitialised !== undefined) result.isInitialised = item.isInitialised;
    if (item.isMaximised !== undefined) result.isMaximised = item.isMaximised;
    if (item.isHidden !== undefined) result.isHidden = item.isHidden;

    // Add size information if available
    if (item.width !== undefined) result.width = item.width;
    if (item.height !== undefined) result.height = item.height;

    // Add any other potentially useful properties
    const interestingProps = ['componentName', 'componentType', 'reorderEnabled', 'size'];
    interestingProps.forEach(prop => {
      if (item[prop] !== undefined) {
        result[prop] = item[prop];
      }
    });

    // Recursively process children
    if (item.contentItems && Array.isArray(item.contentItems)) {
      result.contentItems = item.contentItems.map(child => 
        this._traverseLiveLayout(child, depth + 1)
      );
      result.childCount = item.contentItems.length;
    }

    return result;
  }

  async _handleImportFromText() {
    log('info', '[JsonUI] Import from Text button clicked');

    // First, activate the Editor panel without overwriting content
    eventBus.publish('ui:activatePanel', { panelId: 'editorPanel' }, 'json');

    // Wait a moment for the panel to activate
    await new Promise(resolve => setTimeout(resolve, 500));

    // Now request the current content from the editor, specifically requesting dataForExport source
    const editorContent = await this._requestEditorContent();
    
    if (!editorContent || !editorContent.text.trim()) {
      alert('No text found in the Editor panel. Please enter or paste JSON data in the Editor first.');
      return;
    }

    // Show confirmation dialog
    const confirmImport = confirm(
      'Do you want to load the data from the Editor text? This will apply the JSON data to the current application state.'
    );

    if (!confirmImport) {
      log('info', '[JsonUI] Import from text cancelled by user');
      return;
    }

    // Parse and load the data using the same logic as _handleLoadFromFile
    try {
      const loadedData = JSON.parse(editorContent.text);
      log('info', '[JsonUI] Editor text content parsed successfully:', loadedData);

      const modeName =
        loadedData.modeName || this.modeNameInput.value.trim() || 'default';

      if (this.modeNameInput && modeName) {
        this.modeNameInput.value = modeName;
        this.updateCurrentModeDisplay(modeName);
      }

      // Construct dataToStore by including only what's in loadedData, plus meta fields
      const dataToStore = {
        modeName: modeName,
        savedTimestamp: new Date().toISOString(),
      };
      // Iterate over loadedData and add its properties to dataToStore, excluding meta fields already set
      for (const key in loadedData) {
        if (
          loadedData.hasOwnProperty(key) &&
          key !== 'modeName' &&
          key !== 'savedTimestamp'
        ) {
          dataToStore[key] = loadedData[key];
        }
      }

      // Apply non-reloadable data
      await this._applyNonReloadData(loadedData);

      // Show success alert
      alert(
        `Data for mode '${modeName}' loaded from Editor text and applied where possible. Reload if prompted or if layout/module changes were included. This data has NOT been saved to LocalStorage yet.`
      );
    } catch (error) {
      log('error', '[JsonUI] Error parsing JSON from Editor text:', error);
      alert(
        'Failed to parse JSON from Editor text. Ensure it contains valid JSON configuration.'
      );
    }
  }

  async _requestEditorContent() {
    // Create a promise to wait for the editor response
    return new Promise((resolve) => {
      // Set up a one-time listener for the editor response
      let timeoutId;
      let responseReceived = false;

      const responseHandler = (eventData) => {
        if (responseReceived) return; // Already handled
        responseReceived = true;

        log('info', '[JsonUI] Received editor content response:', eventData);
        clearTimeout(timeoutId); // Clear the timeout since we got a response
        eventBus.unsubscribe('editor:contentResponse', responseHandler);
        resolve(eventData);
      };

      eventBus.subscribe('editor:contentResponse', responseHandler, 'json');

      // Request content from the editor
      eventBus.publish('editor:requestContent', {
        requestId: 'json-import-request',
        requestedSource: 'dataForExport'
      }, 'json');

      // Set a timeout in case no response comes
      timeoutId = setTimeout(() => {
        if (responseReceived) return; // Response already received, don't log warning
        responseReceived = true;

        eventBus.unsubscribe('editor:contentResponse', responseHandler);
        log('warn', '[JsonUI] Timeout waiting for editor content response');
        resolve({ text: '', source: 'timeout' });
      }, 5000);
    });
  }

  _handleLoadFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
      log('info', '[JsonUI] No file selected for loading.');
      return;
    }
    log('info', `[JsonUI] Load from file selected: ${file.name}`);

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const loadedData = JSON.parse(e.target.result);
        log('info', '[JsonUI] File content parsed successfully:', loadedData);

        const modeName =
          loadedData.modeName || this.modeNameInput.value.trim() || 'default';
        // const rulesConfig = loadedData.rulesConfig; // No longer strictly needed here
        // const moduleConfig = loadedData.moduleConfig; // No longer strictly needed here

        // Removed strict check for rulesConfig and moduleConfig
        // if (!rulesConfig || !moduleConfig) {
        //   alert(
        //     'Loaded file is missing required rulesConfig or moduleConfig. Cannot apply.'
        //   );
        //   log('error', 
        //     '[JsonUI] Loaded file missing rulesConfig or moduleConfig.',
        //     loadedData
        //   );
        //   return;
        // }

        if (this.modeNameInput && modeName) {
          this.modeNameInput.value = modeName;
          this.updateCurrentModeDisplay(modeName); // Also update the <span>
        }

        // Construct dataToStore by including only what's in loadedData, plus meta fields
        const dataToStore = {
          modeName: modeName,
          savedTimestamp: new Date().toISOString(),
        };
        // Iterate over loadedData and add its properties to dataToStore, excluding meta fields already set
        for (const key in loadedData) {
          if (
            loadedData.hasOwnProperty(key) &&
            key !== 'modeName' &&
            key !== 'savedTimestamp'
          ) {
            dataToStore[key] = loadedData[key];
          }
        }

        // const G_LOCAL_STORAGE_MODE_PREFIX = 'archipelagoToolSuite_modeData_'; // Match init.js

        // REMOVED AUTOMATIC SAVING TO LOCALSTORAGE ON FILE LOAD
        // try {
        //   localStorage.setItem(
        //     `${G_LOCAL_STORAGE_MODE_PREFIX}${modeName}`,
        //     JSON.stringify(dataToStore)
        //   );
        //   localStorage.setItem('archipelagoToolSuite_lastActiveMode', modeName);
        //   log('info', 
        //     `[JsonUI] Successfully stored mode '${modeName}' data from file to LocalStorage:`,
        //     dataToStore
        //   );

        // --- Apply non-reloadable data ---
        await this._applyNonReloadData(loadedData); // Apply data directly from loadedData

        // Show alert (might need adjustment based on requiresReload checks)
        alert(
          `Data for mode '${modeName}' loaded from file and applied where possible. Reload if prompted or if layout/module changes were included. This data has NOT been saved to LocalStorage yet.`
        );
        // this._populateKnownModesList(); // Refresh after loading and saving from file - No longer saving, so no need to refresh this way.
        // } catch (storageError) {
        //   log('error', 
        //     '[JsonUI] Error saving loaded data to LocalStorage:',
        //     storageError
        //   );
        //   alert(
        //     'Error saving loaded data to LocalStorage. Storage might be full or disabled. See console for details.'
        //   );
        // }
      } catch (error) {
        log('error', '[JsonUI] Error parsing JSON from file:', error);
        alert(
          'Failed to parse JSON from file. Ensure it is a valid JSON configuration.'
        );
      }
    };
    reader.onerror = (e) => {
      log('error', '[JsonUI] Error reading file:', e);
      alert('Error reading file.');
    };
    reader.readAsText(file);

    // Reset file input to allow loading the same file again
    event.target.value = null;
  }

  async _handleSaveToLocalStorage() {
    const modeName = this.modeNameInput.value.trim();
    if (!modeName) {
      alert('Please enter a mode name to save data to LocalStorage.');
      this.modeNameInput.focus();
      return;
    }

    // Use await here
    const dataToSave = await this._gatherSelectedData();

    if (Object.keys(dataToSave).length === 0) {
      alert('No data types selected to save to LocalStorage.');
      return;
    }

    const combinedData = {
      modeName: modeName, // Ensure modeName is stored IN the object as well
      savedTimestamp: new Date().toISOString(),
      ...dataToSave,
    };

    const G_LOCAL_STORAGE_MODE_PREFIX = 'archipelagoToolSuite_modeData_'; // Match init.js

    try {
      localStorage.setItem(
        `${G_LOCAL_STORAGE_MODE_PREFIX}${modeName}`,
        JSON.stringify(combinedData)
      );
      log('info', 
        `[JsonUI] Saved to LocalStorage for mode: ${modeName}, Data:`,
        combinedData
      );

      // Update the UI to reflect the saved mode name
      this.updateCurrentModeDisplay(modeName);

      // Set this mode as the last active mode for the next page load
      localStorage.setItem('archipelagoToolSuite_lastActiveMode', modeName);

      alert(
        `Configuration for mode '${modeName}' saved to LocalStorage. Please RELOAD the page to apply the changes.`
      );
      this._populateKnownModesList(); // Refresh after saving
    } catch (error) {
      log('error', '[JsonUI] Error saving to LocalStorage:', error);
      alert(
        'Error saving to LocalStorage. The storage might be full or disabled.'
      );
    }
  }

  _handleResetDefaults() {
    const confirmReset = confirm(
      'Are you sure you want to reset the default mode settings? This will clear the last active mode, any saved settings for the "default" mode from LocalStorage, and then reload the application to its base state (removing any mode specified in the current URL).'
    );

    if (confirmReset) {
      try {
        localStorage.removeItem('archipelagoToolSuite_lastActiveMode');
        localStorage.removeItem('archipelagoToolSuite_modeData_default');
        log('info', 
          '[JsonUI] Defaults reset: Cleared last active mode and "default" mode data from LocalStorage.'
        );
        // Reload the page to the base URL, removing any query parameters like ?mode=
        window.location.href =
          window.location.origin + window.location.pathname;
      } catch (error) {
        log('error', 
          '[JsonUI] Error resetting defaults in LocalStorage:',
          error
        );
        alert('Error resetting defaults. See console for details.');
      }
    }
  }

  _handleCheckAll() {
    log('info', '[JsonUI] Check All button clicked');
    
    // Check all core checkboxes
    for (const key in this.checkboxes) {
      if (this.checkboxes[key]) {
        this.checkboxes[key].checked = true;
      }
    }
    
    // Check all module data checkboxes
    const moduleCheckboxes = this.rootElement.querySelectorAll('#json-module-data-list input[type="checkbox"]');
    moduleCheckboxes.forEach(checkbox => {
      checkbox.checked = true;
    });
    
    log('info', '[JsonUI] All checkboxes checked');
  }

  _handleUncheckAll() {
    log('info', '[JsonUI] Uncheck All button clicked');
    
    // Uncheck all core checkboxes
    for (const key in this.checkboxes) {
      if (this.checkboxes[key]) {
        this.checkboxes[key].checked = false;
      }
    }
    
    // Uncheck all module data checkboxes
    const moduleCheckboxes = this.rootElement.querySelectorAll('#json-module-data-list input[type="checkbox"]');
    moduleCheckboxes.forEach(checkbox => {
      checkbox.checked = false;
    });
    
    log('info', '[JsonUI] All checkboxes unchecked');
  }

  _destroy() {
    log('info', '[JsonUI] Destroying JSON panel UI and listeners.');
    // Remove event listeners if any were attached directly to document or eventBus without specific handles
    // For listeners attached to elements within this.rootElement, they will be garbage collected with the element.
  }

  _populateKnownModesList() {
    if (!this.knownModesList) return;

    const knownModes = [];
    const prefix = 'archipelagoToolSuite_modeData_'; // Must match G_LOCAL_STORAGE_MODE_PREFIX in init.js

    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(prefix)) {
          knownModes.push(key.substring(prefix.length));
        }
      }
    } catch (e) {
      log('error', 
        '[JsonUI] Error accessing localStorage to get known modes:',
        e
      );
      // Display error in the list itself or just log
      this.knownModesList.innerHTML =
        '<li><span style="color: red;">Error fetching modes.</span></li>';
      return;
    }

    // Clear existing list items
    this.knownModesList.innerHTML = '';

    if (knownModes.length === 0) {
      this.knownModesList.innerHTML =
        '<li><span>No modes found in LocalStorage.</span></li>';
    } else {
      knownModes.sort(); // Sort alphabetically for consistent display
      knownModes.forEach((modeName) => {
        const listItem = document.createElement('li');
        const nameSpan = document.createElement('span');
        nameSpan.textContent = modeName;
        listItem.appendChild(nameSpan);

        // TODO: Add Load button
        const loadButton = document.createElement('button');
        loadButton.textContent = 'Load';
        loadButton.classList.add('button', 'button-small'); // Add appropriate classes
        loadButton.style.marginLeft = '10px';
        loadButton.onclick = () => this._handleLoadModeFromList(modeName);
        listItem.appendChild(loadButton);

        // TODO: Add Delete button
        const deleteButton = document.createElement('button');
        deleteButton.textContent = 'Delete';
        deleteButton.classList.add('button', 'button-danger', 'button-small');
        deleteButton.style.marginLeft = '5px';
        deleteButton.onclick = () => this._handleDeleteModeFromList(modeName);
        listItem.appendChild(deleteButton);

        this.knownModesList.appendChild(listItem);
      });
    }
  }

  _handleLoadModeFromList(modeName) {
    if (!modeName) return;

    log('info', 
      `[JsonUI] Setting "${modeName}" as next active mode from list.`
    );
    this.updateCurrentModeDisplay(modeName); // Updates input and span

    try {
      localStorage.setItem('archipelagoToolSuite_lastActiveMode', modeName);
      alert(
        `Mode "${modeName}" has been set as the active mode. Please RELOAD the page to apply this mode.`
      );
    } catch (error) {
      log('error', 
        '[JsonUI] Error setting last active mode from list:',
        error
      );
      alert('Error setting active mode. See console for details.');
    }
  }

  _handleDeleteModeFromList(modeName) {
    if (!modeName) return;

    const confirmDelete = confirm(
      `Are you sure you want to delete all saved data for mode "${modeName}" from LocalStorage? This action cannot be undone.`
    );

    if (confirmDelete) {
      const modeDataKey = `archipelagoToolSuite_modeData_${modeName}`;
      const lastActiveModeKey = 'archipelagoToolSuite_lastActiveMode';
      try {
        localStorage.removeItem(modeDataKey);
        log('info', 
          `[JsonUI] Deleted mode data for "${modeName}" from LocalStorage (Key: ${modeDataKey}).`
        );

        const currentLastActive = localStorage.getItem(lastActiveModeKey);
        if (currentLastActive === modeName) {
          localStorage.removeItem(lastActiveModeKey);
          log('info', 
            `[JsonUI] Cleared last active mode because it was the deleted mode "${modeName}".`
          );
        }

        alert(`Mode "${modeName}" has been deleted from LocalStorage.`);
        this._populateKnownModesList(); // Refresh the list
      } catch (error) {
        log('error', 
          `[JsonUI] Error deleting mode "${modeName}" from LocalStorage:`,
          error
        );
        alert(`Error deleting mode "${modeName}". See console for details.`);
      }
    }
  }

  _populateModesJsonList(modesConfig) {
    if (!this.modesJsonList) return;

    this.modesJsonList.innerHTML = ''; // Clear existing items

    if (!modesConfig || Object.keys(modesConfig).length === 0) {
      this.modesJsonList.innerHTML =
        '<li><span>No modes defined in modes.json.</span></li>';
      return;
    }

    const modeNames = Object.keys(modesConfig).sort();

    modeNames.forEach((modeName) => {
      const listItem = document.createElement('li');
      const nameSpan = document.createElement('span');
      nameSpan.textContent = modeName;
      listItem.appendChild(nameSpan);

      const loadButton = document.createElement('button');
      loadButton.textContent = 'Load';
      loadButton.classList.add('button', 'button-small');
      loadButton.style.marginLeft = '10px';
      loadButton.onclick = () => this._handleLoadModeFromModesJson(modeName);
      listItem.appendChild(loadButton);

      this.modesJsonList.appendChild(listItem);
    });
  }

  _handleLoadModeFromModesJson(modeName) {
    if (!modeName) return;
    log('info', 
      `[JsonUI] Attempting to load mode "${modeName}" from modes.json by reloading with URL parameter.`
    );
    // Show a confirmation before reloading
    const confirmLoad = confirm(
      `This will reload the application to activate mode "${modeName}" using its definition in modes.json. Any unsaved changes in the current session might be lost. Continue?`
    );
    if (confirmLoad) {
      const newUrl = `${window.location.pathname}?mode=${encodeURIComponent(
        modeName
      )}`;
      window.location.href = newUrl;
    }
  }

  _populateModuleDataCheckboxes() {
    if (!this.moduleDataList) return;

    // Use centralRegistry directly assuming it's imported/available
    // TODO: Ensure centralRegistry is imported if not already
    const handlers = centralRegistry.getAllJsonDataHandlers();

    this.moduleDataList.innerHTML = ''; // Clear existing

    if (handlers.size === 0) {
      this.moduleDataList.innerHTML =
        '<li><span>No modules registered custom data handlers.</span></li>';
      return;
    }

    log('info', 
      `[JsonUI] Populating ${handlers.size} module data checkboxes...`
    );

    // Sort handlers by displayName for consistent order
    const sortedHandlers = [...handlers.entries()].sort(([, a], [, b]) =>
      a.displayName.localeCompare(b.displayName)
    );

    sortedHandlers.forEach(([dataKey, handler]) => {
      const listItem = document.createElement('li');
      const div = document.createElement('div');
      div.classList.add('checkbox-container');

      const textButton = document.createElement('button');
      textButton.classList.add('button', 'button-small', 'text-export-btn');
      textButton.textContent = 'Text';
      textButton.dataset.configKey = dataKey;
      // Add event listener directly to the button
      textButton.addEventListener('click', () => {
        this._handleExportSectionToText(dataKey);
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = `json-chk-module-${dataKey}`;
      checkbox.checked = handler.defaultChecked;
      checkbox.dataset.configKey = dataKey; // Use dataKey for identification

      const label = document.createElement('label');
      label.htmlFor = checkbox.id;
      label.textContent = handler.displayName;
      if (handler.requiresReload) {
        label.textContent += ' (Requires Reload)';
        label.title = 'Applying this data requires a page reload.';
      }

      div.appendChild(textButton);
      div.appendChild(checkbox);
      div.appendChild(label);
      listItem.appendChild(div);
      this.moduleDataList.appendChild(listItem);

      // Store the checkbox reference using its dataKey
      this.checkboxes[dataKey] = checkbox;
      log('info', `[JsonUI] Added checkbox for ${dataKey}`);
    });
  }

  async _applyNonReloadData(loadedData) {
    const handlers = centralRegistry.getAllJsonDataHandlers();
    let requiresReloadDetected = false;

    log('info', 
      '[JsonUI] Applying non-reload data from loaded data:',
      loadedData
    );

    for (const dataKey in loadedData) {
      // Check core types first (if we handle them this way)
      if (dataKey === 'rulesConfig') {
        // TODO: Implement live rules reload
        log('info', 
          '[JsonUI] Found rulesConfig, calling apply function (placeholder)...'
        );
        // this.applyRulesConfig(loadedData.rulesConfig);
      } else if (dataKey === 'userSettings') {
        // Implement live settings application
        log('info', 
          '[JsonUI] Found userSettings, applying settings...'
        );
        try {
          await settingsManager.updateSettings(loadedData.userSettings);
          log('info', '[JsonUI] Settings applied successfully');
        } catch (e) {
          log('error', '[JsonUI] Error applying settings:', e);
        }
      } else if (dataKey === 'layoutConfig') {
        // Skip live layout configuration application - layouts will be applied on page reload
        log('info', 
          '[JsonUI] Found layoutConfig, skipping live application (will be applied on reload)'
        );
      }
      // Check registered module handlers
      else if (handlers.has(dataKey)) {
        const handler = handlers.get(dataKey);
        if (!handler.requiresReload) {
          log('info', `[JsonUI] Applying non-reload data for ${dataKey}...`);
          try {
            handler.applyLoadedDataFunction(loadedData[dataKey]);
          } catch (e) {
            log('error', 
              `[JsonUI] Error calling applyLoadedDataFunction for ${dataKey}:`,
              e
            );
          }
        } else {
          // Check if this data type was actually selected by the user implicitly (it's in the loaded file)
          // We might not have checkbox state here, but presence implies intent
          requiresReloadDetected = true;
          log('info', `[JsonUI] Data type ${dataKey} requires reload.`);
        }
      }
    }

    // Optionally adjust the alert message based on requiresReloadDetected
    // For now, the generic alert in _handleLoadFromFile should suffice.
  }

  async _applyLayoutConfig(layoutConfig) {
    if (!layoutConfig) {
      log('warn', '[JsonUI] No layout config provided to apply');
      return;
    }

    log('info', '[JsonUI] Attempting to apply layout config:', layoutConfig);

    // Check if we have access to the Golden Layout instance
    let goldenLayoutInstance = null;
    
    if (window.goldenLayoutInstance) {
      goldenLayoutInstance = window.goldenLayoutInstance;
      log('info', '[JsonUI] Using window.goldenLayoutInstance for layout application');
    } else if (this.container && this.container.layoutManager) {
      goldenLayoutInstance = this.container.layoutManager;
      log('info', '[JsonUI] Using this.container.layoutManager for layout application');
    } else {
      throw new Error('No Golden Layout instance available for layout application');
    }

    // Transform layout config to ensure size values are strings (Golden Layout 2.x requirement)
    let transformedConfig = this._transformLayoutConfigSizes(layoutConfig);
    log('info', '[JsonUI] Transformed layout config sizes from numbers to strings');

    // Check if the layout config is a "Resolved Config" and convert it if needed
    let configToLoad = transformedConfig;
    
    // According to Golden Layout 2.x docs, when reloading a saved layout,
    // first convert the saved "Resolved Config" to a "Config" by calling LayoutConfig.fromResolved()
    if (window.LayoutConfig && typeof window.LayoutConfig.fromResolved === 'function') {
      try {
        configToLoad = window.LayoutConfig.fromResolved(transformedConfig);
        log('info', '[JsonUI] Converted resolved config to config using LayoutConfig.fromResolved()');
      } catch (e) {
        log('warn', '[JsonUI] Failed to convert with LayoutConfig.fromResolved(), using config as-is:', e);
        // If conversion fails, try using the config as-is
      }
    } else {
      log('warn', '[JsonUI] LayoutConfig.fromResolved() not available, using config as-is');
    }

    // Apply the layout using Golden Layout 2.x loadLayout() method
    if (typeof goldenLayoutInstance.loadLayout === 'function') {
      try {
        await goldenLayoutInstance.loadLayout(configToLoad);
        log('info', '[JsonUI] Layout loaded successfully using loadLayout()');
      } catch (e) {
        log('error', '[JsonUI] Error calling loadLayout():', e);
        throw new Error(`Failed to load layout: ${e.message}`);
      }
    } else {
      throw new Error('Golden Layout instance does not have loadLayout() method available');
    }
  }

  /**
   * Enhanced layout config transformation that:
   * 1. Removes problematic 'size' and 'dimensions' entries that cause Golden Layout parsing issues
   * 2. Optionally assigns IDs to stacks that don't have them (for easier tracking)
   * 3. Preserves width/height percentage values from the actual Golden Layout instance
   */
  _transformLayoutConfigSizes(config) {
    if (!config || typeof config !== 'object') {
      return config;
    }

    log('info', '[JsonUI] Processing layout config: convert size attributes based on container type');

    // Step 1: Get the json data from saveLayout (this is already done - config is the result)
    // Step 2: Process the config to convert size attributes appropriately
    const transformed = this._convertSizeAttributes(config);

    return transformed;
  }

  /**
   * Converts size attributes based on parent-child relationships and removes dimensions entries
   */
  _convertSizeAttributes(config, parentType = null) {
    if (!config || typeof config !== 'object') {
      return config;
    }
    
    if (Array.isArray(config)) {
      return config.map(item => this._convertSizeAttributes(item, parentType));
    }
    
    const converted = {};
    for (const [key, value] of Object.entries(config)) {
      // Remove "dimensions" entries
      if (key === 'dimensions') {
        log('info', `[JsonUI] Removed "dimensions" property from layout config`);
        continue;
      }
      
      // Handle "size" attribute based on parent-child relationship
      if (key === 'size') {
        if (config.type === 'stack' && parentType === 'row') {
          // For "stack" entries whose parent is a "row", rename "size" to "width"
          converted.width = value;
          log('info', `[JsonUI] Converted "size" to "width" for stack in row container: ${value}`);
        } else if (config.type === 'stack' && parentType === 'column') {
          // For "stack" entries whose parent is a "column", rename "size" to "height"
          converted.height = value;
          log('info', `[JsonUI] Converted "size" to "height" for stack in column container: ${value}`);
        } else {
          // For all other entries, remove the "size" entries
          log('info', `[JsonUI] Removed "size" property from ${config.type || 'unknown'} container (parent: ${parentType || 'none'})`);
        }
        continue;
      }
      
      if (typeof value === 'object' && value !== null) {
        // Pass the current item's type as the parent type for its children
        const currentType = config.type || parentType;
        converted[key] = this._convertSizeAttributes(value, currentType);
      } else {
        converted[key] = value;
      }
    }
    
    return converted;
  }



}

import eventBus from '../../app/core/eventBus.js';
// Corrected import for settingsManager (default import)
import settingsManager from '../../app/core/settingsManager.js';
// import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js'; // If needed later

export class JsonUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.currentModeDisplay = null;
    this.modeNameInput = null;
    this.checkboxes = {};
    this.knownModesList = null;

    this._createBaseUI();

    // Listen for GoldenLayout destroy event
    this.container.on('destroy', () => {
      this._destroy();
    });

    // TODO: Populate current mode, known modes, and checkbox states
    this.updateCurrentModeDisplay('default'); // Initial placeholder
  }

  _createBaseUI() {
    const html = `
      <div class="json-panel-container panel-container" style="overflow-y: auto; height: 100%;">
        <div class="sidebar-header">
          <h2>JSON Data Management</h2>
        </div>

        <div class="json-section">
          <h3>Current Mode: <span id="json-current-mode">default</span></h3>
          <label for="json-mode-name">Mode Name for Save/Load:</label>
          <input type="text" id="json-mode-name" value="default" />
        </div>

        <div class="json-section">
          <h4>Include in Operations:</h4>
          <div class="checkbox-container">
            <input type="checkbox" id="json-chk-rules" data-config-key="rulesConfig" checked />
            <label for="json-chk-rules">Rules Config (rules.json)</label>
          </div>
          <div class="checkbox-container">
            <input type="checkbox" id="json-chk-modules" data-config-key="moduleConfig" checked />
            <label for="json-chk-modules">Module Config (modules.json)</label>
          </div>
          <div class="checkbox-container">
            <input type="checkbox" id="json-chk-layout" data-config-key="layoutConfig" checked />
            <label for="json-chk-layout">Layout Config (layout_presets.json / Current)</label>
          </div>
          <div class="checkbox-container">
            <input type="checkbox" id="json-chk-settings" data-config-key="userSettings" checked />
            <label for="json-chk-settings">User Settings (settings.json)</label>
          </div>
          <!-- Placeholder for module-specific data checkboxes -->
        </div>

        <div class="json-section button-group">
          <button id="json-btn-save-file" class="button">Save Combined to File</button>
          <label class="file-input-button-label">
            Load Combined from File
            <input type="file" id="json-btn-load-file" accept=".json" style="display: none;" />
          </label>
          <button id="json-btn-save-localstorage" class="button">Save to LocalStorage</button>
        </div>

        <div class="json-section">
          <h4>Known Modes in LocalStorage:</h4>
          <ul id="json-known-modes-list">
            <!-- Modes will be populated here by JS -->
            <li><span>No modes found in LocalStorage.</span></li>
          </ul>
        </div>
      </div>
    `;

    // Create a temporary wrapper to parse the HTML and get the main panel element
    const tempWrapper = document.createElement('div');
    tempWrapper.innerHTML = html.trim();
    this.rootElement = tempWrapper.firstChild; // Assign the actual panel element to this.rootElement

    // Now that this.rootElement is assigned, append it to the container
    this.container.element.appendChild(this.rootElement);

    // And then get references to inner elements using this.rootElement
    this.currentModeDisplay =
      this.rootElement.querySelector('#json-current-mode');
    this.modeNameInput = this.rootElement.querySelector('#json-mode-name');
    this.knownModesList = this.rootElement.querySelector(
      '#json-known-modes-list'
    );

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
    const saveFileButton = contextElement.querySelector('#json-btn-save-file');
    const loadFileLabel = contextElement.querySelector(
      '.file-input-button-label'
    );
    const loadFileInput = contextElement.querySelector('#json-btn-load-file');
    const saveLocalStorageButton = contextElement.querySelector(
      '#json-btn-save-localstorage'
    );

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

  getSelectedConfigKeys() {
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
      console.log(`[JsonUI] Successfully triggered download for ${filename}`);
    } catch (error) {
      console.error('[JsonUI] Error preparing JSON for download:', error);
      alert('Error preparing data for download. See console for details.');
    }
  }

  _gatherSelectedData() {
    const selectedDataKeys = this.getSelectedConfigKeys();
    const dataToSave = {};

    console.log('[JsonUI] Gathering data for keys:', selectedDataKeys);

    if (selectedDataKeys.includes('rulesConfig')) {
      dataToSave.rulesConfig = window.G_combinedModeData?.rulesConfig;
      console.log(
        '[JsonUI] Included rulesConfig:',
        dataToSave.rulesConfig ? 'Exists' : 'MISSING'
      );
    }
    if (selectedDataKeys.includes('moduleConfig')) {
      dataToSave.moduleConfig = window.G_combinedModeData?.moduleConfig;
      console.log(
        '[JsonUI] Included moduleConfig:',
        dataToSave.moduleConfig ? 'Exists' : 'MISSING'
      );
    }
    if (selectedDataKeys.includes('layoutConfig')) {
      // Save the current live layout state
      if (
        window.goldenLayoutInstance &&
        typeof window.goldenLayoutInstance.toJSON === 'function'
      ) {
        dataToSave.layoutConfig = window.goldenLayoutInstance.toJSON();
        console.log(
          '[JsonUI] Included current layoutConfig from window.goldenLayoutInstance:',
          dataToSave.layoutConfig ? 'Exists' : 'MISSING'
        );
      } else if (
        this.container &&
        this.container.layoutManager &&
        typeof this.container.layoutManager.toJSON === 'function'
      ) {
        // Fallback to container.layoutManager if global is not found (less likely for current setup but good to have a check)
        dataToSave.layoutConfig = this.container.layoutManager.toJSON();
        console.warn(
          '[JsonUI] Used this.container.layoutManager.toJSON() as fallback for layoutConfig:',
          dataToSave.layoutConfig ? 'Exists' : 'MISSING'
        );
      } else {
        // Fallback to loaded preset if live one isn't available
        dataToSave.layoutConfig = window.G_combinedModeData?.layoutConfig;
        console.warn(
          '[JsonUI] Could not get live layout, falling back to preset layoutConfig from G_combinedModeData:',
          dataToSave.layoutConfig ? 'Exists' : 'MISSING'
        );
      }
    }
    if (selectedDataKeys.includes('userSettings')) {
      try {
        // Assuming settingsManager is imported and has a method to get all settings
        dataToSave.userSettings = settingsManager.getSettings(); // User to verify this method
        console.log(
          '[JsonUI] Included userSettings:',
          dataToSave.userSettings ? 'Exists' : 'MISSING'
        );
      } catch (e) {
        console.error('[JsonUI] Failed to get userSettings:', e);
        dataToSave.userSettings = null; // Indicate failure
      }
    }
    // TODO: Add logic for other module-specific data if checkboxes are added for them
    return dataToSave;
  }

  _handleSaveToFile() {
    const modeName = this.modeNameInput.value.trim() || 'default';
    const dataToSave = this._gatherSelectedData();

    if (Object.keys(dataToSave).length === 0) {
      alert('No data types selected to save.');
      return;
    }

    const combinedData = {
      modeName: modeName, // Store the mode name within the file
      savedTimestamp: new Date().toISOString(),
      ...dataToSave,
    };

    console.log(
      `[JsonUI] Save to file. Mode: ${modeName}, Data:`,
      combinedData
    );
    this._downloadJSON(combinedData, `${modeName}_config.json`);
  }

  _handleLoadFromFile(event) {
    const file = event.target.files[0];
    if (!file) {
      console.log('[JsonUI] No file selected for loading.');
      return;
    }
    console.log(`[JsonUI] Load from file selected: ${file.name}`);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const loadedData = JSON.parse(e.target.result);
        console.log('[JsonUI] File content parsed successfully:', loadedData);

        // TODO: Implement logic to apply this loadedData to the application
        // This will involve:
        // 1. Determining the target mode (e.g., from loadedData.modeName or this.modeNameInput.value)
        // 2. Distributing parts of loadedData to relevant managers (StateManager, SettingsManager, LayoutManager)
        // 3. Potentially triggering re-initialization or specific update events.
        alert(
          'File loaded and parsed (see console). Applying data is not yet implemented.'
        );

        // Optionally, populate mode name input if present in file
        if (loadedData.modeName && this.modeNameInput) {
          this.modeNameInput.value = loadedData.modeName;
        }
      } catch (error) {
        console.error('[JsonUI] Error parsing JSON from file:', error);
        alert(
          'Failed to parse JSON from file. Ensure it is a valid JSON configuration.'
        );
      }
    };
    reader.onerror = (e) => {
      console.error('[JsonUI] Error reading file:', e);
      alert('Error reading file.');
    };
    reader.readAsText(file);

    event.target.value = null; // Reset file input to allow loading the same file again
  }

  _handleSaveToLocalStorage() {
    const modeName = this.modeNameInput.value.trim();
    if (!modeName) {
      alert('Please enter a mode name to save data to LocalStorage.');
      this.modeNameInput.focus();
      return;
    }

    const dataToSave = this._gatherSelectedData();

    if (Object.keys(dataToSave).length === 0) {
      alert('No data types selected to save to LocalStorage.');
      return;
    }

    const combinedData = {
      // No need to store modeName inside the object for localStorage as it's in the key
      savedTimestamp: new Date().toISOString(),
      ...dataToSave,
    };

    try {
      localStorage.setItem(
        `app_mode_data_${modeName}`,
        JSON.stringify(combinedData)
      );
      console.log(
        `[JsonUI] Saved to LocalStorage for mode: ${modeName}, Data:`,
        combinedData
      );
      alert(`Configuration saved to LocalStorage for mode: ${modeName}`);
      // TODO: Refresh known modes list by calling _populateKnownModesList()
    } catch (error) {
      console.error('[JsonUI] Error saving to LocalStorage:', error);
      alert(
        'Error saving to LocalStorage. The storage might be full or disabled.'
      );
    }
  }

  // TODO: _populateKnownModesList()
  // TODO: _handleDeleteMode(modeName)

  _destroy() {
    console.log('[JsonUI] Destroying JSON panel UI and listeners.');
    // Remove event listeners if any were attached directly to document or eventBus without specific handles
    // For listeners attached to elements within this.rootElement, they will be garbage collected with the element.
  }
}

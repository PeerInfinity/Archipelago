/**
 * Editor UI - Textarea Implementation
 *
 * Provides a simple textarea-based editor UI.
 * Data management is handled by EditorDataService from editorCore module.
 */

import { getModuleEventBus } from './index.js';
import { editorDataService, EDITOR_EVENTS } from '../editorCore/index.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { applyLoadedData } from '../../utils/dataApplicator.js';

// Modes that support the Apply button
const APPLY_SUPPORTED_MODES = ['rules', 'localStorageMode', 'dataForExport', 'metaGameJsFile', 'latestSnapshot'];

// localStorage prefix for mode data (matches jsonUI.js and init.js)
const G_LOCAL_STORAGE_MODE_PREFIX = 'archipelagoToolSuite_modeData_';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorUI] ${message}`, ...data);
  }
}

class EditorUI {
  constructor(container, componentState) {
    log('info', 'EditorUI instance created with Textarea');
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('editor-panel-content');
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.display = 'flex';
    this.rootElement.style.flexDirection = 'column';

    this.textAreaElement = null;
    this.isInitialized = false;
    this.editorDropdown = null;
    this.autoUpdateCheckbox = null;
    this.updateNowButton = null;
    this.applyButton = null;
    this.unsubscribeContentChanged = null;

    this._handleTextAreaInput = this._handleTextAreaInput.bind(this);
    this._handleApplyClick = this._handleApplyClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);

    this.container.element.appendChild(this.rootElement);

    // Defer full initialization until app is ready
    const readyHandler = () => {
      log('info', '[EditorUI] Received app:readyForUiDataLoad. Initializing editor.');
      this.initialize();
      this.eventBus.unsubscribe(EDITOR_EVENTS.APP_READY, readyHandler);
    };
    this.eventBus.subscribe(EDITOR_EVENTS.APP_READY, readyHandler);

    // If the app is already initialized (e.g., this panel was created after a layout reload
    // via goldenLayoutInstance.loadLayout()), app:readyForUiDataLoad will never fire again.
    // In that case, initialize immediately.
    if (stateManager.getStaticData()) {
      this.initialize();
      this.eventBus.unsubscribe(EDITOR_EVENTS.APP_READY, readyHandler);
    }

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    return this.rootElement;
  }

  initialize() {
    if (!this.isInitialized) {
      log('info', 'Initializing EditorUI (Textarea)...');
      this.initializeEditor();

      // Register this panel's ID with the data service so it can be activated on export
      editorDataService.registerPanelId('editorPanel');

      // Subscribe to data service content changes
      this.unsubscribeContentChanged = editorDataService.onContentChanged(
        (content, sourceKey) => {
          log('info', `[EditorUI] Content changed for source: ${sourceKey}`);
          this._displayCurrentSourceContent();

          // Update dropdown if source changed
          if (this.editorDropdown && this.editorDropdown.value !== sourceKey) {
            this.editorDropdown.value = sourceKey;
          }

          // Update Apply button visibility when source changes
          this._updateApplyButtonVisibility();
        }
      );

      this.isInitialized = true;
    } else {
      log('info', 'EditorUI (Textarea) already initialized.');
      if (this.textAreaElement) {
        this._displayCurrentSourceContent();
      }
    }
  }

  _handleTextAreaInput(event) {
    // Update the data service with the new text
    editorDataService.updateCurrentContent(event.target.value);
  }

  initializeEditor() {
    if (this.textAreaElement) {
      log('info', 'Editor already initialized. Destroying previous instance components.');
      this.destroyEditor();
    }
    log('info', 'Creating editor chrome and <textarea> element...');

    // Create controls container
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'editor-controls';
    controlsDiv.style.padding = '5px';
    controlsDiv.style.backgroundColor = '#222';
    controlsDiv.style.display = 'flex';
    controlsDiv.style.alignItems = 'center';
    controlsDiv.style.gap = '10px';

    // Create dropdown from data service content sources
    this.editorDropdown = document.createElement('select');
    const contentSources = editorDataService.getContentSources();
    for (const key in contentSources) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = contentSources[key].name;
      this.editorDropdown.appendChild(option);
    }
    this.editorDropdown.value = editorDataService.getCurrentSourceKey();
    this.editorDropdown.addEventListener('change', this._handleSourceChange.bind(this));
    controlsDiv.appendChild(this.editorDropdown);

    // Create auto-update checkbox and label
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = 'flex';
    checkboxContainer.style.alignItems = 'center';
    checkboxContainer.style.gap = '5px';

    this.autoUpdateCheckbox = document.createElement('input');
    this.autoUpdateCheckbox.type = 'checkbox';
    this.autoUpdateCheckbox.id = 'editor-auto-update';
    this.autoUpdateCheckbox.checked = editorDataService.getAutoUpdateEnabled();
    this.autoUpdateCheckbox.addEventListener('change', this._handleAutoUpdateChange.bind(this));

    const checkboxLabel = document.createElement('label');
    checkboxLabel.htmlFor = 'editor-auto-update';
    checkboxLabel.textContent = 'Auto-update';
    checkboxLabel.style.color = '#ccc';
    checkboxLabel.style.cursor = 'pointer';
    checkboxLabel.style.userSelect = 'none';

    checkboxContainer.appendChild(this.autoUpdateCheckbox);
    checkboxContainer.appendChild(checkboxLabel);
    controlsDiv.appendChild(checkboxContainer);

    // Create Update Now button
    this.updateNowButton = document.createElement('button');
    this.updateNowButton.textContent = 'Update Now';
    this.updateNowButton.style.padding = '2px 8px';
    this.updateNowButton.style.backgroundColor = '#444';
    this.updateNowButton.style.color = '#ccc';
    this.updateNowButton.style.border = '1px solid #666';
    this.updateNowButton.style.borderRadius = '3px';
    this.updateNowButton.style.cursor = 'pointer';
    this.updateNowButton.addEventListener('click', this._handleUpdateNowClick.bind(this));

    this.updateNowButton.addEventListener('mouseenter', () => {
      this.updateNowButton.style.backgroundColor = '#555';
    });
    this.updateNowButton.addEventListener('mouseleave', () => {
      this.updateNowButton.style.backgroundColor = '#444';
    });

    controlsDiv.appendChild(this.updateNowButton);

    // Create Apply button (only visible for 'rules' source)
    this.applyButton = document.createElement('button');
    this.applyButton.textContent = 'Apply';
    this.applyButton.style.padding = '2px 8px';
    this.applyButton.style.backgroundColor = '#2e7d32';
    this.applyButton.style.color = '#fff';
    this.applyButton.style.border = '1px solid #666';
    this.applyButton.style.borderRadius = '3px';
    this.applyButton.style.cursor = 'pointer';
    this.applyButton.title = 'Apply changes (Ctrl+Enter)';
    this.applyButton.addEventListener('click', this._handleApplyClick);

    this.applyButton.addEventListener('mouseenter', () => {
      this.applyButton.style.backgroundColor = '#388e3c';
    });
    this.applyButton.addEventListener('mouseleave', () => {
      this.applyButton.style.backgroundColor = '#2e7d32';
    });

    controlsDiv.appendChild(this.applyButton);

    // Update Apply button visibility based on current source
    this._updateApplyButtonVisibility();

    this.rootElement.appendChild(controlsDiv);

    try {
      this.textAreaElement = document.createElement('textarea');
      this.textAreaElement.style.width = '100%';
      this.textAreaElement.style.height = 'calc(100% - 40px)';
      this.textAreaElement.style.border = 'none';
      this.textAreaElement.style.resize = 'none';
      this.textAreaElement.style.backgroundColor = '#000000';
      this.textAreaElement.style.color = '#FFFFFF';
      this.textAreaElement.classList.add('editor-textarea');
      this.textAreaElement.addEventListener('input', this._handleTextAreaInput);
      this.textAreaElement.addEventListener('keydown', this._handleKeyDown);
      this.rootElement.appendChild(this.textAreaElement);

      this._displayCurrentSourceContent();

      log('info', 'Editor components created and attached successfully.');
    } catch (error) {
      log('error', 'Failed to initialize Textarea:', error);
      this.rootElement.textContent = 'Error loading Textarea.';
      this.textAreaElement = null;
    }
  }

  _handleSourceChange() {
    const newSourceKey = this.editorDropdown.value;
    editorDataService.setCurrentSourceKey(newSourceKey);
    this._updateApplyButtonVisibility();
  }

  _handleAutoUpdateChange() {
    editorDataService.setAutoUpdateEnabled(this.autoUpdateCheckbox.checked);
  }

  async _handleUpdateNowClick() {
    log('info', '[EditorUI] Update Now button clicked');
    await editorDataService.updateNow();
  }

  async _handleApplyClick() {
    if (!this.textAreaElement || !this.applyButton) return;

    const currentSourceKey = editorDataService.getCurrentSourceKey();
    if (!APPLY_SUPPORTED_MODES.includes(currentSourceKey)) {
      log('warn', `[EditorUI] Apply clicked but mode '${currentSourceKey}' not supported`);
      return;
    }

    try {
      const jsonText = this.textAreaElement.value;

      // Route to appropriate handler based on mode
      switch (currentSourceKey) {
        case 'rules':
          await this._applyRules(jsonText);
          break;
        case 'localStorageMode':
          await this._applyLocalStorageMode(jsonText);
          break;
        case 'dataForExport':
          await this._applyDataForExport(jsonText);
          break;
        case 'metaGameJsFile':
          await this._applyMetaGameJsFile(jsonText);
          break;
        case 'latestSnapshot':
          await this._applyLatestSnapshot(jsonText);
          break;
        default:
          throw new Error(`Unknown mode: ${currentSourceKey}`);
      }

      // Visual feedback - success
      this._showApplyFeedback(true);
      log('info', `[EditorUI] ${currentSourceKey} applied successfully`);
    } catch (error) {
      if (error && error._handled) return; // feedback already shown
      log('error', `[EditorUI] Error applying ${currentSourceKey}:`, error);
      this._showApplyFeedback(false);
      alert(`Error applying: ${error.message}`);
    }
  }

  _showApplyFeedback(success, message) {
    if (!this.applyButton) return;

    const originalText = this.applyButton.textContent;
    const originalBg = this.applyButton.style.backgroundColor;

    if (success) {
      this.applyButton.textContent = message || 'Applied!';
      this.applyButton.style.backgroundColor = '#4CAF50';
    } else {
      this.applyButton.textContent = message || 'Error!';
      this.applyButton.style.backgroundColor = '#f44336';
    }

    setTimeout(() => {
      if (this.applyButton) {
        this.applyButton.textContent = originalText;
        this.applyButton.style.backgroundColor = originalBg;
      }
    }, success ? 1000 : 2000);
  }

  async _applyRules(jsonText) {
    const rulesData = JSON.parse(jsonText);
    log('info', '[EditorUI] Applying edited rules...');

    // Publish the files:jsonLoaded event to trigger rules loading
    this.eventBus.publish('files:jsonLoaded', {
      jsonData: rulesData,
      selectedPlayerId: '1',
      sourceName: 'editorApply'
    });
  }

  async _applyLocalStorageMode(jsonText) {
    // Remove any comment lines at the beginning (// Data Sources: comments)
    const cleanedJsonText = jsonText.replace(/^\/\/.*\n/gm, '').trim();
    const modeData = JSON.parse(cleanedJsonText);

    log('info', '[EditorUI] Applying localStorage mode data...');

    // Get the mode name from the data or use default
    const modeName = modeData.modeName || 'default';

    // Update timestamp
    modeData.savedTimestamp = new Date().toISOString();

    // Save to localStorage
    localStorage.setItem(
      `${G_LOCAL_STORAGE_MODE_PREFIX}${modeName}`,
      JSON.stringify(modeData)
    );

    // Set as last active mode
    localStorage.setItem('archipelagoToolSuite_lastActiveMode', modeName);

    log('info', `[EditorUI] Saved mode '${modeName}' to localStorage, reloading...`);

    // Reload the page to apply changes
    window.location.reload();
  }

  async _applyDataForExport(jsonText) {
    const loadedData = JSON.parse(jsonText);
    log('info', '[EditorUI] Applying data for export...');
    const result = await applyLoadedData(loadedData, 'editor');
    if (result.requiresReload) {
      this._showApplyFeedback(true, 'Applied! (reload needed)');
      throw { _handled: true }; // skip default feedback
    }
  }

  async _applyMetaGameJsFile(jsText) {
    log('info', '[EditorUI] Applying metaGame JS file...');

    // Try to extract and apply the metaGameConfiguration object from the JS
    // Look for: export const metaGameConfiguration = { ... }
    const configMatch = jsText.match(/export\s+const\s+metaGameConfiguration\s*=\s*(\{[\s\S]*?\});?\s*(?:export|$)/);

    if (configMatch) {
      try {
        // Try to evaluate the configuration object
        // This is a simplified approach - we evaluate just the object literal
        const configStr = configMatch[1];
        // Use Function constructor to safely evaluate the object
        const evalConfig = new Function(`return ${configStr}`)();

        // Publish event for metaGame to update its configuration
        this.eventBus.publish('editor:metaGameConfigApply', {
          configuration: evalConfig,
          sourceName: 'editorApply'
        });

        log('info', '[EditorUI] MetaGame configuration extracted and applied');
      } catch (evalError) {
        log('warn', '[EditorUI] Could not evaluate metaGameConfiguration, trying JSON parse...', evalError);
        // If direct evaluation fails, try to parse as JSON-like structure
        throw new Error('Cannot evaluate JavaScript configuration. Edit the JSON configuration in the MetaGame Panel instead.');
      }
    } else {
      throw new Error('Could not find metaGameConfiguration export in the JS file. Use the MetaGame Panel to edit JSON configuration.');
    }
  }

  async _applyLatestSnapshot(jsonText) {
    const snapshotData = JSON.parse(jsonText);
    log('info', '[EditorUI] Applying edited snapshot...');

    // Publish event for state manager to apply the snapshot
    this.eventBus.publish('editor:snapshotApply', {
      snapshot: snapshotData,
      sourceName: 'editorApply'
    });
  }

  _updateApplyButtonVisibility() {
    if (!this.applyButton) return;

    const currentSourceKey = editorDataService.getCurrentSourceKey();
    const showApply = APPLY_SUPPORTED_MODES.includes(currentSourceKey);
    this.applyButton.style.display = showApply ? 'inline-block' : 'none';

    // Update tooltip based on mode
    if (showApply) {
      const tooltips = {
        rules: 'Apply edited rules (Ctrl+Enter)',
        localStorageMode: 'Save to localStorage and reload (Ctrl+Enter)',
        dataForExport: 'Apply edited data to application (Ctrl+Enter)',
        metaGameJsFile: 'Apply JSON configuration from JS file (Ctrl+Enter)',
        latestSnapshot: 'Apply edited snapshot to state manager (Ctrl+Enter)',
      };
      this.applyButton.title = tooltips[currentSourceKey] || 'Apply (Ctrl+Enter)';
    }
  }

  _handleKeyDown(event) {
    // Check for Ctrl+Enter combination to apply
    if (event.ctrlKey && event.key === 'Enter') {
      const currentSourceKey = editorDataService.getCurrentSourceKey();
      if (APPLY_SUPPORTED_MODES.includes(currentSourceKey)) {
        event.preventDefault();
        log('info', `[EditorUI] Ctrl+Enter shortcut detected, applying ${currentSourceKey}...`);
        this._handleApplyClick();
      }
    }
  }

  _displayCurrentSourceContent() {
    if (!this.textAreaElement) {
      return;
    }

    const content = editorDataService.getContent();
    const currentSourceKey = editorDataService.getCurrentSourceKey();

    log('info', `[EditorUI] Displaying content for source: ${currentSourceKey}`);

    if (!content.loaded) {
      this.textAreaElement.value = content.text || 'No data available.';
      return;
    }

    try {
      // For mode data, add data sources information at the top
      if (currentSourceKey === 'localStorageMode' && content.text) {
        try {
          const data = JSON.parse(content.text);
          if (data.dataSources) {
            const sourcesInfo = Object.entries(data.dataSources)
              .map(([key, info]) => `${key}: ${info.source} (${info.details})`)
              .join('\n');

            const formattedJson = JSON.stringify(data, null, 2);
            this.textAreaElement.value = `// Data Sources:\n${sourcesInfo}\n\n${formattedJson}`;
            return;
          }
        } catch (e) {
          // If parsing fails, just display as-is
        }
      }

      this.textAreaElement.value = content.text;
    } catch (e) {
      log('error', '[EditorUI] Error displaying content:', e);
      this.textAreaElement.value = 'Error displaying content';
    }
  }

  onPanelResize(width, height) {
    log('info', `EditorUI (Textarea) resized to ${width}x${height}`);
  }

  destroyEditor() {
    if (this.textAreaElement) {
      log('info', 'Destroying <textarea> instance.');
      this.textAreaElement.removeEventListener('input', this._handleTextAreaInput);
      this.textAreaElement.removeEventListener('keydown', this._handleKeyDown);
      if (this.textAreaElement.parentNode === this.rootElement) {
        this.rootElement.removeChild(this.textAreaElement);
      }
      this.textAreaElement = null;
    }

    if (this.applyButton) {
      this.applyButton.removeEventListener('click', this._handleApplyClick);
      this.applyButton = null;
    }

    if (this.editorDropdown) {
      const controlsDiv = this.rootElement.querySelector('.editor-controls');
      if (controlsDiv && controlsDiv.parentNode === this.rootElement) {
        this.rootElement.removeChild(controlsDiv);
      }
      this.editorDropdown = null;
    }

    this.autoUpdateCheckbox = null;
    this.updateNowButton = null;
  }

  onPanelDestroy() {
    log('info', 'EditorUI (Textarea) destroyed');
    this.destroyEditor();

    // Unsubscribe from data service
    if (this.unsubscribeContentChanged) {
      this.unsubscribeContentChanged();
      this.unsubscribeContentChanged = null;
    }

    this.isInitialized = false;
  }

  dispose() {
    log('info', 'Disposing EditorUI (Textarea)...');
    this.onPanelDestroy();
  }

  // --- Legacy methods for backward compatibility ---

  loadJsonData(jsonData) {
    log('warn', '[EditorUI] loadJsonData is deprecated. Use editorDataService directly.');
    if (jsonData === null || typeof jsonData === 'undefined') {
      editorDataService.setContent('rules', '');
    } else {
      try {
        const text = JSON.stringify(jsonData, null, 2);
        editorDataService.setContent('rules', text);
      } catch (error) {
        editorDataService.setContent('rules', String(jsonData));
      }
    }
  }

  setContent(newContent) {
    log('warn', '[EditorUI] setContent is deprecated. Use editorDataService directly.');
    let textToSet = '';
    if (newContent && typeof newContent.text === 'string') {
      textToSet = newContent.text;
    } else if (newContent && typeof newContent.json !== 'undefined') {
      try {
        textToSet = JSON.stringify(newContent.json, null, 2);
      } catch (error) {
        textToSet = '[Error displaying JSON]';
      }
    } else if (newContent) {
      textToSet = String(newContent);
    }

    const currentSourceKey = editorDataService.getCurrentSourceKey();
    editorDataService.setContent(currentSourceKey, textToSet);
  }

  getContent() {
    // Sync textarea value to data service before returning
    if (this.textAreaElement) {
      editorDataService.updateCurrentContent(this.textAreaElement.value);
    }
    return editorDataService.getContent();
  }
}

export default EditorUI;

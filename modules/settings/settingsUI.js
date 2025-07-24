import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('settingsUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[settingsUI] ${message}`, ...data);
  }
}

class SettingsUI {
  constructor(container, componentState) {
    log('info', 'SettingsUI instance created');
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('settings-panel-content', 'panel-container');
    this.rootElement.style.width = '100%';
    this.rootElement.style.height = '100%';
    this.rootElement.style.display = 'flex';
    this.rootElement.style.flexDirection = 'column';

    this.textAreaElement = null;
    this.applyButton = null;
    this.isInitialized = false;
    this.unsubscribeHandles = [];

    this._handleTextAreaInput = this._handleTextAreaInput.bind(this);
    this._handleApplyClick = this._handleApplyClick.bind(this);
    this._handleKeyDown = this._handleKeyDown.bind(this);

    this.container.element.appendChild(this.rootElement);

    // Defer full initialization until app is ready
    const readyHandler = (eventPayload) => {
      log('info', '[SettingsUI] Received app:readyForUiDataLoad. Initializing editor.');
      this.initialize();
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'settings');

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    return this.rootElement;
  }

  initialize() {
    if (!this.isInitialized) {
      log('info', 'Initializing SettingsUI...');
      this.initializeEditor();
      this.subscribeToEvents();
      this.isInitialized = true;
    } else {
      log('info', 'SettingsUI already initialized.');
      if (this.textAreaElement) {
        this.loadCurrentSettings();
      }
    }
  }

  async initializeEditor() {
    if (this.textAreaElement) {
      log('info', 'Settings editor already exists. Destroying previous instance.');
      this.destroyEditor();
    }

    log('info', 'Creating settings editor textarea...');
    try {
      // Create controls container
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'settings-controls';
      controlsDiv.style.padding = '5px';
      controlsDiv.style.backgroundColor = '#222';

      // Create Apply button
      this.applyButton = document.createElement('button');
      this.applyButton.textContent = 'Apply';
      this.applyButton.style.padding = '5px 10px';
      this.applyButton.style.marginRight = '10px';
      this.applyButton.addEventListener('click', this._handleApplyClick);
      controlsDiv.appendChild(this.applyButton);

      // Add title
      const title = document.createElement('span');
      title.textContent = 'Settings JSON Editor (Ctrl+Enter to apply)';
      title.style.color = '#fff';
      controlsDiv.appendChild(title);

      this.rootElement.appendChild(controlsDiv);

      // Create textarea
      this.textAreaElement = document.createElement('textarea');
      this.textAreaElement.style.width = '100%';
      this.textAreaElement.style.height = 'calc(100% - 40px)';
      this.textAreaElement.style.border = 'none';
      this.textAreaElement.style.resize = 'none';
      this.textAreaElement.style.backgroundColor = '#000000';
      this.textAreaElement.style.color = '#FFFFFF';
      this.textAreaElement.style.fontFamily = 'monospace';
      this.textAreaElement.style.fontSize = '12px';
      this.textAreaElement.classList.add('settings-textarea');
      this.textAreaElement.addEventListener('input', this._handleTextAreaInput);
      this.textAreaElement.addEventListener('keydown', this._handleKeyDown);
      this.rootElement.appendChild(this.textAreaElement);

      await this.loadCurrentSettings();

      log('info', 'Settings editor components created successfully.');
    } catch (error) {
      log('error', 'Failed to initialize Settings editor:', error);
      this.rootElement.textContent = 'Error loading Settings Editor.';
      this.textAreaElement = null;
    }
  }

  async loadCurrentSettings() {
    if (!this.textAreaElement) return;
    
    try {
      const currentSettings = await settingsManager.getSettings();
      this.textAreaElement.value = JSON.stringify(currentSettings, null, 2);
      log('info', 'Loaded current settings into editor');
    } catch (error) {
      log('error', 'Error loading current settings:', error);
      this.textAreaElement.value = 'Error loading settings';
    }
  }

  subscribeToEvents() {
    // Subscribe to settings changes to update the editor
    const settingsChangedHandler = (eventData) => {
      if (eventData && eventData.settings) {
        log('info', 'Settings changed, updating editor');
        if (this.textAreaElement) {
          this.textAreaElement.value = JSON.stringify(eventData.settings, null, 2);
        }
      }
    };

    this.unsubscribeHandles.push(
      eventBus.subscribe('settings:changed', settingsChangedHandler, 'settings')
    );
  }

  unsubscribeFromEvents() {
    for (const unsubscribe of this.unsubscribeHandles) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this.unsubscribeHandles = [];
    log('info', 'SettingsUI unsubscribed from all events.');
  }

  _handleTextAreaInput(event) {
    // Just track that content has changed - don't auto-apply
    // User will click Apply when ready
  }

  _handleKeyDown(event) {
    // Check for Ctrl+Enter combination
    if (event.ctrlKey && event.key === 'Enter') {
      event.preventDefault(); // Prevent default Enter behavior in textarea
      log('info', 'Ctrl+Enter shortcut detected, applying settings...');
      this._handleApplyClick();
    }
  }

  async _handleApplyClick() {
    if (!this.textAreaElement) return;

    try {
      const jsonText = this.textAreaElement.value;
      const newSettings = JSON.parse(jsonText);
      
      log('info', 'Applying new settings:', newSettings);
      await settingsManager.updateSettings(newSettings);
      
      // Show visual feedback
      const originalText = this.applyButton.textContent;
      this.applyButton.textContent = 'Applied!';
      this.applyButton.style.backgroundColor = '#4CAF50';
      
      setTimeout(() => {
        this.applyButton.textContent = originalText;
        this.applyButton.style.backgroundColor = '';
      }, 1000);
      
    } catch (error) {
      log('error', 'Error applying settings:', error);
      
      // Show error feedback
      const originalText = this.applyButton.textContent;
      this.applyButton.textContent = 'Error!';
      this.applyButton.style.backgroundColor = '#f44336';
      
      setTimeout(() => {
        this.applyButton.textContent = originalText;
        this.applyButton.style.backgroundColor = '';
      }, 2000);
      
      alert(`Error applying settings: ${error.message}`);
    }
  }

  onPanelResize(width, height) {
    log('info', `SettingsUI resized to ${width}x${height}`);
  }

  destroyEditor() {
    if (this.textAreaElement) {
      log('info', 'Destroying textarea instance.');
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

    // Clear controls
    const controlsDiv = this.rootElement.querySelector('.settings-controls');
    if (controlsDiv && controlsDiv.parentNode === this.rootElement) {
      this.rootElement.removeChild(controlsDiv);
    }
  }

  onPanelDestroy() {
    log('info', 'SettingsUI destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents();
    this.isInitialized = false;
  }

  dispose() {
    log('info', 'Disposing SettingsUI...');
    this.onPanelDestroy();
  }

  // Legacy methods for compatibility
  async setData(newData, newSchema = null) {
    log('info', 'SettingsUI setData called.');
    await this.loadCurrentSettings();
  }

  async getData() {
    return await settingsManager.getSettings();
  }
}

export default SettingsUI;

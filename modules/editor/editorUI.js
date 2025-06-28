import eventBus from '../../app/core/eventBus.js'; // <<< Import eventBus

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorUI] ${message}`, ...data);
  }
}

// REMOVED: Unnecessary import
// import { setEditorInstance } from './index.js';

class EditorUI {
  constructor(container, componentState) {
    log('info', 'EditorUI instance created with Textarea');
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('editor-panel-content'); // Add a class for styling if needed
    this.rootElement.style.width = '100%'; // Ensure it fills container width
    this.rootElement.style.height = '100%'; // Ensure it fills container height
    this.rootElement.style.display = 'flex'; // Use flex to make textarea fill space
    this.rootElement.style.flexDirection = 'column';

    this.textAreaElement = null; // Will hold the <textarea>
    this.isInitialized = false; // Track initialization state
    this.unsubscribeHandles = {}; // Store multiple unsubscribe functions

    this._handleTextAreaInput = this._handleTextAreaInput.bind(this); // Bind listener method

    // Content sources
    this.contentSources = {
      rules: {
        text: '{\n  "greeting": "Hello World from rules",\n  "value": 123\n}',
        loaded: false,
        name: 'Active Rules JSON',
      },
      localStorageMode: {
        text: '{\n  "message": "No LocalStorage data loaded yet."\n}',
        loaded: false,
        name: 'Loaded Mode Data',
      },
    };
    this.currentSourceKey = 'rules'; // Default source
    this.editorDropdown = null;

    // Initial content - Storing as text now
    // this.content = { // REMOVED - managed by contentSources now
    //   text: '{\n  "greeting": "Hello World",\n  "value": 123\n}',
    // };

    this.container.element.appendChild(this.rootElement);

    // Defer full initialization until app is ready
    const readyHandler = (eventPayload) => {
      log('info', 
        '[EditorUI] Received app:readyForUiDataLoad. Initializing editor.'
      );
      this.initialize(); // This will create the textarea and subscribe to data events
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  getRootElement() {
    return this.rootElement;
  }

  // Called when the panel is first opened or shown
  initialize() {
    if (!this.isInitialized) {
      log('info', 
        'Initializing EditorUI (Textarea)...attempting to populate from global data.'
      );
      this.initializeEditor(); // Creates dropdown and textarea

      // Attempt to populate from global G_combinedModeData if available
      if (window.G_combinedModeData) {
        log('info', '[EditorUI] Found window.G_combinedModeData during init.');
        // Populate LocalStorage Mode view
        if (window.G_combinedModeData) {
          // Check again for safety, though outer check exists
          try {
            this.contentSources.localStorageMode.text = JSON.stringify(
              window.G_combinedModeData,
              null,
              2
            );
            this.contentSources.localStorageMode.loaded = true;
            log('info', 
              '[EditorUI] Populated localStorageMode from window.G_combinedModeData.'
            );
          } catch (e) {
            log('error', 
              '[EditorUI] Error stringifying G_combinedModeData for localStorageMode view:',
              e
            );
            this.contentSources.localStorageMode.text =
              'Error: Could not display LocalStorage mode data.';
          }
        }

        // Populate Active Rules JSON view
        if (window.G_combinedModeData.rulesConfig) {
          try {
            this.contentSources.rules.text = JSON.stringify(
              window.G_combinedModeData.rulesConfig,
              null,
              2
            );
            this.contentSources.rules.loaded = true;
            log('info', 
              '[EditorUI] Populated rules from window.G_combinedModeData.rulesConfig.'
            );
          } catch (e) {
            log('error', 
              '[EditorUI] Error stringifying G_combinedModeData.rulesConfig for rules view:',
              e
            );
            this.contentSources.rules.text =
              'Error: Could not display rules JSON.';
          }
        } else {
          log('warn', 
            '[EditorUI] window.G_combinedModeData.rulesConfig not found during init.'
          );
        }

        this._displayCurrentSourceContent(); // Refresh editor view
      } else {
        log('warn', 
          '[EditorUI] window.G_combinedModeData NOT found during init. Content will rely on events.'
        );
      }

      this.subscribeToEvents(); // Subscribe to events for future updates
      this.isInitialized = true;
    } else {
      log('info', 'EditorUI (Textarea) already initialized.');
      if (this.textAreaElement) {
        // If re-opened, ensure current source content is displayed
        this._displayCurrentSourceContent();
      }
    }
  }

  // Subscribe to relevant EventBus events
  subscribeToEvents() {
    if (this.unsubscribeHandles['rulesData']) {
      log('warn', 
        'EditorUI already subscribed to rulesData. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['rulesData']();
    }

    log('info', "EditorUI subscribing to 'stateManager:rawJsonDataLoaded'");
    this.unsubscribeHandles['rulesData'] = eventBus.subscribe(
      'stateManager:rawJsonDataLoaded',
      (eventData) => {
        if (!eventData || !eventData.rawJsonData) {
          log('warn', 
            "EditorUI received invalid payload for 'stateManager:rawJsonDataLoaded'",
            eventData
          );
          this.contentSources.rules.text =
            'Error: Invalid data received for rules.';
          this.contentSources.rules.loaded = true;
        } else {
          log('info', 
            `EditorUI received raw rules data from: ${
              eventData.source || 'unknown'
            }`
          );
          try {
            this.contentSources.rules.text = JSON.stringify(
              eventData.rawJsonData,
              null,
              2
            );
          } catch (e) {
            log('error', 'Error stringifying rules JSON:', e);
            this.contentSources.rules.text =
              'Error: Could not display rules JSON.';
          }
          this.contentSources.rules.loaded = true;
        }
        if (this.currentSourceKey === 'rules') {
          this._displayCurrentSourceContent();
        }
      }
    );

    if (this.unsubscribeHandles['localStorageData']) {
      log('warn', 
        'EditorUI already subscribed to localStorageData. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['localStorageData']();
    }
    // Placeholder for subscription to full mode data from LocalStorage
    // Your main app init should publish this event after loading from LocalStorage
    log('info', "EditorUI subscribing to 'app:fullModeDataLoadedFromStorage'");
    this.unsubscribeHandles['localStorageData'] = eventBus.subscribe(
      'app:fullModeDataLoadedFromStorage', // Event name to be defined and used by app init
      (eventPayload) => {
        if (eventPayload && eventPayload.modeData) {
          log('info', 
            '[EditorUI] Received full mode data from LocalStorage:',
            eventPayload.modeData
          );
          try {
            this.contentSources.localStorageMode.text = JSON.stringify(
              eventPayload.modeData,
              null,
              2
            );
          } catch (e) {
            log('error', 'Error stringifying localStorage mode JSON:', e);
            this.contentSources.localStorageMode.text =
              'Error: Could not display LocalStorage mode data.';
          }
          this.contentSources.localStorageMode.loaded = true;
        } else {
          log('warn', 
            '[EditorUI] Invalid or empty payload for app:fullModeDataLoadedFromStorage'
          );
          this.contentSources.localStorageMode.text =
            'Error: Invalid data received for LocalStorage mode.';
          this.contentSources.localStorageMode.loaded = true;
        }
        if (this.currentSourceKey === 'localStorageMode') {
          this._displayCurrentSourceContent();
        }
      }
    );
  }

  // Unsubscribe from EventBus events
  unsubscribeFromEvents() {
    for (const key in this.unsubscribeHandles) {
      if (typeof this.unsubscribeHandles[key] === 'function') {
        this.unsubscribeHandles[key]();
      }
    }
    this.unsubscribeHandles = {};
    log('info', 'EditorUI unsubscribed from all events.');
  }

  // Bound method to handle textarea input events
  _handleTextAreaInput(event) {
    // Update the text for the current source
    if (this.contentSources[this.currentSourceKey]) {
      this.contentSources[this.currentSourceKey].text = event.target.value;
    }
    // Optional: Dispatch an event if other modules need to know about changes immediately
    // eventBus.publish(`editor:contentChanged:${this.currentSourceKey}`, { text: event.target.value });
  }

  initializeEditor() {
    if (this.textAreaElement) {
      log('info', 
        'Editor already initialized. Destroying previous instance components.'
      );
      this.destroyEditor(); // Clean up existing editor chrome and textarea
    }
    log('info', 'Creating editor chrome and <textarea> element...');

    // Create controls container
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'editor-controls';
    controlsDiv.style.padding = '5px';
    controlsDiv.style.backgroundColor = '#222'; // Darker background for controls

    // Create dropdown
    this.editorDropdown = document.createElement('select');
    for (const key in this.contentSources) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = this.contentSources[key].name;
      this.editorDropdown.appendChild(option);
    }
    this.editorDropdown.value = this.currentSourceKey; // Set initial selection
    this.editorDropdown.addEventListener(
      'change',
      this._handleSourceChange.bind(this)
    );
    controlsDiv.appendChild(this.editorDropdown);

    this.rootElement.appendChild(controlsDiv); // Add controls to the top

    try {
      this.textAreaElement = document.createElement('textarea');
      // Initial content will be set by _displayCurrentSourceContent
      this.textAreaElement.style.width = '100%';
      this.textAreaElement.style.height = 'calc(100% - 40px)'; // Adjust height for controls
      this.textAreaElement.style.border = 'none';
      this.textAreaElement.style.resize = 'none';
      // this.textAreaElement.style.flexGrow = '1'; // No longer direct child of flex, parent is column
      this.textAreaElement.style.backgroundColor = '#000000';
      this.textAreaElement.style.color = '#FFFFFF';
      this.textAreaElement.classList.add('editor-textarea');
      this.textAreaElement.addEventListener('input', this._handleTextAreaInput);
      this.rootElement.appendChild(this.textAreaElement);

      this._displayCurrentSourceContent(); // Display content for the default source

      log('info', 'Editor components created and attached successfully.');
    } catch (error) {
      log('error', 'Failed to initialize Textarea:', error);
      this.rootElement.textContent = 'Error loading Textarea.';
      this.textAreaElement = null;
    }
  }

  _handleSourceChange() {
    const newSourceKey = this.editorDropdown.value;
    if (this.contentSources[newSourceKey]) {
      this.currentSourceKey = newSourceKey;
      log('info', `[EditorUI] Switched to source: ${this.currentSourceKey}`);
      this._displayCurrentSourceContent();
    } else {
      log('warn', 
        `[EditorUI] Attempted to switch to unknown source key: ${newSourceKey}`
      );
    }
  }

  _displayCurrentSourceContent() {
    if (!this.textAreaElement) return;

    const source = this.contentSources[this.currentSourceKey];
    if (!source) {
      log('warn', 
        `[EditorUI] No content source found for key: ${this.currentSourceKey}`
      );
      return;
    }

    if (!source.loaded) {
      this.textAreaElement.value = 'Loading...';
      return;
    }

    try {
      // For mode data, add data sources information at the top
      if (this.currentSourceKey === 'localStorageMode' && source.text) {
        const data = JSON.parse(source.text);
        if (data.dataSources) {
          // Create a formatted string of data sources
          const sourcesInfo = Object.entries(data.dataSources)
            .map(([key, info]) => `${key}: ${info.source} (${info.details})`)
            .join('\n');

          // Add it as a comment at the top of the JSON
          const formattedJson = JSON.stringify(data, null, 2);
          this.textAreaElement.value = `// Data Sources:\n${sourcesInfo}\n\n${formattedJson}`;
        } else {
          this.textAreaElement.value = source.text;
        }
      } else {
        this.textAreaElement.value = source.text;
      }
    } catch (e) {
      log('error', '[EditorUI] Error displaying content:', e);
      this.textAreaElement.value = 'Error displaying content';
    }
  }

  // Called when the panel container is resized
  onPanelResize(width, height) {
    log('info', `EditorUI (Textarea) resized to ${width}x${height}`);
    // Textarea with 100% width/height and flex layout should resize automatically.
    // No specific action needed here unless manual adjustments are required.
  }

  destroyEditor() {
    if (this.textAreaElement) {
      log('info', 'Destroying <textarea> instance.');
      this.textAreaElement.removeEventListener(
        'input',
        this._handleTextAreaInput
      );
      if (this.textAreaElement.parentNode === this.rootElement) {
        this.rootElement.removeChild(this.textAreaElement);
      }
      this.textAreaElement = null;
    }
    if (this.editorDropdown) {
      if (this.editorDropdown.parentNode) {
        this.editorDropdown.parentNode.removeEventListener(
          'change',
          this._handleSourceChange.bind(this)
        ); //This might not be correct way to remove
        this.editorDropdown.parentNode.removeChild(this.editorDropdown);
      }
      const controlsDiv = this.rootElement.querySelector('.editor-controls');
      if (controlsDiv && controlsDiv.parentNode === this.rootElement) {
        this.rootElement.removeChild(controlsDiv);
      }
      this.editorDropdown = null;
    }
  }

  // Called when the panel is about to be destroyed by Golden Layout
  onPanelDestroy() {
    log('info', 'EditorUI (Textarea) destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents(); // <<< Unsubscribe on destroy
    this.isInitialized = false;
  }

  // Optional: General cleanup method
  dispose() {
    log('info', 'Disposing EditorUI (Textarea)...');
    this.onPanelDestroy(); // Call destroy logic
    // Any other cleanup specific to EditorUI itself
  }

  // Method to load JSON data into the editor (textarea)
  // This method is now specifically for the 'rules' source, called by its event listener
  loadJsonData(jsonData) {
    // This method is effectively replaced by the event handler for 'stateManager:rawJsonDataLoaded'
    // which directly updates this.contentSources.rules.text and calls _displayCurrentSourceContent.
    // Keeping it for now in case of direct calls, but should be deprecated.
    log('warn', 
      '[EditorUI] loadJsonData is being called. Consider direct update via event if appropriate.'
    );
    if (jsonData === null || typeof jsonData === 'undefined') {
      this.contentSources.rules.text = '';
      this.contentSources.rules.loaded = true;
    } else {
      try {
        this.contentSources.rules.text = JSON.stringify(jsonData, null, 2);
      } catch (error) {
        this.contentSources.rules.text = String(jsonData); // Fallback
      }
      this.contentSources.rules.loaded = true;
    }

    if (this.currentSourceKey === 'rules') {
      this._displayCurrentSourceContent();
    }
  }

  // --- Methods to interact with the editor (textarea) ---
  setContent(newContent) {
    // This method is now less direct. It should ideally specify which source to set,
    // or default to the current one. For now, let's assume it's for the current source.
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

    if (this.contentSources[this.currentSourceKey]) {
      this.contentSources[this.currentSourceKey].text = textToSet;
      if (this.textAreaElement && this.isInitialized) {
        // Check isInitialized
        this._displayCurrentSourceContent();
      }
    } else {
      log('warn', 
        '[EditorUI] setContent called, but currentSourceKey is invalid or contentSources not ready.'
      );
      // Fallback to updating the old this.content if necessary for backward compatibility
      // this.content = { text: textToSet };
      // if (this.textAreaElement) this.textAreaElement.value = textToSet;
    }
  }

  getContent() {
    if (this.textAreaElement) {
      // Update the current source's text from the textarea before returning
      if (this.contentSources[this.currentSourceKey]) {
        this.contentSources[this.currentSourceKey].text =
          this.textAreaElement.value;
        return {
          text: this.contentSources[this.currentSourceKey].text,
          source: this.currentSourceKey,
        };
      }
      // Fallback if currentSourceKey is somehow invalid
      return { text: this.textAreaElement.value, source: 'unknown' };
    }
    // Return stored content if textarea isn't ready, from the current source
    if (this.contentSources[this.currentSourceKey]) {
      return {
        text: this.contentSources[this.currentSourceKey].text,
        source: this.currentSourceKey,
      };
    }
    return { text: '', source: 'unavailable' }; // Default if nothing is available
  }

  _createBaseUI() {
    const html = `
      <div class="editor-panel-container panel-container">
        <div class="editor-header">
          <h2>JSON Editor</h2>
          <div class="editor-controls">
            <select id="editor-source-select">
              <option value="localStorageMode">Mode Data</option>
              <option value="rules">Rules JSON</option>
            </select>
          </div>
        </div>
        <div class="editor-content">
          <textarea id="editor-textarea" spellcheck="false"></textarea>
        </div>
      </div>
    `;
    this.rootElement.innerHTML = html;
  }
}

export default EditorUI;

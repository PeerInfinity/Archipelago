import eventBus from '../../app/core/eventBus.js'; // <<< Import eventBus
// REMOVED: Unnecessary import
// import { setEditorInstance } from './index.js';

class EditorUI {
  constructor(container, componentState) {
    console.log('EditorUI instance created with Textarea');
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
        name: 'Loaded Mode Data (LocalStorage)',
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
      console.log(
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
      console.log(
        'Initializing EditorUI (Textarea)...attempting to populate from global data.'
      );
      this.initializeEditor(); // Creates dropdown and textarea

      // Attempt to populate from global G_combinedModeData if available
      if (window.G_combinedModeData) {
        console.log('[EditorUI] Found window.G_combinedModeData during init.');
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
            console.log(
              '[EditorUI] Populated localStorageMode from window.G_combinedModeData.'
            );
          } catch (e) {
            console.error(
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
            console.log(
              '[EditorUI] Populated rules from window.G_combinedModeData.rulesConfig.'
            );
          } catch (e) {
            console.error(
              '[EditorUI] Error stringifying G_combinedModeData.rulesConfig for rules view:',
              e
            );
            this.contentSources.rules.text =
              'Error: Could not display rules JSON.';
          }
        } else {
          console.warn(
            '[EditorUI] window.G_combinedModeData.rulesConfig not found during init.'
          );
        }

        this._displayCurrentSourceContent(); // Refresh editor view
      } else {
        console.warn(
          '[EditorUI] window.G_combinedModeData NOT found during init. Content will rely on events.'
        );
      }

      this.subscribeToEvents(); // Subscribe to events for future updates
      this.isInitialized = true;
    } else {
      console.log('EditorUI (Textarea) already initialized.');
      if (this.textAreaElement) {
        // If re-opened, ensure current source content is displayed
        this._displayCurrentSourceContent();
      }
    }
  }

  // Subscribe to relevant EventBus events
  subscribeToEvents() {
    if (this.unsubscribeHandles['rulesData']) {
      console.warn(
        'EditorUI already subscribed to rulesData. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['rulesData']();
    }

    console.log("EditorUI subscribing to 'stateManager:rawJsonDataLoaded'");
    this.unsubscribeHandles['rulesData'] = eventBus.subscribe(
      'stateManager:rawJsonDataLoaded',
      (eventData) => {
        if (!eventData || !eventData.rawJsonData) {
          console.warn(
            "EditorUI received invalid payload for 'stateManager:rawJsonDataLoaded'",
            eventData
          );
          this.contentSources.rules.text =
            'Error: Invalid data received for rules.';
          this.contentSources.rules.loaded = true;
        } else {
          console.log(
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
            console.error('Error stringifying rules JSON:', e);
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
      console.warn(
        'EditorUI already subscribed to localStorageData. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['localStorageData']();
    }
    // Placeholder for subscription to full mode data from LocalStorage
    // Your main app init should publish this event after loading from LocalStorage
    console.log("EditorUI subscribing to 'app:fullModeDataLoadedFromStorage'");
    this.unsubscribeHandles['localStorageData'] = eventBus.subscribe(
      'app:fullModeDataLoadedFromStorage', // Event name to be defined and used by app init
      (eventPayload) => {
        if (eventPayload && eventPayload.modeData) {
          console.log(
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
            console.error('Error stringifying localStorage mode JSON:', e);
            this.contentSources.localStorageMode.text =
              'Error: Could not display LocalStorage mode data.';
          }
          this.contentSources.localStorageMode.loaded = true;
        } else {
          console.warn(
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
    console.log('EditorUI unsubscribed from all events.');
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
      console.log(
        'Editor already initialized. Destroying previous instance components.'
      );
      this.destroyEditor(); // Clean up existing editor chrome and textarea
    }
    console.log('Creating editor chrome and <textarea> element...');

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

      console.log('Editor components created and attached successfully.');
    } catch (error) {
      console.error('Failed to initialize Textarea:', error);
      this.rootElement.textContent = 'Error loading Textarea.';
      this.textAreaElement = null;
    }
  }

  _handleSourceChange() {
    const newSourceKey = this.editorDropdown.value;
    if (this.contentSources[newSourceKey]) {
      this.currentSourceKey = newSourceKey;
      console.log(`[EditorUI] Switched to source: ${this.currentSourceKey}`);
      this._displayCurrentSourceContent();
    } else {
      console.warn(
        `[EditorUI] Attempted to switch to unknown source key: ${newSourceKey}`
      );
    }
  }

  _displayCurrentSourceContent() {
    if (!this.textAreaElement) {
      console.warn('[EditorUI] Textarea not available for displaying content.');
      return;
    }
    if (this.contentSources[this.currentSourceKey]) {
      this.textAreaElement.value =
        this.contentSources[this.currentSourceKey].text;
    } else {
      this.textAreaElement.value = 'Error: Selected content source not found.';
    }
  }

  // Called when the panel container is resized
  onPanelResize(width, height) {
    console.log(`EditorUI (Textarea) resized to ${width}x${height}`);
    // Textarea with 100% width/height and flex layout should resize automatically.
    // No specific action needed here unless manual adjustments are required.
  }

  destroyEditor() {
    if (this.textAreaElement) {
      console.log('Destroying <textarea> instance.');
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
    console.log('EditorUI (Textarea) destroyed');
    this.destroyEditor();
    this.unsubscribeFromEvents(); // <<< Unsubscribe on destroy
    this.isInitialized = false;
  }

  // Optional: General cleanup method
  dispose() {
    console.log('Disposing EditorUI (Textarea)...');
    this.onPanelDestroy(); // Call destroy logic
    // Any other cleanup specific to EditorUI itself
  }

  // Method to load JSON data into the editor (textarea)
  // This method is now specifically for the 'rules' source, called by its event listener
  loadJsonData(jsonData) {
    // This method is effectively replaced by the event handler for 'stateManager:rawJsonDataLoaded'
    // which directly updates this.contentSources.rules.text and calls _displayCurrentSourceContent.
    // Keeping it for now in case of direct calls, but should be deprecated.
    console.warn(
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
      console.warn(
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
}

export default EditorUI;

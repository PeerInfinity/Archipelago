import eventBus from '../../app/core/eventBus.js'; // <<< Import eventBus
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

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
      dataForExport: {
        text: '{\n  "message": "No export data loaded yet."\n}',
        loaded: false,
        name: 'Data for Export',
      },
      metaGameJsFile: {
        text: '// No metaGame JavaScript file loaded yet',
        loaded: false,
        name: 'metaGame js file',
      },
      latestSnapshot: {
        text: '{\n  "message": "No snapshot data available yet."\n}',
        loaded: false,
        name: 'Latest Snapshot',
      },
      staticData: {
        text: '{\n  "message": "No static data available yet."\n}',
        loaded: false,
        name: 'Static Data',
      },
      commandQueue: {
        text: '{\n  "message": "No command queue data available yet."\n}',
        loaded: false,
        name: 'Command Queue Status',
      },
    };
    this.currentSourceKey = 'rules'; // Default source
    this.editorDropdown = null;
    this.autoUpdateCheckbox = null;
    this.autoUpdateEnabled = false;

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
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'editor');

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
    , 'editor');

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
    , 'editor');

    // Subscribe to export data events from JSON panel
    if (this.unsubscribeHandles['exportData']) {
      log('warn', 
        'EditorUI already subscribed to exportData. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['exportData']();
    }
    
    log('info', "EditorUI subscribing to 'json:exportToEditor'");
    this.unsubscribeHandles['exportData'] = eventBus.subscribe(
      'json:exportToEditor',
      (eventData) => {
        log('info', '[EditorUI] Received json:exportToEditor event!');
        log('info', '[EditorUI] eventData exists:', !!eventData);
        log('info', '[EditorUI] eventData.data exists:', !!(eventData && eventData.data));
        
        if (!eventData || !eventData.data) {
          log('warn', 
            "EditorUI received invalid payload for 'json:exportToEditor'",
            eventData
          );
          this.contentSources.dataForExport.text = 'Error: Invalid export data received.';
          this.contentSources.dataForExport.loaded = true;
        } else {
          log('info', 
            '[EditorUI] Processing valid export data. Keys in eventData.data:',
            Object.keys(eventData.data)
          );
          log('info', '[EditorUI] eventData.data contains layoutConfig:', !!eventData.data.layoutConfig);
          
          try {
            this.contentSources.dataForExport.text = JSON.stringify(
              eventData.data,
              null,
              2
            );
            this.contentSources.dataForExport.loaded = true;
            
            log('info', '[EditorUI] JSON stringified successfully. Length:', this.contentSources.dataForExport.text.length);
            log('info', '[EditorUI] Stringified text contains "layoutConfig":', this.contentSources.dataForExport.text.includes('layoutConfig'));
            
            // Switch to the export view and activate Editor panel
            this.currentSourceKey = 'dataForExport';
            if (this.editorDropdown) {
              this.editorDropdown.value = 'dataForExport';
              log('info', '[EditorUI] Set dropdown to dataForExport');
            }
            this._displayCurrentSourceContent();
            log('info', '[EditorUI] Called _displayCurrentSourceContent()');
            
            // Activate the Editor panel
            if (eventData.activatePanel !== false) {
              eventBus.publish('ui:activatePanel', { panelId: 'editorPanel' }, 'editor');
              log('info', '[EditorUI] Published ui:activatePanel event');
            }
          } catch (e) {
            log('error', 'Error stringifying export data:', e);
            this.contentSources.dataForExport.text = 'Error: Could not display export data.';
            this.contentSources.dataForExport.loaded = true;
          }
        }
      }
    , 'editor');

    // Subscribe to metaGame JS file content events
    if (this.unsubscribeHandles['metaGameJsFile']) {
      log('warn', 
        'EditorUI already subscribed to metaGameJsFile. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['metaGameJsFile']();
    }
    
    log('info', "EditorUI subscribing to 'metaGame:jsFileContent'");
    this.unsubscribeHandles['metaGameJsFile'] = eventBus.subscribe(
      'metaGame:jsFileContent',
      (eventData) => {
        log('info', '[EditorUI] Received metaGame:jsFileContent event:', eventData);
        
        if (!eventData || !eventData.content) {
          log('warn', 
            "EditorUI received invalid payload for 'metaGame:jsFileContent'",
            eventData
          );
          this.contentSources.metaGameJsFile.text = '// Error: Invalid JS file content received';
          this.contentSources.metaGameJsFile.loaded = true;
        } else {
          log('info', 
            `EditorUI received metaGame JS file content from: ${eventData.filePath || 'unknown'}`
          );
          this.contentSources.metaGameJsFile.text = eventData.content;
          this.contentSources.metaGameJsFile.loaded = true;
          
          // Switch to the metaGame JS file view and activate Editor panel
          this.currentSourceKey = 'metaGameJsFile';
          if (this.editorDropdown) {
            this.editorDropdown.value = 'metaGameJsFile';
            log('info', '[EditorUI] Set dropdown to metaGameJsFile');
          }
          this._displayCurrentSourceContent();
          log('info', '[EditorUI] Called _displayCurrentSourceContent()');
          
          // Activate the Editor panel
          if (eventData.activatePanel !== false) {
            eventBus.publish('ui:activatePanel', { panelId: 'editorPanel' }, 'editor');
            log('info', '[EditorUI] Published ui:activatePanel event');
          }
        }
        
        if (this.currentSourceKey === 'metaGameJsFile') {
          this._displayCurrentSourceContent();
        }
      }
    , 'editor');

    // Subscribe to content request events from other modules
    if (this.unsubscribeHandles['contentRequest']) {
      log('warn', 
        'EditorUI already subscribed to contentRequest. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['contentRequest']();
    }
    
    log('info', "EditorUI subscribing to 'editor:requestContent'");
    this.unsubscribeHandles['contentRequest'] = eventBus.subscribe(
      'editor:requestContent',
      (eventData) => {
        log('info', '[EditorUI] Received content request:', eventData);
        
        // Get current content
        const content = this.getContent();
        
        // If a specific source was requested, check if we're on that source
        if (eventData.requestedSource && eventData.requestedSource !== this.currentSourceKey) {
          log('warn', 
            `[EditorUI] Requested source '${eventData.requestedSource}' but current source is '${this.currentSourceKey}'`
          );
          // Switch to the requested source if it exists
          if (this.contentSources[eventData.requestedSource]) {
            this.currentSourceKey = eventData.requestedSource;
            if (this.editorDropdown) {
              this.editorDropdown.value = eventData.requestedSource;
            }
            this._displayCurrentSourceContent();
            
            // Get content from the newly selected source
            const newContent = this.getContent();
            
            // Respond with the content
            eventBus.publish('editor:contentResponse', {
              ...newContent,
              requestId: eventData.requestId
            }, 'editor');
          } else {
            // Respond with error if requested source doesn't exist
            eventBus.publish('editor:contentResponse', {
              text: '',
              source: 'error',
              error: `Requested source '${eventData.requestedSource}' not found`,
              requestId: eventData.requestId
            }, 'editor');
          }
        } else {
          // Respond with current content
          eventBus.publish('editor:contentResponse', {
            ...content,
            requestId: eventData.requestId
          }, 'editor');
        }
      }
    , 'editor');
    
    // Subscribe to state snapshot updates
    if (this.unsubscribeHandles['snapshotUpdate']) {
      log('warn', 
        'EditorUI already subscribed to snapshotUpdate. Unsubscribing previous first.'
      );
      this.unsubscribeHandles['snapshotUpdate']();
    }
    
    log('info', "EditorUI subscribing to 'stateManager:snapshotUpdated'");
    this.unsubscribeHandles['snapshotUpdate'] = eventBus.subscribe(
      'stateManager:snapshotUpdated',
      (eventData) => {
        log('info', '[EditorUI] Received stateManager:snapshotUpdated event');
        
        if (!eventData || !eventData.snapshot) {
          log('warn', 
            "EditorUI received invalid payload for 'stateManager:snapshotUpdated'",
            eventData
          );
          return;
        }
        
        try {
          // Update the latest snapshot content
          this.contentSources.latestSnapshot.text = JSON.stringify(
            eventData.snapshot,
            null,
            2
          );
          this.contentSources.latestSnapshot.loaded = true;
          
          log('info', '[EditorUI] Updated latest snapshot data');
          
          // If auto-update is enabled and we're viewing the snapshot, update the display
          if (this.autoUpdateEnabled && this.currentSourceKey === 'latestSnapshot') {
            this._displayCurrentSourceContent();
            log('info', '[EditorUI] Auto-updated snapshot display');
          }
        } catch (e) {
          log('error', 'Error processing snapshot data:', e);
          this.contentSources.latestSnapshot.text = 
            'Error: Could not display snapshot data.';
          this.contentSources.latestSnapshot.loaded = true;
        }
      }
    , 'editor');
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
    // eventBus.publish(`editor:contentChanged:${this.currentSourceKey}`, { text: event.target.value }, 'editor');
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
    controlsDiv.style.display = 'flex';
    controlsDiv.style.alignItems = 'center';
    controlsDiv.style.gap = '10px';

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

    // Create auto-update checkbox and label
    const checkboxContainer = document.createElement('div');
    checkboxContainer.style.display = 'flex';
    checkboxContainer.style.alignItems = 'center';
    checkboxContainer.style.gap = '5px';
    
    this.autoUpdateCheckbox = document.createElement('input');
    this.autoUpdateCheckbox.type = 'checkbox';
    this.autoUpdateCheckbox.id = 'editor-auto-update';
    this.autoUpdateCheckbox.checked = this.autoUpdateEnabled;
    this.autoUpdateCheckbox.addEventListener(
      'change',
      this._handleAutoUpdateChange.bind(this)
    );
    
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
    this.updateNowButton.addEventListener(
      'click',
      this._handleUpdateNowClick.bind(this)
    );
    
    // Add hover effect
    this.updateNowButton.addEventListener('mouseenter', () => {
      this.updateNowButton.style.backgroundColor = '#555';
    });
    this.updateNowButton.addEventListener('mouseleave', () => {
      this.updateNowButton.style.backgroundColor = '#444';
    });
    
    controlsDiv.appendChild(this.updateNowButton);

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

      // If switching to Latest Snapshot and it hasn't been loaded yet, fetch current snapshot
      if (newSourceKey === 'latestSnapshot' && !this.contentSources.latestSnapshot.loaded) {
        this._fetchCurrentSnapshot();
      }

      // If switching to Static Data and it hasn't been loaded yet, fetch static data
      if (newSourceKey === 'staticData' && !this.contentSources.staticData.loaded) {
        this._fetchStaticData();
      }

      // If switching to Command Queue and it hasn't been loaded yet, fetch command queue
      if (newSourceKey === 'commandQueue' && !this.contentSources.commandQueue.loaded) {
        this._fetchCommandQueueSnapshot();
      }

      this._displayCurrentSourceContent();
    } else {
      log('warn',
        `[EditorUI] Attempted to switch to unknown source key: ${newSourceKey}`
      );
    }
  }

  _handleAutoUpdateChange() {
    this.autoUpdateEnabled = this.autoUpdateCheckbox.checked;
    log('info', `[EditorUI] Auto-update ${this.autoUpdateEnabled ? 'enabled' : 'disabled'}`);
    
    // If auto-update was just enabled and we're viewing the snapshot, update immediately
    if (this.autoUpdateEnabled && this.currentSourceKey === 'latestSnapshot') {
      if (this.contentSources.latestSnapshot.loaded) {
        this._displayCurrentSourceContent();
        log('info', '[EditorUI] Updated snapshot display after enabling auto-update');
      }
    }
  }

  _fetchCurrentSnapshot() {
    log('info', '[EditorUI] Fetching current snapshot from stateManager');
    
    // Try to get the snapshot from the imported stateManager
    if (stateManager) {
      const snapshot = stateManager.getLatestStateSnapshot();
      
      if (snapshot) {
        try {
          this.contentSources.latestSnapshot.text = JSON.stringify(
            snapshot,
            null,
            2
          );
          this.contentSources.latestSnapshot.loaded = true;
          log('info', '[EditorUI] Successfully fetched and loaded current snapshot');
        } catch (e) {
          log('error', 'Error processing fetched snapshot:', e);
          this.contentSources.latestSnapshot.text = 
            'Error: Could not display snapshot data.';
          this.contentSources.latestSnapshot.loaded = true;
        }
      } else {
        log('warn', '[EditorUI] No snapshot available from stateManager');
        this.contentSources.latestSnapshot.text = 
          '{\n  "message": "No snapshot data available yet. State may not be initialized."\n}';
        this.contentSources.latestSnapshot.loaded = true;
      }
    } else {
      log('warn', '[EditorUI] stateManager not available');
      this.contentSources.latestSnapshot.text = 
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.latestSnapshot.loaded = true;
    }
  }

  _fetchStaticData() {
    log('info', '[EditorUI] Fetching static data from stateManager');

    // Try to get the static data from the imported stateManager
    if (stateManager) {
      const staticData = stateManager.getStaticData();

      if (staticData) {
        try {
          this.contentSources.staticData.text = JSON.stringify(
            staticData,
            null,
            2
          );
          this.contentSources.staticData.loaded = true;
          log('info', '[EditorUI] Successfully fetched and loaded static data');
        } catch (e) {
          log('error', 'Error processing fetched static data:', e);
          this.contentSources.staticData.text =
            'Error: Could not display static data.';
          this.contentSources.staticData.loaded = true;
        }
      } else {
        log('warn', '[EditorUI] No static data available from stateManager');
        this.contentSources.staticData.text =
          '{\n  "message": "No static data available yet. Rules may not be loaded."\n}';
        this.contentSources.staticData.loaded = true;
      }
    } else {
      log('warn', '[EditorUI] stateManager not available');
      this.contentSources.staticData.text =
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.staticData.loaded = true;
    }
  }

  async _fetchCommandQueueSnapshot() {
    log('info', '[EditorUI] Fetching command queue snapshot from stateManager');

    // Try to get the command queue snapshot from the imported stateManager
    if (stateManager) {
      try {
        const queueSnapshot = await stateManager.getWorkerQueueStatus();

        if (queueSnapshot) {
          this.contentSources.commandQueue.text = JSON.stringify(
            queueSnapshot,
            null,
            2
          );
          this.contentSources.commandQueue.loaded = true;
          log('info', '[EditorUI] Successfully fetched and loaded command queue snapshot');
        } else {
          log('warn', '[EditorUI] No command queue data returned');
          this.contentSources.commandQueue.text =
            '{\n  "message": "No command queue data available."\n}';
          this.contentSources.commandQueue.loaded = true;
        }
      } catch (e) {
        log('error', 'Error fetching command queue snapshot:', e);
        this.contentSources.commandQueue.text =
          `{\n  "error": "Failed to fetch command queue: ${e.message}"\n}`;
        this.contentSources.commandQueue.loaded = true;
      }
    } else {
      log('warn', '[EditorUI] stateManager not available');
      this.contentSources.commandQueue.text =
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.commandQueue.loaded = true;
    }
  }

  async _handleUpdateNowClick() {
    log('info', '[EditorUI] Update Now button clicked');

    if (this.currentSourceKey === 'latestSnapshot') {
      this._fetchCurrentSnapshot();
      this._displayCurrentSourceContent();
      log('info', '[EditorUI] Manually updated snapshot display');
    } else if (this.currentSourceKey === 'staticData') {
      this._fetchStaticData();
      this._displayCurrentSourceContent();
      log('info', '[EditorUI] Manually updated static data display');
    } else if (this.currentSourceKey === 'commandQueue') {
      await this._fetchCommandQueueSnapshot();
      this._displayCurrentSourceContent();
      log('info', '[EditorUI] Manually updated command queue display');
    } else {
      log('info', '[EditorUI] Update Now clicked but not viewing dynamic data');
    }
  }

  _displayCurrentSourceContent() {
    log('info', '[EditorUI] _displayCurrentSourceContent called');
    log('info', '[EditorUI] textAreaElement exists:', !!this.textAreaElement);
    log('info', '[EditorUI] currentSourceKey:', this.currentSourceKey);
    
    if (!this.textAreaElement) {
      log('info', '[EditorUI] No textAreaElement, returning early');
      return;
    }

    const source = this.contentSources[this.currentSourceKey];
    log('info', '[EditorUI] source exists:', !!source);
    log('info', '[EditorUI] source loaded:', source ? source.loaded : 'N/A');
    if (source) {
      log('info', '[EditorUI] source text length:', source.text ? source.text.length : 0);
      log('info', '[EditorUI] source text contains "layoutConfig":', source.text ? source.text.includes('layoutConfig') : false);
    }
    
    if (!source) {
      log('warn', 
        `[EditorUI] No content source found for key: ${this.currentSourceKey}`
      );
      return;
    }

    if (!source.loaded) {
      this.textAreaElement.value = 'Loading...';
      log('info', '[EditorUI] Set textarea to "Loading..." because source not loaded');
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
        log('info', '[EditorUI] Set textarea value. Current textarea length:', this.textAreaElement.value.length);
        log('info', '[EditorUI] Textarea contains "layoutConfig":', this.textAreaElement.value.includes('layoutConfig'));
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
    if (this.autoUpdateCheckbox) {
      this.autoUpdateCheckbox.removeEventListener(
        'change',
        this._handleAutoUpdateChange.bind(this)
      );
      this.autoUpdateCheckbox = null;
    }
    if (this.updateNowButton) {
      this.updateNowButton.removeEventListener(
        'click',
        this._handleUpdateNowClick.bind(this)
      );
      this.updateNowButton = null;
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

/**
 * Editor Data Service
 *
 * Manages content sources and event subscriptions for editor modules.
 * This service is shared between different editor UI implementations
 * (textarea, CodeMirror, etc.).
 */

import { getModuleEventBus } from './index.js';
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { EDITOR_EVENTS } from './editorEvents.js';
import { defaultContentSources } from './editorConfig.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('editorDataService', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[editorDataService] ${message}`, ...data);
  }
}

// Custom JSON replacer to handle Maps and Sets for display
function jsonReplacer(key, value) {
  if (value instanceof Map) {
    return Object.fromEntries(value);
  }
  if (value instanceof Set) {
    return Array.from(value);
  }
  return value;
}

/**
 * EditorDataService - Singleton service for managing editor data
 */
class EditorDataService {
  constructor() {
    // Deep clone default content sources
    this.contentSources = JSON.parse(JSON.stringify(defaultContentSources));
    this.currentSourceKey = 'rules';
    this.autoUpdateEnabled = false;
    this.unsubscribeHandles = {};
    this.changeCallbacks = [];
    this.isInitialized = false;
    this.registeredPanelIds = [];

    log('info', 'EditorDataService instance created');
  }

  /**
   * Register an editor panel ID so it can be activated when export data arrives.
   * Each editor UI should call this when it initializes.
   */
  registerPanelId(panelId) {
    if (!this.registeredPanelIds.includes(panelId)) {
      this.registeredPanelIds.push(panelId);
      log('info', `EditorDataService: registered panel ID "${panelId}"`);
    }
  }

  /**
   * Publish ui:activatePanel for every registered editor panel.
   */
  _activateRegisteredPanels() {
    const ids = this.registeredPanelIds.length > 0
      ? this.registeredPanelIds
      : ['editorPanel']; // fallback for backwards-compat if nothing registered yet
    for (const panelId of ids) {
      this.eventBus.publish(EDITOR_EVENTS.ACTIVATE_PANEL, { panelId });
    }
  }

  /**
   * Initialize the service and subscribe to events
   */
  initialize() {
    if (this.isInitialized) {
      log('info', 'EditorDataService already initialized');
      return;
    }

    log('info', 'Initializing EditorDataService...');

    this.eventBus = getModuleEventBus();

    // Attempt to populate from global G_combinedModeData if available
    if (window.G_combinedModeData) {
      log('info', 'Found window.G_combinedModeData during init.');
      this._populateFromGlobalData();
    } else {
      log('warn', 'window.G_combinedModeData NOT found during init. Content will rely on events.');
    }

    this._subscribeToEvents();
    this.isInitialized = true;
    log('info', 'EditorDataService initialized');
  }

  /**
   * Populate content sources from global mode data
   */
  _populateFromGlobalData() {
    // Populate LocalStorage Mode view
    if (window.G_combinedModeData) {
      try {
        this.contentSources.localStorageMode.text = JSON.stringify(
          window.G_combinedModeData,
          null,
          2
        );
        this.contentSources.localStorageMode.loaded = true;
        log('info', 'Populated localStorageMode from window.G_combinedModeData.');
      } catch (e) {
        log('error', 'Error stringifying G_combinedModeData for localStorageMode view:', e);
        this.contentSources.localStorageMode.text = 'Error: Could not display LocalStorage mode data.';
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
        log('info', 'Populated rules from window.G_combinedModeData.rulesConfig.');
      } catch (e) {
        log('error', 'Error stringifying G_combinedModeData.rulesConfig for rules view:', e);
        this.contentSources.rules.text = 'Error: Could not display rules JSON.';
      }
    } else {
      log('warn', 'window.G_combinedModeData.rulesConfig not found during init.');
    }
  }

  /**
   * Subscribe to all relevant EventBus events
   */
  _subscribeToEvents() {
    // Raw JSON data loaded
    this._subscribeToEvent('rulesData', EDITOR_EVENTS.RAW_JSON_LOADED, (eventData) => {
      if (!eventData || !eventData.rawJsonData) {
        log('warn', "Received invalid payload for 'stateManager:rawJsonDataLoaded'", eventData);
        this.contentSources.rules.text = 'Error: Invalid data received for rules.';
        this.contentSources.rules.loaded = true;
      } else {
        log('info', `Received raw rules data from: ${eventData.source || 'unknown'}`);
        try {
          this.contentSources.rules.text = JSON.stringify(eventData.rawJsonData, null, 2);
        } catch (e) {
          log('error', 'Error stringifying rules JSON:', e);
          this.contentSources.rules.text = 'Error: Could not display rules JSON.';
        }
        this.contentSources.rules.loaded = true;
      }
      if (this.currentSourceKey === 'rules') {
        this._notifyContentChanged();
      }
    });

    // Full mode data loaded from storage
    this._subscribeToEvent('localStorageData', EDITOR_EVENTS.MODE_DATA_LOADED, (eventPayload) => {
      if (eventPayload && eventPayload.modeData) {
        log('info', 'Received full mode data from LocalStorage');
        try {
          this.contentSources.localStorageMode.text = JSON.stringify(eventPayload.modeData, null, 2);
        } catch (e) {
          log('error', 'Error stringifying localStorage mode JSON:', e);
          this.contentSources.localStorageMode.text = 'Error: Could not display LocalStorage mode data.';
        }
        this.contentSources.localStorageMode.loaded = true;
      } else {
        log('warn', 'Invalid or empty payload for app:fullModeDataLoadedFromStorage');
        this.contentSources.localStorageMode.text = 'Error: Invalid data received for LocalStorage mode.';
        this.contentSources.localStorageMode.loaded = true;
      }
      if (this.currentSourceKey === 'localStorageMode') {
        this._notifyContentChanged();
      }
    });

    // Export to editor
    this._subscribeToEvent('exportData', EDITOR_EVENTS.EXPORT_TO_EDITOR, (eventData) => {
      log('info', 'Received json:exportToEditor event!');
      if (!eventData || !eventData.data) {
        log('warn', "Received invalid payload for 'json:exportToEditor'", eventData);
        this.contentSources.dataForExport.text = 'Error: Invalid export data received.';
        this.contentSources.dataForExport.loaded = true;
      } else {
        try {
          this.contentSources.dataForExport.text = JSON.stringify(eventData.data, null, 2);
          this.contentSources.dataForExport.loaded = true;
          log('info', 'JSON stringified successfully. Length:', this.contentSources.dataForExport.text.length);

          // Switch to the export view
          this.currentSourceKey = 'dataForExport';
          this._notifyContentChanged();

          // Activate the Editor panel
          if (eventData.activatePanel !== false) {
            this._activateRegisteredPanels();
          }
        } catch (e) {
          log('error', 'Error stringifying export data:', e);
          this.contentSources.dataForExport.text = 'Error: Could not display export data.';
          this.contentSources.dataForExport.loaded = true;
        }
      }
    });

    // MetaGame JS file content
    this._subscribeToEvent('metaGameJsFile', EDITOR_EVENTS.JS_FILE_CONTENT, (eventData) => {
      log('info', 'Received metaGame:jsFileContent event:', eventData);
      if (!eventData || !eventData.content) {
        log('warn', "Received invalid payload for 'metaGame:jsFileContent'", eventData);
        this.contentSources.metaGameJsFile.text = '// Error: Invalid JS file content received';
        this.contentSources.metaGameJsFile.loaded = true;
      } else {
        log('info', `Received metaGame JS file content from: ${eventData.filePath || 'unknown'}`);
        this.contentSources.metaGameJsFile.text = eventData.content;
        this.contentSources.metaGameJsFile.loaded = true;

        // Switch to the metaGame JS file view
        this.currentSourceKey = 'metaGameJsFile';
        this._notifyContentChanged();

        // Activate the Editor panel
        if (eventData.activatePanel !== false) {
          this._activateRegisteredPanels();
        }
      }
    });

    // Content request
    this._subscribeToEvent('contentRequest', EDITOR_EVENTS.REQUEST_CONTENT, (eventData) => {
      log('info', 'Received content request:', eventData);

      // If a specific source was requested, check if we're on that source
      if (eventData.requestedSource && eventData.requestedSource !== this.currentSourceKey) {
        log('warn', `Requested source '${eventData.requestedSource}' but current source is '${this.currentSourceKey}'`);

        // Switch to the requested source if it exists
        if (this.contentSources[eventData.requestedSource]) {
          this.currentSourceKey = eventData.requestedSource;
          this._notifyContentChanged();

          // Get content from the newly selected source
          const newContent = this.getContent();
          this.eventBus.publish(EDITOR_EVENTS.CONTENT_RESPONSE, {
            ...newContent,
            requestId: eventData.requestId,
          });
        } else {
          // Respond with error if requested source doesn't exist
          this.eventBus.publish(EDITOR_EVENTS.CONTENT_RESPONSE, {
            text: '',
            source: 'error',
            error: `Requested source '${eventData.requestedSource}' not found`,
            requestId: eventData.requestId,
          });
        }
      } else {
        // Respond with current content
        const content = this.getContent();
        this.eventBus.publish(EDITOR_EVENTS.CONTENT_RESPONSE, {
          ...content,
          requestId: eventData.requestId,
        });
      }
    });

    // Snapshot updated
    this._subscribeToEvent('snapshotUpdate', EDITOR_EVENTS.SNAPSHOT_UPDATED, (eventData) => {
      log('info', 'Received stateManager:snapshotUpdated event');
      if (!eventData || !eventData.snapshot) {
        log('warn', "Received invalid payload for 'stateManager:snapshotUpdated'", eventData);
        return;
      }

      try {
        this.contentSources.latestSnapshot.text = JSON.stringify(eventData.snapshot, null, 2);
        this.contentSources.latestSnapshot.loaded = true;
        log('info', 'Updated latest snapshot data');

        // If auto-update is enabled and we're viewing the snapshot, update the display
        if (this.autoUpdateEnabled && this.currentSourceKey === 'latestSnapshot') {
          this._notifyContentChanged();
          log('info', 'Auto-updated snapshot display');
        }
      } catch (e) {
        log('error', 'Error processing snapshot data:', e);
        this.contentSources.latestSnapshot.text = 'Error: Could not display snapshot data.';
        this.contentSources.latestSnapshot.loaded = true;
      }
    });
  }

  /**
   * Helper to subscribe to a single event
   */
  _subscribeToEvent(key, eventName, handler) {
    if (this.unsubscribeHandles[key]) {
      log('warn', `Already subscribed to ${key}. Unsubscribing previous first.`);
      this.unsubscribeHandles[key]();
    }
    log('info', `Subscribing to '${eventName}'`);
    this.unsubscribeHandles[key] = this.eventBus.subscribe(eventName, handler);
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribe() {
    for (const key in this.unsubscribeHandles) {
      if (typeof this.unsubscribeHandles[key] === 'function') {
        this.unsubscribeHandles[key]();
      }
    }
    this.unsubscribeHandles = {};
    log('info', 'Unsubscribed from all events.');
  }

  /**
   * Register a callback for content changes
   */
  onContentChanged(callback) {
    if (typeof callback === 'function') {
      this.changeCallbacks.push(callback);
    }
    // Return unsubscribe function
    return () => {
      const index = this.changeCallbacks.indexOf(callback);
      if (index > -1) {
        this.changeCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Notify all registered callbacks of content change
   */
  _notifyContentChanged() {
    const content = this.getContent();
    for (const callback of this.changeCallbacks) {
      try {
        callback(content, this.currentSourceKey);
      } catch (e) {
        log('error', 'Error in content change callback:', e);
      }
    }
  }

  /**
   * Get all content sources
   */
  getContentSources() {
    return this.contentSources;
  }

  /**
   * Get current source key
   */
  getCurrentSourceKey() {
    return this.currentSourceKey;
  }

  /**
   * Set current source key
   */
  setCurrentSourceKey(key) {
    if (this.contentSources[key]) {
      this.currentSourceKey = key;
      log('info', `Switched to source: ${this.currentSourceKey}`);

      // If switching to Latest Snapshot and it hasn't been loaded yet, fetch current snapshot
      if (key === 'latestSnapshot' && !this.contentSources.latestSnapshot.loaded) {
        this.fetchSnapshot();
      }

      // If switching to Static Data and it hasn't been loaded yet, fetch static data
      if (key === 'staticData' && !this.contentSources.staticData.loaded) {
        this.fetchStaticData();
      }

      // If switching to Command Queue and it hasn't been loaded yet, fetch command queue
      if (key === 'commandQueue' && !this.contentSources.commandQueue.loaded) {
        this.fetchCommandQueue();
      }

      this._notifyContentChanged();
    } else {
      log('warn', `Attempted to switch to unknown source key: ${key}`);
    }
  }

  /**
   * Get content for the current or specified source
   */
  getContent(sourceKey = null) {
    const key = sourceKey || this.currentSourceKey;
    if (this.contentSources[key]) {
      return {
        text: this.contentSources[key].text,
        source: key,
        loaded: this.contentSources[key].loaded,
      };
    }
    return { text: '', source: 'unavailable', loaded: false };
  }

  /**
   * Set content for the current or specified source
   */
  setContent(sourceKey, text) {
    if (this.contentSources[sourceKey]) {
      this.contentSources[sourceKey].text = text;
      if (sourceKey === this.currentSourceKey) {
        this._notifyContentChanged();
      }
    } else {
      log('warn', `Attempted to set content for unknown source key: ${sourceKey}`);
    }
  }

  /**
   * Update content from external input (e.g., user typing)
   */
  updateCurrentContent(text) {
    if (this.contentSources[this.currentSourceKey]) {
      this.contentSources[this.currentSourceKey].text = text;
    }
  }

  /**
   * Get auto-update enabled state
   */
  getAutoUpdateEnabled() {
    return this.autoUpdateEnabled;
  }

  /**
   * Set auto-update enabled state
   */
  setAutoUpdateEnabled(enabled) {
    this.autoUpdateEnabled = enabled;
    log('info', `Auto-update ${this.autoUpdateEnabled ? 'enabled' : 'disabled'}`);

    // If auto-update was just enabled and we're viewing the snapshot, update immediately
    if (this.autoUpdateEnabled && this.currentSourceKey === 'latestSnapshot') {
      if (this.contentSources.latestSnapshot.loaded) {
        this._notifyContentChanged();
        log('info', 'Updated snapshot display after enabling auto-update');
      }
    }
  }

  /**
   * Fetch current snapshot from stateManager
   */
  fetchSnapshot() {
    log('info', 'Fetching current snapshot from stateManager');

    if (stateManager) {
      const snapshot = stateManager.getLatestStateSnapshot();

      if (snapshot) {
        try {
          this.contentSources.latestSnapshot.text = JSON.stringify(snapshot, null, 2);
          this.contentSources.latestSnapshot.loaded = true;
          log('info', 'Successfully fetched and loaded current snapshot');
        } catch (e) {
          log('error', 'Error processing fetched snapshot:', e);
          this.contentSources.latestSnapshot.text = 'Error: Could not display snapshot data.';
          this.contentSources.latestSnapshot.loaded = true;
        }
      } else {
        log('warn', 'No snapshot available from stateManager');
        this.contentSources.latestSnapshot.text =
          '{\n  "message": "No snapshot data available yet. State may not be initialized."\n}';
        this.contentSources.latestSnapshot.loaded = true;
      }
    } else {
      log('warn', 'stateManager not available');
      this.contentSources.latestSnapshot.text =
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.latestSnapshot.loaded = true;
    }

    if (this.currentSourceKey === 'latestSnapshot') {
      this._notifyContentChanged();
    }
  }

  /**
   * Fetch static data from stateManager
   */
  fetchStaticData() {
    log('info', 'Fetching static data from stateManager');

    if (stateManager) {
      const staticData = stateManager.getStaticData();

      if (staticData) {
        try {
          this.contentSources.staticData.text = JSON.stringify(staticData, jsonReplacer, 2);
          this.contentSources.staticData.loaded = true;
          log('info', 'Successfully fetched and loaded static data');
        } catch (e) {
          log('error', 'Error processing fetched static data:', e);
          this.contentSources.staticData.text = 'Error: Could not display static data.';
          this.contentSources.staticData.loaded = true;
        }
      } else {
        log('warn', 'No static data available from stateManager');
        this.contentSources.staticData.text =
          '{\n  "message": "No static data available yet. Rules may not be loaded."\n}';
        this.contentSources.staticData.loaded = true;
      }
    } else {
      log('warn', 'stateManager not available');
      this.contentSources.staticData.text =
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.staticData.loaded = true;
    }

    if (this.currentSourceKey === 'staticData') {
      this._notifyContentChanged();
    }
  }

  /**
   * Fetch command queue snapshot from stateManager
   */
  async fetchCommandQueue() {
    log('info', 'Fetching command queue snapshot from stateManager');

    if (stateManager) {
      try {
        const queueSnapshot = await stateManager.getWorkerQueueStatus();

        if (queueSnapshot) {
          this.contentSources.commandQueue.text = JSON.stringify(queueSnapshot, null, 2);
          this.contentSources.commandQueue.loaded = true;
          log('info', 'Successfully fetched and loaded command queue snapshot');
        } else {
          log('warn', 'No command queue data returned');
          this.contentSources.commandQueue.text = '{\n  "message": "No command queue data available."\n}';
          this.contentSources.commandQueue.loaded = true;
        }
      } catch (e) {
        log('error', 'Error fetching command queue snapshot:', e);
        this.contentSources.commandQueue.text = `{\n  "error": "Failed to fetch command queue: ${e.message}"\n}`;
        this.contentSources.commandQueue.loaded = true;
      }
    } else {
      log('warn', 'stateManager not available');
      this.contentSources.commandQueue.text =
        '{\n  "message": "State manager not available. Please wait for initialization."\n}';
      this.contentSources.commandQueue.loaded = true;
    }

    if (this.currentSourceKey === 'commandQueue') {
      this._notifyContentChanged();
    }
  }

  /**
   * Trigger manual update for current source
   */
  async updateNow() {
    log('info', 'Update Now triggered');

    if (this.currentSourceKey === 'latestSnapshot') {
      this.fetchSnapshot();
    } else if (this.currentSourceKey === 'staticData') {
      this.fetchStaticData();
    } else if (this.currentSourceKey === 'commandQueue') {
      await this.fetchCommandQueue();
    } else {
      log('info', 'Update Now called but not viewing dynamic data');
    }
  }

  /**
   * Dispose of the service
   */
  dispose() {
    log('info', 'Disposing EditorDataService...');
    this.unsubscribe();
    this.changeCallbacks = [];
    this.isInitialized = false;
  }
}

// Export singleton instance
export const editorDataService = new EditorDataService();
export default editorDataService;

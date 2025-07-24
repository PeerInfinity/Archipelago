// client/core/messageHandler.js - Updated to handle data package properly

import connection from './connection.js';
import storage from './storage.js';
import Config from './config.js';
import {
  getItemNameFromServerId,
  getLocationNameFromServerId,
  getServerLocationId,
  initializeMappingsFromDataPackage,
  loadMappingsFromStorage,
} from '../utils/idMapping.js';
import { sharedClientState } from './sharedState.js';
import { stateManagerProxySingleton } from '../../stateManager/index.js';
import { getClientModuleDispatcher, moduleInfo } from '../index.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('clientMessageHandler', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[clientMessageHandler] ${message}`, ...data);
  }
}

export class MessageHandler {
  constructor() {
    // Minimal state - only what's needed for server connection
    this.dataPackageVersion = null;
    this.clientSlotName = null;
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

    // Use the imported stateManagerProxySingleton directly
    this.stateManager = stateManagerProxySingleton;
    this.eventBus = null; // Add property for injected eventBus
    this.dispatcher = null; // Added dispatcher property
  }

  // Add method to inject eventBus
  setEventBus(busInstance) {
    log('info', '[MessageHandler] Setting EventBus instance.');
    this.eventBus = busInstance;
    // Now subscribe to connection events *after* eventBus is set
    this._subscribeToConnectionEvents();
  }

  setDispatcher(dispatcherInstance) {
    log('info', '[MessageHandler] Setting Dispatcher instance.');
    this.dispatcher = dispatcherInstance;
  }

  initialize() {
    // Reset core state
    this.dataPackageVersion = null;
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

    // Try to load mappings from local storage
    if (loadMappingsFromStorage()) {
      log('info', 'Successfully loaded mappings from cached data package');
    }

    // Defer subscriptions until eventBus is injected via setEventBus
    // eventBus.subscribe('connection:message', ...);

    log('info', 'MessageHandler module initialized');
  }

  // Separate subscription logic
  _subscribeToConnectionEvents() {
    if (!this.eventBus) {
      log('error', '[MessageHandler] Cannot subscribe: EventBus not set.');
      return;
    }
    log('info', '[MessageHandler] Subscribing to connection events...');
    this.eventBus.subscribe('connection:open', () => {
      this.players = [];
      this.clientSlot = 0;
      this.clientTeam = 0;
    }, 'messageHandler');
    this.eventBus.subscribe('connection:message', (commands) => {
      commands.forEach((command) => this.processMessage(command));
    }, 'messageHandler');
  }

  processMessage(command) {
    switch (command.cmd) {
      case 'RoomInfo':
        this._handleRoomInfo(command);
        break;

      case 'Connected':
        this._handleConnected(command);
        break;

      case 'ConnectionRefused':
        this._handleConnectionRefused(command);
        break;

      case 'ReceivedItems':
        this._handleReceivedItems(command);
        break;

      case 'RoomUpdate':
        this._handleRoomUpdate(command);
        break;

      case 'Print':
        this._handlePrint(command);
        break;

      case 'PrintJSON':
        this._handlePrintJSON(command);
        break;

      case 'DataPackage':
        this._handleDataPackage(command);
        break;

      case 'Bounced':
        // Use injected eventBus
        this.eventBus?.publish('game:bounced', command);
        break;

      default:
        // Use injected eventBus
        this.eventBus?.publish(`game:raw:${command.cmd}`, command);
        break;
    }
  }

  // Get stateManager instance (now returns the proxy directly)
  async _getStateManager() {
    if (!this.stateManager) {
      // This case should ideally not happen if constructor assigns it.
      log('error', '[MessageHandler] stateManager (proxy) not available!');
      // Fallback or re-attempt import if absolutely necessary, but direct import is preferred.
      // For now, let's assume the constructor sets it.
      // To be safe, re-assign if it's somehow null:
      // this.stateManager = stateManagerProxySingleton;
    }
    return this.stateManager;
  }

  // Private message handlers
  _handleRoomInfo(data) {
    // Check if we need to request a new data package
    const needNewDataPackage = this._checkIfDataPackageNeeded(data);

    // Request data package if needed
    if (needNewDataPackage) {
      log('info', 'Requesting new data package from server...');
      this._requestDataPackage();
    }

    // Use injected eventBus
    this.eventBus?.publish('game:roomInfo', data);

    // Prompt for slot name
    this.clientSlotName = prompt('Enter your slot name:', 'Player1');

    // Authenticate with the server
    const connectionData = {
      cmd: 'Connect',
      game: 'A Link to the Past',
      name: this.clientSlotName,
      uuid: this._getClientId(),
      tags: ['JSON Web Client'],
      password: connection.getPassword?.() || null,
      version: Config.PROTOCOL_VERSION,
      items_handling: 0b111,
    };

    connection.send([connectionData]);
  }

  /**
   * Check if we need to request a new data package
   * @param {Object} roomInfo - The RoomInfo data from server
   * @returns {boolean} - Whether a new data package is needed
   */
  _checkIfDataPackageNeeded(roomInfo) {
    // Case 1: No data package in storage
    if (
      !storage.getItem('dataPackage') ||
      !storage.getItem('dataPackageVersion')
    ) {
      return true;
    }

    // Case 2: Checksums don't match
    if (roomInfo.datapackage_checksums) {
      try {
        const storedPackage = JSON.parse(storage.getItem('dataPackage'));

        // Check if any game checksums don't match
        if (storedPackage && storedPackage.games) {
          for (const [gameName, checksum] of Object.entries(
            roomInfo.datapackage_checksums
          )) {
            if (
              !storedPackage.games[gameName] ||
              storedPackage.games[gameName].checksum !== checksum
            ) {
              return true;
            }
          }
        } else {
          return true;
        }
      } catch (e) {
        log('warn', 'Error checking data package checksums:', e);
        return true;
      }
    }

    // Case 3: Version mismatch
    const storedVersion = storage.getItem('dataPackageVersion');
    if (
      roomInfo.datapackage_version &&
      storedVersion !== roomInfo.datapackage_version
    ) {
      return true;
    }

    return false;
  }

  async _handleConnected(data) {
    log('info', '[MessageHandler] _handleConnected called with data:', data);
    
    // Get stateManager
    const stateManager = await this._getStateManager();

    // Store important connection data
    this.clientSlot = data.slot;
    this.clientTeam = data.team;
    this.players = data.players;
    this.missingLocationIds = data.missing_locations || [];
    this.checkedLocationIds = data.checked_locations || [];
    
    // Build reverse mapping: location name -> server protocol ID
    this.serverLocationNameToId = new Map();
    
    // Add missing locations to reverse mapping
    if (data.missing_locations) {
      for (const serverId of data.missing_locations) {
        const locationName = getLocationNameFromServerId(serverId, stateManager);
        if (locationName && locationName !== `Location ${serverId}`) {
          this.serverLocationNameToId.set(locationName, serverId);
        }
      }
    }
    
    // Add checked locations to reverse mapping
    if (data.checked_locations) {
      for (const serverId of data.checked_locations) {
        const locationName = getLocationNameFromServerId(serverId, stateManager);
        if (locationName && locationName !== `Location ${serverId}`) {
          this.serverLocationNameToId.set(locationName, serverId);
        }
      }
    }
    
    log('info', `[MessageHandler] Built server location name->ID mapping with ${this.serverLocationNameToId.size} entries`);

    log('info', '[MessageHandler] Connection established:');
    log('info', '  - Client Slot:', this.clientSlot);
    log('info', '  - Client Team:', this.clientTeam);
    log('info', '  - Players:', this.players);
    log('info', '  - Missing Locations:', data.missing_locations?.length || 0);
    log('info', '  - Checked Locations:', data.checked_locations?.length || 0);
    
    // Use injected eventBus
    this.eventBus?.publish('game:connected', {
      slot: this.clientSlot,
      team: this.clientTeam,
      players: this.players,
      checkedLocations: data.checked_locations || [],
      missingLocations: data.missing_locations || [],
      slotData: data.slot_data || {},
      slotInfo: data.slot_info || [],
    });

    const serverCheckedLocationNames = [];
    if (data.checked_locations && data.checked_locations.length > 0) {
      for (const id of data.checked_locations) {
        const name = getLocationNameFromServerId(id, stateManager);
        if (name && name !== `Location ${id}`) {
          serverCheckedLocationNames.push(name);
        } else {
          log('warn', 
            `[MessageHandler _handleConnected] Could not map server location ID ${id} (from checked_locations) to a known name.`
          );
        }
      }
    }

    const serverUncheckedLocationNames = [];
    if (data.missing_locations && data.missing_locations.length > 0) {
      for (const id of data.missing_locations) {
        const name = getLocationNameFromServerId(id, stateManager);
        if (name && name !== `Location ${id}`) {
          serverUncheckedLocationNames.push(name);
        } else {
          log('warn', 
            `[MessageHandler _handleConnected] Could not map server location ID ${id} (from missing_locations) to a known name.`
          );
        }
      }
    }

    stateManager.applyRuntimeStateData({
      serverCheckedLocationNames: serverCheckedLocationNames,
      serverUncheckedLocationNames: serverUncheckedLocationNames,
    });
  }

  _handleConnectionRefused(data) {
    // Use injected eventBus
    this.eventBus?.publish('network:connectionRefused', data);
    const message = `Connection refused: ${data.errors.join(', ')}`;
    log('error', '[MessageHandler]', message);
    // Publish event instead of directly printing
    this.eventBus?.publish('ui:printToConsole', {
      message: message,
      type: 'error',
    });
  }

  /**
   * Process received items from server, with deduplication
   * @param {Object} data - The ReceivedItems packet from server
   */
  async _handleReceivedItems(data) {
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      log('error', 
        '[MessageHandler _handleReceivedItems] Failed to process received items: stateManager not available'
      );
      return;
    }

    // Skip if we're already processing
    if (sharedClientState.processingBatchItems) {
      log('info', 
        '[MessageHandler _handleReceivedItems] Already processing an item batch, skipping duplicate'
      );
      return;
    }

    // Set processing flag
    sharedClientState.processingBatchItems = true;
    this._logDebug(
      `[MessageHandler _handleReceivedItems] Processing ${data.items.length} items from server`
    );

    const processedItemDetails = []; // Array to hold { itemName, locationNameToMark }

    try {
      // NOTE: Batch update calls are now around the collection and single applyRuntimeStateData call
      await stateManager.beginBatchUpdate(true); // deferRegionComputation = true

      // Process each item from the server to collect details
      for (const item of data.items) {
        let itemName = 'unknown'; // Default for logging in case of issues
        try {
          itemName = getItemNameFromServerId(item.item, stateManager);
          if (!itemName) {
            log('warn', 
              `[MessageHandler _handleReceivedItems] Could not find matching item name for server ID: ${item.item}`
            );
            continue; // Skip this item if name not found
          }

          // Skip if this item was just clicked by the user (to prevent echo processing)
          if (
            sharedClientState.userClickedItems &&
            sharedClientState.userClickedItems.has(itemName)
          ) {
            this._logDebug(
              `[MessageHandler _handleReceivedItems] Skipping server item ${itemName} as it was just clicked by user`
            );
            sharedClientState.userClickedItems.delete(itemName);
            continue;
          }

          const locationNameToMark =
            item.location !== null && typeof item.location !== 'undefined'
              ? getLocationNameFromServerId(item.location, stateManager)
              : null;

          if (
            item.location !== null &&
            typeof item.location !== 'undefined' &&
            !locationNameToMark
          ) {
            this._logDebug(
              `[MessageHandler _handleReceivedItems] Could not map server location ID ${item.location} to a name for item ${itemName}. Item will be added without marking this specific location.`
            );
          }

          processedItemDetails.push({ itemName, locationNameToMark });
          this._logDebug(
            `[MessageHandler _handleReceivedItems] Collected for batch: Item ${itemName}, Location to mark: ${
              locationNameToMark || 'None'
            }`
          );
        } catch (error) {
          // Catch errors from processing a single item (e.g., getting itemName or locationName)
          log('error', 
            `[MessageHandler _handleReceivedItems] Error preparing item ID ${item.item} (current item name context: ${itemName}):`,
            error
          );
        }
      }

      // ReceivedItems is the authoritative message for item additions
      if (processedItemDetails.length > 0) {
        if (data.index === 0) {
          this._logDebug(
            `[MessageHandler _handleReceivedItems] Full inventory sync (index=0): Adding ${processedItemDetails.length} items directly to inventory.`
          );
        } else {
          this._logDebug(
            `[MessageHandler _handleReceivedItems] Incremental items (index=${data.index}): Adding ${processedItemDetails.length} items to inventory.`
          );
        }
        
        // Add all items to inventory
        for (const itemDetail of processedItemDetails) {
          if (itemDetail && itemDetail.itemName) {
            await stateManager.addItemToInventory(itemDetail.itemName, 1);
            this._logDebug(
              `[MessageHandler _handleReceivedItems] Added item: ${itemDetail.itemName}`
            );
          }
        }
      }

      // Commit updates (this will trigger computations and snapshot in StateManager if changes occurred)
      await stateManager.commitBatchUpdate();
    } catch (batchError) {
      // Catch errors related to beginBatchUpdate, commitBatchUpdate, or the applyRuntimeStateData call itself
      log('error', 
        '[MessageHandler _handleReceivedItems] Error during batch processing of received items:',
        batchError
      );
      // It might be prudent to ensure batch processing flag is reset even if commit fails
      // However, the finally block handles this.
    } finally {
      // Always clear the processing flag
      setTimeout(() => {
        sharedClientState.processingBatchItems = false;
      }, 100);
    }

    // Publish notification
    this.eventBus?.publish('game:itemsReceived', {
      index: data.index, // Original index from server packet
      count: data.items.length, // Original count from server packet
      processedCount: processedItemDetails.length, // Actual count of items prepared for StateManager
    });
  }

  _logDebug(message, ...args) {
    // Basic debug logger, can be expanded (e.g., check a debug flag)
    // For now, ensuring it exists if called.
    if (console.debug) {
      console.debug(message, ...args);
    } else {
      // log('info', message, ...args); // Fallback if console.debug is not available
    }
  }

  async _handleRoomUpdate(data) {
    // Get stateManager
    const stateManager = await this._getStateManager();

    // Process location updates directly to stateManager
    if (stateManager && data.checked_locations) {
      await this._syncLocationsFromServer(data.checked_locations);
    }

    // Process player updates if present
    if (data.players) {
      this.players = data.players;
    }

    // Publish the event for UI updates
    this.eventBus?.publish('game:roomUpdate', data);
  }

  _handlePrint(data) {
    // Use injected eventBus
    this.eventBus?.publish('ui:printToConsole', {
      message: data.text,
      type: 'server-message',
    });
  }

  async _handlePrintJSON(data) {
    // PrintJSON is purely for displaying messages to the player
    // Location updates are handled by RoomUpdate, items by ReceivedItems
    
    // Handle PrintJSON messages that contain console text (Join, Tutorial, ItemSend, etc.)
    if (this.eventBus && data.data && Array.isArray(data.data)) {
      // PrintJSON data is an array of structured text objects with type information
      // Forward the raw structured data for proper formatting
      this.eventBus.publish('ui:printFormattedToConsole', {
        messageParts: data.data,
        type: 'server-message',
      }, 'core');
    }
  }

  _handleDataPackage(data) {
    log('info', 'Received data package from server');

    // Save to storage
    if (data.data.version !== 0) {
      storage.setItem('dataPackageVersion', data.data.version);
      storage.setItem('dataPackage', JSON.stringify(data.data));

      // Initialize mappings
      const initSuccess = initializeMappingsFromDataPackage(data.data);
      if (initSuccess) {
        log('info', 'Successfully initialized mappings from new data package');
      } else {
        log('warn', 'Failed to initialize mappings from new data package');
      }
    } else {
      log('warn', 'Received data package with version 0, not storing');
    }

    // Use injected eventBus if needed
    this.eventBus?.publish('game:dataPackageReceived', data.data);
  }

  /**
   * Sync locations from server to stateManager
   * @param {number[]} serverLocationIds - Array of server location IDs
   */
  async _syncLocationsFromServer(serverLocationIds) {
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      log('error', 'Failed to sync locations: stateManager not available');
      return;
    }

    log(
      'info',
      `Syncing ${serverLocationIds.length} checked locations from server to stateManager`
    );

          if (serverLocationIds && serverLocationIds.length > 0) {
        let locationsMarked = 0;
        for (const id of serverLocationIds) {
          const name = getLocationNameFromServerId(id, stateManager);
          if (name && name !== `Location ${id}`) {
            // Mark each location individually using RoomUpdate approach (without adding items)
            await stateManager.checkLocation(name, false);
            locationsMarked++;
          } else {
            log(
              'warn',
              `[MessageHandler _syncLocationsFromServer] Could not map server location ID ${id} to a known name.`
            );
          }
        }
        
        if (locationsMarked > 0) {
          log(
            'info',
            `Location sync complete: Marked ${locationsMarked} locations as checked via RoomUpdate.`
          );
        }
      }
  }

  // Helper methods
  _getClientId() {
    let clientId = storage.getItem('clientId');
    if (!clientId) {
      clientId = (Math.random() * 10000000000000000).toString();
      storage.setItem('clientId', clientId);
    }
    return clientId;
  }

  _requestDataPackage() {
    if (connection.isConnected()) {
      connection.send([
        {
          cmd: 'GetDataPackage',
        },
      ]);
    }
  }

  // Public API methods
  getPlayers() {
    return [...this.players];
  }

  getClientSlot() {
    return this.clientSlot;
  }

  getClientTeam() {
    return this.clientTeam;
  }

  // Access methods that now properly use stateManager
  async getMissingLocations() {
    const stateManager = await this._getStateManager();
    if (!stateManager || !stateManager.missing_locations) {
      return [];
    }

    // Convert stateManager location IDs to server IDs where possible
    const missingIds = [];
    for (const locationId of stateManager.missing_locations) {
      // For missingLocations, the IDs should already be server IDs
      // since they come from the server
      missingIds.push(locationId);
    }

    return missingIds;
  }

  async getCheckedLocations() {
    const stateManager = await this._getStateManager();
    if (!stateManager || !stateManager.checkedLocations) {
      return [];
    }

    // Convert stateManager's checked location names to server IDs
    const checkedIds = [];
    for (const locName of stateManager.checkedLocations) {
      // Find the location in stateManager's locations array
      const location = stateManager.locations.find(
        (loc) => loc.name === locName
      );
      if (location && location.id !== undefined) {
        checkedIds.push(location.id);
      }
    }

    return checkedIds;
  }

  sendLocationChecks(locationIds) {
    if (!connection.isConnected()) {
      return false;
    }

    return connection.send([
      {
        cmd: 'LocationChecks',
        locations: locationIds,
      },
    ]);
  }

  sendMessage(message) {
    if (!connection.isConnected()) {
      return false;
    }

    return connection.send([
      {
        cmd: 'Say',
        text: message,
      },
    ]);
  }

  sendStatusUpdate(status) {
    if (!connection.isConnected()) {
      return false;
    }

    return connection.send([
      {
        cmd: 'StatusUpdate',
        status: status,
      },
    ]);
  }

  async serverSync() {
    if (!connection.isConnected()) {
      return false;
    }

    // Get stateManager
    const stateManager = await this._getStateManager();

    // Reset inventory state in stateManager
    if (stateManager) {
      // Reset inventory state if available
      stateManager.clearInventory?.();
      stateManager.invalidateCache?.();
      stateManager.notifyUI?.('inventoryUpdated');
    }

    // Clear inventory UI before sync
    this.eventBus?.publish('inventory:clear', {});

    return connection.send([{ cmd: 'Sync' }]);
  }

  /**
   * Synchronous version of getItemName for use in console rendering
   * @param {number|string} itemId - Server item ID
   * @returns {string} - Item name or a string with the ID if not found
   */
  getItemNameSync(itemId) {
    if (itemId === null || itemId === undefined) return 'Unknown';

    // Try to get from cache - this avoids async calls
    const itemName = getItemNameFromServerId(itemId, null);
    return itemName;
  }

  /**
   * Synchronous version of getLocationName for use in console rendering
   * @param {number|string} locationId - Server location ID
   * @returns {string} - Location name or a string with the ID if not found
   */
  getLocationNameSync(locationId) {
    if (locationId === null || locationId === undefined) return 'Unknown';

    // Try to get from cache - this avoids async calls
    const locationName = getLocationNameFromServerId(locationId, null);
    return locationName;
  }

  /**
   * Get location name from server location ID - Async version that tries stateManager
   * @param {number|string} locationId - Server location ID
   * @returns {Promise<string>} - Location name or a string with the ID if not found
   */
  async getLocationName(locationId) {
    if (locationId === null || locationId === undefined) return 'Unknown';

    const stateManager = await this._getStateManager();
    if (!stateManager) {
      return this.getLocationNameSync(locationId);
    }

    const locationName = getLocationNameFromServerId(locationId, stateManager);
    return locationName;
  }

  /**
   * Get item name from server item ID - Async version that tries stateManager
   * @param {number|string} itemId - Server item ID
   * @returns {Promise<string>} - Item name or a string with the ID if not found
   */
  async getItemName(itemId) {
    if (itemId === null || itemId === undefined) return 'Unknown';

    const stateManager = await this._getStateManager();
    if (!stateManager) {
      return this.getItemNameSync(itemId);
    }

    const itemName = getItemNameFromServerId(itemId, stateManager);
    return itemName;
  }

  /**
   * Check a location by sending to server and/or updating stateManager
   * Updated to prevent item duplication
   * @param {string|Object} location - Location name or object to check
   * @returns {Promise<boolean>} - Whether successful
   */
  async checkLocation(location) {
    // This method seems to be an old way of checking locations,
    // new logic uses user:locationCheck event and handleUserLocationCheckForClient.
    // It might need to be refactored or removed if fully superseded.
    log('warn', 
      '[MessageHandler] checkLocation method called directly. This might be outdated.'
    );
    
    try {
      let serverId = null;
      const locationName = typeof location === 'string' ? location : location.name;
      
      // First try to get server ID from our server-based mapping (preferred)
      if (this.serverLocationNameToId && this.serverLocationNameToId.has(locationName)) {
        serverId = this.serverLocationNameToId.get(locationName);
        log('info', `[MessageHandler checkLocation] Found server protocol ID ${serverId} for location: ${locationName} (via server mapping)`);
      } else {
        // Fallback to static data mapping (may not work with server)
        serverId = await getServerLocationId(location, this.stateManager);
        log('warn', `[MessageHandler checkLocation] Using static data ID ${serverId} for location: ${locationName} (server mapping not available)`);
      }
      
      if (serverId !== null) {
        // Use the more robust internal method instead of the simple sendLocationChecks
        this._internalSendLocationChecks([serverId]);
        return true;
      } else {
        log('warn', `[MessageHandler checkLocation] Could not find any server ID for location: ${locationName}`);
        return false;
      }
    } catch (error) {
      log('error', `[MessageHandler checkLocation] Error processing location check: ${error.message}`);
      return false;
    }
  }

  // Method used by the exported handler
  _getDispatcher() {
    // This method is a bit of a workaround to ensure the exported function
    // can access the dispatcher instance stored on the singleton.
    // Alternatively, client/index.js could pass the dispatcher to the handler.
    return this.dispatcher;
  }

  // Actual method to send location checks, used by the exported handler
  _internalSendLocationChecks(locationIds) {
    log('info', '[MessageHandler] _internalSendLocationChecks called with IDs:', locationIds);
    log('info', '[MessageHandler] Current clientSlot:', this.clientSlot);
    
    if (!connection.isConnected()) {
      log('warn', 
        '[MessageHandler] Not connected, cannot send location checks.'
      );
      // Use injected eventBus
      this.eventBus?.publish('error:client', {
        type: 'ConnectionError',
        message: 'Not connected to server.',
      });
      return;
    }

    if (locationIds.length === 0) return;

    // Use clientSlot from this instance
    const slot = this.clientSlot;
    if (slot === undefined || slot === null) {
      log('error', 
        '[MessageHandler] Client slot not defined, cannot send location checks. Current value:',
        slot
      );
      return;
    }

    // Check if the location IDs are in the missing locations list
    locationIds.forEach(locationId => {
      const isMissing = this.missingLocationIds?.includes(locationId);
      const isChecked = this.checkedLocationIds?.includes(locationId);
      log('info', `[MessageHandler] Location ${locationId} - Missing: ${isMissing}, Already Checked: ${isChecked}`);
      
      // DEBUG: Add detailed logging to understand the mismatch
      log('info', `[MessageHandler DEBUG] Checking location ID ${locationId} (type: ${typeof locationId})`);
      log('info', `[MessageHandler DEBUG] Missing IDs array length: ${this.missingLocationIds?.length || 0}`);
      log('info', `[MessageHandler DEBUG] First few missing IDs: ${this.missingLocationIds?.slice(0, 5) || 'none'}`);
      log('info', `[MessageHandler DEBUG] Missing IDs include ${locationId}? ${this.missingLocationIds?.includes(locationId)}`);
      log('info', `[MessageHandler DEBUG] Missing IDs include Number(${locationId})? ${this.missingLocationIds?.includes(Number(locationId))}`);
      log('info', `[MessageHandler DEBUG] Missing IDs include String(${locationId})? ${this.missingLocationIds?.includes(String(locationId))}`);
    });

    log('info', '[MessageHandler] Sending LocationChecks command with slot:', slot);
    connection.send([
      {
        cmd: 'LocationChecks',
        locations: locationIds,
      },
    ]);
    log('info', 
      `[MessageHandler] Sent location check for IDs: ${locationIds.join(', ')}`
    );

    // Update shared state for UI feedback (optional)
    sharedClientState.checksSent += locationIds.length;
    // Use injected eventBus
    this.eventBus?.publish('client:checksSentUpdated', {
      count: sharedClientState.checksSent,
    });
  }
}

// Create and export a singleton instance
const messageHandlerSingleton = new MessageHandler();
export default messageHandlerSingleton;

// New handler for user:locationCheck event
export async function handleUserLocationCheckForClient(
  eventData,
  propagationOptions
) {
  log('info', 
    '[MessageHandler] handleUserLocationCheckForClient received event:',
    eventData ? JSON.parse(JSON.stringify(eventData)) : 'undefined',
    'Propagation:',
    propagationOptions ? JSON.parse(JSON.stringify(propagationOptions)) : 'undefined'
  );
  
  // Access the dispatcher from the messageHandlerSingleton, which should have been set during client module initialization
  const dispatcher = messageHandlerSingleton._getDispatcher(); // Use the internal getter for now
  log('info', '[MessageHandler] Dispatcher available:', !!dispatcher);
  log('info', '[MessageHandler] Connection status:', connection.isConnected());

  if (connection.isConnected()) {
    log('info', 
      '[ClientModule/MessageHandler] Handling user:locationCheck while connected.',
      eventData
    );
    if (eventData.locationName) {
      log('info', '[MessageHandler] Getting server ID for location:', eventData.locationName);
      
      let serverId = null;
      const locationName = eventData.locationName;
      
      // First try to get server ID from our server-based mapping (preferred)
      if (messageHandlerSingleton.serverLocationNameToId && messageHandlerSingleton.serverLocationNameToId.has(locationName)) {
        serverId = messageHandlerSingleton.serverLocationNameToId.get(locationName);
        log('info', `[MessageHandler handleUserLocationCheck] Found server protocol ID ${serverId} for location: ${locationName} (via server mapping)`);
      } else {
        // Fallback to static data mapping (may not work with server)
        serverId = await getServerLocationId(
          eventData.locationName,
          stateManagerProxySingleton
        );
        log('warn', `[MessageHandler handleUserLocationCheck] Using static data ID ${serverId} for location: ${locationName} (server mapping not available)`);
      }
      
      log('info', '[MessageHandler] Server ID result:', serverId);
      if (serverId !== null) {
        log('info', '[MessageHandler] About to send location checks for ID:', serverId);
        messageHandlerSingleton._internalSendLocationChecks([serverId]); // Use the internal method
        log('info', '[MessageHandler] Location check command sent');
      } else {
        log('warn', 
          `[ClientModule/MessageHandler] Could not find server ID for location: ${eventData.locationName}`
        );
        // Event was processed (attempted), do not propagate by default unless specific need.
      }
    } else {
      log('info', 
        '[ClientModule/MessageHandler] user:locationCheck received with no specific locationName. Propagating for local handling.'
      );
      if (dispatcher) {
        // Assuming 'client' is the correct module name string for itself
        dispatcher.publishToNextModule(
          moduleInfo.name,
          'user:locationCheck',
          eventData,
          { direction: 'up' }
        );
      } else {
        log('error', 
          '[ClientModule/MessageHandler] Dispatcher not available for propagation when no locationName specified.'
        );
      }
    }
    // Event considered handled (or attempted by client module).
  } else {
    // Not connected, propagate up for potential local handling (e.g., by StateManager).
    log('info', 
      '[ClientModule/MessageHandler] Not connected. Propagating user:locationCheck up.'
    );
    if (dispatcher) {
      dispatcher.publishToNextModule(
        moduleInfo.name,
        'user:locationCheck',
        eventData,
        { direction: 'up' }
      );
    } else {
      log('error', 
        '[ClientModule/MessageHandler] Dispatcher not available for propagation when not connected.'
      );
    }
  }
}

// New handler for user:itemCheck event
export async function handleUserItemCheckForClient(
  eventData,
  propagationOptions
) {
  log('info', 
    '[MessageHandler] handleUserItemCheckForClient received event:',
    eventData ? JSON.parse(JSON.stringify(eventData)) : 'undefined',
    'Propagation:',
    propagationOptions ? JSON.parse(JSON.stringify(propagationOptions)) : 'undefined'
  );
  
  // Access the dispatcher from the messageHandlerSingleton
  const dispatcher = messageHandlerSingleton._getDispatcher();
  log('info', '[MessageHandler] Dispatcher available:', !!dispatcher);
  log('info', '[MessageHandler] Connection status:', connection.isConnected());

  if (connection.isConnected()) {
    log('info', 
      '[ClientModule/MessageHandler] Handling user:itemCheck while connected.',
      eventData
    );
    if (eventData.itemName) {
      log('info', '[MessageHandler] Sending !getitem command for item:', eventData.itemName);
      
      // Send !getitem command to server
      const command = `!getitem ${eventData.itemName}`;
      const success = messageHandlerSingleton.sendMessage(command);
      
      if (success) {
        log('info', '[MessageHandler] Successfully sent !getitem command:', command);
      } else {
        log('warn', '[MessageHandler] Failed to send !getitem command:', command);
      }
    } else {
      log('info', 
        '[ClientModule/MessageHandler] user:itemCheck received with no specific itemName. Propagating for local handling.'
      );
      if (dispatcher) {
        dispatcher.publishToNextModule(
          moduleInfo.name,
          'user:itemCheck',
          eventData,
          { direction: 'up' }
        );
      } else {
        log('error', 
          '[ClientModule/MessageHandler] Dispatcher not available for propagation when no itemName specified.'
        );
      }
    }
    // Event considered handled (or attempted by client module).
  } else {
    // Not connected, propagate up for potential local handling (e.g., by StateManager).
    log('info', 
      '[ClientModule/MessageHandler] Not connected. Propagating user:itemCheck up.'
    );
    if (dispatcher) {
      dispatcher.publishToNextModule(
        moduleInfo.name,
        'user:itemCheck',
        eventData,
        { direction: 'up' }
      );
    } else {
      log('error', 
        '[ClientModule/MessageHandler] Dispatcher not available for propagation when not connected.'
      );
    }
  }
}

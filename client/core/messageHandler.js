// client/core/messageHandler.js - Updated to handle data package properly

import eventBus from '../../app/core/eventBus.js';
import connection from './connection.js';
import storage from './storage.js';
import Config from './config.js';
import {
  getItemNameFromServerId,
  getLocationNameFromServerId,
  initializeMappingsFromDataPackage,
  loadMappingsFromStorage,
} from '../utils/idMapping.js';

export class MessageHandler {
  constructor() {
    // Minimal state - only what's needed for server connection
    this.dataPackageVersion = null;
    this.clientSlotName = null;
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

    // Cache for stateManager instance
    this.stateManager = null;

    // Subscribe to connection events
    eventBus.subscribe('connection:open', () => {
      // Clear caches when connection opens
      this.players = [];
      this.clientSlot = 0;
      this.clientTeam = 0;
    });
  }

  initialize() {
    // Reset core state
    this.dataPackageVersion = null;
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

    // Try to load mappings from local storage
    if (loadMappingsFromStorage()) {
      console.log('Successfully loaded mappings from cached data package');
    }

    // Subscribe to connection messages
    eventBus.subscribe('connection:message', (commands) => {
      commands.forEach((command) => this.processMessage(command));
    });

    console.log('MessageHandler module initialized');
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
        // Pass directly to event system
        eventBus.publish('game:bounced', command);
        break;

      default:
        // Unhandled events are published as raw events
        eventBus.publish(`game:raw:${command.cmd}`, command);
        break;
    }
  }

  // Get stateManager instance dynamically
  async _getStateManager() {
    if (this.stateManager) {
      return this.stateManager;
    }

    try {
      const module = await import('../../app/core/stateManagerSingleton.js');
      this.stateManager = module.default;
      return this.stateManager;
    } catch (error) {
      console.error('Error loading stateManager:', error);
      return null;
    }
  }

  // Private message handlers
  _handleRoomInfo(data) {
    // Check if we need to request a new data package
    const needNewDataPackage = this._checkIfDataPackageNeeded(data);

    // Request data package if needed
    if (needNewDataPackage) {
      console.log('Requesting new data package from server...');
      this._requestDataPackage();
    }

    // Notify UI of room info
    eventBus.publish('game:roomInfo', data);

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
        console.warn('Error checking data package checksums:', e);
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
    // Store connection data
    this.clientTeam = data.team;
    this.clientSlot = data.slot;
    this.players = data.players;

    // Get stateManager
    const stateManager = await this._getStateManager();
    if (stateManager) {
      // Initialize stateManager's server-related fields
      stateManager.team = this.clientTeam;
      stateManager.slot = this.clientSlot;

      // Process locations
      if (data.checked_locations && data.checked_locations.length > 0) {
        await this._syncLocationsFromServer(data.checked_locations);
      }

      // Update missing locations in stateManager
      if (data.missing_locations) {
        stateManager.missing_locations = new Set(data.missing_locations);
        stateManager.invalidateCache();
      }
    }

    // Publish connected event with essential data
    eventBus.publish('game:connected', {
      slot: this.clientSlot,
      team: this.clientTeam,
      players: this.players,
      checkedLocations: data.checked_locations,
      missingLocations: data.missing_locations,
    });
  }

  _handleConnectionRefused(data) {
    eventBus.publish('connection:refused', data);
  }

  /**
   * Process received items from server, with deduplication
   * @param {Object} data - The ReceivedItems packet from server
   */
  async _handleReceivedItems(data) {
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      console.error(
        'Failed to process received items: stateManager not available'
      );
      return;
    }

    // Skip if we're already processing
    if (window._processingBatchItems) {
      console.log('Already processing an item batch, skipping duplicate');
      return;
    }

    // Set processing flag
    window._processingBatchItems = true;
    console.log(`Processing ${data.items.length} items from server`);

    try {
      // Batch update for better performance
      stateManager.beginBatchUpdate(true);

      // Process each item from the server
      for (const item of data.items) {
        try {
          // Get item name
          const itemName = getItemNameFromServerId(item.item, stateManager);
          if (!itemName) {
            console.warn(
              `Could not find matching item for server ID: ${item.item}`
            );
            continue;
          }

          // Skip if this item was just clicked by the user
          if (
            window._userClickedItems &&
            window._userClickedItems.has(itemName)
          ) {
            console.log(
              `Skipping server item ${itemName} as it was just clicked by user`
            );
            window._userClickedItems.delete(itemName);
            continue;
          }

          // Add the item to inventory - this is the ONLY place networked items are added
          console.log(`Adding item from server: ${itemName}`);
          stateManager.addItemToInventory(itemName);

          // Mark location as checked if needed
          try {
            const locationName = getLocationNameFromServerId(
              item.location,
              stateManager
            );
            if (locationName && !stateManager.isLocationChecked(locationName)) {
              stateManager.checkLocation(locationName);
            }
          } catch (err) {
            console.warn(`Failed to mark location for item ${itemName}`);
          }
        } catch (error) {
          console.error(`Error processing item ${item.item}:`, error);
        }
      }

      // Commit updates
      stateManager.commitBatchUpdate();
      stateManager.notifyUI('inventoryChanged');
      stateManager.notifyUI('locationChecked');
    } finally {
      // Always clear the processing flag
      setTimeout(() => {
        window._processingBatchItems = false;
      }, 100);
    }

    // Publish notification
    eventBus.publish('game:itemsReceived', {
      index: data.index,
      count: data.items.length,
    });
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
    eventBus.publish('game:roomUpdate', data);
  }

  _handlePrint(data) {
    eventBus.publish('console:message', data.text);
  }

  async _handlePrintJSON(data) {
    // Get stateManager
    const stateManager = await this._getStateManager();

    // Flag to track if we need to update the progress UI
    let shouldUpdateProgress = false;

    // Handle item/location data in PrintJSON
    if (stateManager && data.type === 'ItemSend' && data.item) {
      // For ItemSend type messages, we'll ONLY mark the location as checked,
      // but NOT add the item since ReceivedItems will handle that part

      // Mark location as checked if we have a location ID
      const locationId = data.item?.location;
      if (locationId !== null && locationId !== undefined) {
        const locationName = getLocationNameFromServerId(
          locationId,
          stateManager
        );
        if (locationName && !stateManager.isLocationChecked(locationName)) {
          stateManager.checkLocation(locationName);
          stateManager.invalidateCache();
          stateManager.notifyUI('locationChecked');
          shouldUpdateProgress = true;
        }
      }

      // REMOVED: Code that adds items from PrintJSON messages
      // since ReceivedItems will handle that responsibility
    }

    // Forward to UI
    eventBus.publish('console:formattedMessage', data.data);

    // Emit a special event for PrintJSON processing that ProgressUI can listen for
    if (shouldUpdateProgress) {
      eventBus.publish('messageHandler:printJSONProcessed', {
        type: data.type,
      });
    }
  }

  _handleDataPackage(data) {
    console.log('Received data package from server');

    // Save to storage
    if (data.data.version !== 0) {
      storage.setItem('dataPackageVersion', data.data.version);
      storage.setItem('dataPackage', JSON.stringify(data.data));

      // Initialize mappings
      const initSuccess = initializeMappingsFromDataPackage(data.data);
      if (initSuccess) {
        console.log('Successfully initialized mappings from new data package');
      } else {
        console.warn('Failed to initialize mappings from new data package');
      }
    } else {
      console.warn('Received data package with version 0, not storing');
    }

    // Publish event immediately so UI can update
    eventBus.publish('game:dataPackageReceived', data.data);
  }

  /**
   * Sync locations from server to stateManager
   * @param {number[]} serverLocationIds - Array of server location IDs
   */
  async _syncLocationsFromServer(serverLocationIds) {
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      console.error('Failed to sync locations: stateManager not available');
      return;
    }

    console.log(
      `Syncing ${serverLocationIds.length} checked locations from server to stateManager`
    );

    let syncCount = 0;
    let failCount = 0;

    // Process each location ID from the server using direct ID matching
    for (const serverLocationId of serverLocationIds) {
      // Convert both IDs to numbers for consistent comparison
      const numericServerId = Number(serverLocationId);

      // Find location with matching ID
      const location = stateManager.locations.find(
        (loc) => Number(loc.id) === numericServerId
      );

      if (location) {
        // Mark as checked if not already
        if (!stateManager.isLocationChecked(location.name)) {
          stateManager.checkLocation(location.name);
          syncCount++;
        }
      } else {
        failCount++;
      }
    }

    console.log(
      `Location sync complete: ${syncCount} synced, ${failCount} failed`
    );

    // Invalidate cache to update UI
    stateManager.invalidateCache();
    stateManager.notifyUI('reachableRegionsComputed');
    stateManager.notifyUI('locationChecked');
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
    eventBus.publish('inventory:clear', {});

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
   * @param {Object} location - Location object to check
   * @returns {Promise<boolean>} - Whether successful
   */
  async checkLocation(location) {
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      console.error('Failed to check location: stateManager not available');
      return false;
    }

    // Case 1: If given a location ID directly, find the location object
    if (typeof location === 'number' || typeof location === 'string') {
      const locationId = Number(location);
      const locationObj = stateManager.locations.find(
        (loc) => Number(loc.id) === locationId
      );

      if (locationObj) {
        return this.checkLocation(locationObj); // Recursive call with the location object
      } else {
        console.warn(`Location with ID ${locationId} not found`);
        return false;
      }
    }

    // Check if location is already marked as checked to prevent duplicate processing
    if (stateManager.isLocationChecked(location.name)) {
      console.log(`Location ${location.name} already checked, skipping`);
      return true;
    }

    // Case 2: Handle locations with null ID (local-only events)
    if (location.id === null || location.id === undefined) {
      console.log(`Processing local-only location: ${location.name}`);

      // Mark location as checked locally
      stateManager.checkLocation(location.name);

      // If it's an event location with an item, add the item to inventory
      if (location.item) {
        console.log(
          `Local event location contains item: ${location.item.name}`
        );
        stateManager.addItemToInventory(location.item.name);

        // Process event in state if applicable
        if (
          stateManager.state &&
          typeof stateManager.state.processEventItem === 'function'
        ) {
          stateManager.state.processEventItem(location.item.name);
        }
      }

      // Update state and UI
      stateManager.invalidateCache();
      stateManager.notifyUI('locationChecked');
      stateManager.notifyUI('inventoryChanged');

      return true;
    }

    // Case 3: Regular location with valid ID
    console.log(`Processing networked location: ${location.name}`);

    // Mark the location as checked locally
    stateManager.checkLocation(location.name);

    // Add this location ID to a temporary tracking set to avoid duplicate processing
    if (!window._pendingLocationChecks) {
      window._pendingLocationChecks = new Set();
    }
    window._pendingLocationChecks.add(location.id);

    // Set a timeout to remove from pending set (in case server never responds)
    setTimeout(() => {
      if (window._pendingLocationChecks) {
        window._pendingLocationChecks.delete(location.id);
      }
    }, 10000); // 10 second timeout

    // Send to server if connected
    if (connection.isConnected()) {
      this.sendLocationChecks([location.id]);
    } else {
      console.log('OFFLINE MODE: Processing networked location locally');
      // Add the item locally when offline
      if (location.item) {
        console.log(`Adding item locally: ${location.item.name}`);
        stateManager.addItemToInventory(location.item.name);
        stateManager.notifyUI('inventoryChanged');
      }
    }

    // Update state and UI
    stateManager.invalidateCache();
    stateManager.notifyUI('locationChecked');

    return true;
  }
}

// Create and export a singleton instance
export const messageHandler = new MessageHandler();
export default messageHandler;

// client/core/messageHandler.js
import eventBus from './eventBus.js';
import connection from './connection.js';
import storage from './storage.js';
import Config from './config.js';

export class MessageHandler {
  constructor() {
    // Private variables
    this.dataPackageVersion = null;
    this.itemsReceived = [];
    this.checkedLocations = [];
    this.missingLocations = [];
    this.clientSlotName = null;
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

    // Private mapping tables
    this.apItemsById = {};
    this.apLocationsById = {};
    this.ootLocationsByName = {};
  }

  initialize() {
    // Reset state
    this.dataPackageVersion = null;
    this.itemsReceived = [];
    this.checkedLocations = [];
    this.missingLocations = [];
    this.clientSlot = null;
    this.clientTeam = null;
    this.players = [];

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
        // Nothing to see here, move along
        eventBus.publish('game:roomUpdate', command);
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
        // This command can be used for a variety of things
        eventBus.publish('game:bounced', command);
        break;

      default:
        // Unhandled events are published as raw events
        eventBus.publish(`game:raw:${command.cmd}`, command);
        break;
    }
  }

  // Private handlers
  _handleRoomInfo(data) {
    // Check if we need to request a new data package
    if (
      !storage.getItem('dataPackageVersion') ||
      !storage.getItem('dataPackage') ||
      data.datapackage_version !== storage.getItem('dataPackageVersion')
    ) {
      this._requestDataPackage();
    } else {
      // Load the location and item maps into memory
      this._buildItemAndLocationData(
        JSON.parse(storage.getItem('dataPackage'))
      );
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
      tags: ['ArchipIDLE'],
      password: connection.getPassword?.() || null,
      version: Config.PROTOCOL_VERSION,
      items_handling: 0b001,
    };

    connection.send([connectionData]);
  }

  _handleConnected(data) {
    // Store the reported location check data from the server
    this.checkedLocations = data.checked_locations;
    this.missingLocations = data.missing_locations;

    // Save the list of players provided by the server
    this.players = data.players;

    // Save information about the current player
    this.clientTeam = data.team;
    this.clientSlot = data.slot;

    // Publish connected event
    eventBus.publish('game:connected', {
      slot: this.clientSlot,
      team: this.clientTeam,
      players: this.players,
      checkedLocations: this.checkedLocations,
      missingLocations: this.missingLocations,
    });
  }

  _handleConnectionRefused(data) {
    eventBus.publish('connection:refused', data);
  }

  _handleReceivedItems(data) {
    // Handle received items
    data.items.forEach((item) => {
      // Ignore items in this packet if it is the result of a reconnection, unless the item
      // is the GeoCities item, because the user deserves to revisit the year 2001.
      if (data.items.length > 5 && data.index === 0 && item.item !== 9000) {
        return;
      }

      eventBus.publish('game:itemReceived', item);
    });
  }

  _handleDataPackage(data) {
    // Save updated location and item maps into localStorage
    if (data.data.version !== 0) {
      // Unless this is a custom package, denoted by version zero
      storage.setItem('dataPackageVersion', data.data.version);
      storage.setItem('dataPackage', JSON.stringify(data.data));
    }

    this._buildItemAndLocationData(data.data);
    eventBus.publish('game:dataPackageReceived', data.data);
  }

  _handlePrint(data) {
    eventBus.publish('console:message', data.text);
  }

  _handlePrintJSON(data) {
    eventBus.publish('console:formattedMessage', data.data);
  }

  // Private helper methods
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

  _buildItemAndLocationData(dataPackage) {
    // Reset mappings
    this.apItemsById = {};
    this.apLocationsById = {};
    this.ootLocationsByName = {};

    // Build mappings from data package
    Object.values(dataPackage.games).forEach((game) => {
      Object.keys(game.item_name_to_id).forEach((item) => {
        this.apItemsById[game.item_name_to_id[item]] = item;
      });

      Object.keys(game.location_name_to_id).forEach((location) => {
        this.apLocationsById[game.location_name_to_id[location]] = location;
      });
    });

    // Special handling for OoT locations
    if (dataPackage.games['Ocarina of Time']) {
      this.ootLocationsByName =
        dataPackage.games['Ocarina of Time'].location_name_to_id;
    }

    // Make mapping accessible via public API
    eventBus.publish('game:mappingsUpdated', {
      items: this.apItemsById,
      locations: this.apLocationsById,
    });
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

  getCheckedLocations() {
    return [...this.checkedLocations];
  }

  getMissingLocations() {
    return [...this.missingLocations];
  }

  getItemName(itemId) {
    return this.apItemsById[itemId] || `Unknown Item (${itemId})`;
  }

  getLocationName(locationId) {
    return (
      this.apLocationsById[locationId] || `Unknown Location (${locationId})`
    );
  }

  sendLocationChecks(locationIds) {
    if (!connection.isConnected()) {
      return false;
    }

    // Update local state
    locationIds.forEach((id) => {
      if (!this.checkedLocations.includes(id)) {
        this.checkedLocations.push(id);
      }
    });

    // Send to server
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

  serverSync() {
    if (!connection.isConnected()) {
      return false;
    }

    return connection.send([{ cmd: 'Sync' }]);
  }
}

// Create and export a singleton instance
export const messageHandler = new MessageHandler();

// Also export as default for convenience
export default messageHandler;

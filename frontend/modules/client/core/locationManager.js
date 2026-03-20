// client/core/locationManager.js - Updated to handle null ID locations locally

import connection from './connection.js';
import messageHandler from './messageHandler.js';
import { getServerLocationId } from '../utils/idMapping.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('locationManager', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[locationManager] ${message}`, ...data);
  }
}

export class LocationManager {
  static stateManager = null;
  static eventBus = null; // Add property for injected eventBus
  static unsubscribeHandles = []; // For cleanup

  /**
   * Get the stateManager instance dynamically
   * @returns {Promise<Object>} - The stateManager instance or null
   */
  static async _getStateManager() {
    if (this.stateManager) {
      return this.stateManager;
    }

    try {
      const module = await import(
        '../../stateManager/stateManagerSingleton.js'
      );
      this.stateManager = module.default;
      return this.stateManager;
    } catch (error) {
      log('error', 'Error loading stateManager:', error);
      return null;
    }
  }

  // Method to inject eventBus
  static setEventBus(busInstance) {
    log('info', '[LocationManager] Setting EventBus instance.');
    this.eventBus = busInstance;
    this._subscribeToEvents(); // Subscribe after bus is set
  }

  static initialize() {
    log('info', 'LocationManager module initialized');
    // Defer subscriptions until eventBus is injected
  }

  // Separate subscription logic
  static _subscribeToEvents() {
    if (!this.eventBus) {
      log('error', '[LocationManager] Cannot subscribe: EventBus not set.');
      return;
    }
    // Clear existing handles
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];

    log('info', '[LocationManager] Subscribing to events...');
    const subscribe = (eventName, handler) => {
      const unsub = this.eventBus.subscribe(eventName, handler);
      this.unsubscribeHandles.push(unsub);
    };

    subscribe('game:connected', () => {
      // Use injected eventBus
      this.eventBus?.publish('locations:updated', {});
    });
    // Add other subscriptions if needed
  }

  // Add a cleanup method
  static dispose() {
    log('info', '[LocationManager] Disposing...');
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];
    this.eventBus = null; // Clear reference
    this.stateManager = null; // Clear stateManager cache
  }

  static async getCheckedLocations() {
    // Get the checked locations from stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager || !stateManager.checkedLocations) {
      return [];
    }

    // Convert to array of IDs
    const checkedIds = [];
    for (const locName of stateManager.checkedLocations) {
      // Find the location in locations array
      const location = stateManager.locations.find(
        (loc) => loc.name === locName
      );
      // Only include locations with valid IDs
      if (location && location.id !== null && location.id !== undefined) {
        checkedIds.push(location.id);
      }
    }

    return checkedIds;
  }

  static async getMissingLocations() {
    // Get the missing locations from stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager || !stateManager.missing_locations) {
      return [];
    }

    // Missing locations should already be IDs from the server
    return Array.from(stateManager.missing_locations);
  }

  static async markLocationChecked(locationId) {
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      log('error', 'Cannot mark location checked: stateManager not available');
      return false;
    }

    // Find location in locations array
    const location = stateManager.locations.find(
      (loc) => Number(loc.id) === Number(locationId)
    );
    if (location) {
      stateManager.checkLocation(location.name);
      stateManager.invalidateCache();
      stateManager.notifyUI('locationChecked');
      return true;
    }

    log('warn', `Location with ID ${locationId} not found`);
    return false;
  }

  static async checkLocation(location) {
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      log('error', 'Failed to check location: stateManager not available');
      return false;
    }

    // Check if location is already marked as checked
    if (stateManager.isLocationChecked(location.name)) {
      log('info', `Location ${location.name} already checked, skipping`);
      return true;
    }

    // CASE 1: Handle local-only locations (null ID)
    if (location.id === null || location.id === undefined) {
      log('info', `Processing local-only location: ${location.name}`);

      // Mark location as checked
      stateManager.checkLocation(location.name);

      // If it has an item, add it to inventory
      if (location.item) {
        log('info', 
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

      // Update UI
      stateManager.invalidateCache();
      stateManager.notifyUI('locationChecked');
      stateManager.notifyUI('inventoryChanged');

      return true;
    }

    // CASE 2: Networked locations - ONLY mark checked, don't add items
    log('info', `Processing networked location: ${location.name}`);

    // Mark the location as checked locally
    stateManager.checkLocation(location.name);

    // Send to server if connected - server will send back the item
    if (connection.isConnected()) {
      log('info', `Sending location check to server: ${location.id}`);
      messageHandler.sendLocationChecks([location.id]);
    } else {
      log('info', 'Not connected to server');
      // In offline mode, we would handle the item locally here
    }

    // Update UI for the checked location
    stateManager.invalidateCache();
    stateManager.notifyUI('locationChecked');

    return true;
  }

  static async checkQuickLocation() {
    // Delegate to gameState
    try {
      const gameStateModule = await import('./timerState.js');
      const gameState = gameStateModule.gameState;
      if (gameState && typeof gameState.checkQuickLocation === 'function') {
        return gameState.checkQuickLocation();
      }
    } catch (error) {
      log('error', 'Error calling checkQuickLocation:', error);
    }

    return false;
  }

  static async getRemainingLocationsCount() {
    const stateManager = await this._getStateManager();
    return stateManager?.missing_locations?.size || 0;
  }

  static async getCompletedLocationsCount() {
    const stateManager = await this._getStateManager();
    return stateManager?.checkedLocations?.size || 0;
  }

  static async getTotalLocationsCount() {
    const checkedCount = await this.getCompletedLocationsCount();
    const missingCount = await this.getRemainingLocationsCount();
    return checkedCount + missingCount;
  }
}

// Export as both class and default
export default LocationManager;

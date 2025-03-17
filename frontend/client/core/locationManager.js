// client/core/locationManager.js
import eventBus from './eventBus.js';
import messageHandler from './messageHandler.js';

export class LocationManager {
  constructor() {
    // Private variables
    this.checkedLocations = [];
    this.missingLocations = [];
  }

  initialize() {
    // Register for game connected event
    eventBus.subscribe('game:connected', () => {
      this._updateLocationsFromMessageHandler();
    });

    console.log('LocationManager module initialized');
  }

  // Private helper function
  _updateLocationsFromMessageHandler() {
    this.checkedLocations = messageHandler.getCheckedLocations();
    this.missingLocations = messageHandler.getMissingLocations();
  }

  // Public API
  getCheckedLocations() {
    return [...this.checkedLocations];
  }

  getMissingLocations() {
    return [...this.missingLocations];
  }

  markLocationChecked(locationId) {
    if (!this.checkedLocations.includes(locationId)) {
      this.checkedLocations.push(locationId);

      // Remove from missing locations if present
      const missingIndex = this.missingLocations.indexOf(locationId);
      if (missingIndex > -1) {
        this.missingLocations.splice(missingIndex, 1);
      }

      // Notify about the change
      eventBus.publish('game:locationChecked', { location: locationId });
    }
  }

  checkLocation(locationId) {
    if (!this.checkedLocations.includes(locationId)) {
      messageHandler.sendLocationChecks([locationId]);
      this.markLocationChecked(locationId);
      return true;
    }
    return false;
  }

  checkQuickLocation() {
    if (this.missingLocations.length > 0) {
      const locationId = this.missingLocations[0];
      return this.checkLocation(locationId);
    }
    return false;
  }

  getRemainingLocationsCount() {
    return this.missingLocations.length;
  }

  getCompletedLocationsCount() {
    return this.checkedLocations.length;
  }

  getTotalLocationsCount() {
    return this.checkedLocations.length + this.missingLocations.length;
  }
}

// Create and export a singleton instance
export const locationManager = new LocationManager();

// Export as default for convenience
export default locationManager;

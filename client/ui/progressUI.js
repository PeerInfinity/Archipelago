// client/ui/progressUI.js - Modified to work directly with stateManager
import eventBus from '../../app/core/eventBus.js';
import locationManager from '../core/locationManager.js';
import timerState from '../core/timerState.js';
import loopState from '../../app/core/loop/loopState.js';

export class ProgressUI {
  static progressBar = null;
  static checksCounter = null;
  static controlButton = null;
  static quickCheckButton = null;
  static stateManager = null;
  static isLoopModeActive = false; // Track loop mode state

  /**
   * Get the stateManager instance dynamically
   * @returns {Promise<Object>} - The stateManager instance or null
   */
  static async _getStateManager() {
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

  static async initialize() {
    // Get UI elements
    this.progressBar = document.getElementById('progress-bar');
    this.checksCounter = document.getElementById('checks-sent');
    this.controlButton = document.getElementById('control-button');
    this.quickCheckButton = document.getElementById('quick-check-button');

    if (!this.progressBar || !this.checksCounter) {
      console.error('Progress UI elements not found');
      return;
    }

    // Reset UI state
    this.progressBar.setAttribute('value', '0');
    this.checksCounter.innerText =
      'Checked: 0/0, Reachable: 0, Unreachable: 0, Events: 0/0';

    if (this.controlButton) {
      this.controlButton.setAttribute('disabled', 'disabled');

      // Remove any existing event listeners to prevent duplicates
      this.controlButton.replaceWith(this.controlButton.cloneNode(true));

      // Get fresh reference after replacement
      this.controlButton = document.getElementById('control-button');

      // Add click event listener with proper toggle logic
      this.controlButton.addEventListener('click', (event) => {
        event.preventDefault();
        console.log(
          'Control button clicked, running state:',
          timerState.isRunning()
        );

        if (timerState.isRunning()) {
          console.log('Stopping timer...');
          timerState.stop();
        } else {
          console.log('Starting timer...');
          timerState.begin();
        }
      });
    }

    if (this.quickCheckButton) {
      this.quickCheckButton.setAttribute('disabled', 'disabled');

      // Remove any existing event listeners to prevent duplicates
      this.quickCheckButton.replaceWith(this.quickCheckButton.cloneNode(true));

      // Get fresh reference after replacement
      this.quickCheckButton = document.getElementById('quick-check-button');

      this.quickCheckButton.addEventListener('click', () => {
        timerState.checkQuickLocation();
      });
    }

    // Subscribe to events
    this._setupEventListeners();

    // Check if stateManager already has rules loaded, and enable buttons if so
    const stateManager = await this._getStateManager();
    if (
      stateManager &&
      stateManager.locations &&
      stateManager.locations.length > 0
    ) {
      console.log('Rules are already loaded, enabling controls');
      this.enableControls(true);
    }

    console.log('ProgressUI module initialized');

    // Explicitly update progress after initialization is complete
    this.updateProgress();
  }

  static _setupEventListeners() {
    // Subscribe to connection events
    eventBus.subscribe('game:connected', () => {
      // Enable controls when connected
      this.enableControls(true);
      // Update progress when connected to server
      this.updateProgress();
    });

    // Enable controls when a rules file is loaded,
    // even without a server connection
    eventBus.subscribe('rules:loaded', () => {
      this.enableControls(true);
      this.updateProgress();
    });

    // Update progress when JSON data is loaded
    eventBus.subscribe('stateManager:jsonDataLoaded', () => {
      console.log('JSON data loaded, updating progress');
      this.updateProgress();
    });

    // Listen for PrintJSON processing completion
    eventBus.subscribe('messageHandler:printJSONProcessed', () => {
      console.log('PrintJSON processed, updating progress');
      this.updateProgress();
    });

    // Subscribe to location check events
    eventBus.subscribe('game:locationChecked', () => {
      this.updateProgress();
    });

    // Subscribe to inventory change events from stateManager
    eventBus.subscribe('stateManager:locationChecked', () => {
      this.updateProgress();
    });

    // Update when inventory changes (might make new locations accessible)
    eventBus.subscribe('stateManager:inventoryChanged', () => {
      this.updateProgress();
    });

    // Update when regions are recomputed (affects accessibility)
    eventBus.subscribe('stateManager:reachableRegionsComputed', () => {
      this.updateProgress();
    });

    // Subscribe to game completion
    eventBus.subscribe('game:complete', () => {
      this.setComplete();
    });

    // Subscribe to loop mode changes
    eventBus.subscribe('loopUI:modeChanged', (data) => {
      this.isLoopModeActive = data.active;
      this.updateProgress();
    });
  }

  static async updateProgress() {
    if (!this.checksCounter) return;

    const stateManager = await this._getStateManager();
    if (!stateManager) return;

    // Initialize counters
    let checkedCount = 0;
    let reachableCount = 0;
    let unreachableCount = 0;
    let totalCount = 0;

    // Event locations (locations with no ID)
    let checkedEventCount = 0;
    let totalEventCount = 0;

    if (stateManager.locations) {
      // Process each location
      stateManager.locations.forEach((loc) => {
        // Determine if this is an event location (no ID)
        const isEventLocation = loc.id === null || loc.id === undefined;

        // Process event locations separately
        if (isEventLocation) {
          totalEventCount++;
          if (stateManager.isLocationChecked(loc.name)) {
            checkedEventCount++;
          }
        } else {
          // Regular locations
          totalCount++;

          // Track checked locations
          if (stateManager.isLocationChecked(loc.name)) {
            checkedCount++;
          }

          // Track reachable/unreachable locations
          if (stateManager.isLocationAccessible(loc)) {
            // Only count as reachable if it's also not checked
            if (!stateManager.isLocationChecked(loc.name)) {
              reachableCount++;
            }
          } else {
            unreachableCount++;
          }
        }
      });
    }

    // Basic stats line
    const statsLine = `Checked: ${checkedCount}/${totalCount}, Reachable: ${reachableCount}, Unreachable: ${unreachableCount}, Events: ${checkedEventCount}/${totalEventCount}`;

    // If loop mode is active, add discovery information
    let displayText = statsLine;
    let titleText = `Checked ${checkedCount} of ${totalCount} locations (${reachableCount} reachable, ${unreachableCount} unreachable)\nEvents: ${checkedEventCount} of ${totalEventCount} event locations collected`;

    if (this.isLoopModeActive) {
      // Count total locations and exits in all regions
      let totalLocationsCount = 0;
      let totalExitsCount = 0;
      let discoveredLocationsCount = 0;
      let discoveredExitsCount = 0;

      // Count discovered regions
      const discoveredRegionsCount = loopState.discoveredRegions.size || 0;
      const totalRegionsCount = Object.keys(stateManager.regions).length || 0;

      // Count locations and exits
      for (const regionName in stateManager.regions) {
        const region = stateManager.regions[regionName];

        // Count locations
        if (region.locations) {
          totalLocationsCount += region.locations.length;
          region.locations.forEach((loc) => {
            if (loopState.isLocationDiscovered(loc.name)) {
              discoveredLocationsCount++;
            }
          });
        }

        // Count exits
        if (region.exits) {
          totalExitsCount += region.exits.length;

          // Check discovered exits for this region
          const regionExits = loopState.discoveredExits.get(regionName);
          if (regionExits) {
            discoveredExitsCount += regionExits.size;
          }
        }
      }

      // Add discovery information to display and title
      const discoveryLine = `Discovered Locations: ${discoveredLocationsCount}/${totalLocationsCount}, Exits: ${discoveredExitsCount}/${totalExitsCount}, Regions: ${discoveredRegionsCount}/${totalRegionsCount}`;
      displayText = `${statsLine}\n${discoveryLine}`;
      titleText = `${titleText}\n${discoveryLine}`;
    }

    // Update the counter with all the statistics
    this.checksCounter.innerText = displayText;

    // Add tooltip with additional information
    this.checksCounter.title = titleText;
  }

  static setProgress(value, max) {
    if (this.progressBar) {
      this.progressBar.setAttribute('max', max.toString());
      this.progressBar.setAttribute('value', value.toString());
    }
  }

  static setComplete() {
    if (this.progressBar) {
      this.progressBar.setAttribute('max', '100');
      this.progressBar.setAttribute('value', '100');
    }

    if (this.controlButton) {
      this.controlButton.setAttribute('disabled', 'disabled');
    }

    eventBus.publish('progress:complete', {});
  }

  static enableControls(enable) {
    if (this.controlButton) {
      if (enable) {
        this.controlButton.removeAttribute('disabled');
      } else {
        this.controlButton.setAttribute('disabled', 'disabled');
      }
    }

    if (this.quickCheckButton) {
      if (enable) {
        this.quickCheckButton.removeAttribute('disabled');
      } else {
        this.quickCheckButton.setAttribute('disabled', 'disabled');
      }
    }
  }
}

// No singleton needed as we're using a static class
export default ProgressUI;

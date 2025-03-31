// client/core/timerState.js - Updated to work directly with stateManager

import Config from './config.js';
import eventBus from '../../app/core/eventBus.js';
import connection from './connection.js';
import messageHandler from './messageHandler.js';
import locationManager from './locationManager.js';

// Import loopState for loop mode interaction
import loopState from '../../app/core/loop/loopState.js';

export class TimerState {
  constructor() {
    // Private variables
    this.gameInterval = null;
    this.progressBar = null;
    this.itemCounter = null;
    this.gameComplete = false;

    // Timer settings
    this.minCheckDelay = 30; // Default minimum delay in seconds
    this.maxCheckDelay = 60; // Default maximum delay in seconds

    // Timer state
    this.startTime = 0;
    this.endTime = 0;

    // Cache for stateManager
    this.stateManager = null;

    // Loop mode timer control
    this.timerPausedByLoopMode = false;
    this.loopModeEventHandlersAttached = false;

    // Make this instance available globally
    if (typeof window !== 'undefined') {
      window.timerState = this;
    }

    // Initialize global tracking set for clicked items
    window._userClickedItems = new Set();
  }

  // Getter methods for timing settings
  getMinCheckDelay() {
    return this.minCheckDelay;
  }

  getMaxCheckDelay() {
    return this.maxCheckDelay;
  }

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

  initialize() {
    // Reset timer state
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    this.gameComplete = false;
    this.timerPausedByLoopMode = false;

    // Get UI references
    this.progressBar = document.getElementById('progress-bar');
    this.itemCounter = document.getElementById('checks-sent');

    // Reset UI
    if (this.progressBar) {
      this.progressBar.setAttribute('value', '0');
    }

    if (this.itemCounter) {
      this.itemCounter.innerText =
        'Checked: 0/0, Reachable: 0, Unreachable: 0, Events: 0/0';
    }

    // Re-expose this instance to window
    if (typeof window !== 'undefined') {
      window.timerState = this;
    }

    // Set up event listeners for loop mode
    this._setupLoopModeEventHandlers();

    console.log('TimerState module initialized');
  }

  // Set up event listeners to handle loop mode events
  _setupLoopModeEventHandlers() {
    if (this.loopModeEventHandlersAttached) return;

    try {
      // Listen for action queue completion
      eventBus.subscribe('loopState:queueCompleted', () => {
        this._checkLoopModeTimerRestart();
      });

      // Listen for mana changes
      eventBus.subscribe('loopState:manaChanged', (data) => {
        // Check if we should restart the timer
        this._checkLoopModeTimerRestart();
      });

      // Listen for loop mode deactivation
      eventBus.subscribe('loopUI:modeChanged', (data) => {
        this.stop();
        this.timerPausedByLoopMode = false;
      });

      this.loopModeEventHandlersAttached = true;
      console.log('Loop mode event listeners attached for timer control');
    } catch (error) {
      console.error('Error setting up loop mode event listeners:', error);
    }
  }

  // Check if we should restart the timer in loop mode
  _checkLoopModeTimerRestart() {
    // Only try to restart if we're paused by loop mode
    if (!this.timerPausedByLoopMode) return;

    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;
    if (!isLoopModeActive) return;

    // Check conditions to restart:
    // 1. Queue is finished (empty or all actions completed)
    // 2. Mana is depleted
    const queue = loopState.actionQueue || []; // Handle potential null/undefined queue
    const queueFinished = queue.length === 0 || queue.every(action => action.completed === true);
    const manaDepleted = loopState.currentMana <= 0;

    // Restart if the queue is finished OR if there's no mana left
    if (queueFinished || manaDepleted) { 
      console.log(`Loop mode conditions met (Queue Finished: ${queueFinished}, Mana Depleted: ${manaDepleted}), restarting timer`);
      this.timerPausedByLoopMode = false;
      this.begin(); // Restart the timer's countdown
    }
  }

  // Check if there are any unchecked accessible locations left
  async _areAnyLocationsLeftToCheck() {
    const stateManager = await this._getStateManager();
    if (!stateManager) return false;

    const locations = stateManager.getProcessedLocations();
    return locations.some(
      (loc) =>
        stateManager.isLocationAccessible(loc) &&
        !stateManager.isLocationChecked(loc.name)
    );
  }

  // Update the timer interval check to also check if locations are left
  begin() {
    // Get references to UI elements if not already cached
    this.progressBar =
      this.progressBar || document.getElementById('progress-bar');
    this.itemCounter =
      this.itemCounter || document.getElementById('checks-sent');

    // Get control button
    const controlButton = document.getElementById('control-button');

    // If already running, stop the timer
    if (this.isRunning()) {
      console.log('Timer already running, stopping...');
      this.stop();
      return;
    }

    console.log('Starting timer...');

    // Remove connection check to allow offline operation
    // Get timing settings from instance variables
    const minDelay = this.minCheckDelay;
    const maxDelay = this.maxCheckDelay;
    const rangeMs = (maxDelay - minDelay) * 1000;
    const baseMs = minDelay * 1000;

    // Calculate random delay within range
    const initialDelay = Math.floor(Math.random() * rangeMs + baseMs);

    console.log(
      `Using timer delay range of ${minDelay}-${maxDelay} seconds (initial: ${
        initialDelay / 1000
      }s)`
    );

    // Change button text to "Stop" immediately
    if (controlButton) {
      controlButton.innerText = 'Stop';
      // Ensure it's not disabled
      controlButton.removeAttribute('disabled');
    }

    // Set timer state
    this.startTime = new Date().getTime();
    this.endTime = this.startTime + initialDelay;

    // Update progress bar
    if (this.progressBar) {
      this.progressBar.setAttribute(
        'max',
        (this.endTime - this.startTime).toString()
      );
    }

    // Update initial count
    this._updateItemCount();

    // Clear previous interval if any
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    // Start interval for checking progress
    try {
      this.gameInterval = setInterval(async () => {
        const currentTime = new Date().getTime();

        // Update progress bar
        if (this.progressBar) {
          this.progressBar.setAttribute(
            'value',
            (currentTime - this.startTime).toString()
          );
        }

        // Check if timer has expired
        if (currentTime >= this.endTime) {
          // Check if there are any locations left to check before proceeding
          const locationsLeft = await this._areAnyLocationsLeftToCheck();

          if (!locationsLeft) {
            console.log('No locations left to check, stopping timer...');
            this.stop();

            // Update button text to indicate completion
            if (controlButton) {
              controlButton.innerText = 'All Checked!';
            }

            return;
          }

          // Check a location through standard method
          await this.checkQuickLocation();

          // In loop mode, pause the timer until conditions are right
          const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

          if (isLoopModeActive && loopState) {
            console.log('Loop mode active, pausing timer until queue empties or mana depletes');
            this.timerPausedByLoopMode = true;
            this.stop();

            // Change the button text to indicate waiting for loop mode
            if (controlButton) {
              controlButton.innerText = 'Loop Mode Active';
            }
            return;
          }

          // Reset timer with a new random delay
          this.startTime = currentTime;
          const newDelay = Math.floor(Math.random() * rangeMs + baseMs);
          this.endTime = currentTime + newDelay;

          // Update progress bar
          if (this.progressBar) {
            this.progressBar.setAttribute(
              'max',
              (this.endTime - this.startTime).toString()
            );
            this.progressBar.setAttribute('value', '0');
          }

          console.log(`Timer reset with delay: ${newDelay / 1000} seconds`);
        }
      }, 1000);

      console.log('Timer started successfully');
    } catch (error) {
      console.error('Error starting timer:', error);
      // Reset button if there was an error
      if (controlButton) {
        controlButton.innerText = 'Begin!';
      }
    }
  }

  // The "Quick Check" button calls this method
  async checkQuickLocation() {
    // Check if loop mode is active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;
    
    if (isLoopModeActive) {
      await this._handleLoopModeQuickCheck();
    } else {
      // Standard behavior: check next available location
      await this._checkNextAvailableLocation();
    }
  }

  // Handle quick check in loop mode by clicking a random visible location or exit
  async _handleLoopModeQuickCheck() {
    console.log('Running quick check in loop mode');
    
    // Get all potentially valid location cards and exit cards
    const allOptions = [];
    
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      console.error('Failed to check: stateManager not available');
      await this._checkNextAvailableLocation();
      return;
    }
    
    // First get eligible locations
    const locations = stateManager.getProcessedLocations() || [];
    
    locations.forEach(loc => {
      const isRegionDiscovered = loopState.isRegionDiscovered(loc.region);
      const isRegionReachable = stateManager.isRegionReachable(loc.region);
      const isLocationDiscovered = loopState.isLocationDiscovered(loc.name);
      const isLocationChecked = stateManager.isLocationChecked(loc.name);
      const isLocationAccessible = stateManager.isLocationAccessible(loc);
      
      // Add to options if:
      // - Region is discovered and reachable
      // - AND location is either (undiscovered) OR (unchecked and accessible)
      if (isRegionDiscovered && isRegionReachable && 
          (!isLocationDiscovered || (!isLocationChecked && isLocationAccessible))) {
        allOptions.push({
          type: 'location',
          data: loc
        });
      }
    });
    
    // Then get eligible exits
    if (stateManager.regions) {
      Object.entries(stateManager.regions).forEach(([regionName, region]) => {
        if (region.exits && Array.isArray(region.exits)) {
          const isRegionDiscovered = loopState.isRegionDiscovered(regionName);
          const isRegionReachable = stateManager.isRegionReachable(regionName);
          
          // Only process exits in discovered and reachable regions
          if (isRegionDiscovered && isRegionReachable) {
            region.exits.forEach(exit => {
              // Check if exit is discovered
              const isExitDiscovered = loopState.isExitDiscovered(regionName, exit.name);
              
              // Check if the target region is discovered (only if a target region exists)
              // If no connected_region, it cannot be undiscovered, so treat as discovered for this check.
              const isTargetRegionDiscovered = exit.connected_region ? loopState.isRegionDiscovered(exit.connected_region) : true;
              
              // Add to options if:
              // - Exit is undiscovered OR
              // - Exit has a connected region AND that region is undiscovered
              if (!isExitDiscovered || (exit.connected_region && !isTargetRegionDiscovered)) {
                // Make sure the exit has the region property set correctly
                // The exitUI.handleExitClick method requires exit.region to be set
                const exitWithRegion = {
                  ...exit,
                  region: regionName // Ensure the source region is attached
                };
                
                allOptions.push({
                  type: 'exit',
                  data: exitWithRegion
                });
              }
            });
          }
        }
      });
    }
    
    console.log(`Found ${allOptions.length} eligible options for quick check (${allOptions.filter(o => o.type === 'location').length} locations, ${allOptions.filter(o => o.type === 'exit').length} exits)`);
    
    if (allOptions.length > 0) {
      // Pick a random option
      const randomIndex = Math.floor(Math.random() * allOptions.length);
      const selectedOption = allOptions[randomIndex];
      
      console.log(`Selected random option: ${selectedOption.type} - ${selectedOption.data.name}`);
      
      if (selectedOption.type === 'location') {
        // Handle location click
        if (window.gameUI?.locationUI) {
          window.gameUI.locationUI.handleLocationClick(selectedOption.data);
          return;
        }
      } else if (selectedOption.type === 'exit') {
        // Handle exit click
        if (window.gameUI?.exitUI) {
          window.gameUI.exitUI.handleExitClick(selectedOption.data);
          return;
        }
      }
    }
    
    // If we get here, we couldn't find a suitable option or there was an error
    console.log('Loop mode quick check failed');
  }

  // Internal method to find and check a location
  async _checkNextAvailableLocation() {
    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) {
      console.error('Failed to check location: stateManager not available');
      return;
    }

    // Find an accessible, unchecked location
    const locations = stateManager.getProcessedLocations();
    const locationToCheck = locations.find(
      (loc) =>
        stateManager.isLocationAccessible(loc) &&
        !stateManager.isLocationChecked(loc.name)
    );

    if (!locationToCheck) {
      console.log('No available locations to check');

      // Check if we're running the timer
      if (this.isRunning()) {
        console.log('All locations checked, stopping timer...');

        // Stop the timer
        this.stop();

        // Notify the user that all locations have been checked
        const controlButton = document.getElementById('control-button');
        if (controlButton) {
          controlButton.innerText = 'All Checked!';
        }

        // Optionally, update the item counter for visual confirmation
        this._updateItemCount();

        // Show a notification (if available in the UI)
        try {
          if (eventBus) {
            eventBus.publish('game:allLocationsChecked', {});
          }
        } catch (e) {
          console.warn('Could not publish event:', e);
        }
      }

      return;
    }

    console.log(`Checking location: ${locationToCheck.name}`);

    // SIMPLIFIED APPROACH - direct but separate handling
    if (locationToCheck.id === null || locationToCheck.id === undefined) {
      // Local-only location - process locally
      console.log(`Processing local-only location: ${locationToCheck.name}`);

      // Mark checked
      stateManager.checkLocation(locationToCheck.name);

      // Add item if present
      if (locationToCheck.item) {
        console.log(`Local event contains item: ${locationToCheck.item.name}`);
        stateManager.addItemToInventory(locationToCheck.item.name);

        if (stateManager.state?.processEventItem) {
          stateManager.state.processEventItem(locationToCheck.item.name);
        }
      }

      // Update UI
      stateManager.invalidateCache();
      stateManager.notifyUI('locationChecked');
      stateManager.notifyUI('inventoryChanged');
    } else {
      // Networked location - only mark checked
      console.log(`Processing networked location: ${locationToCheck.name}`);

      // Mark checked
      stateManager.checkLocation(locationToCheck.name);

      // Send to server if connected
      if (connection.isConnected()) {
        console.log(`Sending location check to server: ${locationToCheck.id}`);

        // Track pending location for duplicate prevention
        if (!window._pendingLocationChecks) {
          window._pendingLocationChecks = new Set();
        }
        window._pendingLocationChecks.add(locationToCheck.id);

        // Set a timeout to remove from pending set (in case server never responds)
        setTimeout(() => {
          if (window._pendingLocationChecks) {
            window._pendingLocationChecks.delete(locationToCheck.id);
          }
        }, 10000); // 10 second timeout

        connection.send([
          {
            cmd: 'LocationChecks',
            locations: [locationToCheck.id],
          },
        ]);
      } else {
        // OFFLINE MODE: Process locally even for networked locations
        console.log(`OFFLINE MODE: Processing networked location locally`);

        // Add item if present
        if (locationToCheck.item) {
          console.log(`Adding item: ${locationToCheck.item.name}`);
          stateManager.addItemToInventory(locationToCheck.item.name);
        }

        // Update inventory UI
        stateManager.notifyUI('inventoryChanged');
      }

      // Update UI
      stateManager.invalidateCache();
      stateManager.notifyUI('locationChecked');
    }

    // Update counter
    this._updateItemCount();
  }

  // Update the item counter from stateManager data
  async _updateItemCount() {
    // Instead of duplicating logic, use ProgressUI's method
    try {
      const progressUIModule = await import('../ui/progressUI.js');
      const ProgressUI = progressUIModule.default;
      ProgressUI.updateProgress();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  }

  setCheckDelay(minSeconds, maxSeconds = null) {
    // If only one parameter, use it for both min and max
    if (maxSeconds === null) {
      maxSeconds = minSeconds;
    }

    // Validate inputs
    if (
      typeof minSeconds !== 'number' ||
      minSeconds < 1 ||
      typeof maxSeconds !== 'number' ||
      maxSeconds < 1
    ) {
      console.warn('Invalid delay values. Must be numbers >= 1.');
      return false;
    }

    if (minSeconds > maxSeconds) {
      console.warn(
        'Min delay cannot be greater than max delay, swapping values.'
      );
      [minSeconds, maxSeconds] = [maxSeconds, minSeconds];
    }

    // Store the delay values in instance variables
    this.minCheckDelay = minSeconds;
    this.maxCheckDelay = maxSeconds;

    // Set the property in window as well for compatibility
    if (typeof window !== 'undefined') {
      if (!window._timingSettings) {
        window._timingSettings = {};
      }
      window._timingSettings.minCheckDelay = minSeconds;
      window._timingSettings.maxCheckDelay = maxSeconds;
    }

    console.log(`Check delay set to ${minSeconds}-${maxSeconds} seconds`);

    // If the game interval is running, update it
    if (this.gameInterval) {
      const currentTime = new Date().getTime();
      const progressPercent =
        (currentTime - this.startTime) / (this.endTime - this.startTime);

      // Calculate new end time with new delay range
      const rangeMs = (maxSeconds - minSeconds) * 1000;
      const baseMs = minSeconds * 1000;
      const newDelay = Math.floor(Math.random() * rangeMs + baseMs);

      // Reset timer with new delay but maintain progress percentage
      this.startTime = currentTime;
      this.endTime = currentTime + newDelay;

      console.log(
        `Timer updated with new delay range: ${minSeconds}-${maxSeconds} seconds`
      );

      // Update progress bar
      if (this.progressBar) {
        const newMax = this.endTime - this.startTime;
        this.progressBar.setAttribute('max', newMax.toString());
        this.progressBar.setAttribute(
          'value',
          (progressPercent * newMax).toString()
        );
      }
    }

    return true;
  }

  stop() {
    // Clear the timer interval
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    // Reset UI only if not paused by loop mode
    if (!this.timerPausedByLoopMode) {
      if (this.progressBar) {
        this.progressBar.setAttribute('value', '0');
      }

      // Reset control button to "Begin!"
      const controlButton = document.getElementById('control-button');
      if (controlButton) {
        controlButton.innerText = 'Begin!';
        controlButton.removeAttribute('disabled');
      }
    }
  }

  isRunning() {
    // Check if the interval exists and is valid
    const running =
      this.gameInterval !== null && this.gameInterval !== undefined;
    console.log('isRunning check:', running, this.gameInterval);
    return running;
  }

  isComplete() {
    return this.gameComplete;
  }
}

// Create and export a singleton instance
const timerStateInstance = new TimerState();
export default timerStateInstance;
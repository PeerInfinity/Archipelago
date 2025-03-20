// client/core/gameState.js - Updated to work directly with stateManager

import Config from './config.js';
import eventBus from './eventBus.js';
import connection from './connection.js';
import messageHandler from './messageHandler.js';
import locationManager from './locationManager.js';

export class GameState {
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

    // Make this instance available globally
    if (typeof window !== 'undefined') {
      window.gameState = this;
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

    // Get UI references
    this.progressBar = document.getElementById('progress-bar');
    this.itemCounter = document.getElementById('checks-sent');

    // Reset UI
    if (this.progressBar) {
      this.progressBar.setAttribute('value', '0');
    }

    if (this.itemCounter) {
      this.itemCounter.innerText = '0';
    }

    // Re-expose this instance to window
    if (typeof window !== 'undefined') {
      window.gameState = this;
    }

    console.log('GameState module initialized');
  }

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

    // Check if connected to server
    if (!connection.isConnected()) {
      alert('Not connected to Archipelago server. Please connect first.');

      // Ensure the button is enabled
      if (controlButton) {
        controlButton.removeAttribute('disabled');
      }
      return;
    }

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
      this.gameInterval = setInterval(() => {
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
          // Check a location through stateManager
          this._checkNextAvailableLocation();

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
  checkQuickLocation() {
    // Forward to internal method
    this._checkNextAvailableLocation();
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
        connection.send([
          {
            cmd: 'LocationChecks',
            locations: [locationToCheck.id],
          },
        ]);
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
    if (!this.itemCounter) return;

    // Get stateManager
    const stateManager = await this._getStateManager();
    if (!stateManager) return;

    const checkedCount = stateManager.checkedLocations.size;
    const totalCount = stateManager.locations.length;

    // Update counter
    this.itemCounter.innerText = `${checkedCount}${
      totalCount ? ` / ${totalCount}` : ''
    }`;
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
    if (this.gameInterval) {
      clearInterval(this.gameInterval);
      this.gameInterval = null;
    }

    // Reset UI
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
export const gameState = new GameState();

// Also export as default for backward compatibility with code that might use default import
export default GameState;

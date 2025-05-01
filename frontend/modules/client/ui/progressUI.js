/**
 * progressUI.js - Handles the UI display for action progress and mana in loop mode.
 */
import loopState from '../../loops/loopStateSingleton.js';

export class ProgressUI {
  static rootElement = null;
  static progressBar = null;
  static checksCounter = null;
  static controlButton = null;
  static quickCheckButton = null;
  static stateManager = null;
  static isLoopModeActive = false;
  static eventBus = null;
  static unsubscribeHandles = [];

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
      console.error('Error loading stateManager:', error);
      return null;
    }
  }

  static setEventBus(busInstance) {
    console.log('[ProgressUI] Setting EventBus instance.');
    this.eventBus = busInstance;
  }

  static async initializeWithin(rootElement, eventBusInstance) {
    console.log('[ProgressUI] Initializing within element:', rootElement);
    this.rootElement = rootElement;
    this.eventBus = eventBusInstance;

    if (!this.eventBus) {
      console.error(
        '[ProgressUI] EventBus instance not provided to initializeWithin!'
      );
      return () => {};
    }

    this.progressBar = this.rootElement.querySelector('#progress-bar');
    this.checksCounter = this.rootElement.querySelector('#checks-sent');
    this.controlButton = this.rootElement.querySelector('#control-button');
    this.quickCheckButton = this.rootElement.querySelector(
      '#quick-check-button'
    );

    if (
      !this.progressBar ||
      !this.checksCounter ||
      !this.controlButton ||
      !this.quickCheckButton
    ) {
      console.warn(
        '[ProgressUI] Not all UI elements found within provided root element'
      );
    }

    this.progressBar.setAttribute('value', '0');
    this.checksCounter.innerText = 'Ready';
    this.controlButton.textContent = 'Begin!';
    this.quickCheckButton.disabled = true;
    this.controlButton.disabled = true;

    this._setupEventListeners();

    const stateManager = await this._getStateManager();
    if (stateManager?.instance?.gameData?.locations) {
      console.log('[ProgressUI] Rules seem loaded, enabling controls.');
      this.enableControls(true);
    } else {
      console.log('[ProgressUI] Rules not loaded initially.');
      this.enableControls(false);
    }

    console.log('[ProgressUI] Initialized within element.');
    this.updateProgress();

    return () => {
      console.log('[ProgressUI] Cleaning up listeners...');
      this.unsubscribeHandles.forEach((unsub) => unsub());
      this.unsubscribeHandles = [];
      this.eventBus = null;
      this.rootElement = null;
    };
  }

  static _setupEventListeners() {
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];

    const subscribe = (eventName, handler) => {
      if (!this.eventBus) return;
      const unsub = this.eventBus.subscribe(eventName, handler);
      this.unsubscribeHandles.push(unsub);
    };

    subscribe('connection:open', () => {
      this.enableControls(true);
      this.updateProgress();
    });
    subscribe('connection:close', () => {
      this.enableControls(false);
      this.updateProgress();
    });
    subscribe('stateManager:rulesLoaded', () => {
      this.enableControls(true);
      this.updateProgress();
    });
    subscribe('stateManager:jsonDataLoaded', () => {
      console.log(
        '[ProgressUI] stateManager:jsonDataLoaded, updating progress'
      );
      this.updateProgress();
    });
    subscribe('messageHandler:printJSONProcessed', () => {
      console.log('[ProgressUI] PrintJSON processed, updating progress');
      this.updateProgress();
    });
    subscribe('stateManager:locationChecked', () => {
      this.updateProgress();
    });
    subscribe('stateManager:inventoryChanged', () => {
      this.updateProgress();
    });
    subscribe('stateManager:regionsComputed', () => {
      this.updateProgress();
    });
    subscribe('loop:modeChanged', (data) => {
      this.isLoopModeActive = data.active;
      this.enableControls(!this.isLoopModeActive);
      this.updateProgress();
    });

    subscribe('timer:started', (data) => {
      console.log('[ProgressUI] Timer started event', data);
      if (this.progressBar && data?.endTime && data?.startTime) {
        this.progressBar.setAttribute(
          'max',
          (data.endTime - data.startTime).toString()
        );
        this.progressBar.setAttribute('value', '0');
      }
      if (this.controlButton) this.controlButton.textContent = 'Stop';
      this.enableControls(true);
    });
    subscribe('timer:stopped', () => {
      console.log('[ProgressUI] Timer stopped event');
      if (this.progressBar) this.progressBar.setAttribute('value', '0');
      if (this.controlButton) this.controlButton.textContent = 'Begin!';
      this._checkInitialControls();
    });
    subscribe('timer:progressUpdate', (data) => {
      if (
        this.progressBar &&
        data?.value !== undefined &&
        data?.max !== undefined
      ) {
        this.progressBar.setAttribute('max', data.max.toString());
        this.progressBar.setAttribute('value', data.value.toString());
      }
    });

    if (this.controlButton) {
      this.controlButton.replaceWith(this.controlButton.cloneNode(true));
      this.controlButton = this.rootElement.querySelector('#control-button');
      this.controlButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.eventBus.publish('timer:toggleRequest', {});
      });
    }
    if (this.quickCheckButton) {
      this.quickCheckButton.replaceWith(this.quickCheckButton.cloneNode(true));
      this.quickCheckButton = this.rootElement.querySelector(
        '#quick-check-button'
      );
      this.quickCheckButton.addEventListener('click', () => {
        this.eventBus.publish('timer:quickCheckRequest', {});
      });
    }
  }

  static async _checkInitialControls() {
    const stateManager = await this._getStateManager();
    if (stateManager?.instance?.gameData?.locations) {
      this.enableControls(true);
    } else {
      this.enableControls(false);
    }
  }

  static async updateProgress() {
    if (!this.checksCounter) return;

    const stateManager = await this._getStateManager();
    if (!stateManager) return;

    let checkedCount = 0;
    let reachableCount = 0;
    let unreachableCount = 0;
    let totalCount = 0;

    let checkedEventCount = 0;
    let totalEventCount = 0;

    if (stateManager.locations) {
      stateManager.locations.forEach((loc) => {
        const isEventLocation = loc.id === null || loc.id === undefined;

        if (isEventLocation) {
          totalEventCount++;
          if (stateManager.isLocationChecked(loc.name)) {
            checkedEventCount++;
          }
        } else {
          totalCount++;

          if (stateManager.isLocationChecked(loc.name)) {
            checkedCount++;
          }

          if (stateManager.isLocationAccessible(loc)) {
            if (!stateManager.isLocationChecked(loc.name)) {
              reachableCount++;
            }
          } else {
            unreachableCount++;
          }
        }
      });
    }

    const statsLine = `Checked: ${checkedCount}/${totalCount}, Reachable: ${reachableCount}, Unreachable: ${unreachableCount}, Events: ${checkedEventCount}/${totalEventCount}`;

    let displayText = statsLine;
    let titleText = `Checked ${checkedCount} of ${totalCount} locations (${reachableCount} reachable, ${unreachableCount} unreachable)\nEvents: ${checkedEventCount} of ${totalEventCount} event locations collected`;

    if (this.isLoopModeActive) {
      let totalLocationsCount = 0;
      let totalExitsCount = 0;
      let discoveredLocationsCount = 0;
      let discoveredExitsCount = 0;

      const discoveredRegionsCount = loopState.discoveredRegions.size || 0;
      const totalRegionsCount = Object.keys(stateManager.regions).length || 0;

      for (const regionName in stateManager.regions) {
        const region = stateManager.regions[regionName];

        if (region.locations) {
          totalLocationsCount += region.locations.length;
          region.locations.forEach((loc) => {
            if (loopState.isLocationDiscovered(loc.name)) {
              discoveredLocationsCount++;
            }
          });
        }

        if (region.exits) {
          totalExitsCount += region.exits.length;

          const regionExits = loopState.discoveredExits.get(regionName);
          if (regionExits) {
            discoveredExitsCount += regionExits.size;
          }
        }
      }

      const discoveryLine = `Discovered Locations: ${discoveredLocationsCount}/${totalLocationsCount}, Exits: ${discoveredExitsCount}/${totalExitsCount}, Regions: ${discoveredRegionsCount}/${totalRegionsCount}`;
      displayText = `${statsLine}\n${discoveryLine}`;
      titleText = `${titleText}\n${discoveryLine}`;
    }

    this.checksCounter.innerText = displayText;
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

    this.eventBus.publish('progress:complete', {});
  }

  static enableControls(enable) {
    console.log(`[ProgressUI] Setting controls enabled: ${enable}`);
    if (this.controlButton) {
      this.controlButton.disabled = !enable;
    }
    if (this.quickCheckButton) {
      this.quickCheckButton.disabled = !enable;
    }
  }
}

export default ProgressUI;

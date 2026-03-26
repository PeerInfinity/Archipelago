// eventCoordinator.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import settingsManager from '../../app/core/settingsManager.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';
import { getCostDataManager } from './index.js';

const logger = createUniversalLogger('loopUI:EventCoordinator');

/**
 * EventCoordinator
 *
 * Centralizes all event subscription and handling for the Loops UI.
 * Separates event coordination from UI logic.
 *
 * Responsibilities:
 * - Subscribe to all relevant events
 * - Route events to appropriate handlers
 * - Coordinate updates across managers
 * - Manage subscription lifecycle
 */
export class EventCoordinator {
  constructor(eventBus, loopUI) {
    this.eventBus = eventBus;
    this.loopUI = loopUI; // Reference to LoopUI instance for callbacks
    this.eventSubscriptions = [];
    this._stateManagerReady = false;
    this._savedDiscoverySettings = null; // Settings saved before loop mode override

    logger.debug('EventCoordinator constructed');
  }

  /**
   * Subscribe to all events
   * Sets up all event listeners for the loops panel
   */
  subscribeToEvents() {
    // Prevent duplicate subscriptions
    if (this.eventSubscriptions.length > 0) {
      logger.warn('subscribeToEvents called multiple times. Skipping.');
      return;
    }

    logger.info('Subscribing to EventBus events');

    // Helper to subscribe and track
    const subscribe = (eventName, handler) => {
      const unsubscribe = this.eventBus.subscribe(
        eventName,
        handler.bind(this)
      );
      this.eventSubscriptions.push(unsubscribe);
    };

    // Mana changes
    subscribe('loopState:manaChanged', this._handleManaChanged);

    // XP changes
    subscribe('loopState:xpChanged', this._handleXPChanged);

    // Pause state changes (single authoritative event)
    subscribe('loopState:pauseStateChanged', this._handlePauseStateChanged);

    // Queue updates
    subscribe('loopState:queueUpdated', this._handleQueueUpdated);

    // Auto-restart changes
    subscribe('loopState:autoRestartChanged', this._handleAutoRestartChanged);

    // Progress updates
    subscribe('loopState:progressUpdated', this._handleProgressUpdated);

    // Action completion
    subscribe('loopState:actionCompleted', this._handleActionCompleted);

    // New action started
    subscribe('loopState:newActionStarted', this._handleNewActionStarted);

    // Queue completed
    subscribe('loopState:queueCompleted', this._handleQueueCompleted);

    // State manager events
    subscribe('stateManager:ready', this._handleStateManagerReady);
    subscribe('stateManager:snapshotUpdated', this._handleSnapshotUpdated);
    subscribe('stateManager:rulesLoaded', this._handleRulesLoaded);

    // Discovery events
    subscribe('discovery:locationDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:exitDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:regionDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:changed', this._handleDiscoveryChanged);

    // Discovery mode and settings changes
    subscribe('discovery:modeChanged', this._handleDiscoveryModeChanged);
    subscribe('discovery:settingsChanged', this._handleDiscoverySettingsChanged);

    // Loop reset
    subscribe('loopState:loopReset', this._handleLoopReset);

    // State loaded
    subscribe('loopState:stateLoaded', this._handleStateLoaded);

    // Explore action repeated
    subscribe('loopState:exploreActionRepeated', this._handleExploreRepeated);

    // Loop mode toggle
    subscribe('loops:setLoopMode', this._handleSetLoopMode);

    // PlayerState path updates (keeps loops panel in sync with regions panel)
    subscribe('playerState:pathUpdated', this._handlePathUpdated);

    logger.info(`Subscribed to ${this.eventSubscriptions.length} events`);
  }

  /**
   * Unsubscribe from all events
   * Cleanup method called on destroy
   */
  unsubscribeAll() {
    logger.info(`Unsubscribing from ${this.eventSubscriptions.length} events`);
    this.eventSubscriptions.forEach(unsubscribe => unsubscribe());
    this.eventSubscriptions = [];
  }

  // ==================== Event Handlers ====================

  /**
   * Handle mana changed event
   * @private
   */
  _handleManaChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updateManaDisplay(data.current, data.max);
    }
  }

  /**
   * Handle XP changed event
   * @private
   */
  _handleXPChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updateRegionXPDisplay(data.regionName);
      this.loopUI._updateLoopStats();
    }
  }

  /**
   * Handle pause state changed event
   * @private
   */
  _handlePauseStateChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updatePauseButtonState(data.isPaused, data.processingState);
    }
  }

  /**
   * Handle queue updated event
   * @private
   */
  _handleQueueUpdated(data) {
    if (!this.loopUI.isLoopModeActive) return;
    this.loopUI._updateRegionsInQueue(data.queue);
    this.loopUI._updateLoopStats();
    this.loopUI.renderLoopPanel();
  }

  /**
   * Handle auto-restart changed event
   * @private
   */
  _handleAutoRestartChanged(data) {
    if (!this.loopUI.isLoopModeActive) return;
    const autoRestartCheckbox = this.loopUI.rootElement?.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartCheckbox) {
      autoRestartCheckbox.checked = data.autoRestart;
    }
  }

  /**
   * Handle progress updated event
   * @private
   */
  _handleProgressUpdated(data) {
    const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
    if (!this.loopUI.isLoopModeActive || !loopState?.isProcessing) return;

    if (data.action) {
      this.loopUI._updateActionProgress(data.action);
      this.loopUI._updateCurrentActionDisplay(data.action);

      // Force reflow for animations
      window.requestAnimationFrame(() => {
        const actionEl = this.loopUI.rootElement.querySelector(
          `#action-${data.action.id}`
        );
        if (actionEl) {
          void actionEl.offsetWidth;
        }
      });
    }

    // Update mana display
    if (data.mana) {
      this.loopUI._updateManaDisplay(data.mana.current, data.mana.max);
    }
  }

  /**
   * Handle action completed event
   * @private
   */
  _handleActionCompleted(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updateLoopStats();
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle new action started event
   * @private
   */
  _handleNewActionStarted(data) {
    if (this.loopUI.isLoopModeActive && data.action) {
      this.loopUI._updateCurrentActionDisplay(data.action);
    }
  }

  /**
   * Handle queue completed event
   * @private
   */
  _handleQueueCompleted(data) {
    // Status line is now updated by _handlePauseStateChanged via the
    // loopState:pauseStateChanged event published after queue completion.

    // Auto-remove completed actions when the loop ends
    const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
    if (loopState?.autoRemoveCompleted) {
      loopState.removeCompletedActions();
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle state manager ready event
   * @private
   */
  _handleStateManagerReady(data) {
    this._stateManagerReady = true;
    if (this.loopUI.isLoopModeActive) {
      this._enableDiscoveryForLoopMode();
      // If no regions are expanded yet (e.g. auto-entered loop mode before data loaded),
      // expand the first region now that the path has real region names
      if (this.loopUI.expansionState.expandedRegions.size === 0) {
        const actionQueue = this.loopUI.getActionQueue();
        const firstRegion = actionQueue.length > 0 ? actionQueue[0].sourceRegion : null;
        if (firstRegion) {
          this.loopUI.expansionState.setRegionExpanded(firstRegion, true);
        }
      }
      logger.info('Re-rendering loop panel with full static data');
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle snapshot updated event — re-render to reflect accessibility changes
   * @private
   */
  _handleSnapshotUpdated(data) {
    if (this.loopUI.isLoopModeActive) {
      // Auto-remove completed actions if enabled
      const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
      if (loopState?.autoRemoveCompleted) {
        loopState.removeCompletedActions();
      }
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle rules loaded event — reset UI for new game/seed
   * @private
   */
  _handleRulesLoaded(data) {
    logger.info('Received stateManager:rulesLoaded - resetting loops UI');
    this.loopUI.renderLoopPanel();
  }

  /**
   * Handle discovery changed events
   * @private
   */
  _handleDiscoveryChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
      if (loopState?.autoRemoveCompleted) {
        // Disable repeat-explore for any regions that are now fully explored
        loopState.disableRepeatForExploredRegions();
        // Remove completed actions from the queue
        loopState.removeCompletedActions();
      }
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle discovery mode changed event
   * @private
   */
  _handleDiscoveryModeChanged(data) {
    if (data && typeof data.active === 'boolean') {
      this.loopUI.isDiscoveryModeActive = data.active;
      logger.info(`Discovery mode changed: ${this.loopUI.isDiscoveryModeActive}`);
      if (this.loopUI.isLoopModeActive) {
        this.loopUI.renderLoopPanel();
      }
    }
  }

  /**
   * Handle discovery settings changed event
   * @private
   */
  _handleDiscoverySettingsChanged(data) {
    if (data && data.settings) {
      this.loopUI.discoverySettings.undiscoveredDisplay = data.settings.undiscoveredDisplay ?? 'hidden';
      this.loopUI.discoverySettings.clickDiscoversLocation = data.settings.clickDiscoversLocation ?? true;
      this.loopUI.discoverySettings.clickDiscoversRegion = data.settings.clickDiscoversRegion ?? false;
      this.loopUI.discoverySettings.disableLocationCheckUI = data.settings.disableLocationCheckUI ?? false;
      this.loopUI.discoverySettings.showUndiscoveredDetails = data.settings.showUndiscoveredDetails ?? false;
      this.loopUI.discoverySettings.showUndiscoveredRegionNames = data.settings.showUndiscoveredRegionNames ?? false;
      if (typeof data.settings.enableDiscoveryMode === 'boolean') {
        this.loopUI.isDiscoveryModeActive = data.settings.enableDiscoveryMode;
      }
      logger.info('Discovery settings updated');
      if (this.loopUI.isLoopModeActive) {
        this.loopUI.renderLoopPanel();
      }
    }
  }

  /**
   * Handle loop reset event
   * @private
   */
  _handleLoopReset(data) {
    if (this.loopUI.isLoopModeActive) {
      // Auto-remove completed actions when the loop resets
      const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
      if (loopState?.autoRemoveCompleted) {
        loopState.removeCompletedActions();
      }

      this.loopUI._handleLoopReset(data);
      if (data.mana) {
        this.loopUI._updateManaDisplay(data.mana.current, data.mana.max);
      }
    }
  }

  /**
   * Handle state loaded event
   * @private
   */
  _handleStateLoaded(data) {
    logger.info('Received loopState:stateLoaded event. Updating UI based on loaded state.');

    // Re-render panel
    this.loopUI.renderLoopPanel();

    // Get loopState reference
    const loopState = this.loopUI.getLoopState ? this.loopUI.getLoopState() : null;
    if (!loopState) return;

    // Update pause button
    this.loopUI._updatePauseButtonState(loopState.isPaused);

    // Update auto-restart button
    const autoRestartCheckbox = this.loopUI.rootElement.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartCheckbox) {
      autoRestartCheckbox.checked = loopState.autoRestartQueue;
    }

    // Update speed slider and input
    const speedSlider = this.loopUI.rootElement.querySelector('#loop-ui-game-speed');
    const speedInput = this.loopUI.rootElement.querySelector('#loop-ui-speed-value');
    if (speedSlider && speedInput) {
      speedSlider.value = loopState.gameSpeed;
      speedInput.value = loopState.gameSpeed;
    }
  }

  /**
   * Handle explore action repeated event
   * @private
   */
  _handleExploreRepeated(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI.regionsInQueue.add(data.regionName);
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle playerState path updated event.
   * Re-renders the loops panel when the path changes, and triggers
   * auto-resume when in the waiting state and new actions are appended.
   * @private
   */
  _handlePathUpdated(data) {
    if (!this.loopUI.isLoopModeActive) return;

    // Check for auto-resume before re-rendering
    const loopState = this.loopUI.getLoopState?.();
    if (loopState && loopState.getProcessingState() === 'waiting') {
      const queue = loopState.getActionQueue();
      if (queue.length > loopState.currentActionIndex) {
        loopState.resumeProcessing();
        return; // resumeProcessing will trigger its own UI updates
      }
    }

    logger.info('Received playerState:pathUpdated, re-rendering loop panel');
    this.loopUI.renderLoopPanel();
  }

  /**
   * Handle set loop mode event
   * @private
   */
  _handleSetLoopMode(data) {
    const action = data?.action || 'toggle';
    logger.info(`Received loops:setLoopMode with action: ${action}, current mode: ${this.loopUI.isLoopModeActive}`);

    // Get panelManager for panel activation (if available)
    const panelManagerInstance = this.loopUI.getPanelManager ? this.loopUI.getPanelManager() : null;

    switch (action) {
      case 'enable':
        if (!this.loopUI.isLoopModeActive) {
          // Check if cost data needs to be generated first
          const costDataManager = getCostDataManager();
          if (costDataManager && !costDataManager.isLoaded()) {
            // Cost data not loaded — check if sphere log is already available
            // (sphereState:dataLoaded may have already fired before this handler ran)
            const generateCosts = async () => {
              logger.info('Auto-generating costs before entering loop mode');
              await this.loopUI._handleGenerateCostsInline();
              // _handleGenerateCostsInline enables loop mode on success
            };

            const getSphereLogFn = centralRegistry.getPublicFunction('loopsCostDebugger', 'getSphereLog')
              || (() => null);
            const sphereLog = getSphereLogFn();

            if (sphereLog && sphereLog.length > 0) {
              // Sphere data already available — generate costs immediately
              logger.info('Sphere data already available — generating costs now');
              generateCosts();
            } else {
              // Wait for sphere log to become available
              logger.info('No cost data loaded — waiting for sphereState:dataLoaded to auto-generate costs');
              const unsubscribe = this.eventBus.subscribe('sphereState:dataLoaded', async () => {
                unsubscribe();
                logger.info('sphereState:dataLoaded received — auto-generating costs');
                await generateCosts();
              });
            }
          } else {
            this.loopUI.toggleLoopMode();
          }
          // Activate the loops panel when entering loop mode
          if (panelManagerInstance) {
            try {
              logger.info('Activating loopsPanel...');
              panelManagerInstance.activatePanel('loopsPanel');
            } catch (error) {
              logger.error('Error activating loopsPanel:', error);
            }
          }
        }
        break;
      case 'disable':
        if (this.loopUI.isLoopModeActive) {
          this.loopUI.toggleLoopMode();
        }
        break;
      case 'toggle':
      default:
        this.loopUI.toggleLoopMode();
        // If we're entering loop mode (after toggle), activate the panel
        if (this.loopUI.isLoopModeActive) {
          if (panelManagerInstance) {
            try {
              logger.info('Activating loopsPanel...');
              panelManagerInstance.activatePanel('loopsPanel');
            } catch (error) {
              logger.error('Error activating loopsPanel:', error);
            }
          }
        }
        break;
    }

    // Apply or restore discovery settings based on loop mode state
    if (this.loopUI.isLoopModeActive && this._stateManagerReady) {
      this._enableDiscoveryForLoopMode();
    } else if (!this.loopUI.isLoopModeActive && this._savedDiscoverySettings) {
      this._restoreDiscoverySettings();
    }
  }

  /**
   * Enable discovery mode with loop-appropriate settings
   * Saves the current settings first so they can be restored on exit
   * @private
   */
  async _enableDiscoveryForLoopMode() {
    const prefix = 'moduleSettings.discovery.';

    // Save current settings before overwriting
    this._savedDiscoverySettings = {
      enableDiscoveryMode: await settingsManager.getSetting(`${prefix}enableDiscoveryMode`, false),
      regionDiscoveryTrigger: await settingsManager.getSetting(`${prefix}regionDiscoveryTrigger`, 'onEnter'),
      autoDiscoverLocations: await settingsManager.getSetting(`${prefix}autoDiscoverLocations`, false),
      autoDiscoverExits: await settingsManager.getSetting(`${prefix}autoDiscoverExits`, false),
      undiscoveredDisplay: await settingsManager.getSetting(`${prefix}undiscoveredDisplay`, 'hidden'),
      showUndiscoveredRegionNames: await settingsManager.getSetting(`${prefix}showUndiscoveredRegionNames`, false),
      clickDiscoversRegion: await settingsManager.getSetting(`${prefix}clickDiscoversRegion`, false),
      disableLocationCheckUI: await settingsManager.getSetting(`${prefix}disableLocationCheckUI`, false),
    };
    logger.info('Saved pre-loop discovery settings');

    // Apply loop mode settings
    await settingsManager.updateSetting(`${prefix}enableDiscoveryMode`, true);
    await settingsManager.updateSetting(`${prefix}regionDiscoveryTrigger`, 'onExitDiscovered');
    await settingsManager.updateSetting(`${prefix}autoDiscoverLocations`, false);
    await settingsManager.updateSetting(`${prefix}autoDiscoverExits`, false);
    await settingsManager.updateSetting(`${prefix}undiscoveredDisplay`, 'placeholder');
    await settingsManager.updateSetting(`${prefix}showUndiscoveredRegionNames`, false);
    await settingsManager.updateSetting(`${prefix}clickDiscoversRegion`, false);
    await settingsManager.updateSetting(`${prefix}disableLocationCheckUI`, true);
    logger.info('Discovery mode enabled with loop settings');
  }

  /**
   * Restore discovery settings to what they were before loop mode was entered
   * @private
   */
  async _restoreDiscoverySettings() {
    const prefix = 'moduleSettings.discovery.';
    const saved = this._savedDiscoverySettings;

    await settingsManager.updateSetting(`${prefix}enableDiscoveryMode`, saved.enableDiscoveryMode);
    await settingsManager.updateSetting(`${prefix}regionDiscoveryTrigger`, saved.regionDiscoveryTrigger);
    await settingsManager.updateSetting(`${prefix}autoDiscoverLocations`, saved.autoDiscoverLocations);
    await settingsManager.updateSetting(`${prefix}autoDiscoverExits`, saved.autoDiscoverExits);
    await settingsManager.updateSetting(`${prefix}undiscoveredDisplay`, saved.undiscoveredDisplay);
    await settingsManager.updateSetting(`${prefix}showUndiscoveredRegionNames`, saved.showUndiscoveredRegionNames);
    await settingsManager.updateSetting(`${prefix}clickDiscoversRegion`, saved.clickDiscoversRegion);
    await settingsManager.updateSetting(`${prefix}disableLocationCheckUI`, saved.disableLocationCheckUI);

    this._savedDiscoverySettings = null;
    logger.info('Discovery settings restored to pre-loop values');
  }
}

export default EventCoordinator;

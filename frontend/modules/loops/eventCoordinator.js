// eventCoordinator.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

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
        handler.bind(this),
        'loops'
      );
      this.eventSubscriptions.push(unsubscribe);
    };

    // Mana changes
    subscribe('loopState:manaChanged', this._handleManaChanged);

    // XP changes
    subscribe('loopState:xpChanged', this._handleXPChanged);

    // Pause state changes
    subscribe('loopState:paused', this._handlePaused);
    subscribe('loopState:resumed', this._handleResumed);
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

    // State manager ready
    subscribe('stateManager:ready', this._handleStateManagerReady);

    // Discovery events
    subscribe('discovery:locationDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:exitDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:regionDiscovered', this._handleDiscoveryChanged);
    subscribe('discovery:changed', this._handleDiscoveryChanged);

    // Loop reset
    subscribe('loopState:loopReset', this._handleLoopReset);

    // State loaded
    subscribe('loopState:stateLoaded', this._handleStateLoaded);

    // Explore action repeated
    subscribe('loopState:exploreActionRepeated', this._handleExploreRepeated);

    // Loop mode toggle
    subscribe('loops:setLoopMode', this._handleSetLoopMode);

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
   * Handle paused event
   * @private
   */
  _handlePaused(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updatePauseButtonState(true);
    }
  }

  /**
   * Handle resumed event
   * @private
   */
  _handleResumed(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updatePauseButtonState(false);
    }
  }

  /**
   * Handle pause state changed event
   * @private
   */
  _handlePauseStateChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI._updatePauseButtonState(data.isPaused);
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
    const autoRestartBtn = this.loopUI.rootElement?.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartBtn) {
      autoRestartBtn.textContent = data.autoRestart
        ? 'Restart when queue complete'
        : 'Pause when queue complete';
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
    if (!this.loopUI.isLoopModeActive) return;
    const actionContainer = this.loopUI.rootElement.querySelector('#current-action-container');
    if (actionContainer) {
      actionContainer.innerHTML = `<div class="no-action-message">No action in progress</div>`;
    }
  }

  /**
   * Handle state manager ready event
   * @private
   */
  _handleStateManagerReady(data) {
    logger.info('Received stateManager:ready - static data should be available');
    if (this.loopUI.isLoopModeActive) {
      logger.info('Re-rendering loop panel with full static data');
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle discovery changed events
   * @private
   */
  _handleDiscoveryChanged(data) {
    if (this.loopUI.isLoopModeActive) {
      this.loopUI.renderLoopPanel();
    }
  }

  /**
   * Handle loop reset event
   * @private
   */
  _handleLoopReset(data) {
    if (this.loopUI.isLoopModeActive) {
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
    const autoRestartBtn = this.loopUI.rootElement.querySelector(
      '#loop-ui-toggle-auto-restart'
    );
    if (autoRestartBtn) {
      autoRestartBtn.textContent = loopState.autoRestartQueue
        ? 'Restart when queue complete'
        : 'Pause when queue complete';
    }

    // Update speed slider
    const speedSlider = this.loopUI.rootElement.querySelector('#loop-ui-game-speed');
    const speedValueSpan = this.loopUI.rootElement.querySelector('#loop-ui-speed-value');
    if (speedSlider && speedValueSpan) {
      speedSlider.value = loopState.gameSpeed;
      speedValueSpan.textContent = `${loopState.gameSpeed.toFixed(1)}x`;
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
          this.loopUI.toggleLoopMode();
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
  }
}

export default EventCoordinator;

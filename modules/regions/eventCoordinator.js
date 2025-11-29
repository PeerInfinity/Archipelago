// eventCoordinator.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import { debounce } from '../commonUI/index.js';

const logger = createUniversalLogger('regionUI:Events');

/**
 * EventCoordinator
 *
 * Manages all event subscriptions and coordination for the regions panel.
 * Handles events from stateManager, playerState, UI navigation, settings, and more.
 *
 * Data Flow:
 * 1. Subscribe to all relevant events on initialization
 * 2. Route events to appropriate handlers in RegionUI
 * 3. Coordinate debounced vs immediate updates
 * 4. Unsubscribe all on cleanup
 */
export class EventCoordinator {
  constructor(eventBus, regionUI) {
    this.eventBus = eventBus;
    this.regionUI = regionUI;
    this.unsubscribeHandles = [];

    logger.debug('EventCoordinator constructed');
  }

  /**
   * Subscribe to all events
   */
  subscribeToEvents() {
    logger.info('Subscribing to EventBus events...');

    // Ensure unsubscribed first
    this.unsubscribeAll();

    if (!this.eventBus) {
      logger.error('EventBus not available for subscriptions');
      return;
    }

    const subscribe = (eventName, handler) => {
      logger.info(`Subscribing to ${eventName}`);
      const unsubscribe = this.eventBus.subscribe(eventName, handler, 'regions');
      this.unsubscribeHandles.push(unsubscribe);
    };

    // Debounced update function for frequent changes
    const debouncedUpdate = debounce(() => {
      if (this.regionUI.isInitialized) {
        logger.info('Debounced update triggered');
        this.regionUI.update();
      }
    }, 50);

    // --- stateManager:ready handler ---
    subscribe('stateManager:ready', () => this.handleStateManagerReady(debouncedUpdate));

    // --- stateManager:rulesLoaded handler ---
    subscribe('stateManager:rulesLoaded', (event) => this.handleRulesLoaded(event));

    // --- stateManager:snapshotUpdated handler ---
    subscribe('stateManager:snapshotUpdated', debouncedUpdate);

    // --- Loop and discovery events ---
    subscribe('loop:stateChanged', debouncedUpdate);
    subscribe('loop:actionCompleted', debouncedUpdate);
    subscribe('discovery:changed', debouncedUpdate);

    // --- discovery:modeChanged handler ---
    subscribe('discovery:modeChanged', (data) => {
      if (data && typeof data.active === 'boolean') {
        this.regionUI.isDiscoveryModeActive = data.active;
        logger.info(`Discovery mode changed: ${this.regionUI.isDiscoveryModeActive}`);
        debouncedUpdate();
      }
    });

    // --- settings:changed handler ---
    subscribe('settings:changed', async ({ key, value }) => {
      const updated = await this.regionUI.displaySettings.handleSettingsChanged({ key, value });
      if (updated && this.regionUI.isInitialized) {
        logger.info(`Settings changed (${key}), triggering update`);
        debouncedUpdate();
      }
    });

    // --- playerState:pathUpdated handler ---
    subscribe('playerState:pathUpdated', (eventPayload) => {
      if (eventPayload && eventPayload.path) {
        logger.info(`Received playerState:pathUpdated with ${eventPayload.path.length} regions in path`);
        this.regionUI.updateFromPlayerStatePath(eventPayload.path, eventPayload.regionCounts);
      }
    });

    // --- ui:navigateToRegion handler ---
    subscribe('ui:navigateToRegion', (eventPayload) => {
      if (eventPayload && eventPayload.regionName) {
        logger.info(`Received ui:navigateToRegion for ${eventPayload.regionName}`);
        this.regionUI.navigateToRegion(eventPayload.regionName);
      } else {
        logger.warn('Received ui:navigateToRegion without regionName', eventPayload);
      }
    });

    // --- ui:navigateToLocation handler ---
    subscribe('ui:navigateToLocation', (eventPayload) => this.handleNavigateToLocation(eventPayload));

    logger.info('Event subscriptions complete');
  }

  /**
   * Handle stateManager:ready event
   */
  handleStateManagerReady(debouncedUpdate) {
    logger.info('Received stateManager:ready event');

    // If rulesLoaded handler hasn't completed yet, defer
    if (!this.regionUI.rulesLoadedHandlerCompleted) {
      logger.info('Deferring ready handler until rulesLoaded handler completes');
      setTimeout(() => this.handleStateManagerReady(debouncedUpdate), 10);
      return;
    }

    // Check if base initialization done
    if (!this.regionUI.isInitialized) {
      logger.warn('Panel base not yet initialized by app:readyForUiDataLoad. Proceeding with render attempt.');
      // Initialize display settings if needed
      this.regionUI.displaySettings.initialize().then(() => {
        this.regionUI.showAll = this.regionUI.displaySettings.getSetting('showAll');
        this.regionUI.showPaths = this.regionUI.displaySettings.getSetting('showPaths');
      }).catch(error => {
        logger.error('Failed to initialize display settings in ready handler:', error);
      });
    }

    // Ensure originalRegionOrder is available
    if (!this.regionUI.originalRegionOrder || this.regionUI.originalRegionOrder.length === 0) {
      logger.warn('Original region order not available. Attempting to fetch now.');
      const staticData = this.regionUI.stateManager.getStaticData();
      if (staticData && staticData.regions) {
        this.regionUI.originalRegionOrder = this.regionUI.stateManager.getOriginalRegionOrder();
        logger.info(`Fetched ${this.regionUI.originalRegionOrder.length} region keys for original order`);
      } else {
        logger.error('Failed to fetch static data/regions for original order');
      }
    }

    // Initialize visitedRegions with Menu if showAll is false
    if (!this.regionUI.showAll && this.regionUI.visitedRegions.length === 0) {
      logger.info("Show All is off and visitedRegions is empty, setting start region to 'Menu'");
      this.regionUI.showStartRegion('Menu');
    } else if (this.regionUI.showAll) {
      logger.info('Show All is on, visitedRegions will be based on all regions');
    }

    logger.info('Triggering initial full display update');
    this.regionUI.update();
  }

  /**
   * Handle stateManager:rulesLoaded event
   */
  handleRulesLoaded(event) {
    logger.info('Received stateManager:rulesLoaded event. Full refresh triggered with state reset.');

    const newSnapshot = event.snapshot;
    if (!newSnapshot) {
      logger.warn('Snapshot missing from event payload. Aborting refresh.');
      return;
    }

    // RESET UI STATE
    logger.info('Resetting panel state...');
    this.regionUI.visitedRegions = [];
    this.regionUI.expansionState.clearAll();
    this.regionUI.navigationTarget = null;
    this.regionUI.nextUID = 1;
    this.regionUI.rulesLoadedHandlerCompleted = false;

    // Clear the UI display
    this.regionUI.clear();

    // Fetch and store new static data
    const staticData = this.regionUI.stateManager.getStaticData();
    if (staticData && staticData.regions) {
      this.regionUI.originalRegionOrder = this.regionUI.stateManager.getOriginalRegionOrder();
      logger.info(`Stored ${this.regionUI.originalRegionOrder ? this.regionUI.originalRegionOrder.length : 0} region keys for original order`);
    } else {
      logger.warn('Static data or regions not available. Panel may not sort correctly.');
      this.regionUI.originalRegionOrder = [];
    }

    // Re-initialize with start region
    if (!this.regionUI.showAll) {
      logger.info("Show All is off, resetting to start region 'Menu'");
      this.regionUI.showStartRegion('Menu');
    } else {
      logger.info('Triggering full display update after state reset');
      this.regionUI.update();
    }

    // Mark completed
    this.regionUI.rulesLoadedHandlerCompleted = true;
  }

  /**
   * Handle ui:navigateToLocation event
   */
  handleNavigateToLocation(eventPayload) {
    if (eventPayload && eventPayload.regionName && eventPayload.locationName) {
      logger.info(`Received ui:navigateToLocation for ${eventPayload.locationName} in ${eventPayload.regionName}`);

      // Navigate to the region containing the location
      this.regionUI.navigateToRegion(eventPayload.regionName);

      // After delay, scroll to the specific location
      setTimeout(() => {
        const locationElement = document.querySelector(
          `li.location-item[data-location-name="${eventPayload.locationName}"]`
        );
        if (locationElement) {
          locationElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });

          // Add temporary highlight effect
          locationElement.style.transition = 'background-color 0.3s ease';
          const originalBg = locationElement.style.backgroundColor;
          locationElement.style.backgroundColor = 'rgba(255, 255, 100, 0.3)';
          setTimeout(() => {
            locationElement.style.backgroundColor = originalBg;
          }, 2000);
        } else {
          logger.warn(`Could not find location element for ${eventPayload.locationName}`);
        }
      }, 300); // Wait for region expansion animation
    } else {
      logger.warn('Received ui:navigateToLocation with missing data', eventPayload);
    }
  }

  /**
   * Unsubscribe from all events
   */
  unsubscribeAll() {
    logger.info(`Unsubscribing from ${this.unsubscribeHandles.length} events`);
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = [];
  }
}

export default EventCoordinator;

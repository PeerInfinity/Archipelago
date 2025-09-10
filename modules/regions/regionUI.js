// regionUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { PathAnalyzerUI } from '../pathAnalyzer/index.js';
import commonUI from '../commonUI/index.js';
import messageHandler from '../client/core/messageHandler.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import { debounce } from '../commonUI/index.js';
// Import the exported dispatcher from the module's index
import { moduleDispatcher } from './index.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import {
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from '../commonUI/index.js';
import { RegionBlockBuilder } from './regionBlockBuilder.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('regionUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[regionUI] ${message}`, ...data);
  }
}

export class RegionUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;

    // Add instance property for unsubscribe handles
    this.unsubscribeHandles = [];

    /**
     * visitedRegions is an array of objects:
     * [{ name: 'Links House', expanded: true, uid: 0 }, ...]
     */
    this.visitedRegions = [];
    this.originalRegionOrder = [];
    this.rulesLoadedHandlerCompleted = false;
    this.renderDeferralAttempted = false;

    // A simple counter to give each visited region block a unique ID
    this.nextUID = 1;

    // If set to true, we'll show **all** regions, ignoring the visited chain
    this.showAll = false;
    // If set to true, we'll show the full visited path. If false, only show last region
    this.showPaths = true;
    this.isInitialized = false; // Add flag
    this.colorblindSettings = false; // Add colorblind settings cache
    this.navigationTarget = null; // Add navigation target state
    
    // Separate tracking for "Show All" mode expansion states
    // Map of regionName -> boolean (expanded state)
    this.showAllExpansionState = new Map();

    // Create the path analyzer and block builder
    this.pathAnalyzer = new PathAnalyzerUI(this);
    this.regionBlockBuilder = new RegionBlockBuilder(this);
    this.rootElement = this.createRootElement();
    this.regionsContainer = this.rootElement.querySelector(
      '#region-details-container' // Changed selector
    );
    this.statusElement = null; // Initialize status element ref

    this.container.element.appendChild(this.rootElement);

    // Event listeners for controls on the static rootElement can be attached here
    this.attachEventListeners();

    // Defer full data-dependent initialization (including _subscribeToEvents via initialize)
    const readyHandler = (eventPayload) => {
      log(
        'info',
        '[RegionUI] Received app:readyForUiDataLoad. Initializing base panel structure and event listeners.'
      );
      this.initialize(); // This will call _subscribeToEvents

      // DO NOT proactively fetch data or render here.
      // Static data (like original orders) will be fetched on 'stateManager:rulesLoaded'.
      // Full render will occur on 'stateManager:ready'.

      // Initialize settings cache and showAll state here as they don't depend on StateManager data
      this.colorblindSettings = false; // Will be loaded async
      this._loadColorblindSettings();
      const showAllCheckbox =
        this.rootElement.querySelector('#show-all-regions');
      this.showAll = showAllCheckbox ? showAllCheckbox.checked : false;

      this.isInitialized = true; // Mark that basic panel setup is done.
      log(
        'info',
        '[RegionUI] Basic panel setup complete after app:readyForUiDataLoad. Awaiting StateManager readiness.'
      );

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'regions');

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  // Called by PanelManager when panel is created/shown
  initialize() {
    log('info', '[RegionUI] Initializing panel...');
    this.isInitialized = false; // Reset flag
    this.clear(); // Clear previous state
    this._subscribeToEvents(); // Subscribe here
    // Initial render is triggered by stateManager:ready
  }

  _subscribeToEvents() {
    log('info', '[RegionUI] Subscribing instance to EventBus events...');
    // Ensure unsubscribed first
    this.unsubscribeHandles.forEach((u) => u());
    this.unsubscribeHandles = [];

    if (!eventBus) {
      log('error', '[RegionUI] EventBus not available for subscriptions.');
      return;
    }

    const subscribe = (eventName, handler) => {
      log('info', `[RegionUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler, 'regions');
      this.unsubscribeHandles.push(unsubscribe);
    };

    // --- ADDED: Handler for stateManager:ready --- Similar to LocationUI/ExitUI
    const handleReady = () => {
      log('info', '[RegionUI] Received stateManager:ready event.');
      // This event confirms StateManager is fully ready (static data and initial snapshot).
      // originalRegionOrder should have been populated by the 'stateManager:rulesLoaded' handler.
      
      // If rulesLoaded handler hasn't completed yet, defer this call
      if (!this.rulesLoadedHandlerCompleted) {
        log('info', '[RegionUI stateManager:ready] Deferring ready handler until rulesLoaded handler completes.');
        // Use a short delay to allow rulesLoaded handler to complete
        setTimeout(() => handleReady(), 10);
        return;
      }

      if (!this.isInitialized) {
        log(
          'warn',
          '[RegionUI stateManager:ready] Panel base not yet initialized by app:readyForUiDataLoad. This is unexpected. Proceeding with render attempt.'
        );
        // Initialize settings cache and showAll state if not done by app:readyForUiDataLoad handler
        this.colorblindSettings = false; // Will be loaded async
        this._loadColorblindSettings();
        const showAllCheckbox =
          this.rootElement.querySelector('#show-all-regions');
        this.showAll = showAllCheckbox ? showAllCheckbox.checked : false;
      }

      // Ensure originalRegionOrder is available (it should be from rulesLoaded handler)
      if (!this.originalRegionOrder || this.originalRegionOrder.length === 0) {
        log(
          'warn',
          '[RegionUI stateManager:ready] Original region order not available. Attempting to fetch now.'
        );
        const currentStaticData = stateManager.getStaticData();
        if (currentStaticData && currentStaticData.regions) {
          this.originalRegionOrder = stateManager.getOriginalRegionOrder();
          log(
            'info',
            `[RegionUI stateManager:ready] Fetched ${this.originalRegionOrder.length} region keys for original order.`
          );
        } else {
          log(
            'error',
            '[RegionUI stateManager:ready] Failed to fetch static data/regions for original order. Region panel may not display correctly.'
          );
        }
      }

      // Initialize visitedRegions with Menu if showAll is false
      // This needs to happen after staticData is confirmed (for region existence checks within showStartRegion)
      // and originalRegionOrder is available.
      if (!this.showAll && this.visitedRegions.length === 0) {
        log(
          'info',
          "[RegionUI stateManager:ready] Show All is off and visitedRegions is empty, setting start region to 'Menu'."
        );
        this.showStartRegion('Menu');
      } else if (this.showAll) {
        log(
          'info',
          '[RegionUI stateManager:ready] Show All is on, visitedRegions will be based on all regions.'
        );
      }

      log(
        'info',
        '[RegionUI stateManager:ready] Triggering initial full display update.'
      );
      this.update(); // This is now the primary trigger for the first full render.
    };
    subscribe('stateManager:ready', handleReady);
    // --- END ADDED ---

    // Debounced update function for subsequent changes
    const debouncedUpdate = debounce(() => {
      if (this.isInitialized) {
        // Only update if initialized
        log('info', '[RegionUI] Debounced update triggered.');
        this.update();
      } else {
        // log('info', '[RegionUI] Debounced update skipped (not initialized).');
      }
    }, 50);

    // --- Subscribe to snapshot updated for general state changes ---
    subscribe('stateManager:snapshotUpdated', debouncedUpdate);

    // REMOVE: old individual state subscriptions if covered by snapshot
    /*
    subscribe('stateManager:inventoryChanged', (data) => ... );
    subscribe('stateManager:regionsComputed', (data) => ... );
    subscribe('stateManager:locationChecked', (data) => ... );
    subscribe('stateManager:checkedLocationsCleared', (data) => ... );
    */

    // Subscribe to loop state changes (still relevant)
    subscribe('loop:stateChanged', debouncedUpdate);
    subscribe('loop:actionCompleted', debouncedUpdate);
    subscribe('loop:discoveryChanged', debouncedUpdate);
    subscribe('loop:modeChanged', debouncedUpdate);

    // Subscribe to settings changes
    const settingsHandler = ({ key, value }) => {
      if (key === '*' || key.startsWith('colorblindMode.regions')) {
        log(
          'info',
          `[RegionUI] Settings changed (${key}), updating cache and triggering update.`
        );
        // Update local cache
        this._loadColorblindSettings();
        if (this.isInitialized) debouncedUpdate(); // Trigger redraw if initialized
      }
    };
    subscribe('settings:changed', settingsHandler);

    // --- BEGIN ADDED: Handler for stateManager:rulesLoaded ---
    subscribe('stateManager:rulesLoaded', (event) => {
      log(
        'info',
        '[RegionUI] Received stateManager:rulesLoaded event. Full refresh triggered with state reset.'
      );

      // Access snapshot from event (this is the new initial snapshot for the loaded rules)
      const newSnapshot = event.snapshot;
      if (!newSnapshot) {
        log(
          'warn',
          '[RegionUI rulesLoaded] Snapshot missing from event payload. Aborting refresh.'
        );
        return;
      }

      // RESET UI STATE: Clear all panel-specific state that should reset when rules are reloaded
      log('info', '[RegionUI rulesLoaded] Resetting panel state...');
      this.visitedRegions = []; // Clear all visited regions
      this.showAllExpansionState.clear(); // Clear expansion states for "Show All" mode
      this.navigationTarget = null; // Clear any navigation target
      this.nextUID = 1; // Reset UID counter
      this.rulesLoadedHandlerCompleted = false; // Reset flag at start of handler
      
      // Force clear the UI display immediately to remove any stale DOM content
      this.clear(); // This will clear the regions container and reset expansion states

      // Fetch and store the NEW static data, including the original region order.
      const currentStaticData = stateManager.getStaticData();
      if (currentStaticData && currentStaticData.regions) {
        this.originalRegionOrder = stateManager.getOriginalRegionOrder();
        log(
          'info',
          `[RegionUI rulesLoaded] Stored ${
            this.originalRegionOrder ? this.originalRegionOrder.length : 0
          } region keys for original order.`
        );
      } else {
        log(
          'warn',
          '[RegionUI rulesLoaded] Static data or regions not available from proxy when trying to refresh order. Panel may not sort correctly.'
        );
        this.originalRegionOrder = []; // Reset if not available
      }

      // After state reset, re-initialize with the start region if 'Show All' is off
      // This ensures we always start fresh with the default region
      if (!this.showAll) {
        log(
          'info',
          "[RegionUI rulesLoaded] Show All is off, resetting to start region 'Menu'."
        );
        // showStartRegion internally calls this.update() if successful
        this.showStartRegion('Menu');
      } else {
        // If 'Show All' is on, trigger a full display update directly.
        log('info', '[RegionUI rulesLoaded] Triggering full display update after state reset.');
        this.update(); // this.update() calls renderAllRegions()
      }
      
      // Mark that rulesLoaded handler has completed
      this.rulesLoadedHandlerCompleted = true;
    });
    // --- END ADDED ---

    // Subscribe to playerState path updates
    const handlePathUpdated = (eventPayload) => {
      if (eventPayload && eventPayload.path) {
        log(
          'info',
          `[RegionUI] Received playerState:pathUpdated with ${eventPayload.path.length} regions in path`
        );
        // Convert path data from playerState to visitedRegions format
        this.updateFromPlayerStatePath(eventPayload.path, eventPayload.regionCounts);
      }
    };
    subscribe('playerState:pathUpdated', handlePathUpdated);

    // Subscribe to region navigation requests
    const handleNavigateToRegion = (eventPayload) => {
      if (eventPayload && eventPayload.regionName) {
        log(
          'info',
          `[RegionUI] Received ui:navigateToRegion for ${eventPayload.regionName}. Calling this.navigateToRegion.`
        );
        this.navigateToRegion(eventPayload.regionName);
      } else {
        log(
          'warn',
          '[RegionUI] Received ui:navigateToRegion without regionName.',
          eventPayload
        );
      }
    };
    subscribe('ui:navigateToRegion', handleNavigateToRegion);
    log('info', '[RegionUI] SUCCESSFULLY SUBSCRIBED to ui:navigateToRegion'); // DEBUG LOG

    // Subscribe to user:regionMove events
    const handleRegionMove = (eventPayload) => {
      if (eventPayload && eventPayload.sourceRegion && eventPayload.targetRegion) {
        log(
          'info',
          `[RegionUI] Received user:regionMove from ${eventPayload.sourceRegion} to ${eventPayload.targetRegion}`
        );
        this.moveToRegion(eventPayload.sourceRegion, eventPayload.targetRegion, eventPayload.sourceUID);
      } else {
        log(
          'warn',
          '[RegionUI] Received user:regionMove with missing data.',
          eventPayload
        );
      }
    };
    subscribe('user:regionMove', handleRegionMove);

    log('info', '[RegionUI] Event subscriptions complete.');
  }

  async _loadColorblindSettings() {
    try {
      this.colorblindSettings = await settingsManager.getSetting('colorblindMode.regions', false);
      log('debug', `[RegionUI] Loaded colorblind settings: ${this.colorblindSettings}`);
    } catch (error) {
      log('error', '[RegionUI] Failed to load colorblind settings:', error);
      this.colorblindSettings = false;
    }
  }

  onPanelDestroy() {
    log('info', '[RegionUI] Cleaning up subscriptions...');
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = []; // Clear handles
    this.pathAnalyzer?.dispose?.();
    log('info', '[RegionUI] Cleanup complete.');
  }

  dispose() {
    this.onPanelDestroy();
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('regions-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
      <div class="control-group region-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <input type="search" id="region-search" placeholder="Search regions..." style="margin-right: 10px;">
        <select id="region-sort-select" style="margin-right: 10px;">
          <option value="original">Original Order</option>
          <option value="alphabetical">Sort Alphabetical</option>
          <option value="accessibility_original">Sort by Accessibility (Original)</option>
          <option value="accessibility">Sort by Accessibility (Name)</option>
          <!-- Add original order later if needed for regions -->
        </select>
        <label style="margin-right: 10px;">
          <input type="checkbox" id="region-show-reachable" checked />
          Show Reachable
        </label>
        <label style="margin-right: 10px;">
          <input type="checkbox" id="region-show-unreachable" checked />
          Show Unreachable
        </label>
        <label style="margin-right: 10px;">
          <input type="checkbox" id="show-all-regions" />
          Show All Regions
        </label>
        <label style="margin-right: 10px;">
          <input type="checkbox" id="show-paths" checked />
          Show Paths
        </label>
        <button id="expand-collapse-all">Expand All</button>
      </div>
      <div id="region-details-container" style="flex-grow: 1; overflow-y: auto; padding: 0.5rem;">
          <div id="accessibility-sorted-sections">
            <div id="available-regions-section" class="region-category">
                <h3>Available</h3>
                <div class="region-category-content"></div>
            </div>
            <div id="unavailable-regions-section" class="region-category">
                <h3>Unavailable / Unknown</h3>
                <div class="region-category-content"></div>
            </div>
             <!-- Add other sections if needed (e.g., completed) -->
          </div>
          <div id="general-sorted-list-section" style="display: none;">
              <div class="region-category-content"></div>
          </div>
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  attachEventListeners() {
    // Search Input
    const searchInput = this.rootElement.querySelector('#region-search');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce(() => this.renderAllRegions(), 250)
      );
    }

    // Sort Select
    const sortSelect = this.rootElement.querySelector('#region-sort-select');
    if (sortSelect) {
      sortSelect.addEventListener('change', () => this.renderAllRegions());
    }

    // Filter Checkboxes
    const reachableCheckbox = this.rootElement.querySelector(
      '#region-show-reachable'
    );
    if (reachableCheckbox) {
      reachableCheckbox.addEventListener('change', () =>
        this.renderAllRegions()
      );
    }
    const unreachableCheckbox = this.rootElement.querySelector(
      '#region-show-unreachable'
    );
    if (unreachableCheckbox) {
      unreachableCheckbox.addEventListener('change', () =>
        this.renderAllRegions()
      );
    }

    // Existing Show All/Visited Path Checkbox
    const showAllRegionsCheckbox =
      this.rootElement.querySelector('#show-all-regions');
    if (showAllRegionsCheckbox) {
      showAllRegionsCheckbox.addEventListener('change', (e) => {
        this.showAll = e.target.checked;
        
        // When switching from "Show All" to navigation mode, clean up the visitedRegions array
        if (!this.showAll) {
          // Remove all entries with UIDs starting with "all_" (these were added for "Show All" mode)
          this.visitedRegions = this.visitedRegions.filter(region => 
            !region.uid.toString().startsWith('all_')
          );
          
          // If no navigation regions remain, show the start region
          if (this.visitedRegions.length === 0) {
            this.showStartRegion('Menu');
          }
        }
        
        this.renderAllRegions();
      });
    }

    // Show Paths checkbox
    const showPathsCheckbox = this.rootElement.querySelector('#show-paths');
    if (showPathsCheckbox) {
      showPathsCheckbox.addEventListener('change', (e) => {
        this.showPaths = e.target.checked;
        this.renderAllRegions();
      });
    }

    const expandCollapseAllButton = this.rootElement.querySelector(
      '#expand-collapse-all'
    );
    if (expandCollapseAllButton) {
      expandCollapseAllButton.addEventListener('click', () => {
        if (expandCollapseAllButton.textContent === 'Expand All') {
          this.expandAllRegions();
          expandCollapseAllButton.textContent = 'Collapse All';
        } else {
          this.collapseAllRegions();
          expandCollapseAllButton.textContent = 'Expand All';
        }
      });
    }
  }

  clear() {
    log('info', '[RegionUI] Clearing visited regions state.');
    this.visitedRegions = [];
    this.nextUID = 1;
    this.showAllExpansionState.clear(); // Clear "Show All" expansion state
    // REMOVED: Direct DOM manipulation, renderAllRegions handles clearing content
    /*
    if (this.regionsContainer) { ... }
    this._updateSectionVisibility(); 
    */
  }
  
  /**
   * Update visitedRegions from playerState path data
   * @param {Array} path - Path array from playerState
   * @param {Map} regionCounts - Region instance counts from playerState
   */
  updateFromPlayerStatePath(path, regionCounts) {
    if (!path || path.length === 0) {
      log('warn', '[RegionUI] Received empty path from playerState');
      return;
    }
    
    // Standard navigation behavior: only the last (current) region should be expanded
    // Reset visitedRegions and rebuild from path
    this.visitedRegions = [];
    this.nextUID = 1;
    
    // Filter for only regionMove entries
    const regionMoves = path.filter(entry => entry.type === 'regionMove');
    
    regionMoves.forEach((pathEntry, index) => {
      const uid = this.nextUID++;
      const isLastRegion = index === regionMoves.length - 1;
      
      // Only the last region (current region) should be expanded
      const expanded = isLastRegion;
      
      this.visitedRegions.push({
        name: pathEntry.region,
        expanded: expanded,
        uid: uid,
        exitUsed: pathEntry.exitUsed,
        instanceNumber: pathEntry.instanceNumber
      });
    });
    
    // Update the display
    this.renderAllRegions();
  }

  update() {
    // Renamed from renderAllRegions to update, to be consistent with other panels
    log('info', '[RegionUI] update() called, calling renderAllRegions().');
    this.renderAllRegions();
  }

  async showStartRegion(startRegionName) {
    log(
      'info',
      `[RegionUI] Attempting to show start region: ${startRegionName}`
    );
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();

    // Ensure staticData and regions are available before proceeding
    if (!staticData || !staticData.regions || !snapshot) {
      log(
        'warn',
        `[RegionUI] Warning: start region ${startRegionName} not found or state/static data not ready.`
      );
      this.visitedRegions = []; // Clear if data not ready
      return;
    }

    // Check if the start region exists in the static data
    if (!staticData.regions[startRegionName]) {
      log(
        'warn',
        `[RegionUI] Start region ${startRegionName} does not exist in static region data.`
      );
      this.visitedRegions = []; // Clear if region doesn't exist
      return;
    }

    log('info', `[RegionUI] Setting start region: ${startRegionName}`);
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true,
        uid: this.nextUID++,
      },
    ];
    this.update(); // Update display after setting start region
  }

  moveToRegion(oldRegionName, newRegionName, sourceUID) {
    // The Regions module no longer directly manages the path - it's handled by playerState
    // This method is called when the module receives a user:regionMove event
    // The actual path update happens in playerState, and we'll receive the update via playerState:pathUpdated
    
    log('info', `[RegionUI] moveToRegion called: ${oldRegionName} -> ${newRegionName} (UID: ${sourceUID})`);
    
    // If we clicked on a region in the path to navigate backwards
    if (sourceUID && !this.showAll) {
      // Find which instance of the region this is based on UID
      let instanceNumber = 0;
      let foundRegion = null;
      
      for (const vr of this.visitedRegions) {
        if (vr.name === oldRegionName) {
          instanceNumber++;
        }
        if (vr.uid == sourceUID) {
          foundRegion = vr;
          break;
        }
      }
      
      if (foundRegion && foundRegion.instanceNumber) {
        // Use the instance number from the visitedRegions entry if available
        instanceNumber = foundRegion.instanceNumber;
      }
      
      // Check if we're navigating backwards (clicking on an earlier region in the path)
      const currentIndex = this.visitedRegions.findIndex(r => r.uid == sourceUID);
      const isLastRegion = currentIndex === this.visitedRegions.length - 1;
      
      if (!isLastRegion && currentIndex >= 0) {
        // Navigating backwards - trim the path at this region
        log('info', `[RegionUI] Navigating backwards to ${oldRegionName} instance ${instanceNumber}`);
        if (eventBus) {
          eventBus.publish('playerState:trimPath', {
            regionName: oldRegionName,
            instanceNumber: instanceNumber
          }, 'regions');
        }
        return;
      }
    }
    
    // For forward navigation or "Show All" mode, the playerState will handle the path update
    // We'll receive the updated path via playerState:pathUpdated event
  }

  toggleRegionByUID(uid) {
    const block = this.visitedRegions.find((r) => r.uid === uid);
    if (block) {
      block.expanded = !block.expanded;
      // Also update showAllExpansionState if this is a "Show All" mode region
      if (typeof uid === 'string' && uid.startsWith('all_')) {
        const regionName = uid.substring(4);
        this.showAllExpansionState.set(regionName, block.expanded);
      }
    } else if (typeof uid === 'string' && uid.startsWith('all_')) {
      // Handle regions in "Show All" mode using separate tracking
      const regionName = uid.substring(4); // Extract region name from uid like "all_RegionName"
      const currentState = this.showAllExpansionState.get(regionName) || false;
      this.showAllExpansionState.set(regionName, !currentState);
    }
    this.renderAllRegions();
  }

  expandAllRegions() {
    // Use staticData for the list of all regions
    const staticData = stateManager.getStaticData();
    if (this.showAll) {
      if (!staticData || !staticData.regions) {
        // Check staticData
        log(
          'warn',
          '[RegionUI] Static region data not ready in expandAllRegions'
        );
        return;
      }
      // Use separate tracking for "Show All" mode - don't pollute visitedRegions
      Object.keys(staticData.regions).forEach((regionName) => {
        this.showAllExpansionState.set(regionName, true);
      });
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = true;
      });
    }
    this.renderAllRegions();
  }

  collapseAllRegions() {
    // Use staticData for the list of all regions
    const staticData = stateManager.getStaticData();
    if (this.showAll) {
      if (!staticData || !staticData.regions) {
        // Check staticData
        log(
          'warn',
          '[RegionUI] Static region data not ready in collapseAllRegions'
        );
        return;
      }
      // Use separate tracking for "Show All" mode - don't pollute visitedRegions
      Object.keys(staticData.regions).forEach((regionName) => {
        this.showAllExpansionState.set(regionName, false);
      });
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = false;
      });
    }
    this.renderAllRegions();
  }

  renderAllRegions() {
    log('info', '[RegionUI] renderAllRegions called.');

    // Ensure the panel's basic initialization (DOM structure, non-data listeners) is done.
    if (!this.isInitialized) {
      log(
        'warn',
        '[RegionUI renderAllRegions] Panel not yet initialized by app:readyForUiDataLoad. Aborting display update.'
      );
      return;
    }

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    // Correctly define and query for section divs from this.regionsContainer
    const accessibilitySortedSectionsDiv = this.regionsContainer.querySelector(
      '#accessibility-sorted-sections'
    );
    const generalSortedListSectionDiv = this.regionsContainer.querySelector(
      '#general-sorted-list-section'
    );

    // Declare content containers, will be assigned below
    let availableContentContainer = null;
    let unavailableContentContainer = null;
    let generalSortedListContent = null;

    // Get references to structural elements AND ASSIGN content containers
    // Note: The console.warn messages remain, which is good for debugging if elements are still not found.
    if (accessibilitySortedSectionsDiv) {
      availableContentContainer = accessibilitySortedSectionsDiv.querySelector(
        '#available-regions-section .region-category-content'
      );
      unavailableContentContainer =
        accessibilitySortedSectionsDiv.querySelector(
          '#unavailable-regions-section .region-category-content'
        );
    } else {
      log(
        'warn',
        '[RegionUI renderAllRegions] #accessibility-sorted-sections div not found in this.regionsContainer.'
      );
    }

    if (generalSortedListSectionDiv) {
      generalSortedListContent = generalSortedListSectionDiv.querySelector(
        '.region-category-content'
      );
    } else {
      log(
        'warn',
        '[RegionUI renderAllRegions] #general-sorted-list-section div not found in this.regionsContainer.'
      );
    }

    // Now log the status of all these correctly assigned (or null) variables
    //log('info',
    //  `[RegionUI renderAllRegions] Start State - Snapshot: ${!!snapshot} Static Data: ${!!staticData} accessibilitySortedSectionsDiv: ${!!accessibilitySortedSectionsDiv} generalSortedListSectionDiv: ${!!generalSortedListSectionDiv} availableContentContainer: ${!!availableContentContainer} unavailableContentContainer: ${!!unavailableContentContainer} generalSortedListContent: ${!!generalSortedListContent}`
    //);

    if (!snapshot || !staticData || !staticData.regions || !staticData.items) {
      log(
        'warn',
        '[RegionUI] Static region data or snapshot not ready. Displaying loading message.'
      );
      if (this.regionsContainer) {
        this.regionsContainer.innerHTML = '<p>Loading region data...</p>';
      }
      return;
    }

    if (!this.originalRegionOrder || this.originalRegionOrder.length === 0) {
      // Fallback fetch, though ideally it's populated by stateManager:rulesLoaded
      const freshlyFetchedOrder = stateManager.getOriginalRegionOrder();
      if (freshlyFetchedOrder && freshlyFetchedOrder.length > 0) {
        this.originalRegionOrder = freshlyFetchedOrder;
        log(
          'info',
          `[RegionUI renderAllRegions] Fallback fetch for originalRegionOrder succeeded: ${this.originalRegionOrder.length} items.`
        );
      } else {
        // If still no order available, defer this render until ready (but only once)
        if (!this.renderDeferralAttempted) {
          this.renderDeferralAttempted = true;
          log(
            'debug',
            '[RegionUI renderAllRegions] Original region order not yet available. Deferring render...'
          );
          // Schedule a retry after a short delay to allow initialization to complete
          setTimeout(() => {
            this.renderDeferralAttempted = false; // Reset flag for future deferrals
            if (!this.originalRegionOrder || this.originalRegionOrder.length === 0) {
              // If still no order after delay, proceed anyway (will use default sorting)
              log('debug', '[RegionUI renderAllRegions] Proceeding with default sorting after delay.');
            }
            this.renderAllRegions();
          }, 50);
          return; // Exit early to prevent rendering without proper order
        }
        // If we've already attempted deferral, proceed with default sorting
        log('debug', '[RegionUI renderAllRegions] Proceeding with default sorting (no deferral).');
      }
    }

    // Reset the unknown evaluation counter for this rendering cycle
    resetUnknownEvaluationCounter();

    const useColorblind = this.colorblindSettings;

    // Get references to structural elements within this.regionsContainer
    // this.regionsContainer is this.rootElement.querySelector('#region-details-container') (set in constructor)
    // availableContentContainer, unavailableContentContainer, and generalSortedListContent are now assigned above.

    if (!staticData?.regions || !snapshot) {
      log(
        'warn',
        '[RegionUI] Static region data or snapshot not ready. Displaying loading message.'
      );
      if (availableContentContainer) availableContentContainer.innerHTML = '';
      if (unavailableContentContainer)
        unavailableContentContainer.innerHTML = '';

      if (generalSortedListContent) {
        generalSortedListContent.innerHTML = '<p>Loading region data...</p>';
      } else {
        // Fallback if the structure is somehow missing, use the main container but this is not ideal
        log(
          'error',
          '[RegionUI] generalSortedListContent not found! Cannot display loading message correctly.'
        );
        if (this.regionsContainer)
          this.regionsContainer.innerHTML =
            '<p>Loading region data... (structure fault)</p>';
      }

      if (accessibilitySortedSectionsDiv)
        accessibilitySortedSectionsDiv.style.display = 'none';
      if (generalSortedListSectionDiv)
        generalSortedListSectionDiv.style.display = ''; // Ensure general section (with loading msg) is visible

      // this._updateSectionVisibility(); // Not strictly needed here as we manually set display styles
      return;
    }

    // If data is ready, proceed with full rendering.
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      log(
        'error',
        '[RegionUI] Failed to create snapshot interface. Rendering may be incomplete.'
      );
      // Potentially return or show error message
    }

    // Clear content areas before populating
    if (availableContentContainer) availableContentContainer.innerHTML = '';
    if (unavailableContentContainer) unavailableContentContainer.innerHTML = '';
    if (generalSortedListContent) generalSortedListContent.innerHTML = '';

    // --- Enhanced Diagnostic Logging (can be removed after fix is confirmed) ---
    // log('info', '[RegionUI PRE-QUERY] About to query #region-sort-select.');
    // ... (rest of the diagnostic block can be removed or commented out) ...
    // --- End Enhanced Diagnostic Logging ---

    const sortSelectElement = this.rootElement.querySelector(
      '#region-sort-select'
    );
    if (!sortSelectElement) {
      log(
        'error',
        '[RegionUI renderAllRegions] #region-sort-select NOT FOUND within this.rootElement!'
      );
      // Fallback or return if this critical control is missing
      this._updateSectionVisibility();
      return;
    }
    const sortMethod = sortSelectElement.value;

    // Determine which sections to display based on sortMethod and showAll
    const useAccessibilitySections =
      this.showAll && sortMethod.startsWith('accessibility');

    if (useAccessibilitySections) {
      if (accessibilitySortedSectionsDiv)
        accessibilitySortedSectionsDiv.style.display = '';
      if (generalSortedListSectionDiv)
        generalSortedListSectionDiv.style.display = 'none';
    } else {
      if (accessibilitySortedSectionsDiv)
        accessibilitySortedSectionsDiv.style.display = 'none';
      if (generalSortedListSectionDiv)
        generalSortedListSectionDiv.style.display = '';
    }

    // const regionContainer = this.rootElement.querySelector('#region-details-container'); // Already have this.regionsContainer
    // No need to re-query if this.regionsContainer is used consistently

    const searchTerm = this.rootElement
      .querySelector('#region-search')
      .value.toLowerCase();
    const showReachable = this.rootElement.querySelector(
      '#region-show-reachable'
    ).checked;
    const showUnreachable = this.rootElement.querySelector(
      '#region-show-unreachable'
    ).checked;

    let regionsToRender = [];
    if (this.showAll) {
      regionsToRender = Object.keys(staticData.regions).map((name) => ({
        name,
        isVisited: false,
        uid: `all_${name}`,
        expanded:
          name === this.navigationTarget || // Expand if it's the navigation target
          this.showAllExpansionState.get(name) || // Use separate tracking for "Show All" mode
          false,
        isReachable:
          snapshot.regionReachability?.[name] === true ||
          snapshot.regionReachability?.[name] === 'reachable' ||
          snapshot.regionReachability?.[name] === 'checked',
      }));
    } else {
      // Check if path is too long - show truncated view if path length > 2x total regions
      const totalRegions = Object.keys(staticData.regions).length;
      const pathTooLong = this.visitedRegions.length > (totalRegions * 2);
      
      // When showAll is false, check showPaths to determine what to render
      if (this.showPaths) {
        if (pathTooLong) {
          // Show first n and last n regions with skip indicator
          const n = totalRegions;
          const firstN = this.visitedRegions.slice(0, n);
          const lastN = this.visitedRegions.slice(-n);
          
          // Create regions to render array
          regionsToRender = [];
          
          // Add first n regions
          regionsToRender.push(...firstN.map((vr) => ({
            name: vr.name,
            isVisited: true,
            uid: vr.uid,
            expanded: vr.name === this.navigationTarget || vr.expanded,
            isReachable:
              snapshot.regionReachability?.[vr.name] === true ||
              snapshot.regionReachability?.[vr.name] === 'reachable' ||
              snapshot.regionReachability?.[vr.name] === 'checked',
          })));
          
          // Add skip indicator if there are skipped regions
          const skippedCount = this.visitedRegions.length - (2 * n);
          if (skippedCount > 0) {
            regionsToRender.push({
              name: `... ${skippedCount} regions skipped ...`,
              isVisited: true,
              uid: 'skip_indicator',
              expanded: false,
              isReachable: true,
              isSkipIndicator: true,
            });
          }
          
          // Add last n regions (avoid duplicates if path is short)
          const lastNFiltered = lastN.filter(vr => 
            !firstN.some(firstRegion => firstRegion.uid === vr.uid)
          );
          regionsToRender.push(...lastNFiltered.map((vr) => ({
            name: vr.name,
            isVisited: true,
            uid: vr.uid,
            expanded: vr.name === this.navigationTarget || vr.expanded,
            isReachable:
              snapshot.regionReachability?.[vr.name] === true ||
              snapshot.regionReachability?.[vr.name] === 'reachable' ||
              snapshot.regionReachability?.[vr.name] === 'checked',
          })));
        } else {
          // Show full path
          regionsToRender = this.visitedRegions.map((vr) => ({
            name: vr.name,
            isVisited: true,
            uid: vr.uid,
            expanded: vr.name === this.navigationTarget || vr.expanded,
            isReachable:
              snapshot.regionReachability?.[vr.name] === true ||
              snapshot.regionReachability?.[vr.name] === 'reachable' ||
              snapshot.regionReachability?.[vr.name] === 'checked',
          }));
        }
      } else {
        // Show only last region, always expanded
        if (this.visitedRegions.length > 0) {
          const lastRegion = this.visitedRegions[this.visitedRegions.length - 1];
          regionsToRender = [{
            name: lastRegion.name,
            isVisited: true,
            uid: lastRegion.uid,
            expanded: true, // Always expanded when showing only last region
            isReachable:
              snapshot.regionReachability?.[lastRegion.name] === true ||
              snapshot.regionReachability?.[lastRegion.name] === 'reachable' ||
              snapshot.regionReachability?.[lastRegion.name] === 'checked',
          }];
        } else {
          regionsToRender = [];
        }
      }
      // log('info', '[RegionUI] "Show All" is OFF. Initial regionsToRender from visitedRegions:', JSON.parse(JSON.stringify(regionsToRender)));
      if (regionsToRender.length === 0) {
        // log('info', "[RegionUI] Show All is off and visited list is empty, attempting to show start region 'Menu'...");
        const success = this.showStartRegion('Menu'); // showStartRegion adds to this.visitedRegions
        if (success) {
          // log('info', "[RegionUI] Successfully set start region 'Menu'. Visited regions now:", JSON.parse(JSON.stringify(this.visitedRegions)));
          // Re-populate regionsToRender from the now updated this.visitedRegions
          regionsToRender = this.visitedRegions.map((vr) => ({
            name: vr.name,
            isVisited: true,
            uid: vr.uid,
            expanded: vr.name === this.navigationTarget || vr.expanded, // Expand if it's the navigation target or already expanded
            isReachable:
              snapshot.regionReachability?.[vr.name] === true ||
              snapshot.regionReachability?.[vr.name] === 'reachable' ||
              snapshot.regionReachability?.[vr.name] === 'checked',
          }));
        } else {
          log(
            'warn',
            "[RegionUI] Failed to set start region 'Menu'. Panel might remain empty."
          );
        }
      }
    }

    if (searchTerm) {
      regionsToRender = regionsToRender.filter((regionInfo) =>
        regionInfo.name.toLowerCase().includes(searchTerm)
      );
    }

    regionsToRender = regionsToRender.filter((regionInfo) => {
      if (regionInfo.isReachable && !showReachable) return false;
      if (!regionInfo.isReachable && !showUnreachable) return false;
      return true;
    });

    // Only sort if 'Show All Regions' is checked.
    // Otherwise, preserve the order from visitedRegions (navigation order).
    if (this.showAll) {
      regionsToRender.sort((a, b) => {
        if (sortMethod === 'original') {
          if (this.originalRegionOrder && this.originalRegionOrder.length > 0) {
            const indexA = this.originalRegionOrder.indexOf(a.name);
            const indexB = this.originalRegionOrder.indexOf(b.name);
            if (indexA !== -1 && indexB !== -1) return indexA - indexB;
            if (indexA === -1 && indexB !== -1) return 1;
            if (indexA !== -1 && indexB === -1) return -1;
          }
          return a.name.localeCompare(b.name);
        } else if (
          sortMethod === 'accessibility' ||
          sortMethod === 'accessibility_original'
        ) {
          const reachA = a.isReachable ? 1 : 0;
          const reachB = b.isReachable ? 1 : 0;
          if (reachB !== reachA) {
            return reachB - reachA;
          }
          if (sortMethod === 'accessibility_original') {
            if (
              this.originalRegionOrder &&
              this.originalRegionOrder.length > 0
            ) {
              const indexA = this.originalRegionOrder.indexOf(a.name);
              const indexB = this.originalRegionOrder.indexOf(b.name);
              if (indexA !== -1 && indexB !== -1) {
                if (indexA !== indexB) return indexA - indexB;
              }
              if (indexA === -1 && indexB !== -1) return 1;
              if (indexA !== -1 && indexB === -1) return -1;
            }
            return a.name.localeCompare(b.name);
          }
          return a.name.localeCompare(b.name);
        } else {
          return a.name.localeCompare(b.name);
        }
      });
    }

    const availableFragment = document.createDocumentFragment();
    const unavailableFragment = document.createDocumentFragment();
    const generalFragment = document.createDocumentFragment();

    for (const regionInfo of regionsToRender) {
      const regionName = regionInfo.name;
      
      // Handle skip indicator specially
      if (regionInfo.isSkipIndicator) {
        const regionBlock = this.regionBlockBuilder.buildRegionBlock(
          regionName,
          null, // No region data needed for skip indicator
          snapshot,
          snapshotInterface,
          regionInfo.isReachable,
          useColorblind,
          regionInfo.uid,
          regionInfo.expanded,
          staticData,
          regionInfo.isSkipIndicator
        );
        
        if (useAccessibilitySections) {
          if (regionInfo.isReachable && availableContentContainer) {
            availableFragment.appendChild(regionBlock);
          } else if (!regionInfo.isReachable && unavailableContentContainer) {
            unavailableFragment.appendChild(regionBlock);
          }
        } else {
          if (generalSortedListContent) {
            generalFragment.appendChild(regionBlock);
          }
        }
        continue;
      }
      
      const regionData = staticData.regions[regionName];
      if (!regionData) {
        log(
          'warn',
          `[RegionUI] Static data not found for region '${regionName}' during render.`
        );
        continue;
      }
      const isReachable = regionInfo.isReachable;
      const regionBlock = this.regionBlockBuilder.buildRegionBlock(
        regionName,
        regionData,
        snapshot,
        snapshotInterface,
        isReachable,
        useColorblind,
        regionInfo.uid,
        regionInfo.expanded,
        staticData,
        regionInfo.isSkipIndicator
      );
      if (!regionBlock) {
        if (regionName === 'Menu') {
          // log('warn', '[RegionUI] buildRegionBlock returned null for Menu region. This might make the panel appear empty.');
        }
        continue;
      }

      if (useAccessibilitySections) {
        if (isReachable && availableContentContainer) {
          availableFragment.appendChild(regionBlock);
        } else if (!isReachable && unavailableContentContainer) {
          unavailableFragment.appendChild(regionBlock);
        }
      } else {
        if (generalSortedListContent) {
          generalFragment.appendChild(regionBlock);
        }
      }
    }

    if (useAccessibilitySections) {
      if (availableContentContainer)
        availableContentContainer.appendChild(availableFragment);
      if (unavailableContentContainer)
        unavailableContentContainer.appendChild(unavailableFragment);
    } else {
      if (generalSortedListContent)
        generalSortedListContent.appendChild(generalFragment);
    }

    this._updateSectionVisibility(); // Call this at the end to correctly hide/show sections based on content

    log(
      'info',
      `[RegionUI] Finished rendering regions. Displayed: ${regionsToRender.length}`
    );
    logAndGetUnknownEvaluationCounter('RegionPanel update complete');
  }

  createRegionLink(regionName, snapshot) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createRegionLink(regionName, this.colorblindSettings, snapshot);
  }

  /**
   * Navigates to a specific region within the regions panel.
   * Ensures the region block is visible, expanded, scrolls it into view, and highlights it.
   * @param {string} regionName - The name of the region to navigate to.
   */
  navigateToRegion(regionName) {
    this.navigationTarget = regionName; // Set navigation target

    if (!this.regionsContainer) {
      log('warn', '[RegionUI] navigateToRegion: regionsContainer not found.');
      this.navigationTarget = null;
      return;
    }

    let forceRender = false;
    const showAllCheckbox = this.rootElement.querySelector('#show-all-regions');

    if (showAllCheckbox && !this.showAll) {
      const isRegionInVisitedPath = this.visitedRegions.some(
        (r) => r.name === regionName
      );
      if (!isRegionInVisitedPath) {
        log(
          'info',
          `[RegionUI] navigateToRegion: Target "${regionName}" not in visited path. Activating 'Show All Regions'.`
        );
        showAllCheckbox.checked = true;
        this.showAll = true;
        forceRender = true; // Indicate that showAll state changed
      }
    }

    // If Show All is now active (or was already active), ensure the target region is marked for expansion
    // by adding/updating its entry in visitedRegions AND showAllExpansionState for consistent expansion handling.
    if (this.showAll) {
      // Update the showAllExpansionState Map to ensure expansion persists across re-renders
      this.showAllExpansionState.set(regionName, true);
      forceRender = true; // Always re-render when navigating to ensure expansion is shown
      
      const allUid = `all_${regionName}`;
      const existingEntry = this.visitedRegions.find((r) => r.uid === allUid);
      if (existingEntry) {
        if (!existingEntry.expanded) {
          existingEntry.expanded = true;
        }
      } else {
        this.visitedRegions.push({
          name: regionName,
          expanded: true,
          uid: allUid,
        });
      }
    }

    // Render with navigationTarget set. This should ensure the target region is rendered and expanded.
    // Only call renderAllRegions if forceRender is true, or if navigationTarget was the primary trigger and no state change occurred.
    // The setTimeout for scrolling will occur regardless, relying on the DOM being correct.
    if (
      forceRender ||
      !this.regionsContainer.querySelector(
        `.region-block[data-region="${regionName}"].expanded`
      )
    ) {
      this.renderAllRegions();
    }

    // Defer scrolling to allow DOM updates from renderAllRegions to complete.
    setTimeout(() => {
      const regionBlock = this.regionsContainer.querySelector(
        // Query for the data-region attribute which should be stable.
        `.region-block[data-region="${regionName}"]`
      );

      if (regionBlock) {
        log(
          'info',
          `[RegionUI] navigateToRegion: Scrolling to "${regionName}". Block found.`
        );
        regionBlock.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
        });

        regionBlock.classList.add('highlight-region');
        setTimeout(() => {
          regionBlock.classList.remove('highlight-region');
          this.navigationTarget = null; // Clear navigation target after highlight
        }, 1500);
      } else {
        log(
          'warn',
          `[RegionUI] navigateToRegion: Region block for "${regionName}" NOT FOUND after render and defer. Cannot scroll.`
        );
        this.navigationTarget = null; // Clear navigationTarget if block not found
      }
    }, 0); // Small delay to allow DOM reflow
  }

  /**
   * Navigate to a specific location in a region
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The name of the region containing the location
   */
  navigateToLocation(locationName, regionName) {
    const regionBlock = this.regionsContainer.querySelector(
      `.region-block[data-region="${regionName}"]`
    );

    if (!regionBlock) {
      this.navigateToRegion(regionName); // Call navigateToRegion to handle visibility
      setTimeout(() => this.navigateToLocation(locationName, regionName), 200);
      return;
    }

    // Ensure the region is expanded if it's a visited region
    if (regionBlock.classList.contains('collapsed')) {
      const uidString = regionBlock.dataset.uid;
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      if (isVisitedRegion) {
        this.toggleRegionByUID(parseInt(uidString, 10));
        setTimeout(
          () => this.navigateToLocation(locationName, regionName),
          200
        );
        return;
      }
    }

    // Now try to find and scroll to the location within the visible region block
    // Use a more specific selector targeting the location link within the wrapper
    const locationElement = regionBlock.querySelector(
      `.location-wrapper .location-link[data-location="${locationName}"]`
    );
    if (locationElement) {
      locationElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Highlight the parent wrapper for better visibility
      const wrapper = locationElement.closest('.location-wrapper');
      if (wrapper) {
        wrapper.classList.add('highlight-location');
        setTimeout(() => {
          wrapper.classList.remove('highlight-location');
        }, 2000);
      }
    }
  }

  /**
   * Create a clickable link for a location name
   * @param {string} locationName - The name of the location
   * @param {string} regionName - The region containing this location
   * @returns {HTMLElement} - A clickable span element
   */
  createLocationLink(locationName, regionName, snapshot) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createLocationLink(
      locationName,
      regionName,
      this.colorblindSettings,
      snapshot
    );
  }

  setupAnalyzePathsButton(
    analyzePathsBtn,
    pathsCountSpan,
    pathsContainer,
    regionName
  ) {
    // Delegate to PathAnalyzerUI
    this.pathAnalyzer.setupAnalyzePathsButton(
      analyzePathsBtn,
      pathsCountSpan,
      pathsContainer,
      regionName
    );
  }

  /**
   * Toggles colorblind mode and updates the UI
   */
  toggleColorblindMode() {
    this.colorblindSettings = !this.colorblindSettings;

    // Update the path analyzer's colorblind mode as well
    this.pathAnalyzer.setColorblindMode(this.colorblindSettings);

    // Sync with commonUI
    commonUI.setColorblindMode(this.colorblindSettings);

    // Update colorblind indicators in the UI
    this._updateColorblindIndicators();
  }

  /**
   * Helper method to update colorblind indicators across the UI
   */
  _updateColorblindIndicators() {
    // Update all region link indicators (This logic is now handled by commonUI.createRegionLink)
    /* // Old implementation commented out
     this.rootElement.querySelectorAll('.region-link').forEach((link) => {
        // ... (symbol update logic) ...
     });
    */

    // Update logic nodes within this panel
    this.rootElement.querySelectorAll('.logic-node').forEach((node) => {
      const isPassing = node.classList.contains('pass');

      // Remove existing symbol
      const existingSymbol = node.querySelector('.colorblind-symbol');
      if (existingSymbol) existingSymbol.remove();

      // Add new symbol if needed
      if (
        this.colorblindSettings &&
        (node.classList.contains('pass') || node.classList.contains('fail'))
      ) {
        const symbolSpan = document.createElement('span');
        symbolSpan.classList.add('colorblind-symbol');
        symbolSpan.textContent = isPassing ? ' ✓' : ' ✗';
        symbolSpan.classList.add(isPassing ? 'accessible' : 'inaccessible');
        node.insertBefore(symbolSpan, node.firstChild); // Insert at beginning
      }
    });
  }

  /**
   * Helper method to handle location checks locally when messageHandler is unavailable
   * @param {Object} location - The location object to check
   * @private
   */
  _handleLocalCheck(location) {
    // Check if the location is actually checkable
    if (location.access_rule && !evaluateRule(location.access_rule)) {
      return; // Don't check locations that aren't accessible
    }

    log(
      'info',
      `RegionUI: Handling local check for location: ${location.name} in ${location.regionName}`
    );

    // Use the imported moduleDispatcher directly
    if (moduleDispatcher) {
      moduleDispatcher.publish('user:checkLocationRequest', {
        locationName: location.name,
        regionName: location.regionName,
      });
    } else {
      log(
        'error',
        '[RegionUI] Cannot publish user:checkLocationRequest: moduleDispatcher is not available.'
      );
    }
  }

  // --- ADDED: Helper to show/hide region categories ---
  _updateSectionVisibility() {
    const sortSelect = this.rootElement.querySelector('#region-sort-select');
    const sortValue = sortSelect ? sortSelect.value : 'original';

    const accessibilitySections = this.rootElement.querySelector(
      '#accessibility-sorted-sections'
    );
    const generalSection = this.rootElement.querySelector(
      '#general-sorted-list-section'
    );

    if (sortValue.includes('accessibility')) {
      accessibilitySections.style.display = 'block';
      generalSection.style.display = 'none';
    } else {
      accessibilitySections.style.display = 'none';
      generalSection.style.display = 'block';
    }
  }
  // --- END ADDED ---
}

export default RegionUI;

// regionUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { PathAnalyzerUI } from '../pathAnalyzer/index.js';
import commonUI from '../commonUI/index.js';
import messageHandler from '../client/core/messageHandler.js';
import discoveryStateSingleton from '../discovery/singleton.js';
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
import { DisplaySettingsManager } from './displaySettingsManager.js';
import { ExpansionStateManager } from './expansionStateManager.js';
import { NavigationManager } from './navigationManager.js';
import { RegionRenderer } from './regionRenderer.js';
import { EventCoordinator } from './eventCoordinator.js';

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
    this.navigationTarget = null; // Add navigation target state
    this.isDiscoveryModeActive = false; // Track discovery mode state

    // Create root element first (needed for DisplaySettingsManager)
    this.rootElement = this.createRootElement();

    // Create the display settings manager
    this.displaySettings = new DisplaySettingsManager(settingsManager, this.rootElement);

    // Create the expansion state manager
    this.expansionState = new ExpansionStateManager();

    // Create the navigation manager
    this.navigationManager = new NavigationManager(eventBus);

    // Create the path analyzer and block builder
    this.pathAnalyzer = new PathAnalyzerUI(this);
    this.regionBlockBuilder = new RegionBlockBuilder(this);

    // Create the region renderer
    this.regionRenderer = new RegionRenderer(this.regionBlockBuilder);

    // Store reference to stateManager for event coordinator
    this.stateManager = stateManager;

    // Create the event coordinator (note: subscribeToEvents called in initialize())
    this.eventCoordinator = new EventCoordinator(eventBus, this);

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

      // Initialize display settings manager (loads persisted settings)
      this.displaySettings.initialize().then(() => {
        // Sync showAll from display settings
        this.showAll = this.displaySettings.getSetting('showAll');
        this.showPaths = this.displaySettings.getSetting('showPaths');
        log('info', '[RegionUI] Display settings loaded and synced');
      }).catch(error => {
        log('error', '[RegionUI] Failed to initialize display settings:', error);
      });

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
    this.updateElementVisibility(); // Apply initial visibility settings
    // Initial render is triggered by stateManager:ready
  }

  _subscribeToEvents() {
    log('info', '[RegionUI] Subscribing instance to EventBus events...');
    // Delegate to event coordinator
    this.eventCoordinator.subscribeToEvents();

    // NOTE: user:regionMove is handled via EventDispatcher in index.js, not EventBus
    // The handleRegionMove dispatcher handler calls moveToRegion() on this UI instance
    // DO NOT subscribe to user:regionMove via EventBus - it should only use EventDispatcher

    log('info', '[RegionUI] Event subscriptions complete.');
  }

  getRegionDisplayElements(regionData) {
    // Delegate to displaySettings
    return this.displaySettings.getRegionDisplayElements(regionData);
  }

  onPanelDestroy() {
    log('info', '[RegionUI] Cleaning up subscriptions...');
    // Delegate to event coordinator for unsubscribing
    this.eventCoordinator.unsubscribeAll();
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
        <div style="display: flex; align-items: center; margin-bottom: 10px;">
          <div class="controls-header" style="cursor: pointer; user-select: none; display: flex; align-items: center; padding: 5px 10px; border: 1px solid #555; border-radius: 4px; margin-right: 10px;">
            <span class="collapse-indicator" style="margin-right: 5px; transition: transform 0.3s; transform: rotate(-90deg);">▼</span>
            <span style="font-weight: bold;">Controls</span>
          </div>
          <input type="search" id="region-search" placeholder="Search regions..." style="flex-grow: 1; margin-right: 10px;">
          <select id="region-sort-select" style="margin-right: 10px;">
            <option value="original">Original Order</option>
            <option value="alphabetical">Sort Alphabetical</option>
            <option value="accessibility_original">Sort by Accessibility (Original)</option>
            <option value="accessibility">Sort by Accessibility (Name)</option>
            <!-- Add original order later if needed for regions -->
          </select>
          <button id="expand-collapse-all">Expand All</button>
        </div>
        <div class="controls-content" style="display: none;">
          <div style="margin-bottom: 10px;">
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
          </div>
          <div style="border-top: 1px solid #555; padding-top: 10px;">
            <span style="font-weight: bold; display: block; margin-bottom: 5px;">Region Block Visibility:</span>
            <label style="margin-right: 10px;">
              <input type="checkbox" id="show-entrances" checked />
              Show Entrances
            </label>
            <label style="margin-right: 10px;">
              <input type="checkbox" id="show-exits" checked />
              Show Exits
            </label>
            <label style="margin-right: 10px;">
              <input type="checkbox" id="show-locations" checked />
              Show Locations
            </label>
            <label style="margin-right: 10px;">
              <input type="checkbox" id="show-logic-trees" checked />
              Show Logic Trees
            </label>
          </div>
          <div style="margin-top: 10px;">
            <label style="margin-right: 10px;">
              <span style="font-weight: bold;">Section Order:</span>
              <select id="section-order-select" style="margin-left: 5px;">
                <option value="entrances-exits-locations">Entrances → Exits → Locations</option>
                <option value="entrances-locations-exits">Entrances → Locations → Exits</option>
                <option value="exits-entrances-locations">Exits → Entrances → Locations</option>
                <option value="exits-locations-entrances">Exits → Locations → Entrances</option>
                <option value="locations-entrances-exits">Locations → Entrances → Exits</option>
                <option value="locations-exits-entrances">Locations → Exits → Entrances</option>
              </select>
            </label>
          </div>
        </div>
      </div>
      <div id="region-details-container" style="flex-grow: 1; overflow-y: auto; padding: 0.5rem;">
          <div id="accessibility-sorted-sections">
            <div id="available-regions-section" class="region-category">
                <h3>Available</h3>
                <div id="available-content" class="region-category-content"></div>
            </div>
            <div id="unavailable-regions-section" class="region-category">
                <h3>Unavailable / Unknown</h3>
                <div id="unavailable-content" class="region-category-content"></div>
            </div>
             <!-- Add other sections if needed (e.g., completed) -->
          </div>
          <div id="general-sorted-list-section" style="display: none;">
              <div id="general-sorted-list-content" class="region-category-content"></div>
          </div>
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  attachEventListeners() {
    // Collapsible controls header
    const controlsHeader = this.rootElement.querySelector('.controls-header');
    const controlsContent = this.rootElement.querySelector('.controls-content');
    const collapseIndicator = this.rootElement.querySelector('.collapse-indicator');
    
    if (controlsHeader && controlsContent && collapseIndicator) {
      controlsHeader.addEventListener('click', () => {
        const isCollapsed = controlsContent.style.display === 'none';
        controlsContent.style.display = isCollapsed ? '' : 'none';
        collapseIndicator.style.transform = isCollapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
      });
    }

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
        // Persist setting
        this.displaySettings.setSetting('showAll', this.showAll, true);

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
        // Persist setting
        this.displaySettings.setSetting('showPaths', this.showPaths, true);
        this.renderAllRegions();
      });
    }

    // Visibility checkboxes for region block elements
    const showEntrancesCheckbox = this.rootElement.querySelector('#show-entrances');
    if (showEntrancesCheckbox) {
      showEntrancesCheckbox.addEventListener('change', () => this.updateElementVisibility());
    }

    const showExitsCheckbox = this.rootElement.querySelector('#show-exits');
    if (showExitsCheckbox) {
      showExitsCheckbox.addEventListener('change', () => this.updateElementVisibility());
    }

    const showLocationsCheckbox = this.rootElement.querySelector('#show-locations');
    if (showLocationsCheckbox) {
      showLocationsCheckbox.addEventListener('change', () => this.updateElementVisibility());
    }

    const showLogicTreesCheckbox = this.rootElement.querySelector('#show-logic-trees');
    if (showLogicTreesCheckbox) {
      showLogicTreesCheckbox.addEventListener('change', () => this.updateElementVisibility());
    }

    // Section order dropdown
    const sectionOrderSelect = this.rootElement.querySelector('#section-order-select');
    if (sectionOrderSelect) {
      sectionOrderSelect.addEventListener('change', () => this.renderAllRegions());
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
    this.expansionState.clearAll(); // Clear all expansion state (both modes)
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
        expanded: expanded, // Note: This property is kept for backward compatibility but not used
        uid: uid,
        exitUsed: pathEntry.exitUsed,
        instanceNumber: pathEntry.instanceNumber
      });

      // Update expansion state manager
      this.expansionState.setExpanded(
        pathEntry.region,
        expanded,
        'navigation',
        pathEntry.instanceNumber || uid
      );
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

    // Phase 3.2: Check if the start region exists in the static data
    if (!staticData.regions.get(startRegionName)) {
      log(
        'warn',
        `[RegionUI] Start region ${startRegionName} does not exist in static region data.`
      );
      this.visitedRegions = []; // Clear if region doesn't exist
      return;
    }

    log('info', `[RegionUI] Setting start region: ${startRegionName}`);
    const uid = this.nextUID++;
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true, // Note: This property is kept for backward compatibility but not used
        uid: uid,
      },
    ];

    // Update expansion state manager
    this.expansionState.setExpanded(
      startRegionName,
      true,
      'navigation',
      uid // Start region doesn't have instanceNumber, use uid
    );

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
    // Determine mode and region info from UID
    let mode, regionName, instanceNumber;

    if (typeof uid === 'string' && uid.startsWith('all_')) {
      // "Show All" mode region
      mode = 'showAll';
      regionName = uid.substring(4); // Extract region name from "all_RegionName"
      instanceNumber = null;
    } else {
      // Navigation mode region
      mode = 'navigation';
      const block = this.visitedRegions.find((r) => r.uid === uid);
      if (block) {
        regionName = block.name;
        instanceNumber = block.instanceNumber || uid; // Use instanceNumber if available, otherwise fall back to uid
      } else {
        log('warn', `toggleRegionByUID: Block with UID ${uid} not found`);
        return;
      }
    }

    // Toggle via expansion state manager
    this.expansionState.toggleExpanded(regionName, mode, instanceNumber);
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
      // Use expansion state manager for "Show All" mode
      const regionNames = Array.from(staticData.regions.keys());
      this.expansionState.expandAll(regionNames, 'showAll');
    } else {
      // Navigation mode - expand each instance individually to avoid duplicate name overwrites
      this.visitedRegions.forEach((region) => {
        this.expansionState.setExpanded(
          region.name,
          true,
          'navigation',
          region.instanceNumber || region.uid
        );
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
      // Use expansion state manager for "Show All" mode
      const regionNames = Array.from(staticData.regions.keys());
      this.expansionState.collapseAll(regionNames, 'showAll');
    } else {
      // Navigation mode - collapse each instance individually to avoid duplicate name overwrites
      this.visitedRegions.forEach((region) => {
        this.expansionState.setExpanded(
          region.name,
          false,
          'navigation',
          region.instanceNumber || region.uid
        );
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

    // Validate that required data is available
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

    // Ensure original region order is available (for sorting)
    if (!this.originalRegionOrder || this.originalRegionOrder.length === 0) {
      const freshlyFetchedOrder = stateManager.getOriginalRegionOrder();
      if (freshlyFetchedOrder && freshlyFetchedOrder.length > 0) {
        this.originalRegionOrder = freshlyFetchedOrder;
        log(
          'info',
          `[RegionUI renderAllRegions] Fallback fetch for originalRegionOrder succeeded: ${this.originalRegionOrder.length} items.`
        );
      } else {
        // Defer render once if order not available yet
        if (!this.renderDeferralAttempted) {
          this.renderDeferralAttempted = true;
          log(
            'debug',
            '[RegionUI renderAllRegions] Original region order not yet available. Deferring render...'
          );
          setTimeout(() => {
            this.renderDeferralAttempted = false;
            if (!this.originalRegionOrder || this.originalRegionOrder.length === 0) {
              log('debug', '[RegionUI renderAllRegions] Proceeding with default sorting after delay.');
            }
            this.renderAllRegions();
          }, 50);
          return;
        }
        log('debug', '[RegionUI renderAllRegions] Proceeding with default sorting (no deferral).');
      }
    }

    // Reset the unknown evaluation counter for this rendering cycle
    resetUnknownEvaluationCounter();

    // Create snapshot interface
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);
    if (!snapshotInterface) {
      log('error', '[RegionUI] Failed to create snapshot interface. Rendering may be incomplete.');
      return;
    }

    // Get rendering options from UI controls
    const useColorblind = this.displaySettings.getSetting('colorblindMode');
    const sortSelectElement = this.rootElement.querySelector('#region-sort-select');
    if (!sortSelectElement) {
      log('error', '[RegionUI renderAllRegions] #region-sort-select NOT FOUND within this.rootElement!');
      return;
    }
    const sortMethod = sortSelectElement.value;

    const searchTerm = this.rootElement.querySelector('#region-search').value.toLowerCase();
    const showReachable = this.rootElement.querySelector('#region-show-reachable').checked;
    const showUnreachable = this.rootElement.querySelector('#region-show-unreachable').checked;

    // Use navigation manager to compute regions to render
    let regionsToRender = this.navigationManager.computeRegionsToRender(
      this.visitedRegions,
      this.showAll,
      this.showPaths,
      staticData,
      snapshot,
      this.navigationTarget
    );

    // Add expansion state to each region
    regionsToRender = regionsToRender.map(region => {
      if (region.isSkipIndicator) {
        return { ...region, expanded: false };
      }

      const mode = region.mode || (this.showAll ? 'showAll' : 'navigation');
      const instanceNumber = region.instanceNumber || region.uid;

      return {
        ...region,
        expanded: region.name === this.navigationTarget ||
                 (mode === 'showAll'
                   ? this.expansionState.isExpanded(region.name, 'showAll')
                   : this.expansionState.isExpanded(region.name, 'navigation', instanceNumber))
      };
    });

    // Handle empty case - show Menu if needed
    if (regionsToRender.length === 0) {
      const success = this.showStartRegion('Menu'); // showStartRegion adds to this.visitedRegions
      if (success) {
        // Re-compute regionsToRender from the now updated this.visitedRegions
        regionsToRender = this.navigationManager.computeRegionsToRender(
          this.visitedRegions,
          this.showAll,
          this.showPaths,
          staticData,
          snapshot,
          this.navigationTarget
        );

        // Add expansion state
        regionsToRender = regionsToRender.map(region => ({
          ...region,
          expanded: region.name === this.navigationTarget ||
                   this.expansionState.isExpanded(region.name, 'navigation', region.instanceNumber || region.uid)
        }));
      } else {
        log(
          'warn',
          "[RegionUI] Failed to set start region 'Menu'. Panel might remain empty."
        );
      }
    }

    // Get section order for rendering
    const sectionOrderSelect = this.rootElement.querySelector('#section-order-select');
    const sectionOrder = sectionOrderSelect ? sectionOrderSelect.value : 'entrances-exits-locations';

    // Delegate rendering to RegionRenderer
    this.regionRenderer.renderRegions(
      this.regionsContainer,
      regionsToRender,
      staticData,
      snapshot,
      snapshotInterface,
      {
        searchTerm,
        showReachable,
        showUnreachable,
        sortMethod,
        originalRegionOrder: this.originalRegionOrder,
        useColorblind,
        sectionOrder
      }
    );

    logAndGetUnknownEvaluationCounter('RegionPanel update complete');
  }

  createRegionLink(regionName, snapshot) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createRegionLink(regionName, this.displaySettings.getSetting('colorblindMode'), snapshot);
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
    if (this.showAll) {
      // Use expansion state manager to ensure expansion persists across re-renders
      this.expansionState.setExpanded(regionName, true, 'showAll');
      forceRender = true; // Always re-render when navigating to ensure expansion is shown
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
      this.displaySettings.getSetting('colorblindMode'),
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
  async toggleColorblindMode() {
    const newValue = !this.displaySettings.getSetting('colorblindMode');
    await this.displaySettings.setSetting('colorblindMode', newValue, true);

    // Update the path analyzer's colorblind mode as well
    this.pathAnalyzer.setColorblindMode(newValue);

    // Sync with commonUI
    commonUI.setColorblindMode(newValue);

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
        this.displaySettings.getSetting('colorblindMode') &&
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
   * Updates visibility of entrances, exits, locations, and logic trees based on checkbox states
   */
  updateElementVisibility() {
    const showEntrances = this.rootElement.querySelector('#show-entrances')?.checked ?? true;
    const showExits = this.rootElement.querySelector('#show-exits')?.checked ?? true;
    const showLocations = this.rootElement.querySelector('#show-locations')?.checked ?? true;
    const showLogicTrees = this.rootElement.querySelector('#show-logic-trees')?.checked ?? true;

    // Apply visibility styles to the region details container
    const style = document.getElementById('region-visibility-styles') || document.createElement('style');
    style.id = 'region-visibility-styles';
    
    let css = '';
    
    if (!showEntrances) {
      css += '.region-entrances-list { display: none !important; }\n';
      css += '.region-entrances-header { display: none !important; }\n';
    }
    
    if (!showExits) {
      css += '.region-exits-list { display: none !important; }\n';
      css += '.region-exits-header { display: none !important; }\n';
    }
    
    if (!showLocations) {
      css += '.region-locations-list { display: none !important; }\n';
      css += '.region-locations-header { display: none !important; }\n';
    }
    
    if (!showLogicTrees) {
      css += '.logic-tree { display: none !important; }\n';
      css += '.exit-wrapper .logic-rule-container { display: none !important; }\n';
      css += '.location-wrapper .logic-rule-container { display: none !important; }\n';
    }
    
    style.textContent = css;
    
    if (!document.getElementById('region-visibility-styles')) {
      document.head.appendChild(style);
    }
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

}

export default RegionUI;

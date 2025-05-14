// regionUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { PathAnalyzerUI } from '../pathAnalyzer/index.js';
import commonUI from '../commonUI/index.js';
import messageHandler from '../client/core/messageHandler.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import { debounce } from '../commonUI/index.js';
// Import the exported dispatcher from the module's index
import { moduleDispatcher } from './index.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import {
  renderLogicTree,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from '../commonUI/index.js';

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

    // A simple counter to give each visited region block a unique ID
    this.nextUID = 1;

    // If set to true, we'll show **all** regions, ignoring the visited chain
    this.showAll = false;
    this.isInitialized = false; // Add flag
    this.colorblindSettings = {}; // Add colorblind settings cache

    // Create the path analyzer
    this.pathAnalyzer = new PathAnalyzerUI(this);
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
      console.log('[RegionUI] Received app:readyForUiDataLoad. Initializing.');
      this.initialize(); // This will call _subscribeToEvents

      // --- ADDED: Proactive data fetching and initialization ---
      console.log(
        '[RegionUI app:readyForUiDataLoad] Proactively fetching static data and original order.'
      );
      this.colorblindSettings =
        settingsManager.getSetting('colorblindMode.regions') || {};

      const currentStaticData = stateManager.getStaticData();
      if (currentStaticData && currentStaticData.regions) {
        this.originalRegionOrder = stateManager.getOriginalRegionOrder();
        console.log(
          `[RegionUI app:readyForUiDataLoad] Stored ${this.originalRegionOrder.length} region keys for original order.`
        );
      } else {
        console.warn(
          '[RegionUI app:readyForUiDataLoad] Static region data not available for fetching original order.'
        );
        this.originalRegionOrder = [];
      }

      const showAllCheckbox =
        this.rootElement.querySelector('#show-all-regions');
      this.showAll = showAllCheckbox ? showAllCheckbox.checked : false;

      if (!this.showAll) {
        console.log(
          "[RegionUI app:readyForUiDataLoad] Show All is off, setting start region to 'Menu'."
        );
        this.showStartRegion('Menu'); // Initialize visitedRegions with Menu
      } else {
        console.log('[RegionUI app:readyForUiDataLoad] Show All is on.');
      }

      this.update(); // Perform initial render
      this.isInitialized = true; // Mark as initialized
      console.log(
        '[RegionUI app:readyForUiDataLoad] Initial setup and render complete.'
      );
      // --- END ADDED ---

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  // Called by PanelManager when panel is created/shown
  initialize() {
    console.log('[RegionUI] Initializing panel...');
    this.isInitialized = false; // Reset flag
    this.clear(); // Clear previous state
    this._subscribeToEvents(); // Subscribe here
    // Initial render is triggered by stateManager:ready
  }

  _subscribeToEvents() {
    console.log('[RegionUI] Subscribing instance to EventBus events...');
    // Ensure unsubscribed first
    this.unsubscribeHandles.forEach((u) => u());
    this.unsubscribeHandles = [];

    if (!eventBus) {
      console.error('[RegionUI] EventBus not available for subscriptions.');
      return;
    }

    const subscribe = (eventName, handler) => {
      console.log(`[RegionUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      this.unsubscribeHandles.push(unsubscribe);
    };

    // --- ADDED: Handler for stateManager:ready --- Similar to LocationUI/ExitUI
    const handleReady = () => {
      console.log(
        '[RegionUI] Received stateManager:ready event (after initial setup).'
      );
      // This event confirms StateManager is fully ready.
      // If UI isn't initialized yet by app:readyForUiDataLoad (e.g. if stateManager:ready fired extremely early),
      // perform the full initialization. Otherwise, just refresh.
      if (!this.isInitialized) {
        console.log(
          '[RegionUI stateManager:ready] UI not yet initialized by app:readyForUiDataLoad. Performing full setup now.'
        );
        this.colorblindSettings =
          settingsManager.getSetting('colorblindMode.regions') || {};

        const currentStaticData = stateManager.getStaticData();
        if (currentStaticData && currentStaticData.regions) {
          this.originalRegionOrder = stateManager.getOriginalRegionOrder();
          console.log(
            `[RegionUI stateManager:ready] Stored ${this.originalRegionOrder.length} region keys for original order.`
          );
        } else {
          console.warn(
            '[RegionUI stateManager:ready] Static region data not available for fetching original order.'
          );
          this.originalRegionOrder = [];
        }

        const showAllCheckbox =
          this.rootElement.querySelector('#show-all-regions');
        this.showAll = showAllCheckbox ? showAllCheckbox.checked : false;
        if (!this.showAll) {
          console.log(
            "[RegionUI stateManager:ready] Show All is off, setting start region to 'Menu'."
          );
          this.showStartRegion('Menu');
        } else {
          console.log('[RegionUI stateManager:ready] Show All is on.');
        }

        this.update(); // Initial render
        this.isInitialized = true; // Mark as initialized
        console.log(
          '[RegionUI stateManager:ready] Fallback setup and render complete.'
        );
      } else {
        console.log(
          '[RegionUI stateManager:ready] UI already initialized. Triggering update.'
        );
        // Potentially refresh colorblind settings again if they could change without a settings:changed event
        // this.colorblindSettings = settingsManager.getSetting('colorblindMode.regions') || {};
        this.update(); // Refresh with potentially new snapshot data
      }
    };
    subscribe('stateManager:ready', handleReady);
    // --- END ADDED ---

    // Debounced update function for subsequent changes
    const debouncedUpdate = debounce(() => {
      if (this.isInitialized) {
        // Only update if initialized
        console.log('[RegionUI] Debounced update triggered.');
        this.update();
      } else {
        // console.log('[RegionUI] Debounced update skipped (not initialized).');
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
        console.log(
          `[RegionUI] Settings changed (${key}), updating cache and triggering update.`
        );
        // Update local cache
        this.colorblindSettings =
          settingsManager.getSetting('colorblindMode.regions') || {};
        if (this.isInitialized) debouncedUpdate(); // Trigger redraw if initialized
      }
    };
    subscribe('settings:changed', settingsHandler);

    console.log('[RegionUI] Event subscriptions complete.');
  }

  onPanelDestroy() {
    console.log('[RegionUI] Cleaning up subscriptions...');
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = []; // Clear handles
    this.pathAnalyzer?.dispose?.();
    console.log('[RegionUI] Cleanup complete.');
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
    console.log('[RegionUI] Clearing visited regions state.');
    this.visitedRegions = [];
    this.nextUID = 1;
    // REMOVED: Direct DOM manipulation, renderAllRegions handles clearing content
    /*
    if (this.regionsContainer) { ... }
    this._updateSectionVisibility(); 
    */
  }

  update() {
    // No readiness check needed here, it's event driven or called after initialize ensures ready
    console.log('[RegionUI] update() called, calling renderAllRegions().');
    this.renderAllRegions();
  }

  async showStartRegion(startRegionName) {
    console.log(
      `[RegionUI] Attempting to show start region: ${startRegionName}`
    );
    // --- REMOVED: Wait for proxy readiness ---
    /*
    if (!stateManager) { ... }
    try { ... await stateManager.ensureReady(); ... } catch { ... }
    */
    // --- END REMOVED ---

    // Ensure instance and regions are available before proceeding
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData(); // Also check static data

    if (
      !snapshot ||
      !staticData?.regions ||
      !staticData.regions[startRegionName]
    ) {
      console.warn(
        `[RegionUI] Warning: start region ${startRegionName} not found or state/static data not ready.`
      );
      return false; // Indicate failure
    }
    console.log(`[RegionUI] Setting start region: ${startRegionName}`);
    this.visitedRegions = [
      {
        name: startRegionName,
        expanded: true,
        uid: this.nextUID++,
      },
    ];
    // Don't call renderAllRegions here, let the calling context handle it
    return true; // Indicate success
  }

  moveToRegion(oldRegionName, newRegionName) {
    // 1. find the index of oldRegionName in visited array
    const oldIndex = this.visitedRegions.findIndex(
      (r) => r.name === oldRegionName
    );
    if (oldIndex < 0) {
      console.warn(
        `Can't find oldRegionName ${oldRegionName} in visited. Not removing anything.`
      );
      return;
    }

    // 2. remove everything after oldIndex
    this.visitedRegions.splice(oldIndex + 1);

    // 3. collapse the old region block
    this.visitedRegions[oldIndex].expanded = false;

    // 4. Add the new region block (expanded)
    const newBlock = {
      name: newRegionName,
      expanded: true,
      uid: this.nextUID++,
    };
    this.visitedRegions.push(newBlock);

    this.renderAllRegions();
  }

  toggleRegionByUID(uid) {
    const block = this.visitedRegions.find((r) => r.uid === uid);
    if (!block) return;
    block.expanded = !block.expanded;
    this.renderAllRegions();
  }

  expandAllRegions() {
    // Use staticData for the list of all regions
    const staticData = stateManager.getStaticData();
    if (this.showAll) {
      if (!staticData || !staticData.regions) {
        // Check staticData
        console.warn(
          '[RegionUI] Static region data not ready in expandAllRegions'
        );
        return;
      }
      Object.keys(staticData.regions).forEach((regionName, index) => {
        // Iterate staticData.regions
        const uid = `all_${index}`;
        const regionObj = this.visitedRegions.find((r) => r.uid === uid);
        if (regionObj) {
          regionObj.expanded = true;
        } else {
          this.visitedRegions.push({
            name: regionName,
            expanded: true,
            uid: uid,
          });
        }
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
        console.warn(
          '[RegionUI] Static region data not ready in collapseAllRegions'
        );
        return;
      }
      Object.keys(staticData.regions).forEach((regionName, index) => {
        // Iterate staticData.regions
        const uid = `all_${index}`;
        const regionObj = this.visitedRegions.find((r) => r.uid === uid);
        if (regionObj) {
          regionObj.expanded = false;
        } else {
          this.visitedRegions.push({
            name: regionName,
            expanded: false,
            uid: uid,
          });
        }
      });
    } else {
      this.visitedRegions.forEach((region) => {
        region.expanded = false;
      });
    }
    this.renderAllRegions();
  }

  renderAllRegions() {
    if (!this.rootElement) {
      console.error(
        '[RegionUI renderAllRegions] CRITICAL: this.rootElement is NULL or Falsy. Aborting render. Instance:',
        this
      );
      this._updateSectionVisibility();
      return;
    }

    resetUnknownEvaluationCounter();
    console.log('[RegionUI] renderAllRegions called.');

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();
    const useColorblind =
      typeof this.colorblindSettings === 'boolean'
        ? this.colorblindSettings
        : Object.keys(this.colorblindSettings).length > 0;

    // Get references to structural elements within this.regionsContainer
    // this.regionsContainer is this.rootElement.querySelector('#region-details-container') (set in constructor)
    const accessibilitySortedSectionsDiv = this.regionsContainer.querySelector(
      '#accessibility-sorted-sections'
    );
    const generalSortedListSectionDiv = this.regionsContainer.querySelector(
      '#general-sorted-list-section'
    );

    let availableContentContainer,
      unavailableContentContainer,
      generalSortedListContent;

    if (accessibilitySortedSectionsDiv) {
      availableContentContainer = accessibilitySortedSectionsDiv.querySelector(
        '#available-regions-section .region-category-content'
      );
      unavailableContentContainer =
        accessibilitySortedSectionsDiv.querySelector(
          '#unavailable-regions-section .region-category-content'
        );
    } else {
      console.warn(
        '[RegionUI renderAllRegions] #accessibility-sorted-sections div not found in this.regionsContainer.'
      );
    }

    if (generalSortedListSectionDiv) {
      generalSortedListContent = generalSortedListSectionDiv.querySelector(
        '.region-category-content'
      );
    } else {
      console.warn(
        '[RegionUI renderAllRegions] #general-sorted-list-section div not found in this.regionsContainer.'
      );
    }

    console.log(
      '[RegionUI renderAllRegions] Start State - Snapshot:',
      !!snapshot,
      'Static Data:',
      !!staticData,
      'accessibilitySortedSectionsDiv:',
      !!accessibilitySortedSectionsDiv,
      'generalSortedListSectionDiv:',
      !!generalSortedListSectionDiv,
      'availableContentContainer:',
      !!availableContentContainer,
      'unavailableContentContainer:',
      !!unavailableContentContainer,
      'generalSortedListContent:',
      !!generalSortedListContent
    );

    if (!staticData?.regions || !snapshot) {
      console.warn(
        '[RegionUI] Static region data or snapshot not ready. Displaying loading message.'
      );
      if (availableContentContainer) availableContentContainer.innerHTML = '';
      if (unavailableContentContainer)
        unavailableContentContainer.innerHTML = '';

      if (generalSortedListContent) {
        generalSortedListContent.innerHTML = '<p>Loading region data...</p>';
      } else {
        // Fallback if the structure is somehow missing, use the main container but this is not ideal
        console.error(
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
      console.error(
        '[RegionUI] Failed to create snapshot interface. Rendering may be incomplete.'
      );
      // Potentially return or show error message
    }

    // Clear content areas before populating
    if (availableContentContainer) availableContentContainer.innerHTML = '';
    if (unavailableContentContainer) unavailableContentContainer.innerHTML = '';
    if (generalSortedListContent) generalSortedListContent.innerHTML = '';

    // --- Enhanced Diagnostic Logging (can be removed after fix is confirmed) ---
    // console.log('[RegionUI PRE-QUERY] About to query #region-sort-select.');
    // ... (rest of the diagnostic block can be removed or commented out) ...
    // --- End Enhanced Diagnostic Logging ---

    const sortSelectElement = this.rootElement.querySelector(
      '#region-sort-select'
    );
    if (!sortSelectElement) {
      console.error(
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
          this.visitedRegions.find((r) => r.uid === `all_${name}`)?.expanded ||
          false,
        isReachable:
          snapshot.reachability?.[name] === true ||
          snapshot.reachability?.[name] === 'reachable' ||
          snapshot.reachability?.[name] === 'checked',
      }));
    } else {
      regionsToRender = this.visitedRegions.map((vr) => ({
        name: vr.name,
        isVisited: true,
        uid: vr.uid,
        expanded: vr.expanded,
        isReachable:
          snapshot.reachability?.[vr.name] === true ||
          snapshot.reachability?.[vr.name] === 'reachable' ||
          snapshot.reachability?.[vr.name] === 'checked',
      }));
      // console.log('[RegionUI] "Show All" is OFF. Initial regionsToRender from visitedRegions:', JSON.parse(JSON.stringify(regionsToRender)));
      if (regionsToRender.length === 0) {
        // console.log("[RegionUI] Show All is off and visited list is empty, attempting to show start region 'Menu'...");
        const success = this.showStartRegion('Menu'); // showStartRegion adds to this.visitedRegions
        if (success) {
          // console.log("[RegionUI] Successfully set start region 'Menu'. Visited regions now:", JSON.parse(JSON.stringify(this.visitedRegions)));
          // Re-populate regionsToRender from the now updated this.visitedRegions
          regionsToRender = this.visitedRegions.map((vr) => ({
            name: vr.name,
            isVisited: true,
            uid: vr.uid,
            expanded: vr.expanded,
            isReachable:
              snapshot.reachability?.[vr.name] === true ||
              snapshot.reachability?.[vr.name] === 'reachable' ||
              snapshot.reachability?.[vr.name] === 'checked',
          }));
        } else {
          console.warn(
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
      const regionData = staticData.regions[regionName];
      if (!regionData) {
        console.warn(
          `[RegionUI] Static data not found for region '${regionName}' during render.`
        );
        continue;
      }
      const isReachable = regionInfo.isReachable;
      const regionBlock = this.buildRegionBlock(
        regionName,
        regionData,
        snapshot,
        snapshotInterface,
        isReachable,
        useColorblind,
        regionInfo.uid,
        regionInfo.expanded
      );
      if (!regionBlock) {
        if (regionName === 'Menu') {
          // console.warn('[RegionUI] buildRegionBlock returned null for Menu region. This might make the panel appear empty.');
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

    console.log(
      `[RegionUI] Finished rendering regions. Displayed: ${regionsToRender.length}`
    );
    logAndGetUnknownEvaluationCounter('RegionPanel update complete');
  }

  createRegionLink(regionName, snapshot) {
    // Just call commonUI directly, which now handles event publishing
    return commonUI.createRegionLink(regionName, this.colorblindMode, snapshot);
  }

  /**
   * Navigates to a specific region within the regions panel.
   * Ensures the region block is visible, expanded, scrolls it into view, and highlights it.
   * @param {string} regionName - The name of the region to navigate to.
   */
  navigateToRegion(regionName) {
    if (!this.regionsContainer) {
      return;
    }

    // Ensure the correct view is rendered based on current state
    // (showAll state is handled by renderAllRegions)
    this.renderAllRegions(); // Re-render if needed to ensure the element exists

    // Find the region block using its data attribute within the panel
    // Note: We query within this.regionsContainer specifically
    let regionBlock = this.regionsContainer.querySelector(
      `.region-block[data-region="${regionName}"]`
    );

    // If block not found, maybe it's because "Show All" is off?
    if (!regionBlock && !this.showAll) {
      const showAllCheckbox =
        this.rootElement.querySelector('#show-all-regions');
      if (showAllCheckbox) {
        showAllCheckbox.checked = true;
        this.showAll = true;
        this.renderAllRegions(); // Re-render with all regions visible
        // Try finding the block again
        regionBlock = this.regionsContainer.querySelector(
          `.region-block[data-region="${regionName}"]`
        );
        if (regionBlock) {
          return;
        }
      } else {
        return;
      }
    }

    if (regionBlock) {
      const uidString = regionBlock.dataset.uid;

      // Use uidString to check if it's a 'visited' region (numeric UID) or 'all' region
      const isVisitedRegion = uidString && !isNaN(parseInt(uidString, 10));
      const isExpanded = regionBlock.classList.contains('expanded');

      // Only try to expand visited regions by UID, 'all' regions are handled by showAll
      if (!isExpanded && isVisitedRegion) {
        const uid = parseInt(uidString, 10);
        const regionData = this.visitedRegions.find((r) => r.uid === uid);
        if (regionData) {
          regionData.expanded = true;
          this.renderAllRegions(); // Re-render to reflect expansion
          // Re-query the element after re-render
          const newRegionBlock = this.regionsContainer.querySelector(
            `.region-block[data-region="${regionName}"][data-uid="${uid}"]`
          );
          if (newRegionBlock) {
            regionBlock = newRegionBlock; // Update reference if found
          }
        }
      }

      // Scroll the region block into view
      regionBlock.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest', // Use 'nearest' to minimize scrolling
      });

      // Add a temporary highlight class
      regionBlock.classList.add('highlight-region');
      setTimeout(() => {
        regionBlock.classList.remove('highlight-region');
      }, 1500); // Highlight for 1.5 seconds
    }
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
      this.colorblindMode,
      snapshot
    );
  }

  // Modify buildRegionBlock to accept staticData and use it
  buildRegionBlock(
    regionName,
    regionStaticData,
    snapshot,
    snapshotInterface,
    regionIsReachable,
    useColorblind,
    currentUid, // Added: Pass UID for consistency
    currentExpandedState // Added: Pass expanded state for consistency
  ) {
    // Determine if the region is currently expanded based on visitedRegions or passed state
    // const visitedEntry = this.visitedRegions.find(
    //   (vr) => vr.name === regionName || vr.uid === currentUid
    // );
    // const expanded = visitedEntry ? visitedEntry.expanded : (currentExpandedState !== undefined ? currentExpandedState : false);
    // const uid = visitedEntry ? visitedEntry.uid : (currentUid || this.nextUID++);

    // Simplified: use passed UID and expanded state primarily, fall back if ShowAll mode is adding new ones temporarily
    let uid = currentUid;
    let expanded =
      currentExpandedState !== undefined ? currentExpandedState : false;

    const visitedEntry = this.visitedRegions.find(
      (vr) => vr.name === regionName
    );

    if (this.showAll) {
      // For 'Show All', UIDs might be like 'all_RegionName'. Expansion state comes from regionInfo.expanded.
      // If not in visitedRegions (which tracks actual user path/manual expansions), don't add.
      // UID and expanded state are passed in directly from regionsToRender for 'showAll' items.
    } else {
      // Not 'Show All', rely on visitedRegions for state if an entry exists
      if (visitedEntry) {
        uid = visitedEntry.uid;
        expanded = visitedEntry.expanded;
      } else if (!uid) {
        // Only assign new UID if none was passed and not in visited (e.g. Menu just added)
        uid = this.nextUID++;
        // Add to visitedRegions if not already there and we are managing it (not showAll)
        // This is critical for 'Menu' when showStartRegion was called
        if (!this.visitedRegions.find((r) => r.name === regionName)) {
          this.visitedRegions.push({
            name: regionName,
            expanded: expanded, // Should be true for 'Menu' if just added by showStartRegion
            uid: uid,
          });
          console.log(
            `[RegionUI buildRegionBlock] Added '${regionName}' to visitedRegions with UID ${uid}.`
          );
        }
      }
    }

    // Outer container
    const regionBlock = document.createElement('div');
    regionBlock.classList.add('region-block');
    regionBlock.dataset.uid = uid; // Use determined UID
    regionBlock.dataset.region = regionName;
    regionBlock.classList.add(expanded ? 'expanded' : 'collapsed');
    regionBlock.classList.toggle('colorblind-mode', useColorblind);

    // Check if Loop Mode is active
    const isLoopModeActive = loopStateSingleton.isLoopModeActive;

    // In Loop Mode, skip rendering if undiscovered
    if (
      isLoopModeActive &&
      !loopStateSingleton.isRegionDiscovered(regionName)
    ) {
      if (regionName === 'Menu') {
        console.warn(
          '[RegionUI buildRegionBlock] Menu region is considered undiscovered in loop mode. Returning null.'
        );
      }
      return null;
    }

    // Determine completion status (example logic)
    let totalLocations = regionStaticData.locations?.length || 0;
    let checkedLocationsCount = 0;
    if (regionStaticData.locations && snapshot.flags) {
      // Use snapshot.flags
      const checkedSet = new Set(snapshot.flags);
      checkedLocationsCount = regionStaticData.locations.filter((loc) =>
        checkedSet.has(loc.name)
      ).length;
    }
    const isComplete =
      totalLocations > 0 && checkedLocationsCount === totalLocations;

    // --- Header --- (Uses pre-calculated regionIsReachable)
    const headerEl = document.createElement('div');
    headerEl.classList.add('region-header');
    const regionLabel = regionName + this._suffixIfDuplicate(regionName, uid);

    headerEl.innerHTML = `
        <span class="region-name" title="${regionName}">${regionLabel}</span>
        <span class="region-status">(${checkedLocationsCount}/${totalLocations})</span>
        ${
          useColorblind
            ? `<span class="colorblind-symbol ${
                regionIsReachable ? 'accessible' : 'inaccessible'
              }">${regionIsReachable ? '✓' : '✗'}</span>`
            : ''
        }
        <button class="collapse-btn">${
          expanded ? 'Collapse' : 'Expand'
        }</button>
      `;
    // Add accessibility classes to header
    headerEl.classList.toggle('accessible', regionIsReachable);
    headerEl.classList.toggle('inaccessible', !regionIsReachable);
    headerEl.classList.toggle('completed-region', isComplete);

    // --- Header Click Listener ---
    headerEl.addEventListener('click', (e) => {
      if (e.target.classList.contains('collapse-btn')) {
        e.stopPropagation();
      }
      this.toggleRegionByUID(uid);
    });

    // --- Content (Exits and Locations) ---
    const contentEl = document.createElement('div');
    contentEl.classList.add('region-content');
    contentEl.style.display = expanded ? 'block' : 'none'; // Control visibility

    // World Type - Refined Display Logic
    const isLight = regionStaticData.is_light_world === true;
    const isDark = regionStaticData.is_dark_world === true;
    if (isLight || isDark) {
      // Only add div if at least one is defined as true
      const worldDiv = document.createElement('div');
      let worldText = '';
      if (isLight && isDark) {
        worldText =
          '<strong style="color: red;">Error: Both Light and Dark World!</strong>';
      } else if (isLight) {
        worldText = 'Light World';
      } else {
        // Only isDark can be true here
        worldText = 'Dark World';
      }
      worldDiv.innerHTML = worldText;
      contentEl.prepend(worldDiv); // Add near the top of content
    }

    // Region rules
    if (
      regionStaticData.region_rules &&
      regionStaticData.region_rules.length > 0
    ) {
      const rrContainer = document.createElement('div');
      rrContainer.innerHTML = '<h4>Region Rules</h4>';
      regionStaticData.region_rules.forEach((rule, idx) => {
        const logicDiv = document.createElement('div');
        logicDiv.classList.add('logic-tree');
        logicDiv.innerHTML = `<strong>Rule #${idx + 1}:</strong>`;
        logicDiv.appendChild(
          renderLogicTree(rule, useColorblind, snapshotInterface)
        );
        rrContainer.appendChild(logicDiv);
      });
      contentEl.appendChild(rrContainer);
    }

    // Exits List
    const exitsList = document.createElement('ul');
    exitsList.classList.add('region-exits-list');
    if (regionStaticData.exits && regionStaticData.exits.length > 0) {
      regionStaticData.exits.forEach((exitDef) => {
        // Determine exit accessibility using evaluateRule and snapshotInterface
        let exitAccessible = true;
        if (exitDef.access_rule) {
          try {
            exitAccessible = evaluateRule(
              exitDef.access_rule,
              snapshotInterface
            );
          } catch (e) {
            console.error(
              `[RegionUI] Error evaluating exit rule for ${exitDef.name} in ${regionName}:`,
              e
            );
            exitAccessible = false;
          }
        }
        // Also need to consider connected region reachability from snapshot
        const connectedRegionName = exitDef.connected_region;
        const connectedRegionReachable =
          snapshot.reachability?.[connectedRegionName] === true ||
          snapshot.reachability?.[connectedRegionName] === 'reachable' ||
          snapshot.reachability?.[connectedRegionName] === 'checked';
        const isTraversable =
          regionIsReachable && exitAccessible && connectedRegionReachable;

        // Loop mode discovery check
        const isExitDiscovered =
          !isLoopModeActive ||
          loopStateSingleton.isExitDiscovered(regionName, exitDef.name);
        // TODO: Add filtering based on showExplored checkbox if needed
        if (isLoopModeActive && !isExitDiscovered) {
          // Optionally render differently or skip if not showing undiscovered
          // For now, just mark inaccessible/undiscovered
        }

        const li = document.createElement('li');
        const exitNameDisplay =
          isLoopModeActive && !isExitDiscovered ? '???' : exitDef.name;
        li.appendChild(document.createTextNode(`${exitNameDisplay} → `));
        // Use commonUI.createRegionLink, passing snapshot and useColorblind
        li.appendChild(
          commonUI.createRegionLink(
            connectedRegionName,
            useColorblind,
            snapshot
          )
        );

        // Add move button (from old UI)
        const moveBtn = document.createElement('button');
        moveBtn.classList.add('move-btn');
        moveBtn.textContent = 'Move';
        // Disable if not traversable OR if connected region doesn't exist OR if undiscovered in loop mode
        moveBtn.disabled =
          !isTraversable ||
          !connectedRegionName ||
          (isLoopModeActive && !isExitDiscovered);
        moveBtn.style.marginLeft = '10px';

        moveBtn.addEventListener('click', () => {
          if (!moveBtn.disabled) {
            this.moveToRegion(regionName, connectedRegionName);
          }
        });
        li.appendChild(moveBtn);

        // Apply classes based on overall traversability and discovery
        li.classList.toggle('accessible', isTraversable);
        li.classList.toggle('inaccessible', !isTraversable);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isExitDiscovered
        );

        // Render logic tree for the exit rule
        if (exitDef.access_rule) {
          const logicTreeElement = renderLogicTree(
            exitDef.access_rule,
            useColorblind,
            snapshotInterface
          );
          const ruleDiv = document.createElement('div');
          ruleDiv.style.marginLeft = '1rem';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          li.appendChild(ruleDiv);
        }

        exitsList.appendChild(li);
      });
    } else {
      exitsList.innerHTML = '<li>No exits defined.</li>';
    }
    contentEl.appendChild(exitsList);

    // Locations List
    const locationsList = document.createElement('ul');
    locationsList.classList.add('region-locations-list');
    if (regionStaticData.locations && regionStaticData.locations.length > 0) {
      regionStaticData.locations.forEach((locationDef) => {
        // Determine accessibility using evaluateRule and snapshotInterface
        let locAccessible = true; // Assume accessible if region is reachable and no rule
        if (locationDef.access_rule) {
          try {
            locAccessible = evaluateRule(
              locationDef.access_rule,
              snapshotInterface
            );
          } catch (e) {
            console.error(
              `[RegionUI] Error evaluating location rule for ${locationDef.name} in ${regionName}:`,
              e
            );
            locAccessible = false;
          }
        }
        locAccessible = regionIsReachable && locAccessible; // Must be in reachable region AND pass rule

        const locChecked = snapshot.flags?.includes(locationDef.name) ?? false; // Use flags from snapshot

        // Loop mode discovery check
        const isLocationDiscovered =
          !isLoopModeActive ||
          loopStateSingleton.isLocationDiscovered(locationDef.name);
        // TODO: Add filtering based on showExplored checkbox if needed
        if (isLoopModeActive && !isLocationDiscovered) {
          // Optionally render differently or skip
        }

        const li = document.createElement('li');
        const locationNameDisplay =
          isLoopModeActive && !isLocationDiscovered ? '???' : locationDef.name;
        // Use commonUI.createLocationLink, passing snapshot and useColorblind
        // NOTE: commonUI.createLocationLink currently doesn't take snapshot/colorblind directly.
        // It calculates status internally using snapshot.locations and snapshot.checkedLocations.
        // This might need adjustment in commonUI or we replicate link creation here.
        // For now, create a simple link.
        const locLink = document.createElement('span');
        locLink.textContent = locationNameDisplay;
        locLink.classList.add('location-link'); // Add class for potential future styling/events
        locLink.dataset.location = locationDef.name;
        locLink.dataset.region = regionName;
        li.appendChild(locLink);

        // Add check button logic (can reuse old logic, ensuring canAccess uses new locAccessible)
        const checkBtn = document.createElement('button');
        checkBtn.classList.add('check-loc-btn');
        checkBtn.textContent = 'Check';
        checkBtn.style.display = locChecked ? 'none' : 'inline-block'; // Show if not checked
        checkBtn.disabled = !locAccessible || locChecked; // Disable if not accessible or already checked
        if (isLoopModeActive && !isLocationDiscovered) checkBtn.disabled = true; // Also disable if undiscovered

        checkBtn.addEventListener('click', async () => {
          if (locAccessible && !locChecked) {
            // Mirror logic from LocationUI.handleLocationClick
            try {
              if (loopStateSingleton.isLoopModeActive) {
                console.log(
                  `[RegionUI CheckBtn] Loop mode active, dispatching check request for ${locationDef.name}`
                );
                // Use eventBus for consistency with LocationUI
                eventBus.publish('user:checkLocationRequest', {
                  locationData: locationDef,
                });
              } else {
                console.log(
                  `[RegionUI CheckBtn] Sending checkLocation command for ${locationDef.name}`
                );
                await stateManager.checkLocation(locationDef.name);
                // Snapshot update should handle the visual change
              }
            } catch (error) {
              console.error(
                `[RegionUI CheckBtn] Error checking location ${locationDef.name}:`,
                error
              );
              // Optionally show user feedback
            }
            /* // OLD logic using dispatcher:
                if (moduleDispatcher) {
                    moduleDispatcher.publish('user:checkLocationRequest', {
                        locationData: locationDef, // Pass the static location data
                    });
                } else {
                    console.error('[RegionUI] Cannot publish checkLocationRequest: moduleDispatcher unavailable.');
                }
                */
          }
        });
        li.appendChild(checkBtn);

        if (locChecked) {
          const checkMark = document.createElement('span');
          checkMark.classList.add('check-mark');
          checkMark.textContent = ' ✓';
          li.appendChild(checkMark);
        }

        // Apply classes based on status
        li.classList.toggle('accessible', locAccessible && !locChecked);
        li.classList.toggle('inaccessible', !locAccessible);
        li.classList.toggle('checked-location', locChecked);
        li.classList.toggle(
          'undiscovered',
          isLoopModeActive && !isLocationDiscovered
        );

        // Render logic tree for the location rule
        if (locationDef.access_rule) {
          const logicTreeElement = renderLogicTree(
            locationDef.access_rule,
            useColorblind,
            snapshotInterface
          );
          const ruleDiv = document.createElement('div');
          ruleDiv.style.marginLeft = '1rem';
          ruleDiv.innerHTML = `Rule: ${logicTreeElement.outerHTML}`;
          li.appendChild(ruleDiv);
        }

        locationsList.appendChild(li);
      });
    } else {
      locationsList.innerHTML = '<li>No locations defined.</li>';
    }
    contentEl.appendChild(locationsList);

    // Add Path Analysis section (structure from old UI)
    const pathsControlDiv = document.createElement('div');
    pathsControlDiv.classList.add('paths-control');
    pathsControlDiv.style.marginTop = '1rem'; // Add some spacing
    pathsControlDiv.innerHTML = `
      <div class="paths-buttons">
        <button class="analyze-paths-btn">Analyze Paths</button>
        <span class="paths-count" style="display: none;"></span>
      </div>
    `;
    contentEl.appendChild(pathsControlDiv);

    const pathsContainer = document.createElement('div');
    pathsContainer.classList.add('region-paths');
    pathsContainer.style.display = 'none'; // Initially hidden
    contentEl.appendChild(pathsContainer);

    // Setup the button using the PathAnalyzerUI instance
    const analyzePathsBtn = pathsControlDiv.querySelector('.analyze-paths-btn');
    const pathsCountSpan = pathsControlDiv.querySelector('.paths-count');
    if (analyzePathsBtn && pathsCountSpan && this.pathAnalyzer) {
      this.setupAnalyzePathsButton(
        analyzePathsBtn,
        pathsCountSpan,
        pathsContainer,
        regionName
      );
    } else {
      console.warn(
        '[RegionUI] Could not set up path analysis button for region:',
        regionName
      );
    }

    // Append header and content
    regionBlock.appendChild(headerEl);
    regionBlock.appendChild(contentEl);

    // --- ADD Collapse Button Listener --- >
    const collapseBtn = headerEl.querySelector('.collapse-btn');
    if (collapseBtn) {
      collapseBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent header click listener
        this.toggleRegionByUID(uid);
      });
    }
    // --- END Add Collapse Button Listener --- >

    return regionBlock;
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

  _suffixIfDuplicate(regionName, uid) {
    // count how many times regionName appears in visited, up to this uid
    const countSoFar = this.visitedRegions.filter(
      (r) => r.name === regionName && r.uid <= uid
    ).length;
    // if it's the first occurrence, return ''
    // if it's the second, return ' (2)', etc.
    return countSoFar > 1 ? ` (${countSoFar})` : '';
  }

  /**
   * Toggles colorblind mode and updates the UI
   */
  toggleColorblindMode() {
    this.colorblindMode = !this.colorblindMode;

    // Update the path analyzer's colorblind mode as well
    this.pathAnalyzer.setColorblindMode(this.colorblindMode);

    // Sync with commonUI
    commonUI.setColorblindMode(this.colorblindMode);

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
        this.colorblindMode &&
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

    console.log(
      `RegionUI: Handling local check for location: ${location.name} in ${location.regionName}`
    );

    // Use the imported moduleDispatcher directly
    if (moduleDispatcher) {
      moduleDispatcher.publish('user:checkLocationRequest', {
        locationName: location.name,
        regionName: location.regionName,
      });
    } else {
      console.error(
        '[RegionUI] Cannot publish user:checkLocationRequest: moduleDispatcher is not available.'
      );
    }
  }

  // --- ADDED: Helper to show/hide region categories ---
  _updateSectionVisibility() {
    if (!this.rootElement) return;

    const availableContent = this.rootElement.querySelector(
      '#available-regions-section .region-category-content'
    );
    const unavailableContent = this.rootElement.querySelector(
      '#unavailable-regions-section .region-category-content'
    );

    const availableSection = this.rootElement.querySelector(
      '#available-regions-section'
    );
    const unavailableSection = this.rootElement.querySelector(
      '#unavailable-regions-section'
    );

    if (availableSection) {
      availableSection.style.display =
        availableContent && availableContent.hasChildNodes() ? '' : 'none';
    }
    if (unavailableSection) {
      unavailableSection.style.display =
        unavailableContent && unavailableContent.hasChildNodes() ? '' : 'none';
    }
    // Add checks for other sections (e.g., completed) if they exist
  }
  // --- END ADDED ---
}

export default RegionUI;

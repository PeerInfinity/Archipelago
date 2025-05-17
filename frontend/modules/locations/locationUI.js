// locationUI.js
import {
  stateManagerProxySingleton as stateManager,
  // createStateSnapshotInterface, // Removed redundant import
} from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js'; // Keep this one
import commonUI, {
  debounce,
  renderLogicTree,
  applyColorblindClass,
} from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import {
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from '../commonUI/index.js';
import { getDispatcher } from './index.js'; // Added import for dispatcher

export class LocationUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement(); // Create the root element on instantiation
    this.locationsGrid = this.rootElement.querySelector('#locations-grid'); // Cache grid element
    this.stateUnsubscribeHandles = []; // Array to store unsubscribe functions for state/loop events
    this.settingsUnsubscribe = null;
    this.colorblindSettings = {}; // Cache colorblind settings
    this.isInitialized = false; // Add flag
    this.originalLocationOrder = []; // ADDED: To store original keys
    this.dispatcher = getDispatcher(); // Get dispatcher instance

    this.container.element.appendChild(this.rootElement);

    // Attach control listeners immediately
    this.attachEventListeners();
    // Subscribe to settings
    this.subscribeToSettings();

    // Defer full data-dependent initialization
    const readyHandler = (eventPayload) => {
      console.log(
        '[LocationUI] Received app:readyForUiDataLoad. Initializing base panel structure and event listeners.'
      );
      this.initialize(); // This sets up stateManager event listeners like snapshotUpdated

      // DO NOT proactively fetch data or render here.
      // Static data (like original orders) will be fetched on 'stateManager:rulesLoaded'.
      // Full render will occur on 'stateManager:ready'.

      // Display a loading message or ensure the UI shows a pending state if not already handled by CSS/initial HTML.
      // For example, if locationsGrid is empty, it might implicitly show as loading.
      // If a specific loading indicator is desired:
      // this.locationsGrid.innerHTML = '<p>Loading locations...</p>';

      this.isInitialized = true; // Mark that basic panel setup is done.
      console.log(
        '[LocationUI] Basic panel setup complete after app:readyForUiDataLoad. Awaiting StateManager readiness.'
      );

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    // Update local cache on any settings change
    this.colorblindSettings =
      settingsManager.getSetting('colorblindMode.locations') || {};

    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.locations')) {
          console.log('LocationUI reacting to settings change:', key);
          // Update cache
          this.colorblindSettings =
            settingsManager.getSetting('colorblindMode.locations') || {};
          this.updateLocationDisplay(); // Trigger redraw
        }
      }
    );
  }

  onPanelDestroy() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
    this.unsubscribeFromStateEvents(); // <-- Call new unsubscribe method
  }

  dispose() {
    this.onPanelDestroy();
  }

  // --- NEW: Event Subscription for State/Loop --- //
  subscribeToStateEvents() {
    try {
      this.unsubscribeFromStateEvents();

      console.log('[LocationUI] Subscribing to state and loop events...');
      if (!eventBus) {
        console.error('[LocationUI] Imported EventBus is not available!');
        return;
      }

      const subscribe = (eventName, handler) => {
        console.log(`[LocationUI] Subscribing to ${eventName}`);
        const unsubscribe = eventBus.subscribe(eventName, handler);
        this.stateUnsubscribeHandles.push(unsubscribe);
      };

      // --- ADDED: Handler for stateManager:ready ---
      const handleReady = () => {
        console.log('[LocationUI] Received stateManager:ready event.');
        // This event confirms StateManager is fully ready (static data and initial snapshot).
        // originalLocationOrder should have been populated by the 'stateManager:rulesLoaded' handler.

        if (!this.isInitialized) {
          // This case should be rare if app:readyForUiDataLoad sets isInitialized correctly.
          console.warn(
            '[LocationUI stateManager:ready] Panel base not yet initialized by app:readyForUiDataLoad. This is unexpected. Proceeding with render attempt.'
          );
          // Attempt to initialize basic event subscriptions if not done.
          // this.initialize(); // Might be redundant or cause issues if called twice. Best to ensure app:readyForUiDataLoad runs first.
        }

        // Ensure originalLocationOrder is available (it should be from rulesLoaded handler)
        if (
          !this.originalLocationOrder ||
          this.originalLocationOrder.length === 0
        ) {
          console.warn(
            '[LocationUI stateManager:ready] Original location order not available. Attempting to fetch now.'
          );
          const currentStaticData = stateManager.getStaticData();
          if (currentStaticData && currentStaticData.locations) {
            this.originalLocationOrder =
              stateManager.getOriginalLocationOrder();
            console.log(
              `[LocationUI stateManager:ready] Fetched ${this.originalLocationOrder.length} location keys for original order.`
            );
          } else {
            console.error(
              '[LocationUI stateManager:ready] Failed to fetch static data/locations for original order. Location panel may not display correctly.'
            );
          }
        }

        console.log(
          '[LocationUI stateManager:ready] Triggering initial full display update.'
        );
        this.updateLocationDisplay(); // This is now the primary trigger for the first full render.
      };
      subscribe('stateManager:ready', handleReady);
      // --- END ADDED ---

      // Debounce handler for subsequent updates
      const debouncedUpdate = debounce(() => {
        if (this.isInitialized) {
          // Only update if initialized
          this.updateLocationDisplay();
        }
      }, 50);

      // Subscribe to state changes that affect location display
      subscribe('stateManager:snapshotUpdated', debouncedUpdate);

      // Keep other subscriptions for logging or potentially fine-grained updates if needed later
      subscribe('stateManager:inventoryChanged', () =>
        console.log('[LocationUI] Saw inventoryChanged (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:regionsComputed', () =>
        console.log('[LocationUI] Saw regionsComputed (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:locationChecked', () =>
        console.log('[LocationUI] Saw locationChecked (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:checkedLocationsCleared', () =>
        console.log(
          '[LocationUI] Saw checkedLocationsCleared (handled by snapshot)'
        )
      ); // No update needed, handled by snapshot

      // Subscribe to loop state changes if relevant
      // Also need rules loaded to trigger initial display and get static data
      subscribe('stateManager:rulesLoaded', (event) => {
        console.log(
          '[LocationUI] Received stateManager:rulesLoaded event. Full refresh triggered.'
        );

        // Access snapshot from event (this is the new initial snapshot for the loaded rules)
        const newSnapshot = event.snapshot;
        if (!newSnapshot) {
          console.warn(
            '[LocationUI rulesLoaded] Snapshot missing from event payload. Aborting refresh.'
          );
          return;
        }
        // Note: this.uiCache in StateManagerProxy is updated with this snapshot,
        // so stateManager.getLatestStateSnapshot() SHOULD return this soon after,
        // but using event.snapshot is more direct for this event.

        // Fetch and store the NEW static data, including the original location order.
        const currentStaticData = stateManager.getStaticData();
        if (currentStaticData && currentStaticData.locations) {
          this.originalLocationOrder = stateManager.getOriginalLocationOrder();
          console.log(
            `[LocationUI rulesLoaded] Stored ${
              this.originalLocationOrder ? this.originalLocationOrder.length : 0
            } location keys for original order.`
          );
        } else {
          console.warn(
            '[LocationUI rulesLoaded] Static data or locations not available from proxy when trying to refresh order. Panel may not sort correctly.'
          );
          this.originalLocationOrder = []; // Reset if not available
        }

        // Now that new static data (including order) and the new snapshot are available,
        // trigger a full display update.
        // The updateLocationDisplay method will use stateManager.getLatestStateSnapshot()
        // and stateManager.getStaticData() which should reflect the newly loaded data.
        console.log('[LocationUI rulesLoaded] Triggering full display update.');
        this.updateLocationDisplay();
      });

      // Subscribe to loop state changes if relevant
      subscribe('loop:stateChanged', debouncedUpdate); // May affect explored status visibility
      subscribe('loop:actionCompleted', debouncedUpdate); // May affect explored status
      subscribe('loop:discoveryChanged', debouncedUpdate); // May affect explored status
      subscribe('loop:modeChanged', (isLoopMode) => {
        debouncedUpdate(); // Update display based on mode change
        // Show/hide loop-specific controls
        const exploredCheckbox =
          this.rootElement?.querySelector('#show-explored');
        if (exploredCheckbox && exploredCheckbox.parentElement) {
          exploredCheckbox.parentElement.style.display = isLoopMode
            ? 'inline-block'
            : 'none';
        }
      });
    } catch (error) {
      console.error('[LocationUI] Error during subscribeToStateEvents:', error);
    }
  }

  unsubscribeFromStateEvents() {
    if (this.stateUnsubscribeHandles.length > 0) {
      console.log('[LocationUI] Unsubscribing from state and loop events...');
      this.stateUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
      this.stateUnsubscribeHandles = [];
    }
  }
  // --- END NEW --- //

  // Creates the main DOM structure for the locations panel
  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('locations-panel-container', 'panel-container'); // Add classes for styling
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    // Recreate controls similar to index.html / old file
    element.innerHTML = `
      <div class="control-group location-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <input type="search" id="location-search" placeholder="Search locations..." style="margin-right: 10px;">
        <select id="sort-select">
          <option value="original">Original Order</option>
          <option value="name">Sort by Name</option>
          <option value="accessibility_original">Sort by Accessibility (Original)</option>
          <option value="accessibility">Sort by Accessibility (Name)</option>
        </select>
        <label>
          <input type="checkbox" id="show-checked" checked />
          Show Checked
        </label>
        <label>
          <input type="checkbox" id="show-reachable" checked />
          Show Reachable
        </label>
        <label>
          <input type="checkbox" id="show-unreachable" checked />
          Show Unreachable
        </label>
        <label style="display: none"> <!-- Initially hidden, controlled by loop mode -->
          <input type="checkbox" id="show-explored" checked />
          Show Explored
        </label>
        <button id="decrease-columns">-</button>
        <span id="column-count" style="margin: 0 5px;">${this.columns}</span> <!-- Display column count -->
        <button id="increase-columns">+</button>
      </div>
      <div id="locations-grid" style="flex-grow: 1; overflow-y: auto;">
        <!-- Populated by updateLocationDisplay -->
      </div>

      <!-- Modal Structure from old file -->
      <div id="location-modal" class="modal hidden">
        <div class="modal-content">
          <span class="modal-close" id="modal-close">&times;</span>
          <h2 id="modal-location-name">Location Name</h2>
          <div id="modal-location-details">
            <!-- Details will be populated here -->
          </div>
          <h3>Accessibility Rule:</h3>
          <div id="modal-rule-tree">
            <!-- Rule tree visualization -->
          </div>
        </div>
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  // Called when the panel is initialized
  async initialize() {
    // Make async
    console.log(
      '[LocationUI] Initializing panel (subscribing to state events)...'
    );

    // Initialization now relies solely on the stateManager:ready event handler.
    this.subscribeToStateEvents(); // Ensure subscriptions are set up
  }

  clear() {
    // const locationsGrid = document.getElementById('locations-grid'); // Use cached element
    if (this.locationsGrid) {
      this.locationsGrid.innerHTML = '';
    }
  }

  update() {
    this.updateLocationDisplay();
  }

  attachEventListeners() {
    // Attach listeners to controls within this.rootElement
    const searchInput = this.rootElement.querySelector('#location-search');
    if (searchInput) {
      // Debounce search input
      searchInput.addEventListener(
        'input',
        debounce(() => this.updateLocationDisplay(), 250)
      );
    }

    [
      'sort-select',
      'show-checked',
      'show-reachable',
      'show-unreachable',
      'show-explored',
    ].forEach((id) => {
      const element = this.rootElement.querySelector(`#${id}`);
      element?.addEventListener('change', () => this.updateLocationDisplay());
    });

    // Column buttons
    this.rootElement
      .querySelector('#decrease-columns')
      ?.addEventListener('click', () => this.changeColumns(-1));
    this.rootElement
      .querySelector('#increase-columns')
      ?.addEventListener('click', () => this.changeColumns(1));

    // Modal listeners - attach to the root element where the modal lives
    this.rootElement
      .querySelector('#modal-close')
      ?.addEventListener('click', () => {
        this.rootElement
          .querySelector('#location-modal')
          ?.classList.add('hidden');
      });

    // Use event delegation for location clicks on the grid
    this.locationsGrid.addEventListener('click', (event) => {
      console.log('[LocationUI] locationsGrid click event:', event.target); // ADDED for debugging
      // Find the closest ancestor element that represents a location
      const locationElement = event.target.closest('.location-card'); // CORRECTED class name
      if (locationElement) {
        const locationString = locationElement.dataset.location; // GET stringified data
        if (locationString) {
          try {
            const locationData = JSON.parse(decodeURIComponent(locationString)); // PARSE data
            if (locationData) {
              // Use ctrlKey or metaKey (for Mac) for showing details
              if (event.ctrlKey || event.metaKey) {
                // this.showLocationDetails(locationData); // MODIFIED: Commented out to prevent modal on simple click
              } else {
                this.handleLocationClick(locationData); // PASS parsed data
              }
            } else {
              console.warn(
                '[LocationUI] Failed to parse location data from dataset.'
              );
            }
          } catch (e) {
            console.error(
              '[LocationUI] Error parsing location data from dataset:',
              e,
              locationString
            );
          }
        } else {
          console.warn(
            '[LocationUI] Clicked location card missing data-location attribute.'
          );
        }
      } else {
        // console.log('[LocationUI] Click was not on a location-card or its child.'); // Optional: for clicks on grid but not card
      }
    });
  }

  changeColumns(delta) {
    const newColumns = Math.max(1, Math.min(10, this.columns + delta)); // Clamp between 1 and 10
    if (newColumns !== this.columns) {
      this.columns = newColumns;
      this.rootElement.querySelector('#column-count').textContent =
        this.columns; // Update display
      this.updateLocationDisplay(); // Redraw with new column count
    }
  }

  async handleLocationClick(locationData) {
    if (!locationData || !locationData.name) {
      console.warn(
        '[LocationUI] handleLocationClick called with invalid locationData:',
        locationData
      );
      return;
    }

    console.log(
      `[LocationUI] Clicked on location: ${locationData.name}, Region: ${locationData.region}`
    );

    // Check if we have a valid snapshot for rule evaluation (optional, based on previous logic)
    const snapshot = await stateManager.getLatestStateSnapshot();
    if (!snapshot) {
      console.warn(
        '[LocationUI] Unable to get current game state snapshot. Proceeding with click dispatch anyway.'
      );
      // Potentially show a message to the user or just proceed with the event publish
    }

    // Removed loop mode active check and direct call to stateManager or eventBus for checkLocationRequest

    const payload = {
      locationName: locationData.name,
      regionName: locationData.region, // Ensure regionName is correctly passed
      originator: 'LocationCardClick',
      originalDOMEvent: true, // Assuming this is a direct user click
    };

    const currentDispatcher = getDispatcher(); // Re-fetch dispatcher instance when needed

    if (currentDispatcher) {
      // Use the re-fetched instance
      currentDispatcher.publish('user:locationCheck', payload, {
        // Use currentDispatcher
        direction: 'bottom',
      });
      console.log('[LocationUI] Dispatched user:locationCheck', payload);
    } else {
      console.error(
        '[LocationUI] Dispatcher still not available to handle location click after re-fetch.' // Updated error message
      );
    }

    // The rest of the original function (showing details, logging) can remain if needed.
    // For example, showing details panel:
    // this.showLocationDetails(locationData); // MODIFIED: Commented out to prevent modal on simple click

    // If there was logging for which locations were clicked for analytics/debugging:
    // console.log(
    //   `User interaction: Location card for '${locationData.name}' clicked.`
    // );
  }

  // Restore syncWithState - primarily for fetching latest state and updating display
  syncWithState() {
    console.log(
      '[LocationUI] syncWithState called (now just triggers updateLocationDisplay)'
    );
    this.updateLocationDisplay();
  }

  // --- Main Rendering Logic ---
  updateLocationDisplay() {
    console.log('[LocationUI] updateLocationDisplay called.');

    // Ensure the panel's basic initialization (DOM structure, non-data listeners) is done.
    // this.isInitialized is set by the app:readyForUiDataLoad handler.
    if (!this.isInitialized) {
      console.warn(
        '[LocationUI updateLocationDisplay] Panel not yet initialized by app:readyForUiDataLoad. Aborting display update.'
      );
      return;
    }

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    console.log(
      `[LocationUI updateLocationDisplay] Start State - Snapshot: ${!!snapshot} Static Data: ${!!staticData}`
    );

    if (
      !snapshot ||
      !staticData ||
      !staticData.locations ||
      !staticData.items
    ) {
      console.warn(
        '[LocationUI] Static location/item data or snapshot not ready. Displaying loading message or clearing grid.'
      );
      // Clear the grid or show a specific loading message
      this.locationsGrid.innerHTML = '<p>Loading location data...</p>';
      return;
    }

    if (
      !this.originalLocationOrder ||
      this.originalLocationOrder.length === 0
    ) {
      console.warn(
        '[LocationUI updateLocationDisplay] Original location order not yet available. Locations might appear unsorted or panel might wait for re-render.'
      );
      // Optionally, fetch it now if it should absolutely be here
      // This can be a fallback, but ideally it's populated by stateManager:rulesLoaded
      const freshlyFetchedOrder = stateManager.getOriginalLocationOrder();
      if (freshlyFetchedOrder && freshlyFetchedOrder.length > 0) {
        this.originalLocationOrder = freshlyFetchedOrder;
        console.log(
          `[LocationUI updateLocationDisplay] Fallback fetch for originalLocationOrder succeeded: ${this.originalLocationOrder.length} items.`
        );
      } else {
        // If still no order, might display loading or unsorted.
        // For now, we'll proceed, and sorting might be off or alphabetical.
        // Consider adding a specific loading message if this.originalLocationOrder is critical for ANY display.
        // this.locationsGrid.innerHTML = '<p>Preparing location order...</p>';
        // return; // Or, allow to proceed with default/name sort if that's acceptable.
      }
    }

    // Reset the unknown evaluation counter for this rendering cycle
    // commonUI.resetUnknownEvaluationCounter(); // This should be done if commonUI is an instance
    resetUnknownEvaluationCounter(); // Assuming this is a global/static reset from commonUI/index.js

    // --- ADDED: Create snapshot interface for rule evaluation on main thread --- >
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      console.error(
        '[LocationUI] Failed to create snapshot interface. Aborting render.'
      );
      this.locationsGrid.innerHTML = '<p>Error creating display context.</p>';
      return;
    }
    // --- END ADDED ---

    // Get filter/sort states from controls
    const showChecked = this.rootElement.querySelector('#show-checked').checked;
    const showReachable =
      this.rootElement.querySelector('#show-reachable').checked;
    const showUnreachable =
      this.rootElement.querySelector('#show-unreachable').checked;
    const showExplored =
      this.rootElement.querySelector('#show-explored').checked;
    const sortMethod = this.rootElement.querySelector('#sort-select').value;
    const searchTerm = this.rootElement
      .querySelector('#location-search')
      .value.toLowerCase();

    // Filter locations
    let filteredLocations = Object.values(staticData.locations).filter(
      (loc) => {
        const name = loc.name;
        const isChecked = !!snapshot?.flags?.includes(name);

        // Determine detailed status for filtering
        const parentRegionName = loc.parent_region || loc.region; // Use parent_region, fallback to region
        const parentRegionReachabilityStatus =
          snapshot?.reachability?.[parentRegionName];
        const isParentRegionEffectivelyReachable =
          parentRegionReachabilityStatus === 'reachable' ||
          parentRegionReachabilityStatus === 'checked';
        const locationAccessRule = loc.access_rule;
        let locationRuleEvalResult = true; // Default to true if no rule
        if (locationAccessRule) {
          locationRuleEvalResult = evaluateRule(
            locationAccessRule,
            snapshotInterface
          );
        }
        const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;

        let detailedStatus = 'fully_unreachable';
        if (isChecked) {
          detailedStatus = 'checked';
        } else if (
          isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'fully_reachable';
        } else if (
          !isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'location_rule_passes_region_fails';
        } else if (
          isParentRegionEffectivelyReachable &&
          !doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'region_accessible_location_rule_fails';
        }

        // Debug logging for specific locations
        if (
          //name === 'Mushroom' ||
          //name === "King's Tomb" ||
          //name === 'Potion Shop' ||
          //name === 'Sahasrahla' ||
          false
        ) {
          // Add more names if needed
          console.log(`[LocationUI Filter DEBUG] Loc: '${name}'`, {
            isChecked,
            parentRegionName,
            parentRegionReachabilityStatus,
            isParentRegionEffectivelyReachable,
            locationAccessRuleExists: !!locationAccessRule,
            locationRuleEvalResult,
            doesLocationRuleEffectivelyPass,
            detailedStatus,
            showChecked,
            showReachable,
            showUnreachable,
          });
        }

        const isExplored = discoveryStateSingleton.isLocationDiscovered(name);

        // Visibility Filtering Logic (Using detailedStatus)
        if (detailedStatus === 'checked') {
          if (!showChecked) return false;
        } else if (detailedStatus === 'fully_reachable') {
          if (!showReachable) return false;
        } else if (detailedStatus === 'location_rule_passes_region_fails') {
          if (!showReachable) return false; // Consider reachable for filter
        } else if (detailedStatus === 'region_accessible_location_rule_fails') {
          if (!showReachable) return false; // Consider reachable for filter
        } else if (detailedStatus === 'fully_unreachable') {
          if (!showUnreachable) return false;
        } else {
          // Default for any unknown detailedStatus if necessary
          if (parentRegionReachabilityStatus === undefined && !showUnreachable)
            return false;
        }

        if (loopStateSingleton.isLoopModeActive && isExplored && !showExplored)
          return false;

        // Search term check (match name or region)
        if (searchTerm) {
          const nameMatch = loc.name.toLowerCase().includes(searchTerm);
          const regionMatch = loc.region?.toLowerCase().includes(searchTerm);
          if (!nameMatch && !regionMatch) return false;
        }

        return true; // Keep location if not filtered out
      }
    );

    // Sort locations
    const accessibilitySortOrder = {
      checked: 0,
      fully_reachable: 1,
      region_accessible_location_rule_fails: 2,
      location_rule_passes_region_fails: 3,
      fully_unreachable: 4,
      unknown: 5, // Should ideally not happen with new logic
    };

    filteredLocations.sort((a, b) => {
      if (sortMethod === 'accessibility') {
        // Recalculate detailedStatus for item a
        const isCheckedA = !!snapshot?.flags?.includes(a.name);
        const parentRegionNameA = a.parent_region || a.region;
        const parentRegionReachabilityStatusA =
          snapshot?.reachability?.[parentRegionNameA];
        const isParentRegionEffectivelyReachableA =
          parentRegionReachabilityStatusA === 'reachable' ||
          parentRegionReachabilityStatusA === 'checked';
        const locationAccessRuleA = a.access_rule;
        const locationRuleEvalResultA = locationAccessRuleA
          ? evaluateRule(locationAccessRuleA, snapshotInterface)
          : true;
        const doesLocationRuleEffectivelyPassA =
          locationRuleEvalResultA === true;
        let detailedStatusA = 'fully_unreachable';
        if (isCheckedA) {
          detailedStatusA = 'checked';
        } else if (
          isParentRegionEffectivelyReachableA &&
          doesLocationRuleEffectivelyPassA
        ) {
          detailedStatusA = 'fully_reachable';
        } else if (
          !isParentRegionEffectivelyReachableA &&
          doesLocationRuleEffectivelyPassA
        ) {
          detailedStatusA = 'location_rule_passes_region_fails';
        } else if (
          isParentRegionEffectivelyReachableA &&
          !doesLocationRuleEffectivelyPassA
        ) {
          detailedStatusA = 'region_accessible_location_rule_fails';
        }

        // Recalculate detailedStatus for item b
        const isCheckedB = !!snapshot?.flags?.includes(b.name);
        const parentRegionNameB = b.parent_region || b.region;
        const parentRegionReachabilityStatusB =
          snapshot?.reachability?.[parentRegionNameB];
        const isParentRegionEffectivelyReachableB =
          parentRegionReachabilityStatusB === 'reachable' ||
          parentRegionReachabilityStatusB === 'checked';
        const locationAccessRuleB = b.access_rule;
        const locationRuleEvalResultB = locationAccessRuleB
          ? evaluateRule(locationAccessRuleB, snapshotInterface)
          : true;
        const doesLocationRuleEffectivelyPassB =
          locationRuleEvalResultB === true;
        let detailedStatusB = 'fully_unreachable';
        if (isCheckedB) {
          detailedStatusB = 'checked';
        } else if (
          isParentRegionEffectivelyReachableB &&
          doesLocationRuleEffectivelyPassB
        ) {
          detailedStatusB = 'fully_reachable';
        } else if (
          !isParentRegionEffectivelyReachableB &&
          doesLocationRuleEffectivelyPassB
        ) {
          detailedStatusB = 'location_rule_passes_region_fails';
        } else if (
          isParentRegionEffectivelyReachableB &&
          !doesLocationRuleEffectivelyPassB
        ) {
          detailedStatusB = 'region_accessible_location_rule_fails';
        }

        const orderA =
          accessibilitySortOrder[detailedStatusA] ??
          accessibilitySortOrder.unknown;
        const orderB =
          accessibilitySortOrder[detailedStatusB] ??
          accessibilitySortOrder.unknown;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.name.localeCompare(b.name);
      } else if (sortMethod === 'accessibility_original') {
        // Determine detailedStatus for item a (similar to 'accessibility' sort)
        const isCheckedA = !!snapshot?.flags?.includes(a.name);
        const parentRegionNameA = a.parent_region || a.region;
        const parentRegionReachabilityStatusA =
          snapshot?.reachability?.[parentRegionNameA];
        const isParentRegionEffectivelyReachableA =
          parentRegionReachabilityStatusA === 'reachable' ||
          parentRegionReachabilityStatusA === 'checked';
        const locationAccessRuleA = a.access_rule;
        const locationRuleEvalResultA = locationAccessRuleA
          ? evaluateRule(locationAccessRuleA, snapshotInterface)
          : true;
        const doesLocationRuleEffectivelyPassA =
          locationRuleEvalResultA === true;
        let detailedStatusA = 'fully_unreachable';
        if (isCheckedA) detailedStatusA = 'checked';
        else if (
          isParentRegionEffectivelyReachableA &&
          doesLocationRuleEffectivelyPassA
        )
          detailedStatusA = 'fully_reachable';
        else if (
          !isParentRegionEffectivelyReachableA &&
          doesLocationRuleEffectivelyPassA
        )
          detailedStatusA = 'location_rule_passes_region_fails';
        else if (
          isParentRegionEffectivelyReachableA &&
          !doesLocationRuleEffectivelyPassA
        )
          detailedStatusA = 'region_accessible_location_rule_fails';

        // Determine detailedStatus for item b (similar to 'accessibility' sort)
        const isCheckedB = !!snapshot?.flags?.includes(b.name);
        const parentRegionNameB = b.parent_region || b.region;
        const parentRegionReachabilityStatusB =
          snapshot?.reachability?.[parentRegionNameB];
        const isParentRegionEffectivelyReachableB =
          parentRegionReachabilityStatusB === 'reachable' ||
          parentRegionReachabilityStatusB === 'checked';
        const locationAccessRuleB = b.access_rule;
        const locationRuleEvalResultB = locationAccessRuleB
          ? evaluateRule(locationAccessRuleB, snapshotInterface)
          : true;
        const doesLocationRuleEffectivelyPassB =
          locationRuleEvalResultB === true;
        let detailedStatusB = 'fully_unreachable';
        if (isCheckedB) detailedStatusB = 'checked';
        else if (
          isParentRegionEffectivelyReachableB &&
          doesLocationRuleEffectivelyPassB
        )
          detailedStatusB = 'fully_reachable';
        else if (
          !isParentRegionEffectivelyReachableB &&
          doesLocationRuleEffectivelyPassB
        )
          detailedStatusB = 'location_rule_passes_region_fails';
        else if (
          isParentRegionEffectivelyReachableB &&
          !doesLocationRuleEffectivelyPassB
        )
          detailedStatusB = 'region_accessible_location_rule_fails';

        const orderA =
          accessibilitySortOrder[detailedStatusA] ??
          accessibilitySortOrder.unknown;
        const orderB =
          accessibilitySortOrder[detailedStatusB] ??
          accessibilitySortOrder.unknown;

        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // Secondary sort: original order
        if (
          this.originalLocationOrder &&
          this.originalLocationOrder.length > 0
        ) {
          const indexA = this.originalLocationOrder.indexOf(a.name);
          const indexB = this.originalLocationOrder.indexOf(b.name);
          if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) return indexA - indexB;
          }
          if (indexA === -1 && indexB !== -1) return 1;
          if (indexA !== -1 && indexB === -1) return -1;
        }
        return a.name.localeCompare(b.name); // Ultimate fallback to name sort
      } else if (sortMethod === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        // 'original' or default
        if (
          this.originalLocationOrder &&
          this.originalLocationOrder.length > 0
        ) {
          return (
            this.originalLocationOrder.indexOf(a.name) -
            this.originalLocationOrder.indexOf(b.name)
          );
        } else {
          // Fallback to name sort if original order isn't available for some reason
          console.warn(
            '[LocationUI] Original location order not available, falling back to name sort.'
          );
          return a.name.localeCompare(b.name);
        }
      }
    });

    console.log(
      `[LocationUI] Processing ${filteredLocations.length} locations from snapshot.`
    );

    // Render
    this.locationsGrid.innerHTML = ''; // Clear previous content
    this.locationsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`; // Apply columns allowing shrink
    this.locationsGrid.style.display = 'grid'; // Ensure grid display
    this.locationsGrid.style.gap = '5px'; // Add gap

    if (filteredLocations.length === 0) {
      this.locationsGrid.innerHTML =
        '<p>No locations match the current filters.</p>';
    } else {
      const fragment = document.createDocumentFragment();
      filteredLocations.forEach((location) => {
        const isExplored = discoveryStateSingleton.isLocationDiscovered(
          location.name
        );

        const locationCard = document.createElement('div');
        locationCard.className = 'location-card'; // Base class
        const name = location.name;
        const isChecked = !!snapshot?.flags?.includes(name);

        // Determine detailed status for rendering
        const parentRegionName = location.parent_region || location.region;
        const parentRegionReachabilityStatus =
          snapshot?.reachability?.[parentRegionName];
        const isParentRegionEffectivelyReachable =
          parentRegionReachabilityStatus === 'reachable' ||
          parentRegionReachabilityStatus === 'checked';
        const locationAccessRule = location.access_rule;
        const locationRuleEvalResult = locationAccessRule
          ? evaluateRule(locationAccessRule, snapshotInterface)
          : true;
        const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;

        let detailedStatus = 'fully_unreachable';
        let statusText = 'Unknown';
        let stateClass = 'unknown';

        if (isChecked) {
          detailedStatus = 'checked';
          statusText = 'Checked';
          stateClass = 'checked';
        } else if (
          isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'fully_reachable';
          statusText = 'Available';
          stateClass = 'fully-reachable'; // Use new class
        } else if (
          !isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'location_rule_passes_region_fails';
          statusText = 'Rule Met, Region Inaccessible';
          stateClass = 'location-only-reachable'; // Use new class
        } else if (
          isParentRegionEffectivelyReachable &&
          !doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'region_accessible_location_rule_fails';
          statusText = 'Region Accessible, Rule Fails';
          stateClass = 'region-only-reachable'; // Use new class
        } else {
          // Fully Unreachable
          detailedStatus = 'fully_unreachable';
          statusText = 'Locked';
          stateClass = 'fully-unreachable'; // Use new class
        }

        // Apply primary state class
        // Remove old classes before adding the new one to avoid conflicts
        locationCard.classList.remove(
          'checked',
          'reachable',
          'unreachable',
          'unknown',
          'fully-reachable',
          'location-only-reachable',
          'region-only-reachable',
          'fully-unreachable'
        );
        locationCard.classList.add(stateClass);

        locationCard.classList.toggle(
          'explored',
          loopStateSingleton.isLoopModeActive && !!isExplored
        );

        // Apply colorblind class correctly
        // Determine if colorblind mode should be applied to this card
        const csObject = this.colorblindSettings;
        let shouldUseColorblindOnCard = false;
        if (typeof csObject === 'boolean') {
          shouldUseColorblindOnCard = csObject;
        } else if (typeof csObject === 'string') {
          // Handle "true" / "false" strings from settings
          shouldUseColorblindOnCard = csObject.toLowerCase() === 'true';
        } else if (typeof csObject === 'object' && csObject !== null) {
          // Handles cases where csObject might be {} (e.g., if original setting was false, null, or undefined),
          // in which case Object.keys().length will be 0, correctly resulting in false.
          shouldUseColorblindOnCard = Object.keys(csObject).length > 0;
        }

        applyColorblindClass(
          locationCard,
          shouldUseColorblindOnCard // Pass the derived boolean, removing the incorrect stateClass and third arg
        );

        try {
          locationCard.dataset.location = encodeURIComponent(
            JSON.stringify(location)
          );
        } catch (e) {
          console.error('Error stringifying location data:', location, e);
        }

        let cardHTML = `<span class="location-name">${name}</span>`;

        // Player Info
        if (location.player) {
          cardHTML += `<div class="text-sm">Player ${location.player}</div>`;
        }

        // Region Info & Link
        if (location.parent_region) {
          // We need to determine parent_region's accessibility.
          // This isn't directly in the location's reachability snapshot.
          // For simplicity, we'll rely on the location's overall reachability for now
          // or assume parent_region accessibility is part of the location's accessibility.
          // A more accurate way would be to check snapshot.reachability for the region itself,
          // but that data isn't structured per region in the current snapshot.
          const regionIsAccessible =
            parentRegionReachabilityStatus === 'reachable'; // Approximation
          const regionLink = commonUI.createRegionLink(
            location.parent_region,
            this.colorblindSettings,
            snapshot // Pass the snapshot object
          );
          // regionLink.style.color = regionIsAccessible ? 'inherit' : 'red'; // Styling handled by commonUI or CSS

          cardHTML += `<div class="text-sm">Region: ${regionLink.outerHTML} 
            (${regionIsAccessible ? 'Accessible' : 'Inaccessible'})</div>`;
        }

        // Location Logic Tree
        if (location.access_rule) {
          const logicTreeElement = commonUI.renderLogicTree(
            location.access_rule,
            this.colorblindSettings,
            snapshotInterface
          );
          cardHTML += `<div class="text-sm">Rule: ${logicTreeElement.outerHTML}</div>`;
        }

        // Detailed Status Text
        cardHTML += `<div class="text-sm">Status: ${statusText}</div>`;

        locationCard.innerHTML = cardHTML;

        if (loopStateSingleton.isLoopModeActive && !!isExplored) {
          const exploredIndicator = document.createElement('span');
          exploredIndicator.className = 'location-explored-indicator';
          exploredIndicator.textContent = ' [E]';
          exploredIndicator.title = 'Explored in current loop';
          locationCard.appendChild(exploredIndicator);
        }

        fragment.appendChild(locationCard);
      });
      this.locationsGrid.appendChild(fragment);
    }
    console.log(`[LocationUI] Rendered ${filteredLocations.length} locations.`);
    logAndGetUnknownEvaluationCounter('LocationPanel update complete'); // Log count at the end
  }

  // Helper to determine status based on snapshot
  getLocationStatus(locationName, snapshot) {
    // --- ADD: Log input and snapshot data --- >
    //console.log(`[LocationUI getLocationStatus] Checking: ${locationName}`);
    if (!snapshot || !snapshot.reachability) {
      //console.log(
      //  `[LocationUI getLocationStatus] Snapshot or reachability missing for ${locationName}`
      //);
      return 'unknown'; // Or some default/loading state
    }
    // Reachability is now expected to be a boolean in the snapshot
    const isReachable = snapshot.reachability[locationName] === true;
    const isChecked = snapshot.flags?.includes(locationName);
    //console.log(
    //  `[LocationUI getLocationStatus] Name: ${locationName}, Reachability: ${reachabilityStatus}, Checked: ${isChecked}`
    //);
    // --- END LOG --- >

    if (isChecked) {
      return 'checked';
    }

    // Interpret reachability status - CORRECTED FOR BOOLEAN
    if (isReachable) {
      return 'reachable';
    } else {
      // Assuming false means unreachable if not checked
      return 'unreachable';
    }
    // We no longer expect string values like 'partial' or 'processing' here from the boolean snapshot
  }

  /**
   * Displays detailed information about a specific location, including its access rules.
   * @param {object} location - The location object from static data.
   */
  async showLocationDetails(location) {
    console.log('[LocationUI] showLocationDetails called for:', location.name);
    if (!location || !location.name) {
      console.warn('[LocationUI] showLocationDetails: Invalid location data.');
      return;
    }

    const modalElement = this.rootElement.querySelector('#location-modal');
    const modalTitle = this.rootElement.querySelector('#modal-location-name');
    const modalDetails = this.rootElement.querySelector(
      '#modal-location-details'
    );
    const modalRuleTree = this.rootElement.querySelector('#modal-rule-tree');

    if (!modalElement || !modalTitle || !modalDetails || !modalRuleTree) {
      console.error(
        '[LocationUI] Modal elements not found in this.rootElement.'
      );
      return;
    }

    const snapshot = await stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    if (!snapshot || !staticData) {
      // Populate and show modal with error
      modalTitle.textContent = 'Error';
      modalDetails.innerHTML =
        '<p>Could not retrieve current game state or static data to show location details.</p>';
      modalRuleTree.innerHTML = ''; // Clear rule tree
      modalElement.classList.remove('hidden');
      return;
    }

    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      modalTitle.textContent = 'Error';
      modalDetails.innerHTML =
        '<p>Failed to create snapshot interface for details.</p>';
      modalRuleTree.innerHTML = '';
      modalElement.classList.remove('hidden');
      return;
    }

    let accessResultText = 'Rule not defined or evaluation failed.';
    modalRuleTree.innerHTML = ''; // Clear previous rule tree

    if (location.access_rule) {
      try {
        const isAccessible = evaluateRule(
          location.access_rule,
          snapshotInterface
        );
        accessResultText = `Rule evaluates to: ${
          isAccessible ? 'TRUE' : 'FALSE'
        }`;

        // Use stateManager (proxy) to check for staleness
        if (
          stateManager.isSnapshotPotentiallyStale &&
          stateManager.isSnapshotPotentiallyStale()
        ) {
          accessResultText += ' (State snapshot might be stale)';
        }

        // Render the rule tree using the imported renderLogicTree
        // Ensure commonUI default export is not used if renderLogicTree is a named export
        const treeElement = renderLogicTree(
          location.access_rule,
          this.colorblindSettings,
          snapshotInterface
        );
        modalRuleTree.appendChild(treeElement);
      } catch (error) {
        console.error(
          '[LocationUI showLocationDetails] Error evaluating rule locally:',
          error
        );
        accessResultText = `Error evaluating rule locally: ${error.message}`;
        modalRuleTree.textContent = 'Error rendering rule tree.';
      }
    } else {
      accessResultText = 'No access rule defined.';
      modalRuleTree.textContent = 'No rule defined.';
    }

    modalTitle.textContent = `Details for ${location.name}`;
    let detailsContent = `<p><strong>Region:</strong> ${
      location.region || 'N/A'
    }</p>`;
    detailsContent += `<p><strong>Type:</strong> ${location.type || 'N/A'}</p>`;
    // Add more location details as needed (e.g., item if present in staticData.locations[location.name].item)
    const staticLocationData = staticData.locations[location.name];
    if (staticLocationData && staticLocationData.item) {
      detailsContent += `<p><strong>Item:</strong> ${
        staticLocationData.item.name || 'Unknown Item'
      } (Player ${staticLocationData.item.player || 'N/A'})</p>`;
    }
    detailsContent += `<p><strong>Current Evaluation:</strong> ${accessResultText}</p>`;

    modalDetails.innerHTML = detailsContent;
    modalElement.classList.remove('hidden');
  }
}

export default LocationUI;

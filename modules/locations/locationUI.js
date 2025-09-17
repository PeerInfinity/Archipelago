// locationUI.js
import {
  stateManagerProxySingleton as stateManager,
  // createStateSnapshotInterface, // Removed redundant import
} from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js'; // Keep this one
import commonUI, {
  debounce,
  renderLogicTree,
  applyColorblindClass,
} from '../commonUI/index.js';
// Discovery mode tracking will be done via event listener
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import {
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from '../commonUI/index.js';
import { getDispatcher } from './index.js'; // Added import for dispatcher

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('locationUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[locationUI] ${message}`, ...data);
  }
}

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
    this.showLocationItems = false; // Cache showLocationItems setting
    this.isInitialized = false; // Add flag
    this.isDiscoveryModeActive = false; // Track discovery mode state
    this.originalLocationOrder = []; // ADDED: To store original keys
    this.pendingLocations = new Set(); // ADDED: To track pending locations
    // this.dispatcher = getDispatcher(); // Removed from constructor

    this.container.element.appendChild(this.rootElement);

    // Attach control listeners immediately
    this.attachEventListeners();
    // Subscribe to settings (async)
    this.subscribeToSettings().catch(error => {
      log('error', 'Error subscribing to settings:', error);
    });

    // Defer full data-dependent initialization
    const readyHandler = (eventPayload) => {
      log(
        'info',
        '[LocationUI] Received app:readyForUiDataLoad. Initializing base panel structure and event listeners.'
      );
      this.initialize(); // This sets up stateManager event listeners like snapshotUpdated
      this.dispatcher = getDispatcher(); // Added: Get dispatcher here

      // DO NOT proactively fetch data or render here.
      // Static data (like original orders) will be fetched on 'stateManager:rulesLoaded'.
      // Full render will occur on 'stateManager:ready'.

      // Display a loading message or ensure the UI shows a pending state if not already handled by CSS/initial HTML.
      // For example, if locationsGrid is empty, it might implicitly show as loading.
      // If a specific loading indicator is desired:
      // this.locationsGrid.innerHTML = '<p>Loading locations...</p>';

      this.isInitialized = true; // Mark that basic panel setup is done.
      log(
        'info',
        '[LocationUI] Basic panel setup complete after app:readyForUiDataLoad. Awaiting StateManager readiness.'
      );

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'locations');

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  async subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    // Update local cache on any settings change
    try {
      this.colorblindSettings = await settingsManager.getSetting('colorblindMode.locations', false);
      this.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);
    } catch (error) {
      log('error', 'Error loading settings:', error);
      this.colorblindSettings = false;
      this.showLocationItems = false;
    }

    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      async ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.locations') || key.startsWith('moduleSettings.commonUI.showLocationItems')) {
          log('info', 'LocationUI reacting to settings change:', key);
          // Update cache
          try {
            this.colorblindSettings = await settingsManager.getSetting('colorblindMode.locations', false);
            this.showLocationItems = await settingsManager.getSetting('moduleSettings.commonUI.showLocationItems', false);
          } catch (error) {
            log('error', 'Error loading settings during update:', error);
            this.colorblindSettings = false;
            this.showLocationItems = false;
          }
          this.updateLocationDisplay(); // Trigger redraw
        }
      }
    , 'locations');
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

      log('info', '[LocationUI] Subscribing to state and loop events...');
      if (!eventBus) {
        log('error', '[LocationUI] Imported EventBus is not available!');
        return;
      }

      const subscribe = (eventName, handler) => {
        log('info', `[LocationUI] Subscribing to ${eventName}`);
        const unsubscribe = eventBus.subscribe(eventName, handler, 'locations');
        this.stateUnsubscribeHandles.push(unsubscribe);
      };

      // --- ADDED: Handler for stateManager:ready ---
      const handleReady = () => {
        log('info', '[LocationUI] Received stateManager:ready event.');
        // This event confirms StateManager is fully ready (static data and initial snapshot).
        // originalLocationOrder should have been populated by the 'stateManager:rulesLoaded' handler.

        if (!this.isInitialized) {
          // This case should be rare if app:readyForUiDataLoad sets isInitialized correctly.
          log(
            'warn',
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
          log(
            'warn',
            '[LocationUI stateManager:ready] Original location order not available. Attempting to fetch now.'
          );
          const currentStaticData = stateManager.getStaticData();
          if (currentStaticData && currentStaticData.locations) {
            this.originalLocationOrder =
              stateManager.getOriginalLocationOrder();
            log(
              'info',
              `[LocationUI stateManager:ready] Fetched ${this.originalLocationOrder.length} location keys for original order.`
            );
          } else {
            log(
              'error',
              '[LocationUI stateManager:ready] Failed to fetch static data/locations for original order. Location panel may not display correctly.'
            );
          }
        }

        log(
          'info',
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
        log('info', '[LocationUI] Saw inventoryChanged (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:regionsComputed', () =>
        log('info', '[LocationUI] Saw regionsComputed (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:locationChecked', () =>
        log('info', '[LocationUI] Saw locationChecked (handled by snapshot)')
      ); // No update needed, handled by snapshot
      subscribe('stateManager:checkedLocationsCleared', () =>
        log(
          'info',
          '[LocationUI] Saw checkedLocationsCleared (handled by snapshot)'
        )
      ); // No update needed, handled by snapshot

      // Subscribe to loop state changes if relevant
      // Also need rules loaded to trigger initial display and get static data
      subscribe('stateManager:rulesLoaded', (event) => {
        log(
          'info',
          '[LocationUI] Received stateManager:rulesLoaded event. Full refresh triggered with state reset.'
        );

        // Access snapshot from event (this is the new initial snapshot for the loaded rules)
        const newSnapshot = event.snapshot;
        if (!newSnapshot) {
          log(
            'warn',
            '[LocationUI rulesLoaded] Snapshot missing from event payload. Aborting refresh.'
          );
          return;
        }
        // Note: this.uiCache in StateManagerProxy is updated with this snapshot,
        // so stateManager.getLatestStateSnapshot() SHOULD return this soon after,
        // but using event.snapshot is more direct for this event.

        // RESET UI STATE: Clear all panel-specific state that should reset when rules are reloaded
        log('info', '[LocationUI rulesLoaded] Resetting panel state...');
        this.pendingLocations.clear(); // Clear all pending location states
        // Note: No need to clear checked locations here as they come from the game state snapshot
        
        // Force clear the UI display immediately to remove any stale DOM content
        this.clear(); // This will clear the locations grid

        // Fetch and store the NEW static data, including the original location order.
        const currentStaticData = stateManager.getStaticData();
        if (currentStaticData && currentStaticData.locations) {
          this.originalLocationOrder = stateManager.getOriginalLocationOrder();
          log(
            'info',
            `[LocationUI rulesLoaded] Stored ${
              this.originalLocationOrder ? this.originalLocationOrder.length : 0
            } location keys for original order.`
          );
        } else {
          log(
            'warn',
            '[LocationUI rulesLoaded] Static data or locations not available from proxy when trying to refresh order. Panel may not sort correctly.'
          );
          this.originalLocationOrder = []; // Reset if not available
        }

        // Now that new static data (including order) and the new snapshot are available,
        // trigger a full display update.
        // The updateLocationDisplay method will use stateManager.getLatestStateSnapshot()
        // and stateManager.getStaticData() which should reflect the newly loaded data.
        log('info', '[LocationUI rulesLoaded] Triggering full display update after state reset.');
        this.updateLocationDisplay();
      });

      // Subscribe to state manager location check rejection events
      subscribe('stateManager:locationCheckRejected', this.handleLocationCheckRejected.bind(this));

      // Subscribe to loop state changes if relevant
      subscribe('loop:stateChanged', debouncedUpdate); // May affect explored status visibility
      subscribe('loop:actionCompleted', debouncedUpdate); // May affect explored status
      subscribe('discovery:changed', debouncedUpdate); // May affect explored status
      subscribe('discovery:modeChanged', (data) => {
        if (data && typeof data.active === 'boolean') {
          this.isDiscoveryModeActive = data.active;
          log('info', `[LocationUI] Discovery mode changed: ${this.isDiscoveryModeActive}`);
          debouncedUpdate(); // Update display based on mode change
          // Show/hide discovery-specific controls
          const exploredCheckbox =
            this.rootElement?.querySelector('#show-explored');
          if (exploredCheckbox && exploredCheckbox.parentElement) {
            exploredCheckbox.parentElement.style.display = this.isDiscoveryModeActive
              ? 'inline-block'
              : 'none';
          }
        }
      });
    } catch (error) {
      log('error', '[LocationUI] Error during subscribeToStateEvents:', error);
    }
  }

  unsubscribeFromStateEvents() {
    if (this.stateUnsubscribeHandles.length > 0) {
      log('info', '[LocationUI] Unsubscribing from state and loop events...');
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
          <input type="checkbox" id="show-pending" checked />
          Show Pending
        </label>
        <label>
          <input type="checkbox" id="show-reachable" checked />
          Show Reachable
        </label>
        <label>
          <input type="checkbox" id="show-unreachable" checked />
          Show Unreachable
        </label>
        <label style="display: none"> <!-- Initially hidden, controlled by discovery mode -->
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
    log(
      'info',
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
      'show-pending',
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
      log('info', '[LocationUI] locationsGrid click event:', event.target); // ADDED for debugging

      // Check if the click target or its parent (up to the card) is a region link
      let currentTarget = event.target;
      while (
        currentTarget &&
        currentTarget !== this.locationsGrid &&
        !currentTarget.classList.contains('location-card')
      ) {
        if (currentTarget.classList.contains('region-link')) {
          log(
            'info',
            '[LocationUI] Click originated from a region-link, ignoring for location card action.'
          );
          return; // Ignore clicks on region links
        }
        currentTarget = currentTarget.parentElement;
      }

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
              log(
                'warn',
                '[LocationUI] Failed to parse location data from dataset.'
              );
            }
          } catch (e) {
            log(
              'error',
              '[LocationUI] Error parsing location data from dataset:',
              e,
              locationString
            );
          }
        } else {
          log(
            'warn',
            '[LocationUI] Clicked location card missing data-location attribute.'
          );
        }
      } else {
        // log('info', '[LocationUI] Click was not on a location-card or its child.'); // Optional: for clicks on grid but not card
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
      log('warn', '[LocationUI] Invalid locationData in handleLocationClick');
      return;
    }

    // ADDED: Add to pending set and update UI
    this.pendingLocations.add(locationData.name);
    this.updateLocationDisplay(); // Trigger UI update to show pending state immediately

    if (!this.dispatcher) {
      log(
        'error',
        '[LocationUI] Dispatcher not available in handleLocationClick. Cannot send location check request.'
      );
      // Optionally, try to re-acquire it, though if initialize() hasn't run, it might still be null.
      // this.dispatcher = getDispatcher();
      // if (!this.dispatcher) return;
      return;
    }

    const locationName = locationData.name;

    log(
      'info',
      `[LocationUI] Clicked on location: ${locationName}, Region: ${locationData.region}`
    );

    // Check if we have a valid snapshot for rule evaluation (optional, based on previous logic)
    const snapshot = await stateManager.getLatestStateSnapshot();
    if (!snapshot) {
      log(
        'warn',
        '[LocationUI] Unable to get current game state snapshot. Proceeding with click dispatch anyway.'
      );
      // Potentially show a message to the user or just proceed with the event publish
    }

    // Removed discovery mode active check and direct call to stateManager or eventBus for checkLocationRequest

    const payload = {
      locationName: locationName,
      regionName: locationData.region, // Ensure regionName is correctly passed
      originator: 'LocationCardClick',
      originalDOMEvent: true, // Assuming this is a direct user click
    };

    const currentDispatcher = getDispatcher(); // Re-fetch dispatcher instance when needed

    if (currentDispatcher) {
      // Use the re-fetched instance
      currentDispatcher.publish('user:locationCheck', payload, {
        // Use currentDispatcher
        initialTarget: 'bottom',
      });
      log('info', '[LocationUI] Dispatched user:locationCheck', payload);
    } else {
      log(
        'error',
        '[LocationUI] Dispatcher still not available to handle location click after re-fetch.' // Updated error message
      );
    }

    // The rest of the original function (showing details, logging) can remain if needed.
    // For example, showing details panel:
    // this.showLocationDetails(locationData); // MODIFIED: Commented out to prevent modal on simple click

    // If there was logging for which locations were clicked for analytics/debugging:
    // log('info',
    //   `User interaction: Location card for '${locationData.name}' clicked.`
        // );
  }

  /**
   * Handles location check rejection events from the state manager.
   * This is called when the state manager rejects a location check due to inaccessibility.
   */
  handleLocationCheckRejected(eventData) {
    const { locationName, reason } = eventData;
    
    log('info', `[LocationUI] Location check rejected for ${locationName}: ${reason}`);
    
    // Clear pending state for this location
    if (this.pendingLocations.has(locationName)) {
      this.pendingLocations.delete(locationName);
      log('info', `[LocationUI] Cleared pending state for rejected location: ${locationName}`);
      
      // Update the display to reflect the cleared pending state
      this.updateLocationDisplay();
    }
  }
  
  // Restore syncWithState - primarily for fetching latest state and updating display
  syncWithState() {
    log(
      'info',
      '[LocationUI] syncWithState called (now just triggers updateLocationDisplay)'
    );
    this.updateLocationDisplay();
  }

  // --- Main Rendering Logic ---
  updateLocationDisplay() {
    log('info', '[LocationUI] updateLocationDisplay called.');

    // Ensure the panel's basic initialization (DOM structure, non-data listeners) is done.
    // this.isInitialized is set by the app:readyForUiDataLoad handler.
    if (!this.isInitialized) {
      log(
        'warn',
        '[LocationUI updateLocationDisplay] Panel not yet initialized by app:readyForUiDataLoad. Aborting display update.'
      );
      return;
    }

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    log(
      'info',
      `[LocationUI updateLocationDisplay] Start State - Snapshot: ${!!snapshot} Static Data: ${!!staticData}`
    );

    if (
      !snapshot ||
      !staticData ||
      !staticData.locations ||
      !staticData.items
    ) {
      log(
        'warn',
        '[LocationUI] Static location/item data or snapshot not ready. Displaying loading message or clearing grid.'
      );
      // Clear the grid or show a specific loading message
      this.locationsGrid.innerHTML = '<p>Loading location data...</p>';
      return;
    }

    // Get sort method early to determine if original order warning is relevant
    const sortMethod = this.rootElement.querySelector('#sort-select').value;

    if (
      !this.originalLocationOrder ||
      this.originalLocationOrder.length === 0
    ) {
      // Only warn if not in "Show All" mode and original order is expected for sorting.
      if (
        (sortMethod === 'original' ||
          sortMethod === 'accessibility_original') &&
        Object.keys(staticData.locations).length > 0 // Only warn if there should be locations
      ) {
        log(
          'warn',
          '[LocationUI updateLocationDisplay] Original location order is empty (and an original-order sort is selected). Locations might appear unsorted or panel might wait for re-render.'
        );
      }
      // The fallback fetch logic can remain as it might still be useful in some edge cases
      // or if staticData itself was temporarily unavailable from the proxy.
      const freshlyFetchedOrder = stateManager.getOriginalLocationOrder();
      if (freshlyFetchedOrder && freshlyFetchedOrder.length > 0) {
        this.originalLocationOrder = freshlyFetchedOrder;
        log(
          'info',
          `[LocationUI updateLocationDisplay] Fallback fetch for originalLocationOrder succeeded: ${this.originalLocationOrder.length} items.`
        );
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
      log(
        'error',
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
    const showPending = this.rootElement.querySelector('#show-pending').checked; // ADDED: Get showPending state
    // sortMethod already declared above
    const searchTerm = this.rootElement
      .querySelector('#location-search')
      .value.toLowerCase();

    // Filter locations
    let filteredLocations = Object.values(staticData.locations).filter(
      (loc) => {
        const name = loc.name;
        const isChecked = !!snapshot?.checkedLocations?.includes(name);

        // Clear pending state for locations that have been processed by stateManager
        if (this.pendingLocations.has(name) && isChecked) {
          // Location was successfully checked, clear pending
          this.pendingLocations.delete(name);
        }
        const isPending = this.pendingLocations.has(name); // Check if pending AFTER potential removal

        // Determine detailed status for filtering
        const parentRegionName = loc.parent_region || loc.region; // Use parent_region, fallback to region
        const parentRegionReachabilityStatus =
          snapshot?.regionReachability?.[parentRegionName];
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
        } else if (isPending) {
          detailedStatus = 'pending';
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
          log('info', `[LocationUI Filter DEBUG] Loc: '${name}'`, {
            isChecked,
            isPending, // ADDED for debug
            parentRegionName,
            parentRegionReachabilityStatus,
            isParentRegionEffectivelyReachable,
            locationAccessRuleExists: !!locationAccessRule,
            locationRuleEvalResult,
            doesLocationRuleEffectivelyPass,
            detailedStatus,
            showChecked,
            showPending, // ADDED for debug
            showReachable,
            showUnreachable,
          });
        }

        const isExplored = discoveryStateSingleton.isLocationDiscovered(name);

        // Visibility Filtering Logic (Using detailedStatus)
        if (detailedStatus === 'checked') {
          if (!showChecked) return false;
        } else if (detailedStatus === 'pending') {
          // ADDED: Handle pending state visibility
          if (!showPending) return false;
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
          // This case should be less likely with the explicit detailedStatus settings
          if (parentRegionReachabilityStatus === undefined && !showUnreachable)
            // Example condition if needed
            return false;
        }

        if (this.isDiscoveryModeActive && isExplored && !showExplored)
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
      pending: 1,
      fully_reachable: 2,
      region_accessible_location_rule_fails: 3,
      location_rule_passes_region_fails: 4,
      fully_unreachable: 5,
      unknown: 6, // Should ideally not happen with new logic
    };

    filteredLocations.sort((a, b) => {
      if (sortMethod === 'accessibility') {
        // Recalculate detailedStatus for item a
        const isCheckedA = !!snapshot?.checkedLocations?.includes(a.name);
        const isPendingA = this.pendingLocations.has(a.name) && !isCheckedA;
        const parentRegionNameA = a.parent_region || a.region;
        const parentRegionReachabilityStatusA =
          snapshot?.regionReachability?.[parentRegionNameA];
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
        } else if (isPendingA) {
          detailedStatusA = 'pending';
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
        const isCheckedB = !!snapshot?.checkedLocations?.includes(b.name);
        const isPendingB = this.pendingLocations.has(b.name) && !isCheckedB;
        const parentRegionNameB = b.parent_region || b.region;
        const parentRegionReachabilityStatusB =
          snapshot?.regionReachability?.[parentRegionNameB];
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
        } else if (isPendingB) {
          detailedStatusB = 'pending';
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
        const isCheckedA = !!snapshot?.checkedLocations?.includes(a.name);
        const isPendingA = this.pendingLocations.has(a.name) && !isCheckedA;
        const parentRegionNameA = a.parent_region || a.region;
        const parentRegionReachabilityStatusA =
          snapshot?.regionReachability?.[parentRegionNameA];
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
        else if (isPendingA) detailedStatusA = 'pending';
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
        const isCheckedB = !!snapshot?.checkedLocations?.includes(b.name);
        const isPendingB = this.pendingLocations.has(b.name) && !isCheckedB;
        const parentRegionNameB = b.parent_region || b.region;
        const parentRegionReachabilityStatusB =
          snapshot?.regionReachability?.[parentRegionNameB];
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
        else if (isPendingB) detailedStatusB = 'pending';
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
          log(
            'warn',
            '[LocationUI] Original location order not available, falling back to name sort.'
          );
          return a.name.localeCompare(b.name);
        }
      }
    });

    log(
      'info',
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
        const name = location.name;
        const isChecked = !!snapshot?.checkedLocations?.includes(name);
        const isPending = this.pendingLocations.has(name) && !isChecked;
        const isExplored = discoveryStateSingleton.isLocationDiscovered(name);

        const locationCard = document.createElement('div');
        locationCard.className = 'location-card'; // Base class

        // Determine detailed status, statusText, and stateClass for rendering THIS card
        const parentRegionName = location.parent_region || location.region;
        const parentRegionReachabilityStatus =
          snapshot?.regionReachability?.[parentRegionName];
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
        } else if (isPending) {
          detailedStatus = 'pending';
          statusText = 'Pending';
          stateClass = 'pending';
        } else if (
          isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'fully_reachable';
          statusText = 'Available';
          stateClass = 'fully-reachable';
        } else if (
          !isParentRegionEffectivelyReachable &&
          doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'location_rule_passes_region_fails';
          statusText = 'Rule Met, Region Inaccessible';
          stateClass = 'location-only-reachable';
        } else if (
          isParentRegionEffectivelyReachable &&
          !doesLocationRuleEffectivelyPass
        ) {
          detailedStatus = 'region_accessible_location_rule_fails';
          statusText = 'Region Accessible, Rule Fails';
          stateClass = 'region-only-reachable';
        }

        locationCard.classList.remove(
          'checked',
          'reachable',
          'unreachable',
          'unknown',
          'fully-reachable',
          'location-only-reachable',
          'region-only-reachable',
          'fully-unreachable',
          'pending'
        );
        locationCard.classList.add(stateClass);

        locationCard.classList.toggle(
          'explored',
          this.isDiscoveryModeActive && !!isExplored
        );

        const csObject = this.colorblindSettings;
        let shouldUseColorblindOnCard = false;
        if (typeof csObject === 'boolean') {
          shouldUseColorblindOnCard = csObject;
        } else if (typeof csObject === 'string') {
          // Handle "true" / "false" strings from settings
          shouldUseColorblindOnCard = csObject.toLowerCase() === 'true';
        } else if (typeof csObject === 'object' && csObject !== null) {
          shouldUseColorblindOnCard = Object.keys(csObject).length > 0;
        }

        applyColorblindClass(locationCard, shouldUseColorblindOnCard);

        try {
          locationCard.dataset.location = encodeURIComponent(
            JSON.stringify(location)
          );
        } catch (e) {
          log('error', 'Error stringifying location data:', location, e);
        }

        // Clear existing content of locationCard before appending new elements
        locationCard.innerHTML = '';

        // Location Name (as a span)
        const locationNameSpan = document.createElement('span');
        locationNameSpan.className = 'location-name';
        locationNameSpan.textContent = name;
        locationCard.appendChild(locationNameSpan);

        // Item at Location (if showLocationItems is enabled)
        if (this.showLocationItems && snapshot?.locationItems) {
          const itemAtLocation = snapshot.locationItems[name];
          if (itemAtLocation && itemAtLocation.name) {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'text-sm location-item-name';
            itemDiv.style.fontStyle = 'italic';
            itemDiv.textContent = `Item: ${itemAtLocation.name}`;
            if (itemAtLocation.player) {
              itemDiv.textContent += ` (Player ${itemAtLocation.player})`;
            }
            locationCard.appendChild(itemDiv);
          }
        }

        // Region Info & Link
        const regionNameForLink = location.parent_region || location.region;
        const regionInfoDiv = document.createElement('div');
        regionInfoDiv.className = 'text-sm location-card-region-link';
        if (regionNameForLink) {
          const regionLink = commonUI.createRegionLink(
            regionNameForLink,
            this.colorblindSettings,
            snapshot
          );
          regionInfoDiv.appendChild(document.createTextNode('Region: '));
          regionInfoDiv.appendChild(regionLink); // Append the DOM element
        } else {
          regionInfoDiv.textContent = 'Region: N/A';
        }
        locationCard.appendChild(regionInfoDiv);

        // Dungeon Info & Link (only if region belongs to a dungeon)
        const dungeonData = this.findDungeonForRegion(regionNameForLink);
        if (dungeonData) {
          const dungeonInfoDiv = document.createElement('div');
          dungeonInfoDiv.className = 'text-sm location-card-dungeon-link';
          dungeonInfoDiv.appendChild(document.createTextNode('Dungeon: '));
          const dungeonLink = this.createDungeonLink(dungeonData.name);
          dungeonInfoDiv.appendChild(dungeonLink);
          locationCard.appendChild(dungeonInfoDiv);
        }

        // Player Info
        if (location.player) {
          const playerInfoDiv = document.createElement('div');
          playerInfoDiv.className = 'text-sm';
          playerInfoDiv.textContent = `Player ${location.player}`;
          locationCard.appendChild(playerInfoDiv);
        }

        // Location Logic Tree
        if (location.access_rule) {
          const ruleDiv = document.createElement('div');
          ruleDiv.className = 'text-sm';
          // Create context-aware snapshot interface with location object
          const locationContextInterface = createStateSnapshotInterface(
            snapshot,
            staticData,
            { location: location }
          );
          const logicTreeElement = commonUI.renderLogicTree(
            location.access_rule,
            this.colorblindSettings,
            locationContextInterface
          );
          ruleDiv.appendChild(document.createTextNode('Rule: '));
          ruleDiv.appendChild(logicTreeElement); // Append the DOM element
          locationCard.appendChild(ruleDiv);
        }

        // Detailed Status Text
        const statusDiv = document.createElement('div');
        statusDiv.className = 'text-sm';
        statusDiv.textContent = `Status: ${statusText}`;
        locationCard.appendChild(statusDiv);

        if (this.isDiscoveryModeActive && !!isExplored) {
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
    log('info', `[LocationUI] Rendered ${filteredLocations.length} locations.`);
    logAndGetUnknownEvaluationCounter('LocationPanel update complete'); // Log count at the end
  }

  // Helper to determine status based on snapshot
  getLocationStatus(locationName, snapshot) {
    // --- ADD: Log input and snapshot data --- >
    //log('info', `[LocationUI getLocationStatus] Checking: ${locationName}`);
    if (!snapshot || !snapshot.locationReachability) {
      //log('info',
      //  `[LocationUI getLocationStatus] Snapshot or locationReachability missing for ${locationName}`
      //);
      return 'unknown'; // Or some default/loading state
    }
    // Use only locationReachability for locations
    const locationReachabilityData = snapshot.locationReachability;
    const locationStatus = locationReachabilityData[locationName];
    const isChecked = snapshot.checkedLocations?.includes(locationName);
    

    if (isChecked) {
      return 'checked';
    }

    // Handle string status values from stateManager
    if (locationStatus === 'reachable') {
      return 'reachable';
    } else if (locationStatus === 'unreachable') {
      return 'unreachable';
    } else if (locationStatus === 'checked') {
      return 'checked';
    } else {
      // If location is not in locationReachability, it's unknown
      return 'unknown';
    }
    // We no longer expect string values like 'partial' or 'processing' here from the boolean snapshot
  }

  /**
   * Displays detailed information about a specific location, including its access rules.
   * @param {object} location - The location object from static data.
   */
  async showLocationDetails(location) {
    log('info', '[LocationUI] showLocationDetails called for:', location.name);
    if (!location || !location.name) {
      log('warn', '[LocationUI] showLocationDetails: Invalid location data.');
      return;
    }

    const modalElement = this.rootElement.querySelector('#location-modal');
    const modalTitle = this.rootElement.querySelector('#modal-location-name');
    const modalDetails = this.rootElement.querySelector(
      '#modal-location-details'
    );
    const modalRuleTree = this.rootElement.querySelector('#modal-rule-tree');

    if (!modalElement || !modalTitle || !modalDetails || !modalRuleTree) {
      log(
        'error',
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
        // Create context-aware snapshot interface with location object
        const locationContextInterface = createStateSnapshotInterface(
          snapshot,
          staticData,
          { location: location }
        );
        const treeElement = renderLogicTree(
          location.access_rule,
          this.colorblindSettings,
          locationContextInterface
        );
        modalRuleTree.appendChild(treeElement);
      } catch (error) {
        log(
          'error',
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

  /**
   * Helper function to find which dungeon a region belongs to
   * @param {string} regionName - The name of the region to search for
   * @returns {Object|null} - The dungeon object that contains this region, or null if not found
   */
  findDungeonForRegion(regionName) {
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.dungeons) {
      return null;
    }

    // Search through all dungeons to find one that contains this region
    for (const dungeonData of Object.values(staticData.dungeons)) {
      if (dungeonData.regions && dungeonData.regions.includes(regionName)) {
        return dungeonData;
      }
    }
    return null;
  }

  /**
   * Creates a clickable link to navigate to a specific dungeon
   * @param {string} dungeonName - The name of the dungeon to link to
   * @returns {HTMLElement} - The clickable dungeon link element
   */
  createDungeonLink(dungeonName) {
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = dungeonName;
    link.classList.add('dungeon-link');
    link.style.color = '#4CAF50';
    link.style.textDecoration = 'none';
    link.style.fontWeight = 'bold';

    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent event from bubbling to parent elements

      log('info', `[LocationUI] Dungeon link clicked for: ${dungeonName}`);

      // Publish panel activation first
      eventBus.publish('ui:activatePanel', { panelId: 'dungeonsPanel' }, 'locations');
      log('info', `[LocationUI] Published ui:activatePanel for dungeonsPanel.`);

      // Then publish navigation
      eventBus.publish('ui:navigateToDungeon', {
        dungeonName: dungeonName,
        sourcePanel: 'locations',
      }, 'locations');
      log(
        'info',
        `[LocationUI] Published ui:navigateToDungeon for ${dungeonName}.`
      );
    });

    // Add hover effect
    link.addEventListener('mouseenter', () => {
      link.style.textDecoration = 'underline';
    });
    link.addEventListener('mouseleave', () => {
      link.style.textDecoration = 'none';
    });

    return link;
  }
}

export default LocationUI;

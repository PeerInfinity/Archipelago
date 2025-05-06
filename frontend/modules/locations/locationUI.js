// locationUI.js
import {
  stateManagerProxySingleton as stateManager,
  // REMOVE: createStateSnapshotInterface, // Import from stateManager index
} from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import commonUI, {
  debounce,
  createStateSnapshotInterface,
} from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import discoveryStateSingleton from '../discovery/singleton.js';

export class LocationUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement(); // Create the root element on instantiation
    this.locationsGrid = this.rootElement.querySelector('#locations-grid'); // Cache grid element
    this.stateUnsubscribeHandles = []; // Array to store unsubscribe functions for state/loop events
    this.settingsUnsubscribe = null;
    this.colorblindSettings = {}; // Cache colorblind settings
    this.isInitialized = false; // Add flag

    // Attach control listeners immediately
    this.attachEventListeners();
    // Subscribe to settings
    this.subscribeToSettings();
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
        if (!this.isInitialized) {
          // --- Removing setTimeout diagnostic --- >
          console.log('[LocationUI] Performing initial setup and render.');
          // const currentSnapshot = stateManager.getLatestStateSnapshot();
          // const currentStaticData = stateManager.getStaticData();
          // console.log('[LocationUI inside setTimeout] Snapshot:', !!currentSnapshot, 'Static Data:', !!currentStaticData);
          // this.showStartRegion('Menu'); // Start region logic might need re-evaluation
          this.updateLocationDisplay(); // Initial render
          this.isInitialized = true;
          // --- End Removing setTimeout --- >
        }
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
      subscribe('stateManager:rulesLoaded', (/* payload */) => {
        console.log('[LocationUI] Received stateManager:rulesLoaded event.');
        // Now static data should be available via proxy
        // Initial display will happen via the first snapshotUpdated event
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
          <option value="accessibility">Sort by Accessibility</option>
          <option value="name">Sort by Name</option> <!-- Added Name sort -->
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
    console.log('[LocationUI] Initializing panel...');

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
      // Find the closest ancestor element that represents a location
      const locationElement = event.target.closest('.location');
      if (locationElement) {
        const locationName = locationElement.dataset.locationName;
        if (locationName) {
          const staticData = stateManager.getStaticData();
          const locationData = staticData?.locations?.[locationName];
          if (locationData) {
            // Use ctrlKey or metaKey (for Mac) for showing details
            if (event.ctrlKey || event.metaKey) {
              this.showLocationDetails(locationData);
            } else {
              this.handleLocationClick(locationData);
            }
          } else {
            console.warn(
              `[LocationUI] Clicked location element but couldn't find static data for: ${locationName}`
            );
          }
        } else {
          console.warn(
            '[LocationUI] Clicked location element missing data-location-name attribute.'
          );
        }
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

  async handleLocationClick(location) {
    if (!location || !location.name) {
      console.error('[LocationUI] Invalid location data for click:', location);
      return;
    }
    console.log(`[LocationUI] Clicked location: ${location.name}`);
    const snapshot = stateManager.getLatestStateSnapshot();
    if (!snapshot) {
      console.error(
        '[LocationUI] Cannot handle click, snapshot not available.'
      );
      return;
    }

    const status = this.getLocationStatus(location.name, snapshot);

    // Allow checking reachable/unreachable locations
    // Prevent checking already checked locations (allow unchecking later if needed?)
    if (status !== 'checked') {
      try {
        // Check if loop mode is active and intercept if necessary
        if (loopStateSingleton.isLoopModeActive()) {
          console.log(
            `[LocationUI] Loop mode active, dispatching check request for ${location.name}`
          );
          // Dispatch message for Loop module to handle
          eventBus.publish('user:checkLocationRequest', {
            locationData: location,
          });
          // The loop module will then call the proxy if appropriate
        } else {
          console.log(
            `[LocationUI] Sending checkLocation command for ${location.name}`
          );
          await stateManager.checkLocation(location.name);
          // UI update will happen via snapshotUpdated event
        }
      } catch (error) {
        console.error(
          `[LocationUI] Error sending checkLocation command for ${location.name}:`,
          error
        );
        // Optionally show user feedback
      }
    } else {
      console.log(`[LocationUI] Location ${location.name} is already checked.`);
      // Maybe implement unchecking later? Requires proxy command.
      // Example: await stateManager.uncheckLocation(location.name);
      // Or allow details view via Ctrl+Click
      this.showLocationDetails(location);
    }
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
    // --- Log data state at function start --- >
    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();
    console.log(
      '[LocationUI updateLocationDisplay] Start State - Snapshot:',
      !!snapshot,
      'Static Data:',
      !!staticData
    );
    // --- End log ---

    // --- ADDED DEBUG LOG ---
    // console.debug('[LocationUI] Data Check:', { // Commenting out older debug log
    //   hasSnapshot: !!snapshot,
    //   hasStaticData: !!staticData,
    //   hasLocations: !!staticData?.locations,
    //   locationCount: staticData?.locations
    //     ? Object.keys(staticData.locations).length
    //     : 'N/A',
    // });
    // --- END DEBUG LOG ---

    if (!staticData?.locations) {
      console.warn(
        '[LocationUI] Static location data not ready. (Check failed)'
      ); // Added note
      this.locationsGrid.innerHTML = '<p>Loading location data...</p>';
      return;
    }

    //// --- ADD: Log structure of staticData.locations --- >
    //console.log(
    //  '[LocationUI] First few keys in staticData.locations:',
    //  Object.keys(staticData.locations).slice(0, 5)
    //);
    //console.log(
    //  '[LocationUI] First location object in staticData.locations:',
    //  Object.values(staticData.locations)[0]
    //);
    //// --- END LOG --- >

    // Get filter/sort states from controls
    const showChecked = this.rootElement.querySelector('#show-checked').checked;
    const showReachable =
      this.rootElement.querySelector('#show-reachable').checked;
    const showUnreachable =
      this.rootElement.querySelector('#show-unreachable').checked;
    const showExplored =
      this.rootElement.querySelector('#show-explored').checked; // For loop mode
    const sortMethod = this.rootElement.querySelector('#sort-select').value;
    const searchTerm = this.rootElement
      .querySelector('#location-search')
      .value.toLowerCase();

    // Filter locations
    let filterLogCount = 0; // Counter for logging
    let filteredLocations = Object.values(staticData.locations).filter(
      (loc) => {
        // --- ADD: Log filtering step --- >
        const originalName = loc.name;
        const status = this.getLocationStatus(originalName, snapshot);
        if (filterLogCount < 5) {
          // Log first 5 attempts
          //console.log(
          //  `[LocationUI Filter] Name: ${originalName}, Status: ${status}`
          //);
          filterLogCount++;
        }
        // --- END LOG --- >
        const isExplored = discoveryStateSingleton.isLocationDiscovered(
          originalName // Use originalName here too
        );

        // Visibility checks
        if (status === 'checked' && !showChecked) return false;
        if (status === 'reachable' && !showReachable) return false;
        if (status === 'unreachable' && !showUnreachable) return false;
        if (loopStateSingleton.isProcessing && isExplored && !showExplored)
          return false; // Hide explored if unchecked in loop mode

        // Search term check (match name or region)
        if (searchTerm) {
          const nameMatch = loc.name.toLowerCase().includes(searchTerm);
          const regionMatch = loc.region?.toLowerCase().includes(searchTerm);
          // Add more fields to search? e.g., item name if available?
          if (!nameMatch && !regionMatch) return false;
        }

        return true; // Keep location if not filtered out
      }
    );

    // Sort locations
    const sortOrder = { unreachable: 0, reachable: 1, checked: 2, other: 3 }; // Define accessibility sort order

    filteredLocations.sort((a, b) => {
      if (sortMethod === 'accessibility') {
        const statusA = this.getLocationStatus(a.name, snapshot);
        const statusB = this.getLocationStatus(b.name, snapshot);
        const orderA = sortOrder[statusA] ?? sortOrder.other;
        const orderB = sortOrder[statusB] ?? sortOrder.other;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // Fallback to name sort within the same status
        return a.name.localeCompare(b.name);
      } else if (sortMethod === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        // 'original' or default
        // Maintain original order (requires locations to have an order property or sort by key)
        // Assuming Object.values preserves insertion order (usually true, but not guaranteed)
        // A safer way is to sort by original key if available, or just fallback to name
        return a.name.localeCompare(b.name); // Fallback for 'original' if no index
      }
    });

    console.log(
      `[LocationUI] Processing ${filteredLocations.length} locations from snapshot.`
    );

    // Render
    this.locationsGrid.innerHTML = ''; // Clear previous content
    this.locationsGrid.style.gridTemplateColumns = `repeat(${this.columns}, 1fr)`; // Apply columns
    this.locationsGrid.style.display = 'grid'; // Ensure grid display
    this.locationsGrid.style.gap = '5px'; // Add gap

    if (filteredLocations.length === 0) {
      this.locationsGrid.innerHTML =
        '<p>No locations match the current filters.</p>';
    } else {
      const fragment = document.createDocumentFragment();
      filteredLocations.forEach((location) => {
        const status = this.getLocationStatus(location.name, snapshot);
        const isExplored = discoveryStateSingleton.isLocationDiscovered(
          location.name
        );

        // --- REVERTED: Manually create location element like in old code --- >
        const card = document.createElement('div');
        card.className = `location location-card ${status}`;
        card.dataset.locationName = location.name; // Use simple name for click handler

        // Apply colorblind class
        commonUI.applyColorblindClass(card, status, this.colorblindSettings);

        // Location Name Link
        const locationNameElement = commonUI.createLocationLink(
          location.name,
          location.region,
          this.colorblindSettings
        );
        locationNameElement.className = 'location-title'; // Add specific class if needed
        card.appendChild(locationNameElement);

        // Add Region Name (Optional - maybe just use tooltip or detail view)
        // const regionText = document.createElement('span');
        // regionText.className = 'location-region';
        // regionText.textContent = ` (${location.region})`;
        // card.appendChild(regionText);

        // Add Explored Indicator if in loop mode
        if (loopStateSingleton.isProcessing && isExplored) {
          const exploredIndicator = document.createElement('span');
          exploredIndicator.className = 'location-explored-indicator';
          exploredIndicator.textContent = ' [E]'; // Simple text indicator
          exploredIndicator.title = 'Explored in current loop';
          card.appendChild(exploredIndicator);
        }

        fragment.appendChild(card);
        // --- END REVERTED --- >
      });
      this.locationsGrid.appendChild(fragment);
    }
    console.log(`[LocationUI] Rendered ${filteredLocations.length} locations.`);
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
    const reachabilityStatus = snapshot.reachability[locationName];
    const isChecked =
      snapshot.flags?.includes(locationName) ||
      snapshot.checkedLocations?.includes(locationName); // Example check
    //console.log(
    //  `[LocationUI getLocationStatus] Name: ${locationName}, Reachability: ${reachabilityStatus}, Checked: ${isChecked}`
    //);
    // --- END LOG --- >

    if (isChecked) {
      return 'checked';
    }

    // Interpret reachability status
    if (reachabilityStatus === 'reachable') {
      return 'reachable';
    } else if (
      reachabilityStatus === 'unreachable' ||
      reachabilityStatus === 'partial'
    ) {
      // Treat partial as unreachable for basic UI
      return 'unreachable';
    } else if (reachabilityStatus === 'processing') {
      return 'processing'; // Add a specific style for this?
    }

    // Fallback if status isn't recognized
    return 'unreachable'; // Default to unreachable if not explicitly reachable or checked
  }

  /**
   * Displays detailed information about a specific location, including its access rules.
   * @param {object} location - The location object from static data.
   */
  showLocationDetails(location) {
    console.log(
      `[LocationUI] showLocationDetails called for: ${location.name}`
    );
    if (!location) return;

    // Get current snapshot and static data (ensure they are ready)
    const snapshot = stateManagerProxySingleton.getCurrentStateSnapshot();
    const staticData = stateManagerProxySingleton.getStaticData();

    if (!snapshot || !staticData) {
      console.warn(
        '[LocationUI showLocationDetails] Snapshot or static data not ready.'
      );
      commonUI.showModal(
        `Details for ${location.name}`,
        '<p>State information is not yet available.</p>'
      );
      return;
    }

    // --- REVERTED: Use local evaluation with snapshot interface --- >
    // Create the snapshot interface needed for evaluateRule on the main thread
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );

    // Evaluate the rule (if it exists) using the main thread evaluator
    let accessResultText = 'Rule not defined or evaluation failed.';
    if (location.access_rule) {
      try {
        const isAccessible = evaluateRule(
          location.access_rule,
          snapshotInterface
        );
        accessResultText = `Rule evaluates to: ${
          isAccessible ? 'TRUE' : 'FALSE'
        }`;
        // Check staleness
        if (snapshotInterface.isPotentiallyStale()) {
          accessResultText += ' (Snapshot might be stale)';
        }
      } catch (error) {
        console.error(
          '[LocationUI showLocationDetails] Error evaluating rule locally:',
          error
        );
        accessResultText = `Error evaluating rule locally: ${error.message}`;
      }
    } else {
      accessResultText = 'No access rule defined.';
    }
    // --- END REVERTED ---

    // Construct the modal content
    let content = `<p><strong>Region:</strong> ${location.region}</p>`;
    content += `<p><strong>Type:</strong> ${location.type || 'N/A'}</p>`;
    // Add more location details as needed

    content += `<h4>Access Rule:</h4>`;
    content += `<pre>${JSON.stringify(
      location.access_rule || { info: 'No rule' },
      null,
      2
    )}</pre>`;
    content += `<p><strong>${accessResultText}</strong></p>`; // Show local evaluation result

    // Display the modal
    commonUI.showModal(`Details for ${location.name}`, content);
  }
}

export default LocationUI;

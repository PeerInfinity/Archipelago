// locationUI.js
import {
  stateManagerProxySingleton as stateManager,
  // REMOVE: createStateSnapshotInterface, // Import from stateManager index
} from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import commonUI, { debounce } from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import settingsManager from '../../app/core/settingsManager.js';
import eventBus from '../../app/core/eventBus.js';
import discoveryStateSingleton from '../discovery/singleton.js';
import { renderLogicTree, applyColorblindClass } from '../commonUI/index.js';

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
    this.originalLocationOrder = []; // ADDED: To store original keys

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
          console.log('[LocationUI] Performing initial setup and render.');
          const currentStaticData = stateManager.getStaticData(); // Get static data
          if (currentStaticData && currentStaticData.locations) {
            this.originalLocationOrder = Object.keys(
              currentStaticData.locations
            );
            console.log(
              `[LocationUI] Stored ${this.originalLocationOrder.length} location keys for original order.`
            );
          }
          this.updateLocationDisplay(); // Initial render
          this.isInitialized = true;
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
                this.showLocationDetails(locationData);
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
        if (loopStateSingleton.isLoopModeActive) {
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

    if (!staticData?.locations || !snapshot) {
      // Also ensure snapshot exists
      console.warn('[LocationUI] Static location data or snapshot not ready.');
      this.locationsGrid.innerHTML = '<p>Loading location data...</p>';
      return;
    }

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
      this.rootElement.querySelector('#show-explored').checked; // For loop mode
    const sortMethod = this.rootElement.querySelector('#sort-select').value;
    const searchTerm = this.rootElement
      .querySelector('#location-search')
      .value.toLowerCase();

    // Filter locations
    let filteredLocations = Object.values(staticData.locations).filter(
      (loc) => {
        const name = loc.name;
        const isReachableFromSnapshot = !!snapshot?.reachability?.[name]; // Ensure boolean
        const isChecked = !!snapshot?.checkedLocations?.includes(name); // Ensure boolean

        // Debug logging (can be removed later)
        if (
          name === "Aginah's Cave" ||
          name === "King's Tomb" ||
          name === 'Floodgate Chest' ||
          name === 'Sahasrahla'
        ) {
          console.log(
            `[LocationUI Filter Debug] Loc: ${name}, showReachable: ${showReachable}, showUnreachable: ${showUnreachable}, showChecked: ${showChecked}, isReachable: ${isReachableFromSnapshot}, isChecked: ${isChecked}`
          );
        }

        const isExplored = discoveryStateSingleton.isLocationDiscovered(name);

        // --- Simplified Visibility Filtering ---
        if (isChecked && !showChecked) return false;
        if (isReachableFromSnapshot && !isChecked && !showReachable)
          return false; // Filter reachable (and not checked)
        if (!isReachableFromSnapshot && !isChecked && !showUnreachable)
          return false; // Filter unreachable (and not checked)

        if (loopStateSingleton.isLoopModeActive && isExplored && !showExplored)
          // Use isLoopModeActive property
          return false; // Hide explored if unchecked in loop mode
        // --- End Simplified Filtering ---

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
    const sortOrder = { checked: 0, reachable: 1, unreachable: 2, other: 3 }; // Define accessibility sort order

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
    this.locationsGrid.style.gridTemplateColumns = `repeat(${this.columns}, 1fr)`; // Apply columns
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

        const isReachableFromSnapshot = !!snapshot?.reachability?.[name];
        const isChecked = !!snapshot?.checkedLocations?.includes(name);

        // Determine detailed status for text and classes
        let statusText = 'Locked';
        let stateClass = 'unreachable'; // Default class

        if (isChecked) {
          statusText = 'Checked';
          stateClass = 'checked';
        } else if (isReachableFromSnapshot) {
          statusText = 'Available';
          stateClass = 'reachable';
        } else {
          // More detailed status if not simply reachable or checked
          // This requires evaluating the region's reachability and the location's own rule separately
          // For now, we'll stick to simpler states based on direct snapshot.
          // To get finer-grained status like "Region accessible, but rule fails",
          // we'd need to evaluate location.access_rule and region reachability here.
          // This might be slow if done for every card. The snapshot's `isLocationAccessible`
          // already did this combined check.
          statusText = 'Unreachable'; // Default for not reachable & not checked
          stateClass = 'unreachable';
        }

        // Apply primary state class
        locationCard.classList.add(stateClass);

        locationCard.classList.toggle(
          'explored',
          loopStateSingleton.isLoopModeActive && !!isExplored
        );

        // Apply colorblind class (using the primary state class)
        applyColorblindClass(
          locationCard,
          stateClass, // Use 'checked', 'reachable', or 'unreachable'
          this.colorblindSettings
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
          const regionIsAccessible = isReachableFromSnapshot; // Approximation
          const regionLink = commonUI.createRegionLink(
            location.parent_region,
            this.colorblindSettings
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
    const isChecked = snapshot.checkedLocations?.includes(locationName);
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

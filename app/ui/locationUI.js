// locationUI.js
import stateManager from '../core/stateManagerSingleton.js';
import { evaluateRule } from '../core/ruleEngine.js';
import commonUI from './commonUI.js';
import connection from '../../client/core/connection.js';
import messageHandler from '../../client/core/messageHandler.js';
import loopState from '../core/loop/loopState.js';

export class LocationUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement(); // Create the root element on instantiation
    this.locationsGrid = this.rootElement.querySelector('#locations-grid'); // Cache grid element
    this.attachEventListeners();
  }

  // Creates the main DOM structure for the locations panel
  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('locations-panel-container', 'panel-container'); // Add classes for styling
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    // Recreate controls similar to index.html
    element.innerHTML = `
      <div class="control-group location-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <select id="sort-select">
          <option value="original">Original Order</option>
          <option value="accessibility">Sort by Accessibility</option>
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
        <button id="increase-columns">+</button>
      </div>
      <div id="locations-grid" style="flex-grow: 1; overflow-y: auto;">
        <!-- Populated by updateLocationDisplay -->
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  initialize() {
    // Don't need to call loadFromJSON since gameUI.js already does this
    // stateManager.loadFromJSON(jsonData);
    this.updateLocationDisplay();
  }

  clear() {
    const locationsGrid = document.getElementById('locations-grid');
    if (locationsGrid) {
      locationsGrid.innerHTML = '';
    }
  }

  update() {
    this.updateLocationDisplay();
  }

  attachEventListeners() {
    // Attach listeners to controls within this.rootElement
    [
      'sort-select',
      'show-checked',
      'show-reachable',
      'show-unreachable',
      'show-explored',
    ].forEach((id) => {
      this.rootElement
        .querySelector(`#${id}`)
        ?.addEventListener('change', () => this.updateLocationDisplay());
    });

    // Modal listeners remain on document for now, might need adjustment
    document.getElementById('modal-close')?.addEventListener('click', () => {
      document.getElementById('location-modal').classList.add('hidden');
    });

    document
      .getElementById('location-modal')
      ?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('location-modal')) {
          document.getElementById('location-modal').classList.add('hidden');
        }
      });

    // Click listener is now on the specific grid within this panel
    this.locationsGrid?.addEventListener('click', (e) => {
      // Only handle clicks that aren't on other clickable elements like links
      if (
        e.target.closest('.region-link') ||
        e.target.closest('.location-link')
      ) {
        return;
      }

      const locationCard = e.target.closest('.location-card');
      if (locationCard) {
        try {
          const encoded = locationCard.dataset.location.replace(/&quot;/g, '"');
          const locationData = JSON.parse(decodeURIComponent(encoded));
          this.handleLocationClick(locationData);
        } catch (error) {
          console.error('Error parsing location data:', error);
        }
      }
    });

    // Column adjustment buttons within this.rootElement
    this.rootElement
      .querySelector('#increase-columns')
      ?.addEventListener('click', () => this.changeColumns(1));
    this.rootElement
      .querySelector('#decrease-columns')
      ?.addEventListener('click', () => this.changeColumns(-1));
  }

  changeColumns(delta) {
    this.columns = Math.max(1, this.columns + delta); // Ensure at least 1 column
    this.updateLocationDisplay();
  }

  handleLocationClick(location) {
    // Check if loop mode is active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

    if (isLoopModeActive) {
      // LOOP MODE BEHAVIOR

      // If location is already checked, do nothing
      if (stateManager.isLocationChecked(location.name)) return;

      // Get the location's discovered status in loop mode
      const isUndiscovered = !loopState.isLocationDiscovered(location.name);

      // Check if the last action in the queue is already handling this location
      if (loopState.actionQueue.length > 0) {
        const lastAction =
          loopState.actionQueue[loopState.actionQueue.length - 1];

        // If the location is undiscovered and the last action is an explore for this region, do nothing
        if (
          isUndiscovered &&
          lastAction.type === 'explore' &&
          lastAction.regionName === location.region
        ) {
          return;
        }

        // If the location is discovered but unchecked and the last action is to check this location, do nothing
        if (
          !isUndiscovered &&
          !stateManager.isLocationChecked(location.name) &&
          lastAction.type === 'checkLocation' &&
          lastAction.locationName === location.name
        ) {
          return;
        }
      }

      // Import the path analyzer logic
      import('../logic/pathAnalyzerLogic.js').then((module) => {
        const pathAnalyzerLogic = new module.PathAnalyzerLogic();

        // Find path from Menu to the region containing this location
        const path = pathAnalyzerLogic.findPathInLoopMode(location.region);

        if (path) {
          // Path found - process it

          // Pause processing the action queue
          loopState.setPaused(true);

          // Clear the current queue
          loopState.actionQueue = [];
          loopState.currentAction = null;
          loopState.currentActionIndex = 0;

          // Queue move actions for each region transition
          for (let i = 0; i < path.length - 1; i++) {
            const fromRegion = path[i];
            const toRegion = path[i + 1];

            // Find the exit that connects these regions
            const regionData = stateManager.regions[fromRegion];
            const exitToUse = regionData?.exits?.find(
              (exit) => exit.connected_region === toRegion
            );

            if (exitToUse) {
              // Create and queue a move action
              const moveAction = {
                id: `action_${Date.now()}_${
                  Math.floor(Math.random() * 10000) + i
                }`,
                type: 'moveToRegion',
                regionName: fromRegion,
                exitName: exitToUse.name,
                destinationRegion: toRegion,
                progress: 0,
                completed: false,
              };

              loopState.actionQueue.push(moveAction);

              // Make sure the loopUI knows these regions are in the queue
              if (window.loopUIInstance) {
                window.loopUIInstance.regionsInQueue.add(fromRegion);
                window.loopUIInstance.regionsInQueue.add(toRegion);
              }
            }
          }

          // Add the appropriate action at the final region
          if (isUndiscovered) {
            // If location is undiscovered, queue an explore action
            const exploreAction = {
              id: `action_${Date.now()}_${
                Math.floor(Math.random() * 10000) + path.length
              }`,
              type: 'explore',
              regionName: location.region,
              progress: 0,
              completed: false,
            };

            loopState.actionQueue.push(exploreAction);

            // Set the region's "repeat explore action" checkbox to checked
            if (
              window.loopUIInstance &&
              window.loopUIInstance.repeatExploreStates
            ) {
              window.loopUIInstance.repeatExploreStates.set(
                location.region,
                true
              );
            }
          } else {
            // If location is discovered but unchecked, queue a check location action
            const checkAction = {
              id: `action_${Date.now()}_${
                Math.floor(Math.random() * 10000) + path.length
              }`,
              type: 'checkLocation',
              regionName: location.region,
              locationName: location.name,
              progress: 0,
              completed: false,
            };

            loopState.actionQueue.push(checkAction);
          }

          // Begin processing the action queue
          loopState.setPaused(false);
          loopState.startProcessing();

          // Notify UI components about queue changes
          if (window.eventBus) {
            window.eventBus.publish('loopState:queueUpdated', {
              queue: loopState.actionQueue,
            });
          }

          // Update the loop UI
          if (window.loopUIInstance) {
            window.loopUIInstance.renderLoopPanel();
          }
        } else {
          // Path not found - display error message
          const errorMessage = `Cannot find a path to ${location.region} in loop mode.`;
          console.error(errorMessage);

          // Show error in console or alert
          if (window.consoleManager) {
            window.consoleManager.print(errorMessage, 'error');
          } else {
            alert(errorMessage);
          }
        }
      });

      return;
    }

    // STANDARD NON-LOOP MODE BEHAVIOR

    // If location is already checked, do nothing
    if (stateManager.isLocationChecked(location.name)) return;
    const isAccessible = stateManager.isLocationAccessible(location);
    if (!isAccessible) return;

    if (connection.isConnected()) {
      // When connected to server, send through messageHandler
      messageHandler.checkLocation(location).then((success) => {
        if (success) {
          // Show location details after successful check
          this.showLocationDetails(location);
        } else {
          console.warn(`Failed to check location ${location.name} via server`);
        }
      });
    } else {
      // Local-only logic - just update stateManager
      if (location.item) {
        this.gameUI.inventoryUI.modifyItemCount(location.item.name);
        stateManager.checkLocation(location.name);
        // Update UI
        this.updateLocationDisplay();
        // Show location details
        this.showLocationDetails(location);
        if (window.consoleManager) {
          window.consoleManager.print(
            `Checked ${location.name} - Found ${location.item.name}`,
            'success'
          );
        }
      }
    }
  }

  syncWithState() {
    this.updateLocationDisplay();
  }

  updateLocationDisplay() {
    const showChecked =
      this.rootElement.querySelector('#show-checked')?.checked ?? true;
    const showReachable =
      this.rootElement.querySelector('#show-reachable')?.checked ?? true;
    const showUnreachable =
      this.rootElement.querySelector('#show-unreachable')?.checked ?? true;
    const showExplored =
      this.rootElement.querySelector('#show-explored')?.checked ?? true;
    const sorting =
      this.rootElement.querySelector('#sort-select')?.value ?? 'original';

    // Check if Loop Mode is active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

    // Toggle visibility of the "Show Explored" checkbox based on Loop Mode
    const showExploredCheckbox =
      this.rootElement.querySelector('#show-explored');
    if (showExploredCheckbox) {
      showExploredCheckbox.parentElement.style.display = isLoopModeActive
        ? 'inline'
        : 'none';
    }

    // Get locations from state manager
    const locations = stateManager.locations;

    const locationsGrid = this.locationsGrid; // Use cached grid
    if (!locationsGrid) return;

    locationsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`; // Set the number of columns

    if (locations.length === 0) {
      locationsGrid.innerHTML = `
        <div class="empty-message">
          Upload a JSON file to see locations or adjust filters
        </div>
      `;
      return;
    }

    // Apply filters
    let filteredLocations = locations.filter((location) => {
      // First check if the location is checked
      const isChecked = stateManager.isLocationChecked(location.name);
      if (isChecked && !showChecked) return false;

      // Then apply reachable/unreachable filters
      const isRegionAccessible = stateManager.isRegionReachable(
        location.region
      );
      const locationRulePasses =
        !location.access_rule || evaluateRule(location.access_rule);

      // Fully reachable location - needs both region accessible and rule passes
      if (isRegionAccessible && locationRulePasses) {
        return showReachable;
      }
      // All other cases are considered unreachable
      else {
        return showUnreachable;
      }
    });

    // Apply Loop Mode filtering if active
    if (isLoopModeActive) {
      filteredLocations = filteredLocations.filter((location) => {
        // Only show locations from discovered regions
        const isRegionDiscovered = loopState.isRegionDiscovered(
          location.region
        );
        if (!isRegionDiscovered) return false;

        // Handle exploring filter
        const isLocationDiscovered = loopState.isLocationDiscovered(
          location.name
        );
        return showExplored || !isLocationDiscovered;
      });
    }

    // Apply sorting
    if (sorting === 'accessibility') {
      filteredLocations.sort((a, b) => {
        const aRegionAccessible = stateManager.isRegionReachable(a.region);
        const bRegionAccessible = stateManager.isRegionReachable(b.region);

        const aRulePasses = !a.access_rule || evaluateRule(a.access_rule);
        const bRulePasses = !b.access_rule || evaluateRule(b.access_rule);

        // Fully accessible locations first (region reachable + rule passes)
        const aFullyAccessible = aRegionAccessible && aRulePasses;
        const bFullyAccessible = bRegionAccessible && bRulePasses;

        // Then region accessible but rule fails
        const aRegionOnlyAccessible = aRegionAccessible && !aRulePasses;
        const bRegionOnlyAccessible = bRegionAccessible && !bRulePasses;

        // Then rule passes but region not accessible
        const aRuleOnlyPasses = !aRegionAccessible && aRulePasses;
        const bRuleOnlyPasses = !bRegionAccessible && bRulePasses;

        // Compare in priority order
        if (aFullyAccessible !== bFullyAccessible) {
          return bFullyAccessible - aFullyAccessible; // true sorts before false
        } else if (aRegionOnlyAccessible !== bRegionOnlyAccessible) {
          return bRegionOnlyAccessible - aRegionOnlyAccessible;
        } else if (aRuleOnlyPasses !== bRuleOnlyPasses) {
          return bRuleOnlyPasses - aRuleOnlyPasses;
        } else {
          return 0; // Same accessibility level
        }
      });
    }

    locationsGrid.innerHTML = filteredLocations
      .map((location) => {
        const isRegionAccessible = stateManager.isRegionReachable(
          location.region
        );
        const isLocationAccessible =
          stateManager.isLocationAccessible(location);
        const isChecked = stateManager.isLocationChecked(location.name);

        // Evaluate just the location's access rule
        const locationRulePasses =
          !location.access_rule || evaluateRule(location.access_rule);

        let stateClass = '';
        if (isChecked) {
          stateClass = 'checked';
        } else if (isLocationAccessible) {
          stateClass = 'reachable';
        } else if (isRegionAccessible && !locationRulePasses) {
          stateClass = 'region-accessible-but-locked';
        } else if (!isRegionAccessible && locationRulePasses) {
          stateClass = 'region-inaccessible-but-unlocked';
        } else {
          stateClass = 'unreachable';
        }

        // Handle Loop Mode display
        let locationName = location.name;
        let regionName = location.region;

        if (isLoopModeActive) {
          const isRegionDiscovered = loopState.isRegionDiscovered(
            location.region
          );
          const isLocationDiscovered = loopState.isLocationDiscovered(
            location.name
          );

          if (!isRegionDiscovered || !isLocationDiscovered) {
            locationName = '???';
            stateClass += ' undiscovered';
          }

          if (!isRegionDiscovered) {
            regionName = '???';
          }
        }

        return `
          <div 
            class="location-card ${stateClass}"
            data-location="${encodeURIComponent(
              JSON.stringify(location)
            ).replace(/"/g, '&quot;')}"
          >
            <div class="font-medium location-link" data-location="${
              location.name
            }" data-region="${location.region}">${locationName}</div>
            <div class="text-sm">Player ${location.player}</div>
            <div class="text-sm">
              Region: <span class="region-link" data-region="${
                location.region
              }" style="color: ${
          isRegionAccessible ? 'inherit' : 'red'
        }">${regionName}</span> (${
          isRegionAccessible ? 'Accessible' : 'Inaccessible'
        })
            </div>
            <div class="text-sm">
              Location: ${
                commonUI.renderLogicTree(location.access_rule).outerHTML
              }
            </div>
            <div class="text-sm">
              ${
                isChecked
                  ? 'Checked'
                  : isLocationAccessible
                  ? 'Available'
                  : isRegionAccessible && !locationRulePasses
                  ? 'Region accessible, but rule fails'
                  : !isRegionAccessible && locationRulePasses
                  ? 'Region inaccessible, but rule passes'
                  : 'Locked'
              }
            </div>
          </div>
        `;
      })
      .join('');

    // Add click handlers for region and location links
    document.querySelectorAll('.region-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening the location modal
        const regionName = link.dataset.region;
        if (regionName) {
          this.gameUI.regionUI.navigateToRegion(regionName);
        }
      });
    });

    document.querySelectorAll('.location-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent capturing click on parent card
        const locationName = link.dataset.location;
        const regionName = link.dataset.region;
        if (locationName && regionName) {
          this.gameUI.regionUI.navigateToLocation(locationName, regionName);
        }
      });
    });
  }

  showLocationDetails(location) {
    const modal = document.getElementById('location-modal');
    const title = document.getElementById('modal-title');
    const debug = document.getElementById('modal-debug');
    const info = document.getElementById('modal-info');

    title.textContent = location.name;

    const region = stateManager.regions[location.region];

    if (this.gameUI.debugMode) {
      debug.classList.remove('hidden');
      debug.textContent = JSON.stringify(
        {
          access_rule: location.access_rule,
          path_rules: location.path_rules,
          region_rules: region?.region_rules,
          dungeon: region?.dungeon,
          shop: region?.shop,
        },
        null,
        2
      );
    } else {
      debug.classList.add('hidden');
    }

    info.innerHTML = `
      <div class="space-y-2">
        <div>
          <span class="font-semibold">Status: </span>
          ${
            stateManager.isLocationChecked(location.name)
              ? 'Checked'
              : stateManager.isLocationAccessible(location)
              ? 'Available'
              : stateManager.isRegionReachable(location.region) &&
                (!location.access_rule || !evaluateRule(location.access_rule))
              ? 'Region accessible, but rule fails'
              : !stateManager.isRegionReachable(location.region) &&
                (!location.access_rule || evaluateRule(location.access_rule))
              ? 'Region inaccessible, but rule passes'
              : 'Locked'
          }
        </div>
        <div>
          <span class="font-semibold">Player: </span>${location.player}
        </div>
        <div>
          <span class="font-semibold">Region: </span>
          <span class="region-link" data-region="${location.region}">${
      location.region
    }</span>
          ${region?.is_light_world ? ' (Light World)' : ''}
          ${region?.is_dark_world ? ' (Dark World)' : ''}
        </div>
        ${
          region?.dungeon
            ? `
            <div>
              <span class="font-semibold">Dungeon: </span>${region.dungeon.name}
            </div>
          `
            : ''
        }
        ${
          location.item &&
          (stateManager.isLocationChecked(location.name) ||
            this.gameUI.debugMode)
            ? `
            <div>
              <span class="font-semibold">Item: </span>${location.item.name}
              ${location.item.advancement ? ' (Progression)' : ''}
              ${location.item.priority ? ' (Priority)' : ''}
            </div>
          `
            : ''
        }
      </div>
    `;

    // Add event listeners to region links in the modal
    info.querySelectorAll('.region-link').forEach((link) => {
      link.addEventListener('click', () => {
        const regionName = link.dataset.region;
        if (regionName) {
          // Close the modal first
          document.getElementById('location-modal').classList.add('hidden');
          // Then navigate to the region
          this.gameUI.regionUI.navigateToRegion(regionName);
        }
      });
    });

    modal.classList.remove('hidden');
  }
}

export default LocationUI;

// exitUI.js
import stateManager from '../core/stateManagerSingleton.js';
import { evaluateRule } from '../core/ruleEngine.js';
import commonUI from './commonUI.js';
import loopState from '../core/loop/loopStateSingleton.js';
import eventBus from '../core/eventBus.js';
import settingsManager from '../core/settingsManager.js';

export class ExitUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement();
    this.exitsGrid = this.rootElement.querySelector('#exits-grid');
    this.attachEventListeners();
    this.settingsUnsubscribe = null;
    this.subscribeToSettings();
  }

  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.exits')) {
          console.log('ExitUI reacting to settings change:', key);
          this.updateExitDisplay();
        }
      }
    );
  }

  onPanelDestroy() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
      this.settingsUnsubscribe = null;
    }
  }

  dispose() {
    this.onPanelDestroy();
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('exits-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
       <div class="control-group exit-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <select id="exit-sort-select">
          <option value="original">Original Order</option>
          <option value="accessibility">Sort by Accessibility</option>
        </select>
        <label>
          <input type="checkbox" id="exit-show-reachable" checked />
          Show Reachable
        </label>
        <label>
          <input type="checkbox" id="exit-show-unreachable" checked />
          Show Unreachable
        </label>
        <label style="display: none"> <!-- Controlled by loop mode -->
          <input type="checkbox" id="exit-show-explored" checked />
          Show Explored
        </label>
        <button id="exit-decrease-columns">-</button>
        <button id="exit-increase-columns">+</button>
      </div>
      <div id="exits-grid" style="flex-grow: 1; overflow-y: auto;">
        <!-- Populated by updateExitDisplay -->
      </div>
    `;
    return element;
  }

  getRootElement() {
    return this.rootElement;
  }

  /**
   * Handle click on an exit card in loop mode
   * @param {Object} exit - The exit data
   */
  handleExitClick(exit) {
    // Check if loop mode is active
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

    if (!isLoopModeActive) return;

    // Determine if the exit is discovered
    const isExitDiscovered = loopState.isExitDiscovered(exit.region, exit.name);

    // --- New Logic for Initial Checks ---
    if (loopState.actionQueue.length > 0) {
      const lastAction =
        loopState.actionQueue[loopState.actionQueue.length - 1];

      if (!isExitDiscovered) {
        // If exit is undiscovered, and the last action is an explore for this exit's region, do nothing
        if (
          lastAction.type === 'explore' &&
          lastAction.regionName === exit.region
        ) {
          return;
        }
      } else {
        // If exit is discovered, check if a move action for this specific exit already exists
        const moveExists = loopState.actionQueue.some(
          (action) =>
            action.type === 'moveToRegion' &&
            action.regionName === exit.region && // The region *containing* the exit
            action.exitName === exit.name && // The specific exit name
            action.destinationRegion === exit.connected_region // The destination matches
        );
        if (moveExists) {
          return; // Do nothing if the move action is already queued
        }

        // Also check if the *last* action is a move corresponding to clicking this exit
        // This prevents queuing the same move twice if the user clicks rapidly
        if (
          lastAction.type === 'moveToRegion' &&
          lastAction.regionName === exit.region &&
          lastAction.exitName === exit.name
        ) {
          return;
        }
      }
    }
    // --- End New Logic for Initial Checks ---

    // Import the path analyzer logic
    import('../logic/pathAnalyzerLogic.js').then((module) => {
      const pathAnalyzerLogic = new module.PathAnalyzerLogic();

      // Find path from Menu to the region containing this exit
      // Include only discovered regions in the path search
      const path = pathAnalyzerLogic.findPathInLoopMode(exit.region);

      if (path) {
        // Path found - process it

        // Pause processing the action queue
        loopState.setPaused(true);

        // Clear the current queue
        loopState.actionQueue = [];
        loopState.currentAction = null;
        loopState.currentActionIndex = 0;

        // Queue move actions for each region transition along the path
        for (let i = 0; i < path.length - 1; i++) {
          const fromRegion = path[i];
          const toRegion = path[i + 1];

          // Find the exit that connects these regions (using discovered exits)
          const regionData = stateManager.regions[fromRegion];
          // Important: Find the exit within the *discovered* exits for the 'fromRegion'
          const exitToUse = regionData?.exits?.find(
            (e) =>
              e.connected_region === toRegion &&
              loopState.isExitDiscovered(fromRegion, e.name)
          );

          if (exitToUse) {
            // Create and queue a move action (moveToRegion)
            const moveAction = {
              id: `action_${Date.now()}_${
                Math.floor(Math.random() * 10000) + i
              }`,
              type: 'moveToRegion',
              regionName: fromRegion, // Where the move action starts
              exitName: exitToUse.name, // The exit being used
              destinationRegion: toRegion, // Where the move action ends
              progress: 0,
              completed: false,
            };

            loopState.actionQueue.push(moveAction);
          } else {
            console.warn(
              `Could not find a discovered exit from ${fromRegion} to ${toRegion} while building path.`
            );
            // Optional: Handle this case more robustly, maybe stop queueing?
          }
        }

        // --- New Logic for Final Action ---
        if (!isExitDiscovered) {
          // If the exit is undiscovered, queue an explore action
          const exploreAction = {
            id: `action_${Date.now()}_${
              Math.floor(Math.random() * 10000) + path.length
            }`,
            type: 'explore',
            regionName: exit.region, // Explore the region the exit is *in*
            progress: 0,
            completed: false,
          };
          loopState.actionQueue.push(exploreAction);

          // Set the region's "repeat explore action" checkbox to checked
          if (
            window.loopUIInstance &&
            window.loopUIInstance.repeatExploreStates
          ) {
            window.loopUIInstance.repeatExploreStates.set(exit.region, true);
          }
        } else {
          // If the exit is discovered, queue a move action *through* this specific exit
          const moveThroughExitAction = {
            id: `action_${Date.now()}_${
              Math.floor(Math.random() * 10000) + path.length
            }`,
            type: 'moveToRegion', // Still a 'moveToRegion' type
            regionName: exit.region, // Start in the region containing the clicked exit
            exitName: exit.name, // Use the specific exit that was clicked
            destinationRegion: exit.connected_region, // Go to the connected region
            progress: 0,
            completed: false,
          };
          loopState.actionQueue.push(moveThroughExitAction);
        }
        // --- End New Logic for Final Action ---

        // Begin processing the action queue
        loopState.setPaused(false);
        loopState.startProcessing(); // This will pick up the new queue

        // Notify UI components about queue changes
        eventBus.publish('loopState:queueUpdated', {
          queue: loopState.actionQueue,
        });
      } else {
        // Path not found - display error message
        const errorMessage = `Cannot find a path to ${exit.region} in loop mode.`;
        console.error(errorMessage);

        // Show error in console or alert
        if (window.consoleManager) {
          window.consoleManager.print(errorMessage, 'error');
        } else {
          alert(errorMessage);
        }
      }
    });
  }

  initialize() {
    // Don't need to call loadFromJSON since gameUI.js already does this
    this.updateExitDisplay();
  }

  clear() {
    if (this.exitsGrid) {
      this.exitsGrid.innerHTML = '';
    }
  }

  update() {
    this.updateExitDisplay();
  }

  attachEventListeners() {
    // Sorting and filtering
    [
      'exit-sort-select',
      'exit-show-reachable',
      'exit-show-unreachable',
      'exit-show-explored',
    ].forEach((id) => {
      this.rootElement
        .querySelector(`#${id}`)
        ?.addEventListener('change', () => this.updateExitDisplay());
    });

    // Column adjustment buttons
    this.rootElement
      .querySelector('#exit-increase-columns')
      ?.addEventListener('click', () => this.changeColumns(1));
    this.rootElement
      .querySelector('#exit-decrease-columns')
      ?.addEventListener('click', () => this.changeColumns(-1));
  }

  changeColumns(delta) {
    this.columns = Math.max(1, this.columns + delta); // Ensure at least 1 column
    this.updateExitDisplay();
  }

  syncWithState() {
    this.updateExitDisplay();
  }

  updateExitDisplay() {
    const showReachable =
      this.rootElement.querySelector('#exit-show-reachable')?.checked ?? true;
    const showUnreachable =
      this.rootElement.querySelector('#exit-show-unreachable')?.checked ?? true;
    const showExplored =
      this.rootElement.querySelector('#exit-show-explored')?.checked ?? true;
    const sorting =
      this.rootElement.querySelector('#exit-sort-select')?.value ?? 'original';

    // Get all exits from all regions
    const exits = this.getAllExits();

    const exitsGrid = this.exitsGrid;
    if (!exitsGrid) return;

    exitsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`; // Set the number of columns

    if (exits.length === 0) {
      exitsGrid.innerHTML = `
        <div class="empty-message">
          Upload a JSON file to see exits or adjust filters
        </div>
      `;
      return;
    }

    // Apply filters
    let filteredExits = exits;

    // Only show discovered exits in Loop Mode if not showing all
    const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;
    if (isLoopModeActive) {
      const showingExplored = showExplored;

      filteredExits = exits.filter((exit) => {
        const regionDiscovered = loopState.isRegionDiscovered(exit.region);
        if (!regionDiscovered) return false;

        const exitDiscovered = loopState.isExitDiscovered(
          exit.region,
          exit.name
        );
        return showingExplored || !exitDiscovered;
      });
    }

    // Filter reachable/unreachable
    filteredExits = filteredExits.filter((exit) => {
      const regionAccessible = stateManager.isRegionReachable(exit.region);
      const exitRulePasses =
        !exit.access_rule || evaluateRule(exit.access_rule);

      // Reachable = region accessible AND rule passes
      if (regionAccessible && exitRulePasses) {
        return showReachable;
      }
      // All other cases are considered unreachable
      else {
        return showUnreachable;
      }
    });

    // Sort exits
    if (sorting === 'accessibility') {
      filteredExits.sort((a, b) => {
        const aRegionAccessible = stateManager.isRegionReachable(a.region);
        const bRegionAccessible = stateManager.isRegionReachable(b.region);

        const aRulePasses = !a.access_rule || evaluateRule(a.access_rule);
        const bRulePasses = !b.access_rule || evaluateRule(b.access_rule);

        // Fully traversable exits first (region reachable + rule passes)
        const aFullyTraversable = aRegionAccessible && aRulePasses;
        const bFullyTraversable = bRegionAccessible && bRulePasses;

        // Then region accessible but rule fails
        const aRegionOnlyAccessible = aRegionAccessible && !aRulePasses;
        const bRegionOnlyAccessible = bRegionAccessible && !bRulePasses;

        // Then rule passes but region not accessible
        const aRuleOnlyPasses = !aRegionAccessible && aRulePasses;
        const bRuleOnlyPasses = !bRegionAccessible && bRulePasses;

        // Compare in priority order
        if (aFullyTraversable !== bFullyTraversable) {
          return bFullyTraversable - aFullyTraversable; // true sorts before false
        } else if (aRegionOnlyAccessible !== bRegionOnlyAccessible) {
          return bRegionOnlyAccessible - aRegionOnlyAccessible;
        } else if (aRuleOnlyPasses !== bRuleOnlyPasses) {
          return bRuleOnlyPasses - aRuleOnlyPasses;
        } else {
          return 0; // Same accessibility level
        }
      });
    }

    // Generate HTML for exits programmatically
    exitsGrid.innerHTML = ''; // Clear previous content

    // <<< Get setting once >>>
    const useExitColorblind = settingsManager.getSetting(
      'colorblindMode.exits',
      true
    );

    filteredExits.forEach((exit) => {
      const isRegionAccessible = stateManager.isRegionReachable(exit.region);
      const exitRulePasses =
        !exit.access_rule || evaluateRule(exit.access_rule);

      let stateClass = '';
      if (isRegionAccessible && exitRulePasses) {
        stateClass = 'traversable';
      } else if (isRegionAccessible && !exitRulePasses) {
        stateClass = 'region-accessible-but-locked';
      } else if (!isRegionAccessible && exitRulePasses) {
        stateClass = 'region-inaccessible-but-unlocked';
      } else {
        stateClass = 'not-traversable';
      }

      // Handle Loop Mode display
      let exitName = exit.name;
      const isLoopModeActive = window.loopUIInstance?.isLoopModeActive;

      if (isLoopModeActive) {
        const isRegionDiscovered = loopState.isRegionDiscovered(exit.region);
        const isExitDiscovered = loopState.isExitDiscovered(
          exit.region,
          exit.name
        );
        if (!isRegionDiscovered || !isExitDiscovered) {
          exitName = '???';
          stateClass += ' undiscovered';
        }
      }

      // Create card element
      const card = document.createElement('div');
      card.className = `exit-card ${stateClass}`;
      card.dataset.exit = encodeURIComponent(JSON.stringify(exit)).replace(
        /'/g,
        "'"
      );

      // <<< Apply colorblind class to card >>>
      card.classList.toggle('colorblind-mode', useExitColorblind);

      // Exit Name
      const exitNameDiv = document.createElement('div');
      exitNameDiv.className = 'font-medium exit-link'; // Keep class if styling relies on it
      exitNameDiv.dataset.exit = exit.name;
      exitNameDiv.dataset.region = exit.region;
      exitNameDiv.textContent = exitName;
      card.appendChild(exitNameDiv);

      // Player Info
      const playerDiv = document.createElement('div');
      playerDiv.className = 'text-sm';
      playerDiv.textContent = `Player ${exit.player || '1'}`;
      card.appendChild(playerDiv);

      // Source Region (with clickable link)
      const sourceRegionDiv = document.createElement('div');
      sourceRegionDiv.className = 'text-sm';
      sourceRegionDiv.textContent = 'From: ';
      const sourceRegionLink = commonUI.createRegionLink(
        exit.region,
        useExitColorblind
      ); // <<< Pass setting
      // Add necessary styles/attributes if needed
      sourceRegionLink.style.color = isRegionAccessible ? 'inherit' : 'red';
      sourceRegionDiv.appendChild(sourceRegionLink);
      sourceRegionDiv.appendChild(
        document.createTextNode(
          ` (${isRegionAccessible ? 'Accessible' : 'Inaccessible'})`
        )
      );
      card.appendChild(sourceRegionDiv);

      // Connected Region Info (with clickable link)
      if (exit.connected_region) {
        let connectedRegionName = exit.connected_region;
        let isConnectedRegionDiscovered = true;
        if (isLoopModeActive) {
          isConnectedRegionDiscovered = loopState.isRegionDiscovered(
            exit.connected_region
          );
          if (!isConnectedRegionDiscovered) {
            connectedRegionName = '???';
          }
        }
        const connectedRegionDiv = document.createElement('div');
        connectedRegionDiv.className = 'text-sm';
        connectedRegionDiv.textContent = 'To: ';
        const connectedRegionLink = commonUI.createRegionLink(
          exit.connected_region,
          useExitColorblind
        ); // <<< Pass setting
        // Ensure the real region name is stored for navigation even if displayed as '???'
        connectedRegionLink.dataset.region = exit.connected_region;
        if (isLoopModeActive && !isConnectedRegionDiscovered) {
          connectedRegionLink.classList.add('undiscovered'); // Add class for styling if needed
        }
        connectedRegionDiv.appendChild(connectedRegionLink);
        card.appendChild(connectedRegionDiv);
      }

      // Exit Logic Tree
      const logicDiv = document.createElement('div');
      logicDiv.className = 'text-sm';
      logicDiv.textContent = 'Requires: ';
      logicDiv.appendChild(
        commonUI.renderLogicTree(exit.access_rule, useExitColorblind)
      ); // <<< Pass setting
      card.appendChild(logicDiv);

      // Status Text
      const statusDiv = document.createElement('div');
      statusDiv.className = 'text-sm';
      statusDiv.textContent =
        isRegionAccessible && exitRulePasses
          ? 'Traversable'
          : isRegionAccessible && !exitRulePasses
          ? 'Region accessible, but rule fails'
          : !isRegionAccessible && exitRulePasses
          ? 'Region inaccessible, but rule passes'
          : 'Not traversable';
      card.appendChild(statusDiv);

      // Append the constructed card to the grid
      exitsGrid.appendChild(card);
    });

    // Remove redundant event listeners as commonUI handles links now
    /*
    document.querySelectorAll('.region-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent grid click
        const regionName = link.dataset.region;
        if (regionName && this.gameUI.regionUI) {
          this.gameUI.regionUI.navigateToRegion(regionName);
        }
      });
    });

    document.querySelectorAll('.location-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent grid click
        const locationName = link.dataset.location;
        const regionName = link.dataset.region;
        if (locationName && regionName && this.gameUI.regionUI) {
          this.gameUI.regionUI.navigateToLocation(locationName, regionName);
        }
      });
    });
    */

    // Add click listeners to the exit cards themselves (for loop mode interaction)
    this.exitsGrid.querySelectorAll('.exit-card').forEach((card) => {
      card.addEventListener('click', (e) => {
        // Only handle clicks that aren't on other clickable elements
        if (
          e.target.closest('.region-link') ||
          e.target.closest('.exit-link')
        ) {
          return;
        }

        try {
          // Get the exit data from the data attribute
          const exitData = JSON.parse(
            decodeURIComponent(card.dataset.exit.replace(/&quot;/g, '"'))
          );
          if (exitData) {
            this.handleExitClick(exitData);
          }
        } catch (error) {
          console.error('Error parsing exit data:', error);
        }
      });
    });
  }

  getAllExits() {
    const allExits = [];

    // Iterate through all regions to collect exits
    Object.entries(stateManager.regions).forEach(([regionName, region]) => {
      if (region.exits && Array.isArray(region.exits)) {
        region.exits.forEach((exit) => {
          // Add region name to each exit for reference
          allExits.push({
            ...exit,
            region: regionName,
            player: region.player || 1,
          });
        });
      }
    });

    return allExits;
  }
}

export default ExitUI;

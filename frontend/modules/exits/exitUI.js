// exitUI.js
import { stateManagerSingleton } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import commonUI, { debounce } from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import eventBus from '../../app/core/eventBus.js';
import settingsManager from '../../app/core/settingsManager.js';

export class ExitUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement();
    this.exitsGrid = this.rootElement.querySelector('#exits-grid');
    this.stateUnsubscribeHandles = [];
    this.settingsUnsubscribe = null;
    this.attachEventListeners();
    this.subscribeToSettings();
    this.subscribeToStateEvents();
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
    this.unsubscribeFromStateEvents();
  }

  dispose() {
    this.onPanelDestroy();
  }

  subscribeToStateEvents() {
    this.unsubscribeFromStateEvents();
    console.log('[ExitUI] Subscribing to state and loop events...');

    if (!eventBus) {
      console.error('[ExitUI] EventBus not available!');
      return;
    }

    const subscribe = (eventName, handler) => {
      console.log(`[ExitUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      this.stateUnsubscribeHandles.push(unsubscribe);
    };

    const debouncedUpdate = debounce(() => this.updateExitDisplay(), 50);

    subscribe('stateManager:inventoryChanged', debouncedUpdate);
    subscribe('stateManager:regionsComputed', debouncedUpdate);
    subscribe('stateManager:rulesLoaded', debouncedUpdate);

    subscribe('loop:stateChanged', debouncedUpdate);
    subscribe('loop:actionCompleted', debouncedUpdate);
    subscribe('loop:discoveryChanged', debouncedUpdate);
    subscribe('loop:modeChanged', (isLoopMode) => {
      debouncedUpdate();
      const exploredCheckbox = this.rootElement?.querySelector(
        '#exit-show-explored'
      );
      if (exploredCheckbox && exploredCheckbox.parentElement) {
        exploredCheckbox.parentElement.style.display = isLoopMode
          ? 'inline-block'
          : 'none';
      }
    });
  }

  unsubscribeFromStateEvents() {
    if (this.stateUnsubscribeHandles.length > 0) {
      console.log('[ExitUI] Unsubscribing from state and loop events...');
      this.stateUnsubscribeHandles.forEach((unsubscribe) => unsubscribe());
      this.stateUnsubscribeHandles = [];
    }
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
    // Get loop mode status
    const isLoopModeActive = loopStateSingleton.isLoopModeActive;

    if (!isLoopModeActive) return;

    // Determine if the exit is discovered
    const isExitDiscovered = loopStateSingleton.isExitDiscovered(
      exit.region,
      exit.name
    );

    // --- New Logic for Initial Checks ---
    if (loopStateSingleton.actionQueue.length > 0) {
      const lastAction =
        loopStateSingleton.actionQueue[
          loopStateSingleton.actionQueue.length - 1
        ];

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
        const moveExists = loopStateSingleton.actionQueue.some(
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
        loopStateSingleton.setPaused(true);

        // Clear the current queue
        loopStateSingleton.actionQueue = [];
        loopStateSingleton.currentAction = null;
        loopStateSingleton.currentActionIndex = 0;

        // Queue move actions for each region transition along the path
        for (let i = 0; i < path.length - 1; i++) {
          const fromRegion = path[i];
          const toRegion = path[i + 1];

          // Find the exit that connects these regions (using discovered exits)
          const instance = stateManagerSingleton.instance;
          const regionData = instance?.regions[fromRegion];
          // Important: Find the exit within the *discovered* exits for the 'fromRegion'
          const exitToUse = regionData?.exits?.find(
            (e) =>
              e.connected_region === toRegion &&
              loopStateSingleton.isExitDiscovered(fromRegion, e.name)
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

            loopStateSingleton.actionQueue.push(moveAction);
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
          loopStateSingleton.actionQueue.push(exploreAction);

          // Set the region's "repeat explore action" checkbox to checked
          if (loopStateSingleton) {
            loopStateSingleton.setRepeatExplore(exit.region, true);
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
          loopStateSingleton.actionQueue.push(moveThroughExitAction);
        }
        // --- End New Logic for Final Action ---

        // Begin processing the action queue
        loopStateSingleton.setPaused(false);
        loopStateSingleton.startProcessing(); // This will pick up the new queue

        // Notify UI components about queue changes
        eventBus.publish('loopState:queueUpdated', {
          queue: loopStateSingleton.actionQueue,
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
    console.log('[ExitUI] Initializing panel...');
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
    console.log('[ExitUI] updateExitDisplay called.');
    const showReachable =
      this.rootElement.querySelector('#exit-show-reachable')?.checked ?? true;
    const showUnreachable =
      this.rootElement.querySelector('#exit-show-unreachable')?.checked ?? true;
    const showExplored =
      this.rootElement.querySelector('#exit-show-explored')?.checked ?? true;
    const sorting =
      this.rootElement.querySelector('#exit-sort-select')?.value ?? 'original';

    const instance = stateManagerSingleton.instance;
    console.log(
      '[ExitUI] Accessing stateManagerSingleton.instance:',
      instance ? 'Exists' : 'MISSING'
    );
    if (!instance) return;

    const allExits = this.getAllExits(instance);
    console.log(`[ExitUI] Found ${allExits.length} total exits.`);

    const exitsGrid = this.exitsGrid;
    if (!exitsGrid) return;

    exitsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`; // Set the number of columns

    if (allExits.length === 0) {
      exitsGrid.innerHTML = `
        <div class="empty-message">
          Upload a JSON file to see exits or adjust filters
        </div>
      `;
      return;
    }

    // Apply filters
    let filteredExits = allExits;

    // Only show discovered exits in Loop Mode if not showing all
    const isLoopModeActive = loopStateSingleton.isLoopModeActive;
    if (isLoopModeActive) {
      const showingExplored = showExplored;

      filteredExits = allExits.filter((exit) => {
        const regionDiscovered = loopStateSingleton.isRegionDiscovered(
          exit.region
        );
        if (!regionDiscovered) return false;

        const exitDiscovered = loopStateSingleton.isExitDiscovered(
          exit.region,
          exit.name
        );
        return showingExplored || !exitDiscovered;
      });
    }

    // Filter reachable/unreachable
    filteredExits = filteredExits.filter((exit) => {
      const isReachable =
        instance.isRegionReachable(exit.region) &&
        (!exit.access_rule || evaluateRule(exit.access_rule));

      if (isReachable && !showReachable) return false;
      // All other cases are considered unreachable
      else {
        return showUnreachable;
      }
    });

    // Sort exits
    if (sorting === 'accessibility') {
      filteredExits.sort((a, b) => {
        const aReachable =
          instance.isRegionReachable(a.region) &&
          (!a.access_rule || evaluateRule(a.access_rule));
        const bReachable =
          instance.isRegionReachable(b.region) &&
          (!b.access_rule || evaluateRule(b.access_rule));

        // Fully traversable exits first (region reachable + rule passes)
        const aFullyTraversable = aReachable;
        const bFullyTraversable = bReachable;

        // Then region accessible but rule fails
        const aRegionOnlyAccessible = aReachable && !aReachable;
        const bRegionOnlyAccessible = bReachable && !bReachable;

        // Then rule passes but region not accessible
        const aRuleOnlyPasses = !aReachable;
        const bRuleOnlyPasses = !bReachable;

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
      const isRegionAccessible = instance.isRegionReachable(exit.region);
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
      const isLoopModeActive = loopStateSingleton.isLoopModeActive;

      if (isLoopModeActive) {
        const isRegionDiscovered = loopStateSingleton.isRegionDiscovered(
          exit.region
        );
        const isExitDiscovered = loopStateSingleton.isExitDiscovered(
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

      // Origin Region Info (with clickable link)
      const originRegionDiv = document.createElement('div');
      originRegionDiv.className = 'text-sm';
      originRegionDiv.textContent = 'Origin: ';
      const originRegionLink = commonUI.createRegionLink(
        exit.region,
        useExitColorblind
      );
      const isOriginReachable = instance.isRegionReachable(exit.region);
      originRegionLink.style.color = isOriginReachable ? 'inherit' : 'red';
      originRegionDiv.appendChild(originRegionLink);
      originRegionDiv.appendChild(
        document.createTextNode(
          ` (${isOriginReachable ? 'Accessible' : 'Inaccessible'})`
        )
      );
      card.appendChild(originRegionDiv);

      // Destination Region Info (with clickable link)
      const destRegionDiv = document.createElement('div');
      destRegionDiv.className = 'text-sm';
      destRegionDiv.textContent = 'Destination: ';
      const destRegionLink = commonUI.createRegionLink(
        exit.connected_region,
        useExitColorblind
      );
      const isDestReachable = instance.isRegionReachable(exit.connected_region);
      destRegionLink.style.color = isDestReachable ? 'inherit' : 'red';
      destRegionDiv.appendChild(destRegionLink);
      destRegionDiv.appendChild(
        document.createTextNode(
          ` (${isDestReachable ? 'Accessible' : 'Inaccessible'})`
        )
      );
      card.appendChild(destRegionDiv);

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

    console.log(`[ExitUI] Rendering ${filteredExits.length} exits.`);
  }

  getAllExits(instance) {
    if (!instance || !instance.regions) return [];

    const exits = [];
    Object.values(instance.regions).forEach((region) => {
      if (region.exits) {
        region.exits.forEach((exit) => {
          // Add region name to each exit for reference
          exits.push({
            ...exit,
            region: region.name,
            player: region.player || 1,
          });
        });
      }
    });

    return exits;
  }
}

export default ExitUI;

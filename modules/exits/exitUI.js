// exitUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import commonUI from '../commonUI/index.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import {
  debounce,
  renderLogicTree,
  resetUnknownEvaluationCounter,
  logAndGetUnknownEvaluationCounter,
} from '../commonUI/index.js';
import loopStateSingleton from '../loops/loopStateSingleton.js';
import eventBus from '../../app/core/eventBus.js';
import settingsManager from '../../app/core/settingsManager.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('exitUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[exitUI] ${message}`, ...data);
  }
}

export class ExitUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement();
    this.exitsGrid = this.rootElement.querySelector('#exits-grid');
    this.stateUnsubscribeHandles = [];
    this.settingsUnsubscribe = null;
    this.colorblindSettings = {};
    this.isInitialized = false;
    this.originalExitOrder = [];
    this.container.element.appendChild(this.rootElement);
    this.attachEventListeners();
    this.subscribeToSettings();

    // Defer full data-dependent initialization
    const readyHandler = (eventPayload) => {
      log('info', 
        '[ExitUI] Received app:readyForUiDataLoad. Initializing base panel structure and event listeners.'
      );
      this.initialize(); // This will set up stateManager event listeners

      // DO NOT proactively fetch data or render here.
      // Static data (like original orders) will be fetched on 'stateManager:rulesLoaded'.
      // Full render will occur on 'stateManager:ready'.

      this.isInitialized = true; // Mark that basic panel setup is done.
      log('info', 
        '[ExitUI] Basic panel setup complete after app:readyForUiDataLoad. Awaiting StateManager readiness.'
      );

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.onPanelDestroy();
    });
  }

  subscribeToSettings() {
    if (this.settingsUnsubscribe) {
      this.settingsUnsubscribe();
    }
    this.settingsUnsubscribe = eventBus.subscribe(
      'settings:changed',
      ({ key, value }) => {
        if (key === '*' || key.startsWith('colorblindMode.exits')) {
          log('info', 'ExitUI reacting to settings change:', key);
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
    log('info', '[ExitUI] Subscribing to state and loop events...');

    if (!eventBus) {
      log('error', '[ExitUI] EventBus not available!');
      return;
    }

    const subscribe = (eventName, handler) => {
      log('info', `[ExitUI] Subscribing to ${eventName}`);
      const unsubscribe = eventBus.subscribe(eventName, handler);
      this.stateUnsubscribeHandles.push(unsubscribe);
    };

    const handleReady = () => {
      log('info', '[ExitUI] Received stateManager:ready event.');
      // This event confirms StateManager is fully ready (static data and initial snapshot).
      // originalExitOrder should have been populated by the 'stateManager:rulesLoaded' handler.

      if (!this.isInitialized) {
        log('warn', 
          '[ExitUI stateManager:ready] Panel base not yet initialized by app:readyForUiDataLoad. This is unexpected. Proceeding with render attempt.'
        );
      }

      // Ensure originalExitOrder is available (it should be from rulesLoaded handler)
      if (!this.originalExitOrder || this.originalExitOrder.length === 0) {
        log('warn', 
          '[ExitUI stateManager:ready] Original exit order not available. Attempting to fetch now.'
        );
        const currentStaticData = stateManager.getStaticData();
        if (currentStaticData && currentStaticData.exits) {
          this.originalExitOrder = stateManager.getOriginalExitOrder();
          log('info', 
            `[ExitUI stateManager:ready] Fetched ${this.originalExitOrder.length} exit keys for original order.`
          );
        } else {
          log('error', 
            '[ExitUI stateManager:ready] Failed to fetch static data/exits for original order. Exit panel may not display correctly.'
          );
        }
      }

      log('info', 
        '[ExitUI stateManager:ready] Triggering initial full display update.'
      );
      this.updateExitDisplay(); // This is now the primary trigger for the first full render.
    };
    subscribe('stateManager:ready', handleReady);

    const debouncedUpdate = debounce(() => {
      if (this.isInitialized) {
        this.updateExitDisplay();
      }
    }, 50);

    // Subscribe to state changes that affect exit display
    subscribe('stateManager:snapshotUpdated', debouncedUpdate);

    // Subscribe to loop state changes if relevant
    subscribe('loop:stateChanged', debouncedUpdate);
    subscribe('loop:actionCompleted', debouncedUpdate);
    subscribe('loop:discoveryChanged', debouncedUpdate);
    subscribe('loop:modeChanged', (isLoopMode) => {
      if (this.isInitialized) debouncedUpdate();
      const exploredCheckbox = this.rootElement?.querySelector(
        '#exit-show-explored'
      );
      if (exploredCheckbox?.parentElement) {
        exploredCheckbox.parentElement.style.display = isLoopMode
          ? 'inline-block'
          : 'none';
      }
    });

    // --- BEGIN ADDED: Handler for stateManager:rulesLoaded ---
    subscribe('stateManager:rulesLoaded', (event) => {
      log('info', 
        '[ExitUI] Received stateManager:rulesLoaded event. Full refresh triggered.'
      );

      // Access snapshot from event (this is the new initial snapshot for the loaded rules)
      const newSnapshot = event.snapshot;
      if (!newSnapshot) {
        log('warn', 
          '[ExitUI rulesLoaded] Snapshot missing from event payload. Aborting refresh.'
        );
        return;
      }

      // Fetch and store the NEW static data, including the original exit order.
      const currentStaticData = stateManager.getStaticData();
      if (currentStaticData && currentStaticData.exits) {
        this.originalExitOrder = stateManager.getOriginalExitOrder();
        log('info', 
          `[ExitUI rulesLoaded] Stored ${
            this.originalExitOrder ? this.originalExitOrder.length : 0
          } exit keys for original order.`
        );
      } else {
        log('warn', 
          '[ExitUI rulesLoaded] Static data or exits not available from proxy when trying to refresh order. Panel may not sort correctly.'
        );
        this.originalExitOrder = []; // Reset if not available
      }

      // Now that new static data (including order) and the new snapshot are available,
      // trigger a full display update.
      log('info', '[ExitUI rulesLoaded] Triggering full display update.');
      this.updateExitDisplay();
    });
    // --- END ADDED ---
  }

  unsubscribeFromStateEvents() {
    if (this.stateUnsubscribeHandles.length > 0) {
      log('info', '[ExitUI] Unsubscribing from state and loop events...');
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
        <input type="search" id="exit-search" placeholder="Search exits..." style="margin-right: 10px;">
        <select id="exit-sort-select">
          <option value="original">Original Order</option>
          <option value="name">Sort by Name</option>
          <option value="accessibility_original">Sort by Accessibility (Original)</option>
          <option value="accessibility">Sort by Accessibility (Name)</option>
        </select>
        <label>
          <input type="checkbox" id="exit-show-traversable" checked />
          Show Traversable
        </label>
        <label>
          <input type="checkbox" id="exit-show-non-traversable" checked />
          Show Non-Traversable
        </label>
        <label style="display: none"> <!-- Controlled by loop mode -->
          <input type="checkbox" id="exit-show-explored" checked />
          Show Explored
        </label>
        <button id="exit-decrease-columns">-</button>
        <span id="exit-column-count" style="margin: 0 5px;">${this.columns}</span>
        <button id="exit-increase-columns">+</button>
      </div>
      <div id="exits-grid" style="flex-grow: 1; overflow-y: auto;">
        <!-- Populated by updateExitDisplay -->
      </div>
      <!-- Modal Structure (similar to LocationUI) -->
      <div id="exit-modal" class="modal hidden">
        <div class="modal-content">
          <span class="modal-close" id="exit-modal-close">&times;</span>
          <h2 id="modal-exit-name">Exit Name</h2>
          <div id="modal-exit-details">
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
          const instance = stateManager.instance;
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
            log('warn', 
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
        log('error', errorMessage);

        // Show error in console or alert
        if (window.consoleManager) {
          window.consoleManager.print(errorMessage, 'error');
        } else {
          alert(errorMessage);
        }
      }
    });
  }

  // Called when the panel is initialized by PanelManager
  initialize() {
    log('info', '[ExitUI] Initializing panel (subscribing to state events)...');
    // Initialization now relies solely on the stateManager:ready event handler.
    this.subscribeToStateEvents(); // Ensure subscriptions are set up
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
    // Attach listeners to controls within this.rootElement
    const searchInput = this.rootElement.querySelector('#exit-search');
    if (searchInput) {
      // Debounce search input
      searchInput.addEventListener(
        'input',
        debounce(() => this.updateExitDisplay(), 250)
      );
    }

    [
      'exit-sort-select',
      'exit-show-traversable',
      'exit-show-non-traversable',
      'exit-show-explored',
    ].forEach((id) => {
      const element = this.rootElement.querySelector(`#${id}`);
      element?.addEventListener('change', () => this.updateExitDisplay());
    });

    // Column buttons
    this.rootElement
      .querySelector('#exit-decrease-columns')
      ?.addEventListener('click', () => this.changeColumns(-1));
    this.rootElement
      .querySelector('#exit-increase-columns')
      ?.addEventListener('click', () => this.changeColumns(1));

    // Modal listeners (if modal is used)
    this.rootElement
      .querySelector('#exit-modal-close')
      ?.addEventListener('click', () => {
        this.rootElement.querySelector('#exit-modal')?.classList.add('hidden');
      });

    // Event delegation for exit clicks on the grid (similar to LocationUI)
    // This will be for showing details on Ctrl+Click, regular click is handled by handleExitClick
    this.exitsGrid.addEventListener('click', (event) => {
      // Check if the click target or its parent (up to the card) is a region link
      let currentTarget = event.target;
      while (
        currentTarget &&
        currentTarget !== this.exitsGrid &&
        !currentTarget.classList.contains('exit-card')
      ) {
        if (currentTarget.classList.contains('region-link')) {
          log('info', 
            '[ExitUI] Click originated from a region-link, ignoring for exit card action.'
          );
          return; // Ignore clicks on region links
        }
        currentTarget = currentTarget.parentElement;
      }

      const exitCardElement = event.target.closest('.exit-card');
      if (exitCardElement) {
        const exitString = exitCardElement.dataset.exit;
        if (exitString) {
          try {
            const exitData = JSON.parse(decodeURIComponent(exitString));
            if (exitData) {
              if (event.ctrlKey || event.metaKey) {
                // this.showExitDetails(exitData); // Implement this later
                log('info', 
                  '[ExitUI] Ctrl+Click on exit, show details (not implemented yet)',
                  exitData
                );
              } else {
                this.handleExitClick(exitData); // Existing loop mode handler
              }
            }
          } catch (e) {
            log('error', 
              '[ExitUI] Error parsing exit data from dataset:',
              e,
              exitString
            );
          }
        }
      }
    });
  }

  changeColumns(delta) {
    const newColumns = Math.max(1, Math.min(10, this.columns + delta)); // Clamp between 1 and 10
    if (newColumns !== this.columns) {
      this.columns = newColumns;
      this.rootElement.querySelector('#exit-column-count').textContent =
        this.columns; // Update display
      this.updateExitDisplay(); // Redraw with new column count
    }
  }

  syncWithState() {
    this.updateExitDisplay();
  }

  updateExitDisplay() {
    log('info', '[ExitUI] updateExitDisplay called.');

    // Ensure the panel's basic initialization (DOM structure, non-data listeners) is done.
    if (!this.isInitialized) {
      log('warn', 
        '[ExitUI updateExitDisplay] Panel not yet initialized by app:readyForUiDataLoad. Aborting display update.'
      );
      return;
    }

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    log('info', 
      `[ExitUI updateExitDisplay] Start State - Snapshot: ${!!snapshot} Static Data: ${!!staticData}`
    );

    if (
      !snapshot ||
      !staticData ||
      !staticData.exits ||
      !staticData.items ||
      !staticData.regions
    ) {
      log('warn', 
        '[ExitUI] Static exit/item/region data or snapshot not ready. Displaying loading message or clearing grid.'
      );
      this.exitsGrid.innerHTML = '<p>Loading exit data...</p>';
      return;
    }

    if (!this.originalExitOrder || this.originalExitOrder.length === 0) {
      log('warn', 
        '[ExitUI updateExitDisplay] Original exit order not yet available. Exits might appear unsorted or panel might wait for re-render.'
      );
      const freshlyFetchedOrder = stateManager.getOriginalExitOrder();
      if (freshlyFetchedOrder && freshlyFetchedOrder.length > 0) {
        this.originalExitOrder = freshlyFetchedOrder;
        log('info', 
          `[ExitUI updateExitDisplay] Fallback fetch for originalExitOrder succeeded: ${this.originalExitOrder.length} items.`
        );
      } else {
        // Potentially show specific loading for order, or allow to proceed with default/name sort.
      }
    }

    // Reset the unknown evaluation counter for this rendering cycle
    resetUnknownEvaluationCounter();

    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      log('error', 
        '[ExitUI] Failed to create snapshot interface. Aborting render.'
      );
      if (this.exitsGrid) {
        this.exitsGrid.innerHTML = '<p>Error creating display context.</p>';
      }
      return;
    }

    // Get filter/sort states from controls
    const showTraversable = this.rootElement.querySelector(
      '#exit-show-traversable'
    ).checked;
    const showNonTraversable = this.rootElement.querySelector(
      '#exit-show-non-traversable'
    ).checked;
    const showExplored = this.rootElement.querySelector(
      '#exit-show-explored'
    ).checked;
    const sortMethod =
      this.rootElement.querySelector('#exit-sort-select').value;
    const searchTerm = this.rootElement
      .querySelector('#exit-search')
      .value.toLowerCase();

    // Start with all exits from staticData
    // Assuming staticData.exits is an object where keys are exit names/IDs and values are exit objects
    let filteredExits = Object.values(staticData.exits);

    // Initial filtering logic (more to be added)
    if (searchTerm) {
      filteredExits = filteredExits.filter((exit) => {
        const nameMatch = exit.name.toLowerCase().includes(searchTerm);
        // Exits usually have a parentRegion and connectedRegion. Search might apply to these.
        const parentRegionMatch = exit.parentRegion
          ?.toLowerCase()
          .includes(searchTerm);
        const connectedRegionMatch = exit.connectedRegion
          ?.toLowerCase()
          .includes(searchTerm);
        return nameMatch || parentRegionMatch || connectedRegionMatch;
      });
    }

    // Filter by traversability and explored status
    filteredExits = filteredExits.filter((exit) => {
      const parentRegionName = exit.parentRegion;
      const connectedRegionName = exit.connectedRegion;

      // Get the parent region status, prioritizing regionReachability
      const parentRegionStatus = snapshot.regionReachability?.[parentRegionName];
      const parentRegionReachable =
        parentRegionStatus === true ||
        parentRegionStatus === 'reachable' ||
        parentRegionStatus === 'checked';

      // ADDED LOGGING HERE
      if (connectedRegionName) {
        // Only log if there's a connected region
        //log('info', 
        //  `[ExitUI Check] Exit: ${exit.name} (from ${
        //    parentRegionName || 'N/A'
        //  }) -> ${connectedRegionName}. Reachability[${connectedRegionName}]:`,
        //  (snapshot.regionReachability?.[connectedRegionName])
        //);
      }

      // Get the connected region status, prioritizing regionReachability
      const connectedRegionStatus = snapshot.regionReachability?.[connectedRegionName];
      const connectedRegionReachable =
        connectedRegionStatus === true ||
        connectedRegionStatus === 'reachable' ||
        connectedRegionStatus === 'checked';


      // Evaluate access rule
      let rulePasses = true; // Default to true if no rule
      if (exit.access_rule) {
        try {
          rulePasses = evaluateRule(exit.access_rule, snapshotInterface);
        } catch (e) {
          log('error', 
            `[ExitUI] Error evaluating rule for exit ${exit.name}:`,
            e,
            exit.access_rule
          );
          rulePasses = false; // Treat error as rule failing
        }
      }

      const isTraversable =
        parentRegionReachable && rulePasses && connectedRegionReachable;

      if (isTraversable && !showTraversable) return false;
      if (!isTraversable && !showNonTraversable) return false;

      // Explored status (only in loop mode)
      if (loopStateSingleton.isLoopModeActive) {
        // Assuming exit objects have a unique identifier like 'name' or combined with parentRegion for discovery check
        const isExplored = loopStateSingleton.isExitDiscovered(
          exit.parentRegion,
          exit.name
        );
        if (isExplored && !showExplored) return false;
      }

      return true; // Keep exit if not filtered out
    });

    // Sort exits
    const accessibilitySortOrder = {
      traversable: 0, // Parent Reachable, Rule Passes, Connected Reachable
      parent_rule_ok_connected_locked: 1, // Parent Reachable, Rule Passes, Connected NOT Reachable
      parent_ok_rule_fails: 2, // Parent Reachable, Rule Fails
      parent_locked_rule_ok: 3, // Parent NOT Reachable, Rule Passes
      parent_locked_rule_fails: 4, // Parent NOT Reachable, Rule Fails
      unknown: 5,
    };

    filteredExits.sort((a, b) => {
      if (sortMethod === 'accessibility') {
        // Determine status for A
        const parentAReachable =
          (snapshot.regionReachability?.[a.parentRegion]) === true ||
          (snapshot.regionReachability?.[a.parentRegion]) === 'reachable' ||
          (snapshot.regionReachability?.[a.parentRegion]) === 'checked';
        const connectedAReachable =
          (snapshot.regionReachability?.[a.connectedRegion]) === true ||
          (snapshot.regionReachability?.[a.connectedRegion]) === 'reachable' ||
          (snapshot.regionReachability?.[a.connectedRegion]) === 'checked';
        let ruleAPasses = true;
        if (a.access_rule)
          try {
            ruleAPasses = evaluateRule(a.access_rule, snapshotInterface);
          } catch (e) {
            ruleAPasses = false;
          }

        let statusA = 'unknown';
        if (parentAReachable && ruleAPasses && connectedAReachable)
          statusA = 'traversable';
        else if (parentAReachable && ruleAPasses && !connectedAReachable)
          statusA = 'parent_rule_ok_connected_locked';
        else if (parentAReachable && !ruleAPasses)
          statusA = 'parent_ok_rule_fails';
        else if (!parentAReachable && ruleAPasses)
          statusA = 'parent_locked_rule_ok';
        else if (!parentAReachable && !ruleAPasses)
          statusA = 'parent_locked_rule_fails';

        // Determine status for B
        const parentBReachable =
          (snapshot.regionReachability?.[b.parentRegion]) === true ||
          (snapshot.regionReachability?.[b.parentRegion]) === 'reachable' ||
          (snapshot.regionReachability?.[b.parentRegion]) === 'checked';
        const connectedBReachable =
          (snapshot.regionReachability?.[b.connectedRegion]) === true ||
          (snapshot.regionReachability?.[b.connectedRegion]) === 'reachable' ||
          (snapshot.regionReachability?.[b.connectedRegion]) === 'checked';
        let ruleBPasses = true;
        if (b.access_rule)
          try {
            ruleBPasses = evaluateRule(b.access_rule, snapshotInterface);
          } catch (e) {
            ruleBPasses = false;
          }

        let statusB = 'unknown';
        if (parentBReachable && ruleBPasses && connectedBReachable)
          statusB = 'traversable';
        else if (parentBReachable && ruleBPasses && !connectedBReachable)
          statusB = 'parent_rule_ok_connected_locked';
        else if (parentBReachable && !ruleBPasses)
          statusB = 'parent_ok_rule_fails';
        else if (!parentBReachable && ruleBPasses)
          statusB = 'parent_locked_rule_ok';
        else if (!parentBReachable && !ruleBPasses)
          statusB = 'parent_locked_rule_fails';

        const orderA =
          accessibilitySortOrder[statusA] ?? accessibilitySortOrder.unknown;
        const orderB =
          accessibilitySortOrder[statusB] ?? accessibilitySortOrder.unknown;

        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.name.localeCompare(b.name); // Fallback to name sort for same accessibility
      } else if (sortMethod === 'accessibility_original') {
        // Determine status for A (same as 'accessibility' sort)
        const parentAReachable =
          (snapshot.regionReachability?.[a.parentRegion]) === true ||
          (snapshot.regionReachability?.[a.parentRegion]) === 'checked';
        const connectedAReachable =
          (snapshot.regionReachability?.[a.connectedRegion]) === true ||
          (snapshot.regionReachability?.[a.connectedRegion]) === 'checked';
        let ruleAPasses = true;
        if (a.access_rule)
          try {
            ruleAPasses = evaluateRule(a.access_rule, snapshotInterface);
          } catch (e) {
            ruleAPasses = false;
          }
        let statusA = 'unknown';
        if (parentAReachable && ruleAPasses && connectedAReachable)
          statusA = 'traversable';
        else if (parentAReachable && ruleAPasses && !connectedAReachable)
          statusA = 'parent_rule_ok_connected_locked';
        else if (parentAReachable && !ruleAPasses)
          statusA = 'parent_ok_rule_fails';
        else if (!parentAReachable && ruleAPasses)
          statusA = 'parent_locked_rule_ok';
        else if (!parentAReachable && !ruleAPasses)
          statusA = 'parent_locked_rule_fails';

        // Determine status for B (same as 'accessibility' sort)
        const parentBReachable =
          (snapshot.regionReachability?.[b.parentRegion]) === true ||
          (snapshot.regionReachability?.[b.parentRegion]) === 'checked';
        const connectedBReachable =
          (snapshot.regionReachability?.[b.connectedRegion]) === true ||
          (snapshot.regionReachability?.[b.connectedRegion]) === 'checked';
        let ruleBPasses = true;
        if (b.access_rule)
          try {
            ruleBPasses = evaluateRule(b.access_rule, snapshotInterface);
          } catch (e) {
            ruleBPasses = false;
          }
        let statusB = 'unknown';
        if (parentBReachable && ruleBPasses && connectedBReachable)
          statusB = 'traversable';
        else if (parentBReachable && ruleBPasses && !connectedBReachable)
          statusB = 'parent_rule_ok_connected_locked';
        else if (parentBReachable && !ruleBPasses)
          statusB = 'parent_ok_rule_fails';
        else if (!parentBReachable && ruleBPasses)
          statusB = 'parent_locked_rule_ok';
        else if (!parentBReachable && !ruleBPasses)
          statusB = 'parent_locked_rule_fails';

        const orderA =
          accessibilitySortOrder[statusA] ?? accessibilitySortOrder.unknown;
        const orderB =
          accessibilitySortOrder[statusB] ?? accessibilitySortOrder.unknown;

        if (orderA !== orderB) {
          return orderA - orderB;
        }
        // Secondary sort: original order
        if (this.originalExitOrder && this.originalExitOrder.length > 0) {
          const indexA = this.originalExitOrder.indexOf(a.name);
          const indexB = this.originalExitOrder.indexOf(b.name);
          if (indexA !== -1 && indexB !== -1) {
            if (indexA !== indexB) return indexA - indexB;
          }
          // Handle cases where one or both might not be in original order (e.g., new items)
          if (indexA === -1 && indexB !== -1) return 1; // A not found, B comes first
          if (indexA !== -1 && indexB === -1) return -1; // B not found, A comes first
        }
        return a.name.localeCompare(b.name); // Ultimate fallback to name sort
      } else if (sortMethod === 'name') {
        return a.name.localeCompare(b.name);
      } else {
        // 'original' or default
        if (this.originalExitOrder && this.originalExitOrder.length > 0) {
          // Ensure a and b.name are valid keys present in originalExitOrder
          const indexA = this.originalExitOrder.indexOf(a.name); // Assuming exit.name is the key used in originalExitOrder
          const indexB = this.originalExitOrder.indexOf(b.name);

          // Handle cases where an exit might not be in originalExitOrder (e.g. new exits added dynamically, though unlikely here)
          if (indexA === -1 && indexB === -1)
            return a.name.localeCompare(b.name); // Both not found, sort by name
          if (indexA === -1) return 1; // A not found, sort B first
          if (indexB === -1) return -1; // B not found, sort A first

          return indexA - indexB;
        } else {
          log('warn', 
            '[ExitUI] Original exit order not available, falling back to name sort.'
          );
          return a.name.localeCompare(b.name);
        }
      }
    });

    log('info', 
      `[ExitUI] Processing ${filteredExits.length} exits after filtering and sorting.`
    );

    // Render
    this.exitsGrid.innerHTML = ''; // Clear previous content
    this.exitsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`;
    this.exitsGrid.style.display = 'grid';
    this.exitsGrid.style.gap = '5px';

    if (filteredExits.length === 0) {
      this.exitsGrid.innerHTML = '<p>No exits match the current filters.</p>';
    } else {
      const fragment = document.createDocumentFragment();
      const useColorblind =
        typeof this.colorblindSettings === 'boolean'
          ? this.colorblindSettings
          : Object.keys(this.colorblindSettings).length > 0;

      filteredExits.forEach((exit) => {
        const card = document.createElement('div');
        card.className = 'exit-card'; // Base class, specific state class added below

        // Determine detailed status for rendering and class
        const parentRegionName = exit.parentRegion;
        const connectedRegionName = exit.connectedRegion;

        // Get region status using new regionReachability field with fallback
        const parentRegionStatus = snapshot.regionReachability?.[parentRegionName];
        const parentRegionReachable =
          parentRegionStatus === true ||
          parentRegionStatus === 'reachable' ||
          parentRegionStatus === 'checked';
          
        const connectedRegionStatus = snapshot.regionReachability?.[connectedRegionName];
        const connectedRegionReachable =
          connectedRegionStatus === true ||
          connectedRegionStatus === 'reachable' ||
          connectedRegionStatus === 'checked';
        let rulePasses = true;
        if (exit.access_rule)
          try {
            rulePasses = evaluateRule(exit.access_rule, snapshotInterface);
          } catch (e) {
            rulePasses = false;
          }

        // DEBUG: Log for Library exit in rendering section
        if (exit.name === 'Library') {
          console.log('[ExitUI DEBUG] Library exit RENDERING logic:', {
            exitName: exit.name,
            parentRegionName,
            connectedRegionName,
            parentRegionStatus,
            parentRegionReachable,
            connectedRegionStatus,
            connectedRegionReachable,
            rulePasses,
            hasAccessRule: !!exit.access_rule
          });
        }

        let stateClass = 'unknown-exit-state'; // Default for truly unknown/edge cases
        let statusText = 'Unknown Status';

        // Check for undefined results from reachability or rule evaluation first
        if (
          parentRegionReachable === undefined ||
          connectedRegionReachable === undefined ||
          rulePasses === undefined
        ) {
          stateClass = 'unknown-accessibility'; // Style this gray
          statusText = 'Accessibility Unknown';
          if (parentRegionReachable === undefined)
            statusText = 'Origin Unknown, ' + statusText;
          if (connectedRegionReachable === undefined)
            statusText = 'Dest Unknown, ' + statusText;
          if (rulePasses === undefined)
            statusText = 'Rule Eval Unknown, ' + statusText;
        } else if (
          parentRegionReachable &&
          rulePasses &&
          connectedRegionReachable
        ) {
          stateClass = 'traversable'; // Style this green
          statusText = 'Traversable';
        } else {
          // All other cases are definitively non-traversable for a known reason
          stateClass = 'non-traversable-locked'; // Style this red
          // More specific statusText can remain as before or be simplified
          if (
            parentRegionReachable &&
            rulePasses &&
            !connectedRegionReachable
          ) {
            statusText = 'To Locked Region';
          } else if (parentRegionReachable && !rulePasses) {
            statusText = 'Rule Fails';
          } else if (!parentRegionReachable && rulePasses) {
            statusText = 'From Locked Region, Rule OK';
          } else {
            // !parentRegionReachable && !rulePasses
            statusText = 'Fully Locked';
          }
        }

        // Remove all potentially existing state classes before adding the new one
        card.classList.remove(
          'unknown-exit-state',
          'unknown-accessibility',
          'traversable',
          'non-traversable-locked'
        );
        card.classList.add(stateClass);
        card.classList.toggle('colorblind-mode', useColorblind); // Simple toggle for now

        const isExplored =
          loopStateSingleton.isLoopModeActive &&
          loopStateSingleton.isExitDiscovered(exit.parentRegion, exit.name);
        card.classList.toggle('explored', isExplored);

        try {
          card.dataset.exit = encodeURIComponent(JSON.stringify(exit));
        } catch (e) {
          log('error', 
            '[ExitUI] Error stringifying exit data for card dataset:',
            exit,
            e
          );
        }

        // Clear existing card content before appending new elements
        card.innerHTML = '';

        const exitNameSpan = document.createElement('span');
        exitNameSpan.className = 'exit-name';
        exitNameSpan.textContent = exit.name;
        card.appendChild(exitNameSpan);

        if (exit.player) {
          const playerDiv = document.createElement('div');
          playerDiv.className = 'text-sm';
          playerDiv.textContent = `Player ${exit.player}`;
          card.appendChild(playerDiv);
        }

        // Origin Region
        const originRegionLink = commonUI.createRegionLink(
          parentRegionName,
          useColorblind,
          snapshot
        );
        const originDiv = document.createElement('div');
        originDiv.className = 'text-sm';
        originDiv.textContent = `From: `;
        originDiv.appendChild(originRegionLink);
        originDiv.appendChild(
          document.createTextNode(
            ` (${parentRegionReachable ? 'Accessible' : 'Inaccessible'})`
          )
        );
        card.appendChild(originDiv);

        // Destination Region
        const destRegionLink = commonUI.createRegionLink(
          connectedRegionName,
          useColorblind,
          snapshot
        );
        const destDiv = document.createElement('div');
        destDiv.className = 'text-sm';
        destDiv.textContent = `To: `;
        destDiv.appendChild(destRegionLink);
        destDiv.appendChild(
          document.createTextNode(
            ` (${connectedRegionReachable ? 'Accessible' : 'Inaccessible'})`
          )
        );
        card.appendChild(destDiv);

        // Access Rule
        if (exit.access_rule) {
          const ruleDiv = document.createElement('div');
          ruleDiv.className = 'text-sm';
          ruleDiv.textContent = 'Rule: ';
          const logicTreeElement = renderLogicTree(
            exit.access_rule,
            useColorblind,
            snapshotInterface
          );
          ruleDiv.appendChild(logicTreeElement);
          card.appendChild(ruleDiv);
        }

        // Status Text
        const statusDiv = document.createElement('div');
        statusDiv.className = 'text-sm';
        statusDiv.textContent = `Status: ${statusText}`;
        card.appendChild(statusDiv);

        if (isExplored) {
          const exploredIndicator = document.createElement('span');
          exploredIndicator.className = 'exit-explored-indicator';
          exploredIndicator.textContent = ' [E]';
          exploredIndicator.title = 'Explored in current loop';
          card.appendChild(exploredIndicator);
        }

        fragment.appendChild(card);
      });
      this.exitsGrid.appendChild(fragment);
    }

    log('info', `[ExitUI] Rendered ${filteredExits.length} exits.`);
    logAndGetUnknownEvaluationCounter('ExitPanel update complete');
  }
}

export default ExitUI;

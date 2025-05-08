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

export class ExitUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns
    this.rootElement = this.createRootElement();
    this.exitsGrid = this.rootElement.querySelector('#exits-grid');
    this.stateUnsubscribeHandles = [];
    this.settingsUnsubscribe = null;
    this.colorblindSettings = {};
    this.isInitialized = false;
    this.originalExitOrder = [];
    this.attachEventListeners();
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

    const handleReady = () => {
      console.log('[ExitUI] Received stateManager:ready event.');
      if (!this.isInitialized) {
        console.log('[ExitUI] Performing initial setup and render.');
        const currentStaticData = stateManager.getStaticData(); // Get static data
        if (currentStaticData && currentStaticData.exits) {
          // Exits in staticData are expected to be an object/map, so we take Object.keys
          this.originalExitOrder = stateManager.getOriginalExitOrder(); // Get true original order
          console.log(
            `[ExitUI] Stored ${this.originalExitOrder.length} exit keys for original order from proxy getter.`
          );
        } else {
          console.warn(
            '[ExitUI] Static exit data not available at ready event.'
          );
          this.originalExitOrder = []; // Ensure it's an empty array if data is missing
        }
        this.updateExitDisplay(); // Initial render
        this.isInitialized = true;
      }
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

  // Called when the panel is initialized by PanelManager
  initialize() {
    console.log('[ExitUI] Initializing panel...');
    this.isInitialized = false;
    this.subscribeToStateEvents();
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
      const exitCardElement = event.target.closest('.exit-card');
      if (exitCardElement) {
        const exitString = exitCardElement.dataset.exit;
        if (exitString) {
          try {
            const exitData = JSON.parse(decodeURIComponent(exitString));
            if (exitData) {
              if (event.ctrlKey || event.metaKey) {
                // this.showExitDetails(exitData); // Implement this later
                console.log(
                  '[ExitUI] Ctrl+Click on exit, show details (not implemented yet)',
                  exitData
                );
              } else {
                this.handleExitClick(exitData); // Existing loop mode handler
              }
            }
          } catch (e) {
            console.error(
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
    console.log('[ExitUI] updateExitDisplay called.');
    resetUnknownEvaluationCounter(); // Reset counter at the beginning of the update

    const snapshot = stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();
    console.log(
      '[ExitUI updateExitDisplay] Start State - Snapshot:',
      !!snapshot,
      'Static Data:',
      !!staticData
    );

    if (!staticData?.exits || !staticData?.regions || !snapshot) {
      console.warn('[ExitUI] Static exit/region data or snapshot not ready.');
      if (this.exitsGrid) {
        this.exitsGrid.innerHTML = '<p>Loading exit data...</p>';
      }
      return;
    }

    if (!this.exitsGrid) {
      console.warn(
        '[ExitUI] exitsGrid element not found during update. Aborting.'
      );
      return;
    }

    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    if (!snapshotInterface) {
      console.error(
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

      // Determine region reachability from snapshot
      const parentRegionReachable =
        snapshot.reachability?.[parentRegionName] === true ||
        snapshot.reachability?.[parentRegionName] === 'reachable' ||
        snapshot.reachability?.[parentRegionName] === 'checked';

      const connectedRegionReachable =
        snapshot.reachability?.[connectedRegionName] === true ||
        snapshot.reachability?.[connectedRegionName] === 'reachable' ||
        snapshot.reachability?.[connectedRegionName] === 'checked';

      // Evaluate access rule
      let rulePasses = true; // Default to true if no rule
      if (exit.access_rule) {
        try {
          rulePasses = evaluateRule(exit.access_rule, snapshotInterface);
        } catch (e) {
          console.error(
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
          snapshot.reachability?.[a.parentRegion] === true ||
          snapshot.reachability?.[a.parentRegion] === 'reachable' ||
          snapshot.reachability?.[a.parentRegion] === 'checked';
        const connectedAReachable =
          snapshot.reachability?.[a.connectedRegion] === true ||
          snapshot.reachability?.[a.connectedRegion] === 'reachable' ||
          snapshot.reachability?.[a.connectedRegion] === 'checked';
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
          snapshot.reachability?.[b.parentRegion] === true ||
          snapshot.reachability?.[b.parentRegion] === 'reachable' ||
          snapshot.reachability?.[b.parentRegion] === 'checked';
        const connectedBReachable =
          snapshot.reachability?.[b.connectedRegion] === true ||
          snapshot.reachability?.[b.connectedRegion] === 'reachable' ||
          snapshot.reachability?.[b.connectedRegion] === 'checked';
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
          snapshot.reachability?.[a.parentRegion] === true ||
          /* ... */ snapshot.reachability?.[a.parentRegion] === 'checked';
        const connectedAReachable =
          snapshot.reachability?.[a.connectedRegion] === true ||
          /* ... */ snapshot.reachability?.[a.connectedRegion] === 'checked';
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
          snapshot.reachability?.[b.parentRegion] === true ||
          /* ... */ snapshot.reachability?.[b.parentRegion] === 'checked';
        const connectedBReachable =
          snapshot.reachability?.[b.connectedRegion] === true ||
          /* ... */ snapshot.reachability?.[b.connectedRegion] === 'checked';
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
          console.warn(
            '[ExitUI] Original exit order not available, falling back to name sort.'
          );
          return a.name.localeCompare(b.name);
        }
      }
    });

    console.log(
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

        const parentRegionReachable =
          snapshot.reachability?.[parentRegionName] === true ||
          snapshot.reachability?.[parentRegionName] === 'reachable' ||
          snapshot.reachability?.[parentRegionName] === 'checked';
        const connectedRegionReachable =
          snapshot.reachability?.[connectedRegionName] === true ||
          snapshot.reachability?.[connectedRegionName] === 'reachable' ||
          snapshot.reachability?.[connectedRegionName] === 'checked';
        let rulePasses = true;
        if (exit.access_rule)
          try {
            rulePasses = evaluateRule(exit.access_rule, snapshotInterface);
          } catch (e) {
            rulePasses = false;
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
          console.error(
            '[ExitUI] Error stringifying exit data for card dataset:',
            exit,
            e
          );
        }

        let cardHTML = `<span class="exit-name">${exit.name}</span>`;
        if (exit.player) {
          cardHTML += `<div class="text-sm">Player ${exit.player}</div>`;
        }

        // Origin Region
        const originRegionLink = commonUI.createRegionLink(
          parentRegionName,
          useColorblind,
          snapshot
        );
        cardHTML += `<div class="text-sm">From: ${
          originRegionLink.outerHTML
        } (${parentRegionReachable ? 'Accessible' : 'Inaccessible'})</div>`;

        // Destination Region
        const destRegionLink = commonUI.createRegionLink(
          connectedRegionName,
          useColorblind,
          snapshot
        );
        cardHTML += `<div class="text-sm">To: ${destRegionLink.outerHTML} (${
          connectedRegionReachable ? 'Accessible' : 'Inaccessible'
        })</div>`;

        // Access Rule
        if (exit.access_rule) {
          const logicTreeElement = renderLogicTree(
            exit.access_rule,
            useColorblind,
            snapshotInterface
          );
          cardHTML += `<div class="text-sm">Rule: ${logicTreeElement.outerHTML}</div>`;
        }

        // Status Text
        cardHTML += `<div class="text-sm">Status: ${statusText}</div>`;

        card.innerHTML = cardHTML;

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

    console.log(`[ExitUI] Rendered ${filteredExits.length} exits.`);
    logAndGetUnknownEvaluationCounter('ExitPanel update complete');
  }
}

export default ExitUI;

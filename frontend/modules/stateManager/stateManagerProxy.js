console.log('[stateManagerProxy] Module loaded');

// TODO: Import eventBus

// import { ALTTPHelpers } from './games/alttp/helpers.js'; // OLD - REMOVE/REPLACE
import { ALTTPSnapshotHelpers } from './games/alttp/alttpSnapshotHelpers.js'; // NEW
import { evaluateRule } from './ruleEngine.js'; // Make this an active import
// import { evaluateRule } from './ruleEngine.js'; // Already imported

class StateManagerProxy {
  constructor(eventBus) {
    console.log('[stateManagerProxy] Initializing Proxy...');
    if (!eventBus) {
      throw new Error('StateManagerProxy requires an eventBus instance.');
    }
    this.worker = null;
    this.eventBus = eventBus;
    this.uiCache = null; // Initialize cache to null, indicating not yet loaded
    this.nextQueryId = 1;
    this.pendingQueries = new Map(); // Map<queryId, { resolve, reject, timeoutId? }>
    this.initialLoadPromise = null;
    this.initialLoadResolver = null;
    this.staticDataIsSet = false; // Flag for static data readiness
    this.isReadyPublished = false; // Flag to prevent multiple ready events
    this.isPotentialStaleSnapshot = false; // <<< ADDED: Staleness flag

    this._setupInitialLoadPromise();
    this.initializeWorker();
    console.log(
      '[StateManagerProxy Constructor] this._sendCommand type:',
      typeof this._sendCommand
    );
  }

  _setupInitialLoadPromise() {
    // Promise to track the initial rules loading confirmation
    this.initialLoadPromise = new Promise((resolve) => {
      this.initialLoadResolver = resolve;
    });
  }

  initializeWorker() {
    console.log('[stateManagerProxy] Creating Worker...');
    try {
      this.worker = new Worker(
        new URL('./stateManagerWorker.js', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event) => {
        // console.debug('[stateManagerProxy] Received message from worker:', event.data); // Use debug for less noise
        this.handleWorkerMessage(event.data);
      };

      this.worker.onerror = (error) => {
        console.error('[stateManagerProxy] Worker error:', error);
        const errorMessage = `Worker error: ${
          error.message || 'Unknown worker error'
        }`;
        // Reject all pending queries
        this.pendingQueries.forEach(({ reject, timeoutId }) => {
          if (timeoutId) clearTimeout(timeoutId);
          reject(new Error(errorMessage));
        });
        this.pendingQueries.clear();
        // Reject initial load promise if it's still pending
        if (this.initialLoadResolver) {
          // Ensure it hasn't resolved yet
          // This check might be tricky, maybe add a status flag
        }
        this.eventBus.publish('stateManager:error', {
          message: errorMessage,
          isCritical: true,
        });
        // Consider attempting to restart the worker or entering a failed state
      };
    } catch (e) {
      console.error('[stateManagerProxy] Failed to initialize worker:', e);
      this.eventBus.publish('stateManager:error', {
        message: 'Failed to initialize StateManager worker.',
        isCritical: true,
      });
      // Prevent further interaction
      this.worker = null;
    }
  }

  handleWorkerMessage(message) {
    if (!message || !message.type) {
      console.warn(
        '[stateManagerProxy] Received invalid message from worker:',
        message
      );
      return;
    }

    switch (message.type) {
      case 'queryResponse':
        this._handleQueryResponse(message);
        break;
      case 'rulesLoadedConfirmation': {
        console.log('[stateManagerProxy] Rules loaded confirmation received.');
        // Cache the initial snapshot sent with the confirmation
        // --- FIX: Access snapshot via message.initialSnapshot (matching worker) ---
        if (message.initialSnapshot) {
          this.uiCache = message.initialSnapshot;
          // --- END FIX ---
          console.debug(
            '[stateManagerProxy] Initial snapshot cached from confirmation.',
            this.uiCache
          );
        } else {
          console.warn(
            '[stateManagerProxy] rulesLoadedConfirmation received without initial snapshot.'
          );
        }
        // Resolve the initial load promise
        if (this.initialLoadResolver) {
          this.initialLoadResolver(true);
          this.initialLoadResolver = null; // Prevent multiple resolves
        } else {
          console.warn(
            '[StateManagerProxy] Initial load promise already resolved or resolver missing.'
          );
        }
        // Call the readiness check instead
        this._checkAndPublishReady();
        break;
      }
      case 'stateSnapshot':
        console.debug(
          '[stateManagerProxy] Received stateSnapshot from worker.',
          message.snapshot
        );
        if (message.snapshot) {
          this.uiCache = message.snapshot;
          this.isPotentialStaleSnapshot = false; // <<< ADDED: Reset flag on snapshot arrival
          // Publish a generic event indicating the cache is updated
          this.eventBus.publish('stateManager:snapshotUpdated', {
            snapshot: this.uiCache,
          });
        } else {
          console.warn(
            '[stateManagerProxy] Received stateSnapshot message without snapshot data.'
          );
        }
        break;
      case 'progress':
        // console.debug('[stateManagerProxy] Progress update received:', message.detail); // Debug level
        this.eventBus.publish(
          'stateManager:computationProgress',
          message.detail
        );
        break;
      case 'event': // For granular events forwarded from worker
        console.log(
          `[stateManagerProxy] Forwarding worker event: ${message.name}`
        );
        this.eventBus.publish(`stateManager:${message.name}`, message.payload);
        break;
      case 'workerQueueStatus':
        this.eventBus.publish('stateManager:workerQueueStatus', {
          queueSummary: message.queueSummary,
        });
        break;
      case 'error': // Errors reported by the worker during processing
        console.error('[stateManagerProxy] Error reported by worker:', message);
        this.eventBus.publish('stateManager:workerError', {
          message: message.message,
          stack: message.stack,
          originalCommand: message.originalCommand,
        });
        break;
      default:
        console.warn(
          '[stateManagerProxy] Unknown message type received:',
          message.type,
          message
        );
    }
  }

  _handleQueryResponse(message) {
    const { queryId, result, error } = message;
    const pending = this.pendingQueries.get(queryId);

    if (pending) {
      if (pending.timeoutId) {
        clearTimeout(pending.timeoutId);
      }
      if (error) {
        console.error(`[stateManagerProxy] Query ${queryId} failed:`, error);
        pending.reject(new Error(error));
      } else {
        // console.debug(`[stateManagerProxy] Query ${queryId} succeeded.`); // Debug level
        pending.resolve(result);
      }
      this.pendingQueries.delete(queryId);
    } else {
      console.warn(
        `[stateManagerProxy] Received response for unknown queryId: ${queryId}`
      );
    }
  }

  // --- Internal Helper Methods ---

  sendCommandToWorker(message) {
    if (!this.worker) {
      console.error('[stateManagerProxy] Worker not available.');
      // Optionally throw an error or handle gracefully
      return;
    }
    try {
      this.worker.postMessage(message);
    } catch (error) {
      console.error(
        '[stateManagerProxy] Error sending command to worker:',
        error,
        message
      );
      // Handle serialization errors, etc.
      this.eventBus.publish('stateManager:error', {
        message: 'Error communicating with StateManager worker.',
        isCritical: true,
      });
    }
  }

  sendQueryToWorker(message, timeoutMs = 10000) {
    // Added timeout
    return new Promise((resolve, reject) => {
      if (!this.worker) {
        return reject(new Error('Worker not initialized'));
      }

      const queryId = this.nextQueryId++;
      let timeoutId = null;

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (this.pendingQueries.has(queryId)) {
            console.error(
              `[stateManagerProxy] Query ${queryId} (${message.command}) timed out after ${timeoutMs}ms.`
            );
            this.pendingQueries.delete(queryId);
            reject(new Error(`Query timed out: ${message.command}`));
          }
        }, timeoutMs);
      }

      this.pendingQueries.set(queryId, { resolve, reject, timeoutId });

      try {
        this.worker.postMessage({ ...message, queryId });
      } catch (error) {
        console.error(
          '[stateManagerProxy] Error sending query to worker:',
          error,
          message
        );
        if (timeoutId) clearTimeout(timeoutId);
        this.pendingQueries.delete(queryId);
        reject(new Error('Error communicating with StateManager worker.'));
        this.eventBus.publish('stateManager:error', {
          message: 'Error communicating with StateManager worker.',
          isCritical: true,
        });
      }
    });
  }

  // --- Public API Methods ---

  /**
   * Sends the initial rules and player info to the worker.
   * Returns a promise that resolves when the worker confirms loading is complete.
   */
  async loadRules(rulesData, playerInfo) {
    if (!this.worker) {
      return Promise.reject(new Error('Worker not initialized.'));
    }
    console.log(
      '[stateManagerProxy] Sending loadRules command to worker (rules only)...'
    );
    this.sendCommandToWorker({
      command: 'loadRules',
      payload: { rulesData, playerInfo }, // Send full rulesData
    });
    // Return the promise that tracks the initial load confirmation
    return this.initialLoadPromise;
  }

  /**
   * Waits until the initial rules load is confirmed by the worker.
   */
  async ensureReady() {
    if (!this.worker) {
      throw new Error('Worker not initialized.');
    }
    if (this.uiCache !== null) {
      return true; // Already loaded
    }
    console.log('[stateManagerProxy] Waiting for worker initial load...');
    return this.initialLoadPromise;
  }

  /**
   * Returns the latest state snapshot received from the worker.
   * Returns null if no snapshot has been received yet.
   */
  getSnapshot() {
    // It's recommended to use ensureReady() before calling this
    // if you need to guarantee a non-null snapshot on initial load.
    // However, event handlers reacting to snapshotUpdated can call this safely.
    return this.uiCache;
  }

  // Method to accept and cache static data (items, groups, locations, regions)
  setStaticData(itemData, groupData, locationData, regionData, exitData) {
    console.log(
      '[StateManagerProxy] Caching static item/group/location(aggregated)/region(original)/exit(aggregated) data.'
    );
    this.staticDataCache = {
      items: itemData,
      groups: groupData,
      locations: locationData,
      regions: regionData,
      exits: exitData,
    };
    this.staticDataIsSet = true; // Set flag when static data arrives
    // Log the structure briefly
    console.debug('[StateManagerProxy] Cached static data structure:', {
      items: itemData ? Object.keys(itemData).length : 0,
      groups: groupData ? Object.keys(groupData).length : 0,
      locations: locationData ? Object.keys(locationData).length : 0,
      regions: regionData ? Object.keys(regionData).length : 0,
      exits: exitData ? Object.keys(exitData).length : 0,
    });

    // Check if ready to publish event
    this._checkAndPublishReady();
  }

  // Method to retrieve all cached static data
  getStaticData() {
    if (!this.staticDataCache) {
      // console.warn( // Quieting this down
      //   '[StateManagerProxy] Attempted to get static data before it was set.'
      // );
      return null;
    }
    return this.staticDataCache;
  }

  async addItemToInventory(item, quantity = 1) {
    await this.ensureReady(); // Ensure worker is loaded before sending commands
    console.log(
      `[stateManagerProxy] Sending addItemToInventory command for ${item}`
    );
    this.sendCommandToWorker({
      command: 'addItemToInventory',
      payload: { item, quantity },
    });
    this.isPotentialStaleSnapshot = true; // <<< ADDED: Set flag
    // Fire-and-forget - updates come via stateSnapshot events
  }

  async checkLocation(locationName) {
    console.log(
      `[StateManagerProxy] Sending checkLocation command for ${locationName}`
    );
    const messageToSend = { command: 'checkLocation', payload: locationName };
    console.log(
      '[StateManagerProxy checkLocation] Message to send to worker:',
      JSON.stringify(messageToSend)
    ); // ADDED DEBUG
    // Await the response (even if it's just an ack or error)
    return this.sendQueryToWorker(messageToSend);
  }

  async syncCheckedLocationsFromServer(checkedLocationIds) {
    await this.ensureReady();
    console.log(
      `[stateManagerProxy] Sending syncCheckedLocationsFromServer command.`
    );
    this.sendCommandToWorker({
      command: 'syncCheckedLocationsFromServer',
      payload: { checkedLocationIds },
    });
    this.isPotentialStaleSnapshot = true; // <<< ADDED: Set flag
  }

  async toggleQueueReporting(enabled) {
    await this.ensureReady();
    console.log(
      `[stateManagerProxy] Sending toggleQueueReporting command (${enabled}).`
    );
    this.sendCommandToWorker({
      command: 'toggleQueueReporting',
      payload: { enabled },
    });
    // Return the promise that tracks the initial load confirmation
    return this.initialLoadPromise;
  }

  // --- Queries ---

  async getFullSnapshot() {
    await this.ensureReady();
    console.log('[stateManagerProxy] Querying for full snapshot...');
    return this.sendQueryToWorker({ command: 'getFullSnapshot' });
  }

  async getWorkerQueueStatus() {
    await this.ensureReady();
    console.log('[stateManagerProxy] Querying for worker queue status...');
    return this.sendQueryToWorker({ command: 'getWorkerQueueStatus' });
  }

  /**
   * Synchronously returns the latest state snapshot held by the proxy.
   * Returns null if the initial snapshot hasn't been received yet.
   */
  getLatestStateSnapshot() {
    if (!this.uiCache) {
      // console.warn( // Quieting this down
      //   '[StateManagerProxy] Attempted to get latest snapshot before it was set.'
      // );
      return null;
    }
    // Synchronous access to the cached state
    return this.uiCache;
  }

  terminateWorker() {
    if (this.worker) {
      console.log('[stateManagerProxy] Terminating worker.');
      this.worker.terminate();
      this.worker = null;
      // Reject any remaining pending queries
      this.pendingQueries.forEach(({ reject, timeoutId }) => {
        if (timeoutId) clearTimeout(timeoutId);
        reject(new Error('Worker terminated'));
      });
      this.pendingQueries.clear();
      // Reset initial load promise for potential restart?
      this._setupInitialLoadPromise();
      this.uiCache = null;
    }
  }

  // --- ADDED: Helper to check readiness and publish event --- >
  _checkAndPublishReady() {
    console.log('[StateManagerProxy] _checkAndPublishReady called. Status:', {
      uiCacheNotNull: !!this.uiCache,
      staticDataIsSet: this.staticDataIsSet,
      isReadyPublished: this.isReadyPublished,
    });
    if (this.uiCache && this.staticDataIsSet && !this.isReadyPublished) {
      if (this.eventBus) {
        console.log(
          '[stateManagerProxy] Publishing stateManager:ready event (Snapshot & Static Data Ready).'
        );
        this.eventBus.publish('stateManager:ready');
        this.isReadyPublished = true; // Prevent publishing again
      } else {
        console.warn(
          '[stateManagerProxy] EventBus not available to publish stateManager:ready.'
        );
      }
    }
  }
  // --- END ADDED --- >

  /**
   * Sends a command to the worker and potentially waits for a response.
   * Internal use.
   */
  async _sendCommand(
    command,
    payload = null,
    expectResponse = false,
    timeout = 5000
  ) {
    // ... existing code ...
  }

  /**
   * Requests the worker to evaluate a specific rule using its full context.
   * @param {object} rule The rule object to evaluate.
   * @returns {Promise<any>} The result of the rule evaluation from the worker.
   */
  async evaluateRuleRemote(rule) {
    if (!this.worker) {
      console.error(
        '[StateManagerProxy] Worker not initialized, cannot evaluate rule remotely.'
      );
      return false; // Or throw error
    }
    if (this._initialLoadComplete) {
      console.log(
        `[StateManagerProxy] Sending evaluateRuleRequest for rule:`,
        rule
      );
      try {
        const response = await this._sendCommand(
          'evaluateRuleRequest',
          { rule },
          true // Expect a response
        );
        console.log(
          `[StateManagerProxy] Received evaluateRuleResponse:`,
          response
        );
        // Assuming the response structure includes { result: ... } or { error: ... }
        if (response && typeof response.error !== 'undefined') {
          console.error(
            '[StateManagerProxy] Worker returned error during remote rule evaluation:',
            response.error
          );
          return false; // Propagate failure
        }
        return response?.result;
      } catch (error) {
        console.error(
          '[StateManagerProxy] Error during remote rule evaluation request:',
          error
        );
        return false; // Indicate failure
      }
    } else {
      console.warn(
        '[StateManagerProxy] Worker not ready, cannot evaluate rule remotely yet.'
      );
      return false; // Worker isn't loaded/ready
    }
  }

  /**
   * Retrieves the current state snapshot held by the proxy.
   * Returns null if the snapshot hasn't been received yet.
   */
  getCurrentStateSnapshot() {
    // ... existing code ...
  }

  // <<< ADDED: Accessor for staleness flag >>>
  /**
   * Checks if a state-modifying command has been sent to the worker
   * since the last snapshot was received.
   * @returns {boolean} True if the current snapshot might be stale.
   */
  isSnapshotPotentiallyStale() {
    return this.isPotentialStaleSnapshot;
  }
  // <<< END ADDED >>>
}

// --- ADDED: Function to create the main-thread snapshot interface ---
/**
 * Creates an interface object suitable for main-thread rule evaluation
 * based on the latest cached snapshot data.
 * @param {object | null} snapshot - The raw state snapshot from the worker (or null if not available).
 * @param {object | null} staticData - The cached static data (items, groups, etc.).
 * @returns {object} - An object conforming to the StateSnapshotInterface.
 */
export function createStateSnapshotInterface(snapshot, staticData) {
  let snapshotInterfaceInstance = null;

  // First, define the core methods of the snapshot interface that helpers will need.
  // This rawInterface is what ALTTPSnapshotHelpers constructor will receive.
  const rawInterfaceForHelpers = {
    _isSnapshotInterface: true, // Crucial marker for helper constructor
    snapshot: snapshot,
    staticData: staticData,
    hasItem: (itemName) =>
      !!(snapshot?.inventory && snapshot.inventory[itemName] > 0),
    countItem: (itemName) => snapshot?.inventory?.[itemName] || 0,
    countGroup: (groupName) => {
      if (
        !staticData?.groups ||
        !staticData.groups[groupName] ||
        !snapshot?.inventory
      )
        return 0;
      let count = 0;
      for (const itemInGroup of staticData.groups[groupName]) {
        count += snapshot.inventory[itemInGroup] || 0;
      }
      return count;
    },
    hasFlag: (flagName) =>
      !!(snapshot?.flags && snapshot.flags.includes(flagName)),
    getSetting: (settingName) => snapshot?.settings?.[settingName],
    isRegionReachable: (regionName) => {
      // TEMP LOGGING
      //console.log(
      //  `[SnapshotIF isRegionReachable] Checking region: '${regionName}'. Reachability data:`,
      //  snapshot?.reachability
      //);
      const status = snapshot?.reachability?.[regionName];
      if (status === 'reachable' || status === 'checked') return true;
      if (status === 'unreachable') return false;
      return undefined;
    },
    getPlayerSlot: () =>
      snapshot && snapshot.player ? snapshot.player.slot : undefined,
    getGameMode: () => snapshot?.gameMode,
    getDifficultyRequirements: () =>
      snapshot && snapshot.state && snapshot.state.difficultyRequirements
        ? snapshot.state.difficultyRequirements
        : undefined,
    getShops: () =>
      snapshot && snapshot.state && snapshot.state.shops
        ? snapshot.state.shops
        : undefined,
    getRegionData: (regionName) => {
      if (
        !staticData ||
        !staticData.regionData ||
        !staticData.regionData[regionName]
      ) {
        return undefined;
      }
      return staticData.regionData[regionName];
    },
    getStaticData: () => staticData, // Allow helpers to access all staticData if needed
    getStateValue: (pathString) => {
      if (!snapshot || !snapshot.state) {
        return undefined;
      }
      if (typeof pathString !== 'string' || pathString.trim() === '') {
        return undefined;
      }
      const keys = pathString.split('.');
      let current = snapshot.state;
      for (const key of keys) {
        if (current && typeof current === 'object' && key in current) {
          current = current[key];
        } else {
          return undefined;
        }
      }
      return current;
    },
    getLocationItem: (locationName) => {
      if (!snapshot || !snapshot.locationItems) {
        // console.warn('[SnapshotInterface] getLocationItem: snapshot.locationItems not available.');
        return undefined; // Data structure not in snapshot
      }
      const itemDetail = snapshot.locationItems[locationName];
      if (itemDetail === undefined) {
        // console.warn(`[SnapshotInterface] getLocationItem: No item detail for location '${locationName}'.`);
        return undefined; // Location not in the map, or explicitly undefined
      }
      // itemDetail could be null (if explicitly no item) or { name, player }
      // The helper function (location_item_name in ALTTPSnapshotHelpers) will format this.
      return itemDetail;
    },
    // Add other necessary methods that ALTTPSnapshotHelpers might need from the snapshot
  };

  // const altlpHelpersInstance = new ALTTPHelpers(helpersContext); // OLD
  const altlpSnapshotHelpersInstance = new ALTTPSnapshotHelpers(
    rawInterfaceForHelpers
  ); // NEW

  // Now construct the final snapshotInterfaceInstance that UI will use,
  // which includes an executeHelper method that uses the altlpSnapshotHelpersInstance.
  snapshotInterfaceInstance = {
    ...rawInterfaceForHelpers, // Spread the core methods

    // Expose the created helper instance directly if needed by some advanced rule structures
    helpers: altlpSnapshotHelpersInstance,

    executeHelper: (name, ...args) => {
      if (
        altlpSnapshotHelpersInstance &&
        typeof altlpSnapshotHelpersInstance.executeHelper === 'function'
      ) {
        // ALTTPSnapshotHelpers.executeHelper will call the actual helper method (this[name])
        return altlpSnapshotHelpersInstance.executeHelper(name, ...args);
      }
      console.warn(
        `[SnapshotIF executeHelper] Helper dispatcher not available or method ${name} not found on instance.`
      );
      return undefined;
    },

    resolveRuleObject: (ruleObjectPath) => {
      if (ruleObjectPath && ruleObjectPath.type === 'name') {
        const name = ruleObjectPath.name;
        if (name === 'helpers') return altlpSnapshotHelpersInstance;
        if (name === 'state' || name === 'settings' || name === 'inventory') {
          return snapshotInterfaceInstance;
        }
        if (name === 'player') {
          const slotValue = snapshot?.player?.slot;
          return slotValue;
        }
        if (
          altlpSnapshotHelpersInstance &&
          altlpSnapshotHelpersInstance.entities &&
          altlpSnapshotHelpersInstance.entities[name]
        ) {
          return altlpSnapshotHelpersInstance.entities[name];
        }
      }
      return snapshotInterfaceInstance;
    },

    executeStateManagerMethod: (methodName, ...args) => {
      // This method allows rules of type 'state_method' to be routed
      // to appropriate helper methods or direct snapshot interface methods.
      switch (methodName) {
        case 'can_reach':
          // can_reach in old helpers often took (name, type, player)
          // type was 'Region' or 'Location'. Player usually defaulted to current.
          if (
            args.length >= 2 &&
            typeof args[0] === 'string' &&
            typeof args[1] === 'string'
          ) {
            const name = args[0];
            const type = args[1];
            if (type === 'Region') {
              if (
                typeof snapshotInterfaceInstance.isRegionReachable ===
                'function'
              ) {
                return snapshotInterfaceInstance.isRegionReachable(name);
              }
            } else if (type === 'Location') {
              if (
                typeof snapshotInterfaceInstance.isLocationAccessible ===
                'function'
              ) {
                return snapshotInterfaceInstance.isLocationAccessible(name);
              }
            }
            console.warn(
              `[SnapshotIF executeStateManagerMethod] 'can_reach' for type '${type}' could not be resolved to a snapshot method.`
            );
            return undefined;
          } else if (args.length === 1 && typeof args[0] === 'string') {
            // Simplified case: if only one string arg, assume it's a region name
            if (
              typeof snapshotInterfaceInstance.isRegionReachable === 'function'
            ) {
              return snapshotInterfaceInstance.isRegionReachable(args[0]);
            }
            return undefined;
          }
          console.warn(
            `[SnapshotIF executeStateManagerMethod] 'can_reach' called with unhandled args:`,
            args,
            `Falling back to undefined.`
          );
          return undefined;
        case '_lttp_has_key':
          // Map to the migrated helper method name
          return altlpSnapshotHelpersInstance.executeHelper(
            '_has_specific_key_count',
            ...args
          );
        case 'has_any':
          return altlpSnapshotHelpersInstance.executeHelper('has_any', ...args);
        // Add other state methods that need specific handling or delegation here
        default:
          console.warn(
            `[SnapshotIF executeStateManagerMethod] Unknown method '${methodName}' called.`
          );
          return undefined;
      }
    },

    isLocationAccessible: (locationOrName) => {
      // Essential checks for data presence
      if (!staticData || !staticData.locationData) {
        // console.warn("[SnapshotInterface] isLocationAccessible: Missing staticData.locationData");
        return undefined;
      }
      if (!snapshot) {
        // console.warn("[SnapshotInterface] isLocationAccessible: Missing snapshot data");
        return undefined;
      }

      let locationName =
        typeof locationOrName === 'string'
          ? locationOrName
          : locationOrName?.name; // Added optional chaining for name

      if (!locationName) {
        // console.warn("[SnapshotInterface] isLocationAccessible: Invalid locationOrName provided.", locationOrName);
        return undefined;
      }

      const locData = staticData.locationData[locationName]; // locData contains the location's properties, including its access_rule
      if (!locData) {
        // console.warn(`[SnapshotInterface] isLocationAccessible: Location static data not found for '${locationName}'`);
        return undefined;
      }

      const regionName = locData.region;
      if (!regionName) {
        // console.warn(`[SnapshotInterface] isLocationAccessible: Region not defined for location '${locationName}'`);
        return undefined;
      }

      // Step 1: Check parent region reachability using the already defined isRegionReachable on snapshotInterfaceInstance
      const parentRegionIsReachable =
        snapshotInterfaceInstance.isRegionReachable(regionName);

      // <<< ADDED LOGGING >>>
      const logData = {
        locationName,
        regionName,
        parentRegionIsReachable,
        accessRule: locData.access_rule
          ? JSON.parse(JSON.stringify(locData.access_rule))
          : null,
        locationRuleResult: null, // Will be filled later
        finalOutcome: null, // Will be filled before returning
      };
      // <<< END ADDED LOGGING >>>

      if (parentRegionIsReachable === undefined) {
        // If parent region's reachability is unknown, location's is too
        // <<< ADDED LOGGING >>>
        logData.finalOutcome = undefined;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData);
        // <<< END ADDED LOGGING >>>
        return undefined;
      }
      if (parentRegionIsReachable === false) {
        // If parent region is not reachable, location is not reachable
        // <<< ADDED LOGGING >>>
        logData.finalOutcome = false;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData);
        // <<< END ADDED LOGGING >>>
        return false;
      }

      // Step 2: If parent region is reachable, check the location's own access_rule (if it exists)
      if (!locData.access_rule) {
        // No specific rule for this location, so it's accessible if its region is
        // <<< ADDED LOGGING >>>
        logData.finalOutcome = true;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData);
        // <<< END ADDED LOGGING >>>
        return true;
      }

      // Evaluate the location's access_rule using the snapshotInterfaceInstance as context.
      // evaluateRule should be available in this scope from the import at the top of the file.
      const locationRuleResult = evaluateRule(
        locData.access_rule,
        snapshotInterfaceInstance
      );
      logData.locationRuleResult = locationRuleResult; // <<< ADDED LOGGING >>>

      // The result of evaluateRule can be true, false, or undefined (for snapshot context if rule can't be fully determined)
      // <<< ADDED LOGGING >>>
      logData.finalOutcome = locationRuleResult;
      console.log('[SnapshotIF isLocationAccessible DEBUG]', logData); // Log only once at the end for clarity
      // <<< END ADDED LOGGING >>>
      return locationRuleResult;
    },
  };
  return snapshotInterfaceInstance;
}
// --- END ADDED FUNCTION ---

export default StateManagerProxy;

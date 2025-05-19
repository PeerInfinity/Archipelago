console.log('[stateManagerProxy] Module loaded');

// TODO: Import eventBus

// import { ALTTPHelpers } from './games/alttp/helpers.js'; // OLD - REMOVE/REPLACE
import { ALTTPSnapshotHelpers } from './games/alttp/alttpSnapshotHelpers.js'; // NEW
import { evaluateRule } from './ruleEngine.js'; // Make this an active import
// import { evaluateRule } from './ruleEngine.js'; // Already imported
import { GameSnapshotHelpers } from './helpers/gameSnapshotHelpers.js'; // Added import

export class StateManagerProxy {
  static COMMANDS = {
    INITIALIZE: 'initialize',
    LOAD_RULES: 'loadRules',
    ADD_ITEM: 'addItemToInventory',
    REMOVE_ITEM: 'removeItemFromInventory',
    CHECK_LOCATION: 'checkLocation',
    UNCHECK_LOCATION: 'uncheckLocation',
    GET_SNAPSHOT: 'getSnapshot', // Request a full snapshot
    CLEAR_CHECKED_LOCATIONS: 'clearCheckedLocations',
    UPDATE_SETTING: 'updateSetting', // For game-specific settings like ALTTP flags
    APPLY_RUNTIME_STATE: 'applyRuntimeState', // New command
    BEGIN_BATCH_UPDATE: 'beginBatchUpdate', // Added command
    COMMIT_BATCH_UPDATE: 'commitBatchUpdate', // Added command
  };

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
    this.debugMode = false; // Initialize debugMode

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

    // ADDED: Detailed log for all incoming messages from worker
    // console.log(
    //   '[StateManagerProxy] DETAILED << WORKER:',
    //   JSON.parse(JSON.stringify(message))
    // );

    switch (message.type) {
      case 'queryResponse':
        this._handleQueryResponse(message);
        break;
      case 'workerInitializedConfirmation': // ADDED: Handle worker initialization confirmation
        console.log(
          '[StateManagerProxy] Worker initialized confirmation received:',
          JSON.parse(JSON.stringify(message.configEcho || {}))
        );
        // Worker is up, but we still wait for rules to be loaded for the main "ready" state.
        // This event could be used for finer-grained readiness if needed in the future.
        break;
      case 'rulesLoadedConfirmation': {
        console.log(
          '[StateManagerProxy] Received rulesLoadedConfirmation from worker.',
          message
        );
        if (message.newStaticData) {
          const newCache = { ...message.newStaticData };

          // Convert exits array to object keyed by name
          if (Array.isArray(newCache.exits)) {
            const exitsObject = {};
            newCache.exits.forEach((exit) => {
              if (exit && exit.name) {
                exitsObject[exit.name] = exit;
              } else {
                console.warn(
                  '[StateManagerProxy] Encountered exit without a name during array to object conversion:',
                  exit
                );
              }
            });
            newCache.exits = exitsObject;
          }

          // Convert locations array to object keyed by name
          if (Array.isArray(newCache.locations)) {
            const locationsObject = {};
            newCache.locations.forEach((location) => {
              if (location && location.name) {
                locationsObject[location.name] = location;
              } else {
                console.warn(
                  '[StateManagerProxy] Encountered location without a name during array to object conversion:',
                  location
                );
              }
            });
            newCache.locations = locationsObject;
          } else {
            // If it's not an array, it might already be an object (e.g. from older structure or direct setStaticData)
            // We should ensure it's what we expect or log a warning if it's something else.
            if (
              typeof newCache.locations !== 'object' ||
              newCache.locations === null
            ) {
              console.warn(
                '[StateManagerProxy] newStaticData.locations is neither an array nor a valid object. Check worker data structure.',
                newCache.locations
              );
            } else if (
              Object.values(newCache.locations).some(
                (loc) => typeof loc !== 'object' || !loc.name
              )
            ) {
              // If it's an object, but not keyed by name properly (e.g. keyed by ID), this won't fix it, but we can warn.
              // This specific block might be overly cautious if the worker guarantees name-keyed objects when not sending arrays.
              console.warn(
                '[StateManagerProxy] newStaticData.locations is an object, but its values may not be location objects with names. Potential issue for snapshot interface.',
                newCache.locations
              );
            }
          }

          this.staticDataCache = newCache;
          //console.log(
          //  '[StateManagerProxy rulesLoadedConfirmation] Updated staticDataCache. Keys in cache:',
          //  Object.keys(this.staticDataCache)
          //);
        } else {
          console.warn(
            '[StateManagerProxy] rulesLoadedConfirmation received, but newStaticData is missing.'
          );
        }

        if (message.initialSnapshot) {
          this.uiCache = message.initialSnapshot;
          console.debug(
            '[stateManagerProxy] Snapshot cached from rulesLoadedConfirmation.'
            // this.uiCache // Avoid logging potentially large snapshot here
          );
        } else {
          console.warn(
            '[stateManagerProxy] rulesLoadedConfirmation received without initial snapshot.'
          );
        }

        // Resolve the initial load promise ONLY IF IT'S THE VERY FIRST LOAD
        if (this.initialLoadResolver) {
          this.initialLoadResolver(true); // Resolves the promise from ensureReady()
          this.initialLoadResolver = null; // Prevent multiple resolves
        }

        // Always publish 'stateManager:rulesLoaded' event
        // This allows tests or other modules to react to rule reloads.
        console.log(
          '[stateManagerProxy] Publishing stateManager:rulesLoaded event.'
        );
        this.eventBus.publish('stateManager:rulesLoaded', {
          snapshot: this.uiCache, // Provide the latest snapshot
          gameId: message.gameId, // Forward gameId from worker confirmation
          playerId: message.playerId, // Forward playerId
          source: 'workerConfirmation', // Indicate source
        });

        // Update static groups cache if provided by worker
        if (message.workerStaticGroups && this.staticDataCache) {
          console.log(
            '[StateManagerProxy] Received workerStaticGroups from rulesLoadedConfirmation, updating staticDataCache.groups:',
            JSON.parse(JSON.stringify(message.workerStaticGroups))
          );
          this.staticDataCache.groups = message.workerStaticGroups;
        }

        this._checkAndPublishReady(); // Ensure this is the correct place relative to logic
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
          queryId: message.queryId, // Forward queryId if the error is related to a query
        });
        // If the error is tied to a specific query, reject that query's promise
        if (message.queryId) {
          const pending = this.pendingQueries.get(message.queryId);
          if (pending) {
            if (pending.timeoutId) clearTimeout(pending.timeoutId);
            pending.reject(
              new Error(
                message.message || 'Worker reported an error for this query.'
              )
            );
            this.pendingQueries.delete(message.queryId);
          }
        }
        break;
      case 'workerError': // This is the new message type from the simplified worker onmessage
        console.error(
          '[StateManagerProxy] General worker error (from new handler):',
          message
        );
        this.eventBus.publish('stateManager:workerError', {
          message: message.errorMessage,
          stack: message.errorStack,
          originalCommand: message.command, // From the worker's new error structure
          queryId: message.queryId,
        });
        if (message.queryId) {
          const pending = this.pendingQueries.get(message.queryId);
          if (pending) {
            if (pending.timeoutId) clearTimeout(pending.timeoutId);
            pending.reject(
              new Error(
                message.errorMessage ||
                  'Worker reported an error processing command.'
              )
            );
            this.pendingQueries.delete(message.queryId);
          }
        }
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
      const errorMsg =
        '[StateManagerProxy] Worker not initialized when calling loadRules.';
      console.error(errorMsg);
      return Promise.reject(new Error(errorMsg)); // Reject if worker isn't up
    }
    if (
      !rulesData ||
      !playerInfo ||
      typeof playerInfo.playerId === 'undefined'
    ) {
      const errorMsg =
        '[StateManagerProxy] Invalid arguments for loadRules. rulesData and playerInfo (with playerId) are required.';
      console.error(errorMsg, {
        rulesDataKeys: Object.keys(rulesData || {}),
        playerInfo,
      });
      return Promise.reject(new Error(errorMsg));
    }

    console.log(
      '[StateManagerProxy loadRules] CALLED. Sending command to worker. PlayerInfo:',
      JSON.parse(JSON.stringify(playerInfo)),
      'Rules data keys:',
      Object.keys(rulesData || {})
    );

    this.sendCommandToWorker({
      command: 'loadRules',
      payload: { rulesData, playerInfo },
    });

    // No promise directly tied to *this specific* loadRules completion is returned here.
    // The pattern is: command -> worker processes -> worker confirms -> proxy publishes event.
    // Tests will `await testController.waitForEvent('stateManager:rulesLoaded')`.
    return Promise.resolve(); // Return a resolved promise to indicate the command was sent.
  }

  /**
   * Waits until the initial rules and snapshot have been loaded from the worker.
   * This is critical for UI components or modules that need static game data or
   * an initial state snapshot before they can render or operate.
   * @param {number} [timeoutMs=15000] - Maximum time to wait.
   * @returns {Promise<boolean>} True if ready, false if timed out.
   */
  async ensureReady(timeoutMs = 15000) {
    // Check if already ready to avoid re-subscribing or re-promising
    if (this._isReadyPublished) {
      this._logDebug('[StateManagerProxy ensureReady] Already ready.');
      return true;
    }

    // If initialLoadPromise is still active, wait for it
    if (this.initialLoadPromise) {
      this._logDebug(
        '[StateManagerProxy ensureReady] Waiting for initialLoadPromise...'
      );
      try {
        const ready = await Promise.race([
          this.initialLoadPromise,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error('Timeout waiting for initial load')),
              timeoutMs
            )
          ),
        ]);
        if (ready) {
          this._logDebug(
            '[StateManagerProxy ensureReady] initialLoadPromise resolved. Ready.'
          );
          return true;
        }
      } catch (error) {
        console.error(
          '[StateManagerProxy ensureReady] Error or Timeout:',
          error.message
        );
        return false;
      }
    }

    // Fallback check if initialLoadPromise was already resolved or nulled out
    // This path might be hit if ensureReady is called *after* initial load but before _isReadyPublished is true
    // which could happen if there's a slight race or multiple calls.
    this._logDebug(
      '[StateManagerProxy ensureReady] initialLoadPromise already handled. Checking current ready status.'
    );
    if (
      this.uiCache &&
      this.staticDataCache &&
      Object.keys(this.staticDataCache).length > 0
    ) {
      if (!this._isReadyPublished) {
        this._logDebug(
          '[StateManagerProxy ensureReady] Conditions met, but _isReadyPublished is false. Calling _checkAndPublishReady.'
        );
        this._checkAndPublishReady(); // Attempt to publish if conditions are met
      }
      return this._isReadyPublished; // Return the current status
    }

    // If still not ready, it means something is off or it's a genuine timeout from a previous state.
    console.warn(
      '[StateManagerProxy ensureReady] Fell through all checks, returning current (likely false) ready state.'
    );
    return false; // Or this._isReadyPublished which would be false
  }

  /**
   * Retrieves the current snapshot from the cache.
   * Returns null if no snapshot is available yet.
   * @returns {object|null} The current game state snapshot.
   */
  getSnapshot() {
    // console.debug('[StateManagerProxy getSnapshot] Retrieving snapshot from cache.');
    return this.uiCache; // uiCache IS the snapshot
  }

  /**
   * @deprecated This method is primarily for the old main-thread processing flow.
   * The worker now sends fully processed static data via 'rulesLoadedConfirmation'.
   * This method might still be used if there's a need to override static data
   * from the main thread post-initialization, but that should be rare.
   */
  setStaticData(
    itemData,
    groupData,
    locationData,
    regionData,
    exitData,
    originalLocationOrder,
    originalExitOrder,
    originalRegionOrder
  ) {
    console.warn(
      '[StateManagerProxy setStaticData] DEPRECATED: This method should generally not be used. Static data comes from worker.'
    );

    // For safety, ensure this.staticDataCache is initialized if it's null
    if (!this.staticDataCache) {
      this.staticDataCache = {};
    }

    // Update the cache directly. This is simpler than the worker's more complex
    // object construction, as this data is assumed to be already in the correct format.
    this.staticDataCache.items = itemData;
    this.staticDataCache.groups = groupData; // Assume it's an object {id: group} or array [group] as needed by consumers
    this.staticDataCache.locations = locationData; // Assumed to be an object {name: loc}
    this.staticDataCache.regions = regionData; // Assumed to be an object {name: region}
    this.staticDataCache.exits = exitData; // Assumed to be an object {name: exit}

    this.staticDataCache.originalLocationOrder = originalLocationOrder;
    this.staticDataCache.originalExitOrder = originalExitOrder;
    this.staticDataCache.originalRegionOrder = originalRegionOrder;

    this.staticDataIsSet = true; // Mark static data as set
    console.log(
      '[StateManagerProxy setStaticData (DEPRECATED)] Static data cache updated on main thread proxy.'
    );
    this._checkAndPublishReady();
  }

  /**
   * Retrieves the entire static data cache.
   * UI components should use this to get definitions for items, locations, etc.
   * @returns {object|null} The cached static game data.
   */
  getStaticData() {
    // console.log('[StateManagerProxy getStaticData] Called. Cache:', this.staticDataCache);
    return this.staticDataCache;
  }

  /**
   * Signals the worker to begin a batch update.
   * @param {boolean} [deferRegionComputation=true] - Whether to defer region computation in the worker until commit.
   * @returns {Promise<void>} A promise that resolves when the command has been sent.
   */
  async beginBatchUpdate(deferRegionComputation = true) {
    // Send command without expecting a direct response for this action.
    // The worker will change its internal state.
    this._sendCommand(
      StateManagerProxy.COMMANDS.BEGIN_BATCH_UPDATE,
      { deferRegionComputation },
      false
    );
    return Promise.resolve(); // Command sent
  }

  /**
   * Signals the worker to commit the current batch update.
   * @returns {Promise<void>} A promise that resolves when the command has been sent.
   */
  async commitBatchUpdate() {
    // Send command without expecting a direct response for this action.
    // The worker will process the batch and send a snapshot update if necessary.
    this._sendCommand(
      StateManagerProxy.COMMANDS.COMMIT_BATCH_UPDATE,
      null,
      false
    );
    return Promise.resolve(); // Command sent
  }

  // --- Start of specific static data getters ---
  /**
   * @returns {string[]|null} Array of location names in their original order.
   */
  getOriginalLocationOrder() {
    return this.staticDataCache
      ? this.staticDataCache.originalLocationOrder
      : null;
  }
  /**
   * @returns {string[]|null} Array of exit names in their original order.
   */
  getOriginalExitOrder() {
    return this.staticDataCache ? this.staticDataCache.originalExitOrder : null;
  }
  /**
   * @returns {string[]|null} Array of region names in their original order.
   */
  getOriginalRegionOrder() {
    return this.staticDataCache
      ? this.staticDataCache.originalRegionOrder
      : null;
  }
  // --- End of specific static data getters ---

  async addItemToInventory(item, quantity = 1) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.ADD_ITEM,
      { item, quantity },
      true
    );
  }

  async removeItemFromInventory(item, quantity = 1) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.REMOVE_ITEM,
      { item, quantity },
      true
    );
  }

  async checkLocation(locationName) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.CHECK_LOCATION,
      { locationName },
      true
    );
  }

  async uncheckLocation(locationName) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.UNCHECK_LOCATION,
      { locationName },
      true
    );
  }

  /**
   * Synchronizes the worker's checked locations with a list from the server (e.g., AP server).
   * @param {string[]} checkedLocationIds - An array of location IDs that are confirmed checked.
   * @returns {Promise<object>} A promise that resolves with the result from the worker.
   */
  async syncCheckedLocationsFromServer(checkedLocationIds) {
    this._logDebug(
      '[StateManagerProxy] Syncing checked locations from server:',
      checkedLocationIds
    );
    return this._sendCommand(
      'syncCheckedLocationsFromServer', // Command name matches worker
      { checkedLocationIds },
      true // Expect a response (e.g., updated snapshot or confirmation)
    );
  }

  /**
   * Toggles whether the worker should queue and report state changes.
   * @param {boolean} enabled - True to enable queueing, false to disable.
   * @returns {Promise<object>} Confirmation from the worker.
   */
  async toggleQueueReporting(enabled) {
    this._logDebug(
      `[StateManagerProxy] Setting worker queue reporting to: ${enabled}`
    );
    return this._sendCommand(
      'toggleQueueReporting',
      { enabled },
      true // Expect confirmation
    );
  }

  /**
   * Requests a full snapshot of the current game state from the worker.
   * @returns {Promise<object>} A promise that resolves with the game state snapshot.
   */
  async getFullSnapshot() {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.GET_SNAPSHOT,
      null,
      true
    );
  }

  /**
   * Gets the status of the worker's internal processing queue.
   * @returns {Promise<object>} A promise that resolves with the queue status.
   */
  async getWorkerQueueStatus() {
    return this._sendCommand('getQueueStatus', null, true);
  }

  // Public method to get the latest snapshot directly from the cache
  // This is synchronous and used by UI components that need immediate access
  // and have already waited for `ensureReady` or subscribed to snapshot updates.
  getLatestStateSnapshot() {
    if (!this.uiCache) {
      // console.warn('[StateManagerProxy getLatestStateSnapshot] No snapshot in cache. Ensure rules/state are loaded.');
    }
    return this.uiCache;
  }

  terminateWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      console.log('[StateManagerProxy] Worker terminated.');
    }
  }

  _checkAndPublishReady() {
    const status = {
      uiCacheNotNull: !!this.uiCache,
      staticDataIsSet:
        !!this.staticDataCache && Object.keys(this.staticDataCache).length > 0,
      isReadyPublished: this.isReadyPublished, // Renamed from this._isReadyPublished for consistency
    };
    // Use console.log for this critical path
    console.log(
      '[StateManagerProxy _checkAndPublishReady] Status check:',
      status
    );

    if (
      status.uiCacheNotNull &&
      status.staticDataIsSet &&
      !status.isReadyPublished // Use the consistent local variable
    ) {
      this.isReadyPublished = true; // Set the instance member
      // Use console.log for this critical path
      console.log('[StateManagerProxy] Publishing stateManager:ready event.');
      this.eventBus.publish('stateManager:ready', {
        // Directly use event name string
        gameId: this.config ? this.config.gameId : null,
        playerId: this.config ? this.config.playerId : null,
      });
    }
  }

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
    const message = { command, payload };
    // queryId is not relevant for this version of _sendCommand, it's for sendQueryToWorker

    console.log(
      '[StateManagerProxy _sendCommand] Sending to worker:',
      JSON.parse(JSON.stringify(message))
    );

    if (!this.worker) {
      console.error(
        '[stateManagerProxy] Worker not available for _sendCommand.'
      );
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

  initialize(initialConfig = {}) {
    console.log(
      '[StateManagerProxy] initialize method ENTERED. Config received:',
      JSON.parse(JSON.stringify(initialConfig))
    );
    // Store the initial configuration for the worker
    // initialConfig might contain rulesConfig (as data), gameId, etc.
    this.initialConfig = {
      rulesData: initialConfig.rulesConfig, // Expects rulesConfig to be the actual rules JSON object
      playerId: initialConfig.playerId || '1', // ADDED: Store and use playerId from initialConfig
      rulesUrl: null, // Explicitly null if rulesData is provided; worker will prioritize rulesData
      eventsConfig: initialConfig.eventsConfig, // Pass through if provided
      settings: initialConfig.settings, // Pass through if provided
      // Add any other config that needs to be relayed from the main thread init to the worker
    };

    console.log(
      '[StateManagerProxy] Preparing to send initialize command to worker. Config snapshot:',
      // Be cautious with logging very large objects directly
      {
        playerId: this.initialConfig.playerId,
        rulesDataKeys: this.initialConfig.rulesData
          ? Object.keys(this.initialConfig.rulesData)
          : null,
        rulesUrl: this.initialConfig.rulesUrl,
        eventsConfigExists: !!this.initialConfig.eventsConfig,
        settingsExists: !!this.initialConfig.settings,
      }
    );

    const messageToSend = {
      command: 'initialize',
      config: {
        rulesData: this.initialConfig.rulesData, // Pass the direct rules data
        playerId: this.initialConfig.playerId, // ADDED: Pass playerId to worker config
        rulesUrl: this.initialConfig.rulesUrl, // Pass URL (will be null if rulesData is present)
        eventsConfig: this.initialConfig.eventsConfig,
        settings: this.initialConfig.settings,
        // workerPath: this.workerPath, // Not needed by worker itself for init
      },
    };

    try {
      console.log(
        '[StateManagerProxy] Attempting this.worker.postMessage with initialize command.'
      );
      this.worker.postMessage(messageToSend);
      console.log(
        '[StateManagerProxy] this.worker.postMessage for initialize command completed without immediate error.'
      );
    } catch (error) {
      console.error(
        '[StateManagerProxy] CRITICAL: Error synchronously thrown by this.worker.postMessage for initialize command:',
        error,
        messageToSend
      );
      // Log the stringified version if the direct log fails due to circular refs in error or message
      try {
        console.error(
          '[StateManagerProxy] CRITICAL (stringified): Error:',
          JSON.stringify(error),
          'Message:',
          JSON.stringify(messageToSend)
        );
      } catch (stringifyError) {
        console.error(
          '[StateManagerProxy] CRITICAL: Could not even stringify the error/message for logging.',
          stringifyError
        );
      }
      // Potentially rethrow or publish a critical error event
      this.eventBus.publish('stateManager:error', {
        message:
          'Critical error posting initialize message to worker: ' +
          error.message,
        isCritical: true,
      });
    }
  }

  async _loadStaticDataAndEmitReady() {
    // ... existing code ...
  }

  // --- New methods for JSON Module data handling ---
  getSavableStateData() {
    console.log('[StateManagerProxy] getSavableStateData called.');
    if (!this.uiDataCache) {
      console.warn(
        '[StateManagerProxy] No uiDataCache available when getting savable state. Returning empty structure.'
      );
      return {
        inventory: {},
        checkedLocations: [],
        // Add other minimal runtime state defaults if needed
      };
    }

    // Assuming uiDataCache contains the full snapshot structure
    const savableData = {
      inventory: this.uiDataCache.inventory || {},
      checkedLocations: this.uiDataCache.checkedLocations || [],
      // Potentially other things if they are not part of rules or settings and can change runtime
      // e.g., game-specific flags if they are stored in the snapshot and can be modified by user/events
      // Example: if (this.uiDataCache.gameSpecificFlags) savableData.gameSpecificFlags = this.uiDataCache.gameSpecificFlags;
    };

    console.log(
      '[StateManagerProxy] Extracted savable state data:',
      savableData
    );
    return savableData;
  }

  applyRuntimeStateData(loadedData) {
    console.log(
      '[StateManagerProxy] applyRuntimeStateData called with:',
      loadedData
    );
    if (!loadedData || typeof loadedData !== 'object') {
      console.error(
        '[StateManagerProxy] Invalid data passed to applyRuntimeStateData.',
        loadedData
      );
      return;
    }

    this._sendCommand(
      StateManagerProxy.COMMANDS.APPLY_RUNTIME_STATE,
      loadedData
    );
    console.log(
      '[StateManagerProxy] Sent APPLY_RUNTIME_STATE command to worker.'
    );
  }
  // --- End new methods ---

  // Method to get game-specific helper functions instance
  // ... existing code ...

  // --- ADDED: _logDebug method ---
  _logDebug(message, data = null) {
    if (this.debugMode) {
      if (data) {
        try {
          // Attempt to clone data to avoid issues with logging complex objects directly
          const clonedData = JSON.parse(JSON.stringify(data));
          console.debug(message, clonedData);
        } catch (e) {
          console.debug(message, '[Could not clone data for _logDebug]', data);
        }
      } else {
        console.debug(message);
      }
    }
  }
  // --- END ADDED ---
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
  let snapshotHelpersInstance = null; // Changed variable name for clarity
  const gameId = snapshot?.game; // Get gameId from the snapshot

  // First, define the core methods of the snapshot interface that helpers will need.
  // This rawInterface is what ALTTPSnapshotHelpers constructor will receive.
  const rawInterfaceForHelpers = {
    _isSnapshotInterface: true, // Ensures evaluateRule recognizes this context when called BY helpers
    snapshot: snapshot,
    staticData: staticData,
    resolveName: (name) => {
      switch (name) {
        case 'True':
          return true;
        case 'False':
          return false;
        case 'None':
          return null;
        case 'inventory':
          return snapshot?.inventory;
        case 'settings':
          return snapshot?.settings;
        case 'flags':
          return snapshot?.flags; // Checked locations etc.
        case 'state':
          return snapshot?.state; // Game-specific state object
        case 'regions':
          return staticData?.regions;
        case 'locations':
          return staticData?.locations;
        case 'items':
          return staticData?.items;
        case 'groups':
          return staticData?.groups;
        // Add other common top-level names if needed by rules
        default:
          // console.warn(`[SnapshotInterface resolveName] Unhandled name: ${name}`);
          return undefined;
      }
    },
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
      const status = snapshot?.reachability?.[regionName];
      if (status === 'reachable' || status === 'checked') return true;
      if (status === 'unreachable') return false;
      return undefined;
    },
    isLocationAccessible: function (locationOrName) {
      // Use function keyword for 'this' if needed, or ensure 'this' refers to rawInterfaceForHelpers correctly
      // Essential checks for data presence
      if (!this.staticData || !this.staticData.locations) {
        // Changed from staticData.locationData to staticData.locations to match LocationUI
        console.warn(
          '[SnapshotInterface] isLocationAccessible: Missing staticData.locations'
        );
        return undefined;
      }
      if (!this.snapshot) {
        console.warn(
          '[SnapshotInterface] isLocationAccessible: Missing snapshot data'
        );
        return undefined;
      }

      let locationName =
        typeof locationOrName === 'string'
          ? locationOrName
          : locationOrName?.name;

      if (!locationName) {
        console.warn(
          '[SnapshotInterface] isLocationAccessible: Invalid locationOrName provided.',
          locationOrName
        );
        return undefined;
      }

      const locData = this.staticData.locations[locationName]; // locData contains the location's properties, including its access_rule
      if (!locData) {
        console.warn(
          `[SnapshotInterface] isLocationAccessible: Location static data not found for '${locationName}'`
        );
        return undefined;
      }

      const regionName = locData.parent_region || locData.region; // Match LocationUI logic for finding region
      if (!regionName) {
        console.warn(
          `[SnapshotInterface] isLocationAccessible: Region not defined for location '${locationName}'`
        );
        return undefined;
      }

      // Step 1: Check parent region reachability using this.isRegionReachable
      const parentRegionIsReachable = this.isRegionReachable(regionName);

      const logData = {
        locationName,
        regionName,
        parentRegionIsReachable,
        accessRule: locData.access_rule
          ? JSON.parse(JSON.stringify(locData.access_rule))
          : null,
        locationRuleResult: null,
        finalOutcome: null,
      };

      if (parentRegionIsReachable === undefined) {
        logData.finalOutcome = undefined;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData); // Keep logging minimal for now
        return undefined;
      }
      if (parentRegionIsReachable === false) {
        logData.finalOutcome = false;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData); // Keep logging minimal for now
        return false;
      }

      if (!locData.access_rule) {
        logData.finalOutcome = true;
        // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData); // Keep logging minimal for now
        return true;
      }

      // Evaluate the location's access_rule using 'this' (the interface) as context.
      const locationRuleResult = evaluateRule(
        locData.access_rule,
        this // 'this' is rawInterfaceForHelpers (which becomes snapshotInterfaceInstance)
      );
      logData.locationRuleResult = locationRuleResult;
      logData.finalOutcome = locationRuleResult;
      // console.log("[SnapshotIF isLocationAccessible DEBUG]", logData); // Keep logging minimal for now
      return locationRuleResult;
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
  // Conditionally instantiate helpers based on gameId
  if (gameId === 'A Link to the Past') {
    snapshotHelpersInstance = new ALTTPSnapshotHelpers(rawInterfaceForHelpers);
  } else if (gameId === 'Adventure') {
    snapshotHelpersInstance = new GameSnapshotHelpers(rawInterfaceForHelpers); // Use GameSnapshotHelpers for Adventure
  } else {
    // Fallback for other/unknown games
    console.warn(
      `[createStateSnapshotInterface] Unknown gameId '${gameId}'. Falling back to GameSnapshotHelpers.`
    );
    snapshotHelpersInstance = new GameSnapshotHelpers(rawInterfaceForHelpers);
  }

  // Now construct the final snapshotInterfaceInstance that UI will use,
  // which includes an executeHelper method that uses the snapshotHelpersInstance.
  const finalSnapshotInterface = {
    _isSnapshotInterface: true,
    // Core data access
    inventory: snapshot.inventory || {},
    events: snapshot.events || {},
    // Renamed for clarity
    ...rawInterfaceForHelpers, // Spread the core methods (now including isLocationAccessible)

    // Expose the created helper instance directly if needed by some advanced rule structures
    helpers: snapshotHelpersInstance, // Use the conditionally created instance

    executeHelper: (name, ...args) => {
      if (
        snapshotHelpersInstance &&
        typeof snapshotHelpersInstance.executeHelper === 'function'
      ) {
        // snapshotHelpersInstance.executeHelper will call the actual helper method (this[name])
        return snapshotHelpersInstance.executeHelper(name, ...args);
      }
      console.warn(
        `[SnapshotIF executeHelper] Helper dispatcher not available or method ${name} not found on instance.`
      );
      return undefined;
    },

    // Add the evaluateRule method to the interface
    evaluateRule: (rule, contextName = null) => {
      // 'this' inside this method will be finalSnapshotInterface
      // The imported evaluateRule expects (rule, evaluationContext)
      // where evaluationContext is an object with methods like hasItem, executeHelper, etc.
      return evaluateRule(rule, this, contextName); // Pass 'this' (the interface itself) as the context
    },

    resolveRuleObject: (ruleObjectPath) => {
      if (ruleObjectPath && ruleObjectPath.type === 'name') {
        const name = ruleObjectPath.name;
        if (name === 'helpers') return snapshotHelpersInstance; // Use the conditionally created instance
        if (name === 'state' || name === 'settings' || name === 'inventory') {
          return finalSnapshotInterface; // Use the final interface
        }
        if (name === 'player') {
          const slotValue = snapshot?.player?.slot;
          return slotValue;
        }
        if (
          snapshotHelpersInstance &&
          snapshotHelpersInstance.entities &&
          snapshotHelpersInstance.entities[name]
        ) {
          return snapshotHelpersInstance.entities[name];
        }
      }
      return finalSnapshotInterface;
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
                typeof finalSnapshotInterface.isRegionReachable === 'function'
              ) {
                return finalSnapshotInterface.isRegionReachable(name);
              }
            } else if (type === 'Location') {
              if (
                typeof finalSnapshotInterface.isLocationAccessible ===
                'function'
              ) {
                return finalSnapshotInterface.isLocationAccessible(name);
              }
            }
            console.warn(
              `[SnapshotIF executeStateManagerMethod] 'can_reach' for type '${type}' could not be resolved to a snapshot method.`
            );
            return undefined;
          } else if (args.length === 1 && typeof args[0] === 'string') {
            // Simplified case: if only one string arg, assume it's a region name
            if (
              typeof finalSnapshotInterface.isRegionReachable === 'function'
            ) {
              return finalSnapshotInterface.isRegionReachable(args[0]);
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
          // Ensure executeHelper exists before calling
          if (
            snapshotHelpersInstance &&
            typeof snapshotHelpersInstance.executeHelper === 'function'
          ) {
            return snapshotHelpersInstance.executeHelper(
              '_has_specific_key_count',
              ...args
            );
          }
          console.warn(
            '[SnapshotIF executeStateManagerMethod] Could not delegate _lttp_has_key: helpers or executeHelper missing.'
          );
          return undefined;
        case 'has_any':
          // Ensure executeHelper exists before calling
          if (
            snapshotHelpersInstance &&
            typeof snapshotHelpersInstance.executeHelper === 'function'
          ) {
            return snapshotHelpersInstance.executeHelper('has_any', ...args);
          }
          console.warn(
            '[SnapshotIF executeStateManagerMethod] Could not delegate has_any: helpers or executeHelper missing.'
          );
          return undefined;
        // Add other state methods that need specific handling or delegation here
        default:
          console.warn(
            `[SnapshotIF executeStateManagerMethod] Unknown method '${methodName}' called.`
          );
          return undefined;
      }
    },
    // --- ADDED: Add resolveName to the final interface too ---
    resolveName: rawInterfaceForHelpers.resolveName,
    // --- END ADDED ---
  };
  return finalSnapshotInterface; // Return the final interface
}
// --- END ADDED FUNCTION ---

export default StateManagerProxy;

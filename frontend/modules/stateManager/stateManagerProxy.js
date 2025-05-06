console.log('[stateManagerProxy] Module loaded');

// TODO: Import eventBus

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
      console.warn(
        '[StateManagerProxy] Attempted to get static data before it was set.'
      );
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
    this.isPotentialStaleSnapshot = true; // <<< ADDED: Set flag
    return this.sendCommandToWorker('checkLocation', { locationName }); // <<< FIX: Pass command and payload
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

export default StateManagerProxy;

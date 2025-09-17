// Use logger if available, fallback to console.log
// Check if we're in a worker context (no window object)
const isWorkerContext = typeof window === 'undefined';
if (!isWorkerContext && window.logger) {
  window.logger.info('stateManagerProxy', 'Module loaded');
} else {
  log('info', '[stateManagerProxy] Module loaded');
}

// TODO: Import eventBus

// Legacy imports removed - now using agnostic helpers
import { evaluateRule } from '../shared/ruleEngine.js';
// Legacy GameSnapshotHelpers import removed - using agnostic helpers directly
import { STATE_MANAGER_COMMANDS } from './stateManagerCommands.js'; // Import shared commands
import { helperFunctions as alttpLogic } from '../shared/gameLogic/alttp/alttpLogic.js';
import { helperFunctions as genericLogic } from '../shared/gameLogic/generic/genericLogic.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('stateManagerProxy', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[stateManagerProxy] ${message}`, ...data);
    }
  }
}

export class StateManagerProxy {
  static COMMANDS = STATE_MANAGER_COMMANDS;

  constructor(eventBusInstance) {
    log('info', '[stateManagerProxy] Initializing Proxy...');
    if (!eventBusInstance) {
      throw new Error('StateManagerProxy requires an eventBus instance.');
    }
    this.worker = null;
    this.eventBus = eventBusInstance;
    this.uiCache = null; // Initialize cache to null, indicating not yet loaded
    this.staticDataCache = {}; // Initialize staticDataCache to an empty object
    this.nextQueryId = 1;
    this.pendingQueries = new Map(); // Map<queryId, { resolve, reject, timeoutId? }>
    this.initialLoadPromise = null;
    this.initialLoadResolver = null;
    this.staticDataIsSet = false; // Flag for static data readiness
    this.isReadyPublished = false; // Flag to prevent multiple ready events
    this.isPotentialStaleSnapshot = false; // <<< ADDED: Staleness flag
    this.debugMode = false; // Initialize debugMode
    this.gameNameFromWorker = null; // ADDED: To store game_name from worker confirmation
    this.currentRulesSource = null; // ADDED: To store the source name of the current rules
    this.messageCounter = 0; // DEPRECATED or RENAMED? Let's ensure nextMessageId is primary.
    this.nextMessageId = 0; // MODIFIED: Initialize nextMessageId
    this.config = null; // To store initial config like playerId
    
    // Track worker initialization state
    this.workerInitialized = false;
    this.pendingGameStateData = null; // Queue Game State data for after initialization

    this._setupInitialLoadPromise();
    this.initializeWorker();
    log(
      'info',
      '[StateManagerProxy Constructor] this._sendCommand type:',
      typeof this._sendCommand
    );
  }

  /**
   * Update the worker's logging configuration
   * Call this when the main thread logging settings change
   * @param {Object} newLoggingConfig - New logging configuration from main thread
   */
  updateWorkerLoggingConfig(newLoggingConfig) {
    if (!this.worker) {
      log('warn', '[StateManagerProxy] Cannot update worker logging config - worker not initialized');
      return;
    }
    
    // Define all worker-related logging categories that should be passed through
    const workerCategories = [
      // Core worker modules
      'stateManagerWorker',
      'StateManager', 
      'stateManager',
      'ruleEngine',
      'stateManagerHelpers',
      
      // Game-specific modules
      'gameInventory',
      'alttpHelpers',
      'ALTTPState',
      
      // Game logic modules
      'alttpLogic',
      'genericLogic',
      
      // Additional worker categories that might be added in the future
      'inventoryManager',
      'progressiveItems',
      'gameState',
      'helperFunctions',
    ];
    
    // Build category levels object by copying from new config
    const workerCategoryLevels = {};
    workerCategories.forEach(category => {
      workerCategoryLevels[category] = 
        newLoggingConfig.categoryLevels?.[category] ||
        newLoggingConfig.defaultLevel;
    });
    
    const workerLoggingConfig = {
      defaultLevel: newLoggingConfig.defaultLevel,
      categoryLevels: workerCategoryLevels,
      filters: newLoggingConfig.filters,
      showTimestamp: newLoggingConfig.showTimestamp,
      showCategoryName: newLoggingConfig.showCategoryName,
      enabled: newLoggingConfig.enabled,
      temporaryOverride: newLoggingConfig.temporaryOverride,
    };
    
    // Send the update to the worker
    try {
      this.worker.postMessage({
        command: 'updateLogConfig',
        payload: workerLoggingConfig,
      });
      log('info', '[StateManagerProxy] Worker logging configuration updated');
    } catch (error) {
      log('error', '[StateManagerProxy] Failed to update worker logging config:', error);
    }
  }

  getGameName() {
    // Primary source: game_name from static data
    if (this.staticDataCache && this.staticDataCache.game_name) {
      return this.staticDataCache.game_name;
    }
    // Fallback to UI cache game field
    if (this.uiCache && this.uiCache.game) {
      return this.uiCache.game;
    }
    // Use game_name received directly from worker during rules load confirmation
    if (this.gameNameFromWorker) {
      return this.gameNameFromWorker;
    }
    log(
      'warn',
      '[StateManagerProxy getGameName] Game name not found. Sources checked: staticDataCache.game_name, uiCache.game, gameNameFromWorker. staticDataCache available:',
      !!this.staticDataCache,
      'gameNameFromWorker:',
      this.gameNameFromWorker
    );
    return null;
  }

  _setupInitialLoadPromise() {
    // Promise to track the initial rules loading confirmation
    this.initialLoadPromise = new Promise((resolve) => {
      this.initialLoadResolver = resolve;
    });
  }

  initializeWorker() {
    log('info', '[stateManagerProxy] Creating Worker...');
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
        log('error', '[stateManagerProxy] Worker error:', error);
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
        }, 'stateManager');
        // Consider attempting to restart the worker or entering a failed state
      };
    } catch (e) {
      log('error', '[stateManagerProxy] Failed to initialize worker:', e);
      this.eventBus.publish('stateManager:error', {
        message: 'Failed to initialize StateManager worker.',
        isCritical: true,
      }, 'stateManager');
      // Prevent further interaction
      this.worker = null;
    }
  }

  handleWorkerMessage(message) {
    if (!message || !message.type) {
      log(
        'warn',
        '[stateManagerProxy] Received invalid message from worker:',
        message
      );
      return;
    }

    // ADDED: Detailed log for all incoming messages from worker
    // log('info',
    //   '[StateManagerProxy] DETAILED << WORKER:',
    //   JSON.parse(JSON.stringify(message))
    // );

    switch (message.type) {
      case 'queryResponse':
        this._handleQueryResponse(message);
        break;
      case 'pingResponse': // New case for pingResponse
        this._handlePingResponse(message);
        break;
      case 'workerInitializedConfirmation': // ADDED: Handle worker initialization confirmation
        log(
          'info',
          '[StateManagerProxy] Worker initialized confirmation received:',
          JSON.parse(JSON.stringify(message.configEcho || {}))
        );
        
        // Mark worker as initialized
        this.workerInitialized = true;
        
        // Apply any pending Game State data that was queued during early loading
        if (this.pendingGameStateData) {
          log('info', '[StateManagerProxy] Applying pending Game State data after worker initialization');
          try {
            this._sendCommand(
              StateManagerProxy.COMMANDS.APPLY_RUNTIME_STATE,
              this.pendingGameStateData
            );
            this.pendingGameStateData = null; // Clear the pending data
          } catch (error) {
            log('error', '[StateManagerProxy] Failed to apply pending Game State data:', error);
          }
        }
        
        // Worker is up, but we still wait for rules to be loaded for the main "ready" state.
        // This event could be used for finer-grained readiness if needed in the future.
        break;
      case 'rulesLoadedConfirmation': {
        log(
          'info',
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
                log(
                  'warn',
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
                log(
                  'warn',
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
              log(
                'warn',
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
              log(
                'warn',
                '[StateManagerProxy] newStaticData.locations is an object, but its values may not be location objects with names. Potential issue for snapshot interface.',
                newCache.locations
              );
            }
          }

          this.staticDataCache = newCache;
          //log('info',
          //  '[StateManagerProxy rulesLoadedConfirmation] Updated staticDataCache. Keys in cache:',
          //  Object.keys(this.staticDataCache)
          //);
        } else {
          log(
            'warn',
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
          log(
            'warn',
            '[stateManagerProxy] rulesLoadedConfirmation received without initial snapshot.'
          );
        }

        // Store game_name from the confirmation message
        this.gameNameFromWorker = message.gameName;

        // Resolve the initial load promise ONLY IF IT'S THE VERY FIRST LOAD
        if (this.initialLoadResolver) {
          this.initialLoadResolver(true); // Resolves the promise from ensureReady()
          this.initialLoadResolver = null; // Prevent multiple resolves
        }

        // Always publish 'stateManager:rulesLoaded' event
        // This allows tests or other modules to react to rule reloads.
        log(
          'info',
          '[stateManagerProxy] Publishing stateManager:rulesLoaded event.'
        );
        this.eventBus.publish('stateManager:rulesLoaded', {
          snapshot: this.uiCache, // Provide the latest snapshot
          gameName: this.gameNameFromWorker, // Forward game name from worker confirmation
          playerId: message.playerId, // Forward playerId
          source: this.currentRulesSource, // MODIFIED: Use the stored source
        }, 'stateManager');

        // Update static groups cache if provided by worker
        if (message.workerStaticGroups && this.staticDataCache) {
          log(
            'info',
            '[StateManagerProxy] Received workerStaticGroups from rulesLoadedConfirmation, updating staticDataCache.groups:',
            JSON.parse(JSON.stringify(message.workerStaticGroups))
          );
          this.staticDataCache.groups = message.workerStaticGroups;
        }

        this._checkAndPublishReady(); // Ensure this is the correct place relative to logic
        break;
      }
      case 'stateSnapshot':
        if (message.snapshot) {
          this.uiCache = message.snapshot;
          this.isPotentialStaleSnapshot = false; // <<< ADDED: Reset flag on snapshot arrival
          // Publish a generic event indicating the cache is updated
          this.eventBus.publish('stateManager:snapshotUpdated', {
            snapshot: this.uiCache,
          }, 'stateManager');
        } else {
          log(
            'warn',
            '[stateManagerProxy] Received stateSnapshot message without snapshot data.'
          );
        }
        break;
      case 'progress':
        // console.debug('[stateManagerProxy] Progress update received:', message.detail); // Debug level
        this.eventBus.publish(
          'stateManager:computationProgress',
          message.detail
        , 'stateManager');
        break;
      case 'event': // For granular events forwarded from worker
        log(
          'info',
          `[stateManagerProxy] Forwarding worker event: ${message.name}`
        );
        this.eventBus.publish(`stateManager:${message.name}`, message.payload, 'stateManager');
        break;
      case 'workerQueueStatus':
        this.eventBus.publish('stateManager:workerQueueStatus', {
          queueSummary: message.queueSummary,
        }, 'stateManager');
        break;
      case 'error': // Errors reported by the worker during processing
        log('error', '[stateManagerProxy] Error reported by worker:', message);
        this.eventBus.publish('stateManager:workerError', {
          message: message.message,
          stack: message.stack,
          originalCommand: message.originalCommand,
          queryId: message.queryId, // Forward queryId if the error is related to a query
        }, 'stateManager');
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
        log(
          'error',
          '[StateManagerProxy] General worker error (from new handler):',
          message
        );
        this.eventBus.publish('stateManager:workerError', {
          message: message.errorMessage,
          stack: message.errorStack,
          originalCommand: message.command, // From the worker's new error structure
          queryId: message.queryId,
        }, 'stateManager');
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
      case 'computationProgress':
        this.eventBus.publish(
          'stateManager:computationProgress',
          message.detail
        , 'stateManager');
        break;
      case 'eventPublish': // New case for event republishing from worker
        this._handleEventPublish(message);
        break;
      default:
        log(
          'warn',
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
        log('error', `[stateManagerProxy] Query ${queryId} failed:`, error);
        pending.reject(new Error(error));
      } else {
        // console.debug(`[stateManagerProxy] Query ${queryId} succeeded.`); // Debug level
        pending.resolve(result);
      }
      this.pendingQueries.delete(queryId);
    } else {
      log(
        'warn',
        `[stateManagerProxy] Received response for unknown queryId: ${queryId}`
      );
    }
  }

  _handlePingResponse(message) {
    if (message.queryId) {
      const pending = this.pendingQueries.get(message.queryId);
      if (pending) {
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        pending.resolve(message.payload); // Resolve with the echoed payload
        this.pendingQueries.delete(message.queryId);
        this._logDebug(
          '[StateManagerProxy] Ping response processed for queryId:',
          message.queryId
        );
      } else {
        log(
          'warn',
          '[StateManagerProxy] Received pingResponse for unknown queryId:',
          message.queryId
        );
      }
    } else {
      // Handle non-query pings if any (currently not used by pingWorker)
      this._logDebug(
        '[StateManagerProxy] Received non-query pingResponse:',
        message.payload
      );
      // Potentially publish an event if generic pongs are useful
      // this.eventBus.publish('stateManager:pongReceived', { payload: message.payload }, 'stateManager');
    }
  }

  _handleEventPublish(message) {
    try {
      // Republish the event from the worker on the main thread's eventBus
      this.eventBus.publish(`stateManager:${message.eventType}`, message.eventData, 'stateManager');
      this._logDebug(
        `[StateManagerProxy] Republished worker event: ${message.eventType}`,
        message.eventData
      );
    } catch (error) {
      log(
        'error',
        `[StateManagerProxy] Error republishing worker event ${message.eventType}:`,
        error
      );
    }
  }

  // --- Internal Helper Methods ---

  sendCommandToWorker(message) {
    if (!this.worker) {
      log('error', '[stateManagerProxy] Worker not available.');
      // Optionally throw an error or handle gracefully
      return;
    }
    try {
      this.worker.postMessage(message);
    } catch (error) {
      log(
        'error',
        '[stateManagerProxy] Error sending command to worker:',
        error,
        message
      );
      // Handle serialization errors, etc.
      this.eventBus.publish('stateManager:error', {
        message: 'Error communicating with StateManager worker.',
        isCritical: true,
      }, 'stateManager');
    }
  }

  sendQueryToWorker(message, timeoutMs = 10000) {
    if (!this.worker) {
      const errorMessage =
        '[StateManagerProxy] Worker not initialized. Cannot send query.';
      log('error', errorMessage, {
        command: message.command,
        payload: message.payload,
      });
      this.eventBus.publish('stateManager:proxyError', {
        message: errorMessage,
        details: { command: message.command, payload: message.payload },
      }, 'stateManager');
      return Promise.reject(new Error(errorMessage));
    }

    return new Promise((resolve, reject) => {
      const message_id = this.messageCounter++;
      // MODIFIED: Direct call to imported function
      if (typeof logWorkerCommunication === 'function') {
        // Check if the imported function exists
        logWorkerCommunication(
          'send-query',
          message_id,
          message.command,
          message.payload
        );
      }

      const queryId = this.nextQueryId++;
      let timeoutId = null;

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          if (this.pendingQueries.has(queryId)) {
            log(
              'error',
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
        log(
          'error',
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
        }, 'stateManager');
      }
    });
  }

  // --- Public API Methods ---

  /**
   * Sends the initial rules and player info to the worker.
   * Returns a promise that resolves when the worker confirms loading is complete.
   */
  async loadRules(rulesData, playerInfo, sourceFileName = 'unknown') {
    if (!this.worker) {
      log(
        'error',
        '[StateManagerProxy] Worker not available. Cannot load rules.'
      );
      return; // Or throw an error
    }
    if (!rulesData) {
      log('error', '[StateManagerProxy] No rulesData provided to loadRules.');
      return; // Or throw
    }
    if (!playerInfo || !playerInfo.playerId) {
      log(
        'error',
        '[StateManagerProxy] Invalid playerInfo (missing playerId) for loadRules.'
      );
      return; // Or throw
    }

    this.currentRulesSource = sourceFileName; // Store the source name
    log(
      'info',
      `[StateManagerProxy loadRules] Stored currentRulesSource: ${this.currentRulesSource}`
    );

    // Ensure the initial load promise is reset if we are loading new rules after the first time.
    // This allows ensureReady to correctly wait for the new rules to be processed.
    if (this.staticDataIsSet) {
      // If static data was already set, this is a reload.
      log(
        'info',
        '[StateManagerProxy loadRules] Rules are being reloaded. Resetting initialLoadPromise.'
      );
      this._setupInitialLoadPromise(); // Reset the promise for this new load sequence
      this.staticDataIsSet = false; // Mark static data as not set until new confirmation
      this.isReadyPublished = false; // Allow ready event to be published again
    }

    log('info', '[StateManagerProxy] Sending loadRules command to worker...');
    // Send the rules data and player info to the worker
    await this._sendCommand(StateManagerProxy.COMMANDS.LOAD_RULES, {
      rulesData,
      playerInfo: {
        // Ensure playerInfo is structured as expected by the worker
        playerId: String(playerInfo.playerId), // Ensure playerId is a string
        playerName:
          playerInfo.playerName || `Player ${String(playerInfo.playerId)}`,
      },
    });
    log('info', '[StateManagerProxy] loadRules command sent.');
    // Note: The actual confirmation and caching happen in handleWorkerMessage when 'rulesLoadedConfirmation' is received.
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
        log(
          'error',
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
    log(
      'warn',
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
    originalRegionOrder,
    dungeonData
  ) {
    this.staticData = {
      items: itemData,
      groups: groupData,
      locations: locationData,
      regions: regionData,
      exits: exitData,
      dungeons: dungeonData,
    };
    this.originalLocationOrder = originalLocationOrder || [];
    this.originalExitOrder = originalExitOrder || [];
    this.originalRegionOrder = originalRegionOrder || [];
    this.staticDataIsSet = true; // Mark static data as set
    log(
      'info',
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
    // This command sends data but doesn't inherently expect a unique response specific to this single item addition,
    // especially if part of a batch. The snapshot update confirms the batch.
    return this._sendCommand(
      StateManagerProxy.COMMANDS.ADD_ITEM_TO_INVENTORY,
      { item, quantity },
      false // MODIFIED: Explicitly pass false for expectResponse
    );
  }

  async removeItemFromInventory(item, quantity = 1) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.REMOVE_ITEM_FROM_INVENTORY,
      { item, quantity },
      false // Match addItemToInventory - no response expected, snapshot update provides confirmation
    );
  }

  async checkLocation(locationName, addItems = true) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.CHECK_LOCATION,
      { locationName, addItems },
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
      StateManagerProxy.COMMANDS.SYNC_CHECKED_LOCATIONS_FROM_SERVER,
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
      StateManagerProxy.COMMANDS.TOGGLE_QUEUE_REPORTING,
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
      StateManagerProxy.COMMANDS.GET_FULL_SNAPSHOT_QUERY,
      null,
      true
    );
  }

  /**
   * Gets the status of the worker's internal processing queue.
   * @returns {Promise<object>} A promise that resolves with the queue status.
   */
  async getWorkerQueueStatus() {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.GET_WORKER_QUEUE_STATUS_QUERY,
      null,
      true
    );
  }

  // Public method to get the latest snapshot directly from the cache
  // This is synchronous and used by UI components that need immediate access
  // and have already waited for `ensureReady` or subscribed to snapshot updates.
  getLatestStateSnapshot() {
    if (!this.uiCache) {
      // log('warn', '[StateManagerProxy getLatestStateSnapshot] No snapshot in cache. Ensure rules/state are loaded.');
    }
    return this.uiCache;
  }

  terminateWorker() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
      log('info', '[StateManagerProxy] Worker terminated.');
    }
  }

  _checkAndPublishReady() {
    const status = {
      uiCacheNotNull: !!this.uiCache,
      staticDataIsSet:
        !!this.staticDataCache && Object.keys(this.staticDataCache).length > 0,
      isReadyPublished: this.isReadyPublished, // Renamed from this._isReadyPublished for consistency
    };
    // Use logger for this critical path
    if (!isWorkerContext && window.logger) {
      window.logger.debug('stateManagerProxy', 'Status check:', status);
    } else {
      log(
        'info',
        '[StateManagerProxy _checkAndPublishReady] Status check:',
        status
      );
    }

    if (
      status.uiCacheNotNull &&
      status.staticDataIsSet &&
      !status.isReadyPublished // Use the consistent local variable
    ) {
      this.isReadyPublished = true; // Set the instance member
      // Use logger for this critical path
      if (!isWorkerContext && window.logger) {
        window.logger.info(
          'stateManagerProxy',
          'Publishing stateManager:ready event'
        );
      } else {
        log('info', '[StateManagerProxy] Publishing stateManager:ready event.');
      }
      this.eventBus.publish('stateManager:ready', {
        // Directly use event name string
        gameName: this.config ? this.config.gameName : null,
        playerId: this.config ? this.config.playerId : null,
      }, 'stateManager');
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
    if (!this.worker) {
      // MODIFIED: Direct call to imported function
      if (typeof logWorkerCommunication === 'function') {
        logWorkerCommunication(
          `[Proxy -> Worker] Error: Worker not initialized. Command: ${command}`,
          'error'
        );
      }
      // Optionally, queue the command or throw a more specific error
      throw new Error(
        `Worker not initialized. Cannot send command: ${command}`
      );
    }

    const messageId = this.nextMessageId++;
    const message = {
      queryId: messageId,
      command: command,
      payload: payload,
      expectResponse: expectResponse,
    };

    return new Promise((resolve, reject) => {
      if (expectResponse) {
        this.pendingQueries.set(messageId, { resolve, reject, timeout });
        // Start timeout for query
        setTimeout(() => {
          if (this.pendingQueries.has(messageId)) {
            this.pendingQueries.delete(messageId);
            const queryError = new Error(
              `Timeout waiting for response to command: ${command} (ID: ${messageId})`
            );
            // MODIFIED: Direct call to imported logWorkerCommunication
            if (typeof logWorkerCommunication === 'function') {
              logWorkerCommunication(
                `[Proxy -> Worker] ${queryError.message}`,
                'error'
              );
            }
            reject(queryError);
          }
        }, timeout);
      }

      // MODIFIED: Direct call to imported logWorkerCommunication
      if (typeof logWorkerCommunication === 'function') {
        logWorkerCommunication(
          `[Proxy -> Worker] ID: ${messageId}, CMD: ${command}`,
          payload
        );
      }
      this.worker.postMessage(message);

      if (!expectResponse) {
        resolve(); // Resolve immediately for fire-and-forget commands
      }
    });
  }

  async clearStateAndReset() {
    // MODIFIED: Direct call to imported logWorkerCommunication
    if (typeof logWorkerCommunication === 'function') {
      logWorkerCommunication('[Proxy -> Worker] COMMAND: clearStateAndReset');
    }
    await this._sendCommand(StateManagerProxy.COMMANDS.CLEAR_STATE_AND_RESET);
    // The worker's clearState method should handle sending a snapshot update.
    // We'll rely on subsequent ping/snapshotUpdated events for synchronization.
  }

  /**
   * Requests the worker to evaluate a specific rule using its full context.
   * @param {object} rule The rule object to evaluate.
   * @returns {Promise<any>} The result of the rule evaluation from the worker.
   */
  async evaluateRuleRemote(rule) {
    if (!this.worker) {
      log(
        'error',
        '[StateManagerProxy] Worker not initialized, cannot evaluate rule remotely.'
      );
      return false; // Or throw error
    }
    if (this._initialLoadComplete) {
      log(
        'info',
        `[StateManagerProxy] Sending evaluateRuleRequest for rule:`,
        rule
      );
      try {
        const response = await this._sendCommand(
          StateManagerProxy.COMMANDS.EVALUATE_RULE_REMOTE,
          { rule },
          true // Expect a response
        );
        log(
          'info',
          `[StateManagerProxy] Received evaluateRuleResponse:`,
          response
        );
        // Assuming the response structure includes { result: ... } or { error: ... }
        if (response && typeof response.error !== 'undefined') {
          log(
            'error',
            '[StateManagerProxy] Worker returned error during remote rule evaluation:',
            response.error
          );
          return false; // Propagate failure
        }
        return response?.result;
      } catch (error) {
        log(
          'error',
          '[StateManagerProxy] Error during remote rule evaluation request:',
          error
        );
        return false; // Indicate failure
      }
    } else {
      log(
        'warn',
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
    log(
      'info',
      '[StateManagerProxy] initialize method ENTERED. Config received:',
      JSON.parse(JSON.stringify(initialConfig))
    );
    // Store the initial configuration for the worker
    // initialConfig might contain rulesConfig (as data), gameName, etc.
    this.initialConfig = {
      rulesData: initialConfig.rulesConfig, // Expects rulesConfig to be the actual rules JSON object
      playerId: initialConfig.playerId || '1', // ADDED: Store and use playerId from initialConfig
      rulesUrl: null, // Explicitly null if rulesData is provided; worker will prioritize rulesData
      eventsConfig: initialConfig.eventsConfig, // Pass through if provided
      settings: initialConfig.settings, // Pass through if provided
      // Add any other config that needs to be relayed from the main thread init to the worker
    };

    // Prepare logging configuration for the worker
    let workerLoggingConfig = null;
    if (typeof window !== 'undefined' && window.logger) {
      const mainThreadLoggerConfig = window.logger.getConfig();
      
      // Define all worker-related logging categories that should be passed through
      const workerCategories = [
        // Core worker modules
        'stateManagerWorker',
        'StateManager',
        'stateManager',
        'ruleEngine',
        'stateManagerHelpers',
        
        // Game-specific modules
        'gameInventory',
        'alttpHelpers',
        'ALTTPState',
        
        // Game logic modules
        'alttpLogic',
        'genericLogic',
        
        // Additional worker categories that might be added in the future
        'inventoryManager',
        'progressiveItems',
        'gameState',
        'helperFunctions',
      ];
      
      // Build category levels object by copying from main thread config
      const workerCategoryLevels = {};
      workerCategories.forEach(category => {
        workerCategoryLevels[category] = 
          mainThreadLoggerConfig.categoryLevels?.[category] ||
          mainThreadLoggerConfig.defaultLevel;
      });
      
      workerLoggingConfig = {
        defaultLevel: mainThreadLoggerConfig.defaultLevel,
        categoryLevels: workerCategoryLevels,
        filters: mainThreadLoggerConfig.filters,
        showTimestamp: mainThreadLoggerConfig.showTimestamp,
        showCategoryName: mainThreadLoggerConfig.showCategoryName,
        enabled: mainThreadLoggerConfig.enabled,
        temporaryOverride: mainThreadLoggerConfig.temporaryOverride,
      };
      
      log('info', '[StateManagerProxy] Worker logging config prepared with categories:', Object.keys(workerCategoryLevels));
    }

    log(
      'info',
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
        loggingConfig: workerLoggingConfig, // Pass logging configuration to worker
        // workerPath: this.workerPath, // Not needed by worker itself for init
      },
    };

    try {
      log(
        'info',
        '[StateManagerProxy] Attempting this.worker.postMessage with initialize command.'
      );
      this.worker.postMessage(messageToSend);
      log(
        'info',
        '[StateManagerProxy] this.worker.postMessage for initialize command completed without immediate error.'
      );
    } catch (error) {
      log(
        'error',
        '[StateManagerProxy] CRITICAL: Error synchronously thrown by this.worker.postMessage for initialize command:',
        error,
        messageToSend
      );
      // Log the stringified version if the direct log fails due to circular refs in error or message
      try {
        log(
          'error',
          '[StateManagerProxy] CRITICAL (stringified): Error:',
          JSON.stringify(error),
          'Message:',
          JSON.stringify(messageToSend)
        );
      } catch (stringifyError) {
        log(
          'error',
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
      }, 'stateManager');
    }
  }

  async _loadStaticDataAndEmitReady() {
    // ... existing code ...
  }

  // --- New methods for JSON Module data handling ---
  getSavableStateData() {
    log('info', '[StateManagerProxy] getSavableStateData called.');
    if (!this.uiCache) {
      log(
        'warn',
        '[StateManagerProxy] No uiCache available when getting savable state. Returning empty structure.'
      );
      return {
        inventory: {},
        checkedLocations: [],
        // Add other minimal runtime state defaults if needed
      };
    }

    // Assuming uiCache contains the full snapshot structure
    const savableData = {
      inventory: this.uiCache.inventory || {},
      checkedLocations: this.uiCache.checkedLocations || [],
      // Potentially other things if they are not part of rules or settings and can change runtime
      // e.g., game-specific flags if they are stored in the snapshot and can be modified by user/events
      // Example: if (this.uiCache.gameSpecificFlags) savableData.gameSpecificFlags = this.uiCache.gameSpecificFlags;
    };

    log(
      'info',
      '[StateManagerProxy] Extracted savable state data:',
      savableData
    );
    return savableData;
  }

  applyRuntimeStateData(loadedData) {
    log(
      'info',
      '[StateManagerProxy] applyRuntimeStateData called with:',
      loadedData
    );
    if (!loadedData || typeof loadedData !== 'object') {
      log(
        'error',
        '[StateManagerProxy] Invalid data passed to applyRuntimeStateData.',
        loadedData
      );
      return;
    }

    // Check if worker is initialized
    if (!this.workerInitialized) {
      log('info', '[StateManagerProxy] Worker not initialized yet, queuing Game State data for later application');
      this.pendingGameStateData = loadedData;
      return;
    }
    
    // Worker is ready, apply the data immediately
    this._sendCommand(
      StateManagerProxy.COMMANDS.APPLY_RUNTIME_STATE,
      loadedData
    );
    log(
      'info',
      '[StateManagerProxy] Sent APPLY_RUNTIME_STATE command to worker.'
    );
  }
  // --- End new methods ---

  /**
   * Updates the worker's logging configuration
   * @param {object} newLoggingConfig - New logging configuration to send to worker
   */
  updateWorkerLogConfig(newLoggingConfig) {
    if (this.worker && newLoggingConfig) {
      this.sendCommandToWorker({
        command: 'updateLogConfig',
        payload: newLoggingConfig,
      });
      log(
        'info',
        '[StateManagerProxy] Sent logging configuration update to worker'
      );
    }
  }

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

  async pingWorker(dataToEcho, timeoutMs = 2000) {
    const queryId = this.nextQueryId++;
    this._logDebug(
      `[StateManagerProxy] Pinging worker with queryId ${queryId}, payload:`,
      dataToEcho
    );

    const promise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingQueries.delete(queryId);
        reject(
          new Error(`Timeout waiting for ping response (queryId: ${queryId})`)
        );
      }, timeoutMs);
      this.pendingQueries.set(queryId, { resolve, reject, timeoutId });
    });

    this.sendCommandToWorker({
      command: StateManagerProxy.COMMANDS.PING,
      queryId: queryId, // Include queryId so worker can echo it back
      payload: dataToEcho,
    });

    return promise;
  }

  /**
   * Sends a command to the worker to set up a specific inventory for testing purposes
   * and returns a snapshot of the game state based on that inventory.
   * @param {string[]} requiredItems - A list of items that must be in the inventory.
   * @param {string[]} excludedItems - A list of items that must not be in the inventory.
   * @returns {Promise<Object>} A promise that resolves with the game state snapshot.
   */
  async setupTestInventoryAndGetSnapshot(requiredItems, excludedItems) {
    return this.sendQueryToWorker({
      // Assuming sendQueryToWorker handles promises
      command: StateManagerProxy.COMMANDS.SETUP_TEST_INVENTORY, // Define this in COMMANDS
      payload: { requiredItems, excludedItems },
    });
  }

  /**
   * Asks the worker to evaluate location accessibility for a specific test scenario.
   * The worker will use the currently loaded rules (set by a prior loadRules command for the test set).
   * @param {string} locationName - The name of the location to check.
   * @param {string[]} requiredItems - Items to temporarily add to the inventory for this test.
   * @param {string[]} excludedItems - Items to temporarily ensure are not in the inventory for this test.
   * @returns {Promise<boolean>} A promise that resolves with true if accessible, false otherwise, or undefined on error.
   */
  async evaluateLocationAccessibilityForTest(
    locationName,
    requiredItems = [],
    excludedItems = []
  ) {
    if (!this.worker) {
      log(
        'error',
        '[StateManagerProxy] Worker not initialized, cannot evaluate test.'
      );
      return undefined; // Or reject promise
    }
    log(
      'info',
      `[StateManagerProxy] Sending EVALUATE_ACCESSIBILITY_FOR_TEST for "${locationName}`
    );
    try {
      // This command needs a response with the evaluation result.
      const response = await this.sendQueryToWorker({
        command:
          StateManagerProxy.COMMANDS.EVALUATE_LOCATION_ACCESSIBILITY_TEST,
        payload: {
          locationName,
          requiredItems,
          excludedItems,
        },
      });
      // Assuming response structure is { result: boolean } or { error: string }
      if (response && typeof response.result === 'boolean') {
        return response.result;
      } else if (response && response.error) {
        log(
          'error',
          `[StateManagerProxy] Worker error during EVALUATE_ACCESSIBILITY_FOR_TEST: ${response.error}`
        );
        return undefined; // Evaluation failed
      }
      log(
        'warn',
        '[StateManagerProxy] Invalid response from worker for EVALUATE_ACCESSIBILITY_FOR_TEST',
        response
      );
      return undefined;
    } catch (error) {
      log(
        'error',
        '[StateManagerProxy] Error sending EVALUATE_ACCESSIBILITY_FOR_TEST command:',
        error
      );
      return undefined;
    }
  }

  async applyTestInventoryAndEvaluate(
    locationName,
    requiredItems = [],
    excludedItems = []
  ) {
    if (!this.worker) {
      log(
        'error',
        '[StateManagerProxy] Worker not initialized. Cannot apply test inventory and evaluate.'
      );
      return Promise.reject(
        new Error('StateManager worker is not initialized.')
      );
    }

    log(
      'info',
      `[StateManagerProxy] applyTestInventoryAndEvaluate called for ${locationName}`
    );

    try {
      const response = await this.sendQueryToWorker({
        command: StateManagerProxy.COMMANDS.APPLY_TEST_INVENTORY_AND_EVALUATE,
        payload: {
          locationName,
          requiredItems,
          excludedItems,
        },
      });

      // Assuming the worker responds with a payload structured as:
      // { newSnapshot, newInventory, locationAccessibilityResult, originalLocationName }
      if (response && response.newSnapshot && response.newInventory) {
        this.uiCache = response.newSnapshot;
        // TODO: Consider if we need a specific this.currentInventory or if uiCache.inventory is sufficient.

        log(
          'info',
          `[StateManagerProxy] applyTestInventoryAndEvaluate: Snapshot and inventory updated for ${response.originalLocationName}. Publishing events.`
        );

        this.eventBus.publish('stateManager:snapshotUpdated', {
          snapshot: response.newSnapshot,
        }, 'stateManager');
        this.eventBus.publish('stateManager:inventoryChanged', {
          inventory: response.newInventory,
          // itemsAdded: requiredItems, // This might be complex if worker derives the diff
          // itemsRemoved: excludedItems, // For simplicity, let UI re-render from new inventory
        }, 'stateManager');

        // The actual result of the test for the specific location
        return response.locationAccessibilityResult;
      } else {
        log(
          'error',
          '[StateManagerProxy] Invalid response from worker for APPLY_TEST_INVENTORY_AND_EVALUATE:',
          response
        );
        throw new Error(
          'Invalid response from worker for test inventory application.'
        );
      }
    } catch (error) {
      log(
        'error',
        `[StateManagerProxy] Error in applyTestInventoryAndEvaluate for ${locationName}:`,
        error
      );
      throw error; // Re-throw to be caught by the caller in TestCaseUI
    }
  }

  // ADDED: Getter for currentRulesSource
  getRawJsonDataSource() {
    return this.currentRulesSource;
  }

  // Method to enable/disable auto-collection of events in the worker's StateManager
  async setAutoCollectEventsConfig(enabled) {
    return this._sendCommand(
      StateManagerProxy.COMMANDS.SET_AUTO_COLLECT_EVENTS_CONFIG,
      { enabled }, // Pass 'enabled' as part of the payload
      false // This is a fire-and-forget command, no specific response expected beyond ack
    );
  }
}

export default StateManagerProxy;

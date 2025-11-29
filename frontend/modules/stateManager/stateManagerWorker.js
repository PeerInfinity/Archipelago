/**
 * State Manager Web Worker
 *
 * Runs StateManager in a separate thread to keep game state calculations
 * off the main UI thread. Handles command processing via a queue system.
 *
 * Key responsibilities:
 * - StateManager instance lifecycle
 * - Command queue processing with FIFO ordering
 * - Rule evaluation and reachability computation
 * - Snapshot generation and transmission to main thread
 * - Logging coordination with main thread
 *
 * **DATA FLOW**:
 *
 * Worker Initialization (initialize command):
 *   Input: Worker configuration from proxy
 *     ├─> rulesData: Archipelago JSON rules (optional)
 *     ├─> playerId: Selected player ID
 *     ├─> settings: Game settings
 *     ├─> loggingConfig: Logging configuration from main thread
 *
 *   Processing:
 *     ├─> Store workerConfig
 *     ├─> Configure worker logger with main thread settings
 *     ├─> Create StateManager instance with evaluateRule function
 *     ├─> Pass CommandQueue to StateManager
 *     ├─> Set up communication channel (postMessage callback)
 *     ├─> Apply initial settings if provided
 *
 *   Output: Worker initialized
 *     ├─> StateManager instance created
 *     ├─> workerInitializedConfirmation sent to proxy
 *     ├─> Ready to process commands
 *
 * Rules Loading (loadRules command):
 *   Input: Rules and player info from proxy
 *     ├─> rulesData: Full Archipelago JSON
 *     ├─> playerInfo: { playerId, playerName }
 *
 *   Processing:
 *     ├─> Call stateManager.loadFromJSON(rulesData, playerId)
 *     ├─> StateManager processes all locations, regions, exits
 *     ├─> Game logic module selected based on game name
 *     ├─> Initial reachability computed
 *     ├─> Generate initial snapshot
 *     ├─> Collect static game data
 *
 *   Output: Rules loaded confirmation
 *     ├─> rulesLoadedConfirmation message
 *     ├─> initialSnapshot included
 *     ├─> newStaticData (locations, regions, items, etc.)
 *     ├─> gameName and playerId echoed back
 *
 * Command Queue Processing:
 *   Input: Command message from main thread
 *     ├─> command: Command name (string)
 *     ├─> queryId: Unique ID for response matching
 *     ├─> payload: Command-specific data
 *     ├─> expectResponse: Whether command needs response
 *
 *   Processing (Phase 8):
 *     ├─> Enqueue command with commandQueue.enqueue()
 *     ├─> Process queue in FIFO order with processQueue()
 *     ├─> Execute command via executeCommand()
 *     ├─> Route to appropriate StateManager method in handleMessage()
 *     ├─> Mark as completed or failed in queue
 *     ├─> Send response if expectResponse=true
 *
 *   Output: Command result
 *     ├─> queryResponse for queries
 *     ├─> pingResponse for ping
 *     ├─> stateSnapshot for state changes
 *     ├─> commandCompleted/commandFailed for tracking
 *
 * Item Management Commands:
 *   addItemToInventory:
 *     Input: { item: string, quantity: number }
 *     Processing: stateManager.addItemToInventory(item, quantity)
 *     Output: Inventory updated, snapshot sent
 *
 *   removeItemFromInventory:
 *     Input: { item: string, quantity: number }
 *     Processing: stateManager.removeItemFromInventory(item, quantity)
 *     Output: Inventory updated, snapshot sent
 *
 * Location Checking Commands:
 *   checkLocation:
 *     Input: { locationName: string, addItems: boolean, forceCheck: boolean }
 *     Processing: stateManager.checkLocation(locationName, addItems, forceCheck)
 *     Output: Location checked, item granted, snapshot sent
 *
 * Batch Update Commands:
 *   beginBatchUpdate:
 *     Input: { deferRegionComputation: boolean }
 *     Processing: stateManager.beginBatchUpdate()
 *     Output: Batch mode enabled, updates queued
 *
 *   commitBatchUpdate:
 *     Input: None
 *     Processing: stateManager.commitBatchUpdate()
 *     Output: All updates applied, regions recomputed, snapshot sent
 *
 * State Management Commands:
 *   applyRuntimeState:
 *     Input: { inventory: {}, checkedLocations: [], ... }
 *     Processing: stateManager.applyRuntimeState(payload)
 *     Output: State restored, snapshot sent
 *
 *   clearStateAndReset:
 *     Input: None
 *     Processing: stateManager.clearState()
 *     Output: State cleared, snapshot sent
 *
 *   clearEventItems:
 *     Input: None
 *     Processing: stateManager.clearEventItems()
 *     Output: Event items removed, snapshot sent
 *
 * Query Commands:
 *   getFullSnapshot / getFullSnapshotQuery:
 *     Input: None
 *     Processing: stateManager.getSnapshot()
 *     Output: queryResponse with full snapshot
 *
 *   getWorkerQueueStatusQuery:
 *     Input: None
 *     Processing: commandQueue.getSnapshot()
 *     Output: queryResponse with queue metrics
 *
 * Testing Commands:
 *   evaluateLocationAccessibilityForTest:
 *     Input: { locationName, requiredItems, excludedItems }
 *     Processing: stateManager.evaluateAccessibilityForTest()
 *     Output: queryResponse with accessibility boolean
 *
 *   applyTestInventoryAndEvaluate:
 *     Input: { locationName, requiredItems, excludedItems }
 *     Processing: Setup test inventory, evaluate location
 *     Output: queryResponse with snapshot and result
 *
 * Ping/Sync Command:
 *   ping:
 *     Input: { queryId, payload: dataToEcho }
 *     Processing: stateManager.ping({ queryId, payload })
 *     Output: pingResponse with echoed payload
 *
 * **Architecture Notes**:
 * - Worker runs in separate thread (Web Worker context)
 * - No access to window, document, or DOM
 * - All communication via postMessage
 * - StateManager instance owned by worker
 * - Command queue prevents race conditions
 * - Yield points allow responsive command processing
 *
 * @module stateManager/worker
 */

// Initial startup message using console directly to avoid circular dependency
// console.log('[stateManagerWorker] Worker starting...');

// ADDED: Top-level error handler for the worker
self.onerror = function (message, source, lineno, colno, error) {
  // Use console directly to avoid circular dependency with log function
  console.error('[stateManagerWorker] Uncaught Worker Error:', {
    message,
    source,
    lineno,
    colno,
    error,
  });
  try {
    self.postMessage({
      type: 'workerGlobalError',
      error: {
        message: message,
        source: source,
        lineno: lineno,
        colno: colno,
        errorMessage: error ? error.message : 'N/A',
        errorStack: error ? error.stack : 'N/A',
      },
    });
  } catch (e) {
    console.error(
      '[stateManagerWorker] FATAL: Could not even postMessage from self.onerror',
      e
    );
  }
  return true; // Prevent default handling
};

// ADDED: Immediate ping to confirm worker script execution and basic postMessage
// try {
//   self.postMessage({
//     type: 'workerDebugPing',
//     message: 'Worker script started and postMessage functional.',
//   });
// } catch (e) {
//   console.error(
//     '[stateManagerWorker] FATAL: Could not send initial debug ping:',
//     e
//   );
// }

// Import the StateManager class
import { StateManager } from './stateManager.js';
// Import the actual rule evaluation function
import { evaluateRule } from '../shared/ruleEngine.js';
// Import shared commands instead of StateManagerProxy to avoid window references
import { STATE_MANAGER_COMMANDS } from './stateManagerCommands.js';
// Import universal logger
import { initializeWorkerLogger, updateWorkerLoggerConfig, createUniversalLogger, workerLoggerInstance } from '../../app/core/universalLogger.js';
// Import CommandQueue for Phase 8 command queue implementation
import { CommandQueue } from './core/commandQueue.js';

// Initialize worker logger with basic settings
initializeWorkerLogger({
  defaultLevel: 'WARN',
  categoryLevels: {
    stateManagerWorker: 'WARN',
    StateManager: 'WARN',
    stateManager: 'WARN',
    ALTTPState: 'WARN',
  },
  enabled: true,
});

// Create logger for this worker module
const logger = createUniversalLogger('stateManagerWorker');

// Legacy log function for backward compatibility (can be removed once all calls are updated)
function log(level, message, ...data) {
  logger[level](message, ...data);
}

// NOTE: ALTTPState and game-specific helpers are imported
// and instantiated *inside* StateManager.js constructor or used directly.

// Dependencies loaded message using console directly to avoid circular dependency
// console.log(
//   '[stateManagerWorker] Dependencies loaded (StateManager, evaluateRule).'
// );

// Phase 8: Command Queue - Create queue instance with monitoring enabled
const QUEUE_ENABLED = true; // Can be set to false for testing/comparison
const commandQueue = new CommandQueue({
  enabled: QUEUE_ENABLED,
  maxHistorySize: 50,
  debugMode: false // Set to true for detailed queue logging
});

let stateManagerInstance = null;
let workerConfig = null;
let workerInitialized = false;
const preInitQueue = [];

// Function to set the communication channel on the instance
function setupCommunicationChannel(instance) {
  instance.setCommunicationChannel((message) => {
    try {
      self.postMessage(message);
    } catch (error) {
      log(
        'error',
        '[stateManagerWorker] Error posting message back to main thread:',
        error,
        message
      );
      try {
        self.postMessage({
          type: 'error',
          message: `Worker failed to post original message: ${error.message}`,
        });
      } catch (finalError) {
        log(
          'error',
          '[stateManagerWorker] Failed to post even the error message back:',
          finalError
        );
      }
    }
  });
}

/**
 * Phase 8: Command Queue Processing Loop
 *
 * Processes commands from the queue in FIFO order with yield points
 * to allow incoming commands to be enqueued without blocking.
 */
async function processQueue() {
  if (commandQueue.processing) {
    return; // Already processing
  }

  commandQueue.processing = true;

  while (commandQueue.hasPending()) {
    const cmd = commandQueue.getNext();

    if (!cmd) break; // No more commands

    try {
      // Execute command
      await executeCommand(cmd);

      // Mark as completed
      commandQueue.markCompleted(cmd.queueId);

      // Send completion response for commands that need it (like PING)
      if (shouldSendCompletionResponse(cmd.command)) {
        self.postMessage({
          type: 'commandCompleted',
          queryId: cmd.queryId,
          queueId: cmd.queueId,
          command: cmd.command,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      // Mark as failed
      commandQueue.markFailed(cmd.queueId, error);

      // Extract correlation ID from payload if available
      const correlationId = cmd.payload?.correlationId;

      // Get current queue status for context
      const queueStatus = commandQueue.getSnapshot();

      // Send enhanced error response with full context
      self.postMessage({
        type: 'commandFailed',
        queryId: cmd.queryId,
        queueId: cmd.queueId,
        command: cmd.command,
        correlationId: correlationId,
        error: error.message,
        stack: error.stack,
        timestamp: Date.now(),
        queueStatus: {
          pending: queueStatus.pending,
          completed: queueStatus.completed,
          failed: queueStatus.failed,
          processing: queueStatus.processing,
          currentCommand: cmd.command
        },
        context: {
          workerInitialized: workerInitialized,
          stateManagerExists: !!stateManagerInstance
        }
      });

      log('error', `[CommandQueue] Command failed: ${cmd.command}, queryId: ${cmd.queryId}, correlationId: ${correlationId}`, error);
    }

    // Yield point: Allow new messages to be received
    // This prevents the queue from blocking incoming commands
    await new Promise(resolve => setTimeout(resolve, 0));
  }

  commandQueue.processing = false;
}

/**
 * Phase 8: Helper Functions for Command Queue
 */

/**
 * Determine if command should send completion response
 * PING sends its own pingResponse, so it should NOT send commandCompleted.
 * All query commands send queryResponse directly from handleMessage.
 * Only commands that need explicit completion notification should return true here.
 */
function shouldSendCompletionResponse(command) {
  // No commands currently need commandCompleted messages
  // PING uses pingResponse instead
  return false;
}

/**
 * Fallback for direct execution (if queue disabled)
 * Keeps existing code for comparison testing
 */
async function executeCommandDirectly(command, queryId, payload) {
  // Build message object in old format
  const message = { command, queryId, payload };
  await handleMessage(message);
}

/**
 * Phase 8: Execute Command
 *
 * Routes a command from the queue to the appropriate StateManager method.
 * This function processes commands that have been dequeued and are ready to execute.
 *
 * @param {Object} cmd - Command entry from queue
 */
async function executeCommand(cmd) {
  const { command, payload, queryId } = cmd;

  // Extract expectResponse from payload if it was stored there
  const expectResponse = payload?.expectResponse;

  // Build message object for handleMessage (reuse existing logic)
  // Include expectResponse so handlers know whether to send responses
  const message = { command, payload, queryId, expectResponse };
  await handleMessage(message);
}

// RACE CONDITION FIX: Original message handler logic moved to separate function
async function handleMessage(message) {
  log('info', '[stateManagerWorker handleMessage] Processing message:', message);

  if (!message || !message.command) {
    log(
      'warn',
      '[stateManagerWorker onmessage] Received invalid message structure:',
      message
    );
    return;
  }

  try {
    switch (message.command) {
      case 'initialize':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing initialize command...'
        );
        // Handle both old format (message.config) and new queue format (message.payload.config)
        workerConfig = message.config || (message.payload && message.payload.config) || message.payload;
        if (!workerConfig) {
          throw new Error('Initialization failed: workerConfig is missing.');
        }

        // Configure worker logger with settings from main thread
        if (workerConfig.loggingConfig) {
          updateWorkerLoggerConfig(workerConfig.loggingConfig);
          logger.info(
            `Worker logger configured. Default: ${
              workerConfig.loggingConfig.defaultLevel || 'N/A'
            }, StateManager: ${
              workerConfig.loggingConfig.categoryLevels?.StateManager || 'N/A'
            }`
          );
        }

        // Pass the configured logger and command queue to StateManager
        stateManagerInstance = new StateManager(evaluateRule, workerLoggerInstance, commandQueue);
        setupCommunicationChannel(stateManagerInstance);
        // Pass initial settings if available in workerConfig
        if (workerConfig.settings) {
          stateManagerInstance.applySettings(workerConfig.settings);
        }
        workerInitialized = true; // Mark as initialized
        log(
          'info',
          '[stateManagerWorker onmessage] Worker initialized successfully. Config:',
          workerConfig
        );
        self.postMessage({
          type: 'workerInitializedConfirmation',
          message: 'Worker has been initialized.',
          configEcho: {
            playerId: workerConfig.playerId,
            rulesDataIsPresent: !!workerConfig.rulesData,
            settingsArePresent: !!workerConfig.settings,
          },
        });
        // Process any pre-init queue messages if we had such a mechanism
        // For now, direct initialization is assumed.
        break;

      case STATE_MANAGER_COMMANDS.BEGIN_BATCH_UPDATE: // Using COMMANDS object
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot begin batch update.');
        }
        // Payload might indicate if region computation should be deferred.
        // For now, assume the default deferral behavior in StateManager.beginBatchUpdate()
        // If payload contains { deferRegionComputation: true/false }, pass it along:
        // stateManagerInstance.beginBatchUpdate(message.payload?.deferRegionComputation);
        stateManagerInstance.beginBatchUpdate(
          message.payload?.deferRegionComputation !== undefined
            ? message.payload.deferRegionComputation
            : true
        );
        // No explicit response needed, batching is an internal state change for the worker.
        break;

      case STATE_MANAGER_COMMANDS.COMMIT_BATCH_UPDATE: // Using COMMANDS object
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot commit batch update.'
          );
        }
        stateManagerInstance.commitBatchUpdate();
        // commitBatchUpdate internally sends a snapshot update if changes occurred.
        break;

      case 'updateLogConfig':
        if (message.payload) {
          updateWorkerLoggerConfig(message.payload);
          logger.info(
            `Worker logging configuration updated. Default: ${
              message.payload.defaultLevel || 'N/A'
            }, StateManager: ${
              message.payload.categoryLevels?.StateManager || 'N/A'
            }`
          );
        }
        break;

      case 'applyRuntimeState':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing applyRuntimeState command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot apply runtime state.'
          );
        }
        if (!message.payload) {
          throw new Error('Invalid payload for applyRuntimeState command.');
        }
        stateManagerInstance.applyRuntimeState(message.payload);
        // applyRuntimeState in StateManager should handle sending a snapshot update if necessary
        break;

      case 'loadRules':
        log(
          'info',
          '[stateManagerWorker onmessage] Processing loadRules command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot load rules.');
        }
        if (
          !message.payload ||
          !message.payload.rulesData ||
          !message.payload.playerInfo ||
          !message.payload.playerInfo.playerId
        ) {
          throw new Error('Invalid payload for loadRules command.');
        }
        const rulesData = message.payload.rulesData;
        const playerId = String(message.payload.playerInfo.playerId);

        await stateManagerInstance.loadFromJSON(rulesData, playerId);
        const initialSnapshot = stateManagerInstance.getSnapshot();

        // Use the getStaticGameData method to get all static data including game_name and game_directory
        const workerStaticGameData = stateManagerInstance.getStaticGameData();

        log(
          'info',
          '[stateManagerWorker onmessage] Rules loaded. About to postMessage. WorkerStaticGameData details:'
        );
        log(
          'info',
          '  workerStaticGameData keys:',
          Object.keys(workerStaticGameData)
        );
        log(
          'info',
          '  workerStaticGameData.originalExitOrder type:',
          typeof workerStaticGameData.originalExitOrder,
          'Is Array:',
          Array.isArray(workerStaticGameData.originalExitOrder),
          'Length:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.length
            : 'N/A'
        );
        log(
          'info',
          '  Sample originalExitOrder from workerStaticGameData:',
          workerStaticGameData.originalExitOrder
            ? workerStaticGameData.originalExitOrder.slice(0, 5)
            : 'N/A'
        );

        log(
          'info',
          '[stateManagerWorker onmessage] Rules loaded. Posting confirmation with snapshot and full newStaticData.'
        );
        self.postMessage({
          type: 'rulesLoadedConfirmation',
          initialSnapshot: initialSnapshot,
          gameName: stateManagerInstance.rules?.game_name,
          playerId: playerId,
          newStaticData: workerStaticGameData, // Send the entire new static data object
        });
        break;

      case 'ping': // New case for ping command
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot process ping.');
        }
        log('debug', `[Worker] Processing PING command for queryId ${message.queryId}`);
        // Construct the object that StateManager.ping expects
        stateManagerInstance.ping({
          queryId: message.queryId, // Pass the queryId from the incoming message
          payload: message.payload, // Pass the actual dataToEcho (e.g., 'uiSimSyncAfterClick')
        });
        // The ping method itself will post the 'pingResponse' message
        log('debug', `[Worker] PING command completed for queryId ${message.queryId}`);
        break;

      case STATE_MANAGER_COMMANDS.GET_WORKER_QUEUE_STATUS_QUERY:
        // Phase 8: Get command queue snapshot for debugging
        log('info', '[Worker] Processing GET_WORKER_QUEUE_STATUS_QUERY');
        try {
          const queueSnapshot = commandQueue.getSnapshot();
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: queueSnapshot
          });
        } catch (error) {
          log('error', '[Worker] Error getting queue snapshot:', error);
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Failed to get queue snapshot: ${error.message}`
          });
        }
        break;

      case 'addItemToInventory':
        if (!stateManagerInstance) {
          log(
            'error',
            '[stateManagerWorker] StateManager not initialized for addItemToInventory'
          );
          break;
        }
        try {
          const { item, quantity } = message.payload;
          if (typeof item === 'string') {
            stateManagerInstance.addItemToInventory(item, quantity || 1);
            // stateManagerInstance.addItemToInventory already sends a snapshot update
          } else {
            log(
              'error',
              '[stateManagerWorker] Invalid payload for addItemToInventory: item name missing or not a string.',
              message.payload
            );
          }
        } catch (e) {
          log(
            'error',
            '[stateManagerWorker] Error processing addItemToInventory:',
            e
          );
          // Optionally send an error back
        }
        break;

      case 'removeItemFromInventory':
        if (!stateManagerInstance) {
          log(
            'error',
            '[stateManagerWorker] StateManager not initialized for removeItemFromInventory'
          );
          break;
        }
        try {
          const { item, quantity } = message.payload;
          if (typeof item === 'string') {
            // Check if StateManager has a removeItemFromInventory method
            if (typeof stateManagerInstance.removeItemFromInventory === 'function') {
              stateManagerInstance.removeItemFromInventory(item, quantity || 1);
              log(
                'info',
                `[stateManagerWorker] Removed ${quantity || 1} of "${item}" from inventory`
              );
            } else {
              log(
                'error',
                '[stateManagerWorker] StateManager.removeItemFromInventory method not available'
              );
            }
          } else {
            log(
              'error',
              '[stateManagerWorker] Invalid payload for removeItemFromInventory: item name missing or not a string.',
              message.payload
            );
          }
        } catch (e) {
          log(
            'error',
            '[stateManagerWorker] Error processing removeItemFromInventory:',
            e
          );
          // Optionally send an error back
        }
        break;

      // Basic query handling for commands that expect a response via queryId
      case 'getFullSnapshot':
      case 'getFullSnapshotQuery':
      case 'checkLocation':
      case 'evaluateRuleRequest':
      case 'getStaticData':
        if (!workerInitialized || !stateManagerInstance) {
          log(
            'error',
            `[SMW] ${message.command} received but worker not ready.`
          );
          if (message.queryId) {
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              error: 'Worker not initialized',
            });
          }
          return;
        }

        // LOG 1: Confirm command and presence of queryId
        log(
          'info',
          `[SMW] Grouped command dispatch. Command: ${
            message.command
          }. Has queryId: ${!!message.queryId}. Payload type: ${typeof message.payload}`
        );
        if (message.payload && typeof message.payload === 'object') {
          log(
            'info',
            `[SMW] Payload locationName: ${message.payload.locationName}`
          );
        }

        if (message.queryId) {
          // LOG 2: Inside if (message.queryId)
          log(
            'info',
            `[SMW] Entered message.queryId block. Command: ${message.command}`
          );

          if (message.command === 'getFullSnapshot' || message.command === 'getFullSnapshotQuery') {
            log('info', `[SMW] Matched command: ${message.command}`);
            const snapshot = stateManagerInstance.getSnapshot();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: snapshot,
            });
          } else if (message.command === 'getStaticData') {
            log('info', `[SMW] Matched command: getStaticData`);
            const staticData = stateManagerInstance.getStaticGameData();
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: staticData,
            });
          } else if (message.command === 'checkLocation') {
            // LOG 3: Matched command checkLocation
            log(
              'info',
              `[SMW] Matched command: checkLocation. Current payload:`,
              message.payload
                ? JSON.stringify(message.payload)
                : 'undefined/null'
            );
            try {
              // LOG 4: Start of try block for checkLocation
              log('info', `[SMW] checkLocation: try block entered.`);
              const locationName = message.payload.locationName;
              const addItems = message.payload.addItems !== undefined ? message.payload.addItems : true;
              const forceCheck = message.payload.forceCheck !== undefined ? message.payload.forceCheck : false;
              log(
                'info',
                `[SMW] checkLocation: locationName extracted: "${locationName}" (type: ${typeof locationName}), addItems: ${addItems}, forceCheck: ${forceCheck}`
              );

              if (typeof locationName !== 'string') {
                log(
                  'error',
                  `[SMW] checkLocation: locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation: expected a string locationName in payload.locationName.'
                );
              }

              // LOG 5: Before calling instance.checkLocation
              log(
                'info',
                `[SMW] checkLocation: About to call stateManagerInstance.checkLocation("${locationName}", ${addItems}, ${forceCheck})`
              );
              const result = stateManagerInstance.checkLocation(locationName, addItems, forceCheck);
              // LOG 6: After calling instance.checkLocation
              log(
                'info',
                `[SMW] checkLocation: stateManagerInstance.checkLocation completed for "${locationName}". Result:`,
                JSON.stringify(result)
              );

              // Only send query response if expectResponse is explicitly true
              if (message.expectResponse === true) {
                if (result && result.success) {
                  log(
                    'info',
                    `[SMW] checkLocation: Sending success queryResponse for queryId ${message.queryId}`
                  );
                  self.postMessage({
                    type: 'queryResponse',
                    queryId: message.queryId,
                    result: {
                      success: true,
                      locationName: locationName,
                      status: 'processed_by_state_manager',
                    },
                  });
                } else {
                  log(
                    'warn',
                    `[SMW] checkLocation: Location check was rejected. Reason: ${result?.reason || 'unknown'}`
                  );
                  self.postMessage({
                    type: 'queryResponse',
                    queryId: message.queryId,
                    error: `Location check rejected: ${result?.reason || 'unknown'}. Location was not checked.`,
                  });
                }
              }
            } catch (error) {
              // LOG 7: In catch block for checkLocation
              log(
                'error',
                `[SMW] checkLocation: CATCH block. Error for payload ${
                  message.payload
                    ? JSON.stringify(message.payload)
                    : 'undefined/null'
                }:`,
                error.message,
                error.stack
              );
              // Only send error response if expectResponse is explicitly true
              if (message.expectResponse === true) {
                log(
                  'error',
                  `[SMW] checkLocation: Sending error queryResponse for queryId ${message.queryId}`
                );
                self.postMessage({
                  type: 'queryResponse',
                  queryId: message.queryId,
                  error: `Error processing checkLocation: ${error.message}`,
                });
              }
            }

          } else {
            // Presumed 'evaluateRuleRequest'
            log(
              'info',
              `[SMW] Command ${message.command} in queryId block, but not getFullSnapshot, getStaticData, or checkLocation.`
            );
            // This is a simplification for now to get the init/loadRules flow working.
            log(
              'warn',
              `[stateManagerWorker] Command ${message.command} needs full handler beyond this basic switch.`
            );
            self.postMessage({
              type: 'queryResponse',
              queryId: message.queryId,
              result: {
                status: 'acknowledged_needs_full_handler',
                command: message.command,
              },
            });
          }
        } else {
          // queryId was NOT present
          if (message.command === 'checkLocation') {
            // Process checkLocation without warning, as this is an expected path.
            try {
              const locationName = message.payload.locationName;
              const addItems = message.payload.addItems !== undefined ? message.payload.addItems : true;
              if (typeof locationName !== 'string') {
                log(
                  'error',
                  `[SMW] checkLocation (no queryId): locationName is not a string.`
                );
                throw new Error(
                  'Invalid payload for checkLocation (no queryId): expected a string locationName in payload.locationName.'
                );
              }
              log(
                'info',
                `[SMW] checkLocation (no queryId): About to call stateManagerInstance.checkLocation("${locationName}", ${addItems})`
              );
              stateManagerInstance.checkLocation(locationName, addItems);
              log(
                'info',
                `[SMW] checkLocation (no queryId): stateManagerInstance.checkLocation completed for "${locationName}".`
              );
            } catch (error) {
              log(
                'error',
                `[SMW] checkLocation (no queryId): CATCH block. Error for payload ${
                  message.payload
                    ? JSON.stringify(message.payload)
                    : 'undefined/null'
                }:`,
                error.message,
                error.stack
              );
            }

          } else {
            // For other commands without queryId in this grouped case, issue the general warning.
            log(
              'warn',
              `[SMW] Command ${message.command} in grouped case did NOT have a queryId. This is unexpected for these commands if a response is awaited.`
            );
          }
        }
        break;

      // Add new command handler here
      case 'SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT':
        if (!stateManagerInstance) {
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: 'StateManager instance not available in worker.',
          });
          break;
        }
        try {
          // It's crucial that initializeInventoryForTest does NOT compute/send its own snapshot here
          stateManagerInstance.initializeInventoryForTest(
            message.payload.requiredItems,
            message.payload.excludedItems
          );
          stateManagerInstance.computeReachableRegions(); // Ensure reachability is updated for this inventory
          const snapshot = stateManagerInstance.getSnapshot();
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: snapshot,
          });
        } catch (e) {
          log(
            'error',
            '[StateManagerWorker] Error during SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT:',
            e
          );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: e.message,
          });
        }
        break;

      case STATE_MANAGER_COMMANDS.EVALUATE_ACCESSIBILITY_FOR_TEST:
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error('Worker not initialized. Cannot evaluate test.');
        }
        if (!message.payload || !message.payload.locationName) {
          throw new Error(
            'Invalid payload for EVALUATE_ACCESSIBILITY_FOR_TEST command.'
          );
        }
        if (!message.queryId) {
          throw new Error(
            'Missing queryId for EVALUATE_ACCESSIBILITY_FOR_TEST command.'
          );
        }

        try {
          const { locationName, requiredItems, excludedItems } =
            message.payload;
          const isAccessible =
            stateManagerInstance.evaluateAccessibilityForTest(
              locationName,
              requiredItems,
              excludedItems
            );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: { result: isAccessible },
          });
        } catch (evalError) {
          log(
            'error',
            '[StateManagerWorker] Error during EVALUATE_ACCESSIBILITY_FOR_TEST:',
            evalError
          );
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Error evaluating test: ${evalError.message}`,
          });
        }
        break;

      case STATE_MANAGER_COMMANDS.APPLY_TEST_INVENTORY_AND_EVALUATE:
        log(
          'info',
          '[stateManagerWorker onmessage] Processing APPLY_TEST_INVENTORY_AND_EVALUATE command...'
        );
        if (!workerInitialized || !stateManagerInstance) {
          throw new Error(
            'Worker not initialized. Cannot apply test inventory and evaluate.'
          );
        }
        if (!message.payload || !message.payload.locationName) {
          throw new Error(
            'Invalid payload for APPLY_TEST_INVENTORY_AND_EVALUATE command.'
          );
        }
        if (!message.queryId) {
          // This command specifically needs a queryId to send the result back to the correct promise.
          throw new Error(
            'Missing queryId for APPLY_TEST_INVENTORY_AND_EVALUATE command.'
          );
        }

        try {
          const {
            locationName,
            requiredItems = [],
            excludedItems = [],
          } = message.payload;

          // Start batch mode to prevent multiple cache invalidations and snapshot updates
          stateManagerInstance.beginBatchUpdate(true);

          // 1. Clear current inventory and state for the test
          stateManagerInstance.clearInventory();

          // 2. Populate base inventory, considering excludedItems
          const itemPool = stateManagerInstance.getItemPoolCounts(); // Assumes getter for itempool_counts
          const allItemData = stateManagerInstance.getAllItemData(); // Assumes getter for all item data

          log(
            'info',
            '[SMW APPLY_TEST] Item Pool for test:',
            JSON.stringify(itemPool)
          );
          log(
            'info',
            '[SMW APPLY_TEST] Excluded items for test:',
            JSON.stringify(excludedItems)
          );

          // Populate base inventory only if there are excluded items or required items
          // If both requiredItems and excludedItems are empty, start with empty inventory
          const shouldPopulateBaseInventory =
            excludedItems.length > 0 || requiredItems.length > 0;

          if (shouldPopulateBaseInventory) {
            // Create a combined exclusion list that includes both explicit exclusions and required items
            // This prevents double-adding items that are both in the item pool and in the required items list
            const combinedExclusions = [...excludedItems];
            requiredItems.forEach((item) => {
              const itemName = typeof item === 'string' ? item : item.name;
              if (itemName && !combinedExclusions.includes(itemName)) {
                combinedExclusions.push(itemName);
              }
            });

            if (itemPool && Object.keys(itemPool).length > 0) {
              log(
                'info',
                '[SMW APPLY_TEST] Using itempool_counts for base inventory (respecting exclusions and required items).'
              );
              Object.entries(itemPool).forEach(([itemName, count]) => {
                if (itemName.startsWith('__')) return; // Skip special config values like __max_progressive_bottle
                if (combinedExclusions.includes(itemName)) return; // Skip excluded items AND required items
                if (
                  itemName.includes('Bottle') &&
                  combinedExclusions.includes('AnyBottle')
                )
                  return;

                const itemDef = allItemData ? allItemData[itemName] : null;
                if (itemDef && (itemDef.event || itemDef.id === 0 || itemDef.id === null))
                  return; // Skip event items

                for (let i = 0; i < count; i++) {
                  stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
                }
              });
            } else if (allItemData) {
              log(
                'info',
                '[SMW APPLY_TEST] No itempool_counts available. Using all non-event items for base inventory (respecting exclusions and required items).'
              );
              Object.keys(allItemData).forEach((itemName) => {
                if (combinedExclusions.includes(itemName)) return; // Skip excluded items AND required items
                if (
                  itemName.includes('Bottle') &&
                  combinedExclusions.includes('AnyBottle')
                )
                  return;

                const itemDef = allItemData[itemName];
                if (itemDef && (itemDef.event || itemDef.id === 0 || itemDef.id === null))
                  return; // Skip event items
                stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
              });
            } else {
              log(
                'warn',
                '[SMW APPLY_TEST] No itemPool or allItemData available to derive base inventory.'
              );
            }
          } else {
            log(
              'info',
              '[SMW APPLY_TEST] Both requiredItems and excludedItems are empty. Starting with empty inventory.'
            );
          }

          // 3. Handle progressive items that might have been excluded
          // This ensures that if a base progressive item (e.g., "ProgressiveSword") is excluded,
          // its constituent items (e.g., "FighterSword", "MasterSword") are also not present
          // if they were part of the base set.
          if (excludedItems.length > 0 && stateManagerInstance.inventory) {
            excludedItems.forEach((excludedItemName) => {
              if (
                stateManagerInstance.inventory.isProgressiveBaseItem(
                  excludedItemName
                )
              ) {
                const providedItems =
                  stateManagerInstance.inventory.getProgressiveProvidedItems(
                    excludedItemName
                  );
                providedItems.forEach((providedItemName) => {
                  // If the inventory somehow has this item after the base population, remove it.
                  // This is more of a safeguard; ideally, they wouldn't be added if the base is excluded.
                  // stateManagerInstance.removeItemFromInventory(providedItemName, stateManagerInstance.inventory.count(providedItemName), true);
                  // For now, we rely on the initial exclusion. More complex progressive removal might be needed
                  // if the base set could add individual progressive stages.
                  // The primary goal here is that `addItemToInventory` for the *required* progressive item later
                  // will correctly set its stage.
                });
              }
            });
          }

          // 4. Add required items
          if (requiredItems.length > 0) {
            requiredItems.forEach((item) => {
              const itemName = typeof item === 'string' ? item : item.name;
              const quantity =
                typeof item === 'string' ? 1 : item.quantity || 1;
              if (itemName) {
                for (let i = 0; i < quantity; i++) {
                  stateManagerInstance.addItemToInventory(itemName); // Now respects batch mode
                }
              }
            });
          }

          // 5. Commit batch update - this will trigger cache invalidation, region computation, and snapshot update
          stateManagerInstance.commitBatchUpdate();

          // 6. Get the new full snapshot
          const newSnapshot = stateManagerInstance.getSnapshot();
          const newInventory =
            newSnapshot.inventory || stateManagerInstance.getInventory(); // Prefer snapshot, fallback to direct getter

          // 7. Get the specific accessibility result for the location under test
          let locationAccessibilityResult = false;
          // The result should be determined based on the newSnapshot
          if (newSnapshot.locations && newSnapshot.locations[locationName]) {
            locationAccessibilityResult =
              newSnapshot.locations[locationName].accessible;
          } else {
            // Find the location object and evaluate accessibility directly
            try {
              // locations is an object, not an array, so we need to convert it
              const locationsArray = stateManagerInstance.locations
                ? (Array.isArray(stateManagerInstance.locations)
                    ? stateManagerInstance.locations
                    : Object.values(stateManagerInstance.locations))
                : [];
              const locationObject = locationsArray.find(
                (loc) => loc.name === locationName
              );
              if (locationObject) {
                locationAccessibilityResult =
                  stateManagerInstance.isLocationAccessible(locationObject);
              } else {
                log(
                  'warn',
                  `[stateManagerWorker] Location object not found: ${locationName}`
                );
                locationAccessibilityResult = false;
              }
            } catch (locEvalError) {
              log(
                'error',
                `[SMW] Error explicitly evaluating ${locationName} after inventory set:`,
                locEvalError
              );
              locationAccessibilityResult = false; // Default to false on error
            }
          }

          log(
            'info',
            `[stateManagerWorker] APPLY_TEST_INVENTORY_AND_EVALUATE for "${locationName}" - Evaluated Accessibility: ${locationAccessibilityResult}`
          );

          // 8. Post back the response via queryId
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            result: {
              newSnapshot: newSnapshot,
              newInventory: newInventory,
              locationAccessibilityResult: locationAccessibilityResult,
              originalLocationName: locationName, // Echo back for clarity in proxy
            },
          });
        } catch (testEvalError) {
          log(
            'error',
            '[StateManagerWorker] Error during APPLY_TEST_INVENTORY_AND_EVALUATE logic:',
            testEvalError
          );

          // Ensure batch mode is properly cleaned up if an error occurs
          if (stateManagerInstance && stateManagerInstance._batchMode) {
            try {
              stateManagerInstance.commitBatchUpdate();
            } catch (batchError) {
              log(
                'error',
                '[StateManagerWorker] Error cleaning up batch mode after test error:',
                batchError
              );
            }
          }

          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Error processing APPLY_TEST_INVENTORY_AND_EVALUATE: ${testEvalError.message}`,
          });
        }
        break;

      case 'clearStateAndReset':
        log('debug', '[Worker] Received clearStateAndReset command');
        if (stateManagerInstance) {
          stateManagerInstance.clearState({ recomputeAndSendUpdate: true });
        }
        break;

      case 'clearEventItems':
        log('debug', '[Worker] Received clearEventItems command');
        if (stateManagerInstance) {
          stateManagerInstance.clearEventItems({ recomputeAndSendUpdate: true });
        }
        break;

      case 'setAutoCollectEventsConfig':
        log(
          'debug',
          '[Worker] Received setAutoCollectEventsConfig command',
          message.payload
        );
        if (
          stateManagerInstance &&
          message.payload &&
          typeof message.payload.enabled === 'boolean'
        ) {
          stateManagerInstance.setAutoCollectEventsConfig(
            message.payload.enabled
          );
        } else {
          log(
            'warn',
            '[Worker] Invalid payload for setAutoCollectEventsConfig:',
            message.payload
          );
        }
        break;

      case 'setSpoilerTestMode':
        log(
          'debug',
          '[Worker] Received setSpoilerTestMode command',
          message.payload
        );
        if (
          stateManagerInstance &&
          message.payload &&
          typeof message.payload.enabled === 'boolean'
        ) {
          stateManagerInstance.setSpoilerTestMode(
            message.payload.enabled
          );
        } else {
          log(
            'warn',
            '[Worker] Invalid payload for setSpoilerTestMode:',
            message.payload
          );
        }
        break;

      case STATE_MANAGER_COMMANDS.RECALCULATE_ACCESSIBILITY:
        log('debug', '[Worker] Received recalculateAccessibility command');
        if (!stateManagerInstance) {
          log('error', '[Worker] StateManager not initialized for recalculateAccessibility');
          break;
        }
        try {
          // Invalidate the reachability cache
          stateManagerInstance.invalidateCache();

          // Recompute reachable regions (this also handles auto-collection of event items)
          stateManagerInstance.computeReachableRegions();

          // Send updated snapshot to main thread
          stateManagerInstance._sendSnapshotUpdate();

          log('info', '[Worker] Accessibility recalculated successfully');
        } catch (error) {
          log('error', '[Worker] Error recalculating accessibility:', error);
        }
        break;

      case 'updateWorkerLogConfig':
        log(
          'debug',
          '[Worker] Received updateWorkerLogConfig command',
          message.payload
        );
        if (message.payload && typeof message.payload.config === 'object') {
          if (typeof self.setWorkerLogConfig === 'function') {
            self.setWorkerLogConfig(message.payload.config);
            log('info', '[Worker] Updated worker log config.');
          } else {
            log('warn', '[Worker] self.setWorkerLogConfig is not a function.');
          }
        } else {
          log(
            'warn',
            '[Worker] Invalid payload for updateWorkerLogConfig:',
            message.payload
          );
        }
        break;

      default:
        log(
          'warn',
          '[stateManagerWorker onmessage] Received unhandled command:',
          message.command,
          message
        );
        if (message.queryId) {
          self.postMessage({
            type: 'queryResponse',
            queryId: message.queryId,
            error: `Unknown command: ${message.command}`,
          });
        }
    }
  } catch (error) {
    log(
      'error',
      '[stateManagerWorker onmessage] Error processing command:',
      message.command,
      error
    );

    // Get queue status for enhanced diagnostics
    const queueStatus = commandQueue ? commandQueue.getSnapshot() : {
      pending: 0,
      processing: false,
      currentCommand: 'unknown'
    };

    self.postMessage({
      type: 'workerError',
      command: message.command,
      correlationId: message.correlationId || (message.payload && message.payload.correlationId),
      errorMessage: error.message,
      errorStack: error.stack,
      queryId: message.queryId,
      timestamp: Date.now(),
      queueStatus: {
        pending: queueStatus.pending,
        completed: queueStatus.completed,
        failed: queueStatus.failed,
        processing: queueStatus.processing,
        currentCommand: message.command
      },
      context: {
        workerInitialized: workerInitialized,
        stateManagerExists: !!stateManagerInstance,
        expectResponse: message.expectResponse
      }
    });
  }
}

/**
 * Phase 8: Main Message Handler
 *
 * Receives messages from main thread and enqueues them for processing.
 * Sends immediate acknowledgment for most commands.
 */
self.onmessage = async function (e) {
  const message = e.data;
  const { command, queryId, payload, config, expectResponse, correlationId } = message; // Extract all fields including correlationId

  log('info', '[stateManagerWorker onmessage] Received command:', command, 'queryId:', queryId, 'correlationId:', correlationId);

  // Check if queue is enabled (for testing/comparison)
  if (!QUEUE_ENABLED || !commandQueue.enabled) {
    log('info', '[stateManagerWorker] Queue disabled, executing directly');
    // For direct execution, pass the entire message to preserve all properties
    const directMessage = { command, queryId, payload, config, expectResponse, correlationId };
    await handleMessage(directMessage);
    return;
  }

  // Enqueue command with full message data
  // Store the entire message in payload to preserve all properties including expectResponse and correlationId
  const fullPayload = config
    ? { ...payload, config, expectResponse, correlationId }
    : { ...payload, expectResponse, correlationId };
  const entry = commandQueue.enqueue(command, queryId, fullPayload);

  // NOTE: We don't send commandEnqueued acknowledgments anymore.
  // Fire-and-forget commands (expectResponse=false) resolve immediately in the proxy.
  // Query commands (expectResponse=true) wait for queryResponse from command execution.

  // Start processing if not already running
  if (!commandQueue.processing) {
    processQueue();
  }
};

// --- END: Queue-based onmessage Handler ---

// Worker ready message using console directly to avoid circular dependency
// console.log(
//   '[stateManagerWorker] Worker is ready to receive messages via new onmessage handler.'
// );

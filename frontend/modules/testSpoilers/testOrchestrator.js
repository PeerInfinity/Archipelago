/**
 * Test Orchestrator Module for Test Spoilers
 *
 * Handles test preparation, execution orchestration, and result aggregation.
 * Coordinates between EventProcessor and UI layer.
 *
 * Extracted from testSpoilerUI.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Spoiler log data + configuration
 *   - spoilerLogData: Array<Object> (parsed events from log file)
 *   - playerId: number (player context)
 *   - logPath: string (path to loaded log)
 *   - configuration: stopOnFirstError, eventProcessingDelay, etc.
 *
 * Processing:
 *   1. prepareSpoilerTest() - Initialize test state, load sphere log
 *   2. runFullSpoilerTest() - Execute all events with error handling
 *   3. stepSpoilerTest() - Process one event at a time
 *   4. updateStepInfo() - Update UI with progress information
 *
 * Output: Test results and UI updates
 *   - Test pass/fail status
 *   - Detailed mismatch information
 *   - Progress tracking
 *   - UI control updates
 */

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('testSpoilerUI:TestOrchestrator');

export class TestOrchestrator {
  constructor(eventProcessor, uiCallbacks, stateConfig) {
    this.eventProcessor = eventProcessor;
    this.uiCallbacks = uiCallbacks;  // Callbacks for UI updates
    this.stateConfig = stateConfig;  // Configuration state from UI

    // Test orchestration state
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.abortController = null;

    logger.debug('TestOrchestrator constructor called');
  }

  /**
   * Prepares the test by initializing state and loading sphere log
   *
   * DATA FLOW:
   * Input: Test initialization parameters
   *   ├─> spoilerLogData: Array (events to test)
   *   ├─> playerId: number (player to test)
   *   ├─> logPath: string (path to log file)
   *   ├─> isAutoLoad: boolean (auto vs manual load)
   *
   * Processing:
   *   ├─> Validate spoilerLogData exists and has events
   *   ├─> Reset test state
   *   │   ├─> currentLogIndex = 0
   *   │   ├─> Clear event processor inventory tracking
   *   │   ├─> Clear mismatch details
   *   ├─> Load sphere log into sphereState
   *   ├─> Set current player ID
   *   ├─> Disable auto-collect events
   *   ├─> Mark test as initialized
   *
   * Output: Test ready state
   *   ├─> testStateInitialized = true
   *   ├─> UI updated with test controls (via callbacks)
   *   └─> Ready for runFullTest or stepTest
   *
   * @param {Array} spoilerLogData - Events to test
   * @param {number} playerId - Player ID
   * @param {string} logPath - Path to log file (for logging and sphereState)
   * @param {boolean} isAutoLoad - Auto vs manual load
   * @returns {Promise<boolean>} True if preparation succeeded
   */
  async prepareSpoilerTest(spoilerLogData, playerId, logPath, isAutoLoad = false) {
    logger.debug(`[prepareSpoilerTest] playerId at start: ${playerId}`);

    // Clear UI
    this.uiCallbacks.clearContainer();
    this.uiCallbacks.ensureLogContainerReady();
    this.uiCallbacks.clearLog();

    // Reset state
    logger.debug(`[prepareSpoilerTest] Resetting currentLogIndex from ${this.currentLogIndex} to 0`);
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.eventProcessor.resetInventoryTracking();
    this.abortController = new AbortController();
    logger.debug(`[prepareSpoilerTest] Reset complete. currentLogIndex=${this.currentLogIndex}, testStateInitialized=${this.testStateInitialized}`);

    // Validate log data
    if (!spoilerLogData || spoilerLogData.length === 0) {
      this.uiCallbacks.log(
        'error',
        'Cannot prepare spoiler test: No spoiler log data is loaded or data is empty.'
      );
      this.uiCallbacks.renderManualFileSelectionView(
        'Error: Spoiler log data is missing or empty. Please load a valid log.'
      );
      return false;
    }

    // Log with fallback handling
    const displayLogName = logPath || 'Unknown Log';
    this.uiCallbacks.log(
      'info',
      `Preparing test for: ${displayLogName}`
    );
    this.uiCallbacks.log(
      'info',
      `Using ${spoilerLogData.length} events from ${
        isAutoLoad ? 'auto-loaded' : 'selected'
      } log: ${displayLogName}`
    );

    // Assuming StateManager already has the correct rules context.
    // No need to explicitly load rules here.
    this.uiCallbacks.log(
      'info',
      'Skipping explicit rule loading. Assuming StateManager has current rules.'
    );

    // Load sphere log into sphereState
    try {
      if (window.centralRegistry && typeof window.centralRegistry.getPublicFunction === 'function') {
        const loadSphereLog = window.centralRegistry.getPublicFunction('sphereState', 'loadSphereLog');
        const setCurrentPlayerId = window.centralRegistry.getPublicFunction('sphereState', 'setCurrentPlayerId');

        if (loadSphereLog && setCurrentPlayerId) {
          // Set player ID first
          if (playerId) {
            setCurrentPlayerId(playerId);
            this.uiCallbacks.log('info', `Set sphereState player ID to: ${playerId}`);
          }

          // Load the sphere log
          this.uiCallbacks.log('info', `Loading sphere log into sphereState: ${logPath}`);
          const success = await loadSphereLog(logPath);

          if (success) {
            this.uiCallbacks.log('info', 'Sphere log successfully loaded into sphereState');
          } else {
            this.uiCallbacks.log('warn', 'Failed to load sphere log into sphereState');
          }
        } else {
          this.uiCallbacks.log('warn', 'sphereState loadSphereLog or setCurrentPlayerId function not available');
        }
      }
    } catch (error) {
      this.uiCallbacks.log('error', `Error loading sphere log into sphereState: ${error.message}`);
    }

    // Disable auto-event collection for the test
    try {
      await stateManager.setAutoCollectEventsConfig(false);
      this.uiCallbacks.log(
        'info',
        '[TestOrchestrator] Disabled auto-collect events for test duration.'
      );
    } catch (error) {
      this.uiCallbacks.log(
        'error',
        '[TestOrchestrator] Failed to disable auto-collect events:',
        error
      );
      // Decide if we should proceed or halt if this fails. For now, log and continue.
    }

    // Update UI
    this.uiCallbacks.renderResultsControls();
    this.updateStepInfo(spoilerLogData, logPath);
    this.uiCallbacks.log('info', 'Preparation complete. Ready to run or step.');
    this.testStateInitialized = true;

    return true;
  }

  /**
   * Runs the full test from current position to end
   *
   * DATA FLOW:
   * Input: Initialized test state
   *   ├─> spoilerLogData: Array (all events)
   *   ├─> playerId: number (player context)
   *   ├─> logPath: string (for logging)
   *   ├─> stopOnFirstError: boolean (halt on mismatch)
   *
   * Processing:
   *   ├─> Prepare test (if not already initialized)
   *   ├─> Create abort controller for cancellation
   *   ├─> Log test start
   *   ├─> Loop through all events:
   *   │   ├─> Check for abort signal
   *   │   ├─> Process single event (via eventProcessor.processSingleEvent())
   *   │   ├─> Check for errors
   *   │   ├─> If error and stopOnFirstError:
   *   │   │   ├─> Capture mismatch details
   *   │   │   └─> Break loop
   *   │   └─> Increment index
   *   ├─> Generate summary statistics
   *   ├─> Log final results
   *   ├─> Re-enable auto-collect events
   *
   * Output: Test results
   *   ├─> allEventsPassedSuccessfully: boolean
   *   ├─> mismatchDetails: Array (detailed error info)
   *   ├─> Summary in log container (via callbacks)
   *   └─> Updated UI controls (via callbacks)
   *
   * @param {Array} spoilerLogData - Events to test
   * @param {number} playerId - Player ID
   * @param {string} logPath - Path to log file (for logging)
   * @returns {Promise<void>}
   */
  async runFullSpoilerTest(spoilerLogData, playerId, logPath) {
    logger.info(
      `[runFullSpoilerTest] Starting full spoiler test. playerId: ${playerId}`
    );

    // Prepare test if not already initialized
    const prepareSuccess = await this.prepareSpoilerTest(spoilerLogData, playerId, logPath);

    logger.info(`[runFullSpoilerTest] After prepareSpoilerTest: testStateInitialized=${this.testStateInitialized}, currentLogIndex=${this.currentLogIndex}`);

    if (!prepareSuccess || !this.testStateInitialized) {
      this.uiCallbacks.log(
        'error',
        'Cannot run full test: Test state not initialized (likely no valid log data).'
      );
      return;
    }

    const currentAbortController = this.abortController;

    if (!currentAbortController) {
      this.uiCallbacks.log(
        'error',
        'CRITICAL: AbortController is null immediately after prepareSpoilerTest in runFullSpoilerTest.'
      );
      this.uiCallbacks.log(
        'error',
        `Current log path: ${logPath}, Data length: ${
          spoilerLogData ? spoilerLogData.length : 'N/A'
        }`
      );
      return;
    }

    if (!spoilerLogData) {
      this.uiCallbacks.log('error', 'No log events loaded.');
      return;
    }

    this.uiCallbacks.log('step', '4. Processing all log events...');

    // Disable buttons during test
    this.uiCallbacks.setButtonsEnabled(false);

    let allEventsPassedSuccessfully = true;
    let detailedErrorMessages = [];
    let sphereResults = [];
    let mismatchDetails = [];

    try {
      logger.info(`Starting main processing loop. Total events to process: ${spoilerLogData.length}`);

      while (this.currentLogIndex < spoilerLogData.length) {
        logger.debug(`Loop iteration: currentLogIndex=${this.currentLogIndex}, totalEvents=${spoilerLogData.length}`);

        if (currentAbortController.signal.aborted) {
          this.uiCallbacks.log('warn', `Processing aborted at event ${this.currentLogIndex + 1}`);
          throw new DOMException('Aborted', 'AbortError');
        }

        const event = spoilerLogData[this.currentLogIndex];
        logger.debug(`About to process event ${this.currentLogIndex + 1}: ${JSON.stringify(event).substring(0, 200)}...`);

        // Set context for event processor
        this.eventProcessor.setContext(this.currentLogIndex, spoilerLogData, playerId);

        const eventProcessingResult = await this.eventProcessor.processSingleEvent(event);
        logger.debug(`Completed processing event ${this.currentLogIndex + 1}, result: ${JSON.stringify(eventProcessingResult)}`);

        // Capture detailed sphere results
        const sphereResult = {
          eventIndex: this.currentLogIndex,
          sphereIndex: event.sphere_index !== undefined ? event.sphere_index : this.currentLogIndex + 1,
          eventType: event.type,
          passed: !eventProcessingResult?.error,
          message: eventProcessingResult?.message || 'Processed successfully',
          details: eventProcessingResult?.details || null
        };
        sphereResults.push(sphereResult);

        if (eventProcessingResult && eventProcessingResult.error) {
          allEventsPassedSuccessfully = false;
          const errorMessage = `Mismatch for event ${
            this.currentLogIndex + 1
          } (Sphere ${
            event.sphere_index !== undefined ? event.sphere_index : 'N/A'
          }): ${eventProcessingResult.message}`;
          this.uiCallbacks.log('error', errorMessage);
          detailedErrorMessages.push(errorMessage);

          // Capture ALL detailed mismatch information (locations AND regions)
          const currentMismatchDetailsArray = this.eventProcessor.getMismatchDetailsArray();
          if (currentMismatchDetailsArray && currentMismatchDetailsArray.length > 0) {
            // Push all mismatch details (handles both location and region mismatches for same event)
            mismatchDetails.push(...currentMismatchDetailsArray.map(detail => ({
              eventIndex: this.currentLogIndex,
              sphereIndex: sphereResult.sphereIndex,
              ...detail
            })));
          }

          // Check if we should stop on this error
          if (this.stateConfig.stopOnFirstError) {
            this.uiCallbacks.log(
              'warn',
              'Test run halted due to "Stop on first error" being enabled.'
            );
            break;
          }
        }

        // Add a small delay to allow UI updates and prevent blocking
        logger.debug(`Adding delay of ${this.stateConfig.eventProcessingDelayMs}ms before next event`);
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, this.stateConfig.eventProcessingDelayMs)
          );
          logger.debug(`Delay completed successfully`);
        } catch (delayError) {
          logger.error(`Error during delay: ${delayError.message}`);
          throw delayError;
        }

        try {
          this.currentLogIndex++;
          logger.debug(`Incremented currentLogIndex to ${this.currentLogIndex}`);

          this.updateStepInfo(spoilerLogData, logPath);
          logger.debug(`updateStepInfo() completed`);

          logger.debug(`About to check loop condition: ${this.currentLogIndex} < ${spoilerLogData.length} = ${this.currentLogIndex < spoilerLogData.length}`);
        } catch (incrementError) {
          logger.error(`Error during loop increment/update: ${incrementError.message}`);
          throw incrementError;
        }
      }

      // --- Final Result Determination ---
      logger.info(`Exited main processing loop. Final currentLogIndex: ${this.currentLogIndex}, Total events: ${spoilerLogData.length}`);

      if (currentAbortController.signal.aborted) {
        this.uiCallbacks.log('info', 'Spoiler test aborted by user.');
      } else if (allEventsPassedSuccessfully) {
        this.uiCallbacks.log(
          'success',
          'Spoiler test completed successfully. All events matched.'
        );
      } else {
        this.uiCallbacks.log(
          'error',
          `Spoiler test completed with ${detailedErrorMessages.length} mismatch(es). See logs above for details.`
        );
      }
    } catch (error) {
      // This catch block now primarily handles unexpected errors or aborts, not first mismatch.
      if (error.name === 'AbortError') {
        this.uiCallbacks.log('info', 'Spoiler test aborted.');
      } else {
        this.uiCallbacks.log(
          'error',
          `Critical error during spoiler test execution at step ${
            this.currentLogIndex + 1
          }: ${error.message}`
        );
        logger.error(
          `Critical Spoiler Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
        allEventsPassedSuccessfully = false;
      }
    } finally {
      // Re-enable buttons
      this.uiCallbacks.setButtonsEnabled(true);

      // Store detailed test results
      const detailedTestResults = {
        passed: allEventsPassedSuccessfully,
        logEntries: [],
        errorMessages: detailedErrorMessages,
        sphereResults: sphereResults,
        mismatchDetails: mismatchDetails,
        totalEvents: spoilerLogData ? spoilerLogData.length : 0,
        processedEvents: this.currentLogIndex,
        testLogPath: logPath,
        playerId: playerId,
        completedAt: new Date().toISOString()
      };

      // Collect log entries from the UI
      const logEntries = this.uiCallbacks.getLogEntries();
      if (logEntries) {
        detailedTestResults.logEntries = logEntries;
      }

      // Store in window for external access (like Playwright tests)
      if (typeof window !== 'undefined') {
        window.__spoilerTestResults__ = detailedTestResults;
        this.uiCallbacks.log(
          'info',
          'Detailed spoiler test results stored in window.__spoilerTestResults__'
        );
      }

      // Store in localStorage as backup
      try {
        localStorage.setItem(
          '__spoilerTestResults__',
          JSON.stringify(detailedTestResults)
        );
        this.uiCallbacks.log(
          'info',
          'Detailed spoiler test results stored in localStorage'
        );
      } catch (e) {
        this.uiCallbacks.log(
          'warn',
          `Could not store detailed results in localStorage: ${e.message}`
        );
      }

      // Re-enable auto-collect events
      try {
        await stateManager.setAutoCollectEventsConfig(true);
        this.uiCallbacks.log(
          'info',
          '[TestOrchestrator] Re-enabled auto-collect events after full test run.'
        );
      } catch (error) {
        this.uiCallbacks.log(
          'error',
          '[TestOrchestrator] Failed to re-enable auto-collect events after full test:',
          error
        );
      }
    }
  }

  /**
   * Steps through one event in the test
   *
   * DATA FLOW:
   * Input: Initialized test state
   *   ├─> spoilerLogData: Array (all events)
   *   ├─> playerId: number (player context)
   *   ├─> logPath: string (for logging)
   *
   * Processing:
   *   ├─> Check if test is initialized
   *   ├─> Check if at end of events
   *   ├─> Process current event (via eventProcessor.processSingleEvent())
   *   ├─> Increment currentLogIndex
   *   ├─> Update UI with new position (via callbacks)
   *
   * Output: Single step result
   *   ├─> Event processed
   *   ├─> Index advanced
   *   └─> UI updated with new step info
   *
   * @param {Array} spoilerLogData - Events to test
   * @param {number} playerId - Player ID
   * @param {string} logPath - Path to log file (for logging)
   * @returns {Promise<void>}
   */
  async stepSpoilerTest(spoilerLogData, playerId, logPath) {
    if (!this.testStateInitialized) {
      const prepareSuccess = await this.prepareSpoilerTest(spoilerLogData, playerId, logPath);
      if (!prepareSuccess || !this.testStateInitialized) {
        this.uiCallbacks.log(
          'error',
          'Cannot step test: Test state not initialized after preparation attempt.'
        );
        return;
      }
    }

    if (!spoilerLogData) {
      this.uiCallbacks.log('error', 'No log events loaded.');
      return;
    }

    if (this.currentLogIndex >= spoilerLogData.length) {
      this.uiCallbacks.log('info', 'End of log file reached.');
      return;
    }

    // Disable buttons during step
    this.uiCallbacks.setButtonsEnabled(false);

    try {
      // Set context for event processor
      this.eventProcessor.setContext(this.currentLogIndex, spoilerLogData, playerId);

      await this.eventProcessor.processSingleEvent(spoilerLogData[this.currentLogIndex]);
      this.currentLogIndex++;
      this.updateStepInfo(spoilerLogData, logPath);

      if (this.currentLogIndex >= spoilerLogData.length) {
        this.uiCallbacks.log(
          'success',
          'Spoiler test completed successfully (stepped to end).'
        );
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.uiCallbacks.log('info', 'Spoiler step aborted.');
      } else {
        this.uiCallbacks.log(
          'error',
          `Test failed at step ${this.currentLogIndex + 1}: ${error.message}`
        );
        logger.error(
          `Spoiler Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
      }
    } finally {
      // Re-enable buttons
      this.uiCallbacks.setButtonsEnabled(true);
      // Note: Auto-collect events remains disabled throughout a sequence of steps.
      // It will be re-enabled by runFullSpoilerTest's finally, or by clearTestState/dispose.
    }
  }

  /**
   * Updates UI with current step info
   *
   * @param {Array} spoilerLogData - Events array (for count)
   * @param {string} logPath - Path to log file
   */
  updateStepInfo(spoilerLogData, logPath) {
    this.uiCallbacks.updateStepInfo(
      this.currentLogIndex,
      spoilerLogData ? spoilerLogData.length : 0,
      logPath
    );
  }

  /**
   * Resets test orchestration state
   */
  resetTestState() {
    logger.info('Resetting test orchestration state');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
  }

  /**
   * Aborts currently running test
   */
  abortTest() {
    if (this.abortController) {
      logger.info('Aborting current test');
      this.abortController.abort();
    }
  }

  /**
   * Gets current test progress
   * @returns {Object} Progress info: {currentIndex, total, initialized}
   */
  getProgress() {
    return {
      currentIndex: this.currentLogIndex,
      initialized: this.testStateInitialized
    };
  }
}

export default TestOrchestrator;

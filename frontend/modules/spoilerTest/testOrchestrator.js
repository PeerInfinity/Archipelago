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
 *
 * @module spoilerTest/testOrchestrator
 */

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import { profiler } from '../shared/profiler.js';

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

    // Worker-side spoiler test configuration
    // When true, runs the entire test in the worker thread for better performance
    this.useWorkerSideSpoilerTest = true;

    // Message handler for worker-side test progress
    this._workerMessageHandler = null;

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
   * @param {string|null} rawContent - Raw JSONL content (optional, avoids re-serialization)
   * @returns {Promise<boolean>} True if preparation succeeded
   */
  async prepareSpoilerTest(spoilerLogData, playerId, logPath, isAutoLoad = false, rawContent = null) {
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

    // Filter out non-state_update events (like log_header) for processing
    // These metadata events are handled by sphereState, not by the test processor
    const filteredLogData = spoilerLogData.filter(event => event.type === 'state_update');
    const skippedEvents = spoilerLogData.length - filteredLogData.length;

    if (filteredLogData.length === 0) {
      this.uiCallbacks.log(
        'error',
        'Cannot prepare spoiler test: No state_update events found in log.'
      );
      this.uiCallbacks.renderManualFileSelectionView(
        'Error: No state_update events found in log file.'
      );
      return false;
    }

    // Use filtered data for processing
    spoilerLogData = filteredLogData;

    // Log with fallback handling
    const displayLogName = logPath || 'Unknown Log';
    this.uiCallbacks.log(
      'info',
      `Preparing test for: ${displayLogName}`
    );
    this.uiCallbacks.log(
      'info',
      `Using ${spoilerLogData.length} state_update events from ${
        isAutoLoad ? 'auto-loaded' : 'selected'
      } log: ${displayLogName}${skippedEvents > 0 ? ` (${skippedEvents} metadata event${skippedEvents > 1 ? 's' : ''} skipped)` : ''}`
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
          // Use rawContent if available (from file upload), otherwise fall back to re-serializing
          const jsonlContent = rawContent || spoilerLogData.map(event => JSON.stringify(event)).join('\n');
          this.uiCallbacks.log('info', `Loading sphere log into sphereState: ${logPath}${rawContent ? ' (using raw content)' : ' (re-serialized)'}`);
          const success = await loadSphereLog(logPath, jsonlContent);

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
      // Ping worker to ensure the config change is fully processed before continuing
      // This is critical because setAutoCollectEventsConfig is fire-and-forget
      await stateManager.pingWorker('auto_collect_events_disabled', 5000);
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

    // Enable spoiler test mode (filters non-advancement items to match Python CollectionState)
    try {
      await stateManager.setSpoilerTestMode(true);
      // Ping worker to ensure spoiler test mode is fully enabled before continuing
      await stateManager.pingWorker('spoiler_test_mode_enabled', 5000);
      this.uiCallbacks.log(
        'info',
        '[TestOrchestrator] Enabled spoiler test mode for test duration.'
      );
    } catch (error) {
      this.uiCallbacks.log(
        'error',
        '[TestOrchestrator] Failed to enable spoiler test mode:',
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
   * Get sphere data from sphereState module for worker-side execution
   *
   * @returns {Array|null} Array of sphere data objects or null if unavailable
   */
  getSphereDataForWorker() {
    try {
      if (!window.centralRegistry || typeof window.centralRegistry.getPublicFunction !== 'function') {
        logger.warn('centralRegistry not available');
        return null;
      }

      const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');
      if (!getSphereData) {
        logger.warn('sphereState getSphereData not available');
        return null;
      }

      const sphereData = getSphereData();
      if (!sphereData || sphereData.length === 0) {
        logger.warn('No sphere data available from sphereState');
        return null;
      }

      logger.info(`Got ${sphereData.length} spheres from sphereState`);
      return sphereData;
    } catch (error) {
      logger.error('Error getting sphere data:', error);
      return null;
    }
  }

  /**
   * Run spoiler test entirely in worker thread
   *
   * This method sends all sphere data to the worker and lets it process
   * the entire test internally, eliminating round-trip communication overhead.
   *
   * @param {Array} sphereData - Pre-processed sphere data from sphereState
   * @param {number} playerId - Player ID
   * @param {string} logPath - Path to log file (for logging)
   * @returns {Promise<Object>} Test results
   */
  async runWorkerSideSpoilerTest(sphereData, playerId, logPath) {
    logger.info(`Running worker-side spoiler test with ${sphereData.length} spheres`);

    const currentAbortController = this.abortController;

    // Disable buttons during test
    this.uiCallbacks.setButtonsEnabled(false);

    let testResult = null;

    try {
      profiler.start('spoilerTest');

      // Enable worker-side profiling if profiling is enabled
      if (profiler.enabled) {
        try {
          await stateManager.setWorkerProfiling(true);
          logger.info('Worker profiling enabled');
        } catch (error) {
          logger.warn('Failed to enable worker profiling:', error);
        }
      }

      // Set up message handler for progress updates
      this._setupWorkerMessageHandler(currentAbortController);

      // Build config for worker
      const config = {
        playerId: playerId,
        stopOnFirstError: this.stateConfig.stopOnFirstError !== false, // Default true
        waitForMainThreadAnalysis: false, // TODO: Add UI option for this
        verboseMode: false
      };

      this.uiCallbacks.log('info', `Starting worker-side spoiler test (${sphereData.length} spheres)...`);

      // Run the test in worker
      testResult = await stateManager.runSpoilerTest(sphereData, config);

      // Handle abort
      if (testResult.aborted) {
        this.uiCallbacks.log('info', 'Spoiler test aborted by user.');
      } else if (testResult.passed) {
        this.uiCallbacks.log('success', 'Spoiler test completed successfully. All spheres passed.');
      } else {
        this.uiCallbacks.log(
          'error',
          `Spoiler test completed with ${testResult.mismatchDetails?.length || 0} mismatch(es).`
        );

        // Log mismatch details
        for (const mismatch of (testResult.mismatchDetails || [])) {
          if (mismatch.type === 'locations') {
            this.uiCallbacks.log('error', `Sphere ${mismatch.sphereIndex}: Location mismatch - ` +
              `missing: ${mismatch.missingFromState?.length || 0}, extra: ${mismatch.extraInState?.length || 0}`);
          } else if (mismatch.type === 'regions') {
            this.uiCallbacks.log('error', `Sphere ${mismatch.sphereIndex}: Region mismatch - ` +
              `missing: ${mismatch.missingFromState?.length || 0}, extra: ${mismatch.extraInState?.length || 0}`);
          } else if (mismatch.type === 'pre_check_failure') {
            this.uiCallbacks.log('error', `Sphere ${mismatch.sphereIndex}: ${mismatch.message}`);
          }
        }
      }

      profiler.end('spoilerTest');

    } catch (error) {
      profiler.end('spoilerTest');

      if (error.name === 'AbortError' || currentAbortController?.signal.aborted) {
        this.uiCallbacks.log('info', 'Spoiler test aborted.');
        testResult = { passed: false, aborted: true };
      } else {
        this.uiCallbacks.log('error', `Error during worker-side spoiler test: ${error.message}`);
        logger.error('Worker-side test error:', error);
        testResult = { passed: false, error: error.message };
      }
    } finally {
      // Clean up message handler
      this._cleanupWorkerMessageHandler();

      // Re-enable buttons
      this.uiCallbacks.setButtonsEnabled(true);

      // Store results
      const detailedTestResults = {
        passed: testResult?.passed || false,
        aborted: testResult?.aborted || false,
        mismatchDetails: testResult?.mismatchDetails || [],
        totalEvents: sphereData.length,
        processedEvents: testResult?.processedEvents || 0,
        locationsChecked: testResult?.locationsChecked || 0,
        itemsAdded: testResult?.itemsAdded || 0,
        testLogPath: logPath,
        playerId: playerId,
        workerSide: true,
        completedAt: new Date().toISOString()
      };

      if (typeof window !== 'undefined') {
        window.__spoilerTestResults__ = detailedTestResults;
        this.uiCallbacks.log('info', 'Detailed spoiler test results stored in window.__spoilerTestResults__');

        // Output profiling report if enabled
        if (profiler.enabled) {
          const profilingReport = profiler.report();
          console.log(profilingReport);

          let workerProfilingData = null;
          if (testResult?.profilingData) {
            workerProfilingData = testResult.profilingData;
            // Format and log worker profiling
            const workerReport = this._formatWorkerProfilingReport(workerProfilingData);
            if (workerReport) {
              console.log('\n' + workerReport);
            }
          }

          this.uiCallbacks.log('info', 'Profiling data available in window.__profilingData__');
          window.__profilingData__ = {
            main: profiler.getData(),
            worker: workerProfilingData
          };
        }
      }

      // Re-enable auto-collect events
      try {
        await stateManager.setAutoCollectEventsConfig(true);
        this.uiCallbacks.log('info', '[TestOrchestrator] Re-enabled auto-collect events.');
      } catch (error) {
        this.uiCallbacks.log('error', '[TestOrchestrator] Failed to re-enable auto-collect events:', error);
      }

      // Disable spoiler test mode
      try {
        await stateManager.setSpoilerTestMode(false);
        this.uiCallbacks.log('info', '[TestOrchestrator] Disabled spoiler test mode.');
      } catch (error) {
        this.uiCallbacks.log('error', '[TestOrchestrator] Failed to disable spoiler test mode:', error);
      }
    }

    return testResult;
  }

  /**
   * Set up handler for worker-side test progress messages
   * @private
   */
  _setupWorkerMessageHandler(abortController) {
    // Get the worker from stateManager
    const worker = stateManager.worker;
    if (!worker) {
      logger.warn('No worker available for message handling');
      return;
    }

    this._workerMessageHandler = (event) => {
      const message = event.data;

      if (message.type === 'spoilerTestProgress') {
        // Update UI with progress
        this.currentLogIndex = message.eventIndex;
        this.uiCallbacks.log(
          message.passed ? 'info' : 'error',
          `Sphere ${message.sphereIndex}: ${message.passed ? 'PASS' : 'FAIL'} ` +
          `(${message.locationsChecked} locations, ${message.itemsAdded} items)`
        );

        // Check for abort
        if (abortController?.signal.aborted) {
          stateManager.abortSpoilerTest();
        }
      } else if (message.type === 'spoilerTestMismatch') {
        // Log mismatch details as they happen
        for (const mismatch of (message.mismatches || [])) {
          if (mismatch.type === 'locations') {
            if (mismatch.missingFromState?.length > 0) {
              this.uiCallbacks.log('error', `  Missing locations: ${mismatch.missingFromState.slice(0, 5).join(', ')}` +
                (mismatch.missingFromState.length > 5 ? ` (+${mismatch.missingFromState.length - 5} more)` : ''));
            }
            if (mismatch.extraInState?.length > 0) {
              this.uiCallbacks.log('error', `  Extra locations: ${mismatch.extraInState.slice(0, 5).join(', ')}` +
                (mismatch.extraInState.length > 5 ? ` (+${mismatch.extraInState.length - 5} more)` : ''));
            }
          }
        }
      }
    };

    worker.addEventListener('message', this._workerMessageHandler);
  }

  /**
   * Clean up worker message handler
   * @private
   */
  _cleanupWorkerMessageHandler() {
    if (this._workerMessageHandler) {
      const worker = stateManager.worker;
      if (worker) {
        worker.removeEventListener('message', this._workerMessageHandler);
      }
      this._workerMessageHandler = null;
    }
  }

  /**
   * Format worker profiling data into a readable report
   * @private
   */
  _formatWorkerProfilingReport(data) {
    if (!data || Object.keys(data).length === 0) return null;

    let report = '=== Worker Profiling Report ===\n';
    for (const [name, stats] of Object.entries(data)) {
      report += `${name}: ${stats.total_ms.toFixed(1)}ms (${stats.count} calls, avg ${stats.avg_ms.toFixed(3)}ms)\n`;
    }
    return report;
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

    // Check if we should use worker-side execution
    if (this.useWorkerSideSpoilerTest) {
      const sphereData = this.getSphereDataForWorker();
      if (sphereData && sphereData.length > 0) {
        this.uiCallbacks.log('info', 'Using worker-side spoiler test execution (faster)');
        await this.runWorkerSideSpoilerTest(sphereData, playerId, logPath);
        return;
      } else {
        this.uiCallbacks.log('warn', 'Worker-side execution unavailable, falling back to main-thread execution');
      }
    }

    // Main-thread execution (fallback or when worker-side is disabled)
    this.uiCallbacks.log('step', '4. Processing all log events...');

    // Disable buttons during test
    this.uiCallbacks.setButtonsEnabled(false);

    let allEventsPassedSuccessfully = true;
    let detailedErrorMessages = [];
    let sphereResults = [];
    let mismatchDetails = [];

    try {
      logger.info(`Starting main processing loop. Total events to process: ${spoilerLogData.length}`);
      profiler.start('spoilerTest');

      // Enable worker-side profiling if profiling is enabled
      if (profiler.enabled) {
        try {
          await stateManager.setWorkerProfiling(true);
          logger.info('Worker profiling enabled');
        } catch (error) {
          logger.warn('Failed to enable worker profiling:', error);
        }
      }

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

        profiler.start('processSingleEvent');
        const eventProcessingResult = await this.eventProcessor.processSingleEvent(event);
        profiler.end('processSingleEvent');
        logger.debug(`Completed processing event ${this.currentLogIndex + 1}, result: ${JSON.stringify(eventProcessingResult)}`);

        // Capture detailed sphere results
        const sphereIndex = event.sphere_index !== undefined ? event.sphere_index : this.currentLogIndex + 1;
        const sphereResult = {
          eventIndex: this.currentLogIndex,
          sphereIndex: sphereIndex,
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
      profiler.end('spoilerTest');
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

        // Output profiling report if enabled
        if (profiler.enabled) {
          const profilingReport = profiler.report();
          console.log(profilingReport);

          // Get worker profiling data
          let workerProfilingData = null;
          try {
            const workerResult = await stateManager.getWorkerProfilingReport();
            if (workerResult && workerResult.data) {
              workerProfilingData = workerResult.data;
              console.log('\n' + workerResult.report);
            }
          } catch (error) {
            logger.warn('Failed to get worker profiling report:', error);
          }

          this.uiCallbacks.log('info', 'Profiling data available in window.__profilingData__');
          window.__profilingData__ = {
            main: profiler.getData(),
            worker: workerProfilingData
          };
        }
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

      // Disable spoiler test mode after test completes
      try {
        await stateManager.setSpoilerTestMode(false);
        this.uiCallbacks.log(
          'info',
          '[TestOrchestrator] Disabled spoiler test mode after full test run.'
        );
      } catch (error) {
        this.uiCallbacks.log(
          'error',
          '[TestOrchestrator] Failed to disable spoiler test mode after full test:',
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

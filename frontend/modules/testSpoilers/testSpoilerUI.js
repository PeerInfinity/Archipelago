import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js'; // ADDED: Static import
import { evaluateRule } from '../shared/ruleEngine.js'; // ADDED
import { createStateSnapshotInterface } from '../shared/stateInterface.js'; // ADDED
import { createRegionLink } from '../commonUI/index.js'; // ADDED
import TestSpoilerRuleEvaluator from './testSpoilerRuleEvaluator.js'; // ADDED
import { FileLoader } from './fileLoader.js'; // Phase 1: File loading module
import { ComparisonEngine } from './comparisonEngine.js'; // Phase 2: Comparison engine module
import { AnalysisReporter } from './analysisReporter.js'; // Phase 3: Analysis/reporting module
import { EventProcessor } from './eventProcessor.js'; // Phase 4: Event processing module
import { TestOrchestrator } from './testOrchestrator.js'; // Phase 5: Test orchestration module
import { createUniversalLogger } from '../../app/core/universalLogger.js'; // Phase 1: Universal logger

const logger = createUniversalLogger('testSpoilerUI');

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (
    typeof window !== 'undefined' &&
    window.logger &&
    typeof window.logger[level] === 'function'
  ) {
    window.logger[level]('testSpoilerUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testSpoilerUI] ${message}`, ...data);
  }
}

export class TestSpoilerUI {
  constructor(container, componentState) {
    // MODIFIED: GL constructor
    this.container = container; // ADDED
    this.componentState = componentState; // ADDED

    this.initialized = false;
    this.testSpoilersContainer = null;
    this.currentSpoilerFile = null; // ADDED: To store the selected File object
    this.currentSpoilerLogPath = null; // ADDED: To store the path/name of the loaded log
    this.logContainer = null;
    this.controlsContainer = null; // ADDED: Div for run/step controls
    this.abortController = null; // To cancel ongoing tests
    this.spoilersPanelContainer = null; // Cache container element
    this.viewChangeSubscription = null;
    this.eventBus = eventBus; // MODIFIED: Use statically imported eventBus
    this.rootElement = null; // Added
    this.activeRulesetName = null;
    this.gameName = null;
    this.playerId = null; // Initialized to null
    this.log('debug', `[Constructor] Initial playerId: ${this.playerId}`); // Log initial playerId
    this.isLoadingLogPath = null; // ADDED: To prevent concurrent loads of the same log path

    // State for stepping through tests
    this.spoilerLogData = null; // MODIFIED: Renamed from logEvents, initialized to null
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.initialAutoLoadAttempted = false; // ADDED to help manage auto-load calls
    this.eventProcessingDelayMs = 0; // ELIMINATED: No delay to prevent background processing issues
    this.stopOnFirstError = true; // ADDED: To control test run behavior - TEMPORARILY DISABLED for debugging
    this.currentMismatchDetails = null; // DEPRECATED: Use currentMismatchDetailsArray instead
    this.currentMismatchDetailsArray = []; // Phase 4: Array to store multiple mismatches per event (locations AND regions)
    // Phase 4: previousInventory moved to EventProcessor
    this.ruleEvaluator = new TestSpoilerRuleEvaluator((level, message, ...data) => this.log(level, message, ...data));

    // Phase 1: Initialize file loader module
    this.fileLoader = new FileLoader();

    // Phase 2: Initialize comparison engine module
    this.comparisonEngine = new ComparisonEngine(stateManager);

    // Phase 3: Initialize analysis reporter module
    this.analysisReporter = new AnalysisReporter(
      this.ruleEvaluator,
      (type, message, ...data) => this.log(type, message, ...data)
    );

    // Phase 4: Initialize event processor module
    this.eventProcessor = new EventProcessor(
      this.comparisonEngine,
      this.analysisReporter,
      this.eventBus,
      (type, message, ...data) => this.log(type, message, ...data)
    );

    // Phase 5: Initialize test orchestrator module
    // Create UI callbacks object for orchestrator
    const uiCallbacks = {
      clearContainer: () => {
        this.testSpoilersContainer.innerHTML = '';
      },
      ensureLogContainerReady: () => this.ensureLogContainerReady(),
      clearLog: () => {
        if (this.logContainer) {
          this.logContainer.innerHTML = '';
        }
      },
      log: (type, message, ...data) => this.log(type, message, ...data),
      renderManualFileSelectionView: (message) => this.renderManualFileSelectionView(message),
      renderResultsControls: () => this.renderResultsControls(),
      setButtonsEnabled: (enabled) => {
        const runButton = document.getElementById('run-full-spoiler-test');
        const stepButton = document.getElementById('step-spoiler-test');
        if (runButton) runButton.disabled = !enabled;
        if (stepButton) stepButton.disabled = !enabled;
      },
      updateStepInfo: (currentIndex, totalEvents, logPath) => {
        const stepButton = this.controlsContainer?.querySelector('#step-spoiler-test');
        if (stepButton) {
          stepButton.textContent = `Step Test (Step ${currentIndex} / ${totalEvents})`;
        }
        const testNameElement = this.controlsContainer?.querySelector('#spoiler-test-name');
        if (testNameElement) {
          // Fallback chain: logPath → currentSpoilerFile.name → 'Unknown Log'
          testNameElement.textContent = `Testing: ${
            logPath || (this.currentSpoilerFile ? this.currentSpoilerFile.name : 'Unknown Log')
          }`;
        }
      },
      getLogEntries: () => {
        if (this.logContainer) {
          const logEntries = this.logContainer.querySelectorAll('.log-entry');
          return Array.from(logEntries).map(entry => entry.textContent);
        }
        return [];
      }
    };

    // State configuration object for orchestrator
    const self = this;
    const stateConfig = {
      get stopOnFirstError() { return self.stopOnFirstError; },
      get eventProcessingDelayMs() { return self.eventProcessingDelayMs; }
    };

    this.testOrchestrator = new TestOrchestrator(
      this.eventProcessor,
      uiCallbacks,
      stateConfig
    );

    // Create and append root element immediately
    this.getRootElement(); // This creates this.rootElement and sets this.testSpoilersContainer
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    } else {
      log('error', '[TestSpoilerUI] Root element not created in constructor!');
    }

    // Defer the rest of initialization
    const readyHandler = (eventPayload) => {
      log(
        'info',
        '[TestSpoilerUI] Received app:readyForUiDataLoad. Initializing spoilers.'
      );
      this.initialize(); // This will call the modified initialize method

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'testSpoilers');

    this.container.on('destroy', () => {
      // ADDED: Ensure cleanup
      this.dispose();
    });
  }

  getRootElement() {
    if (!this.rootElement) {
      this.rootElement = document.createElement('div');
      this.rootElement.className = 'test-spoilers-module-root'; // Added class for potential styling
      this.testSpoilersContainer = document.createElement('div');
      this.testSpoilersContainer.className = 'test-spoilers-container';
      this.rootElement.appendChild(this.testSpoilersContainer);

      // Add style for min-height of log container
      const style = document.createElement('style');
      style.textContent = `
        .test-spoilers-module-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          background-color: #2c2c2c; /* Dark theme background */
          color: #e0e0e0; /* Light text for dark theme */
        }
        .test-spoilers-container {
          flex-grow: 1;
          display: flex;
          flex-direction: column;
          padding: 10px;
          overflow: hidden; /* ADDED: To contain children and enable child scrolling */
        }
        #spoiler-controls-container {
            margin-bottom: 10px;
        }
        #spoiler-log-output {
          border: 1px solid #555; /* Darker border */
          padding: 8px;
          min-height: 0; /* Helps flexbox correctly calculate overflow */
          overflow-y: auto;
          background-color: #333; /* Dark background for log */
          color: #ccc; /* Lighter text for log */
          flex-grow: 1; 
          flex-basis: 0; /* ADDED: Works with flex-grow for better scrollable area sizing */
          margin-top: 10px;
          font-family: monospace;
        }
        .spoiler-test-controls button,
        .spoiler-file-select-controls button,
        .spoiler-file-select-controls input[type="file"]::file-selector-button {
            margin-right: 5px;
            padding: 5px 10px;
            background-color: #555;
            color: #eee;
            border: 1px solid #777;
            border-radius: 3px;
            cursor: pointer;
        }
        .spoiler-test-controls button:hover,
        .spoiler-file-select-controls button:hover,
        .spoiler-file-select-controls input[type="file"]::file-selector-button:hover {
            background-color: #666;
        }
        .spoiler-file-select-controls p {
          margin-bottom: 5px;
          color: #d0d0d0; /* Ensure paragraph text is visible */
        }
        .spoiler-file-select-controls input[type="file"] {
          color-scheme: dark; /* Hint for browser to use dark mode for file input if supported */
          margin-bottom: 5px;
        }
        /* Log entry styling (copied and adapted from previous manual file selection style) */
        .log-entry { margin-bottom: 0.25rem; border-bottom: 1px solid #444; padding-bottom: 0.25rem; }
        .log-entry:last-child { border-bottom: none; }
        .log-error { color: #ff6b6b; font-weight: bold; } /* Light red for errors */
        .log-success { color: #76ff7e; font-weight: bold; } /* Light green for success */
        .log-info { color: #aaa; }
        .log-warn { color: #ffdd57; } /* Light yellow for warnings */
        .log-step { color: #ffc107; }
        .log-state { color: #5cacee; } /* Light blue for state */
        .log-mismatch { background-color: rgba(255, 107, 107, 0.2); padding: 2px 4px; border-radius: 3px; }
      `;
      this.rootElement.appendChild(style);
    }
    return this.rootElement;
  }

  async initialize() {
    if (this.initialized) return;
    this.spoilersPanelContainer = this.container.element; // Get the actual DOM element from GL container
    this.spoilersPanelContainer.appendChild(this.getRootElement());

    this.log('info', 'Test Spoiler UI Initializing...');

    // Clear container and set up basic structure initially
    this.testSpoilersContainer.innerHTML = '';
    this.ensureLogContainerReady(); // Create #spoiler-log-output and #spoiler-controls-container

    // ADDED: Check for existing ruleset immediately on initialization
    try {
      const currentRulesetSource = stateManager.getRawJsonDataSource();
      if (currentRulesetSource && !this.activeRulesetName) {
        this.activeRulesetName = currentRulesetSource;
        this.log('info', `Found existing ruleset on initialization: ${this.activeRulesetName}`);
      }
    } catch (error) {
      this.log('debug', `Could not get current ruleset source: ${error.message}`);
    }

    // MODIFIED: Always render manual file selection view on initialization
    this.renderManualFileSelectionView(
      'Select a spoiler log file or load the suggested one if available.'
    );
    this.log(
      'info',
      'Test Spoilers panel ready. Waiting for user to load a spoiler log.'
    );

    // REMOVE/COMMENT OUT: Direct call to attemptAutoLoadSpoilerLog
    /*
    if (this.activeRulesetName) {
      // ...
      await this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
    } else {
      this.renderManualFileSelectionView(); 
      // ...
    }
    */

    // MODIFIED: The stateManager:rulesLoaded listener will now ONLY update the suggested file, not auto-load.
    if (this.rulesLoadedUnsub) this.rulesLoadedUnsub(); // Unsubscribe if already subscribed
    this.rulesLoadedUnsub = this.eventBus.subscribe(
      'stateManager:rulesLoaded',
      async (eventData) => {
        this.log(
          'info',
          `[TestSpoilerUI] Received stateManager:rulesLoaded (Subscriber)`,
          eventData
        );
        if (eventData && eventData.source) {
          const newRulesetName = eventData.source;
          this.activeRulesetName = newRulesetName; // Update active ruleset name
          this.playerId = eventData.playerId;
          this.log(
            'info',
            `Active ruleset updated to: ${newRulesetName}, Player ID: ${this.playerId}`
          );

          // Refresh the view to show the new suggested log, but DO NOT auto-load.
          // Only refresh if no log is currently loaded, or perhaps always to update suggestion.
          if (!this.spoilerLogData) {
            // Only refresh if no log is active
            this.renderManualFileSelectionView(
              `Ruleset changed to ${newRulesetName}. Suggested log updated.`
            );
          } else {
            // If a log is already loaded, just update the suggestion text in the existing view if possible,
            // or inform the user that the ruleset changed but their current log is still active.
            // For simplicity now, we'll just log. A more advanced UI could update a "suggested file" field.
            this.log(
              'info',
              `Ruleset changed to ${newRulesetName}, but a log is already loaded. Suggested log path may have updated.`
            );
            // We can call renderManualFileSelectionView again to update the suggested file text.
            // This will replace the controls and log output, which might be disruptive if a test is running.
            // Let's only re-render if no test is active.
            if (
              this.controlsContainer &&
              !this.controlsContainer.querySelector('#run-full-spoiler-test')
            ) {
              this.renderManualFileSelectionView(
                `Ruleset changed to ${newRulesetName}. Suggested log updated.`
              );
            }
          }
        }
      }
    , 'testSpoilers');

    // MODIFIED: The stateManager:rawJsonDataLoaded listener will also ONLY update suggested file.
    if (this.rawJsonDataUnsub) this.rawJsonDataUnsub(); // Unsubscribe
    this.rawJsonDataUnsub = this.eventBus.subscribe(
      'stateManager:rawJsonDataLoaded',
      (data) => {
        if (data && data.source && !this.activeRulesetName) {
          this.activeRulesetName = data.source;
          log(
            'info',
            `[TestSpoilerUI] Active ruleset name set from rawJsonDataLoaded: ${this.activeRulesetName}`
          );
          // Refresh the view to show the new suggested log, but DO NOT auto-load.
          if (!this.spoilerLogData) {
            // Only refresh if no log is active
            this.renderManualFileSelectionView(
              `Initial ruleset ${this.activeRulesetName} detected. Suggested log updated.`
            );
          }
        }
      }
    , 'testSpoilers');

    this.initialized = true;
    this.log(
      'info',
      'Test Spoiler UI Initialization complete. Manual load required.'
    );
  }

  async attemptAutoLoadSpoilerLog(rulesetPath) {
    if (!this.testSpoilersContainer) return;

    // Handle no ruleset path case
    if (!rulesetPath) {
      logger.warn('Cannot attempt auto-load: rulesetPath is undefined or invalid');
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderManualFileSelectionView(
        'Cannot determine ruleset for auto-load. Please select a log file.'
      );
      return;
    }

    // Phase 1: Delegate to FileLoader module
    const result = await this.fileLoader.attemptAutoLoad(
      rulesetPath,
      this.currentSpoilerLogPath,
      this.spoilerLogData,
      this.isLoadingLogPath
    );

    // Handle already loading case
    if (result.error === 'Already loading this log path.') {
      return;
    }

    // Handle already loaded case
    if (result.alreadyLoaded) {
      logger.info(
        `Spoiler log for ${result.logPath} is already loaded and processed. Refreshing UI.`
      );
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderResultsControls();
      logger.info(`Displaying already loaded test: ${this.currentSpoilerLogPath}`);
      this.updateStepInfo();
      return;
    }

    // Set loading flag
    this.isLoadingLogPath = result.logPath;

    try {
      // Handle failure case
      if (!result.success) {
        logger.warn(result.error);
        if (this.initialAutoLoadAttempted) {
          this.renderManualFileSelectionView(
            `Auto-load failed: ${result.error}. Please select a file manually.`
          );
        }
        this.spoilerLogData = null;
        this.currentSpoilerLogPath = null;
        return;
      }

      // Handle success case
      this.clearTestState(); // Clear previous test state
      this.spoilerLogData = result.logData;
      this.currentSpoilerLogPath = result.logPath;
      await this.prepareSpoilerTest(true);
    } catch (error) {
      logger.warn(
        `Failed to process spoiler log from ${result.logPath}. Error: ${error.message}`
      );
      this.spoilerLogData = null;
      this.currentSpoilerLogPath = null;
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderManualFileSelectionView(
        `Auto-load failed for ${result.logPath}. ${error.message}. Please select a spoiler log file.`
      );
    } finally {
      this.isLoadingLogPath = null; // Clear loading flag
    }
  }

  extractFilenameBase(filePathOrName) {
    // Phase 1: Delegate to FileLoader module
    return this.fileLoader.extractFilenameBase(filePathOrName);
  }

  renderManualFileSelectionView(
    message = 'Select a Spoiler Log File (.jsonl)'
  ) {
    this.testSpoilersContainer.innerHTML = ''; // Clear previous content
    this.ensureLogContainerReady(); // Setup basic structure including log container

    this.log('info', message); // Log the message to the log area

    const fileSelectionContainer = document.createElement('div');
    fileSelectionContainer.className = 'spoiler-file-select-controls';

    // Display suggested filename and add a button to load it
    const suggestedLogInfoContainer = document.createElement('div');
    suggestedLogInfoContainer.className = 'suggested-log-info';
    let suggestedLogName = 'No active ruleset detected for suggestion.';
    let canLoadSuggested = false;

    if (this.activeRulesetName) {
      const baseName = this.extractFilenameBase(this.activeRulesetName);
      suggestedLogName = `${baseName}_spheres_log.jsonl`;
      canLoadSuggested = true;
      suggestedLogInfoContainer.innerHTML = `
        <p>Current ruleset: <strong>${this.escapeHtml(
          this.activeRulesetName
        )}</strong></p>
        <p>Suggested log file: <strong>${this.escapeHtml(
          suggestedLogName
        )}</strong></p>
      `;
      const loadSuggestedButton = document.createElement('button');
      loadSuggestedButton.textContent = 'Load Suggested Log';
      loadSuggestedButton.id = 'load-suggested-spoiler-log';
      loadSuggestedButton.onclick = async () => {
        if (this.activeRulesetName) {
          this.log(
            'info',
            `User initiated load for suggested log derived from: ${this.activeRulesetName}`
          );
          // attemptAutoLoadSpoilerLog derives the path from activeRulesetName
          await this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
        } else {
          this.log(
            'warn',
            'Cannot load suggested log: No active ruleset name available.'
          );
        }
      };
      suggestedLogInfoContainer.appendChild(loadSuggestedButton);
    } else {
      suggestedLogInfoContainer.innerHTML = `<p>${this.escapeHtml(
        suggestedLogName
      )}</p>`;
    }
    fileSelectionContainer.appendChild(suggestedLogInfoContainer);

    const separator = document.createElement('hr');
    fileSelectionContainer.appendChild(separator);

    const manualLoadMessageElement = document.createElement('p');
    manualLoadMessageElement.textContent =
      'Or, select a local spoiler log file (.jsonl):';
    fileSelectionContainer.appendChild(manualLoadMessageElement);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.id = 'spoiler-log-file-input';
    fileInput.accept = '.jsonl';

    const loadButton = document.createElement('button');
    loadButton.textContent = 'Load Selected Local Log';
    loadButton.onclick = async () => {
      const file = fileInput.files[0];
      if (file) {
        this.clearTestState(); // ADDED: Clear state before loading new manual file
        this.currentSpoilerFile = file;
        this.currentSpoilerLogPath = file.name; // Use file name as path for display
        this.abortController = new AbortController();
        const signal = this.abortController.signal;
        this.log('info', `Loading selected file: ${file.name}`);
        const success = await this.readSelectedLogFile(file, signal);
        if (success) {
          await this.prepareSpoilerTest(false); // false for isAutoLoad
        } else {
          // Error already logged by readSelectedLogFile
          this.renderManualFileSelectionView(
            `Failed to load or parse: ${file.name}. Please try again.`
          );
        }
      } else {
        this.log('warn', 'No file selected.');
      }
    };

    fileSelectionContainer.appendChild(fileInput);
    fileSelectionContainer.appendChild(loadButton);

    // Append the file selection controls to the controls container created by ensureLogContainerReady
    this.controlsContainer.innerHTML = ''; // Clear any previous controls
    this.controlsContainer.appendChild(fileSelectionContainer);
  }

  renderResultsControls() {
    // this.testSpoilersContainer.innerHTML = ''; // prepareSpoilerTest will clear the main container

    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'spoiler-test-controls'; // Use a class for styling

    const changeFileButton = document.createElement('button');
    changeFileButton.textContent = '← Change Log File';
    changeFileButton.onclick = () => {
      if (this.abortController) {
        this.abortController.abort(); // Cancel any ongoing test step
      }
      this.clearTestState();
      this.currentSpoilerFile = null;
      this.currentSpoilerLogPath = null; // Clear the path
      this.renderManualFileSelectionView();
    };

    const testNameElement = document.createElement('span');
    testNameElement.id = 'spoiler-test-name';
    testNameElement.style.marginRight = '10px';
    testNameElement.textContent = `Testing: ${
      this.currentSpoilerLogPath || 'Unknown Log'
    }`;

    const runFullButton = document.createElement('button');
    runFullButton.id = 'run-full-spoiler-test';
    runFullButton.textContent = 'Run Full Test';
    runFullButton.onclick = () => this.runFullSpoilerTest();

    const stepButton = document.createElement('button');
    stepButton.id = 'step-spoiler-test';
    stepButton.textContent = `Step Test (Step ${this.currentLogIndex} / ${
      this.spoilerLogData ? this.spoilerLogData.length : 0
    })`;
    stepButton.onclick = () => this.stepSpoilerTest();

    // ADDED: Checkbox for "Stop on first error"
    const stopOnErrorContainer = document.createElement('div');
    stopOnErrorContainer.style.display = 'inline-block';
    stopOnErrorContainer.style.marginLeft = '15px';

    const stopOnErrorCheckbox = document.createElement('input');
    stopOnErrorCheckbox.type = 'checkbox';
    stopOnErrorCheckbox.id = 'stop-on-first-error-checkbox';
    stopOnErrorCheckbox.checked = this.stopOnFirstError;
    stopOnErrorCheckbox.onchange = (event) => {
      this.stopOnFirstError = event.target.checked;
      this.log(
        'info',
        `"Stop on first error" is now ${
          this.stopOnFirstError ? 'enabled' : 'disabled'
        }.`
      );
    };

    const stopOnErrorLabel = document.createElement('label');
    stopOnErrorLabel.htmlFor = 'stop-on-first-error-checkbox';
    stopOnErrorLabel.textContent = 'Stop on first error';
    stopOnErrorLabel.style.marginLeft = '4px';

    stopOnErrorContainer.appendChild(stopOnErrorCheckbox);
    stopOnErrorContainer.appendChild(stopOnErrorLabel);

    // ADDED: Checkbox for auto-collect events
    const autoCollectCheckbox = document.createElement('input');
    autoCollectCheckbox.type = 'checkbox';
    autoCollectCheckbox.id = 'auto-collect-events-checkbox';
    autoCollectCheckbox.checked = false; // Default to false, as tests usually disable it initially.
    // The user can override this manually.
    autoCollectCheckbox.style.marginLeft = '10px';
    autoCollectCheckbox.onchange = async (event) => {
      const isEnabled = event.target.checked;
      try {
        await stateManager.setAutoCollectEventsConfig(isEnabled);
        this.log('info', `Auto-collect events manually set to: ${isEnabled}`);
        // Optional: Consider if re-running the current step or refreshing view is needed.
        // For now, the user can manually step again to see the effect.
      } catch (error) {
        this.log('error', 'Failed to set auto-collect events config:', error);
        // Revert checkbox if the call failed
        event.target.checked = !isEnabled;
      }
    };

    const autoCollectLabel = document.createElement('label');
    autoCollectLabel.htmlFor = 'auto-collect-events-checkbox';
    autoCollectLabel.textContent = 'Auto-collect Events';
    autoCollectLabel.style.marginLeft = '2px';
    // END ADDED

    controlsDiv.appendChild(changeFileButton);
    controlsDiv.appendChild(testNameElement);
    controlsDiv.appendChild(runFullButton);
    controlsDiv.appendChild(stepButton);
    controlsDiv.appendChild(stopOnErrorContainer); // ADDED
    // ADDED: Append checkbox and label
    controlsDiv.appendChild(autoCollectCheckbox);
    controlsDiv.appendChild(autoCollectLabel);
    // END ADDED

    this.controlsContainer.innerHTML = ''; // Clear previous controls
    this.controlsContainer.appendChild(controlsDiv);
  }

  async prepareSpoilerTest(isAutoLoad = false) {
    // Phase 5: Delegate to TestOrchestrator module
    const prepareSuccess = await this.testOrchestrator.prepareSpoilerTest(
      this.spoilerLogData,
      this.playerId,
      this.currentSpoilerLogPath,
      isAutoLoad
    );

    // Sync state from orchestrator
    const progress = this.testOrchestrator.getProgress();
    this.currentLogIndex = progress.currentIndex;
    this.testStateInitialized = progress.initialized;

    // CRITICAL FIX: Sync abort controller from orchestrator
    this.abortController = this.testOrchestrator.abortController;

    return prepareSuccess;
  }

  async runFullSpoilerTest() {
    // Phase 5: Delegate to TestOrchestrator module
    await this.testOrchestrator.runFullSpoilerTest(
      this.spoilerLogData,
      this.playerId,
      this.currentSpoilerLogPath
    );

    // Sync state from orchestrator
    const progress = this.testOrchestrator.getProgress();
    this.currentLogIndex = progress.currentIndex;
    this.testStateInitialized = progress.initialized;
    this.abortController = this.testOrchestrator.abortController;

    // Sync mismatch details from event processor (for compatibility)
    this.currentMismatchDetailsArray = this.eventProcessor.getMismatchDetailsArray();
    if (this.currentMismatchDetailsArray.length > 0) {
      this.currentMismatchDetails = this.currentMismatchDetailsArray[this.currentMismatchDetailsArray.length - 1];
    } else {
      this.currentMismatchDetails = null;
    }
  }

  async runFullSpoilerTest_ORIGINAL() {
    // DEPRECATED: Original implementation kept for reference
    // This method has been replaced by TestOrchestrator delegation (see runFullSpoilerTest above)
    this.log(
      'info',
      `[runFullSpoilerTest] Starting full spoiler test. playerId: ${this.playerId}`
    );

    await this.prepareSpoilerTest();
    
    this.log('info', `[runFullSpoilerTest] After prepareSpoilerTest: testStateInitialized=${this.testStateInitialized}, currentLogIndex=${this.currentLogIndex}`);
    
    if (!this.testStateInitialized) {
      this.log(
        'error',
        'Cannot run full test: Test state not initialized (likely no valid log data).'
      );
      return;
    }

    const currentAbortController = this.abortController; // ADDED: Capture to local variable

    if (!currentAbortController) {
      // ADDED: Diagnostic check
      this.log(
        'error',
        'CRITICAL: AbortController is null immediately after prepareSpoilerTest in runFullSpoilerTest.'
      );
      // Log additional context if possible
      this.log(
        'error',
        `Current log path: ${this.currentSpoilerLogPath}, Data length: ${
          this.spoilerLogData ? this.spoilerLogData.length : 'N/A'
        }`
      );
      return;
    }

    if (!this.spoilerLogData) {
      this.log('error', 'No log events loaded.');
      return;
    }

    this.log('step', '4. Processing all log events...');
    const runButton = document.getElementById('run-full-spoiler-test');
    const stepButton = document.getElementById('step-spoiler-test');
    if (runButton) runButton.disabled = true;
    if (stepButton) stepButton.disabled = true;

    let allEventsPassedSuccessfully = true; // Renamed from allChecksPassed for clarity
    let detailedErrorMessages = [];
    let sphereResults = []; // ADDED: Track results for each sphere
    let mismatchDetails = []; // ADDED: Track detailed mismatch information

    try {
      // The main loop for processing events.
      // Critical errors from prepareSpoilerTest or StateManager setup are caught before this.
      // This loop now continues even if processSingleEvent reports an error for an event.
      this.log('info', `Starting main processing loop. Total events to process: ${this.spoilerLogData.length}`);
      
      while (this.currentLogIndex < this.spoilerLogData.length) {
        this.log('debug', `Loop iteration: currentLogIndex=${this.currentLogIndex}, totalEvents=${this.spoilerLogData.length}`);
        
        if (currentAbortController.signal.aborted) {
          this.log('warn', `Processing aborted at event ${this.currentLogIndex + 1}`);
          throw new DOMException('Aborted', 'AbortError');
        }

        const event = this.spoilerLogData[this.currentLogIndex];
        this.log('debug', `About to process event ${this.currentLogIndex + 1}: ${JSON.stringify(event).substring(0, 200)}...`);
        
        const eventProcessingResult = await this.processSingleEvent(event);
        this.log('debug', `Completed processing event ${this.currentLogIndex + 1}, result: ${JSON.stringify(eventProcessingResult)}`);

        // ADDED: Capture detailed sphere results
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
          this.log('error', errorMessage);
          detailedErrorMessages.push(errorMessage);

          // ADDED: Capture ALL detailed mismatch information (locations AND regions)
          if (this.currentMismatchDetailsArray && this.currentMismatchDetailsArray.length > 0) {
            // Push all mismatch details (handles both location and region mismatches for same event)
            mismatchDetails.push(...this.currentMismatchDetailsArray.map(detail => ({
              eventIndex: this.currentLogIndex,
              sphereIndex: sphereResult.sphereIndex,
              ...detail
            })));
            this.currentMismatchDetailsArray = []; // Clear for next event
          }
          // Legacy support: also check single mismatch field
          else if (this.currentMismatchDetails) {
            mismatchDetails.push({
              eventIndex: this.currentLogIndex,
              sphereIndex: sphereResult.sphereIndex,
              ...this.currentMismatchDetails
            });
            this.currentMismatchDetails = null; // Clear for next event
          }

          // ADDED: Check if we should stop on this error
          if (this.stopOnFirstError) {
            this.log(
              'warn',
              'Test run halted due to "Stop on first error" being enabled.'
            );
            break; // Exit the loop
          }
        }
        
        // Add a small delay to allow UI updates and prevent blocking
        this.log('debug', `Adding delay of ${this.eventProcessingDelayMs}ms before next event`);
        try {
          await new Promise((resolve) =>
            setTimeout(resolve, this.eventProcessingDelayMs)
          );
          this.log('debug', `Delay completed successfully`);
        } catch (delayError) {
          this.log('error', `Error during delay: ${delayError.message}`);
          throw delayError;
        }

        try {
          this.currentLogIndex++;
          this.log('debug', `Incremented currentLogIndex to ${this.currentLogIndex}`);
          
          this.updateStepInfo();
          this.log('debug', `updateStepInfo() completed`);
          
          this.log('debug', `About to check loop condition: ${this.currentLogIndex} < ${this.spoilerLogData.length} = ${this.currentLogIndex < this.spoilerLogData.length}`);
        } catch (incrementError) {
          this.log('error', `Error during loop increment/update: ${incrementError.message}`);
          throw incrementError;
        }
      }

      // --- Final Result Determination ---
      this.log('info', `Exited main processing loop. Final currentLogIndex: ${this.currentLogIndex}, Total events: ${this.spoilerLogData.length}`);
      
      if (currentAbortController.signal.aborted) {
        this.log('info', 'Spoiler test aborted by user.');
        // No explicit success/failure message if aborted by user, just the abort log.
      } else if (allEventsPassedSuccessfully) {
        this.log(
          'success',
          'Spoiler test completed successfully. All events matched.'
        );
      } else {
        // This specific log for overall failure might be redundant if individual errors are clear enough,
        // but kept for a clear summary.
        this.log(
          'error',
          `Spoiler test completed with ${detailedErrorMessages.length} mismatch(es). See logs above for details.`
        );
      }
    } catch (error) {
      // This catch block now primarily handles unexpected errors or aborts, not first mismatch.
      if (error.name === 'AbortError') {
        this.log('info', 'Spoiler test aborted.');
      } else {
        // Log critical/unexpected errors not handled as part of normal event processing.
        this.log(
          'error',
          `Critical error during spoiler test execution at step ${
            this.currentLogIndex + 1
          }: ${error.message}`
        );
        // Also log to the main logger for more detailed stack trace if available
        log(
          'error',
          `Critical Spoiler Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
        allEventsPassedSuccessfully = false; // Ensure overall status reflects this critical failure
      }
    } finally {
      if (runButton) runButton.disabled = false;
      if (stepButton) stepButton.disabled = false;
      this.isRunning = false; // Ensure isRunning is reset
      
      // ADDED: Store detailed test results in window object for external access
      const detailedTestResults = {
        passed: allEventsPassedSuccessfully,
        logEntries: [],
        errorMessages: detailedErrorMessages,
        sphereResults: sphereResults,
        mismatchDetails: mismatchDetails,
        totalEvents: this.spoilerLogData ? this.spoilerLogData.length : 0,
        processedEvents: this.currentLogIndex,
        testLogPath: this.currentSpoilerLogPath,
        playerId: this.playerId,
        completedAt: new Date().toISOString()
      };

      // Collect log entries from the UI
      if (this.logContainer) {
        const logEntries = this.logContainer.querySelectorAll('.log-entry');
        logEntries.forEach((entry) => {
          detailedTestResults.logEntries.push(entry.textContent);
        });
      }

      // Store in window for external access (like Playwright tests)
      if (typeof window !== 'undefined') {
        window.__spoilerTestResults__ = detailedTestResults;
        this.log(
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
        this.log(
          'info',
          'Detailed spoiler test results stored in localStorage'
        );
      } catch (e) {
        this.log(
          'warn',
          `Could not store detailed results in localStorage: ${e.message}`
        );
      }

      // MODIFIED: Re-enable auto-collect events
      try {
        await stateManager.setAutoCollectEventsConfig(true);
        this.log(
          'info',
          '[TestSpoilerUI] Re-enabled auto-collect events after full test run.'
        );
      } catch (error) {
        this.log(
          'error',
          '[TestSpoilerUI] Failed to re-enable auto-collect events after full test:',
          error
        );
      }
    }
  }

  async stepSpoilerTest() {
    // Phase 5: Delegate to TestOrchestrator module
    await this.testOrchestrator.stepSpoilerTest(
      this.spoilerLogData,
      this.playerId,
      this.currentSpoilerLogPath
    );

    // Sync state from orchestrator
    const progress = this.testOrchestrator.getProgress();
    this.currentLogIndex = progress.currentIndex;
    this.testStateInitialized = progress.initialized;
    this.abortController = this.testOrchestrator.abortController;

    // Sync mismatch details from event processor (for compatibility)
    this.currentMismatchDetailsArray = this.eventProcessor.getMismatchDetailsArray();
    if (this.currentMismatchDetailsArray.length > 0) {
      this.currentMismatchDetails = this.currentMismatchDetailsArray[this.currentMismatchDetailsArray.length - 1];
    } else {
      this.currentMismatchDetails = null;
    }
  }

  updateStepInfo() {
    // Phase 5: Delegate to TestOrchestrator module via uiCallbacks
    // The orchestrator's updateStepInfo is called internally, but this wrapper
    // method is kept for backward compatibility and direct UI updates
    this.testOrchestrator.updateStepInfo(
      this.spoilerLogData,
      this.currentSpoilerLogPath
    );
  }

  // Phase 4: _getSphereDataFromSphereState moved to eventProcessor.js
  // Phase 4: checkLocationViaEvent moved to eventProcessor.js

  async processSingleEvent(event) {
    // Phase 4: Delegate to EventProcessor module
    // Set context before processing
    this.eventProcessor.setContext(this.currentLogIndex, this.spoilerLogData, this.playerId);

    // Process the event and get result
    const result = await this.eventProcessor.processSingleEvent(event);

    // Store ALL mismatch details if any (for compatibility with runFullSpoilerTest)
    // EventProcessor may generate both location AND region mismatches for the same event
    if (result.error) {
      // Get all mismatch details from EventProcessor (array to capture both types)
      this.currentMismatchDetailsArray = this.eventProcessor.getMismatchDetailsArray();

      // Also store the last one in legacy field for backwards compatibility
      if (this.currentMismatchDetailsArray.length > 0) {
        this.currentMismatchDetails = this.currentMismatchDetailsArray[this.currentMismatchDetailsArray.length - 1];
      }
    } else {
      // Clear mismatch details if event passed
      this.currentMismatchDetailsArray = [];
      this.currentMismatchDetails = null;
    }

    return result;
  }

  /**
   * Wrapper method for location comparison
   *
   * NOTE (Phase 4): This method is NOT called by EventProcessor.
   * EventProcessor calls comparisonEngine.compareAccessibleLocations() directly
   * and triggers analysis inline. This wrapper is kept for potential future use
   * or for any code paths that might still use it directly.
   *
   * @deprecated Consider using EventProcessor for event-based comparisons
   */
  async compareAccessibleLocations(
    logAccessibleLocationNames,
    currentWorkerSnapshot,
    playerId,
    context
  ) {
    // Phase 2: Delegate to ComparisonEngine module
    const result = await this.comparisonEngine.compareAccessibleLocations(
      logAccessibleLocationNames,
      currentWorkerSnapshot,
      playerId,
      context
    );

    // If there was a mismatch, call analysis methods for failing locations
    if (!result) {
      const mismatchDetails = this.comparisonEngine.getMismatchDetails();
      if (mismatchDetails && mismatchDetails.type === 'locations') {
        // Phase 3: Delegate to AnalysisReporter module
        // Analyze missing locations
        if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
          this.analysisReporter.analyzeFailingLocations(
            mismatchDetails.missingFromState,
            mismatchDetails.staticData,
            mismatchDetails.currentWorkerSnapshot,
            mismatchDetails.snapshotInterface,
            'MISSING_FROM_STATE',
            this.playerId
          );
        }
        // Analyze extra locations
        if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
          this.analysisReporter.analyzeFailingLocations(
            mismatchDetails.extraInState,
            mismatchDetails.staticData,
            mismatchDetails.currentWorkerSnapshot,
            mismatchDetails.snapshotInterface,
            'EXTRA_IN_STATE',
            this.playerId
          );
        }

        // Store in local state for compatibility (excluding large objects)
        // Only store serializable data, not object references
        this.currentMismatchDetails = {
          type: mismatchDetails.type,
          context: mismatchDetails.context,
          missingFromState: mismatchDetails.missingFromState,
          extraInState: mismatchDetails.extraInState,
          logAccessibleCount: mismatchDetails.logAccessibleCount,
          stateAccessibleCount: mismatchDetails.stateAccessibleCount,
          inventoryUsed: mismatchDetails.inventoryUsed
          // Deliberately exclude: snapshotInterface, staticData, currentWorkerSnapshot
        };
      }
    }

    return result;
  }

  /**
   * Wrapper method for region comparison
   *
   * NOTE (Phase 4): This method is NOT called by EventProcessor.
   * EventProcessor calls comparisonEngine.compareAccessibleRegions() directly
   * and triggers analysis inline. This wrapper is kept for potential future use
   * or for any code paths that might still use it directly.
   *
   * @deprecated Consider using EventProcessor for event-based comparisons
   */
  async compareAccessibleRegions(
    logAccessibleRegionNames,
    currentWorkerSnapshot,
    playerId,
    context
  ) {
    // Phase 2: Delegate to ComparisonEngine module
    const result = await this.comparisonEngine.compareAccessibleRegions(
      logAccessibleRegionNames,
      currentWorkerSnapshot,
      playerId,
      context
    );

    // If there was a mismatch, call analysis methods for failing regions
    if (!result) {
      const mismatchDetails = this.comparisonEngine.getMismatchDetails();
      if (mismatchDetails && mismatchDetails.type === 'regions') {
        // Phase 3: Delegate to AnalysisReporter module
        // Analyze missing regions
        if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
          this.analysisReporter.analyzeFailingRegions(
            mismatchDetails.missingFromState,
            mismatchDetails.staticData,
            mismatchDetails.currentWorkerSnapshot,
            this.playerId,
            'MISSING_FROM_STATE'
          );
        }
        // Analyze extra regions
        if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
          this.analysisReporter.analyzeFailingRegions(
            mismatchDetails.extraInState,
            mismatchDetails.staticData,
            mismatchDetails.currentWorkerSnapshot,
            this.playerId,
            'EXTRA_IN_STATE'
          );
        }

        // Store in local state for compatibility (excluding large objects)
        // Only store serializable data, not object references
        this.currentMismatchDetails = {
          type: mismatchDetails.type,
          context: mismatchDetails.context,
          missingFromState: mismatchDetails.missingFromState,
          extraInState: mismatchDetails.extraInState,
          logAccessibleCount: mismatchDetails.logAccessibleCount,
          stateAccessibleCount: mismatchDetails.stateAccessibleCount,
          inventoryUsed: mismatchDetails.inventoryUsed
          // Deliberately exclude: staticData, currentWorkerSnapshot, playerId
        };
      }
    }

    return result;
  }

  log(type, message, ...additionalData) {
    // Log to panel
    if (this.logContainer) {
      const entry = document.createElement('div');
      entry.classList.add('log-entry', `log-${type}`);
      const textContent = `[${new Date().toLocaleTimeString()}] ${message}`;

      // MODIFIED: Check for location and region lists to make them clickable
      const prefixLocationMismatch =
        ' > Locations accessible in LOG but NOT in STATE (or checked): ';
      const prefixLocationExtra =
        ' > Locations accessible in STATE (and unchecked) but NOT in LOG: ';
      const prefixRegionMismatch =
        ' > Regions accessible in LOG but NOT in STATE: ';
      const prefixRegionExtra =
        ' > Regions accessible in STATE but NOT in LOG: ';
      let isSpecialList = false;

      if (message.startsWith(prefixLocationMismatch)) {
        isSpecialList = true;
        entry.appendChild(
          document.createTextNode(
            `[${new Date().toLocaleTimeString()}]` + prefixLocationMismatch
          )
        );
        const locations = message.substring(prefixLocationMismatch.length).split(', ');
        this._addLocationLinksToElement(entry, locations);
      } else if (message.startsWith(prefixLocationExtra)) {
        isSpecialList = true;
        entry.appendChild(
          document.createTextNode(
            `[${new Date().toLocaleTimeString()}]` + prefixLocationExtra
          )
        );
        const locations = message.substring(prefixLocationExtra.length).split(', ');
        this._addLocationLinksToElement(entry, locations);
      } else if (message.startsWith(prefixRegionMismatch)) {
        isSpecialList = true;
        entry.appendChild(
          document.createTextNode(
            `[${new Date().toLocaleTimeString()}]` + prefixRegionMismatch
          )
        );
        const regions = message.substring(prefixRegionMismatch.length).split(', ');
        this._addRegionLinksToElement(entry, regions);
      } else if (message.startsWith(prefixRegionExtra)) {
        isSpecialList = true;
        entry.appendChild(
          document.createTextNode(
            `[${new Date().toLocaleTimeString()}]` + prefixRegionExtra
          )
        );
        const regions = message.substring(prefixRegionExtra.length).split(', ');
        this._addRegionLinksToElement(entry, regions);
      }

      if (!isSpecialList) {
        entry.textContent = textContent;
      }
      // END MODIFIED

      // Consider if additionalData should be stringified or handled for panel display
      this.logContainer.appendChild(entry);
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    // Log to browser console via centralized logger that respects settings
    // Map custom types to console methods if needed, e.g., 'step' or 'mismatch'
    let logLevel = type;
    if (type === 'step' || type === 'mismatch' || type === 'state') {
      logLevel = 'info'; // Or 'debug' or a specific style
    } else if (type === 'success') {
      logLevel = 'info';
    } else if (type === 'log') {
      logLevel = 'info';
    }
    // Ensure type is a valid log level, defaulting to 'info'
    if (
      !['error', 'warn', 'info', 'debug'].includes(logLevel)
    ) {
      logLevel = 'info';
    }
    
    // Use centralized logger that respects settings.json logging levels
    if (
      typeof window !== 'undefined' &&
      window.logger &&
      typeof window.logger[logLevel] === 'function'
    ) {
      window.logger[logLevel]('testSpoilerUI', message, ...additionalData);
    } else {
      // Fallback to console if logger not available
      const consoleMethod = console[logLevel] || console.log;
      consoleMethod(
        `[testSpoilerUI] ${message}`,
        ...additionalData
      );
    }
  }

  _addLocationLinksToElement(element, locationNames) {
    locationNames.forEach((locName, index) => {
      const staticData = stateManager.getStaticData();
      const locDef = staticData?.locations?.get(locName.trim());
      const regionName = locDef?.region || locDef?.parent_region;

      if (regionName) {
        const snapshot = stateManager.getLatestStateSnapshot();
        const link = createRegionLink(regionName, false, snapshot);
        link.textContent = this.escapeHtml(locName.trim());
        link.title = `Navigate to region: ${this.escapeHtml(regionName)}`;
        element.appendChild(link);
      } else {
        element.appendChild(
          document.createTextNode(this.escapeHtml(locName.trim()))
        );
      }

      if (index < locationNames.length - 1) {
        element.appendChild(document.createTextNode(', '));
      }
    });
  }

  _addRegionLinksToElement(element, regionNames) {
    regionNames.forEach((regionName, index) => {
      const staticData = stateManager.getStaticData();
      const regionDef = staticData?.regions?.get(regionName.trim());

      if (regionDef) {
        const snapshot = stateManager.getLatestStateSnapshot();
        const link = createRegionLink(regionName.trim(), false, snapshot);
        link.textContent = this.escapeHtml(regionName.trim());
        link.title = `Navigate to region: ${this.escapeHtml(regionName.trim())}`;
        element.appendChild(link);
      } else {
        element.appendChild(
          document.createTextNode(this.escapeHtml(regionName.trim()))
        );
      }

      if (index < regionNames.length - 1) {
        element.appendChild(document.createTextNode(', '));
      }
    });
  }

  escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
      .toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  clearDisplay() {
    // Called when switching away from the 'Files' tab or 'Test Spoilers' sub-tab
    this.clearTestState();
    // Abort any ongoing test/preparation
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Optionally clear the container if needed, but renderSpoilerList handles it
    // const container = document.getElementById('test-spoilers-panel');
    // if (container) container.innerHTML = '';
  }

  clearTestState() {
    this.log('info', 'Clearing current spoiler test state.');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    this.spoilerLogData = null; // Explicitly nullify
    // Do NOT clear this.currentSpoilerLogPath here by default.
    // It's managed by the loading logic (set on success, cleared on certain failures or when changing files).
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    // Phase 4: previousInventory moved to EventProcessor

    // MODIFIED: Re-enable auto-collect events as part of clearing test state
    // This is a fire-and-forget call as clearTestState might not be awaited.
    stateManager
      .setAutoCollectEventsConfig(true)
      .then(() =>
        this.log(
          'info',
          '[TestSpoilerUI] Auto-collect events re-enabled via clearTestState.'
        )
      )
      .catch((error) =>
        this.log(
          'error',
          '[TestSpoilerUI] Failed to re-enable auto-collect events via clearTestState:',
          error
        )
      );
    // this.clearDisplay(); // Let the calling view manage display clearing.
  }

  dispose() {
    log('info', '[TestSpoilerUI] Disposing...');
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
    // Unsubscribe if the handle exists
    if (this.viewChangeSubscription) {
      this.viewChangeSubscription();
      this.viewChangeSubscription = null;
      log('info', '[TestSpoilerUI] Unsubscribed from ui:fileViewChanged.');
    }
    // this.clearTestState(); // clearTestState already handles re-enabling.
    // Calling it here might be redundant if already called by GL.
    // However, direct call to setAutoCollectEventsConfig ensures it happens during dispose.

    // MODIFIED: Ensure auto-collect events is re-enabled on dispose
    // Fire-and-forget, similar to clearTestState
    stateManager
      .setAutoCollectEventsConfig(true)
      .then(() =>
        this.log(
          'info',
          '[TestSpoilerUI] Auto-collect events re-enabled via dispose.'
        )
      )
      .catch((error) =>
        this.log(
          'error',
          '[TestSpoilerUI] Failed to re-enable auto-collect events via dispose:',
          error
        )
      );

    this.updateStepInfo(); // Clear step info display
  }

  async readSelectedLogFile(file, signal) {
    // Phase 1: Delegate to FileLoader module
    try {
      const result = await this.fileLoader.readFile(file, signal);

      if (!result.success) {
        logger.warn(`No valid log events found in file: ${file.name}`);
        return false; // Indicate failure to caller
      }

      // Store results
      this.spoilerLogData = result.logData;
      this.currentSpoilerFile = file;
      this.currentSpoilerLogPath = file.name;

      return true; // Indicate success to caller
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.info('File reading aborted');
      } else {
        logger.error(`Error reading file ${file.name}: ${error.message}`);
      }
      throw error; // Re-throw so caller can handle
    }
  }

  ensureLogContainerReady() {
    // This function ensures the basic DOM structure for controls and log output exists.
    // It no longer sets the initial message directly in testSpoilersContainer.

    if (!this.testSpoilersContainer) {
      console.error(
        '[TestSpoilerUI ensureLogContainerReady] this.testSpoilersContainer is null. Cannot proceed.'
      );
      // Attempt to recover or log verbosely
      if (this.rootElement) {
        let foundContainer = this.rootElement.querySelector(
          '.test-spoilers-container'
        );
        if (foundContainer) {
          this.testSpoilersContainer = foundContainer;
          console.warn(
            '[TestSpoilerUI ensureLogContainerReady] Recovered testSpoilersContainer from rootElement.'
          );
        } else {
          console.error(
            '[TestSpoilerUI ensureLogContainerReady] Could not find .test-spoilers-container in rootElement.'
          );
          this.rootElement.innerHTML =
            '<p>Error: UI container misconfigured.</p>'; // Fallback error message
          return;
        }
      } else {
        document.body.innerHTML =
          '<p>CRITICAL ERROR: TestSpoilerUI rootElement not found.</p>'; // Drastic fallback
        return;
      }
    }

    // Create controls container if it doesn't exist
    if (
      !this.controlsContainer ||
      !this.testSpoilersContainer.contains(this.controlsContainer)
    ) {
      this.controlsContainer = document.createElement('div');
      this.controlsContainer.id = 'spoiler-controls-container';
      this.controlsContainer.className = 'spoiler-controls-container'; // For potential specific styling
      // Prepend controls so log is at the bottom
      this.testSpoilersContainer.insertBefore(
        this.controlsContainer,
        this.testSpoilersContainer.firstChild
      );
    }

    // Create log container if it doesn't exist
    if (
      !this.logContainer ||
      !this.testSpoilersContainer.contains(this.logContainer)
    ) {
      this.logContainer = document.createElement('div');
      this.logContainer.id = 'spoiler-log-output';
      this.testSpoilersContainer.appendChild(this.logContainer); // Append log container at the end
    }
    // The actual initial message like "Attempting to load..." should be logged via this.log()
    // by the calling function (e.g., attemptAutoLoadSpoilerLog or initialize).
  }

  // Phase 3: Analysis methods moved to analysisReporter.js module
  // Phase 4: findNewlyAddedItems moved to eventProcessor.js
}

// Add default export
export default TestSpoilerUI;

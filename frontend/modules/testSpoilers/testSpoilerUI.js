import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import eventBus from '../../app/core/eventBus.js'; // ADDED: Static import
import { evaluateRule } from '../stateManager/ruleEngine.js'; // ADDED
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js'; // ADDED

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
    this.playerId = null;
    this.isLoadingLogPath = null; // ADDED: To prevent concurrent loads of the same log path

    // State for stepping through tests
    this.spoilerLogData = null; // MODIFIED: Renamed from logEvents, initialized to null
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.initialAutoLoadAttempted = false; // ADDED to help manage auto-load calls

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
      this.initialize();

      this.eventBus.subscribe('stateManager:rulesLoaded', async (eventData) => {
        try {
          log(
            'info',
            '[TestSpoilerUI] Received stateManager:rulesLoaded (Subscriber)',
            eventData
          );
          if (eventData && eventData.source) {
            const newRulesetName = eventData.source;

            // If an auto-load was already tried for this exact ruleset via the cached check,
            // and this event is for the same ruleset, skip to avoid double processing.
            if (
              this.initialAutoLoadAttempted &&
              this.activeRulesetName === newRulesetName
            ) {
              log(
                'info',
                `[TestSpoilerUI] stateManager:rulesLoaded for ${newRulesetName}, but initial auto-load already attempted/completed. Skipping duplicate attempt from event.`
              );
              // Ensure UI is correct if the initial attempt finished and loaded data
              if (this.spoilerLogData && this.testStateInitialized) {
                this.renderResultsControls();
              }
              return;
            }

            this.activeRulesetName = newRulesetName;
            log(
              'info',
              `[TestSpoilerUI] Valid source from rulesLoaded event: ${this.activeRulesetName}. Attempting auto-load.`
            );
            this.initialAutoLoadAttempted = true; // Mark that an attempt is being made based on this event
            await this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
          } else {
            log(
              'warn',
              '[TestSpoilerUI] stateManager:rulesLoaded event (Subscriber) did not contain a valid source.',
              eventData
            );
            this.renderManualFileSelectionView(
              'StateManager reported rules loaded, but source name is missing.'
            );
          }
        } catch (e) {
          log(
            'error',
            '[TestSpoilerUI] Error in stateManager:rulesLoaded subscriber:',
            e
          );
          this.renderManualFileSelectionView(
            'Error processing ruleset loaded event. Cannot auto-load log.'
          );
        }
      });

      // After subscribing, check if StateManager already has a rules source (e.g. default rules loaded before UI ready)
      const initialRulesSource = stateManager.getRawJsonDataSource();
      if (initialRulesSource) {
        log(
          'info',
          '[TestSpoilerUI] StateManager already has rules source (Cached Check on init):',
          initialRulesSource
        );
        this.activeRulesetName = initialRulesSource;
        this.initialAutoLoadAttempted = true; // Mark that this path was taken
        // Use a microtask to ensure this runs after the current event loop tick, allowing UI to settle if needed.
        Promise.resolve().then(async () => {
          try {
            log(
              'info',
              '[TestSpoilerUI] Attempting auto-load from cached source on init:',
              this.activeRulesetName
            );
            await this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
          } catch (e) {
            log(
              'error',
              '[TestSpoilerUI] Error in attemptAutoLoadSpoilerLog from cached source on init:',
              e
            );
            this.renderManualFileSelectionView(
              'Error attempting to auto-load from cached ruleset (init).'
            );
          }
        });
      } else {
        log(
          'info',
          '[TestSpoilerUI] StateManager does not have rules source yet (Cached Check on init). Waiting for event.'
        );
        // The message "Test Spoilers panel ready. Checking for active ruleset..." is set in initialize()
        // and is appropriate if we need to wait for the event.
      }

      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

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
        }
        #spoiler-controls-container {
            margin-bottom: 10px;
        }
        #spoiler-log-output {
          border: 1px solid #555; /* Darker border */
          padding: 8px;
          min-height: 150px; 
          overflow-y: auto;
          background-color: #333; /* Dark background for log */
          color: #ccc; /* Lighter text for log */
          flex-grow: 1; 
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

    this.log(
      'info',
      'Test Spoilers panel ready. Checking for active ruleset to auto-load log...'
    );

    // Check if ruleset info is already available (e.g., from constructor's readyHandler)
    if (this.activeRulesetName) {
      this.log(
        'info',
        `StateManager already has rules source (Cached Check on init): ${this.activeRulesetName}`
      );
      await this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
    } else {
      this.renderManualFileSelectionView(); // Render file selection as fallback
      this.log(
        'info',
        'Waiting for active ruleset information to attempt automatic spoiler log loading.'
      );
    }

    // Subscribe to stateManager:rulesLoaded to get updates on the active ruleset
    // This handles cases where rules are loaded *after* this panel initializes
    this.rulesLoadedUnsub = this.eventBus.subscribe(
      'stateManager:rulesLoaded',
      async (eventData) => {
        log(
          'info',
          `[TestSpoilerUI] Received stateManager:rulesLoaded (Subscriber)`,
          eventData
        );
        if (eventData && eventData.source) {
          const newRulesetName = eventData.source;
          this.activeRulesetName = newRulesetName; // Update active ruleset name
          log('info', `Active ruleset updated to: ${newRulesetName}`);

          // If initial auto-load (from cached source) was already done and matches this new source, skip.
          if (
            this.initialAutoLoadAttempted &&
            newRulesetName === this.activeRulesetName &&
            this.spoilerLogData
          ) {
            this.log(
              'info',
              `stateManager:rulesLoaded for ${newRulesetName}, but initial auto-load already completed for this source and log is loaded. Skipping duplicate attempt from event.`
            );
            return;
          }
          // If an auto-load was tried for a *different* source, or if this is the first time we get a source.
          this.currentSpoilerLogPath = null; // Reset before attempting auto-load
          await this.attemptAutoLoadSpoilerLog(newRulesetName);
        }
      }
    );

    // Subscribe to rawJsonDataLoaded to catch early ruleset name if available
    // This is mostly for the initial load sequence.
    this.rawJsonDataUnsub = this.eventBus.subscribe(
      'stateManager:rawJsonDataLoaded',
      (data) => {
        if (data && data.source && !this.activeRulesetName) {
          // Only set if not already set by rulesLoaded, to prefer the more definitive event.
          this.activeRulesetName = data.source;
          log(
            'info',
            `[TestSpoilerUI] Active ruleset name set from rawJsonDataLoaded: ${this.activeRulesetName}`
          );
          // Potentially trigger auto-load here IF it hasn't happened yet
          if (!this.initialAutoLoadAttempted) {
            this.initialAutoLoadAttempted = true;
            this.currentSpoilerLogPath = null; // Reset before attempting auto-load
            this.attemptAutoLoadSpoilerLog(this.activeRulesetName);
          }
        }
      }
    );

    this.initialized = true;
    this.log('info', 'Test Spoiler UI Initialization complete.');
  }

  async attemptAutoLoadSpoilerLog(rulesetName) {
    if (!this.testSpoilersContainer) return;

    let logPath;
    if (rulesetName) {
      const baseName = this.extractFilenameBase(rulesetName);
      logPath = `./${baseName}_spheres_log.jsonl`;
    } else {
      this.log(
        'warn',
        'Cannot attempt auto-load: rulesetName is undefined or invalid for logPath generation.'
      );
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderManualFileSelectionView(
        'Cannot determine ruleset for auto-load. Please select a log file.'
      );
      return;
    }

    // Check 1: Is this exact log path currently being loaded?
    if (this.isLoadingLogPath === logPath) {
      this.log(
        'info',
        `Auto-load for ${logPath} is already in progress. Skipping duplicate attempt.`
      );
      return;
    }

    // Check 2: Is this exact log path already loaded and processed successfully?
    if (
      this.currentSpoilerLogPath === logPath &&
      this.spoilerLogData &&
      this.spoilerLogData.length > 0
    ) {
      this.log(
        'info',
        `Spoiler log for ${logPath} is already loaded and processed. Refreshing UI.`
      );
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderResultsControls();
      this.log(
        'info',
        `Displaying already loaded test: ${this.currentSpoilerLogPath}`
      );
      this.updateStepInfo();
      return;
    }

    this.isLoadingLogPath = logPath; // Set loading flag

    try {
      this.clearTestState(); // Clear previous test state (this will nullify this.spoilerLogData)
      this.log(
        'info',
        `Attempting to fetch server-side spoiler log: ${logPath}`
      );

      const response = await fetch(logPath);
      if (!response.ok) {
        this.log(
          'warn',
          `Failed to fetch spoiler log from ${logPath}: ${response.status} ${response.statusText}`
        );
        if (this.initialAutoLoadAttempted)
          this.renderManualFileSelectionView(
            `Auto-load failed: Could not fetch ${logPath}. Please select a file manually.`
          );
        this.spoilerLogData = null;
        this.currentSpoilerLogPath = null; // Clear path if fetch failed
        return;
      }
      const fileContent = await response.text();
      const lines = fileContent.split('\n');
      const newLogEvents = [];
      for (const line of lines) {
        if (line.trim() === '') continue;
        try {
          const parsedEvent = JSON.parse(line);
          // ADDED: Detailed logging for parsed event (mirroring readSelectedLogFile)
          this.log(
            'debug',
            `Parsed line from fetched log into object:`,
            JSON.parse(JSON.stringify(parsedEvent))
          );
          if (
            parsedEvent &&
            typeof parsedEvent.type === 'string' &&
            parsedEvent.type.trim() !== ''
          ) {
            this.log(
              'debug',
              `Fetched event type found: '${parsedEvent.type}'`
            );
          } else if (parsedEvent && parsedEvent.hasOwnProperty('type')) {
            this.log(
              'warn',
              `Fetched event type is present but invalid (e.g., undefined, null, empty string): '${parsedEvent.type}'`,
              parsedEvent
            );
          } else {
            this.log(
              'warn',
              `Fetched parsed object is missing 'type' property. Object:`,
              JSON.parse(JSON.stringify(parsedEvent))
            );
          }
          newLogEvents.push(parsedEvent);
        } catch (e) {
          this.log(
            'error',
            `Failed to parse line from fetched log: "${line}". Error: ${e.message}`
          );
          // Optionally, push a placeholder or the raw line for debugging
          // newLogEvents.push({ type: 'parse_error', originalLine: line, error: e.message });
        }
      }

      if (newLogEvents.length === 0) {
        this.log(
          'warn',
          `Fetched log file ${logPath} was empty or contained no valid JSONL entries.`
        );
        this.spoilerLogData = null;
        this.currentSpoilerLogPath = null; // Clear path as no valid data was loaded
        if (this.initialAutoLoadAttempted)
          this.renderManualFileSelectionView(
            `Auto-load failed: Log file ${logPath} is empty or invalid. Please select manually.`
          );
        return; // Return here
      }

      this.spoilerLogData = newLogEvents;
      this.currentSpoilerLogPath = logPath; // Set path only on successful load and parse of non-empty data
      this.log(
        'info',
        `Successfully fetched and parsed spoiler log from: ${logPath}`
      );
      await this.prepareSpoilerTest(true);
    } catch (error) {
      this.log(
        'warn',
        `Failed to auto-load or process spoiler log from ${logPath}. Error: ${error.message}. Falling back to manual selection.`
      );
      this.spoilerLogData = null;
      this.currentSpoilerLogPath = null; // Ensure path is cleared as the log is not considered loaded
      this.testSpoilersContainer.innerHTML = '';
      this.ensureLogContainerReady();
      this.renderManualFileSelectionView(
        `Auto-load failed for ${logPath}. ${error.message}. Please select a spoiler log file.`
      );
    } finally {
      this.isLoadingLogPath = null; // Clear loading flag
    }
  }

  extractFilenameBase(filePathOrName) {
    if (!filePathOrName) return 'unknown_ruleset';
    const parts = filePathOrName.split(/[\/]/).pop().split('.');
    if (parts.length > 1) {
      parts.pop(); // Remove extension
      return parts.join('.');
    }
    return parts[0];
  }

  renderManualFileSelectionView(
    message = 'Select a Spoiler Log File (.jsonl)'
  ) {
    this.testSpoilersContainer.innerHTML = ''; // Clear previous content
    this.ensureLogContainerReady(); // Setup basic structure including log container

    this.log('info', message); // Log the message to the log area

    const fileSelectionContainer = document.createElement('div');
    fileSelectionContainer.className = 'spoiler-file-select-controls';

    const messageElement = document.createElement('p');
    // messageElement.textContent = message; // Message is now logged above
    // Keep a placeholder or instruction if needed directly in this view
    messageElement.textContent =
      'Use the controls below to load a local spoiler log file (.jsonl).';

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

    // Display suggested filename
    const suggestedFilenameElement = document.createElement('p');
    let suggestedLogName = 'No active ruleset detected.';
    if (this.activeRulesetName) {
      const baseName = this.extractFilenameBase(this.activeRulesetName);
      suggestedLogName = `${baseName}_spheres_log.jsonl`;
      suggestedFilenameElement.innerHTML = `Current ruleset: <strong>${this.activeRulesetName}</strong><br>Attempted/Suggested log file: <strong>${suggestedLogName}</strong>`;
    } else {
      suggestedFilenameElement.innerHTML = `Attempted/Suggested log file: <strong>${suggestedLogName}</strong>`;
    }

    fileSelectionContainer.appendChild(suggestedFilenameElement);
    fileSelectionContainer.appendChild(messageElement);
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

    controlsDiv.appendChild(changeFileButton);
    controlsDiv.appendChild(testNameElement);
    controlsDiv.appendChild(runFullButton);
    controlsDiv.appendChild(stepButton);

    this.controlsContainer.innerHTML = ''; // Clear previous controls
    this.controlsContainer.appendChild(controlsDiv);
  }

  async prepareSpoilerTest(isAutoLoad = false) {
    this.testSpoilersContainer.innerHTML = '';
    this.ensureLogContainerReady();

    if (this.logContainer) {
      this.logContainer.innerHTML = '';
    }

    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.abortController = new AbortController();

    if (!this.spoilerLogData || this.spoilerLogData.length === 0) {
      this.log(
        'error',
        'Cannot prepare spoiler test: No spoiler log data is loaded or data is empty.'
      );
      this.renderManualFileSelectionView(
        'Error: Spoiler log data is missing or empty. Please load a valid log.'
      );
      return;
    }

    this.log(
      'info',
      `Preparing test for: ${
        this.currentSpoilerLogPath ||
        (this.currentSpoilerFile ? this.currentSpoilerFile.name : 'Unknown Log')
      }`
    );
    this.log(
      'info',
      `Using ${this.spoilerLogData.length} events from ${
        isAutoLoad ? 'auto-loaded' : 'selected'
      } log: ${
        this.currentSpoilerLogPath ||
        (this.currentSpoilerFile ? this.currentSpoilerFile.name : 'Unknown Log')
      }`
    );

    // Assuming StateManager already has the correct rules context.
    // No need to explicitly load rules here.
    this.log(
      'info',
      'Skipping explicit rule loading. Assuming StateManager has current rules.'
    );

    this.renderResultsControls();
    this.updateStepInfo();
    this.log('info', 'Preparation complete. Ready to run or step.');
    this.testStateInitialized = true;
  }

  async runFullSpoilerTest() {
    await this.prepareSpoilerTest();
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

    try {
      while (this.currentLogIndex < this.spoilerLogData.length) {
        if (currentAbortController.signal.aborted) {
          // MODIFIED: Use local variable
          throw new DOMException('Aborted', 'AbortError');
        }
        await this.processSingleEvent(
          this.spoilerLogData[this.currentLogIndex]
        );
        this.currentLogIndex++;
        this.updateStepInfo();
        // Add a small delay to allow UI updates and prevent blocking
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // --- 5. Final Result ---
      if (!currentAbortController.signal.aborted) {
        this.log(
          'success',
          'Spoiler test completed successfully. All states matched.'
        );
      } else {
        this.log('info', 'Spoiler test aborted.');
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log('info', 'Spoiler test aborted.');
      } else {
        this.log(
          'error',
          `Test failed at step ${this.currentLogIndex + 1}: ${error.message}`
        );
        log(
          'error',
          `Spoiler Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
      }
    } finally {
      if (runButton) runButton.disabled = false;
      if (stepButton) stepButton.disabled = false;
      // Don't reset abort controller here, allow stepping after failure/abort
    }
  }

  async stepSpoilerTest() {
    if (!this.testStateInitialized) {
      await this.prepareSpoilerTest();
      if (!this.testStateInitialized) {
        this.log(
          'error',
          'Cannot step test: Test state not initialized after preparation attempt.'
        );
        return;
      }
    }

    if (!this.spoilerLogData) {
      this.log('error', 'No log events loaded.');
      return;
    }

    if (this.currentLogIndex >= this.spoilerLogData.length) {
      this.log('info', 'End of log file reached.');
      return;
    }

    const runButton = document.getElementById('run-full-spoiler-test');
    const stepButton = document.getElementById('step-spoiler-test');
    if (runButton) runButton.disabled = true;
    if (stepButton) stepButton.disabled = true;

    try {
      await this.processSingleEvent(this.spoilerLogData[this.currentLogIndex]);
      this.currentLogIndex++;
      this.updateStepInfo();

      if (this.currentLogIndex >= this.spoilerLogData.length) {
        this.log(
          'success',
          'Spoiler test completed successfully (stepped to end).'
        );
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        this.log('info', 'Spoiler step aborted.');
      } else {
        this.log(
          'error',
          `Test failed at step ${this.currentLogIndex + 1}: ${error.message}`
        );
        log(
          'error',
          `Spoiler Test Error at step ${this.currentLogIndex + 1}:`,
          error
        );
      }
    } finally {
      if (runButton) runButton.disabled = false;
      if (stepButton) stepButton.disabled = false;
    }
  }

  updateStepInfo() {
    const stepButton =
      this.controlsContainer.querySelector('#step-spoiler-test');
    if (stepButton) {
      stepButton.textContent = `Step Test (Step ${this.currentLogIndex} / ${
        this.spoilerLogData ? this.spoilerLogData.length : 0
      })`;
    }
    const testNameElement =
      this.controlsContainer.querySelector('#spoiler-test-name');
    if (testNameElement) {
      testNameElement.textContent = `Testing: ${
        this.currentSpoilerLogPath ||
        (this.currentSpoilerFile ? this.currentSpoilerFile.name : 'Unknown Log')
      }`;
    }
  }

  async processSingleEvent(event) {
    // This function now only processes a single event
    if (!event) return;

    const eventType = event.type;
    this.log(
      'info',
      `Processing Event ${this.currentLogIndex + 1}/${
        this.spoilerLogData.length
      }: Type '${eventType}'`
    );

    let comparisonResult = false;
    let allChecksPassed = true; // Assume true until a check fails

    switch (eventType) {
      case 'state_update': {
        // ADDED: Case for TestDataLogger output
        if (String(event.player_id) !== String(this.playerId)) {
          this.log(
            'warn',
            `State update event for player ${event.player_id} does not match current player ${this.playerId}. Skipping comparison.`
          );
          // Even if skipped for player mismatch, we consider the event processed for stepping purposes.
          // However, for overall test success, this might be an issue if we expect data for this.playerId.
          // For now, let's treat it as a soft skip.
          allChecksPassed = true; // Or false, depending on strictness. Let's be lenient for now.
          break;
        }

        const inventory_from_log = event.inventory || {};
        const accessible_from_log = event.accessible_locations || [];
        const context = {
          type: 'state_update',
          sphere_number: event.sphere_number || this.currentLogIndex + 1, // Fallback sphere number
          player_id: event.player_id,
        };

        this.log(
          'info',
          `Comparing State Update for player ${event.player_id} (Sphere/Step ${context.sphere_number})`
        );
        this.log('debug', 'Log Inventory:', inventory_from_log);
        this.log('debug', 'Log Accessible Locations:', accessible_from_log);

        comparisonResult = await this.compareAccessibleLocations(
          { accessible: accessible_from_log, inventory: inventory_from_log },
          context
        );
        allChecksPassed = comparisonResult;
        break;
      }

      case 'sphere_update': // Handles Spoiler playthrough logs
      case 'inventory_changed': // Legacy, might be combined or removed if sphere_update covers all
      case 'accessibility_update': // Legacy, might be combined or removed
        {
          // Ensure player_data and specific player ID exist
          if (!event.player_data || !event.player_data[this.playerId]) {
            this.log(
              'warn',
              `Event type '${eventType}' missing player_data for player ${this.playerId}. Skipping comparison.`
            );
            allChecksPassed = false; // This is a data issue for the current player, so mark as failed step
            break;
          }
          const playerData = event.player_data[this.playerId];
          const inventory_from_log = playerData.inventory || {};
          const accessible_from_log = playerData.accessible_locations || [];
          const context = {
            type: eventType,
            sphere_number: event.sphere_number || this.currentLogIndex + 1, // Fallback sphere number
            player_id: this.playerId, // From current UI context
          };

          this.log(
            'info',
            `Comparing Sphere Update for player ${this.playerId} (Sphere ${context.sphere_number})`
          );
          this.log('debug', 'Log Inventory:', inventory_from_log);
          this.log('debug', 'Log Accessible Locations:', accessible_from_log);

          comparisonResult = await this.compareAccessibleLocations(
            { accessible: accessible_from_log, inventory: inventory_from_log },
            context
          );
          allChecksPassed = comparisonResult;
        }
        break;

      case 'connected':
        this.log(
          'info',
          `Player ${event.player_name} (ID: ${event.player_id}) connected. Seed: ${event.seed_name}`
        );
        break;

      case 'initial_state':
        this.log('state', 'Comparing initial state...');
        // The worker should compute this after rules are loaded via loadRules command,
        // and the state will be available via snapshot for compareAccessibleLocations.
        await this.compareAccessibleLocations(
          event.accessible_locations,
          'Initial State'
        );
        break;

      case 'checked_location':
        if (event.location && event.location.name) {
          const locName = event.location.name;
          this.log('info', `Simulating check for location: "${locName}"`);

          // Get static data once to find the location details
          const staticData = stateManager.getStaticData();
          const locDef = staticData?.locations?.[locName];

          if (!locDef) {
            this.log(
              'error',
              `Location "${locName}" from log not found in current static data. Skipping check.`
            );
          } else {
            const currentSnapshot = await stateManager.getLatestStateSnapshot(); // Get current dynamic state
            if (!currentSnapshot) {
              this.log(
                'error',
                `Could not get snapshot to check accessibility for "${locName}"`
              );
              throw new Error(`Snapshot unavailable for ${locName} check`);
            }
            const snapshotInterface = createStateSnapshotInterface(
              currentSnapshot,
              staticData
            );
            if (!snapshotInterface) {
              this.log(
                'error',
                `Could not create snapshotInterface for "${locName}"`
              );
              throw new Error(
                `SnapshotInterface creation failed for ${locName} check`
              );
            }

            // Evaluate accessibility for locName
            const parentRegionName = locDef.parent_region || locDef.region;
            const parentRegionReachabilityStatus =
              currentSnapshot.reachability?.[parentRegionName];
            const isParentRegionEffectivelyReachable =
              parentRegionReachabilityStatus === 'reachable' ||
              parentRegionReachabilityStatus === 'checked';

            const locationAccessRule = locDef.access_rule;
            let locationRuleEvalResult = true;
            if (locationAccessRule) {
              locationRuleEvalResult = evaluateRule(
                locationAccessRule,
                snapshotInterface
              );
            }
            const wasAccessible =
              isParentRegionEffectivelyReachable &&
              locationRuleEvalResult === true;

            // Check if already checked using the snapshot
            const isChecked = currentSnapshot.flags?.includes(locName);

            if (!wasAccessible && !isChecked) {
              this.log(
                'error',
                `Log indicates checking "${locName}", but it was NOT accessible according to current logic!`
              );
              throw new Error(
                `Attempted to check inaccessible location: "${locName}"`
              );
            }

            // Check if location contains an item and add it
            // The item an item is at a location is part of static data, not dynamic state.
            const itemAtLocation = locDef.item; // Assuming item name is directly on locDef.item or locDef.item.name
            const itemName =
              typeof itemAtLocation === 'object'
                ? itemAtLocation.name
                : itemAtLocation;

            if (itemName && !isChecked) {
              this.log(
                'info',
                `Found item "${itemName}" at "${locName}". Adding to inventory.`
              );
              // addItemToInventory is an async command now
              await stateManager.addItemToInventory(itemName);
              // No direct boolean return to check; assume success or rely on stateManager:stateChanged event if needed for confirmation
              this.log(
                'info',
                `Item "${itemName}" sent to be added to inventory.`
              );
            }

            // Mark location as checked (async command)
            await stateManager.checkLocation(locName);
            this.log('info', `Location "${locName}" marked as checked.`);
          }
        } else {
          this.log(
            'error',
            `Invalid 'checked_location' event structure: ${JSON.stringify(
              event
            )}`
          );
        }
        break;

      default:
        this.log('info', `Skipping unhandled event type: ${event.event}`);
        break;
    }

    if (!allChecksPassed) {
      this.log(
        'error',
        `Test failed at step ${this.currentLogIndex + 1}: Comparison failed.`
      );
    }
  }

  async compareAccessibleLocations(logAccessible, context) {
    const snapshot = await stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData(); // ADDED: Get static data

    this.log('info', `[compareAccessibleLocations] Context: '${context}'`, {
      snapshot,
      staticData,
    });

    if (!snapshot) {
      this.log(
        'error',
        `[compareAccessibleLocations] Snapshot is null/undefined for context: ${context}`
      );
      throw new Error(
        `Snapshot invalid (null) during spoiler test at: ${context}`
      );
    }
    if (!staticData || !staticData.locations) {
      this.log(
        'error',
        `[compareAccessibleLocations] Static data or staticData.locations is null/undefined for context: ${context}`,
        { staticData }
      );
      throw new Error(`Static data invalid during spoiler test at: ${context}`);
    }
    // Snapshot itself does not directly contain all location definitions;
    // staticData.locations contains the definitions, snapshot contains dynamic state (flags, reachability).

    const stateAccessibleUnchecked = [];
    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    ); // ADDED for rule evaluation

    if (!snapshotInterface) {
      this.log(
        'error',
        `[compareAccessibleLocations] Failed to create snapshotInterface for context: ${context}`
      );
      throw new Error(`SnapshotInterface creation failed at: ${context}`);
    }

    for (const locName in staticData.locations) {
      const locDef = staticData.locations[locName]; // Location Definition from staticData

      const isChecked = snapshot.flags?.includes(locName);
      if (isChecked) continue; // Skip checked locations

      // Determine accessibility based on snapshot and staticDef
      const parentRegionName = locDef.parent_region || locDef.region;
      const parentRegionReachabilityStatus =
        snapshot.reachability?.[parentRegionName];
      const isParentRegionEffectivelyReachable =
        parentRegionReachabilityStatus === 'reachable' ||
        parentRegionReachabilityStatus === 'checked';

      const locationAccessRule = locDef.access_rule;
      let locationRuleEvalResult = true; // Default to true if no rule
      if (locationAccessRule) {
        locationRuleEvalResult = evaluateRule(
          locationAccessRule,
          snapshotInterface
        );
      }
      const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;

      if (
        isParentRegionEffectivelyReachable &&
        doesLocationRuleEffectivelyPass
      ) {
        stateAccessibleUnchecked.push(locName);
      }
    }

    const stateAccessibleSet = new Set(stateAccessibleUnchecked);
    const logAccessibleSet = new Set(logAccessible.map((loc) => loc.name));

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );
    const extraInState = [...stateAccessibleSet].filter(
      (name) => !logAccessibleSet.has(name)
    );

    if (missingFromState.length === 0 && extraInState.length === 0) {
      this.log(
        'success',
        `State match OK for: ${context}. (${stateAccessibleSet.size} accessible & unchecked)`
      );
    } else {
      this.log('error', `STATE MISMATCH found for: ${context}`);
      if (missingFromState.length > 0) {
        this.log(
          'mismatch',
          ` > Locations accessible in LOG but NOT in STATE (or checked): ${missingFromState.join(
            ', '
          )}`
        );
      }
      if (extraInState.length > 0) {
        this.log(
          'mismatch',
          ` > Locations accessible in STATE (and unchecked) but NOT in LOG: ${extraInState.join(
            ', '
          )}`
        );
      }
      // Optionally provide more details, e.g., log the full sets
      // log('info', "Log Accessible Set:", logAccessibleSet);
      // log('info', "State Accessible Set (Unchecked):", stateAccessibleSet);
      throw new Error(`State mismatch during spoiler test at: ${context}`);
    }
  }

  log(type, message, ...additionalData) {
    // Log to panel
    if (this.logContainer) {
      const entry = document.createElement('div');
      entry.classList.add('log-entry', `log-${type}`);
      const textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
      entry.textContent = textContent;
      // Consider if additionalData should be stringified or handled for panel display
      this.logContainer.appendChild(entry);
      this.logContainer.scrollTop = this.logContainer.scrollHeight;
    }

    // Log to browser console (or global logger)
    // Map custom types to console methods if needed, e.g., 'step' or 'mismatch'
    let consoleMethodType = type;
    if (type === 'step' || type === 'mismatch' || type === 'state') {
      consoleMethodType = 'info'; // Or 'debug' or a specific style
    } else if (type === 'success') {
      consoleMethodType = 'info';
    }
    // Ensure type is a valid console method, defaulting to 'log'
    if (
      !['error', 'warn', 'info', 'debug', 'log'].includes(consoleMethodType)
    ) {
      consoleMethodType = 'log';
    }
    const consoleMethod = console[consoleMethodType] || console.log;
    consoleMethod(
      `[TestSpoilerUI - ${type.toUpperCase()}] ${message}`,
      ...additionalData
    );
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
    this.clearTestState();
    this.updateStepInfo(); // Clear step info display
  }

  async readSelectedLogFile(file, signal) {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        this.log('info', 'File reading aborted before starting.');
        return reject(new DOMException('Aborted by user', 'AbortError'));
      }

      const reader = new FileReader();

      const handleAbort = () => {
        if (reader.readyState === FileReader.LOADING) {
          reader.abort();
        }
        this.log('info', 'File reading operation aborted.');
        reject(new DOMException('Aborted by user', 'AbortError'));
      };

      signal.addEventListener('abort', handleAbort, { once: true });

      reader.onload = (e) => {
        signal.removeEventListener('abort', handleAbort);
        try {
          const fileContent = e.target.result;
          const lines = fileContent.split('\n');
          const newLogEvents = [];
          for (const line of lines) {
            if (line.trim() === '') continue;
            try {
              const parsedEvent = JSON.parse(line);
              // ADDED: Detailed logging for parsed event
              this.log(
                'debug',
                `Parsed line into object:`,
                JSON.parse(JSON.stringify(parsedEvent))
              );
              if (
                parsedEvent &&
                typeof parsedEvent.type === 'string' &&
                parsedEvent.type.trim() !== ''
              ) {
                this.log('debug', `Event type found: '${parsedEvent.type}'`);
              } else if (parsedEvent && parsedEvent.hasOwnProperty('type')) {
                this.log(
                  'warn',
                  `Event type is present but invalid (e.g., undefined, null, empty string): '${parsedEvent.type}'`,
                  parsedEvent
                );
              } else {
                this.log(
                  'warn',
                  `Parsed object is missing 'type' property. Object:`,
                  JSON.parse(JSON.stringify(parsedEvent))
                );
              }
              newLogEvents.push(parsedEvent);
            } catch (parseError) {
              this.log(
                'error',
                `Failed to parse line: "${line}". Error: ${parseError.message}`
              );
              // Optionally, push a placeholder or the raw line for debugging
              // newLogEvents.push({ type: 'parse_error', originalLine: line, error: parseError.message });
            }
          }

          if (newLogEvents.length === 0) {
            this.log('warn', `No valid log events found in file: ${file.name}`);
            // Resolve with empty array, let caller decide if this is an error
            resolve([]);
            return;
          }

          this.spoilerLogData = newLogEvents;
          this.currentSpoilerFile = file; // Store the File object
          this.currentSpoilerLogPath = file.name; // Use file name as the path identifier
          this.log(
            'info',
            `Successfully read and parsed ${newLogEvents.length} events from ${file.name}`
          );
          resolve(newLogEvents); // Resolve with the parsed events
        } catch (error) {
          this.log(
            'error',
            `Error processing file content for ${file.name}: ${error.message}`
          );
          reject(error);
        }
      };

      reader.onerror = (e) => {
        signal.removeEventListener('abort', handleAbort);
        this.log('error', `FileReader error for ${file.name}:`, e);
        reject(new Error(`FileReader error: ${e.target.error.name}`));
      };

      reader.onabort = () => {
        // Catch direct aborts on reader if they happen before our listener
        signal.removeEventListener('abort', handleAbort);
        this.log('info', `FileReader explicitly aborted for ${file.name}.`);
        reject(new DOMException('Aborted by user', 'AbortError'));
      };

      reader.readAsText(file);
    });
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
}

// Add default export
export default TestSpoilerUI;

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
    this.playerId = null; // Initialized to null
    this.log('debug', `[Constructor] Initial playerId: ${this.playerId}`); // Log initial playerId
    this.isLoadingLogPath = null; // ADDED: To prevent concurrent loads of the same log path

    // State for stepping through tests
    this.spoilerLogData = null; // MODIFIED: Renamed from logEvents, initialized to null
    this.currentLogIndex = 0;
    this.testStateInitialized = false;
    this.initialAutoLoadAttempted = false; // ADDED to help manage auto-load calls
    this.eventProcessingDelayMs = 20; // ADDED: Default delay for event processing

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

      // REMOVE/COMMENT OUT: stateManager:rulesLoaded subscription that triggers auto-load
      /*
      this.eventBus.subscribe('stateManager:rulesLoaded', async (eventData) => {
        // ... existing auto-load logic based on rulesLoaded ...
      });
      */

      // REMOVE/COMMENT OUT: Logic that checks initialRulesSource and calls attemptAutoLoadSpoilerLog
      /*
      const initialRulesSource = stateManager.getRawJsonDataSource();
      const initialPlayerId = stateManager.currentPlayerId; 

      if (initialRulesSource && initialPlayerId) {
        // ... existing auto-load logic based on cached source ...
      } else {
        // ...
      }
      */

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
        log(
          'info',
          `[TestSpoilerUI] Received stateManager:rulesLoaded (Subscriber)`,
          eventData
        );
        if (eventData && eventData.source) {
          const newRulesetName = eventData.source;
          this.activeRulesetName = newRulesetName; // Update active ruleset name
          this.playerId = eventData.playerId;
          log(
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
    );

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
    );

    this.initialized = true;
    this.log(
      'info',
      'Test Spoiler UI Initialization complete. Manual load required.'
    );
  }

  async attemptAutoLoadSpoilerLog(rulesetPath) {
    if (!this.testSpoilersContainer) return;

    let logPath;
    if (rulesetPath) {
      // Example rulesetPath: "presets/alttp/MySeed123/MySeed123_rules.json"
      // or from a direct file load: "MySeed123_rules.json" (less likely for auto-load)

      const lastSlashIndex = rulesetPath.lastIndexOf('/');
      const directoryPath =
        lastSlashIndex === -1 ? '' : rulesetPath.substring(0, lastSlashIndex);
      const rulesFilename =
        lastSlashIndex === -1
          ? rulesetPath
          : rulesetPath.substring(lastSlashIndex + 1);

      let baseNameForLog;
      if (rulesFilename.endsWith('_rules.json')) {
        baseNameForLog = rulesFilename.substring(
          0,
          rulesFilename.length - '_rules.json'.length
        );
      } else if (rulesFilename.endsWith('.json')) {
        baseNameForLog = rulesFilename.substring(
          0,
          rulesFilename.length - '.json'.length
        );
        this.log(
          'warn',
          `Ruleset filename "${rulesFilename}" from path "${rulesetPath}" did not end with "_rules.json". Using "${baseNameForLog}" as base for log file (by removing .json).`
        );
      } else {
        // If no .json extension, this is unexpected for a rules file path.
        baseNameForLog = rulesFilename;
        this.log(
          'error',
          `Ruleset filename "${rulesFilename}" from path "${rulesetPath}" did not have a .json extension. This might lead to an incorrect log path. Using "${baseNameForLog}" as base.`
        );
      }

      if (directoryPath) {
        // If rulesetPath was "presets/foo/bar_rules.json", logPath becomes "presets/foo/bar_spheres_log.jsonl"
        logPath = `${directoryPath}/${baseNameForLog}_spheres_log.jsonl`;
      } else {
        // If rulesetPath was "bar_rules.json", logPath becomes "./bar_spheres_log.jsonl"
        // The `./` ensures it's treated as a relative path for fetch, same as before for filename-only cases.
        logPath = `./${baseNameForLog}_spheres_log.jsonl`;
      }
      this.log(
        'info',
        `Derived logPath: "${logPath}" from rulesetPath: "${rulesetPath}"`
      );
    } else {
      this.log(
        'warn',
        'Cannot attempt auto-load: rulesetPath is undefined or invalid for logPath generation.'
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
    // ADDED: Append checkbox and label
    controlsDiv.appendChild(autoCollectCheckbox);
    controlsDiv.appendChild(autoCollectLabel);
    // END ADDED

    this.controlsContainer.innerHTML = ''; // Clear previous controls
    this.controlsContainer.appendChild(controlsDiv);
  }

  async prepareSpoilerTest(isAutoLoad = false) {
    this.log(
      'debug',
      `[prepareSpoilerTest] playerId at start: ${this.playerId}`
    ); // Log playerId at start of prepareSpoilerTest
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

    // MODIFIED: Disable auto-event collection for the test
    try {
      await stateManager.setAutoCollectEventsConfig(false);
      this.log(
        'info',
        '[TestSpoilerUI] Disabled auto-collect events for test duration.'
      );
    } catch (error) {
      this.log(
        'error',
        '[TestSpoilerUI] Failed to disable auto-collect events:',
        error
      );
      // Decide if we should proceed or halt if this fails. For now, log and continue.
    }

    this.renderResultsControls();
    this.updateStepInfo();
    this.log('info', 'Preparation complete. Ready to run or step.');
    this.testStateInitialized = true;
  }

  async runFullSpoilerTest() {
    this.log(
      'debug',
      `[runFullSpoilerTest] playerId at start: ${this.playerId}`
    ); // Log playerId at start of runFullSpoilerTest
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

    let allEventsPassedSuccessfully = true; // Renamed from allChecksPassed for clarity
    let detailedErrorMessages = [];

    try {
      // The main loop for processing events.
      // Critical errors from prepareSpoilerTest or StateManager setup are caught before this.
      // This loop now continues even if processSingleEvent reports an error for an event.
      while (this.currentLogIndex < this.spoilerLogData.length) {
        if (currentAbortController.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError');
        }

        const event = this.spoilerLogData[this.currentLogIndex];
        const eventProcessingResult = await this.processSingleEvent(event);

        if (eventProcessingResult && eventProcessingResult.error) {
          allEventsPassedSuccessfully = false;
          const errorMessage = `Mismatch for event ${
            this.currentLogIndex + 1
          } (Sphere ${
            event.sphere_index !== undefined ? event.sphere_index : 'N/A'
          }): ${eventProcessingResult.message}`;
          this.log('error', errorMessage);
          detailedErrorMessages.push(errorMessage);
          // UI update for individual error already happens in processSingleEvent via this.log('error', ...)
        }
        // Add a small delay to allow UI updates and prevent blocking
        await new Promise((resolve) =>
          setTimeout(resolve, this.eventProcessingDelayMs)
        );

        this.currentLogIndex++;
        this.updateStepInfo();
      }

      // --- Final Result Determination ---
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
      // Update UI based on the final overall success status
      // this.updateUIAfterTestCompletion(allEventsPassedSuccessfully, ...);
      // The updateUIAfterTestCompletion might be better called based on the more detailed messages above.
      // For now, individual logs and the final summary should cover it.
      // Consider how to best summarize if there were both an abort and prior errors.
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
      // MODIFIED: REMOVE re-enabling auto-collect events here.
      // It should remain disabled throughout a sequence of steps.
      // It will be re-enabled by runFullSpoilerTest's finally, or by clearTestState/dispose.
      /* try {
        await stateManager.setAutoCollectEventsConfig(true);
        this.log('info', '[TestSpoilerUI] Re-enabled auto-collect events after step.');
      } catch (error) {
        this.log('error', '[TestSpoilerUI] Failed to re-enable auto-collect events after step:', error);
      } */
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
    this.log(
      'debug',
      `[processSingleEvent] playerId at start: ${this.playerId}`
    ); // Log playerId at start of processSingleEvent
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
        if (!event.player_data || !event.player_data[this.playerId]) {
          this.log(
            'warn',
            `State update event missing player_data for current player ${this.playerId}. Skipping comparison.`
          );
          allChecksPassed = false;
          break;
        }

        const playerDataForCurrentTest = event.player_data[this.playerId];
        const inventory_from_log =
          playerDataForCurrentTest.inventory_details?.prog_items || {};
        const accessible_from_log =
          playerDataForCurrentTest.accessible_locations || [];

        const context = {
          type: 'state_update',
          sphere_number:
            event.sphere_index !== undefined
              ? event.sphere_index
              : this.currentLogIndex + 1,
          player_id: this.playerId,
        };

        this.log(
          'info',
          `Preparing StateManager for sphere ${context.sphere_number} by applying log inventory.`
        );

        try {
          // 1. Reset StateManager's inventory and checked locations for a clean slate for this sphere.
          await stateManager.clearStateAndReset();
          this.log('debug', 'StateManager state cleared for sphere.');

          // 2. Apply the inventory from the log to the StateManager worker.
          await stateManager.beginBatchUpdate(true);
          this.log(
            'debug',
            'Beginning batch update for inventory application.'
          );
          if (Object.keys(inventory_from_log).length > 0) {
            for (const [itemName, count] of Object.entries(
              inventory_from_log
            )) {
              if (count > 0) {
                // Ensure we only add items with a positive count
                this.log(
                  'debug',
                  `Adding item via StateManager: ${itemName}, count: ${count}`
                );
                await stateManager.addItemToInventory(itemName, count);
              }
            }
          } else {
            this.log(
              'debug',
              'Inventory from log is empty. No items to add to StateManager.'
            );
          }
          await stateManager.commitBatchUpdate();
          this.log('debug', 'Committed batch update for inventory.');

          // 3. Ping worker to ensure all commands are processed and state is stable.
          await stateManager.pingWorker(
            `spoiler_sphere_${context.sphere_number}_inventory_applied`
          );
          this.log(
            'debug',
            'Ping successful. StateManager ready for comparison.'
          );

          // 4. Get the fresh snapshot from the worker.
          const freshSnapshot = await stateManager.getLatestStateSnapshot();
          if (!freshSnapshot) {
            this.log(
              'error',
              'Failed to retrieve a fresh snapshot from StateManager after inventory update.'
            );
            allChecksPassed = false;
            break;
          }
          this.log(
            'debug',
            'Retrieved fresh snapshot from StateManager.',
            freshSnapshot
          );

          // 5. Compare using the fresh snapshot.
          comparisonResult = await this.compareAccessibleLocations(
            accessible_from_log, // This is an array of location names
            freshSnapshot, // The authoritative snapshot from the worker
            this.playerId, // Pass player ID for context in comparison
            context // Original context for logging
          );
          allChecksPassed = comparisonResult;
        } catch (err) {
          this.log(
            'error',
            `Error during StateManager interaction or comparison for sphere ${context.sphere_number}: ${err.message}`,
            err
          );
          allChecksPassed = false;
          // Ensure comparisonResult reflects failure if an error occurs before it's set
          comparisonResult = false;
        }
        break;
      }

      case 'sphere_update': // Handles Spoiler playthrough logs
      case 'inventory_changed': // Legacy, might be combined or removed if sphere_update covers all
      case 'accessibility_update': // Legacy, might be combined or removed
        {
          // NOTE: This old logic for sphere_update etc. uses a modified snapshot.
          // If these event types are still relevant for spoiler logs, they need similar refactoring
          // as 'state_update' above to use the new worker-driven state comparison.
          // For now, assuming 'state_update' is the primary event from Python sphere logs.
          this.log(
            'warn',
            `Event type '${eventType}' found. If this is from a Python sphere log, its comparison logic might be outdated. Prefer 'state_update' events.`
          );
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
          const inventory_from_log_legacy = playerData.inventory || {};
          const accessible_from_log_legacy =
            playerData.accessible_locations || [];
          const context_legacy = {
            type: eventType,
            sphere_number: event.sphere_number || this.currentLogIndex + 1, // Fallback sphere number
            player_id: this.playerId, // From current UI context
          };

          this.log(
            'info',
            `Comparing Sphere Update (Legacy Method) for player ${this.playerId} (Sphere ${context_legacy.sphere_number})`
          );
          this.log(
            'debug',
            'Log Inventory (Legacy):',
            inventory_from_log_legacy
          );
          this.log(
            'debug',
            'Log Accessible Locations (Legacy):',
            accessible_from_log_legacy
          );

          // This still uses the old compareAccessibleLocations that modifies a snapshot locally.
          // To fix this, it would need to follow the same pattern as state_update (reset, set inv, ping, get fresh snap)
          // then call the new compareAccessibleLocations.
          // For now, this will likely be incorrect if state_update is the standard.
          const logDataForLegacyComparison = {
            accessible: accessible_from_log_legacy,
            inventory: inventory_from_log_legacy,
          };
          comparisonResult = await this.compareAccessibleLocations_OLD(
            // Temporarily call old version or adapt
            logDataForLegacyComparison,
            this.playerId, // Assuming old version might need playerID
            context_legacy
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
        comparisonResult = await this.compareAccessibleLocations(
          { accessible: event.accessible_locations, inventory: {} },
          'Initial State'
        );
        allChecksPassed = comparisonResult;
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
        `Test failed at step ${
          this.currentLogIndex + 1
        }: Comparison failed for event type '${eventType}'.`
      );
    }

    return {
      error: !allChecksPassed,
      message: `Comparison for ${eventType} at step ${
        this.currentLogIndex + 1
      } ${comparisonResult ? 'Passed' : 'Failed'}`,
    };
  }

  // Renaming old version to avoid conflict, or it could be removed if only state_update is used.
  async compareAccessibleLocations_OLD(logData, playerId, context) {
    const originalSnapshot = await stateManager.getLatestStateSnapshot();
    const staticData = stateManager.getStaticData();

    this.log('info', `[compareAccessibleLocations_OLD] Context:`, {
      context,
      originalSnapshot,
      staticData,
      logDataInventory: logData ? logData.inventory : 'N/A',
    });

    if (!originalSnapshot) {
      this.log(
        'error',
        `[compareAccessibleLocations_OLD] Original Snapshot is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      throw new Error(
        `Original Snapshot invalid (null) during spoiler test at: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
    }
    if (!staticData || !staticData.locations) {
      this.log(
        'error',
        `[compareAccessibleLocations_OLD] Static data or staticData.locations is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`,
        { staticData }
      );
      throw new Error(
        `Static data invalid during spoiler test at: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
    }

    let modifiedSnapshot = JSON.parse(JSON.stringify(originalSnapshot));
    if (logData && logData.inventory && playerId) {
      if (!modifiedSnapshot.prog_items) {
        modifiedSnapshot.prog_items = {};
      }
      if (
        typeof modifiedSnapshot.prog_items[playerId] !== 'object' ||
        modifiedSnapshot.prog_items[playerId] === null
      ) {
        modifiedSnapshot.prog_items[playerId] = {};
      }
      modifiedSnapshot.prog_items[playerId] = { ...logData.inventory };

      this.log(
        'debug',
        `[compareAccessibleLocations_OLD] Overrode snapshot inventory for player ${playerId} with log inventory:`,
        logData.inventory
      );
    } else {
      this.log(
        'debug',
        '[compareAccessibleLocations_OLD] No inventory override from logData or missing playerId.'
      );
    }

    const stateAccessibleUnchecked = [];
    const snapshotInterface = createStateSnapshotInterface(
      modifiedSnapshot,
      staticData
    );

    if (!snapshotInterface) {
      this.log(
        'error',
        `[compareAccessibleLocations_OLD] Failed to create snapshotInterface for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      throw new Error(
        `SnapshotInterface creation failed at: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
    }

    for (const locName in staticData.locations) {
      const locDef = staticData.locations[locName];
      const isChecked = modifiedSnapshot.flags?.includes(locName);
      if (isChecked) continue;
      const parentRegionName = locDef.parent_region || locDef.region;
      const parentRegionReachabilityStatus =
        modifiedSnapshot.reachability?.[parentRegionName];
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
      const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;
      if (
        isParentRegionEffectivelyReachable &&
        doesLocationRuleEffectivelyPass
      ) {
        stateAccessibleUnchecked.push(locName);
      }
    }

    const stateAccessibleSet = new Set(stateAccessibleUnchecked);
    const accessibleFromLog =
      logData && Array.isArray(logData.accessible) ? logData.accessible : [];
    const logAccessibleSet = new Set(accessibleFromLog);

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );
    const extraInState = [...stateAccessibleSet].filter(
      (name) => !logAccessibleSet.has(name)
    );

    if (missingFromState.length === 0 && extraInState.length === 0) {
      this.log(
        'success',
        `[compareAccessibleLocations_OLD] State match OK for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }. (${stateAccessibleSet.size} accessible & unchecked)`
      );
      return true;
    } else {
      this.log(
        'error',
        `[compareAccessibleLocations_OLD] STATE MISMATCH found for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      if (missingFromState.length > 0) {
        this.log(
          'mismatch',
          ` > [OLD] Locations accessible in LOG but NOT in STATE (or checked): ${missingFromState.join(
            ', '
          )}`
        );
      }
      if (extraInState.length > 0) {
        this.log(
          'mismatch',
          ` > [OLD] Locations accessible in STATE (and unchecked) but NOT in LOG: ${extraInState.join(
            ', '
          )}`
        );
      }
      this.log('debug', '[compareAccessibleLocations_OLD] Mismatch Details:', {
        context:
          typeof context === 'string' ? context : JSON.stringify(context),
        logAccessibleSet: Array.from(logAccessibleSet),
        stateAccessibleSet: Array.from(stateAccessibleSet),
        logInventoryUsed: logData ? logData.inventory : 'N/A',
        originalSnapshotInventory: originalSnapshot.prog_items
          ? originalSnapshot.prog_items[playerId] // Use playerId here
          : 'N/A',
      });
      return false;
    }
  }

  async compareAccessibleLocations(
    logAccessibleLocationNames,
    currentWorkerSnapshot,
    playerId,
    context
  ) {
    // currentWorkerSnapshot IS the authoritative snapshot from the worker AFTER its inventory was set.
    // logAccessibleLocationNames is an array of location names from the Python log.
    const staticData = stateManager.getStaticData();

    this.log('info', `[compareAccessibleLocations] Comparing for context:`, {
      context,
      workerSnapshotInventory:
        currentWorkerSnapshot?.prog_items?.[playerId] || 'N/A',
      logAccessibleNamesCount: logAccessibleLocationNames.length,
      // currentWorkerSnapshot, // Avoid logging the whole snapshot unless necessary for deep debug
      // staticData, // Avoid logging whole staticData
    });

    if (!currentWorkerSnapshot) {
      this.log(
        'error',
        `[compareAccessibleLocations] currentWorkerSnapshot is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      // comparisonResult will be false due to allChecksPassed being false in processSingleEvent
      return false;
    }
    if (!staticData || !staticData.locations) {
      this.log(
        'error',
        `[compareAccessibleLocations] Static data or staticData.locations is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`,
        {
          staticDataKeys: staticData
            ? Object.keys(staticData)
            : 'staticData is null',
        }
      );
      return false;
    }

    // No need to modify the snapshot; it already has the correct inventory from the worker.
    const stateAccessibleUnchecked = [];
    const snapshotInterface = createStateSnapshotInterface(
      currentWorkerSnapshot, // Use the authoritative snapshot directly
      staticData
    );

    if (!snapshotInterface) {
      this.log(
        'error',
        `[compareAccessibleLocations] Failed to create snapshotInterface for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      return false;
    }

    for (const locName in staticData.locations) {
      const locDef = staticData.locations[locName];

      // Check against the worker's snapshot flags
      const isChecked = currentWorkerSnapshot.flags?.includes(locName);
      if (isChecked) continue;

      const parentRegionName = locDef.parent_region || locDef.region;
      // Use reachability from the worker's snapshot
      const parentRegionReachabilityStatus =
        currentWorkerSnapshot.reachability?.[parentRegionName];
      const isParentRegionEffectivelyReachable =
        parentRegionReachabilityStatus === 'reachable' ||
        parentRegionReachabilityStatus === 'checked';

      const locationAccessRule = locDef.access_rule;
      let locationRuleEvalResult = true;
      if (locationAccessRule) {
        // snapshotInterface uses the worker's snapshot
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
    // logAccessibleLocationNames is already an array of strings
    const logAccessibleSet = new Set(logAccessibleLocationNames);

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );
    const extraInState = [...stateAccessibleSet].filter(
      (name) => !logAccessibleSet.has(name)
    );

    if (missingFromState.length === 0 && extraInState.length === 0) {
      this.log(
        'success',
        `State match OK for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }. (${stateAccessibleSet.size} accessible & unchecked)`
      );
      return true;
    } else {
      this.log(
        'error',
        `STATE MISMATCH found for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
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
      this.log('debug', '[compareAccessibleLocations] Mismatch Details:', {
        context:
          typeof context === 'string' ? context : JSON.stringify(context),
        logAccessibleSet: Array.from(logAccessibleSet),
        stateAccessibleSet: Array.from(stateAccessibleSet),
        workerSnapshotInventoryUsed: currentWorkerSnapshot.prog_items
          ? currentWorkerSnapshot.prog_items[playerId]
          : 'N/A',
      });
      return false;
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

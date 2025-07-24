// frontend/modules/testCases/testCaseUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import eventBus from '../../app/core/eventBus.js';
import * as commonUI from '../commonUI/index.js'; // Changed path for renderLogicTree

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testCaseUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testCaseUI] ${message}`, ...data);
  }
}

export class TestCaseUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;

    this.availableTestSets = null; // Loaded from test_files.json
    this.currentTestSet = null; // Name of the currently selected test set file (e.g., "TestLightWorld")
    this.currentFolder = null; // Name of the folder for the current test set (e.g., "vanilla")
    this.testCases = null; // Loaded from _tests.json for the currentTestSet
    this.currentTestRules = null; // Loaded from _rules.json for the currentFolder
    this.currentTestCaseLogData = null; // ADDED: To store parsed log data

    this.initialized = false;
    this.testCasesListContainer = null; // Will hold the list of test cases
    this.viewChangeSubscription = null; // For ui:fileViewChanged
    this.eventBus = eventBus; // Using the imported singleton
    this.rootElement = null; // Root DOM element for this panel
    this.rulesLoadedForSet = false; // Flag: true if currentTestRules are loaded in StateManager
    this.isRunningAllTests = false; // Flag to track if tests are currently running
    this.shouldCancelTests = false; // Flag to signal test cancellation

    // Create root element and initial structure
    this.getRootElement(); // This also sets this.testCasesListContainer
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    } else {
      log('error', '[TestCaseUI] Root element not created in constructor!');
    }

    // Setup delegated event listener for main controls
    if (this.testCasesListContainer) {
      this.boundHandleMainControlsClick =
        this.handleMainControlsClick.bind(this);
      this.testCasesListContainer.addEventListener(
        'click',
        this.boundHandleMainControlsClick
      );
    } else {
      log(
        'error',
        '[TestCaseUI] testCasesListContainer not available in constructor for event listener setup!'
      );
    }

    // Defer full data loading and event subscriptions
    const readyHandler = (eventPayload) => {
      log(
        'info',
        '[TestCaseUI] Received app:readyForUiDataLoad. Initializing test cases UI.'
      );
      this.initialize(); // This will fetch test_files.json and subscribe to events
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler, 'testCases');

    // GoldenLayout destroy listener
    this.container.on('destroy', () => {
      this.dispose();
    });
  }

  getRootElement() {
    if (!this.rootElement) {
      this.rootElement = document.createElement('div');
      this.rootElement.id = 'test-cases-panel';
      this.rootElement.classList.add('panel-container'); // General panel styling
      this.rootElement.style.height = '100%';
      this.rootElement.style.overflowY = 'auto';
      this.rootElement.style.display = 'flex';
      this.rootElement.style.flexDirection = 'column';

      // Initial content will be the test set selector or loading message
      const listContainer = document.createElement('div');
      listContainer.id = 'test-cases-list'; // This will be updated by renderTestSetSelector or renderTestCasesList
      listContainer.style.flexGrow = '1';
      listContainer.style.overflowY = 'auto';
      listContainer.innerHTML = '<p>Loading test case options...</p>';

      this.rootElement.appendChild(listContainer);
      this.testCasesListContainer = listContainer;
    }
    return this.rootElement;
  }

  async initialize() {
    if (this.initialized) {
      log('info', '[TestCaseUI] Already initialized.');
      return true;
    }
    log('info', '[TestCaseUI] Initializing...');

    // Subscribe to view changes
    if (this.eventBus && !this.viewChangeSubscription) {
      this.viewChangeSubscription = this.eventBus.subscribe(
        'ui:fileViewChanged',
        (data) => {
          if (data.newView !== 'test-cases') {
            // Ensure this matches the ID used in FilesUI
            log('info', '[TestCaseUI] View changed away, clearing test data.');
            this.clearDisplayAndState();
          }
        }
      , 'testCases');
    }

    try {
      const response = await fetch('./tests/test_files.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.availableTestSets = await response.json();
      this.renderTestSetSelector(); // Display the list of available test sets
      this.initialized = true;
      log(
        'info',
        '[TestCaseUI] Initialization complete. Test set selector rendered.'
      );
      return true;
    } catch (error) {
      log('error', 'Error loading test_files.json:', error);
      if (this.testCasesListContainer) {
        this.testCasesListContainer.innerHTML = `<div class="error-message">Error loading test sets: ${error.message}</div>`;
      }
      this.initialized = false;
      return false;
    }
  }

  renderTestSetSelector() {
    if (!this.testCasesListContainer) return;
    this.testCasesListContainer.innerHTML = ''; // Clear previous content

    const headerDiv = document.createElement('div');
    headerDiv.className = 'test-header'; // Use general .test-header for styling
    headerDiv.innerHTML = '<h3>Select a Test Set</h3>';
    this.testCasesListContainer.appendChild(headerDiv);

    const setsContainer = document.createElement('div');
    setsContainer.className = 'test-sets-container'; // For styling the list of sets

    if (
      !this.availableTestSets ||
      Object.keys(this.availableTestSets).length === 0
    ) {
      setsContainer.innerHTML = '<p>No test sets found in test_files.json.</p>';
    } else {
      Object.entries(this.availableTestSets).forEach(
        ([folderName, testSetsInFolder]) => {
          const folderDiv = document.createElement('div');
          folderDiv.className = 'test-folder';
          folderDiv.innerHTML = `<h4 class="folder-name">${this.escapeHtml(
            folderName.replace(/([A-Z0-9])/g, ' $1').trim()
          )}</h4>`;

          const folderSetsDiv = document.createElement('div');
          folderSetsDiv.className = 'folder-test-sets';

          Object.entries(testSetsInFolder).forEach(
            ([testSetName, isEnabled]) => {
              if (isEnabled) {
                const displayName = testSetName
                  .replace(/^test/, '')
                  .replace(/([A-Z])/g, ' $1')
                  .trim();
                const button = document.createElement('button');
                button.className = 'test-set-button button'; // Added .button for general styling
                button.dataset.folder = folderName;
                button.dataset.testset = testSetName;
                button.textContent = this.escapeHtml(displayName);
                button.title = `Load test set: ${displayName}`;
                button.addEventListener('click', () =>
                  this.selectTestSet(folderName, testSetName)
                );
                folderSetsDiv.appendChild(button);
              }
            }
          );
          folderDiv.appendChild(folderSetsDiv);
          setsContainer.appendChild(folderDiv);
        }
      );
    }
    this.testCasesListContainer.appendChild(setsContainer);
  }

  async selectTestSet(folderName, testSetName) {
    const logId = `selectTestSet-${Date.now()}`;
    log(
      'info',
      `[TestCaseUI - ${logId}] Initiated for ${folderName}/${testSetName}`
    );

    this.currentFolder = folderName;
    this.currentTestSet = testSetName;
    this.rulesLoadedForSet = false; // Mark as not loaded until confirmed by worker
    this.currentTestCaseLogData = null; // Reset log data for the new set
    this.logToPanel(
      `[${logId}] Selecting test set: "${testSetName}" from folder "${folderName}". Loading associated rules...`
    );

    if (this.testCasesListContainer)
      this.testCasesListContainer.innerHTML = '<p>Loading test set data...</p>';

    try {
      const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';
      const rulesFileBasename = this.currentFolder; // As per exporter.py logic for rules file
      const testFileBasename = testSetName; // As per exporter.py logic for tests file

      // Fetch Rules
      const rulesResponse = await fetch(
        `./tests/${folderPath}${rulesFileBasename}_rules.json`
      );
      if (!rulesResponse.ok)
        throw new Error(`Failed to load rules for ${rulesFileBasename}`);
      this.currentTestRules = await rulesResponse.json(); // Store raw rules for modal display

      // Fetch Test Cases
      const testsResponse = await fetch(
        `./tests/${folderPath}${testFileBasename}_tests.json`
      );
      if (!testsResponse.ok)
        throw new Error(`Failed to load tests for ${testFileBasename}`);
      this.testCases = await testsResponse.json();

      // Fetch Test Case Log Data
      const logFilePath = `./tests/${folderPath}${testFileBasename}_tests_log.jsonl`;
      try {
        const logDataResponse = await fetch(logFilePath);
        if (logDataResponse.ok) {
          const logText = await logDataResponse.text();
          this.currentTestCaseLogData = logText
            .split('\n')
            .filter((line) => line.trim() !== '')
            .map((line) => JSON.parse(line));
          this.logToPanel(
            `[${logId}] Successfully loaded and parsed ${this.currentTestCaseLogData.length} entries from ${logFilePath}.`
          );
        } else {
          this.logToPanel(
            `[${logId}] Warning: Failed to load test log file ${logFilePath} (Status: ${logDataResponse.status}). Comparisons will be skipped.`,
            'warn'
          );
          this.currentTestCaseLogData = null;
        }
      } catch (logError) {
        this.logToPanel(
          `[${logId}] Error loading or parsing test log file ${logFilePath}: ${logError.message}. Comparisons will be skipped.`,
          'error'
        );
        this.currentTestCaseLogData = null;
        log(
          'error',
          `Failed to load or parse log file ${logFilePath}:`,
          logError
        );
      }

      this.logToPanel(
        `[${logId}] Rules and test cases for "${testSetName}" fetched. Applying rules to StateManager worker...`
      );

      // COMMAND 1: Send these specific rules to the worker
      await stateManager.loadRules(this.currentTestRules, {
        playerId: '1', // Or derive from rules if necessary
        playerName: 'TestPlayer1',
      });

      // Wait for worker to confirm rules are loaded and processed
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          unsub(); // Clean up listener
          reject(
            new Error(
              'Timeout waiting for StateManager worker to confirm rules loaded.'
            )
          );
        }, 5000); // 5-second timeout

        const unsub = eventBus.subscribe(
          'stateManager:rulesLoaded',
          (eventPayload) => {
            // Check if the loaded rules correspond to what we just sent (e.g., by gameId or a unique seed if available)
            // For now, assume any rulesLoaded event after our command means our rules are active.
            clearTimeout(timeout);
            this.logToPanel(
              `[${logId}] StateManager worker confirmed rules loaded for test set "${testSetName}". Static data in worker updated.`
            );
            this.rulesLoadedForSet = true; // Crucial flag
            unsub();
            resolve();
          }
        , 'testCases');
      });

      this.renderTestCasesList();
      this.updateDataSourceIndicator(); // Update to show test-specific rules are active

      this.eventBus.publish('ui:notification', {
        type: 'info',
        message: `[${logId}] Test set "${testSetName}" loaded. Rules are now active for testing.`,
      }, 'testCases');
    } catch (error) {
      this.logToPanel(
        `[${logId}] Error loading test set "${testSetName}": ${error.message}`,
        'error'
      );
      log('error', `Failed to load test set "${testSetName}":`, error);
      this.renderTestSetSelector();
    }
  }

  renderTestCasesList() {
    const logId = `renderList-${Date.now()}`;
    log('info', `[TestCaseUI - ${logId}] Initiated for ${this.currentTestSet}`);

    if (
      !this.testCasesListContainer ||
      !this.testCases ||
      !this.testCases.location_tests
    ) {
      if (this.testCasesListContainer)
        this.testCasesListContainer.innerHTML =
          '<p>No test cases to display or error loading tests.</p>';
      return;
    }
    this.testCasesListContainer.innerHTML = ''; // Clear previous content

    // Header for the current test set
    const folderDisplay = this.currentFolder
      ? this.escapeHtml(this.currentFolder.replace(/([A-Z0-9])/g, ' $1').trim())
      : '';
    const testSetDisplay = this.currentTestSet
      ? this.escapeHtml(
          this.currentTestSet
            .replace(/^test/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim()
        )
      : 'Unknown Test Set';

    let headerHtml = `
      <div class="test-header">
        <div class="test-header-row">
          <h3>
            ${
              folderDisplay
                ? `<span class="folder-label">${folderDisplay} /</span> `
                : ''
            }
            ${testSetDisplay}
          </h3>
          <button id="back-to-test-sets" class="button">Back to Test Sets</button>
        </div>
        <div class="test-controls">
          <!-- Removed "Reload Test Data" button, rule loading is now part of selectTestSet -->
          <button id="run-all-tests" class="button run-all-tests-button" data-test-type="run-all" data-action="run-all-tests" title="Run all tests in this test set">Run All Tests for "${testSetDisplay}"</button>
          <button id="cancel-all-tests" class="button cancel-all-tests-button" data-test-type="cancel-all" data-action="cancel-tests" style="display: none;" title="Cancel running tests">Cancel Tests</button>
        </div>
        <div id="data-source-info" class="data-source-info">Current data source: <span id="data-source"></span></div>
        <div id="test-results-summary"></div>
      </div>
    `;
    this.testCasesListContainer.insertAdjacentHTML('beforeend', headerHtml);

    // Create a dedicated container for the test cases table
    const testCasesTableContainer = document.createElement('div');
    testCasesTableContainer.id = 'test-cases-table-container';
    testCasesTableContainer.className = 'test-cases-table-container';

    const table = document.createElement('table');
    table.className = 'results-table'; // From existing styles
    table.id = 'test-cases-results-table';
    // ... (thead creation as before) ...
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    [
      'Location',
      'Expected Access',
      'Required Items',
      'Excluded Items',
      'Actions',
      'Result',
    ].forEach((text) => {
      const th = document.createElement('th');
      th.textContent = text;
      if (text === 'Result') th.style.minWidth = '150px'; // Ensure enough space for messages
      headerRow.appendChild(th);
    });
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    this.testCases.location_tests.forEach((testCaseData, index) => {
      const [
        locationName,
        expectedResult,
        requiredItems = [],
        excludedItems = [],
      ] = testCaseData;
      const row = tbody.insertRow();
      row.className = 'test-case-row';

      const locationCell = row.insertCell();
      locationCell.innerHTML = ''; // Clear previous content

      // Fetch the processed static data from the StateManager proxy
      const processedStaticData = stateManager.getStaticData();
      const locationDataFromProcessed =
        processedStaticData?.locations?.[locationName];

      // Attempt to get region, looking for 'region' first, then 'parent_region' as a fallback.
      const regionNameForLink =
        locationDataFromProcessed?.region ||
        locationDataFromProcessed?.parent_region;

      if (regionNameForLink) {
        const snapshot = stateManager.getLatestStateSnapshot(); // Snapshot is still useful for createRegionLink
        const regionLinkElement = commonUI.createRegionLink(
          regionNameForLink,
          false, // useColorblind - assuming false for TestCaseUI
          snapshot
        );
        // Set the link's visible text to the location name
        regionLinkElement.textContent = this.escapeHtml(locationName);
        regionLinkElement.title = `Navigate to region: ${this.escapeHtml(
          regionNameForLink
        )}`; // Add a helpful title
        locationCell.appendChild(regionLinkElement);
      } else {
        // Fallback: display location name as text if region couldn't be determined
        locationCell.textContent = this.escapeHtml(locationName);
        log(
          'warn',
          `[TestCaseUI] Region could not be determined for location "${locationName}" using processed static data. Location Data:`,
          locationDataFromProcessed
        );
      }

      row.insertCell().textContent = expectedResult ? 'Yes' : 'No';

      const requiredItemsCell = row.insertCell();
      const statusDiv = document.createElement('div'); // This div will be passed to formatItemsList and then placed in the Result cell
      statusDiv.className = 'test-status';
      statusDiv.id = `test-status-${index}`;
      statusDiv.textContent = 'Pending'; // Initial status

      if (requiredItems.length > 0) {
        // For required items, we expect a DocumentFragment to append
        requiredItemsCell.appendChild(
          this.formatItemsList(requiredItems, testCaseData, statusDiv)
        );
      } else {
        requiredItemsCell.textContent = 'None';
      }

      // For excluded items, we expect a string for innerHTML
      row.insertCell().innerHTML = excludedItems.length
        ? this.formatItemsList(excludedItems) // No testCaseData, no statusElement
        : 'None';

      const actionCell = row.insertCell();
      const runButton = document.createElement('button');
      runButton.className = 'button run-test individual-test-button';
      runButton.textContent = 'Run';
      // Add unique identifiers for better targeting
      runButton.id = `run-test-${index}`;
      runButton.dataset.testIndex = index;
      runButton.dataset.locationName = locationName;
      runButton.dataset.testType = 'individual';
      runButton.title = `Run test for ${locationName}`;
      runButton.addEventListener('click', async () => {
        // const statusDiv = row.querySelector(`#test-status-${index}`); // Already have statusDiv
        if (statusDiv) await this.loadTestCase(testCaseData, statusDiv, index);
      });
      actionCell.appendChild(runButton);

      const resultCell = row.insertCell();
      resultCell.appendChild(statusDiv); // Add the statusDiv (which might be updated by item clicks)
    });
    table.appendChild(tbody);
    testCasesTableContainer.appendChild(table);

    // Add Download Links to the table container
    const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';
    const linksHtml = `
      <div class="test-links" style="margin-top: 1rem;">
        <a href="./tests/${folderPath}${this.currentFolder}_rules.json" download target="_blank" class="download-link button">Download Rules Used</a>
        <a href="./tests/${folderPath}${this.currentTestSet}_tests.json" download target="_blank" class="download-link button">Download This Test Case File</a>
      </div>`;
    testCasesTableContainer.insertAdjacentHTML('beforeend', linksHtml);

    // Append the table container to the main list container
    this.testCasesListContainer.appendChild(testCasesTableContainer);

    this.updateDataSourceIndicator(); // Update based on currently loaded rules
  }

  async loadTestCase(testCaseData, statusElement, testCaseIndex) {
    if (!this.rulesLoadedForSet) {
      // Check the flag
      statusElement.innerHTML = `<div class="test-error">Error: Rules for the current test set ("${this.currentTestSet}") are not yet active in the worker. Please re-select the test set or wait.</div>`;
      this.logToPanel(
        'Attempted to run test case, but rules for the current set are not confirmed loaded in StateManager.',
        'error'
      );
      return false;
    }

    statusElement.textContent = 'Sending test to worker...';
    this.logToPanel(`Starting test: ${JSON.stringify(testCaseData)}`);
    const [
      locationName,
      expectedResult,
      requiredItems = [],
      excludedItems = [],
    ] = testCaseData;

    let passed = false;
    let actualResultFromWorker;
    let logComparisonPassed = true; // ADDED: Track log comparison results
    const relevantLogEntries =
      this.currentTestCaseLogData?.filter(
        (entry) => entry.test_case_index === testCaseIndex
      ) || [];

    try {
      // COMMAND 2: Ask the worker to evaluate accessibility with the test-specific inventory
      actualResultFromWorker = await stateManager.applyTestInventoryAndEvaluate(
        locationName,
        requiredItems,
        excludedItems
      );

      if (typeof actualResultFromWorker !== 'boolean') {
        throw new Error(
          `Worker returned non-boolean result for accessibility: ${actualResultFromWorker}`
        );
      }

      passed = actualResultFromWorker === expectedResult;

      let finalMessage = `${
        passed ? '✓ PASS' : '❌ FAIL'
      } (Expected: ${expectedResult}, Actual from Worker: ${actualResultFromWorker})`;
      statusElement.innerHTML = `<div class="${
        passed ? 'test-success' : 'test-failure'
      }">${finalMessage}</div>`;
      this.logToPanel(`Test for ${locationName}: ${finalMessage}`);

      // --- ADDED: Log Comparison for Main Test ---
      if (this.currentTestCaseLogData && relevantLogEntries.length > 0) {
        const mainTestLogEntry = relevantLogEntries.find(
          (entry) =>
            entry.phase_description ===
            'After test items collected (before sweep)'
        );
        if (mainTestLogEntry) {
          await stateManager.pingWorker(`testCaseUI_main_${testCaseIndex}`);
          const currentJsSnapshot = await stateManager.getLatestStateSnapshot();
          const mainComparisonResult = await this.compareStateWithLogEntry(
            currentJsSnapshot,
            mainTestLogEntry,
            statusElement,
            'Main Test State'
          );
          if (!mainComparisonResult) logComparisonPassed = false;
        } else {
          this.logToPanel(
            `Warning: Log entry for "After test items collected (before sweep)" not found for test case index ${testCaseIndex}.`,
            'warn'
          );
          const skippedDiv = document.createElement('div');
          skippedDiv.className = 'log-comparison-skipped';
          skippedDiv.textContent =
            'Log Comparison (Main Test State): SKIPPED (Log entry not found)';
          statusElement.appendChild(skippedDiv);
        }
      } else if (this.currentTestCaseLogData === null) {
        // Log data wasn't loaded, already warned in selectTestSet
      } else {
        this.logToPanel(
          `Warning: No log entries found for test case index ${testCaseIndex}.`,
          'warn'
        );
      }
      // --- END ADDED ---

      // Optional: Validation loop (can also use worker evaluation)
      let validationPassed = true;
      if (
        passed &&
        expectedResult === true &&
        requiredItems.length > 0 &&
        excludedItems.length === 0
      ) {
        this.logToPanel(
          `Validating required items for ${locationName} using worker evaluation...`
        );
        const validationHeader = document.createElement('div');
        validationHeader.textContent = 'CICO Validation:';
        statusElement.appendChild(validationHeader);

        for (const itemToRemove of requiredItems) {
          const itemsForValidation = requiredItems.filter(
            (item) => item !== itemToRemove
          );
          const excludedItemsForValidation = [...excludedItems, itemToRemove];

          const validationResultFromWorker = // JS accessibility after removing itemToRemove
            await stateManager.applyTestInventoryAndEvaluate(
              locationName,
              itemsForValidation,
              excludedItemsForValidation
            );

          // --- ADDED: Log Comparison for CICO "After removing" ---
          if (this.currentTestCaseLogData && relevantLogEntries.length > 0) {
            const removalLogEntry = relevantLogEntries.find(
              (entry) =>
                entry.phase_description ===
                `Exec_func: After removing '${itemToRemove}' (simulated)`
            );
            if (removalLogEntry) {
              await stateManager.pingWorker(
                `testCaseUI_cico_remove_${testCaseIndex}_${itemToRemove}`
              );
              const jsSnapshotAfterRemoval =
                await stateManager.getLatestStateSnapshot();
              const removalComparisonResult =
                await this.compareStateWithLogEntry(
                  jsSnapshotAfterRemoval,
                  removalLogEntry,
                  statusElement,
                  `CICO - Removed '${itemToRemove}'`
                );
              if (!removalComparisonResult) logComparisonPassed = false;
            } else {
              this.logToPanel(
                `Warning: Log entry for "Exec_func: After removing '${itemToRemove}' (simulated)" not found for test case index ${testCaseIndex}.`,
                'warn'
              );
              const skippedDiv = document.createElement('div');
              skippedDiv.className = 'log-comparison-skipped';
              skippedDiv.textContent = `Log Comparison (CICO - Removed '${itemToRemove}'): SKIPPED (Log entry not found)`;
              statusElement.appendChild(skippedDiv);
            }
          }
          // --- END ADDED ---

          if (validationResultFromWorker) {
            const validationFailedMessage = `FAIL: Worker reported still accessible without required item '${itemToRemove}'. State updated.`;
            statusElement.innerHTML += `<div class="test-failure">${validationFailedMessage}</div>`;
            this.logToPanel(validationFailedMessage, 'error');
            validationPassed = false;
            break;
          } else {
            this.logToPanel(
              `Validation (Worker): Confirmed '${itemToRemove}' is required. State updated.`
            );
          }

          // --- ADDED: Log Comparison for CICO "After re-collecting" ---
          if (this.currentTestCaseLogData && relevantLogEntries.length > 0) {
            const recollectionLogEntry = relevantLogEntries.find(
              (entry) =>
                entry.phase_description ===
                `Exec_func: After collecting '${itemToRemove}' (simulated, back to full list)`
            );
            if (recollectionLogEntry) {
              await stateManager.applyTestInventoryAndEvaluate(
                locationName,
                requiredItems,
                excludedItems
              );
              await stateManager.pingWorker(
                `testCaseUI_cico_recollect_${testCaseIndex}_${itemToRemove}`
              );
              const jsSnapshotAfterReCollection =
                await stateManager.getLatestStateSnapshot();

              const recollectionComparisonResult =
                await this.compareStateWithLogEntry(
                  jsSnapshotAfterReCollection,
                  recollectionLogEntry,
                  statusElement,
                  `CICO - Re-collected '${itemToRemove}' (Full List)`
                );
              if (!recollectionComparisonResult) logComparisonPassed = false;
            } else {
              this.logToPanel(
                `Warning: Log entry for "Exec_func: After collecting '${itemToRemove}' (simulated, back to full list)" not found for test case index ${testCaseIndex}.`,
                'warn'
              );
              const skippedDiv = document.createElement('div');
              skippedDiv.className = 'log-comparison-skipped';
              skippedDiv.textContent = `Log Comparison (CICO - Re-collected '${itemToRemove}'): SKIPPED (Log entry not found)`;
              statusElement.appendChild(skippedDiv);
            }
          }
          // --- END ADDED ---
        } // End CICO for loop
        if (validationPassed) {
          statusElement.innerHTML +=
            '<div class="test-success">All required items validated by worker. State reflects last validation.</div>';
          this.logToPanel(
            `Required items validation passed (Worker) for ${locationName}. State reflects last validation step.`
          );
        }
      } // End CICO if block
      passed = passed && validationPassed && logComparisonPassed; // Correctly combine all pass conditions
    } catch (error) {
      log(
        'error',
        `Error running test case for "${locationName}" (worker evaluation):`,
        error
      );
      const errorMessage = `Error during worker evaluation: ${error.message}`;
      statusElement.innerHTML = `<div class="test-error">${this.escapeHtml(
        errorMessage
      )}</div>`;
      this.logToPanel(
        `Error for ${locationName} (worker): ${errorMessage}`,
        'error'
      );
      passed = false;
    }
    return passed; // 'passed' now reflects primary test, CICO validation, and all log comparisons.
  }

  updateDataSourceIndicator() {
    const dataSourceElement = this.rootElement.querySelector('#data-source');
    if (!dataSourceElement) return;

    if (this.currentTestSet && this.rulesLoadedForSet && this.currentFolder) {
      const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';
      dataSourceElement.textContent = `Active Rules: tests/${folderPath}${this.currentFolder}_rules.json (for Test Set: ${this.currentTestSet})`;
      dataSourceElement.className = 'data-source-correct'; // Green
    } else if (this.currentTestSet && !this.rulesLoadedForSet) {
      dataSourceElement.textContent = `Rules for "${this.currentTestSet}" are NOT YET ACTIVE. Click "Load Test Set" again or re-select.`;
      dataSourceElement.className = 'data-source-wrong'; // Red
    } else {
      dataSourceElement.textContent =
        'Active Rules: ./presets/a_link_to_the_past/AP_14089154938208861744/AP_14089154938208861744_rules.json (or as per current mode)';
      dataSourceElement.className = 'data-source-wrong'; // Red
    }
  }

  async runAllTests() {
    const logId = `runAll-${Date.now()}`;
    log('info', `[TestCaseUI - ${logId}] Initiated for ${this.currentTestSet}`);

    // Key check:
    if (!this.rulesLoadedForSet) {
      this.logToPanel(
        `[${logId}] Cannot run all tests: Rules for the current test set are not loaded. Please select a test set.`,
        'error'
      );
      const runAllButton =
        this.testCasesListContainer.querySelector('#run-all-tests');
      if (runAllButton) runAllButton.disabled = false; // Re-enable button
      return;
    }

    if (
      !this.testCases ||
      !this.testCasesListContainer ||
      !this.testCases.location_tests
    ) {
      this.logToPanel('No test cases loaded to run.', 'warn');
      return;
    }

    this.isRunningAllTests = true;
    this.shouldCancelTests = false;

    this.logToPanel(
      `[${logId}] Running all ${this.testCases.location_tests.length} tests for "${this.currentTestSet}"...`,
      'system'
    );

    const runAllButton =
      this.testCasesListContainer.querySelector('#run-all-tests');
    const cancelButton =
      this.testCasesListContainer.querySelector('#cancel-all-tests');

    if (runAllButton) {
      runAllButton.disabled = true;
      runAllButton.textContent = 'Running...';
    }
    if (cancelButton) {
      cancelButton.style.display = 'inline-block';
    }

    let passedCount = 0;
    let failedCount = 0;
    let cancelledCount = 0;
    const totalTests = this.testCases.location_tests.length;

    // Helper function to update the results summary
    const updateResultsSummary = () => {
      const resultsElement = this.testCasesListContainer.querySelector(
        '#test-results-summary'
      );
      if (resultsElement) {
        const completedCount = passedCount + failedCount + cancelledCount;
        let summaryText = `Tests completed: ${completedCount}/${totalTests}, <span class="passed">${passedCount} passed</span>, <span class="failed">${failedCount} failed</span>`;
        if (cancelledCount > 0) {
          summaryText += `, <span class="cancelled">${cancelledCount} cancelled</span>`;
        }
        resultsElement.innerHTML = `<div class="test-summary ${
          failedCount === 0 &&
          cancelledCount === 0 &&
          completedCount === totalTests
            ? 'all-passed'
            : 'has-failures'
        }">${summaryText}</div>`;
      }
    };

    try {
      for (const [
        index,
        testCaseData,
      ] of this.testCases.location_tests.entries()) {
        if (this.shouldCancelTests) {
          // Mark remaining tests as cancelled
          const remainingTests = this.testCases.location_tests.slice(index);
          for (const [remainingIndex, _] of remainingTests.entries()) {
            const statusElement = this.testCasesListContainer.querySelector(
              `#test-status-${index + remainingIndex}`
            );
            if (statusElement) {
              statusElement.innerHTML =
                '<div class="test-cancelled">Cancelled</div>';
              cancelledCount++;
            }
          }
          updateResultsSummary(); // Update after cancelling remaining tests
          break;
        }

        const statusElement = this.testCasesListContainer.querySelector(
          `#test-status-${index}`
        );
        if (statusElement) {
          const result = await this.loadTestCase(
            testCaseData,
            statusElement,
            index
          );
          result ? passedCount++ : failedCount++;
          updateResultsSummary(); // Update after each test completes
          await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for UI updates
        }
      }
    } finally {
      this.isRunningAllTests = false;
      this.shouldCancelTests = false;

      // Final update to ensure summary is complete
      updateResultsSummary();

      if (runAllButton) {
        runAllButton.disabled = false;
        runAllButton.textContent = `Run All Tests for "${
          this.currentTestSet
            ? this.escapeHtml(
                this.currentTestSet
                  .replace(/^test/, '')
                  .replace(/([A-Z])/g, ' $1')
                  .trim()
              )
            : ''
        }"`;
      }
      if (cancelButton) {
        cancelButton.style.display = 'none';
      }

      const statusText =
        cancelledCount > 0
          ? 'cancelled'
          : failedCount === 0
          ? 'success'
          : 'error';
      this.logToPanel(
        `[${logId}] Tests for "${this.currentTestSet}" ${
          cancelledCount > 0 ? 'cancelled' : 'finished'
        }. Passed: ${passedCount}, Failed: ${failedCount}${
          cancelledCount > 0 ? `, Cancelled: ${cancelledCount}` : ''
        }`,
        statusText
      );
    }
  }

  cancelAllTests() {
    if (this.isRunningAllTests) {
      this.shouldCancelTests = true;
      this.logToPanel('Cancelling remaining tests...', 'warn');
    }
  }

  formatItemsList(items, testCaseData = null, statusElement = null) {
    if (!items || items.length === 0) {
      return 'None'; // Return string for 'None'
    }

    // If NOT creating clickable links (e.g., for excludedItems or if testCaseData/statusElement are missing)
    if (!(testCaseData && statusElement)) {
      return items.map((item) => this.escapeHtml(item)).join(', '); // Return joined string
    }

    // If creating clickable links (for requiredItems)
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const itemLink = document.createElement('a');
      itemLink.href = '#';
      itemLink.textContent = this.escapeHtml(item);
      itemLink.className = 'test-item-link'; // Add a class for styling
      itemLink.dataset.itemToRemove = item;
      itemLink.dataset.locationName = testCaseData[0];
      // Store arrays as JSON strings
      itemLink.dataset.requiredItems = JSON.stringify(testCaseData[2] || []);
      itemLink.dataset.excludedItems = JSON.stringify(testCaseData[3] || []);

      itemLink.addEventListener('click', (event) => {
        event.preventDefault();
        this.handleItemSubTestClick(
          event,
          statusElement /*, testCaseData is implicitly available via event.target.dataset */
        );
      });
      fragment.appendChild(itemLink);

      if (index < items.length - 1) {
        fragment.appendChild(document.createTextNode(', '));
      }
    });
    return fragment; // Return fragment for clickable links
  }

  async handleItemSubTestClick(event, statusElement) {
    const link = event.target;
    const itemToRemove = link.dataset.itemToRemove;
    const locationName = link.dataset.locationName;
    // Retrieve original test case data from the link's dataset
    const originalRequiredItems = JSON.parse(link.dataset.requiredItems);
    const originalExcludedItems = JSON.parse(link.dataset.excludedItems);

    log(
      'info',
      `[TestCaseUI] Sub-test click for item: "${itemToRemove}" on location: "${locationName}"`
    );

    let mainTestResultHTML = '';
    const firstChild = statusElement.firstChild;
    if (
      firstChild &&
      firstChild.nodeType === Node.ELEMENT_NODE &&
      (firstChild.classList.contains('test-success') ||
        firstChild.classList.contains('test-failure') ||
        firstChild.classList.contains('test-error'))
    ) {
      if (!firstChild.innerHTML.toLowerCase().includes('sub-test for')) {
        mainTestResultHTML = firstChild.outerHTML;
      }
    }
    statusElement.innerHTML =
      mainTestResultHTML +
      `<div>Running sub-test for item: ${this.escapeHtml(
        itemToRemove
      )}... (Inventory will update)</div>`;

    const itemsForSubTest = originalRequiredItems.filter(
      (i) => i !== itemToRemove
    );
    const excludedForSubTest = [...originalExcludedItems, itemToRemove]; // For clarity, though applyTestInventoryAndEvaluate mainly uses the first list

    try {
      // Use applyTestInventoryAndEvaluate to change the main state and trigger UI updates
      const isAccessible = await stateManager.applyTestInventoryAndEvaluate(
        locationName,
        itemsForSubTest, // This will become the new inventory
        excludedForSubTest // This is used by the command for its internal logic if needed
      );

      // For this sub-test, we expect isAccessible to be false (item was required).
      const subPassed = isAccessible === false;
      const resultMessage = `Sub-test for ${this.escapeHtml(itemToRemove)}: ${
        subPassed ? '✓ PASS' : '❌ FAIL'
      } (Expected inaccessible, Got: ${
        isAccessible ? 'Accessible' : 'Inaccessible'
      }). Inventory updated.`;

      const subResultDiv = document.createElement('div');
      subResultDiv.className = subPassed ? 'test-success' : 'test-failure';
      subResultDiv.innerHTML = resultMessage;

      const runningMessageDiv = Array.from(statusElement.childNodes).find(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.textContent.startsWith('Running sub-test for item:')
      );
      if (runningMessageDiv) {
        statusElement.removeChild(runningMessageDiv);
      }
      statusElement.appendChild(subResultDiv);
      log('info', `[TestCaseUI] ${resultMessage}`);
    } catch (error) {
      log(
        'error',
        `[TestCaseUI] Error during item sub-test for "${itemToRemove}":`,
        error
      );
      const errorDiv = document.createElement('div');
      errorDiv.className = 'test-error';
      errorDiv.textContent = `Error sub-test for ${this.escapeHtml(
        itemToRemove
      )}: ${error.message}. Inventory may be in an intermediate state.`;

      const runningMessageDiv = Array.from(statusElement.childNodes).find(
        (node) =>
          node.nodeType === Node.ELEMENT_NODE &&
          node.textContent.startsWith('Running sub-test for item:')
      );
      if (runningMessageDiv) {
        statusElement.removeChild(runningMessageDiv);
      }
      statusElement.appendChild(errorDiv);
    }
  }

  escapeHtml(unsafe) {
    if (unsafe === null || unsafe === undefined) return '';
    return unsafe
      .toString()
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"')
      .replace(/'/g, "'");
  }

  logToPanel(message, type = 'info') {
    // This is a simplified logger. A more robust implementation might append to a specific log area.
    log('info', `[TestCaseUI Panel Log - ${type}]: ${message}`);
    // Optionally publish to a more general notification system if desired for certain types
    if (type === 'error' || type === 'success') {
      this.eventBus.publish('ui:notification', { type, message }, 'testCases');
    }
  }

  clearDisplayAndState() {
    this.currentTestSet = null;
    this.currentFolder = null;
    this.testCases = null;
    this.currentTestRules = null;
    this.currentTestCaseLogData = null; // ADDED: Clear log data
    this.rulesLoadedForSet = false;
    if (this.testCasesListContainer) {
      this.testCasesListContainer.innerHTML =
        '<p>Select a test set to begin.</p>';
    }
    this.updateDataSourceIndicator(); // Clear indicator
  }

  dispose() {
    if (this.viewChangeSubscription) {
      this.viewChangeSubscription();
      this.viewChangeSubscription = null;
    }
    // Remove the delegated event listener
    if (this.testCasesListContainer && this.boundHandleMainControlsClick) {
      this.testCasesListContainer.removeEventListener(
        'click',
        this.boundHandleMainControlsClick
      );
      log('info', '[TestCaseUI] Removed delegated click listener.');
    }
    log('info', '[TestCaseUI] Disposed and unsubscribed from events.');
  }

  async showLocationDetails(locationStaticData) {
    // Placeholder for location detail functionality
    log('info', '[TestCaseUI] Location details requested:', locationStaticData);
  }

  // Helper methods for easier test targeting
  getIndividualTestButton(locationName) {
    const button = this.rootElement.querySelector(
      `button[data-test-type="individual"][data-location-name="${locationName}"]`
    );
    return button;
  }

  getIndividualTestButtonByIndex(index) {
    const button = this.rootElement.querySelector(
      `button[data-test-type="individual"][data-test-index="${index}"]`
    );
    return button;
  }

  getRunAllTestsButton() {
    const button = this.rootElement.querySelector(
      'button[data-test-type="run-all"]'
    );
    return button;
  }

  getCancelAllTestsButton() {
    const button = this.rootElement.querySelector(
      'button[data-test-type="cancel-all"]'
    );
    return button;
  }

  getAllIndividualTestButtons() {
    const buttons = this.rootElement.querySelectorAll(
      'button[data-test-type="individual"]'
    );
    return Array.from(buttons);
  }

  // Get test button targeting summary for debugging
  getTestButtonSummary() {
    const summary = {
      runAllButton: !!this.getRunAllTestsButton(),
      cancelButton: !!this.getCancelAllTestsButton(),
      individualButtons: this.getAllIndividualTestButtons().length,
      buttonDetails: this.getAllIndividualTestButtons().map((btn) => ({
        id: btn.id,
        index: btn.dataset.testIndex,
        locationName: btn.dataset.locationName,
        type: btn.dataset.testType,
      })),
    };
    return summary;
  }

  // Delegated event handler for main control buttons
  handleMainControlsClick(event) {
    const clickedElement = event.target.closest('button'); // Get the button element, even if an inner element was clicked
    if (!clickedElement) return;

    const action = clickedElement.dataset.action;
    const testType = clickedElement.dataset.testType;
    const buttonId = clickedElement.id;

    const logId = `event-${Date.now()}`;
    log('info', `[TestCaseUI - ${logId}] Delegated click:`, {
      id: buttonId,
      action,
      testType,
    });

    if (buttonId === 'back-to-test-sets') {
      log('info', `[TestCaseUI - ${logId}] Back to Test Sets button clicked.`);
      this.clearDisplayAndState();
      this.renderTestSetSelector();
      return;
    }

    if (action === 'run-all-tests' && testType === 'run-all') {
      log('info', `[TestCaseUI - ${logId}] Run All Tests action triggered.`);
      this.runAllTests();
      return;
    }

    if (action === 'cancel-tests' && testType === 'cancel-all') {
      log('info', `[TestCaseUI - ${logId}] Cancel All Tests action triggered.`);
      this.cancelAllTests();
      return;
    }
  }

  async compareStateWithLogEntry(
    jsSnapshot,
    logEntry,
    statusElement,
    comparisonPhaseDescription
  ) {
    if (!jsSnapshot || !logEntry) {
      const message = `[Log Comparison - ${comparisonPhaseDescription}] Skipped: Missing JS snapshot or Log entry.`;
      log('warn', message);
      const errorDiv = document.createElement('div');
      errorDiv.className = 'log-comparison-skipped';
      errorDiv.textContent = message;
      statusElement.appendChild(errorDiv);
      return false;
    }

    log(
      'info',
      `[Log Comparison - ${comparisonPhaseDescription}] Starting comparison.`
    );
    let overallMatch = true;
    const comparisonResults = []; // To store individual comparison messages

    // 1. Compare Progression Items
    const logProgItems = logEntry.inventory_details?.prog_items_player || {};
    const jsProgItems = jsSnapshot.prog_items?.['1'] || {}; // Assuming player '1'

    const inventoryComparison = document.createElement('div');
    inventoryComparison.className = 'log-comparison-details';
    let itemsMatch = true;

    // Check for items in log but not in JS, or different counts
    for (const itemName in logProgItems) {
      if (
        !jsProgItems.hasOwnProperty(itemName) ||
        jsProgItems[itemName] !== logProgItems[itemName]
      ) {
        itemsMatch = false;
        comparisonResults.push(
          `  Inventory Mismatch (Item: ${this.escapeHtml(itemName)}): Log has ${
            logProgItems[itemName]
          }, JS has ${jsProgItems[itemName] || 0}`
        );
      }
    }
    // Check for items in JS but not in log (implies JS has extra)
    for (const itemName in jsProgItems) {
      if (!logProgItems.hasOwnProperty(itemName)) {
        itemsMatch = false;
        comparisonResults.push(
          `  Inventory Mismatch (Item: ${this.escapeHtml(itemName)}): JS has ${
            jsProgItems[itemName]
          }, Log has 0 (not present)`
        );
      }
    }

    if (itemsMatch) {
      comparisonResults.push('  Inventory: MATCH');
    } else {
      overallMatch = false;
    }

    // 2. Compare Accessible Locations
    const logAccessible = new Set(logEntry.accessible_locations || []);

    // Derive JS accessible locations
    const staticData = stateManager.getStaticData();
    const jsAccessibleLocations = new Set();
    if (staticData && staticData.locations && jsSnapshot) {
      const snapshotInterface = createStateSnapshotInterface(
        jsSnapshot,
        staticData
      );
      if (snapshotInterface) {
        for (const locName in staticData.locations) {
          const locDef = staticData.locations[locName];

          const parentRegionName = locDef.parent_region || locDef.region;
          const parentRegionReachabilityStatus =
            jsSnapshot.regionReachability?.[parentRegionName];
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
          const doesLocationRuleEffectivelyPass =
            locationRuleEvalResult === true;

          if (
            isParentRegionEffectivelyReachable &&
            doesLocationRuleEffectivelyPass
          ) {
            jsAccessibleLocations.add(locName);
          }
        }
      } else {
        comparisonResults.push(
          '  Accessibility Warning: Could not create JS snapshotInterface for evaluation.'
        );
      }
    } else {
      comparisonResults.push(
        '  Accessibility Warning: Missing staticData or jsSnapshot for JS evaluation.'
      );
    }

    let accessibilityMatch = true;
    const missingInJs = [...logAccessible].filter(
      (loc) => !jsAccessibleLocations.has(loc)
    );
    const extraInJs = [...jsAccessibleLocations].filter(
      (loc) => !logAccessible.has(loc)
    );

    if (missingInJs.length > 0) {
      accessibilityMatch = false;
      comparisonResults.push(
        `  Accessibility Mismatch (Missing in JS): ${missingInJs
          .map(this.escapeHtml)
          .join(', ')}`
      );
    }
    if (extraInJs.length > 0) {
      accessibilityMatch = false;
      comparisonResults.push(
        `  Accessibility Mismatch (Extra in JS): ${extraInJs
          .map(this.escapeHtml)
          .join(', ')}`
      );
    }

    if (
      accessibilityMatch &&
      missingInJs.length === 0 &&
      extraInJs.length === 0
    ) {
      comparisonResults.push('  Accessibility: MATCH');
    } else {
      overallMatch = false;
    }

    // Render results to statusElement
    const resultContainer = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = `Log Comparison (${comparisonPhaseDescription}): ${
      overallMatch ? '✓ MATCH' : '❌ MISMATCH'
    }`;
    resultContainer.appendChild(title);
    resultContainer.className = overallMatch
      ? 'log-comparison-success'
      : 'log-comparison-failure';

    comparisonResults.forEach((msg) => {
      const detailP = document.createElement('p');
      detailP.style.margin = '2px 0 2px 10px'; // Indent details
      detailP.textContent = msg;
      resultContainer.appendChild(detailP);
    });
    statusElement.appendChild(resultContainer);

    log(
      'info',
      `[Log Comparison - ${comparisonPhaseDescription}] Result: ${
        overallMatch ? 'MATCH' : 'MISMATCH'
      }`
    );
    if (!overallMatch) {
      log(
        'warn',
        `[Log Comparison - ${comparisonPhaseDescription}] Mismatch Details:`,
        {
          logProgItems,
          jsProgItems,
          logAccessible: Array.from(logAccessible),
          jsAccessibleUnchecked: Array.from(jsAccessibleLocations),
        }
      );
    }
    return overallMatch;
  }
}

export default TestCaseUI;

// frontend/modules/testCases/testCaseUI.js
import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../stateManager/ruleEngine.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';
import eventBus from '../../app/core/eventBus.js';
import * as commonUI from '../commonUI/index.js'; // Changed path for renderLogicTree

export class TestCaseUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;

    this.availableTestSets = null; // Loaded from test_files.json
    this.currentTestSet = null; // Name of the currently selected test set file (e.g., "TestLightWorld")
    this.currentFolder = null; // Name of the folder for the current test set (e.g., "vanilla")
    this.testCases = null; // Loaded from _tests.json for the currentTestSet
    this.currentTestRules = null; // Loaded from _rules.json for the currentFolder

    this.initialized = false;
    this.testCasesListContainer = null; // Will hold the list of test cases
    this.viewChangeSubscription = null; // For ui:fileViewChanged
    this.eventBus = eventBus; // Using the imported singleton
    this.rootElement = null; // Root DOM element for this panel
    this.rulesLoadedForSet = false; // Flag: true if currentTestRules are loaded in StateManager

    // Create root element and initial structure
    this.getRootElement(); // This also sets this.testCasesListContainer
    if (this.rootElement) {
      this.container.element.appendChild(this.rootElement);
    } else {
      console.error('[TestCaseUI] Root element not created in constructor!');
    }

    // Defer full data loading and event subscriptions
    const readyHandler = (eventPayload) => {
      console.log(
        '[TestCaseUI] Received app:readyForUiDataLoad. Initializing test cases UI.'
      );
      this.initialize(); // This will fetch test_files.json and subscribe to events
      eventBus.unsubscribe('app:readyForUiDataLoad', readyHandler);
    };
    eventBus.subscribe('app:readyForUiDataLoad', readyHandler);

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
      console.log('[TestCaseUI] Already initialized.');
      return true;
    }
    console.log('[TestCaseUI] Initializing...');

    // Subscribe to view changes
    if (this.eventBus && !this.viewChangeSubscription) {
      this.viewChangeSubscription = this.eventBus.subscribe(
        'ui:fileViewChanged',
        (data) => {
          if (data.newView !== 'test-cases') {
            // Ensure this matches the ID used in FilesUI
            console.log('[TestCaseUI] View changed away, clearing test data.');
            this.clearDisplayAndState();
          }
        }
      );
    }

    try {
      const response = await fetch('./tests/test_files.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.availableTestSets = await response.json();
      this.renderTestSetSelector(); // Display the list of available test sets
      this.initialized = true;
      console.log(
        '[TestCaseUI] Initialization complete. Test set selector rendered.'
      );
      return true;
    } catch (error) {
      console.error('Error loading test_files.json:', error);
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
    this.currentFolder = folderName;
    this.currentTestSet = testSetName;
    this.rulesLoadedForSet = false; // Mark as not loaded until confirmed by worker
    this.logToPanel(
      `Selecting test set: "${testSetName}" from folder "${folderName}". Loading associated rules...`
    );

    if (this.testCasesListContainer)
      this.testCasesListContainer.innerHTML = '<p>Loading test set data...</p>';

    try {
      const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';
      const rulesResponse = await fetch(
        `./tests/${folderPath}${this.currentFolder}_rules.json`
      );
      if (!rulesResponse.ok)
        throw new Error(`Failed to load rules for ${this.currentFolder}`);
      this.currentTestRules = await rulesResponse.json(); // Store raw rules for modal display

      const testsResponse = await fetch(
        `./tests/${folderPath}${testSetName}_tests.json`
      );
      if (!testsResponse.ok)
        throw new Error(`Failed to load tests for ${testSetName}`);
      this.testCases = await testsResponse.json();

      this.logToPanel(
        `Rules and test cases for "${testSetName}" fetched. Applying rules to StateManager worker...`
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
              `StateManager worker confirmed rules loaded for test set "${testSetName}". Static data in worker updated.`
            );
            this.rulesLoadedForSet = true; // Crucial flag
            unsub();
            resolve();
          }
        );
      });

      this.renderTestCasesList();
      this.updateDataSourceIndicator(); // Update to show test-specific rules are active

      this.eventBus.publish('ui:notification', {
        type: 'info',
        message: `Test set "${testSetName}" loaded. Rules are now active for testing.`,
      });
    } catch (error) {
      this.logToPanel(
        `Error loading test set "${testSetName}": ${error.message}`,
        'error'
      );
      console.error(`Failed to load test set "${testSetName}":`, error);
      this.renderTestSetSelector();
    }
  }

  renderTestCasesList() {
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
          <button id="run-all-tests" class="button">Run All Tests for "${testSetDisplay}"</button>
        </div>
        <div id="data-source-info" class="data-source-info">Current data source: <span id="data-source"></span></div>
        <div id="test-results-summary"></div>
      </div>
    `;
    this.testCasesListContainer.insertAdjacentHTML('beforeend', headerHtml);

    const table = document.createElement('table');
    table.className = 'results-table'; // From existing styles
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
      // Create a simple span for location, linking can be complex without region context here
      locationCell.textContent = this.escapeHtml(locationName);

      row.insertCell().textContent = expectedResult ? 'Yes' : 'No';
      row.insertCell().innerHTML = requiredItems.length
        ? this.formatItemsList(requiredItems)
        : 'None';
      row.insertCell().innerHTML = excludedItems.length
        ? this.formatItemsList(excludedItems)
        : 'None';

      const actionCell = row.insertCell();
      const runButton = document.createElement('button');
      runButton.className = 'button run-test';
      runButton.textContent = 'Run';
      runButton.addEventListener('click', async () => {
        const statusDiv = row.querySelector(`#test-status-${index}`);
        if (statusDiv) await this.loadTestCase(testCaseData, statusDiv);
      });
      actionCell.appendChild(runButton);

      const resultCell = row.insertCell();
      const statusDiv = document.createElement('div');
      statusDiv.className = 'test-status';
      statusDiv.id = `test-status-${index}`;
      statusDiv.textContent = 'Pending'; // Initial status
      resultCell.appendChild(statusDiv);
    });
    table.appendChild(tbody);
    this.testCasesListContainer.appendChild(table);

    // Add Download Links
    const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';
    const linksHtml = `
      <div class="test-links" style="margin-top: 1rem;">
        <a href="./tests/${folderPath}${this.currentFolder}_rules.json" download target="_blank" class="download-link button">Download Rules Used</a>
        <a href="./tests/${folderPath}${this.currentTestSet}_tests.json" download target="_blank" class="download-link button">Download This Test Case File</a>
      </div>`;
    this.testCasesListContainer.insertAdjacentHTML('beforeend', linksHtml);

    // Attach event listeners for new buttons
    this.testCasesListContainer
      .querySelector('#back-to-test-sets')
      .addEventListener('click', () => {
        this.clearDisplayAndState(); // Clear current test set specific data
        this.renderTestSetSelector(); // Go back to selection screen
      });
    this.testCasesListContainer
      .querySelector('#run-all-tests')
      .addEventListener('click', () => this.runAllTests());

    this.updateDataSourceIndicator(); // Update based on currently loaded rules
  }

  async loadTestCase(testData, statusElement) {
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
    this.logToPanel(`Starting test: ${JSON.stringify(testData)}`);
    const [
      locationName,
      expectedResult,
      requiredItems = [],
      excludedItems = [],
    ] = testData;

    let passed = false;
    let actualResultFromWorker;

    try {
      // COMMAND 2: Ask the worker to evaluate accessibility with the test-specific inventory
      actualResultFromWorker =
        await stateManager.evaluateLocationAccessibilityForTest(
          locationName,
          requiredItems,
          excludedItems
        );

      if (typeof actualResultFromWorker !== 'boolean') {
        throw new Error(
          `Worker returned non-boolean result for accessibility: ${actualResultFromWorker}`
        );
      }

      this.logToPanel(
        `Worker evaluation for "${locationName}": ${actualResultFromWorker}. Expected: ${expectedResult}`
      );
      passed = actualResultFromWorker === expectedResult;

      let finalMessage = `${
        passed ? '✓ PASS' : '❌ FAIL'
      } (Expected: ${expectedResult}, Actual from Worker: ${actualResultFromWorker})`;
      statusElement.innerHTML = `<div class="${
        passed ? 'test-success' : 'test-failure'
      }">${finalMessage}</div>`;
      this.logToPanel(`Test for ${locationName}: ${finalMessage}`);

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
        statusElement.innerHTML += '<div>Validating required items...</div>';
        for (const itemToRemove of requiredItems) {
          const itemsForValidation = requiredItems.filter(
            (item) => item !== itemToRemove
          );
          const validationResultFromWorker =
            await stateManager.evaluateLocationAccessibilityForTest(
              locationName,
              itemsForValidation, // Exclude one required item
              excludedItems
            );
          if (validationResultFromWorker) {
            // Should be false if item is truly required
            const validationFailedMessage = `FAIL: Worker reported still accessible without required item '${itemToRemove}'.`;
            statusElement.innerHTML += `<div class="test-failure">${validationFailedMessage}</div>`;
            this.logToPanel(validationFailedMessage, 'error');
            validationPassed = false;
            break;
          } else {
            this.logToPanel(
              `Validation (Worker): Confirmed '${itemToRemove}' is required.`
            );
          }
        }
        if (validationPassed) {
          statusElement.innerHTML += `<div class="test-success">All required items validated by worker.</div>`;
          this.logToPanel(
            `Required items validation passed (Worker) for ${locationName}.`
          );
        }
      }
      passed = passed && validationPassed; // Update overall pass status
    } catch (error) {
      console.error(
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
    return passed;
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
        'Active Rules: default_rules.json (or as per current mode)';
      dataSourceElement.className = 'data-source-wrong'; // Red
    }
  }

  async runAllTests() {
    // ... (same as your existing runAllTests, ensuring it uses the refactored loadTestCase) ...
    // Key check:
    if (!this.rulesLoadedForSet) {
      this.logToPanel(
        'Cannot run all tests: Rules for the current test set are not loaded. Please select a test set.',
        'error'
      );
      const runAllButton =
        this.testCasesListContainer.querySelector('#run-all-tests');
      if (runAllButton) runAllButton.disabled = false; // Re-enable button
      return;
    }
    // ... rest of the logic
    if (
      !this.testCases ||
      !this.testCasesListContainer ||
      !this.testCases.location_tests
    ) {
      this.logToPanel('No test cases loaded to run.', 'warn');
      return;
    }

    this.logToPanel(
      `Running all ${this.testCases.location_tests.length} tests for "${this.currentTestSet}"...`,
      'system'
    );
    const runAllButton =
      this.testCasesListContainer.querySelector('#run-all-tests');
    if (runAllButton) {
      runAllButton.disabled = true;
      runAllButton.textContent = 'Running...';
    }

    let passedCount = 0;
    let failedCount = 0;

    try {
      for (const [
        index,
        testCaseData,
      ] of this.testCases.location_tests.entries()) {
        const statusElement = this.testCasesListContainer.querySelector(
          `#test-status-${index}`
        );
        if (statusElement) {
          const result = await this.loadTestCase(testCaseData, statusElement);
          result ? passedCount++ : failedCount++;
          await new Promise((resolve) => setTimeout(resolve, 10)); // Small delay for UI updates
        }
      }
    } finally {
      const total = passedCount + failedCount;
      const resultsElement = this.testCasesListContainer.querySelector(
        '#test-results-summary'
      );
      if (resultsElement) {
        resultsElement.innerHTML = `<div class="test-summary ${
          failedCount === 0 ? 'all-passed' : 'has-failures'
        }">
            Tests completed: ${total} total,
            <span class="passed">${passedCount} passed</span>,
            <span class="failed">${failedCount} failed</span>
        </div>`;
      }
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
      this.logToPanel(
        `All tests for "${this.currentTestSet}" finished. Passed: ${passedCount}, Failed: ${failedCount}`,
        failedCount === 0 ? 'success' : 'error'
      );
    }
  }

  formatItemsList(items) {
    if (!items || items.length === 0) return 'None';
    return items.map((item) => this.escapeHtml(item)).join(', ');
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
    console.log(`[TestCaseUI Panel Log - ${type}]: ${message}`);
    // Optionally publish to a more general notification system if desired for certain types
    if (type === 'error' || type === 'success') {
      this.eventBus.publish('ui:notification', { type, message });
    }
  }

  clearDisplayAndState() {
    this.currentTestSet = null;
    this.currentFolder = null;
    this.testCases = null;
    this.currentTestRules = null;
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
    console.log('[TestCaseUI] Disposed and unsubscribed from events.');
  }

  async showLocationDetails(locationStaticData) {
    // Expects location object from this.currentTestRules
    console.log(
      '[TestCaseUI] showLocationDetails called for:',
      locationStaticData.name
    );
    if (!locationStaticData || !locationStaticData.name) {
      console.warn('[TestCaseUI] showLocationDetails: Invalid location data.');
      return;
    }
    // ... (rest of modal setup as before)
    const modalElement = this.rootElement.querySelector('#location-modal');
    const modalTitle = this.rootElement.querySelector('#modal-location-name');
    const modalDetails = this.rootElement.querySelector(
      '#modal-location-details'
    );
    const modalRuleTree = this.rootElement.querySelector('#modal-rule-tree');

    if (!modalElement || !modalTitle || !modalDetails || !modalRuleTree) {
      console.error('[TestCaseUI] Modal elements not found.');
      return;
    }

    // For displaying the rule, we need a snapshot. The most relevant snapshot
    // would be one set up for the *current test case shown in the UI*, if available.
    // This is tricky as `showLocationDetails` might be called independently.
    // As a fallback or for general display, we can use the *current global snapshot* from the proxy.
    // Or, if we want to show how a rule *would* evaluate given the *current test's inventory*:
    // For simplicity and since this is for *display*, let's use the current global snapshot from the proxy
    // This will show how the rule evaluates *right now* in the main application state,
    // NOT necessarily how it evaluated during the specific test run (which used a temporary test inventory).

    const currentGlobalSnapshot = await stateManager.getSnapshot(); // Get the main app's current snapshot (make sure it's async if proxy returns promise)

    if (!this.currentTestRules || !currentGlobalSnapshot) {
      modalTitle.textContent = 'Error';
      modalDetails.innerHTML =
        '<p>Test rules or current game snapshot not available for details display.</p>';
      modalRuleTree.innerHTML = '';
      if (modalElement) modalElement.classList.remove('hidden');
      return;
    }

    // The staticData for this interface is this.currentTestRules
    const displaySnapshotInterface = createStateSnapshotInterface(
      currentGlobalSnapshot,
      this.currentTestRules
    );

    if (!displaySnapshotInterface) {
      modalTitle.textContent = 'Error';
      modalDetails.innerHTML =
        '<p>Failed to create snapshot interface for rule display.</p>';
      modalRuleTree.innerHTML = '';
      if (modalElement) modalElement.classList.remove('hidden');
      return;
    }

    let accessResultText = 'Rule not defined or evaluation failed (display).';
    modalRuleTree.innerHTML = '';

    if (locationStaticData.access_rule) {
      try {
        // Evaluate for display using the displaySnapshotInterface
        const isAccessibleForDisplay = evaluateRule(
          locationStaticData.access_rule,
          displaySnapshotInterface
        );
        accessResultText = `Rule Display Evaluation (current app state): ${
          isAccessibleForDisplay === undefined
            ? 'UNKNOWN'
            : isAccessibleForDisplay
            ? 'TRUE'
            : 'FALSE'
        }`;

        const treeElement = commonUI.renderLogicTree(
          locationStaticData.access_rule,
          false,
          displaySnapshotInterface
        );
        modalRuleTree.appendChild(treeElement);
      } catch (error) {
        accessResultText = `Error evaluating rule for display: ${error.message}`;
        modalRuleTree.textContent = 'Error rendering rule tree for display.';
      }
    } else {
      accessResultText = 'No access rule defined.';
      modalRuleTree.textContent = 'No rule defined for this location.';
    }

    modalTitle.textContent = `Details for ${locationStaticData.name}`;
    modalDetails.innerHTML = `<p><strong>Region:</strong> ${
      locationStaticData.region || locationStaticData.parent_region || 'N/A'
    }</p>
                              <p><strong>Current Display Evaluation:</strong> ${accessResultText}</p>`;
    if (modalElement) modalElement.classList.remove('hidden');
  }
}

export default TestCaseUI;

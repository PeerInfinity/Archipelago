import stateManager from '../core/stateManagerSingleton.js';

export class TestCaseUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.testCases = null;
    this.testRules = null;
    this.currentTest = null;
    this.availableTestSets = null;
    this.currentTestSet = null;
    this.currentFolder = null;
  }

  initialize() {
    try {
      // Load the test_files.json which contains the list of available test sets
      const loadJSON = (url) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // false makes it synchronous
        xhr.send();
        if (xhr.status === 200) {
          return JSON.parse(xhr.responseText);
        } else {
          throw new Error(`Failed to load ${url}: ${xhr.status}`);
        }
      };

      // Load the list of available test sets
      this.availableTestSets = loadJSON('./tests/test_files.json');

      // Render the test set selector instead of loading test cases immediately
      this.renderTestSetSelector();
      return true;
    } catch (error) {
      console.error('Error loading test sets data:', error);
      return false;
    }
  }

  renderTestSetSelector() {
    const container = document.getElementById('test-cases-list');
    if (!container) {
      console.error('Test cases list container not found');
      return;
    }

    // Create a header
    let html = `
      <div class="test-header">
        <h3>Select a Test Set</h3>
      </div>
      <div class="test-sets-container">
    `;

    // Process each folder of test sets
    Object.entries(this.availableTestSets).forEach(([folderName, testSets]) => {
      // Create a section for each folder
      html += `
        <div class="test-folder">
          <h4 class="folder-name">${this.escapeHtml(
            folderName.replace(/([A-Z])/g, ' $1').trim()
          )}</h4>
          <div class="folder-test-sets">
      `;

      // Add all test sets in this folder
      Object.entries(testSets).forEach(([testSetName, isEnabled]) => {
        if (isEnabled) {
          const displayName = testSetName
            .replace(/^test/, '')
            .replace(/([A-Z])/g, ' $1')
            .trim();

          html += `
            <button class="test-set-button" 
                    data-folder="${this.escapeHtml(folderName)}" 
                    data-testset="${this.escapeHtml(testSetName)}">
              ${this.escapeHtml(displayName)}
            </button>
          `;
        }
      });

      // Close the folder section
      html += `
          </div>
        </div>
      `;
    });

    // Close the container
    html += '</div>';

    // Add styles for the test set selector
    html += `
      <style>
        .test-sets-container {
          display: flex;
          flex-direction: column;
          gap: 20px;
          margin-top: 16px;
        }
        .test-folder {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
          margin-bottom: 16px;
        }
        .folder-name {
          margin-top: 0;
          margin-bottom: 16px;
          color: #ddd;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 8px;
          text-transform: capitalize;
        }
        .folder-test-sets {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 12px;
        }
        .test-set-button {
          background-color: rgba(0, 0, 0, 0.3);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 6px;
          color: white;
          cursor: pointer;
          padding: 10px;
          text-align: left;
          transition: background-color 0.2s;
        }
        .test-set-button:hover {
          background-color: rgba(0, 0, 0, 0.5);
        }
      </style>
    `;

    // Set the HTML content
    container.innerHTML = html;

    // Add event listeners to the test set buttons
    const buttons = container.querySelectorAll('.test-set-button');
    buttons.forEach((button) => {
      button.addEventListener('click', () => {
        const folder = button.getAttribute('data-folder');
        const testSet = button.getAttribute('data-testset');
        console.log(`Loading test set ${testSet} from folder ${folder}`);
        this.currentFolder = folder;
        this.loadTestSet(testSet);
      });
    });
  }

  loadTestSet(testSetName) {
    try {
      const container = document.getElementById('test-cases-list');
      if (container) {
        container.innerHTML = '<p>Loading test set...</p>';
      }

      // Use synchronous XMLHttpRequest to load the test files
      const loadJSON = (url) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, false); // false makes it synchronous
        xhr.send();
        if (xhr.status === 200) {
          return JSON.parse(xhr.responseText);
        } else {
          throw new Error(`Failed to load ${url}: ${xhr.status}`);
        }
      };

      // Construct folder path if we have a current folder
      const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';

      // Load the test rules based on the folder name, not the test set name
      this.testRules = loadJSON(
        `./tests/${folderPath}${this.currentFolder}_rules.json`
      );

      // Load the test cases based on the test set name (unchanged)
      this.testCases = loadJSON(
        `./tests/${folderPath}${testSetName}_tests.json`
      );
      this.currentTestSet = testSetName;

      // Render the list of test cases
      this.renderTestCasesList();
      this.updateDataSourceIndicator();

      // Automatically trigger the "Reload Test Data" button after rendering
      setTimeout(() => {
        const loadDataButton = document.getElementById('load-test-data');
        if (loadDataButton) {
          loadDataButton.click();
        }
      }, 100);

      return true;
    } catch (error) {
      console.error('Failed to load test set:', error);
      const container = document.getElementById('test-cases-list');
      if (container) {
        container.innerHTML = `
          <div class="error">
            <h3>Error Loading Test Set</h3>
            <p>${error.message}</p>
            <button id="back-to-test-sets" class="button">Back to Test Sets</button>
          </div>
        `;

        // Add event listener for the back button
        const backButton = container.querySelector('#back-to-test-sets');
        if (backButton) {
          backButton.onclick = () => this.renderTestSetSelector();
        }
      }
      return false;
    }
  }

  clearTestData() {
    this.testCases = null;
    this.testRules = null;
    this.currentTestSet = null;
    this.currentFolder = null;

    // Return to the test set selector
    this.renderTestSetSelector();

    // If the test data was loaded in the game UI, clear it
    if (this.isUsingTestData()) {
      this.gameUI.clearExistingData();
      this.gameUI.initializeUI(this.gameUI.defaultRules, '1');
    }
  }

  loadTestCase(testData, statusElement) {
    try {
      statusElement.textContent = 'Loading test...';
      const [location, expectedResult, requiredItems = [], excludedItems = []] =
        testData;

      // Make sure we're using test data
      if (!this.testRules) {
        statusElement.innerHTML = `<div class="test-error">Error: No test rules loaded</div>`;
        return false;
      }

      // Debug log the test rules data
      console.log('Test rules data structure:', {
        hasItemPoolCounts: Boolean(this.testRules.itempool_counts),
        itemPoolCountsKeys: this.testRules.itempool_counts
          ? Object.keys(this.testRules.itempool_counts)
          : [],
      });

      // Ensure testRules has all required properties
      if (!this.testRules.regions || !this.testRules.regions['1']) {
        console.error('Invalid rules data - missing regions:', this.testRules);
        statusElement.innerHTML = `<div class="test-error">Error: Invalid rules data structure</div>`;
        return false;
      }

      // First initialize inventory with the test rules data
      console.log('Loading rules data into state manager');
      stateManager.loadFromJSON(this.testRules);

      // Verify state manager was properly initialized
      if (
        !stateManager.regions ||
        Object.keys(stateManager.regions).length === 0
      ) {
        console.error('State manager not properly initialized with regions');
        statusElement.innerHTML = `<div class="test-error">Error: State manager initialization failed</div>`;
        return false;
      }

      // Then set up the test case inventory state
      console.log('Setting up test inventory with:', {
        requiredItems,
        excludedItems,
      });
      try {
        stateManager.initializeInventoryForTest(requiredItems, excludedItems);
      } catch (inventoryError) {
        console.error('Error initializing inventory:', inventoryError);
        statusElement.innerHTML = `<div class="test-error">Error: ${inventoryError.message}</div>`;
        return false;
      }

      // Force UI sync and cache invalidation - with additional error handling
      try {
        console.log('Invalidating cache and computing reachable regions');
        stateManager.invalidateCache();
        stateManager.computeReachableRegions();
        this.gameUI.inventoryUI?.syncWithState();
      } catch (reachabilityError) {
        console.error('Error computing reachability:', reachabilityError);
        statusElement.innerHTML = `<div class="test-error">Error: ${reachabilityError.message}</div>`;
        return false;
      }

      // Find the location data in the rules and include its region
      let locationData = null;
      for (const [regionName, region] of Object.entries(
        this.testRules.regions['1']
      )) {
        const loc = region.locations.find((l) => l.name === location);
        if (loc) {
          locationData = {
            ...loc,
            region: regionName,
            player: region.player,
          };
          break;
        }
      }

      if (!locationData) {
        statusElement.innerHTML = `<div class="test-error">Error: Location "${location}" not found</div>`;
        return false;
      }

      // Check if location is accessible
      const locationAccessible =
        stateManager.isLocationAccessible(locationData);
      const passed = locationAccessible === expectedResult;

      // SAVE THE CURRENT INVENTORY STATE BEFORE PARTIAL TESTING
      const saveInventoryState = () => {
        // Create a deep copy of the current inventory state
        const savedItems = new Map();
        stateManager.inventory.items.forEach((count, item) => {
          savedItems.set(item, count);
        });
        return savedItems;
      };

      // Save the inventory state after initial test
      const savedInventory = saveInventoryState();

      // If accessible and required items specified, also validate that all items are truly required
      let validationFailed = null;
      if (
        passed &&
        expectedResult &&
        requiredItems.length > 0 &&
        !excludedItems.length
      ) {
        for (const missingItem of requiredItems) {
          // Create inventory without this item
          stateManager.initializeInventoryForTest(
            requiredItems.filter((item) => item !== missingItem),
            excludedItems
          );

          // Check if still accessible
          if (stateManager.isLocationAccessible(locationData)) {
            validationFailed = missingItem;
            break;
          }
        }
      }

      // RESTORE THE SAVED INVENTORY STATE
      const restoreInventoryState = (savedItems) => {
        // Clear the current inventory first
        stateManager.inventory.items.forEach((_, item) => {
          stateManager.inventory.items.set(item, 0);
        });

        // Restore the saved counts
        savedItems.forEach((count, item) => {
          stateManager.inventory.items.set(item, count);
        });

        // Force UI sync and cache invalidation
        stateManager.invalidateCache();
        stateManager.computeReachableRegions();

        // This will update the UI to match the restored inventory
        this.gameUI.inventoryUI?.syncWithState();
      };

      // Restore inventory state after all tests
      restoreInventoryState(savedInventory);

      // Show appropriate result
      if (validationFailed) {
        statusElement.innerHTML = `<div class="test-failure">❌ FAIL: Accessible without ${validationFailed}</div>`;
        return false;
      } else {
        statusElement.innerHTML = `<div class="${
          passed ? 'test-success' : 'test-failure'
        }">${passed ? '✓ PASS' : '❌ FAIL'}</div>`;
        return passed;
      }
    } catch (error) {
      console.error('Error loading test case:', error);
      statusElement.innerHTML = `<div class="test-error">Error: ${error.message}</div>`;
      return false;
    }
  }

  isUsingTestData() {
    return this.testRules && this.testRules === this.gameUI.currentRules;
  }

  updateDataSourceIndicator() {
    const dataSourceElement = document.getElementById('data-source');
    if (!dataSourceElement) return;

    const isUsingTestData = this.isUsingTestData();
    const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';

    // Update text and styling based on data source
    dataSourceElement.textContent = isUsingTestData
      ? `tests/${folderPath}${this.currentFolder}_rules.json`
      : 'default_rules.json';

    dataSourceElement.className = isUsingTestData
      ? 'data-source-correct'
      : 'data-source-wrong';
  }

  runAllTests() {
    if (!this.testCases?.location_tests) return;

    // Disable the Run All Tests button while tests are running
    const runAllButton = document.getElementById('run-all-tests');
    if (runAllButton) {
      runAllButton.disabled = true;
      runAllButton.textContent = 'Running Tests...';
    }

    let passed = 0;
    let failed = 0;

    try {
      // Run each test with minimal delay to allow UI updates
      for (const [index, testCase] of this.testCases.location_tests.entries()) {
        const statusElement = document.getElementById(`test-status-${index}`);
        if (statusElement) {
          const result = this.loadTestCase(testCase, statusElement);
          result ? passed++ : failed++;
          // Make sure UI is fully updated after each test
          this.gameUI.inventoryUI?.syncWithState();
        }
      }
    } finally {
      // Update results summary
      const total = passed + failed;
      const resultsElement = document.getElementById('test-results-summary');
      if (resultsElement) {
        resultsElement.innerHTML = `
          <div class="test-summary ${
            failed === 0 ? 'all-passed' : 'has-failures'
          }">
            Tests completed: ${total} total, 
            <span class="passed">${passed} passed</span>, 
            <span class="failed">${failed} failed</span>
          </div>
        `;
      }

      // Make sure UI is in sync after all tests complete
      this.gameUI.inventoryUI?.syncWithState();
      // Re-enable the button when done
      if (runAllButton) {
        runAllButton.disabled = false;
        runAllButton.textContent = 'Run All Tests';
      }
    }

    // Add debug button
    this.addDebugButton();
  }

  renderTestCasesList() {
    const container = document.getElementById('test-cases-list');

    // Format folder and test set names for display
    const folderDisplay = this.currentFolder
      ? this.escapeHtml(this.currentFolder.replace(/([A-Z])/g, ' $1').trim())
      : '';

    const testSetDisplay = this.escapeHtml(
      this.currentTestSet
        .replace(/^test/, '')
        .replace(/([A-Z])/g, ' $1')
        .trim()
    );

    let html = `
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
          <button id="load-test-data" class="button">Reload Test Data</button>
          <button id="run-all-tests" class="button">Run All Tests</button>
        </div>
        <div id="data-source-info" class="data-source-info">
          Current data source: <span id="data-source" class="data-source-wrong">default_rules.json</span>
        </div>
        <div id="test-results-summary"></div>
      </div>
      <table class="results-table">
        <tr>
          <th>Location</th>
          <th>Expected Access</th>
          <th>Required Items</th>
          <th>Excluded Items</th>
          <th>Actions</th>
          <th style="min-width: 100px;">Result</th>
        </tr>
    `;

    if (!this.testCases?.location_tests) {
      container.innerHTML = '<p>Error: Test cases not loaded</p>';
      return;
    }

    // Create table rows for each test case
    this.testCases.location_tests.forEach((testCase, index) => {
      const [location, expectedResult, requiredItems = [], excludedItems = []] =
        testCase;
      const statusId = `test-status-${index}`;

      // Find the region that contains this location (if available)
      let locationRegion = '';
      if (this.testRules) {
        for (const [regionName, region] of Object.entries(
          this.testRules.regions['1']
        )) {
          if (region.locations.some((loc) => loc.name === location)) {
            locationRegion = regionName;
            break;
          }
        }
      }

      html += `
        <tr class="test-case-row">
          <td>${
            locationRegion
              ? `<span class="location-link" data-location="${this.escapeHtml(
                  location
                )}" data-region="${this.escapeHtml(
                  locationRegion
                )}">${this.escapeHtml(location)}</span>`
              : this.escapeHtml(location)
          }</td>
          <td>${expectedResult ? 'Yes' : 'No'}</td>
          <td>${
            requiredItems.length ? this.formatItemsList(requiredItems) : 'None'
          }</td>
          <td>${
            excludedItems.length ? this.formatItemsList(excludedItems) : 'None'
          }</td>
          <td>
            <button class="button run-test" data-test-index="${index}">
              Run Test
            </button>
          </td>
          <td>
            <div class="test-status" id="${statusId}"></div>
          </td>
        </tr>
      `;
    });

    html += `</table>`;

    // Define folderPath variable before using it in download links
    const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';

    // Add download links
    html += `
      <div class="test-links">
        <a href="./tests/${folderPath}${this.currentFolder}_rules.json" 
           download 
           target="_blank" 
           class="download-link">
          Download Rules
        </a>
        <a href="./tests/${folderPath}${this.currentTestSet}_tests.json" 
           download 
           target="_blank" 
           class="download-link">
          Download Tests
        </a>
      </div>
    `;

    // Add styles
    html += `
      <style>
        .test-header {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        .test-header-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .test-header h3 {
          margin: 0;
        }
        .test-controls {
          display: flex;
          gap: 1rem;
        }
        .data-source-info {
          font-size: 0.9em;
          color: #666;
          margin-top: 0.5rem;
        }
        .results-table {
          width: 100%;
          border-collapse: collapse;
          margin-top: 20px;
        }
        .results-table th, .results-table td {
          border: 1px solid #444;
          padding: 8px;
          text-align: left;
        }
        .results-table th {
          background-color: #333;
          color: #cecece;
        }
        .test-case-row:nth-child(even) {
          background-color: rgba(0, 0, 0, 0.2);
        }
        .test-case-row:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }
        .test-status {
          white-space: nowrap;
          font-size: 0.9em;
        }
        .test-success, .test-failure, .test-error {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 4px 8px;
          border-radius: 4px;
        }
        .test-success {
          color: #4caf50;
        }
        .test-failure {
          color: #f44336;
        }
        .test-error {
          color: #ff9800;
        }
        .data-source-wrong {
          color: #f44336;
        }
        .data-source-correct {
          color: #4caf50;
        }
        .test-summary {
          margin-top: 0.5rem;
          padding: 8px;
          border-radius: 4px;
          background: rgba(0, 0, 0, 0.1);
        }
        .test-summary.all-passed {
          background: rgba(76, 175, 80, 0.1);
        }
        .test-summary.has-failures {
          background: rgba(244, 67, 54, 0.1);
        }
        .test-summary .passed {
          color: #4caf50;
        }
        .test-summary .failed {
          color: #f44336;
        }
        .highlight-location {
          animation: highlight-animation 2s;
        }
        .folder-label {
          color: rgba(255, 255, 255, 0.7);
          font-weight: normal;
          text-transform: capitalize;
        }
        .test-header-row h3 {
          margin: 0;
          display: flex;
          align-items: baseline;
          gap: 8px;
          flex-wrap: wrap;
        }
        .test-case {
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 0;
        }
        .test-case:last-child {
          border-bottom: none;
        }
        .test-case-header {
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 8px;
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }
        .test-case.expanded .test-case-header {
          border-bottom-left-radius: 0;
          border-bottom-right-radius: 0;
        }
        .test-details {
          padding: 12px;
          background-color: rgba(0, 0, 0, 0.05);
          border-bottom-left-radius: 4px;
          border-bottom-right-radius: 4px;
          display: none;
          overflow: hidden;
        }
        .test-case.expanded .test-details {
          display: block;
        }
        .items-list {
          margin: 4px 0;
          padding-left: 24px;
        }
        .items-list li {
          margin-bottom: 2px;
        }
        .passed {
          color: #4CAF50;
        }
        .failed {
          color: #F44336;
        }
      </style>
    `;

    container.innerHTML = html;

    // Attach event listener for the back button
    document
      .getElementById('back-to-test-sets')
      ?.addEventListener('click', () => this.clearTestData());

    // Attach event listeners for run test buttons
    container.querySelectorAll('.run-test').forEach((button) => {
      const index = parseInt(button.dataset.testIndex, 10);
      const testCase = this.testCases.location_tests[index];
      const statusElement = document.getElementById(`test-status-${index}`);
      if (testCase && statusElement) {
        button.onclick = () => {
          // Run the test
          const result = this.loadTestCase(testCase, statusElement);

          // Update summary for a single test
          const resultsElement = document.getElementById(
            'test-results-summary'
          );
          if (resultsElement) {
            resultsElement.innerHTML = `
              <div class="test-summary ${
                result ? 'all-passed' : 'has-failures'
              }">
                Test completed: 
                <span class="${result ? 'passed' : 'failed'}">${
              result ? 'PASSED' : 'FAILED'
            }</span>
                (Location: ${testCase[0]})
              </div>
            `;
          }

          // Add the debug button after running an individual test
          this.addDebugButton();

          return result;
        };
      }
    });

    // Add Run All Tests button listener
    document
      .getElementById('run-all-tests')
      ?.addEventListener('click', () => this.runAllTests());

    // Add test data loader listener
    const loadDataButton = document.getElementById('load-test-data');
    if (loadDataButton) {
      loadDataButton.addEventListener('click', () => {
        const statusElement = document.getElementById('test-results-summary');
        statusElement.textContent = 'Loading test data...';

        try {
          // Use synchronous XMLHttpRequest instead of fetch
          const xhr = new XMLHttpRequest();

          // Construct folder path if we have a current folder
          const folderPath = this.currentFolder ? `${this.currentFolder}/` : '';

          // Load the test rules based on the folder name, not the test set name
          xhr.open(
            'GET',
            `./tests/${folderPath}${this.currentFolder}_rules.json`,
            false
          );
          xhr.send();

          if (xhr.status !== 200) {
            throw new Error(`HTTP error! status: ${xhr.status}`);
          }

          const jsonData = JSON.parse(xhr.responseText);

          // Use gameUI's initialization code
          this.gameUI.clearExistingData();
          this.gameUI.initializeUI(jsonData, '1');
          this.gameUI.currentRules = jsonData;

          // Update test cases with synchronous request
          const testXhr = new XMLHttpRequest();
          testXhr.open(
            'GET',
            `./tests/${folderPath}${this.currentTestSet}_tests.json`,
            false
          );
          testXhr.send();

          if (testXhr.status === 200) {
            this.testCases = JSON.parse(testXhr.responseText);
          } else {
            throw new Error(`Failed to load test cases: ${testXhr.status}`);
          }

          this.testRules = jsonData;

          // Update UI and data source indicator
          this.updateDataSourceIndicator();
        } catch (error) {
          console.error('Error loading test data:', error);
          const dataSource = document.getElementById('data-source');
          if (dataSource) {
            dataSource.innerHTML = `Error loading ${this.currentTestSet} test data: ${error.message}`;
            dataSource.className = 'data-source-wrong';
          }
          const statusElement = document.getElementById('test-results-summary');
          if (statusElement) {
            statusElement.innerHTML = `<div class="test-error">Error loading test data: ${error.message}</div>`;
          }
        }
      });
    }

    // Add event listeners for region and location links
    setTimeout(() => {
      document.querySelectorAll('.location-link').forEach((link) => {
        link.addEventListener('click', (e) => {
          const locationName = link.dataset.location;
          const regionName = link.dataset.region;
          if (locationName && regionName) {
            this.gameUI.regionUI.navigateToLocation(locationName, regionName);
          }
        });
      });
    }, 0);
  }

  formatItemsList(items) {
    if (!items || items.length === 0) return 'None';

    return items
      .map((item) => {
        // Check if we know about this item - if so, make it clickable
        if (this.gameUI.inventoryUI?.itemData?.[item]) {
          return `<span class="item-link" data-item="${this.escapeHtml(
            item
          )}">${this.escapeHtml(item)}</span>`;
        }
        return this.escapeHtml(item);
      })
      .join(', ');
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

  /**
   * Adds a debug button to the test results summary panel
   * This allows users to debug critical regions with a click
   */
  addDebugButton() {
    const container = document.getElementById('test-results-summary');
    if (!container) return;

    const debugButton = document.createElement('button');
    debugButton.textContent = 'Debug Critical Regions';
    debugButton.className = 'button';
    debugButton.style.marginTop = '10px';
    debugButton.style.backgroundColor = '#9c27b0';
    debugButton.style.color = '#fff';

    debugButton.addEventListener('click', () => {
      stateManager.debugCriticalRegions();
    });

    container.appendChild(debugButton);
    console.log('Debug button added to test UI');
  }
}

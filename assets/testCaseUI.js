import stateManager from './stateManagerSingleton.js';

export class TestCaseUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.testCases = null;
    this.testRules = null;
    this.currentTest = null;
  }

  initialize() {
    try {
      // Use synchronous XMLHttpRequest instead of fetch
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

      this.testCases = loadJSON('./test_cases.json');
      this.testRules = loadJSON('./test_output_rules.json');

      // Render the test cases list once during initialization
      this.renderTestCasesList();
      return true;
    } catch (error) {
      console.error('Error loading test data:', error);
      return false;
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

      // First initialize inventory with the test rules data
      stateManager.loadFromJSON(this.testRules);

      // Then set up the test case inventory state
      stateManager.initializeInventoryForTest(
        requiredItems,
        excludedItems,
        this.testRules.progression_mapping['1'],
        this.testRules.items['1']
      );

      // Force UI sync and cache invalidation
      stateManager.invalidateCache();
      stateManager.computeReachableRegions();
      this.gameUI.inventoryUI?.syncWithState();

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
            excludedItems,
            this.testRules.progression_mapping['1'],
            this.testRules.items['1']
          );

          // Check if still accessible
          if (stateManager.isLocationAccessible(locationData)) {
            validationFailed = missingItem;
            break;
          }
        }
      }

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
    const dataSource = document.getElementById('data-source');
    if (dataSource) {
      const isTestData = this.isUsingTestData();
      dataSource.textContent = isTestData
        ? 'test_output_rules.json'
        : 'default_rules.json';
      dataSource.className = isTestData
        ? 'data-source-correct'
        : 'data-source-wrong';
    }
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
  }

  renderTestCasesList() {
    const container = document.getElementById('test-cases-list');

    let html = `
      <div class="test-header">
        <h3>Available Test Cases</h3>
        <div class="test-controls">
          <button id="load-test-data" class="button">Load Test Data</button>
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

    // Add styles
    html += `
      <style>
        .test-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
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
      </style>
    `;

    container.innerHTML = html;

    // Attach event listeners for run test buttons
    container.querySelectorAll('.run-test').forEach((button) => {
      const index = parseInt(button.dataset.testIndex, 10);
      const testCase = this.testCases.location_tests[index];
      const statusElement = document.getElementById(`test-status-${index}`);
      if (testCase && statusElement) {
        button.onclick = () => this.loadTestCase(testCase, statusElement);
      }
    });

    // Add Run All Tests button listener
    document
      .getElementById('run-all-tests')
      ?.addEventListener('click', () => this.runAllTests());

    // Add test data loader listener
    document.getElementById('load-test-data')?.addEventListener('click', () => {
      try {
        // Use synchronous XMLHttpRequest instead of fetch
        const xhr = new XMLHttpRequest();
        xhr.open('GET', './test_output_rules.json', false);
        xhr.send();

        if (xhr.status !== 200) {
          throw new Error(`HTTP error! status: ${xhr.status}`);
        }

        const jsonData = JSON.parse(xhr.responseText);

        // Use gameUI's initialization code
        this.gameUI.clearExistingData();
        this.gameUI.initializeUI(jsonData);
        this.gameUI.currentRules = jsonData; // Track current rules

        // Update test cases with synchronous request
        const testXhr = new XMLHttpRequest();
        testXhr.open('GET', './test_cases.json', false);
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
          dataSource.innerHTML = 'Error loading test_output_rules.json';
          dataSource.className = 'data-source-wrong';
        }
      }
    });

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
}

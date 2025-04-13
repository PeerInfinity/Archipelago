// locationTester.js
import { evaluateRule } from '../app/core/ruleEngine.js';
import stateManager from '../app/core/stateManagerSingleton.js';
import { TestLogger } from './testLogger.js';
import { TestResultsDisplay } from './testResultsDisplay.js';

/**
 * Class for testing location accessibility
 * This is used by the test runner interface
 */
export class LocationTester {
  constructor() {
    this.logger = new TestLogger();
    this.display = new TestResultsDisplay();
    this.availableTestSets = null;
    this.currentTestSet = null;
    this.currentFolder = null;
    console.log('LocationTester initialized');
  }

  async loadTestSets() {
    try {
      console.log('Loading test sets from test_files.json...');

      // List of possible paths to try
      const possiblePaths = [
        //'../tests/test_files.json',
        './tests/test_files.json',
        //'../../tests/test_files.json',
        //'../test_files.json', // Keep fallbacks just in case
        //'./test_files.json',
      ];
      let loaded = false;
      let testSets = null;

      // Try all possible paths
      for (const path of possiblePaths) {
        try {
          console.log(`Trying to load from: ${path}`);
          const xhr = new XMLHttpRequest();
          xhr.open('GET', path, false);
          xhr.send();

          if (xhr.status === 200) {
            console.log(`Successfully loaded test_files.json from ${path}`);
            const rawText = xhr.responseText;
            console.log('Raw test_files.json content:', rawText);

            testSets = JSON.parse(rawText);
            console.log('Parsed test sets:', testSets);
            this.availableTestSets = testSets;
            loaded = true;
            break;
          } else {
            console.warn(`Failed to load from ${path}: ${xhr.status}`);
          }
        } catch (pathError) {
          console.warn(`Error loading from ${path}:`, pathError);
        }
      }

      if (!loaded) {
        console.warn(
          'Failed to load test_files.json from any location, using fallback test sets'
        );
        // Provide default test sets as a fallback
        const fallbackSets = {
          default: {
            testLightWorld: true,
            testEastDarkWorld: true,
            testMireArea: true,
            testSouthDarkWorld: true,
            testWestDarkWorld: true,
          },
        };
        console.log('Using fallback test sets:', fallbackSets);
        return fallbackSets;
      }

      // Check if the loaded structure is the new nested format or the old flat format
      // If it's the old format, wrap it in a 'default' folder
      if (testSets && typeof testSets === 'object') {
        // Check if any keys in the object have values that are objects themselves
        // If not, it's the old format
        const hasNestedStructure = Object.values(testSets).some(
          (value) => typeof value === 'object' && value !== null
        );

        if (!hasNestedStructure) {
          console.log('Detected old flat format, converting to nested format');
          return { default: testSets };
        }
      }

      return testSets;
    } catch (error) {
      console.error('Error loading test sets:', error);
      throw error;
    }
  }

  loadRulesData(testSet = 'testLightWorld', folder = null) {
    try {
      console.log(
        `Loading rules data for test set: ${testSet} in folder: ${
          folder || 'default'
        }`
      );
      this.currentTestSet = testSet;
      this.currentFolder = folder;

      // Construct folder path if we have a folder
      const folderPath = folder ? `${folder}/` : '';

      // First check if the file exists with a HEAD request
      let fileExists = true;
      try {
        const checkXhr = new XMLHttpRequest();
        checkXhr.open(
          'HEAD',
          `./tests/${folderPath}${folder}_rules.json`,
          false
        );
        checkXhr.send();
        if (checkXhr.status !== 200) {
          console.warn(
            `Rules file for ${folder} in folder ${
              folder || 'default'
            } does not exist (status: ${checkXhr.status})`
          );
          fileExists = false;
        }
      } catch (e) {
        console.warn(
          `Error checking if rules file exists for ${folder} in folder ${
            folder || 'default'
          }:`,
          e
        );
        fileExists = false;
      }

      // Don't fall back to a default file - this ensures consistency with folder-specific tests
      if (!fileExists) {
        throw new Error(
          `${folder}_rules.json not found in folder ${
            folder || 'default'
          }. No fallback will be used to ensure consistency.`
        );
      }

      // Use synchronous XMLHttpRequest to load the test file
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `./tests/${folderPath}${folder}_rules.json`, false);
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }

      const rulesData = JSON.parse(xhr.responseText);
      console.log(
        `Successfully loaded rules data for ${folder} (${
          Object.keys(rulesData).length
        } top-level keys)`
      );

      // Store all relevant data
      this.rulesData = rulesData;

      // Initialize state manager with the rules data
      console.log(
        'Before loadFromJSON - stateManager.inventory.progressionMapping:',
        stateManager.inventory?.progressionMapping
      );
      console.log(
        'Before loadFromJSON - rulesData.progression_mapping:',
        rulesData.progression_mapping?.['1']
      );

      // Pass '1' as the selectedPlayerId for test loading
      stateManager.loadFromJSON(rulesData, '1');

      console.log(
        'After loadFromJSON - stateManager.inventory.progressionMapping:',
        stateManager.inventory?.progressionMapping
      );
      console.log(
        'After loadFromJSON - stateManager state.gameSettings:',
        stateManager.state?.gameSettings
      );

      console.log(`Rules data loaded into state manager for ${folder}`);

      return true;
    } catch (error) {
      console.error(`Error loading rules data for ${folder}:`, error);
      throw error;
    }
  }

  runLocationTests(testCases) {
    this.logger.setDebugging(true);
    this.logger.clear();

    let failureCount = 0;
    const allResults = [];
    const totalTests = testCases.length;

    try {
      console.log(`Running ${totalTests} test cases`);

      // Track progress
      let progressCounter = 0;
      const progressInterval = Math.max(1, Math.floor(totalTests / 10)); // Show progress every ~10% of tests

      // Get current folder and file information for progress display
      const folderName = this.currentFolder || 'default';
      const testSetName = this.currentTestSet || 'unknown';

      // Get the global context from the window if available
      const folderCount = window.testProgress?.totalFolders || '?';
      const folderIndex = window.testProgress?.currentFolderIndex || '?';
      const fileCount = window.testProgress?.totalFilesInFolder || '?';
      const fileIndex = window.testProgress?.currentFileIndex || '?';

      console.log(
        `Test progress: Folder ${folderIndex} of ${folderCount}, File ${fileIndex} of ${fileCount}, Test 0/${totalTests} (0%)`
      );

      for (const [
        location,
        expectedAccess,
        requiredItems = [],
        excludedItems = [],
      ] of testCases) {
        // Update progress counter
        progressCounter++;
        if (
          progressCounter % progressInterval === 0 ||
          progressCounter === totalTests
        ) {
          const percent = Math.round((progressCounter / totalTests) * 100);
          console.log(
            `Test progress: Folder ${folderIndex} of ${folderCount}, File ${fileIndex} of ${fileCount}, Test ${progressCounter}/${totalTests} (${percent}%)`
          );
        }

        const testResult = this.runSingleTest(
          location,
          expectedAccess,
          requiredItems,
          excludedItems
        );

        // Record result with full context
        const resultWithContext = {
          location,
          result: {
            passed: testResult.passed,
            message: testResult.message,
            expectedAccess,
            requiredItems,
            excludedItems,
          },
        };

        allResults.push(resultWithContext);

        if (!testResult.passed) {
          failureCount++;
          console.error(`Test failed for ${location}:`, testResult);
        }
      }

      // Display results using the current display instance
      if (this.display) {
        console.log(
          `Displaying results for ${totalTests} tests (${failureCount} failures)`
        );
        this.display.displayResults(allResults);
      } else {
        console.warn('No display instance available to show results');
      }

      console.log(`Tests completed with ${failureCount} failures`);
      return failureCount;
    } catch (error) {
      console.error('Error in runLocationTests:', error);
      throw error;
    }
  }

  runSingleTest(location, expectedAccess, requiredItems, excludedItems) {
    try {
      // clearState is probably faster, loadFromJSON is probably safer
      stateManager.clearState();

      if (this.rulesData) {
        //stateManager.loadFromJSON(this.rulesData);
      }

      // Start logging this test
      this.logger.startTest({
        location,
        expectedAccess,
        requiredItems,
        excludedItems,
        progressionMapping: stateManager.inventory.progressionMapping,
        itemData: stateManager.itemData,
      });

      // Now initialize the inventory for testing with the specific items
      stateManager.initializeInventoryForTest(requiredItems, excludedItems);

      // Force cache invalidation to ensure clean state
      stateManager.invalidateCache();

      // Find location data
      const locationData = stateManager.locations.find(
        (loc) => loc.name === location && loc.player === 1
      );

      if (!locationData) {
        const result = {
          passed: false,
          message: `Location not found: ${location}`,
        };
        this.logger.endTest(result);
        return result;
      }

      // Check accessibility using stateManager's own inventory
      const isAccessible = stateManager.isLocationAccessible(locationData);

      this.logger.log(`${location} accessibility:`, {
        expected: expectedAccess,
        actual: isAccessible,
        requiredItems,
        excludedItems,
      });

      // Check if result matches expectation
      const passed = isAccessible === expectedAccess;
      if (!passed) {
        const result = {
          passed: false,
          message: `Expected: ${expectedAccess}, Got: ${isAccessible}`,
        };
        this.logger.endTest(result);
        return result;
      }

      // If accessibility check passed, test partial inventories if needed
      // Make sure this matches exactly how testCaseUI.js does it
      if (expectedAccess && requiredItems.length > 0 && !excludedItems.length) {
        for (const missingItem of requiredItems) {
          // Initialize stateManager with partial inventory
          stateManager.initializeInventoryForTest(
            requiredItems.filter((item) => item !== missingItem),
            excludedItems
          );

          // Force cache invalidation
          stateManager.invalidateCache();

          // Check with state manager's inventory directly
          const partialAccess = stateManager.isLocationAccessible(locationData);

          if (partialAccess) {
            const result = {
              passed: false,
              message: `Location accessible without required item: ${missingItem}`,
            };
            this.logger.endTest(result);
            return result;
          }
        }
      }

      // If we get here, the test passed
      const result = {
        passed: true,
        message: 'Test passed',
      };
      this.logger.endTest(result);
      return result;
    } catch (error) {
      console.error(`Error testing ${location}:`, error);
      const result = {
        passed: false,
        message: `Test error: ${error.message}`,
      };
      this.logger.endTest(result);
      return result;
    }
  }

  // Static method to load and run all tests from available test sets
  static async loadAndRunAllTests() {
    try {
      console.log('Starting loadAndRunAllTests...');
      window.testsStarted = true;
      window.testsCompleted = false;

      // Create a global test progress object to track folder and file indices
      window.testProgress = {
        totalFolders: 0,
        currentFolderIndex: 0,
        totalFilesInFolder: 0,
        currentFileIndex: 0,
      };

      const tester = new LocationTester();

      // Create results container if it doesn't exist
      const resultsContainer = document.getElementById('test-results');
      if (!resultsContainer) {
        console.error('No #test-results element found. Creating one...');
        const container = document.createElement('div');
        container.id = 'test-results';
        document.body.appendChild(container);
      }

      // Clear previous test results
      resultsContainer.innerHTML = `
        <h1>Running All Test Sets...</h1>
        <div id="overall-test-summary"></div>
        <div id="test-sets-container"></div>
      `;

      // Load test sets from file
      console.log('Loading available test sets...');
      const testSets = await tester.loadTestSets();
      console.log('Available test sets:', testSets);

      // Create container for all results
      const testSetsContainer = document.getElementById('test-sets-container');
      if (!testSetsContainer) {
        throw new Error(
          'Could not find #test-sets-container element in the DOM'
        );
      }

      console.log('Setting up UI elements...');

      // Create overall summary section at the top
      const overallSummaryElement = document.createElement('div');
      overallSummaryElement.id = 'overall-test-summary';
      overallSummaryElement.className = 'overall-test-summary';
      overallSummaryElement.innerHTML = '<h2>Running All Test Sets...</h2>';

      // Create a container for all tests
      const testContainer = document.createElement('div');
      testContainer.className = 'all-tests-container';

      // Add to DOM
      resultsContainer.innerHTML = '';
      resultsContainer.appendChild(overallSummaryElement);
      resultsContainer.appendChild(testContainer);

      // Add expand/collapse controls
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'test-controls';
      controlsDiv.innerHTML = `
        <button id="collapse-all-tests" class="test-control-btn">Collapse All</button>
        <button id="expand-all-tests" class="test-control-btn">Expand All</button>
      `;
      testContainer.appendChild(controlsDiv);

      // Create a container for the test sets
      const testSetsList = document.createElement('div');
      testSetsList.className = 'test-sets-list';
      testContainer.appendChild(testSetsList);

      // Setup event listeners for the control buttons after they're added to the DOM
      document
        .getElementById('collapse-all-tests')
        .addEventListener('click', () => {
          document.querySelectorAll('.test-set-section').forEach((section) => {
            section.classList.add('collapsed');
            const icon = section.querySelector('.toggle-icon');
            if (icon) icon.textContent = '▶';
          });
        });

      document
        .getElementById('expand-all-tests')
        .addEventListener('click', () => {
          document.querySelectorAll('.test-set-section').forEach((section) => {
            section.classList.remove('collapsed');
            const icon = section.querySelector('.toggle-icon');
            if (icon) icon.textContent = '▼';
          });
        });

      // Add styles for the test sets
      const style = document.createElement('style');
      style.textContent = `
        .test-set-section {
          margin-bottom: 15px;
          border: 1px solid #ddd;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .test-set-header {
          cursor: pointer;
          padding: 12px 15px;
          background-color: #f8f9fa;
          margin: 0;
          border-bottom: 1px solid #ddd;
          user-select: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header-title {
          font-weight: bold;
          flex-grow: 1;
          color: #2c3e50;
        }
        .header-stats {
          display: flex;
          gap: 12px;
          margin-right: 15px;
          font-size: 0.9rem;
        }
        .header-stat {
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 500;
          min-width: 60px;
          text-align: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .test-set-results {
          margin-top: 12px;
        }
        .test-error {
          color: #F44336;
          margin: 8px 0;
        }
        .error-details {
          margin-top: 8px;
          padding: 8px;
          background-color: rgba(0, 0, 0, 0.2);
          border-radius: 4px;
          font-family: monospace;
          white-space: pre-wrap;
          overflow-x: auto;
        }
        /* Styles for the test results */
        .test-set-header {
          color: #2c3e50;
          margin-bottom: 8px;
        }
        .test-set-status {
          margin-bottom: 10px;
          font-weight: 500;
        }
        .test-set-results {
          margin-bottom: 20px;
        }
        .test-error {
          color: #e74c3c;
          font-weight: bold;
        }
        .test-summary {
          font-weight: 500;
        }
        .test-passed {
          color: #27ae60;
        }
        .test-failed {
          color: #e74c3c;
        }
        /* Styles for the test interface */
        .all-tests-container {
          padding: 10px;
          margin-bottom: 20px;
        }
        .test-controls {
          margin-bottom: 15px;
          padding: 5px 0;
          border-bottom: 1px solid #ddd;
        }
        .test-control-btn {
          background-color: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 5px 10px;
          margin-right: 10px;
          cursor: pointer;
          font-size: 0.9rem;
        }
        .test-control-btn:hover {
          background-color: #e2e6ea;
        }
        .test-sets-list {
          margin-top: 10px;
        }
        .test-set-section {
          margin-bottom: 15px;
          border: 1px solid #ddd;
          border-radius: 5px;
          overflow: hidden;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .test-set-header {
          cursor: pointer;
          padding: 12px 15px;
          background-color: #f8f9fa;
          margin: 0;
          border-bottom: 1px solid #ddd;
          user-select: none;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .header-title {
          font-weight: bold;
          flex-grow: 1;
          color: #2c3e50;
        }
        .header-stats {
          display: flex;
          gap: 12px;
          margin-right: 15px;
          font-size: 0.9rem;
        }
        .header-stat {
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 500;
          min-width: 60px;
          text-align: center;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .header-stat.passed {
          background-color: rgba(39, 174, 96, 0.15);
          color: #27ae60;
          border: 1px solid rgba(39, 174, 96, 0.2);
        }
        .header-stat.failed {
          background-color: rgba(231, 76, 60, 0.15);
          color: #e74c3c;
          border: 1px solid rgba(231, 76, 60, 0.2);
        }
        .header-stat.error {
          background-color: rgba(231, 76, 60, 0.15);
          color: #e74c3c;
          font-weight: bold;
          border: 1px solid rgba(231, 76, 60, 0.2);
        }
        .test-set-header:hover {
          background-color: #e9ecef;
        }
        .toggle-icon {
          margin-left: 10px;
          font-size: 1rem;
          color: #6c757d;
          width: 20px;
          text-align: center;
        }
        .test-set-content {
          padding: 10px;
        }
        .test-set-section.collapsed .test-set-content {
          display: none;
        }
        .test-set-status {
          margin-bottom: 10px;
          font-weight: 500;
          padding: 5px;
          border-radius: 4px;
          background-color: #f8f9fa;
        }
        .test-summary {
          padding: 5px;
        }
        .test-passed {
          color: #27ae60;
        }
        .test-failed {
          color: #e74c3c;
        }
        .test-error {
          color: #e74c3c;
          font-weight: bold;
        }
        /* Styles for the UI */
        .overall-summary {
          background-color: #f8f9fa;
          border: 1px solid #ddd;
          border-radius: 5px;
          padding: 10px 15px;
          margin-bottom: 20px;
        }
        .summary-container h2 {
          margin-top: 0;
          color: #2c3e50;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        .summary-stats {
          display: flex;
          flex-wrap: wrap;
          gap: 15px;
        }
        .stat-item {
          font-size: 1rem;
          padding: 5px 10px;
          background-color: #fff;
          border-radius: 4px;
          border: 1px solid #eee;
        }
        .stat-value {
          font-weight: bold;
        }
        .stat-passed {
          color: #27ae60;
        }
        .stat-failed {
          color: #e74c3c;
        }
      `;
      document.head.appendChild(style);

      // Track overall stats
      let totalTests = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let processedSets = 0;
      let firstFolder = true;

      // Now process each folder and its test sets
      let totalTestSetCount = 0;
      let processedTestSetCount = 0;

      // Count all enabled test sets across all folders first
      let totalEnabledFolders = 0;
      let totalEnabledFiles = 0;

      for (const [folderName, folderTestSets] of Object.entries(testSets)) {
        const enabledTestSets = Object.entries(folderTestSets).filter(
          ([name, isEnabled]) => {
            const enabled =
              isEnabled === true ||
              isEnabled === 'true' ||
              isEnabled === 1 ||
              isEnabled === '1';
            return enabled;
          }
        );

        if (enabledTestSets.length > 0) {
          totalEnabledFolders++;
          totalEnabledFiles += enabledTestSets.length;
        }
      }

      // Update the global test progress
      window.testProgress.totalFolders = totalEnabledFolders;
      console.log(`Total enabled folders: ${totalEnabledFolders}`);

      // Now process each folder
      let currentFolderIndex = 0;

      for (const [folderName, folderTestSets] of Object.entries(testSets)) {
        console.log(`Processing folder: ${folderName}`);

        // Create a header for this folder
        const folderHeader = document.createElement('div');
        folderHeader.className = `folder-header ${
          firstFolder ? 'first-folder' : ''
        }`;
        folderHeader.textContent = folderName.replace(/([A-Z])/g, ' $1').trim();
        testSetsList.appendChild(folderHeader);
        firstFolder = false;

        // Check for enabled test sets in this folder
        const enabledTestSets = Object.entries(folderTestSets).filter(
          ([name, isEnabled]) => {
            // Handle different representations of "true"
            const enabled =
              isEnabled === true ||
              isEnabled === 'true' ||
              isEnabled === 1 ||
              isEnabled === '1';
            console.log(
              `Test set ${name} in folder ${folderName}: enabled = ${enabled} (value type: ${typeof isEnabled}, value: '${isEnabled}')`
            );
            return enabled;
          }
        );

        // Skip folders with no enabled test sets
        if (enabledTestSets.length === 0) {
          console.log(
            `No enabled test sets found in folder ${folderName}, skipping`
          );
          continue;
        }

        // Update folder progress
        currentFolderIndex++;
        window.testProgress.currentFolderIndex = currentFolderIndex;
        window.testProgress.totalFilesInFolder = enabledTestSets.length;
        window.testProgress.currentFileIndex = 0;

        console.log(
          `Found ${enabledTestSets.length} enabled test sets in folder ${folderName}`
        );

        // Process each enabled test set in this folder
        let currentFileIndex = 0;

        for (const [testSetName, _] of enabledTestSets) {
          // Update file progress
          currentFileIndex++;
          window.testProgress.currentFileIndex = currentFileIndex;

          console.log(
            `Processing test set: ${testSetName} in folder: ${folderName} (${currentFileIndex}/${enabledTestSets.length})`
          );

          // Create the container for this test set
          const testSetSection = document.createElement('div');
          testSetSection.className = 'test-set-section';
          testSetSection.innerHTML = `
            <div class="test-set-header">
              <span class="toggle-icon">▼</span>
              <span class="header-title">${testSetName
                .replace(/^test/, '')
                .replace(/([A-Z])/g, ' $1')
                .trim()} (${folderName})</span>
              <div class="header-stats">
                <span class="header-stat">Loading...</span>
              </div>
            </div>
            <div class="test-set-content">
              <div class="test-set-status">Loading...</div>
              <div class="test-set-results"></div>
            </div>
          `;

          // Add toggle functionality
          const header = testSetSection.querySelector('.test-set-header');
          header.addEventListener('click', () => {
            testSetSection.classList.toggle('collapsed');
            const icon = header.querySelector('.toggle-icon');
            icon.textContent = testSetSection.classList.contains('collapsed')
              ? '▶'
              : '▼';
          });

          testSetsList.appendChild(testSetSection);

          // Run tests for this test set
          try {
            // Create a new tester for this test set
            console.log(
              `Creating new tester for ${testSetName} in folder ${folderName}`
            );
            const setTester = new LocationTester();

            // Load rules data for this test set
            console.log(
              `Loading rules data for ${testSetName} in folder ${folderName}`
            );
            setTester.loadRulesData(testSetName, folderName);

            // Check if the test file exists
            console.log(
              `Checking if test file exists for ${testSetName} in folder ${folderName}`
            );
            let fileExists = true;
            try {
              const checkXhr = new XMLHttpRequest();
              const folderPath = folderName ? `${folderName}/` : '';
              checkXhr.open(
                'HEAD',
                `./tests/${folderPath}${testSetName}_tests.json`,
                false
              );
              checkXhr.send();
              if (checkXhr.status !== 200) {
                console.warn(
                  `Test file for ${testSetName} in folder ${folderName} does not exist (status: ${checkXhr.status})`
                );
                fileExists = false;
              }
            } catch (e) {
              console.warn(
                `Error checking if test file exists for ${testSetName}:`,
                e
              );
              fileExists = false;
            }

            // Always use the folder-specific test file path, don't fall back to a generic file
            // This ensures test files with the same name in different folders are handled correctly
            const folderPath = folderName ? `${folderName}/` : '';
            const testFilePath = `./tests/${folderPath}${testSetName}_tests.json`;

            if (!fileExists) {
              throw new Error(
                `${testSetName}_tests.json not found in folder ${folderName}. No fallback will be used to ensure consistency.`
              );
            }

            const xhr = new XMLHttpRequest();
            xhr.open('GET', testFilePath, false);
            xhr.send();

            if (xhr.status !== 200) {
              throw new Error(
                `Failed to load test cases for ${testSetName}: HTTP ${xhr.status}`
              );
            }

            let testCases;
            try {
              testCases = JSON.parse(xhr.responseText);
            } catch (e) {
              throw new Error(
                `Failed to parse test cases JSON for ${testSetName}: ${e.message}`
              );
            }

            if (!testCases || !testCases.location_tests) {
              throw new Error(
                `Invalid test cases format for ${testSetName}: no location_tests property found`
              );
            }

            // Get the results container for this test set
            const testSetResults =
              testSetSection.querySelector('.test-set-results');
            const testSetStatus =
              testSetSection.querySelector('.test-set-status');

            // Setup custom display for this test set
            const testSetResultsId = `test-set-results-${testSetName}-${folderName}`;
            console.log(`Creating display for ${testSetResultsId}`);

            // Create a custom container for this test set's results
            const resultsContainer = document.createElement('div');
            resultsContainer.id = testSetResultsId;
            testSetResults.appendChild(resultsContainer);

            // Create a new TestResultsDisplay instance for this specific test set
            setTester.display = new TestResultsDisplay(resultsContainer);

            // Make sure the current test set and folder are correctly set
            setTester.currentTestSet = testSetName;
            setTester.currentFolder = folderName;

            // Run tests and get results
            console.log(
              `Running ${testCases.location_tests.length} location tests for ${testSetName} in folder ${folderName}...`
            );
            const failedCount = setTester.runLocationTests(
              testCases.location_tests
            );
            const passedCount = testCases.location_tests.length - failedCount;

            // Update test set status
            console.log(
              `Updating status for ${testSetName}: ${passedCount} passed, ${failedCount} failed`
            );

            // Update the status message to show results instead of "Loading..."
            testSetStatus.innerHTML = `<div class="test-summary">
              <span class="test-passed">${passedCount} passed</span>, 
              <span class="test-failed">${failedCount} failed</span>
            </div>`;

            // Also update the header stats to be visible when collapsed
            const headerStats = testSetSection.querySelector('.header-stats');
            headerStats.innerHTML = `
              <span class="header-stat passed">${passedCount} ✓</span>
              <span class="header-stat failed">${failedCount} ✗</span>
            `;

            // Update overall stats
            totalTests += testCases.location_tests.length;
            totalPassed += passedCount;
            totalFailed += failedCount;

            // Update processed sets counter
            processedSets++;
          } catch (error) {
            console.error(`Error running tests for ${testSetName}:`, error);
            const testSetResults =
              testSetSection.querySelector('.test-set-results');
            const testSetStatus =
              testSetSection.querySelector('.test-set-status');
            const headerStats = testSetSection.querySelector('.header-stats');

            // Update status with error message
            testSetStatus.innerHTML = `<div class="test-error">Error: ${error.message}</div>`;

            // Update header stats to show error
            headerStats.innerHTML = `<span class="header-stat error">Error</span>`;

            processedSets++;
          }
        }

        // Update final stats when all sets are processed
        if (processedSets === testSets.length) {
          // All test sets have been processed, update the overall summary
          const passRate = Math.round((totalPassed / totalTests) * 100);
          overallSummaryElement.innerHTML = `
            <div class="summary-container">
              <h2>All Tests Complete</h2>
              <div class="summary-stats">
                <div class="stat-item">Total Tests: <span class="stat-value">${totalTests}</span></div>
                <div class="stat-item">Passed: <span class="stat-value stat-passed">${totalPassed}</span> (${passRate}%)</div>
                <div class="stat-item">Failed: <span class="stat-value stat-failed">${totalFailed}</span></div>
              </div>
            </div>
          `;
        }
      }

      // Update overall summary
      const overallSummaryContainer = document.getElementById(
        'overall-test-summary'
      );
      if (overallSummaryContainer) {
        const overallSummaryText = document.createElement('div');
        overallSummaryText.className = 'overall-summary';
        overallSummaryText.textContent = `
          Total Tests: ${totalTests}, Passed: ${totalPassed}, Failed: ${totalFailed}
        `;
        overallSummaryContainer.appendChild(overallSummaryText);
      }

      console.log('All tests completed');
      window.testsCompleted = true;

      // Reset the test progress object
      window.testProgress = {
        totalFolders: 0,
        currentFolderIndex: 0,
        totalFilesInFolder: 0,
        currentFileIndex: 0,
      };

      return true;
    } catch (error) {
      console.error('Error in loadAndRunAllTests:', error);
      const resultsContainer = document.getElementById('test-results');
      if (resultsContainer) {
        resultsContainer.innerHTML = `
          <div class="error">
            <h2>Test Execution Failed</h2>
            <pre style="color: red;">${error.message}</pre>
            <pre>${error.stack}</pre>
          </div>
        `;
      }
      window.testsCompleted = true;
      return { success: false, error: error.message };
    }
  }
}

// Initialize tests when page loads
if (typeof window !== 'undefined') {
  window.onload = () => {
    try {
      console.log('Window loaded, starting tests...');
      // Check if test-results container exists
      const resultsContainer = document.getElementById('test-results');
      if (!resultsContainer) {
        console.error(
          'No #test-results element found in the DOM. Creating one...'
        );
        const container = document.createElement('div');
        container.id = 'test-results';
        document.body.appendChild(container);
      }

      // Run all test sets
      console.log('Calling loadAndRunAllTests()...');
      LocationTester.loadAndRunAllTests();
    } catch (error) {
      console.error('Test execution failed:', error);
      const resultsContainer =
        document.getElementById('test-results') || document.body;
      resultsContainer.innerHTML = `
        <div class="error" style="color: red; padding: 20px; background-color: rgba(255,0,0,0.1); border-radius: 4px; margin: 20px;">
          <h2>Test Execution Failed</h2>
          <p>${error.message}</p>
          <pre style="color: red; background: rgba(0,0,0,0.05); padding: 10px; overflow: auto;">${error.stack}</pre>
        </div>
      `;
    }
  };
}

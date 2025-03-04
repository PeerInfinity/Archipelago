// locationTester.js
import { evaluateRule } from './ruleEngine.js';
import stateManager from './stateManagerSingleton.js';
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
          `./tests/${folderPath}${testSet}_rules.json`,
          false
        );
        checkXhr.send();
        if (checkXhr.status !== 200) {
          console.warn(
            `Rules file for ${testSet} does not exist (status: ${checkXhr.status})`
          );
          fileExists = false;
        }
      } catch (e) {
        console.warn(`Error checking if rules file exists for ${testSet}:`, e);
        fileExists = false;
      }

      // If the file doesn't exist, try to load the default test_output_rules.json instead
      if (!fileExists) {
        console.warn(
          `${testSet}_rules.json not found, falling back to test_output_rules.json`
        );

        // Use synchronous XMLHttpRequest
        const xhr = new XMLHttpRequest();
        xhr.open('GET', './tests/test_output_rules.json', false);
        xhr.send();

        if (xhr.status !== 200) {
          throw new Error(
            `Failed to load fallback rules file: HTTP ${xhr.status}`
          );
        }

        const rulesData = JSON.parse(xhr.responseText);
        console.log(
          `Successfully loaded fallback rules data (${
            Object.keys(rulesData).length
          } top-level keys)`
        );

        // Initialize state manager with the rules data
        stateManager.loadFromJSON(rulesData);
        console.log(
          `Fallback rules data loaded into state manager for ${testSet}`
        );

        return true;
      }

      // Use synchronous XMLHttpRequest to load the normal test file
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `./tests/${folderPath}${testSet}_rules.json`, false);
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }

      const rulesData = JSON.parse(xhr.responseText);
      console.log(
        `Successfully loaded rules data for ${testSet} (${
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

      stateManager.loadFromJSON(rulesData);

      console.log(
        'After loadFromJSON - stateManager.inventory.progressionMapping:',
        stateManager.inventory?.progressionMapping
      );
      console.log(
        'After loadFromJSON - stateManager state.gameSettings:',
        stateManager.state?.gameSettings
      );

      console.log(`Rules data loaded into state manager for ${testSet}`);

      return true;
    } catch (error) {
      console.error(`Error loading rules data for ${testSet}:`, error);
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

      console.log(`Test progress: 0/${totalTests} (0%)`);

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
            `Test progress: ${progressCounter}/${totalTests} (${percent}%)`
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
      // Instead of clearing the state, we'll set up a new state with the rulesData
      // This ensures that stateManager has the proper settings and progression mapping
      if (this.rulesData) {
        // First load the full rules data to ensure settings and progression mapping are loaded
        stateManager.loadFromJSON(this.rulesData);
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

      // Create container for all test sets
      const testSetsList = document.createElement('div');
      testSetsList.className = 'all-test-sets';

      // Add to DOM
      resultsContainer.innerHTML = '';
      resultsContainer.appendChild(overallSummaryElement);
      resultsContainer.appendChild(testSetsList);

      // Add styles for the test sets
      const style = document.createElement('style');
      style.textContent = `
        .test-set-section {
          margin-bottom: 20px;
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 8px;
          padding: 16px;
        }
        .test-set-header {
          margin-top: 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 8px;
          margin-bottom: 16px;
        }
        .folder-header {
          margin-top: 30px;
          margin-bottom: 10px;
          font-size: 1.4em;
          padding-bottom: 8px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.2);
        }
        .first-folder .folder-header {
          margin-top: 0;
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
      `;
      document.head.appendChild(style);

      // Track overall stats
      let totalTests = 0;
      let totalPassed = 0;
      let totalFailed = 0;
      let processedSets = 0;
      let firstFolder = true;

      // Process each folder of test sets
      for (const [folderName, folderTestSets] of Object.entries(testSets)) {
        console.log(`Processing folder: ${folderName}`);

        // Create a folder header
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

        console.log(
          `Found ${enabledTestSets.length} enabled test sets in folder ${folderName}`
        );

        // Process each enabled test set in this folder
        for (const [testSetName, _] of enabledTestSets) {
          console.log(
            `Processing test set: ${testSetName} in folder: ${folderName}`
          );

          // Create section for this test set
          const testSetSection = document.createElement('div');
          testSetSection.className = 'test-set-section';
          testSetSection.innerHTML = `
            <h3 class="test-set-header">${testSetName
              .replace(/^test/, '')
              .replace(/([A-Z])/g, ' $1')
              .trim()}</h3>
            <div class="test-set-status">Loading...</div>
            <div class="test-set-results"></div>
          `;

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

            // If the test file doesn't exist, try to load test_cases.json instead
            let testFilePath;
            const folderPath = folderName ? `${folderName}/` : '';

            if (fileExists) {
              testFilePath = `./tests/${folderPath}${testSetName}_tests.json`;
            } else {
              testFilePath = './tests/test_cases.json';
              console.warn(
                `${testSetName}_tests.json not found in folder ${folderName}, falling back to test_cases.json`
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
            const testSetResultsId = `test-set-results-${testSetName}`;
            console.log(`Creating display for ${testSetResultsId}`);
            setTester.display = new TestResultsDisplay(testSetResultsId);

            // Run tests and get results
            console.log(
              `Running ${testCases.location_tests.length} location tests for ${testSetName}...`
            );
            const failedCount = setTester.runLocationTests(
              testCases.location_tests
            );
            const passedCount = testCases.location_tests.length - failedCount;

            // Update test set status
            console.log(
              `Updating status for ${testSetName}: ${passedCount} passed, ${failedCount} failed`
            );

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

            testSetStatus.innerHTML = `<div class="test-error">Error: ${error.message}</div>`;
            testSetResults.innerHTML = `<pre class="error-details">${error.stack}</pre>`;

            processedSets++;
          }
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
      return { success: true, totalTests, totalPassed, totalFailed };
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

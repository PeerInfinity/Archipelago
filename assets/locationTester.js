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
    this.regions = null;
    this.mode = null;
    this.settings = null;
    this.startRegions = null;
    this.progressionMapping = null;
    this.currentLocation = null;
    console.log('LocationTester initialized');
  }

  loadRulesData() {
    try {
      // Use synchronous XMLHttpRequest
      const xhr = new XMLHttpRequest();
      xhr.open('GET', './test_output_rules.json', false); // false makes it synchronous
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`HTTP error! status: ${xhr.status}`);
      }

      const rulesData = JSON.parse(xhr.responseText);

      // Store all relevant data
      this.regions = rulesData.regions['1'];
      this.mode = rulesData.mode?.['1'];
      this.settings = rulesData.settings?.['1'];
      this.startRegions = rulesData.start_regions?.['1'];
      this.progressionMapping = rulesData.progression_mapping['1'];

      // Initialize state manager with the rules data
      stateManager.loadFromJSON(rulesData);

      return true;
    } catch (error) {
      console.error('Error loading rules data:', error);
      throw error;
    }
  }

  runLocationTests(testCases) {
    this.logger.setDebugging(true);
    this.logger.clear();

    let failureCount = 0;
    const allResults = [];

    try {
      console.log(`Running ${testCases.length} test cases`);

      for (const [
        location,
        expectedAccess,
        requiredItems = [],
        excludedItems = [],
      ] of testCases) {
        this.currentLocation = location;

        console.log(`Testing ${location}:`, {
          expectedAccess,
          requiredItems,
          excludedItems,
        });

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

      // Display all results using the TestResultsDisplay
      this.display.displayResults(allResults);

      // Signal completion
      window.testsCompleted = true;
      console.log(`Tests completed with ${failureCount} failures`);

      return failureCount;
    } catch (error) {
      console.error('Error in runLocationTests:', error);
      window.testsCompleted = true;
      throw error;
    }
  }

  runSingleTest(location, expectedAccess, requiredItems, excludedItems) {
    try {
      // Ensure we're using a clean state
      stateManager.clearState();

      // Start logging this test
      this.logger.startTest({
        location,
        expectedAccess,
        requiredItems,
        excludedItems,
      });

      // Use stateManager's inventory directly (matching testCaseUI.js)
      stateManager.initializeInventoryForTest(
        requiredItems,
        excludedItems,
        this.progressionMapping,
        stateManager.itemData
      );

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
            excludedItems,
            this.progressionMapping,
            stateManager.itemData
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
}

// Initialize tests when page loads
if (typeof window !== 'undefined') {
  window.onload = () => {
    try {
      const tester = new LocationTester();
      tester.loadRulesData();

      // Use synchronous XMLHttpRequest
      const xhr = new XMLHttpRequest();
      xhr.open('GET', 'test_cases.json', false); // false makes it synchronous
      xhr.send();

      if (xhr.status !== 200) {
        throw new Error(`Failed to load test cases: ${xhr.status}`);
      }

      const testCasesData = JSON.parse(xhr.responseText);

      if (!testCasesData.location_tests) {
        throw new Error('No location_tests found in test cases file');
      }

      console.log(`Loaded ${testCasesData.location_tests.length} test cases`);
      tester.runLocationTests(testCasesData.location_tests);
    } catch (error) {
      console.error('Test execution failed:', error);
      document.getElementById('test-results').innerHTML = `
        <div class="error">
          <h2>Test Execution Failed</h2>
          <pre style="color: red;">${error.message}</pre>
          <pre>${error.stack}</pre>
        </div>
      `;
      window.testsCompleted = true;
    }
  };
}

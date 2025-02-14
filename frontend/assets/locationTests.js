// locationTests.js
import { LocationManager } from './locationManager.js';
import { evaluateRule } from './ruleEngine.js';
import { ALTTPInventory } from './games/alttp/inventory.js';
import { ALTTPState } from './games/alttp/state.js';
import { ALTTPHelpers } from './games/alttp/helpers.js';
import { TestLogger } from './testLogger.js';
import { TestResultsDisplay } from './testResultsDisplay.js';

export class LocationTester {
  constructor() {
    this.locationManager = new LocationManager();
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

  async loadRulesData() {
    try {
      const response = await fetch('./test_output_rules.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const rulesData = await response.json();

      // Store all relevant data
      this.regions = rulesData.regions['1'];
      this.mode = rulesData.mode?.['1'];
      this.settings = rulesData.settings?.['1'];
      this.startRegions = rulesData.start_regions?.['1'];
      this.progressionMapping = rulesData.progression_mapping['1'];

      // Initialize location manager
      this.locationManager.loadFromJSON(rulesData);

      return true;
    } catch (error) {
      console.error('Error loading rules data:', error);
      throw error;
    }
  }

  createInventory(items = [], excludeItems = []) {
    const state = new ALTTPState(this.logger);
    const inventory = new ALTTPInventory(
      items,
      excludeItems,
      this.progressionMapping,
      this.locationManager.itemData,
      this.logger
    );

    inventory.helpers = new ALTTPHelpers(inventory, state);
    inventory.state = state;

    // Flag for proper bomb counting
    state.setFlag('bombless_start');

    return inventory;
  }

  async runLocationTests(testCases) {
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

        const testResult = await this.runSingleTest(
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

      // Display all results
      this.display.displayResults(allResults, this.locationManager);

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

  async runSingleTest(location, expectedAccess, requiredItems, excludedItems) {
    try {
      const inventory = this.createInventory(requiredItems, excludedItems);
      const locationData = this.locationManager.locations.find(
        (loc) => loc.name === location && loc.player === 1
      );

      if (!locationData) {
        return {
          passed: false,
          message: `Location not found: ${location}`,
        };
      }

      // Check actual accessibility
      const isAccessible = this.locationManager.isLocationAccessible(
        locationData,
        inventory
      );

      console.log(`${location} accessibility:`, {
        expected: expectedAccess,
        actual: isAccessible,
        requiredItems,
        excludedItems,
      });

      // Check if result matches expectation
      const passed = isAccessible === expectedAccess;
      if (!passed) {
        return {
          passed: false,
          message: `Expected: ${expectedAccess}, Got: ${isAccessible}`,
        };
      }

      // If accessibility check passed, test partial inventories if needed
      if (expectedAccess && requiredItems.length && !excludedItems.length) {
        for (const missingItem of requiredItems) {
          const partialInventory = this.createInventory(
            requiredItems.filter((item) => item !== missingItem)
          );

          const partialAccess = this.locationManager.isLocationAccessible(
            locationData,
            partialInventory
          );

          if (partialAccess) {
            return {
              passed: false,
              message: `Location accessible without required item: ${missingItem}`,
            };
          }
        }
      }

      return {
        passed: true,
        message: 'Test passed',
      };
    } catch (error) {
      console.error(`Error testing ${location}:`, error);
      return {
        passed: false,
        message: `Test error: ${error.message}`,
      };
    }
  }
}

// Initialize tests when page loads
if (typeof window !== 'undefined') {
  window.onload = async () => {
    try {
      const tester = new LocationTester();
      await tester.loadRulesData();

      const testCasesResponse = await fetch('test_cases.json');
      if (!testCasesResponse.ok) {
        throw new Error(
          `Failed to load test cases: ${testCasesResponse.status}`
        );
      }
      const testCasesData = await testCasesResponse.json();

      if (!testCasesData.location_tests) {
        throw new Error('No location_tests found in test cases file');
      }

      console.log(`Loaded ${testCasesData.location_tests.length} test cases`);
      await tester.runLocationTests(testCasesData.location_tests);
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

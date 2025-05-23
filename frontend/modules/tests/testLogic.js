// frontend/modules/tests/testLogic.js (Orchestrator)
import * as TestState from './testState.js';
import { TestController } from './testController.js';
import { stateManagerProxySingleton } from '../stateManager/index.js'; // For direct interaction if needed by orchestrator
import {
  discoverTests,
  getDiscoveredTests,
  getDiscoveredCategories,
  getDiscoveredTestFunctions,
  isDiscoveryComplete,
} from './testDiscovery.js';

let eventBusInstance = null;
let appInitializationApiInstance = null;
let discoveryInitialized = false;

// Initialize test discovery
async function initializeTestDiscovery() {
  if (discoveryInitialized) {
    return;
  }

  console.log('[TestLogic] Initializing test discovery...');
  await discoverTests();

  // Replace TestState with discovered tests and categories
  const discoveredTests = getDiscoveredTests();
  const discoveredCategories = getDiscoveredCategories();

  // Update TestState with discovered tests (if not already loaded from saved state)
  if (
    TestState.getTests().length === 0 ||
    !TestState.testLogicState.fromDiscovery
  ) {
    console.log('[TestLogic] Initializing from discovered tests...');
    TestState.testLogicState.tests = discoveredTests;
    TestState.testLogicState.categories = discoveredCategories;
    TestState.testLogicState.fromDiscovery = true;

    console.log(
      `[TestLogic] Initialized with ${discoveredTests.length} tests in ${
        Object.keys(discoveredCategories).length
      } categories`
    );
  }

  discoveryInitialized = true;
}

// --- testLogic Public API ---
export const testLogic = {
  async setInitializationApi(api) {
    appInitializationApiInstance = api;
    await initializeTestDiscovery();
  },

  async setEventBus(bus) {
    eventBusInstance = bus;
    // Ensure discovery is complete when event bus is set
    await initializeTestDiscovery();
  },

  async getTests() {
    await initializeTestDiscovery();
    return TestState.getTests();
  },

  async getSavableState() {
    await initializeTestDiscovery();
    // Combine savable parts from TestState
    return TestState.getSavableTestConfig();
  },

  async applyLoadedState(data) {
    // Ensure discovery is complete before applying loaded state
    await initializeTestDiscovery();

    // This function needs to carefully merge loaded data with discovered tests
    let autoStartChanged = false;
    const oldAutoStartValue = TestState.shouldAutoStartTests();

    if (data && typeof data.autoStartTestsOnLoad === 'boolean') {
      if (TestState.shouldAutoStartTests() !== data.autoStartTestsOnLoad) {
        TestState.setAutoStartTests(data.autoStartTestsOnLoad);
        autoStartChanged = true;
      }
    }
    if (data && typeof data.defaultEnabledState === 'boolean') {
      TestState.testLogicState.defaultEnabledState = data.defaultEnabledState;
    }

    // Categories: Merge discovered categories with loaded ones
    const discoveredCategories = getDiscoveredCategories();
    const mergedCategories = { ...discoveredCategories };

    if (data && data.categories) {
      for (const categoryName in data.categories) {
        if (Object.hasOwnProperty.call(data.categories, categoryName)) {
          const loadedCategory = data.categories[categoryName];
          if (mergedCategories[categoryName]) {
            // Update existing discovered category with loaded preferences
            mergedCategories[categoryName].isEnabled = loadedCategory.isEnabled;
            if (loadedCategory.order !== undefined) {
              mergedCategories[categoryName].order = loadedCategory.order;
            }
          } else {
            // Add new category from loaded data
            mergedCategories[categoryName] = {
              isEnabled: loadedCategory.isEnabled,
              order:
                loadedCategory.order || Object.keys(mergedCategories).length,
            };
          }
        }
      }
    }
    TestState.testLogicState.categories = mergedCategories;

    // Tests: Merge discovered tests with loaded preferences
    const discoveredTests = getDiscoveredTests();
    const currentTests = [];

    if (data && Array.isArray(data.tests)) {
      const loadedTestsMap = new Map(data.tests.map((t) => [t.id, t]));

      // Start with discovered tests and apply loaded preferences
      discoveredTests.forEach((discoveredTest) => {
        const loadedTest = loadedTestsMap.get(discoveredTest.id);
        if (loadedTest) {
          // Apply loaded preferences to discovered test
          currentTests.push({
            ...discoveredTest,
            isEnabled: loadedTest.isEnabled,
            order:
              loadedTest.order !== undefined
                ? loadedTest.order
                : discoveredTest.order,
            // Keep discovered test metadata (name, description, functionName, category)
            // But allow some overrides from loaded data if needed
          });
        } else {
          // Use discovered test as-is
          currentTests.push({ ...discoveredTest });
        }
      });

      // Add any tests from loaded data that weren't discovered (edge case)
      data.tests.forEach((loadedTest) => {
        if (!discoveredTests.find((d) => d.id === loadedTest.id)) {
          console.warn(
            `[TestLogic] Loaded test '${loadedTest.id}' not found in discovered tests`
          );
          currentTests.push({
            ...loadedTest,
            status: 'pending',
            conditions: [],
            logs: [],
            currentEventWaitingFor: null,
            category: loadedTest.category || 'Uncategorized',
          });
        }
      });
    } else {
      // No loaded data, use discovered tests as-is
      currentTests.push(...discoveredTests);
    }

    // Sort and normalize
    currentTests.sort((a, b) => {
      const catA = mergedCategories[a.category] || { order: 999 };
      const catB = mergedCategories[b.category] || { order: 999 };

      if (catA.order !== catB.order) {
        return catA.order - catB.order;
      }

      return a.order - b.order;
    });

    // Re-normalize order within categories
    const categoryCounts = {};
    currentTests.forEach((test) => {
      if (!categoryCounts[test.category]) {
        categoryCounts[test.category] = 0;
      }
      test.order = categoryCounts[test.category]++;

      // Ensure required runtime fields exist
      if (!test.logs) test.logs = [];
      if (!test.conditions) test.conditions = [];
      if (test.status === undefined) test.status = 'pending';
    });

    TestState.testLogicState.tests = currentTests;
    TestState.testLogicState.fromDiscovery = true;

    if (eventBusInstance) {
      const testsToPublish = await this.getTests();
      eventBusInstance.publish('test:listUpdated', { tests: testsToPublish });
      if (autoStartChanged) {
        eventBusInstance.publish('test:autoStartConfigChanged', {
          autoStartEnabled: TestState.shouldAutoStartTests(),
        });
      }
    }
  },

  shouldAutoStartTests() {
    return TestState.shouldAutoStartTests();
  },

  setAutoStartTests(shouldAutoStart) {
    TestState.setAutoStartTests(shouldAutoStart);
    if (eventBusInstance) {
      eventBusInstance.publish('test:autoStartConfigChanged', {
        autoStartEnabled: shouldAutoStart,
      });
    }
  },

  async toggleTestEnabled(testId, isEnabled) {
    await initializeTestDiscovery();
    TestState.toggleTestEnabled(testId, isEnabled);
    if (eventBusInstance)
      eventBusInstance.publish('test:listUpdated', {
        tests: await this.getTests(),
      });
  },

  async updateTestOrder(testId, direction) {
    await initializeTestDiscovery();
    if (TestState.updateTestOrder(testId, direction)) {
      if (eventBusInstance)
        eventBusInstance.publish('test:listUpdated', {
          tests: await this.getTests(),
        });
    }
  },

  // Methods called by TestController via callbacks
  _setTestStatus(testId, status, eventWaitingFor = null) {
    TestState.setTestStatus(testId, status, eventWaitingFor);
    if (eventBusInstance)
      eventBusInstance.publish('test:statusChanged', {
        testId,
        status,
        eventWaitingFor,
      });
  },

  _addTestCondition(testId, description, status) {
    TestState.addTestCondition(testId, description, status);
    if (eventBusInstance)
      eventBusInstance.publish('test:conditionReported', {
        testId,
        description,
        status,
      });
  },

  _emitLogMessage(testId, message, type) {
    TestState.addTestLog(testId, message, type || 'info');
    if (eventBusInstance)
      eventBusInstance.publish('test:logAdded', { testId, message, type });
  },

  _emitTestCompleted(testId, overallStatus) {
    console.log(
      `[_emitTestCompleted] CALLED with testId: ${testId}, overallStatus: ${overallStatus}`
    );
    // Finalize test status
    TestState.setTestStatus(testId, overallStatus ? 'passed' : 'failed');
    TestState.setCurrentRunningTestId(null);

    console.log(
      `[_emitTestCompleted] Updated test status to: ${
        overallStatus ? 'passed' : 'failed'
      }`
    );

    if (eventBusInstance) {
      const test = TestState.findTestById(testId);
      console.log(
        `[_emitTestCompleted] Publishing test:completed event for testId: ${testId}`
      );
      eventBusInstance.publish('test:completed', {
        testId,
        name: test ? test.name : testId,
        overallStatus: overallStatus ? 'passed' : 'failed',
        conditions: test ? test.conditions : [],
      });
      console.log(
        `[_emitTestCompleted] test:completed event published successfully`
      );
    } else {
      console.log(
        `[_emitTestCompleted] WARNING: eventBusInstance is null/undefined!`
      );
    }
  },

  async runTest(testId) {
    await initializeTestDiscovery();

    const test = TestState.findTestById(testId);
    if (!test) {
      console.error(`[TestLogic] Test with ID '${testId}' not found.`);
      return;
    }

    // Get the test function from discovered functions
    const testFunctions = getDiscoveredTestFunctions();
    const testFunction = testFunctions[test.functionName];

    if (!testFunction) {
      console.error(
        `[TestLogic] Test function '${test.functionName}' not found for test '${testId}'.`
      );
      return;
    }

    console.log(`[TestLogic] Running test: ${test.name} (${testId})`);

    TestState.setCurrentRunningTestId(testId);
    this._setTestStatus(testId, 'running');

    // Create TestController with callbacks to this orchestrator
    const testController = new TestController(
      testId,
      {
        setTestStatus: this._setTestStatus.bind(this),
        reportCondition: this._addTestCondition.bind(this),
        log: this._emitLogMessage.bind(this),
        completeTest: this._emitTestCompleted.bind(this),
      },
      eventBusInstance,
      appInitializationApiInstance
    );

    try {
      // Call the test function
      await testFunction(testController);
    } catch (error) {
      console.error(
        `[TestLogic] Test '${testId}' threw an unhandled error:`,
        error
      );
      testController.reportCondition(
        `Unhandled error: ${error.message}`,
        false
      );
      await testController.completeTest(false);
    }
  },

  async runAllEnabledTests() {
    await initializeTestDiscovery();

    const tests = TestState.getTests();
    const enabledTests = tests.filter((t) => t.isEnabled);

    if (enabledTests.length === 0) {
      console.log('[TestLogic] No enabled tests to run.');
      return;
    }

    console.log(`[TestLogic] Running ${enabledTests.length} enabled tests...`);

    if (eventBusInstance)
      eventBusInstance.publish('test:allRunsStarted', {
        testCount: enabledTests.length,
      });

    for (const test of enabledTests) {
      console.log(`[TestLogic] Starting test: ${test.name} (${test.id})`);

      // Set up completion listener BEFORE starting the test to avoid race condition
      const testCompletionPromise = new Promise((resolve) => {
        const specificEventListener = (eventData) => {
          if (eventData.testId === test.id) {
            eventBusInstance.unsubscribe(
              'test:completed',
              specificEventListener
            );
            resolve();
          }
        };
        eventBusInstance.subscribe('test:completed', specificEventListener);
      });

      // Start the test
      await this.runTest(test.id);

      // Wait for test completion
      await testCompletionPromise;

      console.log(`[TestLogic] Completed test: ${test.name} (${test.id})`);
    }

    // Emit summary event
    const finalTests = TestState.getTests();
    const summary = {
      totalRun: enabledTests.length,
      passedCount: finalTests.filter(
        (t) => enabledTests.some((e) => e.id === t.id) && t.status === 'passed'
      ).length,
      failedCount: finalTests.filter(
        (t) => enabledTests.some((e) => e.id === t.id) && t.status === 'failed'
      ).length,
    };

    console.log('[TestLogic] All enabled tests completed:', summary);

    if (eventBusInstance)
      eventBusInstance.publish('test:allRunsCompleted', { summary });
  },

  async getCategories() {
    await initializeTestDiscovery();
    return TestState.getCategories();
  },

  isCategoryEnabled(categoryName) {
    return TestState.getCategoryState(categoryName)?.isEnabled || false;
  },

  toggleCategoryEnabled(categoryName, isEnabled) {
    TestState.toggleCategoryEnabled(categoryName, isEnabled);
    if (eventBusInstance)
      eventBusInstance.publish('test:categoryChanged', {
        categoryName,
        isEnabled,
      });
  },

  updateCategoryOrder(categoryName, direction) {
    if (TestState.updateCategoryOrder(categoryName, direction)) {
      if (eventBusInstance)
        eventBusInstance.publish('test:categoriesUpdated', {
          categories: TestState.getCategories(),
        });
    }
  },
};

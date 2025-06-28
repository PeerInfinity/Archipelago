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

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testLogic', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testLogic] ${message}`, ...data);
  }
}

let eventBusInstance = null;
let appInitializationApiInstance = null;
let discoveryInitialized = false;
let loadedStateApplied = false;
let loadedAutoStartSetting = null; // Store the loaded auto-start setting persistently

// Add debugging for state changes
function setLoadedStateApplied(value) {
  log(
    'info',
    `[TestLogic] Setting loadedStateApplied from ${loadedStateApplied} to ${value}`
  );
  console.trace('[TestLogic] Call stack for loadedStateApplied change:');
  loadedStateApplied = value;
}

// Initialize test discovery
async function initializeTestDiscovery() {
  if (discoveryInitialized) {
    log('info', '[TestLogic] Test discovery already initialized, skipping.');
    return;
  }

  log('info', '[TestLogic] Initializing test discovery...');
  await discoverTests();

  // Replace TestState with discovered tests and categories
  const discoveredTests = getDiscoveredTests();
  const discoveredCategories = getDiscoveredCategories();

  // Update TestState with discovered tests (if not already loaded from saved state)
  if (
    TestState.getTests().length === 0 ||
    !TestState.testLogicState.fromDiscovery
  ) {
    log('info', '[TestLogic] Initializing from discovered tests...');
    log(
      'info',
      '[TestLogic] Before init - autoStartTestsOnLoad:',
      TestState.testLogicState.autoStartTestsOnLoad
    );
    log('info', '[TestLogic] loadedStateApplied flag:', loadedStateApplied);

    // Determine which auto-start setting to use
    let autoStartSettingToUse = null;

    if (loadedAutoStartSetting !== null) {
      // We have a loaded setting from applyLoadedState - always use this
      autoStartSettingToUse = loadedAutoStartSetting;
      log(
        'info',
        '[TestLogic] Using loaded auto-start setting:',
        autoStartSettingToUse
      );
    } else {
      // No loaded setting yet - preserve the current default
      autoStartSettingToUse = TestState.testLogicState.autoStartTestsOnLoad;
      log(
        'info',
        '[TestLogic] No loaded setting - using current default:',
        autoStartSettingToUse
      );
    }

    TestState.testLogicState.tests = discoveredTests;
    TestState.testLogicState.categories = discoveredCategories;
    TestState.testLogicState.fromDiscovery = true;

    // Apply the determined auto-start setting
    TestState.testLogicState.autoStartTestsOnLoad = autoStartSettingToUse;
    log(
      'info',
      '[TestLogic] Set autoStartTestsOnLoad to:',
      TestState.testLogicState.autoStartTestsOnLoad
    );

    log(
      'info',
      `[TestLogic] Initialized with ${discoveredTests.length} tests in ${
        Object.keys(discoveredCategories).length
      } categories`
    );

    // Only mark discovery as initialized after the state has been fully set up
    discoveryInitialized = true;
    log(
      'info',
      '[TestLogic] Discovery initialization completed and flag set to true'
    );
  } else {
    log(
      'info',
      '[TestLogic] Test discovery already completed, state already exists'
    );
  }
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

    // Check if auto-start is enabled and start tests if so
    log('info', '[TestLogic] EventBus set, checking auto-start...');
    // Only auto-start from here if loaded state has already been applied.
    // Otherwise, applyLoadedState will handle the auto-start.
    if (loadedStateApplied) {
      const shouldAutoStart = TestState.shouldAutoStartTests();
      log(
        'info',
        `[TestLogic] Auto-start enabled: ${shouldAutoStart} (loadedStateApplied: true)`
      );

      if (shouldAutoStart) {
        log(
          'info',
          '[TestLogic] Auto-starting tests (from setEventBus after loaded state applied)...'
        );
        setTimeout(() => {
          this.runAllEnabledTests().catch((error) => {
            log(
              'error',
              '[TestLogic] Error during auto-start (from setEventBus):',
              error
            );
          });
        }, 1000); // Give some time for full initialization
      } else {
        log(
          'info',
          '[TestLogic] Auto-start not enabled (from setEventBus after loaded state applied), not starting tests automatically'
        );
      }
    } else {
      log(
        'info',
        '[TestLogic] Deferring auto-start check to applyLoadedState as loadedStateApplied is false.'
      );
    }
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
    log('info', '[TestLogic applyLoadedState] Called with data:', data);

    // Store the autoStartTestsOnLoad value BEFORE calling initializeTestDiscovery
    let autoStartToApply = false;
    if (data && typeof data.autoStartTestsOnLoad === 'boolean') {
      autoStartToApply = data.autoStartTestsOnLoad;
      log(
        'info',
        '[TestLogic applyLoadedState] autoStartToApply:',
        autoStartToApply
      );
    }

    // Ensure discovery is complete before applying loaded state
    await initializeTestDiscovery();

    // Apply the auto-start setting AFTER discovery initialization
    let autoStartChanged = false;
    const oldAutoStartValue = TestState.shouldAutoStartTests();
    log(
      'info',
      '[TestLogic applyLoadedState] oldAutoStartValue after discovery:',
      oldAutoStartValue
    );

    if (autoStartToApply !== oldAutoStartValue) {
      TestState.setAutoStartTests(autoStartToApply);
      autoStartChanged = true;
      log(
        'info',
        '[TestLogic applyLoadedState] Set autoStartTests to:',
        autoStartToApply
      );
    }

    // Store the loaded auto-start setting persistently
    loadedAutoStartSetting = autoStartToApply;
    log(
      'info',
      '[TestLogic applyLoadedState] Stored loadedAutoStartSetting:',
      loadedAutoStartSetting
    );
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
          log(
            'warn',
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

    log(
      'info',
      '[TestLogic applyLoadedState] Final autoStartTestsOnLoad:',
      TestState.shouldAutoStartTests()
    );

    // Mark that loaded state has been applied to prevent future initializeTestDiscovery calls from overwriting it
    setLoadedStateApplied(true);
    log(
      'info',
      '[TestLogic applyLoadedState] Set loadedStateApplied flag to true'
    );

    // Publish event to notify that loaded state is fully applied
    if (eventBusInstance) {
      eventBusInstance.publish('test:loadedStateApplied', {
        autoStartEnabled: TestState.shouldAutoStartTests(),
        testCount: currentTests.length,
        enabledTestCount: currentTests.filter((t) => t.isEnabled).length,
      });
    }

    // Check if we should auto-start tests now that loaded state is fully applied
    if (TestState.shouldAutoStartTests()) {
      log(
        'info',
        '[TestLogic applyLoadedState] Auto-start is enabled, triggering auto-start...'
      );

      // Use setTimeout to ensure this happens after the current call stack completes
      setTimeout(async () => {
        try {
          log(
            'info',
            '[TestLogic applyLoadedState] Running auto-start tests...'
          );
          await this.runAllEnabledTests();
        } catch (error) {
          log(
            'error',
            '[TestLogic applyLoadedState] Error during auto-start:',
            error
          );
        }
      }, 100);
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
    log(
      'info',
      `[_emitTestCompleted] CALLED with testId: ${testId}, overallStatus: ${overallStatus}`
    );
    // Finalize test status
    TestState.setTestStatus(testId, overallStatus ? 'passed' : 'failed');
    TestState.setCurrentRunningTestId(null);

    log(
      'info',
      `[_emitTestCompleted] Updated test status to: ${
        overallStatus ? 'passed' : 'failed'
      }`
    );

    if (eventBusInstance) {
      const test = TestState.findTestById(testId);
      log(
        'info',
        `[_emitTestCompleted] Publishing test:completed event for testId: ${testId}`
      );
      eventBusInstance.publish('test:completed', {
        testId,
        name: test ? test.name : testId,
        overallStatus: overallStatus ? 'passed' : 'failed',
        conditions: test ? test.conditions : [],
      });
      log(
        'info',
        `[_emitTestCompleted] test:completed event published successfully`
      );
    } else {
      log(
        'info',
        `[_emitTestCompleted] WARNING: eventBusInstance is null/undefined!`
      );
    }

    // Check if this might be the final test completion for Playwright
    // If no other tests are running and we're in test mode, set completion flags
    setTimeout(() => {
      const currentRunningTestId = TestState.getCurrentRunningTestId();
      if (!currentRunningTestId) {
        // No test is currently running, this might be the final completion
        log(
          'info',
          '[_emitTestCompleted] No tests running, checking if we should set Playwright flags...'
        );

        // Check if we're in test mode (URL contains mode=test or autostart is enabled)
        const urlParams = new URLSearchParams(window.location.search);
        const isTestMode =
          urlParams.get('mode') === 'test' || TestState.shouldAutoStartTests();

        if (isTestMode) {
          log(
            'info',
            '[_emitTestCompleted] Test mode detected, setting Playwright completion flags...'
          );

          const allTests = TestState.getTests();
          const completedTests = allTests.filter(
            (t) => t.status === 'passed' || t.status === 'failed'
          );

          const summary = {
            totalRun: completedTests.length,
            passedCount: allTests.filter((t) => t.status === 'passed').length,
            failedCount: allTests.filter((t) => t.status === 'failed').length,
          };

          this._setPlaywrightCompletionFlags(summary, allTests);
        }
      }
    }, 100); // Small delay to ensure state is fully updated
  },

  async runTest(testId) {
    await initializeTestDiscovery();

    const test = TestState.findTestById(testId);
    if (!test) {
      log('error', `[TestLogic] Test with ID '${testId}' not found.`);
      return;
    }

    // Get the test function from discovered functions
    const testFunctions = getDiscoveredTestFunctions();
    const testFunction = testFunctions[test.functionName];

    if (!testFunction) {
      log(
        'error',
        `[TestLogic] Test function '${test.functionName}' not found for test '${testId}'.`
      );
      return;
    }

    log('info', `[TestLogic] Running test: ${test.name} (${testId})`);

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
      const testResult = await testFunction(testController);

      // If the test function returned a boolean, automatically complete the test
      if (typeof testResult === 'boolean') {
        log(
          'info',
          `[TestLogic] Test '${testId}' returned ${testResult}, auto-completing...`
        );
        await testController.completeTest(testResult);
      }
    } catch (error) {
      log(
        'error',
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
      log('info', '[TestLogic] No enabled tests to run.');
      return;
    }

    log('info', `[TestLogic] Running ${enabledTests.length} enabled tests...`);

    if (eventBusInstance)
      eventBusInstance.publish('test:allRunsStarted', {
        testCount: enabledTests.length,
      });

    for (const test of enabledTests) {
      log('info', `[TestLogic] Starting test: ${test.name} (${test.id})`);

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

      log('info', `[TestLogic] Completed test: ${test.name} (${test.id})`);
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

    log('info', '[TestLogic] All enabled tests completed:', summary);

    if (eventBusInstance)
      eventBusInstance.publish('test:allRunsCompleted', { summary });

    // Set Playwright completion flags for automated testing
    this._setPlaywrightCompletionFlags(summary, finalTests);
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

  async toggleAllCategoriesEnabled(isEnabled) {
    await initializeTestDiscovery();
    const categories = TestState.getCategories();

    // Enable/disable all categories
    categories.forEach((category) => {
      TestState.toggleCategoryEnabled(category, isEnabled);
    });

    if (eventBusInstance) {
      eventBusInstance.publish('test:allCategoriesChanged', {
        isEnabled,
        categories,
      });
    }
  },

  async getAllCategoriesState() {
    await initializeTestDiscovery();
    const categories = TestState.getCategories();

    if (categories.length === 0) {
      return { allEnabled: false, anyEnabled: false };
    }

    const tests = TestState.getTests();
    let allCategoriesFullyEnabled = true;
    let anyCategoryHasEnabledTests = false;
    let anyCategoryIndeterminate = false;

    // Check each category's state
    categories.forEach((category) => {
      const testsInCategory = tests.filter(
        (test) => test.category === category
      );
      if (testsInCategory.length === 0) return;

      const enabledTestsInCategory = testsInCategory.filter(
        (test) => test.isEnabled
      );
      const allEnabledInCategory =
        enabledTestsInCategory.length === testsInCategory.length;
      const anyEnabledInCategory = enabledTestsInCategory.length > 0;

      if (!allEnabledInCategory) {
        allCategoriesFullyEnabled = false;
      }

      if (anyEnabledInCategory) {
        anyCategoryHasEnabledTests = true;
      }

      // Category is indeterminate if some but not all tests are enabled
      if (anyEnabledInCategory && !allEnabledInCategory) {
        anyCategoryIndeterminate = true;
      }
    });

    return {
      allEnabled: allCategoriesFullyEnabled,
      anyEnabled: anyCategoryHasEnabledTests,
      anyIndeterminate: anyCategoryIndeterminate,
    };
  },

  // Set localStorage flags for Playwright test completion detection
  _setPlaywrightCompletionFlags(summary, allTests) {
    try {
      // Prepare detailed test results for Playwright
      const testDetails = allTests.map((test) => ({
        id: test.id,
        name: test.name,
        status: test.status,
        category: test.category,
        conditions: test.conditions || [],
        logs: test.logs || [],
      }));

      const playwrightResults = {
        summary,
        testDetails,
        completedAt: new Date().toISOString(),
      };

      // Set the results in localStorage
      localStorage.setItem(
        '__playwrightTestResults__',
        JSON.stringify(playwrightResults)
      );

      // Set the completion flag
      localStorage.setItem('__playwrightTestsComplete__', 'true');

      log('info', '[TestLogic] Playwright completion flags set:', {
        summary,
        testCount: testDetails.length,
      });
    } catch (error) {
      log(
        'error',
        '[TestLogic] Error setting Playwright completion flags:',
        error
      );
    }
  },
};

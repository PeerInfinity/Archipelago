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
  //console.trace('[TestLogic] Call stack for loadedStateApplied change:');
  loadedStateApplied = value;
}

// Initialize test discovery
async function initializeTestDiscovery() {
  if (discoveryInitialized) {
    log('info', '[TestLogic] Test discovery already initialized, skipping.');
    return;
  }

  log('info', '[TestLogic] Initializing test discovery...');
  
  try {
    // Add timeout to test discovery to prevent infinite waiting
    const discoveryPromise = discoverTests();
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Test discovery timeout after 10 seconds')), 10000);
    });
    
    await Promise.race([discoveryPromise, timeoutPromise]);
  } catch (error) {
    log('error', '[TestLogic] Test discovery failed:', error);
    
    // Set basic test state even if discovery fails
    TestState.testLogicState.tests = [];
    TestState.testLogicState.categories = {};
    TestState.testLogicState.fromDiscovery = true;
    discoveryInitialized = true;
    
    // Set Playwright completion flags immediately if we're in test mode
    const urlParams = new URLSearchParams(window.location.search);
    const isTestMode = urlParams.get('mode') === 'test' || TestState.shouldAutoStartTests();
    
    if (isTestMode) {
      log('info', '[TestLogic] Test mode detected but discovery failed, setting completion flags...');
      const summary = {
        totalRun: 0,
        passedCount: 0,
        failedCount: 0,
        failedConditionsCount: 0,
        error: error.message
      };
      
      testLogic._setPlaywrightCompletionFlags(summary, []);
    }
    
    return;
  }

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
          // Add timeout to auto-start to prevent infinite waiting
          Promise.race([
            this.runAllEnabledTests(),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Auto-start timeout after 30 seconds')), 30000);
            })
          ]).catch((error) => {
            log(
              'error',
              '[TestLogic] Error during auto-start (from setEventBus):',
              error
            );
            
            // Set completion flags even if auto-start fails
            const summary = {
              totalRun: 0,
              passedCount: 0,
              failedCount: 0,
              failedConditionsCount: 0,
              error: error.message
            };
            this._setPlaywrightCompletionFlags(summary, TestState.getTests());
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
    
    // Store the hideDisabledTests value
    let hideDisabledToApply = false;
    if (data && typeof data.hideDisabledTests === 'boolean') {
      hideDisabledToApply = data.hideDisabledTests;
      log(
        'info',
        '[TestLogic applyLoadedState] hideDisabledToApply:',
        hideDisabledToApply
      );
    }
    
    // Store the randomizeOrder value
    let randomizeOrderToApply = false;
    if (data && typeof data.randomizeOrder === 'boolean') {
      randomizeOrderToApply = data.randomizeOrder;
      log(
        'info',
        '[TestLogic applyLoadedState] randomizeOrderToApply:',
        randomizeOrderToApply
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
    
    // Apply the hideDisabledTests setting
    let hideDisabledChanged = false;
    const oldHideDisabledValue = TestState.shouldHideDisabledTests();
    log(
      'info',
      '[TestLogic applyLoadedState] oldHideDisabledValue after discovery:',
      oldHideDisabledValue
    );
    if (hideDisabledToApply !== oldHideDisabledValue) {
      TestState.setHideDisabledTests(hideDisabledToApply);
      hideDisabledChanged = true;
      log(
        'info',
        '[TestLogic applyLoadedState] Set hideDisabledTests to:',
        hideDisabledToApply
      );
    }
    
    // Apply the randomizeOrder setting
    let randomizeOrderChanged = false;
    const oldRandomizeOrderValue = TestState.shouldRandomizeOrder();
    log(
      'info',
      '[TestLogic applyLoadedState] oldRandomizeOrderValue after discovery:',
      oldRandomizeOrderValue
    );
    if (randomizeOrderToApply !== oldRandomizeOrderValue) {
      TestState.setRandomizeOrder(randomizeOrderToApply);
      randomizeOrderChanged = true;
      log(
        'info',
        '[TestLogic applyLoadedState] Set randomizeOrder to:',
        randomizeOrderToApply
      );
    }
    if (data && typeof data.defaultEnabledState === 'boolean') {
      TestState.testLogicState.defaultEnabledState = data.defaultEnabledState;
    }

    // No category merging needed in flat structure

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
          // Use discovered test but only apply defaultEnabledState if test has no explicit enabled value
          const finalEnabledState = discoveredTest.isEnabled !== undefined 
            ? discoveredTest.isEnabled  // Use explicit value from registration
            : TestState.testLogicState.defaultEnabledState;  // Use default only if no explicit value
          
          currentTests.push({ 
            ...discoveredTest,
            isEnabled: finalEnabledState
          });
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
      // No loaded data, use discovered tests but only apply defaultEnabledState if test has no explicit enabled value
      discoveredTests.forEach((discoveredTest) => {
        const finalEnabledState = discoveredTest.isEnabled !== undefined 
          ? discoveredTest.isEnabled  // Use explicit value from registration
          : TestState.testLogicState.defaultEnabledState;  // Use default only if no explicit value
        
        currentTests.push({ 
          ...discoveredTest,
          isEnabled: finalEnabledState
        });
      });
    }

    // Sort by order
    currentTests.sort((a, b) => a.order - b.order);

    // Ensure required runtime fields exist
    currentTests.forEach((test) => {
      if (!test.logs) test.logs = [];
      if (!test.conditions) test.conditions = [];
      if (test.status === undefined) test.status = 'pending';
    });

    TestState.testLogicState.tests = currentTests;
    TestState.testLogicState.fromDiscovery = true;

    if (eventBusInstance) {
      const testsToPublish = await this.getTests();
      eventBusInstance.publish('tests:listUpdated', { tests: testsToPublish }, 'tests');
      if (autoStartChanged) {
        eventBusInstance.publish('tests:autoStartConfigChanged', {
          autoStartEnabled: TestState.shouldAutoStartTests(),
        }, 'tests');
      }
      if (hideDisabledChanged) {
        eventBusInstance.publish('tests:hideDisabledConfigChanged', {
          hideDisabledEnabled: TestState.shouldHideDisabledTests(),
        }, 'tests');
      }
      if (randomizeOrderChanged) {
        eventBusInstance.publish('tests:randomizeOrderConfigChanged', {
          randomizeOrderEnabled: TestState.shouldRandomizeOrder(),
        }, 'tests');
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
      eventBusInstance.publish('tests:loadedStateApplied', {
        autoStartEnabled: TestState.shouldAutoStartTests(),
        testCount: currentTests.length,
        enabledTestCount: currentTests.filter((t) => t.isEnabled).length,
      }, 'tests');
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
          
          // Add timeout to auto-start to prevent infinite waiting
          // Increased timeout to accommodate many enabled tests
          await Promise.race([
            this.runAllEnabledTests(),
            new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Auto-start timeout after 120 seconds')), 120000);
            })
          ]);
        } catch (error) {
          log(
            'error',
            '[TestLogic applyLoadedState] Error during auto-start:',
            error
          );
          
          // Set completion flags even if auto-start fails, but use actual test results
          const tests = TestState.getTests();
          const completedTests = tests.filter(test => test.status === 'passed' || test.status === 'failed');
          const passedTests = tests.filter(test => test.status === 'passed');
          const failedTests = tests.filter(test => test.status === 'failed');
          const failedConditions = failedTests.reduce((total, test) => {
            return total + (test.conditions ? test.conditions.filter(c => c.status === 'failed').length : 0);
          }, 0);
          
          const summary = {
            totalRun: completedTests.length,
            passedCount: passedTests.length,
            failedCount: failedTests.length,
            failedConditionsCount: failedConditions,
            error: error.message
          };
          this._setPlaywrightCompletionFlags(summary, tests);
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
      eventBusInstance.publish('tests:autoStartConfigChanged', {
        autoStartEnabled: shouldAutoStart,
      }, 'tests');
    }
  },
  shouldHideDisabledTests() {
    return TestState.shouldHideDisabledTests();
  },
  setHideDisabledTests(shouldHide) {
    TestState.setHideDisabledTests(shouldHide);
    if (eventBusInstance) {
      eventBusInstance.publish('tests:hideDisabledConfigChanged', {
        hideDisabledEnabled: shouldHide,
      }, 'tests');
    }
  },

  shouldRandomizeOrder() {
    return TestState.shouldRandomizeOrder();
  },

  setRandomizeOrder(shouldRandomize) {
    TestState.setRandomizeOrder(shouldRandomize);
    if (eventBusInstance) {
      eventBusInstance.publish('tests:randomizeOrderConfigChanged', {
        randomizeOrderEnabled: shouldRandomize,
      }, 'tests');
    }
  },

  async toggleTestEnabled(testId, isEnabled) {
    await initializeTestDiscovery();
    TestState.toggleTestEnabled(testId, isEnabled);
    if (eventBusInstance)
      eventBusInstance.publish('tests:listUpdated', {
        tests: await this.getTests(),
      }, 'tests');
  },

  async updateTestOrder(testId, direction) {
    await initializeTestDiscovery();
    if (TestState.updateTestOrder(testId, direction)) {
      if (eventBusInstance)
        eventBusInstance.publish('tests:listUpdated', {
          tests: await this.getTests(),
        }, 'tests');
    }
  },

  // Methods called by TestController via callbacks
  _setTestStatus(testId, status, eventWaitingFor = null) {
    // Check if this test has already completed - prevent status changes after completion
    // EXCEPT when starting a new test run (status = 'running') which is allowed for re-runs
    const test = TestState.findTestById(testId);
    const currentRunningTestId = TestState.getCurrentRunningTestId();
    
    
    if (test && (test.status === 'passed' || test.status === 'failed') && status !== 'running') {
      log('warn', `[TestLogic] Ignoring status change to '${status}' for completed test '${testId}' (current status: ${test.status}), currentRunning: ${currentRunningTestId}`);
      return;
    }
    
    TestState.setTestStatus(testId, status, eventWaitingFor);
    if (eventBusInstance)
      eventBusInstance.publish('tests:statusChanged', {
        testId,
        status,
        eventWaitingFor,
      }, 'tests');
  },

  _addTestCondition(testId, description, status) {
    // Allow condition additions if:
    // 1. Test is not completed, OR
    // 2. Test is currently running (being re-run), OR  
    // 3. Any test is currently running (during a test run)
    const test = TestState.findTestById(testId);
    const currentRunningTestId = TestState.getCurrentRunningTestId();
    
    if (test && (test.status === 'passed' || test.status === 'failed') && 
        testId !== currentRunningTestId && !currentRunningTestId) {
      log('warn', `[TestLogic] Ignoring condition addition for completed test '${testId}' (current status: ${test.status}): ${description}`);
      return;
    }
    
    TestState.addTestCondition(testId, description, status);
    if (eventBusInstance)
      eventBusInstance.publish('tests:conditionReported', {
        testId,
        description,
        status,
      }, 'tests');
  },

  _emitLogMessage(testId, message, type) {
    // Allow log additions if:
    // 1. Test is not completed, OR
    // 2. Test is currently running (being re-run), OR  
    // 3. Any test is currently running (during a test run), OR
    // 4. It's an error/warn level message
    const test = TestState.findTestById(testId);
    const currentRunningTestId = TestState.getCurrentRunningTestId();
    
    if (test && (test.status === 'passed' || test.status === 'failed') && 
        testId !== currentRunningTestId && !currentRunningTestId &&
        type !== 'error' && type !== 'warn' && type !== 'debug') {
      log('info', `[TestLogic] Ignoring log addition for completed test '${testId}' (current status: ${test.status}): ${message}`);
      return;
    }
    
    TestState.addTestLog(testId, message, type || 'info');
    if (eventBusInstance)
      eventBusInstance.publish('tests:logAdded', { testId, message, type }, 'tests');
  },

  _emitTestCompleted(testId, overallStatus) {
    log(
      'info',
      `[_emitTestCompleted] CALLED with testId: ${testId}, overallStatus: ${overallStatus}`
    );
    
    // Check if any conditions failed and override overallStatus if needed
    const test = TestState.findTestById(testId);
    let finalStatus = overallStatus;
    
    if (test && test.conditions && Array.isArray(test.conditions)) {
      const failedConditions = test.conditions.filter(condition => condition.status === 'failed');
      if (failedConditions.length > 0) {
        log(
          'info',
          `[_emitTestCompleted] Found ${failedConditions.length} failed conditions, overriding overallStatus from ${overallStatus} to false`
        );
        finalStatus = false;
      }
    }
    
    // Finalize test status
    TestState.setTestStatus(testId, finalStatus ? 'passed' : 'failed');
    TestState.setCurrentRunningTestId(null);

    log(
      'info',
      `[_emitTestCompleted] Updated test status to: ${
        finalStatus ? 'passed' : 'failed'
      }`
    );

    if (eventBusInstance) {
      const test = TestState.findTestById(testId);
      log(
        'info',
        `[_emitTestCompleted] Publishing test:completed event for testId: ${testId}`
      );
      eventBusInstance.publish('tests:completed', {
        testId,
        name: test ? test.name : testId,
        overallStatus: finalStatus ? 'passed' : 'failed',
        conditions: test ? test.conditions : [],
      }, 'tests');
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
    } finally {
      // Ensure cleanup happens even if completeTest wasn't called
      if (testController && typeof testController._cleanupAllEventListeners === 'function') {
        testController._cleanupAllEventListeners();
      }
    }
  },

  async runAllEnabledTests() {
    await initializeTestDiscovery();

    const tests = TestState.getTestsForExecution();
    const enabledTests = tests.filter((t) => t.isEnabled);

    if (enabledTests.length === 0) {
      log('info', '[TestLogic] No enabled tests to run.');
      
      // Still need to emit completion events and set Playwright flags
      const summary = {
        totalRun: 0,
        passedCount: 0,
        failedCount: 0,
        failedConditionsCount: 0,
      };

      if (eventBusInstance) {
        eventBusInstance.publish('tests:allRunsStarted', {
          testCount: 0,
        }, 'tests');
        eventBusInstance.publish('tests:allRunsCompleted', { summary }, 'tests');
      }

      // Set Playwright completion flags even when no tests run
      this._setPlaywrightCompletionFlags(summary, tests);
      return;
    }

    log('info', `[TestLogic] Running ${enabledTests.length} enabled tests...`);
    if (TestState.shouldRandomizeOrder()) {
      log('info', '[TestLogic] Test order randomization is enabled - tests will run in random order');
    }

    if (eventBusInstance)
      eventBusInstance.publish('tests:allRunsStarted', {
        testCount: enabledTests.length,
      }, 'tests');

    for (const test of enabledTests) {
      log('info', `[TestLogic] Starting test: ${test.name} (${test.id})`);

      // Set up completion listener BEFORE starting the test to avoid race condition
      const testCompletionPromise = new Promise((resolve) => {
        const specificEventListener = (eventData) => {
          if (eventData.testId === test.id) {
            eventBusInstance.unsubscribe(
              'tests:completed',
              specificEventListener
            );
            resolve();
          }
        };
        eventBusInstance.subscribe('tests:completed', specificEventListener, 'tests');
      });

      // Start the test
      await this.runTest(test.id);

      // Wait for test completion
      await testCompletionPromise;

      log('info', `[TestLogic] Completed test: ${test.name} (${test.id})`);
    }

    // Emit summary event
    const finalTests = TestState.getTests();
    const ranTests = finalTests.filter(t => enabledTests.some(e => e.id === t.id));
    
    // Count failed conditions (subtests)
    const failedConditionsCount = ranTests.reduce((total, test) => {
      if (test.conditions && Array.isArray(test.conditions)) {
        return total + test.conditions.filter(cond => cond.status === 'failed').length;
      }
      return total;
    }, 0);
    
    const summary = {
      totalRun: enabledTests.length,
      passedCount: finalTests.filter(
        (t) => enabledTests.some((e) => e.id === t.id) && t.status === 'passed'
      ).length,
      failedCount: finalTests.filter(
        (t) => enabledTests.some((e) => e.id === t.id) && t.status === 'failed'
      ).length,
      failedConditionsCount: failedConditionsCount,
    };

    log('info', '[TestLogic] All enabled tests completed:', summary);

    if (eventBusInstance)
      eventBusInstance.publish('tests:allRunsCompleted', { summary }, 'tests');

    // Set Playwright completion flags for automated testing
    this._setPlaywrightCompletionFlags(summary, finalTests);
  },

  async toggleAllTestsEnabled(isEnabled) {
    await initializeTestDiscovery();
    const tests = TestState.getTests();

    // Enable/disable all tests
    tests.forEach((test) => {
      TestState.toggleTestEnabled(test.id, isEnabled);
    });

    if (eventBusInstance) {
      eventBusInstance.publish('tests:allTestsChanged', {
        isEnabled,
        testCount: tests.length,
      }, 'tests');
    }
  },

  // Set localStorage flags for Playwright test completion detection
  _setPlaywrightCompletionFlags(summary, allTests) {
    try {
      // Prepare detailed test results for Playwright - only include enabled tests
      const testDetails = allTests
        .filter((test) => test.status !== 'disabled')
        .map((test) => ({
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

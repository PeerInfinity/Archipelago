// frontend/modules/tests/testState.js

// Holds the core state for the testing module.
// Functions here are simple accessors or direct mutators of this state.

export const testLogicState = {
  tests: [], // Initialize as empty; will be populated by testDiscovery and testLogic
  autoStartTestsOnLoad: false,
  hideDisabledTests: false, // Default to false - show all tests
  defaultEnabledState: false, // Default for newly discovered tests
  currentRunningTestId: null,
  fromDiscovery: false, // Flag to indicate if state was initialized from discovery
};

export function getTests() {
  return [...testLogicState.tests.sort((a, b) => a.order - b.order)];
}

// Function to get unique categories for display purposes (no ordering or enabling logic)
export function getUniqueCategories() {
  const categories = new Set();
  testLogicState.tests.forEach((test) => {
    if (test.category) {
      categories.add(test.category);
    }
  });
  return Array.from(categories).sort();
}

export function findTestById(testId) {
  return testLogicState.tests.find((t) => t.id === testId);
}

export function getSavableTestConfig() {
  return {
    autoStartTestsOnLoad: testLogicState.autoStartTestsOnLoad,
    hideDisabledTests: testLogicState.hideDisabledTests,
    defaultEnabledState: testLogicState.defaultEnabledState,
    tests: testLogicState.tests.map((t) => ({
      // Save only config, not runtime state
      id: t.id,
      name: t.name,
      description: t.description,
      functionName: t.functionName,
      isEnabled: t.isEnabled,
      order: t.order,
      category: t.category,
    })),
  };
}

export function setAutoStartTests(shouldAutoStart) {
  if (typeof shouldAutoStart === 'boolean') {
    testLogicState.autoStartTestsOnLoad = shouldAutoStart;
  }
}

export function shouldAutoStartTests() {
  return testLogicState.autoStartTestsOnLoad;
}

export function setHideDisabledTests(shouldHide) {
  if (typeof shouldHide === 'boolean') {
    testLogicState.hideDisabledTests = shouldHide;
  }
}

export function shouldHideDisabledTests() {
  return testLogicState.hideDisabledTests;
}

export function toggleTestEnabled(testId, isEnabled) {
  const test = findTestById(testId);
  if (test) {
    test.isEnabled = isEnabled;
    // Update status based on enabled state, but preserve completed test results
    if (
      test.status !== 'passed' &&
      test.status !== 'failed' &&
      test.status !== 'running'
    ) {
      test.status = isEnabled ? 'pending' : 'disabled';
    }
  }
}

export function updateTestOrder(testId, direction) {
  const tests = testLogicState.tests;
  const testIndex = tests.findIndex((t) => t.id === testId);
  if (testIndex === -1) return false;

  // Sort tests by order to get the current position
  const sortedTests = [...tests].sort((a, b) => a.order - b.order);
  const currentIndex = sortedTests.findIndex((t) => t.id === testId);
  if (currentIndex === -1) return false;

  let targetIndex = -1;
  if (direction === 'up' && currentIndex > 0) {
    targetIndex = currentIndex - 1;
  } else if (direction === 'down' && currentIndex < sortedTests.length - 1) {
    targetIndex = currentIndex + 1;
  } else {
    return false; // No change possible
  }

  // Swap order properties between the two tests
  const currentTestObj = sortedTests[currentIndex];
  const targetTestObj = sortedTests[targetIndex];

  [currentTestObj.order, targetTestObj.order] = [
    targetTestObj.order,
    currentTestObj.order,
  ];

  return true;
}

export function setTestStatus(testId, status, eventWaitingFor = null) {
  const test = findTestById(testId);
  if (test) {
    const previousStatus = test.status;
    test.status = status;
    test.currentEventWaitingFor =
      status === 'waiting_for_event' ? eventWaitingFor : null;
    
    // Only clear conditions when starting fresh (transitioning from non-active or completed states to running)
    if (status === 'running' && (previousStatus === 'pending' || previousStatus === 'disabled' || previousStatus === 'passed' || previousStatus === 'failed' || !previousStatus)) {
      test.conditions = []; // Clear conditions
      test.logs = []; // Clear logs
    }
    // Also clear when explicitly set to pending (test reset)
    if (status === 'pending') {
      test.conditions = []; // Clear conditions  
      test.logs = []; // Clear logs
    }
  }
}

export function addTestCondition(testId, description, status) {
  const test = findTestById(testId);
  if (test) {
    if (!test.conditions) test.conditions = [];
    test.conditions.push({
      description,
      status,
      timestamp: new Date().toISOString(),
    });
  }
}

export function addTestLog(testId, message, type) {
  const test = findTestById(testId);
  if (test) {
    if (!test.logs) test.logs = [];
    test.logs.push({ message, type, timestamp: new Date().toISOString() });
  }
}

export function setCurrentRunningTestId(testId) {
  testLogicState.currentRunningTestId = testId;
}

export function getCurrentRunningTestId() {
  return testLogicState.currentRunningTestId;
}

// Function to check for duplicate order values and warn

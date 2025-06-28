// frontend/modules/tests/testState.js

// Holds the core state for the testing module.
// Functions here are simple accessors or direct mutators of this state.

export const testLogicState = {
  tests: [], // Initialize as empty; will be populated by testDiscovery and testLogic
  autoStartTestsOnLoad: false,
  defaultEnabledState: false, // Default for newly discovered tests or categories
  currentRunningTestId: null,
  categories: {
    // Initialize with a base or empty; will be populated by testRegistry and testLogic
    Uncategorized: { isEnabled: true, order: 999 },
  },
  fromDiscovery: false, // Flag to indicate if state was initialized from discovery
};

export function getTests() {
  return [...testLogicState.tests.sort((a, b) => a.order - b.order)];
}

export function findTestById(testId) {
  return testLogicState.tests.find((t) => t.id === testId);
}

export function getSavableTestConfig() {
  return {
    autoStartTestsOnLoad: testLogicState.autoStartTestsOnLoad,
    defaultEnabledState: testLogicState.defaultEnabledState,
    categories: JSON.parse(JSON.stringify(testLogicState.categories)), // Deep copy
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

  const currentTest = tests[testIndex];

  // Get all tests in the same category, sorted by order
  const testsInCategory = tests
    .filter((t) => t.category === currentTest.category)
    .sort((a, b) => a.order - b.order);

  const categoryIndex = testsInCategory.findIndex((t) => t.id === testId);
  if (categoryIndex === -1) return false;

  let targetIndex = -1;
  if (direction === 'up' && categoryIndex > 0) {
    targetIndex = categoryIndex - 1;
  } else if (
    direction === 'down' &&
    categoryIndex < testsInCategory.length - 1
  ) {
    targetIndex = categoryIndex + 1;
  } else {
    return false; // No change possible
  }

  // Swap order properties between the two tests in the same category
  const currentTestObj = testsInCategory[categoryIndex];
  const targetTestObj = testsInCategory[targetIndex];

  [currentTestObj.order, targetTestObj.order] = [
    targetTestObj.order,
    currentTestObj.order,
  ];

  // Re-sort the entire test list and re-normalize orders
  tests.sort((a, b) => {
    // Sort by category order first, then by test order within category
    const catA = testLogicState.categories[a.category] || { order: 999 };
    const catB = testLogicState.categories[b.category] || { order: 999 };

    if (catA.order !== catB.order) {
      return catA.order - catB.order;
    }

    return a.order - b.order;
  });

  // Re-normalize order within categories to ensure contiguous values
  let currentOrder = 0;
  getCategories().forEach((catName) => {
    tests
      .filter((t) => t.category === catName)
      .forEach((test) => {
        test.order = currentOrder++;
      });
  });

  return true;
}

export function setTestStatus(testId, status, eventWaitingFor = null) {
  const test = findTestById(testId);
  if (test) {
    test.status = status;
    test.currentEventWaitingFor =
      status === 'waiting_for_event' ? eventWaitingFor : null;
    if (status === 'running' || status === 'pending') {
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

export function getCategories() {
  // Return categories sorted by their 'order' property, then alphabetically
  return Object.entries(testLogicState.categories)
    .map(([name, data]) => ({ name, ...data })) // Convert to array of objects with name
    .sort((a, b) => {
      const orderA = a.order !== undefined ? a.order : Infinity;
      const orderB = b.order !== undefined ? b.order : Infinity;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.name.localeCompare(b.name);
    })
    .map((cat) => cat.name); // Return just names
}

export function getCategoryState(categoryName) {
  return (
    testLogicState.categories[categoryName] || {
      isEnabled: testLogicState.defaultEnabledState,
      order: Infinity,
    }
  );
}

export function toggleCategoryEnabled(categoryName, isEnabled) {
  if (testLogicState.categories[categoryName]) {
    testLogicState.categories[categoryName].isEnabled = isEnabled;
    testLogicState.tests.forEach((test) => {
      if (test.category === categoryName) {
        test.isEnabled = isEnabled;
      }
    });
    return true;
  }
  return false;
}

export function updateCategoryOrder(categoryName, direction) {
  const categories = getCategories(); // Gets sorted category names
  const currentIndex = categories.indexOf(categoryName);
  if (currentIndex === -1) return false;

  let newIndex;
  if (direction === 'up' && currentIndex > 0) {
    newIndex = currentIndex - 1;
  } else if (direction === 'down' && currentIndex < categories.length - 1) {
    newIndex = currentIndex + 1;
  } else {
    return false; // No change
  }

  const categoryToMove = categories[currentIndex];
  const categoryToSwapWith = categories[newIndex];

  // Swap order properties in the state
  const orderMoving = testLogicState.categories[categoryToMove].order;
  const orderSwapping = testLogicState.categories[categoryToSwapWith].order;

  testLogicState.categories[categoryToMove].order = orderSwapping;
  testLogicState.categories[categoryToSwapWith].order = orderMoving;

  // Re-normalize all test orders based on new category order
  let currentTestOrder = 0;
  getCategories().forEach((catName) => {
    // Iterate sorted categories
    testLogicState.tests
      .filter((t) => t.category === catName)
      .sort((a, b) => a.name.localeCompare(b.name)) // Keep tests within category alphabetically sorted for now
      .forEach((test) => {
        test.order = currentTestOrder++;
      });
  });
  testLogicState.tests.sort((a, b) => a.order - b.order); // Final sort on tests
  return true;
}

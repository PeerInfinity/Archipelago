// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testRegistry', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testRegistry] ${message}`, ...data);
  }
}

/**
 * Self-registering test system
 * Tests can register themselves by calling registerTest()
 */

const registeredTests = new Map();
const registeredCategories = new Map();

/**
 * Resolve order conflicts by adding decimal increments
 * @param {number} desiredOrder - The desired order value
 * @returns {number} A unique order value
 */
function resolveOrderConflicts(desiredOrder) {
  const existingOrders = Array.from(registeredTests.values()).map(t => t.order);
  
  // If no conflict, return the desired order
  if (!existingOrders.includes(desiredOrder)) {
    return desiredOrder;
  }
  
  // Find the next available decimal increment
  let increment = 0.1;
  let candidateOrder = desiredOrder + increment;
  
  while (existingOrders.includes(candidateOrder)) {
    increment += 0.1;
    candidateOrder = parseFloat((desiredOrder + increment).toFixed(1));
  }
  
  log('info', `[TestRegistry] Order conflict resolved: ${desiredOrder} -> ${candidateOrder}`);
  return candidateOrder;
}

/**
 * Register a test function with metadata
 * @param {Object} testDefinition - Test definition object
 * @param {string} testDefinition.id - Unique test identifier
 * @param {string} testDefinition.name - Display name for the test
 * @param {string} testDefinition.description - Test description
 * @param {Function} testDefinition.testFunction - The actual test function
 * @param {string} [testDefinition.category='Uncategorized'] - Test category
 * @param {boolean} [testDefinition.enabled=false] - Default enabled state
 * @param {number} [testDefinition.order] - Order within category (auto-assigned if not provided)
 */
export function registerTest(testDefinition) {
  const {
    id,
    name,
    description,
    testFunction,
    category = 'Uncategorized',
    enabled, // Don't provide default here, preserve undefined
    order,
  } = testDefinition;

  if (!id || !name || !testFunction) {
    throw new Error('Test registration requires id, name, and testFunction');
  }

  if (registeredTests.has(id)) {
    log(
      'warn',
      `Test with id '${id}' is already registered. Skipping duplicate.`
    );
    return;
  }

  // Determine final order value
  let finalOrder;
  
  if (order !== undefined) {
    // Use provided order, but check for duplicates and resolve them
    finalOrder = resolveOrderConflicts(order);
  } else {
    // Auto-assign order: find the highest existing order and add 1
    const existingOrders = Array.from(registeredTests.values()).map(t => t.order);
    const maxOrder = existingOrders.length > 0 ? Math.max(...existingOrders) : -1;
    finalOrder = maxOrder + 1;
  }

  registeredTests.set(id, {
    id,
    name,
    description,
    functionName: testFunction.name || id, // Use function name or fall back to id
    testFunction,
    category,
    isEnabled: enabled,
    order: finalOrder,
    // Runtime state (will be managed by TestState)
    status: enabled ? 'pending' : 'disabled', // Set status based on enabled state
    conditions: [],
    logs: [],
    currentEventWaitingFor: null,
  });

  log(
    'info',
    `[TestRegistry] Registered test: ${id} (${name}) in category '${category}' with order: ${finalOrder}${order !== undefined ? ` (requested: ${order})` : ' (auto-assigned)'}`
  );
}

/**
 * Register a test category
 * @param {Object} categoryDefinition - Category definition object
 * @param {string} categoryDefinition.name - Category name
 * @param {boolean} [categoryDefinition.enabled=true] - Default enabled state
 * @param {number} [categoryDefinition.order] - Display order (auto-assigned if not provided)
 */
export function registerCategory(categoryDefinition) {
  const { name, enabled = true, order } = categoryDefinition;

  if (!name) {
    throw new Error('Category registration requires a name');
  }

  if (registeredCategories.has(name)) {
    return; // Already registered
  }

  const finalOrder = order !== undefined ? order : registeredCategories.size;

  registeredCategories.set(name, {
    isEnabled: enabled,
    order: finalOrder,
  });

  log('info', `[TestRegistry] Registered category: ${name}`);
}

/**
 * Get all registered tests as an array
 * @returns {Array} Array of test definitions
 */
export function getAllRegisteredTests() {
  return Array.from(registeredTests.values()).sort((a, b) => a.order - b.order);
}

/**
 * Get all registered categories as an object
 * @returns {Object} Categories object compatible with testState
 */
export function getAllRegisteredCategories() {
  const categories = {};
  for (const [name, categoryData] of registeredCategories.entries()) {
    categories[name] = { ...categoryData };
  }
  return categories;
}

/**
 * Get a test function by its ID
 * @param {string} testId - Test identifier
 * @returns {Function|null} Test function or null if not found
 */
export function getTestFunction(testId) {
  const test = registeredTests.get(testId);
  return test ? test.testFunction : null;
}

/**
 * Get all test functions as an object (for compatibility with current testLogic)
 * @returns {Object} Object with functionName as key and function as value
 */
export function getAllTestFunctions() {
  const functions = {};
  for (const test of registeredTests.values()) {
    functions[test.functionName] = test.testFunction;
  }
  return functions;
}

/**
 * Check if a test is registered
 * @param {string} testId - Test identifier
 * @returns {boolean} True if test is registered
 */
export function isTestRegistered(testId) {
  return registeredTests.has(testId);
}

/**
 * Clear all registered tests (mainly for testing)
 */
export function clearRegistry() {
  registeredTests.clear();
  registeredCategories.clear();
  log('info', '[TestRegistry] Registry cleared');
}

/**
 * Get registration statistics
 * @returns {Object} Stats about registered tests and categories
 */
export function getRegistryStats() {
  return {
    testCount: registeredTests.size,
    categoryCount: registeredCategories.size,
    testsPerCategory: Object.fromEntries(
      Array.from(registeredCategories.keys()).map((category) => [
        category,
        Array.from(registeredTests.values()).filter(
          (t) => t.category === category
        ).length,
      ])
    ),
  };
}

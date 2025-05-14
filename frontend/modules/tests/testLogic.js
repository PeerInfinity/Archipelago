// frontend/modules/tests/testLogic.js
import { stateManagerProxySingleton } from '../stateManager/index.js'; // For direct interaction
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js'; // Import the helper

let eventBusInstance = null;
let appInitializationApiInstance = null;

const testLogicState = {
  tests: [
    {
      id: 'test_1_simple_event',
      name: 'Test Simple Event Wait',
      description:
        'Checks if waitForEvent correctly pauses and resumes on a custom event.',
      functionName: 'simpleEventTest',
      isEnabled: true,
      order: 0,
      status: 'pending',
      conditions: [],
      currentEventWaitingFor: null,
    },
    {
      id: 'test_2_config_load_and_item_check', // Renamed for clarity
      name: 'Test Config Load & Item Interaction',
      description: 'Loads test rules, adds an item, and verifies state.',
      functionName: 'configLoadAndItemCheckTest', // New function name
      isEnabled: true,
      order: 1,
      status: 'pending',
      conditions: [],
      currentEventWaitingFor: null,
    },
    {
      id: 'test_3_ui_simulation',
      name: 'Test UI Simulation (Placeholder)',
      description:
        'Simulates a click and checks outcome (initial placeholder).',
      functionName: 'uiSimulationTest',
      isEnabled: true,
      order: 2,
      status: 'pending',
      conditions: [],
      currentEventWaitingFor: null,
    },
  ],
  autoStartTestsOnLoad: false,
  currentRunningTestId: null,
  activeTestPromises: {}, // Store resolve functions for individual test runs
};

// --- TestController Class ---
class TestController {
  constructor(testId, testLogicInstance) {
    this.testId = testId;
    this.testLogic = testLogicInstance;
  }

  log(message, type = 'info') {
    // console.log(`[TestController-${this.testId}] ${type.toUpperCase()}: ${message}`); // Keep for internal debugging
    this.testLogic.emitLogMessage(this.testId, message, type);
  }

  reportCondition(description, passed) {
    this.log(`Condition: "${description}" - ${passed ? 'PASSED' : 'FAILED'}`);
    this.testLogic.addTestCondition(
      this.testId,
      description,
      passed ? 'passed' : 'failed'
    );
  }

  async performAction(actionDetails) {
    const actionValue =
      actionDetails.payload ||
      actionDetails.itemName ||
      actionDetails.locationName ||
      actionDetails.selector;

    let detailsString = '';
    if (actionValue !== undefined && actionValue !== null) {
      if (typeof actionValue === 'object') {
        detailsString = JSON.stringify(actionValue);
      } else {
        detailsString = String(actionValue);
      }
    } else {
      detailsString = '(no details)';
    }

    this.log(
      `Performing action: ${actionDetails.type}. Details: ${detailsString}`,
      'info' // Ensure type is a simple string
    );

    // Ensure StateManager Proxy is ready for state-dependent actions
    if (
      actionDetails.type !== 'DISPATCH_EVENT' &&
      actionDetails.type !== 'SIMULATE_CLICK' &&
      actionDetails.type !== 'LOAD_RULES_DATA'
    ) {
      if (!stateManagerProxySingleton) {
        const msg = 'StateManagerProxySingleton not available for action.';
        this.log(msg, 'error');
        throw new Error(msg);
      }
      try {
        await stateManagerProxySingleton.ensureReady(); // Important for snapshot-dependent actions
      } catch (e) {
        const msg = 'StateManagerProxy not ready for action.';
        this.log(msg, 'error');
        throw new Error(msg);
      }
    }

    switch (actionDetails.type) {
      case 'DISPATCH_EVENT':
        if (eventBusInstance) {
          eventBusInstance.publish(
            actionDetails.eventName,
            actionDetails.payload
          );
        } else {
          this.log(
            'Error: eventBusInstance not available for DISPATCH_EVENT.',
            'error'
          );
        }
        return; // Fire-and-forget

      case 'LOAD_RULES_DATA': // Used by configLoadAndItemCheckTest
        if (
          stateManagerProxySingleton &&
          typeof stateManagerProxySingleton.loadRules === 'function'
        ) {
          this.log('Calling StateManagerProxy.loadRules...');
          try {
            const playerInfo = {
              playerId: actionDetails.playerId || '1',
              playerName:
                actionDetails.playerName ||
                `TestPlayer${actionDetails.playerId || '1'}`,
            };
            await stateManagerProxySingleton.loadRules(
              actionDetails.payload,
              playerInfo
            );
            this.log('stateManagerProxySingleton.loadRules command sent.');
          } catch (error) {
            this.log(
              `Error calling stateManagerProxySingleton.loadRules: ${error.message}`,
              'error'
            );
            throw error;
          }
        } else {
          const errMsg =
            'StateManager proxy or its loadRules method not available.';
          this.log(errMsg, 'error');
          throw new Error(errMsg);
        }
        return;

      case 'ADD_ITEM_TO_INVENTORY':
        if (stateManagerProxySingleton && actionDetails.itemName) {
          await stateManagerProxySingleton.addItemToInventory(
            actionDetails.itemName
          );
          this.log(
            `Action ADD_ITEM_TO_INVENTORY for "${actionDetails.itemName}" sent.`
          );
          // Test function should `await waitForEvent('stateManager:snapshotUpdated')` after this
        } else {
          throw new Error(
            'Missing itemName or StateManagerProxy for ADD_ITEM_TO_INVENTORY'
          );
        }
        return;

      case 'CHECK_LOCATION':
        if (stateManagerProxySingleton && actionDetails.locationName) {
          await stateManagerProxySingleton.checkLocation(
            actionDetails.locationName
          );
          this.log(
            `Action CHECK_LOCATION for "${actionDetails.locationName}" sent.`
          );
          // Test function should `await waitForEvent('stateManager:snapshotUpdated')`
        } else {
          throw new Error(
            'Missing locationName or StateManagerProxy for CHECK_LOCATION'
          );
        }
        return;

      case 'GET_INVENTORY_ITEM_COUNT': {
        const snapshot = stateManagerProxySingleton.getSnapshot();
        if (snapshot && snapshot.inventory && actionDetails.itemName) {
          return snapshot.inventory[actionDetails.itemName] || 0;
        }
        this.log(
          'Warning: Could not get item count, snapshot or inventory missing.',
          'warn'
        );
        return 0;
      }

      case 'IS_LOCATION_ACCESSIBLE': {
        const snapshot = stateManagerProxySingleton.getSnapshot();
        const staticData = stateManagerProxySingleton.getStaticData();
        if (snapshot && staticData && actionDetails.locationName) {
          const snapshotInterface = createStateSnapshotInterface(
            // Call imported function directly
            snapshot,
            staticData
          );

          let locData = staticData.locations[actionDetails.locationName];
          if (!locData && staticData.regions) {
            // Try to find it within regions if not in the flat list
            for (const regionKey in staticData.regions) {
              const region = staticData.regions[regionKey];
              if (
                region.locations &&
                region.locations[actionDetails.locationName]
              ) {
                locData = region.locations[actionDetails.locationName];
                // Ensure parent_region is set if we found it this way
                if (!locData.parent_region) {
                  locData.parent_region = region.name || regionKey;
                }
                break;
              }
            }
          }

          if (!locData) {
            this.log(
              `Location data for "${actionDetails.locationName}" not found in staticData or its regions.`,
              'warn'
            );
            return false;
          }
          // Check region reachability first
          const regionToEvaluate = locData.parent_region || locData.region;
          if (!regionToEvaluate) {
            this.log(
              `Location "${actionDetails.locationName}" has no parent_region or region defined.`,
              'warn'
            );
            return false;
          }
          const regionReachable =
            snapshotInterface.isRegionReachable(regionToEvaluate);
          if (!regionReachable) return false;

          return snapshotInterface.evaluateRule(locData.access_rule);
        }
        this.log(
          'Warning: Could not check location accessibility, snapshot/staticData missing.',
          'warn'
        );
        return false;
      }

      case 'IS_REGION_REACHABLE': {
        const snapshot = stateManagerProxySingleton.getSnapshot();
        if (snapshot && snapshot.reachability && actionDetails.regionName) {
          const status = snapshot.reachability[actionDetails.regionName];
          return (
            status === 'reachable' || status === 'checked' || status === true
          );
        }
        this.log(
          'Warning: Could not check region reachability, snapshot or reachability data missing.',
          'warn'
        );
        return false;
      }
      case 'SIMULATE_CLICK':
        if (actionDetails.selector) {
          const element = document.querySelector(actionDetails.selector);
          if (element) {
            element.click();
            this.log(`Clicked element: ${actionDetails.selector}`);
          } else {
            this.log(
              `Element not found for click: ${actionDetails.selector}`,
              'error'
            );
            throw new Error(
              `Element not found for SIMULATE_CLICK: ${actionDetails.selector}`
            );
          }
        } else {
          throw new Error('Missing selector for SIMULATE_CLICK');
        }
        return; // UI interaction is fire-and-forget for the action, test awaits resulting event

      default:
        this.log(`Unknown action type: ${actionDetails.type}`, 'warn');
        return Promise.resolve(); // Or reject, depending on desired strictness
    }
  }

  waitForEvent(eventName, timeoutMilliseconds = 5000) {
    this.log(
      `Waiting for event: ${eventName} (timeout: ${timeoutMilliseconds}ms)`
    );
    this.testLogic.setTestStatus(this.testId, 'waiting_for_event', eventName);
    return new Promise((resolve, reject) => {
      if (!eventBusInstance) {
        const msg = 'eventBusInstance is not available in TestController';
        this.log(msg, 'error');
        reject(new Error(msg));
        return;
      }
      let timeoutId;
      const handler = (data) => {
        clearTimeout(timeoutId);
        eventBusInstance.unsubscribe(eventName, handler);
        this.log(`Event received: ${eventName}`);
        this.log(`Event data: ${JSON.stringify(data)}`, 'debug');
        this.testLogic.setTestStatus(this.testId, 'running');
        resolve(data);
      };
      timeoutId = setTimeout(() => {
        eventBusInstance.unsubscribe(eventName, handler);
        const msg = `Timeout waiting for event ${eventName}`;
        this.log(msg, 'error');
        this.testLogic.setTestStatus(this.testId, 'failed');
        reject(new Error(msg));
      }, timeoutMilliseconds);
      eventBusInstance.subscribe(eventName, handler);
    });
  }

  async loadConfiguration(filePath, type) {
    this.log(`Loading configuration: ${filePath} (type: ${type})`);
    if (!appInitializationApiInstance) {
      const msg =
        'appInitializationApiInstance not available for loadConfiguration.';
      this.log(msg, 'error');
      throw new Error(msg);
    }

    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${filePath}: ${response.statusText}`);
      }
      const jsonData = await response.json();
      this.log(`Fetched ${filePath} successfully.`);

      if (type === 'rules') {
        this.log('Dispatching files:jsonLoaded for rules...');
        eventBusInstance.publish('files:jsonLoaded', {
          fileName: filePath.split('/').pop(),
          jsonData: jsonData,
          selectedPlayerId: '1', // Assume player 1 for test rule loads
        });
        // The test function MUST await 'stateManager:rulesLoaded' after this.
      } else if (type === 'settings') {
        const settingsManager = appInitializationApiInstance.getModuleFunction(
          'settings',
          'settingsManager'
        ); // Hypothetical
        if (
          settingsManager &&
          typeof settingsManager.updateSettings === 'function'
        ) {
          this.log('Updating settings via settingsManager...');
          await settingsManager.updateSettings(jsonData); // Assuming updateSettings is async or we wait for event
        } else {
          // Fallback: directly call the imported singleton if getModuleFunction isn't setup for it
          const settingsManagerSingleton = (
            await import('../../app/core/settingsManager.js')
          ).default;
          await settingsManagerSingleton.updateSettings(jsonData);
          this.log(
            'Updating settings via imported settingsManager singleton...'
          );
        }
        // The test function should await 'settings:changed' or a specific module reaction.
      } else {
        throw new Error(`Unsupported configuration type: ${type}`);
      }
    } catch (error) {
      this.log(
        `Error loading configuration ${filePath}: ${error.message}`,
        'error'
      );
      throw error;
    }
  }

  async completeTest(overallPassStatus) {
    this.log(
      `Test completion signal: ${overallPassStatus ? 'PASSED' : 'FAILED'}`
    );
    this.testLogic.setTestStatus(
      this.testId,
      overallPassStatus ? 'passed' : 'failed'
    );
    this.testLogic.emitTestCompleted(this.testId, overallPassStatus);
  }
}

// --- Test Function Definitions ---
const testFunctions = {
  simpleEventTest: async (testController) => {
    try {
      testController.log('Starting simpleEventTest...');
      testController.reportCondition('Test started', true);

      setTimeout(() => {
        console.log(
          '[Test Logic - simpleEventTest] Publishing custom:testEventAfterDelay'
        );
        eventBusInstance.publish('custom:testEventAfterDelay', {
          detail: 'Event Fired!',
        });
      }, 1000);

      testController.log('Waiting for custom:testEventAfterDelay...');
      const eventData = await testController.waitForEvent(
        'custom:testEventAfterDelay',
        2000
      );

      if (eventData && eventData.detail === 'Event Fired!') {
        testController.reportCondition(
          'custom:testEventAfterDelay received correctly',
          true
        );
      } else {
        testController.reportCondition(
          'custom:testEventAfterDelay not received or data mismatch',
          false
        );
      }
      await testController.completeTest(
        eventData && eventData.detail === 'Event Fired!'
      );
    } catch (error) {
      testController.log(`Error in simpleEventTest: ${error.message}`, 'error');
      testController.reportCondition(`Test errored: ${error.message}`, false);
      await testController.completeTest(false);
    }
  },

  configLoadAndItemCheckTest: async (testController) => {
    let overallResult = true;
    try {
      testController.log('Starting configLoadAndItemCheckTest...');
      testController.reportCondition('Test started', true);

      // Minimal rules for this test
      const mockRulesContent = {
        schema_version: 3,
        game: 'ALTTP',
        player_names: { 1: 'TestPlayer' },
        start_regions: { 1: ['Hyrule Castle Courtyard'] }, // More standard start
        items: {
          1: {
            'Moon Pearl': {
              name: 'Moon Pearl',
              type: 'Item',
              progressive: false,
              id: 100,
            },
            'Progressive Sword': {
              name: 'Progressive Sword',
              type: 'Item',
              progressive: true,
              id: 101,
            },
            'Lifting Glove': {
              name: 'Lifting Glove',
              type: 'Item',
              progressive: false,
              id: 102,
            },
            'Victory': { name: 'Victory', type: 'Event', id: 999 },
          },
        },
        item_groups: { 1: {} },
        progression_mapping: {
          1: {
            'Progressive Sword': {
              items: [
                { name: 'Fighter Sword', level: 1 },
                { name: 'Master Sword', level: 2 },
              ],
            },
          },
        },
        regions: {
          1: {
            'Menu': {
              name: 'Menu',
              type: 1,
              player: 1,
              entrances: [],
              exits: [
                {
                  name: 'Hyrule Castle Courtyard',
                  connected_region: 'Hyrule Castle Courtyard',
                  access_rule: {
                    type: 'constant',
                    value: true,
                  },
                  type: 'Exit',
                },
              ],
              locations: [],
              is_light_world: true,
              is_dark_world: false,
            },
            'Hyrule Castle Courtyard': {
              name: 'Hyrule Castle Courtyard',
              is_light_world: true,
              is_dark_world: false,
              locations: [],
              exits: [
                {
                  name: 'To Dark World Portal',
                  connected_region: 'Dark World Forest',
                  access_rule: { type: 'item_check', item: 'Moon Pearl' },
                },
              ],
            },
            'Dark World Forest': {
              name: 'Dark World Forest',
              is_light_world: false,
              is_dark_world: true,
              locations: [
                {
                  name: 'LocationUnlockedByMoonPearl',
                  access_rule: { type: 'constant', value: true },
                  item: { name: 'Victory', player: 1, type: 'Event' },
                },
              ],
              exits: [],
            },
          },
        },
        settings: { 1: { player_name: 'TestPlayer' } },
      };

      await testController.performAction({
        type: 'LOAD_RULES_DATA',
        payload: mockRulesContent,
        playerId: '1',
        playerName: 'TestPlayer1',
      });
      testController.reportCondition('LOAD_RULES_DATA action sent', true);

      await testController.waitForEvent('stateManager:rulesLoaded', 3000);
      testController.reportCondition('Rules loaded event received', true);

      // Add Moon Pearl
      await testController.performAction({
        type: 'ADD_ITEM_TO_INVENTORY',
        itemName: 'Moon Pearl',
      });
      await testController.waitForEvent('stateManager:snapshotUpdated', 1000); // Wait for inventory update
      testController.reportCondition(
        'Moon Pearl added to inventory command sent and snapshot updated',
        true
      );

      const pearlCount = await testController.performAction({
        type: 'GET_INVENTORY_ITEM_COUNT',
        itemName: 'Moon Pearl',
      });
      if (pearlCount > 0) {
        testController.reportCondition(
          'Moon Pearl count is > 0 in inventory',
          true
        );
      } else {
        testController.reportCondition(
          `Moon Pearl count is ${pearlCount}, expected > 0`,
          false
        );
        overallResult = false;
      }

      const isAccessible = await testController.performAction({
        type: 'IS_LOCATION_ACCESSIBLE',
        locationName: 'LocationUnlockedByMoonPearl',
      });
      if (isAccessible) {
        testController.reportCondition(
          'LocationUnlockedByMoonPearl is now accessible',
          true
        );
      } else {
        testController.reportCondition(
          'LocationUnlockedByMoonPearl is NOT accessible after getting Moon Pearl',
          false
        );
        overallResult = false;
      }
    } catch (error) {
      testController.log(
        `Error in configLoadAndItemCheckTest: ${error.message}`,
        'error'
      );
      testController.reportCondition(`Test errored: ${error.message}`, false);
      overallResult = false;
    } finally {
      await testController.completeTest(overallResult);
    }
  },

  uiSimulationTest: async (testController) => {
    let overallResult = true;
    try {
      testController.log('Starting uiSimulationTest...');
      testController.reportCondition('Test started', true);

      // Assume the sample_rules.json (or mockRulesContent from other test) is loaded,
      // defining "Progressive Sword"
      // Step 1: Simulate click on "Progressive Sword" inventory button
      // Ensure InventoryUI has rendered and the button exists. This test relies on prior setup.
      testController.log(
        'Simulating click on "Progressive Sword" inventory button...'
      );
      await testController.performAction({
        type: 'SIMULATE_CLICK',
        selector: '.item-button[data-item="Progressive Sword"]',
      });
      testController.reportCondition(
        'Clicked "Progressive Sword" button',
        true
      );

      // Step 2: Wait for the inventory to update
      testController.log('Waiting for snapshot update after item click...');
      await testController.waitForEvent('stateManager:snapshotUpdated', 2000);
      testController.reportCondition('Snapshot updated after item click', true);

      // Step 3: Verify "Fighter Sword" (or the first progressive stage) is in inventory
      const swordCount = await testController.performAction({
        type: 'GET_INVENTORY_ITEM_COUNT',
        itemName: 'Fighter Sword',
      });
      if (swordCount > 0) {
        testController.reportCondition(
          'Fighter Sword count is > 0 after click',
          true
        );
      } else {
        testController.reportCondition(
          `Fighter Sword count is ${swordCount}, expected > 0`,
          false
        );
        overallResult = false;
      }
    } catch (error) {
      testController.log(
        `Error in uiSimulationTest: ${error.message}`,
        'error'
      );
      testController.reportCondition(`Test errored: ${error.message}`, false);
      overallResult = false;
    } finally {
      await testController.completeTest(overallResult);
    }
  },
};

// --- testLogic Public API ---
export const testLogic = {
  setInitializationApi(api) {
    appInitializationApiInstance = api;
    // Provide stateManagerProxySingleton to TestController actions if not directly imported
    // This assumes that stateManagerProxySingleton is already initialized by its own module
    if (!stateManagerProxySingleton) {
      console.warn(
        '[TestLogic] StateManagerProxySingleton is not available when TestLogic received init API. Some TestController actions might fail.'
      );
    }
  },
  setEventBus(bus) {
    eventBusInstance = bus;
  },

  getTests() {
    return [...testLogicState.tests.sort((a, b) => a.order - b.order)];
  },

  getSavableState() {
    return {
      autoStartTestsOnLoad: testLogicState.autoStartTestsOnLoad,
      tests: testLogicState.tests.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        functionName: t.functionName,
        isEnabled: t.isEnabled,
        order: t.order,
      })),
    };
  },

  applyLoadedState(data) {
    if (data && typeof data.autoStartTestsOnLoad === 'boolean') {
      testLogicState.autoStartTestsOnLoad = data.autoStartTestsOnLoad;
    }
    if (data && Array.isArray(data.tests)) {
      const newTestsMap = new Map(data.tests.map((t) => [t.id, t]));
      const currentTests = [];
      let maxOrder = -1;

      // Update existing or add new from loaded
      newTestsMap.forEach((loadedTestConfig, testId) => {
        const existingTest = testLogicState.tests.find((t) => t.id === testId);
        if (existingTest) {
          currentTests.push({
            ...existingTest, // Keep runtime status, conditions
            name: loadedTestConfig.name,
            description: loadedTestConfig.description,
            functionName: loadedTestConfig.functionName,
            isEnabled: loadedTestConfig.isEnabled,
            order: loadedTestConfig.order,
          });
        } else {
          // New test from loaded data
          currentTests.push({
            ...loadedTestConfig,
            status: 'pending',
            conditions: [],
            currentEventWaitingFor: null,
          });
        }
        if (loadedTestConfig.order > maxOrder)
          maxOrder = loadedTestConfig.order;
      });

      // Add any tests currently in logic that weren't in the loaded data
      // (e.g., newly defined tests not yet saved)
      testLogicState.tests.forEach((currentTest) => {
        if (!newTestsMap.has(currentTest.id)) {
          currentTest.order = ++maxOrder; // Assign new order
          currentTests.push(currentTest);
        }
      });

      testLogicState.tests = currentTests.sort((a, b) => a.order - b.order);
      // Normalize order just in case
      testLogicState.tests.forEach((t, i) => (t.order = i));
    }
    if (eventBusInstance) {
      eventBusInstance.publish('test:listUpdated', { tests: this.getTests() });
    }
  },

  shouldAutoStartTests() {
    return testLogicState.autoStartTestsOnLoad;
  },

  toggleTestEnabled(testId, isEnabled) {
    const test = testLogicState.tests.find((t) => t.id === testId);
    if (test) {
      test.isEnabled = isEnabled;
      if (eventBusInstance)
        eventBusInstance.publish('test:listUpdated', {
          tests: this.getTests(),
        });
    }
  },

  updateTestOrder(testId, direction) {
    const tests = testLogicState.tests;
    const index = tests.findIndex((t) => t.id === testId);
    if (index === -1) return;

    if (direction === 'up' && index > 0) {
      [tests[index].order, tests[index - 1].order] = [
        tests[index - 1].order,
        tests[index].order,
      ];
    } else if (direction === 'down' && index < tests.length - 1) {
      [tests[index].order, tests[index + 1].order] = [
        tests[index + 1].order,
        tests[index].order,
      ];
    }
    tests.sort((a, b) => a.order - b.order);
    tests.forEach((t, i) => (t.order = i)); // Re-normalize order
    if (eventBusInstance)
      eventBusInstance.publish('test:listUpdated', { tests: this.getTests() });
  },

  setTestStatus(testId, status, eventWaitingFor = null) {
    const test = testLogicState.tests.find((t) => t.id === testId);
    if (test) {
      test.status = status;
      test.currentEventWaitingFor =
        status === 'waiting_for_event' ? eventWaitingFor : null;
      if (status === 'running' || status === 'pending') {
        test.conditions = []; // Clear conditions when a test (re)starts
      }
      if (eventBusInstance)
        eventBusInstance.publish('test:statusChanged', {
          testId,
          status,
          eventWaitingFor,
        });
    }
  },

  addTestCondition(testId, description, status) {
    const test = testLogicState.tests.find((t) => t.id === testId);
    if (test) {
      const condition = { description, status };
      test.conditions.push(condition);
      if (eventBusInstance)
        eventBusInstance.publish('test:conditionReported', {
          testId,
          condition,
        });
    }
  },

  emitLogMessage(testId, message, type) {
    if (eventBusInstance)
      eventBusInstance.publish('test:logMessage', { testId, message, type });
  },

  emitTestCompleted(testId, overallStatus) {
    const test = testLogicState.tests.find((t) => t.id === testId);
    if (test) {
      test.status = overallStatus ? 'passed' : 'failed';
      if (eventBusInstance) {
        eventBusInstance.publish('test:statusChanged', {
          testId,
          status: test.status,
        });
        // For runAllEnabledTests to await this specific test
        eventBusInstance.publish(`test:internalTestDone:${testId}`, {
          testId,
          status: test.status,
        });
      }
    }
  },

  async runTest(testId) {
    const test = testLogicState.tests.find((t) => t.id === testId);
    if (!test) {
      console.error(`Test with ID ${testId} not found.`);
      return;
    }
    if (!testFunctions[test.functionName]) {
      const errorMsg = `Test function ${test.functionName} not found for test ${test.name}.`;
      console.error(errorMsg);
      this.setTestStatus(testId, 'failed');
      this.addTestCondition(
        testId,
        `Config Error: Test function "${test.functionName}" is not defined.`,
        'failed'
      );
      this.emitTestCompleted(testId, false); // Signal completion for sequencing
      return;
    }

    this.setTestStatus(testId, 'running'); // Clears conditions
    if (eventBusInstance)
      eventBusInstance.publish('test:executionStarted', {
        testId,
        name: test.name,
      });

    testLogicState.currentRunningTestId = testId;
    const controller = new TestController(testId, this);

    try {
      await testFunctions[test.functionName](controller);
      // TestController.completeTest is responsible for the final status and emitting test:completed
    } catch (error) {
      console.error(`Error during execution of test ${test.name}:`, error);
      // Ensure controller.completeTest is called even on unhandled exception
      if (test.status !== 'passed' && test.status !== 'failed') {
        // Avoid double-completion
        await controller.completeTest(false); // Mark as failed
        controller.reportCondition(
          `Unhandled test execution error: ${error.message}`,
          false
        );
      }
    } finally {
      if (testLogicState.currentRunningTestId === testId) {
        testLogicState.currentRunningTestId = null;
      }
    }
  },

  async runAllEnabledTests() {
    const enabledTests = testLogicState.tests
      .filter((t) => t.isEnabled)
      .sort((a, b) => a.order - b.order);

    if (enabledTests.length === 0) {
      console.log('[TestLogic] No enabled tests to run.');
      if (eventBusInstance)
        eventBusInstance.publish('test:allRunsCompleted', {
          summary: { passedCount: 0, failedCount: 0, totalRun: 0 },
        });
      return;
    }

    console.log(
      `[TestLogic] Starting run of ${enabledTests.length} enabled tests.`
    );
    let passedCount = 0;
    let failedCount = 0;

    for (const test of enabledTests) {
      // Set up a promise that resolves when this specific test's "internalTestDone" event is published
      const testCompletionPromise = new Promise((resolve) => {
        const specificEventListener = (eventData) => {
          if (eventData.testId === test.id) {
            eventBusInstance.unsubscribe(
              `test:internalTestDone:${test.id}`,
              specificEventListener
            );
            resolve(eventData.status === 'passed');
          }
        };
        eventBusInstance.subscribe(
          `test:internalTestDone:${test.id}`,
          specificEventListener
        );
      });

      await this.runTest(test.id); // This starts the test but doesn't await its async function directly
      const testPassed = await testCompletionPromise; // Wait for the specific test to signal it's done

      if (testPassed) {
        passedCount++;
      } else {
        failedCount++;
      }
    }

    const summary = {
      passedCount,
      failedCount,
      totalRun: enabledTests.length,
    };
    console.log('[TestLogic] All enabled tests finished.', summary);
    if (eventBusInstance)
      eventBusInstance.publish('test:allRunsCompleted', { summary });
  },
};

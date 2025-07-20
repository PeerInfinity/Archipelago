// frontend/modules/tests/testCases/uiInteractionTests.js

import { registerTest } from '../testRegistry.js';

export async function uiSimulationTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting uiSimulationTest...');
    testController.reportCondition('Test started', true);

    // This test assumes `configLoadAndItemCheckTest` or similar setup has loaded rules
    // where "Progressive Sword" and "Master Sword" are defined.
    // Ideally, tests should be independent or explicitly state dependencies/setup steps.
    // For now, we assume the necessary item definitions are present from a prior rule load.

    testController.log(
      'Simulating click on "Progressive Sword" inventory button...'
    );
    await testController.performAction({
      type: 'SIMULATE_CLICK',
      selector: '.item-button[data-item="Progressive Sword"]',
    });
    testController.reportCondition('Clicked "Progressive Sword" button', true);

    // Wait for the click to be processed by the StateManager via events
    // A specific event like 'inventory:itemAddedByUI' would be ideal.
    // For now, 'stateManager:snapshotUpdated' is a general indicator that state *might* have changed.
    // A more robust test might need a custom event or more specific state checks.
    // Using AWAIT_WORKER_PING as a synchronization point.
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'uiSimSyncAfterClickInventoryButton',
    });
    testController.reportCondition(
      'Worker ping successful after inventory button click',
      true
    );

    // Progressive Sword level 1 should grant Fighter Sword
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
    testController.log(`Error in uiSimulationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    await testController.completeTest(overallResult);
  }
}

// Self-register tests
registerTest({
  id: 'ui_simulation_test',
  name: 'UI Simulation Test',
  description:
    'Tests the UI simulation functionality with the worker thread architecture.',
  testFunction: uiSimulationTest,
  category: 'UI Simulation',
  enabled: false,
  order: 0,
});

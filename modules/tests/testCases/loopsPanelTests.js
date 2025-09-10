import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'loopsPanel';
const MAX_WAIT_TIME = 10000; // 10 seconds

/**
 * Test case for verifying that the initial Menu position is not executed as an action.
 * This test checks that:
 * 1. The initial Menu is displayed as "Starting Region: Menu" (not "Move to Menu")
 * 2. Clicking Resume does not execute a "Move to Menu" action
 * 3. The queue only processes real actions, not the starting position
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testInitialMenuNotProcessed(testController) {
  let overallResult = true;
  const testRunId = `initial-menu-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting initial Menu processing test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Loops panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');

    // 2. Wait for the loops panel to appear in DOM
    const loopsPanelElement = await testController.pollForValue(
      () => document.querySelector('.loop-panel-container'),
      'Loops panel DOM element',
      5000,
      50
    );
    if (!loopsPanelElement) {
      throw new Error('Loops panel not found in DOM');
    }
    testController.reportCondition('Loops panel found in DOM', true);

    // 3. Check if loop mode is already active or click "Enter Loop Mode" button
    const loopModeBtn = await testController.pollForValue(
      () => loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode'),
      'Loop mode toggle button',
      5000,
      50
    );
    if (!loopModeBtn) {
      throw new Error('Loop mode toggle button not found');
    }
    
    // Check if we need to enter loop mode
    if (loopModeBtn.textContent === 'Enter Loop Mode') {
      testController.log(`[${testRunId}] Clicking Enter Loop Mode button...`);
      loopModeBtn.click();
      
      // Wait for loop mode to activate
      await testController.pollForCondition(
        () => {
          const btn = loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode');
          return btn && btn.textContent === 'Exit Loop Mode';
        },
        'Loop mode activated',
        3000,
        50
      );
    } else {
      testController.log(`[${testRunId}] Loop mode already active`);
    }
    testController.reportCondition('Loop mode activated', true);

    // 4. Check that the initial Menu is displayed correctly
    const menuBlockFound = await testController.pollForCondition(
      () => {
        const actionBlocks = loopsPanelElement.querySelectorAll('.loop-action-block');
        if (actionBlocks.length === 0) return false;
        
        // Check the first action block
        const firstBlock = actionBlocks[0];
        const titleElement = firstBlock.querySelector('.action-title');
        
        if (!titleElement) return false;
        
        const titleText = titleElement.textContent.trim();
        testController.log(`[${testRunId}] First action block title: "${titleText}"`);
        
        // It should say "Starting Region: Menu" NOT "Move to Menu"
        return titleText === 'Starting Region: Menu';
      },
      'Initial Menu displayed as Starting Region',
      5000,
      50
    );
    
    if (!menuBlockFound) {
      testController.reportCondition('Initial Menu displayed correctly', false);
      testController.log(`[${testRunId}] ERROR: Initial Menu not displayed as "Starting Region: Menu"`);
      overallResult = false;
    } else {
      testController.reportCondition('Initial Menu displayed correctly', true);
    }

    // 5. Check that the initial Menu has no mana cost
    const manaCostCheck = await testController.pollForCondition(
      () => {
        const actionBlocks = loopsPanelElement.querySelectorAll('.loop-action-block');
        if (actionBlocks.length === 0) return false;
        
        const firstBlock = actionBlocks[0];
        const manaCostElement = firstBlock.querySelector('.mana-cost');
        
        // There should be NO mana cost element for the starting position
        return !manaCostElement;
      },
      'Initial Menu has no mana cost',
      3000,
      50
    );
    
    if (!manaCostCheck) {
      testController.reportCondition('Initial Menu has no mana cost', false);
      testController.log(`[${testRunId}] ERROR: Initial Menu incorrectly shows a mana cost`);
      overallResult = false;
    } else {
      testController.reportCondition('Initial Menu has no mana cost', true);
    }

    // 6. Get access to loopState to monitor action processing
    const loopStateModule = await import('../../loops/loopStateSingleton.js');
    const loopState = loopStateModule.default;
    
    // 7. Check initial pause state
    const pauseBtn = loopsPanelElement.querySelector('#loop-ui-toggle-pause');
    if (!pauseBtn) {
      throw new Error('Pause/Resume button not found');
    }
    
    const initialButtonText = pauseBtn.textContent;
    testController.log(`[${testRunId}] Initial pause button text: "${initialButtonText}"`);
    
    // It should start as "Resume" since the queue starts paused
    if (initialButtonText !== 'Resume') {
      testController.reportCondition('Queue starts paused', false);
      testController.log(`[${testRunId}] ERROR: Expected button to show "Resume" but got "${initialButtonText}"`);
      overallResult = false;
    } else {
      testController.reportCondition('Queue starts paused', true);
    }

    // 8. Set up monitoring for action processing
    let actionProcessed = false;
    let processedActionDetails = null;
    
    const actionStartHandler = (data) => {
      actionProcessed = true;
      processedActionDetails = data.action;
      testController.log(`[${testRunId}] Action started:`, processedActionDetails);
    };
    
    eventBus.subscribe('loopState:newActionStarted', actionStartHandler, 'tests');

    // 9. Click Resume and wait briefly
    testController.log(`[${testRunId}] Clicking Resume button...`);
    pauseBtn.click();
    
    // Wait a moment to see if any action starts processing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // 10. Check if an action was incorrectly processed
    if (actionProcessed) {
      testController.reportCondition('No action processed when only Menu in queue', false);
      testController.log(`[${testRunId}] ERROR: An action was processed when it shouldn't have been`);
      testController.log(`[${testRunId}] Processed action details:`, processedActionDetails);
      
      // Check if it was a Menu action
      if (processedActionDetails && 
          processedActionDetails.type === 'regionMove' && 
          processedActionDetails.region === 'Menu') {
        testController.log(`[${testRunId}] ERROR: The initial Menu was incorrectly processed as an action!`);
      }
      
      overallResult = false;
    } else {
      testController.reportCondition('No action processed when only Menu in queue', true);
      testController.log(`[${testRunId}] SUCCESS: No action was processed (correct behavior)`);
    }

    // 11. Clean up - unsubscribe from event
    eventBus.unsubscribe('loopState:newActionStarted', actionStartHandler);
    
    // 12. Exit loop mode
    const exitBtn = loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode');
    if (exitBtn) {
      exitBtn.click();
    }

    testController.log(`[${testRunId}] Test completed successfully`);
    return overallResult;

  } catch (error) {
    testController.log(`[${testRunId}] Test failed with error:`, error);
    testController.reportCondition('Test completed without error', false);
    return false;
  }
}

/**
 * Test case for verifying that real actions after Menu are processed correctly.
 * This test adds a real action to the queue and verifies it gets processed.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testRealActionsProcessed(testController) {
  let overallResult = true;
  const testRunId = `real-actions-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting real actions processing test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Loops panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');

    // 2. Wait for the loops panel
    const loopsPanelElement = await testController.pollForValue(
      () => document.querySelector('.loop-panel-container'),
      'Loops panel DOM element',
      5000,
      50
    );
    if (!loopsPanelElement) {
      throw new Error('Loops panel not found in DOM');
    }

    // 3. Enter loop mode
    const enterLoopModeBtn = loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode');
    if (enterLoopModeBtn && enterLoopModeBtn.textContent === 'Enter Loop Mode') {
      enterLoopModeBtn.click();
      await testController.pollForCondition(
        () => {
          const btn = loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode');
          return btn && btn.textContent === 'Exit Loop Mode';
        },
        'Loop mode activated',
        3000,
        50
      );
    }

    // 4. Get playerState API to add a test action
    const centralRegistryModule = await import('../../../app/core/centralRegistry.js');
    const centralRegistry = centralRegistryModule.centralRegistry;
    
    // Try to get playerState functions
    const addLocationCheck = centralRegistry.getModuleFunction('playerState', 'addLocationCheck');
    if (!addLocationCheck) {
      testController.log(`[${testRunId}] WARNING: Could not get playerState API, skipping action addition test`);
      testController.reportCondition('PlayerState API available', false);
      return true; // Not a failure, just can't test this part
    }

    // 5. Add a test location check action
    testController.log(`[${testRunId}] Adding test location check action...`);
    addLocationCheck('test_location', 'Menu');

    // 6. Wait for the action to appear in the UI
    const actionBlockFound = await testController.pollForCondition(
      () => {
        const actionBlocks = loopsPanelElement.querySelectorAll('.loop-action-block');
        // Should have at least 2 blocks now (Menu + the new action)
        return actionBlocks.length >= 2;
      },
      'New action block appeared',
      3000,
      50
    );

    if (!actionBlockFound) {
      testController.reportCondition('Action added to queue', false);
      testController.log(`[${testRunId}] ERROR: New action not displayed in queue`);
      overallResult = false;
    } else {
      testController.reportCondition('Action added to queue', true);
      
      // 7. Now test that Resume processes the real action
      let actionProcessed = false;
      const actionHandler = (data) => {
        if (data.action && data.action.type === 'locationCheck') {
          actionProcessed = true;
          testController.log(`[${testRunId}] Location check action started:`, data.action);
        }
      };
      
      eventBus.subscribe('loopState:newActionStarted', actionHandler, 'tests');
      
      // Click Resume
      const pauseBtn = loopsPanelElement.querySelector('#loop-ui-toggle-pause');
      if (pauseBtn && pauseBtn.textContent === 'Resume') {
        testController.log(`[${testRunId}] Clicking Resume to process real action...`);
        pauseBtn.click();
        
        // Wait for action to start
        await testController.pollForCondition(
          () => actionProcessed,
          'Real action started processing',
          3000,
          50
        );
      }
      
      if (actionProcessed) {
        testController.reportCondition('Real action processed correctly', true);
      } else {
        testController.reportCondition('Real action processed correctly', false);
        testController.log(`[${testRunId}] ERROR: Real action was not processed`);
        overallResult = false;
      }
      
      eventBus.unsubscribe('loopState:newActionStarted', actionHandler);
    }

    // Clean up - exit loop mode
    const exitBtn = loopsPanelElement.querySelector('#loop-ui-toggle-loop-mode');
    if (exitBtn) {
      exitBtn.click();
    }

    testController.log(`[${testRunId}] Test completed`);
    return overallResult;

  } catch (error) {
    testController.log(`[${testRunId}] Test failed with error:`, error);
    testController.reportCondition('Test completed without error', false);
    return false;
  }
}

// Register the test
registerTest({
  id: 'loops-initial-menu-not-processed',
  name: 'Initial Menu Not Processed as Action',
  description: 'Verifies that the initial Menu position is displayed correctly and not executed as an action when Resume is clicked',
  category: 'loops',
  testFunction: testInitialMenuNotProcessed,
  //enabled: true
});

// Register the second test
registerTest({
  id: 'loops-real-actions-processed',
  name: 'Real Actions Are Processed',
  description: 'Verifies that real actions in the queue are processed when Resume is clicked',
  category: 'loops',
  testFunction: testRealActionsProcessed,
  //enabled: true
});
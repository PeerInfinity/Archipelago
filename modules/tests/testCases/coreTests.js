// frontend/modules/tests/testCases/coreTests.js

import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('coreTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[coreTests] ${message}`, ...data);
  }
}

export async function simpleEventTest(testController) {
  try {
    testController.log('Starting simpleEventTest...');
    testController.reportCondition('Test started', true);

    setTimeout(() => {
      log(
        'info',
        '[Test Case - simpleEventTest] Publishing tests:testEventAfterDelay'
      );
      // Assuming testController.eventBus is the correct eventBus instance
      testController.eventBus.publish('tests:testEventAfterDelay', {
        detail: 'Event Fired!',
      }, 'tests');
    }, 1000);

    testController.log('Waiting for tests:testEventAfterDelay...');
    const eventData = await testController.waitForEvent(
      'tests:testEventAfterDelay',
      2000
    );

    let passCondition = eventData && eventData.detail === 'Event Fired!';
    testController.reportCondition(
      'tests:testEventAfterDelay received correctly',
      passCondition
    );
    await testController.completeTest(passCondition);
  } catch (error) {
    testController.log(`Error in simpleEventTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function superQuickTest(testController) {
  log('info', '[superQuickTest] STARTED - function entry point');
  try {
    log('info', '[superQuickTest] About to call testController.log...');
    testController.log('Starting superQuickTest...');
    log('info', '[superQuickTest] About to call reportCondition...');
    testController.reportCondition('Super quick test started', true);
    log('info', '[superQuickTest] About to do math...');
    // Simulate some quick synchronous operations
    let x = 1 + 1;
    if (x !== 2) {
      log('info', '[superQuickTest] Math failed!');
      testController.reportCondition('Basic math failed (1+1!=2)', false);
      await testController.completeTest(false);
      return;
    }
    log('info', '[superQuickTest] Math passed, reporting...');
    testController.reportCondition('Basic math passed (1+1=2)', true);
    testController.reportCondition(
      'Super quick test finished successfully',
      true
    );
    log('info', '[superQuickTest] About to call completeTest(true)...');
    await testController.completeTest(true);
    log('info', '[superQuickTest] COMPLETED successfully');
  } catch (error) {
    log('info', '[superQuickTest] CAUGHT ERROR:', error);
    testController.log(`Error in superQuickTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

export async function rulesReloadTest(testController) {
  log('info', '[rulesReloadTest] STARTED - testing rules reload functionality with complete UI state verification');
  try {
    testController.log('Starting comprehensive rules reload test with inventory validation...');
    testController.reportCondition('Rules reload test started', true);

    // Track if we receive the stateManager:rulesLoaded event
    let rulesLoadedEventReceived = false;
    
    // Step 1: Activate the Locations panel
    testController.log('Step 1: Activating Locations panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'locationsPanel' }, 'tests');
    
    // Wait for the panel to be ready
    const locationsReady = await testController.pollForCondition(
      () => {
        const locationsPanel = document.querySelector('.locations-panel-container');
        return locationsPanel && locationsPanel.querySelector('#locations-grid');
      },
      'Locations panel ready',
      5000,
      50
    );
    testController.reportCondition('Locations panel activated', locationsReady);

    // Step 2: Click on the Mushroom location to check it
    testController.log('Step 2: Looking for Mushroom location...');
    
    // Find the Mushroom location
    const mushroomLocation = await testController.pollForValue(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Mushroom')) {
            return card;
          }
        }
        return null;
      },
      'Mushroom location found',
      5000,
      50
    );
    
    if (mushroomLocation) {
      testController.reportCondition('Mushroom location found', true);
      testController.log('Clicking on Mushroom location to check it...');
      mushroomLocation.click();
      
      // Wait for the location to be checked
      await new Promise(resolve => setTimeout(resolve, 1500));
      testController.reportCondition('Mushroom location clicked', true);
    } else {
      testController.reportCondition('Mushroom location not found', false);
    }

    // Step 3: Confirm that the Mushroom location is checked
    testController.log('Step 3: Confirming Mushroom location is checked...');
    const mushroomLocationChecked = await testController.pollForCondition(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Mushroom')) {
            return card.classList.contains('checked') || card.classList.contains('location-checked');
          }
        }
        return false;
      },
      'Mushroom location is checked',
      5000,
      50
    );
    testController.reportCondition('Mushroom location confirmed checked', mushroomLocationChecked);

    // Step 4: Activate Inventory panel to check for Rupees (20)
    testController.log('Step 4: Activating Inventory panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'inventoryPanel' }, 'tests');
    
    // Wait for inventory panel to be ready
    const inventoryReady = await testController.pollForCondition(
      () => {
        const inventoryPanel = document.querySelector('.inventory-panel-container');
        return inventoryPanel && inventoryPanel.querySelector('.inventory-content');
      },
      'Inventory panel ready',
      5000,
      50
    );
    testController.reportCondition('Inventory panel activated', inventoryReady);

    // Step 5: Confirm "Rupees (20)" appears in inventory
    testController.log('Step 5: Checking for Rupees (20) in inventory...');
    const rupeesFound = await testController.pollForCondition(
      () => {
        const inventoryItems = document.querySelectorAll('.item-container, .item-button');
        for (const item of inventoryItems) {
          if (item.textContent.includes('Rupees') && item.textContent.includes('20')) {
            // Check if the item is actually visible and active (owned)
            const button = item.classList.contains('item-button') ? item : item.querySelector('.item-button');
            if (button) {
              const isOwned = button.classList.contains('active');
              const itemContainer = button.closest('.item-container');
              const style = window.getComputedStyle(itemContainer);
              const parentStyle = window.getComputedStyle(itemContainer.parentElement);
              
              // Item is considered "appearing" if it's owned (active) AND visible
              if (isOwned && style.display !== 'none' && style.visibility !== 'hidden' && 
                  parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
                testController.log(`Rupees (20) found as owned and visible - classes: ${button.classList.toString()}`);
                return true; // Found and visible
              }
            }
          }
        }
        return false;
      },
      'Rupees (20) found in inventory',
      5000,
      50
    );
    testController.reportCondition('Rupees (20) appears in inventory', rupeesFound);

    // Step 5b: Confirm "Bow" does NOT appear in inventory (should be hidden)
    testController.log('Step 5b: Checking that Bow does NOT appear in inventory...');
    const bowNotFound = await testController.pollForCondition(
      () => {
        const inventoryItems = document.querySelectorAll('.item-container, .item-button');
        for (const item of inventoryItems) {
          if (item.textContent.includes('Bow')) {
            // Check if the item is actually visible and active (owned)
            const button = item.classList.contains('item-button') ? item : item.querySelector('.item-button');
            if (button) {
              const isOwned = button.classList.contains('active');
              const itemContainer = button.closest('.item-container');
              const style = window.getComputedStyle(itemContainer);
              const parentStyle = window.getComputedStyle(itemContainer.parentElement);
              
              // Item is considered "appearing" if it's owned (active) AND visible
              if (isOwned && style.display !== 'none' && style.visibility !== 'hidden' && 
                  parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
                testController.log(`Bow found as owned and visible - classes: ${button.classList.toString()}`);
                return false; // If we find an owned and visible Bow, condition not met
              }
            }
          }
        }
        return true; // No owned and visible Bow found = condition met
      },
      'Bow not found in inventory',
      3000,
      50
    );
    testController.reportCondition('Bow does not appear in inventory', bowNotFound);

    // Step 7: Activate the Regions panel  
    testController.log('Step 7: Activating Regions panel...');
    testController.eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    
    // Wait for the panel to be ready
    const regionsReady = await testController.pollForCondition(
      () => {
        const regionsPanel = document.querySelector('.regions-panel-container');
        return regionsPanel && regionsPanel.querySelector('#region-details-container');
      },
      'Regions panel ready',
      5000,
      50
    );
    testController.reportCondition('Regions panel activated', regionsReady);

    // Step 8: Click on the Move button for "Links House S&Q → Links House"
    testController.log('Step 8: Looking for Links House S&Q move button...');
    
    const moveButton = await testController.pollForValue(
      () => {
        const moveButtons = document.querySelectorAll('.move-btn');
        for (const button of moveButtons) {
          if (button.parentElement && 
              button.parentElement.textContent.includes('Links House S&Q')) {
            return button;
          }
        }
        return null;
      },
      'Links House S&Q move button found',
      5000,
      50
    );
    
    if (moveButton) {
      testController.reportCondition('Links House S&Q move button found', true);
      testController.log('Clicking Links House S&Q move button...');
      moveButton.click();
      
      // Wait for the region to be added
      await new Promise(resolve => setTimeout(resolve, 1000));
      testController.reportCondition('Links House S&Q move button clicked', true);
    } else {
      testController.reportCondition('Links House S&Q move button not found', false);
    }

    // Step 9: Confirm Links House region block appears
    testController.log('Step 9: Confirming Links House region block appears...');
    const linksHouseAdded = await testController.pollForCondition(
      () => {
        // Use the same pattern as regionPanelTests.js - scope to regions container and check region name element
        const regionsPanel = document.querySelector('.regions-panel-container');
        if (!regionsPanel) return false; // If regions panel not found, region hasn't appeared
        
        const regionsContainer = regionsPanel.querySelector('#region-details-container');
        if (!regionsContainer) return false; // If regions container not found, region hasn't appeared
        
        const regionBlocks = regionsContainer.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Links House') {
            return true; // Found it
          }
        }
        return false;
      },
      'Links House region block appears',
      5000,
      50
    );
    testController.reportCondition('Links House region block confirmed added', linksHouseAdded);

    // Step 10: Run loadDefaultRules
    testController.log('Step 10: Calling loadDefaultRules()...');
    
    // Set up a promise to wait for the stateManager:rulesLoaded event
    const rulesLoadedPromise = testController.waitForEvent('stateManager:rulesLoaded', 10000);
    
    // Start the reload (this will fire the event)
    await testController.loadDefaultRules();
    
    testController.reportCondition('loadDefaultRules() completed successfully', true);
    testController.log('Rules reload completed successfully');
    
    // Wait for the event to be received
    try {
      const eventData = await rulesLoadedPromise;
      rulesLoadedEventReceived = true;
      testController.log(`stateManager:rulesLoaded event received with data keys: ${Object.keys(eventData || {}).join(', ')}`);
    } catch (error) {
      testController.log(`Failed to receive stateManager:rulesLoaded event: ${error.message}`, 'warn');
      rulesLoadedEventReceived = false;
    }
    
    // Give time for UI to refresh completely after the event
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Step 11: Check if our test received the event
    testController.reportCondition('Test received stateManager:rulesLoaded event', rulesLoadedEventReceived);
    
    if (!rulesLoadedEventReceived) {
      testController.log('WARNING: stateManager:rulesLoaded event was not received - UI panels likely not refreshing', 'warn');
    }

    // Step 12: Check if Mushroom location is now marked as unchecked
    testController.log('Step 12: Checking if Mushroom location is now unchecked after reload...');
    
    let mushroomUnchecked = false;
    const locationCards = document.querySelectorAll('.location-card');
    for (const card of locationCards) {
      if (card.textContent.includes('Mushroom')) {
        // Check if it's not marked as checked (no checked class or styling)
        mushroomUnchecked = !card.classList.contains('checked') && 
                            !card.classList.contains('location-checked');
        testController.log(`Mushroom location classes after reload: ${Array.from(card.classList).join(', ')}`);
        break;
      }
    }
    testController.reportCondition('Mushroom location is unchecked after reload', mushroomUnchecked);

    // Step 13: Check if Rupees (20) is removed from inventory
    testController.log('Step 13: Checking if Rupees (20) is removed from inventory after reload...');
    
    const rupeesRemovedAfterReload = await testController.pollForCondition(
      () => {
        const inventoryItems = document.querySelectorAll('.item-container, .item-button');
        for (const item of inventoryItems) {
          if (item.textContent.includes('Rupees') && item.textContent.includes('20')) {
            // Check if the item is actually visible and active (owned)
            const button = item.classList.contains('item-button') ? item : item.querySelector('.item-button');
            if (button) {
              const isOwned = button.classList.contains('active');
              const itemContainer = button.closest('.item-container');
              const style = window.getComputedStyle(itemContainer);
              const parentStyle = window.getComputedStyle(itemContainer.parentElement);
              
              // Item is considered "still appearing" if it's owned (active) AND visible
              if (isOwned && style.display !== 'none' && style.visibility !== 'hidden' && 
                  parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
                testController.log(`Rupees (20) still found as owned and visible after reload - classes: ${button.classList.toString()}`);
                return false; // If we still find it owned and visible, condition not met
              }
            }
          }
        }
        return true; // Not found as owned and visible = removed = condition met
      },
      'Rupees (20) removed from inventory',
      3000,
      50
    );
    testController.reportCondition('Rupees (20) removed from inventory after reload', rupeesRemovedAfterReload);

    // Step 14: Check if Links House region block is removed
    testController.log('Step 14: Checking if Links House region block is removed after reload...');
    
    const linksHouseRemovedAfterReload = await testController.pollForCondition(
      () => {
        // Use the same pattern as regionPanelTests.js - scope to regions container and check region name element
        const regionsPanel = document.querySelector('.regions-panel-container');
        if (!regionsPanel) return true; // If regions panel not found, consider it removed
        
        const regionsContainer = regionsPanel.querySelector('#region-details-container');
        if (!regionsContainer) return true; // If regions container not found, consider it removed
        
        const regionBlocks = regionsContainer.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Links House') {
            return false; // If we still find it, condition not met
          }
        }
        return true; // Not found = removed = condition met
      },
      'Links House region block removed',
      3000,
      50
    );
    testController.reportCondition('Links House region block removed after reload', linksHouseRemovedAfterReload);
    
    // Verify that the state manager is accessible after reload
    const snapshot = testController.stateManager.getSnapshot();
    const snapshotAvailable = !!snapshot;
    testController.reportCondition('State snapshot available after reload', snapshotAvailable);
    if (snapshot) {
      testController.log(`State snapshot contains ${Object.keys(snapshot).length} properties`);
    }
    
    // Calculate overall test result based on all critical conditions
    const criticalConditions = [
      rulesLoadedEventReceived,
      mushroomUnchecked, 
      rupeesRemovedAfterReload,
      linksHouseRemovedAfterReload,
      snapshotAvailable
    ];
    
    const allCriticalConditionsPassed = criticalConditions.every(condition => condition === true);
    const failedCount = criticalConditions.filter(condition => condition !== true).length;
    
    if (allCriticalConditionsPassed) {
      testController.reportCondition('All critical UI refresh conditions passed', true);
      log('info', '[rulesReloadTest] COMPLETED successfully - all UI panels refresh correctly');
      await testController.completeTest(true);
    } else {
      testController.reportCondition(`Critical UI refresh failure: ${failedCount} of ${criticalConditions.length} conditions failed`, false);
      testController.log(`FAILED: ${failedCount} critical conditions failed. Test shows UI panels not refreshing properly during rules reload.`, 'error');
      log('error', `[rulesReloadTest] FAILED - ${failedCount} critical conditions failed`);
      await testController.completeTest(false);
    }
  } catch (error) {
    log('error', '[rulesReloadTest] CAUGHT ERROR:', error);
    testController.log(`Error in rulesReloadTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Self-register tests

registerTest({
  id: 'test_core_super_quick',
  name: 'Super Quick Test',
  description: 'A test that completes almost instantly.',
  testFunction: superQuickTest,
  category: 'Core',
  //enabled: false,
  //order: 0,
});

registerTest({
  id: 'test_core_simple_event',
  name: 'Test Simple Event Wait',
  description:
    'Checks if waitForEvent correctly pauses and resumes on a custom event.',
  testFunction: simpleEventTest,
  category: 'Core',
  //enabled: false,
  //order: 1,
});

registerTest({
  id: 'test_core_rules_reload',
  name: 'Rules Reload Test',
  description:
    'Tests the loadDefaultRules() function to ensure it properly loads the default rules.json file and waits for completion.',
  testFunction: rulesReloadTest,
  category: 'Core',
  //enabled: true,
  //order: 2,
});

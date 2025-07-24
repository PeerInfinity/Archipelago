import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const EVENTS_PANEL_ID = 'eventsPanel';
const MAX_WAIT_TIME = 10000; // 10 seconds

/**
 * Test case for verifying that the Events panel correctly displays modules that are both
 * senders and receivers for the same event. Specifically tests the user:regionMove event
 * where the regions module should appear as both a sender and receiver.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testEventsPanelSenderReceiverDisplay(testController) {
  const testRunId = `events-panel-sender-receiver-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Events panel sender/receiver display test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Events panel
    testController.log(`[${testRunId}] Activating ${EVENTS_PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID }, 'tests');
    
    // Wait for panel to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. Wait for the events panel to appear in DOM
    let eventsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          eventsPanelElement = document.querySelector('.events-inspector');
          return eventsPanelElement !== null;
        },
        'Events panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Events panel not found in DOM');
    }
    testController.reportCondition('Events panel found in DOM', true);

    // 3. Wait for the dispatcher section to load
    let dispatcherSection = null;
    if (
      !(await testController.pollForCondition(
        () => {
          dispatcherSection = eventsPanelElement.querySelector('.dispatcher-section');
          return dispatcherSection && dispatcherSection.textContent !== 'Loading...';
        },
        'Dispatcher section loaded',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Dispatcher section not loaded');
    }
    testController.reportCondition('Dispatcher section loaded', true);

    // 4. Look for the user:regionMove event in the dispatcher section
    let regionMoveEvent = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const eventContainers = dispatcherSection.querySelectorAll('.dispatcher-event');
          for (const container of eventContainers) {
            const eventTitle = container.querySelector('h4');
            if (eventTitle && eventTitle.textContent.trim() === 'user:regionMove') {
              regionMoveEvent = container;
              return true;
            }
          }
          return false;
        },
        'user:regionMove event found',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('user:regionMove event not found in dispatcher section');
    }
    testController.reportCondition('user:regionMove event found', true);

    // 5. Find all module entries for the regions module in this event
    const regionModuleEntries = [];
    const moduleBlocks = regionMoveEvent.querySelectorAll('.module-block');
    
    for (const block of moduleBlocks) {
      const moduleName = block.querySelector('.module-name');
      if (moduleName && moduleName.textContent.trim() === 'regions') {
        regionModuleEntries.push(block);
      }
    }

    testController.log(`[${testRunId}] Found ${regionModuleEntries.length} entries for regions module`);

    // 6. The regions module should appear as both sender and receiver, which could be
    // either 1 entry with both roles or 2 separate entries - let's check both scenarios
    if (regionModuleEntries.length === 1) {
      // Single entry with both roles
      const regionsEntry = regionModuleEntries[0];
      
      // Check that it has both sender and handler symbols
      const senderColumn = regionsEntry.querySelector('.sender-symbol');
      const handlerColumn = regionsEntry.querySelector('.handler-symbol');

      if (!senderColumn) {
        throw new Error('Sender column not found for regions module');
      }
      if (!handlerColumn) {
        throw new Error('Handler column not found for regions module');
      }

      // Check that the sender column has content (indicating it's a sender)
      const senderSymbol = senderColumn.textContent.trim();
      const hasSenderSymbol = senderSymbol.includes('⬆️') || senderSymbol.includes('[S]');
      
      if (!hasSenderSymbol) {
        throw new Error(`Expected sender symbol in sender column, found: "${senderSymbol}"`);
      }

      // Check that the handler column has content (indicating it's a handler)
      const handlerSymbol = handlerColumn.textContent.trim();
      const hasHandlerSymbol = handlerSymbol.includes('●') || handlerSymbol.includes('↑') || handlerSymbol.includes('↓');
      
      if (!hasHandlerSymbol) {
        throw new Error(`Expected handler symbol in handler column, found: "${handlerSymbol}"`);
      }

      // Check that both columns have checkboxes (indicating they're interactive)
      const senderCheckbox = senderColumn.querySelector('input[type="checkbox"]');
      const handlerCheckbox = handlerColumn.querySelector('input[type="checkbox"]');

      if (!senderCheckbox) {
        throw new Error('Sender checkbox not found');
      }
      if (!handlerCheckbox) {
        throw new Error('Handler checkbox not found');
      }
      
      testController.reportCondition('Single regions module entry with both roles found', true);
      
    } else if (regionModuleEntries.length === 2) {
      // Two separate entries - one for sender role, one for receiver role
      let senderEntryFound = false;
      let handlerEntryFound = false;
      
      for (const entry of regionModuleEntries) {
        const senderColumn = entry.querySelector('.sender-symbol');
        const handlerColumn = entry.querySelector('.handler-symbol');
        
        // Check if this entry has sender functionality
        if (senderColumn) {
          const senderSymbol = senderColumn.textContent.trim();
          const hasSenderSymbol = senderSymbol.includes('⬆️') || senderSymbol.includes('[S]');
          if (hasSenderSymbol) {
            senderEntryFound = true;
          }
        }
        
        // Check if this entry has handler functionality
        if (handlerColumn) {
          const handlerSymbol = handlerColumn.textContent.trim();
          const hasHandlerSymbol = handlerSymbol.includes('●') || handlerSymbol.includes('↑') || handlerSymbol.includes('↓');
          if (hasHandlerSymbol) {
            handlerEntryFound = true;
          }
        }
      }
      
      if (!senderEntryFound) {
        throw new Error('Regions module sender entry not found');
      }
      if (!handlerEntryFound) {
        throw new Error('Regions module handler entry not found');
      }
      
      testController.reportCondition('Separate regions module entries for sender and receiver found', true);
      
    } else {
      throw new Error(`Expected 1 or 2 entries for regions module (sender and/or receiver), found ${regionModuleEntries.length}`);
    }
    
    testController.reportCondition('Regions module shows as both sender and receiver', true);

    // 11. Verify the playerState module also appears as a handler
    let playerStateFound = false;
    for (const block of moduleBlocks) {
      const moduleName = block.querySelector('.module-name');
      if (moduleName && moduleName.textContent.trim() === 'playerState') {
        const playerStateHandlerColumn = block.querySelector('.handler-symbol');
        if (playerStateHandlerColumn && playerStateHandlerColumn.textContent.trim().length > 0) {
          playerStateFound = true;
          break;
        }
      }
    }

    if (!playerStateFound) {
      throw new Error('playerState module not found as handler for user:regionMove');
    }
    testController.reportCondition('playerState module shows as handler', true);

    testController.log(`[${testRunId}] Events panel sender/receiver display test completed successfully`);
    testController.reportCondition('Test completed successfully', true);

    return true;

  } catch (error) {
    testController.log(`[${testRunId}] Test failed: ${error.message}`);
    testController.reportCondition(`Test failed: ${error.message}`, false);
    return false;
  }
}

/**
 * Test case for verifying that the Events panel correctly shows module names
 * for publishers and subscribers, and that the enable/disable checkboxes work properly.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testEventsPanelModuleNameTracking(testController) {
  const testRunId = `events-panel-module-names-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Events panel module name tracking test...`);
    testController.reportCondition('Test started', true);

    // 1. First activate the Regions panel to trigger subscription to ui:navigateToRegion
    testController.log(`[${testRunId}] Activating regions panel to trigger event subscriptions...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    
    // Wait for regions panel to initialize and subscribe to events
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // 2. Now activate the Events panel  
    testController.log(`[${testRunId}] Activating ${EVENTS_PANEL_ID} panel...`);
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID }, 'tests');
    
    // Wait for events panel to fully initialize
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // 2. Wait for the events panel to appear in DOM
    let eventsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          eventsPanelElement = document.querySelector('.events-inspector');
          return eventsPanelElement !== null;
        },
        'Events panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Events panel not found in DOM');
    }
    testController.reportCondition('Events panel found in DOM', true);

    // 3. Wait for the event bus section to load
    let eventBusSection = null;
    if (
      !(await testController.pollForCondition(
        () => {
          eventBusSection = eventsPanelElement.querySelector('.event-bus-section');
          return eventBusSection && eventBusSection.textContent !== 'Loading...';
        },
        'Event bus section loaded',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Event bus section not loaded');
    }
    testController.reportCondition('Event bus section loaded', true);

    // 4. Look for the ui:navigateToRegion event in the event bus section
    let navigateLocationEvent = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const eventContainers = eventBusSection.querySelectorAll('.event-bus-event');
          for (const container of eventContainers) {
            const eventTitle = container.querySelector('h4');
            if (eventTitle && eventTitle.textContent.trim() === 'ui:navigateToRegion') {
              navigateLocationEvent = container;
              return true;
            }
          }
          return false;
        },
        'ui:navigateToRegion event found',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('ui:navigateToRegion event not found in event bus section');
    }
    testController.reportCondition('ui:navigateToRegion event found', true);

    // 5. Verify commonUI is listed as a publisher
    const moduleBlocks = navigateLocationEvent.querySelectorAll('.module-block');
    let commonUIFound = false;
    let regionsFound = false;
    let commonUIPublisherCheckbox = null;
    let regionsSubscriberCheckbox = null;

    for (const block of moduleBlocks) {
      const moduleName = block.querySelector('.module-name');
      if (moduleName && moduleName.textContent.trim() === 'commonUI') {
        commonUIFound = true;
        const publisherColumn = block.querySelector('.publisher-symbol');
        if (publisherColumn && publisherColumn.textContent.includes('[P]')) {
          commonUIPublisherCheckbox = publisherColumn.querySelector('input[type="checkbox"]');
        }
      }
      if (moduleName && moduleName.textContent.trim() === 'regions') {
        regionsFound = true;
        const subscriberColumn = block.querySelector('.subscriber-symbol');
        if (subscriberColumn && subscriberColumn.textContent.includes('[S]')) {
          regionsSubscriberCheckbox = subscriberColumn.querySelector('input[type="checkbox"]');
        }
      }
    }

    if (!commonUIFound) {
      throw new Error('commonUI module not found as publisher for ui:navigateToRegion');
    }
    testController.reportCondition('commonUI module shows as publisher', true);

    if (!regionsFound) {
      throw new Error('regions module not found as subscriber for ui:navigateToRegion');
    }
    testController.reportCondition('regions module shows as subscriber', true);

    if (!commonUIPublisherCheckbox) {
      throw new Error('commonUI publisher checkbox not found');
    }
    testController.reportCondition('commonUI publisher checkbox found', true);

    if (!regionsSubscriberCheckbox) {
      throw new Error('regions subscriber checkbox not found');
    }
    testController.reportCondition('regions subscriber checkbox found', true);

    // 6. Activate the Regions panel to test the functionality
    testController.log(`[${testRunId}] Activating regions panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 7. Wait for regions panel to show Menu region
    let regionsPanel = null;
    if (
      !(await testController.pollForCondition(
        () => {
          regionsPanel = document.querySelector('.regions-panel-container');
          return regionsPanel !== null;
        },
        'Regions panel found',
        5000,
        250
      ))
    ) {
      throw new Error('Regions panel not found');
    }
    testController.reportCondition('Regions panel found', true);

    // 8. Test disabling commonUI publisher
    testController.log(`[${testRunId}] Testing commonUI publisher disable...`);
    
    // Uncheck the commonUI publisher checkbox
    if (commonUIPublisherCheckbox.checked) {
      commonUIPublisherCheckbox.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    
    // Click on "Links House" link in Menu region - look for region link spans
    const linksHouseLink = regionsPanel.querySelector('.region-link[data-region="Links House"], .location-link[data-location="Links House"], span[data-region="Links House"]');
    if (!linksHouseLink) {
      throw new Error('Links House link not found in regions panel');
    }
    
    linksHouseLink.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify that the navigation did not happen (Show All Regions should still be unchecked)
    // Look specifically for the "Show All Regions" checkbox with correct ID
    const showAllRegionsCheckbox = regionsPanel.querySelector('#show-all-regions');
    if (!showAllRegionsCheckbox) {
      throw new Error('Show All Regions checkbox not found');
    }
    
    // Debug logging to see what we found
    testController.log(`[${testRunId}] Found checkbox with checked=${showAllRegionsCheckbox.checked}, id="${showAllRegionsCheckbox.id}", class="${showAllRegionsCheckbox.className}"`);
    
    if (showAllRegionsCheckbox.checked) {
      throw new Error('Navigation happened when publisher was disabled');
    }
    testController.reportCondition('Publisher disable prevents navigation', true);

    // 9. Re-enable commonUI publisher
    testController.log(`[${testRunId}] Re-enabling commonUI publisher...`);
    commonUIPublisherCheckbox.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 10. Test disabling regions subscriber
    testController.log(`[${testRunId}] Testing regions subscriber disable...`);
    
    // Uncheck the regions subscriber checkbox
    if (regionsSubscriberCheckbox.checked) {
      regionsSubscriberCheckbox.click();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    
    // Click on "Links House" link again (reuse the element found earlier)
    linksHouseLink.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify that the navigation did not happen (Show All Regions should still be unchecked)
    testController.log(`[${testRunId}] After subscriber disable test - checkbox checked=${showAllRegionsCheckbox.checked}`);
    if (showAllRegionsCheckbox.checked) {
      throw new Error('Navigation happened when subscriber was disabled');
    }
    testController.reportCondition('Subscriber disable prevents navigation', true);

    // 11. Re-enable regions subscriber
    testController.log(`[${testRunId}] Re-enabling regions subscriber...`);
    regionsSubscriberCheckbox.click();
    await new Promise((resolve) => setTimeout(resolve, 100));

    // 12. Test that navigation works when both are enabled
    testController.log(`[${testRunId}] Testing navigation with both enabled...`);
    testController.log(`[${testRunId}] Before final test - checkbox checked=${showAllRegionsCheckbox.checked}`);
    
    linksHouseLink.click();
    await new Promise((resolve) => setTimeout(resolve, 500));
    
    // Verify that the navigation happened (Show All Regions should now be checked)
    testController.log(`[${testRunId}] After final test - checkbox checked=${showAllRegionsCheckbox.checked}`);
    if (!showAllRegionsCheckbox.checked) {
      throw new Error('Navigation did not happen when both publisher and subscriber were enabled');
    }
    testController.reportCondition('Both enabled allows navigation', true);

    testController.log(`[${testRunId}] Events panel module name tracking test completed successfully`);
    testController.reportCondition('Test completed successfully', true);

    return true;

  } catch (error) {
    testController.log(`[${testRunId}] Test failed: ${error.message}`);
    testController.reportCondition(`Test failed: ${error.message}`, false);
    return false;
  }
}

// Register the tests
registerTest({
  id: 'test_events_panel_sender_receiver',
  name: 'Events Panel Sender/Receiver Display',
  description: 'Verifies that modules appearing as both senders and receivers are correctly displayed in the Events panel',
  testFunction: testEventsPanelSenderReceiverDisplay,
  category: 'Events Panel',
  //enabled: false,
  //order: 1
});

registerTest({
  id: 'test_events_panel_module_names',
  name: 'Events Panel Module Name Tracking',
  description: 'Verifies that the Events panel correctly tracks module names and enable/disable functionality works',
  testFunction: testEventsPanelModuleNameTracking,
  category: 'Events Panel',
  //enabled: false,
  //order: 2
});
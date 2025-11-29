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

    // Reset state by loading default rules to ensure clean test environment
    testController.log(`[${testRunId}] Loading default rules to reset state...`);
    await testController.loadALTTPRules();
    testController.log(`[${testRunId}] Default rules loaded successfully`);

    // 1. Activate the Events panel
    testController.log(`[${testRunId}] Activating ${EVENTS_PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID }, 'tests');

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
        50
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
        50
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
        50
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
      const hasSenderSymbol = senderSymbol.includes('⬆') || senderSymbol.includes('[S]');
      
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
          const hasSenderSymbol = senderSymbol.includes('⬆') || senderSymbol.includes('[S]');
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
  let showAllRegionsCheckbox = null; // Declare at function scope for cleanup

  try {
    testController.log(`[${testRunId}] Starting Events panel module name tracking test...`);
    testController.reportCondition('Test started', true);

    // Reset state by loading default rules to ensure clean test environment
    testController.log(`[${testRunId}] Loading default rules to reset state...`);
    await testController.loadALTTPRules();
    testController.log(`[${testRunId}] Default rules loaded successfully`);

    // 1. First activate the Regions panel to trigger subscription to ui:navigateToRegion
    testController.log(`[${testRunId}] Activating regions panel to trigger event subscriptions...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    
    // Wait for regions panel to initialize using polling
    await testController.pollForValue(
      () => document.querySelector('.regions-panel-container'),
      'Regions panel loaded',
      5000,
      50
    );
    
    // 2. Now activate the Events panel  
    testController.log(`[${testRunId}] Activating ${EVENTS_PANEL_ID} panel...`);
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID }, 'tests');

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
        50
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
        50
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
        50
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
        50
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
    }
    
    // Click on "Links House" link in Menu region - look for region link spans
    const linksHouseLink = regionsPanel.querySelector('.region-link[data-region="Links House"], .location-link[data-location="Links House"], span[data-region="Links House"]');
    if (!linksHouseLink) {
      throw new Error('Links House link not found in regions panel');
    }
    
    linksHouseLink.click();
    
    // Verify that the navigation did not happen (Show All Regions should still be unchecked)
    // Look specifically for the "Show All Regions" checkbox with correct ID
    showAllRegionsCheckbox = regionsPanel.querySelector('#show-all-regions');
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

    // 10. Test disabling regions subscriber
    testController.log(`[${testRunId}] Testing regions subscriber disable...`);
    
    // Uncheck the regions subscriber checkbox
    if (regionsSubscriberCheckbox.checked) {
      regionsSubscriberCheckbox.click();
    }
    
    // Click on "Links House" link again (reuse the element found earlier)
    linksHouseLink.click();
    
    // Verify that the navigation did not happen (Show All Regions should still be unchecked)
    testController.log(`[${testRunId}] After subscriber disable test - checkbox checked=${showAllRegionsCheckbox.checked}`);
    if (showAllRegionsCheckbox.checked) {
      throw new Error('Navigation happened when subscriber was disabled');
    }
    testController.reportCondition('Subscriber disable prevents navigation', true);

    // 11. Re-enable regions subscriber
    testController.log(`[${testRunId}] Re-enabling regions subscriber...`);
    regionsSubscriberCheckbox.click();

    // 12. Test that navigation works when both are enabled
    testController.log(`[${testRunId}] Testing navigation with both enabled...`);
    testController.log(`[${testRunId}] Before final test - checkbox checked=${showAllRegionsCheckbox.checked}`);
    
    linksHouseLink.click();
    
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
  } finally {
    // Restore "Show All Regions" checkbox to unchecked state
    if (showAllRegionsCheckbox && showAllRegionsCheckbox.checked) {
      testController.log(`[${testRunId}] Unchecking "Show All Regions" checkbox in cleanup...`);
      showAllRegionsCheckbox.click();
      await testController.pollForCondition(
        () => !showAllRegionsCheckbox.checked,
        'Show All Regions unchecked in cleanup',
        3000,
        50
      );
    }
  }
}

/**
 * Test case for verifying that the Events panel correctly displays non-module publishers
 * and subscribers in the "Additional Event Participants" section.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testEventsPanelAdditionalParticipants(testController) {
  const testRunId = `events-panel-additional-participants-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Events panel additional participants test...`);
    testController.reportCondition('Test started', true);

    // 1. Get access to eventBus directly to register a test publisher
    testController.log(`[${testRunId}] Getting eventBus instance...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    // 2. Register a fake iframe-like publisher directly with eventBus (bypassing centralRegistry)
    const testPublisherId = 'iframe_testFrame';
    const testEventName = 'test:fakeEvent';
    
    testController.log(`[${testRunId}] Registering test publisher ${testPublisherId} for event ${testEventName}...`);
    eventBus.registerPublisher(testEventName, testPublisherId);
    testController.reportCondition('Test publisher registered', true);

    // 3. Also subscribe to the event with a fake subscriber
    const testSubscriberId = 'externalSystem';
    testController.log(`[${testRunId}] Subscribing ${testSubscriberId} to event ${testEventName}...`);
    const unsubscribe = eventBus.subscribe(testEventName, (data) => {
      testController.log(`[${testRunId}] Received test event: ${JSON.stringify(data)}`);
    }, testSubscriberId);
    testController.reportCondition('Test subscriber registered', true);

    // 4. Publish the test event to ensure it's working
    testController.log(`[${testRunId}] Publishing test event...`);
    eventBus.publish(testEventName, { message: 'test data' }, testPublisherId);
    testController.reportCondition('Test event published', true);

    // 5. Activate the Events panel
    testController.log(`[${testRunId}] Activating ${EVENTS_PANEL_ID} panel...`);
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID }, 'tests');
    
    // 5.5. Trigger a refresh of the Events panel data to pick up our newly registered participants
    testController.log(`[${testRunId}] Triggering Events panel refresh...`);
    // First register as publisher for the refresh event, then publish it
    eventBus.registerPublisher('module:stateChanged', 'tests');
    eventBus.publish('module:stateChanged', { moduleId: 'tests' }, 'tests');

    // 6. Wait for the events panel to appear in DOM
    let eventsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          eventsPanelElement = document.querySelector('.events-inspector');
          return eventsPanelElement !== null;
        },
        'Events panel DOM element',
        5000,
        50
      ))
    ) {
      throw new Error('Events panel not found in DOM');
    }
    testController.reportCondition('Events panel found in DOM', true);

    // 7. Wait for the event bus section to load
    let eventBusSection = null;
    if (
      !(await testController.pollForCondition(
        () => {
          eventBusSection = eventsPanelElement.querySelector('.event-bus-section');
          return eventBusSection && eventBusSection.textContent !== 'Loading...';
        },
        'Event bus section loaded',
        MAX_WAIT_TIME,
        50
      ))
    ) {
      throw new Error('Event bus section not loaded');
    }
    testController.reportCondition('Event bus section loaded', true);

    // 8. Look for the "Additional Event Participants" section (now a top-level section)
    let additionalParticipantsSection = null;
    if (
      !(await testController.pollForCondition(
        () => {
          // Look for the section header in the entire events panel, not just event bus section
          const sectionHeaders = eventsPanelElement.querySelectorAll('h2');
          for (const header of sectionHeaders) {
            if (header.textContent.includes('Additional Event Participants')) {
              additionalParticipantsSection = header.closest('details');
              return true;
            }
          }
          return false;
        },
        'Additional Event Participants section found',
        MAX_WAIT_TIME,
        50
      ))
    ) {
      throw new Error('Additional Event Participants section not found');
    }
    testController.reportCondition('Additional Event Participants section found', true);

    // 9. Look for our test event in the additional participants section
    let testEventContainer = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const eventContainers = additionalParticipantsSection.querySelectorAll('.event-bus-event');
          for (const container of eventContainers) {
            const eventTitle = container.querySelector('h4');
            if (eventTitle && eventTitle.textContent.trim() === testEventName) {
              testEventContainer = container;
              return true;
            }
          }
          return false;
        },
        `Test event ${testEventName} found in additional participants`,
        MAX_WAIT_TIME,
        50
      ))
    ) {
      throw new Error(`Test event ${testEventName} not found in additional participants section`);
    }
    testController.reportCondition('Test event found in additional participants section', true);

    // 10. Verify the iframe publisher is listed
    const moduleBlocks = testEventContainer.querySelectorAll('.module-block');
    let iframePublisherFound = false;
    let externalSubscriberFound = false;

    for (const block of moduleBlocks) {
      const moduleName = block.querySelector('.module-name');
      if (moduleName && moduleName.textContent.includes(testPublisherId)) {
        // Check that it has [iframe] label
        const hasIframeLabel = moduleName.textContent.includes('[iframe]');
        if (!hasIframeLabel) {
          throw new Error(`Expected [iframe] label for ${testPublisherId}`);
        }
        
        // Check that it shows as publisher
        const publisherColumn = block.querySelector('.publisher-symbol');
        if (publisherColumn && publisherColumn.textContent.includes('[P]')) {
          iframePublisherFound = true;
        }
      }
      
      if (moduleName && moduleName.textContent.trim() === testSubscriberId) {
        // Check that it shows as subscriber
        const subscriberColumn = block.querySelector('.subscriber-symbol');
        if (subscriberColumn && subscriberColumn.textContent.includes('[S]')) {
          externalSubscriberFound = true;
        }
      }
    }

    if (!iframePublisherFound) {
      throw new Error(`Test iframe publisher ${testPublisherId} not found in additional participants`);
    }
    testController.reportCondition('Test iframe publisher found with [iframe] label', true);

    if (!externalSubscriberFound) {
      throw new Error(`Test external subscriber ${testSubscriberId} not found in additional participants`);
    }
    testController.reportCondition('Test external subscriber found', true);

    // 11. Verify that regular module events are still in the main section (not in additional participants)
    testController.log(`[${testRunId}] Verifying module events are not in additional participants section...`);

    // Look for a known module event that should NOT be in additional participants
    // Note: Some core component events like stateManager:ready may legitimately appear here
    // if the component publishes events without registering them in centralRegistry.
    // We're specifically checking for events that we KNOW are properly registered.
    const moduleEventContainers = additionalParticipantsSection.querySelectorAll('.event-bus-event');
    let moduleEventInAdditional = false;
    let foundEventName = '';

    // List of events that are known to be properly registered and should NOT be in additional participants
    const knownRegisteredEvents = ['ui:activatePanel', 'ui:navigateToRegion'];

    for (const container of moduleEventContainers) {
      const eventTitle = container.querySelector('h4');
      if (eventTitle) {
        const eventName = eventTitle.textContent.trim();
        // Check if this event is in our list of known registered events
        if (knownRegisteredEvents.some(registered => eventName.includes(registered))) {
          moduleEventInAdditional = true;
          foundEventName = eventName;
          break;
        }
      }
    }

    if (moduleEventInAdditional) {
      throw new Error(`Found module event "${foundEventName}" in additional participants section - should only contain non-module participants`);
    }
    testController.reportCondition('Module events correctly excluded from additional participants', true);

    // Clean up - unsubscribe our test subscriber
    testController.log(`[${testRunId}] Cleaning up test subscriber...`);
    unsubscribe();
    testController.reportCondition('Test cleanup completed', true);

    testController.log(`[${testRunId}] Events panel additional participants test completed successfully`);
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

registerTest({
  id: 'test_events_panel_additional_participants',
  name: 'Events Panel Additional Participants',
  description: 'Verifies that the Events panel correctly displays non-module publishers and subscribers in the Additional Event Participants section',
  testFunction: testEventsPanelAdditionalParticipants,
  category: 'Events Panel',
  //enabled: true,
  //order: 3
});
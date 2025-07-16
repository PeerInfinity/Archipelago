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
    eventBus.publish('ui:activatePanel', { panelId: EVENTS_PANEL_ID });
    
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

// Register the test
registerTest({
  id: 'test_events_panel_sender_receiver',
  name: 'Events Panel Sender/Receiver Display',
  description: 'Verifies that modules appearing as both senders and receivers are correctly displayed in the Events panel',
  testFunction: testEventsPanelSenderReceiverDisplay,
  category: 'Events Panel',
  enabled: true,
  order: 1
});
// frontend/modules/tests/testCases/multiplayerTests.js

import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('multiplayerTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[multiplayerTests] ${message}`, ...data);
  }
}

/**
 * Timer Send Test - Client 1
 *
 * This test connects to an Archipelago server and initiates the timer
 * to automatically check all locations. It sets the timer delay to 5 seconds,
 * then presses the "Begin" button to start checking locations.
 *
 * The test passes if:
 * - Successfully connects to the server
 * - Timer starts successfully
 * - All locations are eventually checked
 */
export async function timerSendTest(testController) {
  try {
    testController.log('Starting timerSendTest...');
    testController.reportCondition('Test started', true);

    // Check if we're running in single client mode
    const urlParams = new URLSearchParams(window.location.search);
    const runningSingleClientTest = urlParams.get('runningSingleClientTest') === 'true';

    if (runningSingleClientTest) {
      testController.log('Running in single client mode - will not wait for second client');
    }

    // Subscribe to game:playerJoined EARLY, before connection completes
    // This ensures we don't miss the event if another player is already connected
    let secondClientConnected = false;
    const secondClientHandler = (eventData) => {
      testController.log('Detected player joined:', eventData.player);
      secondClientConnected = true;
    };
    const unsubSecondClient = testController.eventBus.subscribe('game:playerJoined', secondClientHandler, 'tests');

    // Give autoConnect time to establish connection (it runs 500ms after postInit)
    // Poll for connection status instead of waiting for event to avoid race conditions
    testController.log('Waiting for server connection to complete...');

    // Get connection status check function from central registry
    const isHandshakeComplete = window.centralRegistry.getPublicFunction('client', 'isHandshakeComplete');
    const getConnectionInfo = window.centralRegistry.getPublicFunction('client', 'getConnectionInfo');

    if (!isHandshakeComplete) {
      throw new Error('Connection status functions not found in central registry');
    }

    // Wait up to 10 seconds for handshake to complete
    const startTime = Date.now();
    let handshakeComplete = false;
    while (!handshakeComplete && (Date.now() - startTime) < 10000) {
      handshakeComplete = isHandshakeComplete();
      if (!handshakeComplete) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!handshakeComplete) {
      const connInfo = getConnectionInfo ? getConnectionInfo() : null;
      testController.log('Connection info at timeout:', connInfo);
      throw new Error('Failed to connect to server within timeout period');
    }

    const connInfo = getConnectionInfo ? getConnectionInfo() : null;
    testController.log('Connection established:', connInfo);
    testController.reportCondition('Connected to server and ready', true);

    // Wait for rules to be loaded (or check if already loaded)
    testController.log('Waiting for rules to load...');
    const stateManager = testController.stateManager;
    let staticData = stateManager.getStaticData();

    if (!staticData || !staticData.locations) {
      // Rules not yet loaded, wait for the event
      await testController.waitForEvent('stateManager:rulesLoaded', 10000);
      // Retrieve static data after the event
      staticData = stateManager.getStaticData();
    } else {
      testController.log('Rules already loaded');
    }
    testController.reportCondition('Rules loaded', true);
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    // Use Bounce messages to synchronize with Client 2
    // Get ready message functions from central registry
    const sendReadyMessage = window.centralRegistry.getPublicFunction('client', 'sendReadyMessage');
    const waitForReadyMessage = window.centralRegistry.getPublicFunction('client', 'waitForReadyMessage');

    if (!sendReadyMessage || !waitForReadyMessage) {
      throw new Error('Ready message functions not found in central registry');
    }

    // Get the game name from staticData to target the Bounce message
    const gameName = staticData.game_name;
    testController.log(`Using game name for Bounce targeting: ${gameName}`);

    // Only wait for Client 2 if we're not in single client mode
    if (!runningSingleClientTest) {
      // Send "CLIENT1_READY" message to let Client 2 know we're ready
      // Use retry logic since Client 2 might not be connected yet
      testController.log('Sending CLIENT1_READY message with retry...');

      let client2Ready = false;
      const readyPromise = waitForReadyMessage('CLIENT2', 15000); // 15 second total timeout

      // Set up retry interval - send every 2 seconds
      const retryInterval = setInterval(() => {
        if (!client2Ready) {
          testController.log('Sending/retrying CLIENT1_READY message...');
          sendReadyMessage('CLIENT1', { games: [gameName] });
        }
      }, 2000);

      // Send first message immediately
      sendReadyMessage('CLIENT1', { games: [gameName] });
      testController.reportCondition('Sent ready message', true);

      // Wait for Client 2's ready message
      testController.log('Waiting for CLIENT2_READY message...');
      try {
        const bounceData = await readyPromise;
        client2Ready = true;
        clearInterval(retryInterval);
        testController.log('Received CLIENT2_READY message:', bounceData);
        testController.reportCondition('Received ready message from Client 2', true);
      } catch (error) {
        clearInterval(retryInterval);
        testController.log('Timeout waiting for CLIENT2_READY message', 'error');
        testController.reportCondition('Failed to receive Client 2 confirmation', false);
        throw error; // Fail the test
      }
    } else {
      testController.log('Skipping Client 2 synchronization in single client mode');
      testController.reportCondition('Single client mode - skipping Client 2 wait', true);
    }

    // Clean up the playerJoined subscription we no longer need
    unsubSecondClient();

    // Get timer logic and UI references from central registry
    const getTimerLogic = window.centralRegistry.getPublicFunction('timer', 'getTimerLogic');
    const getTimerUI = window.centralRegistry.getPublicFunction('timer', 'getTimerUI');

    if (!getTimerLogic || !getTimerUI) {
      throw new Error('Timer functions not found in central registry');
    }

    const timerLogic = getTimerLogic();
    const timerUI = getTimerUI();

    if (!timerLogic) {
      throw new Error('Timer logic not available');
    }
    if (!timerUI) {
      throw new Error('Timer UI not available');
    }

    testController.reportCondition('Timer components available', true);

    // Set timer delay to 0.1 seconds between checks
    // The timer uses minCheckDelay and maxCheckDelay in seconds
    timerLogic.minCheckDelay = 0.0;
    timerLogic.maxCheckDelay = 0.0;

    testController.log('Timer delay set to 0.1 seconds');
    testController.reportCondition('Timer delay configured', true);

    // Get the control button and click it to begin
    const controlButton = timerUI.controlButton;
    if (!controlButton) {
      throw new Error('Timer control button not found');
    }

    testController.log('Clicking "Begin" button to start timer...');
    controlButton.click();

    // Wait for timer to start
    await testController.waitForEvent('timer:started', 2000);
    testController.reportCondition('Timer started successfully', true);

    // Monitor location checks - wait for all locations to be checked
    // We'll wait for the timer to stop, which happens when no more checks can be dispatched
    testController.log('Waiting for timer to complete all checks...');

    const maxStallTime = 10000; // 10 seconds without progress = stalled
    const timerStartTime = Date.now();

    let timerStopped = false;
    const stopHandler = () => {
      timerStopped = true;
    };

    const unsubStop = testController.eventBus.subscribe('timer:stopped', stopHandler, 'tests');

    // Wait for timer to stop (indicating all checks are done)
    let lastCheckedCount = 0;
    let lastProgressTime = Date.now();

    while (!timerStopped) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second

      const snapshot = stateManager.getSnapshot();
      const currentCheckedCount = snapshot?.checkedLocations?.length || 0;

      // Check if progress has stalled
      if (currentCheckedCount > lastCheckedCount) {
        lastCheckedCount = currentCheckedCount;
        lastProgressTime = Date.now();
      } else {
        const timeSinceProgress = Date.now() - lastProgressTime;
        if (timeSinceProgress > maxStallTime) {
          throw new Error(
            `Test appears to be stalled - no progress for ${Math.floor(timeSinceProgress / 1000)} seconds ` +
            `(${currentCheckedCount} locations checked)`
          );
        }
      }

      // Log progress periodically
      if ((Date.now() - timerStartTime) % 10000 < 1000) { // Every 10 seconds
        if (snapshot) {
          testController.log(`Progress: ${currentCheckedCount} locations checked`);
        }
      }
    }

    unsubStop();

    if (!timerStopped) {
      throw new Error('Timer did not stop within timeout period');
    }

    testController.reportCondition('Timer completed all checks', true);

    // Verify that locations were actually checked
    const finalSnapshot = stateManager.getSnapshot();

    if (!finalSnapshot) {
      throw new Error('Could not get final snapshot');
    }

    const checkedCount = finalSnapshot.checkedLocations?.length || 0;

    // staticData was already loaded at the start of the test
    if (staticData && staticData.locations) {
      testController.log(`DEBUG: staticData.locations type: ${staticData.locations.constructor.name}`);
      testController.log(`DEBUG: staticData.locations is Map: ${staticData.locations instanceof Map}`);
      testController.log(`DEBUG: staticData.locations is Array: ${Array.isArray(staticData.locations)}`);

      // Handle Map (Phase 3.2 format), Array, or Object (legacy)
      const locationsArray = staticData.locations instanceof Map
        ? Array.from(staticData.locations.values())
        : (Array.isArray(staticData.locations)
          ? staticData.locations
          : Object.values(staticData.locations));

      testController.log(`DEBUG: locationsArray length: ${locationsArray.length}`);

      // Debug: Check first few locations
      if (locationsArray.length > 0) {
        testController.log(`DEBUG: First location sample: ${JSON.stringify(locationsArray[0])}`);
        testController.log(`DEBUG: First 3 location IDs: ${locationsArray.slice(0, 3).map(l => l.id).join(', ')}`);
      }

      // Count manually-checkable locations (those with IDs > 0)
      // Locations with id=0 are events that get checked automatically, not by the timer
      const manuallyCheckableLocations = locationsArray.filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;
      const totalLocations = locationsArray.length; // All locations including events

      testController.log(`Final result: ${checkedCount} locations checked`);
      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);
      testController.log(`Total locations (including events): ${totalLocations}`);

      // Test passes if ALL locations were checked (including auto-checked events)
      // The timer checks manually-checkable locations, but events should also be auto-collected
      if (checkedCount >= totalLocations) {
        testController.reportCondition(
          `All ${totalLocations} locations successfully checked (${totalManuallyCheckable} manual + ${totalLocations - totalManuallyCheckable} events)`,
          true
        );
      } else if (checkedCount >= totalManuallyCheckable) {
        testController.reportCondition(
          `Only ${checkedCount}/${totalLocations} locations checked - ${totalLocations - checkedCount} event locations missing - TEST FAILED`,
          false
        );
      } else {
        testController.reportCondition(
          `Only ${checkedCount}/${totalManuallyCheckable} manually-checkable locations were checked - TEST FAILED`,
          false
        );
      }
    } else {
      testController.reportCondition(`${checkedCount} locations checked (no static data to verify)`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerSendTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Receive Test - Client 2
 *
 * This test connects to an Archipelago server and monitors for location
 * check messages triggered by another client (running timerSendTest).
 *
 * The test passes if:
 * - Successfully connects to the server
 * - Receives location check messages from the other client
 * - All locations end up being checked
 */
export async function timerReceiveTest(testController) {
  try {
    testController.log('Starting timerReceiveTest...');
    testController.reportCondition('Test started', true);

    // Wait for connection to be established (autoConnect via URL params)
    // Poll for connection status instead of waiting for event to avoid race conditions
    testController.log('Waiting for autoConnect to establish connection...');

    // Get connection status check function from central registry
    const isHandshakeComplete = window.centralRegistry.getPublicFunction('client', 'isHandshakeComplete');
    const getConnectionInfo = window.centralRegistry.getPublicFunction('client', 'getConnectionInfo');

    if (!isHandshakeComplete) {
      throw new Error('Connection status functions not found in central registry');
    }

    // Wait up to 10 seconds for handshake to complete
    const startTime = Date.now();
    let handshakeComplete = false;
    while (!handshakeComplete && (Date.now() - startTime) < 10000) {
      handshakeComplete = isHandshakeComplete();
      if (!handshakeComplete) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (!handshakeComplete) {
      const connInfo = getConnectionInfo ? getConnectionInfo() : null;
      testController.log('Connection info at timeout:', connInfo);
      throw new Error('Failed to connect to server within timeout period');
    }

    const connInfo = getConnectionInfo ? getConnectionInfo() : null;
    testController.log('Connection established:', connInfo);
    testController.reportCondition('Connected to server', true);

    // Wait for rules to be loaded (or check if already loaded)
    testController.log('Waiting for rules to load...');
    const stateManager = testController.stateManager;
    let staticData = stateManager.getStaticData();

    if (!staticData || !staticData.locations) {
      // Rules not yet loaded, wait for the event
      await testController.waitForEvent('stateManager:rulesLoaded', 10000);
      // Retrieve static data after the event
      staticData = stateManager.getStaticData();
    } else {
      testController.log('Rules already loaded');
    }
    testController.reportCondition('Rules loaded', true);
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    // Handle Map (Phase 3.2 format), Array, or Object (legacy)
    const locationsArray = staticData.locations instanceof Map
      ? Array.from(staticData.locations.values())
      : (Array.isArray(staticData.locations)
        ? staticData.locations
        : Object.values(staticData.locations));

    // Count ALL locations (Client 2 receives ALL checks from Client 1, including auto-checked events)
    const totalCheckable = locationsArray.length;

    testController.log(`Expecting to receive checks for ${totalCheckable} locations (includes all events)`);
    testController.reportCondition('Location data loaded', true);

    // Use Bounce messages to synchronize with Client 1
    // Get ready message functions from central registry
    const sendReadyMessage = window.centralRegistry.getPublicFunction('client', 'sendReadyMessage');
    const waitForReadyMessage = window.centralRegistry.getPublicFunction('client', 'waitForReadyMessage');

    if (!sendReadyMessage || !waitForReadyMessage) {
      throw new Error('Ready message functions not found in central registry');
    }

    // Get the game name from staticData to target the Bounce message
    const gameName = staticData.game_name;
    testController.log(`Using game name for Bounce targeting: ${gameName}`);

    // Wait for Client 1's ready message first
    testController.log('Waiting for CLIENT1_READY message...');
    try {
      const bounceData = await waitForReadyMessage('CLIENT1', 10000); // 10 second timeout
      testController.log('Received CLIENT1_READY message:', bounceData);
      testController.reportCondition('Received ready message from Client 1', true);
    } catch (error) {
      testController.log('Timeout waiting for CLIENT1_READY message', 'error');
      testController.reportCondition('Failed to receive Client 1 confirmation', false);
      throw error; // Fail the test
    }

    // Send our own ready message
    testController.log('Sending CLIENT2_READY message...');
    sendReadyMessage('CLIENT2', { games: [gameName] });
    testController.reportCondition('Sent ready message', true);

    // Track received location checks
    let receivedChecks = 0;
    const checkedLocations = new Set();

    // Subscribe to snapshot updates to monitor incoming location checks
    const snapshotHandler = (eventData) => {
      if (eventData && eventData.snapshot && eventData.snapshot.checkedLocations) {
        const newCheckedCount = eventData.snapshot.checkedLocations.length;

        // Check for new locations
        eventData.snapshot.checkedLocations.forEach(locName => {
          if (!checkedLocations.has(locName)) {
            checkedLocations.add(locName);
            receivedChecks++;

            // Log every few checks to avoid spam
            if (receivedChecks % 5 === 0 || receivedChecks === totalCheckable) {
              testController.log(`Received ${receivedChecks}/${totalCheckable} location checks`);
            }
          }
        });
      }
    };

    const unsubSnapshot = testController.eventBus.subscribe(
      'stateManager:snapshotUpdated',
      snapshotHandler,
      'tests'
    );

    // Wait for all locations to be checked
    testController.log('Waiting to receive all location checks...');

    const maxStallTime = 10000; // 10 seconds without progress = stalled
    const progressStartTime = Date.now();
    let lastReceivedCount = 0;
    let lastProgressTime = Date.now();

    while (receivedChecks < totalCheckable) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second

      // Check if progress has stalled
      if (receivedChecks > lastReceivedCount) {
        lastReceivedCount = receivedChecks;
        lastProgressTime = Date.now();
      } else {
        const timeSinceProgress = Date.now() - lastProgressTime;
        if (timeSinceProgress > maxStallTime) {
          throw new Error(
            `Test appears to be stalled - no progress for ${Math.floor(timeSinceProgress / 1000)} seconds ` +
            `(${receivedChecks} location checks received)`
          );
        }
      }

      // Log progress periodically
      if ((Date.now() - progressStartTime) % 15000 < 1000) { // Every 15 seconds
        testController.log(`Progress: received ${receivedChecks}/${totalCheckable} checks`);
      }
    }

    unsubSnapshot();

    if (receivedChecks < totalCheckable) {
      testController.log(
        `Warning: Only received ${receivedChecks}/${totalCheckable} checks within timeout`,
        'warn'
      );
      testController.reportCondition(
        `Received ${receivedChecks}/${totalCheckable} location checks (timeout)`,
        receivedChecks > 0 // Pass if we received at least some checks
      );
    } else {
      testController.reportCondition(
        `All ${totalCheckable} location checks received`,
        true
      );
    }

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final state: ${finalCheckedCount} locations marked as checked`);
    testController.reportCondition('Final state verified', finalCheckedCount === totalCheckable);

    await testController.completeTest(receivedChecks >= totalCheckable);
  } catch (error) {
    testController.log(`Error in timerReceiveTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register the tests
registerTest({
  id: 'timerSendTest',
  name: 'timerSendTest',
  category: 'Multiplayer',
  description: 'Connect to server and send location checks via timer (Client 1)',
  testFunction: timerSendTest,
});

registerTest({
  id: 'timerReceiveTest',
  name: 'timerReceiveTest',
  category: 'Multiplayer',
  description: 'Connect to server and receive location checks from other client (Client 2)',
  testFunction: timerReceiveTest,
});

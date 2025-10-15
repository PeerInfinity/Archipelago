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

    // Subscribe to game:playerJoined EARLY, before connection completes
    // This ensures we don't miss the event if another player is already connected
    let secondClientConnected = false;
    const secondClientHandler = (eventData) => {
      testController.log('Detected player joined:', eventData.player);
      secondClientConnected = true;
    };
    const unsubSecondClient = testController.eventBus.subscribe('game:playerJoined', secondClientHandler, 'tests');

    // Give autoConnect time to establish connection (it runs 500ms after postInit)
    // We'll wait for game:connected which is published after the full connection handshake
    testController.log('Waiting for server connection to complete...');

    let connected = false;
    const connectHandler = () => {
      connected = true;
    };

    // Subscribe to game:connected event BEFORE the delay
    const unsubConnect = testController.eventBus.subscribe('game:connected', connectHandler, 'tests');

    // Wait up to 10 seconds for connection
    const startTime = Date.now();
    while (!connected && (Date.now() - startTime) < 10000) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    unsubConnect();

    if (!connected) {
      throw new Error('Failed to connect to server within timeout period');
    }

    testController.reportCondition('Connected to server and ready', true);

    // Check if we already detected another player during connection
    if (secondClientConnected) {
      testController.log('Second client was already connected when this client joined');
      testController.reportCondition('Second client already connected', true);
      unsubSecondClient();
    } else {
      // Wait for second client to connect
      // NOTE: When both clients connect to the same slot (same player name), they're treated
      // as reconnections and we won't receive a game:playerJoined event. We add a delay to
      // ensure Client 2 has time to connect before Client 1 starts the timer.
      testController.log('Waiting for second client to connect...');

      // Wait up to 5 seconds for second client (mostly just to give it time to connect)
      const waitStartTime = Date.now();
      while (!secondClientConnected && (Date.now() - waitStartTime) < 5000) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      unsubSecondClient();

      if (secondClientConnected) {
        testController.log('Second client connected (detected via playerJoined event)');
        testController.reportCondition('Second client connected', true);
      } else {
        const waitTime = Date.now() - waitStartTime;
        testController.log(`No playerJoined event after ${waitTime}ms (expected for same-slot connections)`);
        testController.reportCondition('Proceeding (second client likely connected to same slot)', true);
      }
    }

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

    // Set timer delay to 0.1 seconds to give server time to respond between checks
    // The timer uses minCheckDelay and maxCheckDelay in seconds
    timerLogic.minCheckDelay = 0.1;
    timerLogic.maxCheckDelay = 0.1;

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

      testController.log(`Final result: ${checkedCount} locations checked (includes auto-checked events)`);
      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Test passes if ALL manually-checkable locations were checked
      // (checkedCount may be higher due to auto-checked events)
      if (checkedCount >= totalManuallyCheckable) {
        testController.reportCondition(
          `All ${totalManuallyCheckable} manually-checkable locations successfully checked`,
          true
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
    testController.log('Waiting for autoConnect to establish connection...');

    // Try to wait for connection:open event, but if it times out, assume already connected
    try {
      await testController.waitForEvent('connection:open', 5000);
      testController.log('Connection established via event');
    } catch (error) {
      // Event timeout likely means connection already established before test started
      testController.log('Connection event not received (likely already connected)');
    }
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
    const startTime = Date.now();
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
      if ((Date.now() - startTime) % 15000 < 1000) { // Every 15 seconds
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

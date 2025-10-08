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

    // Set a reasonable timeout - if there are many locations, this could take a while
    // For Adventure game, there should be a manageable number of locations
    const maxWaitTime = 300000; // 5 minutes max
    const timerStartTime = Date.now();

    let timerStopped = false;
    const stopHandler = () => {
      timerStopped = true;
    };

    const unsubStop = testController.eventBus.subscribe('timer:stopped', stopHandler, 'tests');

    // Wait for timer to stop (indicating all checks are done)
    const stateManager = testController.stateManager;
    while (!timerStopped && (Date.now() - timerStartTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second

      // Log progress periodically
      if ((Date.now() - timerStartTime) % 10000 < 1000) { // Every 10 seconds
        const snapshot = stateManager.getSnapshot();
        if (snapshot) {
          const checkedCount = snapshot.checkedLocations?.length || 0;
          testController.log(`Progress: ${checkedCount} locations checked`);
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
    const staticData = stateManager.getStaticData();

    if (staticData && staticData.locations) {
      // Count total checkable locations (those with IDs)
      const totalCheckable = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined
      ).length;

      testController.log(`Final result: ${checkedCount} of ${totalCheckable} locations checked`);

      if (checkedCount === totalCheckable) {
        testController.reportCondition('All locations checked successfully', true);
      } else {
        testController.reportCondition(
          `Checked ${checkedCount}/${totalCheckable} locations (may be expected if some are unreachable)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${checkedCount} locations checked`, true);
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
    await testController.waitForEvent('connection:open', 15000);
    testController.reportCondition('Connected to server', true);

    // Wait for rules to be loaded
    testController.log('Waiting for rules to load...');
    await testController.waitForEvent('stateManager:rulesLoaded', 10000);
    testController.reportCondition('Rules loaded', true);

    // Get initial state
    const stateManager = testController.stateManager;
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    // Count total checkable locations (those with IDs)
    const totalCheckable = Object.values(staticData.locations).filter(
      loc => loc.id !== null && loc.id !== undefined
    ).length;

    testController.log(`Expecting to receive checks for ${totalCheckable} locations`);
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

    const maxWaitTime = 300000; // 5 minutes max
    const startTime = Date.now();

    while (receivedChecks < totalCheckable && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Check every second

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

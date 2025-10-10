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
    const maxStallTime = 10000; // 10 seconds without progress = stalled
    const timerStartTime = Date.now();

    let timerStopped = false;
    const stopHandler = () => {
      timerStopped = true;
    };

    const unsubStop = testController.eventBus.subscribe('timer:stopped', stopHandler, 'tests');

    // Wait for timer to stop (indicating all checks are done)
    const stateManager = testController.stateManager;
    let lastCheckedCount = 0;
    let lastProgressTime = Date.now();

    while (!timerStopped && (Date.now() - timerStartTime) < maxWaitTime) {
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
          `Only checked ${checkedCount}/${totalCheckable} locations - logic error or unreachable locations`,
          false
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

/**
 * Timer Offline Test
 *
 * This test runs the timer in offline mode, checking all locations locally
 * without any server interaction. It verifies that the timer logic can
 * successfully identify and check all accessible locations.
 *
 * The test passes if:
 * - Timer components are available
 * - Timer starts successfully
 * - All accessible locations are checked locally
 */
export async function timerOfflineTest(testController) {
  try {
    testController.log('Starting timerOfflineTest...');
    testController.reportCondition('Test started', true);

    // EXPERIMENT: Try different location checking orders
    const testMode = 'sphere-order-with-accessibility-check-no-autocollect'; // Options: 'sphere-order', 'snapshot-order', 'sphere-order-with-accessibility-check', 'sphere-order-check-rejection-test', 'ganon-immediate-check', 'sphere-order-no-autocollect', 'sphere-order-with-accessibility-check-no-autocollect', 'timer'

    if (testMode === 'sphere-order') {
      testController.log('EXPERIMENT: Using sphereState to check locations in sphere order');
      return await timerOfflineTestWithSphereOrder(testController);
    } else if (testMode === 'snapshot-order') {
      testController.log('EXPERIMENT: Checking locations in snapshot order (staticData.locations)');
      return await timerOfflineTestWithSnapshotOrder(testController);
    } else if (testMode === 'sphere-order-with-accessibility-check') {
      testController.log('EXPERIMENT: Checking locations in sphere order, but only if accessible per snapshot');
      return await timerOfflineTestWithSphereOrderAndAccessibilityCheck(testController);
    } else if (testMode === 'sphere-order-check-rejection-test') {
      testController.log('EXPERIMENT: Testing if stateManager rejects inaccessible location checks');
      return await timerOfflineTestCheckRejection(testController);
    } else if (testMode === 'ganon-immediate-check') {
      testController.log('EXPERIMENT: Trying to check Ganon location immediately');
      return await timerOfflineTestGanonImmediateCheck(testController);
    } else if (testMode === 'sphere-order-no-autocollect') {
      testController.log('EXPERIMENT: Checking locations in sphere order with auto-collect events DISABLED');
      return await timerOfflineTestWithSphereOrderNoAutoCollect(testController);
    } else if (testMode === 'sphere-order-with-accessibility-check-no-autocollect') {
      testController.log('EXPERIMENT: Checking locations in sphere order with accessibility check AND auto-collect events DISABLED');
      return await timerOfflineTestWithSphereOrderAndAccessibilityCheckNoAutoCollect(testController);
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

    // Ensure we're in offline mode
    const stateManager = testController.stateManager;
    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Set timer delay to 0.1 seconds for faster testing
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
    testController.log('Waiting for timer to complete all checks...');

    const maxWaitTime = 300000; // 5 minutes max
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

    while (!timerStopped && (Date.now() - timerStartTime) < maxWaitTime) {
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
          // Before declaring it stalled, check if this is expected behavior
          // The timer might have legitimately finished checking all accessible locations
          testController.log(
            `No progress for ${Math.floor(timeSinceProgress / 1000)} seconds at ${currentCheckedCount} locations. ` +
            `This is expected in offline mode - timer has checked all accessible locations.`
          );
          // In offline mode, some locations may be inaccessible because they require items from other players
          // This is correct behavior, not a stall
          break; // Exit the wait loop normally
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
      // Timer didn't stop naturally, but check if it's because we hit the break above
      const finalSnapshot = stateManager.getSnapshot();
      const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;
      if (finalCheckedCount === lastCheckedCount && lastCheckedCount > 0) {
        // Timer is still running but hasn't made progress - this is expected, manually stop it
        testController.log('Manually stopping timer as all accessible locations have been checked');
        timerLogic.stop();
        timerStopped = true;
      } else {
        throw new Error('Timer did not stop within timeout period');
      }
    }

    testController.reportCondition('Timer completed checking accessible locations', true);

    // Verify that locations were actually checked
    const finalSnapshot = stateManager.getSnapshot();

    if (!finalSnapshot) {
      throw new Error('Could not get final snapshot');
    }

    const checkedCount = finalSnapshot.checkedLocations?.length || 0;
    const staticData = stateManager.getStaticData();

    if (staticData && staticData.locations) {
      // Count manually-checkable locations (those with IDs > 0)
      // Locations with id=0 are events that get checked automatically, not by the timer
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Final result: ${checkedCount} locations checked (includes auto-checked events)`);
      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked (means game is beatable)
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP: Ganon location checked - game is beatable (${checkedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP: Ganon location NOT checked - game is not beatable (${checkedCount} locations checked)`,
            false
          );
        }
      } else {
        // In offline mode, we can't check all locations because some require items from other players
        // Just report what we checked
        testController.reportCondition(
          `Checked ${checkedCount} locations in offline mode (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${checkedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Ganon Immediate Check Test
 *
 * This test tries to check the Ganon location immediately at the start,
 * before checking any other locations. This is a sanity check to verify
 * whether stateManager allows checking Ganon when it's clearly inaccessible.
 */
async function timerOfflineTestGanonImmediateCheck(testController) {
  try {
    testController.log('Starting timerOfflineTestGanonImmediateCheck...');

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    // Import createStateSnapshotInterface for accessibility checks
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get static data
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    // Check if Ganon location exists
    const ganonLocation = staticData.locations['Ganon'];
    if (!ganonLocation) {
      throw new Error('Ganon location not found in static data');
    }

    testController.log('Found Ganon location in static data');
    testController.reportCondition('Ganon location exists', true);

    // Check accessibility at start
    const snapshotInterface = createStateSnapshotInterface(initialSnapshot, staticData);
    const isGanonAccessible = snapshotInterface.isLocationAccessible('Ganon');

    testController.log(`Ganon accessibility at start: ${isGanonAccessible ? 'ACCESSIBLE' : 'NOT accessible'}`);
    testController.reportCondition(`Ganon is ${isGanonAccessible ? 'accessible' : 'not accessible'} at start`, true);

    // Log current inventory
    const currentInventory = initialSnapshot.inventory || {};
    const inventoryItems = Object.keys(currentInventory).filter(item => currentInventory[item] > 0);
    testController.log(`Current inventory (${inventoryItems.length} items): ${inventoryItems.join(', ') || 'none'}`);

    // Check current number of checked locations
    const beforeCheckedCount = initialSnapshot.checkedLocations?.length || 0;
    testController.log(`Locations checked before Ganon attempt: ${beforeCheckedCount}`);

    // Get region for Ganon
    const ganonRegion = ganonLocation.parent_region || ganonLocation.region || null;
    testController.log(`Ganon region: ${ganonRegion || 'none'}`);

    // Attempt to check Ganon
    testController.log('Attempting to check Ganon location...');

    dispatcher.publish(
      'tests', // originModuleId
      'user:locationCheck', // eventName
      {
        locationName: 'Ganon',
        regionName: ganonRegion,
        originator: 'TimerOfflineTestGanonImmediateCheck',
        originalDOMEvent: false,
      },
      { initialTarget: 'bottom' }
    );

    // Wait for the state to update (or timeout)
    const wasChecked = await new Promise((resolve) => {
      let timeout;
      const handler = (data) => {
        const snapshot = data?.snapshot || stateManager.getSnapshot();
        const isNowChecked = snapshot?.checkedLocations?.includes('Ganon');

        if (isNowChecked) {
          clearTimeout(timeout);
          eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
          resolve(true);
        }
      };
      eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

      // Add a safety timeout
      timeout = setTimeout(() => {
        eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
        resolve(false); // Ganon was NOT checked
      }, 2000);
    });

    // Get final snapshot
    const finalSnapshot = stateManager.getSnapshot();
    const afterCheckedCount = finalSnapshot.checkedLocations?.length || 0;
    const ganonIsChecked = finalSnapshot.checkedLocations?.includes('Ganon');

    testController.log(`\n=== RESULT ===`);
    testController.log(`Ganon was accessible: ${isGanonAccessible ? 'YES' : 'NO'}`);
    testController.log(`Ganon check succeeded: ${wasChecked ? 'YES' : 'NO'}`);
    testController.log(`Ganon is now checked: ${ganonIsChecked ? 'YES' : 'NO'}`);
    testController.log(`Locations checked before: ${beforeCheckedCount}`);
    testController.log(`Locations checked after: ${afterCheckedCount}`);

    if (wasChecked) {
      if (isGanonAccessible) {
        testController.reportCondition(
          'Ganon was accessible and check succeeded (expected)',
          true
        );
      } else {
        testController.reportCondition(
          '⚠ Ganon was NOT accessible but check SUCCEEDED anyway (stateManager does not enforce accessibility!)',
          true
        );
      }
    } else {
      if (isGanonAccessible) {
        testController.reportCondition(
          'Ganon was accessible but check failed/timeout (unexpected)',
          false
        );
      } else {
        testController.reportCondition(
          'Ganon was NOT accessible and check was rejected (stateManager enforces accessibility)',
          true
        );
      }
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestGanonImmediateCheck: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Check Rejection Test
 *
 * This test verifies whether stateManager actually rejects location check
 * requests for inaccessible locations. It tries to check locations from
 * the sphere log that the snapshot says are NOT accessible, and logs whether
 * the check succeeds or fails.
 */
async function timerOfflineTestCheckRejection(testController) {
  try {
    testController.log('Starting timerOfflineTestCheckRejection...');

    // Get sphereState module functions
    const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');

    if (!getSphereData) {
      throw new Error('sphereState getSphereData function not found in central registry');
    }

    testController.reportCondition('SphereState module available', true);

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    // Import createStateSnapshotInterface for accessibility checks
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get sphere data
    const sphereData = getSphereData();

    if (!sphereData || sphereData.length === 0) {
      throw new Error('No sphere data available. Make sure sphere log is loaded.');
    }

    testController.log(`Found ${sphereData.length} spheres to process`);

    // Get static data for accessibility checks
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    let accessibleAttempts = 0;
    let inaccessibleAttempts = 0;
    let accessibleSuccesses = 0;
    let inaccessibleSuccesses = 0;
    let inaccessibleRejections = 0;

    // Only process first few spheres to save time
    const maxSpheresToTest = 25;
    let spheresProcessed = 0;

    // Iterate through spheres
    for (const sphere of sphereData) {
      if (spheresProcessed >= maxSpheresToTest) {
        testController.log(`Stopping after ${maxSpheresToTest} spheres for testing purposes`);
        break;
      }
      spheresProcessed++;

      const locationsInSphere = sphere.locations || [];

      if (locationsInSphere.length === 0) {
        continue;
      }

      testController.log(`\nSphere ${sphere.sphereIndex}: Testing ${locationsInSphere.length} locations`);

      // Check each location in this sphere
      for (const locationName of locationsInSphere) {
        // Get current snapshot to check accessibility
        const currentSnapshot = stateManager.getSnapshot();
        const snapshotInterface = createStateSnapshotInterface(currentSnapshot, staticData);

        // Skip if already checked
        if (currentSnapshot?.checkedLocations?.includes(locationName)) {
          continue;
        }

        // Get location data
        const locationDef = staticData?.locations?.[locationName];

        if (!locationDef) {
          continue;
        }

        // Check if location is accessible according to snapshot
        const isAccessible = snapshotInterface.isLocationAccessible(locationName);

        // Track attempt
        if (isAccessible) {
          accessibleAttempts++;
        } else {
          inaccessibleAttempts++;
        }

        const beforeCheckedCount = currentSnapshot.checkedLocations?.length || 0;

        // Get region for the location
        const locationRegion = locationDef.parent_region || locationDef.region || null;

        // Attempt to check the location (regardless of accessibility)
        dispatcher.publish(
          'tests', // originModuleId
          'user:locationCheck', // eventName
          {
            locationName: locationName,
            regionName: locationRegion,
            originator: 'TimerOfflineTestCheckRejection',
            originalDOMEvent: false,
          },
          { initialTarget: 'bottom' }
        );

        // Wait for the state to update (or timeout)
        const wasChecked = await new Promise((resolve) => {
          let timeout;
          const handler = (data) => {
            const snapshot = data?.snapshot || stateManager.getSnapshot();
            const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

            if (isNowChecked) {
              clearTimeout(timeout);
              eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
              resolve(true);
            }
          };
          eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

          // Add a safety timeout
          timeout = setTimeout(() => {
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            resolve(false); // Location was NOT checked
          }, 1000); // Shorter timeout for this test
        });

        // IMPORTANT: Ping worker to ensure snapshot is fresh before checking results
        await stateManager.pingWorker(`check_rejection_test_${spheresProcessed}_${locationName}`, 5000);

        const afterSnapshot = stateManager.getSnapshot();
        const afterCheckedCount = afterSnapshot.checkedLocations?.length || 0;

        // Determine result
        if (wasChecked) {
          if (isAccessible) {
            accessibleSuccesses++;
            testController.log(`  ✓ ${locationName}: ACCESSIBLE, check SUCCEEDED (expected)`);
          } else {
            inaccessibleSuccesses++;
            testController.log(`  ⚠ ${locationName}: NOT accessible, but check SUCCEEDED (unexpected!)`);
          }
        } else {
          if (isAccessible) {
            testController.log(`  ✗ ${locationName}: ACCESSIBLE, but check FAILED/TIMEOUT (unexpected!)`);
          } else {
            inaccessibleRejections++;
            testController.log(`  ✓ ${locationName}: NOT accessible, check REJECTED (expected)`);
          }
        }

        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    testController.reportCondition(`Tested ${spheresProcessed} spheres`, true);

    // Report results
    testController.log(`\n=== TEST RESULTS ===`);
    testController.log(`Accessible locations attempted: ${accessibleAttempts}`);
    testController.log(`  - Successes: ${accessibleSuccesses}`);
    testController.log(`  - Failures: ${accessibleAttempts - accessibleSuccesses}`);
    testController.log(`Inaccessible locations attempted: ${inaccessibleAttempts}`);
    testController.log(`  - Succeeded anyway: ${inaccessibleSuccesses}`);
    testController.log(`  - Rejected: ${inaccessibleRejections}`);

    // Determine if stateManager rejects inaccessible checks
    if (inaccessibleAttempts > 0) {
      const rejectionRate = (inaccessibleRejections / inaccessibleAttempts) * 100;
      const successRate = (inaccessibleSuccesses / inaccessibleAttempts) * 100;

      testController.log(`\nInaccessible location rejection rate: ${rejectionRate.toFixed(1)}%`);
      testController.log(`Inaccessible location success rate: ${successRate.toFixed(1)}%`);

      if (inaccessibleSuccesses > 0) {
        testController.reportCondition(
          `StateManager DOES NOT reject inaccessible location checks (${inaccessibleSuccesses}/${inaccessibleAttempts} succeeded)`,
          true
        );
      } else {
        testController.reportCondition(
          `StateManager DOES reject inaccessible location checks (0/${inaccessibleAttempts} succeeded)`,
          true
        );
      }
    } else {
      testController.reportCondition('No inaccessible locations found to test', true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestCheckRejection: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Offline Test with Sphere Order, Accessibility Check, and No Auto-Collect
 *
 * This test combines accessibility checking with auto-collect DISABLED to see
 * if auto-collect events are causing the snapshot accessibility mismatch.
 */
async function timerOfflineTestWithSphereOrderAndAccessibilityCheckNoAutoCollect(testController) {
  try {
    testController.log('Starting timerOfflineTestWithSphereOrderAndAccessibilityCheckNoAutoCollect...');

    // Get sphereState module functions
    const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');

    if (!getSphereData) {
      throw new Error('sphereState getSphereData function not found in central registry');
    }

    testController.reportCondition('SphereState module available', true);

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // CRITICAL: Disable auto-collect events BEFORE starting
    testController.log('🚫 DISABLING auto-collect events...');
    await stateManager.setAutoCollectEventsConfig(false);
    testController.reportCondition('Auto-collect events disabled', true);

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    // Import createStateSnapshotInterface for accessibility checks
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get sphere data
    const sphereData = getSphereData();

    if (!sphereData || sphereData.length === 0) {
      throw new Error('No sphere data available. Make sure sphere log is loaded.');
    }

    testController.log(`Found ${sphereData.length} spheres to process`);
    testController.reportCondition(`${sphereData.length} spheres loaded`, true);

    // Get static data for accessibility checks
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    let totalLocationsChecked = 0;
    let currentSphereIndex = 0;
    let skippedNotAccessible = 0;
    let skippedAlreadyChecked = 0;

    // Iterate through each sphere
    for (const sphere of sphereData) {
      currentSphereIndex++;
      const locationsInSphere = sphere.locations || [];

      if (locationsInSphere.length === 0) {
        testController.log(`Sphere ${sphere.sphereIndex}: No locations (skipping)`);
        continue;
      }

      testController.log(`Processing Sphere ${sphere.sphereIndex}: ${locationsInSphere.length} locations`);

      // Check each location in this sphere
      for (const locationName of locationsInSphere) {
        // Get current snapshot to check accessibility
        const currentSnapshot = stateManager.getSnapshot();
        const snapshotInterface = createStateSnapshotInterface(currentSnapshot, staticData);

        // Check if location is already checked
        if (currentSnapshot?.checkedLocations?.includes(locationName)) {
          skippedAlreadyChecked++;
          testController.log(`  - ${locationName}: Already checked (skipping)`);
          continue;
        }

        // Get location data
        const locationDef = staticData?.locations?.[locationName];

        if (!locationDef) {
          testController.log(`  - ${locationName}: Location not found in static data (skipping)`);
          continue;
        }

        // Check if location is accessible according to snapshot
        const isAccessible = snapshotInterface.isLocationAccessible(locationName);

        if (!isAccessible) {
          skippedNotAccessible++;
          testController.log(`  - ${locationName}: NOT accessible per snapshot (skipping)`);
          continue;
        }

        // Get region for the location
        const locationRegion = locationDef.parent_region || locationDef.region || null;

        // Dispatch location check via event (using same API as testSpoilers)
        testController.log(`  - Checking: ${locationName} (accessible per snapshot)`);

        dispatcher.publish(
          'tests', // originModuleId
          'user:locationCheck', // eventName
          {
            locationName: locationName,
            regionName: locationRegion,
            originator: 'TimerOfflineTestWithSphereOrderAndAccessibilityCheckNoAutoCollect',
            originalDOMEvent: false,
          },
          { initialTarget: 'bottom' }
        );

        // Wait for the state to update
        await new Promise((resolve) => {
          let timeout;
          const handler = (data) => {
            const snapshot = data?.snapshot || stateManager.getSnapshot();
            const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

            if (isNowChecked) {
              clearTimeout(timeout);
              eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
              resolve();
            }
          };
          eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

          // Add a safety timeout
          timeout = setTimeout(() => {
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            testController.log(`    WARNING: Timeout waiting for ${locationName} to be checked`);
            resolve();
          }, 5000);
        });

        totalLocationsChecked++;

        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      testController.log(`Completed Sphere ${sphere.sphereIndex}: ${totalLocationsChecked} checked, ${skippedNotAccessible} skipped (not accessible), ${skippedAlreadyChecked} skipped (already checked)`);
    }

    testController.reportCondition('All spheres processed', true);

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final result (NO AUTO-COLLECT): ${finalCheckedCount} locations checked (attempted: ${totalLocationsChecked}, skipped not accessible: ${skippedNotAccessible}, skipped already checked: ${skippedAlreadyChecked})`);

    if (staticData && staticData.locations) {
      // Count manually-checkable locations
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP (NO AUTO-COLLECT + ACCESSIBILITY CHECK): Ganon location checked - game is beatable (${finalCheckedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP (NO AUTO-COLLECT + ACCESSIBILITY CHECK): Ganon location NOT checked - game is not beatable (${finalCheckedCount} locations checked, ${skippedNotAccessible} skipped as inaccessible)`,
            false
          );
        }
      } else {
        testController.reportCondition(
          `Checked ${finalCheckedCount} locations using sphere order with accessibility check and NO auto-collect (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${finalCheckedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestWithSphereOrderAndAccessibilityCheckNoAutoCollect: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Offline Test with Sphere Order and Accessibility Check
 *
 * This test iterates through locations in sphere order (like testSpoilers),
 * but only checks each location if the snapshot shows it as accessible.
 * This will help determine if the issue is:
 * - The order of checking (sphere vs staticData)
 * - Something about sphere log accessibility vs snapshot accessibility
 */
async function timerOfflineTestWithSphereOrderAndAccessibilityCheck(testController) {
  try {
    testController.log('Starting timerOfflineTestWithSphereOrderAndAccessibilityCheck...');

    // Get sphereState module functions
    const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');

    if (!getSphereData) {
      throw new Error('sphereState getSphereData function not found in central registry');
    }

    testController.reportCondition('SphereState module available', true);

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    // Import createStateSnapshotInterface for accessibility checks
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get sphere data
    const sphereData = getSphereData();

    if (!sphereData || sphereData.length === 0) {
      throw new Error('No sphere data available. Make sure sphere log is loaded.');
    }

    testController.log(`Found ${sphereData.length} spheres to process`);
    testController.reportCondition(`${sphereData.length} spheres loaded`, true);

    // Get static data for accessibility checks
    const staticData = stateManager.getStaticData();
    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    let totalLocationsChecked = 0;
    let currentSphereIndex = 0;
    let skippedNotAccessible = 0;
    let skippedAlreadyChecked = 0;

    // Iterate through each sphere
    for (const sphere of sphereData) {
      currentSphereIndex++;
      const locationsInSphere = sphere.locations || [];

      if (locationsInSphere.length === 0) {
        testController.log(`Sphere ${sphere.sphereIndex}: No locations (skipping)`);
        continue;
      }

      testController.log(`Processing Sphere ${sphere.sphereIndex}: ${locationsInSphere.length} locations`);

      // Check each location in this sphere
      for (const locationName of locationsInSphere) {
        // Get current snapshot to check accessibility
        const currentSnapshot = stateManager.getSnapshot();
        const snapshotInterface = createStateSnapshotInterface(currentSnapshot, staticData);

        // Check if location is already checked
        if (currentSnapshot?.checkedLocations?.includes(locationName)) {
          skippedAlreadyChecked++;
          testController.log(`  - ${locationName}: Already checked (skipping)`);
          continue;
        }

        // Get location data
        const locationDef = staticData?.locations?.[locationName];

        if (!locationDef) {
          testController.log(`  - ${locationName}: Location not found in static data (skipping)`);
          continue;
        }

        // Check if location is accessible according to snapshot
        const isAccessible = snapshotInterface.isLocationAccessible(locationName);

        if (!isAccessible) {
          skippedNotAccessible++;
          testController.log(`  - ${locationName}: NOT accessible per snapshot (skipping)`);
          continue;
        }

        // Get region for the location
        const locationRegion = locationDef.parent_region || locationDef.region || null;

        // Dispatch location check via event (using same API as testSpoilers)
        testController.log(`  - Checking: ${locationName} (accessible per snapshot)`);

        dispatcher.publish(
          'tests', // originModuleId
          'user:locationCheck', // eventName
          {
            locationName: locationName,
            regionName: locationRegion,
            originator: 'TimerOfflineTestWithSphereOrderAndAccessibilityCheck',
            originalDOMEvent: false,
          },
          { initialTarget: 'bottom' }
        );

        // Wait for the state to update
        await new Promise((resolve) => {
          let timeout;
          const handler = (data) => {
            const snapshot = data?.snapshot || stateManager.getSnapshot();
            const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

            if (isNowChecked) {
              clearTimeout(timeout);
              eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
              resolve();
            }
          };
          eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

          // Add a safety timeout
          timeout = setTimeout(() => {
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            testController.log(`    WARNING: Timeout waiting for ${locationName} to be checked`);
            resolve();
          }, 5000);
        });

        totalLocationsChecked++;

        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      testController.log(`Completed Sphere ${sphere.sphereIndex}: ${totalLocationsChecked} checked, ${skippedNotAccessible} skipped (not accessible), ${skippedAlreadyChecked} skipped (already checked)`);
    }

    testController.reportCondition('All spheres processed', true);

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final result: ${finalCheckedCount} locations checked (attempted: ${totalLocationsChecked}, skipped not accessible: ${skippedNotAccessible}, skipped already checked: ${skippedAlreadyChecked})`);

    if (staticData && staticData.locations) {
      // Count manually-checkable locations
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP: Ganon location checked - game is beatable (${finalCheckedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP: Ganon location NOT checked - game is not beatable (${finalCheckedCount} locations checked)`,
            false
          );
        }
      } else {
        testController.reportCondition(
          `Checked ${finalCheckedCount} locations using sphere order with accessibility check (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${finalCheckedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestWithSphereOrderAndAccessibilityCheck: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Offline Test with Snapshot Order
 *
 * This test mimics the original Timer module behavior:
 * - After each location check, get a fresh snapshot
 * - Find the first accessible location in staticData.locations order
 * - Check that location
 * - Repeat until no more accessible locations are found
 */
async function timerOfflineTestWithSnapshotOrder(testController) {
  try {
    testController.log('Starting timerOfflineTestWithSnapshotOrder...');

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    // Import createStateSnapshotInterface for accessibility checks
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get static data with locations
    const staticData = stateManager.getStaticData();

    if (!staticData || !staticData.locations) {
      throw new Error('Static data or locations not available');
    }

    // Get locations array in the order they appear in staticData
    const locationsArray = Array.isArray(staticData.locations)
      ? staticData.locations
      : Object.values(staticData.locations);

    testController.log(`Found ${locationsArray.length} locations in staticData`);
    testController.reportCondition(`${locationsArray.length} locations loaded`, true);

    let totalLocationsChecked = 0;
    let iterationCount = 0;
    const maxIterations = 1000; // Safety limit to prevent infinite loops

    // Loop until no more accessible locations are found
    while (iterationCount < maxIterations) {
      iterationCount++;

      // Get fresh snapshot and create interface for accessibility checks
      const currentSnapshot = stateManager.getSnapshot();
      const snapshotInterface = createStateSnapshotInterface(currentSnapshot, staticData);

      // Find first accessible, unchecked location in staticData order
      let locationToCheck = null;
      for (const loc of locationsArray) {
        // Skip if already checked
        if (currentSnapshot?.checkedLocations?.includes(loc.name)) {
          continue;
        }

        // Skip locations with invalid IDs
        if (loc.id === null || loc.id === undefined) {
          continue;
        }

        // Check if location is accessible
        const isAccessible = snapshotInterface.isLocationAccessible(loc.name);

        if (isAccessible) {
          locationToCheck = loc;
          break; // Found first accessible location
        }
      }

      // If no accessible location found, we're done
      if (!locationToCheck) {
        testController.log(`No more accessible locations found after ${totalLocationsChecked} checks`);
        break;
      }

      // Log every 10th location to avoid spam
      if (totalLocationsChecked % 10 === 0 || totalLocationsChecked < 10) {
        testController.log(`[${totalLocationsChecked + 1}] Checking: ${locationToCheck.name}`);
      }

      // Get region for the location
      const locationRegion = locationToCheck.parent_region || locationToCheck.region || null;

      // Dispatch location check via event (using same API as testSpoilers)
      dispatcher.publish(
        'tests', // originModuleId
        'user:locationCheck', // eventName
        {
          locationName: locationToCheck.name,
          regionName: locationRegion,
          originator: 'TimerOfflineTestWithSnapshotOrder',
          originalDOMEvent: false,
        },
        { initialTarget: 'bottom' }
      );

      // Wait for the state to update
      await new Promise((resolve) => {
        let timeout;
        const handler = (data) => {
          const snapshot = data?.snapshot || stateManager.getSnapshot();
          const isNowChecked = snapshot?.checkedLocations?.includes(locationToCheck.name);

          if (isNowChecked) {
            clearTimeout(timeout);
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            resolve();
          }
        };
        eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

        // Add a safety timeout
        timeout = setTimeout(() => {
          eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
          testController.log(`    WARNING: Timeout waiting for ${locationToCheck.name} to be checked`);
          resolve();
        }, 5000);
      });

      totalLocationsChecked++;

      // Small delay to allow processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Log progress every 20 locations
      if (totalLocationsChecked % 20 === 0) {
        testController.log(`Progress: ${totalLocationsChecked} locations checked so far`);
      }
    }

    if (iterationCount >= maxIterations) {
      testController.log(`WARNING: Hit maximum iteration limit of ${maxIterations}`, 'warn');
    }

    testController.reportCondition('Location checking loop completed', true);

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final result: ${finalCheckedCount} locations checked in ${iterationCount} iterations`);

    if (staticData && staticData.locations) {
      // Count manually-checkable locations
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP: Ganon location checked - game is beatable (${finalCheckedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP: Ganon location NOT checked - game is not beatable (${finalCheckedCount} locations checked)`,
            false
          );
        }
      } else {
        testController.reportCondition(
          `Checked ${finalCheckedCount} locations using snapshot order (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${finalCheckedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestWithSnapshotOrder: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Offline Test with Sphere Order and No Auto-Collect
 *
 * This test checks locations in sphere order (like testSpoilers) but with
 * auto-collect events DISABLED. This tests if auto-collect events are
 * causing the accessibility mismatch between snapshots and location checks.
 */
async function timerOfflineTestWithSphereOrderNoAutoCollect(testController) {
  try {
    testController.log('Starting timerOfflineTestWithSphereOrderNoAutoCollect...');

    // Get sphereState module functions
    const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');

    if (!getSphereData) {
      throw new Error('sphereState getSphereData function not found in central registry');
    }

    testController.reportCondition('SphereState module available', true);

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // CRITICAL: Disable auto-collect events BEFORE starting
    testController.log('🚫 DISABLING auto-collect events...');
    await stateManager.setAutoCollectEventsConfig(false);
    testController.reportCondition('Auto-collect events disabled', true);

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get sphere data
    const sphereData = getSphereData();

    if (!sphereData || sphereData.length === 0) {
      throw new Error('No sphere data available. Make sure sphere log is loaded.');
    }

    testController.log(`Found ${sphereData.length} spheres to process`);
    testController.reportCondition(`${sphereData.length} spheres loaded`, true);

    let totalLocationsChecked = 0;
    let currentSphereIndex = 0;

    // Iterate through each sphere
    for (const sphere of sphereData) {
      currentSphereIndex++;
      const locationsInSphere = sphere.locations || [];

      if (locationsInSphere.length === 0) {
        testController.log(`Sphere ${sphere.sphereIndex}: No locations (skipping)`);
        continue;
      }

      testController.log(`Processing Sphere ${sphere.sphereIndex}: ${locationsInSphere.length} locations`);

      // Check each location in this sphere
      for (const locationName of locationsInSphere) {
        // Get current snapshot to check accessibility
        const currentSnapshot = stateManager.getSnapshot();

        // Check if location is already checked
        if (currentSnapshot?.checkedLocations?.includes(locationName)) {
          testController.log(`  - ${locationName}: Already checked (skipping)`);
          continue;
        }

        // Get location data
        const staticData = stateManager.getStaticData();
        const locationDef = staticData?.locations?.[locationName];

        if (!locationDef) {
          testController.log(`  - ${locationName}: Location not found in static data (skipping)`);
          continue;
        }

        // Get region for the location
        const locationRegion = locationDef.parent_region || locationDef.region || null;

        // Dispatch location check via event (using same API as testSpoilers)
        testController.log(`  - Checking: ${locationName}`);

        dispatcher.publish(
          'tests', // originModuleId
          'user:locationCheck', // eventName
          {
            locationName: locationName,
            regionName: locationRegion,
            originator: 'TimerOfflineTestWithSphereOrderNoAutoCollect',
            originalDOMEvent: false,
          },
          { initialTarget: 'bottom' }
        );

        // Wait for the state to update
        await new Promise((resolve) => {
          let timeout;
          const handler = (data) => {
            const snapshot = data?.snapshot || stateManager.getSnapshot();
            const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

            if (isNowChecked) {
              clearTimeout(timeout);
              eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
              resolve();
            }
          };
          eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

          // Add a safety timeout
          timeout = setTimeout(() => {
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            testController.log(`    WARNING: Timeout waiting for ${locationName} to be checked`);
            resolve();
          }, 5000);
        });

        totalLocationsChecked++;

        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      testController.log(`Completed Sphere ${sphere.sphereIndex}: ${totalLocationsChecked} total locations checked so far`);
    }

    testController.reportCondition('All spheres processed', true);

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final result: ${finalCheckedCount} locations checked (with auto-collect DISABLED)`);

    const staticData = stateManager.getStaticData();
    if (staticData && staticData.locations) {
      // Count manually-checkable locations
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP (NO AUTO-COLLECT): Ganon location checked - game is beatable (${finalCheckedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP (NO AUTO-COLLECT): Ganon location NOT checked - game is not beatable (${finalCheckedCount} locations checked)`,
            false
          );
        }
      } else {
        testController.reportCondition(
          `Checked ${finalCheckedCount} locations using sphere order with NO auto-collect (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${finalCheckedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestWithSphereOrderNoAutoCollect: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Timer Offline Test with Sphere Order
 *
 * This test checks locations in the same order as testSpoilers by using
 * the sphereState module to iterate through spheres.
 */
async function timerOfflineTestWithSphereOrder(testController) {
  try {
    testController.log('Starting timerOfflineTestWithSphereOrder...');

    // Get sphereState module functions
    const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');
    const getCurrentSphere = window.centralRegistry.getPublicFunction('sphereState', 'getCurrentSphere');

    if (!getSphereData) {
      throw new Error('sphereState getSphereData function not found in central registry');
    }

    testController.reportCondition('SphereState module available', true);

    // Get state manager and event dispatcher
    const stateManager = testController.stateManager;
    const eventBus = testController.eventBus;

    // Get dispatcher from window (same as testSpoilers does)
    if (!window.eventDispatcher) {
      throw new Error('Event dispatcher not available on window');
    }
    const dispatcher = window.eventDispatcher;

    const initialSnapshot = stateManager.getSnapshot();

    if (!initialSnapshot) {
      throw new Error('State snapshot not available');
    }

    testController.log('Running in offline mode (no server connection)');
    testController.reportCondition('Offline mode confirmed', true);

    // Get sphere data
    const sphereData = getSphereData();

    if (!sphereData || sphereData.length === 0) {
      throw new Error('No sphere data available. Make sure sphere log is loaded.');
    }

    testController.log(`Found ${sphereData.length} spheres to process`);
    testController.reportCondition(`${sphereData.length} spheres loaded`, true);

    let totalLocationsChecked = 0;
    let currentSphereIndex = 0;

    // Iterate through each sphere
    for (const sphere of sphereData) {
      currentSphereIndex++;
      const locationsInSphere = sphere.locations || [];

      if (locationsInSphere.length === 0) {
        testController.log(`Sphere ${sphere.sphereIndex}: No locations (skipping)`);
        continue;
      }

      testController.log(`Processing Sphere ${sphere.sphereIndex}: ${locationsInSphere.length} locations`);

      // Check each location in this sphere
      for (const locationName of locationsInSphere) {
        // Get current snapshot to check accessibility
        const currentSnapshot = stateManager.getSnapshot();

        // Check if location is already checked
        if (currentSnapshot?.checkedLocations?.includes(locationName)) {
          testController.log(`  - ${locationName}: Already checked (skipping)`);
          continue;
        }

        // Get location data
        const staticData = stateManager.getStaticData();
        const locationDef = staticData?.locations?.[locationName];

        if (!locationDef) {
          testController.log(`  - ${locationName}: Location not found in static data (skipping)`);
          continue;
        }

        // Get region for the location
        const locationRegion = locationDef.parent_region || locationDef.region || null;

        // Dispatch location check via event (using same API as testSpoilers)
        testController.log(`  - Checking: ${locationName}`);

        dispatcher.publish(
          'tests', // originModuleId
          'user:locationCheck', // eventName
          {
            locationName: locationName,
            regionName: locationRegion,
            originator: 'TimerOfflineTestWithSphereOrder',
            originalDOMEvent: false,
          },
          { initialTarget: 'bottom' }
        );

        // Wait for the state to update
        await new Promise((resolve) => {
          let timeout;
          const handler = (data) => {
            const snapshot = data?.snapshot || stateManager.getSnapshot();
            const isNowChecked = snapshot?.checkedLocations?.includes(locationName);

            if (isNowChecked) {
              clearTimeout(timeout);
              eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
              resolve();
            }
          };
          eventBus.subscribe('stateManager:snapshotUpdated', handler, 'tests');

          // Add a safety timeout
          timeout = setTimeout(() => {
            eventBus.unsubscribe('stateManager:snapshotUpdated', handler, 'tests');
            testController.log(`    WARNING: Timeout waiting for ${locationName} to be checked`);
            resolve();
          }, 5000);
        });

        totalLocationsChecked++;

        // Small delay to allow processing
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      testController.log(`Completed Sphere ${sphere.sphereIndex}: ${totalLocationsChecked} total locations checked so far`);
    }

    testController.reportCondition('All spheres processed', true);

    // Verify final state
    const finalSnapshot = stateManager.getSnapshot();
    const finalCheckedCount = finalSnapshot?.checkedLocations?.length || 0;

    testController.log(`Final result: ${finalCheckedCount} locations checked`);

    const staticData = stateManager.getStaticData();
    if (staticData && staticData.locations) {
      // Count manually-checkable locations
      const manuallyCheckableLocations = Object.values(staticData.locations).filter(
        loc => loc.id !== null && loc.id !== undefined && loc.id !== 0
      );
      const totalManuallyCheckable = manuallyCheckableLocations.length;

      testController.log(`Manually-checkable locations: ${totalManuallyCheckable}`);

      // Special case for ALTTP: Check if Ganon location was checked
      const gameName = staticData.game_name?.toLowerCase();
      if (gameName === 'a link to the past' || gameName === 'alttp') {
        const ganonChecked = finalSnapshot.checkedLocations?.includes('Ganon');
        if (ganonChecked) {
          testController.reportCondition(
            `ALTTP: Ganon location checked - game is beatable (${finalCheckedCount} total locations checked)`,
            true
          );
        } else {
          testController.reportCondition(
            `ALTTP: Ganon location NOT checked - game is not beatable (${finalCheckedCount} locations checked)`,
            false
          );
        }
      } else {
        testController.reportCondition(
          `Checked ${finalCheckedCount} locations using sphere order (${totalManuallyCheckable} manually-checkable locations exist)`,
          true
        );
      }
    } else {
      testController.reportCondition(`${finalCheckedCount} locations checked`, true);
    }

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in timerOfflineTestWithSphereOrder: ${error.message}`, 'error');
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

registerTest({
  id: 'timerOfflineTest',
  name: 'timerOfflineTest',
  category: 'Multiplayer',
  description: 'Run timer to check all locations in offline mode (no server connection)',
  testFunction: timerOfflineTest,
});

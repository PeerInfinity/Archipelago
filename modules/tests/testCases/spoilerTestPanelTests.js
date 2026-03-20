import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'spoilerTestPanel';
const MAX_WAIT_TIME_TEST_COMPLETION = 300000; // 5 minutes

/**
 * Test case for running a full spoiler log test from the Spoiler Test panel.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function spoilerTestPanelFullRun(testController) {
  let overallResult = true;
  const testRunId = `spoilers-full-run-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting spoilerTestPanelFullRun...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Spoiler Test panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    testController.eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    
    // Poll for panel initialization instead of arbitrary delay
    if (!(await testController.pollForCondition(
      () => {
        const panelElement = document.querySelector('.spoiler-test-module-root');
        const isInitialized = panelElement && panelElement.querySelector('#load-suggested-spoiler-log');
        return !!isInitialized;
      },
      'Spoiler Test panel initialization',
      10000,
      250
    ))) {
      throw new Error('Spoiler Test panel failed to initialize properly');
    }

    let spoilersPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          spoilersPanelElement = document.querySelector(
            '.spoiler-test-module-root'
          );
          return spoilersPanelElement !== null;
        },
        'Spoiler Test panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Spoiler Test panel not found in DOM');
    }
    testController.reportCondition('Spoiler Test panel found in DOM', true);

    // 2. Click the "Load Suggested Log" button
    let loadSuggestedButton = null;
    if (
      !(await testController.pollForCondition(
        () => {
          if (!spoilersPanelElement) return false;
          loadSuggestedButton = spoilersPanelElement.querySelector(
            '#load-suggested-spoiler-log'
          );
          // The button should exist and be enabled. It might be disabled if no ruleset is active.
          return loadSuggestedButton !== null && !loadSuggestedButton.disabled;
        },
        '"Load Suggested Log" button to be available',
        10000,
        250
      ))
    ) {
      throw new Error('"Load Suggested Log" button not found or was disabled.');
    }

    testController.reportCondition(
      '"Load Suggested Log" button found and enabled',
      true
    );
    testController.log(
      `[${testRunId}] Clicking "Load Suggested Log" button...`
    );
    loadSuggestedButton.click();
    
    // Poll for log loading completion instead of arbitrary delay
    if (!(await testController.pollForCondition(
      () => {
        const currentSpoilersPanelElement = document.querySelector('.spoiler-test-module-root');
        if (!currentSpoilersPanelElement) return false;
        
        // Check for indicators that the log has loaded
        const hasRunButton = currentSpoilersPanelElement.querySelector('#run-full-spoiler-test') ||
                            Array.from(currentSpoilersPanelElement.querySelectorAll('button')).find(btn => 
                              btn.textContent.includes('Run Full Test'));
        const logOutput = currentSpoilersPanelElement.querySelector('#spoiler-log-output');
        const hasLogContent = logOutput && logOutput.children.length > 0;
        
        
        return !!(hasRunButton || hasLogContent);
      },
      'Spoiler log loading completion',
      15000,
      500
    ))) {
      throw new Error('Spoiler log failed to load within expected time');
    }

    const targetButtonId = '#run-full-spoiler-test';
    const targetButtonText = 'Run Full Test';

    // 3. Wait for the target button to appear, which indicates the log has loaded
    let targetButton = null;
    if (
      !(await testController.pollForCondition(
        () => {
          // Try multiple strategies to find the button

          // Strategy 1: By ID in spoilers panel
          const currentSpoilersPanelElement = document.querySelector(
            '.test-spoilers-module-root'
          );
          if (currentSpoilersPanelElement) {
            targetButton = currentSpoilersPanelElement.querySelector(
              targetButtonId
            );
          }

          // Strategy 2: By ID globally
          if (!targetButton) {
            targetButton = document.querySelector(targetButtonId);
          }

          // Strategy 3: By text content in spoilers panel
          if (!targetButton && currentSpoilersPanelElement) {
            const allButtons = currentSpoilersPanelElement.querySelectorAll('button');
            targetButton = Array.from(allButtons).find(btn =>
              btn.textContent.includes(targetButtonText)
            );
          }

          // Strategy 4: By text content globally
          if (!targetButton) {
            const allButtons = document.querySelectorAll('button');
            targetButton = Array.from(allButtons).find(btn =>
              btn.textContent.includes(targetButtonText)
            );
          }

          return targetButton !== null;
        },
        `"${targetButtonText}" button to appear`,
        10000,
        250
      ))
    ) {
      // Final debug attempt - list all buttons on the page
      const allButtons = document.querySelectorAll('button');
      const buttonInfo = Array.from(allButtons).map(btn =>
        `"${btn.textContent}" (id: ${btn.id || 'none'}, class: ${btn.className || 'none'})`
      );
      testController.log(`[${testRunId}] FINAL DEBUG: All buttons on page (${allButtons.length}): ${buttonInfo.join(', ')}`);

      throw new Error(
        `"${targetButtonText}" button did not appear after loading log.`
      );
    }
    testController.reportCondition(`"${targetButtonText}" button appeared`, true);

    // 4. Click the target button
    testController.log(`[${testRunId}] Clicking "${targetButtonText}" button...`);
    targetButton.click();
    
    // Poll for test start instead of arbitrary delay
    if (!(await testController.pollForCondition(
      () => {
        const isDisabled = targetButton && targetButton.disabled;
        const hasStartedProcessing = typeof window !== 'undefined' &&
                                    (window.__spoilerTestResults__ ||
                                     document.querySelector('#spoiler-log-output .log-entry'));


        return isDisabled || hasStartedProcessing;
      },
      'Spoiler test to start processing',
      5000,
      100
    ))) {
      testController.log(`[${testRunId}] WARNING: Could not confirm test started processing, continuing anyway`);
    }

    // 5. Wait for the test to complete by polling for detailed results AND button re-enablement
    testController.log(
      `[${testRunId}] Waiting for spoiler test to complete...`
    );
    if (
      !(await testController.pollForCondition(
        () => {
          // Check both button state AND detailed results availability
          const buttonReady = targetButton && !targetButton.disabled;
          const detailedResults = typeof window !== 'undefined' && window.__spoilerTestResults__;
          const hasProcessedEvents = detailedResults && detailedResults.processedEvents !== undefined;
          
          testController.log(
            `[${testRunId}] Polling: buttonReady=${buttonReady}, hasDetailedResults=${!!detailedResults}, processedEvents=${detailedResults?.processedEvents || 0}/${detailedResults?.totalEvents || 0}`
          );
          
          
          // ENHANCED DEBUG: Log full detailedResults structure when available
          if (detailedResults) {
            testController.log(
              `[${testRunId}] DEBUG detailedResults: ${JSON.stringify({
                passed: detailedResults.passed,
                totalEvents: detailedResults.totalEvents,
                processedEvents: detailedResults.processedEvents,
                errorCount: detailedResults.errorMessages?.length || 0,
                sphereCount: detailedResults.sphereResults?.length || 0,
                testLogPath: detailedResults.testLogPath
              })}`
            );
          }
          
          return buttonReady && detailedResults && hasProcessedEvents;
        },
        'Spoiler test completion with detailed results',
        MAX_WAIT_TIME_TEST_COMPLETION,
        1000
      ))
    ) {
      throw new Error(
        'Spoiler test did not complete within the maximum wait time.'
      );
    }
    testController.reportCondition('Spoiler test completed', true);

    // 6. Collect and analyze results from the log container and window.__spoilerTestResults__
    const logContainer = spoilersPanelElement.querySelector(
      '#spoiler-log-output'
    );
    let testResults = {
      passed: true,
      logEntries: [],
      errorMessages: [],
      detailedResults: null,
      sphereResults: [],
      mismatchDetails: [],
    };

    // First check if detailed results are available from the spoiler UI
    if (typeof window !== 'undefined' && window.__spoilerTestResults__) {
      testResults.detailedResults = window.__spoilerTestResults__;
      testResults.passed = window.__spoilerTestResults__.passed;
      if (window.__spoilerTestResults__.errorMessages) {
        testResults.errorMessages.push(...window.__spoilerTestResults__.errorMessages);
      }
      if (window.__spoilerTestResults__.sphereResults) {
        testResults.sphereResults = window.__spoilerTestResults__.sphereResults;
      }
      if (window.__spoilerTestResults__.mismatchDetails) {
        testResults.mismatchDetails = window.__spoilerTestResults__.mismatchDetails;
      }
    }

    // Also collect from log container as fallback
    if (logContainer) {
      const logEntries = logContainer.querySelectorAll('.log-entry');
      logEntries.forEach((entry) => {
        const text = entry.textContent;
        testResults.logEntries.push(text);
        if (
          entry.classList.contains('log-error') ||
          entry.classList.contains('log-mismatch')
        ) {
          if (!testResults.detailedResults) {
            testResults.passed = false;
          }
          testResults.errorMessages.push(text);
        }
      });
    }

    testController.reportCondition(
      'Spoiler test passed all checks',
      testResults.passed
    );
    if (!testResults.passed) {
      overallResult = false;
      testController.log(
        `[${testRunId}] Spoiler test failed. Mismatches found in log:`,
        'error'
      );
      testResults.errorMessages.forEach((log) => {
        testController.log(`  - ${log}`, 'error');
      });
    }

    // 7. Make results available to Playwright
    if (typeof window !== 'undefined') {
      window.__spoilerTestResults__ = testResults;
      testController.log(
        `[${testRunId}] Spoiler test results stored in window.__spoilerTestResults__`
      );
    }
  } catch (error) {
    testController.log(
      `[${testRunId}] Error in spoilerTestPanelFullRun: ${
        error.message
      } (Stack: ${error.stack || 'N/A'})`,
      'error'
    );
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    testController.log(
      `[${testRunId}] spoilerTestPanelFullRun finished. Overall Result: ${overallResult}.`
    );
    await testController.completeTest(overallResult);
  }
  return overallResult;
}

registerTest({
  id: 'test_spoiler_full_run',
  name: 'Spoiler Test Panel - Full Run',
  description:
    'Activates the Spoiler Test panel, loads the suggested log, runs the full test, and reports the result.',
  testFunction: spoilerTestPanelFullRun,
  category: 'Spoiler Test Panel',
  //enabled: false,
  //order: 1,
});

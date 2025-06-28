import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'testSpoilersPanel';
const MAX_WAIT_TIME_TEST_COMPLETION = 300000; // 5 minutes

/**
 * Test case for running a full spoiler log test from the Test Spoilers panel.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testSpoilersPanelFullRun(testController) {
  let overallResult = true;
  const testRunId = `spoilers-full-run-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting testSpoilersPanelFullRun...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Test Spoilers panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 500)); // wait for panel to init

    let spoilersPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          spoilersPanelElement = document.querySelector(
            '.test-spoilers-module-root'
          );
          return spoilersPanelElement !== null;
        },
        5000,
        250,
        'Test Spoilers panel DOM element'
      ))
    ) {
      throw new Error('Test Spoilers panel not found in DOM');
    }
    testController.reportCondition('Test Spoilers panel found in DOM', true);

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
        10000,
        250,
        '"Load Suggested Log" button to be available'
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

    // 3. Wait for the "Run Full Test" button to appear, which indicates the log has loaded
    let runFullTestButton = null;
    if (
      !(await testController.pollForCondition(
        () => {
          if (!spoilersPanelElement) return false;
          runFullTestButton = spoilersPanelElement.querySelector(
            '#run-full-spoiler-test'
          );
          return runFullTestButton !== null;
        },
        10000,
        250,
        '"Run Full Test" button to appear'
      ))
    ) {
      throw new Error(
        '"Run Full Test" button did not appear after loading log.'
      );
    }
    testController.reportCondition('"Run Full Test" button appeared', true);

    // 4. Click the "Run Full Test" button
    testController.log(`[${testRunId}] Clicking "Run Full Test" button...`);
    runFullTestButton.click();
    await new Promise((resolve) => setTimeout(resolve, 100)); // allow test to start processing

    // 5. Wait for the test to complete by polling for the run button to be re-enabled
    testController.log(
      `[${testRunId}] Waiting for full spoiler test to complete...`
    );
    if (
      !(await testController.pollForCondition(
        () => {
          return runFullTestButton && !runFullTestButton.disabled;
        },
        MAX_WAIT_TIME_TEST_COMPLETION,
        1000,
        'Full spoiler test completion'
      ))
    ) {
      throw new Error(
        'Full spoiler test did not complete within the maximum wait time.'
      );
    }
    testController.reportCondition('Full spoiler test completed', true);

    // 6. Collect and analyze results from the log container
    const logContainer = spoilersPanelElement.querySelector(
      '#spoiler-log-output'
    );
    let testResults = {
      passed: true,
      logEntries: [],
      errorMessages: [],
    };

    if (logContainer) {
      const logEntries = logContainer.querySelectorAll('.log-entry');
      logEntries.forEach((entry) => {
        const text = entry.textContent;
        testResults.logEntries.push(text);
        if (
          entry.classList.contains('log-error') ||
          entry.classList.contains('log-mismatch')
        ) {
          testResults.passed = false;
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
    try {
      localStorage.setItem(
        '__spoilerTestResults__',
        JSON.stringify(testResults)
      );
      testController.log(
        `[${testRunId}] Spoiler test results stored in localStorage`
      );
    } catch (e) {
      testController.log(
        `[${testRunId}] Could not store results in localStorage: ' + e.message`,
        'warn'
      );
    }
  } catch (error) {
    testController.log(
      `[${testRunId}] Error in testSpoilersPanelFullRun: ${
        error.message
      } (Stack: ${error.stack || 'N/A'})`,
      'error'
    );
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    testController.log(
      `[${testRunId}] testSpoilersPanelFullRun finished. Overall Result: ${overallResult}.`
    );
    await testController.completeTest(overallResult);
  }
  return overallResult;
}

registerTest({
  id: 'test_spoiler_full_run',
  name: 'Test Spoilers Panel - Full Run',
  description:
    'Activates the Test Spoilers panel, loads the suggested log, runs the full test, and reports the result.',
  testFunction: testSpoilersPanelFullRun,
  category: 'Test Spoilers Panel',
  enabled: false,
  order: 1,
});

import { registerTest } from '../testRegistry.js';

// Constants
const PANEL_ID_TEST_PLAYTHROUGHS = 'testPlaythroughsPanel';
const TARGET_PLAYTHROUGH_INDEX = 0; // Test with the first playthrough file
const MAX_WAIT_TIME_PLAYTHROUGH_COMPLETION = 300000; // 5 minutes (adjust as needed)
const SUCCESS_MESSAGE_SUBSTRING = 'Playthrough test completed successfully';
const FAILURE_MESSAGE_SUBSTRING_1 = 'Test failed at step';
const FAILURE_MESSAGE_SUBSTRING_2 = 'Playthrough Test Error';
const PREPARATION_FAILURE_SUBSTRING = 'Test preparation failed';

export async function testPlaythroughPanelRunFullTest(testController) {
  const testRunId = `playthrough-panel-test-${Date.now()}`;
  testController.log(
    `[${testRunId}] Starting testPlaythroughPanelRunFullTest...`
  );
  let overallResult = true;

  try {
    testController.reportCondition('Test started', true);

    // 1. Activate the Test Playthroughs panel
    testController.log(
      `[${testRunId}] Activating Test Playthroughs panel (ID: ${PANEL_ID_TEST_PLAYTHROUGHS})...`
    );
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: PANEL_ID_TEST_PLAYTHROUGHS },
    });

    // 2. Poll for the panel to be visible and playthrough list loaded
    let panelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          panelElement = document.querySelector('#test-playthroughs-panel');
          if (!panelElement) return false;
          // Check if playthrough items are rendered
          return (
            panelElement.querySelector(
              `button.select-playthrough[data-index="${TARGET_PLAYTHROUGH_INDEX}"]`
            ) !== null
          );
        },
        10000,
        500,
        'Test Playthroughs panel and playthrough list to be ready'
      ))
    ) {
      const panelContent = panelElement
        ? panelElement.innerHTML.substring(0, 500) + '...'
        : 'Panel #test-playthroughs-panel not found';
      throw new Error(
        `Test Playthroughs panel or playthrough list not ready. Panel content snippet: ${panelContent}`
      );
    }
    testController.reportCondition(
      'Test Playthroughs panel and list ready',
      true
    );

    // 3. Click the "Select" button for the target playthrough
    const selectButton = panelElement.querySelector(
      `button.select-playthrough[data-index="${TARGET_PLAYTHROUGH_INDEX}"]`
    );
    if (!selectButton) {
      throw new Error(
        `Select button for playthrough index ${TARGET_PLAYTHROUGH_INDEX} not found.`
      );
    }
    const playthroughItemElement = selectButton.closest('.playthrough-item');
    const playthroughName =
      playthroughItemElement
        ?.querySelector('.playthrough-name')
        ?.textContent.trim() ||
      `Playthrough at index ${TARGET_PLAYTHROUGH_INDEX}`;

    testController.log(
      `[${testRunId}] Selecting playthrough: "${playthroughName}"...`
    );
    selectButton.click();
    testController.reportCondition(
      `Clicked "Select" for playthrough "${playthroughName}"`,
      true
    );

    // 4. Poll for the "Run Full Test" button in the results view
    let runFullTestButton = null;
    if (
      !(await testController.pollForCondition(
        () => {
          panelElement = document.querySelector('#test-playthroughs-panel'); // Re-query in case of re-render
          if (!panelElement) return false;
          runFullTestButton = panelElement.querySelector('#run-full-test');
          return runFullTestButton !== null && !runFullTestButton.disabled;
        },
        5000,
        250,
        '"Run Full Test" button to be available and enabled'
      ))
    ) {
      const buttonState = runFullTestButton
        ? runFullTestButton.disabled
          ? 'disabled'
          : 'not found or not visible'
        : 'not found';
      throw new Error(
        `"Run Full Test" button not found or not enabled. State: ${buttonState}`
      );
    }
    testController.reportCondition(
      '"Run Full Test" button found and enabled',
      true
    );

    // 5. Click "Run Full Test"
    testController.log(`[${testRunId}] Clicking "Run Full Test"...`);
    runFullTestButton.click();
    testController.reportCondition('Clicked "Run Full Test"', true);

    // 6. Poll the log output for success or failure message
    testController.log(
      `[${testRunId}] Waiting for playthrough to complete (max ${
        MAX_WAIT_TIME_PLAYTHROUGH_COMPLETION / 1000
      }s)...`
    );
    let playthroughCompletedSuccessfully = false;
    let testFailed = false;
    let preparationFailed = false;
    let finalLogMessage =
      'No specific completion/failure message found in UI log.';

    const logOutputElement = panelElement.querySelector(
      '#playthrough-log-output'
    );
    if (!logOutputElement) {
      // This might happen if the panel structure changed unexpectedly
      throw new Error(
        'Log output element #playthrough-log-output not found after starting test.'
      );
    }

    if (
      !(await testController.pollForCondition(
        () => {
          const logEntries = logOutputElement.querySelectorAll('.log-entry');
          for (const entry of logEntries) {
            const text = entry.textContent;
            if (text.includes(SUCCESS_MESSAGE_SUBSTRING)) {
              playthroughCompletedSuccessfully = true;
              finalLogMessage = text;
              return true;
            }
            if (
              text.includes(FAILURE_MESSAGE_SUBSTRING_1) ||
              text.includes(FAILURE_MESSAGE_SUBSTRING_2)
            ) {
              testFailed = true;
              finalLogMessage = text;
              return true;
            }
            if (text.includes(PREPARATION_FAILURE_SUBSTRING)) {
              preparationFailed = true;
              testFailed = true; // Preparation failure is a test failure
              finalLogMessage = text;
              return true;
            }
          }
          return false;
        },
        MAX_WAIT_TIME_PLAYTHROUGH_COMPLETION,
        1000,
        `playthrough completion message ("${SUCCESS_MESSAGE_SUBSTRING}" or failure substring)`
      ))
    ) {
      const lastFewEntries = Array.from(
        logOutputElement.querySelectorAll('.log-entry')
      )
        .slice(-5)
        .map((el) => el.textContent)
        .join('\n');
      finalLogMessage = `Timeout waiting for playthrough completion. Last few UI log entries:\n${lastFewEntries}`;
      testController.log(`[${testRunId}] ${finalLogMessage}`, 'warn');
    }

    if (playthroughCompletedSuccessfully) {
      testController.log(
        `[${testRunId}] Playthrough reported success in UI. Log: ${finalLogMessage}`
      );
      testController.reportCondition(
        'Playthrough execution successful (UI check)',
        true
      );
    } else if (testFailed || preparationFailed) {
      testController.log(
        `[${testRunId}] Playthrough reported failure in UI. Log: ${finalLogMessage}`,
        'error'
      );
      testController.reportCondition(
        'Playthrough execution failed (UI check)',
        false
      );
      overallResult = false;
    } else {
      // Timeout without specific success/fail message from UI
      testController.log(
        `[${testRunId}] Playthrough did not complete with a clear success/failure message in UI. Final log considered: ${finalLogMessage}`,
        'error'
      );
      testController.reportCondition(
        'Playthrough completion unclear (timeout on UI log)',
        false
      );
      overallResult = false;
    }
  } catch (error) {
    const errorMessage = `Error in testPlaythroughPanelRunFullTest: ${
      error.message
    } (Stack: ${error.stack || 'N/A'})`;
    testController.log(`[${testRunId}] ${errorMessage}`, 'error');
    testController.reportCondition(`Test errored: ${errorMessage}`, false);
    overallResult = false;
  } finally {
    testController.log(
      `[${testRunId}] testPlaythroughPanelRunFullTest finished. Overall Result: ${overallResult}`
    );
  }
  return overallResult;
}

registerTest({
  id: 'test_playthrough_panel',
  name: 'Test Playthrough Panel - Run Full Test',
  description:
    'Tests selecting and running a full test playthrough using the first available playthrough log.',
  testFunction: testPlaythroughPanelRunFullTest,
  category: 'Test Playthroughs Panel',
  enabled: false,
  order: 20, // Adjust order as needed
});

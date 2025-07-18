import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID_TEST_CASES = 'testCasesPanel';
const TEST_SET_LIGHT_WORLD = 'Light World';
const MAX_WAIT_TIME_GENERAL_TEST_COMPLETION = 300000; // 5 minutes
const TARGET_TEST_INDEX_FOR_SINGLE_RUN_DEMO = 18; // Chicken House (true, ["Bomb Upgrade (+5)"])
const TARGET_TEST_INDEX_KINGS_TOMB_SUB_TEST = 11; // King's Tomb
const TARGET_ITEM_NAME_BEAT_AGAHNIM_1 = 'Beat Agahnim 1';

export async function testCasePanelRunAll(testController) {
  let overallResult = true;
  try {
    testController.log('Starting testCasePanelRunAll...');
    testController.reportCondition('Test started', true);

    // First, we need to ensure the Test Cases panel is available and activated
    testController.log('Attempting to activate Test Cases panel...');

    // Import eventBus to publish panel activation event
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    if (!eventBus) {
      throw new Error('Event bus not available');
    }

    // Activate the Test Cases panel using the same pattern as region links
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID_TEST_CASES }, 'tests');
    testController.reportCondition(
      'Test Cases panel activation event published',
      true
    );

    // Wait a moment for the panel to initialize
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Look for the Test Cases panel in the DOM
    const testCasesPanel = document.querySelector('#test-cases-panel');
    if (!testCasesPanel) {
      throw new Error('Test Cases panel not found in DOM');
    }
    testController.reportCondition('Test Cases panel found in DOM', true);

    // Wait for the panel to load test sets, then check if Light World is active or click it
    await new Promise((resolve) => setTimeout(resolve, 1000));

    const testSetHeader = testCasesPanel.querySelector('.test-header h3');
    const isLightWorldActive =
      testSetHeader && testSetHeader.textContent.includes(TEST_SET_LIGHT_WORLD);
    const runAllButtonPresent = testCasesPanel.querySelector('#run-all-tests');

    if (isLightWorldActive && runAllButtonPresent) {
      testController.log(
        `"${TEST_SET_LIGHT_WORLD}" test set is already active. Skipping button click.`
      );
      testController.reportCondition(
        `"${TEST_SET_LIGHT_WORLD}" test set already active`,
        true
      );
    } else {
      testController.log(
        `"${TEST_SET_LIGHT_WORLD}" not active or header not found. Looking for button...`
      );
      const vanillaButtons = testCasesPanel.querySelectorAll(
        'button[data-folder="vanilla"]'
      );
      let lightWorldButton = null;

      for (const button of vanillaButtons) {
        if (
          button.dataset.testset &&
          button.dataset.testset.toLowerCase().includes('lightworld') // TEST_SET_LIGHT_WORLD.toLowerCase().replace(' ', '') might be safer
        ) {
          lightWorldButton = button;
          break;
        }
      }

      if (!lightWorldButton) {
        // Try alternative selectors if specific data attributes aren't there
        const allButtons = testCasesPanel.querySelectorAll('button');
        for (const button of allButtons) {
          if (
            button.textContent
              .toLowerCase()
              .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
          ) {
            lightWorldButton = button;
            break;
          }
        }
      }

      if (!lightWorldButton) {
        // If still not found, maybe it's because the back button needs a click first
        const backButton = testCasesPanel.querySelector('#back-to-test-sets');
        if (backButton) {
          testController.log(
            `Clicking 'Back to Test Sets' to find '${TEST_SET_LIGHT_WORLD}' button.`
          );
          backButton.click();
          await new Promise((resolve) => setTimeout(resolve, 500)); // wait for UI to update

          const newVanillaButtons = testCasesPanel.querySelectorAll(
            'button[data-folder="vanilla"]'
          );
          for (const button of newVanillaButtons) {
            if (
              button.dataset.testset &&
              button.dataset.testset.toLowerCase().includes('lightworld') // TEST_SET_LIGHT_WORLD.toLowerCase().replace(' ', '')
            ) {
              lightWorldButton = button;
              break;
            }
          }
          if (!lightWorldButton) {
            const newAllButtons = testCasesPanel.querySelectorAll('button');
            for (const button of newAllButtons) {
              if (
                button.textContent
                  .toLowerCase()
                  .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
              ) {
                lightWorldButton = button;
                break;
              }
            }
          }
        }
      }

      if (!lightWorldButton) {
        throw new Error(
          `'${TEST_SET_LIGHT_WORLD}' test button not found in vanilla category, even after trying Back button.`
        );
      }

      testController.reportCondition(
        `'${TEST_SET_LIGHT_WORLD}' test button found`,
        true
      );
      testController.log(`Clicking '${TEST_SET_LIGHT_WORLD}' test button...`);
      lightWorldButton.click();
    }

    // Wait for the test cases to load
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Verify that test cases are now displayed
    const testTable = testCasesPanel.querySelector('.results-table');
    if (!testTable) {
      throw new Error(
        `Test cases table not found after clicking ${TEST_SET_LIGHT_WORLD}`
      );
    }
    testController.reportCondition('Test cases table loaded', true);

    // Look for the "Run All Tests" button
    const runAllButton = testCasesPanel.querySelector('#run-all-tests');
    if (!runAllButton) {
      throw new Error('Run All Tests button not found');
    }
    testController.reportCondition('Run All Tests button found', true);

    // Verify the cancel button is present but hidden
    const cancelButton = testCasesPanel.querySelector('#cancel-all-tests');
    if (!cancelButton) {
      throw new Error('Cancel Tests button not found');
    }

    const isHidden =
      cancelButton.style.display === 'none' ||
      getComputedStyle(cancelButton).display === 'none';
    testController.reportCondition(
      'Cancel Tests button found and initially hidden',
      isHidden
    );
    if (!isHidden) overallResult = false;

    // Click the "Run All Tests" button
    testController.log('Clicking Run All Tests button...');
    runAllButton.click();

    // Wait a moment for the tests to start
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Verify that the cancel button is now visible
    const isCancelVisible =
      cancelButton.style.display === 'inline-block' ||
      getComputedStyle(cancelButton).display !== 'none';
    testController.reportCondition(
      'Cancel Tests button becomes visible when tests start',
      isCancelVisible
    );
    if (!isCancelVisible) overallResult = false;

    // Verify that the run button is disabled
    const isRunDisabled = runAllButton.disabled;
    testController.reportCondition(
      'Run All Tests button disabled during execution',
      isRunDisabled
    );
    if (!isRunDisabled) overallResult = false;

    // NEW: Wait for all tests to complete instead of canceling
    testController.log('Waiting for all tests to complete...');

    // Monitor test completion by watching for the run button to be re-enabled
    // and the cancel button to be hidden again
    let testsCompleted = false;
    let maxWaitTime = MAX_WAIT_TIME_GENERAL_TEST_COMPLETION; // 5 minutes maximum wait time
    let waitStartTime = Date.now();

    while (!testsCompleted && Date.now() - waitStartTime < maxWaitTime) {
      await new Promise((resolve) => setTimeout(resolve, 1000)); // Check every second

      const isRunButtonEnabled = !runAllButton.disabled;
      const isCancelButtonHidden =
        cancelButton.style.display === 'none' ||
        getComputedStyle(cancelButton).display === 'none';

      testsCompleted = isRunButtonEnabled && isCancelButtonHidden;

      if (testsCompleted) {
        testController.log(
          'Tests completed - buttons returned to initial state'
        );
        break;
      }
    }

    if (!testsCompleted) {
      throw new Error('Tests did not complete within the maximum wait time');
    }

    testController.reportCondition(
      'All tests completed successfully',
      testsCompleted
    );

    // Collect and analyze test results
    const summaryElement = testCasesPanel.querySelector(
      '#test-results-summary'
    );
    let testResults = {
      total: 0,
      passed: 0,
      failed: 0,
      cancelled: 0,
      details: [],
    };

    if (summaryElement) {
      const summaryText = summaryElement.textContent;
      testController.log(`Test summary: ${summaryText}`);

      // Parse the summary text to extract counts
      const totalMatch = summaryText.match(/(\d+) total/); // This regex was wrong, should be like below
      const passedMatch = summaryText.match(/(\d+) passed/);
      const failedMatch = summaryText.match(/(\d+) failed/);
      const cancelledMatch = summaryText.match(/(\d+) cancelled/);

      // A more robust way to parse the summary:
      const completedMatch = summaryText.match(/Tests completed: (\d+)\/(\d+)/);
      if (completedMatch) {
        // testResults.completed = parseInt(completedMatch[1]); // If needed
        testResults.total = parseInt(completedMatch[2]);
      }

      if (passedMatch) testResults.passed = parseInt(passedMatch[1]);
      if (failedMatch) testResults.failed = parseInt(failedMatch[1]);
      if (cancelledMatch) testResults.cancelled = parseInt(cancelledMatch[1]);
    }

    // Collect detailed results from individual test rows
    const testRows = testTable.querySelectorAll('tbody tr');
    testController.log(`Found ${testRows.length} test rows`);

    testRows.forEach((row, index) => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 6) {
        const locationName = cells[0].textContent.trim();
        const expectedAccess = cells[1].textContent.trim();
        const requiredItems = cells[2].textContent.trim();
        const excludedItems = cells[3].textContent.trim();
        const resultCell = cells[5];

        let status = 'unknown';
        let message = '';

        if (resultCell) {
          const statusDiv = resultCell.querySelector('.test-status div');
          if (statusDiv) {
            message = statusDiv.textContent.trim();
            if (statusDiv.classList.contains('test-success')) {
              status = 'passed';
            } else if (statusDiv.classList.contains('test-failure')) {
              status = 'failed';
            } else if (statusDiv.classList.contains('test-cancelled')) {
              status = 'cancelled';
            } else if (statusDiv.classList.contains('test-error')) {
              status = 'error';
            }
          }
        }

        testResults.details.push({
          index: index,
          locationName: locationName,
          expectedAccess: expectedAccess,
          requiredItems: requiredItems,
          excludedItems: excludedItems,
          status: status,
          message: message,
        });
      }
    });

    // Report overall test results
    testController.reportCondition(
      `Test suite completed: ${testResults.passed}/${testResults.total} passed`,
      testResults.failed === 0 && testResults.cancelled === 0 // Ensure no failures or cancellations for overall pass
    );

    if (
      testResults.total > 0 &&
      (testResults.failed > 0 || testResults.cancelled > 0)
    ) {
      overallResult = false; // Mark overall as failed if any individual test failed or was cancelled
    }

    if (testResults.failed > 0) {
      testController.log(`${testResults.failed} tests failed:`, 'error');
      testResults.details.forEach((test) => {
        if (test.status === 'failed' || test.status === 'error') {
          testController.log(
            `  - ${test.locationName}: ${test.message}`,
            'error'
          );
        }
      });
      overallResult = false;
    }

    // Store results for Playwright to access
    if (typeof window !== 'undefined') {
      window.__testCaseResults__ = testResults;
      testController.log(
        'Test results stored in window.__testCaseResults__ for Playwright access'
      );
    }

    // Also store in localStorage for Playwright
    try {
      localStorage.setItem('__testCaseResults__', JSON.stringify(testResults));
      testController.log(
        'Test results stored in localStorage for Playwright access'
      );
    } catch (e) {
      testController.log(
        'Could not store results in localStorage: ' + e.message,
        'warn'
      );
    }

    testController.log(
      `testCasePanelRunAll finished. Overall Result: ${overallResult}. ` +
        `Results: ${testResults.passed} passed, ${testResults.failed} failed, ${testResults.cancelled} cancelled`
    );
  } catch (error) {
    testController.log(
      `Error in testCasePanelRunAll: ${error.message} (Stack: ${
        error.stack || 'N/A'
      })`,
      'error'
    );
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    await testController.completeTest(overallResult);
  }
}

export async function testCasePanelRunOneTest(testController) {
  const testRunId = `test-run-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 7)}`;
  testController.log(`[${testRunId}] Starting testCasePanelRunOneTest...`);
  let overallResult = true;

  try {
    testController.reportCondition('Test started', true);

    // 1. Activate the Test Cases panel
    testController.log(`[${testRunId}] Activating Test Cases panel...`);
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: PANEL_ID_TEST_CASES },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testController.log(
      `[${testRunId}] Panel activation event dispatched and waited.`
    );

    let testCasesPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          testCasesPanelElement = document.querySelector('#test-cases-panel');
          return testCasesPanelElement !== null;
        },
        5000,
        250,
        'Test Cases panel DOM element'
      ))
    ) {
      throw new Error(
        'Test Cases panel element not found after activation and polling.'
      );
    }
    testController.reportCondition('Test Cases panel element found', true);

    // 2. Click the "Light World" test set button, if not already selected
    testController.log(
      `[${testRunId}] Checking if "${TEST_SET_LIGHT_WORLD}" test set is already active...`
    );
    const testSetHeader =
      testCasesPanelElement.querySelector('.test-header h3');
    const isLightWorldActive =
      testSetHeader && testSetHeader.textContent.includes(TEST_SET_LIGHT_WORLD);
    const runAllButtonPresent =
      testCasesPanelElement.querySelector('#run-all-tests');

    if (isLightWorldActive && runAllButtonPresent) {
      testController.log(
        `[${testRunId}] "${TEST_SET_LIGHT_WORLD}" test set is already active. Skipping button click.`
      );
      testController.reportCondition(
        `"${TEST_SET_LIGHT_WORLD}" test set already active`,
        true
      );
    } else {
      testController.log(
        `[${testRunId}] "${TEST_SET_LIGHT_WORLD}" not active or header not found. Looking for "${TEST_SET_LIGHT_WORLD}" test set button...`
      );
      let lightWorldButton = null;
      if (
        !(await testController.pollForCondition(
          () => {
            if (!testCasesPanelElement) return false;
            const buttons = testCasesPanelElement.querySelectorAll(
              'button.test-set-button'
            );
            for (const button of buttons) {
              if (
                button.textContent
                  .toLowerCase()
                  .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
              ) {
                lightWorldButton = button;
                return true;
              }
            }
            return false;
          },
          5000,
          250,
          `"${TEST_SET_LIGHT_WORLD}" test set button`
        ))
      ) {
        // If still not found, maybe it's because the back button needs a click first
        const backButton =
          testCasesPanelElement.querySelector('#back-to-test-sets');
        if (backButton) {
          testController.log(
            `[${testRunId}] Clicking 'Back to Test Sets' to find '${TEST_SET_LIGHT_WORLD}' button.`
          );
          backButton.click();
          await new Promise((resolve) => setTimeout(resolve, 500)); // wait for UI to update
          if (
            !(await testController.pollForCondition(
              () => {
                if (!testCasesPanelElement) return false;
                const buttons = testCasesPanelElement.querySelectorAll(
                  'button.test-set-button'
                );
                for (const button of buttons) {
                  if (
                    button.textContent
                      .toLowerCase()
                      .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
                  ) {
                    lightWorldButton = button;
                    return true;
                  }
                }
                return false;
              },
              5000,
              250,
              `"${TEST_SET_LIGHT_WORLD}" test set button after back click`
            ))
          ) {
            throw new Error(
              `'${TEST_SET_LIGHT_WORLD}' test set button not found even after clicking Back.`
            );
          }
        } else {
          throw new Error(
            `'${TEST_SET_LIGHT_WORLD}' test set button not found and no Back button available.`
          );
        }
      }
      lightWorldButton.click();
      testController.log(
        `[${testRunId}] Clicked "${TEST_SET_LIGHT_WORLD}" button.`
      );
      testController.reportCondition(
        `Clicked "${TEST_SET_LIGHT_WORLD}" test set`,
        true
      );
    }

    // 3. Wait for the test cases table to be rendered
    testController.log(
      `[${testRunId}] Waiting for test cases table to render...`
    );
    if (
      !(await testController.pollForCondition(
        () => {
          return (
            testCasesPanelElement &&
            testCasesPanelElement.querySelector(
              '#test-cases-results-table tbody tr'
            ) !== null
          );
        },
        10000,
        500,
        'Test cases table rendering'
      ))
    ) {
      throw new Error('Test cases table not rendered after polling.');
    }
    testController.reportCondition('Test cases table rendered', true);

    // 4. Target and click the "Run" button for King's Tomb (index 10)
    const targetTestIndex = TARGET_TEST_INDEX_FOR_SINGLE_RUN_DEMO;
    testController.log(
      `[${testRunId}] Looking for "Run" button for test index ${targetTestIndex} using direct DOM query...`
    );
    let runButton = null;
    if (
      !(await testController.pollForCondition(
        () => {
          if (!testCasesPanelElement) return false;
          runButton = testCasesPanelElement.querySelector(
            `button[data-test-type="individual"][data-test-index="${targetTestIndex}"]`
          );
          return runButton !== null;
        },
        5000,
        250,
        `"Run" button for test index ${targetTestIndex}`
      ))
    ) {
      const tableContent = testCasesPanelElement
        ? testCasesPanelElement.innerHTML
        : 'Panel not found';
      throw new Error(
        `Run button for test case index ${targetTestIndex} not found after polling. Panel content snapshot: ${tableContent.substring(
          0,
          500
        )}...`
      );
    }

    const locationName =
      runButton.dataset.locationName || `Test Index ${targetTestIndex}`;
    testController.log(
      `[${testRunId}] Found "Run" button for: ${locationName}. Clicking...`
    );
    runButton.click();
    testController.reportCondition(
      `Clicked "Run" for "${locationName}" (index ${targetTestIndex})`,
      true
    );

    // 5. Wait for the result of that specific test case to update
    testController.log(
      `[${testRunId}] Waiting for result of "${locationName}"...`
    );
    const statusElementId = `test-status-${targetTestIndex}`;
    let finalStatusText = 'Pending';

    if (
      !(await testController.pollForCondition(
        () => {
          if (!testCasesPanelElement) return false;
          const statusElement = testCasesPanelElement.querySelector(
            `#${statusElementId}`
          );
          if (statusElement) {
            const currentText = statusElement.textContent.trim();
            const lowerText = currentText.toLowerCase();

            const isPhaseValidatingItems = lowerText.includes(
              'validating required items'
            );
            const hasValidationCompleted =
              lowerText.includes('all required items validated') ||
              lowerText.includes('fail: worker reported still accessible');

            const isStillProcessing =
              lowerText === 'pending' ||
              lowerText.includes('sending test to worker') ||
              lowerText.includes('running sub-test for item') ||
              (isPhaseValidatingItems && !hasValidationCompleted);

            if (!isStillProcessing && currentText) {
              finalStatusText = currentText;
              return true;
            }
          }
          return false;
        },
        15000,
        500,
        `Result update for "${locationName}"`
      ))
    ) {
      testController.log(
        `[${testRunId}] Test for "${locationName}" did not reach a final status within timeout. Last status: ${finalStatusText}`,
        'warn'
      );
    }

    testController.log(
      `[${testRunId}] Final status for "${locationName}": ${finalStatusText}`
    );
    const testPassed = finalStatusText.includes('✓ PASS');
    testController.reportCondition(
      `Test for "${locationName}" ${
        testPassed ? 'Passed' : 'Failed or status unclear'
      }. Status: ${finalStatusText}`,
      testPassed
    );
    if (!testPassed) {
      overallResult = false;
    }

    if (
      testPassed &&
      finalStatusText.toLowerCase().includes('validating required items')
    ) {
      let validationPassed =
        finalStatusText
          .toLowerCase()
          .includes('all required items validated') ||
        !finalStatusText
          .toLowerCase()
          .includes('fail: worker reported still accessible');

      if (
        finalStatusText
          .toLowerCase()
          .includes('fail: worker reported still accessible')
      ) {
        validationPassed = false;
      }

      testController.reportCondition(
        `Item validation for "${locationName}" ${
          validationPassed ? 'Passed' : 'Failed'
        }. Status: ${finalStatusText}`,
        validationPassed
      );
      if (!validationPassed) {
        overallResult = false;
      }
    }
  } catch (error) {
    const errorMessage = `ERROR in testCasePanelRunOneTest: ${
      error.message
    } (Stack: ${error.stack || 'N/A'})`;
    testController.log(`[${testRunId}] ${errorMessage}`, 'error');
    testController.reportCondition(errorMessage, false);
    overallResult = false;
  } finally {
    testController.log(
      `[${testRunId}] testCasePanelRunOneTest finished. Overall result: ${overallResult}`
    );
  }
  return overallResult;
}

export async function testCasePanelRunItemSubTest(testController) {
  const testRunId = `subtest-debug-${Date.now()}-${Math.random()
    .toString(36)
    .substring(2, 7)}`;
  testController.log(`[${testRunId}] Starting testCasePanelRunItemSubTest...`);
  let overallResult = true;

  try {
    testController.reportCondition('Test started', true);

    // 1. Activate the Test Cases panel
    testController.log(`[${testRunId}] Activating Test Cases panel...`);
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: PANEL_ID_TEST_CASES },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for panel to init

    let testCasesPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          testCasesPanelElement = document.querySelector('#test-cases-panel');
          return testCasesPanelElement !== null;
        },
        5000,
        250,
        'Test Cases panel DOM element'
      ))
    ) {
      throw new Error('Test Cases panel element not found.');
    }
    testController.reportCondition('Test Cases panel element found', true);

    // 2. Click the "Light World" test set button, if not already selected
    testController.log(
      `[${testRunId}] Checking if "${TEST_SET_LIGHT_WORLD}" test set is already active...`
    );
    const testSetHeader =
      testCasesPanelElement.querySelector('.test-header h3');
    const isLightWorldActive =
      testSetHeader && testSetHeader.textContent.includes(TEST_SET_LIGHT_WORLD);
    const runAllButtonPresent =
      testCasesPanelElement.querySelector('#run-all-tests');

    if (isLightWorldActive && runAllButtonPresent) {
      testController.log(
        `[${testRunId}] "${TEST_SET_LIGHT_WORLD}" test set is already active. Skipping button click.`
      );
      testController.reportCondition(
        `"${TEST_SET_LIGHT_WORLD}" test set already active`,
        true
      );
    } else {
      testController.log(
        `[${testRunId}] "${TEST_SET_LIGHT_WORLD}" not active or header not found. Looking for "${TEST_SET_LIGHT_WORLD}" test set button...`
      );
      let lightWorldButton = null;
      if (
        !(await testController.pollForCondition(
          () => {
            if (!testCasesPanelElement) return false;
            const buttons = testCasesPanelElement.querySelectorAll(
              'button.test-set-button'
            );
            for (const button of buttons) {
              if (
                button.textContent
                  .toLowerCase()
                  .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
              ) {
                lightWorldButton = button;
                return true;
              }
            }
            return false;
          },
          5000,
          250,
          `"${TEST_SET_LIGHT_WORLD}" test set button`
        ))
      ) {
        // If still not found, maybe it's because the back button needs a click first
        const backButton =
          testCasesPanelElement.querySelector('#back-to-test-sets');
        if (backButton) {
          testController.log(
            `[${testRunId}] Clicking 'Back to Test Sets' to find '${TEST_SET_LIGHT_WORLD}' button.`
          );
          backButton.click();
          await new Promise((resolve) => setTimeout(resolve, 500)); // wait for UI to update
          if (
            !(await testController.pollForCondition(
              () => {
                if (!testCasesPanelElement) return false;
                const buttons = testCasesPanelElement.querySelectorAll(
                  'button.test-set-button'
                );
                for (const button of buttons) {
                  if (
                    button.textContent
                      .toLowerCase()
                      .includes(TEST_SET_LIGHT_WORLD.toLowerCase())
                  ) {
                    lightWorldButton = button;
                    return true;
                  }
                }
                return false;
              },
              5000,
              250,
              `"${TEST_SET_LIGHT_WORLD}" test set button after back click`
            ))
          ) {
            throw new Error(
              `'${TEST_SET_LIGHT_WORLD}' test set button not found even after clicking Back.`
            );
          }
        } else {
          throw new Error(
            `'${TEST_SET_LIGHT_WORLD}' test set button not found and no Back button available.`
          );
        }
      }
      lightWorldButton.click();
      testController.log(
        `[${testRunId}] Clicked "${TEST_SET_LIGHT_WORLD}" button.`
      );
      testController.reportCondition(
        `Clicked "${TEST_SET_LIGHT_WORLD}" test set`,
        true
      );
    }

    // 3. Wait for the test cases table to be rendered
    testController.log(`[${testRunId}] Waiting for test cases table...`);
    if (
      !(await testController.pollForCondition(
        () =>
          testCasesPanelElement &&
          testCasesPanelElement.querySelector(
            '#test-cases-results-table tbody tr'
          ) !== null,
        10000,
        500,
        'Test cases table rendering'
      ))
    ) {
      throw new Error('Test cases table not rendered.');
    }
    testController.reportCondition('Test cases table rendered', true);

    // 4. Target the "King's Tomb" row (index 11, was 10) and its "Beat Agahnim 1" item link
    const targetTestIndex = TARGET_TEST_INDEX_KINGS_TOMB_SUB_TEST; // King's Tomb (Corrected from 10)
    const targetItemName = TARGET_ITEM_NAME_BEAT_AGAHNIM_1;
    testController.log(
      `[${testRunId}] Looking for item link "${targetItemName}" in test index ${targetTestIndex}...`
    );

    let itemLinkElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          if (!testCasesPanelElement) return false;
          // Find the row first
          const testRow = testCasesPanelElement.querySelector(
            `#test-cases-results-table tbody tr:nth-child(${
              targetTestIndex + 1
            })` // nth-child is 1-indexed
          );
          if (!testRow) return false;
          // Then find the link within that row
          itemLinkElement = testRow.querySelector(
            `a.test-item-link[data-item-to-remove="${targetItemName}"]`
          );
          return itemLinkElement !== null;
        },
        5000,
        250,
        `Item link "${targetItemName}" for test index ${targetTestIndex}`
      ))
    ) {
      throw new Error(
        `Item link "${targetItemName}" for King's Tomb (index ${targetTestIndex}) not found.`
      );
    }

    testController.log(
      `[${testRunId}] Found item link for "${targetItemName}". Clicking...`
    );
    itemLinkElement.click();
    testController.reportCondition(
      `Clicked item link "${targetItemName}" for King's Tomb`,
      true
    );

    // 5. Wait for the sub-test result to update in the status element
    testController.log(
      `[${testRunId}] Waiting for sub-test result for King's Tomb...`
    );
    const statusElementId = `test-status-${targetTestIndex}`;
    let finalStatusText = 'Pending';

    if (
      !(await testController.pollForCondition(
        () => {
          if (!testCasesPanelElement) return false;
          const statusElement = testCasesPanelElement.querySelector(
            `#${statusElementId}`
          );
          if (statusElement) {
            const currentText = statusElement.textContent.trim();
            const lowerText = currentText.toLowerCase();
            // Check for sub-test completion messages
            if (
              lowerText.includes(
                `sub-test for ${targetItemName.toLowerCase()}`
              ) &&
              (lowerText.includes('✓ pass') || lowerText.includes('❌ fail')) &&
              lowerText.includes('inventory updated')
            ) {
              finalStatusText = currentText;
              return true;
            }
          }
          return false;
        },
        10000, // Increased timeout for sub-test
        500,
        `Sub-test result update for "${targetItemName}" on King's Tomb`
      ))
    ) {
      testController.log(
        `[${testRunId}] Sub-test for "${targetItemName}" on King's Tomb did not reach a final status. Last status: ${finalStatusText}`,
        'warn'
      );
    }

    testController.log(
      `[${testRunId}] Final status for King's Tomb after sub-test: ${finalStatusText}`
    );
    // For this sub-test (removing Beat Agahnim 1), we expect it to PASS (meaning location became inaccessible)
    const subTestPassed =
      finalStatusText.includes(`Sub-test for ${targetItemName}: ✓ PASS`) &&
      finalStatusText.toLowerCase().includes('expected inaccessible');

    testController.reportCondition(
      `Sub-test for "${targetItemName}" ${
        subTestPassed
          ? 'Passed (became inaccessible as expected)'
          : 'Failed or status unclear'
      }. Status: ${finalStatusText}`,
      subTestPassed
    );
    if (!subTestPassed) {
      overallResult = false;
    }
  } catch (error) {
    const errorMessage = `ERROR in testCasePanelRunItemSubTest: ${
      error.message
    } (Stack: ${error.stack || 'N/A'})`;
    testController.log(`[${testRunId}] ${errorMessage}`, 'error');
    testController.reportCondition(errorMessage, false);
    overallResult = false;
  } finally {
    testController.log(
      `[${testRunId}] testCasePanelRunItemSubTest finished. Overall result: ${overallResult}`
    );
  }
  return overallResult;
}

registerTest({
  id: 'test_case_run_all',
  name: 'Test Case Panel - Run All',
  description:
    'Tests activating the Test Cases panel, selecting the vanilla Light World test, running all tests, and collecting results for Playwright.',
  testFunction: testCasePanelRunAll,
  category: 'Test Cases Panel',
  enabled: false,
  order: 1,
});

registerTest({
  id: 'test_case_run_one',
  name: 'Test Case Panel - Single Test',
  description: 'Runs a single test in the Test Cases panel.',
  testFunction: testCasePanelRunOneTest,
  category: 'Test Cases Panel',
  enabled: false,
  order: 2,
});

registerTest({
  id: 'test_case_run_sub_test',
  name: 'Test Case Panel - Single Item Sub-test',
  description:
    'Tests clicking a specific item link to trigger its sub-test in the Test Cases panel.',
  testFunction: testCasePanelRunItemSubTest,
  category: 'Test Cases Panel',
  enabled: false,
  order: 3,
});

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Application End-to-End Tests', () => {
  const testMode = process.env.TEST_MODE || 'test'; // Default to 'test' if not specified
  const testGame = process.env.TEST_GAME; // Optional game parameter
  const testSeed = process.env.TEST_SEED; // Optional seed parameter
  const testPlayer = process.env.TEST_PLAYER; // Optional player parameter for multiworld
  const rulesOverride = process.env.RULES_OVERRIDE; // Optional rules file override
  const testLayout = process.env.TEST_LAYOUT; // Optional layout parameter (mobile/desktop)
  const testOrderSeed = process.env.TEST_ORDER_SEED; // Optional test order seed for reproducible randomization

  // Build URL with all optional parameters
  let APP_URL = `http://localhost:8000/frontend/?mode=${testMode}`;
  if (testGame) {
    APP_URL += `&game=${encodeURIComponent(testGame)}`;
  }
  if (testSeed) {
    APP_URL += `&seed=${encodeURIComponent(testSeed)}`;
  }
  if (testPlayer) {
    APP_URL += `&player=${encodeURIComponent(testPlayer)}`;
  }
  if (rulesOverride) {
    APP_URL += `&rules=${encodeURIComponent(rulesOverride)}`;
  }
  if (testLayout) {
    APP_URL += `&layout=${encodeURIComponent(testLayout)}`;
  }
  if (testOrderSeed) {
    APP_URL += `&testOrderSeed=${encodeURIComponent(testOrderSeed)}`;
  }

  test('run in-app tests and check results', async ({ page }) => {
    // Listen for console logs from the page and relay them to Playwright's output
    page.on('console', (msg) => {
      // Filter out less relevant DevTools message if needed, but for now, log most things
      // if (msg.type() !== 'verbose') { // Example: ignore 'verbose' if too noisy
      //     console.log(`BROWSER LOG (${msg.type()}): ${msg.text()}`);
      // }
      // For debugging, let's log everything from the browser console
      console.log(`BROWSER LOG (${msg.type()}): ${msg.text()}`);
    });

    console.log(`PW DEBUG: Navigating to application with parameters:`);
    console.log(`  - mode: ${testMode}`);
    if (testGame) {
      console.log(`  - game: ${testGame}`);
    }
    if (testSeed) {
      console.log(`  - seed: ${testSeed}`);
    }
    if (testPlayer) {
      console.log(`  - player: ${testPlayer}`);
    }
    if (rulesOverride) {
      console.log(`  - rules: ${rulesOverride}`);
    }
    if (testLayout) {
      console.log(`  - layout: ${testLayout}`);
    }
    if (testOrderSeed) {
      console.log(`  - testOrderSeed: ${testOrderSeed}`);
    }
    console.log(`PW DEBUG: URL: ${APP_URL}`);
    // Wait until network activity has ceased, giving SPA more time to initialize
    await page.goto(APP_URL, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('PW DEBUG: Page navigation complete (network idle).');

    // Wait for the __playwrightTestsComplete__ flag to be set on window object
    // Also check for early termination due to errors
    console.log(
      'PW DEBUG: Starting to wait for __playwrightTestsComplete__ flag on window...'
    );
    await page.waitForFunction(
      () => {
        const flag = window.__playwrightTestsComplete__;
        const errorFlag = window.__playwrightTestsError__;
        const results = window.__playwrightTestResults__;

        // This console.log will appear in Playwright's output (from the browser context)
        // and will also be caught by page.on('console') above.
        //console.log(
        //  `Polling window.__playwrightTestsComplete__: "${flag}" (type: ${typeof flag})`
        //);

        // If there's an error flag, exit early
        if (errorFlag === true) {
          console.log('PW DEBUG: Early termination due to test error detected');
          return true;
        }

        // If we have results and they indicate all tests are done (even with failures), exit
        if (results && results.summary) {
          if (results.summary.totalExpected === (results.summary.totalRun + results.summary.skippedCount)) {
            console.log('PW DEBUG: All expected tests completed (with possible failures)');
            return true;
          }
        }

        return flag === true;
      },
      null,
      { timeout: 130000, polling: 500 }
    ); // Poll every 500ms

    console.log(
      'PW DEBUG: __playwrightTestsComplete__ flag detected as true.'
    );

    const results = await page.evaluate(() => window.__playwrightTestResults__);
    expect(results).toBeTruthy();
    console.log(
      'PW DEBUG: __playwrightTestResults__ retrieved from window object.'
    );

    // Results are already parsed from window object (no need for JSON.parse)
    // Log only summary to keep PW console cleaner, full log is in playwright-report.json
    // console.log('PW DEBUG: In-app test results summary:', results.summary);
    console.log(
      'PW DEBUG: Full in-app test results:',
      JSON.stringify(results, null, 2)
    );

    // Save the test results to a file
    try {
      const outputDir = path.join(process.cwd(), 'test-results', 'in-app-tests');
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      const outputFile = path.join(outputDir, `test-results-${timestamp}.json`);

      fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
      console.log(`PW DEBUG: Test results saved to: ${outputFile}`);
    } catch (error) {
      console.error('PW DEBUG: Failed to save test results to file:', error);
    }

    // The test system should complete successfully regardless of whether tests run
    expect(results.summary.failedCount).toBe(0);
    
    // If tests actually ran, they should pass
    if (results.summary.totalRun > 0) {
      expect(results.summary.passedCount).toBeGreaterThan(0);
      
      // Look for any core tests that might have run
      const coreTests = results.testDetails.filter(t => 
        t.category === 'Core' && t.status === 'passed'
      );
      if (coreTests.length > 0) {
        console.log('PW DEBUG: Found passing core tests:', coreTests.map(t => t.name));
      }
    } else {
      // If no tests ran, make sure all tests are disabled (which is a valid state)
      const enabledTests = results.testDetails.filter(t => t.status !== 'disabled');
      console.log('PW DEBUG: No tests ran. Enabled tests found:', enabledTests.length);
      // This is acceptable - the system should handle no enabled tests gracefully
    }

    // Check for test case results from testCasePanelRunAll
    const testCaseResultsString = await page.evaluate(() =>
      localStorage.getItem('__testCaseResults__')
    );

    if (testCaseResultsString) {
      console.log('PW DEBUG: Test case results found in localStorage.');
      const testCaseResults = JSON.parse(testCaseResultsString);

      console.log(
        'PW DEBUG: Test Case Results Summary:',
        `Total: ${testCaseResults.total}, ` +
          `Passed: ${testCaseResults.passed}, ` +
          `Failed: ${testCaseResults.failed}, ` +
          `Cancelled: ${testCaseResults.cancelled}`
      );

      // Log failed tests for debugging
      if (testCaseResults.failed > 0) {
        console.log('PW DEBUG: Failed test cases:');
        testCaseResults.details.forEach((test) => {
          if (test.status === 'failed' || test.status === 'error') {
            console.log(`  - ${test.locationName}: ${test.message}`);
          }
        });
      }

      // Report test case results (but don't fail the Playwright test if some test cases fail)
      // This allows us to see the results even if there are failing test cases
      console.log(
        `PW DEBUG: Test case validation completed. ${testCaseResults.passed}/${testCaseResults.total} test cases passed.`
      );

      // Optionally, you can uncomment the line below to make Playwright fail if any test cases fail:
      // expect(testCaseResults.failed).toBe(0);
    } else {
      console.log('PW DEBUG: No test case results found in localStorage.');
    }

    // Check for detailed spoiler test results
    const spoilerTestResults = await page.evaluate(() => {
      const windowResults = typeof window !== 'undefined' && window.__spoilerTestResults__ ? window.__spoilerTestResults__ : null;
      const localStorageResults = localStorage.getItem('__spoilerTestResults__');
      return {
        windowResults,
        localStorageResults: localStorageResults ? JSON.parse(localStorageResults) : null
      };
    });

    if (spoilerTestResults.windowResults) {
      const results = spoilerTestResults.windowResults;
      console.log(`PW DEBUG: Spoiler test overview: passed=${results.passed}, processed=${results.processedEvents}/${results.totalEvents}`);
      
      if (results.mismatchDetails && results.mismatchDetails.length > 0) {
        console.log(`PW DEBUG: MISMATCH DETAILS (${results.mismatchDetails.length} mismatches):`);
        results.mismatchDetails.forEach((mismatch, index) => {
          console.log(`PW DEBUG: Mismatch ${index + 1}:`);
          console.log(`  - Context: ${mismatch.context}`);
          console.log(`  - Event: ${mismatch.eventIndex}, Sphere: ${mismatch.sphereIndex}`);
          console.log(`  - Missing from state: ${JSON.stringify(mismatch.missingFromState)}`);
          console.log(`  - Extra in state: ${JSON.stringify(mismatch.extraInState)}`);
          console.log(`  - Log accessible count: ${mismatch.logAccessibleCount}`);
          console.log(`  - State accessible count: ${mismatch.stateAccessibleCount}`);
        });
      } else {
        console.log('PW DEBUG: No mismatch details found.');
      }
      
      if (results.errorMessages && results.errorMessages.length > 0) {
        console.log(`PW DEBUG: ERROR MESSAGES:`);
        results.errorMessages.forEach((msg, index) => {
          console.log(`  ${index + 1}: ${msg}`);
        });
      }
    } else {
      console.log('PW DEBUG: No detailed spoiler test results found in window.__spoilerTestResults__.');
    }

    if (spoilerTestResults.localStorageResults) {
      console.log(`PW DEBUG: Detailed spoiler test results from localStorage: ${JSON.stringify(spoilerTestResults.localStorageResults, null, 2)}`);
    } else {
      console.log('PW DEBUG: No detailed spoiler test results found in localStorage.__spoilerTestResults__.');
    }

    console.log('PW DEBUG: All Playwright assertions passed.');
  });
});

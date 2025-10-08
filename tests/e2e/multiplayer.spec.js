import { test, expect } from '@playwright/test';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

test.describe('Multiplayer Client Interaction Tests', () => {
  const testGame = process.env.TEST_GAME || 'alttp';
  const testSeed = process.env.TEST_SEED || '14089154938208861744';
  const outputDir = process.env.TEST_OUTPUT_DIR || 'test_results/multiplayer';
  const serverPort = 38281;

  // Helper function to stop any running Archipelago server
  async function stopServer() {
    try {
      // Kill any process using the server port
      await execAsync(`lsof -ti:${serverPort} | xargs kill -9 2>/dev/null || true`);
      console.log('Stopped any existing server');
    } catch (e) {
      // Ignore errors - server might not be running
    }
  }

  // Helper function to start Archipelago server
  async function startServer(gameDir) {
    // Find the .archipelago file
    const files = fs.readdirSync(gameDir);
    const archipelagoFile = files.find(f => f.endsWith('.archipelago'));

    if (!archipelagoFile) {
      throw new Error(`No .archipelago file found in ${gameDir}`);
    }

    const fullPath = `${gameDir}/${archipelagoFile}`;
    console.log(`Starting server with: ${fullPath}`);

    const serverProc = spawn('python3', [
      'MultiServer.py',
      '--host', 'localhost',
      '--port', serverPort.toString(),
      fullPath
    ], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Redirect server output to a log file
    const logStream = fs.createWriteStream('server_log.txt', { flags: 'w' });
    serverProc.stdout.pipe(logStream);
    serverProc.stderr.pipe(logStream);

    // Wait for server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if server is still running
    if (serverProc.exitCode !== null) {
      throw new Error('Server failed to start');
    }

    console.log(`Server started on port ${serverPort}`);
    return serverProc;
  }

  test('dual client test - client 1: test mode, client 2: spoilers mode', async ({ browser }) => {
    // Create two separate browser contexts (= two separate clients)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup console logging for both clients
    page1.on('console', (msg) => {
      console.log(`CLIENT1 (${msg.type()}): ${msg.text()}`);
    });
    page2.on('console', (msg) => {
      console.log(`CLIENT2 (${msg.type()}): ${msg.text()}`);
    });

    // Build URLs for both clients
    const url1 = `http://localhost:8000/frontend/?mode=test&game=${testGame}&seed=${testSeed}`;
    const url2 = `http://localhost:8000/frontend/?mode=spoilers&game=${testGame}&seed=${testSeed}`;

    console.log('='.repeat(60));
    console.log('Starting both clients...');
    console.log(`Client 1 (test mode): ${url1}`);
    console.log(`Client 2 (spoilers mode): ${url2}`);
    console.log('='.repeat(60));

    // Navigate both clients in parallel
    await Promise.all([
      page1.goto(url1, { waitUntil: 'networkidle', timeout: 60000 }),
      page2.goto(url2, { waitUntil: 'networkidle', timeout: 60000 }),
    ]);

    console.log('Both clients loaded. Waiting for test completion...');

    // Wait for both clients to complete their tests
    await Promise.all([
      page1.waitForFunction(
        () => {
          const flag = localStorage.getItem('__playwrightTestsComplete__');
          const errorFlag = localStorage.getItem('__playwrightTestsError__');
          const results = localStorage.getItem('__playwrightTestResults__');

          // Early exit on error
          if (errorFlag === 'true') {
            console.log('Client 1: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results) {
            try {
              const parsed = JSON.parse(results);
              if (parsed.summary && parsed.summary.totalExpected === (parsed.summary.totalRun + parsed.summary.skippedCount)) {
                console.log('Client 1: All expected tests completed');
                return true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          return flag === 'true';
        },
        null,
        { timeout: 130000, polling: 500 }
      ),
      page2.waitForFunction(
        () => {
          const flag = localStorage.getItem('__playwrightTestsComplete__');
          const errorFlag = localStorage.getItem('__playwrightTestsError__');
          const results = localStorage.getItem('__playwrightTestResults__');

          // Early exit on error
          if (errorFlag === 'true') {
            console.log('Client 2: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results) {
            try {
              const parsed = JSON.parse(results);
              if (parsed.summary && parsed.summary.totalExpected === (parsed.summary.totalRun + parsed.summary.skippedCount)) {
                console.log('Client 2: All expected tests completed');
                return true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          return flag === 'true';
        },
        null,
        { timeout: 130000, polling: 500 }
      ),
    ]);

    console.log('='.repeat(60));
    console.log('Both clients completed tests.');
    console.log('='.repeat(60));

    // Collect results from both clients
    const results1String = await page1.evaluate(() =>
      localStorage.getItem('__playwrightTestResults__')
    );
    const results2String = await page2.evaluate(() =>
      localStorage.getItem('__playwrightTestResults__')
    );

    expect(results1String).toBeTruthy();
    expect(results2String).toBeTruthy();

    const results1 = JSON.parse(results1String);
    const results2 = JSON.parse(results2String);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save results to separate files with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile1 = `${outputDir}/client1-test-mode-${timestamp}.json`;
    const resultsFile2 = `${outputDir}/client2-spoilers-mode-${timestamp}.json`;

    fs.writeFileSync(resultsFile1, JSON.stringify(results1, null, 2));
    fs.writeFileSync(resultsFile2, JSON.stringify(results2, null, 2));

    console.log('='.repeat(60));
    console.log('Results saved:');
    console.log(`  Client 1: ${resultsFile1}`);
    console.log(`  Client 2: ${resultsFile2}`);
    console.log('='.repeat(60));

    // Log summaries
    console.log('Client 1 (test mode) Summary:', JSON.stringify(results1.summary, null, 2));
    console.log('Client 2 (spoilers mode) Summary:', JSON.stringify(results2.summary, null, 2));

    // Collect test case results if available
    const testCaseResults1String = await page1.evaluate(() =>
      localStorage.getItem('__testCaseResults__')
    );
    const testCaseResults2String = await page2.evaluate(() =>
      localStorage.getItem('__testCaseResults__')
    );

    if (testCaseResults1String) {
      const testCaseResults1 = JSON.parse(testCaseResults1String);
      console.log('Client 1 Test Case Results:',
        `Total: ${testCaseResults1.total}, ` +
        `Passed: ${testCaseResults1.passed}, ` +
        `Failed: ${testCaseResults1.failed}, ` +
        `Cancelled: ${testCaseResults1.cancelled}`
      );

      if (testCaseResults1.failed > 0) {
        console.log('Client 1 Failed test cases:');
        testCaseResults1.details.forEach((test) => {
          if (test.status === 'failed' || test.status === 'error') {
            console.log(`  - ${test.locationName}: ${test.message}`);
          }
        });
      }
    }

    if (testCaseResults2String) {
      const testCaseResults2 = JSON.parse(testCaseResults2String);
      console.log('Client 2 Test Case Results:',
        `Total: ${testCaseResults2.total}, ` +
        `Passed: ${testCaseResults2.passed}, ` +
        `Failed: ${testCaseResults2.failed}, ` +
        `Cancelled: ${testCaseResults2.cancelled}`
      );

      if (testCaseResults2.failed > 0) {
        console.log('Client 2 Failed test cases:');
        testCaseResults2.details.forEach((test) => {
          if (test.status === 'failed' || test.status === 'error') {
            console.log(`  - ${test.locationName}: ${test.message}`);
          }
        });
      }
    }

    // Collect spoiler test results if available
    const spoilerResults1 = await page1.evaluate(() => {
      const windowResults = typeof window !== 'undefined' && window.__spoilerTestResults__ ? window.__spoilerTestResults__ : null;
      const localStorageResults = localStorage.getItem('__spoilerTestResults__');
      return {
        windowResults,
        localStorageResults: localStorageResults ? JSON.parse(localStorageResults) : null
      };
    });

    const spoilerResults2 = await page2.evaluate(() => {
      const windowResults = typeof window !== 'undefined' && window.__spoilerTestResults__ ? window.__spoilerTestResults__ : null;
      const localStorageResults = localStorage.getItem('__spoilerTestResults__');
      return {
        windowResults,
        localStorageResults: localStorageResults ? JSON.parse(localStorageResults) : null
      };
    });

    if (spoilerResults1.windowResults) {
      const results = spoilerResults1.windowResults;
      console.log(`Client 1 Spoiler test: passed=${results.passed}, processed=${results.processedEvents}/${results.totalEvents}`);
    }

    if (spoilerResults2.windowResults) {
      const results = spoilerResults2.windowResults;
      console.log(`Client 2 Spoiler test: passed=${results.passed}, processed=${results.processedEvents}/${results.totalEvents}`);

      if (results.mismatchDetails && results.mismatchDetails.length > 0) {
        console.log(`Client 2 MISMATCH DETAILS (${results.mismatchDetails.length} mismatches):`);
        results.mismatchDetails.slice(0, 5).forEach((mismatch, index) => {
          console.log(`  Mismatch ${index + 1}:`);
          console.log(`    Context: ${mismatch.context}`);
          console.log(`    Event: ${mismatch.eventIndex}, Sphere: ${mismatch.sphereIndex}`);
          console.log(`    Missing from state: ${JSON.stringify(mismatch.missingFromState).substring(0, 100)}`);
          console.log(`    Extra in state: ${JSON.stringify(mismatch.extraInState).substring(0, 100)}`);
        });
        if (results.mismatchDetails.length > 5) {
          console.log(`  ... and ${results.mismatchDetails.length - 5} more mismatches`);
        }
      }
    }

    // Assertions - both clients should complete without failures
    expect(results1.summary.failedCount).toBe(0);
    expect(results2.summary.failedCount).toBe(0);

    // If tests actually ran, they should have passed some
    if (results1.summary.totalRun > 0) {
      expect(results1.summary.passedCount).toBeGreaterThan(0);
    }
    if (results2.summary.totalRun > 0) {
      expect(results2.summary.passedCount).toBeGreaterThan(0);
    }

    console.log('='.repeat(60));
    console.log('All Playwright assertions passed.');
    console.log('='.repeat(60));

    await context1.close();
    await context2.close();
  });

  test('single client timer test - client 1 only', async ({ browser }) => {
    let serverProc = null;

    try {
      // Stop any existing server
      await stopServer();

      // Delete .apsave file to ensure clean state
      const gameDir = './frontend/presets/adventure/AP_14089154938208861744';
      const apsavePath = `${gameDir}/AP_14089154938208861744.apsave`;
      if (fs.existsSync(apsavePath)) {
        fs.unlinkSync(apsavePath);
        console.log(`Deleted ${apsavePath}`);
      }

      // Start fresh server
      serverProc = await startServer(gameDir);

      // Create one browser context
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();

    // Setup console logging
    page1.on('console', (msg) => {
      console.log(`CLIENT1 (${msg.type()}): ${msg.text()}`);
    });

    // Build URL with autoConnect parameters
    const url1 = `http://localhost:8000/frontend/?mode=test-multiplayer-client1&autoConnect=true&server=ws://localhost:38281&playerName=Player1`;

    console.log('='.repeat(60));
    console.log('Starting single client timer test...');
    console.log(`Client 1 (timer send): ${url1}`);
    console.log('='.repeat(60));

    // Navigate client
    await page1.goto(url1, { waitUntil: 'networkidle', timeout: 60000 });

    console.log('Client loaded. Waiting for test completion...');

    // Wait for test to complete
    await page1.waitForFunction(
      () => {
        const flag = localStorage.getItem('__playwrightTestsComplete__');
        const errorFlag = localStorage.getItem('__playwrightTestsError__');
        const results = localStorage.getItem('__playwrightTestResults__');

        // Early exit on error
        if (errorFlag === 'true') {
          console.log('Client 1: Early termination due to error');
          return true;
        }

        // Exit if all expected tests are done
        if (results) {
          try {
            const parsed = JSON.parse(results);
            if (parsed.summary && parsed.summary.totalExpected === (parsed.summary.totalRun + parsed.summary.skippedCount)) {
              console.log('Client 1: All expected tests completed');
              return true;
            }
          } catch (e) {
            // Ignore parse errors
          }
        }

        return flag === 'true';
      },
      null,
      { timeout: 130000, polling: 500 }
    );

    console.log('='.repeat(60));
    console.log('Client completed test.');
    console.log('='.repeat(60));

    // Collect results
    const results1String = await page1.evaluate(() =>
      localStorage.getItem('__playwrightTestResults__')
    );

    expect(results1String).toBeTruthy();

    const results1 = JSON.parse(results1String);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save results
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile1 = `${outputDir}/client1-timer-single-${timestamp}.json`;

    fs.writeFileSync(resultsFile1, JSON.stringify(results1, null, 2));

    console.log('='.repeat(60));
    console.log('Results saved:');
    console.log(`  Client 1: ${resultsFile1}`);
    console.log('='.repeat(60));

    // Log summary
    console.log('Client 1 (timer send) Summary:', JSON.stringify(results1.summary, null, 2));

    // Assertions
    expect(results1.summary.failedCount).toBe(0);
    expect(results1.summary.totalRun).toBeGreaterThan(0);
    expect(results1.summary.passedCount).toBeGreaterThan(0);

      console.log('='.repeat(60));
      console.log('All Playwright assertions passed for single client timer test.');
      console.log('='.repeat(60));

      await context1.close();
    } finally {
      // Always stop the server
      if (serverProc) {
        console.log('Stopping server...');
        serverProc.kill();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });

  test.skip('multiplayer timer test - client 1: send checks, client 2: receive checks', async ({ browser }) => {
    // Create two separate browser contexts (= two separate clients)
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup console logging for both clients
    page1.on('console', (msg) => {
      console.log(`CLIENT1 (${msg.type()}): ${msg.text()}`);
    });
    page2.on('console', (msg) => {
      console.log(`CLIENT2 (${msg.type()}): ${msg.text()}`);
    });

    // Build URLs for both clients using the new multiplayer test modes
    // Add autoConnect, server, and playerName parameters
    const url1 = `http://localhost:8000/frontend/?mode=test-multiplayer-client1&autoConnect=true&server=ws://localhost:38281&playerName=Player1`;
    const url2 = `http://localhost:8000/frontend/?mode=test-multiplayer-client2&autoConnect=true&server=ws://localhost:38281&playerName=Player1`;

    console.log('='.repeat(60));
    console.log('Starting multiplayer timer test...');
    console.log(`Client 1 (timer send): ${url1}`);
    console.log(`Client 2 (timer receive): ${url2}`);
    console.log('='.repeat(60));

    // Navigate both clients in parallel
    await Promise.all([
      page1.goto(url1, { waitUntil: 'networkidle', timeout: 60000 }),
      page2.goto(url2, { waitUntil: 'networkidle', timeout: 60000 }),
    ]);

    console.log('Both clients loaded. Waiting for test completion...');

    // Wait for both clients to complete their tests
    await Promise.all([
      page1.waitForFunction(
        () => {
          const flag = localStorage.getItem('__playwrightTestsComplete__');
          const errorFlag = localStorage.getItem('__playwrightTestsError__');
          const results = localStorage.getItem('__playwrightTestResults__');

          // Early exit on error
          if (errorFlag === 'true') {
            console.log('Client 1: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results) {
            try {
              const parsed = JSON.parse(results);
              if (parsed.summary && parsed.summary.totalExpected === (parsed.summary.totalRun + parsed.summary.skippedCount)) {
                console.log('Client 1: All expected tests completed');
                return true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          return flag === 'true';
        },
        null,
        { timeout: 130000, polling: 500 }
      ),
      page2.waitForFunction(
        () => {
          const flag = localStorage.getItem('__playwrightTestsComplete__');
          const errorFlag = localStorage.getItem('__playwrightTestsError__');
          const results = localStorage.getItem('__playwrightTestResults__');

          // Early exit on error
          if (errorFlag === 'true') {
            console.log('Client 2: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results) {
            try {
              const parsed = JSON.parse(results);
              if (parsed.summary && parsed.summary.totalExpected === (parsed.summary.totalRun + parsed.summary.skippedCount)) {
                console.log('Client 2: All expected tests completed');
                return true;
              }
            } catch (e) {
              // Ignore parse errors
            }
          }

          return flag === 'true';
        },
        null,
        { timeout: 130000, polling: 500 }
      ),
    ]);

    console.log('='.repeat(60));
    console.log('Both clients completed tests.');
    console.log('='.repeat(60));

    // Collect results from both clients
    const results1String = await page1.evaluate(() =>
      localStorage.getItem('__playwrightTestResults__')
    );
    const results2String = await page2.evaluate(() =>
      localStorage.getItem('__playwrightTestResults__')
    );

    expect(results1String).toBeTruthy();
    expect(results2String).toBeTruthy();

    const results1 = JSON.parse(results1String);
    const results2 = JSON.parse(results2String);

    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save results to separate files with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const resultsFile1 = `${outputDir}/client1-timer-send-${timestamp}.json`;
    const resultsFile2 = `${outputDir}/client2-timer-receive-${timestamp}.json`;

    fs.writeFileSync(resultsFile1, JSON.stringify(results1, null, 2));
    fs.writeFileSync(resultsFile2, JSON.stringify(results2, null, 2));

    console.log('='.repeat(60));
    console.log('Results saved:');
    console.log(`  Client 1: ${resultsFile1}`);
    console.log(`  Client 2: ${resultsFile2}`);
    console.log('='.repeat(60));

    // Log summaries
    console.log('Client 1 (timer send) Summary:', JSON.stringify(results1.summary, null, 2));
    console.log('Client 2 (timer receive) Summary:', JSON.stringify(results2.summary, null, 2));

    // Assertions - both clients should complete without failures
    expect(results1.summary.failedCount).toBe(0);
    expect(results2.summary.failedCount).toBe(0);

    // Both tests should have run and passed
    expect(results1.summary.totalRun).toBeGreaterThan(0);
    expect(results1.summary.passedCount).toBeGreaterThan(0);
    expect(results2.summary.totalRun).toBeGreaterThan(0);
    expect(results2.summary.passedCount).toBeGreaterThan(0);

    console.log('='.repeat(60));
    console.log('All Playwright assertions passed for multiplayer timer test.');
    console.log('='.repeat(60));

    await context1.close();
    await context2.close();
  });
});

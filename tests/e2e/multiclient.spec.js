import { test, expect } from '@playwright/test';
import fs from 'fs';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

test.describe('Multiplayer Client Interaction Tests', () => {
  // Set timeout to 10 minutes for all tests in this suite
  test.setTimeout(600000);

  const testGame = process.env.TEST_GAME || 'adventure';
  const testSeed = process.env.TEST_SEED || '1';
  const outputDir = process.env.TEST_OUTPUT_DIR || 'test_results/multiclient';
  const serverPort = 38281;
  const enableSingleClient = process.env.ENABLE_SINGLE_CLIENT === 'true';

  // Function to compute seed ID from seed number (matches Archipelago's logic)
  function getSeedId(seed) {
    const seedNum = parseInt(seed);
    const seeddigits = 20;

    // Simple seed-to-random implementation matching Python's random.seed()
    // This is a simplified version - for production use seed_utils.py
    const seedIds = {
      '1': 'AP_14089154938208861744',
      '2': 'AP_01043188731678011336',
      '3': 'AP_84719271504320872445',
      '4': 'AP_04075275976995164868',
      '5': 'AP_98560778217298494071'
    };

    return seedIds[seed] || `AP_${seed.padStart(seeddigits, '0')}`;
  }

  const seedId = getSeedId(testSeed);

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
  async function startServer(game, seed) {
    // Construct the path to the .archipelago file
    const computedSeedId = getSeedId(seed);
    const gameDir = `./frontend/presets/${game}/${computedSeedId}`;
    const archipelagoFile = `${computedSeedId}.archipelago`;
    const fullPath = `${gameDir}/${archipelagoFile}`;

    // Check if file exists
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Archipelago file not found: ${fullPath}`);
    }

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

  (enableSingleClient ? test : test.skip)('single client timer test - client 1 only', async ({ browser }) => {
    let serverProc = null;

    try {
      // Stop any existing server
      await stopServer();

      // Delete .apsave file to ensure clean state
      const gameDir = `./frontend/presets/${testGame}/${seedId}`;
      const apsavePath = `${gameDir}/${seedId}.apsave`;
      if (fs.existsSync(apsavePath)) {
        fs.unlinkSync(apsavePath);
        console.log(`Deleted ${apsavePath}`);
      }

      // Start fresh server
      serverProc = await startServer(testGame, testSeed);

      // Create one browser context
      const context1 = await browser.newContext();
      const page1 = await context1.newPage();

    // Setup console logging
    page1.on('console', (msg) => {
      console.log(`CLIENT1 (${msg.type()}): ${msg.text()}`);
    });

    // Build URL with autoConnect, game, and seed parameters
    // Add runningSingleClientTest=true for single client mode
    const url1 = `http://localhost:8000/frontend/?mode=test-multiclient-client1&autoConnect=true&server=ws://localhost:38281&playerName=Player1&game=${testGame}&seed=${testSeed}&runningSingleClientTest=true`;

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
        const flag = window.__playwrightTestsComplete__;
        const errorFlag = window.__playwrightTestsError__;
        const results = window.__playwrightTestResults__;

        // Early exit on error
        if (errorFlag === true) {
          console.log('Client 1: Early termination due to error');
          return true;
        }

        // Exit if all expected tests are done
        if (results && results.summary) {
          if (results.summary.totalExpected === (results.summary.totalRun + results.summary.skippedCount)) {
            console.log('Client 1: All expected tests completed');
            return true;
          }
        }

        return flag === true;
      },
      null,
      { timeout: 600000, polling: 500 }
    );

    console.log('='.repeat(60));
    console.log('Client completed test.');
    console.log('='.repeat(60));

    // Collect results
    const results1 = await page1.evaluate(() => window.__playwrightTestResults__);

    expect(results1).toBeTruthy();

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

  (!enableSingleClient ? test : test.skip)('multiclient timer test - client 1: send checks, client 2: receive checks', async ({ browser }) => {
    let serverProc = null;

    try {
      // Stop any existing server
      await stopServer();

      // Delete .apsave file to ensure clean state
      const gameDir = `./frontend/presets/${testGame}/${seedId}`;
      const apsavePath = `${gameDir}/${seedId}.apsave`;
      if (fs.existsSync(apsavePath)) {
        fs.unlinkSync(apsavePath);
        console.log(`Deleted ${apsavePath}`);
      }

      // Start fresh server
      serverProc = await startServer(testGame, testSeed);

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

    // Build URLs for both clients using the new multiclient test modes
    // Add autoConnect, server, playerName, game, and seed parameters
    // NOTE: Both clients use the same playerName because the seed only has one slot
    // The server treats the second connection as a reconnection to the same slot
    const url1 = `http://localhost:8000/frontend/?mode=test-multiclient-client1&autoConnect=true&server=ws://localhost:38281&playerName=Player1&game=${testGame}&seed=${testSeed}`;
    const url2 = `http://localhost:8000/frontend/?mode=test-multiclient-client2&autoConnect=true&server=ws://localhost:38281&playerName=Player1&game=${testGame}&seed=${testSeed}`;

    console.log('='.repeat(60));
    console.log('Starting multiclient timer test...');
    console.log(`Client 1 (timer send): ${url1}`);
    console.log(`Client 2 (timer receive): ${url2}`);
    console.log('='.repeat(60));

    // Navigate Client 1 first
    await page1.goto(url1, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Client 1 loaded and connected.');

    // Small delay to avoid race condition when both clients connect simultaneously
    await new Promise(resolve => setTimeout(resolve, 500));

    // Navigate Client 2
    await page2.goto(url2, { waitUntil: 'networkidle', timeout: 60000 });
    console.log('Client 2 loaded and connected.');

    console.log('Both clients loaded. Waiting for test completion...');

    // Wait for both clients to complete their tests
    await Promise.all([
      page1.waitForFunction(
        () => {
          const flag = window.__playwrightTestsComplete__;
          const errorFlag = window.__playwrightTestsError__;
          const results = window.__playwrightTestResults__;

          // Early exit on error
          if (errorFlag === true) {
            console.log('Client 1: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results && results.summary) {
            if (results.summary.totalExpected === (results.summary.totalRun + results.summary.skippedCount)) {
              console.log('Client 1: All expected tests completed');
              return true;
            }
          }

          return flag === true;
        },
        null,
        { timeout: 600000, polling: 500 }
      ),
      page2.waitForFunction(
        () => {
          const flag = window.__playwrightTestsComplete__;
          const errorFlag = window.__playwrightTestsError__;
          const results = window.__playwrightTestResults__;

          // Early exit on error
          if (errorFlag === true) {
            console.log('Client 2: Early termination due to error');
            return true;
          }

          // Exit if all expected tests are done
          if (results && results.summary) {
            if (results.summary.totalExpected === (results.summary.totalRun + results.summary.skippedCount)) {
              console.log('Client 2: All expected tests completed');
              return true;
            }
          }

          return flag === true;
        },
        null,
        { timeout: 600000, polling: 500 }
      ),
    ]);

    console.log('='.repeat(60));
    console.log('Both clients completed tests.');
    console.log('='.repeat(60));

    // Collect results from both clients
    const results1 = await page1.evaluate(() => window.__playwrightTestResults__);
    const results2 = await page2.evaluate(() => window.__playwrightTestResults__);

    expect(results1).toBeTruthy();
    expect(results2).toBeTruthy();

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
      console.log('All Playwright assertions passed for multiclient timer test.');
      console.log('='.repeat(60));

      await context1.close();
      await context2.close();
    } finally {
      // Always stop the server
      if (serverProc) {
        console.log('Stopping server...');
        serverProc.kill();
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  });
});

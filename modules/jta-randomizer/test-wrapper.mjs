/**
 * Test script for the JTA Instant Mode Wrapper
 *
 * This tests that the wrapper can provide instant mode functionality
 * by injecting into the game at runtime, without requiring game code modifications.
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JTA_DIR = join(__dirname, '../../../journey-to-ascension');
const WRAPPER_PATH = join(__dirname, 'jta-instant-mode-wrapper.js');

// MIME types for serving files
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
};

/**
 * Create a server that serves the game with the wrapper injected
 */
function createWrappedGameServer(port) {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            let filePath;
            let url = req.url.split('?')[0];

            if (url === '/' || url === '/index.html') {
                // Serve modified index.html that includes the wrapper
                const indexPath = join(JTA_DIR, 'index.html');
                let html = readFileSync(indexPath, 'utf-8');

                // Inject wrapper script BEFORE the game script
                const wrapperScript = readFileSync(WRAPPER_PATH, 'utf-8');
                html = html.replace(
                    '<script type="module" src="./build/game.js"></script>',
                    `<script>${wrapperScript}</script>\n<script type="module" src="./build/game.js"></script>`
                );

                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(html);
                return;
            }

            // Serve other files from JTA directory
            filePath = join(JTA_DIR, url);

            if (!existsSync(filePath)) {
                res.writeHead(404);
                res.end('Not found');
                return;
            }

            const ext = extname(filePath);
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            try {
                const content = readFileSync(filePath);
                res.writeHead(200, { 'Content-Type': contentType });
                res.end(content);
            } catch (err) {
                res.writeHead(500);
                res.end('Server error');
            }
        });

        server.listen(port, () => {
            console.log(`Wrapped game server running at http://localhost:${port}`);
            resolve(server);
        });

        server.on('error', reject);
    });
}

/**
 * Test that wrapper APIs work correctly
 */
async function testWrapperAPIs(page) {
    console.log('\n=== Testing Wrapper APIs ===\n');

    // Test 1: Check wrapper is loaded
    const wrapperLoaded = await page.evaluate(() => {
        return typeof window.jta !== 'undefined' || typeof window.setInstantMode !== 'undefined';
    });
    console.log(`1. Wrapper loaded: ${wrapperLoaded ? 'PASS' : 'FAIL'}`);

    // Test 2: getFullState returns valid data
    const state = await page.evaluate(() => {
        const fn = window.jta?.getFullState || window.getFullState;
        return fn ? fn() : null;
    });
    const stateValid = state && typeof state.currentEnergy === 'number';
    console.log(`2. getFullState works: ${stateValid ? 'PASS' : 'FAIL'}`);
    if (state) {
        console.log(`   Energy: ${state.currentEnergy}/${state.maxEnergy}, Zone: ${state.currentZone}`);
    }

    // Test 3: setInstantMode works
    const instantModeSet = await page.evaluate(() => {
        const setFn = window.jta?.setInstantMode || window.setInstantMode;
        const getFn = window.jta?.isInstantMode || window.isInstantMode;
        if (!setFn || !getFn) return null;
        setFn(true);
        return getFn();
    });
    console.log(`3. setInstantMode works: ${instantModeSet === true ? 'PASS' : 'FAIL'}`);

    // Test 4: getAvailableTasks returns tasks
    const tasks = await page.evaluate(() => {
        const fn = window.jta?.getAvailableTasks || window.getAvailableTasks;
        return fn ? fn() : null;
    });
    const tasksValid = Array.isArray(tasks) && tasks.length > 0;
    console.log(`4. getAvailableTasks works: ${tasksValid ? 'PASS' : 'FAIL'}`);
    if (tasks) {
        console.log(`   Found ${tasks.length} available tasks`);
    }

    // Test 5: performTask works
    if (tasks && tasks.length > 0) {
        const performResult = await page.evaluate((taskId) => {
            const fn = window.jta?.performTask || window.performTask;
            return fn ? fn(taskId) : null;
        }, tasks[0].id);
        console.log(`5. performTask works: ${performResult?.success ? 'PASS' : 'FAIL'}`);
        if (performResult?.success) {
            console.log(`   Started task: ${performResult.taskName}`);
        }
    }

    // Test 6: stepTick with instant mode
    const tickResult = await page.evaluate(() => {
        const fn = window.jta?.stepTick || window.stepTick;
        return fn ? fn() : null;
    });
    console.log(`6. stepTick works: ${tickResult && !tickResult.error ? 'PASS' : 'FAIL'}`);
    if (tickResult) {
        console.log(`   Energy after tick: ${tickResult.energy}`);
    }

    // Test 7: Verify task completed (instant mode should complete it)
    const stateAfter = await page.evaluate(() => {
        const fn = window.jta?.getFullState || window.getFullState;
        return fn ? fn() : null;
    });
    if (stateAfter && state) {
        const energyUsed = state.currentEnergy - stateAfter.currentEnergy;
        console.log(`7. Task consumed energy: ${energyUsed > 0 ? 'PASS' : 'FAIL'}`);
        console.log(`   Energy used: ${energyUsed.toFixed(2)}`);
    }

    // Test 8: setEnergy works
    const setEnergyResult = await page.evaluate(() => {
        const fn = window.jta?.setEnergy || window.setEnergy;
        if (!fn) return null;
        return fn(500, 500);
    });
    console.log(`8. setEnergy works: ${setEnergyResult?.current === 500 ? 'PASS' : 'FAIL'}`);

    return {
        wrapperLoaded,
        stateValid,
        instantModeSet: instantModeSet === true,
        tasksValid,
        stepTickWorks: tickResult && !tickResult.error
    };
}

/**
 * Compare wrapper behavior vs native API behavior
 */
async function compareWrapperVsNative(page) {
    console.log('\n=== Comparing Wrapper vs Native APIs ===\n');

    // Reset state
    await page.evaluate(() => {
        const init = window.jta?.initializeHeadless || window.initializeHeadless;
        if (init) init();
    });

    await page.waitForTimeout(100);

    // Enable instant mode
    await page.evaluate(() => {
        const setFn = window.jta?.setInstantMode || window.setInstantMode;
        if (setFn) setFn(true);
    });

    // Get initial state
    const initialState = await page.evaluate(() => {
        const fn = window.jta?.getFullState || window.getFullState;
        return fn ? fn() : null;
    });

    if (!initialState) {
        console.log('Could not get initial state');
        return;
    }

    console.log(`Initial energy: ${initialState.currentEnergy}`);

    // Get first task and complete it
    const tasks = await page.evaluate(() => {
        const fn = window.jta?.getAvailableTasks || window.getAvailableTasks;
        return fn ? fn() : [];
    });

    if (tasks.length === 0) {
        console.log('No tasks available');
        return;
    }

    const task = tasks[0];
    console.log(`Testing task: ${task.name} (costMult: ${task.costMult}, maxReps: ${task.maxReps})`);

    // Perform task
    await page.evaluate((id) => {
        const fn = window.jta?.performTask || window.performTask;
        if (fn) fn(id);
    }, task.id);

    // Step tick
    await page.evaluate(() => {
        const fn = window.jta?.stepTick || window.stepTick;
        if (fn) fn();
    });

    // Get final state
    const finalState = await page.evaluate(() => {
        const fn = window.jta?.getFullState || window.getFullState;
        return fn ? fn() : null;
    });

    if (finalState) {
        const energyUsed = initialState.currentEnergy - finalState.currentEnergy;
        console.log(`Final energy: ${finalState.currentEnergy}`);
        console.log(`Energy used: ${energyUsed.toFixed(4)}`);

        // Expected energy based on formula
        const BASE_COST = 10;
        const expectedCost = BASE_COST * task.costMult * task.maxReps;
        console.log(`Expected (formula): ${expectedCost.toFixed(4)}`);

        const diff = Math.abs(energyUsed - expectedCost);
        console.log(`Difference: ${diff.toFixed(4)} (${diff < 0.01 ? 'MATCH' : 'MISMATCH'})`);
    }
}

async function main() {
    console.log('JTA Instant Mode Wrapper Test');
    console.log('==============================\n');

    if (!existsSync(JTA_DIR)) {
        console.error(`Error: JTA game directory not found at ${JTA_DIR}`);
        process.exit(1);
    }

    if (!existsSync(WRAPPER_PATH)) {
        console.error(`Error: Wrapper script not found at ${WRAPPER_PATH}`);
        process.exit(1);
    }

    const PORT = 8766;
    let server;
    let browser;

    try {
        server = await createWrappedGameServer(PORT);

        console.log('Launching browser...');
        browser = await chromium.launch({
            headless: true,
            executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome'
        });
        const page = await browser.newPage();

        // Enable console logging from the page
        page.on('console', msg => {
            if (msg.text().includes('[JTA Wrapper]')) {
                console.log(`  Browser: ${msg.text()}`);
            }
        });

        console.log('Loading game with wrapper...');
        await page.goto(`http://localhost:${PORT}`);

        // Wait for game to initialize
        await page.waitForFunction(() => {
            return typeof window.getGamestate !== 'undefined' ||
                   typeof window.jta?.getFullState !== 'undefined';
        }, { timeout: 15000 });

        console.log('Game loaded.');

        // Run API tests
        const results = await testWrapperAPIs(page);

        // Run comparison test
        await compareWrapperVsNative(page);

        // Summary
        console.log('\n=== Summary ===\n');
        const passed = Object.values(results).filter(v => v).length;
        const total = Object.values(results).length;
        console.log(`Tests passed: ${passed}/${total}`);

        if (passed === total) {
            console.log('\n✓ Wrapper provides all required functionality!');
        } else {
            console.log('\n✗ Some wrapper functions not working correctly');
        }

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        if (browser) await browser.close();
        if (server) server.close();
    }
}

main();

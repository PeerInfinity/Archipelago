#!/usr/bin/env node
/**
 * Test script to validate instant mode against the simulator
 *
 * This script:
 * 1. Runs the simulator to get expected results
 * 2. Runs the real game with instant mode via Playwright
 * 3. Compares the results
 *
 * Usage: node test-instant-mode.mjs [maxResets]
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import {
    ZONES, PERKS, PerkType, SkillType, TaskType,
    SKILL_NAMES, PERK_NAMES, getMandatoryTasks
} from './gameData.js';

import {
    calcTaskCost, calcProgressPerTick, calcTaskTicks, isSingleTick,
    calcTaskEnergyCost, calcTaskXp, createInitialState,
    simulateRun, doEnergyReset, calcEnergyDrainPerTick
} from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const JTA_DIR = join(__dirname, '../../../journey-to-ascension');

// MIME types for serving files
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.map': 'application/json',
};

/**
 * Create a simple HTTP server to serve the JTA game
 */
function createGameServer(port) {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            // Serve from JTA_DIR - the build files are in ./build/
            let filePath = join(JTA_DIR, req.url === '/' ? 'index.html' : req.url);

            try {
                const content = readFileSync(filePath);
                const ext = extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'text/plain' });
                res.end(content);
            } catch (err) {
                res.writeHead(404);
                res.end(`Not found: ${req.url}`);
            }
        });

        server.listen(port, () => {
            console.log(`Game server running at http://localhost:${port}`);
            resolve(server);
        });

        server.on('error', reject);
    });
}

/**
 * Run the game with instant mode and execute specific tasks
 * Returns detailed per-task results for comparison
 */
async function runGameWithInstantMode(page, taskSequence, startingEnergy = 100) {
    // Initialize game in headless mode
    await page.evaluate(() => {
        window.initializeHeadless();
        window.pauseGameLoop();
        window.setInstantMode(true);
    });

    // Set starting energy if different from default
    if (startingEnergy !== 100) {
        await page.evaluate((energy) => {
            window.setEnergy(energy, energy);
        }, startingEnergy);
    }

    const results = {
        taskResults: [],
        finalState: null
    };

    // Get initial state
    const initialState = await page.evaluate(() => window.getFullState());
    results.initialState = initialState;

    for (const taskId of taskSequence) {
        const beforeState = await page.evaluate(() => window.getFullState());

        // Perform the task
        const performResult = await page.evaluate((id) => {
            return window.performTask(id);
        }, taskId);

        if (!performResult.success) {
            results.taskResults.push({
                taskId,
                success: false,
                error: performResult.error,
                beforeState: {
                    energy: beforeState.currentEnergy,
                    zone: beforeState.currentZone
                }
            });
            continue;
        }

        // Step tick to complete it (instant mode)
        await page.evaluate(() => window.stepTick());

        const afterState = await page.evaluate(() => window.getFullState());

        results.taskResults.push({
            taskId,
            taskName: performResult.taskName,
            success: true,
            energyUsed: beforeState.currentEnergy - afterState.currentEnergy,
            beforeEnergy: beforeState.currentEnergy,
            afterEnergy: afterState.currentEnergy,
            beforeZone: beforeState.currentZone,
            afterZone: afterState.currentZone,
            skillLevels: afterState.skills.map(s => ({ type: s.type, level: s.level })),
            triggeredReset: afterState.isInEnergyReset
        });

        // Handle energy reset if triggered
        if (afterState.isInEnergyReset) {
            await page.evaluate(() => window.doEnergyReset());
        }
    }

    results.finalState = await page.evaluate(() => window.getFullState());
    return results;
}

/**
 * Run a simulation using the simulator to compute expected energy for tasks
 */
function runSimulatorForTasks(taskSequence, startingEnergy = 100) {
    const state = createInitialState();
    // Initialize currentEnergy to specified starting energy
    state.currentEnergy = startingEnergy;
    state.maxEnergy = startingEnergy;

    const results = {
        taskResults: [],
        initialState: {
            currentEnergy: state.currentEnergy,
            maxEnergy: state.maxEnergy,
            currentZone: state.currentZone
        }
    };

    for (const taskId of taskSequence) {
        // Find the task in the zone data
        const zone = ZONES[state.currentZone];
        if (!zone) {
            results.taskResults.push({
                taskId,
                success: false,
                error: `Zone ${state.currentZone} not found`
            });
            continue;
        }

        const task = zone.tasks.find(t => t.id === taskId);
        if (!task) {
            results.taskResults.push({
                taskId,
                success: false,
                error: `Task ${taskId} not found in zone ${state.currentZone}`
            });
            continue;
        }

        // Calculate expected energy cost using simulator
        const energyCost = calcTaskEnergyCost(task, state.currentZone, state);
        const beforeEnergy = state.currentEnergy;

        // Check if we have enough energy
        if (energyCost > state.currentEnergy) {
            results.taskResults.push({
                taskId,
                taskName: task.name,
                success: true,
                expectedEnergyCost: energyCost,
                beforeEnergy: beforeEnergy,
                afterEnergy: state.currentEnergy - energyCost,
                triggeredReset: true,
                note: 'Would trigger reset'
            });
            continue;
        }

        // Apply the task
        state.currentEnergy -= energyCost;

        results.taskResults.push({
            taskId,
            taskName: task.name,
            success: true,
            expectedEnergyCost: energyCost,
            beforeEnergy: beforeEnergy,
            afterEnergy: state.currentEnergy,
            triggeredReset: false
        });
    }

    results.finalState = {
        currentEnergy: state.currentEnergy,
        currentZone: state.currentZone
    };

    return results;
}

/**
 * Compare task-by-task results between game and simulator
 */
function compareResults(gameResults, simResults) {
    console.log('\n=== TASK-BY-TASK COMPARISON ===\n');

    const numTasks = Math.min(gameResults.taskResults.length, simResults.taskResults.length);
    let mismatches = 0;
    let totalEnergyDiff = 0;
    let resetCases = 0;
    let skippedCases = 0;

    console.log('Initial state:');
    console.log(`  Game: energy=${gameResults.initialState.currentEnergy}`);
    console.log(`  Sim:  energy=${simResults.initialState.currentEnergy}\n`);

    for (let i = 0; i < numTasks; i++) {
        const gameTask = gameResults.taskResults[i];
        const simTask = simResults.taskResults[i];

        if (!gameTask.success || !simTask.success) {
            skippedCases++;
            console.log(`Task ${i + 1} (ID ${gameTask.taskId}): SKIPPED`);
            if (gameTask.error) console.log(`  Game error: ${gameTask.error}`);
            if (simTask.error) console.log(`  Sim error: ${simTask.error}`);
            continue;
        }

        // If reset was triggered, the energy measurement is unreliable
        // (energy gets clamped to 0, so we only measure available energy, not actual cost)
        if (gameTask.triggeredReset) {
            resetCases++;
            console.log(`Task ${i + 1} "${gameTask.taskName}": RESET TRIGGERED`);
            console.log(`  Game: ${gameTask.beforeEnergy.toFixed(2)} -> ${gameTask.afterEnergy.toFixed(2)} (had ${gameTask.beforeEnergy.toFixed(2)}, needed ${simTask.expectedEnergyCost.toFixed(2)})`);
            console.log(`  Insufficient energy - reset expected`);
            continue;
        }

        const energyDiff = Math.abs(gameTask.energyUsed - simTask.expectedEnergyCost);
        totalEnergyDiff += energyDiff;

        // Allow small floating point differences (< 0.01)
        if (energyDiff > 0.01) {
            mismatches++;
            console.log(`Task ${i + 1} "${gameTask.taskName}" (ID ${gameTask.taskId}): MISMATCH`);
            console.log(`  Game: ${gameTask.beforeEnergy.toFixed(2)} -> ${gameTask.afterEnergy.toFixed(2)} (used: ${gameTask.energyUsed.toFixed(4)})`);
            console.log(`  Sim expected:     ${simTask.expectedEnergyCost.toFixed(4)}`);
            console.log(`  Difference:       ${energyDiff.toFixed(4)}`);
        } else {
            console.log(`Task ${i + 1} "${gameTask.taskName}": OK`);
            console.log(`  Game: ${gameTask.beforeEnergy.toFixed(2)} -> ${gameTask.afterEnergy.toFixed(2)} (used: ${gameTask.energyUsed.toFixed(2)})`);
        }
    }

    const validComparisons = numTasks - skippedCases - resetCases;
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total tasks: ${numTasks}`);
    console.log(`  Skipped (errors): ${skippedCases}`);
    console.log(`  Reset triggered: ${resetCases}`);
    console.log(`  Valid comparisons: ${validComparisons}`);
    console.log(`  Mismatches: ${mismatches}`);
    if (validComparisons > 0) {
        console.log(`  Total energy difference: ${totalEnergyDiff.toFixed(4)}`);
        console.log(`  Match rate: ${((validComparisons - mismatches) / validComparisons * 100).toFixed(1)}%`);
    }

    // Final state comparison
    console.log('\n=== FINAL STATE ===');
    console.log(`Game: energy=${gameResults.finalState.currentEnergy.toFixed(2)}, zone=${gameResults.finalState.currentZone}`);
    console.log(`Sim:  energy=${simResults.finalState.currentEnergy.toFixed(2)}, zone=${simResults.finalState.currentZone}`);

    return mismatches === 0;
}

/**
 * Complete all tasks needed to reach a target zone
 * This completes ALL reps of mandatory tasks and Travel tasks to advance through zones
 */
async function advanceToZone(page, targetZone, verbose = false) {
    // Get available tasks and complete them until we reach the target zone
    for (let attempts = 0; attempts < 500; attempts++) {
        const state = await page.evaluate(() => window.getFullState());

        if (state.currentZone >= targetZone) {
            return { success: true, zone: state.currentZone };
        }

        // Get all tasks using getAvailableTasks (which uses current GAMESTATE)
        // Note: window.getGamestate may point to stale object after initializeHeadless
        const allTasks = await page.evaluate(() => {
            // Use the full state API which returns data from the current GAMESTATE
            const state = window.getFullState();
            return state.tasks;
        });

        // Find first enabled task that still has reps to complete
        const enabledTask = allTasks.find(t => t.enabled && t.reps < t.maxReps);

        if (!enabledTask) {
            // Debug: show task states
            const incomplete = allTasks.filter(t => t.reps < t.maxReps);
            return {
                success: false,
                error: `No enabled tasks. Zone ${state.currentZone}. Incomplete tasks: ${incomplete.map(t => `${t.name}(${t.reps}/${t.maxReps},en=${t.enabled})`).join(', ')}`,
                zone: state.currentZone
            };
        }

        if (verbose) {
            console.log(`  Advancing: ${enabledTask.name} (${enabledTask.reps}/${enabledTask.maxReps})`);
        }

        // Perform and complete this task
        const result = await page.evaluate((id) => window.performTask(id), enabledTask.id);
        if (!result.success) {
            return { success: false, error: `performTask failed: ${result.error}`, zone: state.currentZone };
        }

        await page.evaluate(() => window.stepTick());

        // Check if task was actually advanced (using getFullState which uses current GAMESTATE)
        const afterState = await page.evaluate(() => window.getFullState());
        const updatedTask = afterState.tasks.find(t => t.id === enabledTask.id);
        const newReps = updatedTask ? updatedTask.reps : -1;

        if (newReps === enabledTask.reps) {
            return {
                success: false,
                error: `Task ${enabledTask.name} did not advance (still ${newReps}/${enabledTask.maxReps})`,
                zone: state.currentZone
            };
        }
    }

    return { success: false, error: 'Max attempts reached' };
}

/**
 * Test a single task with fresh game state and sufficient energy
 * Returns the actual energy used by the game
 */
async function testSingleTask(page, taskId, zoneId, port, testEnergy = 100000) {
    // Reload the page to get fresh game state
    await page.goto(`http://localhost:${port}`);

    // Wait for game to initialize
    await page.waitForFunction(() => typeof window.getFullState === 'function', { timeout: 10000 });

    // Initialize in headless mode with instant mode
    await page.evaluate(() => {
        window.initializeHeadless();
        window.pauseGameLoop();
        window.setInstantMode(true);
    });

    // Set high energy so we don't run out
    await page.evaluate((energy) => {
        window.setEnergy(energy, energy);
    }, testEnergy);

    // If we need to be in a different zone, advance to it by completing tasks
    if (zoneId > 0) {
        const advanceResult = await advanceToZone(page, zoneId, false); // Set to true for debug
        if (!advanceResult.success) {
            return {
                taskId,
                success: false,
                error: `Could not reach zone ${zoneId}: ${advanceResult.error}`
            };
        }

        // Reset energy after advancing
        await page.evaluate((energy) => {
            window.setEnergy(energy, energy);
        }, testEnergy);
    }

    const beforeState = await page.evaluate(() => window.getFullState());

    // Build simulator state from game state (skills, perks, etc.)
    // This ensures simulator uses same conditions as the game
    const simState = {
        maxEnergy: beforeState.maxEnergy,
        skillLevels: {},
        skillXp: {},
        skillSpeedModifiers: {},
        perks: new Set(beforeState.perks),
        power: beforeState.power,
        attunement: beforeState.attunement,
        currentZone: beforeState.currentZone,
        highestZone: beforeState.highestZone,
        highestZoneFullyCompleted: beforeState.highestZoneFullyCompleted,
        items: new Map(),
        scrollsOfHaste: 0,
        magicRings: 0,
        bottledLightnings: 0,
        bossesDefeated: new Set(),
        unlockedHiddenTasks: new Set(),
    };

    // Copy skill levels
    for (const skill of beforeState.skills) {
        simState.skillLevels[skill.type] = skill.level;
        simState.skillXp[skill.type] = skill.progress;
    }

    // Perform the task
    const performResult = await page.evaluate((id) => {
        return window.performTask(id);
    }, taskId);

    if (!performResult.success) {
        return {
            taskId,
            success: false,
            error: performResult.error
        };
    }

    // Step tick to complete it
    await page.evaluate(() => window.stepTick());

    const afterState = await page.evaluate(() => window.getFullState());

    return {
        taskId,
        taskName: performResult.taskName,
        success: true,
        beforeEnergy: beforeState.currentEnergy,
        afterEnergy: afterState.currentEnergy,
        energyUsed: beforeState.currentEnergy - afterState.currentEnergy,
        skillLevelsBefore: beforeState.skills,
        skillLevelsAfter: afterState.skills,
        triggeredReset: afterState.isInEnergyReset,
        simState: simState  // Return the captured state for simulator comparison
    };
}

/**
 * Main test function - comprehensive per-task comparison
 */
async function main() {
    console.log('Journey to Ascension - Comprehensive Task Energy Test');
    console.log('======================================================\n');

    // Check if JTA directory exists
    if (!existsSync(JTA_DIR)) {
        console.error(`Error: JTA game directory not found at ${JTA_DIR}`);
        console.error('Please clone the game repository first.');
        process.exit(1);
    }

    // Start game server
    const PORT = 8765;
    let server;
    let browser;

    try {
        server = await createGameServer(PORT);

        // Launch browser
        console.log('Launching browser...');
        browser = await chromium.launch({
            headless: true,
            executablePath: '/root/.cache/ms-playwright/chromium-1194/chrome-linux/chrome'
        });
        const page = await browser.newPage();

        // Navigate to game
        console.log('Loading game...');
        await page.goto(`http://localhost:${PORT}`);

        // Wait for game to initialize
        await page.waitForFunction(() => typeof window.getFullState === 'function', { timeout: 10000 });

        console.log('Game loaded.\n');

        // Determine how many zones to test (from command line arg or default to 3)
        const maxZones = parseInt(process.argv[2]) || 3;

        let mismatches = 0;
        let tested = 0;

        // Test tasks from multiple zones
        for (let zoneId = 0; zoneId < Math.min(maxZones, ZONES.length); zoneId++) {
            const zone = ZONES[zoneId];
            console.log(`\n=== Zone ${zoneId}: "${zone.name}" ===\n`);
            console.log('Task'.padEnd(30) + 'Game'.padStart(12) + 'Simulator'.padStart(12) + 'Diff'.padStart(10) + 'Status');
            console.log('-'.repeat(74));

            for (const task of zone.tasks) {
                // Test task in game
                const gameResult = await testSingleTask(page, task.id, zoneId, PORT);

                if (!gameResult.success) {
                    console.log(`${task.name.substring(0, 29).padEnd(30)} ${'ERROR'.padStart(12)} ${'-'.padStart(12)} ${'-'.padStart(10)} SKIP`);
                    // Show error details for non-"not enabled" errors
                    if (!gameResult.error.includes('not enabled')) {
                        console.log(`  Error: ${gameResult.error}`);
                    }
                    continue;
                }

                // Calculate expected energy cost using simulator with the game's actual state
                // This ensures we compare apples-to-apples (same skill levels, perks, etc.)
                const simEnergyCost = calcTaskEnergyCost(task, zoneId, gameResult.simState);

                const diff = Math.abs(gameResult.energyUsed - simEnergyCost);
                const status = diff < 0.01 ? 'OK' : 'MISMATCH';

                if (diff >= 0.01) {
                    mismatches++;
                }
                tested++;

                console.log(
                    `${task.name.substring(0, 29).padEnd(30)}` +
                    `${gameResult.energyUsed.toFixed(4).padStart(12)}` +
                    `${simEnergyCost.toFixed(4).padStart(12)}` +
                    `${diff.toFixed(4).padStart(10)}` +
                    ` ${status}`
                );

                // If mismatch, show detailed breakdown
                if (diff >= 0.01) {
                    // Get detailed calculation from simulator using game's state
                    const ss = gameResult.simState;
                    const taskCost = calcTaskCost(task, zoneId);
                    const progressPerTick = calcProgressPerTick(task, zoneId, ss);
                    const ticks = calcTaskTicks(task, zoneId, ss);
                    const singleTick = isSingleTick(task, zoneId, ss);
                    const drainPerTick = calcEnergyDrainPerTick(task, zoneId, ss, singleTick);

                    console.log(`  Breakdown:`);
                    console.log(`    Task cost (base): ${taskCost.toFixed(4)}`);
                    console.log(`    Progress/tick: ${progressPerTick.toFixed(4)}`);
                    console.log(`    Ticks needed: ${ticks}`);
                    console.log(`    Single tick: ${singleTick}`);
                    console.log(`    Energy drain/tick: ${drainPerTick.toFixed(4)}`);
                    console.log(`    costMult: ${task.costMult}, maxReps: ${task.maxReps}`);
                    console.log(`    Skills: ${task.skills.map(s => `${SKILL_NAMES[s]}:${ss.skillLevels[s]||0}`).join(', ')}`);
                }
            }
        }

        console.log('-'.repeat(74));
        console.log(`\nResults: ${tested - mismatches}/${tested} tasks match (${((tested - mismatches) / tested * 100).toFixed(1)}%)`);

        if (mismatches > 0) {
            console.log(`\n${mismatches} mismatches found - simulator needs adjustment`);
            process.exit(1);
        } else {
            console.log('\n✓ All tests passed! Simulator matches game.');
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

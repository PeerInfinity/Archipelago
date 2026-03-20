#!/usr/bin/env node
/**
 * JTA Cost Debugger - Real Game Verification via Playwright
 *
 * Runs the cost debugger's planned steps through the actual game engine
 * in a headless browser with instant mode, comparing planned vs actual results.
 *
 * Usage:
 *   node scripts/jta/game-verify.js \
 *     -g frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_gamedata.json \
 *     -s frontend/presets/jta/AP_SEED/AP_SEED_sphere_log.jsonl \
 *     [--port 8000] [--two-pass] [--normal-attempts 2]
 *
 * Requires:
 *   - Playwright (npm install playwright)
 *   - The dev server running (python -m http.server 8000), OR use --serve
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { JTACostPlanner } from '../../frontend/modules/jtaCostDebugger/jtaCostPlanner.js';
import { executeTask as sharedExecuteTask } from '../../frontend/modules/shared/jtaGameCalc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');
const FRONTEND_DIR = join(PROJECT_ROOT, 'frontend');

// ============================================================================
// Args
// ============================================================================

function parseArgs(argv) {
    const args = { verbose: 0, port: 8000, serve: false };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--gamedata' || arg === '-g') {
            args.gamedata = argv[++i];
        } else if (arg === '--spherelog' || arg === '-s') {
            args.spherelog = argv[++i];
        } else if (arg === '--port') {
            args.port = parseInt(argv[++i]);
        } else if (arg === '--serve') {
            args.serve = true;
        } else if (arg === '--normal-attempts') {
            args.normalAttempts = parseInt(argv[++i]);
        } else if (arg === '--perk-attempts') {
            args.perkAttempts = parseInt(argv[++i]);
        } else if (arg === '--boss-attempts') {
            args.bossAttempts = parseInt(argv[++i]);
        } else if (arg === '--traversal-attempts') {
            args.traversalAttempts = parseInt(argv[++i]);
        } else if (arg === '--adjust-xp') {
            args.adjustXpMult = true;
        } else if (arg === '--two-pass') {
            args.twoPass = true;
            args.adjustXpMult = true;
        } else if (arg === '-v' || arg === '--verbose') {
            args.verbose++;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
JTA Cost Debugger - Real Game Verification

Runs planned costs through the actual game engine via Playwright headless browser.

Usage:
  node scripts/jta/game-verify.js [options]

Options:
  -g, --gamedata <path>         Randomized game data JSON (required)
  -s, --spherelog <path>        Sphere log JSONL (required)
  --port <n>                    Port for dev server (default: 8000)
  --serve                       Start a temporary HTTP server (otherwise assumes one is running)
  --normal-attempts <n>         Attempts for regular tasks (default: 2)
  --perk-attempts <n>           Attempts for perk tasks (default: 5)
  --boss-attempts <n>           Attempts for boss tasks (default: 5)
  --traversal-attempts <n>      Attempts for traversal tasks (default: 5)
  --adjust-xp                   Adjust xpMult on grinding tasks
  --two-pass                    Two-pass mode (implies --adjust-xp)
  -v, --verbose                 Show per-step details
  -h, --help                    Show this help
`);
}

// ============================================================================
// HTTP Server (optional)
// ============================================================================

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.jsonl': 'text/plain',
    '.yaml': 'text/yaml',
    '.map': 'application/json',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
};

function createGameServer(port) {
    return new Promise((resolve, reject) => {
        const server = createServer((req, res) => {
            const url = new URL(req.url, `http://localhost:${port}`);
            let filePath = join(PROJECT_ROOT, url.pathname);

            try {
                const content = readFileSync(filePath);
                const ext = extname(filePath);
                res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
                res.end(content);
            } catch {
                res.writeHead(404);
                res.end(`Not found: ${url.pathname}`);
            }
        });

        server.listen(port, () => {
            resolve(server);
        });

        server.on('error', reject);
    });
}

// ============================================================================
// Main
// ============================================================================

const args = parseArgs(process.argv);

if (args.help) {
    printUsage();
    process.exit(0);
}

if (!args.gamedata || !args.spherelog) {
    console.error('Error: --gamedata and --spherelog are required');
    printUsage();
    process.exit(1);
}

const gameDataJson = JSON.parse(readFileSync(args.gamedata, 'utf-8'));
const sphereLogContent = readFileSync(args.spherelog, 'utf-8');

const settings = {
    normalAttempts: args.normalAttempts ?? 2,
    perkAttempts: args.perkAttempts ?? 5,
    bossAttempts: args.bossAttempts ?? 5,
    traversalAttempts: args.traversalAttempts ?? 5,
    adjustXpMult: args.adjustXpMult ?? false,
};

// Step 1: Run the cost planner to get planned steps
console.log('Running cost planner...');
let planner = new JTACostPlanner();
let result = planner.planCosts(gameDataJson, sphereLogContent, settings);

// Two-pass mode
if (args.twoPass) {
    const xpMultOverrides = new Map();
    for (const step of result.steps) {
        const xa = step.costAssignment?.xpAdjustments;
        if (!xa) continue;
        for (const adj of xa) {
            xpMultOverrides.set(adj.taskName, adj.newXpMult);
        }
    }
    if (xpMultOverrides.size > 0) {
        console.log(`Pass 1: ${xpMultOverrides.size} xpMult adjustments found`);
        const pass2GameData = JSON.parse(JSON.stringify(gameDataJson));
        for (const zone of pass2GameData.zones) {
            for (const task of zone.tasks) {
                if (xpMultOverrides.has(task.name)) {
                    task.xpMult = xpMultOverrides.get(task.name);
                }
            }
        }
        planner = new JTACostPlanner();
        result = planner.planCosts(pass2GameData, sphereLogContent, { ...settings, adjustXpMult: false });
        console.log('Pass 2: re-solved with baked xpMult values');
    }
}

const { steps, assignedCosts } = result;
console.log(`Planned: ${steps.length} steps, ${assignedCosts.size} tasks costed\n`);

// Step 2: Build the costs-only data for replaceGameData
const costsOnlyData = {
    zones: (result.adjustedData.zones || []).map(zone => ({
        tasks: (zone.tasks || []).map(task => ({
            id: task.id,
            costMult: task.costMult,
            xpMult: task.xpMult,
        })),
    })),
};

// Build task ID lookup
const taskIdByName = new Map();
for (const zone of gameDataJson.zones) {
    for (const task of zone.tasks) {
        taskIdByName.set(task.name, task.id);
    }
}

// Build sphere perk schedule (for granting perks between spheres)
// We need perk NAMES (not IDs) because the game grants by name
const spherePerkSchedule = new Map();
const sphereLogLines = sphereLogContent.trim().split('\n').map(l => JSON.parse(l));
// parseSphereLog groups by sphere — use the planner's parsed version
// but we need to know which perks each sphere grants
import { parseSphereLog } from '../../frontend/modules/jta-randomizer/jtaCostGenerator.js';
const sphereSteps = parseSphereLog(sphereLogContent, settings.playerNumber ?? 1);
for (const ss of sphereSteps) {
    spherePerkSchedule.set(ss.sphereIndex, ss.perksReceived || []);
}
const sphereIndices = [...spherePerkSchedule.keys()].sort((a, b) => a - b);

// Step 3: Launch browser and run real game verification
let server = null;
let browser = null;

try {
    // Start server if needed
    if (args.serve) {
        server = await createGameServer(args.port);
        console.log(`Dev server started on port ${args.port}`);
    }

    // Launch headless browser
    console.log('Launching headless browser...');
    browser = await chromium.launch({
        headless: true,
        executablePath: '/home/robert/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    });
    const page = await browser.newPage();

    // Navigate to the game iframe page
    const gameUrl = `http://localhost:${args.port}/frontend/modules/jta-remote/index-iframe.html`;
    console.log(`Loading game from ${gameUrl}...`);

    // Clear saved game state so the game starts fresh (no accumulated skills)
    await page.goto(gameUrl);
    await page.evaluate(() => localStorage.removeItem('incrementalGameSave'));
    await page.reload();

    // Wait for the game to initialize (GAMESTATE + updateGamestate available)
    await page.waitForFunction(
        () => !!window.getGamestate && typeof window.updateGamestate === 'function' && typeof window.clickTask === 'function',
        { timeout: 30000 }
    );
    console.log('Game loaded (fresh state, no saved progress)');

    // Pause the game loop and load our cost data
    await page.evaluate((data) => {
        // Pause game loop by clearing its interval
        // (intercepted by wrapper if loaded, otherwise find it)
        if (window.jta?.pauseGameLoop) {
            window.jta.pauseGameLoop();
        }

        // Update task definitions with our planned costs
        const taskLookup = window.TASK_LOOKUP;
        if (!taskLookup) throw new Error('TASK_LOOKUP not available');
        for (const zone of data.zones) {
            for (const task of zone.tasks) {
                const def = taskLookup.get(task.id);
                if (!def) continue;
                if (task.costMult !== undefined) def.cost_multiplier = task.costMult;
                if (task.xpMult !== undefined) def.xp_mult = task.xpMult;
            }
        }
    }, costsOnlyData);

    console.log('Cost data loaded into game\n');

    // Step 4: Replay planned steps through the REAL GAME ENGINE.
    // For each task: clickTask to activate it, then call updateGamestate()
    // in a loop until the task completes (all reps done) or energy runs out.
    // This uses the game's actual formulas, not a simulator.
    const startTime = Date.now();
    let lastSphereIndex = null;
    let stepsMatched = 0;
    let energyMismatches = 0;
    let correctedMismatches = 0; // mismatches using drift-corrected prediction

    // Build task lookup for shared module recalculation
    const taskDefByName = new Map();
    for (const zone of result.adjustedData.zones) {
        for (const task of zone.tasks) {
            taskDefByName.set(task.name, { costMult: task.costMult, xpMult: task.xpMult, maxReps: task.maxReps, skills: task.skills, type: task.type, zoneId: zone.id ?? 0 });
        }
    }
    // Track skill XP multipliers for the shared module
    const skillXpMult = {};
    for (const zone of result.adjustedData.zones) {
        for (const task of zone.tasks) {
            for (const s of task.skills) { if (!(s in skillXpMult)) skillXpMult[s] = 1; }
        }
    }

    for (let i = 0; i < steps.length; i++) {
        const planned = steps[i];
        const focusName = planned.targetTask;

        // Grant perks on sphere transitions
        if (lastSphereIndex !== null && planned.sphereIndex !== lastSphereIndex) {
            const perksToGrant = [];
            for (const si of sphereIndices) {
                if (si < lastSphereIndex) continue;
                if (si >= planned.sphereIndex) break;
                perksToGrant.push(...(spherePerkSchedule.get(si) || []));
            }
            if (perksToGrant.length > 0) {
                await page.evaluate((perkNames) => {
                    const gs = window.getGamestate;
                    if (!gs || !gs.perks) return;
                    const perkDefs = window.PERKS;
                    if (!perkDefs) return;
                    for (const name of perkNames) {
                        for (const [id, def] of Object.entries(perkDefs)) {
                            if (def.name === name) {
                                gs.perks.set(parseInt(id), true);
                                break;
                            }
                        }
                    }
                }, perksToGrant);
            }
        }
        lastSphereIndex = planned.sphereIndex;

        // Each step starts with fresh energy (matching the planner, which
        // always begins each step with energy = maxEnergy). doHeadlessReset
        // resets zone, tasks, and energy while preserving skills/perks.
        await page.evaluate(() => window.doHeadlessReset());

        // Read game's skill state BEFORE execution (for drift-corrected comparison)
        const preStepSkills = await page.evaluate(() => {
            const gs = window.getGamestate;
            const levels = {}, xp = {};
            for (const s of gs.skills) {
                if (s.level > 0) levels[s.type] = s.level;
                if (s.progress > 0) xp[s.type] = s.progress;
            }
            const perks = [];
            if (gs.perks instanceof Map) {
                for (const [id, active] of gs.perks) { if (active) perks.push(id); }
            }
            return { levels, xp, perks, highestZone: gs.highest_zone };
        });

        // Execute each task in the planned queue using the real game engine
        const stepResult = await page.evaluate(({ queue, focusName, taskIdByName }) => {
            const gs = window.getGamestate;
            let focusCompleted = false;
            const energyBefore = gs.current_energy;

            for (const pEntry of queue) {
                if (pEntry.status === 'uncosted_skipped') continue;

                const taskId = taskIdByName[pEntry.taskName];
                if (taskId === undefined) continue;

                // Find the task in the current zone's tasks
                const task = gs.tasks?.find(t => t.task_definition?.id === taskId);
                if (!task || !task.enabled) continue;

                const maxReps = task.task_definition.max_reps;
                if (maxReps > 0 && task.reps >= maxReps) continue;

                // Activate the task
                window.clickTask(task);

                // Run the game engine tick by tick until this task completes or energy runs out
                const repsBefore = task.reps;
                let ticks = 0;
                const MAX_TICKS = 100000;
                while (ticks < MAX_TICKS) {
                    if (gs.is_in_energy_reset) break;
                    if (gs.active_task !== task) break; // task finished
                    window.updateGamestate();
                    ticks++;
                }

                const completed = task.reps >= maxReps;
                if (pEntry.taskName === focusName && completed) {
                    focusCompleted = true;
                }

                if (gs.is_in_energy_reset) break;
                if (gs.current_energy <= 0) break;
            }

            return {
                focusCompleted,
                energyRemaining: gs.current_energy,
                isInEnergyReset: gs.is_in_energy_reset || false,
            };
        }, {
            queue: planned.queue || [],
            focusName,
            taskIdByName: Object.fromEntries(taskIdByName),
        });

        // Drift-corrected prediction: use game's actual pre-step skills to recalculate
        // what the shared module would predict for this step's queue.
        // This eliminates accumulated drift — any delta is from per-step formula differences only.
        let correctedEnergy = 100; // maxEnergy
        const correctedState = {
            skillLevels: { ...preStepSkills.levels },
            skillXp: { ...preStepSkills.xp },
            perks: new Set(preStepSkills.perks),
            highestZone: preStepSkills.highestZone,
        };
        const ctx = { SKILL_XP_MULT: skillXpMult };
        for (const pEntry of (planned.queue || [])) {
            if (pEntry.status === 'uncosted_skipped') continue;
            const td = taskDefByName.get(pEntry.taskName);
            if (!td) continue;
            const { energyUsed } = sharedExecuteTask(td, td.zoneId, correctedState, ctx, correctedEnergy);
            correctedEnergy -= energyUsed;
            if (correctedEnergy <= 0) break;
        }

        const energyDelta = stepResult.energyRemaining - planned.energyRemaining;
        const correctedDelta = stepResult.energyRemaining - correctedEnergy;
        const completedMatch = stepResult.focusCompleted === planned.targetCompleted;

        if (completedMatch) stepsMatched++;
        if (Math.abs(energyDelta) > 1) energyMismatches++;
        if (Math.abs(correctedDelta) > 1) correctedMismatches++;

        if (args.verbose || !completedMatch) {
            const status = completedMatch ? 'OK' : 'MISMATCH';
            console.log(
                `Step ${String(i).padStart(4)} | ${focusName.padEnd(35)} | ` +
                `plan=${planned.energyRemaining.toFixed(1).padStart(6)} ` +
                `game=${stepResult.energyRemaining.toFixed(1).padStart(6)} ` +
                `delta=${energyDelta.toFixed(1).padStart(6)} ` +
                `corr=${correctedDelta.toFixed(1).padStart(6)} | ${status}`
            );
        }

        // (Reset happens at the start of each step, not here)

        // Progress update
        if (i > 0 && i % 50 === 0) {
            console.log(`  ... ${i}/${steps.length} steps completed`);
        }
    }

    const elapsed = Date.now() - startTime;

    // Summary
    console.log(`\n--- Real Game Verification ---\n`);
    console.log(`Completed in ${elapsed}ms (${steps.length} steps)`);
    console.log(`  Steps matched: ${stepsMatched}/${steps.length}`);
    console.log(`  Steps mismatched: ${steps.length - stepsMatched}`);
    console.log(`  Energy mismatches (>1): ${energyMismatches}`);
    console.log(`  Drift-corrected mismatches (>1): ${correctedMismatches}`);

} catch (err) {
    console.error('Error:', err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
} finally {
    if (browser) await browser.close();
    if (server) server.close();
}

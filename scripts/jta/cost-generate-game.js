#!/usr/bin/env node
/**
 * JTA Cost Generator - Using Real Game Engine via Playwright
 *
 * Runs the cost planner INSIDE a headless browser where the real game
 * engine is available. The planner uses window.gameCalc for tick-by-tick
 * calculations, giving exact formula parity with the game.
 *
 * Usage:
 *   node scripts/jta/cost-generate-game.js \
 *     -g frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_gamedata.json \
 *     -s frontend/presets/jta/AP_SEED/AP_SEED_sphere_log.jsonl \
 *     [--port 8000] [--two-pass] [--normal-attempts 2]
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

// ============================================================================
// Args (reuse from cost-debugger)
// ============================================================================

function parseArgs(argv) {
    const args = { verbose: 0, port: 8000 };
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--gamedata' || arg === '-g') args.gamedata = argv[++i];
        else if (arg === '--spherelog' || arg === '-s') args.spherelog = argv[++i];
        else if (arg === '--port') args.port = parseInt(argv[++i]);
        else if (arg === '--normal-attempts') args.normalAttempts = parseInt(argv[++i]);
        else if (arg === '--perk-attempts') args.perkAttempts = parseInt(argv[++i]);
        else if (arg === '--boss-attempts') args.bossAttempts = parseInt(argv[++i]);
        else if (arg === '--traversal-attempts') args.traversalAttempts = parseInt(argv[++i]);
        else if (arg === '--adjust-xp') args.adjustXpMult = true;
        else if (arg === '--two-pass') { args.twoPass = true; args.adjustXpMult = true; }
        else if (arg === '-v' || arg === '--verbose') args.verbose++;
        else if (arg === '--help' || arg === '-h') args.help = true;
    }
    return args;
}

const args = parseArgs(process.argv);

if (args.help) {
    console.log(`
JTA Cost Generator - Real Game Engine

Runs the cost planner inside a headless browser with the real game engine.

Usage:
  node scripts/jta/cost-generate-game.js [options]

Options:
  -g, --gamedata <path>         Randomized game data JSON (required)
  -s, --spherelog <path>        Sphere log JSONL (required)
  --port <n>                    Port for dev server (default: 8000)
  --normal-attempts <n>         Attempts for regular tasks (default: 2)
  --two-pass                    Two-pass mode (implies --adjust-xp)
  --adjust-xp                   Adjust xpMult on grinding tasks
  -v, --verbose                 Verbose output
  -h, --help                    Show this help
`);
    process.exit(0);
}

if (!args.gamedata || !args.spherelog) {
    console.error('Error: --gamedata and --spherelog are required');
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

// ============================================================================
// Main
// ============================================================================

let browser = null;

try {
    console.log('Launching headless browser...');
    browser = await chromium.launch({
        headless: true,
        executablePath: '/home/robert/.cache/ms-playwright/chromium-1194/chrome-linux/chrome',
    });
    const page = await browser.newPage();

    // Load the game page (for game engine access)
    const gameUrl = `http://localhost:${args.port}/frontend/modules/jta-remote/index-iframe.html`;
    await page.goto(gameUrl);
    await page.evaluate(() => localStorage.removeItem('incrementalGameSave'));
    await page.reload();
    await page.waitForFunction(
        () => !!window.getGamestate && typeof window.updateGamestate === 'function' && typeof window.gameCalc === 'object',
        { timeout: 30000 }
    );
    await page.evaluate(() => { if (window.jta?.pauseGameLoop) window.jta.pauseGameLoop(); });
    console.log('Game loaded');

    // Load the planner module in the browser context
    // We need to import it as an ES module from the dev server
    const plannerResult = await page.evaluate(async ({ gameDataJson, sphereLogContent, settings, twoPass }) => {
        // Import the planner from the dev server
        const base = location.origin;
        const { JTACostPlanner } = await import(base + '/frontend/modules/jtaCostDebugger/jtaCostPlanner.js');

        let planner = new JTACostPlanner();
        let result = planner.planCosts(gameDataJson, sphereLogContent, settings);

        // Two-pass
        if (twoPass) {
            const xpOverrides = new Map();
            for (const step of result.steps) {
                const xa = step.costAssignment?.xpAdjustments;
                if (!xa) continue;
                for (const adj of xa) xpOverrides.set(adj.taskName, adj.newXpMult);
            }
            if (xpOverrides.size > 0) {
                const pass2Data = JSON.parse(JSON.stringify(gameDataJson));
                for (const zone of pass2Data.zones) {
                    for (const task of zone.tasks) {
                        if (xpOverrides.has(task.name)) task.xpMult = xpOverrides.get(task.name);
                    }
                }
                planner = new JTACostPlanner();
                result = planner.planCosts(pass2Data, sphereLogContent, { ...settings, adjustXpMult: false });
            }
        }

        // Serialize result (Maps → objects)
        const assignedCostsObj = {};
        for (const [name, info] of result.assignedCosts) {
            assignedCostsObj[name] = info;
        }

        return {
            totalSteps: result.steps.length,
            tasksCosted: result.assignedCosts.size,
            assignedCosts: assignedCostsObj,
            // Don't send all steps (too large for serialization)
        };
    }, {
        gameDataJson,
        sphereLogContent,
        settings,
        twoPass: args.twoPass || false,
    });

    console.log(`\nCost generation complete (in-browser with game engine)`);
    console.log(`Total steps: ${plannerResult.totalSteps}`);
    console.log(`Tasks costed: ${plannerResult.tasksCosted}`);

    // Now verify: run each step through the game engine and compare
    // Apply the generated costs to the game
    await page.evaluate((costs) => {
        const tl = window.TASK_LOOKUP;
        for (const [name, info] of Object.entries(costs)) {
            // Find task by name
            for (const zone of window.ZONES) {
                for (const taskDef of zone.tasks) {
                    if (taskDef.name === name) {
                        const def = tl.get(taskDef.id);
                        if (def) {
                            def.cost_multiplier = info.costMult;
                            def.xp_mult = info.xpMult;
                        }
                    }
                }
            }
        }
    }, plannerResult.assignedCosts);

    // Run verification using the same game engine
    const verifyResult = await page.evaluate(async ({ gameDataJson, sphereLogContent, settings, twoPass }) => {
        const base = location.origin;
        const { JTACostPlanner } = await import(base + '/frontend/modules/jtaCostDebugger/jtaCostPlanner.js');

        // Re-run planner to get steps (need them for verification)
        let planner = new JTACostPlanner();
        let result;
        if (twoPass) {
            result = planner.planCosts(gameDataJson, sphereLogContent, settings);
            const xpOverrides = new Map();
            for (const step of result.steps) {
                const xa = step.costAssignment?.xpAdjustments;
                if (!xa) continue;
                for (const adj of xa) xpOverrides.set(adj.taskName, adj.newXpMult);
            }
            if (xpOverrides.size > 0) {
                const pass2Data = JSON.parse(JSON.stringify(gameDataJson));
                for (const zone of pass2Data.zones) {
                    for (const task of zone.tasks) {
                        if (xpOverrides.has(task.name)) task.xpMult = xpOverrides.get(task.name);
                    }
                }
                planner = new JTACostPlanner();
                result = planner.planCosts(pass2Data, sphereLogContent, { ...settings, adjustXpMult: false });
            }
        } else {
            result = planner.planCosts(gameDataJson, sphereLogContent, settings);
        }

        // Run step verification
        const verifyData = twoPass
            ? (() => {
                const pass2Data = JSON.parse(JSON.stringify(gameDataJson));
                const xpOverrides = new Map();
                for (const step of result.steps) {
                    const xa = step.costAssignment?.xpAdjustments;
                    if (!xa) continue;
                    for (const adj of xa) xpOverrides.set(adj.taskName, adj.newXpMult);
                }
                for (const zone of pass2Data.zones) {
                    for (const task of zone.tasks) {
                        if (xpOverrides.has(task.name)) task.xpMult = xpOverrides.get(task.name);
                    }
                }
                return pass2Data;
            })()
            : gameDataJson;

        const { annotatedSteps, summary } = planner.stepVerify(verifyData, sphereLogContent);
        const energyDeltas = annotatedSteps.filter(s =>
            s.verification && Math.abs(s.verification.energyDelta) > 0.05
        ).length;

        return {
            ...summary,
            energyDeltas,
        };
    }, {
        gameDataJson,
        sphereLogContent,
        settings: { ...settings, adjustXpMult: args.adjustXpMult ?? false },
        twoPass: args.twoPass || false,
    });

    console.log(`\n--- Verification (in-browser) ---\n`);
    console.log(`  Steps matched: ${verifyResult.stepsMatched}/${verifyResult.totalPlannedSteps}`);
    console.log(`  Energy mismatches: ${verifyResult.energyMismatches}`);
    console.log(`  Energy deltas (>0.05): ${verifyResult.energyDeltas}`);

} catch (err) {
    console.error('Error:', err.message);
    if (args.verbose) console.error(err.stack);
    process.exit(1);
} finally {
    if (browser) await browser.close();
}

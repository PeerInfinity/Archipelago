#!/usr/bin/env node
/**
 * JTA Cost Planner CLI
 *
 * Generates cost data (costMult/xpMult) using JTACostPlanner's simulated
 * playthrough with binary search solver. Replaces cost-adjust.js for
 * more accurate cost generation.
 *
 * Usage:
 *   node scripts/jta/cost-plan.js \
 *     --gamedata path/to/gamedata.json \
 *     --spherelog path/to/sphere_log.jsonl \
 *     --output path/to/costs.json \
 *     [--normal-attempts 2] [--perk-attempts 5] [--traversal-attempts 5] \
 *     [--two-pass] [--player 1]
 */

import { readFileSync, writeFileSync } from 'fs';
import { JTACostPlanner } from '../../frontend/modules/jtaCostDebugger/jtaCostPlanner.js';

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--gamedata' || arg === '-g') args.gamedata = argv[++i];
        else if (arg === '--spherelog' || arg === '-s') args.spherelog = argv[++i];
        else if (arg === '--output' || arg === '-o') args.output = argv[++i];
        else if (arg === '--normal-attempts') args.normalAttempts = parseInt(argv[++i]);
        else if (arg === '--perk-attempts') args.perkAttempts = parseInt(argv[++i]);
        else if (arg === '--boss-attempts') args.bossAttempts = parseInt(argv[++i]);
        else if (arg === '--traversal-attempts') args.traversalAttempts = parseInt(argv[++i]);
        else if (arg === '--player' || arg === '-p') args.player = parseInt(argv[++i]);
        else if (arg === '--two-pass') args.twoPass = true;
        else if (arg === '--adjust-xp') args.adjustXpMult = true;
        else if (arg === '--verbose' || arg === '-v') args.verbose = true;
        else if (arg === '--help' || arg === '-h') args.help = true;
    }
    return args;
}

const args = parseArgs(process.argv);

if (args.help) {
    console.log(`
JTA Cost Planner — Simulated Playthrough Cost Generator

Usage:
  node scripts/jta/cost-plan.js [options]

Options:
  -g, --gamedata <path>         Randomized game data JSON (required)
  -s, --spherelog <path>        Sphere log JSONL (required)
  -o, --output <path>           Output path for costs JSON (required)
  --normal-attempts <n>         Attempts for regular tasks (default: 2)
  --perk-attempts <n>           Attempts for perk tasks (default: 5)
  --boss-attempts <n>           Attempts for boss tasks (default: 5)
  --traversal-attempts <n>      Attempts for traversal tasks (default: 5)
  -p, --player <n>              Player number (default: 1)
  --two-pass                    Two-pass mode: adjust xpMult, then re-solve
  --adjust-xp                   Single-pass xpMult adjustment
  -v, --verbose                 Print per-sphere progress
  -h, --help                    Show this help
`);
    process.exit(0);
}

if (!args.gamedata || !args.spherelog || !args.output) {
    console.error('Error: --gamedata, --spherelog, and --output are required');
    process.exit(1);
}

const gameDataJson = JSON.parse(readFileSync(args.gamedata, 'utf-8'));
const sphereLogContent = readFileSync(args.spherelog, 'utf-8');

const settings = {
    normalAttempts: args.normalAttempts ?? 2,
    perkAttempts: args.perkAttempts ?? 5,
    bossAttempts: args.bossAttempts ?? 5,
    traversalAttempts: args.traversalAttempts ?? 5,
    playerNumber: args.player ?? 1,
    adjustXpMult: args.adjustXpMult || args.twoPass || false,
};

console.log(`Loading game data from: ${args.gamedata}`);
console.log(`Loading sphere log from: ${args.spherelog}`);
console.log(`Settings: normal=${settings.normalAttempts}, perk=${settings.perkAttempts}, traversal=${settings.traversalAttempts}, player=${settings.playerNumber}`);
if (args.twoPass) console.log('Mode: two-pass');
else if (settings.adjustXpMult) console.log('Mode: adjust-xp');
console.log('');

const startTime = Date.now();
let planner = new JTACostPlanner();

// Progress callback
let lastProgress = Date.now();
const onProgress = ({ sphereNum, totalSpheres, stepsGenerated, tasksCosted }) => {
    const now = Date.now();
    if (now - lastProgress > 1000) {
        lastProgress = now;
        process.stdout.write(`\r  Sphere ${sphereNum}/${totalSpheres}, ${stepsGenerated} steps, ${tasksCosted} tasks...`);
    }
};

let result = planner.planCosts(gameDataJson, sphereLogContent, { ...settings, onProgress });
if (lastProgress > startTime + 1000) process.stdout.write('\r' + ' '.repeat(60) + '\r');

// Two-pass mode
if (args.twoPass) {
    const pass1Elapsed = Date.now() - startTime;
    const xpMultOverrides = new Map();
    for (const step of result.steps) {
        const xa = step.costAssignment?.xpAdjustments;
        if (!xa) continue;
        for (const adj of xa) xpMultOverrides.set(adj.taskName, adj.newXpMult);
    }

    if (xpMultOverrides.size > 0) {
        console.log(`Pass 1 complete in ${pass1Elapsed}ms — ${xpMultOverrides.size} xpMult adjustments`);
        const pass2Data = JSON.parse(JSON.stringify(gameDataJson));
        for (const zone of pass2Data.zones) {
            for (const task of zone.tasks) {
                if (xpMultOverrides.has(task.name)) task.xpMult = xpMultOverrides.get(task.name);
            }
        }
        planner = new JTACostPlanner();
        lastProgress = Date.now();
        result = planner.planCosts(pass2Data, sphereLogContent, {
            ...settings, adjustXpMult: false, onProgress,
        });
        if (lastProgress > Date.now() - 5000) process.stdout.write('\r' + ' '.repeat(60) + '\r');
        console.log('Pass 2 complete');
    } else {
        console.log(`Pass 1 complete in ${pass1Elapsed}ms — no xpMult adjustments needed`);
    }
}

const elapsed = Date.now() - startTime;

// Write output (same format as cost-adjust.js: the full adjusted game data)
writeFileSync(args.output, JSON.stringify(result.adjustedData, null, 2), 'utf-8');

// Summary
console.log(`\nCost generation complete in ${elapsed}ms`);
console.log(`Total steps: ${result.steps.length}`);
console.log(`Tasks costed: ${result.assignedCosts.size}`);
console.log(`Output written to: ${args.output}`);

// Report tasks over target
const taskAttemptCounts = new Map();
for (const step of result.steps) {
    if (step.attemptNumber === 0) continue;
    const key = `${step.stepIndex - step.attemptNumber + 1}:${step.targetTask}`;
    if (!taskAttemptCounts.has(key)) {
        taskAttemptCounts.set(key, { taskName: step.targetTask, targetAttempts: step.targetAttempts, actualAttempts: 0 });
    }
    const entry = taskAttemptCounts.get(key);
    entry.actualAttempts = step.attemptNumber;
}
const overTarget = [...taskAttemptCounts.values()].filter(e => e.actualAttempts > e.targetAttempts);
if (overTarget.length > 0) {
    console.log(`\nTasks over target attempts: ${overTarget.length}`);
    for (const e of overTarget) {
        console.log(`  ${e.taskName}: ${e.actualAttempts}/${e.targetAttempts} (+${e.actualAttempts - e.targetAttempts})`);
    }
}

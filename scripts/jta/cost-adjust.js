#!/usr/bin/env node
/**
 * JTA Cost Adjustment CLI
 *
 * Adjusts costMult values in randomized game data so that perk tasks
 * are completable within a target number of energy resets per sphere.
 *
 * Usage:
 *   node scripts/jta/cost-adjust.js \
 *     --gamedata frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_gamedata.json \
 *     --spherelog frontend/presets/jta/AP_SEED/AP_SEED_sphere_log.jsonl \
 *     --output frontend/presets/jta/AP_SEED/AP_SEED_P1_Player1_costs.json \
 *     --resets-per-sphere 5 \
 *     --player 1 \
 *     --verbose
 */

import { readFileSync, writeFileSync } from 'fs';
import { adjustCosts } from '../../frontend/modules/jta-randomizer/jtaCostGenerator.js';

function parseArgs(argv) {
    const args = {};
    for (let i = 2; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--gamedata' || arg === '-g') {
            args.gamedata = argv[++i];
        } else if (arg === '--spherelog' || arg === '-s') {
            args.spherelog = argv[++i];
        } else if (arg === '--output' || arg === '-o') {
            args.output = argv[++i];
        } else if (arg === '--resets-per-sphere' || arg === '-r') {
            args.resetsPerSphere = parseInt(argv[++i]);
        } else if (arg === '--player' || arg === '-p') {
            args.player = parseInt(argv[++i]);
        } else if (arg === '--verbose' || arg === '-v') {
            args.verbose = true;
        } else if (arg === '--help' || arg === '-h') {
            args.help = true;
        }
    }
    return args;
}

function printUsage() {
    console.log(`
JTA Cost Adjustment Tool

Usage:
  node scripts/jta/cost-adjust.js [options]

Options:
  -g, --gamedata <path>         Randomized game data JSON (required)
  -s, --spherelog <path>        Sphere log JSONL (required)
  -o, --output <path>           Output path for cost-adjusted JSON (required)
  -r, --resets-per-sphere <n>   Target resets per sphere (default: 5)
  -p, --player <n>              Player number in sphere log (default: 1)
  -v, --verbose                 Print adjustment details
  -h, --help                    Show this help

Example:
  node scripts/jta/cost-adjust.js \\
    -g frontend/presets/jta/AP_14089154938208861744/AP_14089154938208861744_P1_Player1_gamedata.json \\
    -s frontend/presets/jta/AP_14089154938208861744/AP_14089154938208861744_sphere_log.jsonl \\
    -o frontend/presets/jta/AP_14089154938208861744/AP_14089154938208861744_P1_Player1_costs.json
`);
}

const args = parseArgs(process.argv);

if (args.help) {
    printUsage();
    process.exit(0);
}

if (!args.gamedata || !args.spherelog || !args.output) {
    console.error('Error: --gamedata, --spherelog, and --output are required');
    printUsage();
    process.exit(1);
}

// Load inputs
const gameDataJson = JSON.parse(readFileSync(args.gamedata, 'utf-8'));
const sphereLogContent = readFileSync(args.spherelog, 'utf-8');

console.log(`Loading game data from: ${args.gamedata}`);
console.log(`Loading sphere log from: ${args.spherelog}`);
console.log(`Target resets per sphere: ${args.resetsPerSphere || 5}`);
console.log(`Player: ${args.player || 1}`);
console.log('');

// Run cost adjustment
const startTime = Date.now();
const { adjustedData, log, mandatoryLog } = adjustCosts(gameDataJson, sphereLogContent, {
    resetsPerSphere: args.resetsPerSphere || 5,
    playerNumber: args.player || 1,
    verbose: args.verbose || false,
});
const elapsed = Date.now() - startTime;

// Write output
writeFileSync(args.output, JSON.stringify(adjustedData, null, 2), 'utf-8');

// Summary
const adjusted = log.filter(e => e.oldCost !== e.newCost);
const bottlenecked = log.filter(e => e.bottleneck);
const totalMandatoryAdj = mandatoryLog.reduce((sum, e) => sum + e.count, 0);
console.log(`\nCost adjustment complete in ${elapsed}ms`);
console.log(`Tasks processed: ${log.length}`);
console.log(`Tasks adjusted: ${adjusted.length}`);
if (totalMandatoryAdj > 0) {
    console.log(`Mandatory tasks adjusted for zone traversal: ${totalMandatoryAdj}`);
}
if (bottlenecked.length > 0) {
    console.log(`Tasks still bottlenecked after zone adjustment: ${bottlenecked.length}`);
}
console.log(`Output written to: ${args.output}`);

if (mandatoryLog.length > 0) {
    console.log('\nZone/XP adjustments:');
    for (const entry of mandatoryLog) {
        if (entry.type === 'xp_boost') {
            console.log(
                `  📈 XP boost for ${entry.trigger} (${entry.triggerZone}): ` +
                `${entry.multiplier.toFixed(2)}x, ${entry.count} tasks boosted`
            );
        } else {
            console.log(
                `  ↓ Zone cost for ${entry.trigger} (${entry.triggerZone}): ` +
                `${entry.multiplier.toFixed(4)}x, ${entry.count} mandatory tasks`
            );
        }
    }
}

if (adjusted.length > 0) {
    console.log('\nPerk task adjustments:');
    for (const entry of adjusted) {
        const direction = entry.newCost > entry.oldCost ? '↑' : '↓';
        console.log(
            `  ${direction} ${entry.task} (${entry.zone}): ` +
            `${entry.oldCost.toFixed(2)} → ${entry.newCost.toFixed(2)} ` +
            `(was ${entry.resets} resets, target ${entry.targetResets})`
        );
    }
}

if (bottlenecked.length > 0) {
    console.log('\nStill bottlenecked (zone unreachable even with minimum mandatory costs):');
    for (const entry of bottlenecked) {
        console.log(`  ⚠ ${entry.task} (${entry.zone})`);
    }
}

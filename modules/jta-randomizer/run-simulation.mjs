#!/usr/bin/env node
/**
 * Runner script for the Journey to Ascension simulation
 * Usage: node run-simulation.mjs [maxZone] [--timeout=<ms>]
 *
 * Examples:
 *   node run-simulation.mjs 1                  # simulate to zone 1
 *   node run-simulation.mjs 15 --timeout=10000 # zone 15, 10s timeout
 */

import { runBaselineSimulation, simulateUntilZone, ZONES } from './simulator.js';

// Parse args
const args = process.argv.slice(2);
let maxZone = 15;
let timeoutMs = 0; // 0 = no timeout

for (const arg of args) {
    if (arg.startsWith('--timeout=')) {
        timeoutMs = parseInt(arg.split('=')[1]) || 0;
    } else if (!arg.startsWith('--')) {
        maxZone = parseInt(arg) || 15;
    }
}

console.log('Journey to Ascension - Baseline Simulation');
console.log('==========================================');
console.log(`Target zone: ${maxZone}${timeoutMs ? `, timeout: ${timeoutMs}ms` : ''}\n`);

runBaselineSimulation(maxZone, { timeoutMs });

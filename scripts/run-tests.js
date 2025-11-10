#!/usr/bin/env node

/**
 * Test runner wrapper that accepts parameters via both npm config AND command-line args
 * Supports both syntaxes:
 *   npm test --mode=test-spoilers --game=adventure
 *   npm test -- --mode=test-spoilers --game=adventure
 */

import { spawn } from 'child_process';
import { parseArgs } from 'node:util';

// Parse command-line arguments
const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    game: { type: 'string' },
    seed: { type: 'string' },
    player: { type: 'string' },
    rules: { type: 'string' },
    layout: { type: 'string' },
    testOrderSeed: { type: 'string' },
    headed: { type: 'boolean' },
    debug: { type: 'boolean' },
    ui: { type: 'boolean' }
  },
  strict: false,
  allowPositionals: true
});

// Merge npm config with command-line args (command-line takes precedence)
const config = {
  mode: values.mode || process.env.npm_config_mode || 'test',
  game: values.game || process.env.npm_config_game || '',
  seed: values.seed || process.env.npm_config_seed || '',
  player: values.player || process.env.npm_config_player || '',
  rules: values.rules || process.env.npm_config_rules || '',
  layout: values.layout || process.env.npm_config_layout || '',
  testOrderSeed: values.testOrderSeed || process.env.npm_config_testOrderSeed || process.env.TEST_ORDER_SEED || ''
};

// Build environment variables
const env = {
  ...process.env,
  TEST_MODE: config.mode,
  TEST_GAME: config.game,
  TEST_SEED: config.seed,
  TEST_PLAYER: config.player,
  RULES_OVERRIDE: config.rules,
  TEST_LAYOUT: config.layout,
  TEST_ORDER_SEED: config.testOrderSeed
};

// Build Playwright command
const playwrightArgs = ['test', 'tests/e2e/app.spec.js'];

// Add Playwright-specific flags if present
if (values.headed) playwrightArgs.push('--headed');
if (values.debug) playwrightArgs.push('--debug');
if (values.ui) playwrightArgs.push('--ui');

// Pass through any remaining arguments that weren't parsed
const additionalArgs = process.argv.slice(2).filter(arg =>
  !arg.startsWith('--mode=') &&
  !arg.startsWith('--game=') &&
  !arg.startsWith('--seed=') &&
  !arg.startsWith('--player=') &&
  !arg.startsWith('--rules=') &&
  !arg.startsWith('--layout=') &&
  !arg.startsWith('--testOrderSeed=') &&
  arg !== '--headed' &&
  arg !== '--debug' &&
  arg !== '--ui'
);
playwrightArgs.push(...additionalArgs);

// Run Playwright
const playwright = spawn('playwright', playwrightArgs, {
  env,
  stdio: 'inherit',
  shell: false
});

playwright.on('exit', (code) => {
  process.exit(code || 0);
});

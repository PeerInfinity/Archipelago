#!/usr/bin/env node

/**
 * Test Seed Range
 * Runs regression tests for a range of seeds and logs which ones fail
 *
 * Usage: node scripts/test/test-seed-range.js <start> <end>
 * Example: node scripts/test/test-seed-range.js 1 100
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

function saveResults(outputFile, results) {
  fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));
}

async function testSeedRange(startSeed, endSeed) {
  console.log(`🧪 Testing seeds ${startSeed} to ${endSeed}`);
  console.log('='.repeat(60));
  console.log('');

  // Create output file with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outputFile = path.join(process.cwd(), `seed-range-results-${startSeed}-${endSeed}-${timestamp}.json`);

  const results = {
    startSeed,
    endSeed,
    totalSeeds: endSeed - startSeed + 1,
    seedsTested: 0,
    passed: [],
    failed: [],
    errors: [],
    startTime: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  // Save initial state
  saveResults(outputFile, results);
  console.log(`📄 Results file: ${outputFile}`);
  console.log('');

  for (let seed = startSeed; seed <= endSeed; seed++) {
    const seedNum = seed.toString().padStart(3, ' ');
    process.stdout.write(`Testing seed ${seedNum}/${endSeed}... `);

    try {
      const env = { ...process.env, TEST_ORDER_SEED: seed.toString() };
      await execAsync('npm test --mode=test-regression', {
        env,
        timeout: 300000, // 5 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer (increased from default 1MB for full test logs)
      });

      console.log('✅ PASSED');
      results.passed.push(seed);
    } catch (error) {
      if (error.killed) {
        console.log('❌ TIMEOUT');
        results.errors.push({ seed, reason: 'Timeout' });
      } else if (error.code) {
        console.log(`❌ FAILED (exit code ${error.code})`);
        results.failed.push({ seed, exitCode: error.code });
      } else {
        console.log('❌ ERROR');
        results.errors.push({ seed, reason: error.message });
      }
    }

    // Update progress and save after each test
    results.seedsTested++;
    results.lastUpdated = new Date().toISOString();
    saveResults(outputFile, results);
  }

  return { results, outputFile };
}

function printSummary(results, outputFile) {
  console.log('');
  console.log('='.repeat(60));
  console.log('📊 Summary');
  console.log('='.repeat(60));
  console.log(`Total seeds tested: ${results.seedsTested}/${results.totalSeeds}`);
  console.log(`Passed: ${results.passed.length} (${((results.passed.length / results.seedsTested) * 100).toFixed(1)}%)`);
  console.log(`Failed: ${results.failed.length} (${((results.failed.length / results.seedsTested) * 100).toFixed(1)}%)`);
  console.log(`Errors: ${results.errors.length} (${((results.errors.length / results.seedsTested) * 100).toFixed(1)}%)`);
  console.log('');

  // Print failed seeds
  if (results.failed.length > 0) {
    console.log('❌ Failed seeds:');
    results.failed.forEach(({ seed, exitCode }) => {
      console.log(`   Seed ${seed} (exit code ${exitCode})`);
    });
    console.log('');
  }

  // Print error seeds
  if (results.errors.length > 0) {
    console.log('⚠️  Error seeds:');
    results.errors.forEach(({ seed, reason }) => {
      console.log(`   Seed ${seed}: ${reason}`);
    });
    console.log('');
  }

  console.log(`📄 Results saved to: ${outputFile}`);
}

// Parse command line arguments
if (process.argv.length < 4) {
  console.error('Usage: node scripts/test/test-seed-range.js <start> <end>');
  console.error('Example: node scripts/test/test-seed-range.js 1 100');
  process.exit(1);
}

const startSeed = parseInt(process.argv[2], 10);
const endSeed = parseInt(process.argv[3], 10);

if (isNaN(startSeed) || isNaN(endSeed)) {
  console.error('Error: Start and end seeds must be valid numbers');
  process.exit(1);
}

if (startSeed > endSeed) {
  console.error('Error: Start seed must be less than or equal to end seed');
  process.exit(1);
}

// Run the test
testSeedRange(startSeed, endSeed)
  .then(({ results, outputFile }) => {
    printSummary(results, outputFile);

    // Exit with error code if any tests failed
    if (results.failed.length > 0 || results.errors.length > 0) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });

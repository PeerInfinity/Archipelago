#!/usr/bin/env node
/**
 * CLI Script for Sphere Log Comparison
 *
 * Compares Python-generated sphere logs with Universal Tracker sphere logs.
 *
 * Usage:
 *   node scripts/test/compare-sphere-logs.js \
 *     --python-log path/to/sphere_log.jsonl \
 *     --ut-log path/to/sphere_log_ut.jsonl \
 *     [--output path/to/comparison-result.json] \
 *     [--verbose]
 */

const fs = require('fs');
const path = require('path');
const {
  loadSphereLog,
  loadSphereLogWithMetadata,
  extractEventFiltersFromMetadata,
  compareSphereLogs,
  findFirstMismatch,
  formatComparisonSummary
} = require('./lib/sphereLogComparison.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    pythonLog: null,
    utLog: null,
    output: null,
    verbose: false,
    help: false,
    ignoreLocations: [],
    ignoreItems: [],
    autoIgnoreEvents: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--python-log':
        options.pythonLog = args[++i];
        break;
      case '--ut-log':
        options.utLog = args[++i];
        break;
      case '--output':
        options.output = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--ignore-location':
        options.ignoreLocations.push(args[++i]);
        break;
      case '--ignore-item':
        options.ignoreItems.push(args[++i]);
        break;
      case '--ignore-events':
        // Common event locations and items that UT may not track
        options.ignoreLocations.push('Chalice Home');
        options.ignoreItems.push('Victory');
        break;
      case '--auto-ignore-events':
        // Automatically read event info from Python sphere log metadata
        options.autoIgnoreEvents = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        options.help = true;
    }
  }

  return options;
}

function printUsage() {
  console.log(`
Usage: node compare-sphere-logs.js [options]

Options:
  --python-log <path>   Path to Python-generated sphere_log.jsonl (required)
  --ut-log <path>       Path to UT-generated sphere_log_ut.jsonl (required)
  --output <path>       Output path for JSON comparison result (optional)
  --verbose, -v         Show detailed comparison output
  --auto-ignore-events  Auto-detect event locations/items from sphere log metadata (recommended)
  --ignore-events       Ignore hardcoded event locations and items (e.g., Chalice Home, Victory)
  --ignore-location <name>  Ignore a specific location (can be repeated)
  --ignore-item <name>  Ignore a specific item (can be repeated)
  --help, -h            Show this help message

Examples:
  # Basic comparison with auto event detection (recommended)
  node compare-sphere-logs.js \\
    --python-log output/sphere_log.jsonl \\
    --ut-log output/sphere_log_ut.jsonl \\
    --auto-ignore-events

  # Ignore hardcoded event locations/items (legacy)
  node compare-sphere-logs.js \\
    --python-log output/sphere_log.jsonl \\
    --ut-log output/sphere_log_ut.jsonl \\
    --ignore-events

  # Save results to JSON file
  node compare-sphere-logs.js \\
    --python-log output/sphere_log.jsonl \\
    --ut-log output/sphere_log_ut.jsonl \\
    --output output/comparison.json \\
    --verbose
`);
}

function main() {
  const options = parseArgs();

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.pythonLog) {
    console.error('Error: --python-log is required');
    printUsage();
    process.exit(1);
  }

  if (!options.utLog) {
    console.error('Error: --ut-log is required');
    printUsage();
    process.exit(1);
  }

  // Check if files exist
  if (!fs.existsSync(options.pythonLog)) {
    console.error(`Error: Python log file not found: ${options.pythonLog}`);
    process.exit(1);
  }

  if (!fs.existsSync(options.utLog)) {
    console.error(`Error: UT log file not found: ${options.utLog}`);
    process.exit(1);
  }

  try {
    // Load sphere logs
    console.log(`Loading Python log: ${options.pythonLog}`);
    let pythonLog;
    let pythonMetadata = null;

    if (options.autoIgnoreEvents) {
      // Load with metadata to extract event filters
      const result = loadSphereLogWithMetadata(options.pythonLog);
      pythonLog = result.entries;
      pythonMetadata = result.metadata;
    } else {
      pythonLog = loadSphereLog(options.pythonLog);
    }
    console.log(`  Loaded ${pythonLog.length} entries`);

    console.log(`Loading UT log: ${options.utLog}`);
    const utLog = loadSphereLog(options.utLog);
    console.log(`  Loaded ${utLog.length} entries`);

    // Build comparison options
    const compareOptions = {};

    // If auto-ignore-events is enabled, extract filters from Python sphere log metadata
    if (options.autoIgnoreEvents && pythonMetadata) {
      const eventFilters = extractEventFiltersFromMetadata(pythonMetadata);
      if (eventFilters.ignoreLocations.size > 0) {
        console.log(`Auto-detected ${eventFilters.ignoreLocations.size} event locations from metadata`);
        // Merge with any manually specified locations
        compareOptions.ignoreLocations = new Set([
          ...options.ignoreLocations,
          ...eventFilters.ignoreLocations
        ]);
      }
      if (eventFilters.ignoreItems.size > 0) {
        console.log(`Auto-detected ${eventFilters.ignoreItems.size} event items from metadata`);
        // Merge with any manually specified items
        compareOptions.ignoreItems = new Set([
          ...options.ignoreItems,
          ...eventFilters.ignoreItems
        ]);
      }
    } else if (options.autoIgnoreEvents && !pythonMetadata) {
      console.log('Warning: --auto-ignore-events specified but no metadata found in Python sphere log');
    }

    // Add manually specified ignore lists (if not already merged above)
    if (options.ignoreLocations.length > 0 && !compareOptions.ignoreLocations) {
      compareOptions.ignoreLocations = new Set(options.ignoreLocations);
    }
    if (options.ignoreItems.length > 0 && !compareOptions.ignoreItems) {
      compareOptions.ignoreItems = new Set(options.ignoreItems);
    }

    // Log what we're ignoring
    if (compareOptions.ignoreLocations && compareOptions.ignoreLocations.size > 0) {
      console.log(`Ignoring locations: ${[...compareOptions.ignoreLocations].join(', ')}`);
    }
    if (compareOptions.ignoreItems && compareOptions.ignoreItems.size > 0) {
      console.log(`Ignoring items: ${[...compareOptions.ignoreItems].join(', ')}`);
    }

    console.log('');

    // Compare logs
    const comparison = compareSphereLogs(pythonLog, utLog, compareOptions);

    // Print summary
    console.log(formatComparisonSummary(comparison));

    // Show first mismatch details if verbose
    if (options.verbose && !comparison.all_match) {
      const firstMismatch = findFirstMismatch(pythonLog, utLog, compareOptions);
      if (firstMismatch) {
        console.log('\nFirst Mismatch Details:');
        console.log(JSON.stringify(firstMismatch, null, 2));
      }
    }

    // Save to file if requested
    if (options.output) {
      const outputDir = path.dirname(options.output);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }
      fs.writeFileSync(options.output, JSON.stringify(comparison, null, 2));
      console.log(`\nResults saved to: ${options.output}`);
    }

    // Exit with appropriate code
    process.exit(comparison.all_match ? 0 : 1);

  } catch (error) {
    console.error(`Error: ${error.message}`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();

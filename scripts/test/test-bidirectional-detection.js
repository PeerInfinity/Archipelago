#!/usr/bin/env node
/**
 * Test bidirectional exit detection on various games
 *
 * Usage:
 *   node scripts/test/test-bidirectional-detection.js
 *   node scripts/test/test-bidirectional-detection.js alttp adventure tunic
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the detector module (need to use dynamic import for ESM)
const detectorPath = path.join(__dirname, '../../frontend/modules/shared/bidirectionalDetector.js');

async function main() {
  // Dynamic import of the detector module
  const { detectBidirectionalMode } = await import(detectorPath);

  const presetsDir = path.join(__dirname, '../../frontend/presets');
  const presetFiles = JSON.parse(
    fs.readFileSync(path.join(presetsDir, 'preset_files.json'), 'utf-8')
  );

  // Get games to test from command line or use all
  const args = process.argv.slice(2);
  // presetFiles has games at top level (not in a "presets" property)
  // Skip the "metadata" key
  const allGames = Object.keys(presetFiles).filter(k => k !== 'metadata');
  const gamesToTest = args.length > 0 ? args : allGames;

  console.log('Bidirectional Exit Detection Analysis');
  console.log('=' .repeat(70));
  console.log();

  const results = [];

  for (const game of gamesToTest) {
    const gameData = presetFiles[game];
    if (!gameData || !gameData.folders) {
      console.log(`⚠️  No presets found for: ${game}`);
      continue;
    }

    // Use the first folder (usually seed 1)
    const folderNames = Object.keys(gameData.folders);
    if (folderNames.length === 0) {
      console.log(`⚠️  No preset folders found for: ${game}`);
      continue;
    }

    const presetId = folderNames[0];
    const rulesPath = path.join(presetsDir, game, presetId, `${presetId}_rules.json`);

    if (!fs.existsSync(rulesPath)) {
      console.log(`⚠️  Rules file not found: ${rulesPath}`);
      continue;
    }

    try {
      const rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf-8'));
      const gameName = rulesData.game_name || gameData.name || game;

      // Get regions for player 1
      const regions = rulesData.regions?.['1'] || rulesData.regions;
      if (!regions) {
        console.log(`⚠️  No regions found for: ${game}`);
        continue;
      }

      // Get the current setting from exporter_settings
      const exporterSettings = rulesData.world?.['1'] || {};
      const currentSetting = exporterSettings.assume_bidirectional_exits;

      // Run detection
      const detection = detectBidirectionalMode(regions);

      // Store result
      results.push({
        game,
        gameName,
        currentSetting,
        detection
      });

      // Format output
      const match = currentSetting === detection.assumeBidirectional ? '✅' : '⚠️';
      console.log(`${match} ${gameName} (${game})`);
      console.log(`   Current setting: assume_bidirectional_exits = ${currentSetting}`);
      console.log(`   Detected mode: ${detection.mode}`);
      console.log(`   Recommended: assume_bidirectional_exits = ${detection.assumeBidirectional}`);
      console.log(`   Stats: ${detection.stats.totalRegions} regions, ${detection.stats.totalExits} exits, ` +
        `${detection.stats.totalUniqueEdges} unique edges`);
      console.log(`   Bidirectional: ${detection.stats.bidirectionalPairs}/${detection.stats.totalUniqueEdges} ` +
        `(${(detection.bidirectionalRatio * 100).toFixed(1)}%)`);

      if (detection.trappedRegions.length > 0) {
        console.log(`   ⚠️  Trapped regions (${detection.trappedRegions.length}):`);
        for (const trapped of detection.trappedRegions.slice(0, 5)) {
          console.log(`      - ${trapped.name} (${trapped.hasLocations ? 'has' : 'no'} locations)`);
        }
        if (detection.trappedRegions.length > 5) {
          console.log(`      ... and ${detection.trappedRegions.length - 5} more`);
        }
      }

      if (detection.sourceOnlyRegions.length > 1) { // More than just Menu
        console.log(`   ℹ️  Source-only regions (besides Menu): ${detection.sourceOnlyRegions.join(', ')}`);
      }

      console.log(`   Recommendation: ${detection.recommendation}`);
      console.log();

    } catch (err) {
      console.log(`❌ Error processing ${game}: ${err.message}`);
      console.log();
    }
  }

  // Summary
  console.log('=' .repeat(70));
  console.log('SUMMARY');
  console.log('=' .repeat(70));

  const matches = results.filter(r => r.currentSetting === r.detection.assumeBidirectional);
  const mismatches = results.filter(r => r.currentSetting !== r.detection.assumeBidirectional);

  console.log(`Total games analyzed: ${results.length}`);
  console.log(`Settings match recommendation: ${matches.length}`);
  console.log(`Settings differ from recommendation: ${mismatches.length}`);
  console.log();

  if (mismatches.length > 0) {
    console.log('Games with different recommendation:');
    for (const r of mismatches) {
      console.log(`  - ${r.gameName}: current=${r.currentSetting}, recommended=${r.detection.assumeBidirectional}`);
      console.log(`    Reason: ${r.detection.recommendation}`);
    }
  }

  // Group by detection mode
  console.log();
  console.log('Games by detection mode:');
  const byMode = {};
  for (const r of results) {
    const mode = r.detection.mode;
    if (!byMode[mode]) byMode[mode] = [];
    byMode[mode].push(r.gameName);
  }
  for (const [mode, games] of Object.entries(byMode)) {
    console.log(`  ${mode}: ${games.length} games`);
    if (games.length <= 10) {
      console.log(`    ${games.join(', ')}`);
    }
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

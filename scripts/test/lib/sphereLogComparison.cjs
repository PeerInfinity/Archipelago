/**
 * Sphere Log Comparison Module
 *
 * Compares Python-generated sphere logs with Universal Tracker sphere logs
 * to verify UT correctly tracks accessible locations and regions.
 *
 * Usage:
 *   const { loadSphereLog, compareSphereLogs, findFirstMismatch } = require('./sphereLogComparison');
 */

const fs = require('fs');
const path = require('path');

/**
 * Load and parse a sphere log JSONL file.
 * @param {string} filePath - Path to the sphere log file
 * @returns {Array<Object>} Array of sphere log entries (state_update entries only)
 */
function loadSphereLog(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  const entries = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`Failed to parse line ${index + 1} in ${filePath}: ${e.message}`);
    }
  });
  // Filter out metadata entries - return only state_update entries
  return entries.filter(entry => entry.type === 'state_update');
}

/**
 * Load and parse a sphere log JSONL file, returning both metadata and state entries.
 * @param {string} filePath - Path to the sphere log file
 * @returns {Object} Object with metadata (or null) and entries array
 */
function loadSphereLogWithMetadata(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.trim().split('\n').filter(line => line.trim());
  const allEntries = lines.map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (e) {
      throw new Error(`Failed to parse line ${index + 1} in ${filePath}: ${e.message}`);
    }
  });

  // Find metadata entry (should be first line if present)
  const metadataEntry = allEntries.find(entry => entry.type === 'metadata');
  const stateEntries = allEntries.filter(entry => entry.type === 'state_update');

  return {
    metadata: metadataEntry || null,
    entries: stateEntries
  };
}

/**
 * Extract event locations and items from sphere log metadata.
 * Flattens per-player event lists into single sets for comparison filtering.
 * @param {Object} metadata - Metadata entry from loadSphereLogWithMetadata
 * @returns {Object} Object with ignoreLocations and ignoreItems Sets
 */
function extractEventFiltersFromMetadata(metadata) {
  const ignoreLocations = new Set();
  const ignoreItems = new Set();

  if (metadata) {
    // Flatten per-player event locations into single set
    if (metadata.event_locations) {
      for (const playerLocations of Object.values(metadata.event_locations)) {
        for (const loc of playerLocations) {
          ignoreLocations.add(loc);
        }
      }
    }
    // Flatten per-player event items into single set
    if (metadata.event_items) {
      for (const playerItems of Object.values(metadata.event_items)) {
        for (const item of playerItems) {
          ignoreItems.add(item);
        }
      }
    }
  }

  return { ignoreLocations, ignoreItems };
}

/**
 * Get the set difference (items in setA not in setB).
 * @param {Array} arrayA - First array
 * @param {Array} arrayB - Second array
 * @returns {Array} Items in arrayA but not in arrayB
 */
function setDifference(arrayA, arrayB) {
  const setB = new Set(arrayB);
  return arrayA.filter(item => !setB.has(item));
}

/**
 * Compare two arrays and return differences.
 * @param {Array} expected - Expected array (Python)
 * @param {Array} actual - Actual array (UT)
 * @param {Set} [ignoreSet] - Optional set of items to ignore in comparison
 * @returns {Object} Object with missing and extra items
 */
function getArrayDiff(expected, actual, ignoreSet = null) {
  expected = expected || [];
  actual = actual || [];

  // Filter out ignored items if specified
  if (ignoreSet && ignoreSet.size > 0) {
    expected = expected.filter(item => !ignoreSet.has(item));
    actual = actual.filter(item => !ignoreSet.has(item));
  }

  return {
    missing: setDifference(expected, actual),  // In Python but not UT
    extra: setDifference(actual, expected),    // In UT but not Python
    match: setDifference(expected, actual).length === 0 &&
           setDifference(actual, expected).length === 0
  };
}

/**
 * Compare location arrays between Python and UT logs.
 * @param {Array} pythonLocations - Locations from Python log
 * @param {Array} utLocations - Locations from UT log
 * @param {Set} [ignoreLocations] - Optional set of locations to ignore
 * @returns {Object} Location comparison result
 */
function getLocationDiff(pythonLocations, utLocations, ignoreLocations = null) {
  return getArrayDiff(pythonLocations, utLocations, ignoreLocations);
}

/**
 * Compare region arrays between Python and UT logs.
 * @param {Array} pythonRegions - Regions from Python log
 * @param {Array} utRegions - Regions from UT log
 * @returns {Object} Region comparison result
 */
function getRegionDiff(pythonRegions, utRegions) {
  return getArrayDiff(pythonRegions, utRegions);
}

/**
 * Check if two item names are alternate versions of the same progressive item.
 * E.g., "Progressive Bow" and "Progressive Bow (Alt)" are alternates.
 * @param {string} item1 - First item name
 * @param {string} item2 - Second item name
 * @returns {boolean} True if the items are alternate versions of each other
 */
function areProgressiveItemAlternates(item1, item2) {
  // Check if one is a base name and the other has a suffix like (Alt), (Left), (Right), etc.
  const suffixPattern = /^(.+?)\s*\((Alt|Left|Right|Upper|Lower|\d+)\)$/i;

  const match1 = item1.match(suffixPattern);
  const match2 = item2.match(suffixPattern);

  // If item1 has suffix and item2 is the base name
  if (match1 && match1[1] === item2) return true;
  // If item2 has suffix and item1 is the base name
  if (match2 && match2[1] === item1) return true;
  // If both have suffixes but same base name
  if (match1 && match2 && match1[1] === match2[1]) return true;

  return false;
}

/**
 * Remove matched progressive item alternates from missing/extra diffs.
 * If "Progressive Bow" is missing with count 1 and "Progressive Bow (Alt)" is extra with count 1,
 * they cancel each other out.
 * @param {Object} diff - Object with missing and extra properties
 */
function reconcileProgressiveItemAlternates(diff) {
  const missingItems = Object.keys(diff.missing);
  const extraItems = Object.keys(diff.extra);

  for (const missingItem of missingItems) {
    for (const extraItem of extraItems) {
      if (areProgressiveItemAlternates(missingItem, extraItem)) {
        const missingCount = diff.missing[missingItem];
        const extraCount = diff.extra[extraItem];

        if (missingCount === extraCount) {
          // Same count - they match, remove both
          delete diff.missing[missingItem];
          delete diff.extra[extraItem];
        } else if (missingCount < extraCount) {
          // More extra than missing - reduce extra, remove missing
          diff.extra[extraItem] = extraCount - missingCount;
          delete diff.missing[missingItem];
        } else {
          // More missing than extra - reduce missing, remove extra
          diff.missing[missingItem] = missingCount - extraCount;
          delete diff.extra[extraItem];
        }
        break; // Move to next missing item
      }
    }
  }
}

/**
 * Compare inventory between Python and UT logs.
 * @param {Object} pythonInventory - Inventory from Python log
 * @param {Object} utInventory - Inventory from UT log
 * @param {Set} [ignoreItems] - Optional set of item names to ignore
 * @returns {Object} Inventory comparison result
 */
function getInventoryDiff(pythonInventory, utInventory, ignoreItems = null) {
  pythonInventory = pythonInventory || {};
  utInventory = utInventory || {};

  const pythonBase = pythonInventory.base_items || {};
  const pythonResolved = pythonInventory.resolved_items || {};
  const utBase = utInventory.base_items || {};
  const utResolved = utInventory.resolved_items || {};

  const baseItemsDiff = {
    missing: {},
    extra: {},
    mismatch: {}
  };

  const resolvedItemsDiff = {
    missing: {},
    extra: {},
    mismatch: {}
  };

  // Compare base_items
  for (const [item, count] of Object.entries(pythonBase)) {
    if (ignoreItems && ignoreItems.has(item)) continue;
    if (!(item in utBase)) {
      baseItemsDiff.missing[item] = count;
    } else if (utBase[item] !== count) {
      baseItemsDiff.mismatch[item] = { expected: count, actual: utBase[item] };
    }
  }
  for (const [item, count] of Object.entries(utBase)) {
    if (ignoreItems && ignoreItems.has(item)) continue;
    if (!(item in pythonBase)) {
      baseItemsDiff.extra[item] = count;
    }
  }

  // Reconcile progressive item alternates (e.g., "Progressive Bow" vs "Progressive Bow (Alt)")
  reconcileProgressiveItemAlternates(baseItemsDiff);

  // Compare resolved_items
  for (const [item, count] of Object.entries(pythonResolved)) {
    if (ignoreItems && ignoreItems.has(item)) continue;
    if (!(item in utResolved)) {
      resolvedItemsDiff.missing[item] = count;
    } else if (utResolved[item] !== count) {
      resolvedItemsDiff.mismatch[item] = { expected: count, actual: utResolved[item] };
    }
  }
  for (const [item, count] of Object.entries(utResolved)) {
    if (ignoreItems && ignoreItems.has(item)) continue;
    if (!(item in pythonResolved)) {
      resolvedItemsDiff.extra[item] = count;
    }
  }

  // Reconcile progressive item alternates in resolved items too
  reconcileProgressiveItemAlternates(resolvedItemsDiff);

  const baseItemsMatch = Object.keys(baseItemsDiff.missing).length === 0 &&
                         Object.keys(baseItemsDiff.extra).length === 0 &&
                         Object.keys(baseItemsDiff.mismatch).length === 0;

  const resolvedItemsMatch = Object.keys(resolvedItemsDiff.missing).length === 0 &&
                             Object.keys(resolvedItemsDiff.extra).length === 0 &&
                             Object.keys(resolvedItemsDiff.mismatch).length === 0;

  // Match if EITHER base_items OR resolved_items match.
  // This handles the case where Python resolves progressive items (e.g., "Progressive Sword" -> "Fighter Sword")
  // but UT reports the base name. Both representations are valid.
  const match = baseItemsMatch || resolvedItemsMatch;

  return {
    base_items: baseItemsDiff,
    resolved_items: resolvedItemsDiff,
    match,
    base_items_match: baseItemsMatch,
    resolved_items_match: resolvedItemsMatch
  };
}

/**
 * Compare all player data fields between Python and UT.
 * @param {Object} pythonData - Player data from Python log
 * @param {Object} utData - Player data from UT log
 * @param {Object} [options] - Comparison options
 * @param {Set} [options.ignoreLocations] - Set of location names to ignore
 * @param {Set} [options.ignoreItems] - Set of item names to ignore
 * @returns {Object} Comparison result for all fields
 */
function comparePlayerData(pythonData, utData, options = {}) {
  pythonData = pythonData || {};
  utData = utData || {};

  const { ignoreLocations = null, ignoreItems = null } = options;

  const locationDiff = getLocationDiff(
    pythonData.new_accessible_locations,
    utData.new_accessible_locations,
    ignoreLocations
  );

  const regionDiff = getRegionDiff(
    pythonData.new_accessible_regions,
    utData.new_accessible_regions
  );

  const inventoryDiff = getInventoryDiff(
    pythonData.new_inventory_details,
    utData.new_inventory_details,
    ignoreItems
  );

  // Note: sphere_locations is not compared because UT cannot determine which locations
  // were collected in each sphere - it only receives items via the Bounce protocol.
  // The sphere playthrough algorithm runs during generation, not during gameplay.

  const match = locationDiff.match &&
                regionDiff.match &&
                inventoryDiff.match;

  return {
    accessible_locations: locationDiff,
    accessible_regions: regionDiff,
    inventory: inventoryDiff,
    match
  };
}

/**
 * Compare a single sphere entry between Python and UT logs.
 * @param {Object} pythonEntry - Entry from Python log
 * @param {Object} utEntry - Entry from UT log
 * @param {Object} [options] - Comparison options
 * @param {Set} [options.ignoreLocations] - Set of location names to ignore
 * @param {Set} [options.ignoreItems] - Set of item names to ignore
 * @returns {Object} Comparison result for the sphere
 */
function compareSphereEntry(pythonEntry, utEntry, options = {}) {
  const sphereIndex = pythonEntry.sphere_index;
  const playerComparisons = {};
  let allMatch = true;

  // Get all player IDs from both logs
  const pythonPlayers = pythonEntry.player_data || {};
  const utPlayers = utEntry.player_data || {};
  const allPlayerIds = new Set([...Object.keys(pythonPlayers), ...Object.keys(utPlayers)]);

  for (const playerId of allPlayerIds) {
    const comparison = comparePlayerData(
      pythonPlayers[playerId],
      utPlayers[playerId],
      options
    );
    playerComparisons[playerId] = comparison;
    if (!comparison.match) {
      allMatch = false;
    }
  }

  return {
    sphere_index: sphereIndex,
    players: playerComparisons,
    match: allMatch
  };
}

/**
 * Compare two sphere logs entry by entry.
 * @param {Array} pythonLog - Array of Python log entries
 * @param {Array} utLog - Array of UT log entries
 * @param {Object} [options] - Comparison options
 * @param {Set} [options.ignoreLocations] - Set of location names to ignore
 * @param {Set} [options.ignoreItems] - Set of item names to ignore
 * @returns {Object} Full comparison result
 */
function compareSphereLogs(pythonLog, utLog, options = {}) {
  const result = {
    summary: {
      python_entries: pythonLog.length,
      ut_entries: utLog.length,
      matched_entries: 0,
      mismatched_entries: 0,
      missing_in_ut: 0,
      extra_in_ut: 0
    },
    spheres: [],
    all_match: true
  };

  // Build index of UT entries by sphere_index
  const utByIndex = {};
  for (const entry of utLog) {
    utByIndex[entry.sphere_index] = entry;
  }

  // Build index of Python entries by sphere_index
  const pythonByIndex = {};
  for (const entry of pythonLog) {
    pythonByIndex[entry.sphere_index] = entry;
  }

  // Compare Python entries against UT
  for (const pythonEntry of pythonLog) {
    const sphereIndex = pythonEntry.sphere_index;
    const utEntry = utByIndex[sphereIndex];

    if (!utEntry) {
      result.spheres.push({
        sphere_index: sphereIndex,
        status: 'missing_in_ut',
        match: false
      });
      result.summary.missing_in_ut++;
      result.all_match = false;
    } else {
      const comparison = compareSphereEntry(pythonEntry, utEntry, options);
      comparison.status = comparison.match ? 'match' : 'mismatch';
      result.spheres.push(comparison);
      if (comparison.match) {
        result.summary.matched_entries++;
      } else {
        result.summary.mismatched_entries++;
        result.all_match = false;
      }
    }
  }

  // Find extra entries in UT
  for (const utEntry of utLog) {
    if (!(utEntry.sphere_index in pythonByIndex)) {
      result.spheres.push({
        sphere_index: utEntry.sphere_index,
        status: 'extra_in_ut',
        match: false
      });
      result.summary.extra_in_ut++;
      result.all_match = false;
    }
  }

  return result;
}

/**
 * Find the first sphere where Python and UT logs differ.
 * @param {Array} pythonLog - Array of Python log entries
 * @param {Array} utLog - Array of UT log entries
 * @param {Object} [options] - Comparison options
 * @param {Set} [options.ignoreLocations] - Set of location names to ignore
 * @param {Set} [options.ignoreItems] - Set of item names to ignore
 * @returns {Object|null} First mismatch details, or null if all match
 */
function findFirstMismatch(pythonLog, utLog, options = {}) {
  const comparison = compareSphereLogs(pythonLog, utLog, options);

  if (comparison.all_match) {
    return null;
  }

  // Sort spheres to find first mismatch
  const sortedSpheres = comparison.spheres.sort((a, b) => {
    // Sort by sphere index (handle "0.1" style indices)
    // Handle both string and number sphere_index values
    const aStr = String(a.sphere_index);
    const bStr = String(b.sphere_index);
    const aIdx = aStr.split('.').map(Number);
    const bIdx = bStr.split('.').map(Number);
    for (let i = 0; i < Math.max(aIdx.length, bIdx.length); i++) {
      const aVal = aIdx[i] || 0;
      const bVal = bIdx[i] || 0;
      if (aVal !== bVal) return aVal - bVal;
    }
    return 0;
  });

  for (const sphere of sortedSpheres) {
    if (!sphere.match) {
      return sphere;
    }
  }

  return null;
}

/**
 * Generate a human-readable summary of the comparison.
 * @param {Object} comparison - Result from compareSphereLogs
 * @returns {string} Human-readable summary
 */
function formatComparisonSummary(comparison) {
  const lines = [];

  lines.push('='.repeat(60));
  lines.push('Sphere Log Comparison Summary');
  lines.push('='.repeat(60));
  lines.push('');

  const s = comparison.summary;
  lines.push(`Python entries: ${s.python_entries}`);
  lines.push(`UT entries: ${s.ut_entries}`);
  lines.push(`Matched: ${s.matched_entries}`);
  lines.push(`Mismatched: ${s.mismatched_entries}`);
  lines.push(`Missing in UT: ${s.missing_in_ut}`);
  lines.push(`Extra in UT: ${s.extra_in_ut}`);
  lines.push('');

  if (comparison.all_match) {
    lines.push('RESULT: ALL SPHERES MATCH');
  } else {
    lines.push('RESULT: MISMATCHES FOUND');
    lines.push('');

    // Show details of first few mismatches
    let mismatchCount = 0;
    for (const sphere of comparison.spheres) {
      if (!sphere.match && mismatchCount < 3) {
        lines.push(`--- Sphere ${sphere.sphere_index} (${sphere.status}) ---`);

        if (sphere.status === 'mismatch' && sphere.players) {
          for (const [playerId, playerData] of Object.entries(sphere.players)) {
            if (!playerData.match) {
              lines.push(`  Player ${playerId}:`);

              // Accessible locations
              if (!playerData.accessible_locations.match) {
                const loc = playerData.accessible_locations;
                if (loc.missing.length > 0) {
                  lines.push(`    Locations missing in UT: ${loc.missing.slice(0, 5).join(', ')}${loc.missing.length > 5 ? ` (+${loc.missing.length - 5} more)` : ''}`);
                }
                if (loc.extra.length > 0) {
                  lines.push(`    Locations extra in UT: ${loc.extra.slice(0, 5).join(', ')}${loc.extra.length > 5 ? ` (+${loc.extra.length - 5} more)` : ''}`);
                }
              }

              // Accessible regions
              if (!playerData.accessible_regions.match) {
                const reg = playerData.accessible_regions;
                if (reg.missing.length > 0) {
                  lines.push(`    Regions missing in UT: ${reg.missing.join(', ')}`);
                }
                if (reg.extra.length > 0) {
                  lines.push(`    Regions extra in UT: ${reg.extra.join(', ')}`);
                }
              }

              // Inventory
              if (!playerData.inventory.match) {
                const inv = playerData.inventory;
                // Base items
                if (Object.keys(inv.base_items.missing).length > 0) {
                  const items = Object.entries(inv.base_items.missing).map(([k, v]) => `${k}(${v})`).slice(0, 5);
                  lines.push(`    Base items missing in UT: ${items.join(', ')}`);
                }
                if (Object.keys(inv.base_items.extra).length > 0) {
                  const items = Object.entries(inv.base_items.extra).map(([k, v]) => `${k}(${v})`).slice(0, 5);
                  lines.push(`    Base items extra in UT: ${items.join(', ')}`);
                }
                if (Object.keys(inv.base_items.mismatch).length > 0) {
                  const items = Object.entries(inv.base_items.mismatch).map(([k, v]) => `${k}(expected:${v.expected}, actual:${v.actual})`).slice(0, 5);
                  lines.push(`    Base items count mismatch: ${items.join(', ')}`);
                }
                // Resolved items
                if (Object.keys(inv.resolved_items.missing).length > 0) {
                  const items = Object.entries(inv.resolved_items.missing).map(([k, v]) => `${k}(${v})`).slice(0, 5);
                  lines.push(`    Resolved items missing in UT: ${items.join(', ')}`);
                }
                if (Object.keys(inv.resolved_items.extra).length > 0) {
                  const items = Object.entries(inv.resolved_items.extra).map(([k, v]) => `${k}(${v})`).slice(0, 5);
                  lines.push(`    Resolved items extra in UT: ${items.join(', ')}`);
                }
                if (Object.keys(inv.resolved_items.mismatch).length > 0) {
                  const items = Object.entries(inv.resolved_items.mismatch).map(([k, v]) => `${k}(expected:${v.expected}, actual:${v.actual})`).slice(0, 5);
                  lines.push(`    Resolved items count mismatch: ${items.join(', ')}`);
                }
              }
            }
          }
        }

        mismatchCount++;
        lines.push('');
      }
    }

    if (comparison.summary.mismatched_entries > 3) {
      lines.push(`... and ${comparison.summary.mismatched_entries - 3} more mismatches`);
    }
  }

  lines.push('='.repeat(60));

  return lines.join('\n');
}

module.exports = {
  loadSphereLog,
  loadSphereLogWithMetadata,
  extractEventFiltersFromMetadata,
  compareSphereLogs,
  findFirstMismatch,
  comparePlayerData,
  compareSphereEntry,
  getLocationDiff,
  getRegionDiff,
  getInventoryDiff,
  getArrayDiff,
  formatComparisonSummary
};

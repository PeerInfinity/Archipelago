/**
 * Debug Sphere Logger Module
 *
 * Generates sphere log files in JSONL format for debugging inaccessible location checks.
 * The format matches the sphere logs used by the testSpoilers module.
 *
 * @module client/utils/debugSphereLogger
 */

/**
 * Generates a sphere log JSONL string for an inaccessible location check.
 *
 * Creates two sphere entries:
 * - Sphere 0: State before the forced location check
 * - Sphere 0.1: State after the forced location check
 *
 * @param {Object} options - Options for generating the sphere log
 * @param {string} options.locationName - Name of the location that was force-checked
 * @param {number|string} options.playerId - Player ID (defaults to "1")
 * @param {Object} options.stateBefore - State snapshot before the force check
 * @param {Object} options.stateBefore.inventory - Inventory object (item name -> count)
 * @param {Array<string>} options.stateBefore.accessibleLocations - List of accessible location names
 * @param {Array<string>} options.stateBefore.accessibleRegions - List of accessible region names
 * @param {Object} options.stateAfter - State snapshot after the force check
 * @param {Object} options.stateAfter.inventory - Inventory object (item name -> count)
 * @param {Array<string>} options.stateAfter.accessibleLocations - List of accessible location names
 * @param {Array<string>} options.stateAfter.accessibleRegions - List of accessible region names
 * @returns {string} JSONL string with sphere log entries
 */
export function generateInaccessibleLocationSphereLog(options) {
  const {
    locationName,
    playerId = '1',
    stateBefore,
    stateAfter
  } = options;

  const playerIdStr = String(playerId);
  const lines = [];

  // Sphere 0: State before the forced check
  const sphere0 = {
    type: 'state_update',
    sphere_index: 0,
    player_data: {
      [playerIdStr]: {
        inventory_details: {
          base_items: stateBefore.inventory || {},
          resolved_items: stateBefore.inventory || {}
        },
        accessible_locations: stateBefore.accessibleLocations || [],
        accessible_regions: stateBefore.accessibleRegions || [],
        sphere_locations: []
      }
    }
  };
  lines.push(JSON.stringify(sphere0));

  // Calculate deltas for sphere 0.1
  const inventoryDelta = calculateInventoryDelta(
    stateBefore.inventory || {},
    stateAfter.inventory || {}
  );

  const newAccessibleLocations = (stateAfter.accessibleLocations || []).filter(
    loc => !(stateBefore.accessibleLocations || []).includes(loc)
  );

  const newAccessibleRegions = (stateAfter.accessibleRegions || []).filter(
    reg => !(stateBefore.accessibleRegions || []).includes(reg)
  );

  // Sphere 0.1: State after the forced check
  const sphere0_1 = {
    type: 'state_update',
    sphere_index: '0.1',
    player_data: {
      [playerIdStr]: {
        new_inventory_details: {
          base_items: inventoryDelta,
          resolved_items: inventoryDelta
        },
        new_accessible_locations: newAccessibleLocations,
        new_accessible_regions: newAccessibleRegions,
        sphere_locations: [locationName]
      }
    }
  };
  lines.push(JSON.stringify(sphere0_1));

  return lines.join('\n');
}

/**
 * Calculates the inventory delta between two inventory states.
 *
 * @param {Object} inventoryBefore - Inventory before (item name -> count)
 * @param {Object} inventoryAfter - Inventory after (item name -> count)
 * @returns {Object} Delta inventory (only items that changed or were added)
 */
function calculateInventoryDelta(inventoryBefore, inventoryAfter) {
  const delta = {};

  // Find items that were added or increased
  for (const [itemName, countAfter] of Object.entries(inventoryAfter)) {
    const countBefore = inventoryBefore[itemName] || 0;
    if (countAfter > countBefore) {
      delta[itemName] = countAfter - countBefore;
    }
  }

  return delta;
}

/**
 * Creates a downloadable blob URL for the sphere log.
 *
 * @param {string} sphereLogContent - The JSONL content
 * @returns {string} Blob URL that can be used for download
 */
export function createSphereLogDownloadUrl(sphereLogContent) {
  const blob = new Blob([sphereLogContent], { type: 'application/jsonl' });
  return URL.createObjectURL(blob);
}

/**
 * Generates a filename for the debug sphere log.
 *
 * @param {string} locationName - Name of the location
 * @param {string} logType - Type of log: 'diagnostic' or 'regression'
 * @returns {string} Sanitized filename
 */
export function generateSphereLogFilename(locationName, logType = 'diagnostic') {
  const sanitized = locationName.replace(/[^a-zA-Z0-9_-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const prefix = logType === 'regression' ? 'regression_test' : 'diagnostic_log';
  return `${prefix}_${sanitized}_${timestamp}.jsonl`;
}

/**
 * Generates a regression test sphere log for an inaccessible location.
 *
 * Unlike generateInaccessibleLocationSphereLog which shows actual state (with bug),
 * this generates a FOCUSED test that only checks the specific location's accessibility.
 *
 * The log includes a `focused_mode: true` flag that tells the Test Spoilers module
 * to only verify that the location in `sphere_locations` is accessible, ignoring
 * all other locations and regions.
 *
 * Use this log as a regression test:
 * - Before fix: Test fails (rules say location is inaccessible)
 * - After fix: Test passes (rules say location is accessible)
 *
 * @param {Object} options - Options for generating the sphere log
 * @param {string} options.locationName - Name of the location that should be accessible
 * @param {number|string} options.playerId - Player ID (defaults to "1")
 * @param {Object} options.stateBefore - State snapshot before the force check
 * @param {Object} options.stateBefore.inventory - Inventory object (item name -> count)
 * @param {Array<string>} options.stateBefore.accessibleLocations - List of accessible location names
 * @param {Array<string>} options.stateBefore.accessibleRegions - List of accessible region names
 * @param {Object} options.stateAfter - State snapshot after the force check
 * @param {Object} options.stateAfter.inventory - Inventory object (item name -> count)
 * @param {Array<string>} options.stateAfter.accessibleLocations - List of accessible location names
 * @param {Array<string>} options.stateAfter.accessibleRegions - List of accessible region names
 * @returns {string} JSONL string with sphere log entries representing expected correct state
 */
export function generateRegressionTestSphereLog(options) {
  const {
    locationName,
    playerId = '1',
    stateBefore,
    stateAfter
  } = options;

  const playerIdStr = String(playerId);
  const lines = [];

  // Add header event with focused_mode flag
  // This tells Test Spoilers to only check the specific locations in sphere_locations
  const header = {
    type: 'log_header',
    focused_mode: true,
    focus_locations: [locationName],
    description: `Regression test for inaccessible location: ${locationName}`,
    generated_at: new Date().toISOString()
  };
  lines.push(JSON.stringify(header));

  // Sphere 0: Initial state with the inventory at the time of detection
  // In focused mode, accessible_locations is not checked - only sphere_locations matter
  const sphere0 = {
    type: 'state_update',
    sphere_index: 0,
    player_data: {
      [playerIdStr]: {
        inventory_details: {
          base_items: stateBefore.inventory || {},
          resolved_items: stateBefore.inventory || {}
        },
        accessible_locations: [], // Not used in focused mode
        accessible_regions: [], // Not used in focused mode
        sphere_locations: []
      }
    }
  };
  lines.push(JSON.stringify(sphere0));

  // Calculate deltas for sphere 0.1
  const inventoryDelta = calculateInventoryDelta(
    stateBefore.inventory || {},
    stateAfter.inventory || {}
  );

  // Sphere 0.1: The location should be checkable (accessible)
  // In focused mode, only sphere_locations is checked for accessibility
  const sphere0_1 = {
    type: 'state_update',
    sphere_index: '0.1',
    player_data: {
      [playerIdStr]: {
        new_inventory_details: {
          base_items: inventoryDelta,
          resolved_items: inventoryDelta
        },
        new_accessible_locations: [], // Not used in focused mode
        new_accessible_regions: [], // Not used in focused mode
        sphere_locations: [locationName]
      }
    }
  };
  lines.push(JSON.stringify(sphere0_1));

  return lines.join('\n');
}

/**
 * Comparison Engine Module for Test Spoilers
 *
 * Handles comparison of accessible locations and regions between spoiler log expectations
 * and current StateManager state. Identifies mismatches for diagnostic analysis.
 *
 * Extracted from testSpoilerUI.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Expected data from spoiler log + current state snapshot
 *   - logAccessibleLocationNames: Array<string> (expected accessible locations from log)
 *   - logAccessibleRegionNames: Array<string> (expected accessible regions from log)
 *   - currentWorkerSnapshot: Object (current state from StateManager)
 *   - playerId: number (for filtering player-specific data)
 *   - context: Object (for logging - event type, sphere, etc.)
 *
 * Processing:
 *   1. Extract accessible locations/regions from current state
 *   2. Compare with expected data from log
 *   3. Identify mismatches (missing from state, extra in state)
 *   4. Store mismatch details for analysis
 *
 * Output: Boolean comparison result
 *   - true: State matches log expectations
 *   - false: Mismatch detected (details stored in currentMismatchDetails)
 *
 * @module testSpoilers/comparisonEngine
 */

import { createUniversalLogger } from '../../app/core/universalLogger.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { evaluateRule } from '../shared/ruleEngine.js';

const logger = createUniversalLogger('testSpoilerUI:ComparisonEngine');

export class ComparisonEngine {
  constructor(stateManager, logCallback = null) {
    this.stateManager = stateManager;
    this.logCallback = logCallback;  // Callback for UI logging: (type, message, ...data) => void
    this.currentMismatchDetails = null;
    logger.debug('ComparisonEngine constructor called');
  }

  /**
   * Compares accessible locations between log and current state
   *
   * DATA FLOW:
   * Input: Expected locations from log + current snapshot
   *   ├─> logAccessibleLocationNames: Array<string>
   *   ├─> currentWorkerSnapshot: StateManager snapshot
   *   ├─> playerId: number
   *   ├─> context: object (for logging)
   *
   * Processing:
   *   ├─> Get static data from stateManager
   *   ├─> Create snapshotInterface for rule evaluation
   *   ├─> Iterate all locations in static data
   *   ├─> For each unchecked location:
   *   │   ├─> Check parent region reachability
   *   │   ├─> Evaluate location access rule
   *   │   └─> Add to stateAccessibleUnchecked if accessible
   *   ├─> Create sets for comparison
   *   ├─> Find missing (in log, not in state)
   *   ├─> Find extra (in state, not in log)
   *
   * Output: Comparison result
   *   ├─> Boolean: true if match, false if mismatch
   *   └─> Side effects: Sets this.currentMismatchDetails for analysis
   *
   * @param {Array<string>} logAccessibleLocationNames - Expected locations from log
   * @param {Object} currentWorkerSnapshot - Current state snapshot
   * @param {number} playerId - Player ID for filtering
   * @param {Object} context - Context for logging
   * @returns {boolean} True if locations match, false otherwise
   */
  async compareAccessibleLocations(
    logAccessibleLocationNames,
    currentWorkerSnapshot,
    playerId,
    context
  ) {
    // currentWorkerSnapshot IS the authoritative snapshot from the worker AFTER its inventory was set.
    // logAccessibleLocationNames is an array of location names from the Python log.
    const staticData = this.stateManager.getStaticData();

    // Count reachable regions for logging
    const reachableRegions = Object.entries(currentWorkerSnapshot?.regionReachability || {})
      .filter(([_, status]) => status === 'reachable')
      .map(([name, _]) => name);

    logger.info(`[compareAccessibleLocations] Comparing for context:`, {
      context,
      workerSnapshotInventory:
        currentWorkerSnapshot?.inventory ? 'available' : 'not available',
      logAccessibleNamesCount: logAccessibleLocationNames.length,
      reachableRegionsCount: reachableRegions.length,
      // DEBUG: Show some inventory items
      inventoryKeys: Object.keys(currentWorkerSnapshot?.inventory || {}).slice(0, 10),
      // DEBUG: Show some reachable regions
      sampleReachableRegions: reachableRegions.slice(0, 5),
      // currentWorkerSnapshot, // Avoid logging the whole snapshot unless necessary for deep debug
      // staticData, // Avoid logging whole staticData
    });

    if (!currentWorkerSnapshot) {
      logger.error(
        `[compareAccessibleLocations] currentWorkerSnapshot is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      // comparisonResult will be false due to allChecksPassed being false in processSingleEvent
      return false;
    }
    if (!staticData || !staticData.locations) {
      logger.error(
        `[compareAccessibleLocations] Static data or staticData.locations is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`,
        {
          staticDataKeys: staticData
            ? Object.keys(staticData)
            : 'staticData is null',
        }
      );
      return false;
    }

    // No need to modify the snapshot; it already has the correct inventory from the worker.
    const stateAccessibleUnchecked = [];
    const snapshotInterface = createStateSnapshotInterface(
      currentWorkerSnapshot, // Use the authoritative snapshot directly
      staticData
    );

    if (!snapshotInterface) {
      logger.error(
        `[compareAccessibleLocations] Failed to create snapshotInterface for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      return false;
    }

    // staticData.locations is always a Map after initialization
    for (const [locName, locDef] of staticData.locations.entries()) {

      // Check against the worker's snapshot flags
      const isChecked = currentWorkerSnapshot.flags?.includes(locName);
      if (isChecked) continue;

      const parentRegionName = locDef.parent_region || locDef.region;
      // Use reachability from the worker's snapshot
      const parentRegionReachabilityStatus =
        currentWorkerSnapshot.regionReachability?.[parentRegionName];
      const isParentRegionEffectivelyReachable =
        parentRegionReachabilityStatus === 'reachable' ||
        parentRegionReachabilityStatus === 'checked';

      const locationAccessRule = locDef.access_rule;
      let locationRuleEvalResult = true;
      if (locationAccessRule) {
        // Create a location-specific snapshotInterface with the location as context
        const locationSnapshotInterface = createStateSnapshotInterface(
          currentWorkerSnapshot,
          staticData,
          { location: locDef } // Pass the location definition as context
        );

        locationRuleEvalResult = evaluateRule(
          locationAccessRule,
          locationSnapshotInterface
        );
      }
      const doesLocationRuleEffectivelyPass = locationRuleEvalResult === true;

      if (
        isParentRegionEffectivelyReachable &&
        doesLocationRuleEffectivelyPass
      ) {
        stateAccessibleUnchecked.push(locName);
      }
    }

    const stateAccessibleSet = new Set(stateAccessibleUnchecked);
    // logAccessibleLocationNames is already an array of strings
    const logAccessibleSet = new Set(logAccessibleLocationNames);

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );
    const extraInState = [...stateAccessibleSet].filter(
      (name) => !logAccessibleSet.has(name)
    );

    // Check if any player has allow_regressive_accessibility_mismatches enabled
    // This setting handles games like SMZ3 where acquiring items can INCREASE
    // key requirements (anti-softlock logic), causing a semantic difference between
    // Python's cumulative sphere calculation and frontend's real-time evaluation.
    let allowRegressiveMismatches = false;
    if (staticData?.settings) {
      for (const playerSettings of Object.values(staticData.settings)) {
        if (playerSettings?.allow_regressive_accessibility_mismatches) {
          allowRegressiveMismatches = true;
          break;
        }
      }
    }

    // If regressive mismatches are allowed, "missing from state" (accessible in log
    // but not accessible now due to increased requirements) is treated as acceptable.
    const effectiveMissingFromState = allowRegressiveMismatches ? [] : missingFromState;

    // Also filter "extra in state" for locations with key requirements when
    // allowRegressiveMismatches is enabled. This handles the case where the test
    // doesn't track door opens, so dungeon keys appear unconsumed.
    // We check if the location's access rule contains a key check (Key*).
    let effectiveExtraInState = extraInState;
    if (allowRegressiveMismatches && extraInState.length > 0) {
      const keyPattern = /^Key[A-Z]{2}$/; // Matches KeyPD, KeySP, KeyIP, etc.
      effectiveExtraInState = extraInState.filter((locName) => {
        // Check if this location has a key requirement in its access rule
        const locationDef = staticData.locations?.get(locName);
        if (!locationDef?.access_rule) return true; // Keep if no rule found

        // Helper to check if rule contains a key check
        const hasKeyRequirement = (rule) => {
          if (!rule) return false;
          if (rule.type === 'item_check' && keyPattern.test(rule.item)) return true;
          if (rule.type === 'compare' && rule.left?.type === 'item_check' && keyPattern.test(rule.left.item)) return true;
          if (rule.conditions) return rule.conditions.some(hasKeyRequirement);
          if (rule.test) return hasKeyRequirement(rule.test);
          if (rule.if_true) return hasKeyRequirement(rule.if_true) || hasKeyRequirement(rule.if_false);
          return false;
        };

        // Allow (filter out) locations with key requirements
        return !hasKeyRequirement(locationDef.access_rule);
      });
    }

    // Track how many key-based extras were allowed
    const keyBasedExtrasAllowed = extraInState.length - effectiveExtraInState.length;

    if (effectiveMissingFromState.length === 0 && effectiveExtraInState.length === 0) {
      // Build success message, noting if regressive mismatches were allowed
      let successMessage = `✓ Sphere ${context.sphere_number} passed: ${stateAccessibleSet.size} locations match`;
      if (allowRegressiveMismatches && (missingFromState.length > 0 || keyBasedExtrasAllowed > 0)) {
        const parts = [];
        if (missingFromState.length > 0) parts.push(`${missingFromState.length} regressive accessibility mismatches`);
        if (keyBasedExtrasAllowed > 0) parts.push(`${keyBasedExtrasAllowed} key-based extra locations`);
        successMessage += ` (${parts.join(', ')} allowed)`;
      }

      // Log to UI panel if callback available
      if (this.logCallback) {
        this.logCallback('success', successMessage);
      }

      // Log regressive mismatches as info if any were allowed
      if (allowRegressiveMismatches && missingFromState.length > 0) {
        const regressiveMessage = ` ℹ Regressive accessibility (allowed): ${missingFromState.join(', ')}`;
        if (this.logCallback) {
          this.logCallback('info', regressiveMessage);
        }
        logger.info(`[compareAccessibleLocations] Allowed regressive mismatches: ${missingFromState.join(', ')}`);
      }

      // Log key-based extras as info if any were allowed
      if (keyBasedExtrasAllowed > 0) {
        const keyBasedExtras = extraInState.filter(loc => !effectiveExtraInState.includes(loc));
        const keyMessage = ` ℹ Key-based extra locations (allowed): ${keyBasedExtras.join(', ')}`;
        if (this.logCallback) {
          this.logCallback('info', keyMessage);
        }
        logger.info(`[compareAccessibleLocations] Allowed key-based extras: ${keyBasedExtras.join(', ')}`);
      }

      // Also log to console for debugging
      logger.info(
        `State match OK for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }. (${stateAccessibleSet.size} accessible & unchecked)`
      );
      return true;
    } else {
      const mismatchMessage = `STATE MISMATCH found for: ${
        typeof context === 'string' ? context : JSON.stringify(context)
      }`;

      // Log to UI panel if callback available
      if (this.logCallback) {
        this.logCallback('error', mismatchMessage);
      }

      // Also log to console for debugging
      logger.error(mismatchMessage);

      if (effectiveMissingFromState.length > 0) {
        const missingMessage = ` > Locations accessible in LOG but NOT in STATE (or checked): ${effectiveMissingFromState.join(', ')}`;

        // Log to UI panel (this will trigger link creation in testSpoilerUI.js)
        if (this.logCallback) {
          this.logCallback('error', missingMessage);
        }

        // Also log to console
        logger.error(missingMessage);
        console.error(`[MISMATCH DETAIL] Missing from state (${effectiveMissingFromState.length}):`, effectiveMissingFromState);
      }
      if (effectiveExtraInState.length > 0) {
        const extraMessage = ` > Locations accessible in STATE (and unchecked) but NOT in LOG: ${effectiveExtraInState.join(', ')}`;

        // Log to UI panel (this will trigger link creation in testSpoilerUI.js)
        if (this.logCallback) {
          this.logCallback('error', extraMessage);
        }

        // Also log to console
        logger.error(extraMessage);
        console.error(`[MISMATCH DETAIL] Extra in state (${effectiveExtraInState.length}):`, effectiveExtraInState);
      }
      logger.debug('[compareAccessibleLocations] Mismatch Details:', {
        context:
          typeof context === 'string' ? context : JSON.stringify(context),
        logAccessibleSet: Array.from(logAccessibleSet),
        stateAccessibleSet: Array.from(stateAccessibleSet),
        workerSnapshotInventoryUsed: currentWorkerSnapshot.inventory
          ? currentWorkerSnapshot.inventory
          : 'N/A',
      });

      // Store detailed mismatch information for result aggregation
      this.currentMismatchDetails = {
        type: 'locations',
        context: typeof context === 'string' ? context : JSON.stringify(context),
        missingFromState: effectiveMissingFromState,
        extraInState: extraInState,
        logAccessibleCount: logAccessibleSet.size,
        stateAccessibleCount: stateAccessibleSet.size,
        inventoryUsed: currentWorkerSnapshot.inventory
          ? currentWorkerSnapshot.inventory
          : null,
        snapshotInterface: snapshotInterface, // Store for analysis phase
        staticData: staticData, // Store for analysis phase
        currentWorkerSnapshot: currentWorkerSnapshot // Store for analysis phase
      };

      return false;
    }
  }

  /**
   * Compares accessible regions between log and current state
   *
   * DATA FLOW:
   * Input: Expected regions from log + current snapshot
   *   ├─> logAccessibleRegionNames: Array<string>
   *   ├─> currentWorkerSnapshot: StateManager snapshot
   *   ├─> playerId: number
   *   ├─> context: object (for logging)
   *
   * Processing:
   *   ├─> Get regionReachability from snapshot
   *   ├─> Extract reachable/checked regions
   *   ├─> Filter for game-specific exceptions (e.g., CvCotM Menu region)
   *   ├─> Create sets for comparison
   *   ├─> Find missing (in log, not in state)
   *   ├─> Find extra (in state, not in log)
   *   ├─> Filter out dynamically-added regions from extra
   *
   * Output: Comparison result
   *   ├─> Boolean: true if match, false if mismatch
   *   └─> Side effects: Sets this.currentMismatchDetails for analysis
   *
   * @param {Array<string>} logAccessibleRegionNames - Expected regions from log
   * @param {Object} currentWorkerSnapshot - Current state snapshot
   * @param {number} playerId - Player ID for filtering
   * @param {Object} context - Context for logging
   * @returns {boolean} True if regions match, false otherwise
   */
  async compareAccessibleRegions(
    logAccessibleRegionNames,
    currentWorkerSnapshot,
    playerId,
    context
  ) {
    // Similar to compareAccessibleLocations but for regions
    const staticData = this.stateManager.getStaticData();

    logger.info(`[compareAccessibleRegions] Comparing for context:`, {
      context,
      workerSnapshotInventory:
        currentWorkerSnapshot?.inventory ? 'available' : 'not available',
      logAccessibleRegionsCount: logAccessibleRegionNames.length,
    });

    if (!currentWorkerSnapshot) {
      logger.error(
        `[compareAccessibleRegions] currentWorkerSnapshot is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`
      );
      return false;
    }
    if (!staticData || !staticData.regions) {
      logger.error(
        `[compareAccessibleRegions] Static data or staticData.regions is null/undefined for context: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }`,
        {
          staticDataKeys: staticData
            ? Object.keys(staticData)
            : 'staticData is null',
        }
      );
      return false;
    }

    // Get accessible regions from the current worker snapshot
    const stateAccessibleRegions = [];

    // Use the regionReachability data from the worker snapshot (no filtering needed!)
    const regionReachabilityData = currentWorkerSnapshot.regionReachability;
    if (regionReachabilityData) {
      for (const regionName in regionReachabilityData) {
        // With regionReachability, we know all entries are regions, no filtering needed
        const reachabilityStatus = regionReachabilityData[regionName];
        if (reachabilityStatus === 'reachable' || reachabilityStatus === 'checked') {
          stateAccessibleRegions.push(regionName);
        }
      }
    }

    // No filtering - compare Menu region directly
    const stateAccessibleSet = new Set(stateAccessibleRegions);
    const logAccessibleSet = new Set(logAccessibleRegionNames);

    const missingFromState = [...logAccessibleSet].filter(
      (name) => !stateAccessibleSet.has(name)
    );

    // Filter out dynamically-added regions from the comparison
    // These regions were added after sphere calculation and won't appear in the log
    const extraInState = [...stateAccessibleSet].filter(
      (name) => {
        if (logAccessibleSet.has(name)) return false;

        // Check if this region is marked as dynamically_added
        // staticData.regions is always a Map after initialization
        const regionData = staticData.regions?.get(name);

        if (regionData && regionData.dynamically_added === true) {
          logger.info(`Skipping dynamically-added region from comparison: ${name}`);
          return false;
        }

        return true;
      }
    );

    if (missingFromState.length === 0 && extraInState.length === 0) {
      // Don't log region success to UI panel to avoid clutter (locations are the main check)
      // Only log to console for debugging
      logger.info(
        `Region match OK for: ${
          typeof context === 'string' ? context : JSON.stringify(context)
        }. (${stateAccessibleSet.size} accessible regions)`
      );
      return true;
    } else {
      const mismatchMessage = `REGION MISMATCH found for: ${
        typeof context === 'string' ? context : JSON.stringify(context)
      }`;

      // Log to UI panel if callback available
      if (this.logCallback) {
        this.logCallback('error', mismatchMessage);
      }

      // Also log to console for debugging
      logger.error(mismatchMessage);

      if (missingFromState.length > 0) {
        const missingMessage = ` > Regions accessible in LOG but NOT in STATE: ${missingFromState.join(', ')}`;

        // Log to UI panel (this will trigger link creation in testSpoilerUI.js)
        if (this.logCallback) {
          this.logCallback('error', missingMessage);
        }

        // Also log to console
        logger.error(missingMessage);
        console.error(`[REGION MISMATCH DETAIL] Missing from state (${missingFromState.length}):`, missingFromState);
      }
      if (extraInState.length > 0) {
        const extraMessage = ` > Regions accessible in STATE but NOT in LOG: ${extraInState.join(', ')}`;

        // Log to UI panel (this will trigger link creation in testSpoilerUI.js)
        if (this.logCallback) {
          this.logCallback('error', extraMessage);
        }

        // Also log to console
        logger.error(extraMessage);
        console.error(`[REGION MISMATCH DETAIL] Extra in state (${extraInState.length}):`, extraInState);
      }
      logger.debug('[compareAccessibleRegions] Mismatch Details:', {
        context:
          typeof context === 'string' ? context : JSON.stringify(context),
        logAccessibleSet: Array.from(logAccessibleSet),
        stateAccessibleSet: Array.from(stateAccessibleSet),
        workerSnapshotInventoryUsed: currentWorkerSnapshot.inventory
          ? currentWorkerSnapshot.inventory
          : 'N/A',
      });

      // Store detailed mismatch information for result aggregation
      this.currentMismatchDetails = {
        type: 'regions',
        context: typeof context === 'string' ? context : JSON.stringify(context),
        missingFromState: missingFromState,
        extraInState: extraInState,
        logAccessibleCount: logAccessibleSet.size,
        stateAccessibleCount: stateAccessibleSet.size,
        inventoryUsed: currentWorkerSnapshot.inventory
          ? currentWorkerSnapshot.inventory
          : null,
        staticData: staticData, // Store for analysis phase
        currentWorkerSnapshot: currentWorkerSnapshot, // Store for analysis phase
        playerId: playerId // Store for analysis phase
      };

      return false;
    }
  }

  /**
   * Gets the mismatch details from the last comparison
   * @returns {Object|null} Mismatch details or null
   */
  getMismatchDetails() {
    return this.currentMismatchDetails;
  }

  /**
   * Clears stored mismatch details
   */
  clearMismatchDetails() {
    this.currentMismatchDetails = null;
  }
}

export default ComparisonEngine;

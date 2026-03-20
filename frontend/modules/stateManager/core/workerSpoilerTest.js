/**
 * Worker-Side Spoiler Test Execution
 *
 * Processes sphere events entirely within the worker to eliminate
 * communication overhead with the main thread.
 *
 * This module is designed to run inside the StateManager worker thread,
 * with direct access to the StateManager instance and its methods.
 *
 * @module stateManager/core/workerSpoilerTest
 */

import { profiler } from '../../shared/profiler.js';
import { evaluateRule } from '../../shared/ruleEngine.js';
import { createSnapshotInterface } from '../../shared/snapshotInterface.js';

/**
 * Worker-side spoiler test runner
 *
 * Processes all sphere events within the worker, eliminating round-trip
 * communication overhead with the main thread.
 */
export class WorkerSpoilerTest {
  /**
   * Create a new WorkerSpoilerTest instance
   *
   * @param {Object} stateManager - The StateManager instance
   * @param {Function} postMessage - Function to send messages to main thread
   * @param {Function} logger - Logging function (level, message, ...args)
   */
  constructor(stateManager, postMessage, logger) {
    this.sm = stateManager;
    this.postMessage = postMessage;
    this.log = logger || (() => {});
    this.aborted = false;
    this.analysisCompleteResolver = null;
  }

  /**
   * Run the full spoiler test
   *
   * @param {Array} sphereData - Pre-processed sphere data from sphereState
   * @param {Object} config - Test configuration
   * @param {number} config.playerId - Player ID
   * @param {boolean} config.stopOnFirstError - Halt on first mismatch (default: true)
   * @param {boolean} config.waitForMainThreadAnalysis - Wait for main thread analysis (default: false)
   * @param {boolean} config.verboseMode - Enable verbose logging
   * @param {boolean} config.focusedMode - Focused regression test mode
   * @param {Array} config.focusLocations - Locations to focus on in focused mode
   * @returns {Promise<Object>} Test results
   */
  async run(sphereData, config) {
    const {
      playerId,
      stopOnFirstError = true,
      waitForMainThreadAnalysis = false,
      verboseMode = false,
      focusedMode = false,
      focusLocations = []
    } = config;

    this.playerId = playerId;
    this.playerIdKey = String(playerId);
    this.verboseMode = verboseMode;
    this.focusedMode = focusedMode;
    this.focusLocations = focusLocations;
    this.previousInventory = {};

    profiler.start('workerSpoilerTest');

    const results = {
      passed: true,
      totalEvents: sphereData.length,
      processedEvents: 0,
      mismatchDetails: [],
      locationsChecked: 0,
      itemsAdded: 0,
      aborted: false
    };

    try {
      // Configure StateManager for test
      this.sm.setAutoCollectEventsConfig(false);
      this.sm.setSpoilerTestMode(true);

      this.log('info', `[WorkerSpoilerTest] Starting test with ${sphereData.length} spheres`);

      for (let i = 0; i < sphereData.length; i++) {
        if (this.aborted) {
          results.aborted = true;
          this.log('info', '[WorkerSpoilerTest] Test aborted');
          break;
        }

        const sphere = sphereData[i];
        const sphereResult = await this.processSphere(sphere, i);

        results.processedEvents++;
        results.locationsChecked += sphereResult.locationsChecked;
        results.itemsAdded += sphereResult.itemsAdded;

        // Send progress update
        this.postMessage({
          type: 'spoilerTestProgress',
          eventIndex: i,
          totalEvents: sphereData.length,
          sphereIndex: sphere.sphereIndex,
          passed: sphereResult.passed,
          locationsChecked: sphereResult.locationsChecked,
          itemsAdded: sphereResult.itemsAdded
        });

        if (!sphereResult.passed) {
          results.passed = false;
          results.mismatchDetails.push(...sphereResult.mismatches);

          // Send mismatch details
          this.postMessage({
            type: 'spoilerTestMismatch',
            eventIndex: i,
            sphereIndex: sphere.sphereIndex,
            mismatches: sphereResult.mismatches,
            awaitingAnalysis: waitForMainThreadAnalysis && !stopOnFirstError
          });

          if (stopOnFirstError) {
            this.log('info', `[WorkerSpoilerTest] Stopping on first error at sphere ${sphere.sphereIndex}`);
            break;
          }

          if (waitForMainThreadAnalysis) {
            // Wait for main thread to complete analysis
            await this.waitForAnalysisComplete();
          }
        }

        // Update previous inventory for next sphere
        this.updatePreviousInventory(sphere);
      }
    } catch (error) {
      this.log('error', `[WorkerSpoilerTest] Error during test: ${error.message}`, error);
      results.passed = false;
      results.error = error.message;
    } finally {
      // Restore StateManager configuration
      this.sm.setAutoCollectEventsConfig(true);
      this.sm.setSpoilerTestMode(false);

      // Clean up the shared helper cache
      if (this.sm._spoilerTestHelperCache) {
        this.sm._spoilerTestHelperCache.clear();
        delete this.sm._spoilerTestHelperCache;
      }

      profiler.end('workerSpoilerTest');
      results.profilingData = profiler.getData();
    }

    return results;
  }

  /**
   * Process a single sphere
   *
   * @param {Object} sphere - Sphere data
   * @param {number} index - Sphere index in array
   * @returns {Promise<Object>} Sphere processing result
   */
  async processSphere(sphere, index) {
    const result = {
      passed: true,
      mismatches: [],
      locationsChecked: 0,
      itemsAdded: 0
    };

    const sphereIndex = sphere.sphereIndex;
    const sphereNumberInt = parseInt(String(sphereIndex).split('.')[0], 10);

    this.log('info', `[WorkerSpoilerTest] Processing sphere ${sphereIndex}`);

    // Clear the shared helper cache at the start of each sphere.
    // This ensures that when items are added or state changes during the sphere,
    // helper results are re-evaluated with the new state.
    if (this.sm._spoilerTestHelperCache) {
      this.sm._spoilerTestHelperCache.clear();
    }

    try {
      // Clear state at sphere 0
      if (sphereNumberInt === 0 && index === 0) {
        this.sm.clearState({ recomputeAndSendUpdate: true });
        this.log('debug', '[WorkerSpoilerTest] Cleared state for sphere 0');

        // Add starting items - use sm.rules, not sm.staticData
        // Consolidate items into counts first for efficiency (fuzz tests can generate
        // hundreds of thousands of items when start_inventory has large counts)
        const startingItems = this.sm.rules?.starting_items?.[this.playerIdKey] || [];
        this.log('info', `[WorkerSpoilerTest] Starting items for player ${this.playerIdKey}: ${startingItems.length} items`);
        if (startingItems.length > 0) {
          // Consolidate duplicate items into counts
          const itemCounts = {};
          for (const itemName of startingItems) {
            itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
          }
          const uniqueItemCount = Object.keys(itemCounts).length;
          this.log('debug', `[WorkerSpoilerTest] Consolidated into ${uniqueItemCount} unique items`);

          // Add each unique item with its total count
          for (const [itemName, count] of Object.entries(itemCounts)) {
            this.sm.addItemToInventory(itemName, count);
            result.itemsAdded += count;
          }
          this.log('info', `[WorkerSpoilerTest] Added ${startingItems.length} starting items (${uniqueItemCount} unique)`);
        }
      }

      // Get exporter settings - use sm.rules, not sm.staticData
      const exporterSettings = this.sm.rules?.exporter?.[this.playerIdKey] || {};
      const addItemsUpfront = exporterSettings.add_sphere_items_upfront || false;
      const useResolvedItems = exporterSettings.use_resolved_items || false;

      // Determine inventory source
      const inventoryDetails = sphere.inventoryDetails || {};
      const baseItems = inventoryDetails.base_items || {};
      const resolvedItems = inventoryDetails.resolved_items || {};
      const inventoryFromLog = useResolvedItems ? { ...resolvedItems } : { ...baseItems };

      // Get accumulator targets from game_info to filter them out when using resolved_items
      const gameInfo = this.sm.gameInfo?.[this.playerIdKey] || {};
      const accumulatorTargets = new Set(
        (gameInfo.accumulator_rules || []).map(rule => rule.target)
      );

      // Find newly added items
      const newlyAddedItems = this.findNewlyAddedItems(this.previousInventory, inventoryFromLog);

      if (addItemsUpfront) {
        // Add items upfront mode (DLCQuest, Blasphemous, etc.)
        const isSphere0Base = sphereNumberInt === 0 && !String(sphereIndex).includes('.');

        if (!isSphere0Base && newlyAddedItems.length > 0) {
          // Add items, skipping accumulator targets when using resolved_items
          // (they appear in resolved_items but are just computed values, not real items)
          // Skip game logic hooks when using resolved_items to avoid double-counting
          if (useResolvedItems) this.sm._skipGameLogicHooks = true;
          for (const itemName of newlyAddedItems) {
            // Skip accumulator target items when using resolved_items
            // The pattern-matching items (e.g., "46 coins") will handle accumulation
            if (useResolvedItems && accumulatorTargets.has(itemName)) {
              continue;
            }
            this.sm.addItemToInventory(itemName, 1);
            result.itemsAdded++;
          }
          if (useResolvedItems) this.sm._skipGameLogicHooks = false;
          this.log('info', `[WorkerSpoilerTest] Added ${result.itemsAdded} items upfront`);
        }

        // Compare after adding items
        this.sm.invalidateCache();
        const snapshot = this.sm.getSnapshot();

        const locationResult = this.compareLocations(
          sphere.accessibleLocations || [],
          snapshot,
          sphereIndex
        );

        const regionResult = this.compareRegions(
          sphere.accessibleRegions || [],
          snapshot,
          sphereIndex
        );

        if (!locationResult.passed) {
          result.passed = false;
          result.mismatches.push(locationResult.mismatch);
        }

        if (!regionResult.passed) {
          result.passed = false;
          result.mismatches.push(regionResult.mismatch);
        }
      } else {
        // Normal mode: check locations one by one
        const locationsToCheck = sphere.locations || [];

        // In multiworld, items can be received from other players without checking locations.
        // We need to add items from new_inventory_details that are NOT from checking our own locations.
        // Items from checking our own locations will be added by checkLocation().
        const isSphere0Base = sphereNumberInt === 0 && !String(sphereIndex).includes('.');
        if (!isSphere0Base && newlyAddedItems.length > 0) {
          if (useResolvedItems) {
            // When using resolved_items, add ALL items from the sphere log directly.
            // The dedup logic doesn't work here because location items use base progressive
            // names (e.g., "Progressive Claw") while resolved_items use tier names
            // (e.g., "Cat Claw"). checkLocation will be called with addItems=false below.
            // Skip game logic hooks to avoid double-counting virtual items
            // (resolved_items already contains the correct virtual item values).
            this.sm._skipGameLogicHooks = true;
            for (const itemName of newlyAddedItems) {
              if (accumulatorTargets.has(itemName)) {
                continue;
              }
              this.sm.addItemToInventory(itemName, 1);
              result.itemsAdded++;
            }
            this.sm._skipGameLogicHooks = false;
            if (result.itemsAdded > 0) {
              this.log('info', `[WorkerSpoilerTest] Added ${result.itemsAdded} resolved items from sphere log`);
            }
          } else {
            // Calculate items that will be added by checking our own locations
            // (items at those locations that belong to this player)
            const itemsFromOwnLocations = {};
            for (const locationName of locationsToCheck) {
              const locationDef = this.sm.locations?.get?.(locationName) ||
                                 this.sm.locations?.[locationName];
              if (locationDef?.item?.name) {
                const itemPlayer = String(locationDef.item.player || this.playerId);
                if (itemPlayer === this.playerIdKey) {
                  // This item belongs to us and will be added by checkLocation
                  const itemName = locationDef.item.name;
                  itemsFromOwnLocations[itemName] = (itemsFromOwnLocations[itemName] || 0) + 1;
                }
              }
            }

            // Add only items from other players (not from checking our own locations)
            // We need to track how many of each item to add, accounting for duplicates
            const itemsToAdd = [...newlyAddedItems]; // Copy array to modify
            for (const [itemName, count] of Object.entries(itemsFromOwnLocations)) {
              let remaining = count;
              for (let i = itemsToAdd.length - 1; i >= 0 && remaining > 0; i--) {
                if (itemsToAdd[i] === itemName) {
                  itemsToAdd.splice(i, 1);
                  remaining--;
                }
              }
            }

            // Add remaining items (from other players in multiworld)
            for (const itemName of itemsToAdd) {
              this.sm.addItemToInventory(itemName, 1);
              result.itemsAdded++;
            }
            if (result.itemsAdded > 0) {
              this.log('info', `[WorkerSpoilerTest] Added ${result.itemsAdded} items from other players (multiworld)`);
            }
          }
        }

        if (locationsToCheck.length > 0) {
          this.log('info', `[WorkerSpoilerTest] Checking ${locationsToCheck.length} locations`);

          // When using resolved_items, don't let checkLocation add items (addItems=false).
          // Items are already added from the sphere log's resolved_items above, using the
          // correct resolved tier names. checkLocation would add base progressive names
          // (e.g., "Progressive Claw") which conflict with the resolved names ("Cat Claw").
          const addItemsOnCheck = !useResolvedItems;

          for (const locationName of locationsToCheck) {
            // Get location definition - use sm.locations directly
            const locationDef = this.sm.locations?.get?.(locationName) ||
                               this.sm.locations?.[locationName];

            if (!locationDef) {
              this.log('warn', `[WorkerSpoilerTest] Location "${locationName}" not found`);
              continue;
            }

            // Verify accessibility before checking
            // Use StateManager's internal method to create snapshot interface
            const snapshotInterface = this.sm._createSelfSnapshotInterface({
              playerId: this.playerId
            });
            const isAccessible = snapshotInterface.isLocationAccessible(locationName);

            if (!isAccessible) {
              this.log('error', `[WorkerSpoilerTest] Location "${locationName}" not accessible!`);
              result.passed = false;
              result.mismatches.push({
                type: 'pre_check_failure',
                sphereIndex: sphereIndex,
                location: locationName,
                message: `Location "${locationName}" should be accessible but is not`
              });

              // In focused mode or stopOnFirstError, this is a critical failure
              if (this.focusedMode) {
                throw new Error(`Focused test failed: "${locationName}" not accessible`);
              }
              continue;
            }

            // Check the location (mark as checked, conditionally add item to inventory)
            this.sm.checkLocation(locationName, addItemsOnCheck);
            result.locationsChecked++;
          }
        }

        // Invalidate cache and get fresh snapshot for comparison
        this.sm.invalidateCache();
        const freshSnapshot = this.sm.getSnapshot();

        // Skip full comparison in focused mode
        if (this.focusedMode) {
          this.log('info', `[WorkerSpoilerTest] Focused mode: sphere ${sphereIndex} passed`);
        } else {
          // Compare accessible locations
          const locationResult = this.compareLocations(
            sphere.accessibleLocations || [],
            freshSnapshot,
            sphereIndex
          );

          if (!locationResult.passed) {
            result.passed = false;
            result.mismatches.push(locationResult.mismatch);
          }

          // Compare accessible regions
          const regionResult = this.compareRegions(
            sphere.accessibleRegions || [],
            freshSnapshot,
            sphereIndex
          );

          if (!regionResult.passed) {
            result.passed = false;
            result.mismatches.push(regionResult.mismatch);
          }
        }
      }
    } catch (error) {
      this.log('error', `[WorkerSpoilerTest] Error processing sphere ${sphereIndex}: ${error.message}`);
      result.passed = false;
      result.mismatches.push({
        type: 'error',
        sphereIndex: sphereIndex,
        message: error.message
      });
    }

    return result;
  }

  /**
   * Compare accessible locations between log and current state
   *
   * @param {Array<string>} expectedLocations - Expected accessible locations from log
   * @param {Object} snapshot - Current state snapshot
   * @param {string} sphereIndex - Current sphere index
   * @returns {Object} Comparison result with passed flag and mismatch details
   */
  compareLocations(expectedLocations, snapshot, sphereIndex) {
    const result = { passed: true, mismatch: null };

    // Get accessible unchecked locations from current state
    const stateAccessible = [];
    const locations = this.sm.locations;

    if (locations) {
      const locationEntries = locations.entries ? [...locations.entries()] : Object.entries(locations);

      // Get the shared helper cache from StateManager (created if not exists).
      // This cache is shared across all location rule evaluations within the same
      // sphere, significantly improving performance for games with many locations
      // that use shared helpers (e.g., coinsanity in Mario Land 2 with is_auto_scroll
      // helper called 406+ times with the same arguments).
      const sharedHelperCache = this.sm._spoilerTestHelperCache || (this.sm._spoilerTestHelperCache = new Map());

      // Convert flags array to Set for O(1) lookup instead of O(N) array.includes()
      // This is critical for games with many locations (e.g., coinsanity with 1500+ locations)
      const flagsSet = new Set(snapshot.flags || []);

      for (const [locName, locDef] of locationEntries) {
        // Skip checked locations
        if (flagsSet.has(locName)) continue;

        // Check if location is accessible
        const parentRegion = locDef.parent_region || locDef.region;
        const regionStatus = snapshot.regionReachability?.[parentRegion];
        const isRegionReachable = regionStatus === 'reachable' || regionStatus === 'checked';

        if (!isRegionReachable) continue;

        // Evaluate access rule - create location-specific snapshotInterface
        let ruleResult = true;
        if (locDef.access_rule) {
          try {
            // Create location-specific snapshotInterface for rule evaluation
            const locationSnapshotInterface = this.sm._createSelfSnapshotInterface({
              location: locDef,
              playerId: this.playerId
            });
            // Inject the shared helper cache into this context
            // This allows helper results to be cached and reused across locations
            locationSnapshotInterface._helperCache = sharedHelperCache;
            ruleResult = evaluateRule(locDef.access_rule, locationSnapshotInterface);
          } catch (e) {
            this.log('warn', `[WorkerSpoilerTest] Error evaluating rule for ${locName}: ${e.message}`);
            ruleResult = false;
          }
        }

        if (ruleResult) {
          stateAccessible.push(locName);
        }
      }
    }

    // Compare sets
    const expectedSet = new Set(expectedLocations);
    const stateSet = new Set(stateAccessible);

    const missingFromState = expectedLocations.filter(loc => !stateSet.has(loc));
    const extraInState = stateAccessible.filter(loc => !expectedSet.has(loc));

    if (missingFromState.length > 0 || extraInState.length > 0) {
      result.passed = false;
      result.mismatch = {
        type: 'locations',
        sphereIndex: sphereIndex,
        missingFromState: missingFromState,
        extraInState: extraInState,
        expectedCount: expectedLocations.length,
        actualCount: stateAccessible.length
      };

      this.log('error', `[WorkerSpoilerTest] Location mismatch at sphere ${sphereIndex}: ` +
        `missing=${missingFromState.length}, extra=${extraInState.length}`);
    }

    return result;
  }

  /**
   * Compare accessible regions between log and current state
   *
   * @param {Array<string>} expectedRegions - Expected accessible regions from log
   * @param {Object} snapshot - Current state snapshot
   * @param {string} sphereIndex - Current sphere index
   * @returns {Object} Comparison result with passed flag and mismatch details
   */
  compareRegions(expectedRegions, snapshot, sphereIndex) {
    const result = { passed: true, mismatch: null };

    // Get reachable regions from snapshot, excluding placeholder/dynamically_added regions
    // These are organizational regions that exist in rules.json but are filtered out of
    // Python's multiworld (they have no locations and no exits).
    // - placeholder: terminal regions referenced by exits but not in multiworld.regions
    // - dynamically_added: regions marked after sphere calculation
    // Since Python's sphere log may or may not include them depending on export timing,
    // we exclude them from comparison for consistency.
    const stateReachable = [];
    const regionReachability = snapshot.regionReachability || {};

    for (const [regionName, status] of Object.entries(regionReachability)) {
      if (status === 'reachable') {
        // Check if this is a placeholder or dynamically_added region
        const regionDef = this.sm.regions?.get?.(regionName);
        if (regionDef?.placeholder || regionDef?.dynamically_added) {
          // Skip placeholder/dynamically_added regions - they may not exist in Python's multiworld
          continue;
        }
        stateReachable.push(regionName);
      }
    }

    // Also filter the expected regions using the same criteria
    // This handles cross-validation where the log was generated with different rules
    const filteredExpected = expectedRegions.filter(regionName => {
      const regionDef = this.sm.regions?.get?.(regionName);
      return !(regionDef?.placeholder || regionDef?.dynamically_added);
    });

    // Compare sets
    const expectedSet = new Set(filteredExpected);
    const stateSet = new Set(stateReachable);

    const missingFromState = filteredExpected.filter(reg => !stateSet.has(reg));
    const extraInState = stateReachable.filter(reg => !expectedSet.has(reg));

    if (missingFromState.length > 0 || extraInState.length > 0) {
      result.passed = false;
      result.mismatch = {
        type: 'regions',
        sphereIndex: sphereIndex,
        missingFromState: missingFromState,
        extraInState: extraInState,
        expectedCount: filteredExpected.length,
        actualCount: stateReachable.length
      };

      this.log('error', `[WorkerSpoilerTest] Region mismatch at sphere ${sphereIndex}: ` +
        `missing=${missingFromState.length}, extra=${extraInState.length}`);
      if (extraInState.length > 0) {
        this.log('error', `[WorkerSpoilerTest] Extra regions: ${extraInState.join(', ')}`);
      }
      if (missingFromState.length > 0) {
        this.log('error', `[WorkerSpoilerTest] Missing regions: ${missingFromState.join(', ')}`);
      }
    }

    return result;
  }

  /**
   * Find newly added items by comparing inventories
   *
   * @param {Object} previousInventory - Previous inventory state
   * @param {Object} currentInventory - Current inventory state
   * @returns {Array<string>} List of newly added item names (with duplicates for multiple)
   */
  findNewlyAddedItems(previousInventory, currentInventory) {
    const newlyAdded = [];

    for (const [itemName, currentCount] of Object.entries(currentInventory)) {
      const previousCount = previousInventory[itemName] || 0;
      if (currentCount > previousCount) {
        const addedCount = currentCount - previousCount;
        for (let i = 0; i < addedCount; i++) {
          newlyAdded.push(itemName);
        }
      }
    }

    return newlyAdded;
  }

  /**
   * Update previous inventory from sphere data
   *
   * @param {Object} sphere - Current sphere data
   */
  updatePreviousInventory(sphere) {
    const exporterSettings = this.sm.rules?.exporter?.[this.playerIdKey] || {};
    const useResolvedItems = exporterSettings.use_resolved_items || false;

    const inventoryDetails = sphere.inventoryDetails || {};
    if (useResolvedItems) {
      this.previousInventory = { ...(inventoryDetails.resolved_items || {}) };
    } else {
      this.previousInventory = { ...(inventoryDetails.base_items || {}) };
    }
  }

  /**
   * Wait for main thread to signal analysis complete
   *
   * @returns {Promise<void>}
   */
  waitForAnalysisComplete() {
    return new Promise(resolve => {
      this.analysisCompleteResolver = resolve;
    });
  }

  /**
   * Signal that main thread analysis is complete
   * Called when worker receives 'analysisComplete' message
   */
  signalAnalysisComplete() {
    if (this.analysisCompleteResolver) {
      this.analysisCompleteResolver();
      this.analysisCompleteResolver = null;
    }
  }

  /**
   * Abort the test
   */
  abort() {
    this.aborted = true;
  }
}

export default WorkerSpoilerTest;

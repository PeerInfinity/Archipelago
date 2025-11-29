/**
 * Event Processor Module for Test Spoilers
 *
 * Handles processing of individual spoiler log events, including state updates and location checks.
 * Coordinates with ComparisonEngine and AnalysisReporter to validate game state against log expectations.
 *
 * Extracted from testSpoilerUI.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Single event object from spoiler log
 *   - event: Object {type, sphere_index, inventory, accessible_locations, accessible_regions, location, ...}
 *   - currentLogIndex: number (position in log)
 *   - playerId: number (player context)
 *   - totalEvents: number (for progress logging)
 *
 * Processing:
 *   For 'state_update' events:
 *     1. Get sphere data from sphereState module
 *     2. Find newly added items (compare with previous sphere)
 *     3. Check all locations in sphere (via event dispatcher)
 *     4. Wait for state to settle (ping worker)
 *     5. Get fresh snapshot
 *     6. Compare accessible locations (via ComparisonEngine)
 *     7. Compare accessible regions (via ComparisonEngine)
 *     8. If mismatch, trigger analysis (via AnalysisReporter)
 *
 *   For 'checked_location' events:
 *     1. Validate location is accessible
 *     2. Check location via event dispatcher
 *
 * Output: Processing result
 *   - error: boolean (true if mismatch or failure)
 *   - message: string (summary)
 *   - details: Object (event info, sphere, player, items)
 *
 * @module testSpoilers/eventProcessor
 */

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import { evaluateRule } from '../shared/ruleEngine.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { createUniversalLogger } from '../../app/core/universalLogger.js';
import settingsManager from '../../app/core/settingsManager.js';

const logger = createUniversalLogger('testSpoilerUI:EventProcessor');

export class EventProcessor {
  constructor(comparisonEngine, analysisReporter, eventBus, logCallback) {
    this.comparisonEngine = comparisonEngine;
    this.analysisReporter = analysisReporter;
    this.eventBus = eventBus;
    this.logCallback = logCallback;  // Callback for UI logging: (type, message, ...data) => void
    this.previousInventory = {};
    this.currentLogIndex = 0;
    this.spoilerLogData = null;
    this.playerId = null;
    this.currentEventMismatchDetails = []; // Store all mismatch details for current event
    this.verboseMode = false; // Will be loaded from settings
    this.focusedMode = false; // True if this is a focused regression test
    this.focusLocations = []; // Locations to focus on in focused mode
    logger.debug('EventProcessor constructor called');

    // Load verbose mode setting
    this._loadVerboseSetting();
  }

  /**
   * Load the verbose mode setting from settingsManager
   * @private
   */
  async _loadVerboseSetting() {
    try {
      this.verboseMode = await settingsManager.getSetting('moduleSettings.testSpoilers.verboseSpoilerTests', false);
      logger.debug(`Verbose spoiler tests mode: ${this.verboseMode}`);
    } catch (error) {
      logger.warn('Failed to load verboseSpoilerTests setting, defaulting to false', error);
      this.verboseMode = false;
    }
  }

  /**
   * Sets the current context for event processing
   * @param {number} currentLogIndex - Current position in log
   * @param {Array} spoilerLogData - Full spoiler log data array
   * @param {number} playerId - Player ID for context
   */
  setContext(currentLogIndex, spoilerLogData, playerId) {
    this.currentLogIndex = currentLogIndex;
    this.spoilerLogData = spoilerLogData;
    this.playerId = Number(playerId); // Ensure numeric type for consistency
    this.playerIdKey = String(this.playerId); // String version for accessing JSON objects with string keys

    // Check if we're in focused mode (from sphereState)
    this._updateFocusedMode();
  }

  /**
   * Update focused mode settings from sphereState
   * @private
   */
  _updateFocusedMode() {
    try {
      if (window.centralRegistry && typeof window.centralRegistry.getPublicFunction === 'function') {
        const isFocusedMode = window.centralRegistry.getPublicFunction('sphereState', 'isFocusedMode');
        const getFocusLocations = window.centralRegistry.getPublicFunction('sphereState', 'getFocusLocations');

        if (isFocusedMode && getFocusLocations) {
          this.focusedMode = isFocusedMode();
          this.focusLocations = getFocusLocations();

          if (this.focusedMode) {
            this.logCallback('info', `🎯 FOCUSED MODE: Only checking accessibility of: ${this.focusLocations.join(', ')}`);
          }
        }
      }
    } catch (error) {
      logger.warn('Could not check focused mode from sphereState:', error);
      this.focusedMode = false;
      this.focusLocations = [];
    }
  }

  /**
   * Processes a single event from the spoiler log
   *
   * DATA FLOW:
   * Input: Event object from spoilerLogData
   *   ├─> event: Object (event to process)
   *   ├─> currentLogIndex: number (from context, set via setContext)
   *   ├─> spoilerLogData: Array (from context, set via setContext)
   *   ├─> playerId: number (from context, set via setContext)
   *
   * Processing:
   *   For 'state_update':
   *     ├─> Get sphere data from sphereState
   *     ├─> Find newly added items
   *     ├─> Check locations in sphere
   *     ├─> Compare locations and regions
   *     └─> Update previousInventory
   *
   *   For 'checked_location':
   *     ├─> Validate location accessibility
   *     └─> Check location via event
   *
   * Output: Processing result
   *   ├─> error: boolean
   *   ├─> message: string
   *   └─> details: Object
   *
   * @param {Object} event - Event object from log
   * @returns {Promise<Object>} Processing result: {error, message, details}
   */
  async processSingleEvent(event) {
    // Safeguard: Ensure setContext was called before processing
    if (this.playerId === null || this.spoilerLogData === null) {
      const errorMsg = 'EventProcessor.processSingleEvent called before setContext(). Must call setContext() first.';
      logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    // Clear mismatch details for this event
    this.currentEventMismatchDetails = [];

    if (this.verboseMode) {
      this.logCallback('debug', `[processSingleEvent] playerId at start: ${this.playerId}`);
    }

    // This function now only processes a single event
    if (!event) return;

    const eventType = event.type;
    this.logCallback(
      'info',
      `Processing Event ${this.currentLogIndex + 1}/${
        this.spoilerLogData.length
      }: Type '${eventType}'`
    );

    let comparisonResult = false;
    let allChecksPassed = true; // Assume true until a check fails
    let newlyAddedItems = []; // Declare at function scope to be accessible in return statement

    switch (eventType) {
      case 'state_update': {
        // Get sphere data from sphereState (which handles both verbose and incremental formats)
        const sphereData = this._getSphereDataFromSphereState(this.currentLogIndex);

        if (!sphereData) {
          this.logCallback(
            'warn',
            `Could not get sphere data from sphereState for index ${this.currentLogIndex}. Skipping comparison.`
          );
          allChecksPassed = false;
          break;
        }

        // Use accumulated data from sphereState
        // Check game settings to determine which items to use
        const staticData = stateManager.getStaticData();
        const useResolvedItems = staticData?.settings?.[this.playerIdKey]?.use_resolved_items || false;

        const base_items = sphereData.inventoryDetails?.base_items || {};
        const resolved_items = sphereData.inventoryDetails?.resolved_items || {};

        let inventory_from_log;

        if (useResolvedItems) {
          // Blasphemous and similar games: use only resolved_items
          inventory_from_log = { ...resolved_items };
        } else {
          // Most games (alttp, etc): use only base_items
          inventory_from_log = { ...base_items };
        }

        this.logCallback('info', `[Sphere ${event.sphere_index}] inventory_from_log: ${JSON.stringify(inventory_from_log)}`)

        // Find newly added items by comparing with previous inventory
        newlyAddedItems = this.findNewlyAddedItems(this.previousInventory, inventory_from_log);

        this.logCallback('info', `[Sphere ${event.sphere_index}] newlyAddedItems: ${JSON.stringify(newlyAddedItems)}`);

        // Log newly added items before the status message
        if (newlyAddedItems.length > 0) {
          const itemCounts = {};
          newlyAddedItems.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
          });
          const itemList = Object.entries(itemCounts).map(([item, count]) =>
            count > 1 ? `${item} (x${count})` : item
          ).join(', ');
          this.logCallback('info', `📦 Recently added item${newlyAddedItems.length > 1 ? 's' : ''}: ${itemList}`);
        }

        const accessible_from_log = sphereData.accessibleLocations || [];
        const accessible_regions_from_log = sphereData.accessibleRegions || [];

        const context = {
          type: 'state_update',
          sphere_number:
            event.sphere_index !== undefined
              ? event.sphere_index
              : this.currentLogIndex + 1,
          player_id: this.playerId,
        };

        if (this.verboseMode) {
          this.logCallback(
            'info',
            `Preparing StateManager for sphere ${context.sphere_number}.`
          );
        }

        try {
          // For sphere 0, clear ALL inventory and prog_items to ensure clean start
          // This is critical for games like DLCQuest that use prog_items accumulators
          if (context.sphere_number === 0) {
            await stateManager.clearStateAndReset();
            if (this.verboseMode) {
              this.logCallback('debug', 'Full state cleared for sphere 0 (inventory, prog_items, and event items).');
            }

            // Re-add starting items (precollected items) after clearing state
            // These are items the player starts with (e.g., keycards when Keysanity is disabled in SMZ3)
            const startingItems = staticData?.starting_items?.[this.playerIdKey] || [];
            if (startingItems.length > 0) {
              this.logCallback('info', `Adding ${startingItems.length} starting items to inventory...`);
              for (const itemName of startingItems) {
                await stateManager.addItemToInventory(itemName, 1);
                if (this.verboseMode) {
                  this.logCallback('debug', `  Added starting item: ${itemName}`);
                }
              }
              // Wait for state to stabilize after adding starting items
              await stateManager.pingWorker('sphere_0_starting_items_added', 10000);
              this.logCallback('info', 'Starting items added successfully.');
            }
          } else {
            if (this.verboseMode) {
              this.logCallback('debug', `Keeping accumulated state for sphere ${context.sphere_number}.`);
            }
          }

          // Add newly discovered items from the sphere log to the state manager
          // This is only done for games that set add_sphere_items_upfront flag (like Blasphemous)
          // Most games get items naturally from checking locations
          const addItemsUpfront = staticData?.settings?.[this.playerIdKey]?.add_sphere_items_upfront || false;

          if (addItemsUpfront && newlyAddedItems.length > 0) {
            this.logCallback('info', `Adding ${newlyAddedItems.length} items from sphere log to inventory...`);
            for (const itemName of newlyAddedItems) {
              await stateManager.addItemToInventory(itemName, 1);
              if (this.verboseMode) {
                this.logCallback('debug', `  Added item: ${itemName}`);
              }
            }
            // Wait for state to stabilize after adding items
            await stateManager.pingWorker(`sphere_${context.sphere_number}_items_added`, 10000);

            // CRITICAL: Trigger reachability update after adding items
            // The items were added but reachability hasn't been recalculated yet
            await stateManager.recalculateAccessibility();

            // Wait for reachability update to complete
            await stateManager.pingWorker(`sphere_${context.sphere_number}_reachability_updated`, 10000);

            // Get fresh snapshot after reachability update
            const snapshot = await stateManager.getFullSnapshot();

            // CRITICAL: For add_sphere_items_upfront mode, do the comparison NOW,
            // before checking any locations, because the sphere log shows what's
            // accessible with just the items added upfront

            // Compare using the snapshot we just got
            const locationComparisonResult = await this.comparisonEngine.compareAccessibleLocations(
              accessible_from_log,
              snapshot,
              this.playerId,
              context
            );

            // Compare regions too
            const regionComparisonResult = await this.comparisonEngine.compareAccessibleRegions(
              accessible_regions_from_log,
              snapshot,
              this.playerId,
              context
            );

            // Store comparison results
            comparisonResult = locationComparisonResult && regionComparisonResult;

            // If there was a mismatch, trigger analysis
            if (!locationComparisonResult) {
              const mismatchDetails = this.comparisonEngine.getMismatchDetails();
              if (mismatchDetails && mismatchDetails.type === 'locations') {
                this.currentEventMismatchDetails.push({
                  type: mismatchDetails.type,
                  context: mismatchDetails.context,
                  missingFromState: mismatchDetails.missingFromState,
                  extraInState: mismatchDetails.extraInState,
                  logAccessibleCount: mismatchDetails.logAccessibleCount,
                  stateAccessibleCount: mismatchDetails.stateAccessibleCount,
                  inventoryUsed: mismatchDetails.inventoryUsed
                });

                if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
                  this.analysisReporter.analyzeFailingLocations(
                    mismatchDetails.missingFromState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    mismatchDetails.snapshotInterface,
                    'MISSING_FROM_STATE',
                    this.playerId
                  );
                }
                if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
                  this.analysisReporter.analyzeFailingLocations(
                    mismatchDetails.extraInState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    mismatchDetails.snapshotInterface,
                    'EXTRA_IN_STATE',
                    this.playerId
                  );
                }
              }
            }

            if (!regionComparisonResult) {
              const mismatchDetails = this.comparisonEngine.getMismatchDetails();
              if (mismatchDetails && mismatchDetails.type === 'regions') {
                this.currentEventMismatchDetails.push({
                  type: mismatchDetails.type,
                  context: mismatchDetails.context,
                  missingFromState: mismatchDetails.missingFromState,
                  extraInState: mismatchDetails.extraInState,
                  logAccessibleCount: mismatchDetails.logAccessibleCount,
                  stateAccessibleCount: mismatchDetails.stateAccessibleCount
                });

                if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
                  this.analysisReporter.analyzeFailingRegions(
                    mismatchDetails.missingFromState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    'MISSING_FROM_STATE'
                  );
                }
                if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
                  this.analysisReporter.analyzeFailingRegions(
                    mismatchDetails.extraInState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    'EXTRA_IN_STATE'
                  );
                }
              }
            }

            // For add_sphere_items_upfront mode, we're done - don't check individual locations
            // because the items are already added and we've done the comparison
            break; // Exit the state_update case
          }

          // Check locations from current sphere one-by-one, allowing natural item acquisition
          // NOTE: We now use addItems=true (default) to let checkLocation naturally add items.
          // Progressive items are automatically resolved by the has() function in game logic.

          // Check if this is a multiworld event (has player_data with multiple players)
          const isMultiworld = event.player_data && Object.keys(event.player_data).length > 1;

          if (isMultiworld) {
            // Multiworld processing: handle locations from all players
            await this._processMultiworldLocations(event, context, stateManager);
          } else {
            // Single-player processing: check locations normally
            const locationsToCheck = sphereData.locations || [];
            if (locationsToCheck.length > 0) {
              this.logCallback('info', `Checking ${locationsToCheck.length} locations from sphere ${context.sphere_number}`);

              // Get initial snapshot and static data once (for logging)
              const initialSnapshot = await stateManager.getFullSnapshot();
              const staticData = stateManager.getStaticData();

              for (const locationName of locationsToCheck) {
                // Get location definition from static data to see what item we're about to receive (for logging)
                // staticData.locations is always a Map after initialization
                const locationDef = staticData.locations.get(locationName);
                const itemName = locationDef?.item?.name;

                if (itemName) {
                  this.logCallback('debug', `  Checking "${locationName}" (contains: ${itemName})`);
                } else {
                  this.logCallback('debug', `  Checking "${locationName}" (no item or event)`);
                }

                // NEW: Check if location is accessible BEFORE attempting to check it
                const currentSnapshot = await stateManager.getFullSnapshot();
                const snapshotInterface = createStateSnapshotInterface(currentSnapshot, stateManager.getStaticData());
                const isAccessible = snapshotInterface.isLocationAccessible(locationName);

                if (!isAccessible) {
                  if (this.focusedMode) {
                    // Focused mode: This is the key test - location should be accessible
                    this.logCallback('error', `  ❌ FOCUSED TEST FAILED: "${locationName}" is NOT accessible!`);
                    this.logCallback('error', `    This is a regression test - the location should be accessible once the bug is fixed.`);
                    this.logCallback('error', `    Current inventory: ${JSON.stringify(currentSnapshot.inventory)}`);
                  } else {
                    this.logCallback('error', `  ⚠️ PRE-CHECK FAILED: "${locationName}" is NOT accessible per snapshot before check attempt!`);
                    this.logCallback('error', `    Current inventory: ${JSON.stringify(currentSnapshot.inventory)}`);
                    this.logCallback('error', `    Sphere log says this location should be accessible in sphere ${context.sphere_number}`);
                    this.logCallback('error', `    But snapshot reports it as inaccessible - this is a bug!`);
                  }

                  // Mark this as a failure and stop the test
                  allChecksPassed = false;
                  comparisonResult = false;
                  throw new Error(`Pre-check accessibility mismatch for "${locationName}" in sphere ${context.sphere_number}`);
                }

                // Check location WITH items via event dispatcher instead of direct call
                // This naturally adds the item (e.g., "Progressive Sword") to inventory
                // Use event-based flow to match how timer and UI modules interact with stateManager
                const locationRegion = locationDef?.parent_region_name || locationDef?.parent_region || locationDef?.region || null;
                await this.checkLocationViaEvent(locationName, locationRegion);
              }

              this.logCallback('info', `Completed checking ${locationsToCheck.length} locations for sphere ${context.sphere_number}`);
            }
          }

          // TODO: Add inventory comparison in the future
          // Currently we only compare location accessibility, not inventory contents.
          // To add inventory comparison, we need to resolve progressive items:
          //   - StateManager inventory uses base names: {"Progressive Sword": 2}
          //   - Sphere log uses resolved names: {"Fighter Sword": 1, "Master Sword": 1}
          // Options:
          //   1. Implement resolution function to compare these correctly
          //   2. Enhance sphere log format to include both resolved and unresolved items
          //   3. Use progression_mapping to convert StateManager inventory to resolved form

          // Ping worker to ensure all commands are processed and state is stable.
          await stateManager.pingWorker(
            `spoiler_sphere_${context.sphere_number}_locations_checked`,
            180000  // Increased timeout to 180 seconds to handle very complex games like Yu-Gi-Oh! 2006
          );
          if (this.verboseMode) {
            this.logCallback(
              'debug',
              'Ping successful. StateManager ready for comparison.'
            );
          }

          // Get the fresh snapshot from the worker.
          const freshSnapshot = await stateManager.getFullSnapshot();
          if (!freshSnapshot) {
            this.logCallback(
              'error',
              'Failed to retrieve a fresh snapshot from StateManager after checking locations.'
            );
            allChecksPassed = false;
            break;
          }
          this.logCallback(
            'info',
            `Fresh snapshot has ${freshSnapshot.checkedLocations?.length || 0} checked locations`
          );
          if (this.verboseMode) {
            this.logCallback(
              'debug',
              'Retrieved fresh snapshot from StateManager.',
              freshSnapshot
            );
          }

          // In focused mode, skip full comparison - the pre-check already validated
          // that sphere_locations were accessible (that's the only thing we care about)
          if (this.focusedMode) {
            this.logCallback('success', `✓ Focused mode: Sphere ${context.sphere_number} passed - all focus locations were accessible`);
            comparisonResult = true;
            allChecksPassed = true;
          } else {
            // Normal mode: Do full location and region comparison

            // Compare using the fresh snapshot.
            const locationComparisonResult = await this.comparisonEngine.compareAccessibleLocations(
              accessible_from_log, // This is an array of location names
              freshSnapshot, // The authoritative snapshot from the worker
              this.playerId, // Pass player ID for context in comparison
              context // Original context for logging
            );

            // If there was a location mismatch, trigger analysis and store details
            if (!locationComparisonResult) {
              const mismatchDetails = this.comparisonEngine.getMismatchDetails();
              if (mismatchDetails && mismatchDetails.type === 'locations') {
                // Store serializable mismatch details
                this.currentEventMismatchDetails.push({
                  type: mismatchDetails.type,
                  context: mismatchDetails.context,
                  missingFromState: mismatchDetails.missingFromState,
                  extraInState: mismatchDetails.extraInState,
                  logAccessibleCount: mismatchDetails.logAccessibleCount,
                  stateAccessibleCount: mismatchDetails.stateAccessibleCount,
                  inventoryUsed: mismatchDetails.inventoryUsed
                });

                // Analyze missing locations
                if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
                  this.analysisReporter.analyzeFailingLocations(
                    mismatchDetails.missingFromState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    mismatchDetails.snapshotInterface,
                    'MISSING_FROM_STATE',
                    this.playerId
                  );
                }
                // Analyze extra locations
                if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
                  this.analysisReporter.analyzeFailingLocations(
                    mismatchDetails.extraInState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    mismatchDetails.snapshotInterface,
                    'EXTRA_IN_STATE',
                    this.playerId
                  );
                }
              }
            }

            // Compare accessible regions using the fresh snapshot.
            const regionComparisonResult = await this.comparisonEngine.compareAccessibleRegions(
              accessible_regions_from_log, // This is an array of region names
              freshSnapshot, // The authoritative snapshot from the worker
              this.playerId, // Pass player ID for context in comparison
              context // Original context for logging
            );

            // If there was a region mismatch, trigger analysis and store details
            if (!regionComparisonResult) {
              const mismatchDetails = this.comparisonEngine.getMismatchDetails();
              if (mismatchDetails && mismatchDetails.type === 'regions') {
                // Store serializable mismatch details
                this.currentEventMismatchDetails.push({
                  type: mismatchDetails.type,
                  context: mismatchDetails.context,
                  missingFromState: mismatchDetails.missingFromState,
                  extraInState: mismatchDetails.extraInState,
                  logAccessibleCount: mismatchDetails.logAccessibleCount,
                  stateAccessibleCount: mismatchDetails.stateAccessibleCount,
                  inventoryUsed: mismatchDetails.inventoryUsed
                });

                // Analyze missing regions
                if (mismatchDetails.missingFromState && mismatchDetails.missingFromState.length > 0) {
                  this.analysisReporter.analyzeFailingRegions(
                    mismatchDetails.missingFromState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    this.playerId,
                    'MISSING_FROM_STATE'
                  );
                }
                // Analyze extra regions
                if (mismatchDetails.extraInState && mismatchDetails.extraInState.length > 0) {
                  this.analysisReporter.analyzeFailingRegions(
                    mismatchDetails.extraInState,
                    mismatchDetails.staticData,
                    mismatchDetails.currentWorkerSnapshot,
                    this.playerId,
                    'EXTRA_IN_STATE'
                  );
                }
              }
            }

            // Both location and region comparisons must pass
            comparisonResult = locationComparisonResult && regionComparisonResult;
            allChecksPassed = comparisonResult;
          }
        } catch (err) {
          this.logCallback(
            'error',
            `Error during StateManager interaction or comparison for sphere ${context.sphere_number}: ${err.message}`,
            err
          );
          allChecksPassed = false;
          // Ensure comparisonResult reflects failure if an error occurs before it's set
          comparisonResult = false;
        }
        break;
      }


      case 'connected':
        this.logCallback(
          'info',
          `Player ${event.player_name} (ID: ${event.player_id}) connected. Seed: ${event.seed_name}`
        );
        break;

      case 'initial_state':
        this.logCallback('state', 'Comparing initial state...');
        // The worker should compute this after rules are loaded via loadRules command,
        // and the state will be available via snapshot for compareAccessibleLocations.
        // Note: This case may need updating based on actual event structure
        logger.warn('initial_state event handling not fully implemented');
        break;

      case 'checked_location':
        if (event.location && event.location.name) {
          const locName = event.location.name;
          this.logCallback('info', `Simulating check for location: "${locName}"`);

          // Get static data once to find the location details
          const staticData = stateManager.getStaticData();
          const locDef = staticData?.locations?.[locName];

          if (!locDef) {
            this.logCallback(
              'error',
              `Location "${locName}" from log not found in current static data. Skipping check.`
            );
          } else {
            const currentSnapshot = await stateManager.getFullSnapshot(); // Get current dynamic state
            if (!currentSnapshot) {
              this.logCallback(
                'error',
                `Could not get snapshot to check accessibility for "${locName}"`
              );
              throw new Error(`Snapshot unavailable for ${locName} check`);
            }
            // Create a location-specific snapshotInterface with the location as context
            const snapshotInterface = createStateSnapshotInterface(
              currentSnapshot,
              staticData,
              { location: locDef } // Pass the location definition as context
            );
            if (!snapshotInterface) {
              this.logCallback(
                'error',
                `Could not create snapshotInterface for "${locName}"`
              );
              throw new Error(
                `SnapshotInterface creation failed for ${locName} check`
              );
            }

            // Evaluate accessibility for locName
            const parentRegionName = locDef.parent_region_name || locDef.parent_region || locDef.region;
            const parentRegionReachabilityStatus =
              currentSnapshot.regionReachability?.[parentRegionName];
            const isParentRegionEffectivelyReachable =
              parentRegionReachabilityStatus === 'reachable' ||
              parentRegionReachabilityStatus === 'checked';

            const locationAccessRule = locDef.access_rule;
            let locationRuleEvalResult = true;
            if (locationAccessRule) {
              locationRuleEvalResult = evaluateRule(
                locationAccessRule,
                snapshotInterface
              );
            }
            const wasAccessible =
              isParentRegionEffectivelyReachable &&
              locationRuleEvalResult === true;

            // Check if already checked using the snapshot
            const isChecked = currentSnapshot.flags?.includes(locName);

            if (!wasAccessible && !isChecked) {
              this.logCallback(
                'error',
                `Log indicates checking "${locName}", but it was NOT accessible according to current logic!`
              );
              throw new Error(
                `Attempted to check inaccessible location: "${locName}"`
              );
            }

            // Log what item is at this location (for debugging)
            const itemAtLocation = locDef.item;
            const itemName =
              typeof itemAtLocation === 'object'
                ? itemAtLocation.name
                : itemAtLocation;

            if (itemName) {
              this.logCallback('info', `Location "${locName}" contains item: "${itemName}"`);
            }

            // Mark location as checked via event dispatcher instead of direct call
            // This will automatically add the item to inventory (addItems=true by default)
            // Use event-based flow to match how timer and UI modules interact with stateManager
            const locationRegion = locDef?.parent_region_name || locDef?.parent_region || locDef?.region || null;
            await this.checkLocationViaEvent(locName, locationRegion);
            this.logCallback('info', `Location "${locName}" marked as checked via event.`);
          }
        } else {
          this.logCallback(
            'error',
            `Invalid 'checked_location' event structure: ${JSON.stringify(
              event
            )}`
          );
        }
        break;

      default:
        this.logCallback('info', `Skipping unhandled event type: ${event.event}`);
        break;
    }

    if (!allChecksPassed) {
      this.logCallback(
        'error',
        `Test failed at step ${
          this.currentLogIndex + 1
        }: Comparison failed for event type '${eventType}'.`
      );
    }

    // Update previous inventory for next comparison
    if (eventType === 'state_update') {
      const sphereData = this._getSphereDataFromSphereState(this.currentLogIndex);
      if (sphereData) {
        const staticData = stateManager.getStaticData();
        const useResolvedItems = staticData?.settings?.[this.playerIdKey]?.use_resolved_items || false;

        if (useResolvedItems) {
          this.previousInventory = JSON.parse(JSON.stringify(sphereData.inventoryDetails?.resolved_items || {}));
        } else {
          this.previousInventory = JSON.parse(JSON.stringify(sphereData.inventoryDetails?.base_items || {}));
        }
      }
    }

    return {
      error: !allChecksPassed,
      message: `Comparison for ${eventType} at step ${
        this.currentLogIndex + 1
      } ${comparisonResult ? 'Passed' : 'Failed'}`,
      details: {
        eventType: eventType,
        eventIndex: this.currentLogIndex,
        sphereIndex: event.sphere_index !== undefined ? event.sphere_index : this.currentLogIndex + 1,
        playerId: this.playerId,
        newlyAddedItems: eventType === 'state_update' && newlyAddedItems.length > 0 ? newlyAddedItems : null
      }
    };
  }

  /**
   * Helper method to check a location via dispatcher event instead of direct call
   * This simulates the event-based flow used by timer and UI modules
   *
   * DATA FLOW:
   * Input: Location to check
   *   ├─> locationName: string
   *   ├─> regionName: string (optional, for event context)
   *   ├─> addItems: boolean (optional, whether to add item to inventory, defaults to true)
   *
   * Processing:
   *   ├─> Publish user:locationCheck event via dispatcher
   *   ├─> Wait for stateManager:snapshotUpdated event
   *   └─> Timeout after 5 seconds if no response
   *
   * Output: Location checked
   *   ├─> StateManager updated
   *   └─> Snapshot generated
   *
   * @param {string} locationName - Name of the location to check
   * @param {string} regionName - Name of the parent region (optional)
   * @param {boolean} addItems - Whether to add the item to inventory (defaults to true)
   */
  async checkLocationViaEvent(locationName, regionName = null, addItems = true) {
    // Directly call stateManager's checkLocation method instead of using events
    // This ensures we properly wait for the command to complete and get any errors
    // Note: stateManager is imported at the top of this file as stateManagerProxySingleton
    if (!stateManager) {
      this.logCallback('error', 'stateManager not available');
      throw new Error('stateManager not available');
    }

    try {
      // Call checkLocation and wait for it to complete
      // This will throw an error if the location check is rejected
      const result = await stateManager.checkLocation(locationName, addItems);

      // Wait a brief moment for the snapshot to stabilize
      await new Promise(resolve => setTimeout(resolve, 50));

      return result;
    } catch (error) {
      this.logCallback('error', `Failed to check location "${locationName}": ${error.message}`);
      throw error;
    }
  }

  /**
   * Get sphere data from sphereState module
   *
   * DATA FLOW:
   * Input: Sphere index
   *   ├─> sphereIndex: number
   *
   * Processing:
   *   ├─> Get getSphereData function from central registry
   *   ├─> Call getSphereData(sphereIndex)
   *   └─> Handle both verbose and incremental formats
   *
   * Output: Sphere data object
   *   ├─> inventoryDetails.base_items: Object
   *   ├─> accessibleLocations: Array<string>
   *   ├─> accessibleRegions: Array<string>
   *   └─> locations: Array<string> (locations in this sphere)
   *
   * @param {number} sphereIndex - The index of the current sphere being processed
   * @returns {Object|null} Sphere data with accumulated inventory/locations/regions
   * @private
   */
  _getSphereDataFromSphereState(sphereIndex) {
    try {
      if (!window.centralRegistry || typeof window.centralRegistry.getPublicFunction !== 'function') {
        this.logCallback('warn', 'centralRegistry not available for sphereState access');
        return null;
      }

      const getSphereData = window.centralRegistry.getPublicFunction('sphereState', 'getSphereData');
      if (!getSphereData) {
        this.logCallback('warn', 'sphereState getSphereData function not available');
        return null;
      }

      const allSpheres = getSphereData();
      if (!allSpheres || sphereIndex >= allSpheres.length) {
        this.logCallback('warn', `Sphere ${sphereIndex} not found in sphereState data`);
        return null;
      }

      return allSpheres[sphereIndex];
    } catch (error) {
      this.logCallback('error', `Error getting sphere data from sphereState: ${error.message}`);
      return null;
    }
  }

  /**
   * Finds newly added items since last sphere
   *
   * DATA FLOW:
   * Input: Previous and current inventory
   *   ├─> previousInventory: {itemName: count}
   *   ├─> currentInventory: {itemName: count}
   *
   * Processing:
   *   ├─> For each item in current inventory:
   *   │   ├─> Compare count with previous
   *   │   ├─> If count increased:
   *   │   │   └─> Add item N times (for each new instance)
   *
   * Output: Array of newly added items
   *   ├─> [itemName, itemName, ...] (duplicates for multiple instances)
   *
   * @param {Object} previousInventory - Previous inventory
   * @param {Object} currentInventory - Current inventory
   * @returns {Array<string>} Newly added item names (with duplicates for multiple instances)
   */
  findNewlyAddedItems(previousInventory, currentInventory) {
    const newlyAdded = [];

    for (const [itemName, currentCount] of Object.entries(currentInventory)) {
      const previousCount = previousInventory[itemName] || 0;
      if (currentCount > previousCount) {
        // Add entry for each additional count of the item
        const addedCount = currentCount - previousCount;
        for (let i = 0; i < addedCount; i++) {
          newlyAdded.push(itemName);
        }
      }
    }

    return newlyAdded;
  }

  /**
   * Processes multiworld locations from a sphere event
   *
   * Multiworld Processing Logic:
   * 1. Check the current player's sphere_locations (locations they own)
   * 2. Add cross-player items (items from other players' locations that go to current player)
   *
   * @param {Object} event - The raw sphere event with player_data
   * @param {Object} context - Context with sphere_number and player_id
   * @param {Object} stateManager - State manager instance
   * @private
   */
  async _processMultiworldLocations(event, context, stateManager) {
    const staticData = stateManager.getStaticData();

    // Get current player's data from the event
    // Note: player_data has string keys in JSON, so convert numeric playerId to string
    const playerIdKey = String(this.playerId);
    const currentPlayerData = event.player_data[playerIdKey];

    if (!currentPlayerData) {
      this.logCallback('warn', `No player_data found for player ${this.playerId} in sphere ${context.sphere_number}`);
      return;
    }

    const sphereLocations = currentPlayerData.sphere_locations || [];
    const inventoryDelta = currentPlayerData.new_inventory_details || currentPlayerData.inventory_details || {};
    const newItems = inventoryDelta.base_items || inventoryDelta.new_base_items || {};
    const resolvedItems = inventoryDelta.resolved_items || {};

    this.logCallback('info', `Processing multiworld sphere ${context.sphere_number} for player ${this.playerId}: ${sphereLocations.length} locations, ${Object.keys(newItems).length} new items, ${Object.keys(resolvedItems).length} resolved items`);

    // Step 1: Check the current player's locations
    for (const locationName of sphereLocations) {
      // Get location definition from static data
      const locationDef = staticData.locations.get(locationName);

      if (!locationDef) {
        this.logCallback('warn', `  Location "${locationName}" not found in static data for player ${this.playerId}`);
        continue;
      }

      const itemDef = locationDef.item;
      const itemName = itemDef?.name;

      this.logCallback('debug', `  [Player ${this.playerId}] Checking location: "${locationName}" (contains: ${itemName || 'no item'})`);

      // Verify accessibility before checking
      const currentSnapshot = await stateManager.getFullSnapshot();
      const snapshotInterface = createStateSnapshotInterface(currentSnapshot, stateManager.getStaticData());
      const isAccessible = snapshotInterface.isLocationAccessible(locationName);

      if (!isAccessible) {
        this.logCallback('error', `  ⚠️ PRE-CHECK FAILED: "${locationName}" is NOT accessible!`);
        this.logCallback('error', `    Current inventory: ${JSON.stringify(currentSnapshot.inventory)}`);
        throw new Error(`Pre-check accessibility mismatch for "${locationName}" in sphere ${context.sphere_number}`);
      }

      // Check the location
      // StateManager now automatically handles cross-player items (skips adding them to inventory)
      const locationRegion = locationDef?.parent_region_name || locationDef?.parent_region || locationDef?.region || null;
      await this.checkLocationViaEvent(locationName, locationRegion);
    }

    // Step 2: Add cross-player items (items we received from other players' locations)
    // These are items in our new_inventory_details that we didn't get from checking our own locations
    if (Object.keys(newItems).length > 0) {
      // Get snapshot to see what we currently have
      const beforeSnapshot = await stateManager.getFullSnapshot();
      const beforeInventory = beforeSnapshot.inventory || {};

      // Check each new item from the sphere log
      for (const [itemName, count] of Object.entries(newItems)) {
        const currentCount = beforeInventory[itemName] || 0;

        // Calculate how many of this item we should have received in this sphere
        const itemsToAdd = count;

        if (itemsToAdd > 0) {
          // Check if this item came from one of our own locations
          let fromOwnLocation = false;
          for (const locationName of sphereLocations) {
            const locationDef = staticData.locations.get(locationName);
            if (locationDef?.item?.name === itemName) {
              fromOwnLocation = true;
              break;
            }
          }

          // If not from own location, it's a cross-player item - add it
          if (!fromOwnLocation) {
            this.logCallback('info', `  [Player ${this.playerId}] Receiving ${itemsToAdd}x cross-player item: "${itemName}"`);
            for (let i = 0; i < itemsToAdd; i++) {
              await stateManager.addItemToInventory(itemName, 1);
            }
          }
        }
      }
    }

    // Step 3: Process resolved_items (behavior depends on game settings)
    // Check if this game wants to use resolved_items
    const useResolvedItems = staticData.settings?.[this.playerIdKey]?.use_resolved_items ?? false;

    if (useResolvedItems) {
      // Old logic: Process resolved_items for games that need them (e.g., Blasphemous)
      // These are items like "Received Progression Percent" that are computed automatically
      // Note: resolved_items contains DELTAS (new items in this sphere), not cumulative totals
      if (Object.keys(resolvedItems).length > 0) {
        for (const [itemName, deltaCount] of Object.entries(resolvedItems)) {
          // Skip if this item is already in base_items (we've already processed it)
          if (itemName in newItems) {
            continue;
          }

          // Check if this is an event item (virtual item computed by hooks)
          // In multiworld, staticData.items is keyed by player, so use itemsByPlayer if available
          const playerItems = staticData.itemsByPlayer?.[this.playerIdKey] || staticData.items;
          const itemDef = playerItems.get?.(itemName) || playerItems[itemName];
          if (itemDef && itemDef.event) {
            // Skip event items - they should be computed by game-specific hooks
            // (e.g., Stardew Valley's "Received Progression Percent")
            this.logCallback('debug', `  [Player ${this.playerId}] Skipping event item "${itemName}" (computed by hooks, not added directly)`);
            continue;
          }

          // deltaCount is the number of this item added in this sphere
          if (deltaCount > 0) {
            this.logCallback('info', `  [Player ${this.playerId}] Adding ${deltaCount}x virtual/event item: "${itemName}" (from resolved_items)`);
            for (let i = 0; i < deltaCount; i++) {
              await stateManager.addItemToInventory(itemName, 1);
            }
          }
        }
      }
    } else {
      // New logic (default): Skip resolved_items processing
      // For most games, resolved_items contains progressive item resolutions (e.g., "Titans Mitts")
      // These should NOT be added manually - they're computed automatically by stateManager's progression system
      // We skip processing resolved_items entirely to avoid conflicts with the automatic resolution
      if (this.verboseMode && Object.keys(resolvedItems).length > 0) {
        this.logCallback('debug', `  [Player ${this.playerId}] Skipping ${Object.keys(resolvedItems).length} resolved_items (handled by progression system): ${Object.keys(resolvedItems).join(', ')}`);
      }
    }

    if (this.verboseMode) {
      this.logCallback('info', `Multiworld sphere ${context.sphere_number} complete: checked ${sphereLocations.length} locations`);
    }
  }

  /**
   * Resets previous inventory tracking
   */
  resetInventoryTracking() {
    this.previousInventory = {};
    logger.debug('Previous inventory tracking reset');
  }

  /**
   * Gets current previous inventory state
   * @returns {Object} Current previous inventory
   */
  getPreviousInventory() {
    return this.previousInventory;
  }

  /**
   * Gets all mismatch details from the last processed event
   * Returns an array to capture both location AND region mismatches
   * @returns {Array<Object>} Array of mismatch details
   */
  getMismatchDetailsArray() {
    return this.currentEventMismatchDetails;
  }
}

export default EventProcessor;

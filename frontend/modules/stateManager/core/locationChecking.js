/**
 * Location Checking Module
 *
 * Handles location checking and item collection logic for StateManager.
 * This module manages:
 * - Location checking (marking locations as checked)
 * - Item collection from checked locations
 * - Auto-collection of event items configuration
 * - Checked location state management
 *
 * Data Flow:
 *
 * Location Checking (checkLocation):
 *   Input: Location name and options
 *     ├─> locationName: string (name of location to check)
 *     ├─> addItems: boolean (whether to add location's item to inventory)
 *
 *   Validation:
 *     ├─> Check if location already checked (reject if so)
 *     ├─> Check if location exists in locations map
 *     ├─> Check if location is accessible (reachable)
 *
 *   Processing (if accessible):
 *     ├─> Add location to checkedLocations set
 *     ├─> If addItems=true, add location's item to inventory
 *     ├─> Invalidate reachability cache
 *     ├─> Publish events for rejected/completed checks
 *
 *   Output:
 *     ├─> checkedLocations updated
 *     ├─> inventory updated (if addItems=true)
 *     ├─> snapshot sent to proxy
 *     ├─> events published (locationCheckRejected or implicit success)
 *
 * Auto-Collection Configuration:
 *   Input: enabled flag (boolean)
 *     ├─> true: Enable automatic collection of event items
 *     ├─> false: Disable auto-collection (manual only)
 *
 *   Processing:
 *     ├─> Update autoCollectEventsEnabled flag
 *     ├─> Invalidate reachability cache
 *     ├─> Send snapshot update
 *
 * Phase 5 Refactoring Notes:
 * - Extracted from stateManager.js to isolate event/location checking logic
 * - Maintains all existing APIs for compatibility
 * - Works with reachability module for accessibility checks
 * - Coordinates with inventory module for item addition
 *
 * @module stateManager/core/locationChecking
 */

// Module-level helper for logging
function log(level, message, ...data) {
  console[level === 'info' ? 'log' : level]?.(message, ...data);
}

/**
 * Checks if a location has been marked as checked
 *
 * @param {Object} sm - StateManager instance
 * @param {string} locationName - Name of the location to check
 * @returns {boolean} True if location is checked, false otherwise
 */
export function isLocationChecked(sm, locationName) {
  return sm.checkedLocations.has(locationName);
}

/**
 * Marks a location as checked and optionally adds its item to inventory
 *
 * @param {Object} sm - StateManager instance
 * @param {string} locationName - Name of the location to check
 * @param {boolean} addItems - Whether to add the location's item to inventory (default: true)
 */
export function checkLocation(sm, locationName, addItems = true) {
  let locationWasActuallyChecked = false;

  // First check if location is already checked
  if (sm.checkedLocations.has(locationName)) {
    sm._logDebug(`[StateManager Class] Location ${locationName} is already checked, ignoring.`);

    // Publish event to notify UI that location check was rejected due to already being checked
    sm._publishEvent('locationCheckRejected', {
      locationName: locationName,
      reason: 'already_checked'
    });
  } else {
    // Find the location data
    const location = sm.locations.get(locationName);
    if (!location) {
      sm._logDebug(`[StateManager Class] Location ${locationName} not found in locations data.`);

      // Publish event to notify UI that location check was rejected due to location not found
      sm._publishEvent('locationCheckRejected', {
        locationName: locationName,
        reason: 'location_not_found'
      });
    } else {
      // Validate that the location is accessible before checking
      if (!sm.isLocationAccessible(location)) {
        sm._logDebug(`[StateManager Class] Location ${locationName} is not accessible, cannot check.`);

        // Publish event to notify UI that location check was rejected due to inaccessibility
        sm._publishEvent('locationCheckRejected', {
          locationName: locationName,
          reason: 'not_accessible'
        });
      } else {
        // Location is accessible, proceed with checking
        sm.checkedLocations.add(locationName);
        sm._logDebug(`[StateManager Class] Checked location: ${locationName}`);
        locationWasActuallyChecked = true;

        // Grant item from location (if addItems is true)
        if (addItems && location && location.item && typeof location.item.name === 'string') {
          sm._logDebug(
            `[StateManager Class] Location ${locationName} contains item: ${location.item.name}`
          );
          // In spoiler test mode, only add advancement items to inventory (matching Python's CollectionState behavior)
          // Python's state.count() only counts items where location.item.advancement is true
          // In normal gameplay, add all items
          const shouldAddItem = !sm.spoilerTestMode || location.item.advancement !== false;

          if (shouldAddItem) {
            sm._addItemToInventory(location.item.name, 1);
            sm._logDebug(
              `[StateManager Class] Added ${location.item.name} to inventory.`
            );
          } else {
            sm._logDebug(
              `[StateManager Class] Skipping ${location.item.name} - non-advancement item in spoiler test mode (advancement=${location.item.advancement}).`
            );
          }
          // Potentially trigger an event for item acquisition if needed by other systems
          // sm._publishEvent('itemAcquired', { itemName: location.item.name, locationName });
        } else if (addItems && location && location.item) {
          sm._logDebug(
            `[StateManager Class] Location ${locationName} has an item, but item.name is not a string: ${JSON.stringify(
              location.item
            )}`
          );
        } else if (addItems) {
          sm._logDebug(
            `[StateManager Class] Location ${locationName} has no item or location data is incomplete.`
          );
        } else {
          sm._logDebug(
            `[StateManager Class] Location ${locationName} marked as checked without adding items (addItems=false).`
          );
        }

        sm.invalidateCache();
      }
    }
  }

  // Always send a snapshot update so the UI knows the operation completed
  // This ensures pending states are cleared even if the location wasn't actually checked
  sm._sendSnapshotUpdate();
}

/**
 * Clears all checked locations
 *
 * @param {Object} sm - StateManager instance
 * @param {Object} options - Options object
 * @param {boolean} options.sendUpdate - Whether to send snapshot update (default: true)
 */
export function clearCheckedLocations(sm, options = { sendUpdate: true }) {
  if (sm.checkedLocations && sm.checkedLocations.size > 0) {
    // Ensure checkedLocations exists
    sm.checkedLocations.clear();
    sm._logDebug('[StateManager Class] Cleared checked locations.');
    sm._publishEvent('checkedLocationsCleared');
    if (options.sendUpdate) {
      sm._sendSnapshotUpdate();
    }
  } else if (!sm.checkedLocations) {
    sm.checkedLocations = new Set(); // Initialize if it was null/undefined
  }
}

/**
 * Configures auto-collection of event items
 *
 * @param {Object} sm - StateManager instance
 * @param {boolean} enabled - Whether to enable auto-collection of event items
 */
export function setAutoCollectEventsConfig(sm, enabled) {
  sm.autoCollectEventsEnabled = enabled;
  sm.logger.info(
    'StateManager',
    `Setting autoCollectEventsEnabled to: ${enabled}`
  );
  // If disabling, it might be necessary to re-evaluate reachability without auto-collection.
  // For testing, this is usually paired with a state clear/reset before tests.
  // If enabling, a re-computation might pick up pending events.
  sm.invalidateCache(); // Invalidate cache as this changes a core behavior
  sm._sendSnapshotUpdate(); // Send update if state might have changed due to this setting
}

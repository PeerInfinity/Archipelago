import { evaluateRule } from '../ruleEngine.js'; // Adjusted path

export class GameSnapshotHelpers {
  constructor(snapshotInterface) {
    if (!snapshotInterface) {
      throw new Error(
        'GameSnapshotHelpers requires a SnapshotInterface instance.'
      );
    }
    this.snapshot = snapshotInterface;
    // console.log('[GameSnapshotHelpers] Initialized with SnapshotInterface:', snapshotInterface);
  }

  // --- Internal Accessor Helpers (Snapshot Context) ---
  // These methods access data via the snapshotInterface and must handle 'undefined'
  // if the snapshot data is incomplete or the interface method itself returns undefined.

  _hasItem(itemName) {
    // Snapshot interface's hasItem should return true, false, or undefined.
    return this.snapshot.hasItem(itemName);
  }

  _countItem(itemName) {
    return this.snapshot.countItem(itemName);
  }

  _countGroup(groupName) {
    return this.snapshot.countGroup(groupName);
  }

  _hasFlag(flagName) {
    return this.snapshot.hasFlag(flagName);
  }

  _getSetting(settingName, defaultValue = undefined) {
    const value = this.snapshot.getSetting(settingName);
    return value !== undefined ? value : defaultValue;
  }

  _getGameMode() {
    return this.snapshot.getGameMode();
  }

  _isRegionReachable(regionName) {
    // Snapshot reachability is inherently limited and might be unknown.
    return this.snapshot.isRegionReachable(regionName);
  }

  _isLocationAccessible(locationOrName) {
    return this.snapshot.isLocationAccessible(locationOrName);

    // 'this.snapshot' is the snapshotInterface instance passed to the constructor.
    // It should provide access to staticData.
    if (typeof locationOrName !== 'string') {
      console.warn(
        '[GameSnapshotHelpers._isLocationAccessible] Expected locationOrName to be a string, got:',
        locationOrName
      );
      return false;
    }
    const locationName = locationOrName;

    if (
      !this.snapshot.staticData ||
      !this.snapshot.staticData.locations ||
      !this.snapshot.staticData.locations[locationName]
    ) {
      console.warn(
        `[GameSnapshotHelpers._isLocationAccessible] Location '${locationName}' not found in staticData.`
      );
      return false;
    }
    const locationData = this.snapshot.staticData.locations[locationName];

    if (!locationData.access_rule) {
      // Default behavior: if no access_rule, assume accessible.
      // This might need to be adjusted based on specific game logic (e.g., depends on region accessibility only).
      // console.log(`[GameSnapshotHelpers._isLocationAccessible] Location '${locationName}' has no access_rule, assuming accessible.`);
      return true;
    }

    try {
      // Pass the snapshotInterface (this.snapshot) as the context for rule evaluation.
      return evaluateRule(locationData.access_rule, this.snapshot);
    } catch (e) {
      console.error(
        `[GameSnapshotHelpers._isLocationAccessible] Error evaluating access rule for '${locationName}':`,
        e,
        locationData.access_rule
      );
      return false; // Treat rule evaluation errors as inaccessible
    }
  }

  _getPlayerSlot() {
    return this.snapshot.getPlayerSlot();
  }

  _getDifficultyRequirements() {
    return this.snapshot.getDifficultyRequirements();
  }

  _getShops() {
    return this.snapshot.getShops();
  }

  _getRegionData(regionName) {
    // Snapshot interface might get this from its cached staticData.
    return this.snapshot.getRegionData(regionName);
  }

  _getStateValue(pathString) {
    if (typeof pathString !== 'string') {
      console.warn('[_getStateValue] pathString must be a string.');
      return undefined;
    }
    if (!this.snapshot || typeof this.snapshot.getStateValue !== 'function') {
      console.warn('[_getStateValue] snapshot.getStateValue is not available.');
      return undefined;
    }
    // Delegate to the snapshotInterface's own method for this complex lookup
    return this.snapshot.getStateValue(pathString);
  }

  _getLocationItem(locationName) {
    if (!this.snapshot || typeof this.snapshot.getLocationItem !== 'function') {
      console.warn(
        '[_getLocationItem] snapshot.getLocationItem is not available.'
      );
      return undefined;
    }
    return this.snapshot.getLocationItem(locationName);
  }

  // --- Utility Helpers ---
  len(obj) {
    if (obj == null) {
      return 0;
    }
    if (Array.isArray(obj)) {
      return obj.length;
    }
    if (typeof obj === 'string') {
      return obj.length;
    }
    if (typeof obj === 'object') {
      return Object.keys(obj).length;
    }
    return 0;
  }

  getattr(obj, attr) {
    if (obj == null || typeof obj !== 'object') {
      // console.warn('[getattr snapshot] Target is null, undefined, or not an object.', { obj, attr });
      return undefined;
    }
    // console.log('[getattr snapshot] Accessing:', { obj, attr, val: obj[attr] });
    return obj[attr];
  }

  zip(...arrays) {
    if (!arrays || arrays.length === 0) {
      return [];
    }
    // Ensure all inputs are arrays, treat non-arrays as empty for length calculation
    const validatedArrays = arrays.map((arr) =>
      Array.isArray(arr) ? arr : []
    );

    if (validatedArrays.some((arr) => !Array.isArray(arr))) {
      // This case should ideally not be hit if all inputs are validated to arrays
    }

    const minLength = Math.min(...validatedArrays.map((arr) => arr.length));

    const result = [];
    for (let i = 0; i < minLength; i++) {
      result.push(validatedArrays.map((arr) => arr[i]));
    }
    return result;
  }

  // Generic executeHelper - game-specific helpers will override or define methods.
  executeHelper(name, ...args) {
    if (typeof this[name] === 'function') {
      try {
        // The called helper method is responsible for returning true/false/undefined.
        return this[name](...args);
      } catch (e) {
        console.error(
          `[GameSnapshotHelpers] Error executing helper ${name}:`,
          e
        );
        return undefined; // On error in snapshot helper, result is unknown.
      }
    }
    console.warn(`[GameSnapshotHelpers] Helper ${name} not found.`);
    return undefined; // Helper not found, result is unknown.
  }
}

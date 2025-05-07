export class GameWorkerHelpers {
  constructor(manager) {
    if (!manager) {
      throw new Error('GameWorkerHelpers requires a StateManager instance.');
    }
    this.manager = manager;
    // console.log('[GameWorkerHelpers] Initialized with StateManager:', manager);
  }

  // --- Internal Accessor Helpers (Worker Context) ---

  _hasItem(itemName) {
    return this.manager.inventory?.has(itemName) || false;
  }

  _countItem(itemName) {
    return this.manager.inventory?.count(itemName) || 0;
  }

  _countGroup(groupName) {
    return this.manager.inventory?.countGroup(groupName) || 0;
  }

  _hasFlag(flagName) {
    // Assuming StateManager's state object has hasFlag, or it's on StateManager directly
    return (
      this.manager.state?.hasFlag(flagName) ||
      this.manager.checkedLocations?.has(flagName) ||
      false
    );
  }

  _getSetting(settingName, defaultValue = undefined) {
    return this.manager.settings?.[settingName] ?? defaultValue;
  }

  _getGameMode() {
    return this.manager.mode;
  }

  _isRegionReachable(regionName) {
    // This typically involves complex logic, relying on StateManager's core method
    return this.manager.isRegionReachable(regionName);
  }

  _isLocationAccessible(locationOrName) {
    // StateManager expects the location object or can resolve by name
    const location =
      typeof locationOrName === 'string'
        ? this.manager.locations?.find((l) => l.name === locationOrName) // Ensure locations array exists
        : locationOrName;
    return location ? this.manager.isLocationAccessible(location) : false;
  }

  _getPlayerSlot() {
    return this.manager.playerSlot;
  }

  _getDifficultyRequirements() {
    return this.manager.state?.difficultyRequirements;
  }

  _getShops() {
    return this.manager.state?.shops;
  }

  _getRegionData(regionName) {
    return this.manager.getRegionData(regionName);
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
      // console.warn('[getattr] Target is null, undefined, or not an object.', { obj, attr });
      return undefined;
    }
    // console.log('[getattr] Accessing:', { obj, attr, val: obj[attr] });
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
      // but as a safeguard or if mixed types were intended to be filtered:
      // console.warn('[zip] Non-array input detected after validation attempt, result may be unexpected.');
    }

    const minLength = Math.min(...validatedArrays.map((arr) => arr.length));

    const result = [];
    for (let i = 0; i < minLength; i++) {
      result.push(validatedArrays.map((arr) => arr[i]));
    }
    return result;
  }

  // Generic executeHelper - game-specific helpers will override this if they have their own executeHelper logic
  // or simply define methods that this dispatcher calls.
  executeHelper(name, ...args) {
    if (typeof this[name] === 'function') {
      try {
        return this[name](...args);
      } catch (e) {
        console.error(`[GameWorkerHelpers] Error executing helper ${name}:`, e);
        throw e;
      }
    }
    console.warn(`[GameWorkerHelpers] Helper ${name} not found.`);
    return false;
  }
}

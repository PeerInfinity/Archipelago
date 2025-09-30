// sphereState.js - Core sphere state management

import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('sphereState', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[sphereState] ${message}`, ...data);
  }
}

/**
 * Parses a sphere index string into integer and fractional components
 * @param {string|number} sphereIndex - The sphere index (e.g., "1.5", 0, "2.10")
 * @returns {{integerSphere: number, fractionalSphere: number, sphereIndex: string}}
 */
function parseSphereIndex(sphereIndex) {
  const indexStr = String(sphereIndex);
  const [intPart, fracPart] = indexStr.split('.');
  const integerSphere = parseInt(intPart, 10);
  const fractionalSphere = fracPart ? parseInt(fracPart, 10) : 0;

  // Validation
  if (isNaN(integerSphere) || integerSphere < 0) {
    log('warn', `Invalid integer sphere in index "${sphereIndex}": ${intPart}`);
  }
  if (fracPart && (isNaN(fractionalSphere) || fractionalSphere < 0)) {
    log('warn', `Invalid fractional sphere in index "${sphereIndex}": ${fracPart}`);
  }
  if (fractionalSphere > 999) {
    log('warn', `Unusually large fractional sphere: ${fractionalSphere} in index "${sphereIndex}"`);
  }

  return {
    sphereIndex: indexStr,
    integerSphere,
    fractionalSphere
  };
}

/**
 * Compares two sphere indices
 * @returns {number} -1 if a < b, 0 if equal, 1 if a > b
 */
function compareSphereIndices(a, b) {
  if (a.integerSphere !== b.integerSphere) {
    return a.integerSphere - b.integerSphere;
  }
  return a.fractionalSphere - b.fractionalSphere;
}

export class SphereState {
  constructor(eventBus) {
    this.eventBus = eventBus;
    this.sphereData = []; // Array of parsed sphere entries
    this.currentPlayerId = null;
    this.currentSphere = null; // {integerSphere, fractionalSphere, isComplete}
    this.sphereLogPath = null;
  }

  /**
   * Reset all sphere state
   */
  reset() {
    log('info', 'Resetting sphere state');
    this.sphereData = [];
    this.currentSphere = null;
    this.sphereLogPath = null;
    // Don't reset currentPlayerId as it comes from static data

    if (this.eventBus) {
      this.eventBus.publish('sphereState:dataCleared', {}, 'sphereState');
    }
  }

  /**
   * Load sphere log from a file path
   * @param {string} filePath - Path to the sphere log JSONL file
   */
  async loadSphereLog(filePath) {
    log('info', `Loading sphere log from: ${filePath}`);

    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();
      this.parseSphereLog(text);
      this.sphereLogPath = filePath;

      log('info', `Successfully loaded ${this.sphereData.length} sphere entries`);

      if (this.eventBus) {
        this.eventBus.publish('sphereState:dataLoaded', {
          sphereCount: this.sphereData.length,
          filePath
        }, 'sphereState');
      }

      // Calculate initial current sphere
      this.updateCurrentSphere();

      return true;
    } catch (error) {
      log('error', `Failed to load sphere log from ${filePath}:`, error);
      return false;
    }
  }

  /**
   * Parse sphere log JSONL content
   * @param {string} jsonlText - The JSONL content
   */
  parseSphereLog(jsonlText) {
    const lines = jsonlText.trim().split('\n');
    this.sphereData = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);

        if (entry.type !== 'state_update') {
          log('warn', `Unexpected entry type at line ${i + 1}: ${entry.type}`);
          continue;
        }

        const parsed = parseSphereIndex(entry.sphere_index);

        // Extract data for current player
        const playerData = entry.player_data?.[String(this.currentPlayerId)];
        if (!playerData && this.currentPlayerId) {
          log('warn', `No data for player ${this.currentPlayerId} in sphere ${parsed.sphereIndex}`);
        }

        this.sphereData.push({
          ...parsed,
          locations: entry.sphere_locations || [],
          accessibleLocations: playerData?.accessible_locations || [],
          accessibleRegions: playerData?.accessible_regions || [],
          inventoryDetails: playerData?.inventory_details || { prog_items: {}, non_prog_items: {} }
        });
      } catch (error) {
        log('error', `Failed to parse line ${i + 1}:`, error);
      }
    }

    // Sort by sphere index
    this.sphereData.sort(compareSphereIndices);

    log('info', `Parsed ${this.sphereData.length} sphere entries`);
  }

  /**
   * Set the current player ID
   * @param {string|number} playerId
   */
  setCurrentPlayerId(playerId) {
    const newId = String(playerId);
    if (this.currentPlayerId !== newId) {
      log('info', `Setting current player ID to: ${newId}`);
      this.currentPlayerId = newId;

      // If we have sphere data, re-filter it for the new player
      if (this.sphereLogPath) {
        // Trigger reload to re-filter for new player
        this.loadSphereLog(this.sphereLogPath);
      }
    }
  }

  /**
   * Get current player ID from static data
   */
  updatePlayerIdFromStaticData() {
    const staticData = stateManager.getStaticData();

    // Try player field first
    if (staticData?.player) {
      this.setCurrentPlayerId(staticData.player);
      return staticData.player;
    }

    // Try player_names field - get first player
    if (staticData?.player_names) {
      const playerIds = Object.keys(staticData.player_names);
      if (playerIds.length > 0) {
        const playerId = playerIds[0];
        this.setCurrentPlayerId(playerId);
        return playerId;
      }
    }

    return null;
  }

  /**
   * Update current sphere based on checked locations
   */
  updateCurrentSphere() {
    const snapshot = stateManager.getLatestStateSnapshot();
    if (!snapshot || !this.sphereData.length) {
      this.currentSphere = null;
      return;
    }

    const checkedLocations = new Set(snapshot.checkedLocations || []);

    // Find first sphere with unchecked locations
    for (const sphere of this.sphereData) {
      const hasUncheckedLocation = sphere.locations.some(loc => !checkedLocations.has(loc));

      if (hasUncheckedLocation) {
        const newCurrent = {
          integerSphere: sphere.integerSphere,
          fractionalSphere: sphere.fractionalSphere,
          sphereIndex: sphere.sphereIndex,
          isComplete: false
        };

        // Check if current sphere changed
        const changed = !this.currentSphere ||
          this.currentSphere.integerSphere !== newCurrent.integerSphere ||
          this.currentSphere.fractionalSphere !== newCurrent.fractionalSphere;

        this.currentSphere = newCurrent;

        if (changed && this.eventBus) {
          log('info', `Current sphere changed to: ${newCurrent.sphereIndex}`);
          this.eventBus.publish('sphereState:currentSphereChanged', newCurrent, 'sphereState');
        }

        return;
      }
    }

    // All spheres complete
    if (this.sphereData.length > 0) {
      const lastSphere = this.sphereData[this.sphereData.length - 1];
      this.currentSphere = {
        integerSphere: lastSphere.integerSphere,
        fractionalSphere: lastSphere.fractionalSphere,
        sphereIndex: lastSphere.sphereIndex,
        isComplete: true
      };

      log('info', 'All spheres complete');

      if (this.eventBus) {
        this.eventBus.publish('sphereState:allSpheresComplete', this.currentSphere, 'sphereState');
      }
    }
  }

  // ===== Public API Methods =====

  /**
   * Get all sphere data
   */
  getSphereData() {
    return this.sphereData;
  }

  /**
   * Get current sphere info
   */
  getCurrentSphere() {
    return this.currentSphere;
  }

  /**
   * Get current integer sphere
   */
  getCurrentIntegerSphere() {
    return this.currentSphere?.integerSphere ?? null;
  }

  /**
   * Get current fractional sphere
   */
  getCurrentFractionalSphere() {
    return this.currentSphere?.fractionalSphere ?? null;
  }

  /**
   * Get checked locations from snapshot
   */
  getCheckedLocations() {
    const snapshot = stateManager.getLatestStateSnapshot();
    return snapshot?.checkedLocations || [];
  }

  /**
   * Check if a location is checked
   */
  isLocationChecked(locationName) {
    const checked = this.getCheckedLocations();
    return checked.includes(locationName);
  }

  /**
   * Get accessible locations up to current sphere
   */
  getAccessibleLocations() {
    if (!this.currentSphere || !this.sphereData.length) {
      return [];
    }

    // Find all spheres up to and including current
    const locations = new Set();
    for (const sphere of this.sphereData) {
      const comp = compareSphereIndices(sphere, this.currentSphere);
      if (comp <= 0) {
        sphere.locations.forEach(loc => locations.add(loc));
      } else {
        break;
      }
    }

    return Array.from(locations);
  }

  /**
   * Get accessible regions up to current sphere
   */
  getAccessibleRegions() {
    if (!this.currentSphere || !this.sphereData.length) {
      return [];
    }

    // The latest sphere entry up to current should have all accumulated accessible regions
    let latestSphere = null;
    for (const sphere of this.sphereData) {
      const comp = compareSphereIndices(sphere, this.currentSphere);
      if (comp <= 0) {
        latestSphere = sphere;
      } else {
        break;
      }
    }

    return latestSphere?.accessibleRegions || [];
  }

  /**
   * Check if a specific sphere is complete
   */
  isSphereComplete(integerSphere, fractionalSphere) {
    const sphere = this.getSphereByIndex(integerSphere, fractionalSphere);
    if (!sphere) return false;

    const checkedLocations = new Set(this.getCheckedLocations());
    return sphere.locations.every(loc => checkedLocations.has(loc));
  }

  /**
   * Check if an integer sphere is complete
   */
  isIntegerSphereComplete(integerSphere) {
    const spheres = this.getAllSpheresForInteger(integerSphere);
    if (!spheres.length) return false;

    return spheres.every(sphere =>
      this.isSphereComplete(sphere.integerSphere, sphere.fractionalSphere)
    );
  }

  /**
   * Get sphere by index
   */
  getSphereByIndex(integerSphere, fractionalSphere) {
    return this.sphereData.find(s =>
      s.integerSphere === integerSphere && s.fractionalSphere === fractionalSphere
    );
  }

  /**
   * Get all spheres for an integer sphere
   */
  getAllSpheresForInteger(integerSphere) {
    return this.sphereData.filter(s => s.integerSphere === integerSphere);
  }

  /**
   * Get current player ID
   */
  getCurrentPlayerId() {
    return this.currentPlayerId;
  }
}

export default SphereState;
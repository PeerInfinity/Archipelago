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
    this.logFormat = null; // 'verbose' or 'incremental'
    this.rawData = []; // Raw sphere log entries for multiworld support
    this.focusedMode = false; // True if this is a focused regression test log
    this.focusLocations = []; // Locations to focus on (only check these in focused mode)
    this.logHeader = null; // Header metadata from log_header event
  }

  /**
   * Reset all sphere state
   */
  reset() {
    log('info', 'Resetting sphere state');
    this.sphereData = [];
    this.rawData = [];
    this.currentSphere = null;
    this.sphereLogPath = null;
    this.logFormat = null;
    this.focusedMode = false;
    this.focusLocations = [];
    this.logHeader = null;
    // Don't reset currentPlayerId as it comes from static data

    if (this.eventBus) {
      this.eventBus.publish('sphereState:dataCleared', {}, 'sphereState');
    }
  }

  /**
   * Load sphere log from a file path or pre-loaded content
   * @param {string} filePath - Path to the sphere log JSONL file (used for display/reference)
   * @param {string} [preloadedContent] - Optional pre-loaded JSONL text content. If provided, skips fetch.
   */
  async loadSphereLog(filePath, preloadedContent = null) {
    log('info', `Loading sphere log from: ${filePath}${preloadedContent ? ' (pre-loaded content)' : ''}`);

    try {
      let text;
      if (preloadedContent) {
        // Use pre-loaded content directly
        text = preloadedContent;
      } else {
        // Fetch from file path
        const response = await fetch(filePath);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        text = await response.text();
      }

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
   * Detect the format of the sphere log (verbose or incremental)
   * @param {object} firstEntry - First valid entry from the log
   * @returns {string} 'verbose', 'incremental', or 'unknown'
   */
  _detectFormat(firstEntry) {
    if (!firstEntry || !firstEntry.player_data) {
      return 'unknown';
    }

    const firstPlayerData = Object.values(firstEntry.player_data)[0];
    if (!firstPlayerData) {
      return 'unknown';
    }

    if (firstPlayerData.inventory_details !== undefined) {
      return 'verbose';
    } else if (firstPlayerData.new_inventory_details !== undefined) {
      return 'incremental';
    }

    return 'unknown';
  }

  /**
   * Merge inventory details (for incremental format accumulation)
   * @param {object} accumulated - Accumulated inventory
   * @param {object} delta - Delta to add
   * @returns {object} Merged inventory
   */
  _mergeInventory(accumulated, delta) {
    const result = {
      base_items: { ...accumulated.base_items },
      resolved_items: { ...accumulated.resolved_items }
    };

    // Merge base_items
    for (const [itemName, count] of Object.entries(delta.base_items || {})) {
      result.base_items[itemName] = (result.base_items[itemName] || 0) + count;
    }

    // Merge resolved_items
    for (const [itemName, count] of Object.entries(delta.resolved_items || {})) {
      result.resolved_items[itemName] = (result.resolved_items[itemName] || 0) + count;
    }

    return result;
  }

  /**
   * Parse sphere log JSONL content
   * @param {string} jsonlText - The JSONL content
   */
  parseSphereLog(jsonlText) {
    const lines = jsonlText.trim().split('\n');
    this.sphereData = [];
    this.focusedMode = false;
    this.focusLocations = [];
    this.logHeader = null;

    // Parse all entries first
    const entries = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);

        // Handle log_header event (for focused regression tests)
        if (entry.type === 'log_header') {
          this.logHeader = entry;
          if (entry.focused_mode) {
            this.focusedMode = true;
            this.focusLocations = entry.focus_locations || [];
            log('info', `Detected focused mode log. Focus locations: ${this.focusLocations.join(', ')}`);
            if (entry.description) {
              log('info', `Log description: ${entry.description}`);
            }
          }
          continue; // Don't add header to entries
        }

        if (entry.type !== 'state_update') {
          log('warn', `Unexpected entry type at line ${i + 1}: ${entry.type}`);
          continue;
        }
        entries.push(entry);
      } catch (error) {
        log('error', `Failed to parse line ${i + 1}:`, error);
      }
    }

    if (entries.length === 0) {
      log('warn', 'No valid entries found in sphere log');
      return;
    }

    // Store raw data for multiworld support
    this.rawData = entries;

    // Detect format
    this.logFormat = this._detectFormat(entries[0]);
    log('info', `Detected sphere log format: ${this.logFormat}`);

    if (this.logFormat === 'incremental') {
      this._parseIncrementalFormat(entries);
    } else if (this.logFormat === 'verbose') {
      this._parseVerboseFormat(entries);
    } else {
      log('error', 'Unknown sphere log format, attempting verbose parse');
      this._parseVerboseFormat(entries);
    }

    // Sort by sphere index
    this.sphereData.sort(compareSphereIndices);

    log('info', `Parsed ${this.sphereData.length} sphere entries (${this.logFormat} format)`);
  }

  /**
   * Parse verbose format entries
   * @param {array} entries - Array of parsed JSONL entries
   */
  _parseVerboseFormat(entries) {
    for (const entry of entries) {
      const parsed = parseSphereIndex(entry.sphere_index);

      // Extract data for current player
      const playerData = entry.player_data?.[String(this.currentPlayerId)];
      if (!playerData && this.currentPlayerId) {
        log('warn', `No data for player ${this.currentPlayerId} in sphere ${parsed.sphereIndex}`);
      }

      // sphere_locations can be in player_data (new format) or at top level (old format)
      const sphereLocations = playerData?.sphere_locations || entry.sphere_locations || [];

      this.sphereData.push({
        ...parsed,
        locations: sphereLocations,
        accessibleLocations: playerData?.accessible_locations || [],
        accessibleRegions: playerData?.accessible_regions || [],
        inventoryDetails: playerData?.inventory_details || { base_items: {}, resolved_items: {} }
      });
    }
  }

  /**
   * Parse incremental format entries and accumulate deltas
   * @param {array} entries - Array of parsed JSONL entries
   */
  _parseIncrementalFormat(entries) {
    // Track accumulated state separately for fractional and integer spheres
    const fractionalAccumulated = {
      inventoryDetails: { base_items: {}, resolved_items: {} },
      accessibleLocations: new Set(),
      accessibleRegions: new Set()
    };

    const integerAccumulated = {
      inventoryDetails: { base_items: {}, resolved_items: {} },
      accessibleLocations: new Set(),
      accessibleRegions: new Set()
    };

    for (const entry of entries) {
      const parsed = parseSphereIndex(entry.sphere_index);
      const playerData = entry.player_data?.[String(this.currentPlayerId)];

      if (!playerData && this.currentPlayerId) {
        log('warn', `No data for player ${this.currentPlayerId} in sphere ${parsed.sphereIndex}`);
        continue;
      }

      const isSphereZero = parsed.sphereIndex === '0';
      const isFractional = parsed.sphereIndex.includes('.');

      // Get deltas from the entry
      const deltaInventory = playerData?.new_inventory_details || { base_items: {}, resolved_items: {} };
      const deltaLocations = playerData?.new_accessible_locations || [];
      const deltaRegions = playerData?.new_accessible_regions || [];

      let accumulated;

      if (isSphereZero) {
        // Sphere 0 initializes both trackers
        fractionalAccumulated.inventoryDetails = { ...deltaInventory };
        fractionalAccumulated.accessibleLocations = new Set(deltaLocations);
        fractionalAccumulated.accessibleRegions = new Set(deltaRegions);

        integerAccumulated.inventoryDetails = { ...deltaInventory };
        integerAccumulated.accessibleLocations = new Set(deltaLocations);
        integerAccumulated.accessibleRegions = new Set(deltaRegions);

        accumulated = fractionalAccumulated;
      } else if (isFractional) {
        // Accumulate onto fractional tracker
        fractionalAccumulated.inventoryDetails = this._mergeInventory(
          fractionalAccumulated.inventoryDetails,
          deltaInventory
        );
        deltaLocations.forEach(loc => fractionalAccumulated.accessibleLocations.add(loc));
        deltaRegions.forEach(reg => fractionalAccumulated.accessibleRegions.add(reg));

        accumulated = fractionalAccumulated;
      } else {
        // Accumulate onto integer tracker
        integerAccumulated.inventoryDetails = this._mergeInventory(
          integerAccumulated.inventoryDetails,
          deltaInventory
        );
        deltaLocations.forEach(loc => integerAccumulated.accessibleLocations.add(loc));
        deltaRegions.forEach(reg => integerAccumulated.accessibleRegions.add(reg));

        accumulated = integerAccumulated;
      }

      // sphere_locations can be in player_data (new format) or at top level (old format)
      const sphereLocations = playerData?.sphere_locations || entry.sphere_locations || [];

      // Store the accumulated state in sphereData
      this.sphereData.push({
        ...parsed,
        locations: sphereLocations,
        accessibleLocations: Array.from(accumulated.accessibleLocations).sort(),
        accessibleRegions: Array.from(accumulated.accessibleRegions).sort(),
        inventoryDetails: { ...accumulated.inventoryDetails }
      });
    }
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

    // For multiworld: Try game_info field to identify this player's rules file
    // In multiworld, game_info has a single key matching the player ID
    if (staticData?.game_info) {
      const gameInfoKeys = Object.keys(staticData.game_info);
      if (gameInfoKeys.length === 1) {
        const playerId = gameInfoKeys[0];
        log('info', `Detected multiworld player ID from game_info: ${playerId}`);
        this.setCurrentPlayerId(playerId);
        return playerId;
      }
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
   * Get multiworld sphere data with locations from all players
   * Returns sphere data augmented with cross-player location information
   * @returns {Array} Array of sphere objects with allPlayersLocations field
   */
  getMultiworldSphereData() {
    if (!this.rawData || !this.rawData.length) {
      return this.sphereData;
    }

    // Map to store locations by sphere index for all players
    const sphereMap = new Map();

    // Process raw data to extract all players' locations per sphere
    for (const entry of this.rawData) {
      if (!entry.sphere_index || !entry.player_data) {
        continue;
      }

      const sphereIndex = entry.sphere_index;

      if (!sphereMap.has(sphereIndex)) {
        sphereMap.set(sphereIndex, {});
      }

      const sphereEntry = sphereMap.get(sphereIndex);

      // Extract locations for each player
      for (const [playerId, playerData] of Object.entries(entry.player_data)) {
        const locations = playerData.sphere_locations || [];
        if (locations.length > 0) {
          if (!sphereEntry[playerId]) {
            sphereEntry[playerId] = [];
          }
          sphereEntry[playerId].push(...locations);
        }
      }
    }

    // Augment existing sphere data with cross-player locations
    return this.sphereData.map(sphere => {
      const allPlayersLocations = sphereMap.get(sphere.sphereIndex) || {};
      return {
        ...sphere,
        allPlayersLocations // Object keyed by playerId with arrays of location names
      };
    });
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

  /**
   * Check if focused mode is active
   * @returns {boolean} True if this is a focused regression test log
   */
  isFocusedMode() {
    return this.focusedMode;
  }

  /**
   * Get the locations to focus on in focused mode
   * @returns {Array<string>} Array of location names to focus on
   */
  getFocusLocations() {
    return this.focusLocations;
  }

  /**
   * Get the log header metadata
   * @returns {Object|null} Header metadata or null
   */
  getLogHeader() {
    return this.logHeader;
  }
}

export default SphereState;
/**
 * Cost Data Manager for Loop Mode
 *
 * Manages loading, caching, and access to cost data files.
 * Cost data contains per-region and per-location mana costs used by the
 * queue analyzer and loop simulation.
 *
 * Cost data can be:
 * - Generated from sphere logs using CostGenerator
 * - Loaded from pre-generated JSON files
 * - Cached in memory for performance
 */

import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('costDataManager');

/**
 * CostDataManager class
 * Loads and manages cost data for loop mode
 */
export class CostDataManager {
  constructor(eventBus = null) {
    this.eventBus = eventBus;

    // Currently loaded cost data
    this.costData = null;

    // Metadata about loaded data
    this.loadedFrom = null;
    this.loadedAt = null;

    // Loading state
    this.isLoading = false;
    this.loadError = null;
  }

  /**
   * Load cost data from a URL
   * @param {string} url - URL to load cost data from
   * @returns {Object|null} Loaded cost data or null on failure
   */
  async loadFromUrl(url) {
    if (this.isLoading) {
      logger.warn('Load already in progress');
      return null;
    }

    this.isLoading = true;
    this.loadError = null;

    try {
      logger.info(`Loading cost data from: ${url}`);

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Validate the data structure
      if (!this._validateCostData(data)) {
        throw new Error('Invalid cost data structure');
      }

      this.costData = data;
      this.loadedFrom = url;
      this.loadedAt = new Date().toISOString();

      logger.info(`Cost data loaded: ${Object.keys(data.regions || {}).length} regions, ${Object.keys(data.locations || {}).length} locations`);

      this.eventBus?.publish('costDataManager:loaded', {
        source: url,
        regionCount: Object.keys(data.regions || {}).length,
        locationCount: Object.keys(data.locations || {}).length,
      });

      return data;
    } catch (error) {
      logger.error(`Failed to load cost data: ${error.message}`);
      this.loadError = error.message;

      this.eventBus?.publish('costDataManager:loadError', {
        source: url,
        error: error.message,
      });

      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Load cost data from a File object (e.g., from file input)
   * @param {File} file - File to load
   * @returns {Object|null} Loaded cost data or null on failure
   */
  async loadFromFile(file) {
    if (this.isLoading) {
      logger.warn('Load already in progress');
      return null;
    }

    this.isLoading = true;
    this.loadError = null;

    try {
      logger.info(`Loading cost data from file: ${file.name}`);

      const text = await file.text();
      const data = JSON.parse(text);

      // Validate the data structure
      if (!this._validateCostData(data)) {
        throw new Error('Invalid cost data structure');
      }

      this.costData = data;
      this.loadedFrom = `file:${file.name}`;
      this.loadedAt = new Date().toISOString();

      logger.info(`Cost data loaded from file: ${Object.keys(data.regions || {}).length} regions, ${Object.keys(data.locations || {}).length} locations`);

      this.eventBus?.publish('costDataManager:loaded', {
        source: file.name,
        regionCount: Object.keys(data.regions || {}).length,
        locationCount: Object.keys(data.locations || {}).length,
      });

      return data;
    } catch (error) {
      logger.error(`Failed to load cost data from file: ${error.message}`);
      this.loadError = error.message;

      this.eventBus?.publish('costDataManager:loadError', {
        source: file.name,
        error: error.message,
      });

      return null;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Set cost data directly (e.g., from cost generator)
   * @param {Object} data - Cost data object
   * @param {string} source - Source description
   */
  setCostData(data, source = 'generated') {
    if (!this._validateCostData(data)) {
      logger.error('Invalid cost data structure provided to setCostData');
      return false;
    }

    this.costData = data;
    this.loadedFrom = source;
    this.loadedAt = new Date().toISOString();

    logger.info(`Cost data set from ${source}: ${Object.keys(data.regions || {}).length} regions, ${Object.keys(data.locations || {}).length} locations`);

    this.eventBus?.publish('costDataManager:loaded', {
      source,
      regionCount: Object.keys(data.regions || {}).length,
      locationCount: Object.keys(data.locations || {}).length,
    });

    return true;
  }

  /**
   * Validate cost data structure
   * @param {Object} data - Data to validate
   * @returns {boolean} True if valid
   */
  _validateCostData(data) {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Must have regions object
    if (!data.regions || typeof data.regions !== 'object') {
      logger.warn('Cost data missing regions object');
      return false;
    }

    // Must have locations object
    if (!data.locations || typeof data.locations !== 'object') {
      logger.warn('Cost data missing locations object');
      return false;
    }

    return true;
  }

  /**
   * Get cost for a region
   * @param {string} regionName - Name of the region
   * @returns {number} Move cost for the region
   */
  getRegionCost(regionName) {
    if (!this.costData) {
      return this.getDefaultRegionCost();
    }

    const regionData = this.costData.regions[regionName];
    if (regionData && typeof regionData.moveCost === 'number') {
      return regionData.moveCost;
    }

    return this.costData.defaultRegionCost || 50;
  }

  /**
   * Get cost for a location
   * @param {string} locationName - Name of the location
   * @returns {number} Cost for checking the location
   */
  getLocationCost(locationName) {
    if (!this.costData) {
      return this.getDefaultLocationCost();
    }

    const locationCost = this.costData.locations[locationName];
    if (typeof locationCost === 'number') {
      return locationCost;
    }

    return this.costData.defaultLocationCost || 100;
  }

  /**
   * Get default region cost
   * @returns {number} Default region move cost
   */
  getDefaultRegionCost() {
    return this.costData?.defaultRegionCost || 50;
  }

  /**
   * Get default location cost
   * @returns {number} Default location check cost
   */
  getDefaultLocationCost() {
    return this.costData?.defaultLocationCost || 100;
  }

  /**
   * Check if cost data is loaded
   * @returns {boolean} True if data is loaded
   */
  isLoaded() {
    return this.costData !== null;
  }

  /**
   * Get all loaded cost data
   * @returns {Object|null} Cost data or null if not loaded
   */
  getCostData() {
    return this.costData;
  }

  /**
   * Get loading status
   * @returns {Object} Loading status info
   */
  getStatus() {
    return {
      isLoaded: this.isLoaded(),
      isLoading: this.isLoading,
      loadedFrom: this.loadedFrom,
      loadedAt: this.loadedAt,
      loadError: this.loadError,
      regionCount: this.costData ? Object.keys(this.costData.regions).length : 0,
      locationCount: this.costData ? Object.keys(this.costData.locations).length : 0,
    };
  }

  /**
   * Clear loaded cost data
   */
  clear() {
    this.costData = null;
    this.loadedFrom = null;
    this.loadedAt = null;
    this.loadError = null;

    logger.info('Cost data cleared');

    this.eventBus?.publish('costDataManager:cleared', {});
  }

  /**
   * Export cost data to JSON string
   * @returns {string|null} JSON string or null if no data
   */
  exportToJSON() {
    if (!this.costData) {
      return null;
    }
    return JSON.stringify(this.costData, null, 2);
  }

  /**
   * Download cost data as a file
   * @param {string} filename - Name for the downloaded file
   */
  downloadCostData(filename = 'costs.json') {
    const json = this.exportToJSON();
    if (!json) {
      logger.warn('No cost data to download');
      return;
    }

    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();

    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);

    logger.info(`Cost data downloaded as ${filename}`);
  }

  /**
   * Derive the costs file path from a rules file path
   * @param {string} rulesPath - Path to the rules.json file
   * @returns {string} Path to the corresponding costs.json file
   */
  getCostsPathFromRulesPath(rulesPath) {
    // Rules path: presets/game/AP_SEED/AP_SEED_rules.json
    // Costs path: presets/game/AP_SEED/AP_SEED_costs.json
    return rulesPath.replace('_rules.json', '_costs.json');
  }

  /**
   * Try to load existing costs from the preset directory
   * @param {string} rulesPath - Path to the rules.json file
   * @returns {Object|null} Loaded cost data or null if not found
   */
  async tryLoadFromPreset(rulesPath) {
    const costsPath = this.getCostsPathFromRulesPath(rulesPath);

    try {
      logger.info(`Checking for existing costs file: ${costsPath}`);
      const response = await fetch(costsPath);

      if (response.ok) {
        const data = await response.json();
        if (this._validateCostData(data)) {
          this.costData = data;
          this.loadedFrom = costsPath;
          this.loadedAt = new Date().toISOString();

          logger.info(`Loaded existing costs: ${Object.keys(data.regions || {}).length} regions, ${Object.keys(data.locations || {}).length} locations`);

          this.eventBus?.publish('costDataManager:loaded', {
            source: costsPath,
            regionCount: Object.keys(data.regions || {}).length,
            locationCount: Object.keys(data.locations || {}).length,
            fromExisting: true,
          });

          return data;
        }
      }

      logger.info(`No existing costs file found at ${costsPath}`);
      return null;
    } catch (error) {
      logger.debug(`Could not load costs from ${costsPath}: ${error.message}`);
      return null;
    }
  }

  /**
   * Save cost data to a file path (for use in Node.js/test environments)
   * In browser context, this triggers a download with the appropriate filename
   * @param {string} rulesPath - Path to the rules.json file (used to derive costs path)
   * @returns {string} The path where costs should be saved
   */
  saveCostsToPreset(rulesPath) {
    const costsPath = this.getCostsPathFromRulesPath(rulesPath);
    const filename = costsPath.split('/').pop();

    // In browser context, trigger download with the correct filename
    this.downloadCostData(filename);

    logger.info(`Cost data should be saved to: ${costsPath}`);
    return costsPath;
  }

  /**
   * Get cost data as a JSON string for external saving
   * @returns {Object} Object with path and content for saving
   */
  getCostDataForSaving(rulesPath) {
    const costsPath = this.getCostsPathFromRulesPath(rulesPath);
    return {
      path: costsPath,
      content: this.exportToJSON(),
      filename: costsPath.split('/').pop(),
    };
  }
}

export default CostDataManager;

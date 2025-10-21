// displaySettingsManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('regionUI:DisplaySettings');

/**
 * DisplaySettingsManager
 *
 * Centralizes all display settings for the regions panel.
 * Manages both persisted settings (from settingsManager) and session-only settings (from UI controls).
 *
 * Data Flow:
 * 1. Initialize: Load persisted settings from settingsManager
 * 2. Sync from UI: Read current checkbox/select states
 * 3. Get setting: Return cached value
 * 4. Set setting: Update cache and optionally persist
 * 5. Sync to UI: Update checkbox/select states to match cache
 */
export class DisplaySettingsManager {
  constructor(settingsManager, rootElement) {
    this.settingsManager = settingsManager;
    this.rootElement = rootElement;

    // Cache all settings - single source of truth
    this.settings = {
      // From settingsManager (persisted across sessions)
      colorblindMode: false,
      showName: true,
      showLabel1: false,
      showLabel2: false,

      // From UI controls (now also persisted)
      showReachable: true,
      showUnreachable: true,
      showAll: false,
      showPaths: true,
      showEntrances: true,
      showExits: true,
      showLocations: true,
      showLogicTrees: true,
      sectionOrder: 'entrances-exits-locations',
      sortMethod: 'original'
    };

    logger.debug('DisplaySettingsManager constructed');
  }

  /**
   * Initialize settings manager
   * Loads persisted settings and syncs TO UI (not FROM UI, which would overwrite persisted values)
   */
  async initialize() {
    logger.info('Initializing display settings...');
    await this.loadPersistedSettings();
    // Sync TO UI to ensure checkboxes match loaded persisted settings
    // DO NOT call syncFromUI() here - checkbox .checked always returns boolean,
    // so it would overwrite persisted settings with default DOM values
    this.syncToUI();
    logger.info('Display settings initialized', this.settings);
  }

  /**
   * Load persisted settings from settingsManager
   */
  async loadPersistedSettings() {
    try {
      // Load display settings
      this.settings.colorblindMode = await this.settingsManager.getSetting('colorblindMode.regions', false);
      this.settings.showName = await this.settingsManager.getSetting('moduleSettings.regions.showName', true);
      this.settings.showLabel1 = await this.settingsManager.getSetting('moduleSettings.regions.showLabel1', false);
      this.settings.showLabel2 = await this.settingsManager.getSetting('moduleSettings.regions.showLabel2', false);

      // Load UI control settings (now persisted)
      this.settings.showAll = await this.settingsManager.getSetting('moduleSettings.regions.showAll', false);
      this.settings.showPaths = await this.settingsManager.getSetting('moduleSettings.regions.showPaths', true);
      this.settings.showReachable = await this.settingsManager.getSetting('moduleSettings.regions.showReachable', true);
      this.settings.showUnreachable = await this.settingsManager.getSetting('moduleSettings.regions.showUnreachable', true);
      this.settings.showEntrances = await this.settingsManager.getSetting('moduleSettings.regions.showEntrances', true);
      this.settings.showExits = await this.settingsManager.getSetting('moduleSettings.regions.showExits', true);
      this.settings.showLocations = await this.settingsManager.getSetting('moduleSettings.regions.showLocations', true);
      this.settings.showLogicTrees = await this.settingsManager.getSetting('moduleSettings.regions.showLogicTrees', true);
      this.settings.sectionOrder = await this.settingsManager.getSetting('moduleSettings.regions.sectionOrder', 'entrances-exits-locations');
      this.settings.sortMethod = await this.settingsManager.getSetting('moduleSettings.regions.sortMethod', 'original');

      logger.debug('Persisted settings loaded successfully');
    } catch (error) {
      logger.error('Failed to load persisted settings:', error);
      // Continue with defaults
    }
  }

  /**
   * Sync settings from UI controls to cache
   * Reads current checkbox/select states and updates cached settings
   */
  syncFromUI() {
    if (!this.rootElement) {
      logger.warn('Cannot sync from UI: rootElement not available');
      return;
    }

    // Read checkbox states
    this.settings.showReachable = this.rootElement.querySelector('#region-show-reachable')?.checked ?? this.settings.showReachable;
    this.settings.showUnreachable = this.rootElement.querySelector('#region-show-unreachable')?.checked ?? this.settings.showUnreachable;
    this.settings.showAll = this.rootElement.querySelector('#show-all-regions')?.checked ?? this.settings.showAll;
    this.settings.showPaths = this.rootElement.querySelector('#show-paths')?.checked ?? this.settings.showPaths;
    this.settings.showEntrances = this.rootElement.querySelector('#show-entrances')?.checked ?? this.settings.showEntrances;
    this.settings.showExits = this.rootElement.querySelector('#show-exits')?.checked ?? this.settings.showExits;
    this.settings.showLocations = this.rootElement.querySelector('#show-locations')?.checked ?? this.settings.showLocations;
    this.settings.showLogicTrees = this.rootElement.querySelector('#show-logic-trees')?.checked ?? this.settings.showLogicTrees;

    // Read select values
    this.settings.sectionOrder = this.rootElement.querySelector('#section-order-select')?.value ?? this.settings.sectionOrder;
    this.settings.sortMethod = this.rootElement.querySelector('#region-sort-select')?.value ?? this.settings.sortMethod;

    logger.debug('Settings synced from UI');
  }

  /**
   * Sync settings to UI controls from cache
   * Updates checkbox/select states to match cached settings
   */
  syncToUI() {
    if (!this.rootElement) {
      logger.warn('Cannot sync to UI: rootElement not available');
      return;
    }

    // Update checkboxes
    const showReachableCheckbox = this.rootElement.querySelector('#region-show-reachable');
    if (showReachableCheckbox) showReachableCheckbox.checked = this.settings.showReachable;

    const showUnreachableCheckbox = this.rootElement.querySelector('#region-show-unreachable');
    if (showUnreachableCheckbox) showUnreachableCheckbox.checked = this.settings.showUnreachable;

    const showAllCheckbox = this.rootElement.querySelector('#show-all-regions');
    if (showAllCheckbox) showAllCheckbox.checked = this.settings.showAll;

    const showPathsCheckbox = this.rootElement.querySelector('#show-paths');
    if (showPathsCheckbox) showPathsCheckbox.checked = this.settings.showPaths;

    const showEntrancesCheckbox = this.rootElement.querySelector('#show-entrances');
    if (showEntrancesCheckbox) showEntrancesCheckbox.checked = this.settings.showEntrances;

    const showExitsCheckbox = this.rootElement.querySelector('#show-exits');
    if (showExitsCheckbox) showExitsCheckbox.checked = this.settings.showExits;

    const showLocationsCheckbox = this.rootElement.querySelector('#show-locations');
    if (showLocationsCheckbox) showLocationsCheckbox.checked = this.settings.showLocations;

    const showLogicTreesCheckbox = this.rootElement.querySelector('#show-logic-trees');
    if (showLogicTreesCheckbox) showLogicTreesCheckbox.checked = this.settings.showLogicTrees;

    // Update selects
    const sectionOrderSelect = this.rootElement.querySelector('#section-order-select');
    if (sectionOrderSelect) sectionOrderSelect.value = this.settings.sectionOrder;

    const sortSelect = this.rootElement.querySelector('#region-sort-select');
    if (sortSelect) sortSelect.value = this.settings.sortMethod;

    logger.debug('Settings synced to UI');
  }

  /**
   * Get a setting value
   * @param {string} key - Setting key
   * @returns {*} Setting value
   */
  getSetting(key) {
    return this.settings[key];
  }

  /**
   * Set a setting value
   * @param {string} key - Setting key
   * @param {*} value - Setting value
   * @param {boolean} persist - Whether to persist to settingsManager (default: true)
   */
  async setSetting(key, value, persist = true) {
    const oldValue = this.settings[key];
    this.settings[key] = value;

    logger.debug(`Setting changed: ${key} = ${value} (persist: ${persist})`);

    if (persist) {
      try {
        const settingsKey = this.getSettingsKey(key);
        await this.settingsManager.updateSetting(settingsKey, value);
        logger.debug(`Persisted setting: ${settingsKey} = ${value}`);
      } catch (error) {
        logger.error(`Failed to persist setting ${key}:`, error);
        // Revert on failure
        this.settings[key] = oldValue;
      }
    }
  }

  /**
   * Map internal setting key to settingsManager key
   * @param {string} key - Internal setting key
   * @returns {string} settingsManager key
   */
  getSettingsKey(key) {
    if (key === 'colorblindMode') {
      return 'colorblindMode.regions';
    }
    return `moduleSettings.regions.${key}`;
  }

  /**
   * Get display elements for a region based on current settings
   * @param {Object|string} regionData - Region data object or region name string
   * @returns {Array} Array of display elements: [{type, text}, ...]
   */
  getRegionDisplayElements(regionData) {
    const elements = [];

    if (this.settings.showName && (regionData.name || regionData)) {
      const name = typeof regionData === 'string' ? regionData : regionData.name;
      elements.push({ type: 'name', text: name });
    }

    if (this.settings.showLabel1 && regionData.label1) {
      elements.push({ type: 'label1', text: regionData.label1 });
    }

    if (this.settings.showLabel2 && regionData.label2) {
      elements.push({ type: 'label2', text: regionData.label2 });
    }

    // If nothing is enabled or no data available, default to name
    if (elements.length === 0) {
      const name = typeof regionData === 'string' ? regionData : (regionData.name || 'Unknown');
      elements.push({ type: 'name', text: name });
    }

    return elements;
  }

  /**
   * Handle settings:changed event from global settingsManager
   * @param {Object} event - Event object with key and value
   */
  async handleSettingsChanged(event) {
    const { key, value } = event;

    // Check if this is a region-related setting
    if (key === '*' || key.startsWith('colorblindMode.regions') || key.startsWith('moduleSettings.regions')) {
      logger.info(`External setting changed: ${key}`);

      // Reload all persisted settings to stay in sync
      await this.loadPersistedSettings();

      // Sync to UI to reflect the change
      this.syncToUI();

      return true; // Indicate that settings were updated
    }

    return false; // Not a region-related setting
  }
}

export default DisplaySettingsManager;

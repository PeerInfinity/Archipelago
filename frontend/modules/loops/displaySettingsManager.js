// displaySettingsManager.js
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('loopUI:DisplaySettings');

/**
 * DisplaySettingsManager
 *
 * Centralizes all display settings for the loops panel.
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

      // Loop-specific settings (persisted)
      defaultSpeed: 10,
      autoRestart: false,
      loopModeEnabled: false,
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
    // Sync TO UI to ensure controls match loaded persisted settings
    // DO NOT call syncFromUI() here - that would overwrite persisted settings
    this.syncToUI();
    logger.info('Display settings initialized', this.settings);
  }

  /**
   * Load persisted settings from settingsManager
   */
  async loadPersistedSettings() {
    try {
      // Load display settings
      this.settings.colorblindMode = await this.settingsManager.getSetting('colorblindMode.loops', false);

      // Load loop-specific settings
      this.settings.defaultSpeed = await this.settingsManager.getSetting('moduleSettings.loops.defaultSpeed', 10);
      this.settings.autoRestart = await this.settingsManager.getSetting('moduleSettings.loops.autoRestart', false);
      this.settings.loopModeEnabled = await this.settingsManager.getSetting('moduleSettings.loops.loopModeEnabled', false);

      logger.debug('Persisted settings loaded successfully');
    } catch (error) {
      logger.error('Failed to load persisted settings:', error);
      // Continue with defaults
    }
  }

  /**
   * Sync settings from UI controls to cache
   * Reads current checkbox/slider states and updates cached settings
   */
  syncFromUI() {
    if (!this.rootElement) {
      logger.warn('Cannot sync from UI: rootElement not available');
      return;
    }

    // Read slider value for game speed
    const speedSlider = this.rootElement.querySelector('#loop-ui-speed-slider');
    if (speedSlider) {
      this.settings.defaultSpeed = parseFloat(speedSlider.value) || 10;
    }

    logger.debug('Settings synced from UI');
  }

  /**
   * Sync settings to UI controls from cache
   * Updates checkbox/slider states to match cached settings
   */
  syncToUI() {
    if (!this.rootElement) {
      logger.warn('Cannot sync to UI: rootElement not available');
      return;
    }

    // Update speed slider if it exists
    const speedSlider = this.rootElement.querySelector('#loop-ui-speed-slider');
    const speedValueSpan = this.rootElement.querySelector('#loop-ui-speed-value');
    if (speedSlider) {
      speedSlider.value = this.settings.defaultSpeed;
      if (speedValueSpan) {
        speedValueSpan.textContent = `${this.settings.defaultSpeed.toFixed(1)}x`;
      }
    }

    // Update auto-restart button text if it exists
    const autoRestartBtn = this.rootElement.querySelector('#loop-ui-toggle-auto-restart');
    if (autoRestartBtn) {
      autoRestartBtn.textContent = this.settings.autoRestart
        ? 'Auto-restart enabled'
        : 'Pause when queue complete';
    }

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
      return 'colorblindMode.loops';
    }
    return `moduleSettings.loops.${key}`;
  }

  /**
   * Get colorblind mode setting
   * @returns {boolean} Whether colorblind mode is enabled
   */
  getColorblindMode() {
    return this.settings.colorblindMode;
  }

  /**
   * Set colorblind mode setting
   * @param {boolean} enabled - Whether to enable colorblind mode
   */
  async setColorblindMode(enabled) {
    await this.setSetting('colorblindMode', enabled, true);
  }

  /**
   * Handle settings:changed event from global settingsManager (synchronous version)
   * @param {Object} event - Event object with key and value
   * @returns {boolean} True if settings were updated
   */
  handleSettingsChanged(event) {
    const { key, value } = event;

    // Handle wildcard separately - need to reload all settings
    if (key === '*') {
      logger.info('Wildcard settings change - reloading all loop settings');
      // For wildcard, we need to reload all settings asynchronously
      // but we do it in the background to keep this method synchronous
      this.loadPersistedSettings().then(() => {
        this.syncToUI();
        logger.info('All loop settings reloaded after wildcard change');
      }).catch(err => {
        logger.error('Failed to reload settings after wildcard change:', err);
      });
      return true;
    }

    // Check if this is a specific loop-related setting
    if (key.startsWith('colorblindMode.loops') || key.startsWith('moduleSettings.loops')) {
      logger.info(`External setting changed: ${key}`);

      // Update the specific setting in cache
      if (key === 'colorblindMode.loops') {
        this.settings.colorblindMode = value;
      } else if (key === 'moduleSettings.loops.defaultSpeed') {
        this.settings.defaultSpeed = value;
      } else if (key === 'moduleSettings.loops.autoRestart') {
        this.settings.autoRestart = value;
      } else if (key === 'moduleSettings.loops.loopModeEnabled') {
        this.settings.loopModeEnabled = value;
      }

      // Sync to UI to reflect the change
      this.syncToUI();

      return true; // Indicate that settings were updated
    }

    return false; // Not a loop-related setting
  }
}

export default DisplaySettingsManager;

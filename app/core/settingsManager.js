import eventBus from './eventBus.js';

const SETTINGS_STORAGE_KEY = 'appSettings';

class SettingsManager {
  constructor() {
    this.settings = this.loadSettings();
    console.log('SettingsManager initialized with settings:', this.settings);
  }

  getDefaultSettings() {
    // Define default settings structure
    return {
      colorblindMode: {
        // Set defaults to false
        regions: false,
        locations: false,
        exits: false,
        loops: false,
        pathAnalyzer: false,
        // Add more UI areas here as they are refactored
      },
      // Future settings can be added here
      // exampleSetting: "default_value",
    };
  }

  loadSettings() {
    try {
      const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        // Merge with defaults to ensure new settings are added
        // This is a shallow merge, might need deep merge for nested objects if defaults change structure significantly
        return { ...this.getDefaultSettings(), ...parsed };
      } else {
        return this.getDefaultSettings();
      }
    } catch (error) {
      console.error('Error loading settings from localStorage:', error);
      return this.getDefaultSettings();
    }
  }

  saveSettings() {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(this.settings));
    } catch (error) {
      console.error('Error saving settings to localStorage:', error);
    }
  }

  /**
   * Gets the entire settings object.
   * @returns {object} The current settings object.
   */
  getSettings() {
    // Return a deep copy to prevent accidental mutation
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Gets a specific setting value using a dot-notation key.
   * @param {string} key - The setting key (e.g., 'colorblindMode.inventory')
   * @param {*} defaultValue - Value to return if key not found.
   * @returns {*} The setting value or defaultValue.
   */
  getSetting(key, defaultValue = undefined) {
    const keys = key.split('.');
    let current = this.settings;
    for (const k of keys) {
      if (current && typeof current === 'object' && k in current) {
        current = current[k];
      } else {
        return defaultValue;
      }
    }
    return current;
  }

  /**
   * Updates a specific setting value using a dot-notation key.
   * Publishes a 'settings:changed' event.
   * @param {string} key - The setting key (e.g., 'colorblindMode.inventory')
   * @param {*} value - The new value.
   * @returns {boolean} True if the setting was updated, false otherwise.
   */
  updateSetting(key, value) {
    const keys = key.split('.');
    let current = this.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k] || typeof current[k] !== 'object') {
        current[k] = {}; // Create nested object if it doesn't exist
      }
      current = current[k];
    }

    const finalKey = keys[keys.length - 1];
    if (typeof current === 'object' && current !== null) {
      if (current[finalKey] !== value) {
        current[finalKey] = value;
        this.saveSettings();
        console.log(`Setting updated: ${key} =`, value);
        eventBus.publish('settings:changed', {
          key,
          value,
          settings: this.getSettings(),
        });
        return true;
      }
    } else {
      console.warn(
        `Cannot update setting. Parent object for key '${key}' is not an object.`
      );
      return false;
    }
    return false; // Value was the same, no update
  }

  /**
   * Updates the entire settings object. Use with caution.
   * Publishes a general 'settings:changed' event.
   * @param {object} newSettings - The complete new settings object.
   */
  updateSettings(newSettings) {
    // Basic validation: ensure it's an object
    if (typeof newSettings !== 'object' || newSettings === null) {
      console.error('updateSettings received invalid input:', newSettings);
      return;
    }
    // Perform a merge or overwrite? Overwrite is simpler based on OptionsUI giving full object.
    // Add some safety: merge top-level keys with defaults to avoid wiping expected structure?
    // For now, let's trust the input comes from our OptionsUI which got the structure initially.
    this.settings = JSON.parse(JSON.stringify(newSettings)); // Deep copy
    this.saveSettings();
    console.log('Settings object updated:', this.settings);
    // Publish a general event indicating a potentially large change
    eventBus.publish('settings:changed', {
      key: '*',
      value: this.settings,
      settings: this.getSettings(),
    });
  }
}

// Export singleton instance
const settingsManager = new SettingsManager();
export default settingsManager;

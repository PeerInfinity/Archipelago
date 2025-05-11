import eventBus from './eventBus.js';

// const SETTINGS_STORAGE_KEY = 'appSettings'; // No longer using localStorage directly

class SettingsManager {
  constructor() {
    this.settings = null;
    this.isLoading = true; // Will be set to false once settings are loaded or provided
    this.loadPromise = null; // Initialize to null, created by ensureLoaded if needed
    // console.log('SettingsManager initializing...');
  }

  setInitialSettings(initialSettings) {
    if (initialSettings && typeof initialSettings === 'object') {
      console.log(
        '[SettingsManager] Setting initial settings directly:',
        initialSettings
      );
      this.settings = JSON.parse(JSON.stringify(initialSettings)); // Deep copy
      this.isLoading = false;
      // If there was a loadPromise, it's now irrelevant or should be handled.
      // For simplicity, ensureLoaded will check isLoading and this.settings.
      eventBus.publish('settings:loaded', this.settings);
    } else {
      console.warn(
        '[SettingsManager] setInitialSettings called with invalid settings object.',
        initialSettings
      );
      // Do not set isLoading to false, allow normal loading to proceed if ensureLoaded is called.
    }
  }

  async _loadSettingsFromServer() {
    try {
      const response = await fetch('/frontend/settings.json');
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      this.settings = await response.json();
      console.log(
        'Settings loaded successfully from /frontend/settings.json:',
        this.settings
      );
      // Add validation against schema maybe?
    } catch (error) {
      console.error(
        'Error loading settings from /frontend/settings.json:',
        error
      );
      // Fallback to some default or handle error state
      this.settings = this._getDefaultFallbackSettings(); // Use a fallback
      console.warn('Using default fallback settings.');
    } finally {
      this.isLoading = false;
      eventBus.publish('settings:loaded', this.settings); // Notify when loaded/failed
    }
    return this.settings; // Return settings for chaining/awaiting
  }

  // Provides a basic structure if loading fails
  _getDefaultFallbackSettings() {
    return {
      activeGame: null,
      activeLayout: 'default',
      customLayoutConfig: null,
      generalSettings: { theme: 'dark' },
      moduleSettings: {},
    };
  }

  // Method to ensure settings are loaded before accessing them
  async ensureLoaded() {
    if (this.isLoading && !this.settings) {
      // Only load from server if still loading AND no initial settings were provided
      if (!this.loadPromise) {
        // Create load promise only if needed
        this.loadPromise = this._loadSettingsFromServer();
      }
      await this.loadPromise;
    } else if (this.isLoading && this.settings) {
      // This case means setInitialSettings was called, but isLoading wasn't set to false properly, or an edge case.
      // For safety, mark as not loading if settings are present.
      this.isLoading = false;
      console.log(
        '[SettingsManager] ensureLoaded: Settings already provided, marking as not loading.'
      );
    }
    // If !this.isLoading, settings are already loaded (either via setInitialSettings or previous _loadSettingsFromServer)
    return this.settings;
  }

  // Old loadSettings removed

  // saveSettings now needs to potentially POST to a server endpoint
  // For now, it's a placeholder. Actual saving logic TBD.
  async saveSettings() {
    if (this.isLoading) {
      console.warn('Settings not loaded yet, cannot save.');
      return;
    }
    console.log('Attempting to save settings (placeholder)...', this.settings);
    // TODO: Implement actual saving mechanism (e.g., POST to backend)
    // try {
    //   const response = await fetch('/api/settings', { // Example endpoint
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify(this.settings),
    //   });
    //   if (!response.ok) throw new Error('Failed to save settings');
    //   console.log('Settings saved successfully.');
    // } catch (error) {
    //   console.error('Error saving settings:', error);
    // }
  }

  /**
   * Gets the entire settings object. Ensures settings are loaded first.
   * @returns {Promise<object>} A promise resolving to the current settings object.
   */
  async getSettings() {
    await this.ensureLoaded();
    // Return a deep copy to prevent accidental mutation
    return JSON.parse(JSON.stringify(this.settings));
  }

  /**
   * Gets a specific setting value using a dot-notation key. Ensures settings are loaded first.
   * @param {string} key - The setting key (e.g., 'generalSettings.theme' or 'moduleSettings.client.defaultServer')
   * @param {*} defaultValue - Value to return if key not found.
   * @returns {Promise<*>} A promise resolving to the setting value or defaultValue.
   */
  async getSetting(key, defaultValue = undefined) {
    await this.ensureLoaded();
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
   * Publishes a 'settings:changed' event and triggers saveSettings.
   * Ensures settings are loaded first.
   * @param {string} key - The setting key (e.g., 'generalSettings.theme')
   * @param {*} value - The new value.
   * @returns {Promise<boolean>} A promise resolving to true if the setting was updated, false otherwise.
   */
  async updateSetting(key, value) {
    await this.ensureLoaded();
    const keys = key.split('.');
    let current = this.settings;
    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i];
      if (!current[k] || typeof current[k] !== 'object') {
        // Avoid creating nested objects if the path doesn't exist in the loaded structure.
        // This might be debatable, but safer than auto-creating paths.
        console.warn(
          `Cannot update setting. Path '${keys
            .slice(0, i + 1)
            .join('.')}' does not exist or is not an object.`
        );
        return false;
        // current[k] = {}; // Original behavior - auto-create
      }
      current = current[k];
    }

    const finalKey = keys[keys.length - 1];
    if (typeof current === 'object' && current !== null) {
      if (current[finalKey] !== value) {
        current[finalKey] = value;
        console.log(`Setting updated: ${key} =`, value);
        eventBus.publish('settings:changed', {
          key,
          value,
          settings: await this.getSettings(), // Get fresh copy
        });
        await this.saveSettings(); // Trigger save
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

  // updateSettings might need rework depending on how OptionsUI provides data
  // For now, assume it provides the full structure like before, but make it async.
  async updateSettings(newSettings) {
    await this.ensureLoaded();
    if (typeof newSettings !== 'object' || newSettings === null) {
      console.error('updateSettings received invalid input:', newSettings);
      return;
    }
    this.settings = JSON.parse(JSON.stringify(newSettings)); // Deep copy/overwrite
    console.log('Settings object updated:', this.settings);
    eventBus.publish('settings:changed', {
      key: '*', // Indicate general change
      value: this.settings,
      settings: await this.getSettings(),
    });
    await this.saveSettings();
  }

  // --- New methods based on plan ---

  /**
   * Gets the settings object for a specific module. Ensures settings are loaded first.
   * @param {string} moduleId - The ID of the module (e.g., 'client').
   * @returns {Promise<object>} A promise resolving to the module's settings object or an empty object if not found.
   */
  async getModuleSettings(moduleId) {
    await this.ensureLoaded();
    return this.settings?.moduleSettings?.[moduleId] ?? {};
  }

  /**
   * Updates a specific setting within a module's settings object.
   * Publishes 'settings:changed' and triggers save. Ensures settings are loaded first.
   * @param {string} moduleId - The ID of the module.
   * @param {string} key - The setting key within the module's settings.
   * @param {*} value - The new value.
   * @returns {Promise<boolean>} True if updated, false otherwise.
   */
  async updateModuleSetting(moduleId, key, value) {
    await this.ensureLoaded();
    if (!this.settings.moduleSettings) {
      this.settings.moduleSettings = {}; // Ensure moduleSettings exists
    }
    if (!this.settings.moduleSettings[moduleId]) {
      this.settings.moduleSettings[moduleId] = {}; // Ensure module's settings object exists
    }

    const moduleSettings = this.settings.moduleSettings[moduleId];
    if (moduleSettings[key] !== value) {
      moduleSettings[key] = value;
      console.log(`Module setting updated: ${moduleId}.${key} =`, value);
      eventBus.publish('settings:changed', {
        key: `moduleSettings.${moduleId}.${key}`, // More specific key
        value,
        settings: await this.getSettings(),
      });
      await this.saveSettings();
      return true;
    }
    return false; // Value was the same
  }

  /**
   * Gets the active layout identifier ('default', preset name, or null). Ensures settings are loaded first.
   * @returns {Promise<string|null>} A promise resolving to the active layout identifier.
   */
  async getActiveLayoutIdentifier() {
    await this.ensureLoaded();
    return this.settings?.activeLayout ?? 'default'; // Default to 'default' if missing
  }

  /**
   * Gets the custom Golden Layout configuration object. Ensures settings are loaded first.
   * @returns {Promise<object|null>} A promise resolving to the custom layout config or null.
   */
  async getCustomLayoutConfig() {
    await this.ensureLoaded();
    return this.settings?.customLayoutConfig ?? null;
  }

  /**
   * Gets the general application settings. Ensures settings are loaded first.
   * @returns {Promise<object>} A promise resolving to the general settings object or an empty object.
   */
  async getGeneralSettings() {
    await this.ensureLoaded();
    return this.settings?.generalSettings ?? {};
  }
}

// Export singleton instance
// Initialization is now async, so consumers need to `await settingsManager.ensureLoaded()`
// or listen for 'settings:loaded' event.
const settingsManager = new SettingsManager();
export default settingsManager;

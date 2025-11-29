// client/core/storage.js

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('clientStorage', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[clientStorage] ${message}`, ...data);
  }
}

export class Storage {
  constructor() {
    this._memoryStorage = new Map();
    this._localStorageAvailable = null; // null = not yet checked
  }

  initialize() {
    // Check localStorage availability once during initialization
    this._localStorageAvailable = this._checkLocalStorageAvailability();
    if (this._localStorageAvailable) {
      log('info', 'Storage module initialized with localStorage');
    } else {
      log('warn', 'localStorage not available, using memory storage for this session');
    }
  }

  /**
   * Check if localStorage is available and working
   * @returns {boolean} true if localStorage is available
   */
  _checkLocalStorageAvailability() {
    try {
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, testKey);
      window.localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  getItem(key) {
    // If we haven't checked yet, check now
    if (this._localStorageAvailable === null) {
      this._localStorageAvailable = this._checkLocalStorageAvailability();
    }

    if (this._localStorageAvailable) {
      try {
        return window.localStorage.getItem(key);
      } catch (e) {
        // localStorage became unavailable (e.g., quota exceeded)
        this._localStorageAvailable = false;
        log('warn', 'localStorage access failed, falling back to memory storage');
        return this._memoryStorage.get(key) || null;
      }
    }
    return this._memoryStorage.get(key) || null;
  }

  /**
   * Store a value in storage
   * @param {string} key - Storage key
   * @param {string} value - Value to store
   * @param {Object} options - Optional settings
   * @param {boolean} options.silent - If true, don't warn on localStorage failures (useful for large optional caches)
   * @returns {boolean} true if stored in localStorage, false if fell back to memory
   */
  setItem(key, value, options = {}) {
    // If we haven't checked yet, check now
    if (this._localStorageAvailable === null) {
      this._localStorageAvailable = this._checkLocalStorageAvailability();
    }

    if (this._localStorageAvailable) {
      try {
        window.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        // localStorage write failed (e.g., quota exceeded, security restriction)
        // Don't disable localStorage entirely - the issue may be specific to this key/value
        if (!options.silent) {
          log('warn', `localStorage write failed for key "${key}": ${e.name || 'Error'} - ${e.message || 'Unknown error'}. Using memory storage for this value.`);
        }
      }
    }
    this._memoryStorage.set(key, value);
    return false;
  }

  removeItem(key) {
    // If we haven't checked yet, check now
    if (this._localStorageAvailable === null) {
      this._localStorageAvailable = this._checkLocalStorageAvailability();
    }

    if (this._localStorageAvailable) {
      try {
        window.localStorage.removeItem(key);
        return;
      } catch (e) {
        // localStorage became unavailable
        this._localStorageAvailable = false;
        log('warn', 'localStorage remove failed, falling back to memory storage');
      }
    }
    this._memoryStorage.delete(key);
  }
}

// Create and export a singleton instance
export const storage = new Storage();

// Also export as default for convenience
export default storage;

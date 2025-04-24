// client/core/storage.js
export class Storage {
  constructor() {
    this._memoryStorage = new Map();
  }

  initialize() {
    console.log('Storage module initialized');
  }

  getItem(key) {
    try {
      const item = window.localStorage.getItem(key);
      return item;
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      return this._memoryStorage.get(key) || null;
    }
  }

  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      this._memoryStorage.set(key, value);
    }
  }

  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      this._memoryStorage.delete(key);
    }
  }
}

// Create and export a singleton instance
export const storage = new Storage();

// Also export as default for convenience
export default storage;

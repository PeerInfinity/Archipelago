// storage.js
/**
 * Safe storage wrapper that provides fallback to memory storage when localStorage is unavailable.
 * This wrapper was added to handle cases where localStorage might be restricted or unavailable,
 * such as certain browser contexts or security settings. It maintains the same API as localStorage
 * while providing graceful fallback behavior instead of throwing errors.
 *
 * Originally added to handle development environments and restricted contexts, but also provides
 * better error handling for production use cases where storage might be unavailable.
 */
const safeStorage = {
  _memoryStorage: new Map(),

  getItem(key) {
    try {
      const item = window.localStorage.getItem(key);
      return item;
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      return this._memoryStorage.get(key) || null;
    }
  },

  setItem(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      this._memoryStorage.set(key, value);
    }
  },

  removeItem(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.warn('localStorage not available, using memory storage');
      this._memoryStorage.delete(key);
    }
  },
};

// Make it globally available
window.safeStorage = safeStorage;

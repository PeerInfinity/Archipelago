// client/core/config.js
export const Config = {
  PROTOCOL_VERSION: {
    major: 0,
    minor: 6,
    build: 4,
    class: 'Version',
  },
  DEFAULT_SERVER_PORT: 38281,
  CLIENT_STATUS: {
    CLIENT_UNKNOWN: 0,
    CLIENT_READY: 10,
    CLIENT_PLAYING: 20,
    CLIENT_GOAL: 30,
  },
  MAX_CACHED_COMMANDS: 10,

  get(key) {
    return this[key];
  },

  getAll() {
    return { ...this };
  },
};

// Export as default so it can be imported as: import Config from './config.js';
export default Config;

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('stateManagerHelpers', message, ...data);
  } else {
    // In worker context, only log ERROR and WARN levels to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod =
        console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[stateManagerHelpers] ${message}`, ...data);
    }
  }
}

/**
 * Base class for game-specific helpers
 * Provides shared functionality and structure for helper implementations
 */
export class GameHelpers {
  constructor(loggerInstance, moduleName = 'GameHelpers') {
    this.logger = loggerInstance || console;
    this.moduleName = moduleName;
  }

  // Remove the old log method - use this.logger directly

  // Helper method to execute a helper function by name
  executeHelper(name, ...args) {
    if (typeof this[name] !== 'function') {
      this.logger.warn(this.moduleName, `Unknown helper function: ${name}`);
      return false;
    }
    const result = this[name](...args);
    // this.logger.verbose(this.moduleName, `Helper ${name}(${args.join(', ')}) returned ${result}`);
    return result;
  }

  // Helper method to execute a state method by name
  executeStateMethod(method, ...args) {
    if (typeof this[method] !== 'function') {
      this.logger.warn(this.moduleName, `Unknown state method: ${method}`);
      return false;
    }
    const result = this[method](...args);
    // this.logger.verbose(this.moduleName, `State method ${method}(${args.join(', ')}) returned ${result}`);
    return result;
  }
}

// Base class for game-specific state tracking
export class GameState {
  constructor(
    gameName = 'UnknownGame',
    loggerInstance,
    moduleName = 'GameState'
  ) {
    this.logger = loggerInstance || console;
    this.moduleName = moduleName;

    this.flags = new Set();
    this.settings = {};
    this.game = gameName;
    this.startRegions = ['Menu'];

    this.logger.info(
      this.moduleName,
      `GameState for ${this.game} initialized using injected logger.`
    );
  }

  loadSettings(settings) {
    this.settings = settings || {};
    this.game = this.settings.game || this.game;
  }

  setFlag(flag) {
    this.flags.add(flag);
    this.logger.debug(this.moduleName, `Set flag: ${flag}`);
  }

  hasFlag(flag) {
    const hasFlag = this.flags.has(flag);
    this.logger.debug(this.moduleName, `Checking flag ${flag}: ${hasFlag}`);
    return hasFlag;
  }

  getState() {
    this.logger.debug(
      this.moduleName,
      `[GameState base] getState() called. Game: ${this.game}`
    );
    return {
      flags: Array.from(this.flags),
      settings: this.settings,
      game: this.game,
    };
  }
}

/**
 * Base class for game-specific helpers
 * Provides shared functionality and structure for helper implementations
 */
export class GameHelpers {
  constructor() {
    // Remove debug property references since we're using global logging or stateManager
  }

  log(message) {
    // Simplified logging that doesn't rely on instance properties
    console.log(message);
  }

  // Helper method to execute a helper function by name
  executeHelper(name, ...args) {
    if (typeof this[name] !== 'function') {
      console.log(`Unknown helper function: ${name}`);
      return false;
    }
    const result = this[name](...args);
    //console.log(`Helper ${name}(${args.join(', ')}) returned ${result}`);
    return result;
  }

  // Helper method to execute a state method by name
  executeStateMethod(method, ...args) {
    if (typeof this[method] !== 'function') {
      console.log(`Unknown state method: ${method}`);
      return false;
    }
    const result = this[method](...args);
    //console.log(`Helper ${method}(${args.join(', ')}) returned ${result}`);
    return result;
  }
}

// Base class for game-specific state tracking
export class GameState {
  constructor(gameName = 'UnknownGame', debugLog = null) {
    this.flags = new Set();
    this.settings = {};
    this.game = gameName;
    this.startRegions = ['Menu'];
    // Properly set up debug object if debugLog is provided
    this.debug = debugLog
      ? {
          log: (msg) => {
            if (typeof msg === 'object') {
              debugLog.log(JSON.stringify(msg));
            } else {
              debugLog.log(msg);
            }
          },
        }
      : {
          log: (msg) => {
            if (console) {
              if (typeof msg === 'object') {
                console.log(JSON.stringify(msg));
              } else {
                console.log(msg);
              }
            }
          },
        };
  }

  loadSettings(settings) {
    this.settings = settings || {};
    this.game = this.settings.game || this.game;
    this.log(
      `[GameState base] loadSettings called. Game in state set to: ${this.game}`
    );
    this.log(
      `[GameState base] this.settings object after assignment: ${JSON.stringify(
        this.settings
      )}`
    );
    this.log(
      `[GameState base] this.settings.game after assignment: ${this.settings.game}`
    );
  }

  log(message) {
    if (this.debug?.log) {
      this.debug.log(message);
    }
  }

  setFlag(flag) {
    this.flags.add(flag);
    this.log(`Set flag: ${flag}`);
  }

  hasFlag(flag) {
    const hasFlag = this.flags.has(flag);
    this.log(`Checking flag ${flag}: ${hasFlag}`);
    return hasFlag;
  }

  getState() {
    this.log(`[GameState base] getState() called. Game: ${this.game}`);
    return {
      flags: Array.from(this.flags),
      settings: this.settings,
      game: this.game,
    };
  }
}

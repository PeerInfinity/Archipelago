// client/ui/consoleUI.js - Updated to use the console manager
import Config from '../core/config.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('consoleUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[consoleUI] ${message}`, ...data);
  }
}

// ConsoleUI class - Now primarily contains command handlers and history logic
export class ConsoleUI {
  // Keep static cache/cursor for internal command history logic
  static cachedCommands = [];
  static commandCursor = 0;
  static maxCachedCommands = Config.MAX_CACHED_COMMANDS || 10;
  static eventBus = null;
  static unsubscribeHandles = [];

  // Method to inject eventBus (if needed for subscriptions)
  static setEventBus(busInstance) {
    log('info', '[ConsoleUI] Setting EventBus instance.');
    this.eventBus = busInstance;
    // Subscribe to any events ConsoleUI *itself* needs to listen to
    // (Likely none, as MainContentUI handles most interaction)
    this._subscribeToConsoleEvents();
  }

  static _subscribeToConsoleEvents() {
    if (!this.eventBus) return;
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];
    // Example: If ConsoleUI needed to react to something directly
    // const subscribe = (name, handler) => { ... };
    // subscribe('some:event', () => { log('info', 'ConsoleUI reacted!')});
    log('info', '[ConsoleUI] Subscribed to console events (if any).');
  }

  static dispose() {
    log('info', '[ConsoleUI] Disposing...');
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];
    this.eventBus = null;
  }

  // --- Command Registration Helper ---
  // This method is called by MainContentUI to register commands.
  // It takes the register function from consoleManager and the necessary dependencies.
  static registerCommands(registerCommandFunc, dependencies) {
    log('info', '[ConsoleUI] Registering network/state commands...');
    const register = (name, desc, handler) => {
      // Wrapper passes dependencies to the actual handler
      registerCommandFunc(name, desc, (args) => {
        // Ensure the handler exists before calling
        if (typeof handler === 'function') {
          handler(args, dependencies);
        } else {
          log(
            'error',
            `[ConsoleUI] Handler for command '${name}' is not a function!`
          );
        }
      });
    };

    // Register specific commands
    register('received', 'Show received items', this.handleReceivedCommand);
    register('missing', 'Show missing locations', this.handleMissingCommand);
    register('items', 'List available items', this.handleItemsCommand);
    register(
      'item_groups',
      'List available item groups',
      this.handleItemGroupsCommand
    );
    register(
      'locations',
      'List available locations',
      this.handleLocationsCommand
    );
    // location_groups command removed - location groups don't exist in Archipelago JSON data
    register('ready', 'Send ready status to server', this.handleReadyCommand);
    register(
      'set_delay',
      'Set check delay (min max)',
      this.handleSetDelayCommand
    );

    // Logger commands
    register(
      'log_level',
      'Set log level: log_level [category] <level>',
      this.handleLogLevelCommand
    );
    register(
      'log_status',
      'Show current logging configuration',
      this.handleLogStatusCommand
    );
    register(
      'log_filter',
      'Add log filter: log_filter <include|exclude> <keyword>',
      this.handleLogFilterCommand
    );
    register(
      'log_clear_filters',
      'Clear all log filters',
      this.handleLogClearFiltersCommand
    );
    register(
      'log_enable',
      'Enable/disable logging: log_enable <true|false>',
      this.handleLogEnableCommand
    );

    // Temporary override commands
    register(
      'log_override',
      'Enable temporary override: log_override <level>',
      this.handleLogOverrideCommand
    );
    register(
      'log_override_off',
      'Disable temporary override',
      this.handleLogOverrideOffCommand
    );
  }

  // --- Command Handlers (Accept dependencies object) ---

  static handleReceivedCommand(args, { messageHandler, consoleManager }) {
    consoleManager.print('Received Items:');
    const items = messageHandler?.itemsReceived || [];
    if (items.length === 0) {
      consoleManager.print('No items received yet.');
      return;
    }
    items.forEach((item) => {
      const playerName =
        messageHandler?.getPlayerName(item.player) || `Player ${item.player}`;
      const locationName =
        messageHandler?.getLocationNameSync(item.location) ||
        `ID ${item.location}`;
      const itemName =
        messageHandler?.getItemNameSync(item.item) || `ID ${item.item}`;
      consoleManager.print(
        `- ${itemName} from ${locationName} (Player ${playerName})`
      );
    });
  }

  static async handleMissingCommand(args, { stateManager, consoleManager }) {
    consoleManager.print('Missing Locations:');
    if (!stateManager) {
      consoleManager.print('Error: StateManager not available.', 'error');
      return;
    }
    
    try {
      await stateManager.ensureReady();
      const snapshot = stateManager.getSnapshot();
      const staticData = stateManager.getStaticData();
      
      if (!staticData?.locations) {
        consoleManager.print('Error: Location data not available.', 'error');
        return;
      }
      
      // staticData.locations is an object keyed by location name, not an array
      const allLocations = Object.values(staticData.locations);
      const checkedLocations = new Set(snapshot?.checkedLocations || []);
      const missingLocations = allLocations.filter(loc => !checkedLocations.has(loc.name));
      
      if (missingLocations.length === 0) {
        consoleManager.print('No missing locations.');
        return;
      }
      
      // Limit output length if necessary
      const names = missingLocations.map(loc => loc.name);
      const output = names.length > 50
        ? names.slice(0, 50).join('\n') + '\n... (and more)'
        : names.join('\n');
      consoleManager.print(output);
      
    } catch (error) {
      consoleManager.print(`Error getting missing locations: ${error.message}`, 'error');
    }
  }

  static async handleItemsCommand(args, { stateManager, consoleManager }) {
    consoleManager.print('Available Items:');
    if (!stateManager) {
      consoleManager.print('Error: StateManager not available.', 'error');
      return;
    }
    
    try {
      await stateManager.ensureReady();
      const staticData = stateManager.getStaticData();
      
      if (!staticData?.items) {
        consoleManager.print('Error: Item data not available.', 'error');
        return;
      }
      
      const itemNames = Object.keys(staticData.items);
      const output = itemNames.length > 100
        ? itemNames.slice(0, 100).join('\n') + '\n... (and more)'
        : itemNames.join('\n');
      consoleManager.print(output);
      
    } catch (error) {
      consoleManager.print(`Error getting items: ${error.message}`, 'error');
    }
  }

  static async handleItemGroupsCommand(args, { stateManager, consoleManager }) {
    consoleManager.print('Item Groups:');
    if (!stateManager) {
      consoleManager.print('Error: StateManager not available.', 'error');
      return;
    }
    
    try {
      await stateManager.ensureReady();
      const staticData = stateManager.getStaticData();
      
      if (!staticData?.groups?.items) {
        consoleManager.print('No item groups available. Load rules data first via the JSON panel.', 'warn');
        return;
      }
      
      const groupNames = Object.keys(staticData.groups.items);
      if (groupNames.length === 0) {
        consoleManager.print('No item groups defined.', 'info');
      } else {
        consoleManager.print(groupNames.join('\n'));
      }
      
    } catch (error) {
      consoleManager.print(`Error getting item groups: ${error.message}`, 'error');
    }
  }

  static async handleLocationsCommand(args, { stateManager, consoleManager }) {
    consoleManager.print('Available Locations:');
    if (!stateManager) {
      consoleManager.print('Error: StateManager not available.', 'error');
      return;
    }
    
    try {
      await stateManager.ensureReady();
      const staticData = stateManager.getStaticData();
      
      if (!staticData?.locations) {
        consoleManager.print('Error: Location data not available.', 'error');
        return;
      }
      
      // staticData.locations is an object keyed by location name, not an array
      const locationNames = Object.values(staticData.locations).map((l) => l.name);
      const output = locationNames.length > 100
        ? locationNames.slice(0, 100).join('\n') + '\n... (and more)'
        : locationNames.join('\n');
      consoleManager.print(output);
      
    } catch (error) {
      consoleManager.print(`Error getting locations: ${error.message}`, 'error');
    }
  }

  // handleLocationGroupsCommand removed - location groups don't exist in Archipelago JSON data

  static handleReadyCommand(args, { connection, consoleManager }) {
    if (!connection || !connection.isConnected()) {
      consoleManager.print(
        'Cannot send ready: Not connected to server.',
        'error'
      );
      return;
    }
    connection.send([
      { cmd: 'StatusUpdate', status: Config.CLIENT_STATUS.CLIENT_READY },
    ]);
    consoleManager.print('Ready status sent to server.', 'system');
  }

  static handleSetDelayCommand(argsString, { centralRegistry, consoleManager }) {
    // Access the Timer module via the central registry
    const timerModule = centralRegistry?.getPublicFunction('Timer', 'setCheckDelay');
    if (!timerModule) {
      consoleManager.print(
        'Cannot set delay: Timer module not available.',
        'error'
      );
      return;
    }
    
    const args = argsString.split(' ').map((s) => parseInt(s, 10));
    const minDelay = args[0];
    const maxDelay = args.length > 1 ? args[1] : minDelay; // Use min if max not provided

    if (
      isNaN(minDelay) ||
      minDelay <= 0 ||
      isNaN(maxDelay) ||
      maxDelay < minDelay
    ) {
      consoleManager.print(
        'Invalid delay value(s). Usage: set_delay <min_seconds> [max_seconds]',
        'error'
      );
      return;
    }
    
    const success = timerModule(minDelay, maxDelay);
    if (success) {
      consoleManager.print(
        `Check delay updated: ${minDelay}s - ${maxDelay}s`,
        'success'
      );
    } else {
      consoleManager.print(
        'Failed to update check delay.',
        'error'
      );
    }
  }

  // Logger command handlers
  static handleLogLevelCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    const args = argsString.trim().split(/\s+/);
    if (args.length === 1) {
      // Set default level: log_level DEBUG
      const level = args[0];
      logger.setDefaultLevel(level);
    } else if (args.length === 2) {
      // Set category level: log_level stateManager DEBUG
      const [categoryName, level] = args;
      logger.setCategoryLevel(categoryName, level);
    } else {
      consoleManager.print(
        'Usage: log_level <level> OR log_level <category> <level>',
        'error'
      );
      consoleManager.print(
        `Available levels: ${logger.getAvailableLevels().join(', ')}`,
        'info'
      );
    }
  }

  static handleLogStatusCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    const status = logger.showStatus();
    consoleManager.print('=== Logger Status ===', 'info');
    consoleManager.print(`Enabled: ${status.enabled}`, 'info');
    consoleManager.print(`Default Level: ${status.defaultLevel}`, 'info');

    // Show temporary override status
    if (status.temporaryOverride.enabled) {
      consoleManager.print(
        `🔄 TEMPORARY OVERRIDE ACTIVE: ${status.temporaryOverride.level}`,
        'info'
      );
      consoleManager.print(
        '   (All categories are forced to this level)',
        'info'
      );
    } else {
      consoleManager.print(
        `Temporary Override: Disabled (level: ${status.temporaryOverride.level})`,
        'info'
      );
    }

    consoleManager.print(
      `Category-specific levels (${status.categoryCount}):`,
      'info'
    );

    for (const [category, level] of Object.entries(status.categoryLevels)) {
      const effectiveLevel = status.temporaryOverride.enabled
        ? status.temporaryOverride.level
        : level;
      const displayText = status.temporaryOverride.enabled
        ? `  ${category}: ${level} → ${effectiveLevel}`
        : `  ${category}: ${level}`;
      consoleManager.print(displayText, 'info');
    }

    if (status.filters.includeKeywords.length > 0) {
      consoleManager.print(
        `Include filters: ${status.filters.includeKeywords.join(', ')}`,
        'info'
      );
    }

    if (status.filters.excludeKeywords.length > 0) {
      consoleManager.print(
        `Exclude filters: ${status.filters.excludeKeywords.join(', ')}`,
        'info'
      );
    }

    consoleManager.print(
      `Available levels: ${logger.getAvailableLevels().join(', ')}`,
      'info'
    );
  }

  static handleLogFilterCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    const args = argsString.trim().split(/\s+/);
    if (args.length !== 2) {
      consoleManager.print(
        'Usage: log_filter <include|exclude> <keyword>',
        'error'
      );
      return;
    }

    const [filterType, keyword] = args;
    if (filterType === 'include') {
      logger.addIncludeKeyword(keyword);
      consoleManager.print(`Added include filter: ${keyword}`, 'system');
    } else if (filterType === 'exclude') {
      logger.addExcludeKeyword(keyword);
      consoleManager.print(`Added exclude filter: ${keyword}`, 'system');
    } else {
      consoleManager.print(
        'Filter type must be "include" or "exclude"',
        'error'
      );
    }
  }

  static handleLogClearFiltersCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    logger.clearFilters();
    consoleManager.print('All log filters cleared.', 'system');
  }

  static handleLogEnableCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    const arg = argsString.trim().toLowerCase();
    if (arg === 'true' || arg === '1' || arg === 'on') {
      logger.setEnabled(true);
      consoleManager.print('Logging enabled.', 'system');
    } else if (arg === 'false' || arg === '0' || arg === 'off') {
      logger.setEnabled(false);
      consoleManager.print('Logging disabled.', 'system');
    } else {
      consoleManager.print(
        'Usage: log_enable <true|false|on|off|1|0>',
        'error'
      );
    }
  }

  // Temporary override commands
  static handleLogOverrideCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    const level = argsString.trim();
    if (!level) {
      consoleManager.print('Usage: log_override <level>', 'error');
      consoleManager.print(
        `Available levels: ${logger.getAvailableLevels().join(', ')}`,
        'info'
      );
      return;
    }

    logger.enableTemporaryOverride(level);
    consoleManager.print(
      `Temporary override enabled: All categories forced to ${level.toUpperCase()}`,
      'system'
    );
  }

  static handleLogOverrideOffCommand(argsString, { consoleManager }) {
    const logger = window.logger;
    if (!logger) {
      consoleManager.print('Logger service not available.', 'error');
      return;
    }

    logger.disableTemporaryOverride();
    consoleManager.print('Temporary override disabled.', 'system');
  }

  // --- Internal command history logic (uses static properties) ---
  static _handleCommandUp(commandInputElement) {
    // ... (same logic) ...
  }

  static _handleCommandDown(commandInputElement) {
    // ... (same logic) ...
  }

  static _cacheCommand(command) {
    // ... (same logic) ...
  }

  // Removed appendMessage, appendFormattedMessage, clear - MainContentUI handles DOM via consoleManager
}

export default ConsoleUI;

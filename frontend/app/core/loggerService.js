/**
 * LoggerService - Centralized logging system with configurable levels and filtering
 *
 * Features:
 * - Module-specific log levels
 * - Global and per-module configuration
 * - Consistent formatting with timestamps and module names
 * - Dynamic level adjustment via console commands
 * - Keyword filtering for targeted debugging
 * - Performance optimization by filtering before formatting
 */
class LoggerService {
  constructor() {
    this.config = {
      defaultLevel: 'INFO',
      moduleLevels: {},
      filters: {
        includeKeywords: [],
        excludeKeywords: [],
      },
      showTimestamp: true,
      showModuleName: true,
      enabled: true,
    };

    // Log levels in order of verbosity (lower number = higher priority)
    this.logLevels = {
      NONE: 0,
      ERROR: 1,
      WARN: 2,
      INFO: 3,
      DEBUG: 4,
      VERBOSE: 5,
    };

    // Track initialization
    this.initialized = false;
  }

  /**
   * Configure the logger with settings from the application
   * @param {object} config - Configuration object (can be full settings or just logging section)
   */
  configure(config) {
    if (!config) return;

    // Handle both direct logging config and nested config.logging
    const loggingConfig = config.logging || config;

    // Merge with existing config
    this.config = { ...this.config, ...loggingConfig };

    // Handle legacy logLevel setting from generalSettings
    if (config.generalSettings?.logLevel) {
      this.config.defaultLevel = config.generalSettings.logLevel.toUpperCase();
    }

    this.initialized = true;

    // Use console.log directly for logger initialization to avoid recursion
    console.log('[LoggerService] Configured with settings:', {
      defaultLevel: this.config.defaultLevel,
      moduleCount: Object.keys(this.config.moduleLevels).length,
      enabled: this.config.enabled,
    });
  }

  /**
   * Check if a log message should be output based on level and module configuration
   * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG, VERBOSE)
   * @param {string} moduleName - Name of the module logging the message
   * @returns {boolean} Whether the message should be logged
   */
  _shouldLog(level, moduleName = 'App') {
    if (!this.config.enabled) return false;

    const messageLevel =
      this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    const moduleConfigLevelStr =
      this.config.moduleLevels[moduleName] || this.config.defaultLevel;
    const moduleThreshold =
      this.logLevels[moduleConfigLevelStr.toUpperCase()] || this.logLevels.INFO;

    return messageLevel <= moduleThreshold;
  }

  /**
   * Apply keyword filters to determine if message should be shown
   * @param {string} message - The log message
   * @returns {boolean} Whether the message passes filters
   */
  _passesFilters(message) {
    const { includeKeywords, excludeKeywords } = this.config.filters;

    // If include keywords are specified, message must contain at least one
    if (includeKeywords.length > 0) {
      const hasIncludeKeyword = includeKeywords.some((keyword) =>
        message.toLowerCase().includes(keyword.toLowerCase())
      );
      if (!hasIncludeKeyword) return false;
    }

    // If exclude keywords are specified, message must not contain any
    if (excludeKeywords.length > 0) {
      const hasExcludeKeyword = excludeKeywords.some((keyword) =>
        message.toLowerCase().includes(keyword.toLowerCase())
      );
      if (hasExcludeKeyword) return false;
    }

    return true;
  }

  /**
   * Format a log message with timestamp, level, and module information
   * @param {string} level - Log level
   * @param {string} moduleName - Module name
   * @param {string} message - Log message
   * @returns {string} Formatted message
   */
  _formatMessage(level, moduleName, message) {
    let parts = [];

    if (this.config.showTimestamp) {
      const now = new Date();
      const timestamp = now.toISOString().substr(11, 12); // HH:MM:SS.mmm
      parts.push(`[${timestamp}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);

    if (this.config.showModuleName && moduleName) {
      parts.push(`[${moduleName}]`);
    }

    parts.push(message);
    return parts.join(' ');
  }

  /**
   * Output the log message using the appropriate console method
   * @param {string} level - Log level
   * @param {string} formattedMessage - Pre-formatted message
   * @param {Array} data - Additional data to log
   */
  _output(level, formattedMessage, data) {
    const consoleMethod = console[level.toLowerCase()] || console.log;

    if (data && data.length > 0) {
      consoleMethod(formattedMessage, ...data);
    } else {
      consoleMethod(formattedMessage);
    }
  }

  /**
   * Main logging method - handles level checking, filtering, formatting, and output
   * @param {string} level - Log level
   * @param {string} moduleName - Module name
   * @param {string} message - Log message
   * @param {...any} data - Additional data to log
   */
  log(level, moduleName, message, ...data) {
    // Early return if logging is disabled or level check fails
    if (!this._shouldLog(level, moduleName)) return;

    // Apply keyword filters
    if (!this._passesFilters(message)) return;

    const formattedMessage = this._formatMessage(level, moduleName, message);
    this._output(level, formattedMessage, data);
  }

  // Convenience methods for different log levels
  error(moduleName, message, ...data) {
    this.log('ERROR', moduleName, message, ...data);
  }

  warn(moduleName, message, ...data) {
    this.log('WARN', moduleName, message, ...data);
  }

  info(moduleName, message, ...data) {
    this.log('INFO', moduleName, message, ...data);
  }

  debug(moduleName, message, ...data) {
    this.log('DEBUG', moduleName, message, ...data);
  }

  verbose(moduleName, message, ...data) {
    this.log('VERBOSE', moduleName, message, ...data);
  }

  // Dynamic configuration methods (callable via console commands)

  /**
   * Set the default log level for all modules
   * @param {string} level - New default level
   */
  setDefaultLevel(level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels[upperLevel] !== undefined) {
      this.config.defaultLevel = upperLevel;
      this.info(
        'LoggerService',
        `Default log level set to: ${this.config.defaultLevel}`
      );
    } else {
      this.warn(
        'LoggerService',
        `Invalid default log level: ${level}. Valid levels: ${Object.keys(
          this.logLevels
        ).join(', ')}`
      );
    }
  }

  /**
   * Set the log level for a specific module
   * @param {string} moduleName - Module name
   * @param {string} level - New level for the module
   */
  setModuleLevel(moduleName, level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels[upperLevel] !== undefined) {
      this.config.moduleLevels[moduleName] = upperLevel;
      this.info(
        'LoggerService',
        `Log level for ${moduleName} set to: ${this.config.moduleLevels[moduleName]}`
      );
    } else {
      this.warn(
        'LoggerService',
        `Invalid log level for ${moduleName}: ${level}. Valid levels: ${Object.keys(
          this.logLevels
        ).join(', ')}`
      );
    }
  }

  /**
   * Remove module-specific level (falls back to default)
   * @param {string} moduleName - Module name
   */
  clearModuleLevel(moduleName) {
    if (this.config.moduleLevels[moduleName]) {
      delete this.config.moduleLevels[moduleName];
      this.info(
        'LoggerService',
        `Cleared specific log level for ${moduleName}, now using default: ${this.config.defaultLevel}`
      );
    } else {
      this.warn('LoggerService', `No specific log level set for ${moduleName}`);
    }
  }

  /**
   * Add keyword to include filter
   * @param {string} keyword - Keyword to include
   */
  addIncludeKeyword(keyword) {
    if (!this.config.filters.includeKeywords.includes(keyword)) {
      this.config.filters.includeKeywords.push(keyword);
      this.info('LoggerService', `Added include keyword: ${keyword}`);
    }
  }

  /**
   * Add keyword to exclude filter
   * @param {string} keyword - Keyword to exclude
   */
  addExcludeKeyword(keyword) {
    if (!this.config.filters.excludeKeywords.includes(keyword)) {
      this.config.filters.excludeKeywords.push(keyword);
      this.info('LoggerService', `Added exclude keyword: ${keyword}`);
    }
  }

  /**
   * Clear all keyword filters
   */
  clearFilters() {
    this.config.filters.includeKeywords = [];
    this.config.filters.excludeKeywords = [];
    this.info('LoggerService', 'Cleared all keyword filters');
  }

  /**
   * Enable or disable logging entirely
   * @param {boolean} enabled - Whether logging should be enabled
   */
  setEnabled(enabled) {
    this.config.enabled = !!enabled;
    // Use console.log directly to avoid potential recursion
    console.log(
      `[LoggerService] Logging ${this.config.enabled ? 'enabled' : 'disabled'}`
    );
  }

  /**
   * Get current configuration for debugging or settings UI
   * @returns {object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Get available log levels
   * @returns {Array<string>} Array of available log level names
   */
  getAvailableLevels() {
    return Object.keys(this.logLevels);
  }

  /**
   * Show current logging status and configuration
   */
  showStatus() {
    const status = {
      enabled: this.config.enabled,
      defaultLevel: this.config.defaultLevel,
      moduleCount: Object.keys(this.config.moduleLevels).length,
      moduleLevels: { ...this.config.moduleLevels },
      filters: { ...this.config.filters },
    };

    console.log('[LoggerService] Current Status:', status);
    return status;
  }
}

// Create and export singleton instance
const logger = new LoggerService();

// Make logger available globally for console access
if (typeof window !== 'undefined') {
  window.logger = logger;
}

export default logger;

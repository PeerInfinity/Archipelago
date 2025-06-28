/**
 * LoggerService - Centralized logging system with configurable levels and filtering
 *
 * Features:
 * - Category-specific log levels (modules and conceptual categories)
 * - Global and per-category configuration
 * - Consistent formatting with timestamps and category names
 * - Dynamic level adjustment via console commands
 * - Keyword filtering for targeted debugging
 * - Performance optimization by filtering before formatting
 */
class LoggerService {
  constructor() {
    this.config = {
      defaultLevel: 'WARN',
      categoryLevels: {},
      filters: {
        includeKeywords: [],
        excludeKeywords: [],
      },
      showTimestamp: true,
      showCategoryName: true,
      enabled: true,
      // Temporary override settings
      temporaryOverride: {
        enabled: false,
        level: 'DEBUG',
      },
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

    this.initialized = true;

    // Use console.log directly for logger initialization to avoid recursion
    // Only show configuration messages if explicitly enabled for debugging
    if (this.config.showConfigMessages) {
      console.log('[LoggerService] Configured with settings:', {
        defaultLevel: this.config.defaultLevel,
        categoryCount: Object.keys(this.config.categoryLevels).length,
        enabled: this.config.enabled,
      });
    }
  }

  /**
   * Check if a log message should be output based on level and category configuration
   * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG, VERBOSE)
   * @param {string} categoryName - Name of the category logging the message
   * @returns {boolean} Whether the message should be logged
   */
  _shouldLog(level, categoryName = 'App') {
    if (!this.config.enabled) return false;

    const messageLevel =
      this.logLevels[level.toUpperCase()] || this.logLevels.INFO;

    // Check for temporary override first
    if (this.config.temporaryOverride.enabled) {
      const overrideThreshold =
        this.logLevels[this.config.temporaryOverride.level.toUpperCase()] ||
        this.logLevels.DEBUG;
      return messageLevel <= overrideThreshold;
    }

    // Normal category-specific level checking
    const categoryConfigLevelStr =
      this.config.categoryLevels[categoryName] || this.config.defaultLevel;
    const categoryThreshold =
      this.logLevels[categoryConfigLevelStr.toUpperCase()] ||
      this.logLevels.INFO;

    return messageLevel <= categoryThreshold;
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
   * Format a log message with timestamp, level, and category information
   * @param {string} level - Log level
   * @param {string} categoryName - Category name
   * @param {string} message - Log message
   * @returns {string} Formatted message
   */
  _formatMessage(level, categoryName, message) {
    let parts = [];

    if (this.config.showTimestamp) {
      const now = new Date();
      const timestamp = now.toISOString().substr(11, 12); // HH:MM:SS.mmm
      parts.push(`[${timestamp}]`);
    }

    parts.push(`[${level.toUpperCase()}]`);

    if (this.config.showCategoryName && categoryName) {
      parts.push(`[${categoryName}]`);
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
   * @param {string} categoryName - Category name
   * @param {string} message - Log message
   * @param {...any} data - Additional data to log
   */
  log(level, categoryName, message, ...data) {
    // Early return if logging is disabled or level check fails
    if (!this._shouldLog(level, categoryName)) return;

    // Apply keyword filters
    if (!this._passesFilters(message)) return;

    const formattedMessage = this._formatMessage(level, categoryName, message);
    this._output(level, formattedMessage, data);
  }

  // Convenience methods for different log levels
  error(categoryName, message, ...data) {
    this.log('ERROR', categoryName, message, ...data);
  }

  warn(categoryName, message, ...data) {
    this.log('WARN', categoryName, message, ...data);
  }

  info(categoryName, message, ...data) {
    this.log('INFO', categoryName, message, ...data);
  }

  debug(categoryName, message, ...data) {
    this.log('DEBUG', categoryName, message, ...data);
  }

  verbose(categoryName, message, ...data) {
    this.log('VERBOSE', categoryName, message, ...data);
  }

  // Dynamic configuration methods (callable via console commands)

  /**
   * Set the default log level for all categories
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
   * Set the log level for a specific category
   * @param {string} categoryName - Category name
   * @param {string} level - New level for the category
   */
  setCategoryLevel(categoryName, level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels[upperLevel] !== undefined) {
      this.config.categoryLevels[categoryName] = upperLevel;
      this.info(
        'LoggerService',
        `Log level for ${categoryName} set to: ${this.config.categoryLevels[categoryName]}`
      );
    } else {
      this.warn(
        'LoggerService',
        `Invalid log level for ${categoryName}: ${level}. Valid levels: ${Object.keys(
          this.logLevels
        ).join(', ')}`
      );
    }
  }

  /**
   * Remove category-specific level (falls back to default)
   * @param {string} categoryName - Category name
   */
  clearCategoryLevel(categoryName) {
    if (this.config.categoryLevels[categoryName]) {
      delete this.config.categoryLevels[categoryName];
      this.info(
        'LoggerService',
        `Cleared specific log level for ${categoryName}, now using default: ${this.config.defaultLevel}`
      );
    } else {
      this.warn(
        'LoggerService',
        `No specific log level set for ${categoryName}`
      );
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
   * Enable temporary override to force all categories to a specific level
   * @param {string} level - Log level to force all categories to
   */
  enableTemporaryOverride(level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels[upperLevel] !== undefined) {
      this.config.temporaryOverride.enabled = true;
      this.config.temporaryOverride.level = upperLevel;
      this.info(
        'LoggerService',
        `Temporary override enabled: All categories forced to ${upperLevel}`
      );
    } else {
      this.warn(
        'LoggerService',
        `Invalid temporary override level: ${level}. Valid levels: ${Object.keys(
          this.logLevels
        ).join(', ')}`
      );
    }
  }

  /**
   * Disable temporary override and return to normal category-specific levels
   */
  disableTemporaryOverride() {
    this.config.temporaryOverride.enabled = false;
    this.info(
      'LoggerService',
      'Temporary override disabled: Returning to category-specific levels'
    );
  }

  /**
   * Set the temporary override level without enabling it
   * @param {string} level - Log level for temporary override
   */
  setTemporaryOverrideLevel(level) {
    const upperLevel = level.toUpperCase();
    if (this.logLevels[upperLevel] !== undefined) {
      this.config.temporaryOverride.level = upperLevel;
      this.info(
        'LoggerService',
        `Temporary override level set to: ${upperLevel} (${
          this.config.temporaryOverride.enabled ? 'active' : 'inactive'
        })`
      );
    } else {
      this.warn(
        'LoggerService',
        `Invalid temporary override level: ${level}. Valid levels: ${Object.keys(
          this.logLevels
        ).join(', ')}`
      );
    }
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
      categoryCount: Object.keys(this.config.categoryLevels).length,
      categoryLevels: { ...this.config.categoryLevels },
      filters: { ...this.config.filters },
      temporaryOverride: { ...this.config.temporaryOverride },
    };

    console.log('[LoggerService] Current Status:', status);
    return status;
  }
}

// Create and export singleton instance
const logger = new LoggerService();

// Make logger available globally for console access (main thread only)
if (typeof window !== 'undefined') {
  window.logger = logger;
}

// Export both the class and the singleton instance
export { LoggerService };
export default logger;

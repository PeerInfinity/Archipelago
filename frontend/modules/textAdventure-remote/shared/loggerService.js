/**
 * LoggerService (Shared Version) - Simplified logging system for iframe contexts
 *
 * This is a simplified version of the main LoggerService for use in iframe modules.
 * It provides the core logging functionality without the full feature set.
 *
 * Features:
 * - Category-specific log levels
 * - Basic configuration support
 * - Consistent formatting
 * - Performance optimization
 */
export class LoggerService {
  constructor() {
    this.config = {
      defaultLevel: 'WARN',
      categoryLevels: {},
      showTimestamp: true,
      showCategoryName: true,
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
   * Configure the logger with settings
   * @param {object} config - Configuration object
   */
  configure(config) {
    if (!config) return;

    // Handle both direct logging config and nested config.logging
    const loggingConfig = config.logging || config;

    // Merge with existing config
    this.config = { ...this.config, ...loggingConfig };

    this.initialized = true;

    // Simple initialization message
    console.log('[LoggerService] Iframe logger configured');
  }

  /**
   * Check if a log message should be output based on level and category
   * @param {string} level - Log level
   * @param {string} categoryName - Category name
   * @returns {boolean} Whether the message should be logged
   */
  _shouldLog(level, categoryName = 'App') {
    if (!this.config.enabled) return false;

    const messageLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    const categoryConfigLevelStr = this.config.categoryLevels[categoryName] || this.config.defaultLevel;
    const categoryThreshold = this.logLevels[categoryConfigLevelStr.toUpperCase()] || this.logLevels.INFO;

    return messageLevel <= categoryThreshold;
  }

  /**
   * Format and output a log message
   * @param {string} level - Log level
   * @param {string} categoryName - Category name
   * @param {string} message - Log message
   * @param {...any} data - Additional data
   */
  _log(level, categoryName, message, ...data) {
    if (!this._shouldLog(level, categoryName)) return;

    const timestamp = this.config.showTimestamp ? new Date().toISOString() : '';
    const category = this.config.showCategoryName ? `[${categoryName}]` : '';
    const prefix = [timestamp, category].filter(Boolean).join(' ');
    
    const consoleMethod = console[level.toLowerCase()] || console.log;
    
    if (prefix) {
      consoleMethod(`${prefix} ${message}`, ...data);
    } else {
      consoleMethod(message, ...data);
    }
  }

  // Public logging methods
  error(categoryName, message, ...data) {
    this._log('ERROR', categoryName, message, ...data);
  }

  warn(categoryName, message, ...data) {
    this._log('WARN', categoryName, message, ...data);
  }

  info(categoryName, message, ...data) {
    this._log('INFO', categoryName, message, ...data);
  }

  debug(categoryName, message, ...data) {
    this._log('DEBUG', categoryName, message, ...data);
  }

  verbose(categoryName, message, ...data) {
    this._log('VERBOSE', categoryName, message, ...data);
  }

  /**
   * Get current configuration (simplified)
   * @returns {object} Current configuration
   */
  getConfig() {
    return {
      defaultLevel: this.config.defaultLevel,
      categoryLevels: { ...this.config.categoryLevels },
      enabled: this.config.enabled,
    };
  }

  /**
   * Create a category-specific logger
   * @param {string} categoryName - The category name for this logger
   * @returns {object} Category-specific logger
   */
  createLogger(categoryName) {
    return {
      error: (message, ...data) => this.error(categoryName, message, ...data),
      warn: (message, ...data) => this.warn(categoryName, message, ...data),
      info: (message, ...data) => this.info(categoryName, message, ...data),
      debug: (message, ...data) => this.debug(categoryName, message, ...data),
      verbose: (message, ...data) => this.verbose(categoryName, message, ...data),
    };
  }
}

// Create and export a default instance for iframe use
const logger = new LoggerService();
export default logger;
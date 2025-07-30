/**
 * Shared Logger Factory (Iframe/Module Version)
 * 
 * Creates category-specific loggers optimized for iframe and shared module contexts.
 * This is a simplified version of the universal logger specifically designed for
 * modules that run in isolated contexts (like iframes) where they cannot access
 * the main application's core logging infrastructure.
 * 
 * Key differences from app/core/universalLogger.js:
 * - Focuses specifically on iframe context
 * - Uses simplified LoggerService implementation
 * - Self-contained with no dependencies on main app core
 * - Each iframe module gets its own copy
 * 
 * Usage:
 * import { createSharedLogger } from './shared/sharedLogger.js';
 * const logger = createSharedLogger('myCategory');
 * logger.info('Hello world');
 */

// Import simplified LoggerService - should be available in shared folder
import { LoggerService } from './loggerService.js';

// Context-specific logger instances
let workerLoggerInstance = null;  // For worker context
let iframeLoggerInstance = null;  // For iframe context

/**
 * Initialize logger for worker context
 * This should be called once when the worker starts up
 * @param {object} config - Initial logging configuration
 */
export function initializeWorkerLogger(config = {}) {
  if (typeof window !== 'undefined') {
    // Don't create worker logger in main thread or iframe
    return;
  }
  
  if (!LoggerService) {
    console.log('[sharedLogger] LoggerService not available for worker logger');
    return;
  }
  
  workerLoggerInstance = new LoggerService();
  workerLoggerInstance.configure({
    defaultLevel: 'WARN',
    categoryLevels: {},
    enabled: true,
    ...config
  });
  
  console.log('[sharedLogger] Worker logger initialized');
}

/**
 * Update worker logger configuration
 * @param {object} config - New logging configuration
 */
export function updateWorkerLoggerConfig(config) {
  if (workerLoggerInstance) {
    workerLoggerInstance.configure(config);
  }
}

/**
 * Initialize logger for iframe context
 * This should be called once when the iframe starts up
 * @param {object} config - Initial logging configuration
 * @param {object} iframeClient - Optional iframe client for parent communication
 */
export function initializeIframeLogger(config = {}, iframeClient = null) {
  if (typeof window === 'undefined') {
    // Don't create iframe logger in worker context
    return;
  }
  
  // Check if we're actually in an iframe
  const isInIframe = window.self !== window.top;
  if (!isInIframe) {
    // Not in iframe, don't initialize iframe logger
    return;
  }
  
  if (!LoggerService) {
    console.log('[sharedLogger] LoggerService not available, iframe logger will use console fallback');
    return;
  }
  
  iframeLoggerInstance = new LoggerService();
  iframeLoggerInstance.configure({
    defaultLevel: 'WARN',
    categoryLevels: {},
    enabled: true,
    ...config
  });
  
  // Store iframe client reference for potential parent communication
  if (iframeClient) {
    iframeLoggerInstance._iframeClient = iframeClient;
  }
  
  console.log('[sharedLogger] Iframe logger initialized');
}

/**
 * Update iframe logger configuration
 * @param {object} config - New logging configuration
 */
export function updateIframeLoggerConfig(config) {
  if (iframeLoggerInstance) {
    iframeLoggerInstance.configure(config);
  }
}

/**
 * Get current context information for debugging
 * @returns {object} Context information
 */
export function getContextInfo() {
  const isMainThread = typeof window !== 'undefined' && window.self === window.top;
  const isWorker = typeof window === 'undefined';
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  
  return {
    isMainThread,
    isWorker, 
    isIframe,
    hasWindowLogger: typeof window !== 'undefined' && !!window.logger,
    hasWorkerLogger: !!workerLoggerInstance,
    hasIframeLogger: !!iframeLoggerInstance,
    hasLoggerService: !!LoggerService
  };
}

/**
 * Create a category-specific logger optimized for shared/iframe contexts
 * @param {string} categoryName - The category name for this logger
 * @returns {object} Logger with error, warn, info, debug, verbose methods
 */
export function createSharedLogger(categoryName) {
  return {
    error: (message, ...data) => logShared('error', categoryName, message, ...data),
    warn: (message, ...data) => logShared('warn', categoryName, message, ...data),
    info: (message, ...data) => logShared('info', categoryName, message, ...data),
    debug: (message, ...data) => logShared('debug', categoryName, message, ...data),
    verbose: (message, ...data) => logShared('verbose', categoryName, message, ...data),
  };
}

/**
 * Maintain backward compatibility - alias for createSharedLogger
 * @deprecated Use createSharedLogger instead for clarity
 */
export function createUniversalLogger(categoryName) {
  return createSharedLogger(categoryName);
}

/**
 * Internal logging function optimized for iframe/shared contexts
 * @param {string} level - Log level
 * @param {string} categoryName - Category name
 * @param {string} message - Log message
 * @param {...any} data - Additional data
 */
function logShared(level, categoryName, message, ...data) {
  // Detect current context
  const isMainThread = typeof window !== 'undefined' && window.self === window.top;
  const isWorker = typeof window === 'undefined';
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  
  // Main thread: Use window.logger if available (fallback case)
  if (isMainThread && typeof window !== 'undefined' && window.logger) {
    window.logger[level](categoryName, message, ...data);
    return;
  }
  
  // Worker thread: Use worker logger instance if available and initialized
  if (isWorker && workerLoggerInstance && workerLoggerInstance.initialized) {
    workerLoggerInstance[level](categoryName, message, ...data);
    return;
  }
  
  // Iframe context: Use iframe logger instance if available and initialized
  if (isIframe && iframeLoggerInstance && iframeLoggerInstance.initialized) {
    iframeLoggerInstance[level](categoryName, message, ...data);
    return;
  }
  
  // Fallback to console with context-appropriate verbosity
  if (isWorker) {
    // In worker context, only log ERROR and WARN to keep console clean
    if (level === 'error' || level === 'warn') {
      const consoleMethod = console[level] || console.log;
      consoleMethod(`[${categoryName}] ${message}`, ...data);
    }
  } else if (isIframe) {
    // In iframe context, use consistent formatting but allow all levels
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[iframe:${categoryName}] ${message}`, ...data);
  } else {
    // In main thread fallback, log all levels
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[${categoryName}] ${message}`, ...data);
  }
}

// Export logger instances for direct access if needed
export { workerLoggerInstance, iframeLoggerInstance };
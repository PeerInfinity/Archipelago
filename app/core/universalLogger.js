/**
 * Universal Logger Factory (Main Thread Version)
 * 
 * Creates category-specific loggers that work across all execution contexts:
 * - Main thread: Uses window.logger (the global LoggerService instance)
 * - Worker thread: Uses a worker-local LoggerService instance  
 * - Iframe context: Should use the shared version at ../shared/universalLogger.js
 * 
 * This version is for main thread and worker contexts.
 * For iframe contexts, use the shared version.
 * 
 * Usage:
 * import { createUniversalLogger } from '../../app/core/universalLogger.js';
 * const logger = createUniversalLogger('myCategory');
 * logger.info('Hello world');
 */

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
    // Don't create worker logger in main thread
    return;
  }
  
  workerLoggerInstance = new LoggerService();
  workerLoggerInstance.configure({
    defaultLevel: 'WARN',
    categoryLevels: {},
    enabled: true,
    ...config
  });
  
  console.log('[universalLogger] Worker logger initialized');
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
  
  console.log('[universalLogger] Iframe logger initialized');
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
    hasIframeLogger: !!iframeLoggerInstance
  };
}

/**
 * Create a category-specific logger that works across all contexts
 * @param {string} categoryName - The category name for this logger
 * @returns {object} Logger with error, warn, info, debug, verbose methods
 */
export function createUniversalLogger(categoryName) {
  return {
    error: (message, ...data) => logUniversal('error', categoryName, message, ...data),
    warn: (message, ...data) => logUniversal('warn', categoryName, message, ...data),
    info: (message, ...data) => logUniversal('info', categoryName, message, ...data),
    debug: (message, ...data) => logUniversal('debug', categoryName, message, ...data),
    verbose: (message, ...data) => logUniversal('verbose', categoryName, message, ...data),
  };
}

/**
 * Internal logging function that routes to appropriate logger based on context
 * @param {string} level - Log level
 * @param {string} categoryName - Category name
 * @param {string} message - Log message
 * @param {...any} data - Additional data
 */
function logUniversal(level, categoryName, message, ...data) {
  // Detect current context
  const isMainThread = typeof window !== 'undefined' && window.self === window.top;
  const isWorker = typeof window === 'undefined';
  const isIframe = typeof window !== 'undefined' && window.self !== window.top;
  
  // Main thread: Use window.logger if available
  if (isMainThread && window.logger) {
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
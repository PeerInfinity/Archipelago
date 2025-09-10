/**
 * Utility module for merging multiple settings/configuration objects
 * Supports deep merging with override behavior
 */

/**
 * Deep merge two objects, with the second object overriding the first
 * @param {Object} target - The base object
 * @param {Object} source - The object to merge in (overrides target)
 * @returns {Object} - A new merged object (does not mutate inputs)
 */
export function deepMerge(target, source) {
  // Handle null/undefined cases
  if (!source) return target;
  if (!target) return source;
  
  // Handle non-object cases
  if (typeof target !== 'object' || typeof source !== 'object') {
    return source;
  }
  
  // Handle array cases - source arrays replace target arrays entirely
  if (Array.isArray(source)) {
    return [...source];
  }
  
  if (Array.isArray(target) && !Array.isArray(source)) {
    // If target is array but source is not, replace with source
    return source;
  }
  
  // Deep merge objects
  const result = { ...target };
  
  for (const key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      const sourceValue = source[key];
      const targetValue = target[key];
      
      if (sourceValue === null || sourceValue === undefined) {
        // Explicit null/undefined in source removes the key
        result[key] = sourceValue;
      } else if (
        typeof sourceValue === 'object' && 
        !Array.isArray(sourceValue) &&
        typeof targetValue === 'object' && 
        !Array.isArray(targetValue)
      ) {
        // Both are objects (not arrays), merge recursively
        result[key] = deepMerge(targetValue, sourceValue);
      } else {
        // For all other cases (primitives, arrays, mismatched types), source wins
        result[key] = sourceValue;
      }
    }
  }
  
  return result;
}

/**
 * Merge multiple configuration objects in sequence
 * Later objects override earlier ones
 * @param {...Object} configs - Configuration objects to merge
 * @returns {Object} - The merged configuration
 */
export function mergeConfigs(...configs) {
  if (configs.length === 0) return {};
  if (configs.length === 1) return configs[0] || {};
  
  return configs.reduce((merged, config) => deepMerge(merged, config), {});
}

/**
 * Load and merge multiple JSON files
 * @param {Array<string>} paths - Array of file paths to load and merge
 * @param {Function} fetchJsonFn - Function to fetch JSON (async (path, errorMsg) => object)
 * @param {Function} logFn - Optional logging function
 * @returns {Promise<Object>} - The merged configuration
 */
export async function loadAndMergeJsonFiles(paths, fetchJsonFn, logFn = console.log) {
  if (!paths || paths.length === 0) {
    return {};
  }
  
  const loadedConfigs = [];
  
  for (const path of paths) {
    if (!path) continue;
    
    try {
      logFn(`Loading configuration from: ${path}`);
      const config = await fetchJsonFn(path, `Error loading ${path}`);
      
      if (config) {
        loadedConfigs.push(config);
        logFn(`Successfully loaded: ${path}`);
      } else {
        logFn(`Warning: ${path} returned empty or null`);
      }
    } catch (error) {
      logFn(`Error loading ${path}: ${error.message}`);
      // Continue with other files even if one fails
    }
  }
  
  if (loadedConfigs.length === 0) {
    logFn('No configurations were successfully loaded');
    return {};
  }
  
  const merged = mergeConfigs(...loadedConfigs);
  logFn(`Merged ${loadedConfigs.length} configuration file(s)`);
  
  return merged;
}

/**
 * Helper to check if a config entry specifies multiple paths
 * @param {Object|string} configEntry - The config entry from modes.json
 * @returns {boolean} - True if multiple paths are specified
 */
export function hasMultiplePaths(configEntry) {
  return configEntry && 
         typeof configEntry === 'object' && 
         Array.isArray(configEntry.paths) && 
         configEntry.paths.length > 0;
}

/**
 * Get array of paths from a config entry
 * Handles both single path and multiple paths formats
 * @param {Object|string} configEntry - The config entry
 * @returns {Array<string>} - Array of paths (may be empty)
 */
export function getConfigPaths(configEntry) {
  if (!configEntry) return [];
  
  // Handle string path directly
  if (typeof configEntry === 'string') {
    return [configEntry];
  }
  
  // Handle object with paths array
  if (Array.isArray(configEntry.paths)) {
    return configEntry.paths.filter(p => p); // Filter out null/undefined
  }
  
  // Handle object with single path
  if (configEntry.path) {
    return [configEntry.path];
  }
  
  return [];
}
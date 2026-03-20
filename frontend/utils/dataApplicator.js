/**
 * Shared utility for applying loaded data (rules, settings, layout, module data).
 *
 * Used by jsonUI, editorUI, and codeMirror6UI so the logic lives in one place.
 */

import eventBus from '../app/core/eventBus.js';
import settingsManager from '../app/core/settingsManager.js';
import { centralRegistry } from '../app/core/centralRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('dataApplicator', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[dataApplicator] ${message}`, ...data);
  }
}

/**
 * Apply loaded data to the running application without a page reload.
 *
 * Handles rulesConfig, userSettings, layoutConfig, and any registered
 * module data handlers from the central registry.
 *
 * @param {object} loadedData - The data object (e.g. from a mode export).
 * @param {string} sourceName - Identifier for eventBus publish calls.
 * @returns {Promise<{requiresReload: boolean}>} Whether any data type required a reload.
 */
export async function applyLoadedData(loadedData, sourceName) {
  const handlers = centralRegistry.getAllJsonDataHandlers();
  let requiresReload = false;

  log('info', `Applying non-reload data (source: ${sourceName}):`, loadedData);

  for (const dataKey in loadedData) {
    if (dataKey === 'modeName' || dataKey === 'savedTimestamp') continue;

    if (dataKey === 'rulesConfig' && loadedData.rulesConfig) {
      log('info', 'Found rulesConfig, applying via files:jsonLoaded...');
      eventBus.publish('files:jsonLoaded', {
        jsonData: loadedData.rulesConfig,
        selectedPlayerId: '1',
        sourceName,
      }, sourceName);
    } else if (dataKey === 'userSettings' && loadedData.userSettings) {
      log('info', 'Found userSettings, applying settings...');
      try {
        await settingsManager.updateSettings(loadedData.userSettings);
        log('info', 'Settings applied successfully');
      } catch (e) {
        log('error', 'Error applying settings:', e);
      }
    } else if (dataKey === 'layoutConfig') {
      log('info', 'Found layoutConfig, applying live...');
      try {
        await applyLayoutConfig(loadedData[dataKey]);
        log('info', 'layoutConfig applied successfully');
      } catch (e) {
        log('error', 'Error applying layoutConfig live:', e);
      }
    } else if (dataKey === 'moduleConfig' && loadedData.moduleConfig) {
      if (loadedData.layoutConfig) {
        // Layout is also being applied — it handles panel creation/destruction.
        // Live enable/disable would race with the layout reload, so just store
        // the config for persistence and future saves.
        log('info', 'Found moduleConfig alongside layoutConfig — storing config only (layout handles panels)');
        window.G_combinedModeData.moduleConfig = loadedData.moduleConfig;
      } else {
        log('info', 'Found moduleConfig, applying live...');
        try {
          const result = await applyModuleConfig(loadedData.moduleConfig);
          if (result.liveChanges.length > 0) {
            log('info', 'moduleConfig live changes:', result.liveChanges);
          }
          if (result.deferredChanges.length > 0) {
            requiresReload = true;
            log('info', 'moduleConfig deferred changes (reload needed):', result.deferredChanges);
          }
          if (result.errors.length > 0) {
            log('error', 'moduleConfig errors:', result.errors);
          }
        } catch (e) {
          log('error', 'Error applying moduleConfig:', e);
        }
      }
    } else if (handlers.has(dataKey)) {
      const handler = handlers.get(dataKey);
      if (!handler.requiresReload) {
        log('info', `Applying non-reload data for ${dataKey}...`);
        try {
          handler.applyLoadedDataFunction(loadedData[dataKey]);
        } catch (e) {
          log('error', `Error calling applyLoadedDataFunction for ${dataKey}:`, e);
        }
      } else {
        requiresReload = true;
        log('info', `Data type ${dataKey} requires reload.`);
      }
    }
  }

  return { requiresReload };
}

/**
 * Extract a direct Golden Layout config from a value that may be either a
 * direct GL config (`{ root: ... }`) or a preset collection
 * (`{ default: { root: ... }, compact: { root: ... } }`).
 *
 * @param {object} config - Layout config in either format.
 * @returns {object} A direct GL config with a `.root` property.
 */
export function extractDirectLayoutConfig(config) {
  if (!config || typeof config !== 'object') return config;
  // Already a direct GL config
  if (config.root) return config;
  // Preset collection — try 'default', then first key with a .root
  if (config.default && config.default.root) return config.default;
  for (const key in config) {
    if (Object.prototype.hasOwnProperty.call(config, key) &&
        config[key] && typeof config[key] === 'object' && config[key].root) {
      return config[key];
    }
  }
  return config; // give it back as-is and let the caller deal with it
}

/**
 * Apply a Golden Layout configuration live, without reloading the page.
 *
 * @param {object} layoutConfig - Raw or saved layout configuration object.
 *   May be a direct GL config or a preset collection.
 */
export async function applyLayoutConfig(layoutConfig) {
  if (!layoutConfig) {
    log('warn', 'No layout config provided to apply');
    return;
  }

  log('info', 'Attempting to apply layout config:', layoutConfig);

  // Normalise: if we received a preset collection, extract the direct GL config
  const directConfig = extractDirectLayoutConfig(layoutConfig);
  if (directConfig !== layoutConfig) {
    log('info', 'Extracted direct GL config from preset collection');
  }

  let goldenLayoutInstance = null;

  if (window.goldenLayoutInstance) {
    goldenLayoutInstance = window.goldenLayoutInstance;
    log('info', 'Using window.goldenLayoutInstance for layout application');
  } else {
    throw new Error('No Golden Layout instance available for layout application');
  }

  // Transform layout config to ensure size values are strings (Golden Layout 2.x requirement)
  const transformedConfig = transformLayoutConfigSizes(directConfig);
  log('info', 'Transformed layout config sizes from numbers to strings');

  if (typeof goldenLayoutInstance.loadLayout === 'function') {
    try {
      await goldenLayoutInstance.loadLayout(transformedConfig);
      log('info', 'Layout loaded successfully using loadLayout()');

      // Re-publish the initialization event so newly created panels populate
      // their data.  On initial page load this fires once from index.js;
      // after a live layout reload the new component instances need it again.
      // Deferred by a frame so Golden Layout finishes its layout pass and
      // panel containers have proper dimensions before panels try to render.
      await new Promise(resolve => requestAnimationFrame(resolve));
      log('info', 'Re-publishing app:readyForUiDataLoad for new panels');
      eventBus.publish('app:readyForUiDataLoad', {
        getModuleManager: () => window.moduleManagerApi,
      }, 'core');
    } catch (e) {
      log('error', 'Error calling loadLayout():', e);
      throw new Error(`Failed to load layout: ${e.message}`);
    }
  } else {
    throw new Error('Golden Layout instance does not have loadLayout() method available');
  }
}

/**
 * Transform a layout config for Golden Layout 2.x compatibility:
 * 1. Remove problematic 'dimensions' entries
 * 2. Remove 'activeItemIndex'
 * 3. Convert 'size' attributes to 'width'/'height' based on parent container type
 *
 * @param {object} config - Raw layout configuration.
 * @returns {object} Transformed configuration.
 */
export function transformLayoutConfigSizes(config) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  log('info', 'Processing layout config: convert size attributes based on container type');
  return convertSizeAttributes(config);
}

/**
 * Recursively converts size attributes based on parent-child relationships
 * and removes dimensions/activeItemIndex entries.
 */
function convertSizeAttributes(config, parentType = null) {
  if (!config || typeof config !== 'object') {
    return config;
  }

  if (Array.isArray(config)) {
    return config.map(item => convertSizeAttributes(item, parentType));
  }

  const converted = {};
  for (const [key, value] of Object.entries(config)) {
    // Remove "dimensions" entries
    if (key === 'dimensions') {
      log('info', 'Removed "dimensions" property from layout config');
      continue;
    }

    // Remove "activeItemIndex" so no panel is forced active on load
    if (key === 'activeItemIndex') {
      log('info', 'Removed "activeItemIndex" property from layout config');
      continue;
    }

    // Handle "size" attribute based on parent-child relationship
    if (key === 'size') {
      if (config.type === 'stack' && parentType === 'row') {
        converted.width = value;
        log('info', `Converted "size" to "width" for stack in row container: ${value}`);
      } else if (config.type === 'stack' && parentType === 'column') {
        converted.height = value;
        log('info', `Converted "size" to "height" for stack in column container: ${value}`);
      } else {
        log('info', `Removed "size" property from ${config.type || 'unknown'} container (parent: ${parentType || 'none'})`);
      }
      continue;
    }

    if (typeof value === 'object' && value !== null) {
      const currentType = config.type || parentType;
      converted[key] = convertSizeAttributes(value, currentType);
    } else {
      converted[key] = value;
    }
  }

  return converted;
}

/**
 * Apply a moduleConfig object live: enable/disable modules and update
 * G_combinedModeData.moduleConfig for persistence.
 *
 * @param {object} newModuleConfig - A moduleConfig with loadPriority and moduleDefinitions.
 * @returns {Promise<{liveChanges: string[], deferredChanges: string[], errors: string[]}>}
 */
async function applyModuleConfig(newModuleConfig) {
  const liveChanges = [];
  const deferredChanges = [];
  const errors = [];

  const moduleManager = window.moduleManagerApi;
  if (!moduleManager || typeof moduleManager.getAllModuleStates !== 'function') {
    errors.push('moduleManagerApi not available');
    return { liveChanges, deferredChanges, errors };
  }

  const currentConfig = window.G_combinedModeData?.moduleConfig;
  if (!currentConfig) {
    errors.push('G_combinedModeData.moduleConfig not available');
    return { liveChanges, deferredChanges, errors };
  }

  const newDefs = newModuleConfig.moduleDefinitions || {};
  const currentDefs = currentConfig.moduleDefinitions || {};
  const runtimeStates = moduleManager.getAllModuleStates();

  // --- Detect deferred (non-live) changes ---

  // loadPriority order change
  const currentPriority = currentConfig.loadPriority || [];
  const newPriority = newModuleConfig.loadPriority || [];
  if (JSON.stringify(currentPriority) !== JSON.stringify(newPriority)) {
    deferredChanges.push('loadPriority order changed');
  }

  // Check for new module definitions, path changes, and requires changes
  for (const [moduleId, newDef] of Object.entries(newDefs)) {
    const currentDef = currentDefs[moduleId];
    if (!currentDef) {
      deferredChanges.push(`new module definition: ${moduleId}`);
      continue;
    }
    if (newDef.path !== currentDef.path) {
      deferredChanges.push(`path changed for ${moduleId}`);
    }
    if (JSON.stringify(newDef.requires || []) !== JSON.stringify(currentDef.requires || [])) {
      deferredChanges.push(`requires changed for ${moduleId}`);
    }
  }

  // --- Diff enabled flags ---
  const toEnable = [];
  const toDisable = [];

  for (const [moduleId, newDef] of Object.entries(newDefs)) {
    const runtimeState = runtimeStates[moduleId];
    if (!runtimeState) continue; // new module — already flagged as deferred

    const currentlyEnabled = runtimeState.enabled;
    const wantEnabled = newDef.enabled !== false; // default to true if not explicitly false

    if (currentlyEnabled && !wantEnabled) {
      toDisable.push(moduleId);
    } else if (!currentlyEnabled && wantEnabled) {
      toEnable.push(moduleId);
    }
  }

  // --- Disable modules (reverse loadPriority order: dependents before dependencies) ---
  const priorityOrder = newPriority.length > 0 ? newPriority : currentPriority;
  const disableOrder = toDisable.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    // Reverse order: higher index (later loaded / dependents) first
    return (idxB === -1 ? Infinity : idxB) - (idxA === -1 ? Infinity : idxA);
  });

  for (const moduleId of disableOrder) {
    try {
      await moduleManager.disableModule(moduleId);
      liveChanges.push(`disabled ${moduleId}`);
    } catch (e) {
      errors.push(`failed to disable ${moduleId}: ${e.message}`);
    }
  }

  // --- Enable modules (loadPriority order: dependencies before dependents) ---
  const enableOrder = toEnable.sort((a, b) => {
    const idxA = priorityOrder.indexOf(a);
    const idxB = priorityOrder.indexOf(b);
    return (idxA === -1 ? Infinity : idxA) - (idxB === -1 ? Infinity : idxB);
  });

  for (const moduleId of enableOrder) {
    // Check that required modules are enabled (or being enabled)
    const requires = newDefs[moduleId]?.requires || currentDefs[moduleId]?.requires || [];
    const allStates = moduleManager.getAllModuleStates();
    const missingReqs = requires.filter(reqId => {
      // OK if already enabled or in our toEnable list
      const reqState = allStates[reqId];
      return !(reqState && reqState.enabled) && !toEnable.includes(reqId);
    });

    if (missingReqs.length > 0) {
      errors.push(`skipped enabling ${moduleId}: required modules disabled: ${missingReqs.join(', ')}`);
      continue;
    }

    try {
      await moduleManager.enableModule(moduleId);
      liveChanges.push(`enabled ${moduleId}`);
    } catch (e) {
      errors.push(`failed to enable ${moduleId}: ${e.message}`);
    }
  }

  // --- Update G_combinedModeData.moduleConfig with full new config for persistence ---
  window.G_combinedModeData.moduleConfig = newModuleConfig;

  return { liveChanges, deferredChanges, errors };
}

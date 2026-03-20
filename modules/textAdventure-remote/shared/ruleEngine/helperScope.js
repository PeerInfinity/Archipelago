/**
 * Helper scope resolution for rule evaluation.
 *
 * Resolves helper function parameters from arguments, slot_data, or settings.
 * This is the shared logic used by both snapshotInterface.js and ruleEvaluator.js
 * when evaluating helper definitions exported from Python to rules.json.
 *
 * @module shared/ruleEngine/helperScope
 */

/**
 * Resolves helper function parameters from arguments, slot_data, or settings.
 *
 * Parameter resolution order:
 * 1. Use provided argument if available
 * 2. Try exact parameter name match in slot_data
 * 3. Try exact parameter name match in settings
 * 4. Try mapped name from helperDefinition.param_mappings (exported from Python)
 *
 * @param {Object} helperDefinition - The helper definition from rules.json
 * @param {Array} args - Arguments passed to the helper call
 * @param {Object} staticData - Static game data containing settings and slot_data
 * @param {string} playerIdStr - Player ID as string for lookup
 * @returns {Object} The resolved helper scope with parameter values
 */
export function resolveHelperScope(helperDefinition, args, staticData, playerIdStr) {
  const helperScope = {};

  if (!helperDefinition.params || !Array.isArray(helperDefinition.params)) {
    return helperScope;
  }

  // Get world data for this player
  const playerWorld = staticData?.world?.[playerIdStr] || {};
  // slot_data now in world, with fallback to game_info for backwards compatibility
  const playerSlotData = playerWorld?.slot_data || staticData?.game_info?.[playerIdStr]?.slot_data || {};
  const playerOptions = playerWorld.options || playerWorld;
  // Get param_mappings from the helper definition (exported from Python game handler)
  const paramMappings = helperDefinition.param_mappings || {};

  helperDefinition.params.forEach((paramName, index) => {
    if (index < args.length) {
      // Use provided argument
      helperScope[paramName] = args[index];
    } else {
      // Try to resolve from slot_data or settings
      if (playerSlotData[paramName] !== undefined) {
        helperScope[paramName] = playerSlotData[paramName];
      } else if (playerOptions[paramName] !== undefined) {
        helperScope[paramName] = playerOptions[paramName];
      } else {
        // Try mapped parameter name from helper definition
        const mappedName = paramMappings[paramName];
        if (mappedName) {
          if (playerSlotData[mappedName] !== undefined) {
            helperScope[paramName] = playerSlotData[mappedName];
          } else if (playerOptions[mappedName] !== undefined) {
            helperScope[paramName] = playerOptions[mappedName];
          }
        }
      }
    }
  });

  return helperScope;
}

/**
 * Clear the helper cache on a context object.
 * Should be called when the state changes to ensure helper results are re-evaluated.
 * @param {Object} context - The snapshot interface context
 */
export function clearHelperCache(context) {
  if (context && context._helperCache) {
    context._helperCache.clear();
  }
}

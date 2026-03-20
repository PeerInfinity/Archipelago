/**
 * Attribute access AST handler.
 *
 * Handles: attribute
 *
 * @module shared/ruleEngine/astAttributes
 */

import { log, DEFAULT_PLAYER_ID } from './helpers.js';

export function createAttributeHandlers(evaluateRule) {
  return {
    'attribute': (rule, context, depth, localScope, isValidContext) => {
      // Check if object is already a plain value (not a rule to evaluate)
      let baseObject;
      if (rule.object && typeof rule.object === 'object' &&
          !rule.object.type && !rule.object.rule && !Array.isArray(rule.object)) {
        baseObject = rule.object;
      } else {
        baseObject = evaluateRule(rule.object, context, depth + 1, localScope);
      }

      // Special case: If we're accessing world.* and the property doesn't exist on the world object
      if (rule.object?.type === 'name' && rule.object?.name === 'world' &&
          baseObject && typeof baseObject === 'object' && baseObject[rule.attr] === undefined) {
        if (context.getStaticData) {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const settingValue = worldData[playerId][rule.attr];
            if (settingValue !== undefined) {
              return settingValue;
            }
          }
        }
      }

      // Special case: if baseObject is undefined and the object was "self"
      if (baseObject === undefined && rule.object && rule.object.type === 'name' && rule.object.name === 'self') {
        if (context.getStaticData || context.staticData) {
          const staticData = context.getStaticData ? context.getStaticData() : context.staticData;
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const worldData = staticData?.world;

          if (rule.attr === 'options' && worldData && worldData[playerId]) {
            return worldData[playerId];
          }

          if (worldData && worldData[playerId]) {
            const settingValue = worldData[playerId][rule.attr];
            if (settingValue !== undefined) {
              return settingValue;
            }
          }
        }
        return undefined;
      }

      // Special case: if baseObject is undefined and the object was "options"
      if (baseObject === undefined && rule.object && rule.object.type === 'name' && rule.object.name === 'options') {
        if (context.getStaticData) {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const settingValue = worldData[playerId][rule.attr];
            if (settingValue !== undefined) {
              return settingValue;
            }
          }
        }

        if (rule.attr === 'keyblades_unlock_chests') return false;
        if (rule.attr === 'advanced_logic') return false;
        return undefined;
      }

      // Special case: if baseObject is undefined and the object was "settings" or "world"
      if (baseObject === undefined && rule.object && rule.object.type === 'name' &&
          (rule.object.name === 'settings' || rule.object.name === 'world')) {
        if (context.getStaticData) {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const settingValue = worldData[playerId][rule.attr];
            if (settingValue !== undefined) {
              return settingValue;
            }
          }
        }
        return undefined;
      }

      // Special case: if baseObject is undefined and the object was "location_name"
      if (baseObject === undefined && rule.object && rule.object.type === 'name' &&
          rule.object.name === 'location_name') {
        if (context.getStaticData) {
          const staticData = context.getStaticData();
          const playerId = context.playerId || context.getPlayerId?.() || context.getPlayerSlot?.() || DEFAULT_PLAYER_ID;
          const worldData = staticData?.world;
          if (worldData && worldData[playerId]) {
            const attrValue = worldData[playerId][rule.attr];
            if (attrValue !== undefined) {
              return attrValue;
            }
          }
        }
        return undefined;
      }

      if (baseObject && typeof baseObject === 'object') {
        // Special handling for region reference objects
        if (baseObject.__regionRef && rule.attr === 'can_reach') {
          return { __regionCanReach: true, regionName: baseObject.regionName };
        }

        // Special handling for entrance objects
        if (baseObject.__entranceRef && rule.attr === 'can_reach') {
          return {
            __entranceCanReach: true,
            entranceName: baseObject.name,
            parentRegionName: baseObject.parent_region_name,
            accessRule: baseObject.access_rule
          };
        }

        // Special handling for parent_region attribute on location objects
        if (rule.attr === 'parent_region' && baseObject.parent_region_name) {
          if (context.getStaticData && context.getStaticData().regions) {
            const regions = context.getStaticData().regions;
            const region = regions.get(baseObject.parent_region_name);
            if (region) {
              return region;
            }
          }
          return undefined;
        }

        // Special handling for shop.region
        if (rule.attr === 'region' && baseObject.inventory && typeof baseObject.region === 'string') {
          return { __regionRef: true, regionName: baseObject.region };
        }

        // Special handling for boss attribute
        if (rule.attr === 'boss') {
          const hasBoss = baseObject.boss !== undefined;
          const hasBosses = baseObject.bosses !== undefined;

          if (!hasBoss && hasBosses) {
            const boss = baseObject.bosses["None"] || Object.values(baseObject.bosses)[0];
            return boss;
          }
        }

        // Special handling for dungeon attribute
        if (rule.attr === 'dungeon') {
          const hasDungeon = baseObject.dungeon !== undefined;

          if (hasDungeon) {
            const dungeonValue = baseObject.dungeon;

            if (typeof dungeonValue === 'string') {
              const dungeonName = dungeonValue;
              const dungeons = context.dungeons || context.getAllDungeons?.() || context.getStaticData?.().dungeons;

              if (dungeons) {
                const dungeon = dungeons.get(dungeonName);
                if (dungeon) {
                  return dungeon;
                }
              }
              return dungeonName;
            }
            return dungeonValue;
          }
        }

        // First try direct property access
        let attrValue = baseObject[rule.attr];

        // If not found and baseObject is an array, try Python-to-JavaScript method mapping
        if (attrValue === undefined && Array.isArray(baseObject)) {
          const pythonToJsArrayMethods = {
            'index': 'indexOf',
            'append': 'push',
            'remove': 'splice',
            'count': null,
            '__contains__': 'includes',
          };
          const jsMethodName = pythonToJsArrayMethods[rule.attr];
          if (jsMethodName) {
            attrValue = baseObject[jsMethodName];
          }
        }

        // If not found, try resolveAttribute for mapping/transformation
        if (attrValue === undefined && typeof context.resolveAttribute === 'function') {
          attrValue = context.resolveAttribute(baseObject, rule.attr);
        }

        // If the attribute value is itself a rule object that needs evaluation
        if (attrValue && typeof attrValue === 'object' && attrValue.type && typeof attrValue.type === 'string') {
          return evaluateRule(attrValue, context, depth + 1);
        }

        if (typeof attrValue === 'function') {
          return attrValue.bind(baseObject);
        }

        return attrValue;
      } else {
        // Special case: Python Option objects use .value to get the actual value
        if (rule.attr === 'value' && baseObject !== undefined && baseObject !== null) {
          return baseObject;
        }

        // Special case: Allow resolveAttribute to handle string baseObjects
        if (typeof baseObject === 'string' && typeof context.resolveAttribute === 'function') {
          const resolvedValue = context.resolveAttribute(baseObject, rule.attr);
          if (resolvedValue !== undefined) {
            return resolvedValue;
          }
        }

        return undefined;
      }
    },
  };
}

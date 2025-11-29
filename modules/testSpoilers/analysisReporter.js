/**
 * Analysis Reporter Module for Test Spoilers
 *
 * Handles diagnostic analysis and reporting of location and region accessibility mismatches.
 * Extracted from testSpoilerUI.js to improve code organization and maintainability.
 *
 * DATA FLOW:
 * Input: Mismatch details + static data + current state
 *   - locationNames/regionNames: Array<string> (items to analyze)
 *   - staticData: Object (game structure and rules)
 *   - currentWorkerSnapshot: Object (current state from worker)
 *   - snapshotInterface: Object (for rule evaluation - locations only)
 *   - playerId: number (for context - regions only)
 *   - analysisType: 'MISSING_FROM_STATE' | 'EXTRA_IN_STATE'
 *
 * Processing:
 *   Location Analysis:
 *   ├─> Log context (inventory, reachable regions)
 *   ├─> For each location:
 *   │   ├─> Get location definition
 *   │   ├─> Check parent region reachability
 *   │   ├─> Evaluate access rule
 *   │   ├─> Log detailed rule breakdown (via ruleEvaluator)
 *   │   └─> Identify blocking conditions
 *
 *   Region Analysis:
 *   ├─> Get currently accessible regions
 *   ├─> Log context (accessible regions, inventory)
 *   ├─> For each region:
 *   │   ├─> Find exits leading to region
 *   │   ├─> For each exit:
 *   │   │   ├─> Evaluate exit access rule
 *   │   │   ├─> Log detailed rule breakdown
 *   │   │   └─> Assess why exit is blocked/accessible
 *   │   └─> Provide final assessment
 *
 * Output: Console logs with detailed diagnostic information
 *   - Context about current state (inventory, regions)
 *   - Location/region definitions
 *   - Access rule structures and evaluation results
 *   - Detailed rule tree analysis
 *   - Assessment of why items are failing
 *
 * @module testSpoilers/analysisReporter
 */

import { createUniversalLogger } from '../../app/core/universalLogger.js';
import { createStateSnapshotInterface } from '../shared/stateInterface.js';
import { evaluateRule } from '../shared/ruleEngine.js';

const logger = createUniversalLogger('testSpoilerUI:AnalysisReporter');

export class AnalysisReporter {
  constructor(ruleEvaluator, logCallback) {
    this.ruleEvaluator = ruleEvaluator;
    this.logCallback = logCallback; // Callback to log UI messages: (type, message, ...data) => void
    logger.debug('AnalysisReporter constructor called');
  }

  /**
   * Analyzes failing locations by examining their region accessibility and rule tree evaluation
   *
   * DATA FLOW:
   * Input: List of failing locations + context
   *   ├─> locationNames: Array<string> (locations to analyze)
   *   ├─> staticData: Object (game data)
   *   ├─> currentWorkerSnapshot: Object (current state)
   *   ├─> snapshotInterface: Object (for rule evaluation)
   *   ├─> analysisType: 'MISSING_FROM_STATE' | 'EXTRA_IN_STATE'
   *   ├─> playerId: number (for context)
   *
   * Processing:
   *   ├─> Log player inventory for context
   *   ├─> For each failing location:
   *   │   ├─> Get location definition
   *   │   ├─> Get parent region
   *   │   ├─> Check parent region reachability
   *   │   ├─> Get location access rule
   *   │   ├─> Evaluate access rule
   *   │   ├─> Log detailed rule breakdown (via ruleEvaluator)
   *   │   └─> Identify blocking conditions
   *
   * Output: Diagnostic logs
   *   ├─> Console logs with detailed analysis
   *   ├─> Location name and definition
   *   ├─> Parent region status
   *   ├─> Access rule evaluation
   *   ├─> Rule tree breakdown
   *   └─> Assessment of why location is failing
   *
   * @param {string[]} locationNames - Array of location names to analyze
   * @param {Object} staticData - Static game data
   * @param {Object} currentWorkerSnapshot - Current state snapshot from worker
   * @param {Object} snapshotInterface - Interface for evaluating rules against snapshot
   * @param {string} analysisType - Type of analysis (MISSING_FROM_STATE or EXTRA_IN_STATE)
   * @param {number} playerId - Player ID for context
   */
  analyzeFailingLocations(locationNames, staticData, currentWorkerSnapshot, snapshotInterface, analysisType, playerId) {
    this.logCallback('info', `[LOCATION ANALYSIS] Analyzing ${locationNames.length} ${analysisType} locations:`);

    // First, log some general context about the state
    this.logCallback('info', `[CONTEXT] Current snapshot overview:`);
    if (currentWorkerSnapshot.inventory) {
      const inventory = currentWorkerSnapshot.inventory;
      const itemCount = Object.keys(inventory).length;
      const totalItems = Object.values(inventory).reduce((sum, count) => sum + count, 0);
      this.logCallback('info', `  Player ${playerId} inventory: ${itemCount} unique items, ${totalItems} total items`);
      this.logCallback('info', `  Sample items: ${Object.entries(inventory).slice(0, 5).map(([item, count]) => `${item}:${count}`).join(', ')}${itemCount > 5 ? '...' : ''}`);
    } else {
      this.logCallback('info', `  Player ${playerId} inventory: Empty or not found`);
    }

    const reachableRegions = Object.entries(currentWorkerSnapshot.regionReachability || {})
      .filter(([region, status]) => status === 'reachable' || status === 'checked')
      .map(([region]) => region);
    this.logCallback('info', `  Reachable regions (${reachableRegions.length}): ${reachableRegions.slice(0, 10).join(', ')}${reachableRegions.length > 10 ? '...' : ''}`);

    // Log available functions in snapshotInterface
    const availableFunctions = Object.keys(snapshotInterface).filter(k => typeof snapshotInterface[k] === 'function');
    this.logCallback('info', `  Available helper functions: ${availableFunctions.join(', ')}`);

    this.logCallback('info', ''); // Separator

    for (const locName of locationNames) {
      // staticData.locations is always a Map after initialization
      const locDef = staticData.locations.get(locName);

      if (!locDef) {
        this.logCallback('error', `  ${locName}: Location definition not found in static data`);
        const sampleKeys = Array.from(staticData.locations.keys()).slice(0, 5).join(', ');
        this.logCallback('info', `    Available locations sample: ${sampleKeys}...`);
        continue;
      }

      const parentRegionName = locDef.parent_region || locDef.region;
      const parentRegionReachabilityStatus = currentWorkerSnapshot.regionReachability?.[parentRegionName];
      const isParentRegionReachable = parentRegionReachabilityStatus === 'reachable' || parentRegionReachabilityStatus === 'checked';

      this.logCallback('info', `  ${locName}:`);
      this.logCallback('info', `    Region: ${parentRegionName} (${parentRegionReachabilityStatus || 'undefined'}) ${isParentRegionReachable ? '✓' : '✗'}`);
      this.logCallback('info', `    Location definition: ${JSON.stringify(locDef)}`);

      const locationAccessRule = locDef.access_rule;
      if (!locationAccessRule) {
        this.logCallback('info', `    Access Rule: None (always accessible if region is reachable)`);
        continue;
      }

      this.logCallback('info', `    Access Rule Structure: ${JSON.stringify(locationAccessRule)}`);

      // Evaluate the rule and provide detailed breakdown
      let locationRuleResult;
      try {
        // Create a location-specific snapshotInterface with the location as context for analysis
        const locationSnapshotInterface = createStateSnapshotInterface(
          currentWorkerSnapshot,
          staticData,
          { location: locDef } // Pass the location definition as context
        );

        locationRuleResult = evaluateRule(locationAccessRule, locationSnapshotInterface);
        this.logCallback('info', `    Access Rule Result: ${locationRuleResult} ${locationRuleResult ? '✓' : '✗'}`);

        // Provide detailed rule breakdown using the location-specific interface
        this.logCallback('info', `    Detailed Rule Analysis:`);
        this.ruleEvaluator.analyzeRuleTree(locationAccessRule, locationSnapshotInterface, '      ');

      } catch (error) {
        this.logCallback('error', `    Access Rule Evaluation Error: ${error.message}`);
        this.logCallback('error', `    Error stack: ${error.stack}`);
        this.logCallback('info', `    SnapshotInterface keys: ${Object.keys(locationSnapshotInterface).join(', ')}`);
        locationRuleResult = false; // Set explicit result for caught errors
      }

      // Final assessment
      const shouldBeAccessible = isParentRegionReachable && (locationRuleResult === true);
      const actuallyAccessible = analysisType === 'EXTRA_IN_STATE';

      if (analysisType === 'MISSING_FROM_STATE') {
        this.logCallback('info', `    Expected: Accessible (region: ${isParentRegionReachable}, rule: ${locationRuleResult})`);
        this.logCallback('info', `    Actual: Not accessible in our implementation`);
        if (!isParentRegionReachable) {
          this.logCallback('error', `    ISSUE: Region ${parentRegionName} is not reachable`);
        } else if (locationRuleResult !== true) {
          this.logCallback('error', `    ISSUE: Access rule evaluation failed`);
        }
      } else {
        this.logCallback('info', `    Expected: Not accessible according to Python log`);
        this.logCallback('info', `    Actual: Accessible in our implementation (region: ${isParentRegionReachable}, rule: ${locationRuleResult})`);
      }

      this.logCallback('info', ''); // Empty line for readability
    }
  }

  /**
   * Analyzes failing regions by finding exits that lead to them and examining their access rules
   *
   * DATA FLOW:
   * Input: List of failing regions + context
   *   ├─> regionNames: Array<string> (regions to analyze)
   *   ├─> staticData: Object (game data)
   *   ├─> currentWorkerSnapshot: Object (current state)
   *   ├─> playerId: number
   *   ├─> analysisType: 'MISSING_FROM_STATE' | 'EXTRA_IN_STATE'
   *
   * Processing:
   *   ├─> Get currently accessible regions for context
   *   ├─> Log player inventory for context
   *   ├─> For each failing region:
   *   │   ├─> Get region definition
   *   │   ├─> Find all exits leading to this region
   *   │   ├─> For exits from accessible regions:
   *   │   │   ├─> Log exit definition
   *   │   │   ├─> Evaluate exit access rule
   *   │   │   ├─> Log detailed rule breakdown
   *   │   │   └─> Assess why exit is blocked
   *   │   ├─> For exits from inaccessible regions:
   *   │   │   └─> Log why source region is blocked
   *   │   └─> Provide final assessment
   *
   * Output: Diagnostic logs
   *   ├─> Console logs with detailed analysis
   *   ├─> Region name and definition
   *   ├─> Exit information
   *   ├─> Source region status
   *   ├─> Exit access rule evaluation
   *   └─> Assessment of why region is failing
   *
   * @param {Array} regionNames - List of region names to analyze
   * @param {Object} staticData - Static game data
   * @param {Object} currentWorkerSnapshot - Current state snapshot from worker
   * @param {number} playerId - Player ID for context
   * @param {string} analysisType - Type of analysis (MISSING_FROM_STATE or EXTRA_IN_STATE)
   */
  analyzeFailingRegions(regionNames, staticData, currentWorkerSnapshot, playerId, analysisType) {
    this.logCallback('info', `[REGION ANALYSIS] Analyzing ${regionNames.length} ${analysisType} regions:`);

    // Get list of currently accessible regions for context
    const accessibleRegions = Object.entries(currentWorkerSnapshot.regionReachability || {})
      .filter(([region, status]) => {
        if (status !== 'reachable' && status !== 'checked') return false;
        // staticData.regions is always a Map after initialization
        return staticData.regions.has(region);
      })
      .map(([region]) => region);

    this.logCallback('info', `[CONTEXT] Currently accessible regions (${accessibleRegions.length}): ${accessibleRegions.slice(0, 10).join(', ')}${accessibleRegions.length > 10 ? '...' : ''}`);

    // Log player inventory for context
    if (currentWorkerSnapshot.inventory) {
      const inventory = currentWorkerSnapshot.inventory;
      const itemCount = Object.keys(inventory).length;
      const totalItems = Object.values(inventory).reduce((sum, count) => sum + count, 0);
      this.logCallback('info', `[CONTEXT] Player ${playerId} inventory: ${itemCount} unique items, ${totalItems} total items`);
    } else {
      this.logCallback('info', `[CONTEXT] Player ${playerId} inventory: Empty or not found`);
    }

    this.logCallback('info', ''); // Separator

    for (const targetRegionName of regionNames) {
      // staticData.regions is always a Map after initialization
      const targetRegionDef = staticData.regions.get(targetRegionName);

      if (!targetRegionDef) {
        this.logCallback('error', `  ${targetRegionName}: Region definition not found in static data`);
        continue;
      }

      this.logCallback('info', `  ${targetRegionName}:`);
      this.logCallback('info', `    Current status: ${currentWorkerSnapshot.regionReachability?.[targetRegionName] || 'undefined'}`);
      this.logCallback('info', `    Region definition: ${JSON.stringify(targetRegionDef)}`);

      // Find all exits from accessible regions that lead to this target region
      const exitsToTarget = [];

      for (const sourceRegionName of accessibleRegions) {
        // staticData.regions is always a Map after initialization
        const sourceRegionDef = staticData.regions.get(sourceRegionName);
        if (!sourceRegionDef || !sourceRegionDef.exits) continue;

        for (const exitName in sourceRegionDef.exits) {
          const exitDef = sourceRegionDef.exits[exitName];
          if (exitDef.connected_region === targetRegionName) {
            exitsToTarget.push({
              exitName,
              sourceRegion: sourceRegionName,
              exitDef
            });
          }
        }
      }

      if (exitsToTarget.length === 0) {
        this.logCallback('warn', `    No exits found from currently accessible regions to ${targetRegionName}`);
        this.logCallback('info', `    Note: Only checking exits from accessible regions (${accessibleRegions.length} regions)`);

        // Check for exits from inaccessible regions to provide more helpful information
        const exitsFromInaccessibleRegions = [];
        // staticData.regions is always a Map after initialization
        const allRegions = Array.from(staticData.regions.keys());
        const inaccessibleRegions = allRegions.filter(region => !accessibleRegions.includes(region));

        for (const sourceRegionName of inaccessibleRegions) {
          // staticData.regions is always a Map after initialization
          const sourceRegionDef = staticData.regions.get(sourceRegionName);
          if (!sourceRegionDef || !sourceRegionDef.exits) continue;

          for (const exitName in sourceRegionDef.exits) {
            const exitDef = sourceRegionDef.exits[exitName];
            if (exitDef.connected_region === targetRegionName) {
              exitsFromInaccessibleRegions.push({
                exitName,
                sourceRegion: sourceRegionName,
                exitDef,
                sourceStatus: currentWorkerSnapshot.regionReachability?.[sourceRegionName] || 'unreachable'
              });
            }
          }
        }

        if (exitsFromInaccessibleRegions.length > 0) {
          this.logCallback('info', `    Found ${exitsFromInaccessibleRegions.length} exit(s) from inaccessible regions:`);
          for (const exitInfo of exitsFromInaccessibleRegions) {
            this.logCallback('info', `      Exit: ${exitInfo.exitName} (from ${exitInfo.sourceRegion} - status: ${exitInfo.sourceStatus})`);
            this.logCallback('info', `        Exit definition: ${JSON.stringify(exitInfo.exitDef)}`);

            // Analyze why the source region is inaccessible
            if (exitInfo.sourceStatus === 'unreachable' || !exitInfo.sourceStatus) {
              this.logCallback('info', `        → Source region "${exitInfo.sourceRegion}" is not accessible, blocking this exit`);
            }
          }
        } else {
          this.logCallback('info', `    No exits found from any region to ${targetRegionName}`);
          this.logCallback('info', `    This might be a starting region or there could be a data issue`);
        }
      } else {
        this.logCallback('info', `    Found ${exitsToTarget.length} exit(s) from accessible regions:`);

        for (const exitInfo of exitsToTarget) {
          this.logCallback('info', `      Exit: ${exitInfo.exitName} (from ${exitInfo.sourceRegion})`);
          this.logCallback('info', `        Exit definition: ${JSON.stringify(exitInfo.exitDef)}`);

          const exitAccessRule = exitInfo.exitDef.access_rule;
          if (!exitAccessRule) {
            this.logCallback('info', `        Access Rule: None (always accessible)`);
            this.logCallback('info', `        → This exit should be accessible, so ${targetRegionName} should be reachable`);
          } else {
            this.logCallback('info', `        Access Rule Structure: ${JSON.stringify(exitAccessRule)}`);

            // Evaluate the exit rule
            try {
              const snapshotInterface = createStateSnapshotInterface(
                currentWorkerSnapshot,
                staticData
              );

              const exitRuleResult = evaluateRule(exitAccessRule, snapshotInterface);
              this.logCallback('info', `        Access Rule Result: ${exitRuleResult} ${exitRuleResult ? '✓' : '✗'}`);

              // Provide detailed rule breakdown
              this.logCallback('info', `        Detailed Rule Analysis:`);
              this.ruleEvaluator.analyzeRuleTree(exitAccessRule, snapshotInterface, '          ');

              if (exitRuleResult === true) {
                this.logCallback('info', `        → This exit should be accessible, so ${targetRegionName} should be reachable`);
              } else {
                this.logCallback('info', `        → This exit is not accessible, blocking access to ${targetRegionName}`);
              }

            } catch (error) {
              this.logCallback('error', `        Access Rule Evaluation Error: ${error.message}`);
            }
          }
          this.logCallback('info', ''); // Space between exits
        }
      }

      // Final assessment
      if (analysisType === 'MISSING_FROM_STATE') {
        this.logCallback('info', `    Expected: Region should be accessible according to Python log`);
        this.logCallback('info', `    Actual: Region is not accessible in our implementation`);

        if (exitsToTarget.length > 0) {
          const accessibleExits = exitsToTarget.filter(exit => {
            if (!exit.exitDef.access_rule) return true;
            try {
              const snapshotInterface = createStateSnapshotInterface(currentWorkerSnapshot, staticData);
              return evaluateRule(exit.exitDef.access_rule, snapshotInterface) === true;
            } catch {
              return false;
            }
          });

          if (accessibleExits.length > 0) {
            this.logCallback('error', `    ISSUE: ${accessibleExits.length} exit(s) should provide access but region is not reachable`);
          } else {
            this.logCallback('info', `    All exits have failed access rules - this may be correct`);
          }
        }
      } else {
        this.logCallback('info', `    Expected: Region should not be accessible according to Python log`);
        this.logCallback('info', `    Actual: Region is accessible in our implementation`);
      }

      this.logCallback('info', ''); // Empty line for readability between regions
    }
  }
}

export default AnalysisReporter;

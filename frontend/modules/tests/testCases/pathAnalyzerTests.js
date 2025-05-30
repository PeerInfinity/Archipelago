// frontend/modules/tests/testCases/pathAnalyzerTests.js

import { registerTest } from '../testRegistry.js';

export async function testPathAnalyzerIntegration(testController) {
  testController.log('Starting Path Analyzer integration test...');
  testController.reportCondition('Test started', true);

  try {
    // Step 1: Get state manager and verify it's available
    testController.log('Step 1: Verifying state manager availability...');
    testController.log(
      'testController.stateManager type:',
      typeof testController.stateManager
    );
    testController.log(
      'testController.stateManager:',
      testController.stateManager
    );

    if (!testController.stateManager) {
      throw new Error('testController.stateManager is null or undefined');
    }

    // The testController.stateManager is already the singleton instance, not a factory
    const sm = testController.stateManager;
    testController.log('State manager instance type:', typeof sm);
    testController.log('State manager instance:', sm);

    if (!sm) {
      throw new Error('State manager instance is null or undefined');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Set up test state with Bombos Tablet
    testController.log('Step 2: Setting up test state with Bombos Tablet...');
    if (typeof sm.applyTestInventoryAndEvaluate !== 'function') {
      throw new Error('sm.applyTestInventoryAndEvaluate is not a function');
    }

    await sm.applyTestInventoryAndEvaluate('Bombos Tablet', [], []);
    testController.reportCondition('Test inventory applied', true);

    // Step 3: Wait for state processing
    testController.log('Step 3: Waiting for state processing...');
    await new Promise((resolve) => setTimeout(resolve, 500));
    testController.reportCondition('State processing wait completed', true);

    // Step 4: Verify snapshot structure
    testController.log('Step 4: Verifying snapshot structure...');

    if (typeof sm.getSnapshot !== 'function') {
      throw new Error('sm.getSnapshot is not a function');
    }

    const snapshot = sm.getSnapshot();

    // Add detailed logging to understand the actual snapshot structure
    testController.log('Snapshot keys:', Object.keys(snapshot || {}));
    testController.log('Snapshot type:', typeof snapshot);
    testController.log('Snapshot is null/undefined:', snapshot == null);

    if (!snapshot) {
      testController.reportCondition('Snapshot structure validation', false);
      testController.log('✗ Snapshot is null or undefined');
      return false;
    }

    // Check for the actual structure - it might be snapshot.locations or snapshot.locationAccessibility
    const hasLocations =
      snapshot.locations ||
      snapshot.locationAccessibility ||
      snapshot.accessibility;
    if (!hasLocations) {
      testController.reportCondition('Snapshot structure validation', false);
      testController.log(
        '✗ Snapshot does not have expected locations structure'
      );
      testController.log(
        'Available snapshot properties:',
        Object.keys(snapshot)
      );
      testController.log(
        'Snapshot sample:',
        JSON.stringify(snapshot, null, 2).substring(0, 500) + '...'
      );
      return false;
    }
    testController.reportCondition('Snapshot structure validation', true);

    // Step 5: Check location accessibility
    testController.log('Step 5: Checking Bombos Tablet accessibility...');

    // Try different possible property names for location accessibility
    const locations =
      snapshot.locations ||
      snapshot.locationAccessibility ||
      snapshot.accessibility;
    const bombosTabletAccessible =
      locations && locations['Bombos Tablet']
        ? locations['Bombos Tablet'].accessible !== undefined
          ? locations['Bombos Tablet'].accessible
          : locations['Bombos Tablet']
        : 'unknown';

    testController.log(`Bombos Tablet accessible: ${bombosTabletAccessible}`);
    testController.log(
      `Location data structure:`,
      locations && locations['Bombos Tablet']
        ? JSON.stringify(locations['Bombos Tablet'], null, 2)
        : 'not found'
    );
    testController.reportCondition('Location accessibility checked', true);

    // Step 6: Verify target region exists
    testController.log(
      'Step 6: Verifying target region exists in static data...'
    );
    const regionName = 'Bombos Tablet Ledge';

    if (typeof sm.getStaticData !== 'function') {
      throw new Error('sm.getStaticData is not a function');
    }

    const staticData = sm.getStaticData();
    if (!staticData || !staticData.regions || !staticData.regions[regionName]) {
      testController.reportCondition('Target region validation', false);
      testController.log(`✗ Region ${regionName} not found in static data`);
      testController.log(
        'Available regions:',
        Object.keys(staticData?.regions || {}).slice(0, 10)
      );
      return false;
    }
    testController.reportCondition('Target region validation', true);

    // Step 7: Import PathAnalyzerUI
    testController.log('Step 7: Importing PathAnalyzerUI module...');
    const { PathAnalyzerUI } = await import(
      '../pathAnalyzer/pathAnalyzerUI.js'
    );
    testController.reportCondition('PathAnalyzerUI module imported', true);

    // Step 8: Create mock region UI
    testController.log('Step 8: Creating mock region UI interface...');
    const mockRegionUI = {
      navigateToRegion: (region) => {
        testController.log(`Mock navigation to region: ${region}`);
      },
    };
    testController.reportCondition('Mock region UI created', true);

    // Step 9: Create PathAnalyzerUI instance
    testController.log('Step 9: Creating PathAnalyzerUI instance...');
    const pathAnalyzer = new PathAnalyzerUI(mockRegionUI);
    testController.reportCondition('PathAnalyzerUI instance created', true);

    // Step 10: Set up mock DOM elements
    testController.log('Step 10: Setting up mock DOM elements...');
    const mockContainer = document.createElement('div');
    const mockButton = document.createElement('button');
    const mockSpan = document.createElement('span');
    testController.reportCondition('Mock DOM elements created', true);

    // Step 11: Perform path analysis (synchronous operation)
    testController.log('Step 11: Performing path analysis...');

    try {
      // Clear any existing analysis results first
      localStorage.removeItem(`__pathAnalysis_${regionName}__`);

      // performPathAnalysis is synchronous, so we can call it directly
      pathAnalyzer.performPathAnalysis(
        regionName,
        mockContainer,
        mockSpan,
        mockButton,
        10 // maxPaths
      );

      testController.reportCondition('Path analysis completed', true);
    } catch (error) {
      testController.reportCondition('Path analysis completed', false);
      testController.log(`✗ Path analysis threw error: ${error.message}`);
      pathAnalyzer.dispose();
      return false;
    }

    // Step 12: Check for stored results
    testController.log('Step 12: Checking for stored analysis results...');
    const analysisResults = localStorage.getItem(
      `__pathAnalysis_${regionName}__`
    );
    if (!analysisResults) {
      testController.reportCondition('Analysis results storage check', false);
      testController.log('✗ No path analysis results stored');
      pathAnalyzer.dispose();
      return false;
    }
    testController.reportCondition('Analysis results storage check', true);

    // Step 13: Parse and validate results
    testController.log('Step 13: Parsing and validating results structure...');
    const results = JSON.parse(analysisResults);
    testController.log(`Path analysis completed for ${regionName}:`, results);

    // Step 14: Verify result structure
    testController.log('Step 14: Verifying result structure...');
    const hasValidStructure =
      typeof results.totalPaths === 'number' &&
      typeof results.viablePaths === 'number' &&
      typeof results.isReachable === 'boolean';

    if (!hasValidStructure) {
      testController.reportCondition('Result structure validation', false);
      testController.log('✗ Path analysis results missing expected properties');
      testController.log('Actual results structure:', Object.keys(results));
      pathAnalyzer.dispose();
      return false;
    }
    testController.reportCondition('Result structure validation', true);

    // Step 15: Clean up
    testController.log('Step 15: Cleaning up resources...');
    pathAnalyzer.dispose();
    testController.reportCondition('Resource cleanup completed', true);

    // Final success
    testController.log(
      '✓ Path Analyzer integration test completed successfully'
    );
    testController.reportCondition('Test completed successfully', true);
    return true;
  } catch (error) {
    testController.reportCondition('Test execution', false);
    testController.log(`✗ Path analysis failed: ${error.message}`);
    testController.log('Error stack:', error.stack);
    return false;
  }
}

export async function testPathAnalyzerWithFailingTest(testController) {
  testController.log('Starting Path Analyzer test with failing test case...');
  testController.reportCondition('Test started', true);

  try {
    // Step 1: Get state manager and verify it's available
    testController.log('Step 1: Verifying state manager availability...');
    const sm = testController.stateManager;
    if (!sm) {
      throw new Error('State manager not available');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Set up failing test case (Bombos Tablet with empty inventory)
    testController.log(
      'Step 2: Setting up failing test case (empty inventory)...'
    );
    await sm.applyTestInventoryAndEvaluate('Bombos Tablet', [], []);
    testController.reportCondition('Failing test inventory applied', true);

    // Step 3: Wait for state processing
    testController.log('Step 3: Waiting for state processing...');
    await new Promise((resolve) => setTimeout(resolve, 500));
    testController.reportCondition('State processing wait completed', true);

    // Step 4: Verify snapshot structure
    testController.log('Step 4: Verifying snapshot structure...');
    const snapshot = sm.getSnapshot();

    // Add detailed logging to understand the actual snapshot structure
    testController.log('Snapshot keys:', Object.keys(snapshot || {}));
    testController.log('Snapshot type:', typeof snapshot);
    testController.log('Snapshot is null/undefined:', snapshot == null);

    if (!snapshot) {
      testController.reportCondition('Snapshot structure validation', false);
      testController.log('✗ Snapshot is null or undefined');
      return false;
    }

    // Check for the actual structure - it might be snapshot.locations or snapshot.locationAccessibility
    const hasLocations =
      snapshot.locations ||
      snapshot.locationAccessibility ||
      snapshot.accessibility;
    if (!hasLocations) {
      testController.reportCondition('Snapshot structure validation', false);
      testController.log(
        '✗ Snapshot does not have expected locations structure'
      );
      testController.log(
        'Available snapshot properties:',
        Object.keys(snapshot)
      );
      testController.log(
        'Snapshot sample:',
        JSON.stringify(snapshot, null, 2).substring(0, 500) + '...'
      );
      return false;
    }
    testController.reportCondition('Snapshot structure validation', true);

    // Step 5: Verify location is inaccessible (good for testing)
    testController.log('Step 5: Checking location accessibility status...');

    // Try different possible property names for location accessibility
    const locations =
      snapshot.locations ||
      snapshot.locationAccessibility ||
      snapshot.accessibility;
    const isAccessible =
      locations && locations['Bombos Tablet']
        ? locations['Bombos Tablet'].accessible !== undefined
          ? locations['Bombos Tablet'].accessible
          : locations['Bombos Tablet']
        : 'unknown';

    testController.log(
      `Bombos Tablet accessible with empty inventory: ${isAccessible}`
    );
    testController.log(
      `Location data structure:`,
      locations && locations['Bombos Tablet']
        ? JSON.stringify(locations['Bombos Tablet'], null, 2)
        : 'not found'
    );

    if (isAccessible !== false) {
      testController.reportCondition(
        'Location inaccessibility verification',
        false
      );
      testController.log(
        '✗ Expected location to be inaccessible for this test'
      );
      return false;
    }
    testController.reportCondition(
      'Location inaccessibility verification',
      true
    );
    testController.log(
      '✓ Test case shows location as inaccessible (good for path analysis)'
    );

    // Step 6: Set target region for analysis
    testController.log('Step 6: Setting target region for analysis...');
    const regionName = 'Bombos Tablet Ledge';
    testController.reportCondition('Target region set', true);

    // Step 7: Import PathAnalyzerUI
    testController.log('Step 7: Importing PathAnalyzerUI module...');
    const { PathAnalyzerUI } = await import(
      '../pathAnalyzer/pathAnalyzerUI.js'
    );
    testController.reportCondition('PathAnalyzerUI module imported', true);

    // Step 8: Create mock region UI
    testController.log('Step 8: Creating mock region UI interface...');
    const mockRegionUI = {
      navigateToRegion: (region) => {
        testController.log(`Mock navigation to region: ${region}`);
      },
    };
    testController.reportCondition('Mock region UI created', true);

    // Step 9: Create PathAnalyzerUI instance
    testController.log('Step 9: Creating PathAnalyzerUI instance...');
    const pathAnalyzer = new PathAnalyzerUI(mockRegionUI);
    testController.reportCondition('PathAnalyzerUI instance created', true);

    // Step 10: Set up mock DOM elements
    testController.log('Step 10: Setting up mock DOM elements...');
    const mockContainer = document.createElement('div');
    const mockButton = document.createElement('button');
    const mockSpan = document.createElement('span');
    testController.reportCondition('Mock DOM elements created', true);

    // Step 11: Perform path analysis on inaccessible region (synchronous operation)
    testController.log(
      'Step 11: Performing path analysis on inaccessible region...'
    );

    try {
      // Clear any existing analysis results first
      localStorage.removeItem(`__pathAnalysis_${regionName}__`);

      // performPathAnalysis is synchronous, so we can call it directly
      pathAnalyzer.performPathAnalysis(
        regionName,
        mockContainer,
        mockSpan,
        mockButton,
        5 // maxPaths
      );

      testController.reportCondition('Path analysis completed', true);
    } catch (error) {
      testController.reportCondition('Path analysis completed', false);
      testController.log(`✗ Path analysis threw error: ${error.message}`);
      pathAnalyzer.dispose();
      return false;
    }

    // Step 12: Check for stored results
    testController.log('Step 12: Checking for stored analysis results...');
    const analysisResults = localStorage.getItem(
      `__pathAnalysis_${regionName}__`
    );
    if (!analysisResults) {
      testController.reportCondition('Analysis results storage check', false);
      testController.log('✗ No path analysis results stored');
      pathAnalyzer.dispose();
      return false;
    }
    testController.reportCondition('Analysis results storage check', true);

    // Step 13: Parse and validate results
    testController.log('Step 13: Parsing and validating results structure...');
    const results = JSON.parse(analysisResults);
    testController.log(`Path analysis for inaccessible region:`, results);
    testController.reportCondition('Results parsed successfully', true);

    // Step 14: Verify accessibility analysis is correct
    testController.log(
      'Step 14: Verifying accessibility analysis correctness...'
    );
    // For an inaccessible location, we expect either:
    // 1. No viable paths (viablePaths = 0)
    // 2. A discrepancy (isReachable = false but some paths found)
    const hasCorrectAnalysis =
      results.viablePaths === 0 || results.hasDiscrepancy;

    if (!hasCorrectAnalysis) {
      testController.reportCondition(
        'Accessibility analysis validation',
        false
      );
      testController.log(
        '✗ Path analysis did not identify expected accessibility issues'
      );
      testController.log(`Expected: viablePaths = 0 OR hasDiscrepancy = true`);
      testController.log(
        `Actual: viablePaths = ${results.viablePaths}, hasDiscrepancy = ${results.hasDiscrepancy}`
      );
      pathAnalyzer.dispose();
      return false;
    }
    testController.reportCondition('Accessibility analysis validation', true);
    testController.log(
      '✓ Path analysis correctly identified accessibility issues'
    );

    // Step 15: Clean up
    testController.log('Step 15: Cleaning up resources...');
    pathAnalyzer.dispose();
    testController.reportCondition('Resource cleanup completed', true);

    // Final success
    testController.log(
      '✓ Path Analyzer failing test case completed successfully'
    );
    testController.reportCondition('Test completed successfully', true);
    return true;
  } catch (error) {
    testController.reportCondition('Test execution', false);
    testController.log(
      `✗ Path analysis with failing test failed: ${error.message}`
    );
    testController.log('Error stack:', error.stack);
    return false;
  }
}

export async function debugPathAnalyzerTest(testController) {
  testController.log('Starting Path Analyzer debug test...');
  testController.reportCondition('Test started', true);

  try {
    // Step 1: Get state manager
    testController.log('Step 1: Getting state manager...');
    const sm = testController.stateManager;
    if (!sm) {
      throw new Error('State manager not available');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Set up simple test state
    testController.log('Step 2: Setting up simple test state...');
    await sm.applyTestInventoryAndEvaluate('Bombos Tablet', [], []);
    testController.reportCondition('Test inventory applied', true);

    // Step 3: Check if target region exists
    testController.log('Step 3: Getting static data...');
    const staticData = sm.getStaticData();
    testController.log('Step 3a: Static data retrieved');

    if (!staticData || !staticData.regions) {
      testController.reportCondition('Static data check', false);
      testController.log('✗ No static data or regions available');
      return false;
    }
    testController.log('Step 3b: Static data validation passed');

    // Use a simple region that should definitely exist
    const testRegion = 'Light World';
    const regionExists = staticData.regions[testRegion];
    testController.log(
      `Step 3c: Region "${testRegion}" exists: ${!!regionExists}`
    );

    if (!regionExists) {
      testController.log('Available regions (first 10):');
      const regionNames = Object.keys(staticData.regions).slice(0, 10);
      regionNames.forEach((name) => testController.log(`  - ${name}`));
      testController.reportCondition('Region validation', false);
      return false;
    }
    testController.reportCondition('Target region exists', true);

    // Step 4: Import PathAnalyzerLogic directly
    testController.log('Step 4: About to import PathAnalyzerLogic...');
    const { PathAnalyzerLogic } = await import(
      '../pathAnalyzer/pathAnalyzerLogic.js'
    );
    testController.log('Step 4a: PathAnalyzerLogic imported successfully');

    testController.log(
      'Step 4b: About to create PathAnalyzerLogic instance...'
    );
    const logic = new PathAnalyzerLogic();
    testController.log('Step 4c: PathAnalyzerLogic instance created');
    testController.reportCondition('PathAnalyzerLogic imported', true);

    // Step 5: Get snapshot
    testController.log('Step 5: Getting snapshot...');
    const snapshot = sm.getSnapshot();
    testController.log('Step 5a: Snapshot retrieved');

    // Step 6: Test with immediate return (no actual path finding)
    testController.log(
      'Step 6: Testing with null parameters to check method entry...'
    );
    try {
      const nullResult = logic.findPathsToRegion(testRegion, 1, null, null);
      testController.log(
        `Step 6a: Null test completed, result length: ${nullResult.length}`
      );
    } catch (error) {
      testController.log(`Step 6a: Null test error: ${error.message}`);
    }

    // Step 7: Test with real parameters but very small limits
    testController.log('Step 7: Testing with real parameters...');
    testController.log(
      'Step 7a: About to call findPathsToRegion with real data...'
    );

    const startTime = Date.now();
    const paths = logic.findPathsToRegion(testRegion, 1, snapshot, staticData);
    const endTime = Date.now();

    testController.log(
      `Step 7b: findPathsToRegion completed in ${endTime - startTime}ms`
    );
    testController.log(`Step 7c: Found ${paths.length} paths`);
    testController.reportCondition(
      'Path analysis completed without hanging',
      true
    );

    // Step 8: Success
    testController.log('✓ Path Analyzer debug test completed successfully');
    testController.reportCondition('Test completed successfully', true);
    return true;
  } catch (error) {
    testController.reportCondition('Test execution', false);
    testController.log(`✗ Debug test failed: ${error.message}`);
    testController.log('Error stack:', error.stack);
    return false;
  }
}

export async function simplePathAnalyzerTest(testController) {
  testController.log('Starting Simple Path Analyzer test...');
  testController.reportCondition('Test started', true);

  try {
    // Step 1: Import PathAnalyzerLogic directly
    testController.log('Step 1: Importing PathAnalyzerLogic...');
    const { PathAnalyzerLogic } = await import(
      '../../pathAnalyzer/pathAnalyzerLogic.js'
    );
    testController.log('Step 1a: PathAnalyzerLogic imported successfully');

    // Step 2: Create instance
    testController.log('Step 2: Creating PathAnalyzerLogic instance...');
    const logic = new PathAnalyzerLogic();
    testController.log('Step 2a: PathAnalyzerLogic instance created');
    testController.reportCondition('PathAnalyzerLogic created', true);

    // Step 3: Test with null parameters (should return empty array immediately)
    testController.log('Step 3: Testing with null parameters...');
    const nullResult = logic.findPathsToRegion('Light World', 1, null, null);
    testController.log(
      `Step 3a: Null test completed, result length: ${nullResult.length}`
    );
    testController.reportCondition(
      'Null parameter test passed',
      nullResult.length === 0
    );

    // Step 4: Test with empty objects
    testController.log('Step 4: Testing with empty objects...');
    const emptyResult = logic.findPathsToRegion('Light World', 1, {}, {});
    testController.log(
      `Step 4a: Empty test completed, result length: ${emptyResult.length}`
    );
    testController.reportCondition(
      'Empty parameter test passed',
      emptyResult.length === 0
    );

    // Step 5: Success
    testController.log('✓ Simple Path Analyzer test completed successfully');
    testController.reportCondition('Test completed successfully', true);
    return true;
  } catch (error) {
    testController.reportCondition('Test execution', false);
    testController.log(`✗ Simple test failed: ${error.message}`);
    testController.log('Error stack:', error.stack);
    return false;
  }
}

// Self-register tests
registerTest({
  id: 'simple_path_analyzer',
  name: 'Simple Path Analyzer',
  description:
    'Very simple test to isolate Path Analyzer issues without state manager.',
  testFunction: simplePathAnalyzerTest,
  category: 'Path Analysis',
  enabled: true,
  order: -2, // Run first
});

registerTest({
  id: 'debug_path_analyzer',
  name: 'Debug Path Analyzer',
  description: 'Simple debug test to isolate Path Analyzer issues.',
  testFunction: debugPathAnalyzerTest,
  category: 'Path Analysis',
  enabled: true,
  order: -1,
});

registerTest({
  id: 'test_path_analyzer_integration',
  name: 'Path Analyzer Integration Test',
  description:
    'Tests the Path Analyzer functionality with the worker thread architecture.',
  testFunction: testPathAnalyzerIntegration,
  category: 'Path Analysis',
  enabled: true,
  order: 0,
});

registerTest({
  id: 'test_path_analyzer_failing_test',
  name: 'Path Analyzer with Failing Test',
  description:
    'Tests the Path Analyzer with a test case that should fail to verify it correctly identifies accessibility issues.',
  testFunction: testPathAnalyzerWithFailingTest,
  category: 'Path Analysis',
  enabled: true,
  order: 1,
});

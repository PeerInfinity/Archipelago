// frontend/modules/tests/testCases/uiInteractionTests.js

import { registerTest } from '../testRegistry.js';

export async function uiSimulationTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting uiSimulationTest...');
    testController.reportCondition('Test started', true);

    // This test assumes `configLoadAndItemCheckTest` or similar setup has loaded rules
    // where "Progressive Sword" and "Master Sword" are defined.
    // Ideally, tests should be independent or explicitly state dependencies/setup steps.
    // For now, we assume the necessary item definitions are present from a prior rule load.

    testController.log(
      'Simulating click on "Progressive Sword" inventory button...'
    );
    await testController.performAction({
      type: 'SIMULATE_CLICK',
      selector: '.item-button[data-item="Progressive Sword"]',
    });
    testController.reportCondition('Clicked "Progressive Sword" button', true);

    // Wait for the click to be processed by the StateManager via events
    // A specific event like 'inventory:itemAddedByUI' would be ideal.
    // For now, 'stateManager:snapshotUpdated' is a general indicator that state *might* have changed.
    // A more robust test might need a custom event or more specific state checks.
    // Using AWAIT_WORKER_PING as a synchronization point.
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'uiSimSyncAfterClickInventoryButton',
    });
    testController.reportCondition(
      'Worker ping successful after inventory button click',
      true
    );

    // Progressive Sword level 1 should grant Fighter Sword
    const swordCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Fighter Sword',
    });
    if (swordCount > 0) {
      testController.reportCondition(
        'Fighter Sword count is > 0 after click',
        true
      );
    } else {
      testController.reportCondition(
        `Fighter Sword count is ${swordCount}, expected > 0`,
        false
      );
      overallResult = false;
    }
  } catch (error) {
    testController.log(`Error in uiSimulationTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    await testController.completeTest(overallResult);
  }
}

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

    // Step 11: Perform path analysis with timeout protection
    testController.log(
      'Step 11: Performing path analysis with timeout protection...'
    );

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Path analysis timed out after 5 seconds')),
        5000
      );
    });

    // Create the path analysis promise
    const analysisPromise = new Promise((resolve) => {
      try {
        pathAnalyzer.performPathAnalysis(
          regionName,
          mockContainer,
          mockSpan,
          mockButton,
          10 // maxPaths
        );
        // Give it a moment to complete
        setTimeout(resolve, 100);
      } catch (error) {
        testController.log(`Path analysis threw error: ${error.message}`);
        resolve(); // Don't reject here, let the timeout handle it
      }
    });

    // Race between analysis and timeout
    try {
      await Promise.race([analysisPromise, timeoutPromise]);
      testController.reportCondition('Path analysis initiated', true);
    } catch (timeoutError) {
      testController.reportCondition('Path analysis initiated', false);
      testController.log(`✗ ${timeoutError.message}`);
      pathAnalyzer.dispose();
      return false;
    }

    // Step 12: Wait for analysis completion
    testController.log('Step 12: Waiting for analysis completion...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testController.reportCondition('Analysis completion wait finished', true);

    // Step 13: Check for stored results
    testController.log('Step 13: Checking for stored analysis results...');
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

    // Step 14: Parse and validate results
    testController.log('Step 14: Parsing and validating results structure...');
    const results = JSON.parse(analysisResults);
    testController.log(`Path analysis completed for ${regionName}:`, results);

    // Step 15: Verify result structure
    testController.log('Step 15: Verifying result structure...');
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

    // Step 16: Clean up
    testController.log('Step 16: Cleaning up resources...');
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

    // Step 11: Perform path analysis on inaccessible region with timeout protection
    testController.log(
      'Step 11: Performing path analysis on inaccessible region with timeout protection...'
    );

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(
        () => reject(new Error('Path analysis timed out after 5 seconds')),
        5000
      );
    });

    // Create the path analysis promise
    const analysisPromise = new Promise((resolve) => {
      try {
        pathAnalyzer.performPathAnalysis(
          regionName,
          mockContainer,
          mockSpan,
          mockButton,
          5 // maxPaths
        );
        // Give it a moment to complete
        setTimeout(resolve, 100);
      } catch (error) {
        testController.log(`Path analysis threw error: ${error.message}`);
        resolve(); // Don't reject here, let the timeout handle it
      }
    });

    // Race between analysis and timeout
    try {
      await Promise.race([analysisPromise, timeoutPromise]);
      testController.reportCondition('Path analysis initiated', true);
    } catch (timeoutError) {
      testController.reportCondition('Path analysis initiated', false);
      testController.log(`✗ ${timeoutError.message}`);
      pathAnalyzer.dispose();
      return false;
    }

    // Step 12: Wait for analysis completion
    testController.log('Step 12: Waiting for analysis completion...');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testController.reportCondition('Analysis completion wait finished', true);

    // Step 13: Check for stored results
    testController.log('Step 13: Checking for stored analysis results...');
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

    // Step 14: Parse and validate results
    testController.log('Step 14: Parsing and validating results structure...');
    const results = JSON.parse(analysisResults);
    testController.log(`Path analysis for inaccessible region:`, results);
    testController.reportCondition('Results parsed successfully', true);

    // Step 15: Verify accessibility analysis is correct
    testController.log(
      'Step 15: Verifying accessibility analysis correctness...'
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

    // Step 16: Clean up
    testController.log('Step 16: Cleaning up resources...');
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

// Self-register tests
registerTest({
  id: 'test_ui_simulation',
  name: 'UI Simulation Test',
  description:
    'Tests UI interactions like clicking inventory buttons and verifying the resulting state changes.',
  testFunction: uiSimulationTest,
  category: 'UI Interaction',
  enabled: false,
  order: 0,
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

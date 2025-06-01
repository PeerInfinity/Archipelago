// frontend/modules/tests/testCases/pathAnalyzerTests.js

import { registerTest } from '../testRegistry.js';

export async function testPathAnalyzerPanel(testController) {
  const testRunId = `path-analyzer-panel-test-${Date.now()}`;
  testController.log(testRunId, 'Path Analyzer Panel Test');

  const regionToAnalyze = 'Kings Grave'; // Define regionToAnalyze

  let overallResult = true;

  try {
    testController.reportCondition('Test started', true);

    // Step 1: Verify state manager availability (still good to have)
    testController.log('Step 1: Verifying state manager availability...');
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: REMOVED - No longer applying test inventory. Test will use current inventory.
    testController.log(
      `[${testRunId}] Step 2: Skipped - Test will use current application inventory.`
    );

    // Step 3: Activate Path Analyzer panel
    testController.log(
      `[${testRunId}] Step 3: Activating Path Analyzer panel...`
    );
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: 'pathAnalyzerPanel' },
    });
    testController.reportCondition(
      'Path Analyzer panel activation event published',
      true
    );
    await new Promise((resolve) => setTimeout(resolve, 1000)); // Increased pause to 1000ms

    // Step 4: Wait for the Path Analyzer panel, its input field, and analyze button to render
    testController.log(
      `[${testRunId}] Step 4: Waiting for Path Analyzer panel to render...`
    );

    let panelRootElement = null;
    let regionInput = null;
    let analyzeButton = null;

    // Preliminary check for the panel root
    testController.log(
      'Step 4.1: Preliminary poll for panel root #path-analyzer-panel-container...'
    );
    await testController.pollForCondition(
      () => document.querySelector('#path-analyzer-panel-container'),
      'Path Analyzer panel root (#path-analyzer-panel-container) to exist',
      5000,
      250
    );

    // Main poll for panel and its children
    testController.log(
      'Step 4.2: Main poll for panel root and its children (input, button)...'
    );
    const panelElements = await testController.pollForValue(
      () => {
        const panelRoot = document.querySelector(
          '#path-analyzer-panel-container'
        );
        if (!panelRoot) return null;

        const polledRegionInputEl = panelRoot.querySelector(
          '[data-testid="path-analyzer-region-input"]'
        );
        const polledAnalyzeButtonEl = panelRoot.querySelector(
          '[data-testid="path-analyzer-analyze-button"]'
        );

        if (panelRoot && polledRegionInputEl && polledAnalyzeButtonEl) {
          return {
            panelRoot,
            pathAnalyzerRegionInput: polledRegionInputEl,
            pathAnalyzerAnalyzeButton: polledAnalyzeButtonEl,
          };
        }
        return null;
      },
      'Path Analyzer panel, input, and button to exist',
      10000,
      250
    );

    const allElementsFound =
      panelElements &&
      panelElements.panelRoot &&
      panelElements.pathAnalyzerRegionInput &&
      panelElements.pathAnalyzerAnalyzeButton;

    testController.reportCondition(
      'Path Analyzer panel, input, and button found',
      !!allElementsFound
    );

    if (!allElementsFound) {
      testController.log(
        `[${testRunId}] Debug: panelElements type: ${typeof panelElements}, value: ${String(
          panelElements
        )}`,
        'error'
      );
      if (panelElements && typeof panelElements === 'object') {
        testController.log(
          `[${testRunId}] Debug: panelElements.panelRoot: ${
            panelElements.panelRoot ? 'Exists' : 'MISSING/FALSY'
          } (type: ${typeof panelElements.panelRoot}, value: ${String(
            panelElements.panelRoot
          )})`,
          'error'
        );
        testController.log(
          `[${testRunId}] Debug: panelElements.pathAnalyzerRegionInput: ${
            panelElements.pathAnalyzerRegionInput ? 'Exists' : 'MISSING/FALSY'
          } (type: ${typeof panelElements.pathAnalyzerRegionInput}, value: ${String(
            panelElements.pathAnalyzerRegionInput
          )})`,
          'error'
        );
        testController.log(
          `[${testRunId}] Debug: panelElements.pathAnalyzerAnalyzeButton: ${
            panelElements.pathAnalyzerAnalyzeButton ? 'Exists' : 'MISSING/FALSY'
          } (type: ${typeof panelElements.pathAnalyzerAnalyzeButton}, value: ${String(
            panelElements.pathAnalyzerAnalyzeButton
          )})`,
          'error'
        );
      }
      throw new Error('Essential panel elements not found after polling');
    }

    const { pathAnalyzerRegionInput, pathAnalyzerAnalyzeButton } =
      panelElements;

    testController.reportCondition(
      'Path Analyzer panel, input, and button found',
      true
    );

    // Step 5: Type into the region input
    testController.log(
      `[${testRunId}] Step 5: Typing region name '${regionToAnalyze}' into input field...`
    );
    pathAnalyzerRegionInput.value = regionToAnalyze;
    pathAnalyzerRegionInput.dispatchEvent(new Event('input')); // Simulate input event
    testController.reportCondition(
      `Region input set to "${regionToAnalyze}"`,
      pathAnalyzerRegionInput.value === regionToAnalyze
    );
    if (pathAnalyzerRegionInput.value !== regionToAnalyze) {
      testController.log(
        `[${testRunId}] Failed to set region input value. Expected: "${regionToAnalyze}", Got: "${pathAnalyzerRegionInput.value}"`,
        'error'
      );
      throw new Error(
        `Failed to set region input value to "${regionToAnalyze}".`
      );
    }

    // Step 6: Click the analyze button
    testController.log(`[${testRunId}] Step 6: Clicking analyze button...`);
    pathAnalyzerAnalyzeButton.click();
    testController.reportCondition('Clicked "Analyze Paths" button', true);

    // Step 7: Poll localStorage for the analysis results
    const localStorageKey = '__pathAnalysis_Kings Grave__';
    testController.log(
      `[${testRunId}] Step 7: Waiting for analysis results (path count > 0 or error message)...`
    );
    let analysisData = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const rawData = localStorage.getItem(localStorageKey);
          if (rawData) {
            try {
              analysisData = JSON.parse(rawData);
              // More specific check: ensure paths array is present and is an array
              return (
                analysisData &&
                analysisData.paths &&
                Array.isArray(analysisData.paths)
              );
            } catch (e) {
              testController.log(
                `[${testRunId}] Error parsing localStorage data for ${localStorageKey}: ${e.message}`,
                'warn'
              );
              return false;
            }
          }
          return false;
        },
        10000, // Timeout for analysis to complete and save
        500,
        `localStorage key "${localStorageKey}" to be populated with paths array`
      ))
    ) {
      throw new Error(
        `Analysis results for "Kings Grave" not found in localStorage within timeout.`
      );
    }
    testController.reportCondition(
      `Analysis results for "Kings Grave" found in localStorage`,
      true
    );

    // Step 8: Optional: Validate structure of results (basic check)
    if (
      analysisData &&
      analysisData.paths &&
      Array.isArray(analysisData.paths)
    ) {
      testController.reportCondition(
        `localStorage data for "Kings Grave" has expected structure (paths array)`,
        true
      );
      testController.log(
        `[${testRunId}] Found ${analysisData.paths.length} paths in localStorage for Kings Grave.`
      );
    } else {
      testController.reportCondition(
        `localStorage data for "Kings Grave" has UNEXPECTED structure`,
        false
      );
      overallResult = false;
      const actualKeys = analysisData
        ? Object.keys(analysisData).join(', ')
        : 'null or undefined';
      let fullDataString = String(analysisData);
      try {
        fullDataString = JSON.stringify(analysisData, null, 2);
        if (fullDataString.length > 1000) {
          fullDataString =
            fullDataString.substring(0, 1000) + '... (truncated)';
        }
      } catch (e) {
        // If stringify fails, use the basic string conversion.
      }
      testController.log(
        `[${testRunId}] Unexpected structure for localStorage data. Expected 'paths' key to be an array. Actual keys: ${actualKeys}. Full data: ${fullDataString}`,
        'error'
      );
    }

    testController.log(
      `[${testRunId}] Path Analyzer Panel test completed successfully.`
    );
  } catch (error) {
    const errorMessage = `Path Analyzer Panel test failed: ${error.message}`;
    testController.log(
      `[${testRunId}] ✗ ${errorMessage} (Stack: ${error.stack || 'N/A'})`,
      'error'
    );
    testController.reportCondition('Test execution failed', false);
    overallResult = false;
  } finally {
    // Ensure this is the last call
    // No, we don't call completeTest here if it's part of a larger suite run by testLogic
    // testController.completeTest(overallResult);
    testController.log(
      `[${testRunId}] Path Analyzer test finished. Overall Result: ${overallResult}`
    );
  }
  return overallResult; // Return overall result for testLogic
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
    await sm.applyTestInventoryAndEvaluate('Moon Pearl', [], []);
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
      '../../pathAnalyzer/pathAnalyzerLogic.js'
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
  enabled: false,
  order: -2, // Run first
});

registerTest({
  id: 'debug_path_analyzer',
  name: 'Debug Path Analyzer',
  description: 'Simple debug test to isolate Path Analyzer issues.',
  testFunction: debugPathAnalyzerTest,
  category: 'Path Analysis',
  enabled: false,
  order: -1,
});

registerTest({
  id: 'test_path_analyzer_panel',
  name: 'Path Analyzer Panel Test',
  description:
    'Tests the new PathAnalyzer Panel functionality with Golden Layout integration.',
  testFunction: testPathAnalyzerPanel,
  category: 'Path Analysis',
  enabled: true,
  order: 0,
});

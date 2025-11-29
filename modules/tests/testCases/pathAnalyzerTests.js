// frontend/modules/tests/testCases/pathAnalyzerTests.js

import { registerTest } from '../testRegistry.js';

export async function testPathAnalyzerPanel(testController) {
  const testRunId = `path-analyzer-panel-test-${Date.now()}`;
  testController.log(testRunId, 'Path Analyzer Panel Test');

  const regionToAnalyze = 'Kings Grave'; // Define regionToAnalyze

  let overallResult = true;

  try {
    testController.reportCondition('Test started', true);

    // Load default rules to reset state
    testController.log(`[${testRunId}] Loading default rules to reset state...`);
    await testController.loadALTTPRules();
    testController.log(`[${testRunId}] Default rules loaded successfully`);

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
    // Step 4: Wait for the Path Analyzer panel, its input field, and analyze button to render
    testController.log(
      `[${testRunId}] Step 4: Waiting for Path Analyzer panel to render...`
    );

    let panelRootElement = null;
    let regionInput = null;
    let analyzeButton = null;

    // Poll for the panel root to appear (replacing the removed fixed delay)
    testController.log(
      'Step 4.1: Polling for panel root #path-analyzer-panel-container...'
    );
    await testController.pollForCondition(
      () => document.querySelector('#path-analyzer-panel-container'),
      'Path Analyzer panel root (#path-analyzer-panel-container) to exist',
      5000,
      50
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
      50
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

    // Debug: Check window.__pathAnalysisResults__ and button state before clicking
    const beforeResults = window.__pathAnalysisResults__ ? Object.keys(window.__pathAnalysisResults__) : [];
    testController.log(`[${testRunId}] window.__pathAnalysisResults__ keys before click: ${beforeResults.length ? beforeResults.join(', ') : 'none'}`);
    testController.log(`[${testRunId}] Button disabled: ${pathAnalyzerAnalyzeButton.disabled}, text: "${pathAnalyzerAnalyzeButton.textContent}"`);

    pathAnalyzerAnalyzeButton.click();
    testController.reportCondition('Clicked "Analyze Paths" button', true);

    // Debug: Check immediate changes after click
    await new Promise(resolve => setTimeout(resolve, 200));
    const afterResults = window.__pathAnalysisResults__ ? Object.keys(window.__pathAnalysisResults__) : [];
    testController.log(`[${testRunId}] window.__pathAnalysisResults__ keys 200ms after click: ${afterResults.length ? afterResults.join(', ') : 'none'}`);
    testController.log(`[${testRunId}] Button state after click - disabled: ${pathAnalyzerAnalyzeButton.disabled}, text: "${pathAnalyzerAnalyzeButton.textContent}"`);

    // Step 7: Wait for analysis to complete
    testController.log(
      `[${testRunId}] Step 7: Waiting for analysis to complete...`
    );
    
    // Analysis might complete very quickly, so we check for either:
    // 1. "Analyzing..." state (if we catch it in time)
    // 2. "Hide Paths" state (if analysis already completed)
    // 3. Or wait for "Hide Paths" if still in original state
    
    let analysisStartedOrCompleted = false;
    
    // Quick check - did analysis already complete?
    const currentButtonText = pathAnalyzerAnalyzeButton.textContent;
    const currentButtonDisabled = pathAnalyzerAnalyzeButton.disabled;
    
    if (currentButtonText === 'Hide Paths' && currentButtonDisabled === false) {
      testController.log(`[${testRunId}] Analysis already completed - button shows "Hide Paths"`);
      analysisStartedOrCompleted = true;
    } else if (currentButtonText === 'Analyzing...' && currentButtonDisabled === true) {
      testController.log(`[${testRunId}] Analysis in progress - button shows "Analyzing..."`);
      // Wait for completion
      if (!(await testController.pollForCondition(
        () => {
          const buttonText = pathAnalyzerAnalyzeButton.textContent;
          const buttonDisabled = pathAnalyzerAnalyzeButton.disabled;
          return buttonText === 'Hide Paths' && buttonDisabled === false;
        },
        15000,
        50,
        'Analysis to complete (button shows "Hide Paths")'
      ))) {
        throw new Error('Analysis did not complete - button did not change to "Hide Paths" state');
      }
      testController.log(`[${testRunId}] Analysis completed - button shows "Hide Paths"`);
      analysisStartedOrCompleted = true;
    } else {
      // Still in original state, wait for completion
      if (!(await testController.pollForCondition(
        () => {
          const buttonText = pathAnalyzerAnalyzeButton.textContent;
          const buttonDisabled = pathAnalyzerAnalyzeButton.disabled;
          return buttonText === 'Hide Paths' && buttonDisabled === false;
        },
        15000,
        10, // Faster polling for quick analysis
        'Analysis to complete (button shows "Hide Paths")'
      ))) {
        throw new Error('Analysis did not complete - button did not change to "Hide Paths" state');
      }
      testController.log(`[${testRunId}] Analysis completed - button shows "Hide Paths"`);
      analysisStartedOrCompleted = true;
    }
    
    if (!analysisStartedOrCompleted) {
      throw new Error('Analysis state could not be determined');
    }

    // Finally, verify window.__pathAnalysisResults__ was populated
    const regionToCheck = 'Kings Grave';
    let analysisData = null;
    if (window.__pathAnalysisResults__ && window.__pathAnalysisResults__[regionToCheck]) {
      analysisData = window.__pathAnalysisResults__[regionToCheck];
      if (!(analysisData && analysisData.paths && Array.isArray(analysisData.paths))) {
        throw new Error('window.__pathAnalysisResults__ data missing paths array');
      }
    } else {
      throw new Error('No data found in window.__pathAnalysisResults__ after analysis completion');
    }

    testController.reportCondition(
      `Analysis results for "Kings Grave" found in window.__pathAnalysisResults__`,
      true
    );

    // Step 8: Optional: Validate structure of results (basic check)
    if (
      analysisData &&
      analysisData.paths &&
      Array.isArray(analysisData.paths)
    ) {
      testController.reportCondition(
        `window.__pathAnalysisResults__ data for "Kings Grave" has expected structure (paths array)`,
        true
      );
      testController.log(
        `[${testRunId}] Found ${analysisData.paths.length} paths in window.__pathAnalysisResults__ for Kings Grave.`
      );
    } else {
      testController.reportCondition(
        `window.__pathAnalysisResults__ data for "Kings Grave" has UNEXPECTED structure`,
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
        `[${testRunId}] Unexpected structure for window.__pathAnalysisResults__ data. Expected 'paths' key to be an array. Actual keys: ${actualKeys}. Full data: ${fullDataString}`,
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
    // Step 1: Load ALTTP rules (required for this test)
    testController.log('Step 1: Loading ALTTP rules...');
    const alttpRulesPath = './presets/alttp/AP_14089154938208861744/AP_14089154938208861744_rules.json';
    await testController.loadRulesFromFile(alttpRulesPath);
    testController.reportCondition('ALTTP rules loaded', true);

    // Give time for static data cache to update after rules load
    testController.log('Waiting for static data cache to update...');
    await new Promise(resolve => setTimeout(resolve, 500));

    // Step 2: Get state manager
    testController.log('Step 2: Getting state manager...');
    const sm = testController.stateManager;
    if (!sm) {
      throw new Error('State manager not available');
    }
    testController.reportCondition('State manager available', true);

    // Step 3: Check if target region exists
    testController.log('Step 3: Getting static data...');
    const staticData = sm.getStaticData();

    if (!staticData || !staticData.regions) {
      testController.reportCondition('Static data check', false);
      testController.log('✗ No static data or regions available');
      return false;
    }
    testController.reportCondition('Static data available', true);

    // Use a simple region that should definitely exist in ALTTP
    const testRegion = 'Light World';
    // staticData.regions is always a Map after initialization
    const regionExists = staticData.regions.has(testRegion);
    testController.log(`Checking for region "${testRegion}"...`);

    if (!regionExists) {
      const regionNames = Array.from(staticData.regions.keys()).slice(0, 10);
      testController.log(`Region "${testRegion}" not found. Available regions (first 10):`);
      regionNames.forEach((name) => testController.log(`  - ${name}`));
      testController.reportCondition('Target region exists', false);
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

export async function testPathAnalyzerLibrary(testController) {
  const testRunId = `path-analyzer-library-${Date.now()}`;
  testController.log(`[${testRunId}] Path Analyzer Library Test - Testing region without parentheses`);

  try {
    testController.reportCondition('Test started', true);

    // Step 0: Load ALTTP rules first (this test uses ALTTP-specific regions)
    testController.log(`[${testRunId}] Loading ALTTP rules for test setup...`);
    await testController.loadALTTPRules();
    testController.reportCondition('ALTTP rules loaded for test', true);

    // Step 1: Verify state manager availability
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Get static data to verify region exists
    // Note: staticData.regions is a Map (see state-snapshots.md)
    const staticData = stateManager.getStaticData();

    if (!staticData || !staticData.regions) {
      testController.log(`[${testRunId}] No regions found in static data`);
      testController.reportCondition('Library region exists in static data', false);
      return false;
    }

    // regions is a Map, use Map methods
    const regionsMap = staticData.regions;
    testController.log(`[${testRunId}] Found ${regionsMap.size} regions in static data`);

    if (regionsMap.size > 0) {
      const firstFewRegions = Array.from(regionsMap.keys()).slice(0, 10);
      testController.log(`[${testRunId}] First few region names:`, firstFewRegions);
    }

    if (!regionsMap.has('Library')) {
      testController.log(`[${testRunId}] Library region not found in static data`);
      testController.reportCondition('Library region exists in static data', false);
      return false;
    }
    testController.reportCondition('Library region exists in static data', true);

    // Step 3: Test direct connection analysis
    testController.log(`[${testRunId}] Testing analyzeDirectConnections for Library`);
    const { PathAnalyzerLogic } = await import('../../pathAnalyzer/pathAnalyzerLogic.js');
    const logic = new PathAnalyzerLogic();
    logic.setDebugMode(true); // Enable debug logging

    const snapshot = stateManager.getSnapshot();
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);

    const result = logic.analyzeDirectConnections('Library', staticData, snapshotInterface);
    
    testController.log(`[${testRunId}] Library analysis result:`, JSON.stringify(result, null, 2));
    
    // Check if we got meaningful results
    const hasEntrances = result.analysisData && result.analysisData.entrances && result.analysisData.entrances.length > 0;
    const hasNodes = result.nodes && Object.keys(result.nodes).some(key => result.nodes[key].length > 0);
    
    testController.reportCondition('Library analysis returned entrances or nodes', hasEntrances || hasNodes);
    testController.log(`[${testRunId}] Library - Found ${result.analysisData?.entrances?.length || 0} entrances`);

    testController.reportCondition('Library path analysis completed successfully', true);
    return true;

  } catch (error) {
    testController.log(`[${testRunId}] ✗ Library test failed: ${error.message}`, 'error');
    testController.reportCondition('Test execution failed', false);
    return false;
  }
}

export async function testPathAnalyzerMiseryMireEntrance(testController) {
  const testRunId = `path-analyzer-misery-mire-${Date.now()}`;
  testController.log(`[${testRunId}] Path Analyzer Misery Mire (Entrance) Test - Testing region with parentheses`);

  try {
    testController.reportCondition('Test started', true);

    // Step 0: Load ALTTP rules first (this test uses ALTTP-specific regions)
    testController.log(`[${testRunId}] Loading ALTTP rules for test setup...`);
    await testController.loadALTTPRules();
    testController.reportCondition('ALTTP rules loaded for test', true);

    // Step 1: Verify state manager availability
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Get static data to verify region exists
    // Note: staticData.regions is a Map (see state-snapshots.md)
    const staticData = stateManager.getStaticData();
    const regionName = 'Misery Mire (Entrance)';

    if (!staticData || !staticData.regions) {
      testController.log(`[${testRunId}] No regions found in static data`);
      testController.reportCondition(`${regionName} region exists in static data`, false);
      return false;
    }

    // regions is a Map, use Map methods
    const regionsMap = staticData.regions;

    if (!regionsMap.has(regionName)) {
      testController.log(`[${testRunId}] ${regionName} region not found in static data`);
      const allRegions = Array.from(regionsMap.keys());
      testController.log(`[${testRunId}] Available regions matching "Misery":`,
        allRegions.filter(name => name.includes('Misery')));
      testController.reportCondition(`${regionName} region exists in static data`, false);
      return false;
    }
    testController.reportCondition(`${regionName} region exists in static data`, true);

    // Step 3: Test direct connection analysis
    testController.log(`[${testRunId}] Testing analyzeDirectConnections for ${regionName}`);
    const { PathAnalyzerLogic } = await import('../../pathAnalyzer/pathAnalyzerLogic.js');
    const logic = new PathAnalyzerLogic();
    logic.setDebugMode(true); // Enable debug logging

    const snapshot = stateManager.getSnapshot();
    const { createStateSnapshotInterface } = await import('../../shared/stateInterface.js');
    const snapshotInterface = createStateSnapshotInterface(snapshot, staticData);

    const result = logic.analyzeDirectConnections(regionName, staticData, snapshotInterface);
    
    testController.log(`[${testRunId}] ${regionName} analysis result:`, JSON.stringify(result, null, 2));
    
    // Check if we got meaningful results
    const hasEntrances = result.analysisData && result.analysisData.entrances && result.analysisData.entrances.length > 0;
    const hasNodes = result.nodes && Object.keys(result.nodes).some(key => result.nodes[key].length > 0);
    
    testController.reportCondition(`${regionName} analysis returned entrances or nodes`, hasEntrances || hasNodes);
    testController.log(`[${testRunId}] ${regionName} - Found ${result.analysisData?.entrances?.length || 0} entrances`);

    // Log specific debug information about string matching
    // Note: staticData.regions is a Map, use Map iteration methods
    testController.log(`[${testRunId}] Checking for exits that connect to "${regionName}"`);
    let foundMatches = 0;
    for (const [otherRegionName, otherRegionData] of regionsMap.entries()) {
      if (otherRegionData.exits) {
        otherRegionData.exits.forEach(exit => {
          if (exit.connected_region === regionName) {
            foundMatches++;
            testController.log(`[${testRunId}] MATCH: ${otherRegionName} -> ${exit.name} connects to "${exit.connected_region}"`);
          } else if (exit.connected_region && exit.connected_region.includes('Misery Mire')) {
            testController.log(`[${testRunId}] NEAR-MATCH: ${otherRegionName} -> ${exit.name} connects to "${exit.connected_region}"`);
          }
        });
      }
    }

    testController.log(`[${testRunId}] Total exact matches found: ${foundMatches}`);
    testController.reportCondition(`Found exits connecting to ${regionName}`, foundMatches > 0);

    testController.reportCondition(`${regionName} path analysis completed successfully`, true);
    return true;

  } catch (error) {
    testController.log(`[${testRunId}] ✗ ${regionName} test failed: ${error.message}`, 'error');
    testController.reportCondition('Test execution failed', false);
    return false;
  }
}

export async function testPathAnalyzerUILibrary(testController) {
  const testRunId = `path-analyzer-ui-library-${Date.now()}`;
  testController.log(`[${testRunId}] Path Analyzer UI Library Test - Testing UI with region without parentheses`);

  try {
    testController.reportCondition('Test started', true);

    // Step 1: Verify state manager availability
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Activate Path Analyzer panel
    testController.log(`[${testRunId}] Activating Path Analyzer panel...`);
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: 'pathAnalyzerPanel' },
    });
    // Removed fixed delay - use dynamic polling instead

    // Step 3: Wait for panel elements to be available
    testController.log(`[${testRunId}] Waiting for Path Analyzer panel elements...`);
    const panelElements = await testController.pollForValue(
      () => {
        const panelRoot = document.querySelector('#path-analyzer-panel-container');
        if (!panelRoot) return null;

        const regionInput = panelRoot.querySelector('[data-testid="path-analyzer-region-input"]');
        const analyzeButton = panelRoot.querySelector('[data-testid="path-analyzer-analyze-button"]');
        const resultsContainer = panelRoot.querySelector('.path-analysis-results');

        if (panelRoot && regionInput && analyzeButton && resultsContainer) {
          return { panelRoot, regionInput, analyzeButton, resultsContainer };
        }
        return null;
      },
      'Path Analyzer panel elements to exist',
      10000,
      50
    );

    if (!panelElements) {
      throw new Error('Path Analyzer panel elements not found');
    }
    testController.reportCondition('Path Analyzer panel elements found', true);

    const { regionInput, analyzeButton, resultsContainer } = panelElements;

    // Step 4: Enter "Library" in the input field
    const regionName = 'Library';
    testController.log(`[${testRunId}] Entering "${regionName}" in region input...`);
    regionInput.value = regionName;
    regionInput.dispatchEvent(new Event('input'));
    testController.reportCondition(`Region input set to "${regionName}"`, regionInput.value === regionName);

    // Step 5: Click the analyze button
    testController.log(`[${testRunId}] Clicking analyze button...`);

    // Debug: Check window.__pathAnalysisResults__ and button state before clicking
    const beforeResults = window.__pathAnalysisResults__ ? Object.keys(window.__pathAnalysisResults__) : [];
    testController.log(`[${testRunId}] window.__pathAnalysisResults__ keys before click: ${beforeResults.length ? beforeResults.join(', ') : 'none'}`);
    testController.log(`[${testRunId}] Button disabled: ${analyzeButton.disabled}, text: "${analyzeButton.textContent}"`);

    analyzeButton.click();
    testController.reportCondition('Analyze button clicked', true);

    // Debug: Check immediate changes after click
    await new Promise(resolve => setTimeout(resolve, 100));
    const afterResults = window.__pathAnalysisResults__ ? Object.keys(window.__pathAnalysisResults__) : [];
    testController.log(`[${testRunId}] window.__pathAnalysisResults__ keys after click: ${afterResults.length ? afterResults.join(', ') : 'none'}`);
    testController.log(`[${testRunId}] Button state after click - disabled: ${analyzeButton.disabled}, text: "${analyzeButton.textContent}"`);

    // Step 6: Wait for analysis results
    testController.log(`[${testRunId}] Waiting for analysis results...`);
    const analysisComplete = await testController.pollForCondition(
      () => {
        const resultText = resultsContainer.textContent || '';
        // Check if analysis is complete (either success with results or an error message)
        return resultText.includes('Requirements') || 
               resultText.includes('No requirements found') || 
               resultText.includes('Error:') ||
               resultText.includes('Analysis failed');
      },
      'Analysis results to appear',
      15000,
      500
    );

    if (!analysisComplete) {
      throw new Error('Analysis did not complete within timeout');
    }
    testController.reportCondition('Analysis completed', true);

    // Step 7: Check the results content
    const resultText = resultsContainer.textContent || '';
    testController.log(`[${testRunId}] Analysis result text: "${resultText}"`);
    
    const hasRequirements = resultText.includes('Requirements') && !resultText.includes('No requirements found');
    const hasNoRequirements = resultText.includes('No requirements found');
    const hasError = resultText.includes('Error:') || resultText.includes('Analysis failed');
    
    // Count paths found - look for indicators of path sections
    const pathMatches = resultText.match(/Path \d+:/g) || [];
    const pathCount = pathMatches.length;
    
    testController.log(`[${testRunId}] Result analysis: hasRequirements=${hasRequirements}, hasNoRequirements=${hasNoRequirements}, hasError=${hasError}, pathCount=${pathCount}`);
    
    if (hasError) {
      testController.reportCondition('Library analysis completed without error', false);
      testController.log(`[${testRunId}] Error in analysis: ${resultText}`, 'error');
    } else {
      testController.reportCondition('Library analysis completed without error', true);
      
      if (pathCount > 0) {
        testController.reportCondition(`Library analysis found ${pathCount} paths`, true);
        testController.log(`[${testRunId}] SUCCESS: Found ${pathCount} paths for Library (old version shows 6: 2 viable + 4 non-viable)`);
      } else if (hasRequirements) {
        testController.reportCondition('Library analysis found requirements but no paths', true);
        testController.log(`[${testRunId}] Found requirements but no visible paths - this might be the bug`);
      } else if (hasNoRequirements) {
        testController.reportCondition('Library analysis returned "No requirements found"', true);
        testController.log(`[${testRunId}] Note: Library returned no requirements`);
      } else {
        testController.reportCondition('Library analysis had unexpected result format', false);
      }
    }

    testController.reportCondition('Library UI test completed successfully', true);
    return true;

  } catch (error) {
    testController.log(`[${testRunId}] ✗ Library UI test failed: ${error.message}`, 'error');
    testController.reportCondition('Test execution failed', false);
    return false;
  }
}

export async function testPathAnalyzerUIMiseryMireEntrance(testController) {
  const testRunId = `path-analyzer-ui-misery-mire-${Date.now()}`;
  testController.log(`[${testRunId}] Path Analyzer UI Misery Mire Test - Testing UI with region with parentheses`);

  try {
    testController.reportCondition('Test started', true);

    // Step 0: Load ALTTP rules first (this test uses ALTTP-specific regions)
    testController.log(`[${testRunId}] Loading ALTTP rules for test setup...`);
    await testController.loadALTTPRules();
    testController.reportCondition('ALTTP rules loaded for test', true);

    // Step 1: Verify state manager availability
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }
    testController.reportCondition('State manager available', true);

    // Step 2: Activate Path Analyzer panel
    testController.log(`[${testRunId}] Activating Path Analyzer panel...`);
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: 'pathAnalyzerPanel' },
    });

    // Step 3: Wait for panel elements to be available
    testController.log(`[${testRunId}] Waiting for Path Analyzer panel elements...`);
    const panelElements = await testController.pollForValue(
      () => {
        const panelRoot = document.querySelector('#path-analyzer-panel-container');
        if (!panelRoot) return null;

        const regionInput = panelRoot.querySelector('[data-testid="path-analyzer-region-input"]');
        const analyzeButton = panelRoot.querySelector('[data-testid="path-analyzer-analyze-button"]');
        const resultsContainer = panelRoot.querySelector('.path-analysis-results');

        if (panelRoot && regionInput && analyzeButton && resultsContainer) {
          return { panelRoot, regionInput, analyzeButton, resultsContainer };
        }
        return null;
      },
      'Path Analyzer panel elements to exist',
      10000,
      50
    );

    if (!panelElements) {
      throw new Error('Path Analyzer panel elements not found');
    }
    testController.reportCondition('Path Analyzer panel elements found', true);

    const { regionInput, analyzeButton, resultsContainer } = panelElements;

    // Step 4: Enter "Misery Mire (Entrance)" in the input field
    const regionName = 'Misery Mire (Entrance)';
    testController.log(`[${testRunId}] Entering "${regionName}" in region input...`);
    regionInput.value = regionName;
    regionInput.dispatchEvent(new Event('input'));
    testController.reportCondition(`Region input set to "${regionName}"`, regionInput.value === regionName);

    // Step 5: Click the analyze button
    testController.log(`[${testRunId}] Clicking analyze button...`);
    analyzeButton.click();
    testController.reportCondition('Analyze button clicked', true);

    // Step 6: Wait for analysis results
    testController.log(`[${testRunId}] Waiting for analysis results...`);
    const analysisComplete = await testController.pollForCondition(
      () => {
        const resultText = resultsContainer.textContent || '';
        // Check if analysis is complete (either success with results or an error message)
        return resultText.includes('Requirements') || 
               resultText.includes('No requirements found') || 
               resultText.includes('Error:') ||
               resultText.includes('Analysis failed');
      },
      'Analysis results to appear',
      15000,
      500
    );

    if (!analysisComplete) {
      throw new Error('Analysis did not complete within timeout');
    }
    testController.reportCondition('Analysis completed', true);

    // Step 7: Check the results content
    const resultText = resultsContainer.textContent || '';
    testController.log(`[${testRunId}] Analysis result text: "${resultText}"`);
    
    const hasRequirements = resultText.includes('Requirements') && !resultText.includes('No requirements found');
    const hasNoRequirements = resultText.includes('No requirements found');
    const hasError = resultText.includes('Error:') || resultText.includes('Analysis failed');

    testController.log(`[${testRunId}] Result analysis: hasRequirements=${hasRequirements}, hasNoRequirements=${hasNoRequirements}, hasError=${hasError}`);
    
    if (hasError) {
      testController.reportCondition('Misery Mire (Entrance) analysis completed without error', false);
      testController.log(`[${testRunId}] Error in analysis: ${resultText}`, 'error');
    } else {
      testController.reportCondition('Misery Mire (Entrance) analysis completed without error', true);
      
      if (hasRequirements) {
        testController.reportCondition('Misery Mire (Entrance) analysis found requirements', true);
      } else if (hasNoRequirements) {
        testController.reportCondition('Misery Mire (Entrance) analysis returned "No requirements found"', true);
        testController.log(`[${testRunId}] ISSUE: Misery Mire (Entrance) returned "No requirements found" - this suggests the parentheses bug!`, 'warn');
      } else {
        testController.reportCondition('Misery Mire (Entrance) analysis had unexpected result format', false);
      }
    }

    // Step 8: Additional debugging - check if the region exists in static data
    // Note: staticData.regions is a Map (see state-snapshots.md)
    testController.log(`[${testRunId}] Verifying region exists in static data...`);
    const staticData = stateManager.getStaticData();
    const regionExists = staticData && staticData.regions && staticData.regions.has(regionName);
    testController.reportCondition(`"${regionName}" exists in static data`, !!regionExists);

    if (!regionExists) {
      const allRegions = staticData.regions ? Array.from(staticData.regions.keys()) : [];
      testController.log(`[${testRunId}] Available regions matching "Misery":`,
        allRegions.filter(name => name.includes('Misery')));
    }

    testController.reportCondition('Misery Mire (Entrance) UI test completed successfully', true);
    return true;

  } catch (error) {
    testController.log(`[${testRunId}] ✗ Misery Mire (Entrance) UI test failed: ${error.message}`, 'error');
    testController.reportCondition('Test execution failed', false);
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
  //enabled: false,
  //order: -2, // Run first
});

registerTest({
  id: 'debug_path_analyzer',
  name: 'Debug Path Analyzer',
  description: 'Simple debug test to isolate Path Analyzer issues.',
  testFunction: debugPathAnalyzerTest,
  category: 'Path Analysis',
  //enabled: false,
  //order: -1,
});

registerTest({
  id: 'test_path_analyzer_panel',
  name: 'Path Analyzer - Panel Test',
  description: 'Opens the Path Analyzer panel and selects a region to analyze.',
  testFunction: testPathAnalyzerPanel,
  category: 'Path Analysis',
  //enabled: false,
  //order: 0,
});

registerTest({
  id: 'test_path_analyzer_library',
  name: 'Path Analyzer - Library Test',
  description: 'Tests Path Analyzer with Library region (no parentheses).',
  testFunction: testPathAnalyzerLibrary,
  category: 'Path Analysis',
  //enabled: false,
  //order: 1,
});

registerTest({
  id: 'test_path_analyzer_misery_mire_entrance',
  name: 'Path Analyzer - Misery Mire (Entrance) Test',
  description: 'Tests Path Analyzer with Misery Mire (Entrance) region (with parentheses).',
  testFunction: testPathAnalyzerMiseryMireEntrance,
  category: 'Path Analysis',
  //enabled: false,
  //order: 2,
});

registerTest({
  id: 'test_path_analyzer_ui_library',
  name: 'Path Analyzer UI - Library Test',
  description: 'Tests Path Analyzer UI interaction with Library region (no parentheses).',
  testFunction: testPathAnalyzerUILibrary,
  category: 'Path Analysis',
  //enabled: false,
  //order: 3,
});

// DEBUG TEST: Check actual DOM structure
export async function debugPathAnalyzerLibraryPaths(testController) {
  const testRunId = `debug-paths-${Date.now()}`;
  testController.log(`[${testRunId}] Debug Path Analyzer Library Paths - Checking DOM structure`);

  try {
    testController.reportCondition('Test started', true);

    // Step 1: Get state manager and trigger analysis
    const stateManager = testController.stateManager;
    if (!stateManager) {
      throw new Error('State manager not available via TestController.');
    }

    // Step 2: Activate Path Analyzer panel
    await testController.performAction({
      type: 'DISPATCH_EVENT',
      eventName: 'ui:activatePanel',
      payload: { panelId: 'pathAnalyzerPanel' },
    });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 3: Get panel elements
    const panelElements = await testController.pollForValue(
      () => {
        const panelRoot = document.querySelector('#path-analyzer-panel-container');
        if (!panelRoot) return null;
        const regionInput = panelRoot.querySelector('[data-testid="path-analyzer-region-input"]');
        const analyzeButton = panelRoot.querySelector('[data-testid="path-analyzer-analyze-button"]');
        const resultsContainer = panelRoot.querySelector('.path-analysis-results');
        if (panelRoot && regionInput && analyzeButton && resultsContainer) {
          return { panelRoot, regionInput, analyzeButton, resultsContainer };
        }
        return null;
      },
      'Path Analyzer panel elements to exist',
      10000,
      50
    );

    if (!panelElements) {
      throw new Error('Path Analyzer panel elements not found');
    }

    const { regionInput, analyzeButton, resultsContainer } = panelElements;

    // Step 4: Analyze Library
    regionInput.value = 'Library';
    regionInput.dispatchEvent(new Event('input'));
    analyzeButton.click();

    // Step 5: Wait for analysis to complete
    await testController.pollForCondition(
      () => {
        const resultText = resultsContainer.textContent || '';
        return resultText.includes('Requirements') || 
               resultText.includes('No requirements found') || 
               resultText.includes('Error:');
      },
      'Analysis results to appear',
      15000,
      500
    );

    // Step 6: DEBUG - Check what path containers exist in the DOM
    const pathContainers = resultsContainer.querySelectorAll('.path-container');
    testController.log(`[${testRunId}] Found ${pathContainers.length} .path-container elements in DOM`);

    pathContainers.forEach((container, index) => {
      const pathHeader = container.querySelector('.path-header');
      const pathHeaderText = pathHeader ? pathHeader.textContent : 'NO HEADER';
      const isVisible = container.style.display !== 'none' && !container.hidden;
      testController.log(`[${testRunId}] Path ${index + 1}: "${pathHeaderText}" - Visible: ${isVisible}`);
      
      // Check if details are expanded/collapsed
      const exitRules = container.querySelector('.path-exit-rules');
      const exitRulesVisible = exitRules ? exitRules.style.display !== 'none' : false;
      testController.log(`[${testRunId}]   Exit rules visible: ${exitRulesVisible}`);
    });

    // Step 7: Check for path header text patterns
    const resultText = resultsContainer.textContent || '';
    const pathMatches = resultText.match(/Path \d+:/g) || [];
    testController.log(`[${testRunId}] Found ${pathMatches.length} "Path X:" patterns in text content`);
    pathMatches.forEach((match, index) => {
      testController.log(`[${testRunId}]   Pattern ${index + 1}: "${match}"`);
    });

    testController.reportCondition('Debug test completed successfully', true);
    return true;

  } catch (error) {
    testController.log(`[${testRunId}] ✗ Debug test failed: ${error.message}`, 'error');
    testController.reportCondition('Test execution failed', false);
    return false;
  }
}

registerTest({
  id: 'debug_path_analyzer_library_paths',
  name: 'Debug Path Analyzer Library Paths',
  description: 'Debug test to check actual DOM structure for Library paths',
  testFunction: debugPathAnalyzerLibraryPaths,
  category: 'Path Analysis',
  //enabled: false,
  //order: 2.5,
});

registerTest({
  id: 'test_path_analyzer_ui_misery_mire_entrance',
  name: 'Path Analyzer UI - Misery Mire (Entrance) Test',
  description: 'Tests Path Analyzer UI interaction with Misery Mire (Entrance) region (with parentheses).',
  testFunction: testPathAnalyzerUIMiseryMireEntrance,
  category: 'Path Analysis',
  //enabled: false,
  //order: 4,
});

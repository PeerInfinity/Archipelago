import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'exitsPanel';
const MAX_WAIT_TIME = 10000; // 10 seconds

/**
 * Test case for verifying the Library exit shows correct accessibility.
 * This test specifically checks the bug where regions and locations with the same name
 * would conflict in reachability data.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testLibraryExitAccessibility(testController) {
  let overallResult = true;
  const testRunId = `library-exit-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Library exit accessibility test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Exits panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500)); // wait for panel to fully init

    // 2. Wait for the exits panel to appear in DOM
    let exitsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          exitsPanelElement = document.querySelector('.exits-panel-container');
          return exitsPanelElement !== null;
        },
        'Exits panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Exits panel not found in DOM');
    }
    testController.reportCondition('Exits panel found in DOM', true);

    // 3. Wait for exits to be loaded and displayed
    let exitsGrid = null;
    if (
      !(await testController.pollForCondition(
        () => {
          exitsGrid = exitsPanelElement.querySelector('#exits-grid');
          return exitsGrid !== null && exitsGrid.children.length > 0;
        },
        'Exits grid populated with exits',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Exits grid not populated with exits');
    }
    testController.reportCondition('Exits grid populated', true);

    // 4. Look for the Library exit specifically
    let libraryExitCard = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const exitCards = exitsGrid.querySelectorAll('.exit-card');
          for (const card of exitCards) {
            const exitNameSpan = card.querySelector('.exit-name');
            if (exitNameSpan && exitNameSpan.textContent.trim() === 'Library') {
              libraryExitCard = card;
              return true;
            }
          }
          return false;
        },
        'Library exit card found',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Library exit card not found');
    }
    testController.reportCondition('Library exit card found', true);

    // 5. Get the current state snapshot to check region accessibility
    const stateManager = testController.stateManager;
    const snapshot = stateManager.getSnapshot();
    
    testController.log(`[${testRunId}] Checking snapshot data for Library region...`);
    
    // Check if Library region is reachable in the snapshot
    const libraryRegionStatus = snapshot.regionReachability?.['Library'];
    const isLibraryRegionReachable = 
      libraryRegionStatus === true || 
      libraryRegionStatus === 'reachable' || 
      libraryRegionStatus === 'checked';
      
    testController.log(`[${testRunId}] Library region status: ${libraryRegionStatus}, reachable: ${isLibraryRegionReachable}`);
    
    if (!isLibraryRegionReachable) {
      testController.log(`[${testRunId}] WARNING: Library region is not reachable in snapshot. This may affect the test.`);
    }

    // 6. Check the visual state of the Library exit card
    const hasTraversableClass = libraryExitCard.classList.contains('traversable');
    const hasNonTraversableClass = libraryExitCard.classList.contains('non-traversable-locked');
    const hasUnknownClass = libraryExitCard.classList.contains('unknown-accessibility');

    testController.log(`[${testRunId}] Library exit card classes: traversable=${hasTraversableClass}, non-traversable=${hasNonTraversableClass}, unknown=${hasUnknownClass}`);

    // 7. Get the status text from the exit card
    let statusText = 'unknown';
    const statusElements = libraryExitCard.querySelectorAll('div');
    for (const div of statusElements) {
      if (div.textContent.includes('Status:')) {
        statusText = div.textContent.replace('Status:', '').trim();
        break;
      }
    }
    testController.log(`[${testRunId}] Library exit status text: "${statusText}"`);

    // 8. Verify that if Library region is reachable, the exit should be traversable
    if (isLibraryRegionReachable) {
      if (hasTraversableClass || statusText === 'Traversable') {
        testController.reportCondition('Library exit shows as traversable when region is reachable', true);
        testController.log(`[${testRunId}] ✅ Library exit correctly shows as traversable`);
      } else {
        testController.reportCondition('Library exit shows as traversable when region is reachable', false);
        testController.log(`[${testRunId}] ❌ Library exit incorrectly shows as non-traversable despite region being reachable`);
        testController.log(`[${testRunId}] Expected: traversable, Got: ${statusText}`);
        overallResult = false;
      }
    } else {
      testController.log(`[${testRunId}] Library region is not reachable, so exit accessibility may vary`);
      testController.reportCondition('Library region accessibility noted', true);
    }

    // 9. Check for the specific bug pattern: "To Locked Region" when region is actually reachable
    if (isLibraryRegionReachable && statusText === 'To Locked Region') {
      testController.reportCondition('Library exit does not show "To Locked Region" when region is reachable', false);
      testController.log(`[${testRunId}] ❌ BUG DETECTED: Library exit shows "To Locked Region" but Library region is reachable!`);
      overallResult = false;
    } else if (isLibraryRegionReachable) {
      testController.reportCondition('Library exit does not show "To Locked Region" when region is reachable', true);
      testController.log(`[${testRunId}] ✅ Library exit does not incorrectly show "To Locked Region"`);
    }

    // 10. Additional diagnostic information
    testController.log(`[${testRunId}] Additional diagnostic info:`);
    testController.log(`[${testRunId}] - regionReachability exists: ${!!snapshot.regionReachability}`);
    testController.log(`[${testRunId}] - regionReachability entries: ${snapshot.regionReachability ? Object.keys(snapshot.regionReachability).length : 0}`);

    testController.reportCondition('Library exit accessibility test completed', overallResult);
    testController.log(`[${testRunId}] Library exit accessibility test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Library exit accessibility test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

/**
 * Test case for verifying exit panel basic functionality.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testExitPanelBasicFunctionality(testController) {
  let overallResult = true;
  const testRunId = `exit-panel-basic-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting exit panel basic functionality test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Exits panel
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Check panel exists
    const exitsPanelElement = document.querySelector('.exits-panel-container');
    if (!exitsPanelElement) {
      throw new Error('Exits panel not found in DOM');
    }
    testController.reportCondition('Exits panel exists in DOM', true);

    // 3. Check for required UI elements
    const searchInput = exitsPanelElement.querySelector('#exit-search');
    const sortSelect = exitsPanelElement.querySelector('#exit-sort-select');
    const exitsGrid = exitsPanelElement.querySelector('#exits-grid');

    testController.reportCondition('Search input exists', !!searchInput);
    testController.reportCondition('Sort select exists', !!sortSelect);
    testController.reportCondition('Exits grid exists', !!exitsGrid);

    if (!searchInput || !sortSelect || !exitsGrid) {
      overallResult = false;
    }

    // 4. Check if exits are loaded
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for data to load
    const exitCards = exitsGrid.querySelectorAll('.exit-card');
    const hasExits = exitCards.length > 0;
    
    testController.reportCondition('Exits are loaded', hasExits);
    testController.log(`[${testRunId}] Found ${exitCards.length} exit cards`);

    if (!hasExits) {
      overallResult = false;
    }

    testController.reportCondition('Exit panel basic functionality test completed', overallResult);
    testController.log(`[${testRunId}] Exit panel basic functionality test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Exit panel basic functionality test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

// Register the tests
registerTest({
  id: 'test_library_exit_accessibility',
  name: 'Library Exit Accessibility Test',
  category: 'Exit Panel',
  testFunction: testLibraryExitAccessibility,
  //enabled: false,
  description: 'Verifies that the Library exit shows correct accessibility status, specifically testing the fix for region/location name conflicts.'
});

registerTest({
  id: 'test_exit_panel_basic',
  name: 'Exit Panel Basic Functionality',
  category: 'Exit Panel',
  testFunction: testExitPanelBasicFunctionality,
  //enabled: false,
  description: 'Tests basic functionality of the Exit Panel including UI elements and data loading.'
});
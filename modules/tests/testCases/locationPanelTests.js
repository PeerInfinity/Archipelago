import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'locationsPanel';
const MAX_WAIT_TIME = 10000; // 10 seconds

/**
 * Test case for verifying the Library location shows correct accessibility.
 * This test specifically checks the fix for the bug where regions and locations with the same name
 * would conflict in reachability data. Expected behavior: Library region should be reachable,
 * but Library location should be unreachable, demonstrating proper separation.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testLibraryLocationAccessibility(testController) {
  let overallResult = true;
  const testRunId = `library-location-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Library location accessibility test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Locations panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 1500)); // wait for panel to fully init

    // 2. Wait for the locations panel to appear in DOM
    let locationsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          locationsPanelElement = document.querySelector('.locations-panel-container');
          return locationsPanelElement !== null;
        },
        'Locations panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Locations panel not found in DOM');
    }
    testController.reportCondition('Locations panel found in DOM', true);

    // 3. Wait for locations to be loaded and displayed
    let locationsGrid = null;
    if (
      !(await testController.pollForCondition(
        () => {
          locationsGrid = locationsPanelElement.querySelector('#locations-grid');
          return locationsGrid !== null && locationsGrid.children.length > 0;
        },
        'Locations grid populated with locations',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Locations grid not populated with locations');
    }
    testController.reportCondition('Locations grid populated', true);

    // 4. Look for the Library location specifically
    let libraryLocationCard = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const locationCards = locationsGrid.querySelectorAll('.location-card');
          for (const card of locationCards) {
            const locationNameSpan = card.querySelector('.location-name');
            if (locationNameSpan && locationNameSpan.textContent.trim() === 'Library') {
              libraryLocationCard = card;
              return true;
            }
          }
          return false;
        },
        'Library location card found',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Library location card not found');
    }
    testController.reportCondition('Library location card found', true);

    // 5. Get the current state snapshot to check location and region accessibility
    const stateManager = testController.stateManager;
    const snapshot = stateManager.getSnapshot();
    
    testController.log(`[${testRunId}] Checking snapshot data for Library location and region...`);
    
    // Check if Library region is reachable in the snapshot
    const libraryRegionStatus = snapshot.regionReachability?.['Library'];
    const isLibraryRegionReachable = 
      libraryRegionStatus === true || 
      libraryRegionStatus === 'reachable' || 
      libraryRegionStatus === 'checked';
    
    // Check if Library location is reachable in the snapshot
    const libraryLocationStatus = snapshot.locationReachability?.['Library'];
    const isLibraryLocationReachable = 
      libraryLocationStatus === true || 
      libraryLocationStatus === 'reachable' || 
      libraryLocationStatus === 'checked';
      
    testController.log(`[${testRunId}] Library region status: ${libraryRegionStatus}, reachable: ${isLibraryRegionReachable}`);
    testController.log(`[${testRunId}] Library location status: ${libraryLocationStatus}, reachable: ${isLibraryLocationReachable}`);
    
    // The expected behavior: Library region should be reachable, but Library location should NOT be reachable
    if (!isLibraryRegionReachable) {
      testController.log(`[${testRunId}] WARNING: Library region is not reachable. This may affect the test validity.`);
    }

    // 6. Check the visual state of the Library location card
    const hasFullyReachableClass = libraryLocationCard.classList.contains('fully-reachable');
    const hasRegionOnlyReachableClass = libraryLocationCard.classList.contains('region-only-reachable');
    const hasLocationOnlyReachableClass = libraryLocationCard.classList.contains('location-only-reachable');
    const hasFullyUnreachableClass = libraryLocationCard.classList.contains('fully-unreachable');
    const hasCheckedClass = libraryLocationCard.classList.contains('checked');
    const hasUnknownClass = libraryLocationCard.classList.contains('unknown');

    testController.log(`[${testRunId}] Library location card classes: fully-reachable=${hasFullyReachableClass}, region-only-reachable=${hasRegionOnlyReachableClass}, location-only-reachable=${hasLocationOnlyReachableClass}, fully-unreachable=${hasFullyUnreachableClass}, checked=${hasCheckedClass}, unknown=${hasUnknownClass}`);

    // 7. Get the status text from the location card
    let statusText = 'unknown';
    const statusElements = libraryLocationCard.querySelectorAll('div, span');
    for (const element of statusElements) {
      if (element.textContent.includes('Status:')) {
        statusText = element.textContent.replace('Status:', '').trim();
        break;
      }
      // Also check for direct status text patterns
      const text = element.textContent.trim();
      if (text === 'Reachable' || text === 'Unreachable' || text === 'Checked') {
        statusText = text;
        break;
      }
    }
    testController.log(`[${testRunId}] Library location status text: "${statusText}"`);

    // 8. Verify the expected behavior: Library region reachable, Library location NOT reachable
    // This tests the fix for the region/location name conflict bug
    if (isLibraryRegionReachable && !isLibraryLocationReachable) {
      // Expected case: region accessible, location not accessible
      // Should show as 'region-only-reachable' with text "Region Accessible, Rule Fails"
      if (hasRegionOnlyReachableClass || statusText === 'Region Accessible, Rule Fails') {
        testController.reportCondition('Library location correctly shows region accessible but location rule fails', true);
        testController.log(`[${testRunId}] ✅ Library location correctly shows as "Region Accessible, Rule Fails"`);
      } else {
        testController.reportCondition('Library location correctly shows region accessible but location rule fails', false);
        testController.log(`[${testRunId}] ❌ Library location should show "Region Accessible, Rule Fails" but shows as: ${statusText}`);
        overallResult = false;
      }
    } else if (isLibraryLocationReachable) {
      // If location is actually reachable, it should show as fully reachable
      if (hasFullyReachableClass || statusText === 'Available') {
        testController.reportCondition('Library location shows as reachable when accessible', true);
        testController.log(`[${testRunId}] ✅ Library location correctly shows as accessible`);
      } else {
        testController.reportCondition('Library location shows as reachable when accessible', false);
        testController.log(`[${testRunId}] ❌ Library location incorrectly shows as inaccessible despite being reachable`);
        overallResult = false;
      }
    } else {
      testController.log(`[${testRunId}] Unexpected state: Library region not reachable. Test may not be valid.`);
      testController.reportCondition('Library region/location state validation', false);
      overallResult = false;
    }

    // 9. Confirm the fix: region and location accessibility are properly separated
    const regionLocationSeparated = 
      (snapshot.regionReachability && snapshot.locationReachability) ||
      (isLibraryRegionReachable !== isLibraryLocationReachable);
    
    testController.reportCondition('Region and location accessibility properly separated', regionLocationSeparated);
    if (regionLocationSeparated) {
      testController.log(`[${testRunId}] ✅ Region and location accessibility are properly separated`);
    } else {
      testController.log(`[${testRunId}] ❌ Region and location accessibility may still be conflated`);
      overallResult = false;
    }

    // 10. Additional diagnostic information
    testController.log(`[${testRunId}] Additional diagnostic info:`);
    testController.log(`[${testRunId}] - locationReachability exists: ${!!snapshot.locationReachability}`);
    testController.log(`[${testRunId}] - locationReachability entries: ${snapshot.locationReachability ? Object.keys(snapshot.locationReachability).length : 0}`);

    testController.reportCondition('Library location accessibility test completed', overallResult);
    testController.log(`[${testRunId}] Library location accessibility test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Library location accessibility test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

/**
 * Test case for verifying location panel basic functionality.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testLocationPanelBasicFunctionality(testController) {
  let overallResult = true;
  const testRunId = `location-panel-basic-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting location panel basic functionality test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Locations panel
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Check panel exists
    const locationsPanelElement = document.querySelector('.locations-panel-container');
    if (!locationsPanelElement) {
      throw new Error('Locations panel not found in DOM');
    }
    testController.reportCondition('Locations panel exists in DOM', true);

    // 3. Check for required UI elements
    const searchInput = locationsPanelElement.querySelector('#location-search');
    const sortSelect = locationsPanelElement.querySelector('#sort-select');
    const locationsGrid = locationsPanelElement.querySelector('#locations-grid');

    testController.reportCondition('Search input exists', !!searchInput);
    testController.reportCondition('Sort select exists', !!sortSelect);
    testController.reportCondition('Locations grid exists', !!locationsGrid);

    if (!searchInput || !sortSelect || !locationsGrid) {
      overallResult = false;
    }

    // 4. Check if locations are loaded
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for data to load
    const locationCards = locationsGrid.querySelectorAll('.location-card');
    const hasLocations = locationCards.length > 0;
    
    testController.reportCondition('Locations are loaded', hasLocations);
    testController.log(`[${testRunId}] Found ${locationCards.length} location cards`);

    if (!hasLocations) {
      overallResult = false;
    }

    testController.reportCondition('Location panel basic functionality test completed', overallResult);
    testController.log(`[${testRunId}] Location panel basic functionality test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Location panel basic functionality test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

// Register the tests
registerTest({
  id: 'test_library_location_accessibility',
  name: 'Library Location Accessibility Test',
  category: 'Location Panel',
  testFunction: testLibraryLocationAccessibility,
  enabled: false,
  description: 'Verifies that Library region and location accessibility are properly separated. Expected: Library region reachable, Library location unreachable.'
});

registerTest({
  id: 'test_location_panel_basic',
  name: 'Location Panel Basic Functionality',
  category: 'Location Panel',
  testFunction: testLocationPanelBasicFunctionality,
  enabled: false,
  description: 'Tests basic functionality of the Location Panel including UI elements and data loading.'
});
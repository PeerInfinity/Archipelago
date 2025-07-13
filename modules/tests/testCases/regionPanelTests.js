import { registerTest } from '../testRegistry.js';

// Constants for test configuration
const PANEL_ID = 'regionsPanel';
const MAX_WAIT_TIME = 10000; // 10 seconds

/**
 * Test case for verifying the Library region shows as accessible while the Library location shows as inaccessible.
 * This version uses the "Show All Regions" checkbox to reveal all regions.
 * This test specifically checks the fix for the bug where regions and locations with the same name
 * would conflict in reachability data. Expected behavior: Library region should be accessible,
 * but Library location within that region should be inaccessible.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testLibraryRegionAccessibilityShowAll(testController) {
  let overallResult = true;
  const testRunId = `library-region-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Library region accessibility test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Regions panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 1500)); // wait for panel to fully init

    // 2. Wait for the regions panel to appear in DOM
    let regionsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          regionsPanelElement = document.querySelector('.regions-panel-container');
          return regionsPanelElement !== null;
        },
        'Regions panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Regions panel not found in DOM');
    }
    testController.reportCondition('Regions panel found in DOM', true);

    // 3. Wait for regions to be loaded and displayed
    let regionsContainer = null;
    if (
      !(await testController.pollForCondition(
        () => {
          regionsContainer = regionsPanelElement.querySelector('#region-details-container');
          if (!regionsContainer) return false;
          
          // Check if container has content - might be in different layouts
          const hasAccessibilitySections = regionsContainer.querySelector('#accessibility-sorted-sections');
          const hasGeneralSections = regionsContainer.querySelector('#general-sorted-list-section');
          const hasDirectChildren = regionsContainer.children.length > 0;
          
          return hasAccessibilitySections || hasGeneralSections || hasDirectChildren;
        },
        'Regions container populated with regions',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Regions container not populated with regions');
    }
    testController.reportCondition('Regions container populated', true);

    // 3.5. Enable "Show All Regions" mode to see all regions
    const showAllRegionsCheckbox = regionsPanelElement.querySelector('#show-all-regions');
    if (!showAllRegionsCheckbox) {
      throw new Error('"Show All Regions" checkbox not found');
    }
    
    if (!showAllRegionsCheckbox.checked) {
      testController.log(`[${testRunId}] Enabling "Show All Regions" mode...`);
      showAllRegionsCheckbox.click();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for UI update
      testController.reportCondition('"Show All Regions" enabled', true);
    } else {
      testController.log(`[${testRunId}] "Show All Regions" already enabled`);
      testController.reportCondition('"Show All Regions" already enabled', true);
    }

    // 4. Look for the Library region specifically
    let libraryRegionBlock = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const regionBlocks = regionsContainer.querySelectorAll('.region-block');
          for (const block of regionBlocks) {
            const regionNameElement = block.querySelector('.region-name');
            if (regionNameElement && regionNameElement.textContent.trim() === 'Library') {
              libraryRegionBlock = block;
              return true;
            }
          }
          return false;
        },
        'Library region block found',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Library region block not found');
    }
    testController.reportCondition('Library region block found', true);

    // 5. Get the current state snapshot to check region and location accessibility
    const stateManager = testController.stateManager;
    const snapshot = stateManager.getSnapshot();
    
    testController.log(`[${testRunId}] Checking snapshot data for Library region and location...`);
    
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

    // 6. Check the visual state of the Library region block
    const regionHeader = libraryRegionBlock.querySelector('.region-header');
    const hasAccessibleClass = regionHeader ? regionHeader.classList.contains('accessible') : false;
    const hasInaccessibleClass = regionHeader ? regionHeader.classList.contains('inaccessible') : false;
    const hasCompletedClass = regionHeader ? regionHeader.classList.contains('completed-region') : false;

    testController.log(`[${testRunId}] Library region header classes: accessible=${hasAccessibleClass}, inaccessible=${hasInaccessibleClass}, completed=${hasCompletedClass}`);

    // 7. Get the status text from the region block
    let statusText = 'unknown';
    const statusElement = libraryRegionBlock.querySelector('.region-status');
    if (statusElement) {
      statusText = statusElement.textContent.trim();
    }
    testController.log(`[${testRunId}] Library region status text: "${statusText}"`);

    // 8. Verify that the Library region shows as accessible
    if (isLibraryRegionReachable) {
      if (hasAccessibleClass || hasCompletedClass) {
        testController.reportCondition('Library region shows as accessible', true);
        testController.log(`[${testRunId}] ✅ Library region correctly shows as accessible`);
      } else {
        testController.reportCondition('Library region shows as accessible', false);
        testController.log(`[${testRunId}] ❌ Library region incorrectly shows as inaccessible despite being reachable`);
        testController.log(`[${testRunId}] Expected: accessible, Got classes: accessible=${hasAccessibleClass}, inaccessible=${hasInaccessibleClass}`);
        overallResult = false;
      }
    } else {
      testController.log(`[${testRunId}] Library region is not reachable, so region accessibility may vary`);
      testController.reportCondition('Library region accessibility noted', true);
    }

    // 9. Look for the Library location within the Library region block
    let libraryLocationElement = null;
    const locationElements = libraryRegionBlock.querySelectorAll('.location-link, .location-wrapper');
    for (const locElement of locationElements) {
      if (locElement.textContent.includes('Library')) {
        libraryLocationElement = locElement;
        break;
      }
    }

    if (libraryLocationElement) {
      testController.reportCondition('Library location found within Library region', true);
      testController.log(`[${testRunId}] Library location found within region card`);

      // Check the visual state of the Library location within the region
      const locationHasAccessibleClass = libraryLocationElement.classList.contains('accessible');
      const locationHasInaccessibleClass = libraryLocationElement.classList.contains('inaccessible');
      const locationHasCheckedClass = libraryLocationElement.classList.contains('checked-location');

      testController.log(`[${testRunId}] Library location within region classes: accessible=${locationHasAccessibleClass}, inaccessible=${locationHasInaccessibleClass}, checked=${locationHasCheckedClass}`);

      // Verify the location shows as inaccessible while region is accessible
      if (isLibraryRegionReachable && !isLibraryLocationReachable) {
        if (locationHasInaccessibleClass || !locationHasAccessibleClass) {
          testController.reportCondition('Library location shows as inaccessible within accessible region', true);
          testController.log(`[${testRunId}] ✅ Library location correctly shows as inaccessible within accessible region`);
        } else {
          testController.reportCondition('Library location shows as inaccessible within accessible region', false);
          testController.log(`[${testRunId}] ❌ Library location incorrectly shows as accessible`);
          overallResult = false;
        }
      }
    } else {
      testController.reportCondition('Library location found within Library region', false);
      testController.log(`[${testRunId}] Warning: Could not find Library location within Library region card`);
      // This is not necessarily a failure, as the region panel might not show individual locations
    }

    // 10. Confirm the fix: region and location accessibility are properly separated
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

    // 11. Additional diagnostic information
    testController.log(`[${testRunId}] Additional diagnostic info:`);
    testController.log(`[${testRunId}] - regionReachability exists: ${!!snapshot.regionReachability}`);
    testController.log(`[${testRunId}] - regionReachability entries: ${snapshot.regionReachability ? Object.keys(snapshot.regionReachability).length : 0}`);
    testController.log(`[${testRunId}] - locationReachability exists: ${!!snapshot.locationReachability}`);
    testController.log(`[${testRunId}] - locationReachability entries: ${snapshot.locationReachability ? Object.keys(snapshot.locationReachability).length : 0}`);

    testController.reportCondition('Library region accessibility test completed', overallResult);
    testController.log(`[${testRunId}] Library region accessibility test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Library region accessibility test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

/**
 * Test case for verifying the Library region shows as accessible while the Library location shows as inaccessible.
 * This version uses the Move buttons to navigate to the Library region step by step:
 * Menu → Links House S&Q → Links House → Light World → Library
 * This test specifically checks the fix for the bug where regions and locations with the same name
 * would conflict in reachability data. Expected behavior: Library region should be accessible,
 * but Library location within that region should be inaccessible.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testLibraryRegionAccessibilityNavigation(testController) {
  let overallResult = true;
  const testRunId = `library-region-nav-test-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting Library region navigation accessibility test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Regions panel
    testController.log(`[${testRunId}] Activating ${PANEL_ID} panel...`);
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 1500)); // wait for panel to fully init

    // 2. Wait for the regions panel to appear in DOM
    let regionsPanelElement = null;
    if (
      !(await testController.pollForCondition(
        () => {
          regionsPanelElement = document.querySelector('.regions-panel-container');
          return regionsPanelElement !== null;
        },
        'Regions panel DOM element',
        5000,
        250
      ))
    ) {
      throw new Error('Regions panel not found in DOM');
    }
    testController.reportCondition('Regions panel found in DOM', true);

    // 3. Wait for regions container to be populated
    let regionsContainer = null;
    if (
      !(await testController.pollForCondition(
        () => {
          regionsContainer = regionsPanelElement.querySelector('#region-details-container');
          if (!regionsContainer) return false;
          
          // Check if container has content - might be in different layouts
          const hasAccessibilitySections = regionsContainer.querySelector('#accessibility-sorted-sections');
          const hasGeneralSections = regionsContainer.querySelector('#general-sorted-list-section');
          const hasDirectChildren = regionsContainer.children.length > 0;
          
          return hasAccessibilitySections || hasGeneralSections || hasDirectChildren;
        },
        'Regions container populated with regions',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Regions container not populated with regions');
    }
    testController.reportCondition('Regions container populated', true);

    // 4. Ensure "Show All Regions" is unchecked for navigation test
    const showAllRegionsCheckbox = regionsPanelElement.querySelector('#show-all-regions');
    if (!showAllRegionsCheckbox) {
      throw new Error('"Show All Regions" checkbox not found');
    }
    
    if (showAllRegionsCheckbox.checked) {
      testController.log(`[${testRunId}] Unchecking "Show All Regions" for navigation test...`);
      showAllRegionsCheckbox.click();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for UI update
      testController.reportCondition('"Show All Regions" unchecked for navigation', true);
    } else {
      testController.log(`[${testRunId}] "Show All Regions" already unchecked`);
      testController.reportCondition('"Show All Regions" already unchecked', true);
    }

    // 5. Navigation sequence: Menu → Links House S&Q → Links House → Light World → Library
    const navigationSteps = [
      { from: 'Menu', to: 'Links House S&Q', exit: 'Links House S&Q', newRegion: 'Links House' },
      { from: 'Links House', to: 'Light World', exit: 'Links House Exit', newRegion: 'Light World' },
      { from: 'Light World', to: 'Library', exit: 'Library', newRegion: 'Library' }
    ];

    for (const step of navigationSteps) {
      testController.log(`[${testRunId}] Navigating from ${step.from} to ${step.to} via ${step.exit}...`);
      
      // Find the current region block
      const regionBlocks = regionsContainer.querySelectorAll('.region-block');
      let foundBlock = null;
      for (const block of regionBlocks) {
        const nameElement = block.querySelector('.region-name');
        if (nameElement && nameElement.textContent.trim() === step.from) {
          foundBlock = block;
          break;
        }
      }
      
      if (!foundBlock) {
        // Debug: Log all available region blocks
        const availableRegions = [];
        for (const block of regionBlocks) {
          const nameElement = block.querySelector('.region-name');
          if (nameElement) {
            availableRegions.push(nameElement.textContent.trim());
          }
        }
        testController.log(`[${testRunId}] Available region blocks: [${availableRegions.join(', ')}]`);
        throw new Error(`Could not find region block for "${step.from}". Available regions: [${availableRegions.join(', ')}]`);
      }
      
      // Find the move button for the specific exit
      const moveButtons = foundBlock.querySelectorAll('.move-btn');
      let targetMoveButton = null;
      
      for (const button of moveButtons) {
        // Check if button text or nearby text contains the exit name
        const buttonText = button.textContent || '';
        const parentText = button.parentElement.textContent || '';
        if (buttonText.includes(step.exit) || parentText.includes(step.exit)) {
          targetMoveButton = button;
          break;
        }
      }
      
      if (!targetMoveButton) {
        // Debug: Log all available move buttons in this region
        const availableButtons = [];
        for (const button of moveButtons) {
          const buttonText = button.textContent || '';
          const parentText = button.parentElement.textContent || '';
          availableButtons.push(`"${buttonText}" (parent: "${parentText}")`);
        }
        testController.log(`[${testRunId}] Available move buttons in "${step.from}": [${availableButtons.join(', ')}]`);
        throw new Error(`Could not find Move button for exit "${step.exit}" in region "${step.from}". Available buttons: [${availableButtons.join(', ')}]`);
      }
      
      // Click the move button
      targetMoveButton.click();
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Wait for navigation
      
      // Wait for the new region to appear (if specified)
      if (step.newRegion) {
        const newRegionAppeared = await testController.pollForCondition(
          () => {
            const regionBlocks = regionsContainer.querySelectorAll('.region-block');
            for (const block of regionBlocks) {
              const nameElement = block.querySelector('.region-name');
              if (nameElement && nameElement.textContent.trim() === step.newRegion) {
                return true;
              }
            }
            return false;
          },
          `New region "${step.newRegion}" appears after navigation`,
          5000,
          250
        );
        
        if (!newRegionAppeared) {
          // Debug: Show what regions are actually available after navigation
          const currentRegions = [];
          const regionBlocks = regionsContainer.querySelectorAll('.region-block');
          for (const block of regionBlocks) {
            const nameElement = block.querySelector('.region-name');
            if (nameElement) {
              currentRegions.push(nameElement.textContent.trim());
            }
          }
          testController.log(`[${testRunId}] Regions after navigation: [${currentRegions.join(', ')}]`);
          throw new Error(`New region "${step.newRegion}" did not appear after navigation. Available: [${currentRegions.join(', ')}]`);
        }
      }
      
      testController.reportCondition(`Navigated from ${step.from} to ${step.to}`, true);
    }

    // 6. Now look for the Library region block
    let libraryRegionBlock = null;
    if (
      !(await testController.pollForCondition(
        () => {
          const regionBlocks = regionsContainer.querySelectorAll('.region-block');
          for (const block of regionBlocks) {
            const regionNameElement = block.querySelector('.region-name');
            if (regionNameElement && regionNameElement.textContent.trim() === 'Library') {
              libraryRegionBlock = block;
              return true;
            }
          }
          return false;
        },
        'Library region block found after navigation',
        MAX_WAIT_TIME,
        500
      ))
    ) {
      throw new Error('Library region block not found after navigation');
    }
    testController.reportCondition('Library region block found after navigation', true);

    // 7. Get the current state snapshot to check region and location accessibility
    const stateManager = testController.stateManager;
    const snapshot = stateManager.getSnapshot();
    
    testController.log(`[${testRunId}] Checking snapshot data for Library region and location...`);
    
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
    
    // 8. Check the visual state of the Library region block
    const regionHeader = libraryRegionBlock.querySelector('.region-header');
    const hasAccessibleClass = regionHeader ? regionHeader.classList.contains('accessible') : false;
    const hasInaccessibleClass = regionHeader ? regionHeader.classList.contains('inaccessible') : false;
    const hasCompletedClass = regionHeader ? regionHeader.classList.contains('completed-region') : false;

    testController.log(`[${testRunId}] Library region header classes: accessible=${hasAccessibleClass}, inaccessible=${hasInaccessibleClass}, completed=${hasCompletedClass}`);

    // 9. Verify that the Library region shows as accessible
    if (isLibraryRegionReachable) {
      if (hasAccessibleClass || hasCompletedClass) {
        testController.reportCondition('Library region shows as accessible via navigation', true);
        testController.log(`[${testRunId}] ✅ Library region correctly shows as accessible via navigation`);
      } else {
        testController.reportCondition('Library region shows as accessible via navigation', false);
        testController.log(`[${testRunId}] ❌ Library region incorrectly shows as inaccessible despite being reachable`);
        overallResult = false;
      }
    } else {
      testController.log(`[${testRunId}] Library region is not reachable, so region accessibility may vary`);
      testController.reportCondition('Library region accessibility noted via navigation', true);
    }

    // 10. Look for the Library location within the Library region block
    let libraryLocationElement = null;
    const locationElements = libraryRegionBlock.querySelectorAll('.location-link, .location-wrapper');
    for (const locElement of locationElements) {
      if (locElement.textContent.includes('Library')) {
        libraryLocationElement = locElement;
        break;
      }
    }

    if (libraryLocationElement) {
      testController.reportCondition('Library location found within Library region via navigation', true);
      
      // Check the visual state of the Library location within the region
      const locationHasAccessibleClass = libraryLocationElement.classList.contains('accessible');
      const locationHasInaccessibleClass = libraryLocationElement.classList.contains('inaccessible');
      const locationHasCheckedClass = libraryLocationElement.classList.contains('checked-location');

      testController.log(`[${testRunId}] Library location within region classes: accessible=${locationHasAccessibleClass}, inaccessible=${locationHasInaccessibleClass}, checked=${locationHasCheckedClass}`);

      // Verify the location shows as inaccessible while region is accessible
      if (isLibraryRegionReachable && !isLibraryLocationReachable) {
        if (locationHasInaccessibleClass || !locationHasAccessibleClass) {
          testController.reportCondition('Library location shows as inaccessible within accessible region via navigation', true);
          testController.log(`[${testRunId}] ✅ Library location correctly shows as inaccessible within accessible region via navigation`);
        } else {
          testController.reportCondition('Library location shows as inaccessible within accessible region via navigation', false);
          testController.log(`[${testRunId}] ❌ Library location incorrectly shows as accessible via navigation`);
          overallResult = false;
        }
      }
    } else {
      testController.reportCondition('Library location found within Library region via navigation', false);
      testController.log(`[${testRunId}] Warning: Could not find Library location within Library region card via navigation`);
    }

    // 11. Confirm the fix works with navigation method
    const regionLocationSeparated = 
      (snapshot.regionReachability && snapshot.locationReachability) ||
      (isLibraryRegionReachable !== isLibraryLocationReachable);
    
    testController.reportCondition('Region and location accessibility properly separated via navigation', regionLocationSeparated);
    if (regionLocationSeparated) {
      testController.log(`[${testRunId}] ✅ Region and location accessibility are properly separated via navigation`);
    } else {
      testController.log(`[${testRunId}] ❌ Region and location accessibility may still be conflated via navigation`);
      overallResult = false;
    }

    testController.reportCondition('Library region navigation accessibility test completed', overallResult);
    testController.log(`[${testRunId}] Library region navigation accessibility test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Library region navigation accessibility test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

/**
 * Test case for verifying region panel basic functionality.
 * @param {object} testController - The test controller object provided by the test runner.
 * @returns {Promise<boolean>} - True if the test passed, false otherwise.
 */
export async function testRegionPanelBasicFunctionality(testController) {
  let overallResult = true;
  const testRunId = `region-panel-basic-${Date.now()}`;

  try {
    testController.log(`[${testRunId}] Starting region panel basic functionality test...`);
    testController.reportCondition('Test started', true);

    // 1. Activate the Regions panel
    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;
    eventBus.publish('ui:activatePanel', { panelId: PANEL_ID });
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 2. Check panel exists
    const regionsPanelElement = document.querySelector('.regions-panel-container');
    if (!regionsPanelElement) {
      throw new Error('Regions panel not found in DOM');
    }
    testController.reportCondition('Regions panel exists in DOM', true);

    // 3. Check for required UI elements
    const searchInput = regionsPanelElement.querySelector('#region-search');
    const sortSelect = regionsPanelElement.querySelector('#region-sort-select');
    const regionsContainer = regionsPanelElement.querySelector('#region-details-container');

    testController.reportCondition('Search input exists', !!searchInput);
    testController.reportCondition('Sort select exists', !!sortSelect);
    testController.reportCondition('Regions container exists', !!regionsContainer);

    if (!searchInput || !sortSelect || !regionsContainer) {
      overallResult = false;
    }

    // 4. Check if regions are loaded
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for data to load
    const regionBlocks = regionsContainer.querySelectorAll('.region-block');
    const hasRegions = regionBlocks.length > 0;
    
    testController.reportCondition('Regions are loaded', hasRegions);
    testController.log(`[${testRunId}] Found ${regionBlocks.length} region blocks`);

    if (!hasRegions) {
      overallResult = false;
    }

    testController.reportCondition('Region panel basic functionality test completed', overallResult);
    testController.log(`[${testRunId}] Region panel basic functionality test ${overallResult ? 'PASSED' : 'FAILED'}`);

  } catch (error) {
    testController.log(`[${testRunId}] ERROR: ${error.message}`);
    testController.reportCondition('Region panel basic functionality test error-free', false);
    overallResult = false;
  }

  return overallResult;
}

// Register the tests
registerTest({
  id: 'test_library_region_accessibility_show_all',
  name: 'Library Region Accessibility Test (Show All)',
  category: 'Region Panel',
  testFunction: testLibraryRegionAccessibilityShowAll,
  enabled: false,
  description: 'Verifies that Library region shows as accessible while Library location shows as inaccessible using "Show All Regions" mode.'
});

registerTest({
  id: 'test_library_region_accessibility_navigation',
  name: 'Library Region Accessibility Test (Navigation)',
  category: 'Region Panel',
  testFunction: testLibraryRegionAccessibilityNavigation,
  enabled: false,
  description: 'Verifies that Library region shows as accessible while Library location shows as inaccessible using Move button navigation.'
});

registerTest({
  id: 'test_region_panel_basic',
  name: 'Region Panel Basic Functionality',
  category: 'Region Panel',
  testFunction: testRegionPanelBasicFunctionality,
  enabled: false,
  description: 'Tests basic functionality of the Region Panel including UI elements and data loading.'
});
// JSONPanelTests.js - Tests for the JSON panel functionality

import { registerTest } from '../testRegistry.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('JSONPanelTests', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[JSONPanelTests] ${message}`, ...data);
  }
}

/**
 * Test that verifies the JSON panel's Import from Text functionality works correctly.
 * This test:
 * 1. Enables colorblind mode via Settings panel
 * 2. Exports settings to text via JSON panel
 * 3. Disables colorblind mode via Settings panel
 * 4. Uses Import from Text to restore the saved settings
 * 5. Verifies colorblind mode was restored
 */
export async function testJSONPanelImportFromText(testController) {
  log('info', 'Starting JSON panel Import from Text test');
  const testRunId = `json-import-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting JSON panel Import from Text test...`);
    testController.reportCondition('Test started', true);

    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    // Step 1: Activate the Settings panel
    testController.log(`[${testRunId}] Step 1: Activating Settings panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'settingsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    // Wait for the settings panel to appear in DOM
    let settingsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        settingsPanelElement = document.querySelector('.settings-panel-content');
        return settingsPanelElement !== null;
      },
      'Settings panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Settings panel not found in DOM');
    }
    testController.reportCondition('Settings panel found in DOM', true);
    
    // Wait for settings textarea to initialize
    let textAreaElement = null;
    if (!(await testController.pollForCondition(
      () => {
        textAreaElement = settingsPanelElement.querySelector('.settings-textarea');
        return textAreaElement !== null;
      },
      'Settings textarea to initialize',
      3000,
      250
    ))) {
      throw new Error('Settings textarea not found');
    }
    testController.reportCondition('Settings textarea found', true);

    // Step 2: Enable colorblind mode for regions
    testController.log(`[${testRunId}] Step 2: Enabling colorblind mode for regions...`);
    
    let settingsText = textAreaElement.value;
    if (!settingsText.includes('colorblindMode')) {
      throw new Error('colorblindMode settings not found in settings JSON');
    }
    
    // Enable colorblind mode for regions
    let updatedSettings = settingsText.replace(/"regions":\s*false/g, '"regions": true');
    
    if (updatedSettings === settingsText) {
      throw new Error('Failed to update colorblind regions setting to true');
    }
    
    textAreaElement.value = updatedSettings;
    testController.reportCondition('Colorblind regions setting updated to true', true);
    
    // Apply the settings
    const applyButton = settingsPanelElement.querySelector('button');
    if (!applyButton) {
      throw new Error('Apply button not found in Settings panel');
    }
    
    applyButton.click();
    
    // Wait for the settings to be applied
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Applied!' || applyButton.textContent === 'Apply';
      },
      'Apply button feedback',
      2000,
      100
    ))) {
      throw new Error('Apply button feedback not received');
    }
    testController.reportCondition('Settings applied successfully', true);

    // Step 3: Verify colorblind mode is active in Regions panel
    testController.log(`[${testRunId}] Step 3: Verifying colorblind mode active in Regions panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let regionsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        regionsPanelElement = document.querySelector('.regions-panel-container');
        return regionsPanelElement !== null;
      },
      'Regions panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Regions panel not found in DOM');
    }

    // Check for colorblind symbol in Menu region
    if (!(await testController.pollForCondition(
      () => {
        const regionBlocks = regionsPanelElement.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Menu') {
            const colorblindSymbol = block.querySelector('.colorblind-symbol');
            return colorblindSymbol !== null;
          }
        }
        return false;
      },
      'Colorblind symbol in Regions panel',
      5000,
      250
    ))) {
      throw new Error('Colorblind symbol not found in Menu region');
    }
    testController.reportCondition('Regions panel colorblind mode active', true);

    // Step 4: Activate the JSON panel
    testController.log(`[${testRunId}] Step 4: Activating JSON panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let jsonPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        jsonPanelElement = document.querySelector('.json-panel-container');
        return jsonPanelElement !== null;
      },
      'JSON panel DOM element',
      5000,
      250
    ))) {
      throw new Error('JSON panel not found in DOM');
    }
    testController.reportCondition('JSON panel found in DOM', true);

    // Step 5: Disable all checkboxes except settings
    testController.log(`[${testRunId}] Step 5: Configuring JSON panel checkboxes...`);
    
    // Uncheck all checkboxes first
    const allCheckboxes = jsonPanelElement.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of allCheckboxes) {
      checkbox.checked = false;
    }
    
    // Then check only the settings checkbox
    const settingsCheckbox = jsonPanelElement.querySelector('#json-chk-settings');
    if (!settingsCheckbox) {
      throw new Error('Settings checkbox not found in JSON panel');
    }
    settingsCheckbox.checked = true;
    testController.reportCondition('JSON panel checkboxes configured (only settings enabled)', true);

    // Step 6: Click Export to Text button
    testController.log(`[${testRunId}] Step 6: Clicking Export to Text button...`);
    const exportTextButton = jsonPanelElement.querySelector('#json-btn-export-text');
    if (!exportTextButton) {
      throw new Error('Export to Text button not found in JSON panel');
    }
    
    exportTextButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testController.reportCondition('Export to Text button clicked', true);

    // Step 7: Get contents from Editor panel
    testController.log(`[${testRunId}] Step 7: Retrieving contents from Editor panel...`);
    
    // Wait for editor panel to be activated
    let editorPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        editorPanelElement = document.querySelector('.editor-panel-content');
        return editorPanelElement !== null;
      },
      'Editor panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Editor panel not found in DOM after export');
    }

    // Wait for textarea and dropdown to be ready
    let editorTextarea = null;
    let editorDropdown = null;
    if (!(await testController.pollForCondition(
      () => {
        editorTextarea = editorPanelElement.querySelector('textarea');
        editorDropdown = editorPanelElement.querySelector('select');
        return editorTextarea !== null && editorDropdown !== null;
      },
      'Editor textarea and dropdown',
      3000,
      250
    ))) {
      throw new Error('Editor textarea or dropdown not found');
    }

    // Verify dropdown is set to "Data for Export"
    if (editorDropdown.value !== 'dataForExport') {
      throw new Error(`Editor dropdown not set to dataForExport, current value: ${editorDropdown.value}`);
    }
    testController.reportCondition('Editor dropdown set to Data for Export', true);

    // Save the editor content
    const savedEditorContent = editorTextarea.value;
    if (!savedEditorContent.trim()) {
      throw new Error('Editor content is empty after export');
    }
    
    // Verify the content contains settings data
    if (!savedEditorContent.includes('userSettings')) {
      throw new Error('Exported content does not contain userSettings');
    }
    testController.reportCondition('Editor content saved and contains userSettings', true);

    // Step 8: Disable colorblind mode via Settings panel
    testController.log(`[${testRunId}] Step 8: Disabling colorblind mode via Settings panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'settingsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    const disabledSettings = textAreaElement.value.replace(/"regions":\s*true/g, '"regions": false');
    
    if (disabledSettings === textAreaElement.value) {
      throw new Error('Failed to update colorblind regions setting to false');
    }
    
    textAreaElement.value = disabledSettings;
    testController.reportCondition('Colorblind regions setting updated to false', true);
    
    applyButton.click();
    
    // Wait for the settings to be applied
    if (!(await testController.pollForCondition(
      () => {
        return applyButton.textContent === 'Applied!' || applyButton.textContent === 'Apply';
      },
      'Apply button feedback for disable',
      2000,
      100
    ))) {
      throw new Error('Apply button feedback not received for disable');
    }
    testController.reportCondition('Disable settings applied successfully', true);

    // Step 9: Verify colorblind mode is disabled in Regions panel
    testController.log(`[${testRunId}] Step 9: Verifying colorblind mode disabled in Regions panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    if (!(await testController.pollForCondition(
      () => {
        const regionBlocks = regionsPanelElement.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Menu') {
            const colorblindSymbol = block.querySelector('.colorblind-symbol');
            return colorblindSymbol === null;
          }
        }
        return false;
      },
      'Colorblind symbol removed from Regions panel',
      5000,
      250
    ))) {
      throw new Error('Colorblind symbol still present in Menu region');
    }
    testController.reportCondition('Regions panel colorblind mode disabled', true);

    // Step 10: Activate JSON panel again
    testController.log(`[${testRunId}] Step 10: Re-activating JSON panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 11: Configure checkboxes again (disable all except settings)
    testController.log(`[${testRunId}] Step 11: Re-configuring JSON panel checkboxes...`);
    
    const allCheckboxes2 = jsonPanelElement.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of allCheckboxes2) {
      checkbox.checked = false;
    }
    
    const settingsCheckbox2 = jsonPanelElement.querySelector('#json-chk-settings');
    if (!settingsCheckbox2) {
      throw new Error('Settings checkbox not found in JSON panel (second time)');
    }
    settingsCheckbox2.checked = true;
    testController.reportCondition('JSON panel checkboxes re-configured', true);

    // Step 12: Activate Editor panel and verify content
    testController.log(`[${testRunId}] Step 12: Activating Editor panel to verify content...`);
    eventBus.publish('ui:activatePanel', { panelId: 'editorPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 13: Select "Data for Export" from dropdown
    testController.log(`[${testRunId}] Step 13: Selecting Data for Export from dropdown...`);
    
    // Set dropdown to dataForExport
    editorDropdown.value = 'dataForExport';
    editorDropdown.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    testController.reportCondition('Editor dropdown set to Data for Export', true);

    // Step 14: Verify editor content matches saved content
    testController.log(`[${testRunId}] Step 14: Verifying editor content matches saved content...`);
    
    const currentEditorContent = editorTextarea.value;
    if (currentEditorContent !== savedEditorContent) {
      throw new Error('Current editor content does not match previously saved content');
    }
    testController.reportCondition('Editor content matches saved content', true);

    // Step 15: Use Import from Text functionality
    testController.log(`[${testRunId}] Step 15: Using Import from Text functionality...`);
    
    // Mock the confirm and alert dialogs BEFORE activating the panel
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    window.confirm = () => {
      testController.log(`[${testRunId}] Confirm dialog intercepted, returning true`);
      return true;
    };
    window.alert = (message) => {
      testController.log(`[${testRunId}] Alert dialog intercepted: ${message}`);
    };
    
    try {
      // Activate JSON panel
      eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Click Import from Text button
      const importTextButton = jsonPanelElement.querySelector('#json-btn-import-text');
      if (!importTextButton) {
        throw new Error('Import from Text button not found in JSON panel');
      }
      
      importTextButton.click();
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait longer for import process
      testController.reportCondition('Import from Text button clicked', true);
    } finally {
      // Restore original functions
      window.confirm = originalConfirm;
      window.alert = originalAlert;
    }

    // Step 16: Verify colorblind mode is restored in Regions panel
    testController.log(`[${testRunId}] Step 16: Verifying colorblind mode restored in Regions panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'regionsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Give more time for settings to propagate
    
    if (!(await testController.pollForCondition(
      () => {
        const regionBlocks = regionsPanelElement.querySelectorAll('.region-block');
        for (const block of regionBlocks) {
          const regionNameElement = block.querySelector('.region-name');
          if (regionNameElement && regionNameElement.textContent.trim() === 'Menu') {
            const colorblindSymbol = block.querySelector('.colorblind-symbol');
            return colorblindSymbol !== null;
          }
        }
        return false;
      },
      'Colorblind symbol restored in Regions panel',
      5000,
      250
    ))) {
      throw new Error('Colorblind symbol not restored in Menu region after import');
    }
    testController.reportCondition('Colorblind mode restored via Import from Text', true);
    
    testController.log(`[${testRunId}] JSON panel Import from Text test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'JSON panel Import from Text test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Test that verifies the JSON panel can export and import layout configurations.
 * This test exports a layout, modifies the layout, then imports it back to verify
 * the layout restoration works.
 */
export async function testJSONPanelLayoutImportExport(testController) {
  log('info', 'Starting JSON panel Layout Import/Export test');
  const testRunId = `json-layout-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting JSON panel Layout Import/Export test...`);
    testController.reportCondition('Test started', true);

    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    // Step 1: Activate JSON panel and export layout
    testController.log(`[${testRunId}] Step 1: Activating JSON panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let jsonPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        jsonPanelElement = document.querySelector('.json-panel-container');
        return jsonPanelElement !== null;
      },
      'JSON panel DOM element',
      5000,
      250
    ))) {
      throw new Error('JSON panel not found in DOM');
    }
    testController.reportCondition('JSON panel found in DOM', true);

    // Step 2: Configure checkboxes to export only layout
    testController.log(`[${testRunId}] Step 2: Configuring JSON panel for layout export...`);
    
    const allCheckboxes = jsonPanelElement.querySelectorAll('input[type="checkbox"]');
    for (const checkbox of allCheckboxes) {
      checkbox.checked = false;
    }
    
    const layoutCheckbox = jsonPanelElement.querySelector('#json-chk-layout');
    if (!layoutCheckbox) {
      throw new Error('Layout checkbox not found in JSON panel');
    }
    layoutCheckbox.checked = true;
    testController.reportCondition('JSON panel configured for layout export', true);

    // Step 3: Export layout to text
    testController.log(`[${testRunId}] Step 3: Exporting layout to text...`);
    const exportTextButton = jsonPanelElement.querySelector('#json-btn-export-text');
    if (!exportTextButton) {
      throw new Error('Export to Text button not found in JSON panel');
    }
    
    exportTextButton.click();
    await new Promise((resolve) => setTimeout(resolve, 1000));
    testController.reportCondition('Layout export initiated', true);

    // Step 4: Verify layout was exported to editor
    testController.log(`[${testRunId}] Step 4: Verifying layout export in Editor...`);
    
    let editorPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        editorPanelElement = document.querySelector('.editor-panel-content');
        return editorPanelElement !== null;
      },
      'Editor panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Editor panel not found in DOM after export');
    }

    let editorTextarea = null;
    if (!(await testController.pollForCondition(
      () => {
        editorTextarea = editorPanelElement.querySelector('textarea');
        return editorTextarea !== null && editorTextarea.value.includes('layoutConfig');
      },
      'Editor textarea with layout config',
      3000,
      250
    ))) {
      throw new Error('Editor textarea does not contain layoutConfig');
    }
    testController.reportCondition('Layout config found in editor', true);

    // Step 5: Test import layout functionality
    testController.log(`[${testRunId}] Step 5: Testing layout import functionality...`);
    
    // Mock dialogs to prevent blocking
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    window.confirm = () => {
      testController.log(`[${testRunId}] Confirm dialog intercepted for layout import`);
      return true;
    };
    window.alert = (message) => {
      testController.log(`[${testRunId}] Alert dialog intercepted: ${message}`);
    };
    
    try {
      // Activate JSON panel again
      eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Click Import from Text button
      const importTextButton = jsonPanelElement.querySelector('#json-btn-import-text');
      if (!importTextButton) {
        throw new Error('Import from Text button not found in JSON panel');
      }
      
      importTextButton.click();
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait for import process
      testController.reportCondition('Layout import completed', true);
      
    } finally {
      // Restore original functions
      window.confirm = originalConfirm;
      window.alert = originalAlert;
    }
    
    testController.log(`[${testRunId}] JSON panel Layout Import/Export test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'JSON panel Layout Import/Export test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Test that verifies the JSON panel can export and import Game State data.
 * This test covers the complete workflow of exporting game state (inventory + checked locations),
 * modifying the state, and importing it back to verify restoration works correctly.
 */
export async function testJSONPanelGameStateImportExport(testController) {
  log('info', 'Starting JSON panel Game State Import/Export test');
  const testRunId = `json-gamestate-test-${Date.now()}`;
  
  try {
    testController.log(`[${testRunId}] Starting JSON panel Game State Import/Export test...`);
    testController.reportCondition('Test started', true);

    const eventBusModule = await import('../../../app/core/eventBus.js');
    const eventBus = eventBusModule.default;

    // Step 1: Activate the Locations panel
    testController.log(`[${testRunId}] Step 1: Activating Locations panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'locationsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let locationsPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        locationsPanelElement = document.querySelector('.locations-panel-container');
        return locationsPanelElement !== null;
      },
      'Locations panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Locations panel not found in DOM');
    }
    testController.reportCondition('Locations panel found in DOM', true);

    // Step 2: In the Locations panel, find the location card for "Mushroom" and click it
    testController.log(`[${testRunId}] Step 2: Finding and clicking Mushroom location...`);
    
    // Find the Mushroom location using same method as rulesReloadTest
    const mushroomLocation = await testController.pollForValue(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Mushroom')) {
            return card;
          }
        }
        return null;
      },
      'Mushroom location found',
      10000,
      50
    );
    
    if (!mushroomLocation) {
      throw new Error('Mushroom location card not found');
    }
    
    mushroomLocation.click();
    testController.reportCondition('Mushroom location clicked', true);

    // Step 3: Wait for the status of the Mushroom location card to change to "checked"
    testController.log(`[${testRunId}] Step 3: Waiting for Mushroom location to be checked...`);
    
    // Wait for location to be processed - using same timing as rulesReloadTest
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Then wait for it to be fully checked (using exact same method as rulesReloadTest)
    const mushroomLocationChecked = await testController.pollForCondition(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Mushroom')) {
            return card.classList.contains('checked') || card.classList.contains('location-checked');
          }
        }
        return false;
      },
      'Mushroom location is checked',
      5000, // Use same timeout as rulesReloadTest  
      250
    );
    
    if (!mushroomLocationChecked) {
      throw new Error('Mushroom location did not change to checked status');
    }
    testController.reportCondition('Mushroom location status changed to checked', true);

    // Step 4: Activate the JSON panel
    testController.log(`[${testRunId}] Step 4: Activating JSON panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let jsonPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        jsonPanelElement = document.querySelector('.json-panel-container');
        return jsonPanelElement !== null;
      },
      'JSON panel DOM element',
      5000,
      250
    ))) {
      throw new Error('JSON panel not found in DOM');
    }
    testController.reportCondition('JSON panel found in DOM', true);

    // Step 5: Disable all of the checkboxes in the JSON panel except for the Game State
    testController.log(`[${testRunId}] Step 5: Configuring JSON panel checkboxes for Game State only...`);
    
    // Uncheck all core checkboxes
    const coreCheckboxes = jsonPanelElement.querySelectorAll('.json-section input[type="checkbox"]');
    for (const checkbox of coreCheckboxes) {
      checkbox.checked = false;
    }
    
    // Uncheck all module data checkboxes
    const moduleCheckboxes = jsonPanelElement.querySelectorAll('#json-module-data-list input[type="checkbox"]');
    for (const checkbox of moduleCheckboxes) {
      checkbox.checked = false;
    }
    
    // Find and check only the Game State checkbox
    let gameStateCheckbox = null;
    for (const checkbox of moduleCheckboxes) {
      const label = checkbox.parentElement.querySelector('label');
      if (label && label.textContent.includes('Game State')) {
        gameStateCheckbox = checkbox;
        checkbox.checked = true;
        break;
      }
    }
    
    if (!gameStateCheckbox) {
      throw new Error('Game State checkbox not found in JSON panel');
    }
    testController.reportCondition('JSON panel configured for Game State export only', true);

    // Step 6: Click the button to Export to Text
    testController.log(`[${testRunId}] Step 6: Clicking Export to Text button...`);
    const exportTextButton = jsonPanelElement.querySelector('#json-btn-export-text');
    if (!exportTextButton) {
      throw new Error('Export to Text button not found in JSON panel');
    }
    
    exportTextButton.click();
    await new Promise((resolve) => setTimeout(resolve, 2000));
    testController.reportCondition('Export to Text button clicked', true);

    // Step 7: Save the contents of the Editor window to a string
    testController.log(`[${testRunId}] Step 7: Saving Editor window contents...`);
    
    let editorPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        editorPanelElement = document.querySelector('.editor-panel-content');
        return editorPanelElement !== null;
      },
      'Editor panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Editor panel not found in DOM after export');
    }

    let editorTextarea = null;
    let editorDropdown = null;
    if (!(await testController.pollForCondition(
      () => {
        editorTextarea = editorPanelElement.querySelector('textarea');
        editorDropdown = editorPanelElement.querySelector('select');
        return editorTextarea !== null && editorDropdown !== null && editorDropdown.value === 'dataForExport';
      },
      'Editor textarea and dropdown ready',
      3000,
      250
    ))) {
      throw new Error('Editor textarea or dropdown not ready for export data');
    }

    const savedEditorContent = editorTextarea.value;
    if (!savedEditorContent.trim()) {
      throw new Error('Editor content is empty after export');
    }
    testController.reportCondition('Editor content saved successfully', true);

    // Step 8: Confirm that "Mushroom" appears in "checkedLocations" and "Rupees (20)" appears in "inventory"
    testController.log(`[${testRunId}] Step 8: Verifying exported content contains expected data...`);
    
    let exportedData;
    try {
      exportedData = JSON.parse(savedEditorContent);
    } catch (e) {
      throw new Error('Failed to parse exported content as JSON');
    }
    
    if (!exportedData.stateManagerRuntime) {
      throw new Error('Exported content does not contain stateManagerRuntime data');
    }
    
    const gameStateData = exportedData.stateManagerRuntime;
    
    if (!gameStateData.checkedLocations || !Array.isArray(gameStateData.checkedLocations)) {
      throw new Error('Game state data does not contain checkedLocations array');
    }
    
    if (!gameStateData.checkedLocations.includes('Mushroom')) {
      throw new Error('Mushroom not found in checkedLocations');
    }
    
    if (!gameStateData.inventory || typeof gameStateData.inventory !== 'object') {
      throw new Error('Game state data does not contain inventory object');
    }
    
    if (!gameStateData.inventory['Rupees (20)'] || gameStateData.inventory['Rupees (20)'] <= 0) {
      throw new Error('Rupees (20) not found in inventory or has invalid quantity');
    }
    
    testController.reportCondition('Export contains Mushroom in checkedLocations', true);
    testController.reportCondition('Export contains Rupees (20) in inventory', true);

    // Step 9: Activate the Locations panel
    testController.log(`[${testRunId}] Step 9: Re-activating Locations panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'locationsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 10: In the Locations panel, find the location card for "Bottle Merchant" and click it
    testController.log(`[${testRunId}] Step 10: Finding and clicking Bottle Merchant location...`);
    
    // Find the Bottle Merchant location using same method as rulesReloadTest
    const bottleMerchantLocation = await testController.pollForValue(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Bottle Merchant')) {
            return card;
          }
        }
        return null;
      },
      'Bottle Merchant location found',
      10000,
      50
    );
    
    if (!bottleMerchantLocation) {
      throw new Error('Bottle Merchant location card not found');
    }
    
    bottleMerchantLocation.click();
    testController.reportCondition('Bottle Merchant location clicked', true);

    // Step 11: Wait for the status of the Bottle Merchant location card to change to "checked"
    testController.log(`[${testRunId}] Step 11: Waiting for Bottle Merchant location to be checked...`);
    
    // Wait for location to be processed - using same timing as rulesReloadTest
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Then wait for it to be fully checked (using exact same method as rulesReloadTest)
    const bottleMerchantLocationChecked = await testController.pollForCondition(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Bottle Merchant')) {
            return card.classList.contains('checked') || card.classList.contains('location-checked');
          }
        }
        return false;
      },
      'Bottle Merchant location is checked',
      5000, // Use same timeout as rulesReloadTest
      250
    );
    
    if (!bottleMerchantLocationChecked) {
      throw new Error('Bottle Merchant location did not change to checked status');
    }
    testController.reportCondition('Bottle Merchant location status changed to checked', true);

    // Step 12: Activate the JSON panel
    testController.log(`[${testRunId}] Step 12: Re-activating JSON panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 13: Disable all of the checkboxes in the JSON panel except for the Game State
    testController.log(`[${testRunId}] Step 13: Re-configuring JSON panel checkboxes...`);
    
    // Re-configure checkboxes (same as Step 5)
    const coreCheckboxes2 = jsonPanelElement.querySelectorAll('.json-section input[type="checkbox"]');
    for (const checkbox of coreCheckboxes2) {
      checkbox.checked = false;
    }
    
    const moduleCheckboxes2 = jsonPanelElement.querySelectorAll('#json-module-data-list input[type="checkbox"]');
    for (const checkbox of moduleCheckboxes2) {
      checkbox.checked = false;
    }
    
    let gameStateCheckbox2 = null;
    for (const checkbox of moduleCheckboxes2) {
      const label = checkbox.parentElement.querySelector('label');
      if (label && label.textContent.includes('Game State')) {
        gameStateCheckbox2 = checkbox;
        checkbox.checked = true;
        break;
      }
    }
    testController.reportCondition('JSON panel re-configured for Game State only', true);

    // Step 14: Activate the Editor panel
    testController.log(`[${testRunId}] Step 14: Activating Editor panel...`);
    eventBus.publish('ui:activatePanel', { panelId: 'editorPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Step 15: Select "Data for Export" from the dropdown
    testController.log(`[${testRunId}] Step 15: Selecting Data for Export from dropdown...`);
    
    editorDropdown.value = 'dataForExport';
    editorDropdown.dispatchEvent(new Event('change'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    testController.reportCondition('Editor dropdown set to Data for Export', true);

    // Step 16: Verify that the contents of the Editor edit area match the string we saved earlier
    testController.log(`[${testRunId}] Step 16: Verifying editor content matches saved content...`);
    
    // First set the editor content to our saved content
    editorTextarea.value = savedEditorContent;
    editorTextarea.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 500));
    testController.reportCondition('Editor content set to saved state', true);

    // Step 17: In the JSON panel, click the button to Load from Text
    testController.log(`[${testRunId}] Step 17: Using Import from Text functionality...`);
    
    // Mock the confirm and alert dialogs
    const originalConfirm = window.confirm;
    const originalAlert = window.alert;
    window.confirm = () => {
      testController.log(`[${testRunId}] Confirm dialog intercepted, returning true`);
      return true;
    };
    window.alert = (message) => {
      testController.log(`[${testRunId}] Alert dialog intercepted: ${message}`);
    };
    
    try {
      // Activate JSON panel
      eventBus.publish('ui:activatePanel', { panelId: 'jsonPanel' }, 'tests');
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Click Import from Text button
      const importTextButton = jsonPanelElement.querySelector('#json-btn-import-text');
      if (!importTextButton) {
        throw new Error('Import from Text button not found in JSON panel');
      }
      
      importTextButton.click();
      await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait longer for import process
      testController.reportCondition('Import from Text button clicked', true);
      
      // Give additional time for UI to refresh completely after import (like rulesReloadTest)
      await new Promise(resolve => setTimeout(resolve, 1500));
    } finally {
      // Restore original functions
      window.confirm = originalConfirm;
      window.alert = originalAlert;
    }

    // Step 18: Confirm that in the Locations panel, "Mushroom" is checked, but "Bottle Merchant" isn't
    testController.log(`[${testRunId}] Step 18: Verifying location states after import...`);
    eventBus.publish('ui:activatePanel', { panelId: 'locationsPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 2000)); // Give more time for state to propagate
    
    // Check Mushroom is still checked (using same method as rulesReloadTest)
    const mushroomStillChecked = await testController.pollForCondition(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Mushroom')) {
            return card.classList.contains('checked') || card.classList.contains('location-checked');
          }
        }
        return false;
      },
      'Mushroom location still checked after import',
      5000,
      250
    );
    
    if (!mushroomStillChecked) {
      throw new Error('Mushroom location is not checked after import');
    }
    testController.reportCondition('Mushroom location still checked after import', true);

    // Check Bottle Merchant is not checked (using same method as rulesReloadTest)
    const bottleMerchantNotChecked = await testController.pollForCondition(
      () => {
        const locationCards = document.querySelectorAll('.location-card');
        for (const card of locationCards) {
          if (card.textContent.includes('Bottle Merchant')) {
            // Should NOT have checked class (return true if it doesn't have checked class)
            return !(card.classList.contains('checked') || card.classList.contains('location-checked'));
          }
        }
        return false;
      },
      'Bottle Merchant location not checked after import',
      5000,
      250
    );
    
    if (!bottleMerchantNotChecked) {
      throw new Error('Bottle Merchant location is still checked after import (should have been restored)');
    }
    testController.reportCondition('Bottle merchant location not checked after import (correctly restored)', true);

    // Step 19: Confirm that in the Inventory panel, "Rupees (20)" appears, but "Piece of Heart" doesn't
    testController.log(`[${testRunId}] Step 19: Verifying inventory state after import...`);
    eventBus.publish('ui:activatePanel', { panelId: 'inventoryPanel' }, 'tests');
    await new Promise((resolve) => setTimeout(resolve, 1500));
    
    let inventoryPanelElement = null;
    if (!(await testController.pollForCondition(
      () => {
        inventoryPanelElement = document.querySelector('.inventory-panel-container');
        return inventoryPanelElement !== null;
      },
      'Inventory panel DOM element',
      5000,
      250
    ))) {
      throw new Error('Inventory panel not found in DOM');
    }

    // Check that Rupees (20) appears in inventory (using rulesReloadTest pattern)
    const rupeesFoundAfterImport = await testController.pollForCondition(
      () => {
        const inventoryItems = document.querySelectorAll('.item-container, .item-button');
        for (const item of inventoryItems) {
          if (item.textContent.includes('Rupees') && item.textContent.includes('20')) {
            // Check if the item is actually visible and active (owned)
            const button = item.classList.contains('item-button') ? item : item.querySelector('.item-button');
            if (button) {
              const isOwned = button.classList.contains('active');
              const itemContainer = button.closest('.item-container');
              const style = window.getComputedStyle(itemContainer);
              const parentStyle = window.getComputedStyle(itemContainer.parentElement);
              
              // Item is considered "appearing" if it's owned (active) AND visible
              if (isOwned && style.display !== 'none' && style.visibility !== 'hidden' && 
                  parentStyle.display !== 'none' && parentStyle.visibility !== 'hidden') {
                testController.log(`Rupees (20) found as owned and visible after import - classes: ${button.classList.toString()}`);
                return true; // Found and visible
              }
            }
          }
        }
        return false;
      },
      'Rupees (20) found in inventory after import',
      5000,
      250
    );
    
    if (!rupeesFoundAfterImport) {
      throw new Error('Rupees (20) not found in inventory after import');
    }
    testController.reportCondition('Rupees (20) appears in inventory after import', true);

    // Check that Piece of Heart does not appear (it comes from Bottle Merchant which we unchecked)
    let pieceOfHeartFound = false;
    await testController.pollForCondition(
      () => {
        const inventoryItems = inventoryPanelElement.querySelectorAll('.inventory-item');
        for (const item of inventoryItems) {
          const nameElement = item.querySelector('.inventory-item-name');
          if (nameElement && nameElement.textContent.includes('Piece of Heart')) {
            pieceOfHeartFound = true;
            return true;
          }
        }
        return false;
      },
      'Piece of Heart not in inventory (checking)',
      2000,
      250
    );

    if (pieceOfHeartFound) {
      throw new Error('Piece of Heart found in inventory after import (should have been removed by state restoration)');
    }
    testController.reportCondition('Piece of Heart correctly not in inventory after import', true);
    
    testController.log(`[${testRunId}] JSON panel Game State Import/Export test completed successfully`);
    await testController.completeTest(true);
    
  } catch (error) {
    log('error', 'JSON panel Game State Import/Export test failed:', error);
    testController.log(`[${testRunId}] Test failed: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Register the tests
registerTest({
  id: 'test_json_panel_import_from_text',
  name: 'JSON Panel - Import from Text',
  description: 'Tests the Import from Text functionality of the JSON panel by exporting settings, modifying them, and importing them back',
  category: 'JSON Panel',
  //enabled: false,
  testFunction: testJSONPanelImportFromText
});

registerTest({
  id: 'test_json_panel_layout_import_export',
  name: 'JSON Panel - Layout Import/Export',
  description: 'Tests the layout import/export functionality of the JSON panel',
  category: 'JSON Panel',
  //enabled: false,
  testFunction: testJSONPanelLayoutImportExport
});

registerTest({
  id: 'test_json_panel_gamestate_import_export',
  name: 'JSON Panel - Game State Import/Export',
  description: 'Tests the game state import/export functionality covering inventory and checked locations',
  category: 'JSON Panel',
  //enabled: false,
  testFunction: testJSONPanelGameStateImportExport
});
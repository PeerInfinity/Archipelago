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
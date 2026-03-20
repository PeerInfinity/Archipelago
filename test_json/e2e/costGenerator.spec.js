/**
 * E2E tests for Cost Generator
 *
 * Tests the cost generation feature with file persistence.
 * Costs are saved to the preset directory alongside rules and sphere log files.
 */

import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';

// Helper to get the costs file path from rules path
function getCostsPath(rulesPath) {
  return rulesPath.replace('_rules.json', '_costs.json');
}

test.describe('Cost Generator', () => {
  test.setTimeout(120000); // 2 minute timeout for cost generation

  test('should load existing costs or generate and save new ones for Adventure seed 1', async ({ page }) => {
    const rulesPath = 'presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json';
    const costsPath = getCostsPath(rulesPath);
    const fullCostsPath = path.join(process.cwd(), 'frontend', costsPath);

    // Check if costs file already exists
    const costsFileExists = fs.existsSync(fullCostsPath);
    console.log(`Costs file exists: ${costsFileExists}`);
    console.log(`Costs file path: ${fullCostsPath}`);

    // Load the app with Adventure rules
    await page.goto(`http://localhost:8000/frontend/?rules=${rulesPath}`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for app to initialize
    await page.waitForFunction(
      () => window.centralRegistry && typeof window.centralRegistry.getPublicFunction === 'function',
      { timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    // Check that cost components are available
    const hasComponents = await page.evaluate(() => {
      return typeof window.costGenerator !== 'undefined' &&
             typeof window.costDataManager !== 'undefined' &&
             typeof window.generateCosts === 'function';
    });
    expect(hasComponents).toBe(true);
    console.log('Cost generation components available');

    // Wait for rules to be loaded
    await page.waitForFunction(
      () => {
        const proxy = window.stateManagerProxy;
        if (!proxy || typeof proxy.getStaticData !== 'function') return false;
        const staticData = proxy.getStaticData();
        return staticData && staticData.regions && staticData.regions.size > 0;
      },
      { timeout: 30000 }
    );
    console.log('Rules loaded');

    // Load sphere log
    const sphereLogPath = `presets/adventure/AP_14089154938208861744/AP_14089154938208861744_sphere_log.jsonl`;
    const loadResult = await page.evaluate(async (logPath) => {
      const loadSphereLog = window.centralRegistry?.getPublicFunction('sphereState', 'loadSphereLog');
      if (!loadSphereLog) return { success: false, error: 'loadSphereLog not found' };
      try {
        const result = await loadSphereLog(logPath);
        return { success: result };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }, sphereLogPath);
    expect(loadResult.success).toBe(true);
    console.log('Sphere log loaded');

    // Wait for sphere log to be available
    await page.waitForTimeout(1000);

    // Run cost generation (will load existing or generate new)
    console.log('Running generateCosts...');
    const result = await page.evaluate(async (rulesPath) => {
      try {
        const costs = await window.generateCosts({ rulesPath });
        if (!costs) return { error: 'generateCosts returned null' };

        // Get the save info for external saving
        const saveInfo = window.__generatedCostData__;

        return {
          success: true,
          regionCount: Object.keys(costs.regions || {}).length,
          locationCount: Object.keys(costs.locations || {}).length,
          loadedFromExisting: window.costDataManager.loadedFrom?.includes('_costs.json'),
          saveInfo: saveInfo ? {
            path: saveInfo.path,
            content: saveInfo.content,
          } : null,
        };
      } catch (error) {
        return { error: error.message, stack: error.stack };
      }
    }, rulesPath);

    console.log('Result:', JSON.stringify({
      success: result.success,
      regionCount: result.regionCount,
      locationCount: result.locationCount,
      loadedFromExisting: result.loadedFromExisting,
      hasSaveInfo: !!result.saveInfo,
    }, null, 2));

    expect(result.success).toBe(true);
    expect(result.regionCount).toBeGreaterThan(0);
    expect(result.locationCount).toBeGreaterThan(0);

    // If we generated new costs (not loaded from existing), save them
    if (!result.loadedFromExisting && result.saveInfo) {
      console.log(`Saving generated costs to: ${fullCostsPath}`);

      // Ensure directory exists
      const dir = path.dirname(fullCostsPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Write the costs file
      fs.writeFileSync(fullCostsPath, result.saveInfo.content, 'utf-8');
      console.log('Costs file saved successfully');

      // Verify the file was written
      expect(fs.existsSync(fullCostsPath)).toBe(true);

      // Verify the content is valid JSON
      const savedContent = JSON.parse(fs.readFileSync(fullCostsPath, 'utf-8'));
      expect(savedContent.regions).toBeDefined();
      expect(savedContent.locations).toBeDefined();
      console.log(`Verified saved costs: ${Object.keys(savedContent.regions).length} regions, ${Object.keys(savedContent.locations).length} locations`);
    } else if (result.loadedFromExisting) {
      console.log('Used existing costs file, no save needed');
    }

    // Verify cost data manager has the data
    const managerStatus = await page.evaluate(() => {
      return window.costDataManager.getStatus();
    });
    expect(managerStatus.isLoaded).toBe(true);
    console.log('Cost data manager status:', managerStatus);
  });

  test('should regenerate costs when forceRegenerate is true', async ({ page }) => {
    const rulesPath = 'presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json';

    // Load the app
    await page.goto(`http://localhost:8000/frontend/?rules=${rulesPath}`, {
      waitUntil: 'networkidle',
      timeout: 60000
    });

    // Wait for app to initialize
    await page.waitForFunction(
      () => window.centralRegistry && typeof window.centralRegistry.getPublicFunction === 'function',
      { timeout: 30000 }
    );
    await page.waitForTimeout(3000);

    // Wait for rules to be loaded
    await page.waitForFunction(
      () => {
        const proxy = window.stateManagerProxy;
        if (!proxy || typeof proxy.getStaticData !== 'function') return false;
        const staticData = proxy.getStaticData();
        return staticData && staticData.regions && staticData.regions.size > 0;
      },
      { timeout: 30000 }
    );

    // Load sphere log
    const sphereLogPath = `presets/adventure/AP_14089154938208861744/AP_14089154938208861744_sphere_log.jsonl`;
    await page.evaluate(async (logPath) => {
      const loadSphereLog = window.centralRegistry?.getPublicFunction('sphereState', 'loadSphereLog');
      if (loadSphereLog) await loadSphereLog(logPath);
    }, sphereLogPath);
    await page.waitForTimeout(1000);

    // Force regenerate even if file exists
    console.log('Force regenerating costs...');
    const result = await page.evaluate(async (rulesPath) => {
      try {
        const costs = await window.generateCosts({ rulesPath, forceRegenerate: true });
        if (!costs) return { error: 'generateCosts returned null' };

        return {
          success: true,
          regionCount: Object.keys(costs.regions || {}).length,
          locationCount: Object.keys(costs.locations || {}).length,
          loadedFromExisting: window.costDataManager.loadedFrom?.includes('_costs.json'),
        };
      } catch (error) {
        return { error: error.message };
      }
    }, rulesPath);

    console.log('Force regenerate result:', JSON.stringify(result, null, 2));

    expect(result.success).toBe(true);
    expect(result.loadedFromExisting).toBe(false); // Should NOT have loaded from existing
    expect(result.regionCount).toBeGreaterThan(0);
    expect(result.locationCount).toBeGreaterThan(0);
  });
});

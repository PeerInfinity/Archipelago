// frontend/modules/tests/testCases/manualTests.js

import { registerTest } from '../testRegistry.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('manualTests', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[manualTests] ${message}`, ...data);
  }
}

/**
 * Manual test to debug GanonDefeatRule
 * Run this after checking all locations in your game (online or offline)
 */
export async function debugGanonDefeatRuleTest(testController) {
  try {
    testController.log('Starting GanonDefeatRule debug test...');
    testController.reportCondition('Test started', true);

    // Get current snapshot and static data
    const snapshot = await testController.stateManager.getSnapshot();
    const staticData = await testController.stateManager.getStaticData();

    testController.log('=== 1. BOW INVENTORY CHECK ===');
    testController.log(`Progressive Bow: ${snapshot.inventory['Progressive Bow'] || 0}`);
    testController.log(`Progressive Bow (Alt): ${snapshot.inventory['Progressive Bow (Alt)'] || 0}`);
    testController.log(`Bow: ${snapshot.inventory['Bow'] || 0}`);
    testController.log(`Silver Bow: ${snapshot.inventory['Silver Bow'] || 0}`);
    testController.log(`Silver Arrows: ${snapshot.inventory['Silver Arrows'] || 0}`);

    testController.reportCondition('Inventory retrieved', true);

    // Check progression mapping
    testController.log('=== 2. PROGRESSION MAPPING CHECK ===');
    const progressionMapping = staticData?.progressionMapping?.['1'] || staticData?.progressionMapping;

    if (progressionMapping) {
      if (progressionMapping['Progressive Bow']) {
        testController.log('Progressive Bow mapping:', JSON.stringify(progressionMapping['Progressive Bow'], null, 2));
        testController.reportCondition('Progressive Bow mapping exists', true);
      } else {
        testController.log('Progressive Bow mapping: NOT FOUND');
        testController.reportCondition('Progressive Bow mapping exists', false);
      }

      if (progressionMapping['Progressive Bow (Alt)']) {
        testController.log('Progressive Bow (Alt) mapping:', JSON.stringify(progressionMapping['Progressive Bow (Alt)'], null, 2));
        testController.reportCondition('Progressive Bow (Alt) mapping exists', true);
      } else {
        testController.log('Progressive Bow (Alt) mapping: NOT FOUND');
        testController.reportCondition('Progressive Bow (Alt) mapping exists', false);
      }
    } else {
      testController.log('ERROR: No progression mapping found!');
      testController.reportCondition('Progression mapping exists', false);
    }

    // Import helper functions
    testController.log('=== 3. HELPER FUNCTION CHECKS ===');
    const { has, count, has_beam_sword, has_fire_source, can_shoot_arrows, GanonDefeatRule } =
      await import('../../shared/gameLogic/alttp/alttpLogic.js');

    testController.log(`has(Silver Bow): ${has(snapshot, staticData, 'Silver Bow')}`);
    testController.log(`count(Progressive Bow): ${count(snapshot, staticData, 'Progressive Bow')}`);
    testController.log(`count(Progressive Bow (Alt)): ${count(snapshot, staticData, 'Progressive Bow (Alt)')}`);
    testController.log(`count(Silver Bow): ${count(snapshot, staticData, 'Silver Bow')}`);
    testController.log(`has_beam_sword: ${has_beam_sword(snapshot, staticData)}`);
    testController.log(`has_fire_source: ${has_fire_source(snapshot, staticData)}`);
    testController.log(`can_shoot_arrows(0): ${can_shoot_arrows(snapshot, staticData, '0')}`);

    testController.reportCondition('Helper functions loaded', true);

    // Check settings
    testController.log('=== 4. SETTINGS CHECK ===');
    const settings = staticData?.settings?.['1'] || {};
    testController.log(`swordless: ${settings.swordless || false}`);
    testController.log(`glitches_required: ${settings.glitches_required || 'none'}`);
    testController.log(`flags: ${JSON.stringify(snapshot.flags)}`);

    // Test GanonDefeatRule
    testController.log('=== 5. GANON DEFEAT RULE RESULT ===');
    const result = GanonDefeatRule(snapshot, staticData);
    testController.log(`GanonDefeatRule(): ${result}`);
    testController.reportCondition('GanonDefeatRule executed', true);
    testController.reportCondition(`GanonDefeatRule returns: ${result}`, result);

    // Detailed bow progression check
    testController.log('=== 6. DETAILED BOW PROGRESSION CHECK ===');
    const progBowCount = snapshot.inventory['Progressive Bow'] || 0;
    const progBowAltCount = snapshot.inventory['Progressive Bow (Alt)'] || 0;
    testController.log(`Base Progressive Bow count: ${progBowCount}`);
    testController.log(`Progressive Bow (Alt) count: ${progBowAltCount}`);

    if (progressionMapping?.['Progressive Bow']) {
      const items = progressionMapping['Progressive Bow'].items;
      testController.log('Progressive Bow progression items:', JSON.stringify(items, null, 2));
      for (const item of items) {
        const hasThisLevel = progBowCount >= item.level;
        testController.log(`  - Level ${item.level} (${item.name}): ${hasThisLevel ? 'YES' : 'NO'} (need ${item.level}, have ${progBowCount})`);
      }
    }

    if (progressionMapping?.['Progressive Bow (Alt)']) {
      const items = progressionMapping['Progressive Bow (Alt)'].items;
      testController.log('Progressive Bow (Alt) progression items:', JSON.stringify(items, null, 2));
      for (const item of items) {
        const hasThisLevel = progBowAltCount >= item.level;
        testController.log(`  - Level ${item.level} (${item.name}): ${hasThisLevel ? 'YES' : 'NO'} (need ${item.level}, have ${progBowAltCount})`);
      }
    }

    // Logic breakdown
    testController.log('=== 7. GANON DEFEAT RULE LOGIC BREAKDOWN ===');
    const isSwordless = settings.swordless || (snapshot.flags && snapshot.flags.includes('swordless'));
    testController.log(`Is Swordless Mode: ${isSwordless}`);

    if (isSwordless) {
      testController.log('[Swordless] Needs: Hammer + Fire Source + Silver Bow + can_shoot_arrows');
      testController.log(`  - Has Hammer: ${has(snapshot, staticData, 'Hammer')}`);
      testController.log(`  - Has Fire Source: ${has_fire_source(snapshot, staticData)}`);
      testController.log(`  - Has Silver Bow: ${has(snapshot, staticData, 'Silver Bow')}`);
      testController.log(`  - Can Shoot Arrows: ${can_shoot_arrows(snapshot, staticData, '0')}`);
    } else {
      const hasBeamSword = has_beam_sword(snapshot, staticData);
      const hasFireSource = has_fire_source(snapshot, staticData);
      testController.log(`[Normal] Has Beam Sword: ${hasBeamSword}`);
      testController.log(`[Normal] Has Fire Source: ${hasFireSource}`);

      if (!hasBeamSword || !hasFireSource) {
        testController.log('❌ Missing beam sword or fire source - FAIL');
        testController.reportCondition('Has beam sword AND fire source', false);
      } else {
        testController.reportCondition('Has beam sword AND fire source', true);

        const glitchesRequired = settings.glitches_required;
        const isGlitchesAllowed = glitchesRequired && glitchesRequired !== 'none' && glitchesRequired !== 'no_glitches';
        testController.log(`Glitches Allowed: ${isGlitchesAllowed}`);

        if (isGlitchesAllowed) {
          testController.log('[With Glitches] Needs ONE of: Tempered Sword, Golden Sword, Silver Bow+Arrows, Lamp, or 12+ magic');
        } else {
          testController.log('[No Glitches] Needs: Silver Bow + can_shoot_arrows');
          const hasSilverBow = has(snapshot, staticData, 'Silver Bow');
          const canShoot = can_shoot_arrows(snapshot, staticData, '0');
          testController.log(`  - Has Silver Bow: ${hasSilverBow}`);
          testController.log(`  - Can Shoot Arrows: ${canShoot}`);
          testController.reportCondition('Has Silver Bow', hasSilverBow);
          testController.reportCondition('Can shoot arrows', canShoot);
        }
      }
    }

    // Final result
    testController.log('=== END DEBUG ===');

    // Mark test as successful if it ran without errors
    testController.reportCondition('Debug test completed without errors', true);
    await testController.completeTest(true);

  } catch (error) {
    testController.log(`Error in debugGanonDefeatRuleTest: ${error.message}`, 'error');
    testController.log(`Stack trace: ${error.stack}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

/**
 * Simple snapshot test - just shows current inventory state
 */
export async function showInventorySnapshotTest(testController) {
  try {
    testController.log('Starting inventory snapshot test...');
    testController.reportCondition('Test started', true);

    const snapshot = await testController.stateManager.getSnapshot();

    testController.log('=== CURRENT INVENTORY ===');
    const inventoryEntries = Object.entries(snapshot.inventory || {})
      .filter(([_, count]) => count > 0)
      .sort((a, b) => a[0].localeCompare(b[0]));

    for (const [itemName, count] of inventoryEntries) {
      testController.log(`  ${itemName}: ${count}`);
    }

    testController.log(`Total items with count > 0: ${inventoryEntries.length}`);
    testController.reportCondition('Inventory displayed', true);

    await testController.completeTest(true);
  } catch (error) {
    testController.log(`Error in showInventorySnapshotTest: ${error.message}`, 'error');
    testController.reportCondition(`Test errored: ${error.message}`, false);
    await testController.completeTest(false);
  }
}

// Self-register tests
registerTest({
  id: 'test_manual_ganon_defeat_debug',
  name: 'Debug GanonDefeatRule',
  description: 'Manual test to debug why GanonDefeatRule is failing. Run after checking all locations.',
  testFunction: debugGanonDefeatRuleTest,
  category: 'Manual',
  enabled: true,
  order: 0,
});

registerTest({
  id: 'test_manual_inventory_snapshot',
  name: 'Show Inventory Snapshot',
  description: 'Display current inventory state in the test log.',
  testFunction: showInventorySnapshotTest,
  category: 'Manual',
  enabled: true,
  order: 1,
});

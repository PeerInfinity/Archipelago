// frontend/modules/tests/testCases/stateManagementTests.js

import { registerTest } from '../testRegistry.js';

export async function configLoadAndItemCheckTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting configLoadAndItemCheckTest...');
    testController.reportCondition('Test started', true);

    const mockRulesContent = {
      /* ... (same as original, ensure it's valid JSON) ... */
      schema_version: 3,
      game_name: 'A Link to the Past',
      archipelago_version: '0.6.1',
      generation_seed: 12345,
      player_names: { 1: 'TestPlayer1' },
      world_classes: { 1: 'ALTTPWorld' },
      plando_options: [],
      start_regions: {
        1: { default: ['Menu'], available: [{ name: 'Menu', type: 1 }] },
      },
      items: {
        1: {
          'Moon Pearl': {
            name: 'Moon Pearl',
            id: 100,
            groups: ['Progression'],
            advancement: true,
            priority: false,
            useful: true,
            trap: false,
            event: false,
            type: 'Item',
            max_count: 1,
          },
          'Progressive Sword': {
            name: 'Progressive Sword',
            id: 94,
            groups: ['Everything', 'Progression Items', 'Swords'],
            advancement: true,
            priority: false,
            useful: false,
            trap: false,
            event: false,
            type: 'Sword',
            max_count: 4,
          },
          'Fighter Sword': {
            name: 'Fighter Sword',
            id: 73,
            groups: ['Everything', 'Progression Items', 'Swords'],
            advancement: true,
            priority: false,
            useful: false,
            trap: false,
            event: false,
            type: 'Sword',
            max_count: 1,
          },
          'Master Sword': {
            name: 'Master Sword',
            id: 80,
            groups: ['Everything', 'Progression Items', 'Swords'],
            advancement: true,
            priority: false,
            useful: false,
            trap: false,
            event: false,
            type: 'Sword',
            max_count: 1,
          },
          'Lifting Glove': {
            name: 'Lifting Glove',
            id: 102,
            groups: ['Progression'],
            advancement: true,
            priority: false,
            useful: true,
            trap: false,
            event: false,
            type: 'Item',
            max_count: 1,
          },
          'Victory': {
            name: 'Victory',
            id: 999,
            groups: ['Event'],
            advancement: false,
            priority: false,
            useful: false,
            trap: false,
            event: true,
            type: 'Event',
            max_count: 1,
          },
        },
      },
      item_groups: { 1: ['Progression', 'Swords', 'Event'] },
      itempool_counts: {
        1: {
          'Moon Pearl': 1,
          'Progressive Sword': 1,
          'Lifting Glove': 1,
          'Victory': 1,
        },
      },
      progression_mapping: {
        1: {
          'Progressive Sword': {
            items: [
              { name: 'Fighter Sword', level: 1 },
              { name: 'Master Sword', level: 2 },
              { name: 'Tempered Sword', level: 3 },
              { name: 'Golden Sword', level: 4 },
            ],
            base_item: 'Progressive Sword',
          },
        },
      },
      starting_items: { 1: [] },
      regions: {
        1: {
          'Menu': {
            name: 'Menu',
            type: 1,
            player: 1,
            entrances: [],
            exits: [
              {
                name: 'Links House S&Q',
                connected_region: 'Links House',
                access_rule: { type: 'constant', value: true },
                type: 'Exit',
              },
            ],
            locations: [],
            time_passes: true,
            provides_chest_count: false,
          },
          'Links House': {
            name: 'Links House',
            type: 1,
            player: 1,
            entrances: [
              {
                name: 'From Menu S&Q',
                parent_region: 'Menu',
                connected_region: 'Links House',
                access_rule: { type: 'constant', value: true },
                assumed: false,
                type: 'Entrance',
              },
            ],
            exits: [
              {
                name: 'To Hyrule Castle Courtyard',
                connected_region: 'Hyrule Castle Courtyard',
                access_rule: { type: 'constant', value: true },
                type: 'Exit',
              },
            ],
            locations: [],
            time_passes: true,
            provides_chest_count: false,
          },
          'Hyrule Castle Courtyard': {
            name: 'Hyrule Castle Courtyard',
            type: 1,
            player: 1,
            entrances: [
              {
                name: 'From Links House',
                parent_region: 'Links House',
                connected_region: 'Hyrule Castle Courtyard',
                access_rule: { type: 'constant', value: true },
                assumed: false,
                type: 'Entrance',
              },
            ],
            locations: [],
            exits: [
              {
                name: 'To Dark World Portal',
                connected_region: 'Dark World Forest',
                access_rule: { type: 'item_check', item: 'Moon Pearl' },
                type: 'Exit',
              },
            ],
            time_passes: true,
            provides_chest_count: false,
          },
          'Dark World Forest': {
            name: 'Dark World Forest',
            type: 1,
            player: 1,
            entrances: [
              {
                name: 'From Hyrule Castle Courtyard Portal',
                parent_region: 'Hyrule Castle Courtyard',
                connected_region: 'Dark World Forest',
                access_rule: { type: 'item_check', item: 'Moon Pearl' },
                assumed: false,
                type: 'Entrance',
              },
            ],
            locations: [
              {
                name: 'LocationUnlockedByMoonPearl',
                id: 10001,
                access_rule: { type: 'constant', value: true },
                item: {
                  name: 'Victory',
                  player: 1,
                  advancement: false,
                  type: 'Event',
                },
                progress_type: 0,
                locked: false,
              },
            ],
            exits: [],
            time_passes: true,
            provides_chest_count: false,
          },
        },
      },
      settings: {
        1: {
          game: 'A Link to the Past',
          player_name: 'TestPlayer1',
          world_state: 'open',
          shuffle_ganon: true,
        },
      },
      game_info: {
        1: { name: 'A Link to the Past', rule_format: { version: '1' } },
      },
    };

    await testController.performAction({
      type: 'LOAD_RULES_DATA',
      payload: mockRulesContent,
      playerId: '1',
      playerName: 'TestPlayer1',
    });
    testController.reportCondition('Initial data loaded', true);
    // Note: LOAD_RULES_DATA action now waits for stateManager:rulesLoaded internally

    await testController.performAction({
      type: 'ADD_ITEM_TO_INVENTORY',
      itemName: 'Progressive Sword',
    });
    testController.reportCondition('Added Progressive Sword', true);
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterAddSword1',
    });
    // await testController.waitForEvent('stateManager:snapshotUpdated', 1000);

    await testController.performAction({
      type: 'ADD_ITEM_TO_INVENTORY',
      itemName: 'Moon Pearl',
    });
    testController.reportCondition('Added Moon Pearl', true);
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterAddMoonPearl',
    });
    // await testController.waitForEvent('stateManager:snapshotUpdated', 1000);

    const fighterSwordCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Fighter Sword',
    });
    const hasFighterSword = fighterSwordCount > 0;
    testController.reportCondition(
      "hasItem('Fighter Sword') check",
      hasFighterSword
    );
    if (!hasFighterSword) overallResult = false;

    const moonPearlCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Moon Pearl',
    });
    const hasMoonPearl = moonPearlCount > 0;
    testController.reportCondition("hasItem('Moon Pearl') check", hasMoonPearl);
    if (!hasMoonPearl) overallResult = false;

    const locationToCheck = 'LocationUnlockedByMoonPearl';
    const canAccessLocation = await testController.performAction({
      type: 'IS_LOCATION_ACCESSIBLE',
      locationName: locationToCheck,
    });
    testController.reportCondition(
      `canAccessLocation('${locationToCheck}') check`,
      canAccessLocation
    );
    if (!canAccessLocation) overallResult = false;

    await testController.performAction({
      type: 'ADD_ITEM_TO_INVENTORY',
      itemName: 'Victory',
    });
    testController.reportCondition('Added Victory Event Item', true);
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterAddVictory',
    });
    // await testController.waitForEvent('stateManager:snapshotUpdated', 1000);

    testController.log(
      `configLoadAndItemCheckTest finished. Overall Result: ${overallResult}`
    );
  } catch (error) {
    testController.log(
      `Error in configLoadAndItemCheckTest: ${error.message}`,
      'error'
    );
    testController.reportCondition(`Test errored: ${error.message}`, false);
    overallResult = false;
  } finally {
    await testController.completeTest(overallResult);
  }
}

// Self-register tests
registerTest({
  id: 'test_config_load_and_item_check',
  name: 'Config Load and Item Check Test',
  description:
    'Tests loading rules configuration, adding items to inventory, and checking location accessibility based on item requirements.',
  testFunction: configLoadAndItemCheckTest,
  category: 'State Management',
  //enabled: false,
  //order: 0,
});

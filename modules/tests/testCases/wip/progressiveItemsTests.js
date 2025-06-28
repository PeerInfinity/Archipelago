// frontend/modules/tests/testCases/progressiveItemsTests.js

import { registerTest } from '../testRegistry.js';

export async function progressiveSwordTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting progressiveSwordTest...');
    testController.reportCondition('Test started', true);

    // Define a minimal rules set with Progressive Sword
    const mockRulesContent = {
      schema_version: 3,
      game_name: 'A Link to the Past',
      archipelago_version: '0.6.1',
      generation_seed: 123,
      player_names: { 1: 'ProgTestPlayer' },
      world_classes: { 1: 'ALTTPWorld' },
      plando_options: [],
      start_regions: {
        1: { default: ['Menu'], available: [{ name: 'Menu', type: 1 }] },
      },
      items: {
        1: {
          'Progressive Sword': {
            name: 'Progressive Sword',
            id: 94,
            type: 'Sword',
            max_count: 4,
            advancement: true,
            groups: ['Swords'],
          },
          'Fighter Sword': {
            name: 'Fighter Sword',
            id: 73,
            type: 'Sword',
            max_count: 1,
            advancement: true,
            groups: ['Swords'],
          },
          'Master Sword': {
            name: 'Master Sword',
            id: 80,
            type: 'Sword',
            max_count: 1,
            advancement: true,
            groups: ['Swords'],
          },
          'Tempered Sword': {
            name: 'Tempered Sword',
            id: 74,
            type: 'Sword',
            max_count: 1,
            advancement: true,
            groups: ['Swords'],
          },
          'Golden Sword': {
            name: 'Golden Sword',
            id: 75,
            type: 'Sword',
            max_count: 1,
            advancement: true,
            groups: ['Swords'],
          },
        },
      },
      item_groups: { 1: ['Swords'] },
      itempool_counts: { 1: { 'Progressive Sword': 4 } },
      starting_items: { 1: [] },
      progression_mapping: {
        1: {
          'Progressive Sword': {
            base_item: 'Progressive Sword',
            items: [
              { name: 'Fighter Sword', level: 1, provides: [] },
              { name: 'Master Sword', level: 2, provides: [] },
              { name: 'Tempered Sword', level: 3, provides: [] },
              { name: 'Golden Sword', level: 4, provides: [] },
            ],
          },
        },
      },
      regions: {
        1: {
          Menu: {
            name: 'Menu',
            type: 1,
            player: 1,
            entrances: [],
            exits: [],
            locations: [],
            time_passes: true,
            provides_chest_count: false,
          },
        },
      },
      settings: { 1: { game: 'A Link to the Past' } },
      game_info: {
        1: { name: 'A Link to the Past', rule_format: { version: '1' } },
      },
    };

    await testController.performAction({
      type: 'LOAD_RULES_DATA',
      payload: mockRulesContent,
      playerId: '1',
    });
    testController.reportCondition('Progressive Sword rules loaded', true);
    // Note: LOAD_RULES_DATA action now waits for stateManager:rulesLoaded internally

    // Add 1st Progressive Sword
    await testController.performAction({
      type: 'ADD_ITEM_TO_INVENTORY',
      itemName: 'Progressive Sword',
    });
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterAddSword1Prog',
    });

    let fighterCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Fighter Sword',
    });
    let masterCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Master Sword',
    });
    testController.reportCondition(
      'Has Fighter Sword after 1st P.Sword',
      fighterCount > 0
    );
    if (!(fighterCount > 0)) overallResult = false;
    testController.reportCondition(
      'Does NOT have Master Sword after 1st P.Sword',
      masterCount === 0
    );
    if (!(masterCount === 0)) overallResult = false;

    // Add 2nd Progressive Sword
    await testController.performAction({
      type: 'ADD_ITEM_TO_INVENTORY',
      itemName: 'Progressive Sword',
    });
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterAddSword2Prog',
    });

    fighterCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Fighter Sword',
    });
    masterCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Master Sword',
    });
    testController.reportCondition(
      'Still has Fighter Sword after 2nd P.Sword',
      fighterCount > 0
    ); // Should still be 1 (or implies it via base)
    if (!(fighterCount > 0)) overallResult = false;
    testController.reportCondition(
      'Has Master Sword after 2nd P.Sword',
      masterCount > 0
    );
    if (!(masterCount > 0)) overallResult = false;
  } catch (error) {
    testController.log(
      `Error in progressiveSwordTest: ${error.message}`,
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
  id: 'test_progressive_sword',
  name: 'Progressive Sword Test',
  description:
    'Tests progressive item mechanics by adding Progressive Sword items and verifying that the correct sword levels are granted (Fighter Sword → Master Sword → etc.).',
  testFunction: progressiveSwordTest,
  category: 'Progressive Items',
  enabled: false,
  order: 0,
});

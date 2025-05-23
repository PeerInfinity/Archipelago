// frontend/modules/tests/testCases/clientMessageTests.js

import { registerTest } from '../testRegistry.js';

export async function simulateReceivedItemsTest(testController) {
  let overallResult = true;
  try {
    testController.log('Starting simulateReceivedItemsTest...');
    testController.reportCondition('Test started', true);

    // Minimal rules for this test
    const mockRulesContent = {
      schema_version: 3,
      game_name: 'A Link to the Past',
      archipelago_version: '0.6.1',
      generation_seed: 456,
      player_names: { 1: 'ClientSimPlayer' },
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
            type: 'Item',
            max_count: 1,
            advancement: true,
          },
          'Magic Mirror': {
            name: 'Magic Mirror',
            id: 101,
            type: 'Item',
            max_count: 1,
            advancement: true,
          },
        },
      },
      item_groups: { 1: [] },
      itempool_counts: { 1: { 'Moon Pearl': 1, 'Magic Mirror': 1 } },
      starting_items: { 1: [] },
      progression_mapping: { 1: {} },
      regions: {
        1: {
          Menu: {
            name: 'Menu',
            type: 1,
            player: 1,
            entrances: [],
            exits: [
              {
                name: 'ExitMenu',
                connected_region: 'SomePlace',
                access_rule: { type: 'constant', value: true },
                type: 'Exit',
              },
            ],
            locations: [],
            time_passes: true,
            provides_chest_count: false,
          },
          SomePlace: {
            name: 'SomePlace',
            type: 1,
            player: 1,
            entrances: [],
            exits: [],
            locations: [
              {
                name: 'LocationForMoonPearl',
                id: 50001,
                access_rule: { type: 'constant', value: true },
                item: {
                  name: 'Moon Pearl',
                  player: 1,
                  advancement: true,
                  type: 'Item',
                },
                progress_type: 0,
                locked: false,
              },
              {
                name: 'LocationForMagicMirror',
                id: 50002,
                access_rule: { type: 'constant', value: true },
                item: {
                  name: 'Magic Mirror',
                  player: 1,
                  advancement: true,
                  type: 'Item',
                },
                progress_type: 0,
                locked: false,
              },
            ],
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
    testController.reportCondition('Client test rules loaded', true);
    await testController.waitForEvent('stateManager:rulesLoaded', 3000);

    // Simulate ReceivedItems message
    const receivedItemsCommand = {
      cmd: 'ReceivedItems',
      index: 0, // Archipelago packet index
      items: [
        { item: 100, location: 50001, player: 1 }, // Moon Pearl from LocationForMoonPearl
      ],
    };
    await testController.performAction({
      type: 'SIMULATE_SERVER_MESSAGE',
      commandObject: receivedItemsCommand,
    });
    testController.reportCondition(
      'Simulated ReceivedItems message for Moon Pearl',
      true
    );

    // Wait for state to update (e.g., snapshot or a specific item received event if we had one)
    await testController.performAction({
      type: 'AWAIT_WORKER_PING',
      payload: 'syncAfterReceiveMoonPearl',
    });

    let moonPearlCount = await testController.performAction({
      type: 'GET_INVENTORY_ITEM_COUNT',
      itemName: 'Moon Pearl',
    });
    testController.reportCondition(
      'Moon Pearl in inventory after ReceivedItems',
      moonPearlCount > 0
    );
    if (!(moonPearlCount > 0)) overallResult = false;

    let locChecked = await testController.performAction({
      type: 'IS_LOCATION_CHECKED',
      locationName: 'LocationForMoonPearl',
    });
    testController.reportCondition(
      'LocationForMoonPearl marked as checked after ReceivedItems',
      locChecked
    );
    if (!locChecked) overallResult = false;
  } catch (error) {
    testController.log(
      `Error in simulateReceivedItemsTest: ${error.message}`,
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
  id: 'test_simulate_received_items',
  name: 'Simulate Received Items Test',
  description:
    'Tests simulating ReceivedItems messages from the Archipelago server and verifying that items are added to inventory and locations are marked as checked.',
  testFunction: simulateReceivedItemsTest,
  category: 'Client Messages',
  enabled: false,
  order: 0,
});

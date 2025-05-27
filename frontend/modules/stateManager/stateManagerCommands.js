/**
 * StateManager Commands - Shared constants for communication between
 * StateManagerProxy and StateManagerWorker
 *
 * This file can be safely imported in both main thread and worker contexts.
 */
export const STATE_MANAGER_COMMANDS = {
  INITIALIZE: 'initialize',
  LOAD_RULES: 'loadRules',
  ADD_ITEM: 'addItemToInventory',
  REMOVE_ITEM: 'removeItemFromInventory',
  CHECK_LOCATION: 'checkLocation',
  UNCHECK_LOCATION: 'uncheckLocation',
  GET_SNAPSHOT: 'getSnapshot',
  CLEAR_CHECKED_LOCATIONS: 'clearCheckedLocations',
  UPDATE_SETTING: 'updateSetting',
  APPLY_RUNTIME_STATE: 'applyRuntimeState',
  BEGIN_BATCH_UPDATE: 'beginBatchUpdate',
  COMMIT_BATCH_UPDATE: 'commitBatchUpdate',
  PING_WORKER: 'ping',
  SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT:
    'SETUP_TEST_INVENTORY_AND_GET_SNAPSHOT',
  EVALUATE_ACCESSIBILITY_FOR_TEST: 'EVALUATE_ACCESSIBILITY_FOR_TEST',
  APPLY_TEST_INVENTORY_AND_EVALUATE: 'APPLY_TEST_INVENTORY_AND_EVALUATE',
};

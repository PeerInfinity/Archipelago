/**
 * StateManager Commands - Shared constants for communication between
 * StateManagerProxy and StateManagerWorker
 *
 * This file can be safely imported in both main thread and worker contexts.
 */
export const STATE_MANAGER_COMMANDS = {
  INITIALIZE: 'initialize',
  LOAD_RULES: 'loadRules',
  ADD_ITEM_TO_INVENTORY: 'addItemToInventory',
  REMOVE_ITEM_FROM_INVENTORY: 'removeItemFromInventory',
  CHECK_LOCATION: 'checkLocation',
  UNCHECK_LOCATION: 'uncheckLocation',
  SET_STATIC_DATA: 'setStaticData',
  BEGIN_BATCH_UPDATE: 'beginBatchUpdate',
  COMMIT_BATCH_UPDATE: 'commitBatchUpdate',
  APPLY_RUNTIME_STATE: 'applyRuntimeState',
  UPDATE_WORKER_LOG_CONFIG: 'updateWorkerLogConfig',
  PING: 'ping',
  SYNC_CHECKED_LOCATIONS_FROM_SERVER: 'syncCheckedLocationsFromServer',
  TOGGLE_QUEUE_REPORTING: 'toggleQueueReporting',
  GET_FULL_SNAPSHOT_QUERY: 'getFullSnapshotQuery',
  GET_WORKER_QUEUE_STATUS_QUERY: 'getWorkerQueueStatusQuery',
  EVALUATE_RULE_REMOTE: 'evaluateRuleRemote',
  SETUP_TEST_INVENTORY: 'setupTestInventory',
  EVALUATE_LOCATION_ACCESSIBILITY_TEST: 'evaluateLocationAccessibilityForTest',
  APPLY_TEST_INVENTORY_AND_EVALUATE: 'applyTestInventoryAndEvaluate',
  GET_RAW_JSON_DATA_SOURCE: 'getRawJsonDataSource',
  CLEAR_STATE_AND_RESET: 'clearStateAndReset',
  CLEAR_EVENT_ITEMS: 'clearEventItems',
  SET_AUTO_COLLECT_EVENTS_CONFIG: 'setAutoCollectEventsConfig',
  SET_SPOILER_TEST_MODE: 'setSpoilerTestMode',
  RECALCULATE_ACCESSIBILITY: 'recalculateAccessibility',
};

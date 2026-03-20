/**
 * Editor Event Constants
 *
 * Centralized event names for editor-related communication.
 */

export const EDITOR_EVENTS = {
  // Incoming events (subscribed to)
  RAW_JSON_LOADED: 'stateManager:rawJsonDataLoaded',
  MODE_DATA_LOADED: 'app:fullModeDataLoadedFromStorage',
  EXPORT_TO_EDITOR: 'json:exportToEditor',
  JS_FILE_CONTENT: 'metaGame:jsFileContent',
  REQUEST_CONTENT: 'editor:requestContent',
  SNAPSHOT_UPDATED: 'stateManager:snapshotUpdated',
  APP_READY: 'app:readyForUiDataLoad',

  // Outgoing events (published)
  CONTENT_RESPONSE: 'editor:contentResponse',
  ACTIVATE_PANEL: 'ui:activatePanel',
};

export default EDITOR_EVENTS;

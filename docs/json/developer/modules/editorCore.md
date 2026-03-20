# Editor Core Module

**Module ID:** `editorCore`

**Purpose:** Non-UI module providing centralized data management and event coordination for all editor implementations. Handles content sources and synchronization between different editor panels.

## Key Files

- `frontend/modules/editorCore/index.js` - Module entry point and registration
- `frontend/modules/editorCore/editorDataService.js` - Singleton service managing content
- `frontend/modules/editorCore/editorEvents.js` - Event constant definitions
- `frontend/modules/editorCore/editorConfig.js` - Default configuration

## Responsibilities

- **Content Source Management:** Manages multiple content sources (rules, localStorage, exports, etc.)
- **Data Synchronization:** Keeps editor content in sync with application state
- **Event Coordination:** Coordinates content updates across editor implementations
- **Fetch Capabilities:** Provides on-demand data fetching for dynamic content sources

## Events Published

| Event | Data | Description |
|-------|------|-------------|
| `ui:activatePanel` | Panel info | Activates editor panel when content is ready |
| `editor:contentResponse` | Content data | Responds to content requests |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `stateManager:rawJsonDataLoaded` | Loads rules data |
| `app:fullModeDataLoadedFromStorage` | Loads localStorage mode data |
| `json:exportToEditor` | Receives data to export |
| `metaGame:jsFileContent` | Receives JS file content |
| `editor:requestContent` | Responds to content requests |
| `stateManager:snapshotUpdated` | Updates snapshot view |

## Public Functions

Exported from module:

| Function | Description |
|----------|-------------|
| `editorDataService` | Singleton service instance |
| `EDITOR_EVENTS` | Event constant definitions |
| `defaultConfig` | Default configuration |
| `defaultContentSources` | Available content sources |

## Content Sources

| Source Key | Description | Fetch Capability |
|------------|-------------|------------------|
| `rules` | Active Rules JSON | No |
| `localStorageMode` | Loaded Mode Data | No |
| `dataForExport` | Data for Export | No |
| `metaGameJsFile` | metaGame JS file | No |
| `latestSnapshot` | Latest Snapshot | Yes |
| `staticData` | Static Data | Yes |
| `commandQueue` | Command Queue Status | Yes (async) |

## EditorDataService API

```javascript
// Get content for a source
const content = editorDataService.getContent('rules');

// Set content
editorDataService.setContent('rules', jsonString);

// Switch active source
editorDataService.setCurrentSourceKey('latestSnapshot');

// Register change listener
editorDataService.onContentChanged((sourceKey, content) => {
    console.log('Content changed:', sourceKey);
});

// Fetch dynamic data
await editorDataService.fetchSnapshot();
await editorDataService.fetchStaticData();
await editorDataService.fetchCommandQueue();

// Auto-update controls
editorDataService.setAutoUpdateEnabled(true);
editorDataService.updateNow();
```

## Dependencies & Interactions

- **`stateManager`:** Fetches snapshots, static data, and command queue
- **`eventBus`:** Publishes panel activation and content response events
- **Editor implementations:** CodeMirror6 and other editors consume this service

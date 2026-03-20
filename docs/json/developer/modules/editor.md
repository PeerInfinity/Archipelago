### Module: `Editor`

- **ID:** `editor`
- **Purpose:** Provides a simple textarea-based editor panel for developers and advanced users to inspect and edit key JSON data objects currently active in the application.

---

#### Key Files

- `frontend/modules/editor/index.js`: Module entry point and registration.
- `frontend/modules/editor/editorUI.js`: The UI class for the panel, which primarily manages a `<textarea>` element.

#### Responsibilities

- **Data Display:** Displays the content of various internal JSON data structures in a formatted, human-readable way.
- **Data Editing:** Allows editing of JSON data and applying changes back to the application.
- **Source Switching:** Provides a dropdown menu to switch between different data sources:
  - **Active Rules JSON:** Shows the complete `rules.json` object that is currently loaded into the `StateManager` worker. This is useful for debugging game logic and rule evaluation.
  - **Loaded Mode Data:** Shows the aggregated configuration object (`G_combinedModeData`) for the current application mode, which includes `rulesConfig`, `moduleConfig`, `layoutConfig`, and `userSettings`.
  - **Data for Export:** Shows data exported from the JSON panel for editing.
  - **metaGame js file:** Shows metaGame JavaScript configuration files.
  - **Latest Snapshot:** Shows the current state manager snapshot.
- **Apply Changes:** The green **Apply** button (or Ctrl+Enter) applies edits back to the running application. The apply logic for `dataForExport` mode uses the shared `applyLoadedData()` utility from `frontend/utils/dataApplicator.js`, which handles rules, settings, layout, and registered module data.
- **Data Source Provenance:** When displaying the "Loaded Mode Data", the editor prepends a comment block detailing the origin of each configuration part (e.g., loaded from `localStorage` or a specific file path). This is crucial for debugging configuration issues.
- **Live Updates:** Listens for application events and automatically updates its content when new data is loaded.

#### Events Published

- `files:jsonLoaded`: Published when applying rules changes.
- `editor:metaGameConfigApply`: Published when applying metaGame configuration.
- `editor:snapshotApply`: Published when applying snapshot edits.

#### Events Subscribed To

The `EditorUI` listens for events to know when to update its content sources.

- `stateManager:rawJsonDataLoaded`: Fired when the `StateManager` receives a new `rules.json` object. This updates the "Active Rules JSON" view.
- `app:fullModeDataLoadedFromStorage`: Fired by `init.js` after the application has fully loaded and assembled the combined data for the active mode. This updates the "Loaded Mode Data" view.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`dataApplicator`**: Uses the shared `applyLoadedData()` utility for applying export data.
- **StateManager**: Listens for the `rawJsonDataLoaded` event to get the active ruleset.
- **`init.js`**: Listens for the `fullModeDataLoadedFromStorage` event to get the combined mode configuration object (`G_combinedModeData`).
- **JSON Module**: The "Loaded Mode Data" view is a direct reflection of the data that the `JSON` module can save and load, making the `Editor` a useful tool for verifying the contents of a saved mode. The JSON panel's **Edit** buttons send individual data sections to this editor.

#### Alternative Implementations

- **`editorCodeMirror6`:** A more advanced editor implementation using CodeMirror 6 with syntax highlighting, code folding, and bracket matching. See the [editorCodeMirror6 docs](editorCodeMirror6.md).

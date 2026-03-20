### Module: `JSON Operations`

- **ID:** `json`
- **Purpose:** Provides a centralized UI for managing the application's complete configuration state. It allows users to save, load, and manage different "modes," where a mode is a collection of all configuration files and runtime data.

---

#### Key Files

- `frontend/modules/json/index.js`: Module entry point and registration.
- `frontend/modules/json/jsonUI.js`: The UI class that renders the panel and handles the save/load logic.
- `frontend/utils/dataApplicator.js`: Shared utility for applying loaded data (rules, settings, layout, module data). Used by `jsonUI`, `editorUI`, and `codeMirror6UI`.
- `frontend/modes.json`: A core configuration file that defines the default file paths for different application modes (e.g., `default`, `test`, `adventure`).

#### Responsibilities

- **Aggregate Configuration:** Gathers all current application configuration and state into a single, comprehensive JSON object. This includes:
  - `rulesConfig`: The currently loaded `rules.json`.
  - `moduleConfig`: The module manifest from `module-configs/modules.json`.
  - `layoutConfig`: The current Golden Layout state.
  - `userSettings`: The current application settings from `settings/settings.json`.
  - **Module-Specific Data:** Any data registered by other modules (e.g., the test list from the `Tests` module, runtime inventory/checks from the `StateManager` via `stateManagerRuntime`, or the full state snapshot via `stateManagerSnapshot`).
- **Save to File:** Allows the user to download the aggregated configuration object as a single `.json` file. The user can select which parts of the configuration to include.
- **Load from File:** Allows the user to upload a previously saved combined JSON file. This will apply the configurations and data from the file to the current session. All data types are applied live via the shared `applyLoadedData()` utility, including layout changes.
- **Edit Individual Sections:** Each data item has an **Edit** button that exports that section's data (wrapped under its config key, e.g. `{layoutConfig: {...}}`) to the Editor panel. The user can modify and apply it with the Editor's Apply button.
- **Manage LocalStorage Modes:**
  - **Save:** Saves the aggregated configuration to the browser's `localStorage` under a user-provided mode name. The Save to LocalStorage button appears at the top of the panel with green styling.
  - **Load:** Displays a list of all modes saved in `localStorage` and allows the user to set one as active for the next session (requires a page reload).
  - **Delete:** Allows the user to remove saved modes from `localStorage`.
- **Reset Default Mode:** Clears the saved default mode from `localStorage` and reloads the app to its base state. The button appears at the top of the panel with red styling.
- **Display `modes.json`:** Shows a read-only list of the modes predefined in `frontend/modes.json`, with a button to reload the application into that specific mode via a URL parameter (`?mode=...`).
- **Module Data Integration:** Provides a mechanism (`centralRegistry.registerJsonDataHandler`) for other modules to register their own data to be included in the save/load process.

#### Data Application (Shared Utility)

The `applyLoadedData()` function in `frontend/utils/dataApplicator.js` is the single code path used by all three consumers (JSON panel, textarea Editor, CodeMirror6 Editor) to apply loaded data. It handles:

- `rulesConfig` — Published via `files:jsonLoaded` event
- `userSettings` — Applied via `settingsManager.updateSettings()`
- `layoutConfig` — Applied live via `applyLayoutConfig()`, which transforms the config for Golden Layout 2.x compatibility and calls `goldenLayoutInstance.loadLayout()`. After loading, `app:readyForUiDataLoad` is re-published (deferred by one animation frame) so newly created panels populate their data.
- **Registered module handlers** — Applied via each handler's `applyLoadedDataFunction()` if `requiresReload` is `false`

The utility also exports `transformLayoutConfigSizes()` for use when saving/exporting layout configs.

#### Events Published

- `files:jsonLoaded`: Published when importing a `rulesConfig`, triggering a live rules reload via the state manager.
- `ui:notification`: Publishes success or error messages to the user.
- It can indirectly trigger nearly every application event by loading a new configuration that causes `init.js` to re-initialize the application on the next load.

#### Events Subscribed To

- `app:activeModeDetermined`: Listens for the initial mode determined by `init.js` to update its display.
- `app:modesJsonLoaded`: Listens for the `modes.json` file to be loaded so it can display the list of predefined modes.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`init.js`**: The `JSON` module's functionality is deeply tied to the loading logic in `init.js`. `init.js` is responsible for reading the "last active mode" from `localStorage` (which `JsonUI` sets) and loading the corresponding data at startup.
- **`centralRegistry`**: It reads the list of registered JSON data handlers from the registry to dynamically create checkboxes for module-specific data and to call the correct save/load functions for them.
- **`dataApplicator`**: Uses the shared `applyLoadedData()` utility for applying loaded data and `transformLayoutConfigSizes()` for preparing layout configs for save/export.
- **All Modules:** It can interact with almost any module that registers a JSON data handler, allowing for a complete application state snapshot.
- **`settingsManager`**: It gets the current `userSettings` from the `settingsManager` when saving.
- **Golden Layout**: It calls `goldenLayoutInstance.saveLayout()` to get the current live layout state when saving.

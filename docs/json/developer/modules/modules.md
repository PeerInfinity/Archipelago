### Module: `Modules Panel`

- **ID:** `modules`
- **Purpose:** Provides a developer and power-user interface for viewing the status of all frontend modules, enabling or disabling them at runtime, and initiating the load of external modules.

---

#### Key Files

- `frontend/modules/modules/index.js`: The module's entry point for registration.
- `frontend/modules/modules/modulesUI.js`: The UI class that renders the list of available modules and handles user interaction.

#### Responsibilities

- **Display Module List:** Fetches the complete list of modules from `module-configs/modules.json` (via an API provided by `init.js`) and displays them in their `loadPriority` order.
- **Show Module State:** For each module, it displays its name, description, and current enabled/disabled status via a checkbox.
- **Enable/Disable Modules:** Allows the user to toggle a module's "Enabled" checkbox.
  - **Disabling** a module will destroy its associated Golden Layout panel, effectively removing it from the UI.
  - **Enabling** a module will re-initialize it and create a new instance of its panel in the layout.
- **Load External Modules:** Provides a button that prompts the user for a URL to an external module's `index.js` file. On submission, it dispatches an event to request that the core system load this module dynamically. (Note: The UI for this is implemented, but the core logic in `init.js` to handle the request is a planned feature).
- **Priority Reordering (Planned):** The UI includes buttons (`▲`/`▼`) for changing a module's load priority, though the logic to handle this and persist the changes is a planned feature and not yet implemented.

#### Events Published

- `module:loadExternalRequest`: Publishes the path to an external module when the user submits it via the "Add External Module" dialog.

#### Events Subscribed To

- `app:readyForUiDataLoad`: Listens for this to perform its initial fetch of the module list from the `moduleManagerApi`.
- `module:stateChanged`: Listens for this to update its display if a module's enabled state is changed externally (e.g., a panel is closed by the user).
- `module:loaded`: Listens for this to refresh its list when a new module (e.g., an external one) is successfully loaded and integrated.
- `module:loadFailed`: Listens for this to display an error if an external module fails to load.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`init.js` (`moduleManagerApi`):** This is the module's most critical dependency. The `ModulesPanel` uses the `moduleManagerApi` (exposed by `init.js`) to get the list of all modules and their states, and to call the `enableModule()` and `disableModule()` functions that orchestrate the runtime changes.
- **`PanelManager`**: When a module is enabled, the `moduleManagerApi` uses the `PanelManager` to create a new instance of that module's panel in the Golden Layout. When disabled, it uses the `PanelManager` to destroy the panel.
- **`centralRegistry`**: It indirectly relies on the `centralRegistry` to have information about which `componentType` belongs to which module ID so that the correct panel can be created or destroyed.

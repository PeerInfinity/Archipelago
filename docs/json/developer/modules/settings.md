### Module: `Settings`

- **ID:** `settings`
- **Purpose:** Provides a user-friendly interface for viewing and modifying all application and module-specific settings in real-time.

---

#### Key Files

- `frontend/modules/settings/index.js`: The module's entry point for registration.
- `frontend/modules/settings/settingsUI.js`: The UI class that renders the settings editor panel.
- `frontend/app/core/settingsManager.js`: The core service that this module interacts with. It manages loading, storing, and updating the settings object.
- `frontend/settings.json`: The file containing the default values for all application settings.
- `frontend/settings.schema.json`: A JSON Schema file that defines the structure, types, and constraints for the settings object.

#### Responsibilities

- **Render Settings Editor:** The primary responsibility is to create a JSON editor for all settings. It uses a textarea with JSON formatting to display and edit the settings object.
- **Load Current Settings:** On initialization, it fetches the current, complete settings object from the `settingsManager`.
- **Update Settings Live:** When a user changes a value in the editor UI, the `SettingsUI` immediately calls `settingsManager.updateSettings()` to update the central settings object.
- **Trigger Application-Wide Updates:** By calling `settingsManager.updateSettings()`, it causes the `settingsManager` to publish a `settings:changed` event on the `eventBus`. This allows any other module to listen for and react to settings changes in real-time.
- **Navigate to JSON Module:** (Planned/Existing) Includes a button to activate the "JSON Operations" panel, providing users with a clear path to save their settings changes into a persistent mode file.

#### Events Published

This module does not publish its own unique events. It triggers the `settingsManager` to publish its events.

- **Triggers `eventBus` event via `settingsManager`**: `settings:changed` whenever a setting is modified in the UI.

#### Events Subscribed To

The `SettingsUI` does not need to subscribe to `settings:changed` itself, as it is the source of the changes and directly controls the textarea editor. It gets its initial data on creation and pushes updates outward.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`settingsManager`**: This is the module's most critical dependency. The `SettingsUI` reads the initial settings from it and writes all changes back to it. It is the UI frontend for the `settingsManager` service.
- **JSON Module**: The `Settings` panel provides a user-friendly way to modify the `userSettings` portion of the application state, which can then be saved permanently as part of a "mode" using the `JSON` module.

### Module: `Meta Game Panel`

-   **ID:** `metaGamePanel`
-   **Purpose:** Provides a user interface for loading, managing, and editing `MetaGame` module configurations, allowing users to activate different scripted scenarios.

---

#### Key Files

-   `frontend/modules/metaGamePanel/index.js`: The module's entry point for registration.
-   `frontend/modules/metaGamePanel/metaGamePanelUI.js`: The UI class that renders the panel and handles user interactions.

#### Responsibilities

-   **Render UI Panel:** Displays a Golden Layout panel with controls for meta-game management.
-   **List Configurations:** Provides a dropdown menu populated with available preset meta-game configuration files (e.g., `progressBarTest.js`).
-   **Load Configurations:** When a user selects a configuration from the dropdown, it calls the `metaGame` module's public `loadConfiguration` function to load and activate the selected scenario.
-   **Display & Edit JSON:** Shows the JSON portion of a loaded configuration in a textarea, allowing the user to make real-time edits to values.
-   **Apply JSON Changes:** Provides an "Apply" button that sends the edited JSON from the textarea to the `metaGame` module by calling its `updateJSONConfiguration` function.
-   **View Source Code:** Includes a "View js file contents" button that publishes an event to send the full JavaScript source of the selected configuration file to the `Editor` panel for inspection.
-   **Clear Configuration:** Provides a "Clear" button to unload the currently active meta-game scenario and its associated event handlers.
-   **Status Display:** Shows feedback to the user, indicating whether a configuration was loaded successfully or if an error occurred.

#### Events Published

-   **`eventBus`**:
    -   `metaGame:jsFileContent`: Published when the "View js file contents" button is clicked. The payload contains the source code of the selected configuration file, intended for consumption by the `Editor` module.
    -   `metaGamePanel:configurationApplied`: Published when a new configuration is successfully loaded.
    -   `metaGamePanel:jsonConfigurationApplied`: Published when edited JSON is successfully applied to the current configuration.
    -   `metaGamePanel:error`: Published if the UI encounters an error during its operations.

#### Events Subscribed To

The `metaGamePanelUI` is primarily user-driven and does not have significant event subscriptions for its core functionality. It initiates actions by calling the public functions of the `metaGame` module.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

-   **`metaGame` Module**: This is the panel's most critical dependency. It directly controls the `metaGame` module by calling its public functions (`loadConfiguration`, `updateJSONConfiguration`, `clearConfiguration`, `getStatus`) via the `centralRegistry`.
-   **`Editor` Module**: It interacts with the `Editor` panel by publishing the `metaGame:jsFileContent` event, which provides a convenient way for developers to view the source code of the meta-game scenarios they are working with.
-   **Golden Layout**: Manages the lifecycle of this UI panel.
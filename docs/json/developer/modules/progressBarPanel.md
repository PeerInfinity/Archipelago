### Module: `Progress Bar Panel`

-   **ID:** `progressBarPanel`
-   **Purpose:** Provides a dedicated, standalone Golden Layout panel whose primary purpose is to act as a "host" for the UI elements created by the `ProgressBar` module.

---

#### Key Files

-   `frontend/modules/progressBarPanel/index.js`: The module's entry point for registration.
-   `frontend/modules/progressBarPanel/progressBarPanelUI.js`: The UI class that renders the panel and provides the container for progress bar elements.

#### Responsibilities

-   **Create a Golden Layout Panel:** Registers a `progressBarPanel` component with Golden Layout, allowing users to place a dedicated progress bar container anywhere in their UI layout.
-   **Act as a UI Host:** The panel's content consists of a main area that serves as a `targetElement` for progress bars created by the `ProgressBar` module.
-   **Provide UI Controls:** Includes a header and basic controls (like a "Create Test Progress Bar" button for debugging) that can be hidden via an event, allowing for a clean, content-only display when used by other modules like `MetaGame`.

#### Events Published

-   **`progressBar:create`**: Published when the user clicks the "Create Test Progress Bar" button for debugging purposes.

#### Events Subscribed To

-   **`eventBus`**:
    -   `progressBarPanel:showUIContent`: Listens for this event to make its default UI (header, buttons) visible.
    -   `progressBarPanel:hideUIContent`: Listens for this event to hide its default UI, leaving only the main content area for a seamless look. This is typically used by the `MetaGame` module.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

-   **`ProgressBar` Module**: The `progressBarPanel` is a direct consumer of the UI elements produced by the `ProgressBar` module. When a `progressBar:create` event is published with this panel's main area as the `targetElement`, the `ProgressBar` module renders the new progress bar directly inside this panel.
-   **`MetaGame` Module**: The `MetaGame` module often uses this panel as the target for the progress bars it creates. It will typically publish a `progressBarPanel:hideUIContent` event to ensure that only the progress bars it manages are visible, without the panel's default header or buttons.
-   **Golden Layout**: Its entire existence as a visible panel is managed by the Golden Layout framework.
### Module: `Path Analyzer Panel`

- **ID:** `pathAnalyzerPanel`
- **Purpose:** Creates a dedicated, standalone Golden Layout panel for running the path analysis tool. Unlike the integrated analyzer in the "Regions" panel, this module allows a user to analyze a path to _any_ region by name.

---

#### Key Files

- `frontend/modules/pathAnalyzerPanel/index.js`: The module's entry point for registration.
- `frontend/modules/pathAnalyzerPanel/pathAnalyzerPanelUI.js`: The UI class for the panel. It acts as a "host" or "wrapper" for the main path analysis UI.

#### Responsibilities

- **Create a Dedicated Panel:** Registers a `pathAnalyzerPanel` component with Golden Layout so the tool can have its own place in the UI.
- **Provide User Input:** Renders its own simple UI, which consists of a text input field for the user to enter a target region name and an "Analyze Paths" button.
- **Host the Path Analyzer:** When the user initiates an analysis, this module instantiates and uses the `PathAnalyzerUI` class from the `pathAnalyzer` module. It delegates all the complex analysis and results-rendering logic to that component, displaying the output within its own panel.
- **Configurable Analysis:** It is designed to eventually support instance-specific settings, allowing a user to tweak parameters like "max paths" or "timeout" for a specific analysis run directly from this panel's UI.

#### Events Published

This module does not publish any events.

#### Events Subscribed To

This module is primarily user-driven and does not have significant event subscriptions for its core functionality. It indirectly benefits from the embedded `PathAnalyzerUI`'s subscription to `settings:changed`.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`Path Analyzer` Module:** This module is a **consumer** of the `pathAnalyzer` module. It creates an instance of `PathAnalyzerUI` and uses it to perform all the heavy lifting. It acts as a shell or host, providing a standalone context for the analyzer tool.
- **StateManager**: Indirectly dependent. The `PathAnalyzerUI` instance it uses requires a `StateSnapshotInterface` from the `StateManager` to perform its analysis.
- **Regions Module**: Complements the `Regions` panel. While the Regions panel provides an "Analyze Paths" button for the region you are currently viewing, this standalone panel allows you to analyze a path to any region in the game by typing its name.

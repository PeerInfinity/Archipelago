### Module: `Tests`

-   **ID:** `tests`
-   **Purpose:** Provides a comprehensive in-app framework for discovering, running, and debugging automated feature and integration tests. This module is the core of the project's Playwright-based end-to-end testing strategy.

---

#### Key Files

-   `frontend/modules/tests/index.js`: The module's entry point.
-   `frontend/modules/tests/testLogic.js`: The orchestrator that manages test discovery, execution sequencing, and state.
-   `frontend/modules/tests/testController.js`: Defines the powerful API provided to individual test functions, allowing them to interact with and assert against the application's state and UI.
-   `frontend/modules/tests/testDiscovery.js`: The script that dynamically imports all test case files.
-   `frontend/modules/tests/testRegistry.js`: Manages the self-registration of all discovered test functions.
-   `frontend/modules/tests/testCases/`: The directory containing all the individual test case files (e.g., `coreTests.js`, `stateManagementTests.js`).
-   `frontend/playwright_tests_config.json`: The configuration file loaded when the app is in "test" mode, defining which tests to run automatically for Playwright.

#### Responsibilities

-   **Test Discovery:** Automatically discovers and imports all test functions from the `frontend/modules/tests/testCases/` directory.
-   **Test Orchestration:** Manages the execution of tests, either individually when run from the UI or as a full suite when triggered automatically in "test" mode.
-   **Test Controller API:** Provides a `TestController` object to each test function. This controller acts as a bridge, allowing the test to:
    -   Log messages and report pass/fail conditions.
    -   Interact with the `StateManager` (e.g., `loadRules`, `addItemToInventory`).
    -   Simulate user actions (e.g., `SIMULATE_CLICK` on a DOM element).
    -   Dispatch events on the `eventBus`.
    -   Wait for specific application events to occur (`waitForEvent`), which is crucial for handling asynchronous operations and avoiding race conditions.
-   **Playwright Integration:** When the application runs in "test" mode (`?mode=test`), it automatically executes all enabled tests from a specific configuration file. Upon completion, it writes a detailed JSON summary of the results to `window.__playwrightTestResults__` and sets a completion flag. This allows the external Playwright test runner (`tests/e2e/app.spec.js`) to get the results and validate the application's overall health.
-   **UI Panel:** Provides a developer-focused UI for viewing all discovered tests, enabling or disabling them, running them individually or in batches, and seeing detailed results, conditions, and logs for each test run.

#### Events Published

-   **`eventBus`**:
    -   `tests:listUpdated`, `tests:statusChanged`, `tests:completed`, `tests:allRunsCompleted`: Publishes a variety of events to its own UI to keep the display live and updated during test execution.
    -   `files:jsonLoaded`: Publishes this event when a test needs to load a specific `rules.json` file into the `StateManager`.

#### Events Subscribed To

-   **`eventBus`**:
    -   `app:readyForUiDataLoad`: Listens for this event to trigger its initialization and test discovery process.

#### Public Functions (`centralRegistry`)

-   **`testsConfig` Data Handler**: Registers a data handler with the `JSON` module to allow the entire test configuration (including which tests are enabled) to be saved and loaded as part of a "mode".

#### Dependencies & Interactions

-   **Playwright (`tests/e2e/app.spec.js`):** The Playwright test script is the external consumer of this module's automated run. It launches the app in test mode and waits for the `window.__playwrightTestsComplete__` flag that this module sets upon completion.
-   **StateManager**: The `TestController` interacts heavily with the `StateManager` to set up specific game states required for tests and to verify outcomes.
-   **All Modules**: As an integration testing framework, tests written for this module can be designed to interact with any part of the application by simulating user events or calling public functions, making it a powerful tool for end-to-end validation.
### Module: `Tests`

- **ID:** `tests`
- **Purpose:** Provides a comprehensive in-app framework for automated feature and integration testing. It is the core of the project's Playwright-based end-to-end testing.

---

#### Key Files

- `frontend/modules/tests/index.js`: The module's entry point.
- `frontend/modules/tests/testLogic.js`: The orchestrator that manages test discovery, execution, and state.
- `frontend/modules/tests/testController.js`: The API provided to individual test functions, allowing them to interact with the application.
- `frontend/modules/tests/testDiscovery.js`: Script that dynamically imports all test case files.
- `frontend/modules/tests/testRegistry.js`: Manages the self-registration of discovered tests.
- `frontend/modules/tests/testCases/`: The directory containing all the individual test case files (e.g., `coreTests.js`, `stateManagementTests.js`).
- `frontend/playwright_tests_config.json`: The configuration file loaded when the app is in "test" mode, defining which tests to run automatically.

#### Responsibilities

- **Test Discovery:** Automatically discovers and imports all test functions from the `frontend/modules/tests/testCases/` directory.
- **Test Orchestration:** Manages the execution of tests, either individually when run from the UI or as a full suite when triggered automatically.
- **Test Controller API:** Provides a powerful `TestController` object to each test function. This controller acts as a bridge, allowing the test to:
  - Log messages and report pass/fail conditions.
  - Interact with the `StateManager` (e.g., `loadRules`, `addItemToInventory`).
  - Simulate user actions (e.g., `SIMULATE_CLICK` on a DOM element).
  - Dispatch events on the `eventBus`.
  - Wait for specific application events to occur (`waitForEvent`), which is crucial for handling asynchronous operations.
- **Playwright Integration:** When the application is run in test mode (`?mode=test`), it automatically executes all enabled tests. Upon completion, it writes a detailed JSON summary of the results to `localStorage` and sets a completion flag. This allows the external Playwright test runner to get the results and validate the application's overall health.
- **UI Panel:** Provides a UI for developers to view all discovered tests, enable or disable them, run them individually or in batches, and see detailed results, conditions, and logs for each test run.

#### Events Published

- `test:listUpdated`, `test:statusChanged`, `test:completed`, `test:allRunsCompleted`, etc.: Publishes a variety of events to its own UI to keep the display live and updated during test execution.

#### Events Subscribed To

This module is primarily a driver of action and does not subscribe to many external events for its core logic, with the notable exception of `app:readyForUiDataLoad` to trigger its initialization and test discovery process.

#### Public Functions (`centralRegistry`)

This module does not register public functions for other modules to call.

#### Dependencies & Interactions

- **Playwright (`tests/e2e/app.spec.js`):** The Playwright test script is the external consumer of this module's automated run. It launches the app in test mode and waits for the `localStorage` flags that this module sets upon completion.
- **StateManager**: The `TestController` interacts heavily with the `StateManager` to set up specific game states required for tests and to verify outcomes.
- **All Modules**: As an integration testing framework, tests written for this module can be designed to interact with any part of the application by simulating user events or calling public functions, making it a powerful tool for end-to-end validation.

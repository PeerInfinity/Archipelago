# Developer Guide: Testing Pipeline

This project contains a comprehensive testing pipeline designed to validate that the frontend JavaScript implementation of the game logic correctly simulates a full playthrough, behaving identically to the authoritative Python implementation from the main Archipelago project. Understanding this data flow is essential for debugging rules, fixing test failures, and ensuring the accuracy of the web client.

## Testing Philosophy

The core principle is **progression equivalence**. The JavaScript `StateManager` and `RuleEngine` must unlock locations in the same order (or "spheres") as the original Python game generator given the same world seed and settings. The entire pipeline is built to automate this comparison.

## The Data Flow: From Python Generation to JavaScript Validation

The testing process involves several stages, moving data from the original game generation process to the frontend for validation.

```
┌──────────────────┐   1. Generates   ┌────────────────────────┐
│ Generate.py      ├───────────────►│   Spoiler Log & Rules  │
│ (Python Backend) │                  │ (..._spheres_log.jsonl)│
└──────────────────┘                  │ (..._rules.json)       │
                                      └───────────┬────────────┘
                                                  │ 2. Consumes
                                                  ▼
┌──────────────────┐   4. Validates   ┌────────────────────────┐
│  Test Results    │◄───────────────┤  Frontend TestSpoilers │
│     (UI)         │                  │    (testSpoilerUI.js)  │
└──────────────────┘                  └────────────────────────┘
```

### Stage 1: Python Source & Spoiler Log Generation

-   **Source of Truth:** The game generation process, orchestrated by `Generate.py`, is the source of truth. When run with a spoiler level of 2 or higher (`--spoiler 2`), it produces a detailed log of the game's logical progression.
-   **Spoiler Log (`_spheres_log.jsonl`):** This file is the ground truth for our testing. It contains a sequence of "spheres," where each sphere lists the locations that become accessible after collecting all the items from the previous spheres.

### Stage 2: The Exporter (`exporter/`)

-   During the same `Generate.py` run, our custom exporter is triggered.
-   **`exporter.py`**: This script orchestrates the process of parsing the game's rules, regions, and items.
-   **`analyzer.py`**: This uses Python's `ast` module to convert the game's logic into our standardized JSON rule tree format.

### Stage 3: JSON Data Files

The generation and export process creates two critical JSON files for each seed:

1.  **`..._rules.json`**: A complete dump of the entire game's logic, including all region data, location rules, item definitions, and game settings, translated into the JSON format that our frontend understands. This is the logic that will be **under test**.
2.  **`..._spheres_log.jsonl`**: The list of progression spheres, which serves as the **expected result**. Each sphere contains the set of locations that should become accessible at that stage.

### Stage 4: Frontend Test Execution (`frontend/modules/testSpoilers/`)

The **Test Spoilers** panel in the web client is the user interface for this pipeline.

-   **Loading:** The test automatically loads the `_rules.json` file into the `StateManager` worker, configuring it with the specific logic for that seed. It then loads the corresponding `_spheres_log.jsonl` file.
-   **Execution & Validation:** When you click "Run Full Test," the `testSpoilerUI.js` module simulates a full playthrough sphere by sphere:
    1.  It starts with an empty inventory.
    2.  It gets the list of accessible locations from the frontend `StateManager`.
    3.  It compares this list against the locations in Sphere 0 from the spoiler log. Any mismatch is reported as a failure.
    4.  It commands the `StateManager` to "check" all locations from the current sphere, which adds all of their items to the inventory.
    5.  After the state updates, it again gets the list of accessible locations.
    6.  It compares this new list against the locations in the next sphere from the spoiler log.
    7.  This process repeats until all spheres have been checked or a mismatch is found.

### Stage 5: Results

-   **Pass/Fail:** The result of each sphere comparison is displayed in the UI. A green entry indicates a match, while a red entry indicates a mismatch.
-   **Mismatch Details:** In case of a failure, the UI provides a detailed report showing which locations were accessible in the frontend but not in the log, and vice-versa. Location names in the report are clickable links for easier debugging in the "Regions" panel.

## Running Automated Tests with Playwright

The entire pipeline can be run automatically from the command line using Playwright, which is the primary method for ensuring code quality.

-   **Test Mode:** Running `npm test` launches the web client with the `?mode=test` URL parameter.
-   **Auto-Execution:** In "test" mode, the application automatically loads a predefined test configuration (`playwright_tests_config.json`).
-   **`localStorage` Bridge:** Upon completion, the in-browser test writes a summary of the results to `localStorage`.
-   **Validation:** The Playwright script (`tests/e2e/app.spec.js`) waits for this `localStorage` flag, reads the results, and asserts that all tests passed, reporting the final outcome to the command line.

This end-to-end pipeline ensures a high degree of confidence that the frontend client is a faithful and accurate implementation of Archipelago's game progression logic.
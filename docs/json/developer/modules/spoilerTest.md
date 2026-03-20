### Module: `Spoiler Test`

- **ID:** `spoilerTest`
- **Purpose:** A powerful, game-agnostic validation tool that replays a game's logical progression by processing its spoiler log. It verifies that the frontend `StateManager` can correctly unlock all locations in the same sequence (or "spheres") as the original game generation, confirming the accuracy of the exported rules.

---

#### Key Files

- `frontend/modules/spoilerTest/index.js`: The module's entry point for registration.
- `frontend/modules/spoilerTest/testSpoilerUI.js`: The UI class that renders the panel and handles the test execution logic.

#### Responsibilities

- **Load Spoiler Log:** Provides a UI for the user to load a spoiler log. It can automatically suggest the correct log file based on the currently active `rules.json` (e.g., suggesting `MySeed_sphere_log.jsonl` if `MySeed_rules.json` is loaded).
- **Parse Spoiler Spheres:** Reads the loaded spoiler log and extracts the sequence of "spheres"—groups of locations that become accessible at each stage of progression.
- **Simulate Progression:** The core function of the module. It simulates a full playthrough by:
  1.  Starting with an empty inventory.
  2.  Verifying that the locations accessible at the start match Sphere 0 from the log.
  3.  Commanding the `StateManager` to "check" all locations from the current sphere, effectively adding all their items to the inventory.
  4.  After the state updates, verifying that the newly accessible locations match the next sphere from the log.
  5.  Repeating this process until all spheres have been checked.
- **State Validation:** At each step, it compares the set of accessible locations calculated by the frontend `StateManager` against the set of locations listed in the corresponding sphere from the spoiler log.
- **Display Results:** Provides a detailed, step-by-step log in its UI, reporting which sphere is being processed and highlighting any mismatches found (e.g., locations that were accessible in the frontend but not in the log's sphere, or vice-versa). The location names in mismatch reports are clickable links for easier debugging.

#### Events Published

- `ui:notification`: Publishes user-friendly success or error messages.
- It may indirectly trigger `ui:navigateToRegion` via the clickable links it generates in its output.

#### Events Subscribed To

- `app:readyForUiDataLoad`: To trigger its initial UI setup.
- `stateManager:rulesLoaded`: To know when a new game ruleset is active, which allows it to suggest the corresponding spoiler log file.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **StateManager**: The `Spoiler Test` module uses the `StateManager` as its test subject. It loads a ruleset, then iteratively sends `checkLocation` commands and queries the resulting state snapshot to perform its validation. It is a key tool for verifying the integrity of the `RuleEngine` and `StateManager` against authoritative data.
- **Spoiler Log Generation:** It depends on the generation process creating a `_sphere_log.jsonl` file alongside the `rules.json`. This file contains the ground-truth data that the module validates against.

### Module: `Presets`

- **ID:** `presets`
- **Purpose:** Provides a UI to load predefined game configurations (`rules.json` files) from the server, load `.archipelago` archive files, or load a custom `rules.json` file from the user's local machine. It acts as a primary entry point for getting game logic into the application.

---

#### Key Files

- `frontend/modules/presets/index.js`: The module entry point for registration.
- `frontend/modules/presets/presetUI.js`: The UI class that renders the panel and handles the file loading logic.
- `frontend/presets/preset_files.json`: The index file that this module reads to discover all available predefined presets.

#### Responsibilities

- **Discover Presets:** On initialization, it fetches and parses `preset_files.json` to build a list of available games and their corresponding preset seeds.
- **Render Game List:** Displays games as rows with columns for game name, seed buttons, and test result badges. Games are grouped by display name (variants like `alttp` and `alttp_vanilla` share a row).
- **Seed Buttons:** Each seed appears as a clickable button showing the seed ID. Seeds with vanilla item placement are marked with a purple "V" badge.
- **Test Result Badges:** Each game row displays five mini badges for test types: Minimal Spoiler (MS), Full Spoiler (FS), Multi-client (MC), Multi-world (MW), and Spoiler Fuzz (SF). Badge states: checkmark (passed), X (failed), or ? (no data). Rich tooltips show pass/fail counts, first failure info, and other details.
- **Multi-World Presets:** Multiworld seeds have a distinct layout with per-player buttons (P1, P2, etc.) showing player name and game name. Each player button loads that player's specific ruleset.
- **Load Predefined Presets:** When a user selects a preset, it constructs the file path, fetches the appropriate `rules.json` from the `presets/` directory, and publishes its content. For multiworld, it tries player-specific `_P{id}_rules.json` first, falling back to standard `_rules.json`.
- **Load Custom Files:** Provides a **"Load File"** button that accepts:
  - `.json` files: Parsed directly as JSON.
  - `.archipelago` files: ZIP archives loaded via dynamically-loaded JSZip library. The module searches the archive for `_rules.json` or `rules.json` and extracts it.
- **Publish Loaded Data:** After loading a rules file (either from a preset or a custom file), publishes the parsed JSON data on the `files:jsonLoaded` event.

#### Events Published

- `files:jsonLoaded`: Published with the content of the newly loaded `rules.json` and the selected player ID. Payload: `{ jsonData, selectedPlayerId, sourceName }`.
- `ui:notification`: Published on success or error with user-friendly messages.
- `rules:loaded`: Published after successful load as a trigger for offline play enablement. Payload: `{}`.

#### Events Subscribed To

- `app:readyForUiDataLoad`: Listens for this event to trigger its initial fetch of `preset_files.json`.

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`init.js`**: The `Presets` module relies on `init.js` to listen for the `files:jsonLoaded` event. When `init.js` receives this event, it commands the `StateManager` to load the new rules.
- **StateManager**: Does not interact with the `StateManager` directly. The data it publishes is consumed by the `StateManager` via the `init.js` handler.
- **JSZip**: Dynamically loaded from `./libs/jszip/jszip.min.js` when processing `.archipelago` archive files.
- **Server File Structure**: Depends on a correctly configured `frontend/presets/` directory on the web server, containing a `preset_files.json` index and subdirectories for each game's preset files.

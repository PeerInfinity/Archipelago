# Project Roadmap and Future Development

This document outlines the development priorities for the Archipelago JSON Export Tools project. It is a living document and may be updated as the project evolves.

## Current Priorities

The project is currently focused on a series of cleanup, refactoring, and documentation tasks to solidify the existing architecture and prepare for future feature development.

### Phase 1: Code Cleanup & Documentation

*   **[TASK]** **Code Cleanup:** General code cleanup and removal of deprecated files and logic.
*   **[TASK]** **Documentation Update:** Review and update all documentation to accurately reflect the current, refactored state of the codebase.
*   **[TASK]** **Remove Obsolete Test Code:** Completely remove all code related to the old `testCases` module, the `testCases` directory, and the backend code for generating test case data.
*   **[TASK]** **Refactor Spoiler Generation:** Update the spoiler file generation code to load its settings from `host.yaml` and potentially add settings as parameters to the generation script.
*   **[TASK]** **Refactor Python Changes:** Review changes made to the original Archipelago Python files and refactor them to isolate new code into new files where possible.
*   **[TASK]** **Merge Upstream:** Merge the latest commits from the main Archipelago project.
*   **[TASK]** **Verify Setup Instructions:** Test and update the setup instructions on a fresh installation, ensuring they include any new `.yaml` settings.

### Phase 2: System Enhancements & Validation

*   **[TASK]** **Enhance JSON Module:** Update all modules to save and load their data through the `JSON` module and `modes.json`. Refactor the `JSON` module so that the functions for processing a module's data are registered by that module itself.
*   **[TASK]** **Document New Game Process:** Create clear documentation for the process of adding support for new games.
*   **[TASK]** **Test New Game Process:** Validate the new game documentation by adding support for at least one new game.
*   **[TASK]** **Achieve Passing Tests:** Get the `testSpoilers` suite to pass for at least one game (A Link to the Past, if possible).
*   **[BUG]** **Fix Adventure Victory Item:** Resolve the known bug related to the victory item in the game "Adventure".
*   **[TASK]** **Full Test Suite Pass:** Get the complete set of automated tests passing reliably.

### Phase 3: Feature Implementation & Community Outreach

*   **[FEATURE]** **Implement Maze Game Module:** Create a module version of the planned maze game.
*   **[FEATURE]** **Implement Maze Game (Iframe):** Create an iframe version of the maze game.
*   **[TASK]** **Clean and Document Iframe Interface:** Refactor and document the iframe adapter interface.
*   **[FEATURE]** **Text Adventure Mode:** Implement a new mode for playing "Adventure" as a text adventure, using a custom JSON data file. Create both a module and an iframe version.
*   **[FEATURE]** **Hybrid Game Mode:** Create a new mode that is a hybrid of the Text Adventure and Maze Game, with mazes for specific regions and potentially integrating progress bars.
*   **[TASK]** **Restore Loops Module:** Bring the "Archipelago Loops" module back to its previous level of functionality on the new architecture.
*   **[TASK]** **Review Old Todos:** Go through the old lists of bugs and to-do items to identify any remaining tasks.
*   **[TASK]** **Update Presets Panel:** Add categories to the presets panel and mark most of the games as "Untested".
*   **[TASK]** **Community Announcement:** Write a draft of a message to post to the Archipelago Discord, positioning the project as a proof of concept and outlining future work.

## Future Plans

These are longer-term goals to be considered after the current priorities are addressed.

*   **Text Adventure Enhancements:** Add actions to discover locations/exits, custom text for discovery states, and custom verbs. Potentially add a new `worldState` or `logicTreeState` module to handle complex, multi-step logic puzzles.
*   **Maze Mode Enhancements:** Add new features to the maze mode, potentially incorporating code from existing open-source projects like "A-mazing Idle".
*   **Loops Mode Enhancements:** Add new features based on previously compiled lists and ideas.
*   **Hybrid Game Modes:** Create a hybrid game combining "Archipelago Loops" and "A-mazing Idle", with mazes for dungeons.
*   **External Game Integration:** Integrate existing open-source JavaScript games via the `iframeAdapter`.
*   **New Game Modules:** Create entirely new game modules from scratch.

## Medium Priority & Quality of Life Features

These features will improve the user and developer experience.

*   **[FEATURE]** Update the **`JSON`** module to allow live-loading of all data categories (rules, settings, layout, etc.) without requiring a page reload where possible.

#### Configuration and Settings Improvements
*   **[TASK]** Enhance the **`SettingsUI`** to load and use the `settings.schema.json` file, enabling a richer editing experience with validation and descriptions.
*   **[FEATURE]** Allow user-defined modes to be created and managed entirely from the UI via the `JSON` module.

#### Module System Improvements
*   **[FEATURE]** Implement the core logic in `init.js` to handle **dynamic external module loading** from a URL.
*   **[FEATURE]** Implement the reordering logic (`▲`/`▼` buttons) in the **`Modules` panel** and persist the new order via the `JSON` module.

---

## Long-Term & Experimental Ideas

These are ambitious features for future consideration.

*   **Reverse Exporter (`APWorld` Generation):** Implement the planned tool to generate a playable `.apworld` file from a `rules.json` file, effectively reversing the export process.
*   **Advanced Analysis Tools:** Add new developer panels for graph visualization of the region map, sphere analysis, and critical path identification.

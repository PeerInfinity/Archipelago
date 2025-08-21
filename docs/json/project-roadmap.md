# Project Roadmap and Future Development

This document outlines the development priorities for the Archipelago JSON Export Tools project. It is a living document and may be updated as the project evolves.

## Current Priorities

The project is currently focused on a series of cleanup, refactoring, and documentation tasks to solidify the existing architecture and prepare for future feature development.

### Phase 1: Code Cleanup & Documentation

*   **[TASK]** **Code Cleanup:** General code cleanup and removal of deprecated files and logic.
*   **[TASK]** **Documentation Update:** Review and update all documentation to accurately reflect the current, refactored state of the codebase.

### Phase 2: System Enhancements & Validation

*   **[TASK]** **Enhance JSON Module:** Update all modules to save and load their data through the `JSON` module and `modes.json`. Refactor the `JSON` module so that the functions for processing a module's data are registered by that module itself.
*   **[TASK]** **Achieve Passing Tests:** Get the `testSpoilers` suite to pass for at least one game (A Link to the Past, if possible).
*   **[TASK]** **Full Test Suite Pass:** Get the complete set of automated tests passing reliably.

### Phase 3: Feature Implementation & Community Outreach

*   **[FEATURE]** **Implement Maze Game Module:** Create a module version of the planned maze game.
*   **[TASK]** **Clean and Document Iframe Interface:** Refactor and document the iframe adapter interface.
*   **[FEATURE]** **Text Adventure Mode:** Implement a new mode for playing "Adventure" as a text adventure, using a custom JSON data file. Create both a module and an iframe version.
*   **[FEATURE]** **Hybrid Game Mode:** Create a new mode that is a hybrid of the Text Adventure and Maze Game, with mazes for specific regions and potentially integrating progress bars.
*   **[TASK]** **Restore Loops Module:** Bring the "Archipelago Loops" module back to its previous level of functionality on the new architecture.
*   **[TASK]** **Review Old Todos:** Go through the old lists of bugs and to-do items to identify any remaining tasks.
*   **[TASK]** **Update Presets Panel:** In the Presets panel, report the results of the spoiler test for each game.
*   **[TASK]** **Community Announcement:** Write a draft of a message to post to the Archipelago Discord, positioning the project as a proof of concept and outlining future work.

## Future Plans

These are longer-term goals to be considered after the current priorities are addressed.

*   **Text Adventure Enhancements:** Add actions to discover locations/exits, custom text for discovery states, and custom verbs. Potentially add a new `worldState` or `logicTreeState` module to handle complex, multi-step logic puzzles.
*   **Maze Mode Enhancements:** Add new features to the maze mode.
*   **Loops Mode Enhancements:** Add new features based on previously compiled lists and ideas.
*   **External Game Integration:** Integrate existing open-source JavaScript games via the `iframeAdapter`.
*   **New Game Modules:** Create entirely new game modules from scratch.

## Medium Priority & Quality of Life Features

These features will improve the user and developer experience.

#### Configuration and Settings Improvements
*   **[TASK]** Enhance the **`SettingsUI`** to load and use the `settings.schema.json` file, enabling a richer editing experience with validation and descriptions.

#### Module System Improvements
*   **[FEATURE]** Implement the core logic in `init.js` to handle **dynamic external module loading** from a URL.
*   **[FEATURE]** Implement the reordering logic (`▲`/`▼` buttons) in the **`Modules` panel** and persist the new order via the `JSON` module.

---

## Long-Term & Experimental Ideas

These are ambitious features for future consideration.

*   **Reverse Exporter (`APWorld` Generation):** Implement the planned tool to generate a playable `.apworld` file from a `rules.json` file, effectively reversing the export process.
*   **Advanced Analysis Tools:** Add new developer panels for graph visualization of the region map, sphere analysis, and critical path identification.

# Project Roadmap and Future Development

This document outlines the development priorities for the Archipelago JSON Export Tools project. It is a living document and may be updated as the project evolves.

## Current Priorities

### Discovery Mode

*   **[TASK]** Implement the UI panel for Discovery mode settings.
*   **[TASK]** Update the region graph module to support Discovery mode.
*   **[TASK]** Get Discovery mode working with the Text Adventure module.
*   **[TASK]** Update other modules to support Discovery mode.

### Loops Mode

*   **[TASK]** Get the main Loops module working.
*   **[TASK]** Implement the remaining features of Loops mode.

### Iframe Interface

*   **[TASK]** Clean and document the iframe interface.

### Maze Game

*   **[FEATURE]** Implement the maze game module.
*   **[FEATURE]** Integrate the maze game with Text Adventure.
*   **[FEATURE]** Create a version of the maze game designed to integrate with Loops mode.

## Ongoing

*   **[TASK]** Code cleanup and documentation.
*   **[TASK]** Improve compatibility with Archipelago games.
*   **[TASK]** Review old todos and bug lists.

## Low Priority

### JSON Module Enhancements

*   **[TASK]** Update all modules to save and load their data through the `JSON` module and `modes.json`.
*   **[TASK]** Refactor the `JSON` module so that functions for processing a module's data are registered by that module itself.

### Settings UI Enhancements

*   **[TASK]** Enhance the `SettingsUI` to load and use the `settings.schema.json` file, enabling a richer editing experience with validation and descriptions.

### Module System Improvements

*   **[FEATURE]** Implement core logic in `init.js` to handle dynamic external module loading from a URL.
*   **[FEATURE]** Implement reordering logic in the Modules panel and persist the new order via the `JSON` module.

## Future Plans

These are longer-term goals to be considered after the current priorities are addressed.

*   **Text Adventure Enhancements:** Add actions to discover locations/exits, custom text for discovery states, and custom verbs. Potentially add a new `worldState` or `logicTreeState` module to handle complex, multi-step logic puzzles.
*   **External Game Integration:** Integrate existing open-source JavaScript games via the `iframeAdapter`.
*   **New Game Modules:** Create entirely new game modules from scratch.

## Long-Term & Experimental Ideas

These are ambitious features for future consideration.

*   **Reverse Exporter (APWorld Generation):** Implement a tool to generate a playable `.apworld` file from a `rules.json` file, effectively reversing the export process.
*   **Flash Game Integration:** Experiment with integrating Ruffle or SWFRecomp.

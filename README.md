# Archipelago JSON Export Tools

This project provides a system for exporting Archipelago's game logic into a standardized JSON format and includes a modular web client that uses this JSON for advanced tracking, accessibility analysis, and other utilities.

**[Web Client Live Demo](https://peerinfinity.github.io/Archipelago/)** (Stable Release)

For the latest development version, visit [Archipelago-CC Demo](https://peerinfinity.github.io/Archipelago-CC/)

## About This Repository

**This repository is archived.** Active development continues at [Archipelago-CC](https://github.com/PeerInfinity/Archipelago-CC).

### Why Two Repositories?

- **This repository (PeerInfinity/Archipelago):** Archived stable snapshot. Periodically updated with current files from Archipelago-CC, but without git history. Use this as a clean starting point for your own fork.
- **[Archipelago-CC](https://github.com/PeerInfinity/Archipelago-CC):** Active development repository. The commit history contains large files, making it unsuitable for direct forking if you want a clean upstream relationship.
- **[ArchipelagoMW/Archipelago](https://github.com/ArchipelagoMW/Archipelago):** The main upstream Archipelago project.

### For Contributors

**To contribute to this project:** Submit pull requests to [Archipelago-CC](https://github.com/PeerInfinity/Archipelago-CC).

**To contribute to upstream Archipelago or maintain your own clean fork:** Fork the [main ArchipelagoMW repository](https://github.com/ArchipelagoMW/Archipelago), then copy the relevant files from this repository or Archipelago-CC. See the [diff files documentation](https://github.com/PeerInfinity/Archipelago-CC/tree/main/docs/json/developer/diffs) for details on what has changed from upstream.

---

## Key Features

-   **A Highly-Configurable Web Client:** The entire user interface is built with Golden Layout, allowing you to drag, drop, stack, and resize panels to create a workspace that fits your exact needs.

-   **Standard Tracking Mode:** Connect to an Archipelago server just like a standard client. Load your game's `rules.json` file to enable logic-aware tracking:
    -   View which locations are accessible with your current inventory.
    -   View color-coded accessibility status (Available, Inaccessible, Checked).
    -   Explore visual trees that show the specific rules for any location or exit.
    -   Use the Path Analyzer to determine what items are needed to reach a new region.

-   **Advanced Modules & Game Modes:**
    -   **Text Adventure:** Interact with your game world through a classic text-based interface.
    -   **Iframe & Window Integration:** Host external web applications or game clients directly within a panel or in a separate window, fully connected to the main application's state.
    -   **Archipelago Loops (Incremental Game Mode):** A unique game mode inspired by idle/incremental games. Automate your playthrough, manage resources, and gain persistent knowledge to explore deeper with each loop.

-   **Rule Export System:** A Python-based tool that uses Abstract Syntax Tree (AST) analysis to parse the game logic from any Archipelago world and convert it into a standardized, portable JSON format.

## Documentation

This project contains a full documentation suite for both users and developers.

**[Click here to visit the main Documentation Portal](./docs/json/README.md)**

## Getting Started (For Users)

### Standard Mode

1.  **Generate Your Game:** To get the necessary files, generate your seed using a version of Archipelago that contains the JSON exporter tool. You can download this from this repository or from [Archipelago-CC](https://github.com/PeerInfinity/Archipelago-CC). When you generate a seed, you will get two important files: your `.archipelago` file (for the server) and a `rules.json` file (for this web client).
2.  **Open the Web Client:** [Open the client](https://peerinfinity.github.io/Archipelago/).
3.  **Load Your Rules:** In one of the panels, find the "Presets" tab. At the top, click the "Load JSON File" button and select your `rules.json` file.
4.  **Connect:** In the "Console & Status" panel, enter your server address and click "Connect".

For a more detailed walkthrough, see the [User Quick Start Guide](./docs/json/user/quick-start.md).

For tips, tricks, and FAQs, see [Tips and Tricks](./docs/json/user/tips-and-tricks.md).

## For Developers

The project is composed of two main parts: the Python **exporter** and the modular **frontend web client**.

The frontend is built with modern, vanilla JavaScript (ES6+ Modules), a Web Worker-based State Manager to ensure a responsive UI, and the Golden Layout library for panel management. It features a robust, event-driven architecture that allows for extension.

-   To get started, see the [Developer Getting Started Guide](./docs/json/developer/getting-started.md).
-   To understand the project's structure, read the [System Architecture Overview](./docs/json/developer/architecture.md).
-   To learn how to contribute, review the guides on the [Module System](./docs/json/developer/guides/module-system.md) and [State Management](./docs/json/developer/guides/state-management.md).

## Current Status & Roadmap

See the [Project Roadmap](/docs/json/project-roadmap.md) for the latest status, known issues, and future plans.

## Credits

- Based on the original [Archipelago](https://github.com/ArchipelagoMW/Archipelago) multiworld system.
- Web client interface derived from [ArchipIDLE](https://github.com/LegendaryLinux/archipidle-client).
- Loop mode inspired by games like [Idle Loops](https://github.com/dmchurch/omsi-loops/), Increlution, and Stuck In Time.
- Uses [Golden Layout](https://github.com/golden-layout/golden-layout) for panel management.
- Uses [vanilla-jsoneditor](https://github.com/josdejong/svelte-jsoneditor)
- Uses [json-editor](https://github.com/json-editor/json-editor)
- Uses [CodeMirror](https://github.com/codemirror/codemirror5)
- Uses [Cytoscape.js](https://github.com/cytoscape/cytoscape.js) for graph visualization
- Uses [metamath-py](https://pypi.org/project/metamath-py/) for the MetaMath apworld

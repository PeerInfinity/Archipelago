# Quick Start Guide

This guide will help you get started using the JSON Web Client as an advanced tracker for a standard Archipelago multiworld game.

**[Try the JSON Web Client Live](https://peerinfinity.github.io/Archipelago/)**

## Getting Started (Standard Tracking Mode)

In this mode, you use the client to connect to a multiworld server and track your progress. The client uses a special `rules.json` file to give you detailed, real-time information about what locations you can access with your current items.

### What You Need

When you generate your game, you will receive two key files:

1.  **Your `.archipelago` file:** This contains your world's specific item placements and is used by the server that hosts your game.
2.  **A `rules.json` file:** This file is unique to this project. It contains all the game logic, region connections, and item rules. You will load this file into the JSON Web Client.

To get both files, you must generate your seed using the correct version of the Archipelago source code. You can download it from the [Archipelago JSONExport branch](https://github.com/PeerInfinity/Archipelago/tree/JSONExport).  Make sure you specifically download the JSONExport branch, not the main branch.

### First Steps

1.  **Open the Web Client:** Navigate to the [live web client](https://peerinfinity.github.io/Archipelago/). It will load with a default "A Link to the Past" ruleset, allowing you to explore the interface immediately.

2.  **Explore the Interface:**
    -   **Inventory Panel:** Click on items like "Progressive Sword" or "Hookshot".
    -   **Locations Panel:** Switch to the "Locations" tab and watch how the location cards change color as you acquire items. Green means accessible, red/yellow means not, and black means checked.
    -   The layout is fully customizable. You can drag, drop, and resize panels to your liking.

3.  **Load Your Game's Logic:**
    -   Find the **"Presets"** tab in one of the panels.
    -   At the top of this panel, click the **"Load JSON File"** button.
    -   Select the `rules.json` file that was generated with your game. The client will now use your game's specific logic.

4.  **Connect to the Server:**
    -   In the **"Console & Status"** panel, find the "Server Address" input.
    -   Enter your server's address (e.g., `archipelago.gg:12345`).
    -   Click the **"Connect"** button. You can also use the `/connect` command in the console.

### Basic Interaction

-   **Collecting Items:** When you receive an item in-game, it will automatically be added to your **Inventory** panel, and the accessibility of all locations will update instantly.
-   **Checking Locations:** When you check a location in your actual game, it will be marked as checked (black background) in the client.
-   **Understanding Blockers:** In the **Regions** panel, you can use the **"Analyze Paths"** button to see exactly which items are required to access a new region.

## Next Steps

For more detailed information on the client's features, check out the following guides:

-   **[Standard Client Guide](./standard-client.md)**: A deep dive into all the features available in the standard tracking mode.
-   **[Tips & Tricks](./tips-and-tricks.md)**: A collection of useful console commands, keyboard shortcuts, and answers to common questions.
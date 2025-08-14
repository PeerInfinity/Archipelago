# Standard Client User Guide

This guide provides a detailed walkthrough of the JSON Web Client when used as an advanced tracker and client for Archipelago multiworld games. It uses your game's `rules.json` file to offer insights into location accessibility, helping you understand your world's logic and track your progress.

## Core Concepts

-   **Logic-Aware Tracking:** Unlike a simple item tracker, this client understands your game's rules. When you receive an item, it instantly re-evaluates the entire game world to show you exactly which locations and exits are now accessible.
-   **Customizable Layout:** The interface is built on Golden Layout, a system that allows you to drag, drop, resize, and stack panels to create a workspace that suits your playstyle.

## Getting Started

1.  **Generate Your Game:** When generating your seed, ensure you receive both your `.archipelago` file (for your in-game client) and the corresponding `rules.json` file (for this web client). You must use a version of the Archipelago source code that contains the JSON exporter tool, which can be downloaded from the [Archipelago JSONExport branch](https://github.com/PeerInfinity/Archipelago/tree/JSONExport).  Make sure you specifically download the JSONExport branch, not the main branch.

2.  **Open the Web Client:** Visit the [JSON Web Client](https://peerinfinity.github.io/Archipelago/).

3.  **Load Your Rules:**

    - At the top of the panel in the middle, find the **"Presets"** tab.
    - Click the **"Load JSON File"** button at the top.
    - Select your `rules.json` file. The client will now understand your specific game's logic.

4.  **Connect to the Server:**
    - In the center **"Console & Status"** panel, enter your server address and port (e.g., `archipelago.gg:12345`).
    - Click **"Connect"**. You will see connection status updates in the console.

## Interface Overview

The interface is composed of several panels, which you can rearrange. The default layout is described below.

### Left Panel Stack

#### Inventory Panel

This is your primary tool for tracking items.

- **Adding Items:** Click an item's button to add it to your inventory. If connected to a server, this may send a `!getitem` command.
- **Removing Items:** Hold **SHIFT** and click an item to remove it (this only affects your local tracker state).
- **Progressive Items:** The client correctly handles progressive items (like Swords or Gloves), automatically tracking which version you have.
- **Controls:** Use the checkboxes to hide items you don't own or collapse the category view into a single alphabetized list.

### Center Panel Stack

#### Console & Status Panel

This is your main hub for server interaction and automated checks.

- **Connection Controls:** The server address input and Connect/Disconnect button are at the top.
- **Timer & Progress Bar:** The "Begin" button starts a timer that automatically checks one of your accessible locations at random intervals. The progress bar shows the countdown to the next check. "Quick Check" immediately checks one location.
- **Checks Sent:** This display gives you a summary of your progress (e.g., `Checked: 50/155`).
- **Console:** The text console works just like a standard Archipelago client. You can chat, use `/` commands for the web client (like `/set_delay`), and `!` commands for the server.

### Right Panel Stack

This stack contains several tabbed views for exploring the game world.

#### Locations View

This view displays a grid of every location in your game. Each card shows:

-   **Name & Region:** The location's name and the region it's in. The region name is a clickable link.
-   **Accessibility Status:** The card's color instantly communicates its status:
    -   **Green:** You can reach the location and have the items to access it.
    -   **Red:** The location is completely inaccessible.
    -   **Yellow/Orange:** You can either reach the region but lack items for the location, or you have the items for the location but cannot yet reach its region.
    -   **Blue:** The check for this location is "pending" and awaiting a state update.
    -   **Black:** You have already checked this location.
    -   **Gray:** The client cannot evaluate the logic for this location as either true or false.
-   **Access Rule:** A visual tree shows the exact logic required, with conditions you meet highlighted in green and unmet ones in red.

#### Exits View

This view is similar to the Locations view but shows the connections (exits) between regions. It's useful for understanding how to navigate the world.

#### Regions View

This view organizes the game world by its regions.

- Each region is a collapsible block showing its locations and exits.
- **Analyze Paths:** This button performs a search from your starting region to the target region. It displays all possible paths and analyzes every rule along the way, compiling a list of exactly what you need to make the path fully traversable.

## Key Features Explained

- **Automatic Event Collection:** When a location that contains an Event Item (like Pendants or Crystals in ALTTP) becomes accessible based on your inventory, the client automatically adds that Event Item to your state. This can immediately unlock access to new areas.
- **Live Accessibility Analysis:** The logic trees for locations and exits are not static. They update in real-time as you add items to your inventory, showing you exactly which conditions are passing or failing.
- **Path Discovery:** The "Analyze Paths" feature is your best tool for figuring out what to do next. If you want to get into the "Swamp Palace" region, analyzing it will tell you every item you are missing to do so, across all possible paths.
- **Interactive Navigation:** Throughout the UI, region names are underlined and clickable. Clicking one will switch you to the **Regions** view and scroll directly to that region, allowing you to quickly explore connections.

## Common Questions

**Q: Do I need both the `.archipelago` file and `rules.json`?**
A: Yes. The Archipelago server uses the `.archipelago` file to manage the multiworld session. This web client uses the `rules.json` file for its logic-aware tracking. You need both for the full online experience.

**Q: Can I use this without connecting to a server?**
A: Yes. You can load your `rules.json` file and use the client as an offline tracker. You can manually add items to your inventory and see how accessibility changes.

**Q: How does "Analyze Paths" work?**
A: It performs a search algorithm to find all sequences of connected regions from your starting point to the target. It then examines the access rules for every exit along those paths to determine which items or conditions you are missing to make the entire path accessible.

**Q: What do the different colors on location cards mean?**
A:
-   **Green:** Fully accessible. You can get to the location's region, and you have the items to clear the location itself.
-   **Red:** Fully inaccessible. You can't get to the region, and/or you don't have items for a key part of the path.
-   **Yellow/Orange:** Partially blocked. For example, you can get to the region, but you're missing the specific item(s) to access the location (like being at a dungeon entrance but not having the key).
-   **Blue:** The location check is "pending" and awaiting a state update.
-   **Black:** The location has been checked.
-   **Gray:** The location can't be evaluated as either accessible or inaccessible.
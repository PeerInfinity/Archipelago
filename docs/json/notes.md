# ArchipIDLE Notes & Tips

This document contains useful notes, tips, and clarifications for using the ArchipIDLE web client, especially regarding the interplay between different modes and less obvious features.

## Starting Loop Mode

There are two ways to activate ArchipIDLE Loops:

1.  **Via the Interface:**

    - Visit the main ArchipIDLE page: [https://peerinfinity.github.io/Archipelago/](https://peerinfinity.github.io/Archipelago/)
    - Click the **"Loops"** radio button (near the top right).
    - Click the **"Enter Loop Mode"** button that appears in the controls below the radio buttons.

2.  **Via Direct Link:**
    - Use this URL to load directly into Loop Mode: [https://peerinfinity.github.io/Archipelago/index.html?mode=loop](https://peerinfinity.github.io/Archipelago/index.html?mode=loop)

## Using "Quick Check" and "Begin!" (Automation)

The **`Quick Check`** and **`Begin!`** buttons located in the center console panel offer automation capabilities:

These buttons work in **all modes** (Standard Mode with Loop Mode off, or with Loop Mode on). They also function whether you are connected to an Archipelago server or playing offline.

- **`Quick Check` Button:**
  - Finds the next available, unchecked location based on your current inventory and rules.
  - Simulates clicking on that location's card (see "Clicking Locations & Exits" below for mode-specific behavior).
- **`Begin!` Button:**
  - Starts a timer that automatically triggers the `Quick Check` functionality at fixed or random intervals.
  - The timer delay can be configured using the `/set_delay` console command.
  - Clicking the button again when the timer is running will stop it.

## Console Commands

The console in the center panel accepts commands:

- `/set_delay [min] [max]`: Sets the minimum and maximum delay (in seconds) for the `Begin!` button's timer. Use one number (e.g., `/set_delay 30`) for a fixed delay.
- `/help`: Displays a list of available console commands.

These console commands (and some others listed by `/help`) work even when not connected to a server.

## Clicking Locations & Exits (in Tabs)

How clicking on items in the main **Locations** and **Exits** tabs (right panel) behaves depends on whether Loop Mode is active:

- **Loop Mode OFF (Standard Mode):**

  - Clicking a **Location card**: Performs an immediate check for that location (sends to server if connected, processes locally if offline).
  - Clicking an **Exit card**: Does nothing.

- **Loop Mode ON:**

  - Clicking a **Location card** (Undiscovered): Queues an **Explore action** for that location's region in the Loop Panel.
  - Clicking a **Location card** (Discovered & Accessible): Queues a **Check Location action** for that specific location in the Loop Panel.
  - Clicking an **Exit card** (Undiscovered): Queues an **Explore action** for that exit's region in the Loop Panel.
  - Clicking an **Exit card** (Discovered & Accessible): Queues a **Move action** using that exit in the Loop Panel.

- **Server Connection Impact:**
  - _Connected:_ Location checks and resulting item acquisitions are synced with the Archipelago server.
  - _Disconnected:_ All checks and actions only affect the local data stored in your browser.

## Clickable Links

The underlined Region and Location names are clickable links. Clicking on them will open the Regions panel and scroll to the relevant region.

## Pause Button

If nothing is happening in Loop Mode, that's probably because the game is paused. Press the Resume button to resume the game.

## Other Tips

- **Remove Inventory Item:** Hold **SHIFT** and click an item in the Inventory panel (left) to remove it or decrease its count. This only affects your local state and is mainly used for testing.

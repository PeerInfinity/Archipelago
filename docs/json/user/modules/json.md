# JSON Panel

The JSON panel lets you save, load, and manage all of your app configuration and game state in one place. Use it to back up your progress, transfer a session to another device, or switch between different game setups.

## What You Can Save

Use the checkboxes to choose which items to include in save/load operations. **Check All** and **Uncheck All** are available for convenience.

| Item | What it contains |
|------|-----------------|
| **Rules Config** | The game's logic and location data (rules.json). Saving this lets you fully restore a game on another device or after clearing your browser. |
| **Module Config** | Which panels and modules are loaded (modules.json). |
| **Layout Config** | The arrangement of panels on screen. Layout changes can be applied live or take effect after reloading the page. |
| **User Settings** | Your application preferences (settings.json). |
| **Snapshot (Full State)** | Your complete game state: inventory, checked locations, and reachability data. This is the main thing to save when you want to continue a session later. Checked by default. |
| **Game State (Inv/Checks)** | A minimal version of the above containing only inventory and checked locations. Unchecked by default since Snapshot already covers everything it contains. |

Other modules may add their own entries to this list (for example, the Tests module adds its configuration).

Each item has an **Edit** button that sends that item's data to the Editor panel, where you can inspect, modify, and apply it back with the green **Apply** button.

## Saving and Loading

### Save/Load as a File

- **Save Combined to File** — Downloads the selected data as a `.json` file to your computer. Good for backups or sharing a session with someone else.
- **Load Combined from File** — Opens a `.json` file you previously saved and applies it. Game state, rules, and settings are applied immediately; layout changes are applied live.

### Export/Import via the Editor

- **Export to Text** — Sends the selected data to the [Editor](../editor.md) panel as JSON text, where you can inspect or edit it before applying.
- **Import from Text** — Reads JSON from the Editor panel and applies it. Paste your JSON into the Editor first, then click this button.

### Save to Browser (LocalStorage)

- **Save to LocalStorage** — Saves the selected data under a mode name in your browser. This persists across sessions and is automatically reloaded the next time you open the app. Appears at the top of the panel with a green button.

### Reset Default Mode

- **Reset Default Mode** — Clears the saved default mode from your browser and reloads the app to its base state. Use this if the app becomes stuck or won't load correctly. Appears at the top of the panel with a red button.

## Managing Modes

A "mode" is a named configuration saved in your browser. You can have multiple modes for different games or setups.

- **Known Modes in LocalStorage** — Lists all modes you have saved in your browser. Click **Load** to activate a mode on the next page reload, or **Delete** to remove it permanently.
- **Known Modes in modes.json** — Lists predefined modes that came with the app. Click **Load** to switch to one (reloads the page).

The **Mode Name** field at the top of the panel sets the name used when saving to LocalStorage or in exported files.

## Other Controls

- **Export Live Layout** — Exports detailed layout data to the Editor panel. Useful for debugging panel arrangement issues.

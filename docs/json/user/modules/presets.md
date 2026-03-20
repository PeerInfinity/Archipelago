# Presets Panel

The Presets panel is the primary way to load a game into the application. It lists all predefined game configurations and lets you load custom files from your computer.

## Loading a Preset

The panel displays a list of available games. Each game row shows:

- **Game name**
- **Seed buttons** — Click a seed number to load that preset. Seeds with vanilla item placement are marked with a purple "V" badge.
- **Test badges** — Five mini badges (MS, FS, MC, MW, SF) showing test results for each preset. Hover over a badge for details including pass/fail counts.

Click a seed button to load its rules file. The preset details view shows the available files, and the rules are automatically loaded into the state manager.

## Multiworld Presets

Multiworld seeds have a different layout. Instead of a single seed button, you see individual **player buttons** for each player in the seed (P1, P2, etc.), each showing the player name and game. Click a player button to load that player's specific ruleset.

## Loading a Custom File

Click **Load File** at the top to load a rules file from your computer. The panel accepts:

- **`.json` files** — Parsed directly as a rules configuration.
- **`.archipelago` files** — ZIP archives from Archipelago generation. The panel automatically extracts the `_rules.json` file from the archive.

## After Loading

Once a preset or file is loaded, the game data flows into the state manager and all panels update to reflect the new game — the Regions panel shows the world structure, the Inventory panel shows available items, etc.

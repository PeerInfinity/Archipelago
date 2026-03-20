# Text Adventure Panel

The Text Adventure panel provides a classic text-based interface for navigating the game world. Type commands or click interactive links to move between regions, search locations, and manage your inventory.

## Commands

| Command | Aliases | Description |
|---------|---------|-------------|
| **move \<exit\>** | go, travel | Travel through an exit to another region |
| **check \<location\>** | examine, search | Search a location for items |
| **look** | l | Redisplay the current region |
| **inventory** | inv, items | Show your collected items |
| **help** | ? | Show the command list |

Commands are case-insensitive. You can also type just the target name without a verb — the parser will try to match it against available locations and exits.

## Interactive Links

Location and exit names in the text display are clickable. Their color indicates accessibility:
- **Green** — Accessible (you can use it now)
- **Red** — Inaccessible (missing requirements)

Clicking a location link checks it. Clicking an exit link moves you through it.

## Region Display

When you enter a region, the panel shows:
- The region name
- Available locations you can search (unchecked, accessible ones)
- Already searched locations
- Available exits to other regions

## Custom Data

The dropdown at the top lets you load custom "flavor text" data files that provide game-specific descriptions for regions, locations, and exits instead of the generic defaults.

## Features

- **Partial matching** — You don't need to type the full name; partial matches work (exact matches are prioritized over partial ones).
- **Reverse exits** — The panel shows exits both from and to the current region, supporting bidirectional navigation.
- **Discovery mode** — When discovery mode is active, only discovered locations and exits are shown in the region description.
- **Accessibility checking** — Location checks verify that both the region is reachable and the location's access rule is met before allowing the check.

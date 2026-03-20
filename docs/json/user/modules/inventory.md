# Inventory Panel

The Inventory panel displays all items available in the game and lets you manually add or remove them from your collection.

## Controls

| Checkbox | Default | Description |
|----------|---------|-------------|
| **Hide unowned items** | On | Hides items you don't have, showing only collected items |
| **Hide categories** | Off | Switches from grouped view to a single flat list |
| **Sort alphabetically** | Off | Sorts items alphabetically within their groups |

## Display Modes

### Grouped View (Default)

Items are organized into collapsible categories defined by the game (e.g., "Swords", "Dungeon Items"). An "Events" category is automatically created for event-type items. The "Everything" category appears first when present.

### Flat View

When **Hide categories** is checked, all items appear in a single alphabetical list with no group headings.

## Item Buttons

Each item is shown as a clickable button:

- **Active items** (count > 0) are visually highlighted.
- Items with a count greater than 1 show a **count badge**.
- Hover over a button to see the item's full name and any additional labels in the tooltip.

### Display Labels

By default, each button shows the item name. Additional label fields (label1, label2) can be enabled via the application settings to show alternative item identifiers.

## Interactions

| Action | Effect |
|--------|--------|
| **Click** | Add one of this item to your inventory |
| **Shift+Click** | Remove one of this item from your inventory |

Item clicks are dispatched through the event system, so other modules (like a connected server client) can intercept and handle them appropriately.

## Live Updates

The inventory display updates automatically whenever the game state changes — whether from your own clicks, a connected server, or another module modifying the state.

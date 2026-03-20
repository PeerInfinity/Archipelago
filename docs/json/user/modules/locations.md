# Locations Panel

The Locations panel shows a grid of all item locations in the game, providing a real-time view of which locations you can reach based on your current items.

## Controls

- **Search** — Filter locations by name or region name.
- **Sort** — Choose from Original Order, Sort by Name, Sort by Accessibility (Original) (default), or Sort by Accessibility (Name).
- **Filter checkboxes**:
  - **Show Checked** — Locations already checked (default: off)
  - **Show Pending** — Locations waiting for confirmation (default: on)
  - **Show Reachable** — Accessible locations (default: on)
  - **Show Unreachable** — Inaccessible locations (default: on)
  - **Show Explored** / **Show Undiscovered** — Discovery mode filters (only visible when discovery mode is active)
- **Column controls** — Adjust the grid from 1 to 10 columns using the +/- buttons.

## Location Cards

Each location appears as a card showing:

- **Location name** (and optional label fields if enabled in settings)
- **Item at location** (if enabled in settings and item data is available)
- **Region** — Clickable link to the parent region in the [Regions](regions.md) panel
- **Dungeon** — If the location is in a dungeon, a clickable link to the [Dungeons](dungeons.md) panel
- **Access rule** — A logic tree showing conditions, with met items in green and missing items in red
- **Status text** — Human-readable accessibility summary

### Status Colors

| Color | Status | Meaning |
|-------|--------|---------|
| **Green** | Available | Region is accessible and location rule passes |
| **Yellow** | Region accessible, rule fails | You can reach the region but don't meet the location's requirements |
| **Orange** | Rule met, region inaccessible | You have the items but can't reach the region yet |
| **Red** | Fully unreachable | Neither the region nor the rule requirements are met |
| **Gray** | Checked | Location has already been checked |
| **Blue** | Pending | You clicked to check, waiting for confirmation |

## Interactions

**Click a location card** to check it. The card turns blue (pending) until the check is confirmed by the state manager. If the check is rejected (e.g., the location became inaccessible), the pending state is cleared.

**Click a region link** to navigate to that region in the Regions panel.

**Click a dungeon link** to open the Dungeons panel and navigate to that dungeon.

## Discovery Mode

When discovery mode is active, undiscovered locations are either hidden entirely or shown as "???" placeholders depending on the [Discovery](discoveryPanel.md) panel settings. Additional filter checkboxes appear to toggle discovered/undiscovered visibility.

# Exits Panel

The Exits panel shows every region exit (transition between regions) in the game, with real-time accessibility status and the logic required to traverse each one.

## Controls

- **Search** — Filter exits by name, source region, or destination region.
- **Sort** — Choose from Original Order, Sort by Name, Sort by Accessibility (Original), or Sort by Accessibility (Name).
- **Filter checkboxes**:
  - **Show Traversable** — Exits where all conditions are met (default: on)
  - **Show Non-Traversable** — Exits where any condition fails (default: on)
  - **Show Explored** — Discovered exits in discovery mode (only visible when discovery mode is active)
  - **Show Undiscovered** — Undiscovered exits in discovery mode (only visible when discovery mode is active)
- **Column controls** — Adjust the grid from 1 to 10 columns using the +/- buttons.

## Exit Cards

Each exit is displayed as a card showing:

- **Exit name**
- **From** — The source region (clickable link to the [Regions](regions.md) panel) with accessibility indicator
- **To** — The destination region (clickable link) with accessibility indicator
- **Rule** — A logic tree showing the access rule, with met conditions in green and unmet in red
- **Status** — A text label describing the exit's state

### Status Colors

| Status | Meaning |
|--------|---------|
| **Green** (Traversable) | Source region reachable, rule passes, destination reachable |
| **Red** (Non-traversable) | One or more conditions fail — rule fails, source locked, or destination locked |
| **Gray** (Unknown) | Accessibility cannot be determined |

## Interactions

**Click an exit card** to trigger an exit click event. In loop mode, this is handled by the loop system. Otherwise, it's picked up by the Regions module for navigation.

Region name links within exit cards navigate to that region in the Regions panel.

## Discovery Mode

When discovery mode is active, additional filter checkboxes appear. Undiscovered exits show as "???" placeholders with minimal information (unless the "Show Undiscovered Details" setting is enabled in the [Discovery](discoveryPanel.md) panel).

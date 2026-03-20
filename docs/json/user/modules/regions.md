# Regions Panel

The Regions panel is the primary tool for exploring the game world. It shows regions as collapsible blocks containing their entrances, exits, and locations, with real-time accessibility coloring.

## Display Modes

### Navigation Mode (Default)

Shows the regions you've visited as a path chain. Only the most recent region is expanded. As you move through exits, new regions are appended to the path. You can click earlier regions in the path to navigate backwards.

### Show All Regions

Check **Show All Regions** to display every region in the game at once, sorted and filtered by the controls below. Useful for reviewing the full map or jumping to a specific region.

### Show Paths

When enabled (default), the full path history is visible. Uncheck to show only the current region for a cleaner view.

## Controls

- **Search** — Filter regions by name.
- **Sort** — Original Order, Alphabetical, Sort by Accessibility (Original), or Sort by Accessibility (Name).
- **Show Reachable / Show Unreachable** — Filter by accessibility status.
- **Show All Regions** — Toggle between navigation mode and full-map mode.
- **Show Paths** — Toggle path history visibility.
- **Show Undiscovered** — Discovery mode filter (only visible when discovery mode is active).
- **Expand All / Collapse All** — Toggle all region blocks.

### Visibility Toggles

Control which sections appear inside each region block:
- **Show Entrances** — Entrances into this region from other regions
- **Show Exits** — Exits leading out of this region
- **Show Locations** — Item locations within this region
- **Show Logic Trees** — Access rule details for exits and locations

### Section Order

Change the order of sections within each region block (e.g., "Exits, Locations, Entrances" vs. "Locations, Exits, Entrances") via the section order dropdown.

## Region Blocks

Each region block contains:

- **Header** — Region name with accessibility color-coding. Click to expand/collapse.
- **Entrances** — Connections from other regions into this one, with access rules.
- **Exits** — Connections to other regions. Each exit shows the destination as a clickable link and an access rule logic tree. Click an exit to move through it (in navigation mode) or navigate to the destination (in show-all mode).
- **Locations** — Items available in this region. Each shows its access rule. Click to check a location.

## Interactions

| Action | Effect |
|--------|--------|
| **Click exit** | Move to the destination region (navigation mode) or navigate to it (show-all mode) |
| **Click location** | Check the location if its access rule is met |
| **Click region link** | Navigate to that region and expand it |
| **Click dungeon link** | Open the [Dungeons](dungeons.md) panel |

## Cross-Panel Navigation

Other panels can send you to a specific region — when they do, the Regions panel activates, switches to show-all mode if needed, expands the target region, scrolls it into view, and briefly highlights it. The same works for navigating to a specific location within a region.

## Discovery Mode

When discovery mode is active, undiscovered items are hidden or shown as placeholders depending on the [Discovery](discoveryPanel.md) panel settings. Expanding a region header can optionally discover that region (if "Click Discovers Region" is enabled).

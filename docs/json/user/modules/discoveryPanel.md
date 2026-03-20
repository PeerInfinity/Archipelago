# Discovery Panel

The Discovery panel controls discovery mode — a feature that hides parts of the game world until you explore them, simulating a blind playthrough where you don't know the full map.

## Settings

### Main Settings

| Setting | Description |
|---------|-------------|
| **Enable Discovery Mode** | Master toggle. When on, only discovered regions, locations, and exits are shown across all panels. |
| **Region Discovery Trigger** | When to mark a region as discovered: "When the region is first entered" or "When an exit leading to the region is discovered". |
| **Auto-discover Locations** | Automatically discover all locations in a region when that region is discovered. |
| **Auto-discover Exits** | Automatically discover all exits from a region when that region is discovered. |
| **Items in Undiscovered Regions** | Choose "Hide entirely" to remove undiscovered items from view, or "Show as '???'" to show placeholders. |
| **Show Undiscovered Region Names** | Show actual names instead of "???" for undiscovered regions that have a discovered exit leading to them. |
| **Click Discovers Region** | Clicking an undiscovered region in the Region Graph or Regions panel automatically discovers it. |
| **Disable Location Check UI** | Prevent location check actions when clicking locations (useful for entrance shuffle exploration). |
| **Show Debug Options** | Reveal the debug settings and discovery state lists below. |

### Debug Settings (Hidden by Default)

These appear when **Show Debug Options** is enabled:

| Setting | Description |
|---------|-------------|
| **Click Discovers Location** | Clicking an undiscovered location automatically discovers it. |
| **Show Undiscovered Details** | Show full details (region, rules, status) for undiscovered locations instead of minimal "???" info. |

## Discovery State Lists

When debug options are shown, three collapsible sections display everything that has been discovered:

- **Discovered Regions** — Checkboxes for each region. Start regions are shown in blue and cannot be unchecked. Discovered regions are green; undiscovered are gray. Shows "X / Y discovered" count.
- **Discovered Locations** — Checkboxes for each location with the same green/gray coloring and count.
- **Discovered Exits** — Checkboxes grouped by source region, showing each exit as "exitName -> connectedRegion".

Toggle any checkbox to manually mark items as discovered or undiscovered.

## Reset

The **Reset All Discoveries** button at the bottom clears all discovery state (with a confirmation dialog). This returns everything to the undiscovered starting state.

## How Other Panels Are Affected

When discovery mode is enabled:
- **Regions** and **Locations** panels hide or show placeholders for undiscovered items.
- **Region Graph** hides undiscovered nodes or shows them as "???".
- **Exits** panel filters by discovered/undiscovered state.
- **Text Adventure** only shows discovered locations and exits.

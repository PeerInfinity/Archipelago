# Discovery Panel Module

**Module ID:** `discoveryPanel`

**Purpose:** Provides a UI panel for managing discovery mode settings and displaying discovered items. Allows users to enable/configure discovery mode, view lists of discovered regions/locations/exits, and perform debug operations.

## Key Files

- `frontend/modules/discoveryPanel/index.js` - Module entry point and registration
- `frontend/modules/discoveryPanel/discoveryPanelUI.js` - UI component implementation

## Responsibilities

- **Discovery Mode Toggle:** Checkbox to enable/disable discovery mode
- **Region Discovery Settings:** Configure when regions are marked discovered (on enter or when an exit is discovered)
- **Auto-Discovery Options:** Automatically discover locations and exits when regions are entered
- **Undiscovered Display Settings:** Choose how undiscovered items appear (hidden or placeholders)
- **Additional Settings:** Show undiscovered region names, click-to-discover region, disable location check UI
- **Debug Settings Section:** Hidden by default, toggled via "Show Debug Options". Contains click-to-discover location and show undiscovered details settings.
- **Discovered Items Display:** Shows organized lists of discovered regions, locations, and exits (within the debug container, visible when debug options are shown)
- **Section Collapsing:** Collapse/expand sections for regions, locations, and exits
- **Reset Action:** "Reset All Discoveries" button at the bottom with confirmation dialog
- **Settings Persistence:** Loads/saves discovery settings to settings manager
- **Real-Time Updates:** Updates UI when discovery state changes

## Events Published

This module does not publish any events directly. It calls `settingsManager.updateSetting()` and `discoveryStateSingleton` toggle methods which trigger events elsewhere.

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `app:readyForUiDataLoad` | Defers initialization until app is ready |
| `discovery:changed` | Refreshes displayed lists when discovery state changes (debounced 100ms) |
| `settings:changed` | Reloads all `moduleSettings.discovery.*` settings and updates UI |
| `stateManager:rulesLoaded` | Refreshes display when new rules are loaded (debounced 100ms) |

## Public Functions

This module does not register public functions. It is purely a UI panel component.

## Dependencies & Interactions

- **`discoveryStateSingleton`:** Queries discovery state; calls toggle methods for individual items and reset
- **`stateManager`:** Gets current game data (regions, locations, exits)
- **`settingsManager`:** Loads and persists discovery mode settings
- **`eventBus`:** Subscribes to discovery and state manager events
- **`commonUI`:** Uses debounce utility for performance

## UI Sections

### Settings Section

Controls for discovery mode behavior:

- **Enable Discovery Mode** - Master toggle (Yes/No radio buttons)
- **Region Discovery Trigger** - "When the region is first entered" (`onEnter`) or "When an exit leading to the region is discovered" (`onExitDiscovered`)
- **Auto-discover Locations** - Mark locations when region discovered
- **Auto-discover Exits** - Mark exits when region discovered
- **Items in Undiscovered Regions** - "Hide entirely" (`hidden`) or "Show as '???'" (`placeholder`)
- **Show Undiscovered Region Names** - Show real names instead of "???" for regions with discovered exits leading to them
- **Click Discovers Region** - Clicking an undiscovered region discovers it
- **Disable Location Check UI** - Prevent location check actions on click
- **Show Debug Options** - Toggle debug settings and discovery state lists

### Debug Settings (Hidden by Default)

Visible when "Show Debug Options" is enabled:

- **Click Discovers Location** - Clicking an undiscovered location discovers it
- **Show Undiscovered Details** - Show full details for undiscovered locations

### Discovered Regions

Lists all regions with checkboxes:
- Blue + bold: Start regions (cannot be unchecked)
- Green: Discovered regions
- Gray: Undiscovered regions
- Shows "X / Y discovered" count

### Discovered Locations

Lists all locations with checkboxes:
- Green: Discovered locations
- Gray: Undiscovered locations
- Shows "X / Y discovered" count

### Discovered Exits

Lists discovered exits grouped by source region:
- Shows source → target region connection as "exitName -> connectedRegion"
- Green: Discovered exits
- Gray: Undiscovered exits
- Shows "X / Y discovered" count

### Actions Bar

- **Reset All Discoveries** button (red styling, confirmation dialog before executing)

## Settings Keys

The module manages these settings under the `moduleSettings.discovery.*` prefix:

| Setting | Default | Type | Description |
|---------|---------|------|-------------|
| `enableDiscoveryMode` | `false` | Boolean | Master enable/disable |
| `regionDiscoveryTrigger` | `'onEnter'` | String | When regions are discovered |
| `autoDiscoverLocations` | `false` | Boolean | Auto-discover locations |
| `autoDiscoverExits` | `false` | Boolean | Auto-discover exits |
| `undiscoveredDisplay` | `'hidden'` | String | How to show undiscovered items |
| `showDebugOptions` | `true` | Boolean | Show debug settings and lists |
| `clickDiscoversLocation` | `true` | Boolean | Click marks location discovered |
| `clickDiscoversRegion` | `false` | Boolean | Click marks region discovered |
| `disableLocationCheckUI` | `false` | Boolean | Prevent location check on click |
| `showUndiscoveredDetails` | `false` | Boolean | Show full details for undiscovered |
| `showUndiscoveredRegionNames` | `false` | Boolean | Show names for regions with discovered exits |

## Integration with Discovery System

The Discovery Panel is the primary UI for the discovery feature:

1. **Discovery Module** (`discovery`) - Core state management for discovered items
2. **Discovery Panel** (`discoveryPanel`) - This module; UI for settings and display
3. **Region Graph** - Respects discovery mode for node visibility
4. **Locations Panel** - Respects discovery mode for location visibility
5. **Exits Panel** - Respects discovery mode for exit visibility
6. **Regions Panel** - Respects discovery mode for region/location/exit visibility
7. **Text Adventure** - Respects discovery mode for descriptions

When discovery mode is enabled:
- Only discovered regions appear in navigation
- Only discovered locations can be checked
- Undiscovered items show as "???" or are hidden based on settings

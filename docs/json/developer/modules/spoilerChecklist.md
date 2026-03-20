# Spoiler Checklist Module

**Module ID:** `spoilerChecklist`

**Purpose:** Displays sphere log data as an interactive checklist, allowing users to track item collection progress across game worlds. Supports multiworld scenarios with cross-player items.

## Key Files

- `frontend/modules/spoilerChecklist/index.js` - Module entry point and registration
- `frontend/modules/spoilerChecklist/spoilerChecklistUI.js` - Panel UI component

## Responsibilities

- **Sphere Display:** Shows sphere log data organized by progression spheres
- **Progress Tracking:** Checkboxes for marking locations as completed
- **Multiworld Support:** Displays cross-player locations with distinct styling
- **Section Organization:** Groups spheres into completed, current, and future sections
- **Search/Filter:** Filter locations by name

## Events Published

| Event | Target | Description |
|-------|--------|-------------|
| `user:locationCheck` | Via dispatcher | When a location checkbox is toggled |

## Events Subscribed To

| Event | Handler |
|-------|---------|
| `app:readyForUiDataLoad` | Initializes checklist on app startup |

## Public Functions

This module does not register public functions. It is a UI panel component.

## Dependencies & Interactions

- **`stateManager`:** Gets game snapshots and location data
- **`ruleEngine`:** Evaluates rules via `evaluateRule()`
- **`snapshotInterface`:** Creates snapshot interface
- **`settingsManager`:** Gets display settings
- **`eventBus`:** Subscribes to app ready event
- **`eventDispatcher`:** Dispatches location check events

## UI Features

### Sphere Sections

Sections are color-coded by status:
- **Completed:** Dark background (1e1e1e) - all locations checked
- **Current:** Green tint (2d3d2d) - in-progress sphere
- **Future:** Red tint (3d2d2d) - not yet accessible

### Location Rows

Each location row shows:
- **Checkbox:** Mark location as checked/unchecked
- **Location Name:** The location identifier
- **Region** (optional): Parent region when disambiguation needed
- **Item** (optional): Item found at location

### Cross-Player Items

In multiworld, locations for other players are displayed with:
- Purple region names
- Dimmed row styling
- Non-interactive (read-only)

### Controls

- **Expand/Collapse:** Toggle sphere section visibility
- **Show Region Column:** Toggle when multiple regions have same location name
- **Show Item Column:** Toggle item display
- **Search:** Filter locations by name

## Styling

```css
/* Section backgrounds */
.sphere-section-completed { background: #1e1e1e; }
.sphere-section-current { background: #2d3d2d; }
.sphere-section-future { background: #3d2d2d; }

/* Cross-player styling */
.cross-player-row { opacity: 0.6; }
.cross-player-region { color: purple; }
```

## Usage

The spoiler checklist is most useful when:
1. A sphere log is loaded for the current game
2. You want to track progress through the logical progression
3. Playing multiworld and need to see items for other players

The checklist automatically updates when:
- Game state changes (locations checked)
- New rules/sphere log is loaded
- Settings change (display options)

# Desktop and Mobile Layout

The frontend supports two distinct layout modes: a **desktop layout** using Golden Layout for a multi-panel dockable interface, and a **mobile layout** using a tab-based single-panel view with column navigation. The application automatically detects which mode to use at startup.

## Device Detection and Layout Selection

Layout mode is determined in `frontend/app/initialization/layoutManager.js` via `determineLayoutMode()`:

1. **URL parameter override** (highest priority):
   - `?layout=mobile` forces mobile layout
   - `?layout=desktop` forces desktop layout

2. **Auto-detection** (when no URL parameter is set):
   - Viewport width: `window.matchMedia('(max-width: 768px)')`
   - Touch capability: `'ontouchstart' in window || navigator.maxTouchPoints > 0`
   - Mobile layout is used if **either** condition is true

Once determined, the choice is applied by adding a CSS class to `<body>`:
- `body.desktop-layout-active` - desktop mode
- `body.mobile-layout-active` - mobile mode

These classes control which layout container is visible and which is hidden.

## Desktop Layout

**Implementation:** `frontend/app/layout/desktopLayout.js`

The desktop layout uses [Golden Layout](https://golden-layout.com/), a web-based window manager that provides a dockable, multi-panel interface.

### How It Works

1. A `GoldenLayout` instance is created and attached to the `#goldenlayout-container` DOM element
2. All panel components registered in the `centralRegistry` are registered with Golden Layout as component factories
3. A layout configuration is loaded from `layout-configs/layout_presets.json` (filtered by enabled modules)
4. The `PanelManager` is initialized to provide a runtime API for panel activation and creation

### Panel Arrangement

Panels are organized into **stacks** (tabbed groups) arranged in **rows** and **columns**. Users can drag, drop, resize, and rearrange panels. The layout is persisted to `localStorage`.

### Layout Presets (`layout-configs/layout_presets.json`)

The file defines named presets. Each preset specifies a tree of rows, columns, and stacks:

**`default` preset** - 3-column layout:

| Column | Width | Panels |
|--------|-------|--------|
| Left stack | 20% | Inventory, Spoiler Checklist, JSON, Modules, Tests, Events |
| Middle stack | 35% | Console, Region Graph, Timer, Presets, Editor, Editor (CM6), Settings, Path Analyzer, Spoiler Test, Player State, Discovery, Progress Bars, Meta Game, Iframe Manager, Window Manager, Rule Converter |
| Right stack | 45% | Regions, Locations, Exits, Helpers, Dungeons, Loops, Text Adventure, Iframe Panel, Window Panel |

**`compact` preset** - 2-column layout:

| Column | Width | Panels |
|--------|-------|--------|
| Left stack | 50% | Console, Inventory |
| Right stack | 50% | Locations, Regions |

The active preset is selected via the `activeLayout` application setting (defaults to `"default"`).

### Key Features

- **Drag-and-drop** panel rearrangement
- **Resizable** columns and rows
- **Tabbed stacks** for grouping panels
- **Layout persistence** via `localStorage`
- **Module filtering** - disabled modules are removed from the layout before loading

## Mobile Layout

**Implementation:** `frontend/app/core/mobileLayoutManager.js`
**Styles:** `frontend/styles/mobile.css`

The mobile layout replaces the multi-panel Golden Layout with a single-panel view and a bottom navigation bar.

### How It Works

1. The `MobileLayoutManager` (a singleton) receives all panel component registrations
2. On `initialize()`, it builds a mobile-specific DOM structure:
   - A **content area** that fills the viewport (minus the bottom bar)
   - A **bottom bar** with left/right navigation buttons and a scrollable tab bar
3. All registered panels are created synchronously at startup (matching desktop behavior so event subscriptions work correctly)
4. Only one panel is visible at a time; switching panels hides all others and shows the selected one

### Column Navigation

The mobile layout preserves the desktop's column grouping concept. Panels are organized into the same columns defined in `layout-configs/layout_presets.json`:

- The **tab bar** shows tabs only for panels in the **current column**
- **Left/right arrow buttons** switch between columns
- Each column remembers its last active panel
- On first load, the **middle column** is shown with its first panel active

### DOM Structure

```
.mobile-layout-container
  .mobile-panel-content          (full viewport, holds all panel instances)
    .mobile-panel-instance       (one per panel, absolutely positioned, display toggled)
  .mobile-bottom-bar             (fixed at bottom)
    .mobile-nav-btn.mobile-nav-left   (column left arrow)
    .mobile-tab-bar              (horizontally scrollable tabs for current column)
      .mobile-tab                (one per panel in current column)
        .mobile-tab-icon
        .mobile-tab-label
    .mobile-nav-btn.mobile-nav-right  (column right arrow)
```

### Mock Container

Since panels expect a Golden Layout container object, the mobile layout manager creates a **mock container** for each panel with:
- `element` - the panel's DOM element
- `width` / `height` - content area dimensions
- `on(event, handler)` - event listener (supports `'destroy'`)
- `emit(event)` - event emitter

This allows panel classes to work identically in both layout modes.

### Key Features

- **Single-panel view** - one panel visible at a time
- **Bottom tab bar** - scrollable, with auto-scroll to active tab
- **Column navigation** - left/right arrows to switch panel groups
- **Orientation handling** - listens for `orientationchange` and calls `onResize()` on the active panel
- **Touch-friendly** - all interactive elements meet 44px minimum touch target size

## Responsive CSS Breakpoints

Defined in `frontend/styles/mobile.css`:

| Breakpoint | Condition | Layout |
|------------|-----------|--------|
| Phone | `max-width: 768px` | Mobile layout, 60px bottom bar, single-column grids |
| Phone landscape | `max-width: 768px` + `orientation: landscape` | Mobile layout, 50px bottom bar, smaller tabs |
| Tablet (touch) | `769px - 1024px` + `pointer: coarse` | Mobile layout, 70px bottom bar, larger tabs, 2-column grids |
| Desktop | `> 1024px` or non-touch | Golden Layout, multi-panel dockable interface |

### Touch-Friendly Adjustments (Mobile)

- Buttons and inputs: minimum height 44px, font-size 16px (prevents iOS auto-zoom)
- Checkboxes and radio buttons: minimum 24px
- Grid layouts collapse to single column on phones, 2-column on tablets
- Body scroll is disabled (`overflow: hidden; position: fixed`) to prevent scroll conflicts
- Smooth touch scrolling via `-webkit-overflow-scrolling: touch`

## Layout Mode Visibility

The two modes are mutually exclusive via CSS:

```css
/* When mobile is active, hide Golden Layout */
body.mobile-layout-active .lm_goldenlayout {
  display: none !important;
}

/* When desktop is active, hide mobile elements */
body.desktop-layout-active .mobile-layout-container,
body.desktop-layout-active .mobile-tab-bar {
  display: none !important;
}
```

## Architecture Diagram

```
                    layoutManager.js
                    determineLayoutMode()
                          |
              +-----------+-----------+
              |                       |
         Desktop Mode            Mobile Mode
              |                       |
    desktopLayout.js      mobileLayoutManager.js
              |                       |
    Golden Layout instance    MobileLayoutManager
    + PanelManager                    |
              |               Bottom tab bar
    Dockable multi-panel      + column navigation
    drag/drop interface       + single panel view
              |                       |
  layout-configs/             layout-configs/
      layout_presets.json     layout_presets.json
         (panel arrangement)     (column grouping)
```

## Related Documentation

- **[UI and Layout System](./ui-and-layout.md)** - Golden Layout integration and panel component pattern
- **[Creating Modules](./creating-modules.md)** - How to build modules with UI panels
- **[Architecture](../architecture.md)** - Overall system architecture

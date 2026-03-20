# Region Graph Panel

The Region Graph provides an interactive visual map of the game world using a node-and-edge graph. Regions appear as nodes, exits as directional edges, and the display updates in real time as your accessibility changes.

## Graph Display

- **Region nodes** — Rectangular nodes showing the region name. Hub regions (with many connections) are drawn larger.
- **Location nodes** — Smaller nodes around their parent region, visible at higher zoom levels.
- **Player marker** — A blue dot showing your current position.
- **Edges** — Directional arrows between regions. Bidirectional exits show arrows on both ends.

### Color Coding

| Color | Meaning |
|-------|---------|
| **Green border** | Region or exit is accessible |
| **Dark green fill** | All locations in this region are accessible |
| **Gold fill** | Mix of accessible and inaccessible locations |
| **Red fill** | All locations inaccessible |
| **Black fill, green border** | All locations checked (completed) |
| **Gray** | Inaccessible region or exit |
| **Purple border** | Region is in the current path |
| **Yellow border** | Current region (player location) |

### Zoom-Based Detail

The graph adjusts detail based on zoom level. Zooming in progressively reveals:
1. Region names
2. Location counts (checked/accessible/inaccessible out of total)
3. Edge labels
4. Location nodes
5. Location labels

## Controls

Click the +/- toggle at the top to expand the control panel:

### Main Controls
- **Reset View** — Zoom to fit all nodes
- **Re-layout** — Recalculate node positions using the layout algorithm
- **Export Positions** — Download current node positions as a JSON file

### Location Visibility
- **Always show/hide locations** — Override zoom-based location visibility
- **Max location nodes** — Limit the number of location nodes rendered (0 = unlimited)
- **Keep region sets complete** — Allow exceeding the limit to avoid splitting a region's locations
- **Only show locations in view** — Only render location nodes within the current viewport
- **Viewport stabilize delay** — Debounce delay before refreshing viewport-filtered locations

### Region Click Behavior
Configure what happens when you click a region node:
- **Move player one step towards region** — Pathfinding moves you one exit closer
- **Move player directly to region** — Teleport directly
- **Show region in Regions panel** — Open the [Regions](regions.md) panel and navigate to it
- **Add to path / Overwrite path** — Append or replace the player path
- **Add locations to path** — Include location checks when clicking location nodes
- **Check all locations in region** — Auto-check all accessible locations

### Discovery Mode
When discovery mode is active, a checkbox appears to show or hide undiscovered regions and exits.

## Interactions

| Action | Effect |
|--------|--------|
| **Click region node** | Executes the enabled click behaviors above |
| **Click location node** | Checks the location (or adds to path if that option is enabled) |
| **Drag a region node** | Reposition it manually (positions persist until re-layout) |
| **Scroll/pinch** | Zoom in and out |
| **Click and drag background** | Pan the view |

## Layout

The graph uses the COSE (Compound Spring Embedder) layout algorithm to automatically position nodes. You can manually drag nodes to adjust positions after the layout runs. Use **Re-layout** to recalculate positions, or **Export Positions** to save your arrangement.

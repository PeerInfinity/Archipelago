# Editor Panel

The Editor panel lets you view and edit the raw JSON data that powers the application. It works closely with the [JSON Panel](json.md) — the JSON panel's **Edit** buttons send data here, and the Editor's **Apply** button pushes your changes back into the running application.

There are two editor implementations: a simple textarea version and a CodeMirror 6 version with syntax highlighting, code folding, and bracket matching. Both share the same data sources and controls; only the editing experience differs.

## Data Sources

Use the dropdown at the top of the panel to switch between sources:

| Source | Description | Editable |
|--------|-------------|----------|
| **Active Rules JSON** | The game rules currently loaded in the state manager. This is the core data that defines regions, locations, items, and logic. | Yes |
| **Loaded Mode Data** | The complete mode configuration assembled at startup, including rules, settings, layout, and module config. Includes comments showing where each part was loaded from. | Yes |
| **Data for Export** | Data sent here from the JSON panel via **Export to Text** or individual **Edit** buttons. | Yes |
| **metaGame js file** | MetaGame JavaScript configuration files sent from the MetaGame panel. | Yes |
| **Latest Snapshot** | The current game state snapshot from the state manager — inventory, checked locations, and reachability data. | Yes |
| **Static Data** | Read-only view of the state manager's static data (location definitions, region structure, etc.). | No |
| **Command Queue Status** | Read-only view of pending commands in the state manager's worker queue. | No |

## Controls

### Apply (Green Button)

The green **Apply** button applies your edits to the running application without reloading the page. You can also press **Ctrl+Enter** as a shortcut.

What Apply does depends on the current source:

- **Active Rules JSON** — Reloads the rules into the state manager, recalculating all accessibility.
- **Loaded Mode Data** — Saves the edited mode data to localStorage and reloads the page.
- **Data for Export** — Applies each section of the data live: rules are reloaded, settings are updated, layout is applied (panels rearrange), and module data is applied where supported.
- **metaGame js file** — Extracts and applies the metaGame configuration.
- **Latest Snapshot** — Applies the edited snapshot to the state manager.

The Apply button is hidden for read-only sources (Static Data, Command Queue).

### Update Now

Manually refreshes the current data source. Useful for the Latest Snapshot, Static Data, and Command Queue sources which can change over time.

### Auto-Update Checkbox

When enabled, the editor automatically refreshes its content whenever the underlying data changes. Most useful when viewing the Latest Snapshot to see real-time state changes.

### Fold All / Unfold All (CodeMirror 6 only)

Collapse or expand all JSON structure sections. Useful for navigating large data objects.

## Typical Workflows

### Editing a Single Data Section

1. In the JSON panel, click the **Edit** button next to the item you want to change (e.g., Layout Config, User Settings).
2. The Editor panel activates and shows that section's data.
3. Make your changes in the editor.
4. Click **Apply** (or press Ctrl+Enter) to apply the changes live.

### Editing the Full Export

1. In the JSON panel, select the checkboxes for the data you want, then click **Export to Text**.
2. The Editor panel activates with all selected data combined.
3. Edit as needed, then click **Apply** to apply everything at once.

### Inspecting Game State

1. Select **Latest Snapshot** from the dropdown.
2. Enable **Auto-Update** to see changes in real time as you play.
3. Use **Update Now** for a one-time refresh.

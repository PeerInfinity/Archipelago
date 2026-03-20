# Helpers Panel

The Helpers panel displays game helper functions — reusable logic building blocks that are referenced by location and exit rules. This panel lets you inspect how they work and test them with different parameter values.

## Controls

- **Search** — Filter helpers by name.
- **Expand All / Collapse All** — Toggle all helper blocks open or closed.

## Helper Blocks

Each helper appears as a collapsible block. When expanded, it shows:

### Parameters

If the helper takes parameters, input fields appear for each one:
- **Boolean** — Checkbox toggle
- **Number** — Numeric input field
- **String** — Text input field

Default values are pre-filled when available. If no explicit default exists, the panel scans the game rules to find example values that are actually used with this helper.

Changing a parameter value immediately re-evaluates the helper.

### Result

A color-coded box shows the current evaluation result:

| Result | Color | Meaning |
|--------|-------|---------|
| **true** | Green | Helper condition is met |
| **false** | Red | Helper condition is not met |
| **needs params** | Gray | Required parameters haven't been provided yet |
| **error** | Dark red | An error occurred during evaluation |
| *numeric value* | Blue | Helper returns a count rather than true/false |

### Implementation

The helper's rule body is displayed as an expandable logic tree, showing its internal structure with the same green/red color-coding used elsewhere for met/unmet conditions.

## Live Updates

Helper evaluations update automatically when your inventory changes. If a helper depends on having a specific item, collecting that item will immediately change the result.

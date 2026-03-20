# Spoiler Checklist Panel

The Spoiler Checklist shows sphere log data as an interactive checklist, letting you track item collection progress through the game's logical progression.

## What Are Spheres?

A sphere log divides the game into layers of progression. Sphere 0 contains everything available from the start. Sphere 1 contains what becomes available after collecting Sphere 0 items, and so on. Each sphere may contain fractional sub-spheres for finer ordering.

## Display

Locations are organized into collapsible sphere sections, each color-coded by status:

| Color | Meaning |
|-------|---------|
| **Dark background** | Completed — all locations in this sphere are checked |
| **Green tint** | Current — the sphere you're working through |
| **Red tint** | Future — not yet accessible |

Each location row shows:
- **Checkbox** — Mark the location as checked
- **Location name** — Click to check (same as the checkbox)
- **Region** (optional column) — Shown when multiple regions have locations with the same name
- **Item** (optional column) — The item found at this location

## Controls

- **Show Region Column** — Toggle the region name display
- **Show Item Column** — Toggle the item display (auto-shows when a location is checked)
- **Search** — Filter locations by name
- **Expand/Collapse** — Toggle sphere section visibility

## Multiworld Support

In multiworld games, locations belonging to other players appear with distinct styling:
- Purple region names
- Dimmed (reduced opacity) rows
- Non-interactive — you can see them but can't check them

## Interactions

Click a location's checkbox or name to check it. This dispatches a location check through the event system, updating the game state. As you check locations, completed spheres collapse and the current sphere advances.

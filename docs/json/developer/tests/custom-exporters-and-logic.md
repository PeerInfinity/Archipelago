# Custom Exporters and Game Logic

[← Back to Test Results Summary](../test-results/test-results-summary.md)

## Overview

Most games work with the generic exporter and Rule Builder. However, some games have unique structures or complex logic that require custom handling. The test results tables show which games use custom components.

| Column | ✅ Indicator | File Size Indicator |
|--------|--------------|---------------------|
| **Exporter** | Generic exporter | Custom Python exporter |
| **GameLogic** | Generic Rule Builder | Custom JavaScript logic |

## Custom Python Exporter

The **Exporter** column indicates whether a game uses custom export logic or the generic exporter.

### What is an Exporter?

When `Generate.py` creates a randomized game, the **exporter** converts the Python game state into a JSON rules file that the frontend can understand. This JSON file contains:
- All locations and their access rules
- All items and their effects
- Region connections and entrance rules
- Game-specific settings and options

### Generic vs Custom Exporters

| Type | Indicator | Description |
|------|-----------|-------------|
| **Generic** | ✅ | Uses the default export logic in `exporter/generic.py` |
| **Custom** | File size (e.g., "1.8KB") | Has a custom handler in `exporter/games/official/{world}.py` |

### Why Custom Exporters Exist

Some games need custom export handling because:
- **Missing regions**: Some games store regions in non-standard locations that the generic exporter doesn't find (e.g., Aquaria stores secret regions as attributes)
- **Complex rules**: Some access rules require special transformation to be expressed in the Rule Builder format
- **Custom data structures**: Some games use unique data patterns that need special handling

### Example: Aquaria Custom Exporter

```python
# exporter/games/official/aquaria.py
class AquariaGameExportHandler(GenericGameExportHandler):
    """Aquaria stores some regions as world.regions.X attributes
    that aren't added to multiworld.regions. This handler finds
    and adds them during export."""

    MISSING_REGION_ATTRS = [
        'first_secret', 'energy_temple_idol', 'frozen_feil', ...
    ]

    def postprocess_regions(self, multiworld, player):
        # Find and add the missing regions
        for attr_name in self.MISSING_REGION_ATTRS:
            region = getattr(world.regions, attr_name, None)
            if region:
                multiworld.regions.append(region)
```

### Key Files

| File/Directory | Purpose |
|----------------|---------|
| `exporter/generic.py` | Generic export handler (default) |
| `exporter/games/official/` | Custom exporters for official worlds |
| `exporter/games/unofficial/` | Custom exporters for community worlds |

## Custom JavaScript Game Logic

The **GameLogic** column indicates whether a game uses custom frontend logic or the generic Rule Builder.

### What is Game Logic?

The **game logic** is JavaScript code that runs in the frontend to evaluate whether locations are accessible based on the player's current items and game state. The generic Rule Builder can evaluate most access rules, but some games have complex logic that requires custom JavaScript.

### Generic vs Custom Game Logic

| Type | Indicator | Description |
|------|-----------|-------------|
| **Generic** | ✅ | Uses only the Rule Builder engine in `frontend/modules/shared/ruleBuilder/` |
| **Custom** | File size (e.g., "10.7KB") | Has custom logic in `frontend/modules/shared/gameLogic/{world}/` |

### Why Custom Game Logic Exists

Some games need custom JavaScript because:
- **Complex state tracking**: Logic depends on state that can't be expressed as simple item counts (e.g., Lingo's door/panel puzzle solving)
- **Dynamic calculations**: Access rules depend on runtime calculations (e.g., Starcraft 2's mission order dependencies)
- **Game-specific mechanics**: Unique mechanics that the generic Rule Builder can't handle (e.g., Super Metroid's physics-based tricks)

### Example: Lingo Custom Logic

```javascript
// frontend/modules/shared/gameLogic/lingo/lingoLogic.js
export function lingo_can_use_entrance(snapshot, staticData, room, door) {
    // Lingo doors have complex requirements based on:
    // - Which panels have been solved
    // - Which doors have been opened
    // - Room-specific access conditions

    const doorReqs = settings?.door_reqs?.[effectiveRoom]?.[doorName];
    if (doorReqs) {
        if (!_lingo_can_satisfy_requirements(snapshot, staticData, doorReqs)) {
            return false;
        }
    }
    // ... more complex logic
}
```

### Key Files

| File/Directory | Purpose |
|----------------|---------|
| `frontend/modules/shared/ruleBuilder/` | Generic Rule Builder engine |
| `frontend/modules/shared/gameLogic/generic/` | Generic game logic functions |
| `frontend/modules/shared/gameLogic/{world}/` | Custom game-specific logic |

### Games with Custom Logic

As of the current test results, games with custom JavaScript logic include:
- **Lingo** (10.7KB) - Complex puzzle panel and door logic
- **Starcraft 2** (87.4KB) - Mission dependencies and tech trees
- **Super Metroid** (114.5KB) - Physics tricks and item combinations
- **Bomb Rush Cyberfunk** (40.3KB) - Graffiti and character abilities
- **Secret of Evermore** (6.9KB) - Alchemy and progression logic

## Statistics

The test results summary pages show statistics for generic vs custom usage:

- **Passing with Generic Exporter**: Games that pass all tests using only the generic exporter
- **Passing with Generic Logic**: Games that pass all tests using only the generic Rule Builder
- **Passing with Both Generic**: Games that pass using both generic components (no custom code)

Higher percentages indicate that the generic systems handle more games without customization.

## Related Documentation

- [Spoiler Tests](./test-spoilers.md)
- [Template Types](./template-types.md)

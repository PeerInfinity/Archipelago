# A Link to the Past - Multi-Template Test Configurations

This directory contains **175 test template configurations** for A Link to the Past, generated automatically to comprehensively test different game settings.

## Generation

These templates were generated using `scripts/build/generate-multitemplate-configs.py`.

## Template Categories

### Single-Setting Templates (159 files)
Each template varies **ONE setting** from its default value while keeping all other settings at defaults:

- **Progression & Accessibility**: Different balancing and accessibility options
- **Goal Settings**: Various game objectives (Ganon, Crystals, Bosses, Pedestal, Triforce Hunt, etc.)
- **Mode Settings**: Standard, Open, Inverted
- **Logic Settings**: Glitches required, dark room logic
- **Entrance Shuffles**: Various levels of entrance randomization
- **Key & Item Shuffles**: Big keys, small keys, compasses, maps placement
- **Difficulty Settings**: Item pool, item functionality, enemy health/damage
- **Gameplay Modifiers**: Progressive items, swordless, retro modes
- **Shop Settings**: Randomization and shuffle options
- **Enemy & World Shuffles**: Boss, pot, enemy, bush shuffles
- **Timer Modes**: Various timer challenges

**Note**: Cosmetic settings (palettes, HUD, heart colors, menu speed, music, etc.) are excluded from single-setting templates as they don't affect gameplay logic.

### Multi-Setting Templates (15 files)
Each template changes **MULTIPLE settings** to create themed configurations:

- `hard_mode.yaml` - Hard difficulty combination
- `expert_mode.yaml` - Expert difficulty combination  
- `entrance_shuffle_full.yaml` - Full entrance randomization with hints
- `key_shuffle_extreme.yaml` - All keys shuffled to any world
- `triforce_hunt_easy.yaml` - Easy triforce hunt configuration
- `open_inverted.yaml` - Open mode with inverted world
- `retro_mode.yaml` - Zelda-1 style retro experience
- `swordless_challenge.yaml` - No swords allowed
- `boss_chaos.yaml` - Chaotic boss and enemy placement
- `shop_randomizer.yaml` - Heavily randomized shops
- `minimal_access.yaml` - Minimal accessibility with hard settings
- `glitched_logic.yaml` - Requires overworld glitches
- `timer_challenge.yaml` - Timed OHKO mode
- `beemizer.yaml` - Bee trap mode
- `shuffled_everything.yaml` - Maximum shuffle settings

### Randomized Template (1 file)
- `fully_randomized.yaml` - All settings that support randomization are set to use random values with even probability distribution

## File Naming Convention

Files are named descriptively based on their settings:
- Single setting: `{setting_name}_{value}.yaml`
- Multi setting: `{theme_name}.yaml`

Examples:
- `goal_triforce_hunt.yaml` - Sets goal to triforce hunt
- `mode_inverted.yaml` - Sets mode to inverted
- `entrance_shuffle_insanity.yaml` - Sets entrance shuffle to insanity mode
- `hard_mode.yaml` - Combination of hard difficulty settings

## Usage

To test with these templates using Generate.py (from project root):
```bash
python Generate.py --weights_file_path "presets/multitemplate/alttp/goal_triforce_hunt.yaml" --multi 1 --seed 1
```

To test all templates with the test script:
```bash
python scripts/test/test-all-templates.py --templates-dir Players/presets/multitemplate/alttp --multitemplate
```

## Regeneration

To regenerate these templates:
```bash
python scripts/build/generate-multitemplate-configs.py
```

Or for a different game:
```bash
python scripts/build/generate-multitemplate-configs.py --game "Game Name" --output-dir Players/presets/multitemplate/gamename
```

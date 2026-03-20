# Skip Required Files

A setting that allows seed generation to proceed without ROM files. ROM patching is skipped while all other artifacts (multidata, spoiler log, slot data, JSON export) are produced normally.

## Motivation

Generating an Archipelago multiworld normally requires ROM files for every ROM-based game in the seed. This creates friction for several use cases:

- **CI/CD pipelines** can't store ROMs (legal and size constraints)
- **Logic development** doesn't need actual ROM patching
- **Third-party tools** (trackers, analyzers) need game data but not playable ROMs
- **Developers** may not own every game's ROM

## How It Works

When `skip_required_files` is enabled in `host.yaml`:

1. World `stage_assert_generate()` methods skip ROM validation
2. `generate_output()` methods skip ROM patching and set a placeholder ROM name
3. All other generation artifacts are produced normally
4. The JSON exporter runs as usual, producing rules files for the tracker

### Configuration

Add to your `host.yaml`:
```yaml
general_options:
  skip_required_files: true
```

This is a local-only setting (not a game option), so it can't be set by players in YAML configs.

## Supported Games

The fork patches 11 ROM-based worlds with skip support, including A Link to the Past, Ocarina of Time, Super Metroid, Super Mario World, and others. The implementation uses a `check_rom_available()` helper from `worlds/RomlessUtils.py` that each world calls in its generation methods.

## What Gets Generated

| Artifact | With skip enabled |
|----------|------------------|
| Multidata | Generated |
| Spoiler log | Generated |
| Slot data | Generated |
| JSON rules export | Generated |
| Patched ROMs | Skipped |

## Further Reading

- [Skip Required Files Proposal](../developer/proposals/skip-required-files-proposal.md) — Full technical proposal with implementation details

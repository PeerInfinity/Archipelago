# Universal Tracker Enhancements

This fork extends [Universal Tracker](https://github.com/FarisTheAncient/Archipelago) with three tracking modes and a hybrid system that automatically selects the best mode for each game.

## The Problem

The original Universal Tracker works by regenerating a game's world from YAML files and comparing it against the live server state. This breaks for games with randomized logic (entrance shuffle, random starting locations, etc.) because the regenerated world won't match the original seed.

## Three Tracking Modes

| Mode | How It Works | Strengths | Weaknesses |
|------|-------------|-----------|------------|
| **Worldgen** | Rebuilds the world from the exported `_rules.json` using Rule Builder | Full explain support for all games; deterministic | AST conversion may differ slightly from original lambdas |
| **Pickle** | Loads the serialized multiworld directly from a `.pkl.gz` file | Fastest startup; exact logic match | Large files; no explain unless world uses Rule Builder natively |
| **Original (Seeded)** | Uses the original UT regeneration but injects the actual seed number | Uses native game integration; deterministic | Requires correct YAML files; limited seed range without rules file |

No single mode works for every game. Some games only pass with pickle, others only with worldgen, and many work with all three.

## Hybrid Mode

Hybrid mode solves this by consulting `tracking-mode-config.json`, which records which modes pass fuzz testing for each game. When Universal Tracker connects to a server:

1. It looks up the current game in the config
2. It tries each mode in priority order (`worldgen → pickle → original` by default)
3. It uses the first mode that is both listed as passing for that game and succeeds at runtime
4. If no configured mode works, it falls back to standard YAML-based tracking

## Explain Support

The `/explain <location>` command shows a colored rule tree explaining why a location is or isn't accessible given your current items. Green = satisfied, red = missing.

Worldgen mode provides explain support for **all games**, even those without native Rule Builder integration, because all rules are converted to Rule Builder AST objects during world generation.

## Test Results

Fuzz testing is used to validate each mode against every supported game. Results are recorded in `tracking-mode-config.json` and summarized in the [fuzz test results](../developer/test-results/test-results-fuzz-summary.md).

## Architecture

The extensions use a mixin-based architecture to keep changes separate from the original UT code:

| File | Purpose |
|------|---------|
| `TrackerCoreBase.py` | Original UT code (minimal changes) |
| `TrackerCore.py` | Extended version combining base + mixins |
| `pickle_mixin.py` | Pickle-based multiworld loading |
| `worldgen_mixin.py` | Worldgen and AST explain support |
| `fuzzer_hook.py` | Fuzz testing and explain stats collection |

## Further Reading

- [Hybrid Mode](../../../worlds/tracker/docs/hybrid-mode.md) — Detailed hybrid mode documentation
- [UT Tracking Modes Reference](../developer/reference/ut-tracking-modes.md)
- [Universal Tracker Modifications](../developer/diffs/universal-tracker-modifications.md) — Full diff documentation
- [Fuzz Test Results](../developer/test-results/test-results-fuzz-summary.md)

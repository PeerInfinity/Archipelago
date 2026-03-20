# Fuzzer Improvements

This fork extends the [Archipelago fuzzer](https://github.com/Eijebong/Archipelago-fuzzer) with features for reproducible testing and targeted debugging. These improvements are essential for validating the tracker across thousands of random seeds and option combinations.

## What the Fuzzer Does

The fuzzer generates random Archipelago seeds with randomized game options and checks whether they succeed. This is used to:

- Validate that the exporter and tracker work across all option combinations for a game
- Find edge cases where specific option values cause failures
- Verify that tracking modes produce correct results by comparing against spoiler logs

## New Features

### Reproducible Fuzzing (`--starting-seed`)

Sets the starting seed number for generation, making runs deterministic and reproducible. Each iteration uses `starting_seed + iteration` as the Archipelago seed.

```bash
python fuzz.py -g alttp -r 100 --starting-seed 12345
```

### Default Options Exclusion (`--default-options`)

Locks specific options to their default values instead of randomizing them. Useful for isolating failures to specific option types.

```bash
python fuzz.py -g alttp -r 100 --default-options mode,entrance_shuffle
```

### Option Value Exclusion (`--disallow-options`)

Prevents specific option values from being randomized. Useful for skipping known-broken combinations.

```bash
python fuzz.py -g alttp -r 100 --disallow-options "glitches_required:minor_glitches,major_glitches"
```

### Early Termination (`--stop-on-first-failure`)

Stops immediately on the first failure for faster debugging.

### Seed-Based Output Numbering (`--number-by-seed`)

Names output files by seed number instead of iteration count, making it easy to find and reproduce specific failures.

### Fractional Sphere Logic (`--fractional-spheres`)

Enables finer-grained sphere comparison for Universal Tracker testing.

## Test Results

These fuzzer features enabled comprehensive testing across the entire game library. Key results:

- **ALttP**: 0 failures out of 10,000 seeds (all option combinations including entrance shuffle, glitch modes, and inverted mode)
- Results for all games are in the [fuzz test results summary](../developer/test-results/test-results-fuzz-summary.md)

## Further Reading

- [Fuzzer Modifications](../developer/diffs/fuzzer-modifications.md) — Detailed diff documentation
- [Fuzzer Debugging Guide](../developer/guides/fuzzer-debugging.md)
- [Fuzz Test Documentation](../developer/tests/test-fuzz.md)

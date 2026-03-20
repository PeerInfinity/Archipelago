# Spoiler Test Panel

The Spoiler Test panel validates that the frontend logic engine correctly reproduces the game's intended progression. It replays a spoiler log sphere-by-sphere, checking that the state manager unlocks the same locations in the same order.

## Loading a Spoiler Log

Two options:
- **Load Suggested Log** — Automatically finds the sphere log file matching the currently loaded rules (e.g., if `MySeed_rules.json` is active, it looks for `MySeed_sphere_log.jsonl`).
- **Load Selected Local Log** — Pick a `.jsonl` sphere log file from your computer.

Use **Change Log File** to go back to file selection after loading.

## Running the Test

- **Run Full Test** — Executes the entire test automatically, processing all spheres from start to finish.
- **Step Test** — Advances one sphere at a time, showing progress as "Step N / Total". Useful for debugging a specific sphere.
- **Stop on first error** — When checked, the test halts at the first mismatch instead of continuing through all spheres.

## Understanding the Output

The log output area shows color-coded entries:

| Color | Meaning |
|-------|---------|
| **Green** | Test step passed — locations match the expected sphere |
| **Red** | Test failure or mismatch |
| **Yellow** | Warning |
| **Blue** | State information |
| **Orange** | Step progress marker |

When mismatches occur, the output shows which locations were expected but not accessible (or accessible but not expected). Location and region names in the output are **clickable links** for quick navigation to investigate the issue.

## How It Works

The test simulates a full playthrough:
1. Starts with an empty inventory
2. Verifies that initially accessible locations match Sphere 0 from the log
3. "Checks" all locations from the current sphere, adding their items to inventory
4. Verifies newly accessible locations match the next sphere
5. Repeats until all spheres are processed

Any difference between the frontend's calculation and the original generation indicates a logic discrepancy in the exported rules.

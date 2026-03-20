# Multiclient Test

[← Back to Test Results](../test-results/test-results-multiclient.md)

## Overview

The Multiclient Test validates that the frontend can correctly communicate with an Archipelago MultiServer using real network connections. Unlike the spoiler tests (which validate logic offline), the multiclient test verifies the complete client-server communication flow.

This test runs two browser clients simultaneously:
- **Client 1** sends location check messages to the server (simulating a player finding items)
- **Client 2** receives those location checks from the server (validating message forwarding)

## What It Tests

1. **Server connectivity**: The frontend can connect to an Archipelago MultiServer via WebSocket
2. **Location check sending**: Client 1 can send location check messages to the server
3. **Message forwarding**: The server correctly forwards location checks to other connected clients
4. **Event handling**: Event locations are correctly auto-checked when their conditions are met
5. **State synchronization**: Both clients receive consistent game state updates

## Test Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Test Orchestration                            │
│                   (test-all-templates.py --multiclient)             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  1. Generate world (Generate.py)                                    │
│     - Creates .archipelago file for the MultiServer                 │
│     - Exports rules JSON for the frontend                           │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  2. Start MultiServer                                               │
│     - Loads the .archipelago file                                   │
│     - Listens on port 38281                                         │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  3. Launch Client 1 (Playwright)                                    │
│     - Connects to server as Player1                                 │
│     - Sends location checks on timer                                │
│     - Tracks manually-checkable and event locations                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  4. Launch Client 2 (Playwright)                                    │
│     - Connects to same slot as Player1 (reconnection)               │
│     - Receives location checks from server                          │
│     - Validates all expected locations are received                 │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  5. Wait for completion                                             │
│     - Both clients run their tests in parallel                      │
│     - Test completes when all locations are processed               │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  6. Stop server and record results                                  │
│     - Pass/fail status for each client                              │
│     - Location counts (checked/received vs total)                   │
└─────────────────────────────────────────────────────────────────────┘
```

## Understanding Location Types

The multiclient test distinguishes between two types of locations:

### Manually-Checkable Locations (Non-event)

These are locations the player actively "checks" in the game (e.g., opening a chest, defeating a boss, completing a quest). In the test:
- Client 1 sends check messages for these locations on a timer
- These represent actual player actions in the game

### Event Locations

These are locations that are automatically checked when their conditions are met (e.g., "all keys collected", "boss defeated"). In the test:
- Event locations auto-check when their prerequisite conditions are satisfied
- They don't require explicit "check" messages from the client
- The test tracks them separately to verify event handling works correctly

## Understanding the Results Table

### Result Columns

| Column | Description |
|--------|-------------|
| **Game Name** | Display name from the game's template YAML file |
| **Test Result** | Overall pass/fail status |
| **Gen Errors** | Number of errors during world generation |
| **C1 Status** | ✅ if Client 1 (sender) passed, ❌ if failed |
| **C1 Total** | Locations checked / total locations (e.g., "232/232") |
| **C1 Non-event** | Non-event locations checked / total non-event locations |
| **C1 Event** | Event locations checked / total event locations |
| **C2 Status** | ✅ if Client 2 (receiver) passed, ❌ if failed |
| **C2 Locations** | Locations received / total expected |
| **Exporter** | ✅ = generic exporter, file size = custom Python exporter |
| **GameLogic** | ✅ = generic logic, file size = custom JavaScript logic |

### Pass Criteria

A test passes when:
- Generation completes without errors (`error_count = 0`)
- Client 1 successfully checks all manually-checkable locations
- Client 2 receives all expected location checks
- Both clients complete without errors

### Example Results

```
| A Hat in Time | ✅ Passed | 0 | ✅ | 232/232 | 223/223 | 9/9 | ✅ | 232/232 |
```

This shows:
- 232 total locations
- 223 non-event (manually-checkable) locations - all checked by Client 1
- 9 event locations - all auto-checked
- Client 2 received all 232 location updates

## Key Components

### Test Scripts

| File | Purpose |
|------|---------|
| `scripts/test/test-all-templates.py` | Main orchestration (with `--multiclient` flag) |
| `test_json/e2e/multiclient.spec.js` | Playwright test specification |
| `scripts/lib/test_runner.py` | Test execution logic |

### Server Components

| File | Purpose |
|------|---------|
| `MultiServer.py` | Archipelago MultiServer (Python) |
| `.archipelago` file | Serialized game state for the server |

### Frontend Test Modes

| Mode | URL Parameter | Purpose |
|------|---------------|---------|
| Client 1 | `mode=test-multiclient-client1` | Sends location checks on timer |
| Client 2 | `mode=test-multiclient-client2` | Receives and validates location checks |

### Results

| File | Purpose |
|------|---------|
| `scripts/output/multiclient/test-results.json` | Raw test results |
| `docs/json/developer/test-results/test-results-multiclient.md` | Human-readable results chart |

## GitHub Actions Workflow

The multiclient test runs in the `test-all-sequential.yml` workflow after the spoiler tests:

1. **Runs after**: Full spoiler test (to ensure basic game logic is working)
2. **Parallel execution**: 10 parallel jobs split the template list
3. **Per-job steps**:
   - Generate world and start MultiServer
   - Run Playwright multiclient test
   - Record results
4. **Combine results**: Merge artifacts into single results file

### Workflow Options

| Option | Description | Default |
|--------|-------------|---------|
| `enable_multiclient` | Enable/disable multiclient tests | `true` |
| `retest_failures` | Retry failed tests 1-3 times | `2-times` |
| `template_type` | `original`, `worldgen`, or `apworld` | `original` |

## Running Locally

### Prerequisites

1. HTTP server running: `python -m http.server 8000`
2. Virtual environment activated: `source .venv/bin/activate`
3. Node.js dependencies installed: `npm install`
4. Playwright browsers installed: `npx playwright install chromium`

### Quick Test (Single Game)

```bash
source .venv/bin/activate

# Generate the world first
python Generate.py --weights_file_path "Templates/Adventure.yaml" --multi 1 --seed 1

# Run multiclient test
npm run test:multiclient -- --game=adventure --seed=1
```

### Full Test Suite

```bash
source .venv/bin/activate
python scripts/test/test-all-templates.py --multiclient -p
```

### Test Specific Games

```bash
python scripts/test/test-all-templates.py --multiclient --include-list "Adventure.yaml" "TUNIC.yaml" -p
```

### Single Client Mode

For debugging, you can run with only Client 1 (no message forwarding validation):

```bash
ENABLE_SINGLE_CLIENT=true npm run test:multiclient -- --game=adventure --seed=1
```

## Interpreting Failures

| Failure Type | Meaning | Debugging Steps |
|--------------|---------|-----------------|
| **Gen Errors > 0** | World generation failed | Check `generate_output.txt` for Python errors |
| **C1 Status ❌** | Client 1 failed to send checks | Check `server_log.txt` for connection errors |
| **C2 Status ❌** | Client 2 didn't receive all checks | Verify server is forwarding messages correctly |
| **Partial counts** | Some locations not checked/received | Check for timeout or connection issues |

### Common Causes of Failures

1. **Server connection timeout**: MultiServer took too long to start
2. **Port conflict**: Another process using port 38281
3. **Network issues**: WebSocket connection failed
4. **Event location bug**: Event conditions not being properly evaluated
5. **Race condition**: Clients connected/disconnected at wrong time

### Debugging Tips

1. Check `server_log.txt` for MultiServer output
2. Check `test_results/multiclient/` for individual client result files
3. Run with `--headed` flag to see browsers: `npm run test:multiclient:headed`
4. Run with `--debug` flag for Playwright inspector: `npm run test:multiclient:debug`

## Comparison with Other Tests

| Test | What It Validates | Network Required |
|------|-------------------|------------------|
| **Spoiler Test** | Offline logic evaluation | No |
| **Multiclient Test** | Client-server communication | Yes (localhost) |
| **Multiworld Test** | Multiple different games together | No |

The multiclient test complements the spoiler tests by validating the network layer that the spoiler tests don't cover. A game might pass spoiler tests (correct logic) but fail multiclient tests (network communication issues).

## Related Documentation

- [Test Results Summary](../test-results/test-results-summary.md)
- [Spoiler Tests](./test-spoilers.md)
- [Multiworld Test](./test-multiworld.md) (coming soon)

# URL Parameters Reference

The Archipelago JSON Web Client supports several URL parameters that control application behavior and configuration. These parameters can be added to the application URL to override default settings and behaviors.

## General Usage

URL parameters are added to the application URL using standard query string syntax:

```
http://localhost:8000/frontend/?parameter1=value1&parameter2=value2
```

Parameters are processed during application initialization and can override configuration file settings.

## Quick Reference

| Parameter | Purpose | Example |
|-----------|---------|---------|
| `mode` | Application mode | `?mode=default` |
| `game` | Game preset to load | `?game=alttp` |
| `seed` | Seed number | `?seed=3` |
| `player` | Player number/name (multiworld) | `?player=1` |
| `rules` | Direct rules file path | `?rules=./presets/alttp/rules.json` |
| `autoConnect` | Auto-connect to server | `?autoConnect=true` |
| `server` | Server WebSocket URL | `?server=ws://localhost:38281` |
| `playerName` | Player name for connection | `?playerName=Player1` |
| `reset` | Reset to defaults | `?reset=true` |
| `panel` | Focus specific panel | `?panel=inventory` |

## Supported Parameters

### Game Selection Parameters

These parameters work together to load the correct game rules from preset files.

#### `game`

**Purpose:** Specifies which game preset to load. Used in combination with `seed` to locate the rules file.

**Usage:** `?game=<game_identifier>`

**Valid Values:**
- Game folder names from `frontend/presets/` (e.g., `alttp`, `adventure`, `shorthike`)
- Game display names (case-insensitive, e.g., `A Short Hike`)
- `multiworld` - For multiworld seeds with multiple games

**Examples:**
- `?game=alttp` - Load A Link to the Past
- `?game=adventure` - Load Adventure (Atari 2600)
- `?game=multiworld&seed=3` - Load multiworld seed 3
- `?game=shorthike&seed=1` - Load A Short Hike seed 1

**Details:**
- The game parameter is looked up in `frontend/presets/preset_files.json`
- If `rules` parameter is also provided, `rules` takes precedence
- Default seed is `1` if `seed` is not specified

#### `seed`

**Purpose:** Specifies which seed number to load for the given game.

**Usage:** `?seed=<seed_number>`

**Valid Values:** Any seed number that exists in the game's preset folder (e.g., `1`, `2`, `3`)

**Default:** `1`

**Examples:**
- `?game=alttp&seed=1` - Load ALTTP seed 1
- `?game=multiworld&seed=3` - Load multiworld seed 3

**Details:**
- Seeds correspond to folder names in the preset structure (e.g., `AP_84719271504320872445`)
- The seed number is mapped to folders via the `seed` field in `preset_files.json`

#### `player`

**Purpose:** Specifies which player's rules to load in a multiworld game. Essential when each player plays a different game.

**Usage:** `?player=<player_number_or_name>`

**Valid Values:**
- Player number (e.g., `1`, `2`, `3`)
- Player name (case-insensitive, e.g., `Player1`, `player2`)

**Examples:**
- `?game=multiworld&seed=3&player=1` - Load Player 1's rules (e.g., A Short Hike)
- `?game=multiworld&seed=3&player=2` - Load Player 2's rules (e.g., Adventure)
- `?game=multiworld&seed=3&player=Player1` - Same as player=1

**Details:**
- Required for multiworld games where each player plays a different game
- Without this parameter, multiworld defaults to the combined rules file (Player 1's perspective)
- Maps to player-specific rules files (e.g., `AP_seed_P1_rules.json`, `AP_seed_P2_rules.json`)
- The player ID is passed to the StateManager for correct game logic initialization

### `rules`

**Purpose:** Directly overrides the rules file path, bypassing game/seed lookup.

**Usage:** `?rules=<path_to_rules_file>`

**Examples:**
- `?rules=./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json`
- `?rules=./presets/alttp/AP_12345/rules.json`
- `?mode=test-spoilers&rules=./presets/adventure/rules.json`

**Details:**
- Takes precedence over `game` and `seed` parameters
- File paths should be relative to the frontend directory
- The override is tracked in data source information

**Use Cases:**
- **Testing:** Validate specific rule sets
- **Development:** Quick switching between game implementations
- **Debugging:** Test specific spoiler files or custom rule sets

### `mode`

**Purpose:** Sets the application mode, which determines which configuration files and settings are loaded.

**Usage:** `?mode=<mode_name>`

**Valid Values:**
- `default` - Standard application mode
- `test` - Automated testing mode with Playwright integration
- `test-spoilers` - Spoiler-based testing mode
- `reset` - Resets application to factory defaults
- Any custom mode defined in `frontend/modes.json`

**Examples:**
- `?mode=default` - Load the default application mode
- `?mode=test` - Load test mode (used for automated testing)
- `?mode=test-spoilers` - Load spoiler test mode

**Details:**
- The mode parameter determines which configuration is loaded from `frontend/modes.json`
- Each mode can specify different rules files, module configurations, layout presets, and settings
- If no mode is specified, the application will use the last active mode from localStorage or fall back to "default"
- Mode detection occurs early in the initialization process

### `reset`

**Purpose:** Resets the application to default settings.

**Usage:** `?reset=true`

**Valid Values:** `true`

**Details:**
- Clears localStorage data for the current mode
- Useful for troubleshooting or starting fresh

---

### Connection Parameters

These parameters control automatic connection to an Archipelago server.

#### `autoConnect`

**Purpose:** Automatically connect to an Archipelago server when the page loads.

**Usage:** `?autoConnect=true`

**Valid Values:** `true`, `false`

**Default:** `false` (no auto-connection)

**Examples:**
- `?autoConnect=true&server=ws://localhost:38281&playerName=Player1`

**Details:**
- Must be set to `true` to enable auto-connection
- Works with `server` and `playerName` parameters
- If `server` is not provided, uses the default server from client settings

#### `server`

**Purpose:** Specifies the Archipelago server WebSocket URL to connect to.

**Usage:** `?server=<websocket_url>`

**Valid Values:** Any valid WebSocket URL

**Default:** `ws://localhost:38281` (if not specified and autoConnect is true)

**Examples:**
- `?server=ws://localhost:38281`
- `?server=wss://archipelago.gg:38281`
- `?autoConnect=true&server=ws://192.168.1.100:38281`

**Details:**
- Protocol should be `ws://` for local/unencrypted or `wss://` for secure connections
- Port is typically `38281` for Archipelago servers

#### `playerName`

**Purpose:** Sets the player name for server connection.

**Usage:** `?playerName=<name>`

**Valid Values:** Any valid Archipelago player name

**Examples:**
- `?playerName=Player1`
- `?autoConnect=true&server=ws://localhost:38281&playerName=MyName`

**Details:**
- The name must match a player slot in the multiworld session
- Stored in client settings for the session
- Case-sensitive and must match exactly

---

### UI Parameters

#### `panel`

**Purpose:** Focus a specific panel on application load.

**Usage:** `?panel=<componentType>`

**Valid Values:** The `componentType` value from any panel module. See the [Module Info Status Report](../guides/module_info_status.md) for a complete list of available panels - use the value from the `componentType` column.

**Common Panel Values:**
- `clientPanel` - Archipelago server connection
- `inventoryPanel` - Item inventory
- `locationsPanel` - Location tracking
- `regionsPanel` - Region display
- `settingsPanel` - Application settings
- `presetsPanel` - Preset selection

**Examples:**
- `?panel=inventoryPanel` - Focus the inventory panel on load
- `?panel=clientPanel` - Focus the client/console panel on load

**Details:**
- The panel must be loaded in the current mode's layout to be activated
- Activation occurs after a 1.5 second delay to allow Golden Layout to initialize
- If the panel is in a tabbed stack, it will be brought to the front

---

### Window/Iframe Parameters

These parameters are used for multi-window setups and embedded iframe clients.

#### `windowId` / `iframeId`

**Purpose:** Sets a custom identifier for the window or iframe instance.

**Usage:** `?windowId=<id>` or `?iframeId=<id>`

**Details:**
- Used to distinguish between multiple window/iframe instances
- `windowId` and `iframeId` are interchangeable for compatibility

#### `windowName` / `iframeName`

**Purpose:** Sets a custom display name for the window or iframe.

**Usage:** `?windowName=<name>` or `?iframeName=<name>`

**Default:** `window-base` or `iframe-base`

#### `heartbeatInterval`

**Purpose:** Sets the heartbeat interval for window/iframe communication.

**Usage:** `?heartbeatInterval=<milliseconds>`

**Valid Values:** Integer (milliseconds)

**Default:** `30000` (30 seconds)

---

### Testing Parameters

#### `testOrderSeed`

**Purpose:** Sets a seed for randomizing test execution order.

**Usage:** `?testOrderSeed=<seed>`

**Valid Values:** Any integer

**Details:**
- Used in test mode to randomize test order for detecting order-dependent failures

---

## Common URL Patterns

### Single-Player Game

Load a single-player game with a specific seed:

```
http://localhost:8000/frontend/?game=alttp&seed=1
```

### Multiworld Game (Two Players)

Start a multiworld server and connect two browser clients:

**Server Command:**
```bash
python3 MultiServer.py --host localhost --port 38281 ./frontend/presets/multiworld/AP_84719271504320872445/AP_84719271504320872445.archipelago
```

**Player 1 (e.g., A Short Hike):**
```
http://localhost:8000/frontend/?mode=default&autoConnect=true&server=ws://localhost:38281&playerName=Player1&game=multiworld&seed=3&player=1
```

**Player 2 (e.g., Adventure):**
```
http://localhost:8000/frontend/?mode=default&autoConnect=true&server=ws://localhost:38281&playerName=Player2&game=multiworld&seed=3&player=2
```

### Testing with Specific Rules

```
http://localhost:8000/frontend/?mode=test-spoilers&rules=./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json
```

### Reset Application State

```
http://localhost:8000/frontend/?mode=default&reset=true
```

---

## Parameter Processing Order

1. **Mode Detection:** The `mode` parameter is processed first to determine base configuration
2. **Reset Check:** If `reset=true`, localStorage is cleared
3. **Rules Resolution:**
   - If `rules` is provided, use it directly
   - Otherwise, if `game` is provided, look up rules via `game` + `seed` + `player`
4. **Configuration Loading:** Mode-specific settings are loaded from `frontend/modes.json`
5. **Connection Setup:** If `autoConnect=true`, prepare server connection with `server` and `playerName`
6. **Module Initialization:** Modules are loaded with the final configuration

---

## Technical Implementation

URL parameters are processed in multiple locations during initialization:

| File | Parameters Processed |
|------|---------------------|
| `frontend/app/mode/modeManager.js` | `mode`, `reset` |
| `frontend/app/mode/modeDataLoader.js` | `rules`, `game`, `seed`, `player` |
| `frontend/app/initialization/index.js` | `mode`, `panel` |
| `frontend/modules/client/index.js` | `autoConnect`, `server`, `playerName` |
| `frontend/modules/window-base/windowClient.js` | `windowId`, `windowName`, `heartbeatInterval` |
| `frontend/modules/iframe-base/iframeClient.js` | `iframeId`, `iframeName`, `heartbeatInterval` |
| `frontend/modules/tests/testLogic.js` | `mode`, `testOrderSeed` |

---

## Testing Integration

URL parameters are used extensively in the automated testing system:

- **Playwright Tests:** The `tests/e2e/app.spec.js` file constructs URLs with appropriate parameters
- **npm Scripts:** Test scripts in `package.json` use environment variables that map to URL parameters
- **Test Modes:** Special modes like `test-spoilers` are designed specifically for automated testing

**Example npm Commands:**
```bash
# Basic test with default mode
npm test

# Run spoiler tests with specific rules
npm test --mode=test-spoilers --rules=./presets/adventure/AP_14089154938208861744/AP_14089154938208861744_rules.json

# Test specific game with all parameters
npm test --mode=test-full --game=alttp --seed=1

# Debug mode with visible browser
npm run test:headed --mode=test-spoilers --game=adventure
```

**Environment Variables:**
The npm scripts map parameters to environment variables:
- `--mode` → `TEST_MODE`
- `--game` → `TEST_GAME`
- `--seed` → `TEST_SEED`
- `--rules` → `RULES_OVERRIDE`

---

## Error Handling

- **Invalid Modes:** Unknown mode names fall back to "default" mode
- **Missing Rules Files:** Invalid rules file paths will cause initialization errors
- **Invalid Game/Seed:** If game or seed is not found in `preset_files.json`, a warning is logged
- **Missing Player:** For multiworld without `player` parameter, defaults to combined rules (Player 1's view)
- **Malformed URLs:** Badly formatted parameters are ignored with console warnings
- **Connection Failures:** Auto-connect failures are logged but don't prevent app initialization

---

## Best Practices

1. **Use `game` + `seed` over `rules`:** The game/seed approach is more maintainable than hardcoding rules paths
2. **Always specify `player` for multiworld:** Without it, both clients will load the same player's rules
3. **Match `playerName` to slot name:** The player name must exactly match the slot name in the multiworld session
4. **Use relative paths:** For rules files, use paths relative to the frontend directory (starting with `./`)
5. **Test connections locally first:** Before using remote servers, verify your URL parameters work with a local server

---

## See Also

- [Application Architecture](../architecture.md) - Overall system design
- [Module System](../guides/module-system.md) - How modules are loaded and configured
- [Testing Pipeline](../guides/testing-pipeline.md) - Automated testing system
- [Presets](../../modules/presets.md) - How preset files are organized

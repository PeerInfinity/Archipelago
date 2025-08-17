# URL Parameters Reference

The Archipelago JSON Web Client supports several URL parameters that control application behavior and configuration. These parameters can be added to the application URL to override default settings and behaviors.

## General Usage

URL parameters are added to the application URL using standard query string syntax:

```
http://localhost:8000/frontend/?parameter1=value1&parameter2=value2
```

Parameters are processed during application initialization and can override configuration file settings.

## Supported Parameters

### `mode`

**Purpose:** Sets the application mode, which determines which configuration files and settings are loaded.

**Usage:** `?mode=<mode_name>`

**Examples:**
- `?mode=default` - Load the default application mode
- `?mode=test` - Load test mode (used for automated testing)
- `?mode=test-spoilers` - Load spoiler test mode
- `?mode=reset` - Reset all settings to defaults

**Details:**
- The mode parameter determines which configuration is loaded from `frontend/modes.json`
- Each mode can specify different rules files, module configurations, layout presets, and settings
- If no mode is specified, the application will use the last active mode from localStorage or fall back to "default"
- Mode detection occurs early in the initialization process (`init.js`)

**Available Modes:**
The available modes are defined in `frontend/modes.json`. Common modes include:
- `default` - Standard application mode
- `test` - Automated testing mode with Playwright integration
- `test-spoilers` - Spoiler-based testing mode
- `reset` - Resets application to factory defaults

### `rules`

**Purpose:** Overrides the rules file path specified in the active mode configuration.

**Usage:** `?rules=<path_to_rules_file>`

**Examples:**
- `?rules=./presets/adventure/rules.json` - Load Adventure game rules
- `?rules=./presets/a_link_to_the_past/AP_12345/rules.json` - Load specific ALTTP spoiler
- `?mode=test-spoilers&rules=./presets/adventure/rules.json` - Run spoiler tests with Adventure rules

**Details:**
- The rules parameter overrides the `rulesConfig.path` setting from the active mode
- This allows testing different rule sets without modifying configuration files
- The override is tracked in the data source information and displayed in the UI
- File paths should be relative to the frontend directory or absolute URLs
- The rules parameter is processed after mode detection but before module initialization

**Use Cases:**
- **Testing:** Validate different rule sets against the same test suite
- **Development:** Quick switching between game implementations
- **Debugging:** Test specific spoiler files or custom rule sets
- **Comparison:** Compare behavior across different game configurations

## Parameter Processing Order

1. **Mode Detection:** The `mode` parameter is processed first to determine base configuration
2. **Configuration Loading:** Mode-specific settings are loaded from `frontend/modes.json`
3. **Rules Override:** The `rules` parameter overrides the rules file path if specified
4. **Module Initialization:** Modules are loaded with the final configuration

## Technical Implementation

URL parameters are processed in `frontend/init.js` during the application initialization sequence:

1. **URLSearchParams:** Parameters are extracted using the browser's `URLSearchParams` API
2. **Mode Processing:** Mode parameter determines which configuration set to load
3. **Rules Override:** Rules parameter modifies the effective rules file path
4. **Data Source Tracking:** Override sources are tracked for debugging and display purposes

## Testing Integration

URL parameters are used extensively in the automated testing system:

- **Playwright Tests:** The `tests/e2e/app.spec.js` file constructs URLs with appropriate parameters
- **npm Scripts:** Test scripts in `package.json` use environment variables that map to URL parameters
- **Test Modes:** Special modes like `test-spoilers` are designed specifically for automated testing

**Example npm Scripts:**
```bash
# Run spoiler tests with default rules
npm run test:spoilers

# Run spoiler tests with Adventure rules override
npm run test:spoilers:rules
```

## Debugging and Development

URL parameters are particularly useful for debugging and development:

- **Quick Mode Switching:** Change modes without modifying configuration files
- **Rule Set Testing:** Test different game implementations rapidly
- **State Isolation:** Use different modes to avoid conflicts between development and testing
- **Configuration Verification:** Override settings to verify configuration behavior

## Data Source Tracking

When URL parameters override configuration settings, this information is tracked and displayed:

- **Editor Module:** Shows the source of each configuration element
- **JSON Module:** Displays data source provenance information
- **Console Logging:** Initialization logs indicate when URL parameters are applied

**Example Data Source Display:**
```
rulesConfig: Loaded from URL parameter override: ./presets/adventure/rules.json
(Original from file: ./presets/a_hat_in_time/rules.json)
```

## Error Handling

- **Invalid Modes:** Unknown mode names fall back to "default" mode
- **Missing Rules Files:** Invalid rules file paths will cause initialization errors
- **Malformed URLs:** Badly formatted parameters are ignored with console warnings
- **File Access:** Rules files must be accessible from the frontend directory

## Best Practices

1. **Use Relative Paths:** For rules files, use paths relative to the frontend directory
2. **Test Mode Combinations:** Verify that mode and rules parameter combinations work as expected
3. **Document Custom Modes:** If adding new modes to `modes.json`, document their purpose
4. **Validate File Paths:** Ensure rules files exist before using them in URL parameters
5. **Consider Defaults:** Design modes to work without URL parameter overrides when possible

## Future Enhancements

The URL parameter system is designed to be extensible. Potential future parameters might include:

- `layout` - Override the UI layout preset
- `settings` - Override specific application settings
- `modules` - Override which modules are loaded
- `debug` - Enable debug modes or logging levels

## See Also

- [Application Architecture](../architecture.md) - Overall system design
- [Module System](../guides/module-system.md) - How modules are loaded and configured
- [Testing Pipeline](../guides/testing-pipeline.md) - Automated testing system
- [Configuration Files](../guides/configuration.md) - Configuration file formats and usage
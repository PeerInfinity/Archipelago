# Settings Panel

The Settings panel lets you view and edit all application settings as raw JSON. Changes take effect immediately across the entire application.

## Editing Settings

The panel displays the complete settings object in a JSON textarea. Edit the JSON directly to change any setting — colorblind mode, display preferences, module-specific options, and more.

## Applying Changes

- Click **Apply** or press **Ctrl+Enter** to push your changes to the application.
- On success, the button briefly flashes green with "Applied!" text.
- On failure (e.g., invalid JSON), the button flashes red with "Error!" and an alert shows the error details.

Changes are applied live — other panels react immediately to updated settings without needing to reload the page.

## Persistence

Settings modified here are held in memory for the current session. To save them permanently, use the [JSON Panel](json.md) to save settings as part of a mode configuration to localStorage or to a file.

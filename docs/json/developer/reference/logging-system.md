# Reference: The Logging System

The web client uses a centralized, structured logging service to provide developers with powerful and granular control over console output. This system replaces scattered `console.log` statements with a consistent, filterable, and performance-oriented logging API.

## Core Concepts

-   **`LoggerService`:** A singleton instance that serves as the single entry point for all logging activity on the main thread. It is exposed globally as `window.logger`.
-   **Categories:** Every log message belongs to a category. This is typically the module ID (e.g., `stateManager`, `locationUI`), but can also be a conceptual name for cross-cutting concerns (e.g., `INIT_STEP`, `TASK_LIFECYCLE`).
-   **Log Levels:** The system supports multiple levels of verbosity, allowing you to see everything from critical errors to fine-grained diagnostic messages.
-   **Dynamic Configuration:** You can change log levels and filters on-the-fly from the browser's developer console without needing to reload the application.

## Log Levels

The five log levels are listed here in order of increasing verbosity (and decreasing priority). When you set a level (e.g., `INFO`), you will see messages at that level and all levels above it (e.g., `INFO`, `WARN`, `ERROR`).

1.  **`ERROR`**: For critical errors that break functionality.
2.  **`WARN`**: For potential problems, unexpected states, or deprecated usage.
3.  **`INFO`**: For major lifecycle events and user-driven actions (e.g., "Module initialized", "Settings saved").
4.  **`DEBUG`**: For detailed information useful for debugging a specific module's flow.
5.  **`VERBOSE`**: For highly detailed, step-by-step tracing of complex logic or data transformations.

## Basic Usage in a Module

Instead of accessing the global logger directly, it is best practice to use the `createUniversalLogger` factory function to create a category-specific logger instance for your module.

```javascript
// In a module's file (e.g., myModuleUI.js)
import { createUniversalLogger } from '../../app/core/universalLogger.js';

const logger = createUniversalLogger('myModule'); // Create a logger for the 'myModule' category

// Basic logging:
logger.info('My module has started.');

// Logging with additional data objects:
logger.debug('Processing data item:', { id: 123, name: 'Test' });

// Logging an error:
try {
  // ... some code that might fail ...
} catch (error) {
  logger.error('An operation failed:', error);
}
```

## Console Commands

The primary way to interact with the logging system during development is through commands in the browser's developer console.

#### `log_status`

Displays the current configuration, including the default level, all category-specific levels, and active filters.

#### `log_level <level>`

Sets the **default** log level for all categories that don't have a specific override.

-   `log_level INFO` - Sets the default to INFO.
-   `log_level ERROR` - Quiets the console to only show errors and warnings.

#### `log_level <category> <level>`

Sets the log level for a **specific category**. This is the most common command for debugging.

-   `log_level stateManager DEBUG` - Shows all DEBUG, INFO, WARN, and ERROR messages from the `stateManager` module.
-   `log_level locationUI VERBOSE` - Shows every single log message from the `locationUI` module.
-   `log_level stateManager` - Clears the specific setting for `stateManager`, making it use the default level again.

#### `log_override <level>`

Temporarily forces **all** categories to a specific log level, ignoring their individual settings. This is useful for seeing everything that's happening across the application at a certain level of detail.

-   `log_override DEBUG` - See all debug messages from all modules.

#### `log_override_off`

Disables the temporary override and returns to the standard category-specific level configuration.

#### `log_filter <include|exclude> <keyword>`

Applies a keyword filter to the output. This is useful for focusing on a specific term.

-   `log_filter include "inventory"` - Only shows log messages containing the word "inventory".
-   `log_filter exclude "snapshot"` - Hides all log messages that contain the word "snapshot".

#### `log_clear_filters`

Removes all active include and exclude filters.

## Worker and Iframe Logging

The `universalLogger` automatically handles logging from different contexts.

-   **Web Worker:** The `StateManager` runs in a Web Worker, which has its own logger instance. Its configuration is automatically synchronized from the main thread. Console commands like `log_level stateManagerWorker DEBUG` work as expected, controlling the log output originating from within the worker.
-   **Iframe:** Modules running in an `iframe` (like the standalone Text Adventure) also use a local logger instance. Their configuration can be synchronized from the main application via the `iframeAdapter`.

## Best Practices

-   **Use `createUniversalLogger`:** Always create a category-specific logger at the top of your module file. Do not use `console.log`.
-   **Use `INFO` for Key Milestones:** Use `logger.info(...)` for major application lifecycle events, like module initialization. Using conceptual categories like `INIT_STEP` is also helpful (e.g., `createUniversalLogger('INIT_STEP').info(...)`).
-   **Use `DEBUG` for Module Flow:** Use `logger.debug(...)` to trace the internal logic of your module. This should tell the story of what the module is doing and why.
-   **Use `VERBOSE` for Data Dumps:** Use `logger.verbose(...)` for logging large objects or step-by-step data transformations that would be too noisy for `DEBUG`.
-   **Be Consistent with Categories:** Always use your module's ID as the category name for logs originating from it.
-   **Replace `console.log`:** Replace all temporary `console.log` statements with the appropriate `logger` call before committing your code. This keeps the console clean for everyone and makes debugging more efficient.
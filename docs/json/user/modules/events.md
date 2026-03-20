# Events Inspector

The Events Inspector is a debug panel that visualizes the application's two event systems: the **Event Bus** (publish/subscribe messaging) and the **Event Dispatcher** (prioritized event handling). It's primarily useful for understanding how modules communicate and for troubleshooting event flow.

## Controls

- **Search** — Filter events by name (300ms debounce). Press Escape to clear.
- **Collapse All / Expand All** — Toggle all sections, categories, and event details.
- **Collapse Categories / Expand Categories** — Toggle only the category groupings without affecting individual event details.

## Event Bus Section

Shows all registered events organized by category (derived from the event name prefix, e.g., `stateManager:ready` falls under "stateManager").

For each event, you see every module involved:
- **[P]** (blue) — Publisher, with a live publish count
- **[S]** (purple) — Subscriber

Each role has a **checkbox** to enable or disable that specific interaction. Unchecking a publisher or subscriber disables it in the central registry.

### Additional Participants

If non-module participants (such as iframes) are registered on the event bus, they appear in a separate section with purple borders.

## Event Dispatcher Section

Shows all dispatched events with their handler chains, organized by category.

For each event, modules are listed in priority order with their roles:
- **Senders**: Shown with directional symbols — down arrow (targets top priority first), up arrow (targets bottom priority first), or [S] for generic
- **Handlers**: Shown with propagation symbols — dot (basic), up/down arrows (propagation direction), hourglass (delayed), question mark (conditional)

Each role has a checkbox to enable/disable it. Disabling a dispatcher handler takes effect immediately — the dispatcher skips that handler on the next event.

## Live Counters

Publish and propagation counts update every second, giving you a real-time view of event traffic through the system.

## Module State

Modules that are globally disabled (via the [Modules](modules.md) panel) appear dimmed with reduced opacity. Disabled interactions show with strikethrough styling.

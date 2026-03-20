### Module: `Events Inspector`

- **ID:** `events`
- **Purpose:** A developer-focused debug panel that provides a live, visual representation of the application's eventing systems (`eventBus` and `eventDispatcher`). It is essential for understanding and debugging the flow of communication between modules.

---

#### Key Files

- `frontend/modules/events/index.js`: Module entry point and registration.
- `frontend/modules/events/eventsUI.js`: The UI class for the panel, responsible for fetching registration data and rendering the visual displays.

#### Responsibilities

- **Visualize the Event Bus:** Displays all events registered with the `eventBus`. For each event, it shows:
  - Which modules are registered as **Publishers** (`[P]`).
  - Which modules have declared their intent to be **Subscribers** (`[S]`).
- **Visualize the Event Dispatcher:** Displays all events handled by the `eventDispatcher`. For each event, it renders a vertical flow diagram showing:
  - The module(s) that **send** the event (initiators), marked with symbols like `⬇️` (targets top priority) or `⬆️` (targets bottom priority).
  - All modules registered to **handle** the event, in their correct priority order.
  - The propagation logic for each handler, indicated by symbols (e.g., `↑` for propagate up, `●` for stops here, `❓` for conditional).
- **Live Interaction Toggling:** Provides checkboxes next to every registered publisher, subscriber, sender, and handler. Unchecking a box **disables that specific interaction** in the `centralRegistry`.
  - For the `eventDispatcher`, this is a "live" feature; the dispatcher will immediately start skipping disabled handlers.
  - For the `eventBus`, this is currently a "tracking" feature; the `eventBus` itself does not yet check these flags before delivering messages (as of the last implementation review).
- **Reflect Module State:** The panel automatically grays out and marks modules that are globally disabled via the "Modules" panel.

#### Events Published

This module does not publish any events.

#### Events Subscribed To

- `module:stateChanged`: Listens for this event to know when a module has been globally enabled or disabled, so it can update its display accordingly (e.g., by graying out the module's entry).

#### Public Functions (`centralRegistry`)

This module does not register any public functions.

#### Dependencies & Interactions

- **`centralRegistry`**: This is the primary dependency. The `EventsUI` reads all registered event interaction data directly from the `centralRegistry` to build its display. It also writes back to the registry when a user toggles an interaction's enabled state via a checkbox.
- **`init.js` (`moduleManagerApi`)**: It queries the `moduleManagerApi` to get the master `loadPriority` list and the current enabled/disabled status of all modules, which it uses to order and style its display correctly.
- **`eventBus` & `eventDispatcher`**: While it visualizes their behavior, it does not interact with them directly. It modifies the configuration in `centralRegistry` that these two systems then read from.

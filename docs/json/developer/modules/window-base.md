# Window Base Module

**Module ID:** `window-base`

**Purpose:** Provides a communication client for standalone applications opened via `window.open()`. Uses `window.opener` for parent window communication, providing identical API to IframeClient.

## Key Files

- `frontend/modules/window-base/windowClient.js` - Re-exports `AdapterClient` as `WindowClient` for backward compatibility
- `frontend/modules/shared/adapterClient.js` - Unified communication client (auto-detects iframe vs window context)
- `frontend/modules/shared/communicationProtocol.js` - Unified communication protocol
- `frontend/modules/window-base/standalone.js` - Standalone app entry point
- `frontend/modules/window-base/mockDependencies.js` - Mock implementations for testing
- `frontend/modules/window-base/index.html` - Example standalone page
- `frontend/modules/window-base/shared/` - Shared utilities (logger)

## Responsibilities

- **Connection Management:** Establishes connection with opener window
- **Event Bridging:** Forwards EventBus and EventDispatcher events between windows
- **State Caching:** Caches state snapshots and static data from opener
- **Heartbeat:** Periodic connection health checks

## WindowClient API

The API is identical to IframeClient (drop-in replacement):

```javascript
import { WindowClient } from './windowClient.js';

const client = new WindowClient({
    windowId: 'my-app',  // Optional, auto-generated if not provided
    heartbeatInterval: 30000  // Optional, default 30s
});

// Connect to opener window
await client.connect();

// Subscribe to events (same as IframeClient)
client.subscribeEventBus('stateManager:snapshotUpdated', (data) => {
    console.log('State updated:', data);
});

// Publish events
client.publishEventBus('myApp:customEvent', { value: 42 });

// Request/access data
await client.requestStaticData();
const snapshot = client.getStateSnapshot();

// Connection management
client.startHeartbeat();
client.disconnect();
```

## Unified AdapterClient

`WindowClient` is a backward-compatible re-export of the unified `AdapterClient` class (`frontend/modules/shared/adapterClient.js`). `IframeClient` and `WindowClient` are the same class — the `AdapterClient` auto-detects whether it is running in an iframe (`window.parent`) or a separate window (`window.opener`) and uses the appropriate transport and handshake.

This means the same HTML page (e.g., `index-iframe.html`) works when loaded in an iframe panel or opened as a separate window, with no code changes needed.

## Features

- **Auto-Detection:** Detects iframe vs window context automatically
- **Auto ID Generation:** Generates unique client ID if not provided
- **Backward Compatibility:** Accepts `windowId`, `iframeId`, or `clientId` parameters
- **Opener Validation:** Verifies opener window exists before connection (window mode)
- **Drop-in Replacement:** Same API whether used as `IframeClient` or `WindowClient`

## Integration with windowAdapter

The `window-base` module is the client-side counterpart to the `windowAdapter` module:

```
┌─────────────────────┐     postMessage     ┌─────────────────────┐
│   Opener Window     │◄───────────────────►│   Popup Window      │
│   (windowAdapter)   │                     │   (WindowClient)    │
└─────────────────────┘                     └─────────────────────┘
```

## Usage Example

```javascript
// In popup window opened via window.open()
import { WindowClient } from './windowClient.js';

const client = new WindowClient();

try {
    await client.connect();
    console.log('Connected to opener');

    // Subscribe to state updates
    client.subscribeEventBus('stateManager:snapshotUpdated', updateUI);

    // Start heartbeat for connection health
    client.startHeartbeat();
} catch (error) {
    console.error('Failed to connect:', error);
}
```

## Dependencies

- Uses unified communication protocol from `shared/communicationProtocol.js` (re-exported by `windowAdapter/communicationProtocol.js`)
- Optional shared logger for debugging
- No external library dependencies

# Iframe Base Module

**Module ID:** `iframe-base`

**Purpose:** Provides a communication client for standalone applications embedded in iframes. Handles postMessage protocol, event bridging, and state caching from the parent application.

## Key Files

- `frontend/modules/iframe-base/iframeClient.js` - Re-exports `AdapterClient` as `IframeClient` for backward compatibility
- `frontend/modules/shared/adapterClient.js` - Unified communication client (auto-detects iframe vs window context)
- `frontend/modules/shared/communicationProtocol.js` - Unified communication protocol
- `frontend/modules/iframe-base/standalone.js` - Standalone app entry point
- `frontend/modules/iframe-base/mockDependencies.js` - Mock implementations for testing
- `frontend/modules/iframe-base/index.html` - Example standalone page
- `frontend/modules/iframe-base/shared/` - Shared utilities (logger)

## Responsibilities

- **Connection Management:** Establishes and maintains connection with parent frame
- **Event Bridging:** Forwards EventBus and EventDispatcher events between frames
- **State Caching:** Caches state snapshots and static data from parent
- **Heartbeat:** Periodic connection health checks

## IframeClient API

```javascript
import { IframeClient } from './iframeClient.js';

const client = new IframeClient({
    iframeId: 'my-app',  // Optional, auto-generated if not provided
    heartbeatInterval: 30000  // Optional, default 30s
});

// Connect to parent
await client.connect();  // Retries up to 3 times

// Subscribe to events
client.subscribeEventBus('stateManager:snapshotUpdated', (data) => {
    console.log('State updated:', data);
});

client.subscribeEventDispatcher('user:locationCheck', (data) => {
    console.log('Location checked:', data);
});

// Publish events
client.publishEventBus('myApp:customEvent', { value: 42 });

// Request data
await client.requestStaticData();
await client.requestStateSnapshot();

// Access cached data
const snapshot = client.getStateSnapshot();
const staticData = client.getStaticData();

// Connection management
client.startHeartbeat();
client.disconnect();
```

## Message Types

| Type | Direction | Description |
|------|-----------|-------------|
| `ADAPTER_READY` | Bidirectional | Connection handshake |
| `EVENT_BUS_MESSAGE` | Bidirectional | EventBus event forwarding |
| `EVENT_DISPATCHER_MESSAGE` | Bidirectional | Dispatcher event forwarding |
| `STATE_SNAPSHOT` | Parent → Iframe | State updates |
| `STATIC_DATA_RESPONSE` | Parent → Iframe | Static data |
| `HEARTBEAT_RESPONSE` | Parent → Iframe | Heartbeat acknowledgment |
| `CONNECTION_ERROR` | Parent → Iframe | Error notification |

## Features

- **Auto ID Generation:** Generates unique iframe ID if not provided
- **Retry Logic:** Up to 3 connection retries with exponential backoff
- **Multiple Callbacks:** Supports multiple callbacks per event type
- **State Caching:** Caches latest snapshot and static data locally
- **Browser Detection:** Firefox/Chrome compatibility handling

## Unified AdapterClient

`IframeClient` is a backward-compatible re-export of the unified `AdapterClient` class (`frontend/modules/shared/adapterClient.js`). The `AdapterClient` auto-detects whether it is running in an iframe (`window.parent`) or a separate window (`window.opener`) and uses the appropriate transport and handshake. This means the same application code works in both contexts without changes.

See also: [Window Base Module](window-base.md) — `WindowClient` is the same `AdapterClient` class under a different name.

## Integration with iframeAdapter

The `iframe-base` module is the client-side counterpart to the `iframeAdapter` module:

```
┌─────────────────────┐     postMessage     ┌─────────────────────┐
│   Parent App        │◄───────────────────►│   Iframe/Window App │
│   (iframeAdapter    │                     │   (AdapterClient)   │
│    or windowAdapter) │                     │                     │
└─────────────────────┘                     └─────────────────────┘
```

## Usage Example

```html
<!-- In iframe -->
<script type="module">
import { IframeClient } from './iframeClient.js';

const client = new IframeClient();
await client.connect();

// Now can interact with parent app
client.subscribeEventBus('stateManager:snapshotUpdated', (data) => {
    updateUI(data);
});
</script>
```

## Dependencies

- Uses unified communication protocol from `shared/communicationProtocol.js` (re-exported by `iframeAdapter/communicationProtocol.js`)
- Optional shared logger for debugging
- No external library dependencies

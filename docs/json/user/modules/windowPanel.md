# Window Panel

The Window panel displays the connection status of a separate browser window opened via the [Window Manager](windowManagerPanel.md). It's the in-app counterpart to an external window.

## Display

- **Connection Status** — Red when disconnected, blue when connected.
- **Heartbeat Count** — A live counter showing heartbeat messages received from the external window, confirming the connection is healthy.
- **Window ID** — The unique identifier for the connected window.

The panel automatically detects when the external window is closed (via polling) and updates its status accordingly.

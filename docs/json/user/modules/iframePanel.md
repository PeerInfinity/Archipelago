# Iframe Panel

The Iframe panel hosts external web content inside an embedded iframe within the application layout. It's controlled by the [Iframe Manager](iframeManagerPanel.md) — you don't load content directly in this panel.

## Display

- **Status bar** — Shows the current state: loading, connected, or error.
- **Content area** — The embedded web page fills the panel.
- **Empty state** — When nothing is loaded, a message directs you to the Iframe Manager.

The panel establishes a communication channel with the embedded content, allowing the loaded page to interact with the main application's event system.

## Connection

After loading, the panel waits up to 30 seconds for the embedded page to send a ready signal. If the connection times out, an error is displayed. Once connected, the iframe can exchange messages with the main application.

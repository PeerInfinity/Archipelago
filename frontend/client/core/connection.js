// client/core/connection.js
import Config from './config.js';
import eventBus from './eventBus.js';
import storage from './storage.js';

export class Connection {
  constructor() {
    // Private variables
    this.socket = null;
    this.serverAddress = null;
    this.serverPassword = null;
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;
    this.preventReconnect = false;
    this.maxReconnectAttempts = 10;
  }

  initialize() {
    // Reset connection state
    this.preventReconnect = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    console.log('Connection module initialized');
  }

  connect(address, password = null) {
    // Close existing connection if open
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
      this.socket = null;
    }

    // If an empty string is passed as the address, do not attempt to connect
    if (!address) {
      return false;
    }

    // Store connection parameters
    this.serverAddress = address;
    this.serverPassword = password;

    // Determine the server address format
    let formattedAddress = address;
    if (formattedAddress.search(/^\/connect /) > -1) {
      formattedAddress = formattedAddress.substring(9);
    }
    if (formattedAddress.search(/:\d+$/) === -1) {
      formattedAddress = `${formattedAddress}:${Config.DEFAULT_SERVER_PORT}`;
    }

    // Determine connection protocol, default to secure websocket
    const protocol = /^ws:\/\//.test(formattedAddress) ? 'ws' : 'wss';

    // Strip protocol from server address if present
    formattedAddress = formattedAddress.replace(/^.*\/\//, '');

    // Attempt to connect to the server
    try {
      this.socket = new WebSocket(`${protocol}://${formattedAddress}`);
      this.socket.onopen = this._onOpen.bind(this);
      this.socket.onmessage = this._onMessage.bind(this);
      this.socket.onclose = this._onClose.bind(this);
      this.socket.onerror = this._onError.bind(this);
      return true;
    } catch (error) {
      console.error('Error connecting to server:', error);
      eventBus.publish('connection:error', {
        message: `Failed to connect: ${error.message}`,
      });
      return false;
    }
  }

  // Private event handlers
  _onOpen() {
    eventBus.publish('connection:open', { serverAddress: this.serverAddress });
  }

  _onMessage(event) {
    try {
      const commands = JSON.parse(event.data);
      eventBus.publish('connection:message', commands);
    } catch (error) {
      console.error('Error parsing server message:', error);
    }
  }

  _onClose() {
    eventBus.publish('connection:close', { serverAddress: this.serverAddress });

    // Handle reconnection logic
    if (this.preventReconnect || !this.serverAddress) {
      return;
    }

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.reconnectTimeout = setTimeout(() => {
      // Do not attempt to reconnect if a server connection exists already
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        return;
      }

      // If reconnection is currently prohibited, do not attempt to reconnect
      if (this.preventReconnect) {
        return;
      }

      // Do not exceed the limit of reconnection attempts
      if (++this.reconnectAttempts > this.maxReconnectAttempts) {
        eventBus.publish('connection:error', {
          message:
            'Archipelago server connection lost. Maximum reconnection attempts reached.',
        });
        return;
      }

      eventBus.publish('connection:reconnecting', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      });

      // Attempt to reconnect
      this.connect(this.serverAddress, this.serverPassword);
    }, 5000);
  }

  _onError() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      eventBus.publish('connection:error', {
        message:
          'Archipelago server connection lost. The connection closed unexpectedly.',
      });
      this.socket.close();
    }
  }

  disconnect() {
    this.preventReconnect = true;

    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.close();
      this.socket = null;
    }

    this.serverAddress = null;
    this.serverPassword = null;

    return true;
  }

  isConnected() {
    return this.socket && this.socket.readyState === WebSocket.OPEN;
  }

  send(data) {
    if (!this.isConnected()) {
      return false;
    }

    try {
      this.socket.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Error sending message:', error);
      return false;
    }
  }

  getServerAddress() {
    return this.serverAddress;
  }

  getPassword() {
    return this.serverPassword;
  }
}

// Create and export a singleton instance
export const connection = new Connection();

// Also export as default for convenience
export default connection;

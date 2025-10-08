// client/core/connection.js
import Config from './config.js';
import storage from './storage.js';


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('clientConnection', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[clientConnection] ${message}`, ...data);
  }
}

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
    this.eventBus = null;
  }

  setEventBus(busInstance) {
    log('info', '[Connection] Setting EventBus instance.');
    this.eventBus = busInstance;
  }

  initialize() {
    // Reset connection state
    this.preventReconnect = false;
    this.reconnectAttempts = 0;

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    log('info', 'Connection module initialized');
  }

  requestConnect(address, password) {
    log('info', '[Connection] requestConnect called with:', {
      address,
      password,
    });
    let effectiveAddress = address;
    let effectivePassword = password;

    if (!effectiveAddress) {
      log('info', 
        '[Connection] Address not provided directly, trying to load from storage...'
      );
      try {
        const storedSettingsString = storage.getItem('clientSettings');
        if (storedSettingsString) {
          const storedSettings = JSON.parse(storedSettingsString);
          if (storedSettings && storedSettings.connection) {
            effectiveAddress = storedSettings.connection.serverAddress;
            // Only use stored password if no password was provided to the function
            if (
              password === undefined ||
              password === null ||
              password === ''
            ) {
              effectivePassword = storedSettings.connection.password;
            }
            log('info', '[Connection] Loaded from storage:', {
              effectiveAddress,
              effectivePassword,
            });
          }
        }
      } catch (e) {
        log('error', 
          '[Connection] Error reading clientSettings from storage:',
          e
        );
        this.eventBus?.publish('connection:error', {
          message: 'Error reading connection settings from storage.',
        }, 'client');
        return false; // Indicate failure if storage read fails and no address was given
      }
    }

    if (!effectiveAddress) {
      log('warn', 
        '[Connection] No address provided and could not load from storage. Connect attempt aborted.'
      );
      this.eventBus?.publish('connection:error', {
        message: 'Server address not provided and not found in settings.',
      }, 'client');
      return false; // Indicate failure
    }

    // Call the existing connect method
    return this.connect(effectiveAddress, effectivePassword);
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
      log('error', 'Error connecting to server:', error);
      this.eventBus?.publish('connection:error', {
        message: `Failed to connect: ${error.message}`,
      }, 'client');
      return false;
    }
  }

  // Private event handlers
  _onOpen() {
    log('info', '[Connection] WebSocket connection opened');
    log('info', '[Connection] Connected to server:', this.serverAddress);
    log('info', '[Connection] WebSocket readyState:', this.socket.readyState);
    log('info', '[Connection] WebSocket URL:', this.socket.url);
    this.eventBus?.publish('connection:open', {
      serverAddress: this.serverAddress,
    }, 'client');
  }

  _onMessage(event) {
    try {
      const commands = JSON.parse(event.data);
      log('info', '[Connection] Received message from server:', commands);
      this.eventBus?.publish('connection:message', commands, 'client');
    } catch (error) {
      log('error', 'Error parsing server message:', error);
      log('error', 'Raw message data:', event.data);
    }
  }

  _onClose() {
    this.eventBus?.publish('connection:close', {
      serverAddress: this.serverAddress,
    }, 'client');

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
        this.eventBus?.publish('connection:error', {
          message:
            'Archipelago server connection lost. Maximum reconnection attempts reached.',
        }, 'client');
        return;
      }

      this.eventBus?.publish('connection:reconnecting', {
        attempt: this.reconnectAttempts,
        maxAttempts: this.maxReconnectAttempts,
      }, 'client');

      // Attempt to reconnect
      this.connect(this.serverAddress, this.serverPassword);
    }, 5000);
  }

  _onError() {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.eventBus?.publish('connection:error', {
        message:
          'Archipelago server connection lost. The connection closed unexpectedly.',
      }, 'client');
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
      log('warn', '[Connection] Cannot send - not connected');
      log('warn', '[Connection] Socket state:', this.socket ? this.socket.readyState : 'null');
      return false;
    }

    try {
      const dataToSend = typeof data === 'string' ? data : JSON.stringify(data);
      log('info', '[Connection] Sending data to server:', dataToSend);
      log('info', '[Connection] WebSocket URL:', this.socket.url);
      log('info', '[Connection] WebSocket readyState:', this.socket.readyState);
      this.socket.send(dataToSend);
      log('info', '[Connection] Data sent successfully via WebSocket');
      return true;
    } catch (error) {
      log('error', 'Error sending message:', error);
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

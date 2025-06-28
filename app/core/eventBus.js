// eventBus.js
import { centralRegistry } from './centralRegistry.js'; // Use named import


// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('eventBus', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[eventBus] ${message}`, ...data);
  }
}

export class EventBus {
  constructor() {
    this.events = {};
  }

  subscribe(event, callback) {
    if (!this.events[event]) {
      this.events[event] = [];
    }
    this.events[event].push(callback);

    // Return unsubscribe function
    return () => {
      this.unsubscribe(event, callback);
    };
  }

  publish(event, data) {
    if (!this.events[event]) {
      return;
    }

    this.events[event].forEach((callback) => {
      // Simply execute the callback
      try {
        callback(data);
      } catch (error) {
        log('error', `Error in event handler for ${event}:`, error);
      }
    });
  }

  unsubscribe(event, callback) {
    if (!this.events[event]) {
      return;
    }

    this.events[event] = this.events[event].filter((cb) => cb !== callback);

    // Clean up empty event arrays
    if (this.events[event].length === 0) {
      delete this.events[event];
    }
  }
}

// Create and export a singleton instance
export const eventBus = new EventBus();

// Also export as default for convenience
export default eventBus;

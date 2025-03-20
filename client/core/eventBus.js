// client/core/eventBus.js
export class EventBus {
  constructor() {
    this.events = {};
  }

  initialize() {
    // Clear any existing events on initialization
    Object.keys(this.events).forEach((key) => delete this.events[key]);
    console.log('EventBus module initialized');
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
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
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

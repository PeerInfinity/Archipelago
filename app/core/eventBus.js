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
    this.events = {}; // eventName -> Array<{moduleName, callback, enabled}>
    this.publishers = {}; // eventName -> Map<moduleName, {enabled}>
  }

  subscribe(event, callback, moduleName) {
    if (!moduleName) {
      throw new Error('Module name is required for eventBus.subscribe()');
    }

    if (!this.events[event]) {
      this.events[event] = [];
    }

    // Add subscriber with module name and enabled state
    const subscriber = {
      moduleName,
      callback,
      enabled: true // Default enabled
    };

    this.events[event].push(subscriber);

    // Auto-register subscriber intent in centralRegistry
    if (typeof window !== 'undefined' && window.centralRegistry) {
      window.centralRegistry.registerEventBusSubscriberIntent(moduleName, event);
    }

    // Return unsubscribe function
    return () => {
      this.unsubscribe(event, callback, moduleName);
    };
  }

  registerPublisher(event, publisherModuleName) {
    if (!publisherModuleName) {
      throw new Error('Module name is required for eventBus.registerPublisher()');
    }

    if (!this.publishers[event]) {
      this.publishers[event] = new Map();
    }

    // Register publisher with enabled state
    this.publishers[event].set(publisherModuleName, { enabled: true });
    
    log('debug', `Registered publisher ${publisherModuleName} for event ${event}`);
  }

  publish(event, data, publisherModuleName) {
    if (!publisherModuleName) {
      throw new Error('Module name is required for eventBus.publish()');
    }

    if (!this.events[event]) {
      return; // No subscribers, but that's okay
    }

    // Check if publisher is registered
    if (!this.publishers[event] || !this.publishers[event].has(publisherModuleName)) {
      log('warn', `Publisher ${publisherModuleName} not registered for event ${event}. Call registerEventBusPublisher first.`);
      return; // Skip publishing instead of throwing error
    }

    const publisherInfo = this.publishers[event].get(publisherModuleName);
    if (!publisherInfo.enabled) {
      log('debug', `Publisher ${publisherModuleName} is disabled for event ${event}. Ignoring publish.`);
      return;
    }

    // Execute enabled subscriber callbacks
    this.events[event].forEach((subscriber) => {
      if (!subscriber.enabled) {
        log('debug', `Subscriber ${subscriber.moduleName} is disabled for event ${event}. Skipping.`);
        return;
      }

      try {
        subscriber.callback(data);
      } catch (error) {
        log('error', `Error in event handler for ${event} (module: ${subscriber.moduleName}):`, error);
      }
    });
  }

  unsubscribe(event, callback, moduleName) {
    if (!this.events[event]) {
      return;
    }

    // Find and remove the specific subscriber
    this.events[event] = this.events[event].filter((subscriber) => {
      return !(subscriber.callback === callback && subscriber.moduleName === moduleName);
    });

    // Clean up empty event arrays
    if (this.events[event].length === 0) {
      delete this.events[event];
    }
  }

  // Methods to enable/disable publishers and subscribers
  setPublisherEnabled(event, moduleName, enabled) {
    if (!this.publishers[event]) {
      this.publishers[event] = new Map();
    }
    
    if (!this.publishers[event].has(moduleName)) {
      this.publishers[event].set(moduleName, { enabled: true });
    }
    
    this.publishers[event].get(moduleName).enabled = enabled;
    log('debug', `Publisher ${moduleName} for event ${event} set to enabled: ${enabled}`);
  }

  setSubscriberEnabled(event, moduleName, enabled) {
    if (!this.events[event]) {
      return;
    }

    this.events[event].forEach((subscriber) => {
      if (subscriber.moduleName === moduleName) {
        subscriber.enabled = enabled;
        log('debug', `Subscriber ${moduleName} for event ${event} set to enabled: ${enabled}`);
      }
    });
  }

  // Get all publishers and subscribers for Events panel
  getAllPublishers() {
    return this.publishers;
  }

  getAllSubscribers() {
    const subscribers = {};
    Object.keys(this.events).forEach((event) => {
      subscribers[event] = this.events[event].map((sub) => ({
        moduleName: sub.moduleName,
        enabled: sub.enabled
      }));
    });
    return subscribers;
  }
}

// Create and export a singleton instance
export const eventBus = new EventBus();

// Also export as default for convenience
export default eventBus;

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
    this.publishCounts = {}; // eventName -> Map<publisherModuleName, count>
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

    // Auto-register subscriber intent in centralRegistry only if the subscriber is a legitimate module
    if (typeof window !== 'undefined' && window.centralRegistry) {
      // Check multiple ways to determine if this is a legitimate module:
      // 1. Has a registered panel component
      const hasComponent = window.centralRegistry.getComponentTypeForModule(moduleName) !== null;
      
      // 2. Check if it's in the module manager's loaded modules list
      let isInModuleManager = false;  
      if (window.moduleManagerApi && typeof window.moduleManagerApi.getAllModuleStates === 'function') {
        try {
          const moduleStates = window.moduleManagerApi.getAllModuleStates();
          // Check if it's a Promise and handle accordingly
          if (moduleStates && typeof moduleStates.then === 'function') {
            // If it's a Promise, we can't wait for it here, so we'll be conservative
            isInModuleManager = false;
          } else {
            // It's synchronous, check if module exists
            isInModuleManager = moduleStates && moduleStates[moduleName] !== undefined;
          }
        } catch (error) {
          // If there's an error accessing module states, be conservative
          isInModuleManager = false;
        }
      }
      
      // 3. Check against known core module names that might not have components
      const knownModuleNames = [
        'stateManager', 'modules', 'events', 'client', 'timer', 'timerPanel', 'inventory', 'editor', 'settings',
        'commonUI', 'locations', 'exits', 'regions', 'loops', 'tests', 'json', 'pathAnalyzer',
        'pathAnalyzerPanel', 'discovery', 'presets', 'testCases', 'dungeons',
        'textAdventure', 'textAdventureUI', 'iframePanel', 'panelManager', 'messageHandler',
        'locationManager', 'playerState', 'playerStatePanel', 'testSpoilers', 'progressBarPanel',
        'progressBar', 'ProgressBar', 'iframeAdapter', 'core', 'metaGame', 'metaGamePanel',
        'iframeManagerPanel'
      ];
      const isKnownModule = knownModuleNames.includes(moduleName);
      
      const isLegitimateModule = hasComponent || isInModuleManager || isKnownModule;
      
      if (isLegitimateModule) {
        window.centralRegistry.registerEventBusSubscriberIntent(moduleName, event);
      } else {
        log('debug', `Subscriber ${moduleName} is not a registered module (component: ${hasComponent}, moduleManager: ${isInModuleManager}, known: ${isKnownModule}), skipping centralRegistry registration for event ${event}`);
      }
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

    // Initialize publish count for this event/publisher combination
    if (!this.publishCounts[event]) {
      this.publishCounts[event] = new Map();
    }
    if (!this.publishCounts[event].has(publisherModuleName)) {
      this.publishCounts[event].set(publisherModuleName, 0);
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

    // Increment publish count for this event/publisher combination
    if (this.publishCounts[event] && this.publishCounts[event].has(publisherModuleName)) {
      this.publishCounts[event].set(publisherModuleName, this.publishCounts[event].get(publisherModuleName) + 1);
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

  getAllPublishCounts() {
    return this.publishCounts;
  }
}

// Create and export a singleton instance
export const eventBus = new EventBus();

// Also export as default for convenience
export default eventBus;

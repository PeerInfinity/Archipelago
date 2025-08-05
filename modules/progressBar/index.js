import { ProgressBarManager } from './progressBarLogic.js';
import eventBus from '../../app/core/eventBus.js';

// Module info
export const moduleInfo = {
  name: 'ProgressBar',
  description: 'Progress bar component for tracking various operations with timer and event-driven modes.'
};

// Global progress bar manager instance
let progressBarManager = null;

// Registration function - called during app startup
export function register(registrationApi) {
  // Register event subscribers - what this module wants to receive
  registrationApi.registerEventBusSubscriberIntent(moduleInfo.name, 'progressBar:create');
  registrationApi.registerEventBusSubscriberIntent(moduleInfo.name, 'progressBar:update');
  registrationApi.registerEventBusSubscriberIntent(moduleInfo.name, 'progressBar:show');
  registrationApi.registerEventBusSubscriberIntent(moduleInfo.name, 'progressBar:hide');
  registrationApi.registerEventBusSubscriberIntent(moduleInfo.name, 'progressBar:destroy');
  
  // Register event publishers - what this module will send
  registrationApi.registerEventBusPublisher('progressBar:completed');
  registrationApi.registerEventBusPublisher('progressBar:started');
  registrationApi.registerEventBusPublisher('progressBar:updated');

  registrationApi.registerEventBusPublisher('test:progressBarComplete');
  registrationApi.registerEventBusPublisher('test:eventProgressComplete');

  // Register dispatcher receivers
  registrationApi.registerDispatcherReceiver('progressBar:create', 'bottom', 'first');
  registrationApi.registerDispatcherReceiver('progressBar:update', 'bottom', 'first');
  registrationApi.registerDispatcherReceiver('progressBar:show', 'bottom', 'first');
  registrationApi.registerDispatcherReceiver('progressBar:hide', 'bottom', 'first');
  registrationApi.registerDispatcherReceiver('progressBar:destroy', 'bottom', 'first');
  
  // Register public functions
  registrationApi.registerPublicFunction(moduleInfo.name, 'createProgressBar', createProgressBar);
  registrationApi.registerPublicFunction(moduleInfo.name, 'updateProgressBar', updateProgressBar);
  registrationApi.registerPublicFunction(moduleInfo.name, 'showProgressBar', showProgressBar);
  registrationApi.registerPublicFunction(moduleInfo.name, 'hideProgressBar', hideProgressBar);
  registrationApi.registerPublicFunction(moduleInfo.name, 'destroyProgressBar', destroyProgressBar);
}

// Initialization function - called after all modules registered
export function initialize(moduleId, priorityIndex, initializationApi) {
  function log(level, message, ...data) {
    if (typeof window !== 'undefined' && window.logger) {
      window.logger[level]('progressBar', message, ...data);
    } else {
      const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
      consoleMethod(`[progressBar] ${message}`, ...data);
    }
  }

  log('info', 'Initializing ProgressBar module');

  // Get core services
  const dispatcher = initializationApi.getDispatcher();
  
  // Initialize progress bar manager
  progressBarManager = new ProgressBarManager(eventBus, dispatcher, log);
  
  // Subscribe to events on eventBus
  const unsubscribeHandles = [];
  
  const subscribe = (eventName, handler) => {
    const unsubscribe = eventBus.subscribe(eventName, handler.bind(progressBarManager), moduleInfo.name);
    unsubscribeHandles.push(unsubscribe);
  };
  
  subscribe('progressBar:create', progressBarManager.handleCreateEvent);
  subscribe('progressBar:update', progressBarManager.handleUpdateEvent);
  subscribe('progressBar:show', progressBarManager.handleShowEvent);
  subscribe('progressBar:hide', progressBarManager.handleHideEvent);
  subscribe('progressBar:destroy', progressBarManager.handleDestroyEvent);
  
  // Note: EventDispatcher doesn't have subscribe method - it uses publish with handlers
  // Dispatcher events are handled through the registration system, not subscription
  
  log('info', 'ProgressBar module initialized successfully');
  
  // Return cleanup function
  return () => {
    log('info', 'Cleaning up ProgressBar module');
    unsubscribeHandles.forEach(unsub => unsub());
    if (progressBarManager) {
      progressBarManager.cleanup();
      progressBarManager = null;
    }
  };
}

// Public API functions
export function createProgressBar(config) {
  if (progressBarManager) {
    return progressBarManager.createProgressBar(config);
  }
  return null;
}

export function updateProgressBar(id, value, max, text) {
  if (progressBarManager) {
    progressBarManager.updateProgressBar(id, value, max, text);
  }
}

export function showProgressBar(id) {
  if (progressBarManager) {
    progressBarManager.showProgressBar(id);
  }
}

export function hideProgressBar(id) {
  if (progressBarManager) {
    progressBarManager.hideProgressBar(id);
  }
}

export function destroyProgressBar(id) {
  if (progressBarManager) {
    progressBarManager.destroyProgressBar(id);
  }
}
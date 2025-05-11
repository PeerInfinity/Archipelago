// import { getInitApi } from './index.js'; // REMOVED Import
import eventBus from '../../app/core/eventBus.js'; // Import eventBus
import { centralRegistry } from '../../app/core/centralRegistry.js'; // Corrected Import
import commonUI from '../commonUI/index.js';
// import ModuleManagerAPI from '../managerAPI.js'; // REMOVED - Use window.moduleManagerApi indirectly via initApi

// Basic CSS for the panel
const CSS = `
.events-inspector {
  padding: 10px;
  font-family: sans-serif;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
  background-color: #282c34; /* Darker background for the whole panel */
  color: #abb2bf; /* Lighter default text */
}
.events-inspector h2, .events-inspector h3, .events-inspector h4 {
  margin-top: 2px;
  margin-bottom: 2px;
  color: #61afef; /* Brighter headings */
}
.events-inspector h4 {
  color: #98c379; /* Different color for event names */
  border-bottom: none;
  margin-bottom: 0.8em;
}
.event-bus-section .category-block {
  margin-bottom: 15px;
  border-left: 2px solid #61afef; /* Use heading color for border */
  padding-left: 10px;
}
.dispatcher-event, .event-bus-event {
  margin-bottom: 20px;
  border: 1px solid #4b5263; /* Darker border */
  padding: 10px;
  background-color: #323842; /* Slightly lighter dark background */
  border-radius: 4px;
}
.module-block {
  border: 1px dashed #4b5263; /* Darker dashed border */
  padding: 5px 8px;
  margin-bottom: 5px;
  background-color: #282c34; /* Match panel background or slightly different dark */
  display: flex; /* Use flexbox for columns */
  align-items: center;
  min-height: 24px; /* Ensure consistent height */
  color: #dcdfe4; /* Light text for module names */
  border-radius: 2px;
}
.module-name {
  flex-grow: 1; /* Allow module name to take up remaining space */
  font-weight: bold;
  margin-right: 10px;
}
.symbols-column {
  flex-basis: 30px; /* Fixed width for symbol columns */
  text-align: center;
  font-family: monospace; /* Monospace often aligns symbols well */
  color: #abb2bf; /* Default light symbol color */
}
.publisher-symbol {
  color: #61afef; /* Light Blue */
}
.subscriber-symbol {
  color: #c678dd; /* Light Purple/Magenta */
}
.sender-symbol {
  color: #61afef; /* Light Blue */
}
.handler-symbol {
  color: #98c379; /* Light Green */
}
.connector {
  height: 10px;
  width: 1px;
  background-color: #4b5263; /* Darker connector line */
  margin: -2px auto 3px auto; /* Adjust margin for better visual connection */
}
.symbols-column input[type="checkbox"] {
  margin-left: 4px;
  vertical-align: middle;
  cursor: pointer;
}
.disabled-interaction {
  opacity: 0.5;
  text-decoration: line-through;
}
.module-disabled {
  opacity: 0.4;
  border-style: solid; /* Change from dashed */
  border-color: #666; /* Dimmer border */
  background-color: #444; /* Darker background */
}

details > summary {
  cursor: pointer;
  padding: 2px 5px; /* Reduced vertical padding */
  background-color: #3a4049;
  border-radius: 3px;
  margin-bottom: 5px;
  list-style: none; /* Remove default marker */
  display: flex; /* Use flexbox for alignment */
  align-items: center; /* Vertically align items */
}

details > summary::before {
  content: '►'; /* Collapsed marker */
  font-size: 0.8em;
  color: #61afef;
  margin-right: 8px; /* Add space between marker and text */
  width: 1em; /* Give it a defined width for alignment */
  text-align: center;
}

details[open] > summary::before {
  content: '▼'; /* Expanded marker */
}

details > summary::-webkit-details-marker { 
  display: none; /* Hide default marker in WebKit */
}
`;

class EventsUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.eventBusSection = null;
    this.dispatcherSection = null;
    this.moduleStateChangeHandler = this.handleModuleStateChange.bind(this);
    this.unsubscribeModuleState = null;
    this.moduleId = 'events';
    this.initApi = null; // To store initApi when received

    this._createUI();

    // Defer loading data until the app signals it's ready
    eventBus.subscribe(
      'app:readyForUiDataLoad',
      this.handleAppReady.bind(this)
    );

    this.unsubscribeModuleState = eventBus.subscribe(
      'module:stateChanged',
      this.moduleStateChangeHandler
    );
    centralRegistry.registerEventBusSubscriberIntent(
      this.moduleId,
      'module:stateChanged',
      this.moduleStateChangeHandler
    );

    this.container.on('destroy', () => {
      this.destroy();
    });

    const style = document.createElement('style');
    style.textContent = CSS;
    this.container.element.prepend(style);
  }

  handleAppReady(initApi) {
    console.log(
      '[EventsUI] Received app:readyForUiDataLoad, full initApi should be available.'
    );
    // Now attempt to get moduleManager from initApi if it was passed, otherwise fallback to window (less ideal)
    // This assumes initApi is now fully populated and passed with the event.
    // If initApi is not passed with the event, this won't work directly.
    // For now, let's assume window.moduleManagerApi will be set by the time this event fires.
    // A cleaner solution would be to pass initApi with the event.
    if (window.moduleManagerApi) {
      this._loadAndRenderData(centralRegistry, window.moduleManagerApi);
    } else {
      console.error(
        '[EventsUI] moduleManagerApi not found on window when app:readyForUiDataLoad was received.'
      );
      this.eventBusSection.textContent =
        'Error: ModuleManagerAPI not available.';
      this.dispatcherSection.textContent =
        'Error: ModuleManagerAPI not available.';
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  _createUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('events-inspector');
    // this.rootElement.style.overflowY = 'auto'; // Allow scrolling

    this.rootElement.innerHTML = `
      <details open class="main-details-section">
        <summary><h2>Event Bus</h2></summary>
        <div class="event-bus-section">Loading...</div>
      </details>
      <hr>
      <details open class="main-details-section">
        <summary><h2>Event Dispatcher</h2></summary>
        <div class="dispatcher-section">Loading...</div>
      </details>
    `;

    this.eventBusSection = this.rootElement.querySelector('.event-bus-section');
    this.dispatcherSection = this.rootElement.querySelector(
      '.dispatcher-section'
    );

    this.container.element.appendChild(this.rootElement);
  }

  async _loadAndRenderData(registry, moduleManager) {
    if (!registry) {
      this.eventBusSection.textContent = 'Error: Initialization API not found.';
      this.dispatcherSection.textContent =
        'Error: Initialization API not found.';
      return;
    }

    try {
      if (!moduleManager) {
        throw new Error('ModuleManager not available to _loadAndRenderData.');
      }

      const eventBusPublishers = registry.getAllEventBusPublishers();
      const eventBusSubscribers = registry.getAllEventBusSubscribers();
      const dispatcherSenders = registry.getAllDispatcherSenders();
      const dispatcherHandlers = registry.getAllDispatcherHandlers();
      const loadPriority = await moduleManager.getCurrentLoadPriority();
      const moduleStates = await moduleManager.getAllModuleStates();

      this._renderEventBus(
        eventBusPublishers,
        eventBusSubscribers,
        loadPriority,
        moduleStates
      );
      this._renderDispatcherEvents(
        dispatcherSenders,
        dispatcherHandlers,
        loadPriority,
        moduleStates
      );
    } catch (error) {
      console.error('[EventsUI] Error loading or rendering event data:', error);
      this.eventBusSection.textContent = `Error loading data: ${error.message}`;
      this.dispatcherSection.textContent = `Error loading data: ${error.message}`;
    }
  }

  _renderEventBus(publishersMap, subscribersMap, loadPriority, moduleStates) {
    this.eventBusSection.innerHTML = ''; // Clear loading indicator

    const allEventNames = new Set([
      ...publishersMap.keys(),
      ...subscribersMap.keys(),
    ]);

    if (allEventNames.size === 0) {
      this.eventBusSection.textContent = 'No EventBus events registered.';
      return;
    }

    // Group by category
    const eventsByCategory = {};
    allEventNames.forEach((eventName) => {
      const parts = eventName.split(':');
      const category = parts.length > 1 ? parts[0] : 'Uncategorized';
      if (!eventsByCategory[category]) {
        eventsByCategory[category] = [];
      }
      eventsByCategory[category].push(eventName);
    });

    // Sort categories and events within categories
    Object.keys(eventsByCategory)
      .sort()
      .forEach((category) => {
        const categoryDetails = document.createElement('details');
        categoryDetails.classList.add('category-block');
        categoryDetails.open = true; // Start expanded

        const categorySummary = document.createElement('summary');
        categorySummary.innerHTML = `<h3>${category}</h3>`;
        categoryDetails.appendChild(categorySummary);

        const categoryContentDiv = document.createElement('div'); // Container for events within the category
        categoryContentDiv.style.paddingLeft = '15px'; // Indent events

        eventsByCategory[category].sort().forEach((eventName) => {
          const publishers = publishersMap.get(eventName) || new Map();
          const subscribers = subscribersMap.get(eventName) || [];
          const subscriberModuleIds = new Set(
            subscribers.map((s) => s.moduleId)
          );

          // Determine relevant modules for this event
          const relevantModuleIds = new Set();
          // Iterate publisher map keys correctly
          for (const pubModuleId of publishers.keys()) {
            relevantModuleIds.add(pubModuleId);
          }
          subscriberModuleIds.forEach((modId) => relevantModuleIds.add(modId));

          // Filter loadPriority to only include relevant modules, maintaining order
          const relevantModulesInOrder = loadPriority.filter((moduleId) =>
            relevantModuleIds.has(moduleId)
          );

          if (relevantModulesInOrder.length === 0) {
            return; // Skip rendering if no relevant modules found (e.g., only unregistered modules involved)
          }

          const eventContainer = document.createElement('div');
          eventContainer.classList.add('event-bus-event'); // Add class for styling
          eventContainer.innerHTML = `<h4>${eventName}</h4>`;

          relevantModulesInOrder.forEach((moduleId, index) => {
            const publisherInfo = publishers.get(moduleId);
            const isPublisher = publishers.has(moduleId);
            const isPublisherEnabled =
              isPublisher && publisherInfo.enabled !== false;

            // Find subscriber info (assuming one per module/event for UI toggle)
            const subscriberInfo = subscribers.find(
              (s) => s.moduleId === moduleId
            );
            const isSubscriber = !!subscriberInfo;
            const isSubscriberEnabled =
              isSubscriber && subscriberInfo.enabled !== false;
            const isModuleGloballyEnabled =
              moduleStates[moduleId]?.enabled !== false;

            const moduleDiv = document.createElement('div');
            moduleDiv.classList.add('module-block');
            if (!isModuleGloballyEnabled) {
              moduleDiv.classList.add('module-disabled');
            }
            // Add disabled interaction class if BOTH publisher/subscriber roles (if applicable) are disabled *via checkbox*
            // if ((isPublisher && !isPublisherEnabled) && (isSubscriber && !isSubscriberEnabled)) {
            //      moduleDiv.classList.add('disabled-interaction');
            if (
              isPublisher &&
              !isPublisherEnabled &&
              isSubscriber &&
              !isSubscriberEnabled
            ) {
              moduleDiv.classList.add('disabled-interaction');
            }

            const nameDiv = document.createElement('div');
            nameDiv.classList.add('module-name');
            nameDiv.textContent = moduleId;

            // --- Publisher Column --- //
            const publisherCol = document.createElement('div');
            publisherCol.classList.add('symbols-column', 'publisher-symbol');
            if (isPublisher) {
              publisherCol.textContent = '[P]';
              const checkbox = this._createToggleCheckbox(
                eventName,
                moduleId,
                'eventBusPublisher',
                isPublisherEnabled
              );
              publisherCol.appendChild(checkbox);
              if (!isPublisherEnabled)
                publisherCol.classList.add('disabled-interaction');
            }

            // --- Subscriber Column --- //
            const subscriberCol = document.createElement('div');
            subscriberCol.classList.add('symbols-column', 'subscriber-symbol');
            if (isSubscriber) {
              subscriberCol.textContent = '[S]';
              const checkbox = this._createToggleCheckbox(
                eventName,
                moduleId,
                'eventBusSubscriber',
                isSubscriberEnabled
              );
              subscriberCol.appendChild(checkbox);
              if (!isSubscriberEnabled)
                subscriberCol.classList.add('disabled-interaction');
            }

            moduleDiv.appendChild(nameDiv);
            moduleDiv.appendChild(publisherCol);
            moduleDiv.appendChild(subscriberCol);
            eventContainer.appendChild(moduleDiv);

            // Add connector
            if (index < relevantModulesInOrder.length - 1) {
              const connector = document.createElement('div');
              connector.classList.add('connector');
              eventContainer.appendChild(connector);
            }
          });
          // Append the event container to the category's content div
          categoryContentDiv.appendChild(eventContainer);
        });
        // Append the content div to the category details
        categoryDetails.appendChild(categoryContentDiv);
        // Append the category details to the main section
        this.eventBusSection.appendChild(categoryDetails);
      });
  }

  _renderDispatcherEvents(sendersMap, handlersMap, loadPriority, moduleStates) {
    this.dispatcherSection.innerHTML = ''; // Clear loading indicator

    const allEventNames = new Set([
      ...sendersMap.keys(),
      ...handlersMap.keys(),
    ]);

    if (allEventNames.size === 0) {
      this.dispatcherSection.textContent =
        'No EventDispatcher events registered.';
      return;
    }

    // Group events by category
    const eventsByCategory = {};
    allEventNames.forEach((eventName) => {
      const parts = eventName.split(':');
      const category = parts.length > 1 ? parts[0] : 'Uncategorized';
      if (!eventsByCategory[category]) {
        eventsByCategory[category] = [];
      }
      eventsByCategory[category].push(eventName);
    });

    // Sort categories and render
    Object.keys(eventsByCategory)
      .sort()
      .forEach((category) => {
        const categoryDetails = document.createElement('details');
        categoryDetails.classList.add('category-block');
        categoryDetails.open = true; // Start expanded

        const categorySummary = document.createElement('summary');
        categorySummary.innerHTML = `<h3>${category}</h3>`;
        categoryDetails.appendChild(categorySummary);

        const categoryContentDiv = document.createElement('div'); // Container for events
        categoryContentDiv.style.paddingLeft = '15px'; // Indent events

        // Sort events within the category
        eventsByCategory[category].sort().forEach((eventName) => {
          const senders = sendersMap.get(eventName) || [];
          const handlers = handlersMap.get(eventName) || [];

          const relevantModuleIds = new Set();
          senders.forEach((s) => relevantModuleIds.add(s.moduleId));
          handlers.forEach((h) => relevantModuleIds.add(h.moduleId));

          const relevantModulesInOrder = loadPriority.filter((moduleId) =>
            relevantModuleIds.has(moduleId)
          );

          if (relevantModulesInOrder.length === 0) {
            return; // Skip if no relevant modules
          }

          const eventContainer = document.createElement('div');
          eventContainer.classList.add('dispatcher-event');
          eventContainer.innerHTML = `<h4>${eventName}</h4>`;

          relevantModulesInOrder.forEach((moduleId, index) => {
            const senderInfo = senders.find((s) => s.moduleId === moduleId);
            const isSender = !!senderInfo;
            const isSenderEnabled = isSender && senderInfo.enabled !== false;

            const handlerInfo = handlers.find((h) => h.moduleId === moduleId);
            const isHandler = !!handlerInfo;
            const isHandlerEnabled = isHandler && handlerInfo.enabled !== false;
            const isModuleGloballyEnabled =
              moduleStates[moduleId]?.enabled !== false;

            const moduleDiv = document.createElement('div');
            moduleDiv.classList.add('module-block');
            if (!isModuleGloballyEnabled) {
              moduleDiv.classList.add('module-disabled');
            }

            const nameDiv = document.createElement('div');
            nameDiv.classList.add('module-name');
            nameDiv.textContent = moduleId;

            // --- Sender Column --- //
            const senderCol = document.createElement('div');
            senderCol.classList.add('symbols-column', 'sender-symbol');
            if (isSender) {
              senderCol.textContent = '[S]'; // Placeholder symbol
              const checkbox = this._createToggleCheckbox(
                eventName,
                moduleId,
                'dispatcherSender',
                isSenderEnabled
              );
              senderCol.appendChild(checkbox);
              if (!isSenderEnabled)
                senderCol.classList.add('disabled-interaction');
              // TODO: Adjust sender symbol based on direction/target? Still needed.
            }

            // --- Handler Column --- //
            const handlerCol = document.createElement('div');
            handlerCol.classList.add('symbols-column', 'handler-symbol');
            if (isHandler) {
              let symbolsText = '';
              if (handlerInfo.propagationDetails) {
                const details = handlerInfo.propagationDetails;
                if (details.direction === 'up') symbolsText += '↑';
                else if (details.direction === 'down') symbolsText += '↓';
                else symbolsText += '●'; // Non-propagating handler
                if (details.timing === 'delayed') symbolsText += '⏳';
                if (details.condition === 'conditional') symbolsText += '❓';
              } else {
                symbolsText = '[H]'; // Basic handler, no details
              }
              handlerCol.textContent = symbolsText;
              const checkbox = this._createToggleCheckbox(
                eventName,
                moduleId,
                'dispatcherHandler',
                isHandlerEnabled
              );
              handlerCol.appendChild(checkbox);
              if (!isHandlerEnabled)
                handlerCol.classList.add('disabled-interaction');
            }

            moduleDiv.appendChild(nameDiv);
            moduleDiv.appendChild(senderCol); // Add sender column
            moduleDiv.appendChild(handlerCol); // Add handler column
            eventContainer.appendChild(moduleDiv);

            // Add connector placeholder
            if (index < relevantModulesInOrder.length - 1) {
              const connector = document.createElement('div');
              connector.classList.add('connector');
              eventContainer.appendChild(connector);
            }
          });
          // Append the event container to the category's content div
          categoryContentDiv.appendChild(eventContainer);
        });
        // Append the content div to the category details
        categoryDetails.appendChild(categoryContentDiv);
        // Append the category details to the main section
        this.dispatcherSection.appendChild(categoryDetails);
      });

    // TODO: Implement detailed arrow/symbol logic for dispatcher events
    //console.warn(
    //  '[EventsUI] Dispatcher event rendering is basic. Needs symbol/arrow implementation.'
    //);
  }

  // --- Helper to create toggle checkboxes --- //
  _createToggleCheckbox(eventName, moduleId, type, isEnabled) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isEnabled;
    checkbox.title = `${isEnabled ? 'Disable' : 'Enable'} this interaction`;
    checkbox.addEventListener('change', (event) => {
      const newState = event.target.checked;
      try {
        let success = false;
        switch (type) {
          case 'eventBusPublisher':
            success = window.moduleManagerApi.setEventBusPublisherEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'eventBusSubscriber':
            success = window.moduleManagerApi.setEventBusSubscriberEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'dispatcherSender':
            success = window.moduleManagerApi.setDispatcherSenderEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'dispatcherHandler':
            success = window.moduleManagerApi.setDispatcherHandlerEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
        }
        if (success) {
          console.log(
            `Successfully toggled ${type} for ${moduleId} on ${eventName} to ${newState}`
          );
          // Update visual style immediately
          event.target
            .closest('.symbols-column')
            .classList.toggle('disabled-interaction', !newState);
          // Potentially update parent module-block style too
        } else {
          console.error(`Failed to toggle ${type} state in registry.`);
          event.target.checked = !newState; // Revert checkbox on failure
        }
      } catch (error) {
        console.error(
          `Error calling registry toggle function for ${type}:`,
          error
        );
        event.target.checked = !newState; // Revert checkbox on failure
      }
    });
    return checkbox;
  }

  // Handler for module state changes
  handleModuleStateChange(payload) {
    console.log(
      `[EventsUI] Received module:stateChanged for ${payload.moduleId}. Refreshing data...`
    );
    // Simple approach: reload all data and re-render
    this._loadAndRenderData(centralRegistry, window.moduleManagerApi);
  }

  // Clean up subscriptions when the panel is destroyed
  destroy() {
    if (this.unsubscribeModuleState) {
      // Use the stored handler reference for unsubscribe
      eventBus.unsubscribe(
        'module:stateChanged',
        this.moduleStateChangeHandler
      );
      this.unsubscribeModuleState = null;
      console.log('[EventsUI] Unsubscribed from module:stateChanged.');
    }
    // Add any other cleanup needed
  }
}

// Export the class for the module index to use
export default EventsUI;

// import { getInitApi } from './index.js'; // REMOVED Import
import eventBus from '../../app/core/eventBus.js'; // Import eventBus
import { centralRegistry } from '../../app/core/centralRegistry.js'; // Corrected Import
import commonUI from '../commonUI/index.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('eventsUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[eventsUI] ${message}`, ...data);
  }
}

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

/* ADDED: Style for subsection dividers within an event */
.subsection-divider {
  border: none;
  border-top: 1px dashed #5c6370; /* A slightly lighter dashed line than typical borders */
  margin: 10px 0; /* Add some vertical space around the divider */
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
  }

  handleAppReady(eventData) {
    log('info', 
      '[EventsUI] Received app:readyForUiDataLoad, full initApi should be available.'
    );
    // Now attempt to get moduleManager from initApi if it was passed, otherwise fallback to window (less ideal)
    // This assumes initApi is now fully populated and passed with the event.
    // If initApi is not passed with the event, this won't work directly.
    // For now, let's assume window.moduleManagerApi will be set by the time this event fires. // This assumption was incorrect.

    // OLD way:
    // if (window.moduleManagerApi) {
    //   this._loadAndRenderData(centralRegistry, window.moduleManagerApi);
    // } else {
    //   log('error', 
    //     '[EventsUI] moduleManagerApi not found on window when app:readyForUiDataLoad was received.'
    //   );
    //   this.eventBusSection.textContent =
    //     'Error: ModuleManagerAPI not available.';
    //   this.dispatcherSection.textContent =
    //     'Error: ModuleManagerAPI not available.';
    // }

    // NEW way: Get moduleManager from event payload
    if (eventData && typeof eventData.getModuleManager === 'function') {
      const moduleManager = eventData.getModuleManager();
      if (moduleManager) {
        this._loadAndRenderData(centralRegistry, moduleManager);
      } else {
        log('error', '[EventsUI] getModuleManager() returned null/undefined.');
        this.eventBusSection.textContent =
          'Error: ModuleManagerAPI getter returned null.';
        this.dispatcherSection.textContent =
          'Error: ModuleManagerAPI getter returned null.';
      }
    } else {
      log('error', 
        '[EventsUI] ModuleManager API not available from app:readyForUiDataLoad event payload.'
      );
      this.eventBusSection.textContent =
        'Error: ModuleManagerAPI not available from event.';
      this.dispatcherSection.textContent =
        'Error: ModuleManagerAPI not available from event.';
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  _createUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('events-inspector');

    // 1. Append style tag
    const style = document.createElement('style');
    style.textContent = CSS;
    this.rootElement.appendChild(style);

    // 2. Create and append structural elements - Dispatcher first
    const dispatcherDetails = document.createElement('details');
    dispatcherDetails.open = true;
    dispatcherDetails.className = 'main-details-section';
    dispatcherDetails.innerHTML = `
      <summary><h2>Event Dispatcher</h2></summary>
      <div class="dispatcher-section">Loading...</div>
    `;
    this.rootElement.appendChild(dispatcherDetails);

    const hrElement = document.createElement('hr');
    this.rootElement.appendChild(hrElement);

    const eventBusDetails = document.createElement('details');
    eventBusDetails.open = true;
    eventBusDetails.className = 'main-details-section';
    eventBusDetails.innerHTML = `
      <summary><h2>Event Bus</h2></summary>
      <div class="event-bus-section">Loading...</div>
    `;
    this.rootElement.appendChild(eventBusDetails);

    // 3. Query for the sections within the appended elements
    this.dispatcherSection = dispatcherDetails.querySelector(
      '.dispatcher-section'
    );
    this.eventBusSection = eventBusDetails.querySelector('.event-bus-section');
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
      log('error', '[EventsUI] Error loading or rendering event data:', error);
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
          const sendersForEvent = sendersMap.get(eventName) || [];
          const handlersForEvent = handlersMap.get(eventName) || [];

          const allModuleIdsInvolved = new Set();
          sendersForEvent.forEach((s) => allModuleIdsInvolved.add(s.moduleId));
          handlersForEvent.forEach((h) => allModuleIdsInvolved.add(h.moduleId));

          if (allModuleIdsInvolved.size === 0) return; // Skip if no modules actually involved

          const topSenders = [];
          const middleEntries = [];
          const bottomSenders = [];

          allModuleIdsInvolved.forEach((moduleId) => {
            const senderInfo = sendersForEvent.find(
              (s) => s.moduleId === moduleId
            );
            const handlerInfo = handlersForEvent.find(
              (h) => h.moduleId === moduleId
            );
            const originalPriority = loadPriority.indexOf(moduleId);

            const isTopSender =
              senderInfo &&
              senderInfo.direction &&
              senderInfo.direction.initialTarget === 'top';
            const isBottomSender =
              senderInfo &&
              senderInfo.direction &&
              senderInfo.direction.initialTarget === 'bottom';
            const isGenericSender =
              senderInfo && !isTopSender && !isBottomSender;

            if (isTopSender) {
              topSenders.push({
                moduleId,
                isTopSender: true,
                senderInfo,
                originalPriority,
                // Ensure other roles are false or undefined for this specific entry
                isBottomSender: false,
                isGenericSender: false,
                isHandler: false,
                handlerInfo: null,
              });
            }
            if (isBottomSender) {
              bottomSenders.push({
                moduleId,
                isBottomSender: true,
                senderInfo,
                originalPriority,
                isTopSender: false,
                isGenericSender: false,
                isHandler: false,
                handlerInfo: null,
              });
            }
            // Add to middleEntries if it's a generic sender OR a handler
            if (isGenericSender) {
              middleEntries.push({
                moduleId,
                isGenericSender: true,
                senderInfo,
                isHandler: !!handlerInfo, // Can be generic sender AND handler
                handlerInfo,
                originalPriority,
                isTopSender: false,
                isBottomSender: false,
              });
            }
            // If it's a handler AND NOT already added as a generic sender (to avoid double entry if it's only a handler)
            // Or, more simply, if it's a handler and we want to ensure it has its own entry focused on its handler role
            // if (handlerInfo && !isGenericSender) { // This condition prevents double-listing if it's both
            if (handlerInfo) {
              // This allows a module to be listed for its generic send role AND its handler role separately in middle
              // If a module is ONLY a handler (not a generic sender), it will be added here.
              // If a module IS a generic sender, it was added above. If it is ALSO a handler, this adds a second entry for the handler role.
              // To avoid this, we might need a flag if an entry was made for the moduleID in middle already.
              // For now, let's stick to the refined plan: one entry in middle if generic sender, one if handler.
              // This means if module is GenericSender AND Handler, it appears twice in middle with different primary roles.
              // This is actually desirable to show both icons/contexts clearly.

              // Check if an entry for this moduleId as a generic sender already exists in middleEntries.
              // If it is a generic sender AND a handler, we've already added it for its sender role.
              // We should add it again FOR ITS HANDLER ROLE, so it can show handler symbols.
              middleEntries.push({
                moduleId,
                isHandler: true,
                handlerInfo,
                isGenericSender: isGenericSender, // It might still be a generic sender
                senderInfo: isGenericSender ? senderInfo : null,
                originalPriority,
                isTopSender: false,
                isBottomSender: false,
              });
            }
          });

          // Sort each list by original priority
          const sortByPriority = (a, b) => {
            if (a.originalPriority === -1 && b.originalPriority === -1)
              return 0;
            if (a.originalPriority === -1) return 1;
            if (b.originalPriority === -1) return -1;
            return a.originalPriority - b.originalPriority;
          };
          topSenders.sort(sortByPriority);
          middleEntries.sort(sortByPriority);
          bottomSenders.sort(sortByPriority);

          const eventContainer = document.createElement('div');
          eventContainer.classList.add('dispatcher-event');
          eventContainer.innerHTML = `<h4>${eventName}</h4>`;

          let previousSectionNotEmpty = false;

          // Render Top Senders
          if (topSenders.length > 0) {
            topSenders.forEach((entry, index) => {
              this._renderDispatcherModuleEntry(
                eventContainer,
                entry,
                eventName,
                moduleStates
              );
              // Add connector within the section
              if (index < topSenders.length - 1) {
                const connector = document.createElement('div');
                connector.classList.add('connector');
                eventContainer.appendChild(connector);
              }
            });
            previousSectionNotEmpty = true;
          }

          // Render Middle Entries (Generic Senders and Handlers)
          if (middleEntries.length > 0) {
            if (previousSectionNotEmpty) {
              const divider = document.createElement('hr');
              divider.className = 'subsection-divider';
              eventContainer.appendChild(divider);
            }
            middleEntries.forEach((entry, index) => {
              this._renderDispatcherModuleEntry(
                eventContainer,
                entry,
                eventName,
                moduleStates
              );
              // Add connector within the section
              if (index < middleEntries.length - 1) {
                const connector = document.createElement('div');
                connector.classList.add('connector');
                eventContainer.appendChild(connector);
              }
            });
            previousSectionNotEmpty = true;
          }

          // Render Bottom Senders
          if (bottomSenders.length > 0) {
            if (previousSectionNotEmpty) {
              const divider = document.createElement('hr');
              divider.className = 'subsection-divider';
              eventContainer.appendChild(divider);
            }
            bottomSenders.forEach((entry, index) => {
              this._renderDispatcherModuleEntry(
                eventContainer,
                entry,
                eventName,
                moduleStates
              );
              // Add connector within the section
              if (index < bottomSenders.length - 1) {
                const connector = document.createElement('div');
                connector.classList.add('connector');
                eventContainer.appendChild(connector);
              }
            });
            // No need to set previousSectionNotEmpty = true here
          }

          // Append the event container to the category's content div
          categoryContentDiv.appendChild(eventContainer);
        });
        // Append the content div to the category details
        categoryDetails.appendChild(categoryContentDiv);
        // Append the category details to the main section
        this.dispatcherSection.appendChild(categoryDetails);
      });

    // log('warn', 
    //  '[EventsUI] Dispatcher event rendering is basic. Needs symbol/arrow implementation.'
    // ); // Original warning can be removed or updated
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
          log('info', 
            `Successfully toggled ${type} for ${moduleId} on ${eventName} to ${newState}`
          );
          // Update visual style immediately
          event.target
            .closest('.symbols-column')
            .classList.toggle('disabled-interaction', !newState);
          // Potentially update parent module-block style too
        } else {
          log('error', `Failed to toggle ${type} state in registry.`);
          event.target.checked = !newState; // Revert checkbox on failure
        }
      } catch (error) {
        log('error', 
          `Error calling registry toggle function for ${type}:`,
          error
        );
        event.target.checked = !newState; // Revert checkbox on failure
      }
    });
    return checkbox;
  }

  // ADDED: Helper to render a single module entry for the dispatcher view
  _renderDispatcherModuleEntry(eventContainer, entry, eventName, moduleStates) {
    const {
      moduleId,
      isTopSender,
      isBottomSender,
      isGenericSender,
      senderInfo,
      isHandler,
      handlerInfo,
    } = entry;
    const isModuleGloballyEnabled = moduleStates[moduleId]?.enabled !== false;

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
    if (isTopSender || isBottomSender || isGenericSender) {
      let senderSymbolText = '[S]'; // Default for genericSender
      let title = 'Sends/Initiates event';
      if (isTopSender) {
        senderSymbolText = '⬇️';
        title = 'Initiates event (targets top priority first)';
      } else if (isBottomSender) {
        senderSymbolText = '⬆️';
        title = 'Initiates event (targets bottom priority first)';
      } // Generic sender keeps default symbol and title
      senderCol.textContent = senderSymbolText;
      senderCol.title = title;

      // Ensure senderInfo is present before accessing its 'enabled' property
      if (senderInfo) {
        const checkbox = this._createToggleCheckbox(
          eventName,
          moduleId,
          'dispatcherSender',
          senderInfo.enabled !== false
        );
        senderCol.appendChild(checkbox);
        if (senderInfo.enabled === false)
          senderCol.classList.add('disabled-interaction');
      }
    }

    // --- Handler Column --- //
    const handlerCol = document.createElement('div');
    handlerCol.classList.add('symbols-column', 'handler-symbol');
    if (isHandler && handlerInfo) {
      let symbolsText = '●'; // Default for basic handler
      let title = 'Handles event';
      if (handlerInfo.propagationDetails) {
        const details = handlerInfo.propagationDetails;
        symbolsText = ''; // Reset for building up propagation symbols
        if (details.direction === 'up') symbolsText += '↑';
        else if (details.direction === 'down') symbolsText += '↓';
        else symbolsText += '●'; // Explicit non-propagating or basic

        if (details.timing === 'delayed') symbolsText += '⏳';
        if (details.condition === 'conditional') symbolsText += '❓';

        title += ` (Propagates: ${details.direction || 'none'}, Timing: ${
          details.timing || 'N/A'
        }, Condition: ${details.condition || 'N/A'})`;
      }
      handlerCol.textContent = symbolsText;
      handlerCol.title = title;

      const checkbox = this._createToggleCheckbox(
        eventName,
        moduleId,
        'dispatcherHandler',
        handlerInfo.enabled !== false
      );
      handlerCol.appendChild(checkbox);
      if (handlerInfo.enabled === false)
        handlerCol.classList.add('disabled-interaction');
    }

    moduleDiv.appendChild(nameDiv);
    moduleDiv.appendChild(senderCol);
    moduleDiv.appendChild(handlerCol);
    eventContainer.appendChild(moduleDiv);
  }

  // Handler for module state changes
  handleModuleStateChange(payload) {
    log('info', 
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
      log('info', '[EventsUI] Unsubscribed from module:stateChanged.');
    }
    // Add any other cleanup needed
  }
}

// Export the class for the module index to use
export default EventsUI;

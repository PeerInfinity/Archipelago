import { getInitApi } from './index.js';

class EventsUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.eventBusSection = null;
    this.dispatcherSection = null;
    this.initApi = getInitApi(); // Get the API stored during module initialization

    if (!this.initApi) {
      console.error('[EventsUI] Failed to get initApi!');
      // Handle error - maybe display a message in the panel?
    }

    this._createUI();
    this._loadAndRenderData();

    // TODO: Set up listeners if needed (e.g., to refresh when modules are dynamically loaded/unloaded)
  }

  // Method expected by PanelManager/WrapperComponent
  getRootElement() {
    return this.rootElement;
  }

  _createUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.classList.add('events-inspector');
    this.rootElement.style.padding = '10px';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflowY = 'auto'; // Allow scrolling

    this.rootElement.innerHTML = `
      <h2>Event Bus</h2>
      <div class="event-bus-section">Loading...</div>
      <hr>
      <h2>Event Dispatcher</h2>
      <div class="dispatcher-section">Loading...</div>
    `;

    this.eventBusSection = this.rootElement.querySelector('.event-bus-section');
    this.dispatcherSection = this.rootElement.querySelector(
      '.dispatcher-section'
    );

    this.container.element.appendChild(this.rootElement);
  }

  async _loadAndRenderData() {
    if (!this.initApi) {
      this.eventBusSection.textContent = 'Error: Initialization API not found.';
      this.dispatcherSection.textContent =
        'Error: Initialization API not found.';
      return;
    }

    try {
      const registry = this.initApi.getModuleManager()._getRawRegistry();
      const moduleManager = this.initApi.getModuleManager();

      if (!registry || !moduleManager) {
        throw new Error('Failed to retrieve registry or module manager.');
      }

      const eventBusPublishers = registry.getAllEventBusPublishers();
      const eventBusSubscribers = registry.getAllEventBusSubscribers();
      const dispatcherSenders = registry.getAllDispatcherSenders();
      const dispatcherHandlers = registry.getAllDispatcherHandlers();
      const loadPriority = await moduleManager.getCurrentLoadPriority();

      this._renderEventBus(eventBusPublishers, eventBusSubscribers);
      this._renderDispatcherEvents(
        dispatcherSenders,
        dispatcherHandlers,
        loadPriority
      );
    } catch (error) {
      console.error('[EventsUI] Error loading or rendering event data:', error);
      this.eventBusSection.textContent = `Error loading data: ${error.message}`;
      this.dispatcherSection.textContent = `Error loading data: ${error.message}`;
    }
  }

  _renderEventBus(publishersMap, subscribersMap) {
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
        const categoryDiv = document.createElement('div');
        categoryDiv.innerHTML = `<h3>${category}</h3>`;
        this.eventBusSection.appendChild(categoryDiv);

        eventsByCategory[category].sort().forEach((eventName) => {
          const publishers = publishersMap.get(eventName) || new Set();
          const subscribers = subscribersMap.get(eventName) || [];

          const eventDiv = document.createElement('div');
          eventDiv.style.marginBottom = '15px';
          eventDiv.innerHTML = `
            <h4>${eventName}</h4>
            <div><strong>Published By:</strong> ${
              publishers.size > 0 ? [...publishers].join(', ') : '<em>None</em>'
            }</div>
            <div><strong>Subscribed By:</strong> ${
              subscribers.length > 0
                ? subscribers.map((s) => s.moduleId).join(', ')
                : '<em>None</em>'
            }</div>
          `;
          categoryDiv.appendChild(eventDiv);
        });
      });
  }

  _renderDispatcherEvents(sendersMap, handlersMap, loadPriority) {
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

    // Sort event names alphabetically for consistent display
    [...allEventNames].sort().forEach((eventName) => {
      const senders = sendersMap.get(eventName) || [];
      const handlers = handlersMap.get(eventName) || [];

      // Determine which modules are relevant for this specific event
      const relevantModuleIds = new Set();
      senders.forEach((s) => relevantModuleIds.add(s.moduleId));
      handlers.forEach((h) => relevantModuleIds.add(h.moduleId));

      // Filter loadPriority to only include relevant modules, maintaining order
      const relevantModulesInOrder = loadPriority.filter((moduleId) =>
        relevantModuleIds.has(moduleId)
      );

      // If no modules interact with this event (shouldn't normally happen if eventName exists),
      // maybe skip rendering or show a message?
      if (relevantModulesInOrder.length === 0) {
        console.warn(
          `[EventsUI] Event '${eventName}' has registered senders/handlers but none are in loadPriority? Skipping render for this event.`
        );
        return; // Skip rendering this event block
      }

      const eventContainer = document.createElement('div');
      eventContainer.classList.add('dispatcher-event');
      eventContainer.style.marginBottom = '20px';
      eventContainer.style.border = '1px solid #ccc';
      eventContainer.style.padding = '10px';

      eventContainer.innerHTML = `<h4>${eventName}</h4>`;

      // Create vertical stack using only the relevant modules in their load priority order
      relevantModulesInOrder.forEach((moduleId, index) => {
        const moduleDiv = document.createElement('div');
        moduleDiv.classList.add('module-block');
        moduleDiv.style.border = '1px dashed #eee';
        moduleDiv.style.padding = '5px';
        moduleDiv.style.marginBottom = '5px';
        moduleDiv.style.position = 'relative'; // For absolute positioning of arrows
        moduleDiv.textContent = moduleId;

        // Find sender info for this module and event
        const senderInfo = senders.find((s) => s.moduleId === moduleId);
        if (senderInfo) {
          // TODO: Add sender symbol (originating arrow)
          const senderSymbol = document.createElement('span');
          senderSymbol.textContent = ' [S] '; // Placeholder
          senderSymbol.style.color = 'blue';
          moduleDiv.appendChild(senderSymbol);
          // TODO: Handle first/last wrap-around arrows
        }

        // Find handler info for this module and event
        const handlerInfo = handlers.find((h) => h.moduleId === moduleId);
        if (handlerInfo) {
          // Display symbols based on propagation details
          const handlerSymbols = document.createElement('span');
          handlerSymbols.style.marginLeft = '5px'; // Add some space
          let symbolsText = '';

          if (handlerInfo.propagationDetails) {
            const details = handlerInfo.propagationDetails;
            // Direction Arrow
            if (details.direction === 'highestFirst') {
              symbolsText += '↓';
            } else if (details.direction === 'lowestFirst') {
              symbolsText += '↑';
            } else {
              // Default or 'none' - maybe a dot or nothing?
              symbolsText += '●'; // Using a dot for non-propagating handlers
            }

            // Timing Symbol
            if (details.timing === 'delayed') {
              symbolsText += '⏳';
            }

            // Condition Symbol
            if (details.condition === 'conditional') {
              symbolsText += '❓';
            }
          } else {
            // Registered via old method - indicate basic handling without details
            symbolsText = '[H]'; // Revert to old placeholder if no details
          }

          handlerSymbols.textContent = ` ${symbolsText} `;
          handlerSymbols.style.color = 'green'; // Keep green for handlers
          moduleDiv.appendChild(handlerSymbols);
        }

        eventContainer.appendChild(moduleDiv);

        // Add connector placeholder (simple line for now)
        // Skip after the last relevant module
        if (index < relevantModulesInOrder.length - 1) {
          const connector = document.createElement('div');
          connector.style.height = '10px';
          connector.style.width = '1px';
          connector.style.backgroundColor = '#aaa';
          connector.style.margin = '0 auto'; // Center the line
          eventContainer.appendChild(connector);
        }
      });

      this.dispatcherSection.appendChild(eventContainer);
    });

    // TODO: Implement detailed arrow/symbol logic for dispatcher events
    console.warn(
      '[EventsUI] Dispatcher event rendering is basic. Needs symbol/arrow implementation.'
    );
  }
}

// Export the class for the module index to use
export default EventsUI;

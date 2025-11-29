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
  flex-basis: 50px; /* Increased width to accommodate symbols and checkboxes */
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
      this.handleAppReady.bind(this),
      this.moduleId
    , 'events');

    this.unsubscribeModuleState = eventBus.subscribe(
      'module:stateChanged',
      this.moduleStateChangeHandler,
      this.moduleId
    , 'events');

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

    // 2. Create and append Expand/Collapse buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginBottom = '10px';
    buttonContainer.style.textAlign = 'center';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.justifyContent = 'center';
    
    const expandCollapseAllButton = document.createElement('button');
    expandCollapseAllButton.textContent = 'Collapse All';
    expandCollapseAllButton.style.padding = '5px 10px';
    expandCollapseAllButton.style.backgroundColor = '#61afef';
    expandCollapseAllButton.style.color = '#282c34';
    expandCollapseAllButton.style.border = 'none';
    expandCollapseAllButton.style.borderRadius = '3px';
    expandCollapseAllButton.style.cursor = 'pointer';
    expandCollapseAllButton.style.fontSize = '12px';
    expandCollapseAllButton.addEventListener('click', () => {
      this._toggleAllDetails();
    });
    
    const expandCollapseCategoriesButton = document.createElement('button');
    expandCollapseCategoriesButton.textContent = 'Collapse Categories';
    expandCollapseCategoriesButton.style.padding = '5px 10px';
    expandCollapseCategoriesButton.style.backgroundColor = '#61afef';
    expandCollapseCategoriesButton.style.color = '#282c34';
    expandCollapseCategoriesButton.style.border = 'none';
    expandCollapseCategoriesButton.style.borderRadius = '3px';
    expandCollapseCategoriesButton.style.cursor = 'pointer';
    expandCollapseCategoriesButton.style.fontSize = '12px';
    expandCollapseCategoriesButton.addEventListener('click', () => {
      this._toggleCategoryDetails();
    });
    
    buttonContainer.appendChild(expandCollapseAllButton);
    buttonContainer.appendChild(expandCollapseCategoriesButton);
    this.rootElement.appendChild(buttonContainer);
    this.expandCollapseAllButton = expandCollapseAllButton;
    this.expandCollapseCategoriesButton = expandCollapseCategoriesButton;

    // 2.5. Create and append search/filter input
    const searchContainer = document.createElement('div');
    searchContainer.style.marginBottom = '10px';
    searchContainer.style.padding = '0 10px';
    
    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.id = 'event-search';
    searchInput.placeholder = 'Search events...';
    searchInput.style.width = 'calc(100% - 10px)';
    searchInput.style.padding = '8px 12px';
    searchInput.style.marginBottom = '5px';
    searchInput.style.border = '1px solid #4b5263';
    searchInput.style.borderRadius = '4px';
    searchInput.style.backgroundColor = '#323842';
    searchInput.style.color = '#dcdfe4';
    searchInput.style.fontSize = '14px';
    searchInput.style.outline = 'none';
    searchInput.style.transition = 'border-color 0.2s';
    
    // Focus and blur styles
    searchInput.addEventListener('focus', () => {
      searchInput.style.borderColor = '#61afef';
    });
    searchInput.addEventListener('blur', () => {
      searchInput.style.borderColor = '#4b5263';
    });
    
    // Add search input event listener with debouncing
    let searchTimeout;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this._filterEvents();
      }, 300); // 300ms debounce
    });
    
    // Clear search when pressing Escape
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        this._filterEvents();
        searchInput.blur();
      }
    });
    
    searchContainer.appendChild(searchInput);
    this.rootElement.appendChild(searchContainer);
    this.searchInput = searchInput;

    // 3. Create and append structural elements - Dispatcher first
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

    // 4. Query for the sections within the appended elements
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

      // Get all publishers/subscribers from eventBus directly (includes iframes)
      const allEventBusPublishers = eventBus.getAllPublishers();
      const allEventBusSubscribers = eventBus.getAllSubscribers();

      // Get counter data from both EventBus and EventDispatcher
      const eventBusPublishCounts = eventBus.getAllPublishCounts();
      const eventDispatcherPublishCounts = window.eventDispatcher ? window.eventDispatcher.getAllPublishCounts() : {};
      const eventDispatcherPropagationCounts = window.eventDispatcher ? window.eventDispatcher.getAllPropagationCounts() : {};

      this._renderEventBus(
        eventBusPublishers,
        eventBusSubscribers,
        allEventBusPublishers,
        allEventBusSubscribers,
        loadPriority,
        moduleStates,
        eventBusPublishCounts
      );
      this._renderDispatcherEvents(
        dispatcherSenders,
        dispatcherHandlers,
        loadPriority,
        moduleStates,
        eventDispatcherPublishCounts,
        eventDispatcherPropagationCounts
      );

      // Apply current search filter after rendering data
      if (this.searchInput && this.searchInput.value.trim()) {
        this._filterEvents();
      }

      // Start periodic counter updates (1 second interval)
      this._startCounterUpdates();
    } catch (error) {
      log('error', '[EventsUI] Error loading or rendering event data:', error);
      this.eventBusSection.textContent = `Error loading data: ${error.message}`;
      this.dispatcherSection.textContent = `Error loading data: ${error.message}`;
    }
  }

  _renderEventBus(publishersMap, subscribersMap, allPublishersMap, allSubscribersMap, loadPriority, moduleStates, publishCounts) {
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
          // Include all registered publishers (they should be shown even with 0 count)
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
              // Create separate text span and checkbox
              const count = publishCounts[eventName]?.get(moduleId) || 0;
              const textSpan = document.createElement('span');
              textSpan.classList.add('symbol-text');
              textSpan.textContent = `[P] ${count}`;
              publisherCol.appendChild(textSpan);
              
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
              // Create separate text span and checkbox
              const textSpan = document.createElement('span');
              textSpan.classList.add('symbol-text');
              textSpan.textContent = '[S]';
              subscriberCol.appendChild(textSpan);
              
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

    // Render additional publishers/subscribers (e.g., iframes) that are not in centralRegistry
    this._renderAdditionalEventBusParticipants(
      publishersMap,
      subscribersMap,
      allPublishersMap,
      allSubscribersMap,
      loadPriority
    );
  }

  _renderAdditionalEventBusParticipants(registryPublishers, registrySubscribers, allPublishers, allSubscribers, loadPriority) {
    // First, clean up any existing additional participants section
    const existingSections = this.rootElement.querySelectorAll('.main-details-section');
    for (const section of existingSections) {
      if (section.querySelector('.additional-participants-section')) {
        const prevSeparator = section.previousElementSibling;
        if (prevSeparator && prevSeparator.tagName === 'HR') {
          prevSeparator.remove();
        }
        section.remove();
        break;
      }
    }

    // Find publishers/subscribers that are in eventBus but not in centralRegistry
    const additionalPublishers = new Map();
    const additionalSubscribers = new Map();

    // Check for additional publishers
    Object.keys(allPublishers).forEach(eventName => {
      const eventPublishers = allPublishers[eventName];
      const registryEventPublishers = registryPublishers.get(eventName) || new Map();

      eventPublishers.forEach((publisherInfo, publisherId) => {
        // If this publisher is not in the registry, it's additional (like an iframe)
        if (!registryEventPublishers.has(publisherId)) {
          if (!additionalPublishers.has(eventName)) {
            additionalPublishers.set(eventName, new Map());
          }
          additionalPublishers.get(eventName).set(publisherId, publisherInfo);
        }
      });
    });

    // Check for additional subscribers
    logger.debug('eventsUI', `[Additional Check] Processing ${Object.keys(allSubscribers).length} events for additional subscribers`);
    Object.keys(allSubscribers).forEach(eventName => {
      const eventSubscribers = allSubscribers[eventName];
      const registryEventSubscribers = registrySubscribers.get(eventName) || [];
      const registrySubscriberIds = new Set(registryEventSubscribers.map(s => s.moduleId));

      logger.debug('eventsUI', `[Additional Subscribers Check] Event: ${eventName}, EventBus subscribers:`, eventSubscribers.map(s => s.moduleName), 'Registry subscribers:', Array.from(registrySubscriberIds));

      eventSubscribers.forEach(subscriber => {
        // If this subscriber is not in the registry, it's additional
        if (!registrySubscriberIds.has(subscriber.moduleName)) {
          logger.debug('eventsUI', `[Additional Subscribers] Found additional subscriber: ${subscriber.moduleName} for event ${eventName}`);
          if (!additionalSubscribers.has(eventName)) {
            additionalSubscribers.set(eventName, []);
          }
          additionalSubscribers.get(eventName).push({
            moduleId: subscriber.moduleName,
            enabled: subscriber.enabled
          });
        }
      });
    });
    
    logger.debug('eventsUI', `[Additional Check] Found ${additionalPublishers.size} additional publisher events and ${additionalSubscribers.size} additional subscriber events`);

    // Only render if there are additional participants
    if (additionalPublishers.size === 0 && additionalSubscribers.size === 0) {
      return;
    }

    // Add separator before the new top-level section
    const separator = document.createElement('hr');
    separator.style.margin = '20px 0';
    separator.style.borderColor = '#4b5263';
    this.rootElement.appendChild(separator);

    // Create top-level section for additional participants
    const additionalParticipantsDetails = document.createElement('details');
    additionalParticipantsDetails.open = true;
    additionalParticipantsDetails.className = 'main-details-section';
    additionalParticipantsDetails.innerHTML = `
      <summary><h2>Additional Event Participants (Non-Module)</h2></summary>
      <div class="additional-participants-section"></div>
    `;
    this.rootElement.appendChild(additionalParticipantsDetails);
    
    // Get the content div
    const headerContentDiv = additionalParticipantsDetails.querySelector('.additional-participants-section');

    // Get all events that have additional participants
    const allAdditionalEvents = new Set([
      ...additionalPublishers.keys(),
      ...additionalSubscribers.keys()
    ]);

    // Group by category
    const eventsByCategory = {};
    allAdditionalEvents.forEach(eventName => {
      const parts = eventName.split(':');
      const category = parts.length > 1 ? parts[0] : 'Uncategorized';
      if (!eventsByCategory[category]) {
        eventsByCategory[category] = [];
      }
      eventsByCategory[category].push(eventName);
    });

    // Render each category
    Object.keys(eventsByCategory).sort().forEach(category => {
      const categoryDetails = document.createElement('details');
      categoryDetails.classList.add('category-block');
      categoryDetails.open = true;
      categoryDetails.style.borderColor = '#98c379'; // Green for sub-categories

      const categorySummary = document.createElement('summary');
      categorySummary.innerHTML = `<h4>${category}</h4>`;
      categoryDetails.appendChild(categorySummary);

      const categoryContentDiv = document.createElement('div');
      categoryContentDiv.style.paddingLeft = '15px';

      eventsByCategory[category].sort().forEach(eventName => {
        const eventPublishers = additionalPublishers.get(eventName) || new Map();
        const eventSubscribers = additionalSubscribers.get(eventName) || [];

        const eventContainer = document.createElement('div');
        eventContainer.classList.add('event-bus-event');
        eventContainer.innerHTML = `<h4>${eventName}</h4>`;

        // Get all participant IDs and sort them
        const allParticipantIds = new Set();
        eventPublishers.forEach((_, publisherId) => allParticipantIds.add(publisherId));
        eventSubscribers.forEach(sub => allParticipantIds.add(sub.moduleId));

        const sortedParticipants = Array.from(allParticipantIds).sort();

        sortedParticipants.forEach((participantId, index) => {
          const isPublisher = eventPublishers.has(participantId);
          const subscriberInfo = eventSubscribers.find(s => s.moduleId === participantId);
          const isSubscriber = !!subscriberInfo;

          const moduleDiv = document.createElement('div');
          moduleDiv.classList.add('module-block');
          moduleDiv.style.borderColor = '#c678dd'; // Purple border for additional participants

          const nameDiv = document.createElement('div');
          nameDiv.classList.add('module-name');
          nameDiv.textContent = participantId;

          // Add type indicator (e.g., iframe_textAdventure -> [iframe])
          if (participantId.startsWith('iframe_')) {
            const typeSpan = document.createElement('span');
            typeSpan.textContent = ' [iframe]';
            typeSpan.style.color = '#61afef';
            typeSpan.style.fontSize = '0.8em';
            nameDiv.appendChild(typeSpan);
          }

          // Publisher column
          const publisherCol = document.createElement('div');
          publisherCol.classList.add('symbols-column', 'publisher-symbol');
          if (isPublisher) {
            publisherCol.textContent = '[P]';
            const publisherInfo = eventPublishers.get(participantId);
            publisherCol.title = `Publisher - Enabled: ${publisherInfo.enabled}`;
            if (!publisherInfo.enabled) {
              publisherCol.classList.add('disabled-interaction');
            }
          }

          // Subscriber column
          const subscriberCol = document.createElement('div');
          subscriberCol.classList.add('symbols-column', 'subscriber-symbol');
          if (isSubscriber) {
            subscriberCol.textContent = '[S]';
            subscriberCol.title = `Subscriber - Enabled: ${subscriberInfo.enabled}`;
            if (!subscriberInfo.enabled) {
              subscriberCol.classList.add('disabled-interaction');
            }
          }

          moduleDiv.appendChild(nameDiv);
          moduleDiv.appendChild(publisherCol);
          moduleDiv.appendChild(subscriberCol);
          eventContainer.appendChild(moduleDiv);

          // Add connector
          if (index < sortedParticipants.length - 1) {
            const connector = document.createElement('div');
            connector.classList.add('connector');
            eventContainer.appendChild(connector);
          }
        });

        categoryContentDiv.appendChild(eventContainer);
      });

      categoryDetails.appendChild(categoryContentDiv);
      headerContentDiv.appendChild(categoryDetails);
    });

    // No need to append headerContentDiv since it's already part of the additionalParticipantsDetails
    // that was appended to this.rootElement earlier
  }

  _renderDispatcherEvents(sendersMap, handlersMap, loadPriority, moduleStates, publishCounts, propagationCounts) {
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
              senderInfo.direction === 'top';
            const isBottomSender =
              senderInfo &&
              senderInfo.direction === 'bottom';
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
            // Create a single entry that can represent both roles
            if (isGenericSender || handlerInfo) {
              middleEntries.push({
                moduleId,
                isGenericSender: isGenericSender,
                senderInfo: isGenericSender ? senderInfo : null,
                isHandler: !!handlerInfo,
                handlerInfo,
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
                moduleStates,
                publishCounts,
                propagationCounts
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
                moduleStates,
                publishCounts,
                propagationCounts
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
                moduleStates,
                publishCounts,
                propagationCounts
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
            success = centralRegistry.setEventBusPublisherEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'eventBusSubscriber':
            success = centralRegistry.setEventBusSubscriberIntentEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'dispatcherSender':
            success = centralRegistry.setDispatcherSenderEnabled(
              eventName,
              moduleId,
              newState
            );
            break;
          case 'dispatcherHandler':
            success = centralRegistry.setDispatcherHandlerEnabled(
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
          const symbolsColumn = event.target.closest('.symbols-column');
          if (symbolsColumn) {
            symbolsColumn.classList.toggle('disabled-interaction', !newState);
          }
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

  // Method to toggle all details elements
  _toggleAllDetails() {
    const allDetails = this.rootElement.querySelectorAll('details');
    const allOpen = Array.from(allDetails).every(detail => detail.open);
    
    if (allOpen) {
      // Close all details
      allDetails.forEach(detail => {
        detail.open = false;
      });
      this.expandCollapseAllButton.textContent = 'Expand All';
    } else {
      // Open all details
      allDetails.forEach(detail => {
        detail.open = true;
      });
      this.expandCollapseAllButton.textContent = 'Collapse All';
    }
  }

  // Method to toggle only category details elements
  _toggleCategoryDetails() {
    const categoryDetails = this.rootElement.querySelectorAll('details.category-block');
    const allOpen = Array.from(categoryDetails).every(detail => detail.open);
    
    if (allOpen) {
      // Close all category details
      categoryDetails.forEach(detail => {
        detail.open = false;
      });
      this.expandCollapseCategoriesButton.textContent = 'Expand Categories';
    } else {
      // Open all category details
      categoryDetails.forEach(detail => {
        detail.open = true;
      });
      this.expandCollapseCategoriesButton.textContent = 'Collapse Categories';
    }
  }

  _filterEvents() {
    const searchTerm = this.searchInput.value.toLowerCase().trim();
    log('debug', `[EventsUI] Filtering events with search term: "${searchTerm}"`);
    
    // Get all event elements in both dispatcher and event bus sections
    const dispatcherEvents = this.dispatcherSection.querySelectorAll('.dispatcher-event');
    const eventBusEvents = this.eventBusSection.querySelectorAll('.event-bus-event');
    const additionalParticipantEvents = this.rootElement.querySelectorAll('.additional-participants-section .event-bus-event');

    let visibleDispatcherCount = 0;
    let visibleEventBusCount = 0;
    let visibleAdditionalCount = 0;

    // Filter dispatcher events
    dispatcherEvents.forEach(eventElement => {
      const eventNameElement = eventElement.querySelector('h4');
      if (eventNameElement) {
        const eventName = eventNameElement.textContent.toLowerCase();
        const isVisible = !searchTerm || eventName.includes(searchTerm);
        eventElement.style.display = isVisible ? 'block' : 'none';
        if (isVisible) visibleDispatcherCount++;
      }
    });

    // Filter event bus events
    eventBusEvents.forEach(eventElement => {
      const eventNameElement = eventElement.querySelector('h4');
      if (eventNameElement) {
        const eventName = eventNameElement.textContent.toLowerCase();
        const isVisible = !searchTerm || eventName.includes(searchTerm);
        eventElement.style.display = isVisible ? 'block' : 'none';
        if (isVisible) visibleEventBusCount++;
      }
    });

    // Filter additional participant events
    additionalParticipantEvents.forEach(eventElement => {
      const eventNameElement = eventElement.querySelector('h4');
      if (eventNameElement) {
        const eventName = eventNameElement.textContent.toLowerCase();
        const isVisible = !searchTerm || eventName.includes(searchTerm);
        eventElement.style.display = isVisible ? 'block' : 'none';
        if (isVisible) visibleAdditionalCount++;
      }
    });

    // Hide/show categories that have no visible events
    this._updateCategoryVisibility();

    log('debug', `[EventsUI] Filtered events - Dispatcher: ${visibleDispatcherCount}, EventBus: ${visibleEventBusCount}, Additional: ${visibleAdditionalCount}`);
  }

  _updateCategoryVisibility() {
    // Update category visibility in dispatcher section
    const dispatcherCategories = this.dispatcherSection.querySelectorAll('.category-block');
    dispatcherCategories.forEach(category => {
      const visibleEvents = category.querySelectorAll('.dispatcher-event:not([style*="display: none"])');
      category.style.display = visibleEvents.length > 0 ? 'block' : 'none';
    });

    // Update category visibility in event bus section
    const eventBusCategories = this.eventBusSection.querySelectorAll('.category-block');
    eventBusCategories.forEach(category => {
      const visibleEvents = category.querySelectorAll('.event-bus-event:not([style*="display: none"])');
      category.style.display = visibleEvents.length > 0 ? 'block' : 'none';
    });

    // Update visibility of additional participants section
    const additionalSection = this.rootElement.querySelector('.additional-participants-section');
    if (additionalSection) {
      const visibleAdditionalEvents = additionalSection.querySelectorAll('.event-bus-event:not([style*="display: none"])');
      const additionalParentSection = additionalSection.closest('details');
      if (additionalParentSection) {
        additionalParentSection.style.display = visibleAdditionalEvents.length > 0 ? 'block' : 'none';
      }
    }
  }

  // ADDED: Helper to render a single module entry for the dispatcher view
  _renderDispatcherModuleEntry(eventContainer, entry, eventName, moduleStates, publishCounts, propagationCounts) {
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
      
      // Add publish count with separate text span
      const count = publishCounts[eventName]?.get(moduleId) || 0;
      const textSpan = document.createElement('span');
      textSpan.classList.add('symbol-text');
      textSpan.textContent = `${senderSymbolText} ${count}`;
      senderCol.appendChild(textSpan);
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
      
      // Add propagation count with separate text span
      const propagationCount = propagationCounts[eventName]?.get(moduleId) || 0;
      const textSpan = document.createElement('span');
      textSpan.classList.add('symbol-text');
      textSpan.textContent = `${symbolsText} ${propagationCount}`;
      handlerCol.appendChild(textSpan);
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

  // Counter update methods
  _startCounterUpdates() {
    // Stop any existing timer
    this._stopCounterUpdates();
    
    // Start new timer for 1-second updates
    this.counterUpdateTimer = setInterval(() => {
      this._updateCounterDisplay();
    }, 1000);
    
    log('debug', '[EventsUI] Started counter update timer');
  }

  _stopCounterUpdates() {
    if (this.counterUpdateTimer) {
      clearInterval(this.counterUpdateTimer);
      this.counterUpdateTimer = null;
      log('debug', '[EventsUI] Stopped counter update timer');
    }
  }

  _updateCounterDisplay() {
    try {
      // Get fresh counter data
      const eventBusPublishCounts = eventBus.getAllPublishCounts();
      const eventDispatcherPublishCounts = window.eventDispatcher ? window.eventDispatcher.getAllPublishCounts() : {};
      const eventDispatcherPropagationCounts = window.eventDispatcher ? window.eventDispatcher.getAllPropagationCounts() : {};

      // Update EventBus publisher counts
      const publisherElements = this.eventBusSection.querySelectorAll('.publisher-symbol .symbol-text');
      publisherElements.forEach(textSpan => {
        // Only update if this text span already has content (is an actual publisher)
        if (textSpan.textContent && textSpan.textContent.trim()) {
          const eventName = textSpan.closest('.event-bus-event').querySelector('h4').textContent;
          const moduleId = textSpan.closest('.module-block').querySelector('.module-name').textContent;
          const count = eventBusPublishCounts[eventName]?.get(moduleId) || 0;
          textSpan.textContent = `[P] ${count}`;
        }
      });

      // Update EventDispatcher sender counts
      const senderElements = this.dispatcherSection.querySelectorAll('.sender-symbol .symbol-text');
      senderElements.forEach(textSpan => {
        // Only update if this text span already has content (is an actual sender)
        if (textSpan.textContent && textSpan.textContent.trim()) {
          // Get the event name and module ID from the DOM structure
          const eventName = textSpan.closest('.dispatcher-event').querySelector('h4').textContent;
          const moduleId = textSpan.closest('.module-block').querySelector('.module-name').textContent;
          const count = eventDispatcherPublishCounts[eventName]?.get(moduleId) || 0;
          
          // Preserve the original symbol but update the count
          const currentText = textSpan.textContent || '';
          const symbolMatch = currentText.match(/^([⬇️⬆️]|\[S\])/);
          const symbol = symbolMatch ? symbolMatch[1] : '[S]';
          textSpan.textContent = `${symbol} ${count}`;
        }
      });

      // Update EventDispatcher handler counts (propagation counts)
      const handlerElements = this.dispatcherSection.querySelectorAll('.handler-symbol .symbol-text');
      handlerElements.forEach(textSpan => {
        // Only update if this text span already has content (is an actual handler)
        if (textSpan.textContent && textSpan.textContent.trim()) {
          // Get the event name and module ID from the DOM structure
          const eventName = textSpan.closest('.dispatcher-event').querySelector('h4').textContent;
          const moduleId = textSpan.closest('.module-block').querySelector('.module-name').textContent;
          const count = eventDispatcherPropagationCounts[eventName]?.get(moduleId) || 0;
          
          // Preserve the original symbol but update the count
          const currentText = textSpan.textContent || '';
          const symbolMatch = currentText.match(/^([●↑↓⏳❓]+)/);
          const symbol = symbolMatch ? symbolMatch[1] : '●';
          textSpan.textContent = `${symbol} ${count}`;
        }
      });

    } catch (error) {
      log('error', '[EventsUI] Error updating counter display:', error);
    }
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
        this.moduleStateChangeHandler,
        this.moduleId
      );
      this.unsubscribeModuleState = null;
      log('info', '[EventsUI] Unsubscribed from module:stateChanged.');
    }

    // Stop counter update timer
    this._stopCounterUpdates();
    
    // Add any other cleanup needed
  }
}

// Export the class for the module index to use
export default EventsUI;

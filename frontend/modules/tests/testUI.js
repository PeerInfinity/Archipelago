// frontend/modules/tests/testUI.js
import { testLogic } from './testLogic.js';
import eventBus from '../../app/core/eventBus.js';

// Helper function for logging with fallback
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('testUI', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[testUI] ${message}`, ...data);
  }
}

export class TestUI {
  constructor(container, componentState) {
    this.container = container;
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'tests-panel-content panel-container';
    this.rootElement.style.padding = '10px';
    this.rootElement.style.height = '100%';
    this.rootElement.style.overflowY = 'auto';

    this.testListContainer = document.createElement('div');
    this.testListContainer.className = 'test-list-container';

    this.autoStartCheckbox = null; // Placeholder for the checkbox element

    this.unsubscribeHandles = [];

    this._buildInitialUI();
    // this.container.element.appendChild(this.rootElement); // REMOVED: Factory in init.js will handle this

    this._attachEventListeners(); // Listeners are attached once
    this._subscribeToLogicEvents();

    // Initial render might be better in onMount or triggered by an event
    // For now, let constructor still call it, assuming rootElement is populated.
    this.renderTestList().catch(console.error);

    // Container event listeners
    if (this.container && typeof this.container.on === 'function') {
      this.container.on('destroy', () => this.destroy());
      this.container.on('open', () =>
        this.renderTestList().catch(console.error)
      ); // Re-render when panel is opened/shown
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(container, componentState) {
    // container is the GoldenLayout ComponentContainer
    // componentState is the state passed by GoldenLayout
    log(
      'info',
      '[TestUI onMount] Called. Container:',
      container,
      'State:',
      componentState
    );
    // this.container = container; // Re-assign if necessary, though constructor already has it.
    // If initial rendering or setup needs to happen *after* DOM attachment, do it here.
    // For TestUI, constructor and 'open' event seem to cover initial rendering.
  }

  _buildInitialUI() {
    const controlsContainer = document.createElement('div');
    controlsContainer.className = 'test-panel-controls';
    controlsContainer.style.marginBottom = '10px';

    const runAllButton = document.createElement('button');
    runAllButton.textContent = 'Run All Enabled Tests';
    runAllButton.className = 'button run-all-tests-button';
    controlsContainer.appendChild(runAllButton);

    // Enable All checkbox
    const enableAllLabel = document.createElement('label');
    enableAllLabel.style.display = 'block';
    enableAllLabel.style.marginTop = '10px';
    enableAllLabel.style.fontWeight = 'bold';
    this.enableAllCheckbox = document.createElement('input');
    this.enableAllCheckbox.type = 'checkbox';
    this.enableAllCheckbox.id = 'enable-all-tests-checkbox';
    this.enableAllCheckbox.style.marginRight = '5px';
    enableAllLabel.appendChild(this.enableAllCheckbox);
    enableAllLabel.appendChild(
      document.createTextNode('Enable All Categories')
    );
    controlsContainer.appendChild(enableAllLabel);

    // Auto-start checkbox
    const autoStartLabel = document.createElement('label');
    autoStartLabel.style.display = 'block';
    autoStartLabel.style.marginTop = '10px';
    this.autoStartCheckbox = document.createElement('input');
    this.autoStartCheckbox.type = 'checkbox';
    this.autoStartCheckbox.id = 'auto-start-tests-checkbox';
    this.autoStartCheckbox.style.marginRight = '5px';
    this.autoStartCheckbox.checked = testLogic.shouldAutoStartTests(); // Set initial state
    autoStartLabel.appendChild(this.autoStartCheckbox);
    autoStartLabel.appendChild(
      document.createTextNode('Auto-start tests on application load')
    );
    controlsContainer.appendChild(autoStartLabel);

    this.overallStatusElement = document.createElement('div');
    this.overallStatusElement.className = 'overall-test-status';
    this.overallStatusElement.style.marginTop = '5px';
    controlsContainer.appendChild(this.overallStatusElement);

    this.rootElement.appendChild(controlsContainer);
    this.rootElement.appendChild(this.testListContainer);
  }

  _attachEventListeners() {
    this.rootElement
      .querySelector('.run-all-tests-button')
      .addEventListener('click', async () => {
        this.overallStatusElement.textContent = 'Running all tests...';
        this.overallStatusElement.style.color = 'lightblue'; // Indicate running
        try {
          await testLogic.runAllEnabledTests();
          // Summary is handled by 'test:allRunsCompleted' event
        } catch (error) {
          log('error', 'Error running all tests:', error);
          this.overallStatusElement.textContent = `Error: ${error.message}`;
          this.overallStatusElement.style.color = 'lightcoral';
        }
      });

    // Listener for the enable all checkbox
    if (this.enableAllCheckbox) {
      this.enableAllCheckbox.addEventListener('change', (event) => {
        testLogic.toggleAllCategoriesEnabled(event.target.checked);
      });
    }

    // Listener for the auto-start checkbox
    if (this.autoStartCheckbox) {
      this.autoStartCheckbox.addEventListener('change', (event) => {
        testLogic.setAutoStartTests(event.target.checked);
      });
    }

    this.testListContainer.addEventListener('click', (event) => {
      const target = event.target;
      const testItemElement = target.closest('.test-item');
      if (!testItemElement) return;

      const testId = testItemElement.dataset.testId;

      if (target.classList.contains('run-single-test-button')) {
        // Clear overall status when running a single test
        if (this.overallStatusElement)
          this.overallStatusElement.textContent = '';
        testLogic.runTest(testId);
      } else if (target.classList.contains('test-enable-checkbox')) {
        testLogic.toggleTestEnabled(testId, target.checked);
        // The list will re-render via 'test:listUpdated'
      } else if (target.classList.contains('move-test-up-button')) {
        testLogic.updateTestOrder(testId, 'up');
        // The list will re-render via 'test:listUpdated'
      } else if (target.classList.contains('move-test-down-button')) {
        testLogic.updateTestOrder(testId, 'down');
        // The list will re-render via 'test:listUpdated'
      }
    });
  }

  _subscribeToLogicEvents() {
    const handlers = {
      'test:listUpdated': (data) =>
        this.renderTestList(data.tests).catch(console.error),
      'test:statusChanged': (data) =>
        this.updateTestStatus(data.testId, data.status, data.eventWaitingFor),
      'test:conditionReported': (data) =>
        this.updateTestCondition(data.testId, {
          description: data.description,
          status: data.status,
        }),
      'test:completed': (data) => {
        log(
          'info',
          `[TestUI] Received test:completed event for ${data.testId}: ${data.overallStatus}`
        );
        this.updateTestStatus(data.testId, data.overallStatus);
      },
      'test:executionStarted': (data) => {
        /* Optionally handle test start indication */
      },
      'test:allRunsCompleted': (data) =>
        this.displayOverallSummary(data.summary),
      'test:logMessage': (data) =>
        this.logTestMessage(data.testId, data.message, data.type),
      'test:autoStartConfigChanged': (data) =>
        this.updateAutoStartCheckbox(data.autoStartEnabled),
      'test:allCategoriesChanged': (data) =>
        this.renderTestList().catch(console.error),
      'test:categoryChanged': (data) =>
        this.updateEnableAllCheckbox().catch(console.error),
      'test:categoriesUpdated': (data) =>
        this.renderTestList().catch(console.error),
    };

    for (const [eventName, handler] of Object.entries(handlers)) {
      const unsubscribe = eventBus.subscribe(eventName, handler.bind(this));
      this.unsubscribeHandles.push(unsubscribe);
    }
  }

  async renderTestList(testsToRender = null) {
    const tests = testsToRender || (await testLogic.getTests());
    this.testListContainer.innerHTML = '';

    if (!tests || tests.length === 0) {
      this.testListContainer.textContent = 'No tests defined yet.';
      return;
    }

    // Group tests by category
    const testsByCategory = {};
    tests.forEach((test) => {
      if (!testsByCategory[test.category]) {
        testsByCategory[test.category] = [];
      }
      testsByCategory[test.category].push(test);
    });

    // Get categories in the correct order from testLogic
    const orderedCategories = await testLogic.getCategories();

    // Create sections for each category in the correct order
    orderedCategories.forEach((category, categoryIndex) => {
      // Skip categories that have no tests
      if (!testsByCategory[category]) return;

      const categorySection = document.createElement('div');
      categorySection.className = 'test-category-section';
      categorySection.style.marginBottom = '20px';
      categorySection.style.border = '1px solid #444';
      categorySection.style.borderRadius = '4px';
      categorySection.style.padding = '10px';

      // Category header with enable/disable control
      const categoryHeader = document.createElement('div');
      categoryHeader.className = 'test-category-header';
      categoryHeader.style.display = 'flex';
      categoryHeader.style.alignItems = 'center';
      categoryHeader.style.marginBottom = '10px';
      categoryHeader.style.paddingBottom = '5px';
      categoryHeader.style.borderBottom = '1px solid #444';

      // Category reordering controls
      const categoryControls = document.createElement('div');
      categoryControls.style.display = 'flex';
      categoryControls.style.alignItems = 'center';
      categoryControls.style.marginRight = '10px';

      const upButton = document.createElement('button');
      upButton.textContent = '↑';
      upButton.className = 'button button-small move-category-up-button';
      upButton.title = 'Move Category Up';
      upButton.disabled = categoryIndex === 0;
      upButton.addEventListener('click', () => {
        testLogic.updateCategoryOrder(category, 'up');
      });
      categoryControls.appendChild(upButton);

      const downButton = document.createElement('button');
      downButton.textContent = '↓';
      downButton.className = 'button button-small move-category-down-button';
      downButton.title = 'Move Category Down';
      downButton.disabled = categoryIndex === orderedCategories.length - 1;
      downButton.addEventListener('click', () => {
        testLogic.updateCategoryOrder(category, 'down');
      });
      categoryControls.appendChild(downButton);

      categoryHeader.appendChild(categoryControls);

      const categoryLabel = document.createElement('label');
      categoryLabel.style.display = 'flex';
      categoryLabel.style.alignItems = 'center';
      categoryLabel.style.flex = '1';
      categoryLabel.style.fontWeight = 'bold';

      const categoryCheckbox = document.createElement('input');
      categoryCheckbox.type = 'checkbox';
      categoryCheckbox.className = 'test-category-checkbox';

      // NEW LOGIC for category checkbox state:
      const testsInThisCategory = testsByCategory[category];
      const allEnabledInCategory = testsInThisCategory.every(
        (t) => t.isEnabled
      );
      const anyEnabledInCategory = testsInThisCategory.some((t) => t.isEnabled);

      categoryCheckbox.checked = allEnabledInCategory;
      categoryCheckbox.indeterminate =
        !allEnabledInCategory && anyEnabledInCategory;

      categoryCheckbox.style.marginRight = '8px';
      categoryCheckbox.addEventListener('change', (event) => {
        const isEnabled = event.target.checked;
        testLogic.toggleCategoryEnabled(category, isEnabled);
        // Update all test checkboxes in this category (for immediate visual feedback)
        // This will be confirmed by the re-render triggered by 'test:listUpdated'
        const testCheckboxes = categorySection.querySelectorAll(
          '.test-enable-checkbox'
        );
        testCheckboxes.forEach((checkbox) => {
          checkbox.checked = isEnabled;
        });
      });
      categoryLabel.appendChild(categoryCheckbox);
      categoryLabel.appendChild(document.createTextNode(category));
      categoryHeader.appendChild(categoryLabel);

      // Add category-level run button
      const runCategoryButton = document.createElement('button');
      runCategoryButton.textContent = 'Run Category';
      runCategoryButton.className = 'button button-small run-category-button';
      runCategoryButton.style.marginLeft = '10px';
      runCategoryButton.addEventListener('click', async () => {
        const categoryTests = testsByCategory[category];
        for (const test of categoryTests) {
          if (test.isEnabled) {
            await testLogic.runTest(test.id);
          }
        }
      });
      categoryHeader.appendChild(runCategoryButton);

      categorySection.appendChild(categoryHeader);

      // Tests list for this category
      const testsList = document.createElement('ul');
      testsList.className = 'tests-ul';
      testsList.style.listStyle = 'none';
      testsList.style.padding = '0';

      testsByCategory[category].forEach((test, index) => {
        const li = document.createElement('li');
        li.className = 'test-item';
        li.dataset.testId = test.id;

        // Create controlsDiv first
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'test-item-controls';
        // Apply some styling to make it a clear top row
        controlsDiv.style.display = 'flex';
        controlsDiv.style.justifyContent = 'space-between'; // Changed from flex-start
        controlsDiv.style.marginBottom = '8px'; // Space below the button row
        controlsDiv.style.alignItems = 'center'; // Vertically align items in the controls row

        const enableLabel = document.createElement('label');
        enableLabel.style.display = 'flex'; // Align checkbox and text
        enableLabel.style.alignItems = 'center';
        const enableCheckbox = document.createElement('input');
        enableCheckbox.type = 'checkbox';
        enableCheckbox.className = 'test-enable-checkbox';
        enableCheckbox.checked = test.isEnabled;
        enableCheckbox.title = 'Enable/Disable Test';
        enableCheckbox.addEventListener('change', (event) => {
          testLogic.toggleTestEnabled(test.id, event.target.checked);
        });
        enableLabel.appendChild(enableCheckbox);
        enableLabel.appendChild(document.createTextNode('Enabled'));
        controlsDiv.appendChild(enableLabel);

        // Create a new div to group the action buttons on the right
        const actionButtonsGroup = document.createElement('div');
        actionButtonsGroup.style.display = 'flex';
        actionButtonsGroup.style.gap = '5px'; // Space between action buttons

        const upButton = document.createElement('button');
        upButton.textContent = '↑';
        upButton.className = 'button button-small move-test-up-button';
        upButton.title = 'Move Up';
        upButton.disabled = index === 0;
        actionButtonsGroup.appendChild(upButton); // Add to group

        const downButton = document.createElement('button');
        downButton.textContent = '↓';
        downButton.className = 'button button-small move-test-down-button';
        downButton.title = 'Move Down';
        downButton.disabled = index === testsByCategory[category].length - 1;
        actionButtonsGroup.appendChild(downButton); // Add to group

        const runButton = document.createElement('button');
        runButton.textContent = 'Run';
        runButton.className = 'button button-small run-single-test-button';
        actionButtonsGroup.appendChild(runButton); // Add to group

        controlsDiv.appendChild(actionButtonsGroup); // Add the group to the main controlsDiv

        // Append controls to the list item first
        li.appendChild(controlsDiv);

        // Then create and append name/description
        const nameDescDiv = document.createElement('div');
        nameDescDiv.className = 'test-item-name-desc';
        // Ensure it takes full width and elements stack
        nameDescDiv.style.marginBottom = '5px'; // Space below description

        const nameEl = document.createElement('strong');
        nameEl.textContent = test.name;
        nameEl.style.display = 'block'; // Ensure it takes its own line
        nameEl.style.marginBottom = '3px'; // Space between title and description
        nameDescDiv.appendChild(nameEl);

        if (test.description) {
          const descEl = document.createElement('p');
          descEl.textContent = test.description;
          descEl.style.margin = '0'; // Remove default paragraph margins
          nameDescDiv.appendChild(descEl);
        }
        li.appendChild(nameDescDiv);

        const statusEl = document.createElement('div');
        statusEl.className = 'test-status-display';
        statusEl.dataset.statusFor = test.id;
        this.updateTestStatusElement(
          statusEl,
          test.status,
          test.currentEventWaitingFor
        );
        li.appendChild(statusEl);

        const conditionsEl = document.createElement('ul');
        conditionsEl.className = 'test-conditions-list';
        conditionsEl.dataset.conditionsFor = test.id;
        test.conditions.forEach((cond) => {
          const condItem = document.createElement('li');
          condItem.textContent = `${cond.status === 'passed' ? '✅' : '❌'} ${
            cond.description
          }`;
          condItem.classList.add(
            cond.status === 'passed' ? 'condition-passed' : 'condition-failed'
          );
          conditionsEl.appendChild(condItem);
        });
        li.appendChild(conditionsEl);

        const logArea = document.createElement('div');
        logArea.className = 'test-log-area';
        logArea.dataset.logFor = test.id;
        li.appendChild(logArea);

        testsList.appendChild(li);
      });

      categorySection.appendChild(testsList);
      this.testListContainer.appendChild(categorySection);
    });

    // Update the Enable All checkbox state after rendering
    this.updateEnableAllCheckbox().catch(console.error);
  }

  updateTestStatusElement(element, status, eventWaitingFor = null) {
    if (!element) return;
    element.textContent = `Status: ${status || 'pending'}`;
    if (status === 'waiting_for_event' && eventWaitingFor) {
      element.textContent += ` (Waiting for: ${eventWaitingFor})`;
    }
    // Remove old status classes and add the new one
    element.classList.remove(
      'test-status-pending',
      'test-status-running',
      'test-status-waiting_for_event',
      'test-status-passed',
      'test-status-failed',
      'test-status-disabled'
    );
    element.classList.add(`test-status-${status || 'pending'}`);
  }

  updateTestStatus(testId, status, eventWaitingFor = null) {
    const statusEl = this.testListContainer.querySelector(
      `.test-status-display[data-status-for="${testId}"]`
    );
    if (statusEl) {
      this.updateTestStatusElement(statusEl, status, eventWaitingFor);
    }
    if (status === 'running' || status === 'pending') {
      const conditionsList = this.testListContainer.querySelector(
        `.test-conditions-list[data-conditions-for="${testId}"]`
      );
      if (conditionsList) conditionsList.innerHTML = '';
      const logArea = this.testListContainer.querySelector(
        `.test-log-area[data-log-for="${testId}"]`
      );
      if (logArea) logArea.innerHTML = '';
    }
  }

  updateTestCondition(testId, condition) {
    const conditionsList = this.testListContainer.querySelector(
      `.test-conditions-list[data-conditions-for="${testId}"]`
    );
    if (conditionsList) {
      const condItem = document.createElement('li');
      condItem.textContent = `${condition.status === 'passed' ? '✅' : '❌'} ${
        condition.description
      }`;
      condItem.classList.add(
        condition.status === 'passed' ? 'condition-passed' : 'condition-failed'
      );
      conditionsList.appendChild(condItem);
    }
  }

  logTestMessage(testId, message, type) {
    const logArea = this.testListContainer.querySelector(
      `.test-log-area[data-log-for="${testId}"]`
    );
    if (logArea) {
      const logEntry = document.createElement('div');
      logEntry.textContent = message;
      logEntry.classList.add(`test-log-${type}`); // Use class for styling
      logArea.appendChild(logEntry);
      logArea.scrollTop = logArea.scrollHeight;
    }
  }

  displayOverallSummary(summary) {
    if (this.overallStatusElement) {
      this.overallStatusElement.textContent = `All tests finished. Passed: ${summary.passedCount}, Failed: ${summary.failedCount}, Total: ${summary.totalRun}.`;
      this.overallStatusElement.style.color =
        summary.failedCount > 0 ? 'lightcoral' : 'lightgreen';
    }
  }

  updateAutoStartCheckbox(isEnabled) {
    if (this.autoStartCheckbox) {
      this.autoStartCheckbox.checked = isEnabled;
    }
  }

  async updateEnableAllCheckbox() {
    if (!this.enableAllCheckbox) return;

    try {
      const state = await testLogic.getAllCategoriesState();
      this.enableAllCheckbox.checked = state.allEnabled;
      this.enableAllCheckbox.indeterminate =
        !state.allEnabled && (state.anyEnabled || state.anyIndeterminate);
    } catch (error) {
      log('error', 'Error updating Enable All checkbox:', error);
    }
  }

  destroy() {
    log(
      'info',
      '[TestUI] Destroying TestUI panel and unsubscribing from events.'
    );
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];
  }
}

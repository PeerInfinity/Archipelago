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
    this.hideDisabledCheckbox = null; // Placeholder for the hide disabled checkbox
    this.randomizeOrderCheckbox = null; // Placeholder for the randomize order checkbox

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
    controlsContainer.style.display = 'flex';
    controlsContainer.style.flexDirection = 'column';
    controlsContainer.style.alignItems = 'flex-start'; // Left align all items
    controlsContainer.style.gap = '10px';

    // Button container for horizontal layout
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '10px';
    buttonContainer.style.flexWrap = 'wrap';

    const runAllButton = document.createElement('button');
    runAllButton.textContent = 'Run All Enabled Tests';
    runAllButton.className = 'button run-all-tests-button';
    runAllButton.style.display = 'block';
    runAllButton.style.width = 'fit-content';
    buttonContainer.appendChild(runAllButton);

    const exportButton = document.createElement('button');
    exportButton.textContent = 'Export Results to JSON';
    exportButton.className = 'button export-results-button';
    exportButton.style.display = 'block';
    exportButton.style.width = 'fit-content';
    buttonContainer.appendChild(exportButton);

    controlsContainer.appendChild(buttonContainer);

    // Auto-start checkbox
    const autoStartLabel = document.createElement('label');
    autoStartLabel.style.display = 'block';
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

    // Enable All checkbox
    const enableAllLabel = document.createElement('label');
    enableAllLabel.style.display = 'block';
    enableAllLabel.style.fontWeight = 'bold';
    this.enableAllCheckbox = document.createElement('input');
    this.enableAllCheckbox.type = 'checkbox';
    this.enableAllCheckbox.id = 'enable-all-tests-checkbox';
    this.enableAllCheckbox.style.marginRight = '5px';
    enableAllLabel.appendChild(this.enableAllCheckbox);
    enableAllLabel.appendChild(
      document.createTextNode('Enable All Tests')
    );
    controlsContainer.appendChild(enableAllLabel);

    // Hide Disabled Tests checkbox
    const hideDisabledLabel = document.createElement('label');
    hideDisabledLabel.style.display = 'block';
    this.hideDisabledCheckbox = document.createElement('input');
    this.hideDisabledCheckbox.type = 'checkbox';
    this.hideDisabledCheckbox.id = 'hide-disabled-tests-checkbox';
    this.hideDisabledCheckbox.style.marginRight = '5px';
    this.hideDisabledCheckbox.checked = testLogic.shouldHideDisabledTests(); // Set initial state
    hideDisabledLabel.appendChild(this.hideDisabledCheckbox);
    hideDisabledLabel.appendChild(
      document.createTextNode('Hide Disabled Tests')
    );
    controlsContainer.appendChild(hideDisabledLabel);

    // Randomize Order checkbox
    const randomizeOrderLabel = document.createElement('label');
    randomizeOrderLabel.style.display = 'block';
    this.randomizeOrderCheckbox = document.createElement('input');
    this.randomizeOrderCheckbox.type = 'checkbox';
    this.randomizeOrderCheckbox.id = 'randomize-order-tests-checkbox';
    this.randomizeOrderCheckbox.style.marginRight = '5px';
    this.randomizeOrderCheckbox.checked = testLogic.shouldRandomizeOrder(); // Set initial state
    randomizeOrderLabel.appendChild(this.randomizeOrderCheckbox);
    randomizeOrderLabel.appendChild(
      document.createTextNode('Randomize Test Order')
    );
    controlsContainer.appendChild(randomizeOrderLabel);

    this.overallStatusElement = document.createElement('div');
    this.overallStatusElement.className = 'overall-test-status';
    this.overallStatusElement.style.display = 'block';
    this.overallStatusElement.style.minHeight = '20px'; // Reserve space even when empty
    this.overallStatusElement.textContent = 'Idle'; // Set initial message
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
          // Summary is handled by 'tests:allRunsCompleted' event
        } catch (error) {
          log('error', 'Error running all tests:', error);
          this.overallStatusElement.textContent = `Error: ${error.message}`;
          this.overallStatusElement.style.color = 'lightcoral';
        }
      });

    this.rootElement
      .querySelector('.export-results-button')
      .addEventListener('click', async () => {
        try {
          await this.exportTestResults();
        } catch (error) {
          log('error', 'Error exporting test results:', error);
          alert(`Error exporting test results: ${error.message}`);
        }
      });

    // Listener for the enable all checkbox
    if (this.enableAllCheckbox) {
      this.enableAllCheckbox.addEventListener('change', (event) => {
        testLogic.toggleAllTestsEnabled(event.target.checked);
      });
    }

    // Listener for the auto-start checkbox
    if (this.autoStartCheckbox) {
      this.autoStartCheckbox.addEventListener('change', (event) => {
        testLogic.setAutoStartTests(event.target.checked);
      });
    }

    // Listener for the hide disabled tests checkbox
    if (this.hideDisabledCheckbox) {
      this.hideDisabledCheckbox.addEventListener('change', (event) => {
        testLogic.setHideDisabledTests(event.target.checked);
      });
    }

    // Listener for the randomize order checkbox
    if (this.randomizeOrderCheckbox) {
      this.randomizeOrderCheckbox.addEventListener('change', (event) => {
        testLogic.setRandomizeOrder(event.target.checked);
      });
    }

    this.testListContainer.addEventListener('click', (event) => {
      const target = event.target;
      const testItemElement = target.closest('.test-item');
      if (!testItemElement) return;

      const testId = testItemElement.dataset.testId;

      if (target.classList.contains('run-single-test-button')) {
        // Show which test is running
        if (this.overallStatusElement) {
          const test = testLogic.getTests().then(tests => {
            const currentTest = tests.find(t => t.id === testId);
            if (currentTest) {
              this.overallStatusElement.textContent = `Running test: ${currentTest.name}`;
              this.overallStatusElement.style.color = 'lightblue';
            }
          }).catch(console.error);
        }
        testLogic.runTest(testId);
      } else if (target.classList.contains('test-enable-checkbox')) {
        testLogic.toggleTestEnabled(testId, target.checked);
        // The list will re-render via 'tests:listUpdated'
      } else if (target.classList.contains('move-test-up-button')) {
        testLogic.updateTestOrder(testId, 'up');
        // The list will re-render via 'tests:listUpdated'
      } else if (target.classList.contains('move-test-down-button')) {
        testLogic.updateTestOrder(testId, 'down');
        // The list will re-render via 'tests:listUpdated'
      }
    });
  }

  _subscribeToLogicEvents() {
    const handlers = {
      'tests:listUpdated': (data) =>
        this.renderTestList(data.tests).catch(console.error),
      'tests:statusChanged': (data) =>
        this.updateTestStatus(data.testId, data.status, data.eventWaitingFor),
      'tests:conditionReported': (data) =>
        this.updateTestCondition(data.testId, {
          description: data.description,
          status: data.status,
        }),
      'tests:completed': (data) => {
        log(
          'info',
          `[TestUI] Received test:completed event for ${data.testId}: ${data.overallStatus}`
        );
        this.updateTestStatus(data.testId, data.overallStatus);
        // Reset overall status to Idle when a single test completes
        if (this.overallStatusElement && this.overallStatusElement.textContent.startsWith('Running test:')) {
          this.overallStatusElement.textContent = 'Idle';
          this.overallStatusElement.style.color = '';
        }
      },
      'tests:executionStarted': (data) => {
        /* Optionally handle test start indication */
      },
      'tests:allRunsCompleted': (data) =>
        this.displayOverallSummary(data.summary),
      'tests:logMessage': (data) =>
        this.logTestMessage(data.testId, data.message, data.type),
      'tests:autoStartConfigChanged': (data) =>
        this.updateAutoStartCheckbox(data.autoStartEnabled),
      'tests:hideDisabledConfigChanged': (data) =>
        this.updateHideDisabledCheckbox(data.hideDisabledEnabled),
      'tests:randomizeOrderConfigChanged': (data) =>
        this.updateRandomizeOrderCheckbox(data.randomizeOrderEnabled),
      'tests:allTestsChanged': (data) =>
        this.renderTestList().catch(console.error),
      'tests:testChanged': (data) =>
        this.updateEnableAllCheckbox().catch(console.error),
    };

    for (const [eventName, handler] of Object.entries(handlers)) {
      const unsubscribe = eventBus.subscribe(eventName, handler.bind(this), 'tests');
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

    // Check if we should hide disabled tests
    const shouldHideDisabled = testLogic.shouldHideDisabledTests();

    // Filter tests if hiding disabled tests
    const filteredTests = shouldHideDisabled ? tests.filter(test => test.isEnabled) : tests;

    // Create tests list container
    const testsList = document.createElement('ul');
    testsList.className = 'tests-ul';
    testsList.style.listStyle = 'none';
    testsList.style.padding = '0';

    filteredTests.forEach((test, index) => {
      const li = document.createElement('li');
      li.className = 'test-item';
      li.dataset.testId = test.id;
      li.style.marginBottom = '15px';
      li.style.padding = '10px';
      li.style.border = '1px solid #444';
      li.style.borderRadius = '4px';

      // Create controlsDiv first
      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'test-item-controls';
      controlsDiv.style.display = 'flex';
      controlsDiv.style.justifyContent = 'space-between';
      controlsDiv.style.marginBottom = '8px';
      controlsDiv.style.alignItems = 'center';

      const enableLabel = document.createElement('label');
      enableLabel.style.display = 'flex';
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
      actionButtonsGroup.style.gap = '5px';
      actionButtonsGroup.style.alignItems = 'center';

      // Add order display
      const orderDisplay = document.createElement('span');
      orderDisplay.textContent = `${test.order}`;
      orderDisplay.style.marginRight = '10px';
      orderDisplay.style.fontSize = '12px';
      orderDisplay.style.color = '#888';
      orderDisplay.title = 'Test Order';
      actionButtonsGroup.appendChild(orderDisplay);

      const upButton = document.createElement('button');
      upButton.textContent = '↑';
      upButton.className = 'button button-small move-test-up-button';
      upButton.title = 'Move Up';
      upButton.disabled = index === 0;
      actionButtonsGroup.appendChild(upButton);

      const downButton = document.createElement('button');
      downButton.textContent = '↓';
      downButton.className = 'button button-small move-test-down-button';
      downButton.title = 'Move Down';
      downButton.disabled = index === filteredTests.length - 1;
      actionButtonsGroup.appendChild(downButton);

      const runButton = document.createElement('button');
      runButton.textContent = 'Run';
      runButton.className = 'button button-small run-single-test-button';
      actionButtonsGroup.appendChild(runButton);

      controlsDiv.appendChild(actionButtonsGroup);
      li.appendChild(controlsDiv);

      // Category and name/description
      const nameDescDiv = document.createElement('div');
      nameDescDiv.className = 'test-item-name-desc';
      nameDescDiv.style.marginBottom = '5px';

      // Display category in bold font above test name
      if (test.category) {
        const categoryEl = document.createElement('div');
        categoryEl.textContent = test.category;
        categoryEl.style.fontWeight = 'bold';
        categoryEl.style.color = '#aaa';
        categoryEl.style.marginBottom = '2px';
        nameDescDiv.appendChild(categoryEl);
      }

      const nameEl = document.createElement('strong');
      nameEl.textContent = test.name;
      nameEl.style.display = 'block';
      nameEl.style.marginBottom = '3px';
      nameDescDiv.appendChild(nameEl);

      if (test.description) {
        const descEl = document.createElement('p');
        descEl.textContent = test.description;
        descEl.style.margin = '0';
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

    this.testListContainer.appendChild(testsList);

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
    // Get previous status BEFORE updating the element
    const statusEl = this.testListContainer.querySelector(
      `.test-status-display[data-status-for="${testId}"]`
    );
    
    let previousStatus = null;
    if (statusEl) {
      const classList = Array.from(statusEl.classList);
      const statusClass = classList.find(cls => 
        cls.startsWith('test-status-') && cls !== 'test-status-display'
      );
      if (statusClass) {
        previousStatus = statusClass.replace('test-status-', '');
      }
    }
    
    // Update the status element
    if (statusEl) {
      this.updateTestStatusElement(statusEl, status, eventWaitingFor);
    }
    
    // Clear UI immediately when we know clearing should happen (synchronously)
    // This matches the same logic as in testState.js for when state gets cleared
    this._clearUIIfNeeded(testId, status, previousStatus);
  }
  
  _clearUIIfNeeded(testId, newStatus, previousStatus) {
    // Apply the same clearing logic as testState.js
    const shouldClear = (
      (newStatus === 'running' && (previousStatus === 'pending' || previousStatus === 'disabled' || previousStatus === 'passed' || previousStatus === 'failed' || !previousStatus)) ||
      (newStatus === 'pending')
    );
    
    if (shouldClear) {
      const conditionsList = this.testListContainer.querySelector(
        `.test-conditions-list[data-conditions-for="${testId}"]`
      );
      if (conditionsList) {
        conditionsList.innerHTML = '';
      }
      
      const logArea = this.testListContainer.querySelector(
        `.test-log-area[data-log-for="${testId}"]`
      );
      if (logArea) {
        logArea.innerHTML = '';
      }
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
      let message = `All tests finished. Passed: ${summary.passedCount}, Failed: ${summary.failedCount}, Total: ${summary.totalRun}`;
      
      // Add failed conditions count if available
      if (summary.failedConditionsCount !== undefined) {
        message += `, Failed Subtests: ${summary.failedConditionsCount}`;
      }
      
      message += '.';
      this.overallStatusElement.textContent = message;
      this.overallStatusElement.style.color =
        summary.failedCount > 0 ? 'lightcoral' : 'lightgreen';
    }
  }

  updateAutoStartCheckbox(isEnabled) {
    if (this.autoStartCheckbox) {
      this.autoStartCheckbox.checked = isEnabled;
    }
  }

  updateHideDisabledCheckbox(isEnabled) {
    if (this.hideDisabledCheckbox) {
      this.hideDisabledCheckbox.checked = isEnabled;
    }
    // Trigger re-render to apply filtering
    this.renderTestList().catch(console.error);
  }

  updateRandomizeOrderCheckbox(isEnabled) {
    if (this.randomizeOrderCheckbox) {
      this.randomizeOrderCheckbox.checked = isEnabled;
    }
  }

  async updateEnableAllCheckbox() {
    if (!this.enableAllCheckbox) return;

    try {
      const tests = await testLogic.getTests();
      const allEnabled = tests.every(test => test.isEnabled);
      const anyEnabled = tests.some(test => test.isEnabled);

      this.enableAllCheckbox.checked = allEnabled;
      this.enableAllCheckbox.indeterminate = !allEnabled && anyEnabled;
    } catch (error) {
      log('error', 'Error updating Enable All checkbox:', error);
    }
  }

  async exportTestResults() {
    try {
      const tests = await testLogic.getTests();

      // Calculate summary statistics
      const totalRun = tests.filter(t => t.status === 'passed' || t.status === 'failed').length;
      const passedCount = tests.filter(t => t.status === 'passed').length;
      const failedCount = tests.filter(t => t.status === 'failed').length;

      // Count failed conditions/subtests
      let failedConditionsCount = 0;
      tests.forEach(test => {
        if (test.conditions && Array.isArray(test.conditions)) {
          failedConditionsCount += test.conditions.filter(c => c.status === 'failed').length;
        }
      });

      // Build the export data structure
      const exportData = {
        exportedAt: new Date().toISOString(),
        summary: {
          totalRun,
          passedCount,
          failedCount,
          failedConditionsCount,
          totalTests: tests.length,
          enabledTests: tests.filter(t => t.isEnabled).length,
          disabledTests: tests.filter(t => !t.isEnabled).length
        },
        testDetails: tests.map(test => {
          // Calculate duration if start and end times are available
          let durationMs = null;
          if (test.startTime && test.endTime) {
            const start = new Date(test.startTime);
            const end = new Date(test.endTime);
            durationMs = end - start;
          }

          return {
            id: test.id,
            name: test.name,
            description: test.description,
            category: test.category,
            status: test.status,
            isEnabled: test.isEnabled,
            order: test.order,
            startTime: test.startTime || null,
            endTime: test.endTime || null,
            durationMs: durationMs,
            conditions: test.conditions || [],
            logs: test.logs || []
          };
        })
      };

      // Create a downloadable JSON file
      const jsonString = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      // Create a temporary link and trigger download
      const link = document.createElement('a');
      link.href = url;
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      link.download = `test-results-${timestamp}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      log('info', `Test results exported successfully: ${link.download}`);

      // Show success message in the UI
      if (this.overallStatusElement) {
        const previousText = this.overallStatusElement.textContent;
        const previousColor = this.overallStatusElement.style.color;
        this.overallStatusElement.textContent = `Results exported to ${link.download}`;
        this.overallStatusElement.style.color = 'lightgreen';

        // Restore previous message after 3 seconds
        setTimeout(() => {
          this.overallStatusElement.textContent = previousText;
          this.overallStatusElement.style.color = previousColor;
        }, 3000);
      }
    } catch (error) {
      log('error', 'Error exporting test results:', error);
      throw error;
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

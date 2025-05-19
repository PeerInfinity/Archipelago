// frontend/modules/tests/testUI.js
import { testLogic } from './testLogic.js';
import eventBus from '../../app/core/eventBus.js';

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
    this.renderTestList();

    // Container event listeners
    if (this.container && typeof this.container.on === 'function') {
      this.container.on('destroy', () => this.destroy());
      this.container.on('open', () => this.renderTestList()); // Re-render when panel is opened/shown
    }
  }

  getRootElement() {
    return this.rootElement;
  }

  onMount(container, componentState) {
    // container is the GoldenLayout ComponentContainer
    // componentState is the state passed by GoldenLayout
    console.log(
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
          console.error('Error running all tests:', error);
          this.overallStatusElement.textContent = `Error: ${error.message}`;
          this.overallStatusElement.style.color = 'lightcoral';
        }
      });

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
      'test:listUpdated': (data) => this.renderTestList(data.tests),
      'test:statusChanged': (data) =>
        this.updateTestStatus(data.testId, data.status, data.eventWaitingFor),
      'test:conditionReported': (data) =>
        this.updateTestCondition(data.testId, data.condition),
      'test:executionStarted': (data) => {
        /* Optionally handle test start indication */
      },
      'test:allRunsCompleted': (data) =>
        this.displayOverallSummary(data.summary),
      'test:logMessage': (data) =>
        this.logTestMessage(data.testId, data.message, data.type),
      'test:autoStartConfigChanged': (data) =>
        this.updateAutoStartCheckbox(data.autoStartEnabled),
    };

    for (const [eventName, handler] of Object.entries(handlers)) {
      const unsubscribe = eventBus.subscribe(eventName, handler.bind(this));
      this.unsubscribeHandles.push(unsubscribe);
    }
  }

  renderTestList(testsToRender = null) {
    const tests = testsToRender || testLogic.getTests(); // Get sorted list
    this.testListContainer.innerHTML = '';

    if (!tests || tests.length === 0) {
      this.testListContainer.textContent = 'No tests defined yet.';
      return;
    }

    const ul = document.createElement('ul');
    ul.className = 'tests-ul'; // Consistent class name
    ul.style.listStyle = 'none';
    ul.style.padding = '0';

    tests.forEach((test, index) => {
      // Added index for button disabling
      const li = document.createElement('li');
      li.className = 'test-item';
      li.dataset.testId = test.id;
      // Basic styling applied in index.css

      const header = document.createElement('div');
      header.className = 'test-item-header'; // Use class for styling

      const nameDescDiv = document.createElement('div');
      nameDescDiv.className = 'test-item-name-desc'; // Class for styling
      const nameEl = document.createElement('strong');
      nameEl.textContent = test.name;
      nameDescDiv.appendChild(nameEl);

      if (test.description) {
        const descEl = document.createElement('p');
        descEl.textContent = test.description;
        nameDescDiv.appendChild(descEl);
      }
      header.appendChild(nameDescDiv);

      const controlsDiv = document.createElement('div');
      controlsDiv.className = 'test-item-controls';

      const enableLabel = document.createElement('label');
      const enableCheckbox = document.createElement('input');
      enableCheckbox.type = 'checkbox';
      enableCheckbox.className = 'test-enable-checkbox';
      enableCheckbox.checked = test.isEnabled;
      enableCheckbox.title = 'Enable/Disable Test';
      enableLabel.appendChild(enableCheckbox);
      enableLabel.appendChild(document.createTextNode('Enabled'));
      controlsDiv.appendChild(enableLabel);

      const upButton = document.createElement('button');
      upButton.textContent = '↑';
      upButton.className = 'button button-small move-test-up-button';
      upButton.title = 'Move Up';
      upButton.disabled = index === 0; // Disable if first item
      controlsDiv.appendChild(upButton);

      const downButton = document.createElement('button');
      downButton.textContent = '↓';
      downButton.className = 'button button-small move-test-down-button';
      downButton.title = 'Move Down';
      downButton.disabled = index === tests.length - 1; // Disable if last item
      controlsDiv.appendChild(downButton);

      const runButton = document.createElement('button');
      runButton.textContent = 'Run';
      runButton.className = 'button button-small run-single-test-button';
      controlsDiv.appendChild(runButton);

      header.appendChild(controlsDiv);
      li.appendChild(header);

      const statusEl = document.createElement('div');
      statusEl.className = 'test-status-display';
      statusEl.dataset.statusFor = test.id; // For easier selection
      this.updateTestStatusElement(
        statusEl,
        test.status,
        test.currentEventWaitingFor
      );
      li.appendChild(statusEl);

      const conditionsEl = document.createElement('ul');
      conditionsEl.className = 'test-conditions-list';
      conditionsEl.dataset.conditionsFor = test.id; // For easier selection
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
      logArea.dataset.logFor = test.id; // For easier selection
      li.appendChild(logArea);

      ul.appendChild(li);
    });
    this.testListContainer.appendChild(ul);
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
      'test-status-failed'
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

  destroy() {
    console.log(
      '[TestUI] Destroying TestUI panel and unsubscribing from events.'
    );
    this.unsubscribeHandles.forEach((unsub) => unsub());
    this.unsubscribeHandles = [];
  }
}

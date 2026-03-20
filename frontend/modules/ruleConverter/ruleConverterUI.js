/**
 * Rule Converter Panel UI
 *
 * Provides a dual-editor interface for converting between Python code
 * and Archipelago-CC JSON rule format.
 */

import { getModuleEventBus } from './index.js';
import { convertJsonToPython, convertJsonToLambda, convertJsonToFunction } from './jsonToPython.js';
import { convertPythonToJson } from './pythonToJson.js';

// Helper function for logging
function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('ruleConverterUI', message, ...data);
  } else {
    const consoleMethod = console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`[ruleConverterUI] ${message}`, ...data);
  }
}

/**
 * Rule Converter Panel UI Component
 */
class RuleConverterUI {
  constructor(container, componentState) {
    Object.defineProperty(this, 'eventBus', { get: () => getModuleEventBus(), configurable: true });
    log('info', 'RuleConverterUI instance created');
    this.container = container;
    this.componentState = componentState;

    this.rootElement = document.createElement('div');
    this.rootElement.className = 'rule-converter-panel';

    // State
    this.pythonFormat = 'expression';
    this.debounceTimer = null;
    this.isConverting = false;
    this.lastEditedPane = null;

    // Build UI
    this._createUI();

    // Handle panel destruction
    this.container.on('destroy', () => this.onPanelDestroy());

    // Subscribe to events
    this._subscribeToEvents();
  }

  _createUI() {
    // Inject styles
    this._injectStyles();

    this.rootElement.innerHTML = `
      <div class="converter-header">
        <span class="converter-title">Rule Format Converter</span>
        <div class="converter-controls">
          <label>
            Format:
            <select class="format-select">
              <option value="expression">Expression</option>
              <option value="lambda">Lambda</option>
              <option value="function">Function</option>
            </select>
          </label>
        </div>
      </div>

      <div class="converter-editors">
        <div class="editor-pane python-pane">
          <div class="pane-header">
            <span class="pane-title">Python</span>
            <div class="pane-actions">
              <button class="btn-copy-python">Copy</button>
              <button class="btn-clear-python">Clear</button>
            </div>
          </div>
          <textarea class="python-editor" spellcheck="false" placeholder="Enter Python code..."></textarea>
        </div>

        <div class="converter-divider">
          <span class="direction-indicator"></span>
        </div>

        <div class="editor-pane json-pane">
          <div class="pane-header">
            <span class="pane-title">JSON</span>
            <div class="pane-actions">
              <button class="btn-copy-json">Copy</button>
              <button class="btn-format-json">Format</button>
              <button class="btn-clear-json">Clear</button>
            </div>
          </div>
          <textarea class="json-editor" spellcheck="false" placeholder="Enter JSON rule..."></textarea>
        </div>
      </div>

      <div class="converter-messages">
        <div class="warnings-panel" style="display: none;">
          <div class="warnings-title">Warnings</div>
          <div class="warnings-list"></div>
        </div>
        <div class="error-panel" style="display: none;">
          <div class="error-title">Error</div>
          <div class="error-content"></div>
        </div>
      </div>

      <div class="converter-status">
        <div class="status-left">
          <span class="status-indicator"></span>
          <span class="status-message">Ready</span>
        </div>
        <div class="status-right">
          <span class="timing"></span>
        </div>
      </div>
    `;

    // Get references to elements
    this.pythonEditor = this.rootElement.querySelector('.python-editor');
    this.jsonEditor = this.rootElement.querySelector('.json-editor');
    this.formatSelect = this.rootElement.querySelector('.format-select');
    this.statusIndicator = this.rootElement.querySelector('.status-indicator');
    this.statusMessage = this.rootElement.querySelector('.status-message');
    this.timing = this.rootElement.querySelector('.timing');
    this.errorPanel = this.rootElement.querySelector('.error-panel');
    this.errorContent = this.rootElement.querySelector('.error-content');
    this.warningsPanel = this.rootElement.querySelector('.warnings-panel');
    this.warningsList = this.rootElement.querySelector('.warnings-list');
    this.directionIndicator = this.rootElement.querySelector('.direction-indicator');

    // Bind event handlers
    this._bindEvents();

    // Set initial example
    this.pythonEditor.value = "state.has('Sword') and state.has('Shield')";
    this._scheduleConversion('python');
  }

  _injectStyles() {
    if (document.getElementById('rule-converter-styles')) return;

    const style = document.createElement('style');
    style.id = 'rule-converter-styles';
    style.textContent = `
      .rule-converter-panel {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: #1a1a2e;
        color: #eee;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      .converter-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 12px;
        background: #16213e;
        border-bottom: 1px solid #0f3460;
      }

      .converter-title {
        font-weight: 500;
        color: #e94560;
      }

      .converter-controls select {
        background: #0f3460;
        color: #eee;
        border: 1px solid #e94560;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
      }

      .converter-editors {
        flex: 1;
        display: flex;
        min-height: 0;
      }

      .editor-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }

      .converter-divider {
        width: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #16213e;
        border-left: 1px solid #0f3460;
        border-right: 1px solid #0f3460;
      }

      .direction-indicator {
        color: #e94560;
        font-size: 16px;
        opacity: 0;
        transition: opacity 0.2s;
      }

      .direction-indicator.visible {
        opacity: 1;
      }

      .pane-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 10px;
        background: #16213e;
        border-bottom: 1px solid #0f3460;
      }

      .pane-title {
        font-size: 0.85rem;
        color: #888;
      }

      .pane-actions {
        display: flex;
        gap: 6px;
      }

      .pane-actions button {
        background: #0f3460;
        color: #eee;
        border: none;
        padding: 3px 8px;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.75rem;
      }

      .pane-actions button:hover {
        background: #e94560;
      }

      .python-editor,
      .json-editor {
        flex: 1;
        width: 100%;
        padding: 10px;
        background: #0a0a15;
        color: #eee;
        border: none;
        resize: none;
        font-family: 'Fira Code', 'Monaco', 'Menlo', monospace;
        font-size: 13px;
        line-height: 1.5;
      }

      .python-editor:focus,
      .json-editor:focus {
        outline: none;
      }

      .converter-messages {
        max-height: 120px;
        overflow-y: auto;
      }

      .warnings-panel {
        background: #2d2a1b;
        border-top: 1px solid #5c5028;
        padding: 8px 12px;
      }

      .warnings-title {
        color: #fbbf24;
        font-weight: 500;
        font-size: 0.85rem;
        margin-bottom: 6px;
      }

      .warnings-list {
        font-size: 0.8rem;
        color: #fcd34d;
      }

      .error-panel {
        background: #2d1b1b;
        border-top: 1px solid #5c2828;
        padding: 8px 12px;
      }

      .error-title {
        color: #f87171;
        font-weight: 500;
        font-size: 0.85rem;
        margin-bottom: 6px;
      }

      .error-content {
        font-family: monospace;
        font-size: 0.8rem;
        color: #fca5a5;
        white-space: pre-wrap;
      }

      .converter-status {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        background: #16213e;
        border-top: 1px solid #0f3460;
        font-size: 0.8rem;
      }

      .status-left {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .status-indicator {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #666;
      }

      .status-indicator.success {
        background: #4ade80;
      }

      .status-indicator.error {
        background: #f87171;
      }

      .status-indicator.warning {
        background: #fbbf24;
      }

      .status-message {
        color: #888;
      }

      .timing {
        color: #666;
      }
    `;

    document.head.appendChild(style);
  }

  _bindEvents() {
    // Python editor changes
    this.pythonEditor.addEventListener('input', () => {
      this.lastEditedPane = 'python';
      this._scheduleConversion('python');
    });

    // JSON editor changes
    this.jsonEditor.addEventListener('input', () => {
      this.lastEditedPane = 'json';
      this._scheduleConversion('json');
    });

    // Format select change
    this.formatSelect.addEventListener('change', () => {
      this.pythonFormat = this.formatSelect.value;
      if (this.jsonEditor.value.trim()) {
        this._convertJsonToPython(this.jsonEditor.value);
      }
    });

    // Button handlers
    this.rootElement.querySelector('.btn-copy-python').addEventListener('click', () => {
      navigator.clipboard.writeText(this.pythonEditor.value);
      this._setStatus('success', 'Copied Python');
    });

    this.rootElement.querySelector('.btn-copy-json').addEventListener('click', () => {
      navigator.clipboard.writeText(this.jsonEditor.value);
      this._setStatus('success', 'Copied JSON');
    });

    this.rootElement.querySelector('.btn-clear-python').addEventListener('click', () => {
      this.pythonEditor.value = '';
      this._hideError();
      this._hideWarnings();
      this._setStatus('', 'Ready');
    });

    this.rootElement.querySelector('.btn-clear-json').addEventListener('click', () => {
      this.jsonEditor.value = '';
      this._hideError();
      this._hideWarnings();
      this._setStatus('', 'Ready');
    });

    this.rootElement.querySelector('.btn-format-json').addEventListener('click', () => {
      try {
        const json = JSON.parse(this.jsonEditor.value);
        this.jsonEditor.value = JSON.stringify(json, null, 2);
        this._setStatus('success', 'Formatted');
      } catch (e) {
        this._showError('Cannot format: Invalid JSON');
      }
    });
  }

  _subscribeToEvents() {
    // Listen for requests to set content
    this.eventBus.subscribe('ruleConverter:setJson', (data) => {
      if (data && data.rule) {
        const jsonStr = typeof data.rule === 'string' ? data.rule : JSON.stringify(data.rule, null, 2);
        this.jsonEditor.value = jsonStr;
        if (data.convert !== false) {
          this._convertJsonToPython(jsonStr);
        }
      }
    });

    this.eventBus.subscribe('ruleConverter:setPython', (data) => {
      if (data && data.code) {
        this.pythonEditor.value = data.code;
        if (data.convert !== false) {
          this._convertPythonToJson(data.code);
        }
      }
    });
  }

  _scheduleConversion(source) {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this._setStatus('', 'Typing...');
    this._hideError();
    this._hideWarnings();

    this.debounceTimer = setTimeout(() => {
      if (source === 'python') {
        const code = this.pythonEditor.value;
        if (code.trim()) {
          this._showDirection('\u2192'); // Right arrow
          this._convertPythonToJson(code);
        } else {
          this.jsonEditor.value = '';
          this._setStatus('', 'Ready');
        }
      } else if (source === 'json') {
        const json = this.jsonEditor.value;
        if (json.trim()) {
          this._showDirection('\u2190'); // Left arrow
          this._convertJsonToPython(json);
        } else {
          this.pythonEditor.value = '';
          this._setStatus('', 'Ready');
        }
      }
    }, 400);
  }

  _convertPythonToJson(code) {
    if (this.isConverting) return;
    this.isConverting = true;

    const start = performance.now();

    try {
      const result = convertPythonToJson(code);
      const elapsed = Math.round(performance.now() - start);

      if (result.success) {
        this._hideError();
        this._showWarnings(result.warnings);

        if (result.rule !== null) {
          this.jsonEditor.value = JSON.stringify(result.rule, null, 2);
        } else {
          this.jsonEditor.value = '';
        }

        this.timing.textContent = `${elapsed}ms`;
        this._setStatus('success', 'Converted');

        // Publish event
        this.eventBus.publish('ruleConverter:conversionComplete', {
          direction: 'python-to-json',
          python: code,
          json: result.rule,
        });
      } else {
        this._showError(result.errors.join('\n'));

        this.eventBus.publish('ruleConverter:conversionError', {
          direction: 'python-to-json',
          error: result.errors.join('\n'),
        });
      }
    } catch (e) {
      this._showError('Conversion error: ' + e.message);
    } finally {
      this.isConverting = false;
    }
  }

  _convertJsonToPython(jsonStr) {
    if (this.isConverting) return;
    this.isConverting = true;

    const start = performance.now();

    try {
      // Parse JSON first
      let rule;
      try {
        rule = JSON.parse(jsonStr);
      } catch (e) {
        this._showError('Invalid JSON: ' + e.message);
        this.isConverting = false;
        return;
      }

      // Convert based on format
      let result;
      if (this.pythonFormat === 'lambda') {
        result = convertJsonToLambda(rule);
      } else if (this.pythonFormat === 'function') {
        result = convertJsonToFunction(rule);
      } else {
        result = convertJsonToPython(rule);
      }

      const elapsed = Math.round(performance.now() - start);

      if (result.success) {
        this._hideError();
        this._showWarnings(result.warnings);

        this.pythonEditor.value = result.code || '';
        this.timing.textContent = `${elapsed}ms`;
        this._setStatus('success', 'Converted');

        this.eventBus.publish('ruleConverter:conversionComplete', {
          direction: 'json-to-python',
          python: result.code,
          json: rule,
        });
      } else {
        this._showError(result.errors.join('\n'));

        this.eventBus.publish('ruleConverter:conversionError', {
          direction: 'json-to-python',
          error: result.errors.join('\n'),
        });
      }
    } catch (e) {
      this._showError('Conversion error: ' + e.message);
    } finally {
      this.isConverting = false;
    }
  }

  _setStatus(type, message) {
    this.statusIndicator.className = 'status-indicator' + (type ? ' ' + type : '');
    this.statusMessage.textContent = message;
  }

  _showError(error) {
    this.errorPanel.style.display = 'block';
    this.errorContent.textContent = error;
    this._setStatus('error', 'Error');
  }

  _hideError() {
    this.errorPanel.style.display = 'none';
  }

  _showWarnings(warnings) {
    if (warnings && warnings.length > 0) {
      this.warningsPanel.style.display = 'block';
      this.warningsList.innerHTML = warnings.map((w) => `<div>\u2022 ${this._escapeHtml(w)}</div>`).join('');
    } else {
      this.warningsPanel.style.display = 'none';
    }
  }

  _hideWarnings() {
    this.warningsPanel.style.display = 'none';
  }

  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  _showDirection(dir) {
    this.directionIndicator.textContent = dir;
    this.directionIndicator.classList.add('visible');
    setTimeout(() => this.directionIndicator.classList.remove('visible'), 400);
  }

  onPanelDestroy() {
    log('info', 'RuleConverterUI destroyed');
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
  }

  // Required by Golden Layout
  getRootElement() {
    return this.rootElement;
  }
}

export default RuleConverterUI;

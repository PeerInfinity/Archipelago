/**
 * ProofGraphUI — Cytoscape-based graph construction puzzle for MetaMath Medium mode.
 *
 * The player sees proof step nodes and must draw dependency edges between them.
 * Correct edges stick; incorrect edges are rejected with visual feedback.
 * When all incoming edges for a step are drawn, the step becomes checkable.
 */

import {
  createEventBusGetter,
  createLogger,
  hasProofStructure,
  syncStateFromSnapshot,
  ensureStateLoaded,
  dispatchLocationCheck,
} from '../proofShared/proofUIHelpers.js';
import proofGraphState from './proofGraphStateSingleton.js';

// Module-level references set by index.js
let _moduleEventBus = null;
let _dispatcher = null;

export function setModuleEventBus(bus) { _moduleEventBus = bus; }
export function setDispatcher(dispatcher) { _dispatcher = dispatcher; }

const getEventBus = createEventBusGetter('proofGraph', () => _moduleEventBus);
const log = createLogger('proofGraphUI');

export class ProofGraphUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.rootElement = null;
    this.unsubscribeHandles = [];
    this.isInitialized = false;

    // Cytoscape instance
    this.cy = null;
    this.cytoscape = null;
    this.eh = null; // edgehandles instance
    this.nodeRows = new Map(); // Row assignment per node for hierarchical layout

    // DOM references
    this._headerEl = null;
    this._toolbarEl = null;
    this._graphContainer = null;
    this._statusEl = null;

    // Track in-flight check to prevent double-clicks
    this._checkingStep = null;

    // Currently visible step indices in the graph
    this._visibleSteps = new Set();

    this._createBaseUI();
    this._setupLifecycle();
  }

  getRootElement() {
    return this.rootElement;
  }

  // ─── Base UI Construction ────────────────────────────────

  _createBaseUI() {
    this.rootElement = document.createElement('div');
    this.rootElement.className = 'proof-graph-panel';

    // Header
    this._headerEl = document.createElement('div');
    this._headerEl.className = 'pg-header';
    this._headerEl.textContent = proofGraphState.structureType === 'graph' ? 'Connection Graph' : 'Proof Graph';
    this.rootElement.appendChild(this._headerEl);

    // Toolbar
    this._toolbarEl = document.createElement('div');
    this._toolbarEl.className = 'pg-toolbar';
    this._toolbarEl.innerHTML = `
      <button class="pg-btn pg-btn-layout" title="Re-run layout algorithm">Re-layout</button>
      <button class="pg-btn pg-btn-fit" title="Fit graph to viewport">Fit</button>
      <button class="pg-btn pg-btn-check" title="Check a fully-connected node">Check Next</button>
    `;
    this.rootElement.appendChild(this._toolbarEl);

    // Graph container
    this._graphContainer = document.createElement('div');
    this._graphContainer.className = 'pg-graph-container';
    this.rootElement.appendChild(this._graphContainer);

    // Status bar
    this._statusEl = document.createElement('div');
    this._statusEl.className = 'pg-status';
    this._statusEl.textContent = 'Load a game to begin.';
    this.rootElement.appendChild(this._statusEl);

    // Toolbar handlers
    this._toolbarEl.querySelector('.pg-btn-layout').addEventListener('click', () => this._runLayout());
    this._toolbarEl.querySelector('.pg-btn-fit').addEventListener('click', () => this._fitGraph());
    this._toolbarEl.querySelector('.pg-btn-check').addEventListener('click', () => this._onCheckNext());

    this._toolbarEl.style.display = 'none';
  }

  // ─── Lifecycle ────────────────────────────────────────────

  _setupLifecycle() {
    Object.defineProperty(this, 'eventBus', {
      get: () => getEventBus(),
      configurable: true,
    });

    this._attachListeners();
    this.container.on('destroy', () => this.destroy());
    this.container.on('show', () => this._onPanelShow());

    // Late-initialization: if proof data is already loaded (e.g. component
    // created after stateManager:rulesLoaded already fired), start immediately.
    if (proofGraphState.isLoaded && !this.cy) {
      log('info', 'State already loaded at construction time — starting Cytoscape load');
      syncStateFromSnapshot(proofGraphState);
      this._loadCytoscape();
    } else if (hasProofStructure() && !proofGraphState.isLoaded) {
      log('info', 'Graph structure available but state not loaded — loading from static data');
      ensureStateLoaded(proofGraphState);
      if (proofGraphState.isLoaded) {
        syncStateFromSnapshot(proofGraphState);
        this._loadCytoscape();
      }
    }
  }

  _attachListeners() {
    this.destroy();

    const subscribe = (eventName, handler) => {
      const unsub = this.eventBus.subscribe(eventName, handler.bind(this));
      this.unsubscribeHandles.push(unsub);
    };

    subscribe('stateManager:rulesLoaded', this._handleRulesLoaded);
    subscribe('stateManager:snapshotUpdated', this._handleSnapshotUpdated);
    subscribe('stateManager:inventoryChanged', this._handleInventoryChanged);
    subscribe('proofQueue:hypAssigned', this._handleHypAssigned);
  }

  destroy() {
    this.unsubscribeHandles.forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    this.unsubscribeHandles = [];
    this._destroyGraph();
  }

  _onPanelShow() {
    if (this.cy) {
      this.cy.resize();
    } else if (this.cytoscape && proofGraphState.isLoaded) {
      this._initializeGraph();
    }
  }

  // ─── Cytoscape Loading ────────────────────────────────────

  _loadCytoscape() {
    // Prevent duplicate load attempts
    if (this._cytoscapeLoading || this.cy) return;

    log('info', 'Loading Cytoscape libraries...');
    this._statusEl.textContent = 'Loading graph libraries...';

    this._cytoscapeLoading = true;

    // Load scripts then initialize. Use window globals as source of truth
    // for whether each script is already loaded (avoids DOM query race conditions).
    const scripts = [
      { src: './libs/cytoscape/cytoscape.min.js', check: () => window.cytoscape, label: 'Cytoscape core' },
      { src: './libs/cytoscape/lodash-shim.js', check: () => window._, label: 'Lodash shim' },
      { src: './libs/cytoscape/cytoscape-edgehandles.js', check: () => window.cytoscapeEdgehandles, label: 'Edgehandles' },
    ];

    const loadNext = (idx) => {
      if (idx >= scripts.length) {
        // All loaded — register and initialize
        this.cytoscape = window.cytoscape;
        log('info', 'Cytoscape libraries loaded');
        this._cytoscapeLoading = false;
        this._statusEl.textContent = 'Initializing graph...';
        this._initializeGraph();
        return;
      }

      const { src, check, label } = scripts[idx];
      this._statusEl.textContent = `Loading ${label}...`;

      // Already available via window global? Skip loading.
      if (check()) {
        log('info', `${label} already available`);
        loadNext(idx + 1);
        return;
      }

      this._loadScript(src, () => {
        log('info', `${label} loaded`);
        loadNext(idx + 1);
      });
    };

    loadNext(0);
  }

  _loadScript(src, onload) {
    // Check for an existing script element (may have been inserted by another code path)
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      // Script tag exists — it may be still loading. Wait for it.
      if (existing.complete || existing.readyState === 'complete') {
        onload();
        return;
      }
      let handled = false;
      const done = () => {
        if (handled) return;
        handled = true;
        onload();
      };
      existing.addEventListener('load', done);
      setTimeout(() => { if (!handled) done(); }, 5000); // Safety fallback
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.onload = () => onload();
    script.onerror = (err) => {
      log('error', `Failed to load ${src}`, err);
      this._statusEl.textContent = `Error loading library: ${src}`;
      this._cytoscapeLoading = false;
    };
    document.head.appendChild(script);
  }

  // ─── Graph Initialization ─────────────────────────────────

  _initializeGraph() {
    if (this.cy) return; // Already initialized

    if (!this.cytoscape || !proofGraphState.isLoaded) {
      log('info', 'Waiting for Cytoscape or proof data...');
      return;
    }

    const rect = this._graphContainer.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      log('info', 'Container not visible, deferring to tab show event');
      this._statusEl.textContent = 'Waiting for panel to become visible...';
      return;
    }

    log('info', 'Initializing graph...');

    // Update header based on structure type
    this._headerEl.textContent = proofGraphState.structureType === 'graph' ? 'Connection Graph' : 'Proof Graph';

    // Auto-draw edges for any steps already checked before graph init
    const autoDrawn = proofGraphState.autoDrawEdgesForCheckedSteps();
    if (autoDrawn.length > 0) {
      log('info', `Auto-connected ${autoDrawn.length} edges for pre-checked steps`);
    }

    // Build node elements
    const elements = this._buildGraphElements();

    // Create Cytoscape instance
    this.cy = this.cytoscape({
      container: this._graphContainer,
      elements: elements,
      style: this._getGraphStyles(),
      layout: { name: 'preset' }, // We'll run layout after adding elements
      minZoom: 0.3,
      maxZoom: 3,
    });

    // Initialize edgehandles
    this._initEdgehandles();

    // Node click handler: check step (ignore port nodes)
    this.cy.on('tap', 'node.proof-node', (evt) => {
      const node = evt.target;
      const stepIndex = parseInt(node.id(), 10);
      if (proofGraphState.isStepCheckable(stepIndex)) {
        this._checkStep(stepIndex);
      }
    });

    // Show toolbar
    this._toolbarEl.style.display = '';

    // Wire state callbacks
    this._wireStateCallbacks();

    // Resize handler: keep Cytoscape in sync with container size changes.
    this._resizeObserver = new ResizeObserver(() => {
      if (this.cy) this.cy.resize();
    });
    this._resizeObserver.observe(this._graphContainer);

    // Schedule the initial layout using rAF chaining to ensure the browser
    // has painted the Cytoscape canvas at its final container size.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.cy) {
          this.cy.resize();
          this._runLayout();
        }
      });
    });

    // Update status
    this._updateStatus();
    this._updateNodeClasses();

    log('info', 'Graph initialized');
  }

  _buildGraphElements() {
    const elements = [];

    // Only include visible steps
    this._visibleSteps = proofGraphState.getVisibleSteps();

    for (const [index, step] of proofGraphState.steps) {
      if (!this._visibleSteps.has(index)) continue;

      const isAxiom = step.dependencies.length === 0;
      const isCheckable = proofGraphState.isStepCheckable(index);
      const isChecked = proofGraphState.checkedLocations.has(step.locationName);
      const isComplete = proofGraphState._isStepFullyConnected(index);

      const classes = ['proof-node'];
      if (isAxiom) classes.push('axiom');
      if (isCheckable) classes.push('checkable');
      if (isChecked) classes.push('checked');
      if (isComplete && !isChecked) classes.push('connected');
      if (index === proofGraphState.goalStepIndex) classes.push('goal');
      elements.push({
        group: 'nodes',
        data: {
          id: String(index),
          label: step.label,
          expression: step.expression,
          depCount: step.dependencies.length,
          fullText: step.fullText || '',
        },
        classes: classes.join(' '),
      });

      // Add port nodes for each dependency slot
      for (let slot = 0; slot < step.dependencies.length; slot++) {
        const dep = step.dependencies[slot];
        const edgeKey = `${dep}->${index}:${slot}`;
        const filled = proofGraphState.drawnEdges.has(edgeKey);
        elements.push({
          group: 'nodes',
          data: {
            id: `port-${index}-${slot}`,
            slot,
            portOf: index,
          },
          classes: `port-node${filled ? ' port-filled' : ''}`,
        });
      }
    }

    // Add already-drawn edges (only if both endpoints are visible)
    for (const edgeKey of proofGraphState.drawnEdges) {
      const edge = proofGraphState.correctEdges.get(edgeKey);
      if (edge && this._visibleSteps.has(edge.source) && this._visibleSteps.has(edge.target)) {
        elements.push({
          group: 'edges',
          data: {
            id: `edge-${edgeKey}`,
            source: String(edge.source),
            target: `port-${edge.target}-${edge.slot}`,
          },
          classes: 'drawn-edge',
        });
      }
    }

    return elements;
  }

  _getGraphStyles() {
    return [
      // ─── Base Node Style ────────────────────────
      {
        selector: 'node.proof-node',
        style: {
          'label': 'data(label)',
          'text-valign': 'center',
          'text-halign': 'center',
          'font-size': '11px',
          'font-weight': 'bold',
          'color': '#cdd6f4',
          'text-outline-color': '#1e1e2e',
          'text-outline-width': '2px',
          'width': '60px',
          'height': '40px',
          'shape': 'roundrectangle',
          'background-color': '#45475a',
          'border-width': '2px',
          'border-color': '#585b70',
          'text-wrap': 'wrap',
          'text-max-width': '55px',
        },
      },
      // ─── Port node (input connector) ───────────
      {
        selector: 'node.port-node',
        style: {
          'width': '8px',
          'height': '8px',
          'shape': 'ellipse',
          'background-color': '#585b70',
          'border-width': '1px',
          'border-color': '#45475a',
          'label': '',
          'events': 'no',
        },
      },
      // ─── Filled port ──────────────────────────
      {
        selector: 'node.port-filled',
        style: {
          'background-color': '#a6e3a1',
          'border-color': '#6c7086',
        },
      },
      // ─── Axiom (no deps) ────────────────────────
      {
        selector: 'node.axiom',
        style: {
          'background-color': '#313244',
          'border-color': '#89b4fa',
          'border-style': 'dashed',
        },
      },
      // ─── Fully connected (all edges drawn, waiting on items/proofs) ──
      {
        selector: 'node.connected',
        style: {
          'background-color': '#2a2520',
          'border-color': '#f9e2af',
          'border-width': '3px',
        },
      },
      // ─── Checkable (connected + not checked) ────
      {
        selector: 'node.checkable',
        style: {
          'background-color': '#1a3328',
          'border-color': '#a6e3a1',
          'border-width': '4px',
        },
      },
      // ─── Checked (location complete) ────────────
      {
        selector: 'node.checked',
        style: {
          'background-color': '#11111b',
          'border-color': '#6c7086',
          'border-width': '2px',
          'opacity': 0.6,
          'color': '#6c7086',
        },
      },
      // ─── Goal node ──────────────────────────────
      {
        selector: 'node.goal',
        style: {
          'width': '70px',
          'height': '50px',
          'border-width': '3px',
          'font-size': '12px',
        },
      },
      // ─── Drawn edge ─────────────────────────────
      {
        selector: 'edge.drawn-edge',
        style: {
          'width': 2,
          'line-color': '#a6e3a1',
          'target-arrow-color': '#a6e3a1',
          'target-arrow-shape': 'triangle',
          'curve-style': 'straight',
          'opacity': 0.8,
        },
      },
      // ─── Edgehandles ghost/preview ──────────────
      {
        selector: '.eh-ghost-edge',
        style: {
          'width': 2,
          'line-color': '#89b4fa',
          'target-arrow-color': '#89b4fa',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'opacity': 0.5,
          'line-style': 'dashed',
        },
      },
      {
        selector: '.eh-preview',
        style: {
          'background-color': '#89b4fa',
          'border-color': '#89b4fa',
          'border-width': '3px',
        },
      },
      {
        selector: '.eh-source',
        style: {
          'border-color': '#89b4fa',
          'border-width': '3px',
        },
      },
      {
        selector: '.eh-target',
        style: {
          'border-color': '#f9e2af',
          'border-width': '3px',
        },
      },
      {
        selector: '.eh-presumptive-target',
        style: {
          'border-color': '#f9e2af',
          'border-width': '3px',
        },
      },
      // ─── Reject flash ──────────────────────────
      {
        selector: 'node.reject-flash',
        style: {
          'border-color': '#f38ba8',
          'border-width': '4px',
          'background-color': '#2a1a22',
        },
      },
      // ─── Success flash ─────────────────────────
      {
        selector: 'node.success-flash',
        style: {
          'border-color': '#a6e3a1',
          'border-width': '4px',
          'background-color': '#1a3328',
        },
      },
    ];
  }

  // ─── Edgehandles ──────────────────────────────────────────

  _initEdgehandles() {
    if (!this.cy || !window.cytoscapeEdgehandles) {
      log('warn', 'Cannot init edgehandles: missing dependencies');
      return;
    }

    this.eh = this.cy.edgehandles({
      snap: true,
      snapThreshold: 30,
      snapFrequency: 15,
      noEdgeEventsInDraw: true,
      disableBrowserGestures: true,

      // Can we start drawing from this node?
      handleNodes: 'node.proof-node',

      // Preview (ghost) edge while drawing
      preview: true,
      ghostEdgePairs: true,

      // Can this edge be created? Allow any non-self-loop attempt.
      // For correct deps, allow if there's an unfilled slot. For incorrect
      // deps, allow so the player gets rejection feedback.
      canConnect: (sourceNode, targetNode) => {
        // Port nodes are not valid edge targets
        if (targetNode.hasClass('port-node')) return false;
        const sourceIdx = parseInt(sourceNode.id(), 10);
        const targetIdx = parseInt(targetNode.id(), 10);
        if (sourceIdx === targetIdx) return false;
        // If this is a known dependency, only allow if an unfilled slot remains
        if (proofGraphState._hasAnySlot(sourceIdx, targetIdx)) {
          return proofGraphState.hasUnfilledSlot(sourceIdx, targetIdx);
        }
        // Unknown dependency — allow attempt (will be rejected with feedback)
        return true;
      },

      // Edge parameters for the created edge
      edgeParams: (sourceNode, targetNode) => {
        return {
          data: {
            source: sourceNode.id(),
            target: targetNode.id(),
          },
          classes: 'drawn-edge',
        };
      },
    });

    // Handle edge completion via Cytoscape event.
    this.cy.on('ehcomplete', (event, sourceNode, targetNode, addedEdge) => {
      const sourceIdx = parseInt(sourceNode.id(), 10);
      const targetIdx = parseInt(targetNode.id(), 10);

      const result = proofGraphState.tryDrawEdge(sourceIdx, targetIdx);

      if (result.success) {
        // Cytoscape edges are immutable in source/target, so replace with
        // a new edge that targets the port node directly.
        addedEdge.remove();

        const portId = `port-${targetIdx}-${result.slot}`;
        const edgeKey = `${sourceIdx}->${targetIdx}:${result.slot}`;
        this.cy.add({
          group: 'edges',
          data: {
            id: `edge-${edgeKey}`,
            source: String(sourceIdx),
            target: portId,
          },
          classes: 'drawn-edge',
        });

        // Mark port as filled
        this.cy.getElementById(portId).addClass('port-filled');

        this._flashNode(targetNode, 'success-flash');
        // Move target node to the row below its source nodes
        this._updateRowAfterEdge(targetIdx);
        this._layoutFromRows(true);
        log('info', `Edge drawn: ${sourceIdx} -> ${targetIdx} (slot ${result.slot})`);
      } else {
        // Remove the edge that edgehandles added
        addedEdge.remove();

        if (result.reason === 'incorrect') {
          this._flashNode(targetNode, 'reject-flash');
          this._flashNode(sourceNode, 'reject-flash');
          log('info', `Edge rejected: ${sourceIdx} -> ${targetIdx}`);
        }
      }

      this._updateNodeClasses();
      this._updateStatus();
    });

    // Enable drawing mode
    this.eh.enableDrawMode();

    log('info', 'Edgehandles initialized and draw mode enabled');
  }

  // ─── Node Class Updates ───────────────────────────────────

  _updateNodeClasses() {
    if (!this.cy) return;

    for (const [index, step] of proofGraphState.steps) {
      const node = this.cy.getElementById(String(index));
      if (node.empty()) continue;

      const isAxiom = step.dependencies.length === 0;
      const isCheckable = proofGraphState.isStepCheckable(index);
      const isChecked = proofGraphState.checkedLocations.has(step.locationName);
      const isComplete = proofGraphState._isStepFullyConnected(index);

      // Update classes
      node.removeClass('axiom connected checkable checked');
      if (isChecked) {
        node.addClass('checked');
      } else if (isCheckable) {
        node.addClass('checkable');
      } else if (isComplete) {
        node.addClass('connected');
      } else if (isAxiom) {
        node.addClass('axiom');
      }

      // Update port fill states
      for (let slot = 0; slot < step.dependencies.length; slot++) {
        const dep = step.dependencies[slot];
        const portNode = this.cy.getElementById(`port-${index}-${slot}`);
        if (portNode.empty()) continue;
        const edgeKey = `${dep}->${index}:${slot}`;
        if (proofGraphState.drawnEdges.has(edgeKey)) {
          portNode.addClass('port-filled');
        } else {
          portNode.removeClass('port-filled');
        }
      }
    }
  }

  _flashNode(node, className) {
    node.addClass(className);
    setTimeout(() => {
      node.removeClass(className);
    }, 600);
  }

  // ─── Visibility Sync ────────────────────────────────────────

  /**
   * Add newly visible nodes (and their ports) to the Cytoscape graph.
   * Returns true if any nodes were added, requiring a re-layout.
   */
  _syncVisibleNodes(animate) {
    if (!this.cy) return false;

    const newVisible = proofGraphState.getVisibleSteps();
    const added = [];

    for (const index of newVisible) {
      if (this._visibleSteps.has(index)) continue;

      const step = proofGraphState.steps.get(index);
      if (!step) continue;

      const isAxiom = step.dependencies.length === 0;
      const isCheckable = proofGraphState.isStepCheckable(index);
      const isChecked = proofGraphState.checkedLocations.has(step.locationName);
      const isComplete = proofGraphState._isStepFullyConnected(index);

      const classes = ['proof-node'];
      if (isAxiom) classes.push('axiom');
      if (isCheckable) classes.push('checkable');
      if (isChecked) classes.push('checked');
      if (isComplete && !isChecked) classes.push('connected');
      if (index === proofGraphState.goalStepIndex) classes.push('goal');

      // Add step node
      this.cy.add({
        group: 'nodes',
        data: {
          id: String(index),
          label: step.label,
          expression: step.expression,
          depCount: step.dependencies.length,
          fullText: step.fullText || '',
        },
        classes: classes.join(' '),
      });

      // Add port nodes
      for (let slot = 0; slot < step.dependencies.length; slot++) {
        const dep = step.dependencies[slot];
        const edgeKey = `${dep}->${index}:${slot}`;
        const filled = proofGraphState.drawnEdges.has(edgeKey);
        this.cy.add({
          group: 'nodes',
          data: {
            id: `port-${index}-${slot}`,
            slot,
            portOf: index,
          },
          classes: `port-node${filled ? ' port-filled' : ''}`,
        });
      }

      // Temporary row — _recalculateAllRows will place it properly
      this.nodeRows.set(String(index), 0);
      added.push(index);
    }

    // Add any drawn edges for newly visible nodes whose both endpoints are now visible
    if (added.length > 0) {
      const allVisible = new Set([...this._visibleSteps, ...added]);
      for (const edgeKey of proofGraphState.drawnEdges) {
        const edge = proofGraphState.correctEdges.get(edgeKey);
        if (!edge) continue;
        if (!allVisible.has(edge.source) || !allVisible.has(edge.target)) continue;
        // Only add if the edge element doesn't already exist
        if (this.cy.getElementById(`edge-${edgeKey}`).nonempty()) continue;
        this.cy.add({
          group: 'edges',
          data: {
            id: `edge-${edgeKey}`,
            source: String(edge.source),
            target: `port-${edge.target}-${edge.slot}`,
          },
          classes: 'drawn-edge',
        });
      }
    }

    this._visibleSteps = newVisible;

    if (added.length > 0) {
      log('info', `Added ${added.length} newly visible nodes`);
      this._recalculateAllRows();
      if (animate !== false) this._layoutFromRows(true);
      return true;
    }
    return false;
  }

  // ─── Layout ───────────────────────────────────────────────

  _runLayout() {
    if (!this.cy) return;

    // Force Cytoscape to re-read the container dimensions
    this.cy.resize();

    this._recalculateAllRows();
    this._layoutFromRows(false);
  }

  // ─── Auto-connect Checked Steps ─────────────────────────────

  /**
   * For any checked step with undrawn incoming edges, auto-draw them
   * in both state and Cytoscape. Returns true if any edges were added.
   */
  _autoConnectCheckedSteps(animate) {
    if (!this.cy) return false;

    const newEdges = proofGraphState.autoDrawEdgesForCheckedSteps();
    if (newEdges.length === 0) return false;

    let addedToGraph = false;
    for (const { source, target, slot, edgeKey } of newEdges) {
      // Only add edge if both endpoints are visible in the graph
      if (!this._visibleSteps.has(source) || !this._visibleSteps.has(target)) continue;

      const portId = `port-${target}-${slot}`;

      // Add edge element targeting the port
      this.cy.add({
        group: 'edges',
        data: {
          id: `edge-${edgeKey}`,
          source: String(source),
          target: portId,
        },
        classes: 'drawn-edge',
      });

      // Mark port as filled
      this.cy.getElementById(portId).addClass('port-filled');

      // Update row assignment for target
      this._updateRowAfterEdge(target);
      addedToGraph = true;
    }

    if (addedToGraph && animate !== false) this._layoutFromRows(true);
    log('info', `Auto-connected ${newEdges.length} edges for checked steps`);
    return true;
  }

  // ─── Row-based Layout Helpers ──────────────────────────────

  /**
   * Recalculate all node rows from scratch based on drawn edges.
   * Axioms go to row 0. Fully-connected non-axioms are placed at
   * max(source rows) + 1. Unconnected non-axioms are collected into
   * a reserved bottom row below all connected nodes.
   */
  _recalculateAllRows() {
    this.nodeRows.clear();

    // Pass 1: assign axioms to row 0, others temporarily to row 1
    const unconnected = [];
    for (const index of this._visibleSteps) {
      const step = proofGraphState.steps.get(index);
      if (!step) continue;
      if (step.dependencies.length === 0) {
        this.nodeRows.set(String(index), 0);
      } else {
        this.nodeRows.set(String(index), 1);
        if (!proofGraphState._isStepFullyConnected(index)) {
          unconnected.push(index);
        }
      }
    }

    // Pass 2: recompute rows for connected nodes via drawn edges
    const visited = new Set();
    const visit = (idx) => {
      const id = String(idx);
      if (visited.has(id)) return;
      if (!this._visibleSteps.has(idx)) return;
      visited.add(id);

      const drawnSources = proofGraphState.getDrawnDependenciesFor(idx);
      if (drawnSources.length === 0) return;

      for (const srcIdx of drawnSources) {
        visit(srcIdx);
      }

      let maxSourceRow = 0;
      for (const srcIdx of drawnSources) {
        const srcRow = this.nodeRows.get(String(srcIdx)) || 0;
        if (srcRow > maxSourceRow) maxSourceRow = srcRow;
      }

      const newRow = maxSourceRow + 1;
      if (newRow > (this.nodeRows.get(id) || 0)) {
        this.nodeRows.set(id, newRow);
      }
    };

    for (const index of this._visibleSteps) {
      visit(index);
    }

    // Pass 3: place unconnected non-axioms in a bottom row
    if (unconnected.length > 0) {
      let maxRow = 0;
      for (const row of this.nodeRows.values()) {
        if (row > maxRow) maxRow = row;
      }
      const bottomRow = maxRow + 1;
      for (const index of unconnected) {
        this.nodeRows.set(String(index), bottomRow);
      }
    }
  }

  /**
   * Update row assignment for a target node after a new edge is drawn.
   */
  _updateRowAfterEdge(targetIdx) {
    const targetId = String(targetIdx);
    const drawnSources = proofGraphState.getDrawnDependenciesFor(targetIdx);
    if (drawnSources.length === 0) return;

    let maxSourceRow = 0;
    for (const srcIdx of drawnSources) {
      const srcRow = this.nodeRows.get(String(srcIdx)) || 0;
      if (srcRow > maxSourceRow) maxSourceRow = srcRow;
    }

    const newRow = maxSourceRow + 1;
    const currentRow = this.nodeRows.get(targetId) || 0;

    if (newRow > currentRow) {
      this.nodeRows.set(targetId, newRow);

      // Cascade: update targets of outgoing drawn edges
      for (const edgeKey of proofGraphState.drawnEdges) {
        const edge = proofGraphState.correctEdges.get(edgeKey);
        if (edge && edge.source === targetIdx) {
          this._updateRowAfterEdge(edge.target);
        }
      }
    }
  }

  /**
   * Position all nodes based on their current row assignments.
   * @param {boolean} animate - Whether to animate the transition
   */
  _layoutFromRows(animate = false) {
    if (!this.cy) return;

    // Group nodes by row
    const rowGroups = new Map();
    for (const [id, row] of this.nodeRows) {
      if (!rowGroups.has(row)) rowGroups.set(row, []);
      rowGroups.get(row).push(id);
    }

    const sortedRows = [...rowGroups.keys()].sort((a, b) => a - b);
    if (sortedRows.length === 0) return;

    const rect = this._graphContainer.getBoundingClientRect();
    const w = rect.width || 800;
    const h = rect.height || 600;
    const pad = 60;
    const rowCount = sortedRows.length;
    const rowHeight = (h - pad * 2) / Math.max(rowCount, 1);

    const positions = new Map();
    sortedRows.forEach((row, rowVisualIdx) => {
      const ids = rowGroups.get(row);
      ids.sort((a, b) => Number(a) - Number(b));
      const y = pad + rowHeight * rowVisualIdx + rowHeight / 2;
      const colWidth = (w - pad * 2) / (ids.length + 1);
      ids.forEach((id, colIdx) => {
        positions.set(id, {
          x: pad + colWidth * (colIdx + 1),
          y: y,
        });
      });
    });

    // Compute port positions relative to their parent nodes
    for (const index of this._visibleSteps) {
      const step = proofGraphState.steps.get(index);
      if (!step) continue;
      const n = step.dependencies.length;
      if (n === 0) continue;
      const parentPos = positions.get(String(index));
      if (!parentPos) continue;
      const parentW = 60; // node width
      for (let slot = 0; slot < n; slot++) {
        const xOff = -parentW / 2 + (parentW / (n + 1)) * (slot + 1);
        positions.set(`port-${index}-${slot}`, {
          x: parentPos.x + xOff,
          y: parentPos.y - 16,
        });
      }
    }

    if (animate) {
      for (const [id, pos] of positions) {
        const node = this.cy.getElementById(id);
        if (node.length) {
          node.animate({ position: pos }, { duration: 300 });
        }
      }
    } else {
      this.cy.batch(() => {
        for (const [id, pos] of positions) {
          const node = this.cy.getElementById(id);
          if (node.length) node.position(pos);
        }
      });
      this.cy.zoom(1);
      this.cy.pan({ x: 0, y: 0 });
    }
  }

  _fitGraph() {
    if (!this.cy) return;
    this.cy.fit(undefined, 40);
  }

  // ─── Status ───────────────────────────────────────────────

  _updateStatus() {
    const isGraph = proofGraphState.structureType === 'graph';

    if (!proofGraphState.isLoaded) {
      this._statusEl.textContent = isGraph ? 'Load a DepGraph game to begin.' : 'Load a MetaMath game to begin.';
      this._statusEl.className = 'pg-status';
      return;
    }

    if (proofGraphState.isProofComplete()) {
      this._statusEl.textContent = isGraph ? 'Solution complete!' : 'Proof complete!';
      this._statusEl.className = 'pg-status pg-status-complete';
      return;
    }

    const drawn = proofGraphState.drawnEdges.size;
    const total = proofGraphState.getTotalEdgeCount();
    const checked = proofGraphState.checkedLocations.size;
    const totalSteps = proofGraphState.steps.size;
    const wrong = proofGraphState.incorrectAttempts;

    let text = `Edges: ${drawn}/${total} | Steps: ${checked}/${totalSteps}`;
    if (wrong > 0) text += ` | Wrong: ${wrong}`;
    this._statusEl.textContent = text;
    this._statusEl.className = 'pg-status';
  }

  // ─── Event Handlers ───────────────────────────────────────

  _handleRulesLoaded() {
    log('info', 'Rules loaded, checking for proof structure');

    if (!hasProofStructure()) {
      log('info', 'No graph structure — hiding graph');
      this._destroyGraph();
      this._statusEl.textContent = 'No graph structure found.';
      this._toolbarEl.style.display = 'none';
      return;
    }

    // Force reload from new rules data (ensureStateLoaded skips if already loaded)
    proofGraphState.isLoaded = false;
    this._destroyGraph();
    ensureStateLoaded(proofGraphState);

    if (proofGraphState.isLoaded) {
      this._wireStateCallbacks();
      syncStateFromSnapshot(proofGraphState);
      this._loadCytoscape();
    }
  }

  /**
   * Tear down the existing Cytoscape graph so it can be rebuilt from scratch.
   */
  _destroyGraph() {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    if (this.eh) {
      this.eh.destroy();
      this.eh = null;
    }
    if (this.cy) {
      this.cy.destroy();
      this.cy = null;
    }
    this.nodeRows.clear();
    this._visibleSteps.clear();
    this._cytoscapeLoading = false;
  }

  _handleSnapshotUpdated(snapshotData) {
    if (!proofGraphState.isLoaded) return;
    syncStateFromSnapshot(proofGraphState, snapshotData);
    this._checkingStep = null; // Clear in-flight guard after snapshot sync
    this._syncAndLayout();
  }

  _handleInventoryChanged() {
    if (!proofGraphState.isLoaded) return;
    syncStateFromSnapshot(proofGraphState);
    this._checkingStep = null;
    this._syncAndLayout();
  }

  /**
   * Sync visible nodes, auto-connect edges, and run a single layout pass.
   * Prevents double animation when both add nodes and draw edges.
   */
  _syncAndLayout() {
    const nodesAdded = this._syncVisibleNodes(false);
    const edgesAdded = this._autoConnectCheckedSteps(false);
    if (nodesAdded || edgesAdded) {
      this._layoutFromRows(true);
    }
    this._updateNodeClasses();
    this._updateStatus();
  }

  /**
   * Handle a correct hyp assignment from the Proof Queue (Easy mode sync).
   * Draws the corresponding edge in the graph if both endpoints are visible.
   */
  _handleHypAssigned({ source, target, slot }) {
    if (!proofGraphState.isLoaded || !this.cy) return;

    // Try to draw the edge in state (may already be drawn)
    const edgeKey = `${source}->${target}:${slot}`;
    if (proofGraphState.drawnEdges.has(edgeKey)) return;

    const result = proofGraphState.tryDrawEdge(source, target);
    if (!result.success) return;

    // Add the edge to the Cytoscape graph if both endpoints are visible
    if (this._visibleSteps.has(source) && this._visibleSteps.has(target)) {
      const portId = `port-${target}-${result.slot}`;
      const drawnEdgeKey = `${source}->${target}:${result.slot}`;

      // Only add if edge element doesn't already exist
      if (this.cy.getElementById(`edge-${drawnEdgeKey}`).empty()) {
        this.cy.add({
          group: 'edges',
          data: {
            id: `edge-${drawnEdgeKey}`,
            source: String(source),
            target: portId,
          },
          classes: 'drawn-edge',
        });
      }

      this.cy.getElementById(portId).addClass('port-filled');

      const targetNode = this.cy.getElementById(String(target));
      if (targetNode.nonempty()) {
        this._flashNode(targetNode, 'success-flash');
      }

      this._updateRowAfterEdge(target);
      this._layoutFromRows(true);
    }

    this._updateNodeClasses();
    this._updateStatus();
  }

  // ─── Actions ──────────────────────────────────────────────

  _onCheckNext() {
    if (!proofGraphState.isLoaded || !_dispatcher) return;

    // Prevent double-clicks while a check is in-flight
    if (this._checkingStep !== null) {
      log('info', 'Check already in progress, ignoring');
      return;
    }

    // Find first checkable step
    for (const [index] of proofGraphState.steps) {
      if (proofGraphState.isStepCheckable(index)) {
        this._checkStep(index);
        return;
      }
    }

    log('info', 'No checkable step available');
  }

  _checkStep(stepIndex) {
    const step = proofGraphState.steps.get(stepIndex);
    if (!step || !_dispatcher) return;

    // Prevent double-clicks while a check is in-flight
    if (this._checkingStep !== null) {
      log('info', 'Check already in progress, ignoring');
      return;
    }

    this._checkingStep = stepIndex;

    dispatchLocationCheck(step, proofGraphState, _dispatcher, 'ProofGraphCheck', log, () => {
      this._checkingStep = null;
      this._updateNodeClasses();
      this._updateStatus();
    });
  }

  // ─── State Wiring ─────────────────────────────────────────

  _wireStateCallbacks() {
    proofGraphState.onStateChanged = () => {
      this._updateNodeClasses();
      this._updateStatus();
    };
  }
}

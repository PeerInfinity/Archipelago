// JTA Archipelago Bridge Logic
//
// Handles two data flows:
//   1. Outbound: JTA perk task completions → Archipelago location checks
//   2. Inbound:  Archipelago received items → JTA perk grants
//
// Mappings:
//   - Location name = task name (from game_data PERK_TASKS)
//   - Item name = perk display name (from PERK_DISPLAY_NAMES)
//   - Perk type ID = integer key in game_data.perks

import stateManagerProxySingleton from '../stateManager/stateManagerProxySingleton.js';

const LOG_PREFIX = '[JTAArchipelago]';

function log(level, message, ...data) {
  if (typeof window !== 'undefined' && window.logger) {
    window.logger[level]('jtaArchipelago', message, ...data);
  } else {
    const consoleMethod =
      console[level === 'info' ? 'log' : level] || console.log;
    consoleMethod(`${LOG_PREFIX} ${message}`, ...data);
  }
}

export class JTAArchipelagoLogic {
  constructor(eventBus, dispatcher) {
    this._eventBus = eventBus;
    this._dispatcher = dispatcher;

    // Perk display name → perk type ID (e.g., "How to Read" → 0)
    this._perkNameToTypeId = new Map();

    // Set of task names (location names) already sent as location checks
    this._checkedLocations = new Set();

    // Set of perk type IDs already granted in-game from Archipelago items
    this._grantedPerks = new Set();

    // Whether game definitions have been loaded
    this._gameDefsReady = false;

    // Whether the game iframe is connected
    this._iframeConnected = false;

    // Pending perk grants (queued while game isn't ready)
    this._pendingPerkGrants = [];
  }

  initialize() {
    const sub = (event, handler) => this._eventBus.subscribe(event, handler);

    // Outbound: perk task completion → location check
    sub('jta:perkTaskCompleted', (data) => this._handlePerkTaskCompleted(data));

    // Inbound: build perk mappings from game definitions
    sub('jta:gameDefsSnapshot', (data) => this._handleGameDefs(data));

    // Inbound: items received from Archipelago
    sub('game:connected', (data) => this._handleGameConnected(data));
    sub('game:itemsReceived', (data) => this._handleItemsReceived(data));

    // Track iframe readiness
    sub('iframe:connected', () => this._handleIframeConnected());

    // Track perk grant confirmations
    sub('jta:perksGranted', (data) => this._handlePerksGranted(data));

    log('info', 'Bridge initialized — listening for perk task completions and received items');
  }

  // ── Outbound: perk task completed → location check ──────────────────

  _handlePerkTaskCompleted(data) {
    const { taskName, taskId, perkType } = data;
    if (!taskName) {
      log('warn', 'perkTaskCompleted event missing taskName');
      return;
    }

    if (this._checkedLocations.has(taskName)) {
      log('info', `Location already checked: "${taskName}" (task ${taskId})`);
      return;
    }

    this._checkedLocations.add(taskName);
    log('info', `Sending location check: "${taskName}" (task ${taskId}, perk ${perkType})`);

    if (this._dispatcher) {
      this._dispatcher.publish('user:locationCheck', {
        locationName: taskName,
        sourceModule: 'jtaArchipelago',
      }, 'bottom');
    } else {
      log('error', 'No dispatcher available for location check');
    }
  }

  // ── Inbound: game definitions → build perk mappings ──────────────────

  _handleGameDefs(data) {
    if (!data || !data.perks) return;

    this._perkNameToTypeId.clear();
    for (const [typeIdStr, perkInfo] of Object.entries(data.perks)) {
      if (perkInfo && perkInfo.name) {
        this._perkNameToTypeId.set(perkInfo.name, Number(typeIdStr));
      }
    }

    this._gameDefsReady = true;
    log('info', `Perk mappings built: ${this._perkNameToTypeId.size} perks`);

    // Process any pending grants
    this._processPendingGrants();
  }

  // ── Inbound: iframe connected → request game defs ───────────────────

  _handleIframeConnected() {
    this._iframeConnected = true;
    log('info', 'Game iframe connected');

    // Request game definitions to build perk mappings
    this._eventBus.publish('jta:requestGameDefs', { timestamp: Date.now() });

    // Process any pending grants
    this._processPendingGrants();
  }

  // ── Inbound: Archipelago connected → sync initial perks ─────────────

  _handleGameConnected(data) {
    log('info', 'Archipelago connected — will sync perks from inventory');

    // Delay slightly to let items be processed into stateManager
    setTimeout(() => this._reconcilePerksFromInventory(), 500);
  }

  // ── Inbound: new items received → check for perk items ──────────────

  _handleItemsReceived(data) {
    // Items have been added to stateManager inventory.
    // Reconcile to find any new JTA perk items.
    this._reconcilePerksFromInventory();
  }

  // ── Core: read inventory and grant missing perks ─────────────────────

  _reconcilePerksFromInventory() {
    if (!this._gameDefsReady) {
      log('info', 'Game defs not ready yet — deferring perk reconciliation');
      return;
    }

    const snapshot = stateManagerProxySingleton.getSnapshot();
    if (!snapshot || !snapshot.inventory) {
      log('info', 'No inventory snapshot available yet');
      return;
    }

    const inventory = snapshot.inventory;
    const perksToGrant = [];

    for (const [perkName, perkTypeId] of this._perkNameToTypeId) {
      // Check if this perk item is in the Archipelago inventory
      const count = inventory[perkName];
      if (count && count > 0 && !this._grantedPerks.has(perkTypeId)) {
        perksToGrant.push(perkTypeId);
        this._grantedPerks.add(perkTypeId);
      }
    }

    if (perksToGrant.length > 0) {
      log('info', `Granting ${perksToGrant.length} perk(s) from inventory: ${perksToGrant.join(', ')}`);

      if (this._iframeConnected) {
        this._eventBus.publish('jta:grantPerks', {
          perkTypes: perksToGrant,
          silent: false,
          timestamp: Date.now()
        });
      } else {
        // Queue for when iframe is ready
        this._pendingPerkGrants.push(...perksToGrant);
        log('info', `Game iframe not ready — queued ${perksToGrant.length} perk grant(s)`);
      }
    }
  }

  // ── Process queued perk grants when game becomes ready ───────────────

  _processPendingGrants() {
    if (!this._iframeConnected || !this._gameDefsReady) return;
    if (this._pendingPerkGrants.length === 0) return;

    const perks = [...this._pendingPerkGrants];
    this._pendingPerkGrants.length = 0;

    log('info', `Processing ${perks.length} queued perk grant(s)`);
    this._eventBus.publish('jta:grantPerks', {
      perkTypes: perks,
      silent: false,
      timestamp: Date.now()
    });

    // Also try reconciliation in case more items arrived while waiting
    this._reconcilePerksFromInventory();
  }

  // ── Track grant confirmations ───────────────────────────────────────

  _handlePerksGranted(data) {
    if (data.success && data.granted && data.granted.length > 0) {
      log('info', `Confirmed ${data.granted.length} perk(s) granted in-game: ${data.granted.join(', ')}`);
    }
  }
}

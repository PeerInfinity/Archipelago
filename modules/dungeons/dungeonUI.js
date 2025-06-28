import { stateManagerProxySingleton as stateManager } from '../stateManager/index.js';
import commonUI, { renderLogicTree } from '../commonUI/index.js';
import eventBus from '../../app/core/eventBus.js';
import settingsManager from '../../app/core/settingsManager.js';
import { debounce } from '../commonUI/index.js';
import { createStateSnapshotInterface } from '../stateManager/stateManagerProxy.js';

function log(level, message, ...data) {
  if (window.logger) {
    window.logger[level]('DungeonUI', message, ...data);
  } else {
    console.log(`[DungeonUI] ${message}`, ...data);
  }
}

export class DungeonUI {
  constructor(container, componentState) {
    this.container = container;
    this.componentState = componentState;
    this.unsubscribeHandles = [];
    this.isInitialized = false;
    this.dungeonStates = {}; // To track expanded/collapsed state

    this.rootElement = this.createRootElement();
    this.dungeonsContainer = this.rootElement.querySelector(
      '#dungeon-details-container'
    );
    this.container.element.appendChild(this.rootElement);

    this.attachEventListeners();
    this._subscribeToEvents();

    this.container.on('destroy', () => {
      this.onPanelDestroy();
    });
  }

  _subscribeToEvents() {
    const debouncedUpdate = debounce(() => {
      if (this.isInitialized) {
        this.update();
      }
    }, 50);

    const readyHandler = () => {
      this.isInitialized = true;
      this.colorblindSettings =
        settingsManager.getSetting('colorblindMode.regions') || {};
      this.update();
      eventBus.unsubscribe('stateManager:ready', readyHandler);
    };

    const settingsHandler = ({ key, value }) => {
      if (key === '*' || key.startsWith('colorblindMode.regions')) {
        this.colorblindSettings =
          settingsManager.getSetting('colorblindMode.regions') || {};
        if (this.isInitialized) debouncedUpdate();
      }
    };

    const navigateToDungeonHandler = (eventData) => {
      if (eventData.dungeonName) {
        this.navigateToAndExpandDungeon(eventData.dungeonName);
      }
    };

    eventBus.subscribe('settings:changed', settingsHandler);
    eventBus.subscribe('stateManager:ready', readyHandler);
    eventBus.subscribe('stateManager:snapshotUpdated', debouncedUpdate);
    eventBus.subscribe('stateManager:rulesLoaded', () => this.update());
    eventBus.subscribe('ui:navigateToDungeon', navigateToDungeonHandler);

    // Store handlers for cleanup
    this.unsubscribeHandles.push(
      () => eventBus.unsubscribe('settings:changed', settingsHandler),
      () =>
        eventBus.unsubscribe('stateManager:snapshotUpdated', debouncedUpdate),
      () =>
        eventBus.unsubscribe('ui:navigateToDungeon', navigateToDungeonHandler)
    );
  }

  onPanelDestroy() {
    this.unsubscribeHandles.forEach((unsubscribe) => unsubscribe());
    this.unsubscribeHandles = [];
  }

  getRootElement() {
    return this.rootElement;
  }

  createRootElement() {
    const element = document.createElement('div');
    element.classList.add('dungeons-panel-container', 'panel-container');
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.height = '100%';
    element.style.overflow = 'hidden';

    element.innerHTML = `
      <div class="control-group dungeon-controls" style="padding: 0.5rem; border-bottom: 1px solid #666; flex-shrink: 0;">
        <input type="search" id="dungeon-search" placeholder="Search dungeons..." style="margin-right: 10px;">
        <button id="expand-collapse-all">Expand All</button>
      </div>
      <div id="dungeon-details-container" style="flex-grow: 1; overflow-y: auto; padding: 0.5rem;"></div>
    `;
    return element;
  }

  attachEventListeners() {
    const searchInput = this.rootElement.querySelector('#dungeon-search');
    if (searchInput) {
      searchInput.addEventListener(
        'input',
        debounce(() => this.update(), 250)
      );
    }

    const expandCollapseAllButton = this.rootElement.querySelector(
      '#expand-collapse-all'
    );
    if (expandCollapseAllButton) {
      expandCollapseAllButton.addEventListener('click', () => {
        const isExpand = expandCollapseAllButton.textContent === 'Expand All';
        expandCollapseAllButton.textContent = isExpand
          ? 'Collapse All'
          : 'Expand All';
        const staticData = stateManager.getStaticData();
        if (staticData && staticData.dungeons) {
          Object.values(staticData.dungeons).forEach((dungeon) => {
            this.dungeonStates[dungeon.name] = { expanded: isExpand };
          });
        }
        this.update();
      });
    }
  }

  update() {
    if (!this.isInitialized) {
      log('info', 'DungeonUI not initialized, skipping update.');
      return;
    }
    this.renderAllDungeons();
  }

  renderAllDungeons() {
    const staticData = stateManager.getStaticData();
    const snapshot = stateManager.getLatestStateSnapshot();

    if (!staticData || !staticData.dungeons || !snapshot) {
      this.dungeonsContainer.innerHTML = '<p>Loading dungeon data...</p>';
      return;
    }

    const snapshotInterface = createStateSnapshotInterface(
      snapshot,
      staticData
    );
    this.dungeonsContainer.innerHTML = '';

    const searchTerm = this.rootElement
      .querySelector('#dungeon-search')
      .value.toLowerCase();

    const dungeons = Object.values(staticData.dungeons).filter((dungeon) =>
      dungeon.name.toLowerCase().includes(searchTerm)
    );

    for (const dungeon of dungeons) {
      if (!this.dungeonStates[dungeon.name]) {
        this.dungeonStates[dungeon.name] = { expanded: false };
      }
      const dungeonBlock = this.buildDungeonBlock(
        dungeon,
        snapshot,
        snapshotInterface
      );
      this.dungeonsContainer.appendChild(dungeonBlock);
    }
  }

  buildDungeonBlock(dungeon, snapshot, snapshotInterface) {
    const dungeonState = this.dungeonStates[dungeon.name];
    const expanded = dungeonState.expanded;

    // Outer container with proper CSS classes
    const block = document.createElement('div');
    block.classList.add('region-block'); // Reuse region-block styling
    block.classList.add(expanded ? 'expanded' : 'collapsed');
    block.dataset.dungeon = dungeon.name;

    // Header with proper styling
    const header = document.createElement('div');
    header.classList.add('region-header'); // Reuse region-header styling

    // Count regions for status display
    const totalRegions = dungeon.regions?.length || 0;

    header.innerHTML = `
      <span class="region-name" title="${dungeon.name}">${dungeon.name}</span>
      <span class="region-status">(${totalRegions} regions)</span>
      <button class="collapse-btn">${expanded ? 'Collapse' : 'Expand'}</button>
    `;

    // Header click listener
    header.addEventListener('click', (e) => {
      if (e.target.classList.contains('collapse-btn')) {
        e.stopPropagation();
      }
      dungeonState.expanded = !dungeonState.expanded;
      this.update();
    });

    block.appendChild(header);

    // Content container
    const content = document.createElement('div');
    content.classList.add('region-content'); // Reuse region-content styling
    content.style.display = expanded ? 'block' : 'none';

    if (expanded) {
      // Regions section
      if (dungeon.regions && dungeon.regions.length > 0) {
        const regionsContainer = document.createElement('div');
        regionsContainer.innerHTML = '<h4>Regions</h4>';
        const regionList = document.createElement('ul');
        regionList.classList.add('region-exits-list'); // Reuse styling

        dungeon.regions.forEach((regionName) => {
          const li = document.createElement('li');
          const regionLink = commonUI.createRegionLink(
            regionName,
            this.colorblindSettings,
            snapshot
          );
          li.appendChild(regionLink);
          regionList.appendChild(li);
        });
        regionsContainer.appendChild(regionList);
        content.appendChild(regionsContainer);
      }

      // Boss section
      if (dungeon.boss) {
        const bossContainer = document.createElement('div');
        bossContainer.innerHTML = `<h4>Boss: ${dungeon.boss.name}</h4>`;

        if (dungeon.boss.defeat_rule) {
          const ruleDiv = document.createElement('div');
          ruleDiv.classList.add('logic-tree');
          ruleDiv.innerHTML = '<strong>Defeat Rule:</strong>';
          const defeatRuleTree = renderLogicTree(
            dungeon.boss.defeat_rule,
            this.colorblindSettings,
            snapshotInterface
          );
          ruleDiv.appendChild(defeatRuleTree);
          bossContainer.appendChild(ruleDiv);
        }
        content.appendChild(bossContainer);
      }
    }

    block.appendChild(content);
    return block;
  }

  /**
   * Navigates to and expands a specific dungeon, scrolling it into view
   * @param {string} dungeonName - The name of the dungeon to navigate to
   */
  navigateToAndExpandDungeon(dungeonName) {
    log('info', `[DungeonUI] Navigating to dungeon: ${dungeonName}`);

    // Ensure the dungeon is expanded
    if (!this.dungeonStates[dungeonName]) {
      this.dungeonStates[dungeonName] = { expanded: false };
    }
    this.dungeonStates[dungeonName].expanded = true;

    // Update the display to show the expanded dungeon
    this.update();

    // Use setTimeout to ensure the DOM has been updated before scrolling
    setTimeout(() => {
      // Find the dungeon block and scroll it into view
      const dungeonBlock = this.dungeonsContainer.querySelector(
        `[data-dungeon="${dungeonName}"]`
      );
      if (dungeonBlock) {
        dungeonBlock.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });

        // Add a brief highlight effect
        dungeonBlock.style.transition = 'box-shadow 0.3s ease';
        dungeonBlock.style.boxShadow = '0 0 10px rgba(76, 175, 80, 0.6)';
        setTimeout(() => {
          dungeonBlock.style.boxShadow = '';
        }, 2000);
      } else {
        log(
          'warn',
          `[DungeonUI] Could not find dungeon block for: ${dungeonName}`
        );
      }
    }, 100);
  }
}

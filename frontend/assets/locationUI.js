// locationUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';

export class LocationUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.checkedLocations = new Set();
    this.columns = 2; // Default number of columns

    this.attachEventListeners();
  }

  initialize(jsonData) {
    stateManager.loadFromJSON(jsonData);
    this.updateLocationDisplay();
  }

  clear() {
    this.checkedLocations.clear();
    const locationsGrid = document.getElementById('locations-grid');
    if (locationsGrid) {
      locationsGrid.innerHTML = '';
    }
  }

  update() {
    this.updateLocationDisplay();
  }

  attachEventListeners() {
    // Sorting and filtering
    [
      'sort-select',
      'show-checked',
      'show-reachable',
      'show-unreachable',
      'show-highlights',
    ].forEach((id) => {
      document
        .getElementById(id)
        ?.addEventListener('change', () => this.updateLocationDisplay());
    });

    // Modal handling
    document.getElementById('modal-close')?.addEventListener('click', () => {
      document.getElementById('location-modal').classList.add('hidden');
    });

    document
      .getElementById('location-modal')
      ?.addEventListener('click', (e) => {
        if (e.target === document.getElementById('location-modal')) {
          document.getElementById('location-modal').classList.add('hidden');
        }
      });

    document
      .getElementById('locations-grid')
      ?.addEventListener('click', (e) => {
        const locationCard = e.target.closest('.location-card');
        if (locationCard) {
          try {
            const encoded = locationCard.dataset.location.replace(
              /&quot;/g,
              '"'
            );
            const locationData = JSON.parse(decodeURIComponent(encoded));
            this.handleLocationClick(locationData);
          } catch (error) {
            console.error('Error parsing location data:', error);
          }
        }
      });

    // Column adjustment buttons
    document
      .getElementById('increase-columns')
      ?.addEventListener('click', () => this.changeColumns(1));
    document
      .getElementById('decrease-columns')
      ?.addEventListener('click', () => this.changeColumns(-1));
  }

  changeColumns(delta) {
    this.columns = Math.max(1, this.columns + delta); // Ensure at least 1 column
    this.updateLocationDisplay();
  }

  handleLocationClick(location) {
    if (this.checkedLocations.has(location.name)) {
      return;
    }

    const isAccessible = stateManager.isLocationAccessible(
      location,
      stateManager.inventory
    );

    if (!isAccessible) {
      return;
    }

    if (location.item) {
      // Use gameUI.toggleItem instead of directly adding to stateManager
      this.gameUI.toggleItem(location.item.name);
      this.checkedLocations.add(location.name);
      stateManager.invalidateCache();
      this.updateLocationDisplay();
      this.showLocationDetails(location);

      if (window.consoleManager) {
        window.consoleManager.print(
          `Checked ${location.name} - Found ${location.item.name}`,
          'success'
        );
      }
    }
  }

  updateLocationDisplay() {
    const showChecked = document.getElementById('show-checked').checked;
    const showReachable = document.getElementById('show-reachable').checked;
    const showUnreachable = document.getElementById('show-unreachable').checked;
    const showHighlights = document.getElementById('show-highlights').checked;
    const sorting = document.getElementById('sort-select').value;

    const locations = stateManager.getProcessedLocations(
      stateManager.inventory,
      sorting,
      showReachable,
      showUnreachable
    );

    const newlyReachable = stateManager.getNewlyReachableLocations(
      stateManager.inventory
    );

    const locationsGrid = document.getElementById('locations-grid');
    locationsGrid.style.gridTemplateColumns = `repeat(${this.columns}, minmax(0, 1fr))`; // Set the number of columns

    if (locations.length === 0) {
      locationsGrid.innerHTML = `
                <div class="empty-message">
                    Upload a JSON file to see locations or adjust filters
                </div>
            `;
      return;
    }

    const filteredLocations = locations.filter((location) => {
      const isChecked = this.checkedLocations.has(location.name);
      return isChecked ? showChecked : true;
    });

    if (sorting === 'accessibility') {
      filteredLocations.sort((a, b) => {
        const aRegionAccessible = stateManager.isRegionReachable(
          a.region,
          stateManager.inventory
        );
        const bRegionAccessible = stateManager.isRegionReachable(
          b.region,
          stateManager.inventory
        );

        const aLocationAccessible = stateManager.isLocationAccessible(
          a,
          stateManager.inventory
        );
        const bLocationAccessible = stateManager.isLocationAccessible(
          b,
          stateManager.inventory
        );

        if (aLocationAccessible && bLocationAccessible) {
          return 0;
        } else if (aLocationAccessible) {
          return -1;
        } else if (bLocationAccessible) {
          return 1;
        } else if (aRegionAccessible && bRegionAccessible) {
          return 0;
        } else if (aRegionAccessible) {
          return -1;
        } else if (bRegionAccessible) {
          return 1;
        } else {
          return 0;
        }
      });
    }

    locationsGrid.innerHTML = filteredLocations
      .map((location) => {
        const isRegionAccessible = stateManager.isRegionReachable(
          location.region,
          stateManager.inventory
        );
        const isLocationAccessible = stateManager.isLocationAccessible(
          location,
          stateManager.inventory
        );
        const isNewlyReachable =
          showHighlights &&
          newlyReachable.has(`${location.player}-${location.name}`);
        const isChecked = this.checkedLocations.has(location.name);

        let stateClass = isChecked
          ? 'checked'
          : isNewlyReachable
          ? 'newly-reachable'
          : isLocationAccessible
          ? 'reachable'
          : 'unreachable';

        return `
                <div 
                    class="location-card ${stateClass}"
                    data-location="${encodeURIComponent(
                      JSON.stringify(location)
                    ).replace(/"/g, '&quot;')}"
                >
                    <div class="font-medium">${location.name}</div>
                    <div class="text-sm">Player ${location.player}</div>
                    <div class="text-sm" style="color: ${
                      isRegionAccessible ? 'inherit' : 'red'
                    }">
                        Region: ${
                          isRegionAccessible ? 'Accessible' : 'Inaccessible'
                        }
                    </div>
                    <div class="text-sm">
                        Location: ${
                          this.renderLogicTree(location.access_rule).outerHTML
                        }
                    </div>
                    <div class="text-sm">
                        ${
                          isChecked
                            ? 'Checked'
                            : isLocationAccessible
                            ? 'Available'
                            : 'Locked'
                        }
                    </div>
                </div>
            `;
      })
      .join('');
  }

  renderLogicTree(rule) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      return root;
    }

    // Use stateManager.inventory instead of gameUI.inventory
    const result = evaluateRule(rule, stateManager.inventory);
    root.classList.toggle('pass', !!result);
    root.classList.toggle('fail', !result);

    const label = document.createElement('div');
    label.classList.add('logic-label');
    label.textContent = `Type: ${rule.type}`;
    root.appendChild(label);

    switch (rule.type) {
      case 'constant':
        root.appendChild(document.createTextNode(` value: ${rule.value}`));
        break;
      case 'item_check':
        root.appendChild(document.createTextNode(` item: ${rule.item}`));
        break;
      case 'count_check':
        root.appendChild(
          document.createTextNode(` ${rule.item} >= ${rule.count}`)
        );
        break;
      case 'group_check':
        root.appendChild(document.createTextNode(` group: ${rule.group}`));
        break;
      case 'helper':
        root.appendChild(
          document.createTextNode(
            ` helper: ${rule.name}, args: ${JSON.stringify(rule.args)}`
          )
        );
        break;
      case 'and':
      case 'or': {
        const ul = document.createElement('ul');
        rule.conditions.forEach((cond) => {
          const li = document.createElement('li');
          li.appendChild(this.renderLogicTree(cond));
          ul.appendChild(li);
        });
        root.appendChild(ul);
        break;
      }
      case 'state_method':
        root.appendChild(
          document.createTextNode(
            ` method: ${rule.method}, args: ${JSON.stringify(rule.args)}`
          )
        );
        break;
      default:
        root.appendChild(document.createTextNode(' [unhandled rule type] '));
    }
    return root;
  }

  showLocationDetails(location) {
    const modal = document.getElementById('location-modal');
    const title = document.getElementById('modal-title');
    const debug = document.getElementById('modal-debug');
    const info = document.getElementById('modal-info');

    title.textContent = location.name;

    const region = this.gameUI.regions[location.region];

    if (this.gameUI.debugMode) {
      debug.classList.remove('hidden');
      debug.textContent = JSON.stringify(
        {
          access_rule: location.access_rule,
          path_rules: location.path_rules,
          region_rules: region?.region_rules,
          dungeon: region?.dungeon,
          shop: region?.shop,
        },
        null,
        2
      );
    } else {
      debug.classList.add('hidden');
    }

    info.innerHTML = `
            <div class="space-y-2">
                <div>
                    <span class="font-semibold">Status: </span>
                    ${
                      this.checkedLocations.has(location.name)
                        ? 'Checked'
                        : stateManager.isLocationAccessible(
                            location,
                            this.gameUI.inventory
                          )
                        ? 'Available'
                        : 'Locked'
                    }
                </div>
                <div>
                    <span class="font-semibold">Player: </span>${
                      location.player
                    }
                </div>
                <div>
                    <span class="font-semibold">Region: </span>${
                      location.region
                    }
                    ${region?.is_light_world ? ' (Light World)' : ''}
                    ${region?.is_dark_world ? ' (Dark World)' : ''}
                </div>
                ${
                  region?.dungeon
                    ? `
                    <div>
                        <span class="font-semibold">Dungeon: </span>${region.dungeon.name}
                    </div>
                `
                    : ''
                }
                ${
                  location.item &&
                  (this.checkedLocations.has(location.name) ||
                    this.gameUI.debugMode)
                    ? `
                    <div>
                        <span class="font-semibold">Item: </span>${
                          location.item.name
                        }
                        ${location.item.advancement ? ' (Progression)' : ''}
                        ${location.item.priority ? ' (Priority)' : ''}
                    </div>
                `
                    : ''
                }
            </div>
        `;

    modal.classList.remove('hidden');
  }
}

export default LocationUI;

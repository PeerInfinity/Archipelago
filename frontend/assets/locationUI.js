// locationUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';

export class LocationUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.columns = 2; // Default number of columns

    this.attachEventListeners();
  }

  initialize() {
    // Don't need to call loadFromJSON since gameUI.js already does this
    // stateManager.loadFromJSON(jsonData);
    this.updateLocationDisplay();
  }

  clear() {
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
    if (stateManager.isLocationChecked(location.name)) {
      return;
    }

    const isAccessible = stateManager.isLocationAccessible(location);

    if (!isAccessible) {
      return;
    }

    if (location.item) {
      this.gameUI.inventoryUI.modifyItemCount(location.item.name);
      stateManager.checkLocation(location.name);

      // Update both inventory and location displays
      this.gameUI.inventoryUI.syncWithState();
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

  syncWithState() {
    this.updateLocationDisplay();
  }

  updateLocationDisplay() {
    const showChecked = document.getElementById('show-checked').checked;
    const showReachable = document.getElementById('show-reachable').checked;
    const showUnreachable = document.getElementById('show-unreachable').checked;
    const showHighlights = document.getElementById('show-highlights').checked;
    const sorting = document.getElementById('sort-select').value;

    const locations = stateManager.getProcessedLocations(
      sorting,
      showReachable,
      showUnreachable
    );

    const newlyReachable = stateManager.getNewlyReachableLocations();

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
      const isChecked = stateManager.isLocationChecked(location.name);
      return isChecked ? showChecked : true;
    });

    if (sorting === 'accessibility') {
      filteredLocations.sort((a, b) => {
        const aRegionAccessible = stateManager.isRegionReachable(a.region);
        const bRegionAccessible = stateManager.isRegionReachable(b.region);

        const aLocationAccessible = stateManager.isLocationAccessible(a);
        const bLocationAccessible = stateManager.isLocationAccessible(b);

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
          location.region
        );
        const isLocationAccessible =
          stateManager.isLocationAccessible(location);
        const isNewlyReachable =
          showHighlights &&
          newlyReachable.has(`${location.player}-${location.name}`);
        const isChecked = stateManager.isLocationChecked(location.name);

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
            <div class="font-medium location-link" data-location="${
              location.name
            }" data-region="${location.region}">${location.name}</div>
            <div class="text-sm">Player ${location.player}</div>
            <div class="text-sm">
              Region: <span class="region-link" data-region="${
                location.region
              }" style="color: ${isRegionAccessible ? 'inherit' : 'red'}">${
          location.region
        }</span> (${isRegionAccessible ? 'Accessible' : 'Inaccessible'})
            </div>
            <div class="text-sm">
              Location: ${this.renderLogicTree(location.access_rule).outerHTML}
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

    // Add click handlers for region and location links
    document.querySelectorAll('.region-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent opening the location modal
        const regionName = link.dataset.region;
        if (regionName) {
          this.gameUI.regionUI.navigateToRegion(regionName);
        }
      });
    });

    document.querySelectorAll('.location-link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent capturing click on parent card
        const locationName = link.dataset.location;
        const regionName = link.dataset.region;
        if (locationName && regionName) {
          this.gameUI.regionUI.navigateToLocation(locationName, regionName);
        }
      });
    });
  }

  renderLogicTree(rule) {
    const root = document.createElement('div');
    root.classList.add('logic-node');

    if (!rule) {
      root.textContent = '(no rule)';
      return root;
    }

    // Remove inventory parameter
    const result = evaluateRule(rule);
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

      case 'item_check': {
        let itemText = '';
        if (typeof rule.item === 'string') {
          itemText = rule.item;
        } else if (rule.item && rule.item.type === 'constant') {
          itemText = rule.item.value;
        } else if (rule.item) {
          itemText = `(complex expression)`;

          // Add visualization for complex item expression
          const itemExprLabel = document.createElement('div');
          itemExprLabel.textContent = 'Item Expression:';
          itemExprLabel.style.marginLeft = '10px';
          root.appendChild(itemExprLabel);

          const itemExpr = document.createElement('div');
          itemExpr.style.marginLeft = '20px';
          itemExpr.appendChild(this.renderLogicTree(rule.item));
          root.appendChild(itemExpr);
        }

        root.appendChild(document.createTextNode(` item: ${itemText}`));
        break;
      }

      case 'count_check': {
        let itemText = '';
        let countText = rule.count || 1;

        if (typeof rule.item === 'string') {
          itemText = rule.item;
        } else if (rule.item && rule.item.type === 'constant') {
          itemText = rule.item.value;
        } else if (rule.item) {
          itemText = `(complex expression)`;
        }

        if (typeof rule.count === 'number') {
          countText = rule.count;
        } else if (rule.count && rule.count.type === 'constant') {
          countText = rule.count.value;
        } else if (rule.count) {
          countText = '(complex expression)';
        }

        root.appendChild(
          document.createTextNode(` ${itemText} >= ${countText}`)
        );

        // Add visualization for complex expressions
        const hasComplexItem =
          rule.item && typeof rule.item === 'object' && rule.item.type;
        const hasComplexCount =
          rule.count && typeof rule.count === 'object' && rule.count.type;

        if (hasComplexItem || hasComplexCount) {
          const exprsContainer = document.createElement('div');
          exprsContainer.style.marginLeft = '10px';

          if (hasComplexItem) {
            const itemLabel = document.createElement('div');
            itemLabel.textContent = 'Item Expression:';
            exprsContainer.appendChild(itemLabel);

            const itemExpr = document.createElement('div');
            itemExpr.style.marginLeft = '10px';
            itemExpr.appendChild(this.renderLogicTree(rule.item));
            exprsContainer.appendChild(itemExpr);
          }

          if (hasComplexCount) {
            const countLabel = document.createElement('div');
            countLabel.textContent = 'Count Expression:';
            exprsContainer.appendChild(countLabel);

            const countExpr = document.createElement('div');
            countExpr.style.marginLeft = '10px';
            countExpr.appendChild(this.renderLogicTree(rule.count));
            exprsContainer.appendChild(countExpr);
          }

          root.appendChild(exprsContainer);
        }
        break;
      }

      case 'group_check': {
        let groupText = '';
        if (typeof rule.group === 'string') {
          groupText = rule.group;
        } else if (rule.group && rule.group.type === 'constant') {
          groupText = rule.group.value;
        } else if (rule.group) {
          groupText = '(complex expression)';

          // Add visualization for complex group expression
          const groupExprLabel = document.createElement('div');
          groupExprLabel.textContent = 'Group Expression:';
          groupExprLabel.style.marginLeft = '10px';
          root.appendChild(groupExprLabel);

          const groupExpr = document.createElement('div');
          groupExpr.style.marginLeft = '20px';
          groupExpr.appendChild(this.renderLogicTree(rule.group));
          root.appendChild(groupExpr);
        }

        root.appendChild(document.createTextNode(` group: ${groupText}`));
        break;
      }

      case 'helper': {
        let argsText = (rule.args || [])
          .map((arg) => {
            if (typeof arg === 'string' || typeof arg === 'number') {
              return arg;
            } else if (arg && arg.type === 'constant') {
              return arg.value;
            } else {
              return '(complex)';
            }
          })
          .join(', ');

        root.appendChild(
          document.createTextNode(` helper: ${rule.name}, args: [${argsText}]`)
        );

        // For complex arguments, render them in more detail
        const hasComplexArgs =
          rule.args &&
          rule.args.some(
            (arg) =>
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
          );

        if (hasComplexArgs) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '20px';

          rule.args.forEach((arg, i) => {
            if (
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
            ) {
              const argLabel = document.createElement('div');
              argLabel.textContent = `Arg ${i + 1}:`;
              argsContainer.appendChild(argLabel);

              const argTree = this.renderLogicTree(arg);
              argsContainer.appendChild(argTree);
            }
          });

          root.appendChild(argsContainer);
        }
        break;
      }

      case 'attribute': {
        root.appendChild(document.createTextNode(` object.${rule.attr}`));
        // Recursively render the object
        const objectEl = document.createElement('div');
        objectEl.classList.add('attribute-object');
        objectEl.style.marginLeft = '10px';
        objectEl.appendChild(this.renderLogicTree(rule.object));
        root.appendChild(objectEl);
        break;
      }

      case 'subscript': {
        root.appendChild(document.createTextNode(` array[index]`));
        // Create container for array and index
        const container = document.createElement('div');
        container.style.marginLeft = '10px';

        // Render array
        const arrayLabel = document.createElement('div');
        arrayLabel.textContent = 'Array:';
        container.appendChild(arrayLabel);

        const arrayEl = document.createElement('div');
        arrayEl.style.marginLeft = '10px';
        arrayEl.appendChild(this.renderLogicTree(rule.value));
        container.appendChild(arrayEl);

        // Render index
        const indexLabel = document.createElement('div');
        indexLabel.textContent = 'Index:';
        container.appendChild(indexLabel);

        const indexEl = document.createElement('div');
        indexEl.style.marginLeft = '10px';
        indexEl.appendChild(this.renderLogicTree(rule.index));
        container.appendChild(indexEl);

        root.appendChild(container);
        break;
      }

      case 'function_call': {
        root.appendChild(document.createTextNode(' function call'));

        // Render function
        const functionLabel = document.createElement('div');
        functionLabel.textContent = 'Function:';
        functionLabel.style.marginLeft = '10px';
        root.appendChild(functionLabel);

        const functionEl = document.createElement('div');
        functionEl.style.marginLeft = '20px';
        functionEl.appendChild(this.renderLogicTree(rule.function));
        root.appendChild(functionEl);

        // Render arguments
        if (rule.args && rule.args.length > 0) {
          const argsLabel = document.createElement('div');
          argsLabel.textContent = 'Arguments:';
          argsLabel.style.marginLeft = '10px';
          root.appendChild(argsLabel);

          const argsList = document.createElement('ol');
          argsList.style.marginLeft = '20px';

          for (const arg of rule.args) {
            const argItem = document.createElement('li');
            argItem.appendChild(this.renderLogicTree(arg));
            argsList.appendChild(argItem);
          }

          root.appendChild(argsList);
        }
        break;
      }

      case 'name': {
        root.appendChild(document.createTextNode(` variable: ${rule.name}`));
        break;
      }

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

      case 'state_method': {
        // Process arguments for display
        let argsText = (rule.args || [])
          .map((arg) => {
            if (typeof arg === 'string' || typeof arg === 'number') {
              return arg;
            } else if (arg && arg.type === 'constant') {
              return arg.value;
            } else {
              return '(complex)';
            }
          })
          .join(', ');

        root.appendChild(
          document.createTextNode(
            ` method: ${rule.method}, args: [${argsText}]`
          )
        );

        // For complex arguments, render them in more detail
        const hasComplexArgs =
          rule.args &&
          rule.args.some(
            (arg) =>
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
          );

        if (hasComplexArgs) {
          const argsContainer = document.createElement('div');
          argsContainer.style.marginLeft = '20px';

          rule.args.forEach((arg, i) => {
            if (
              arg &&
              typeof arg === 'object' &&
              arg.type &&
              arg.type !== 'constant'
            ) {
              const argLabel = document.createElement('div');
              argLabel.textContent = `Arg ${i + 1}:`;
              argsContainer.appendChild(argLabel);

              const argTree = this.renderLogicTree(arg);
              argsContainer.appendChild(argTree);
            }
          });

          root.appendChild(argsContainer);
        }
        break;
      }

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
            stateManager.isLocationChecked(location.name)
              ? 'Checked'
              : stateManager.isLocationAccessible(location)
              ? 'Available'
              : 'Locked'
          }
        </div>
        <div>
          <span class="font-semibold">Player: </span>${location.player}
        </div>
        <div>
          <span class="font-semibold">Region: </span>
          <span class="region-link" data-region="${location.region}">${
      location.region
    }</span>
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
          (stateManager.isLocationChecked(location.name) ||
            this.gameUI.debugMode)
            ? `
            <div>
              <span class="font-semibold">Item: </span>${location.item.name}
              ${location.item.advancement ? ' (Progression)' : ''}
              ${location.item.priority ? ' (Priority)' : ''}
            </div>
          `
            : ''
        }
      </div>
    `;

    // Add event listeners to region links in the modal
    info.querySelectorAll('.region-link').forEach((link) => {
      link.addEventListener('click', () => {
        const regionName = link.dataset.region;
        if (regionName) {
          // Close the modal first
          document.getElementById('location-modal').classList.add('hidden');
          // Then navigate to the region
          this.gameUI.regionUI.navigateToRegion(regionName);
        }
      });
    });

    modal.classList.remove('hidden');
  }
}

export default LocationUI;

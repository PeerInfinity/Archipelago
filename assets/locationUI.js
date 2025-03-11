// locationUI.js
import stateManager from './stateManagerSingleton.js';
import { evaluateRule } from './ruleEngine.js';
import commonUI from './commonUI.js';

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
              Location: ${
                commonUI.renderLogicTree(location.access_rule).outerHTML
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

  showLocationDetails(location) {
    const modal = document.getElementById('location-modal');
    const title = document.getElementById('modal-title');
    const debug = document.getElementById('modal-debug');
    const info = document.getElementById('modal-info');

    title.textContent = location.name;

    const region = stateManager.regions[location.region];

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

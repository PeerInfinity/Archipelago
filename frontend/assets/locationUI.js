// locationUI.js
import { LocationManager } from './locationManager.js';

export class LocationUI {
  constructor(gameUI) {
    this.gameUI = gameUI;
    this.checkedLocations = new Set();
    this.locationManager = new LocationManager();

    this.attachEventListeners();
  }

  initialize(jsonData) {
    this.locationManager.loadFromJSON(jsonData);
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
  }

  handleLocationClick(location) {
    if (this.checkedLocations.has(location.name)) {
      return;
    }

    const isAccessible = this.locationManager.isLocationAccessible(
      location,
      this.gameUI.inventory
    );

    if (!isAccessible) {
      return;
    }

    if (location.item) {
      this.gameUI.toggleItem(location.item.name);
      this.checkedLocations.add(location.name);
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

    const locations = this.locationManager.getProcessedLocations(
      this.gameUI.inventory,
      sorting,
      showReachable,
      showUnreachable
    );

    const newlyReachable = this.locationManager.getNewlyReachableLocations(
      this.gameUI.inventory
    );

    const locationsGrid = document.getElementById('locations-grid');

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

    locationsGrid.innerHTML = filteredLocations
      .map((location) => {
        const isAccessible = this.locationManager.isLocationAccessible(
          location,
          this.gameUI.inventory
        );
        const isNewlyReachable =
          showHighlights &&
          newlyReachable.has(`${location.player}-${location.name}`);
        const isChecked = this.checkedLocations.has(location.name);

        let stateClass = isChecked
          ? 'checked'
          : isNewlyReachable
          ? 'newly-reachable'
          : isAccessible
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
                    <div class="text-sm">
                        ${
                          isChecked
                            ? 'Checked'
                            : isAccessible
                            ? 'Available'
                            : 'Locked'
                        }
                    </div>
                </div>
            `;
      })
      .join('');
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
                        : this.locationManager.isLocationAccessible(
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

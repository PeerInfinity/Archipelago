// gameUI.js
import { Inventory } from './inventory.js';
import { evaluateRule } from './ruleEngine.js';
import { LocationManager } from './locationManager.js';

class GameUI {
    constructor() {
        // Initialize core game state
        this.inventory = new Inventory();
        this.locationManager = new LocationManager();
        this.itemCounts = {};
        this.debugMode = false;
        this.itemData = null; // Store the full item data from JSON
        this.checkedLocations = new Set(); // Add this line
        
        // Initialize UI
        this.attachEventListeners();
        
        // If we have access to the console manager, register our commands
        if (window.consoleManager) {
            this.registerConsoleCommands();
        }

        // Load default rules
        this.loadDefaultRules();
    }
    
    initializeUI(jsonData) {
        const player1Items = jsonData.items["1"];
        const groups = jsonData.item_groups["1"];
        this.itemData = player1Items;

        const inventoryContainer = document.getElementById('inventory-groups');
        inventoryContainer.innerHTML = ''; // Clear existing content

        // Sort groups alphabetically
        groups.sort();
        
        groups.forEach(group => {
            const groupItems = Object.entries(player1Items)
                .filter(([_, itemData]) => itemData.groups.includes(group))
                .sort(([nameA], [nameB]) => nameA.localeCompare(nameB));

            const groupDiv = document.createElement('div');
            groupDiv.className = 'inventory-group';
            groupDiv.innerHTML = `
                <h3>${group}</h3>
                <div class="inventory-items">
                    ${groupItems.map(([itemName, itemData]) => `
                        <div class="item-container">
                            <button 
                                class="item-button" 
                                data-item="${itemName}"
                                title="${itemName}"
                            >
                                ${itemName}
                            </button>
                        </div>
                    `).join('')}
                </div>
            `;
            inventoryContainer.appendChild(groupDiv);
        });

        // Reattach event listeners for new buttons
        this.attachItemEventListeners();
    }
    
    attachEventListeners() {
        // File upload
        document.getElementById('json-upload').addEventListener('change', this.handleFileUpload.bind(this));
        
        // Debug toggle
        document.getElementById('debug-toggle').addEventListener('click', () => {
            this.debugMode = !this.debugMode;
            document.getElementById('debug-toggle').textContent = 
                this.debugMode ? 'Hide Debug' : 'Show Debug';
            // Update modal if it's open
            if (!document.getElementById('location-modal').classList.contains('hidden')) {
                this.updateModalDebugView();
            }
        });
        
        // Sorting and filtering
        document.getElementById('sort-select').addEventListener('change', () => this.updateLocationDisplay());
        document.getElementById('show-checked').addEventListener('change', () => this.updateLocationDisplay());
        document.getElementById('show-reachable').addEventListener('change', () => this.updateLocationDisplay());
        document.getElementById('show-unreachable').addEventListener('change', () => this.updateLocationDisplay());
        document.getElementById('show-highlights').addEventListener('change', () => this.updateLocationDisplay());
        
        // Modal close
        document.getElementById('modal-close').addEventListener('click', () => {
            document.getElementById('location-modal').classList.add('hidden');
        });
        
        // Close modal when clicking outside
        document.getElementById('location-modal').addEventListener('click', (e) => {
            if (e.target === document.getElementById('location-modal')) {
                document.getElementById('location-modal').classList.add('hidden');
            }
        });

        document.getElementById('locations-grid').addEventListener('click', (e) => {
            const locationCard = e.target.closest('.location-card');
            if (locationCard) {
                try {
                    const encoded = locationCard.dataset.location.replace(/&quot;/g, '"');
                    const locationData = JSON.parse(decodeURIComponent(encoded));
                    this.handleLocationClick(locationData);
                } catch (error) {
                    console.error('Error parsing location data:', error);
                    console.error('Failed location card:', locationCard.dataset.location);
                }
            }
        });
    }

    attachItemEventListeners() {
        document.querySelectorAll('.item-button').forEach(button => {
            button.addEventListener('click', () => {
                const itemName = button.dataset.item;
                this.toggleItem(itemName);
            });
        });
    }
    
    toggleItem(itemName) {
        if (!this.itemData || !this.itemData[itemName]) return;
        
        const currentCount = this.itemCounts[itemName] || 0;
        
        // Find all buttons for this item
        const buttons = document.querySelectorAll(`[data-item="${itemName}"]`);
        const containers = Array.from(buttons).map(button => button.closest('.item-container'));
        
        // Add item or increment count
        this.inventory.addItem(itemName);
        this.itemCounts[itemName] = currentCount + 1;
        
        // Update all instances of this item
        buttons.forEach(button => button.classList.add('active'));
        
        // Update count display for all instances
        containers.forEach(container => {
            let countBadge = container.querySelector('.count-badge');
            if (!countBadge) {
                countBadge = document.createElement('div');
                countBadge.className = 'count-badge';
                container.appendChild(countBadge);
            }
            
            if (this.itemCounts[itemName] > 1) {
                countBadge.textContent = this.itemCounts[itemName];
                countBadge.style.display = 'flex';
            } else {
                countBadge.style.display = 'none';
            }
        });
        
        // Log to console if available
        if (window.consoleManager) {
            window.consoleManager.print(
                `${itemName} count: ${this.itemCounts[itemName]}`,
                'info'
            );
        }
        
        this.updateLocationDisplay();
    }
    
    async loadDefaultRules() {
        try {
            const response = await fetch('./default_rules.json');
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const jsonData = await response.json();
            
            // Clear any existing data first
            this.clearExistingData();
            
            // Initialize inventory and UI with the JSON data
            this.inventory = new Inventory(
                [], // Initial items
                [], // Excluded items  
                jsonData.progression_mapping["1"], // Player 1's progression mapping
                jsonData.items["1"] // Player 1's item data
            );
            
            this.initializeUI(jsonData);
            this.locationManager.loadFromJSON(jsonData);
            this.updateLocationDisplay();
            
            if (window.consoleManager) {
                window.consoleManager.print('Successfully loaded default rules', 'success');
            }
        } catch (error) {
            console.error('Error loading default rules:', error);
            if (window.consoleManager) {
                window.consoleManager.print(`Error loading default rules: ${error.message}`, 'error');
            }
        }
    }

    // Add this method to GameUI class
    clearExistingData() {
        // Clear inventory state
        this.inventory = null;
        this.itemCounts = {};
        this.checkedLocations = new Set();
        
        // Clear UI elements
        document.querySelectorAll('.item-button').forEach(button => {
            button.classList.remove('active');
            const countBadge = button.closest('.item-container')?.querySelector('.count-badge');
            if (countBadge) {
                countBadge.style.display = 'none';
            }
        });

        // Clear locations grid
        const locationsGrid = document.getElementById('locations-grid');
        if (locationsGrid) {
            locationsGrid.innerHTML = '';
        }

        // Clear inventory groups
        const inventoryGroups = document.getElementById('inventory-groups');
        if (inventoryGroups) {
            inventoryGroups.innerHTML = '';
        }
    }

    // Modify the handleFileUpload method in GameUI class to use clearExistingData
    async handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        try {
            // Clear existing data before loading new file
            this.clearExistingData();
            
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const jsonData = JSON.parse(e.target.result);
                    
                    // Initialize inventory and UI with the JSON data
                    this.inventory = new Inventory(
                        [], // Initial items
                        [], // Excluded items  
                        jsonData.progression_mapping["1"], // Player 1's progression mapping
                        jsonData.items["1"] // Player 1's item data
                    );
                    this.initializeUI(jsonData);
                    
                    // Load locations
                    this.locationManager.loadFromJSON(jsonData);
                    this.updateLocationDisplay();
                    
                    if (window.consoleManager) {
                        window.consoleManager.print('Successfully loaded game data', 'success');
                    }
                } catch (error) {
                    console.error('Error parsing JSON file:', error);
                    if (window.consoleManager) {
                        window.consoleManager.print(`Error parsing JSON file: ${error.message}`, 'error');
                    }
                }
            };
            reader.readAsText(file);
        } catch (error) {
            console.error('Error handling file upload:', error);
            if (window.consoleManager) {
                window.consoleManager.print(`Error handling file upload: ${error.message}`, 'error');
            }
        }
    }


    handleLocationClick(location) {
        // Don't do anything if already checked
        if (this.checkedLocations.has(location.name)) {
            return;
        }

        // Only allow checking reachable locations
        const isAccessible = this.locationManager.isLocationAccessible(location, this.inventory);
        if (!isAccessible) {
            return;
        }

        // Check if location has an item
        if (location.item) {
            // Add item to inventory
            this.toggleItem(location.item.name);
            
            // Mark location as checked
            this.checkedLocations.add(location.name);
            
            // Update display
            this.updateLocationDisplay();
            
            // Show details
            this.showLocationDetails(location);
            
            // Log to console if available
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
            this.inventory,
            sorting,
            showReachable,
            showUnreachable
        );
        
        const newlyReachable = this.locationManager.getNewlyReachableLocations(this.inventory);
        
        const locationsGrid = document.getElementById('locations-grid');
        
        if (locations.length === 0) {
            locationsGrid.innerHTML = `
                <div class="empty-message">
                    Upload a JSON file to see locations or adjust filters
                </div>
            `;
            return;
        }
        
        const filteredLocations = locations.filter(location => {
            const isChecked = this.checkedLocations.has(location.name);
            return isChecked ? showChecked : true;
        });
        
        locationsGrid.innerHTML = filteredLocations.map(location => {
            const isAccessible = this.locationManager.isLocationAccessible(location, this.inventory);
            const isNewlyReachable = showHighlights && 
                newlyReachable.has(`${location.player}-${location.name}`);
            const isChecked = this.checkedLocations.has(location.name);
            
            let stateClass = isChecked ? 'checked' :
                           isNewlyReachable ? 'newly-reachable' :
                           isAccessible ? 'reachable' : 
                           'unreachable';
    
            return `
            <div 
                class="location-card ${stateClass}"
                data-location="${encodeURIComponent(JSON.stringify(location)).replace(/"/g, '&quot;')}"
            >
                <div class="font-medium">${location.name}</div>
                <div class="text-sm">Player ${location.player}</div>
                <div class="text-sm">
                    ${isChecked ? 'Checked' :
                        isAccessible ? 'Available' : 'Locked'}
                </div>
            </div>
            `;
        }).join('');
    }
    
    showLocationDetails(location) {
        const modal = document.getElementById('location-modal');
        const title = document.getElementById('modal-title');
        const debug = document.getElementById('modal-debug');
        const info = document.getElementById('modal-info');
        
        title.textContent = location.name;
        
        if (this.debugMode) {
            debug.classList.remove('hidden');
            debug.textContent = JSON.stringify(location.access_rule, null, 2);
        } else {
            debug.classList.add('hidden');
        }
        
        const isAccessible = this.locationManager.isLocationAccessible(location, this.inventory);
        const isChecked = this.checkedLocations.has(location.name);
        
        info.innerHTML = `
            <div class="space-y-2">
                <div>
                    <span class="font-semibold">Status: </span>
                    ${isChecked ? 'Checked' : isAccessible ? 'Available' : 'Locked'}
                </div>
                <div>
                    <span class="font-semibold">Player: </span>
                    ${location.player}
                </div>
                ${location.region ? `
                    <div>
                        <span class="font-semibold">Region: </span>
                        ${location.region}
                    </div>
                ` : ''}
                ${location.item && (isChecked || this.debugMode) ? `
                    <div>
                        <span class="font-semibold">Item: </span>
                        ${location.item.name}
                        ${location.item.player ? `(Player ${location.item.player})` : ''}
                    </div>
                ` : ''}
            </div>
        `;
        
        modal.classList.remove('hidden');
    }

    registerConsoleCommands() {
        const commands = {
            'item': {
                description: 'Toggle an item in your inventory',
                usage: 'item <name>',
                handler: (args) => {
                    const itemName = args.join(' ');
                    if (this.itemData && this.itemData[itemName]) {
                        this.toggleItem(itemName);
                        return `Toggled ${itemName}`;
                    } else {
                        return `Item "${itemName}" not found`;
                    }
                }
            },
            'items': {
                description: 'List all available items',
                usage: 'items',
                handler: () => {
                    if (!this.itemData) return 'No items loaded';
                    return Object.entries(this.itemData)
                        .map(([name, data]) => `${name} (${data.groups.join(', ')})`)
                        .join('\n');
                }
            },
            'clear': {
                description: 'Clear all items from inventory',
                usage: 'clear',
                handler: () => {
                    this.itemCounts = {};
                    document.querySelectorAll('.item-button').forEach(button => {
                        button.classList.remove('active');
                        const countSpan = button.querySelector('.item-count');
                        if (countSpan) countSpan.remove();
                    });
                    this.inventory.items.clear();
                    this.updateLocationDisplay();
                    return 'Inventory cleared';
                }
            }
        };
        
        Object.entries(commands).forEach(([name, command]) => {
            window.consoleManager.registerCommand(name, command);
        });
    }
}

// Initialize and expose to window for event handlers
window.gameUI = new GameUI();

export default GameUI;
import eventBus from '../../app/core/eventBus.js';
import { centralRegistry } from '../../app/core/centralRegistry.js';

/**
 * PlayerStatePanelUI - UI component for displaying player state information
 */
export class PlayerStatePanelUI {
    constructor(container, componentState) {
        this.container = container;
        this.componentState = componentState;
        this.currentRegionElement = null;
        this.rootElement = null;
        this.unsubscribeHandles = [];
        
        // Create and setup the UI immediately
        this.createRootElement();
        this.container.element.appendChild(this.rootElement);
        this.setupEventListeners();
        
        // Initial display update
        setTimeout(() => this.updateDisplay(), 100);
    }

    createRootElement() {
        this.rootElement = document.createElement('div');
        this.rootElement.className = 'player-state-panel';
        this.rootElement.innerHTML = `
            <h3>Player State</h3>
            <div class="player-state-content">
                <div class="current-region">
                    <strong>Current Region:</strong> <span class="region-name">Loading...</span>
                </div>
            </div>
        `;
        
        this.currentRegionElement = this.rootElement.querySelector('.region-name');
        return this.rootElement;
    }

    getRootElement() {
        return this.rootElement;
    }

    setupEventListeners() {
        // Listen for region changes
        const handle = eventBus.subscribe('playerState:regionChanged', (data) => {
            this.updateDisplay();
        }, 'playerStatePanel');
        this.unsubscribeHandles.push(handle);
        
        // Also listen for rules loaded to get initial state
        const rulesHandle = eventBus.subscribe('stateManager:rulesLoaded', () => {
            this.updateDisplay();
        }, 'playerStatePanel');
        this.unsubscribeHandles.push(rulesHandle);
    }

    updateDisplay() {
        if (!this.currentRegionElement) {
            return;
        }

        // Get current region from playerState module
        const getCurrentRegion = centralRegistry.getPublicFunction('playerState', 'getCurrentRegion');
        if (getCurrentRegion) {
            const currentRegion = getCurrentRegion();
            this.currentRegionElement.textContent = currentRegion || 'Unknown';
        }
    }

    destroy() {
        // Unsubscribe from all events
        this.unsubscribeHandles.forEach(handle => handle());
        this.unsubscribeHandles = [];
        
        // Clean up DOM
        if (this.rootElement && this.rootElement.parentNode) {
            this.rootElement.parentNode.removeChild(this.rootElement);
        }
    }
}
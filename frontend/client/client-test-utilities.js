// client-test-utilities.js
// Import the client modules we'll need for testing
import eventBus from './core/eventBus.js';
import connectionModule from './core/connection.js';
import messageHandlerModule from './core/messageHandler.js';
import locationManagerModule from './core/locationManager.js';
import ConsoleUIModule from './ui/consoleUI.js';
import ProgressUIModule from './ui/progressUI.js';

// Create a test client object with various utility functions
class TestClient {
  constructor() {
    // Store module references for easy access
    this.eventBus = eventBus;
    this.connection = connectionModule;
    this.messageHandler = messageHandlerModule;
    this.locationManager = locationManagerModule;
    this.ConsoleUI = ConsoleUIModule;
    this.ProgressUI = ProgressUIModule;

    // Add welcome message after load
    window.addEventListener('load', () => {
      this.initialize();
    });
  }

  initialize() {
    ConsoleUIModule.appendMessage('Client modules test initialized');
    ConsoleUIModule.appendMessage('Type /help for available commands');
    ConsoleUIModule.appendMessage(
      'You can use the window.testClient object in the console for testing:'
    );
    ConsoleUIModule.appendMessage('- testClient.generateMockData()');
    ConsoleUIModule.appendMessage('- testClient.testFormattedMessage()');
    ConsoleUIModule.appendMessage('- testClient.checkLocation(123)');
  }

  // Generate mock data to test UI
  generateMockData() {
    // Simulate locations data
    const mockLocations = Array.from({ length: 200 }, (_, i) => i + 1);

    // Simulate some checked locations
    const mockChecked = mockLocations.slice(0, 50);
    const mockMissing = mockLocations.slice(50);

    // Mock connection event
    eventBus.publish('game:connected', {
      slot: 1,
      team: 1,
      players: [{ alias: 'TestPlayer' }],
      checkedLocations: mockChecked,
      missingLocations: mockMissing,
    });

    // Enable buttons
    this.ProgressUI.enableControls(true);

    // Update console
    this.ConsoleUI.appendMessage('Mock data generated');
    this.ConsoleUI.appendMessage(`50 locations checked, 150 remaining`);

    // Update server status
    const serverStatus = document.getElementById('server-status');
    if (serverStatus) {
      serverStatus.classList.remove('red');
      serverStatus.innerText = 'Connected (Mock)';
      serverStatus.classList.add('green');
    }
  }

  // Test formatted messages
  testFormattedMessage() {
    // Create mock formatted message parts
    const messageParts = [
      { text: 'Player ' },
      { type: 'player_id', text: '1' },
      { text: ' found ' },
      { type: 'item_id', text: '12345' },
      { text: ' at ' },
      { type: 'location_id', text: '67890' },
    ];

    // Publish to event bus
    eventBus.publish('console:formattedMessage', messageParts);
  }

  // Test location checking
  checkLocation(locationId = null) {
    if (locationId === null) {
      this.locationManager.checkQuickLocation();
    } else {
      this.locationManager.checkLocation(locationId);
    }

    // Update UI
    this.ProgressUI.updateProgress();
  }

  // List all available events on the event bus
  listEventSubscriptions() {
    return this.eventBus.events ? Object.keys(this.eventBus.events) : [];
  }

  // Trigger a custom event on the event bus
  triggerEvent(eventName, data = {}) {
    this.eventBus.publish(eventName, data);
    return `Triggered event: ${eventName}`;
  }
}

// Create a global test client instance
window.testClient = new TestClient();

export default window.testClient;

// frontend/assets/games/alttp/state.js

import { GameState } from '../../helpers/index.js';

export class ALTTPState extends GameState {
  constructor(logger = null) {
    super(logger);
    this.flags = new Set();
    this.events = new Set();

    // Initialize with the flags we know we need
    if (logger) {
      this.log('Initializing ALTTPState');
    }

    // Set default flags
    this.setFlag('bombless_start'); // Default in current test setup
  }

  hasEvent(eventName) {
    // Check both flags and events
    return this.flags.has(eventName) || this.events.has(eventName);
  }

  setEvent(eventName) {
    this.log(`Setting event flag: ${eventName}`);
    this.events.add(eventName);
  }

  processEventItem(itemName) {
    // Convert item acquisitions into event flags
    const eventMapping = {
      'Beat Agahnim 1': 'Beat Agahnim 1',
      'Beat Agahnim 2': 'Beat Agahnim 2',
      'Open Floodgate': 'Open Floodgate',
      'Crystal 1': 'Crystal 1',
      'Crystal 2': 'Crystal 2',
      'Crystal 3': 'Crystal 3',
      'Crystal 4': 'Crystal 4',
      'Crystal 5': 'Crystal 5',
      'Crystal 6': 'Crystal 6',
      'Crystal 7': 'Crystal 7',
      'Red Pendant': 'Red Pendant',
      'Blue Pendant': 'Blue Pendant',
      'Green Pendant': 'Green Pendant',
      'Get Frog': 'Get Frog',
      'Pick Up Purple Chest': 'Pick Up Purple Chest',
      'Return Smith': 'Return Smith',
      'Shovel': 'Shovel',
      'Flute': 'Flute',
      'Activated Flute': 'Activated Flute',
    };

    if (eventMapping[itemName]) {
      this.setEvent(eventMapping[itemName]);
      return true;
    }
    return false;
  }

  has(itemName) {
    // Check if it's an event first
    if (this.hasEvent(itemName)) {
      return true;
    }
    // Else fall back to flag check
    return this.flags.has(itemName);
  }

  collect(item) {
    // Process as event if applicable
    if (this.processEventItem(item.name)) {
      return;
    }
    // Else treat as flag
    this.setFlag(item.name);
  }

  getFlags() {
    return Array.from(this.flags);
  }

  getEvents() {
    return Array.from(this.events);
  }

  setFlag(flagName) {
    this.flags.add(flagName);
    this.log(`Set flag: ${flagName}`);
  }

  hasFlag(flagName) {
    const hasFlag = this.flags.has(flagName);
    this.log(`Checking flag ${flagName}: ${hasFlag}`);
    return hasFlag;
  }

  // Debug helper
  dumpState() {
    return {
      flags: this.getFlags(),
      events: this.getEvents(),
    };
  }
}

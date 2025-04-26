import { GameState } from '../../helpers/index.js';

export class ALTTPState extends GameState {
  constructor(logger = null) {
    super(logger);
    this.flags = new Set();
    this.events = new Set();

    // Game settings and configuration
    this.gameMode = null;
    this.gameSettings = {};
    this.difficultyRequirements = {
      progressive_bottle_limit: 4,
      boss_heart_container_limit: 10,
      heart_piece_limit: 24,
    };
    this.requiredMedallions = ['Ether', 'Quake']; // Default medallions
    this.shops = [];
    this.treasureHuntRequired = 20;

    // Initialize with the flags we know we need
    this.log('Initializing ALTTPState');

    // Set default flags
    //this.setFlag('bombless_start'); // Default in current test setup
  }

  /**
   * Load game settings from the JSON data
   * @param {Object} settings - Game settings from the rules JSON
   */
  loadSettings(settings) {
    console.log('loadSettings called with:', settings);
    if (!settings) return;

    this.gameSettings = settings;

    // Set common flags based on settings
    if (settings.bombless_start) this.setFlag('bombless_start');
    if (settings.retro_bow) this.setFlag('retro_bow');
    if (settings.swordless) this.setFlag('swordless');
    if (settings.enemy_shuffle) this.setFlag('enemy_shuffle');

    // Store game mode
    this.gameMode = settings.game_mode || 'standard';

    // Store difficulty requirements
    if (settings.difficulty_requirements) {
      this.difficultyRequirements = {
        ...this.difficultyRequirements,
        ...settings.difficulty_requirements,
      };
    }

    // Store medallions
    if (
      settings.required_medallions &&
      Array.isArray(settings.required_medallions)
    ) {
      this.requiredMedallions = settings.required_medallions;
    }

    // Store treasure hunt count
    if (typeof settings.treasure_hunt_required === 'number') {
      this.treasureHuntRequired = settings.treasure_hunt_required;
    }

    this.log('Settings loaded:', settings);
  }

  /**
   * Load shop data from regions
   * @param {Array} shops - Array of shop data objects
   */
  loadShops(shops) {
    this.shops = shops || [];
    this.log(`Loaded ${this.shops.length} shops`);
  }

  hasEvent(eventName) {
    // Check both flags and events
    return this.flags.has(eventName) || this.events.has(eventName);
  }

  setEvent(eventName) {
    //this.log(`Setting event flag: ${eventName}`);
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
    //this.log(`Checking flag ${flagName}: ${hasFlag}`);
    return hasFlag;
  }

  /**
   * Gets a setting value with a fallback default
   * @param {string} settingName - Name of the setting
   * @param {any} defaultValue - Default value if setting not found
   * @returns {any} - The setting value or default
   */
  getSetting(settingName, defaultValue) {
    return this.gameSettings[settingName] !== undefined
      ? this.gameSettings[settingName]
      : defaultValue;
  }

  // Debug helper
  dumpState() {
    return {
      flags: this.getFlags(),
      events: this.getEvents(),
      gameMode: this.gameMode,
      settings: this.gameSettings,
      requirements: this.difficultyRequirements,
      medallions: this.requiredMedallions,
      shops: this.shops.map((s) => s.type),
    };
  }
}

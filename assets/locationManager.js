// locationManager.js
import { evaluateRule } from './ruleEngine.js';

export class LocationManager {
  constructor() {
    this.locations = [];
    this.previousReachable = new Set();
  }

  loadFromJSON(jsonData) {
    if (!jsonData.locations || !jsonData.items) {
      throw new Error('Invalid JSON format: missing locations or items data');
    }

    this.itemData = jsonData.items["1"]; // Store player 1's item data

    console.log('Loading locations from JSON data');
    
    // Convert locations data into flat array with player info
    this.locations = Object.entries(jsonData.locations)
      .flatMap(([player, playerLocations]) => {
        console.log(`Processing player ${player}'s locations`);
        return Object.entries(playerLocations).map(([name, data]) => {
          console.log(`Loading location: ${name}`, data);
          return {
            name,
            player: parseInt(player, 10),
            region: data.region,
            access_rule: data.access_rule,
            path_rules: data.path_rules,  // Add this line
            item: data.item
          };
        });
      });
      
    console.log('Loaded locations:', this.locations);
  }

  getProcessedLocations(inventory, sorting = 'original', showReachable = true, showUnreachable = true) {
    return this.locations
      .slice()
      .sort((a, b) => {
        if (sorting === 'accessibility') {
          const aAccessible = this.isLocationAccessible(a, inventory);
          const bAccessible = this.isLocationAccessible(b, inventory);
          return bAccessible - aAccessible;
        }
        return 0;
      })
      .filter(location => {
        const isAccessible = this.isLocationAccessible(location, inventory);
        return (isAccessible && showReachable) || (!isAccessible && showUnreachable);
      });
  }

  isLocationAccessible(location, inventory) {
    try {
      return evaluateRule(location.access_rule, inventory);
    } catch (error) {
      console.error(`Error evaluating rule for ${location.name}:`, error);
      return false;
    }
  }

  getNewlyReachableLocations(inventory) {
    const currentReachable = new Set(
      this.locations
        .filter(loc => this.isLocationAccessible(loc, inventory))
        .map(loc => `${loc.player}-${loc.name}`)
    );

    const newlyReachable = new Set(
      [...currentReachable].filter(x => !this.previousReachable.has(x))
    );

    this.previousReachable = currentReachable;
    return newlyReachable;
  }
}